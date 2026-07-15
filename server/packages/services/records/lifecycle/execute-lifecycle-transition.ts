/**
 * The single transaction owner for metadata-driven record lifecycle commands.
 * Required BEFORE and AFTER hooks execute on the same transaction as the
 * status mutation, so hook failures roll back both state and business effects.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import { runLifecycleHooks } from "@athyper/svc-business";
import { checkPermission } from "@athyper/svc-iam";
import { syncLifecycleInstanceForStatus } from "@athyper/svc-workflow";
import {
  LifecycleCommandPreparationError,
  validateLifecycleCommandPayload,
  type LifecycleCommandRegistration,
} from "../routes/lifecycle-command.registry.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface LifecycleTransitionLogger {
  error(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  info?(event: string, fields?: Record<string, unknown>): void;
}

export interface ExecuteLifecycleTransitionInput {
  db: AnyDb;
  tenantId: string;
  entityCode: string;
  recordId: string;
  operationCode: string;
  principalId: string;
  operationPayload?: Readonly<Record<string, unknown>>;
  command?: LifecycleCommandRegistration;
  recordPatch?: Readonly<Record<string, unknown>>;
  prepare?: (
    context: LifecycleTransitionPreparationContext,
  ) => Promise<LifecycleTransitionPreparation | void> | LifecycleTransitionPreparation | void;
  /** State observed before entering the transaction; revalidated after FOR UPDATE. */
  expectedCurrentStatus?: string;
  logger?: LifecycleTransitionLogger;
}

export interface LifecycleTransitionPreparationContext {
  db: AnyDb;
  record: Readonly<Record<string, unknown>>;
  transition: Readonly<{
    id: string;
    operationCode: string;
    fromStatus: string;
    toStatus: string;
  }>;
  operationPayload: Readonly<Record<string, unknown>>;
}

export interface LifecycleTransitionPreparation {
  recordPatch?: Readonly<Record<string, unknown>>;
  operationPayload?: Readonly<Record<string, unknown>>;
}

export interface ExecuteLifecycleTransitionResult {
  record: Record<string, unknown>;
  transitionId: string;
  fromStatus: string;
  toStatus: string;
  executionToken: string;
  idempotencyReplay: boolean;
}

export class LifecycleTransitionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "LifecycleTransitionError";
  }
}

interface ResolvedTransition {
  transitionId: string;
  operationCode: string;
  fromStatus: string;
  toStatus: string;
  config: Record<string, unknown>;
}

interface ActionRule {
  capability: string;
  requiredPermission: string | null;
  reason: string | null;
}

export async function executeLifecycleTransition(
  input: ExecuteLifecycleTransitionInput,
): Promise<ExecuteLifecycleTransitionResult> {
  const operationPayload = { ...(input.operationPayload ?? {}) };

  try {
    return await input.db.transaction().execute(async (trx) => {
      const entity = await trx
        .selectFrom("control.entity as e")
        .select(["e.table_schema", "e.table_name"])
        .where("e.name", "=", input.entityCode)
        .where("e.tenant_id", "is", null)
        .executeTakeFirst() as { table_schema: string; table_name: string } | undefined;

      if (!entity) {
        throw new LifecycleTransitionError(
          "ENTITY_NOT_FOUND",
          `Entity '${input.entityCode}' is not registered.`,
          404,
        );
      }

      const fullTable = `${entity.table_schema}.${entity.table_name}` as `${string}.${string}`;
      const lockedRecord = await trx
        .selectFrom(fullTable)
        .selectAll()
        .where("id" as never, "=", input.recordId as never)
        .where("tenant_id" as never, "=", input.tenantId as never)
        .forUpdate()
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!lockedRecord) {
        throw new LifecycleTransitionError(
          "RECORD_NOT_FOUND",
          `Record '${input.recordId}' was not found for entity '${input.entityCode}'.`,
          404,
        );
      }

      const currentStatus = String(lockedRecord["status"] ?? "").toLowerCase();
      if (!currentStatus) {
        throw new LifecycleTransitionError(
          "LIFECYCLE_STATE_MISSING",
          `Entity '${input.entityCode}' record has no lifecycle status.`,
          422,
        );
      }
      if (input.expectedCurrentStatus
        && currentStatus !== input.expectedCurrentStatus.toLowerCase()) {
        throw new LifecycleTransitionError(
          "LIFECYCLE_STATE_CONFLICT",
          `Record state changed from '${input.expectedCurrentStatus}' to '${currentStatus}'.`,
          409,
          { expected: input.expectedCurrentStatus, actual: currentStatus },
        );
      }

      const expectedRowVersion = operationPayload["expected_row_version"];
      if (typeof expectedRowVersion === "number"
        && Number(lockedRecord["row_version"]) !== expectedRowVersion) {
        throw new LifecycleTransitionError(
          "LIFECYCLE_VERSION_CONFLICT",
          "Record was modified by another user. Reload and retry the operation.",
          409,
          { expected: expectedRowVersion, actual: lockedRecord["row_version"] },
        );
      }

      const transition = await resolveTransition(
        trx,
        input.tenantId,
        input.entityCode,
        input.operationCode,
        currentStatus,
      );
      if (!transition) {
        throw new LifecycleTransitionError(
          "LIFECYCLE_TRANSITION_NOT_FOUND",
          `No active '${input.operationCode}' transition exists for '${input.entityCode}' in state '${currentStatus}'.`,
          422,
        );
      }

      const reason = readReason(operationPayload);
      if (requiresReason(transition.config) && !reason) {
        throw new LifecycleTransitionError(
          "ACTION_REASON_REQUIRED",
          `Operation '${input.operationCode}' requires a reason.`,
          400,
        );
      }

      await validateActionRule(trx, input, currentStatus);

      let effectivePayload: Readonly<Record<string, unknown>> = operationPayload;
      let preparedPatch: Readonly<Record<string, unknown>> = input.recordPatch ?? {};
      if (input.command) {
        if (input.command.entityCode !== input.entityCode
          || input.command.operationCode !== input.operationCode) {
          throw new LifecycleTransitionError(
            "LIFECYCLE_COMMAND_MISMATCH",
            "Resolved lifecycle command does not match the requested entity and operation.",
            422,
          );
        }
        validateLifecycleCommandPayload(input.command, operationPayload);
        const prepared = await input.command.prepare?.({
          db: trx as AnyDb,
          tenantId: input.tenantId,
          recordId: input.recordId,
          principalId: input.principalId,
          entityCode: input.entityCode,
          operationCode: input.operationCode,
          record: lockedRecord,
          payload: operationPayload,
        });
        effectivePayload = prepared?.operationPayload ?? operationPayload;
        preparedPatch = { ...preparedPatch, ...(prepared?.recordPatch ?? {}) };
      }
      if (input.prepare) {
        const prepared = await input.prepare({
          db: trx as AnyDb,
          record: lockedRecord,
          transition: {
            id: transition.transitionId,
            operationCode: transition.operationCode,
            fromStatus: transition.fromStatus,
            toStatus: transition.toStatus,
          },
          operationPayload: effectivePayload,
        });
        effectivePayload = prepared?.operationPayload ?? effectivePayload;
        preparedPatch = { ...preparedPatch, ...(prepared?.recordPatch ?? {}) };
      }

      const transitionEventSeq = Math.max(1, Number(lockedRecord["row_version"] ?? 0) + 1);
      const hookContext = {
        tenantId: input.tenantId,
        transitionId: transition.transitionId,
        sourceDocType: input.entityCode,
        sourceDocId: input.recordId,
        principalId: input.principalId,
        transitionEventSeq,
        fromStatus: transition.fromStatus,
        toStatus: transition.toStatus,
        operationCode: transition.operationCode,
        operationPayload: effectivePayload,
      } as const;

      const beforeHooks = await runLifecycleHooks(trx as AnyDb, {
        ...hookContext, timing: "before", logger: input.logger, strictRequired: true,
      });

      const now = new Date();
      // Every registered lifecycle entity has row_version and a BEFORE UPDATE
      // trigger that normalizes it to OLD + 1. The explicit expression also
      // keeps the contract correct on deployments where the trigger lags DDL.
      const updated = await trx
        .updateTable(fullTable)
        .set({
          ...preparedPatch,
          status: transition.toStatus,
          status_changed_at: now,
          status_changed_by: input.principalId,
          updated_at: now,
          updated_by: input.principalId,
          row_version: sql`row_version + 1`,
        } as never)
        .where("id" as never, "=", input.recordId as never)
        .where("tenant_id" as never, "=", input.tenantId as never)
        .where("status" as never, "=", currentStatus as never)
        .returningAll()
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!updated) {
        throw new LifecycleTransitionError(
          "LIFECYCLE_STATE_CONFLICT",
          "Record state changed while executing the lifecycle command.",
          409,
        );
      }

      const sync = await syncLifecycleInstanceForStatus({
        db: trx as never,
        tenantId: input.tenantId,
        entityName: input.entityCode,
        entityId: input.recordId,
        status: transition.toStatus,
        actorId: input.principalId,
        payload: updated,
        logger: input.logger,
      });
      if (!sync.synced) {
        throw new LifecycleTransitionError(
          "LIFECYCLE_INSTANCE_SYNC_FAILED",
          `Lifecycle instance synchronization failed: ${sync.reason ?? "unknown reason"}.`,
          422,
        );
      }

      const afterHooks = await runLifecycleHooks(trx as AnyDb, {
        ...hookContext, timing: "after", logger: input.logger, strictRequired: true,
      });

      const finalRecord = await trx
        .selectFrom(fullTable)
        .selectAll()
        .where("id" as never, "=", input.recordId as never)
        .where("tenant_id" as never, "=", input.tenantId as never)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      return {
        record: finalRecord ?? updated,
        transitionId: transition.transitionId,
        fromStatus: transition.fromStatus,
        toStatus: transition.toStatus,
        executionToken: beforeHooks.executionToken,
        idempotencyReplay: [...beforeHooks.outcomes, ...afterHooks.outcomes]
          .some((outcome) => outcome.status === "alreadyDone"),
      };
    });
  } catch (err) {
    if (err instanceof LifecycleTransitionError) throw err;
    if (err instanceof LifecycleCommandPreparationError) {
      throw new LifecycleTransitionError(err.code, err.message, 422, err.details);
    }
    if (err instanceof Error && /hook .* failed \(required\)/i.test(err.message)) {
      throw new LifecycleTransitionError("REQUIRED_HOOK_FAILED", err.message, 422);
    }
    throw err;
  }
}

async function resolveTransition(
  db: AnyDb,
  tenantId: string,
  entityCode: string,
  operationCode: string,
  currentStatus: string,
): Promise<ResolvedTransition | null> {
  const row = await db
    .selectFrom("control.entity_lifecycle as el")
    .innerJoin("control.lifecycle as lc", "lc.id" as never, "el.lifecycle_id" as never)
    .innerJoin("control.lifecycle_transition as lt", "lt.lifecycle_id" as never, "el.lifecycle_id" as never)
    .innerJoin("control.lifecycle_state as fs", "fs.id" as never, "lt.from_state_id" as never)
    .innerJoin("control.lifecycle_state as ts", "ts.id" as never, "lt.to_state_id" as never)
    .select([
      "lt.id as transition_id",
      "lt.operation_code",
      "lt.config",
      "fs.code as from_status",
      "ts.code as to_status",
    ] as never[])
    .where("el.entity_name" as never, "=" as never, entityCode as never)
    .where("fs.code" as never, "=" as never, currentStatus as never)
    .where("lt.operation_code" as never, "=" as never, operationCode as never)
    .where("lc.is_active" as never, "=" as never, true as never)
    .where("lt.is_active" as never, "=" as never, true as never)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .where((eb: any) => eb.or([
      eb("el.tenant_id" as never, "is" as never, null),
      eb("el.tenant_id" as never, "=" as never, tenantId as never),
    ]))
    .orderBy(
      sql<number>`CASE WHEN el.tenant_id = ${tenantId}::uuid THEN 0 ELSE 1 END`,
      "asc",
    )
    .orderBy("el.priority" as never, "asc")
    .orderBy("el.id" as never, "asc")
    .limit(1)
    .executeTakeFirst() as {
      transition_id: string;
      operation_code: string;
      config: unknown;
      from_status: string;
      to_status: string;
    } | undefined;

  if (!row) return null;
  return {
    transitionId: row.transition_id,
    operationCode: row.operation_code,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    config: asRecord(row.config),
  };
}

async function validateActionRule(
  db: AnyDb,
  input: ExecuteLifecycleTransitionInput,
  currentStatus: string,
): Promise<void> {
  const actionCode = `HEADER.${input.operationCode.toUpperCase()}`;
  const row = await db
    .selectFrom("control.entity_action_rule as ear")
    .select(["ear.capability", "ear.required_permission", "ear.reason"] as never[])
    .where("ear.entity_code" as never, "=" as never, input.entityCode as never)
    .where("ear.status" as never, "=" as never, currentStatus as never)
    .where("ear.action_code" as never, "=" as never, actionCode as never)
    .executeTakeFirst() as {
      capability: string;
      required_permission: string | null;
      reason: string | null;
    } | undefined;

  const rule: ActionRule | null = row ? {
    capability: row.capability,
    requiredPermission: row.required_permission,
    reason: row.reason,
  } : null;
  if (!rule || rule.capability === "denied") {
    throw new LifecycleTransitionError(
      "LIFECYCLE_ACTION_DENIED",
      rule?.reason ?? `Action '${actionCode}' is not allowed in state '${currentStatus}'.`,
      403,
    );
  }
  if (rule.capability === "requires_permission") {
    if (!rule.requiredPermission) {
      throw new LifecycleTransitionError(
        "LIFECYCLE_PERMISSION_CONFIG_INVALID",
        `Action rule '${input.entityCode}:${currentStatus}:${actionCode}' has no required permission.`,
        500,
      );
    }
    const decision = await checkPermission(
      db,
      input.tenantId,
      input.principalId,
      rule.requiredPermission,
      {
        entity_type: input.entityCode,
        entity_id: input.recordId,
      },
      input.logger,
    );
    if (decision.decision !== "allow") {
      throw new LifecycleTransitionError(
        "LIFECYCLE_PERMISSION_DENIED",
        `Permission '${rule.requiredPermission}' is required for this lifecycle action.`,
        403,
        { permissionCode: rule.requiredPermission, decision: decision.decision },
      );
    }
  }
}

function readReason(payload: Readonly<Record<string, unknown>>): string | null {
  for (const key of ["remarks", "reason", "reversal_reason", "notes"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function requiresReason(config: Record<string, unknown>): boolean {
  return ["requires_reason", "require_reason", "require_comment"].some(
    (key) => config[key] === true || config[key] === "true" || config[key] === 1,
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
