import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { createWorkflowEngine } from "./engine-factory.js";
import type { WorkflowEngine } from "./engine.js";
import { EntityAdapterRegistry, createDefaultEntityAdapterRegistry, normalizeEntityName } from "./entity-adapter-registry.js";
import { GateEvaluator, type TransitionGate } from "./gate-evaluator.js";
import { OperationAuthorizer, type RuntimeCheckPermissionFn } from "./operation-authorizer.js";
import {
  NotImplementedError,
  WorkflowRuntimeError,
  normalizeRuntimeError,
  statusCodeForRuntimeError,
} from "./runtime-errors.js";
import type {
  CanExecuteOperationQuery,
  ExecuteOperationCommand,
  OperationEligibility,
  OperationResult,
  TimerTickCommand,
  TimerTickResult,
  WorkflowActionResult,
  WorkflowLifecycleRuntime,
  WorkflowRuntimeDb,
  WorkflowRuntimeFeatureFlags,
  WorkflowRuntimeLogger,
  WorkflowRuntimeTransaction,
  WorkflowSubmissionResult,
  WorkItemActionCommand,
  SubmitWorkflowCommand,
  RuntimeEntityStorage,
  WorkflowExecutionDescriptorProvider,
} from "./runtime.types.js";

const GLOBAL_RUNTIME_FLAG = "workflow_runtime.enabled";
const ENTITY_RUNTIME_FLAG_PREFIX = "workflow_runtime.entity";
const COMMAND_LOG_TABLE = "document.command_log";
const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000";


export interface WorkflowLifecycleRuntimeDeps {
  db: WorkflowRuntimeDb;
  logger?: WorkflowRuntimeLogger;
  featureFlags?: WorkflowRuntimeFeatureFlags;
  checkPermission?: RuntimeCheckPermissionFn;
  operationAuthorizer?: OperationAuthorizer;
  gateEvaluator?: GateEvaluator;
  entityAdapterRegistry?: EntityAdapterRegistry;
  executionDescriptorProvider?: WorkflowExecutionDescriptorProvider;
  createWorkflowEngineForDb?: (db: WorkflowRuntimeDb | WorkflowRuntimeTransaction) => WorkflowEngine;
}

interface CommandLogRow {
  id: string;
  status: string;
  result: unknown;
  error_code: string | null;
  error_message: string | null;
}

interface CommandLogReservation {
  ownedByThisCaller: boolean;
  row: CommandLogRow;
}

interface RuntimeExecutionContext {
  entityName: string;
  operationCode: string;
  record: Record<string, unknown>;
  storage: RuntimeEntityStorage;
  lifecycle: {
    instanceId: string;
    lifecycleId: string;
    fromStateId: string;
    fromStateCode: string;
  };
  transition: {
    id: string;
    toStateId: string;
    toStateCode: string;
    gate: TransitionGate | null;
  };
}

export class DefaultWorkflowLifecycleRuntime implements WorkflowLifecycleRuntime {
  private readonly authorizer: OperationAuthorizer;
  private readonly gateEvaluator: GateEvaluator;
  private readonly adapterRegistry: EntityAdapterRegistry;
  private readonly createEngine: (db: WorkflowRuntimeDb | WorkflowRuntimeTransaction) => WorkflowEngine;

  constructor(private readonly deps: WorkflowLifecycleRuntimeDeps) {
    this.authorizer = deps.operationAuthorizer ?? new OperationAuthorizer({
      db: deps.db,
      checkPermission: deps.checkPermission,
      logger: deps.logger
        ? {
            error: deps.logger.error,
            warn: deps.logger.warn ?? deps.logger.error,
          }
        : undefined,
    });
    this.gateEvaluator = deps.gateEvaluator ?? new GateEvaluator();
    this.adapterRegistry = deps.entityAdapterRegistry ?? createDefaultEntityAdapterRegistry();
    this.createEngine = deps.createWorkflowEngineForDb ?? ((db) => createWorkflowEngine({
      db: db as WorkflowRuntimeDb,
      logger: deps.logger,
    }));
  }

  async executeOperation(command: ExecuteOperationCommand): Promise<OperationResult> {
    const normalized = normalizeCommand(command);
    const operationKey = commandLogOperationKey(normalized);
    const idempotencyKey = normalized.idempotencyKey ?? "implicit";

    const reservation = await this.reserveOrLoadCommandLog(normalized, operationKey, idempotencyKey);
    if (!reservation.ownedByThisCaller) {
      return this.resultFromReplay(normalized, reservation.row);
    }

    try {
      await this.assertRuntimeFlags(normalized.tenantId, normalized.entityName);

      const result = await this.deps.db.transaction().execute(async (trx) => {
        await setTransactionPrincipal(trx, normalized.actorId);
        const ctx = await this.resolveExecutionContext(trx, normalized, true);
        const engine = this.createEngine(trx);
        const workflow = await engine.createRequest({
          tenantId: normalized.tenantId,
          entityType: ctx.entityName,
          entityId: normalized.entityId,
          payload: ctx.record,
          companyCodeId: stringOrUndefined(ctx.record["company_code_id"]),
          legalEntityId: stringOrUndefined(ctx.record["legal_entity_id"]),
          requestedBy: normalized.actorId,
          correlationId: normalized.correlationId,
        });

        await this.advanceLifecycle(trx, normalized, ctx);

        const adapter = this.adapterRegistry.resolve(ctx.entityName);
        const mutation = await adapter.applyOperation(trx, {
          tenantId: normalized.tenantId,
          entityName: ctx.entityName,
          entityId: normalized.entityId,
          actorId: normalized.actorId,
          operationCode: ctx.operationCode,
          fromStatus: ctx.lifecycle.fromStateCode,
          toStatus: ctx.transition.toStateCode,
          workflowRequestId: workflow.id,
          remarks: normalized.remarks,
          payload: ctx.record,
          storage: ctx.storage,
        });

        const operationResult: OperationResult = {
          ok: true,
          statusCode: 200,
          entityName: ctx.entityName,
          entityId: normalized.entityId,
          operationCode: ctx.operationCode,
          record: mutation.record,
          workflowRequestId: workflow.id,
          lifecycle: {
            instanceId: ctx.lifecycle.instanceId,
            transitionId: ctx.transition.id,
            lifecycleId: ctx.lifecycle.lifecycleId,
            fromState: ctx.lifecycle.fromStateCode,
            toState: ctx.transition.toStateCode,
          },
        };

        await adapter.postMutationHook?.(normalized, operationResult, trx);
        await this.completeCommandLog(trx, normalized.tenantId, operationKey, idempotencyKey, operationResult);
        return operationResult;
      });

      return result;
    } catch (err) {
      const normalizedError = normalizeRuntimeError(err);
      await this.failCommandLog(normalized.tenantId, operationKey, idempotencyKey, normalizedError);
      return {
        ok: false,
        statusCode: normalizedError.statusCode,
        entityName: normalized.entityName,
        entityId: normalized.entityId,
        operationCode: normalized.operationCode,
        error: normalizedError.toBody(),
      };
    }
  }

  async canExecuteOperation(query: CanExecuteOperationQuery): Promise<OperationEligibility> {
    const normalized = normalizeCommand(query);
    try {
      await this.assertRuntimeFlags(normalized.tenantId, normalized.entityName);
      const ctx = await this.resolveExecutionContext(this.deps.db, normalized, false);
      return {
        allowed: true,
        entityName: ctx.entityName,
        entityId: normalized.entityId,
        operationCode: ctx.operationCode,
        record: ctx.record,
        lifecycle: {
          instanceId: ctx.lifecycle.instanceId,
          transitionId: ctx.transition.id,
          lifecycleId: ctx.lifecycle.lifecycleId,
          fromState: ctx.lifecycle.fromStateCode,
          toState: ctx.transition.toStateCode,
        },
      };
    } catch (err) {
      const normalizedError = normalizeRuntimeError(err);
      return {
        allowed: false,
        entityName: normalized.entityName,
        entityId: normalized.entityId,
        operationCode: normalized.operationCode,
        reason: normalizedError.toBody(),
      };
    }
  }

  async submitWorkflow(_command: SubmitWorkflowCommand): Promise<WorkflowSubmissionResult> {
    throw new NotImplementedError("submitWorkflow");
  }

  async processWorkItemAction(_command: WorkItemActionCommand): Promise<WorkflowActionResult> {
    throw new NotImplementedError("processWorkItemAction");
  }

  async evaluateTimerTick(_command: TimerTickCommand): Promise<TimerTickResult> {
    throw new NotImplementedError("evaluateTimerTick");
  }

  private async assertRuntimeFlags(tenantId: string, entityName: string): Promise<void> {
    if (!this.deps.featureFlags) {
      throw new WorkflowRuntimeError(
        "FEATURE_FLAG_DISABLED",
        "Workflow runtime feature flags are not wired",
      );
    }
    const flagsToCheck = [
      GLOBAL_RUNTIME_FLAG,
      `${ENTITY_RUNTIME_FLAG_PREFIX}.${normalizeEntityName(entityName)}`,
    ];
    const flags = await this.deps.featureFlags.bulkCheck(flagsToCheck, tenantId);
    const disabled = flagsToCheck.filter((flag) => flags.get(flag) !== true);
    if (disabled.length > 0) {
      throw new WorkflowRuntimeError(
        "FEATURE_FLAG_DISABLED",
        "Workflow runtime is disabled for this entity",
        403,
        { disabled_flags: disabled },
      );
    }
  }

  private async resolveExecutionContext(
    db: WorkflowRuntimeDb | WorkflowRuntimeTransaction,
    command: ExecuteOperationCommand,
    lock: boolean,
  ): Promise<RuntimeExecutionContext> {
    const entityName = normalizeEntityName(command.entityName);
    const operationCode = operationLeaf(command.operationCode);

    // Throws UNSUPPORTED_ENTITY if entity has no registered adapter.
    const entityAdapter = this.adapterRegistry.resolve(entityName);

    const compiled = this.deps.executionDescriptorProvider
      ? await this.deps.executionDescriptorProvider.get({
          plane: "mesh",
          tenantId: command.tenantId,
          entityCode: entityName,
        })
      : null;
    const storage: RuntimeEntityStorage = compiled?.descriptor.storage ?? {
      schema: entityAdapter.sourceTable.split(".")[0] ?? "",
      table: entityAdapter.sourceTable.split(".")[1] ?? entityAdapter.sourceTable,
      primaryKey: "id",
      tenantColumn: "tenant_id",
    };
    if (compiled && storage.writeCapability === "none") {
      throw new WorkflowRuntimeError(
        "OPERATION_DENIED",
        `Entity '${entityName}' does not expose a workflow write capability.`,
        403,
      );
    }

    await this.authorizer.authorize({
      tenantId: command.tenantId,
      principalId: command.actorId,
      entityName,
      entityId: command.entityId,
      operationCode,
    });

    let recordQuery = (db
      .selectFrom(`${storage.schema}.${storage.table} as src` as never) as any)
      .selectAll()
      .where(`src.${storage.primaryKey}`, "=", command.entityId);
    if (storage.tenantColumn) recordQuery = recordQuery.where(`src.${storage.tenantColumn}`, "=", command.tenantId);
    const record = await recordQuery.executeTakeFirst() as Record<string, unknown> | undefined;

    if (!record) {
      throw new WorkflowRuntimeError("ENTITY_NOT_FOUND", `${entityName} '${command.entityId}' not found`);
    }

    const lifecycleBuilder = (db
      .selectFrom("master.lifecycle_instance as li" as never) as any)
      .innerJoin("control.lifecycle_state as fs" as never, "fs.id" as never, "li.state_id" as never)
      .select([
        "li.id as instance_id",
        "li.lifecycle_id",
        "li.state_id as from_state_id",
        "fs.code as from_state_code",
      ] as never[])
      .where("li.tenant_id" as never, "=" as never, command.tenantId as never)
      .where("li.entity_name" as never, "=" as never, entityName as never)
      .where("li.entity_id" as never, "=" as never, command.entityId as never)
      .limit(1);

    const lifecycle = await (
      lock && typeof (lifecycleBuilder as { forUpdate?: unknown }).forUpdate === "function"
        ? lifecycleBuilder.forUpdate()
        : lifecycleBuilder
    ).executeTakeFirst() as {
      instance_id: string;
      lifecycle_id: string;
      from_state_id: string;
      from_state_code: string;
    } | undefined;

    if (!lifecycle) {
      throw new WorkflowRuntimeError(
        "LIFECYCLE_INSTANCE_MISSING",
        `No lifecycle instance found for ${entityName}/${command.entityId}`,
      );
    }

    const currentStatus = String(record["status"] ?? "");
    if (currentStatus !== lifecycle.from_state_code) {
      throw new WorkflowRuntimeError(
        "TRANSITION_DENIED",
        `Source status '${currentStatus}' does not match lifecycle state '${lifecycle.from_state_code}'`,
      );
    }

    const transition = await (db
      .selectFrom("control.lifecycle_transition as lt" as never) as any)
      .innerJoin("control.lifecycle_state as ts" as never, "ts.id" as never, "lt.to_state_id" as never)
      .leftJoin("control.lifecycle_transition_gate as ltg" as never, "ltg.transition_id" as never, "lt.id" as never)
      .select([
        "lt.id as transition_id",
        "lt.lifecycle_id",
        "lt.from_state_id",
        "lt.to_state_id",
        "lt.operation_code",
        "ts.code as to_state_code",
        "ltg.required_operations",
        "ltg.workflow_definition_id",
        "ltg.conditions",
        "ltg.threshold_rules",
        "ltg.resolves_via",
      ] as never[])
      .where("lt.lifecycle_id" as never, "=" as never, lifecycle.lifecycle_id as never)
      .where("lt.from_state_id" as never, "=" as never, lifecycle.from_state_id as never)
      .where("lt.operation_code" as never, "=" as never, operationCode as never)
      .where("lt.is_active" as never, "=" as never, true as never)
      .limit(1)
      .executeTakeFirst() as {
        transition_id: string;
        to_state_id: string;
        to_state_code: string;
        required_operations?: unknown;
        workflow_definition_id?: string | null;
        conditions?: unknown;
        threshold_rules?: unknown;
        resolves_via?: string | null;
      } | undefined;

    if (!transition) {
      throw new WorkflowRuntimeError(
        "TRANSITION_DENIED",
        `No active transition '${operationCode}' from state '${lifecycle.from_state_code}'`,
      );
    }

    const gate: TransitionGate | null = hasGate(transition)
      ? {
          transitionId: transition.transition_id,
          requiredOperations: transition.required_operations,
          workflowDefinitionId: transition.workflow_definition_id ?? null,
          conditions: transition.conditions,
          thresholdRules: transition.threshold_rules,
          resolvesVia: transition.resolves_via ?? null,
        }
      : null;

    await this.gateEvaluator.assertAllowed({
      db: db as WorkflowRuntimeDb,
      tenantId: command.tenantId,
      entityName,
      entityId: command.entityId,
      payload: {
        ...record,
        ...(command.payload ?? {}),
        tenant_id: command.tenantId,
        operation_code: operationCode,
      },
      gate,
    });

    return {
      entityName,
      operationCode,
      record,
      storage,
      lifecycle: {
        instanceId: lifecycle.instance_id,
        lifecycleId: lifecycle.lifecycle_id,
        fromStateId: lifecycle.from_state_id,
        fromStateCode: lifecycle.from_state_code,
      },
      transition: {
        id: transition.transition_id,
        toStateId: transition.to_state_id,
        toStateCode: transition.to_state_code,
        gate,
      },
    };
  }

  private async advanceLifecycle(
    trx: WorkflowRuntimeTransaction,
    command: ExecuteOperationCommand,
    ctx: RuntimeExecutionContext,
  ): Promise<void> {
    const now = new Date();
    const correlationId = command.correlationId ?? randomUUID();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (trx.updateTable("master.lifecycle_instance" as never) as any)
      .set({
        state_id: ctx.transition.toStateId,
        updated_at: now,
        updated_by: command.actorId,
      } as never)
      .where("id" as never, "=" as never, ctx.lifecycle.instanceId as never)
      .execute();

    await trx
      .insertInto("log.entity_lifecycle_log" as never)
      .values({
        tenant_id: command.tenantId,
        entity_type: ctx.entityName,
        entity_id: command.entityId,
        lifecycle_id: ctx.lifecycle.lifecycleId,
        operation_code: ctx.operationCode,
        from_status: ctx.lifecycle.fromStateCode,
        to_status: ctx.transition.toStateCode,
        from_state_id: ctx.lifecycle.fromStateId,
        to_state_id: ctx.transition.toStateId,
        actor_id: command.actorId,
        actor_type: "principal",
        company_code_id: stringOrNull(ctx.record["company_code_id"]),
        remarks: command.remarks ?? null,
        payload: JSON.stringify({
          ...(command.payload ?? {}),
          workflow_runtime_phase: "phase_1",
        }),
        correlation_id: correlationId,
        created_by: command.actorId,
      } as never)
      .execute();

    await trx
      .insertInto("event.outbox" as never)
      .values({
        tenant_id: command.tenantId,
        topic: "lifecycle",
        event_type: "state_transitioned",
        event_key: correlationId,
        entity_type: ctx.entityName,
        entity_id: command.entityId,
        actor_id: command.actorId,
        source: "workflow_runtime",
        correlation_id: correlationId,
        payload: JSON.stringify({
          instance_id: ctx.lifecycle.instanceId,
          lifecycle_id: ctx.lifecycle.lifecycleId,
          transition_id: ctx.transition.id,
          from_state_code: ctx.lifecycle.fromStateCode,
          from_state_id: ctx.lifecycle.fromStateId,
          to_state_code: ctx.transition.toStateCode,
          to_state_id: ctx.transition.toStateId,
          operation_code: ctx.operationCode,
          actor_id: command.actorId,
          remarks: command.remarks ?? null,
        }),
        created_by: command.actorId,
      } as never)
      .execute();
  }

  private async loadCommandLog(
    tenantId: string,
    operation: string,
    idempotencyKey: string,
  ): Promise<CommandLogRow | null> {
    const row = await this.deps.db
      .selectFrom("document.command_log as cl" as never)
      .select([
        "cl.id",
        "cl.status",
        "cl.result",
        "cl.error_code",
        "cl.error_message",
      ] as never[])
      .where("cl.tenant_id" as never, "=" as never, tenantId as never)
      .where("cl.operation" as never, "=" as never, operation as never)
      .where("cl.idempotency_key" as never, "=" as never, idempotencyKey as never)
      .executeTakeFirst() as CommandLogRow | undefined;
    return row ?? null;
  }

  private resultFromReplay(command: ExecuteOperationCommand, row: CommandLogRow): OperationResult {
    if (row.status === "done") {
      const stored = parseStoredResult(row.result);
      if (stored && typeof stored === "object" && "ok" in stored) {
        return { ...(stored as OperationResult), replayed: true };
      }
      return {
        ok: true,
        statusCode: 200,
        entityName: command.entityName,
        entityId: command.entityId,
        operationCode: command.operationCode,
        replayed: true,
        record: stored && typeof stored === "object" ? stored as Record<string, unknown> : undefined,
      };
    }

    if (row.status === "error") {
      const errorCode = row.error_code ?? "COMMAND_REPLAY_ERROR";
      return {
        ok: false,
        statusCode: statusCodeForRuntimeError(errorCode as never),
        entityName: command.entityName,
        entityId: command.entityId,
        operationCode: command.operationCode,
        replayed: true,
        error: {
          code: errorCode,
          message: row.error_message ?? "Prior command failed",
        },
      };
    }

    return {
      ok: false,
      statusCode: 409,
      entityName: command.entityName,
      entityId: command.entityId,
      operationCode: command.operationCode,
      replayed: true,
      error: {
        code: "COMMAND_IN_PROGRESS",
        message: "A command with this idempotency key is already processing",
      },
    };
  }

  private async reserveOrLoadCommandLog(
    command: ExecuteOperationCommand,
    operation: string,
    idempotencyKey: string,
  ): Promise<CommandLogReservation> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inserted = await (this.deps.db.insertInto(COMMAND_LOG_TABLE as never) as any)
      .values({
        tenant_id: command.tenantId,
        operation,
        idempotency_key: idempotencyKey,
        status: "processing",
        principal_id: command.actorId,
      } as never)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .onConflict((oc: any) => oc.columns(["tenant_id", "operation", "idempotency_key"] as never).doNothing())
      .returning(["id", "status", "result", "error_code", "error_message"] as never[])
      .executeTakeFirst() as Partial<CommandLogRow> | undefined | null;

    if (inserted?.id) {
      return {
        ownedByThisCaller: true,
        row: {
          id: inserted.id,
          status: inserted.status ?? "processing",
          result: inserted.result ?? null,
          error_code: inserted.error_code ?? null,
          error_message: inserted.error_message ?? null,
        },
      };
    }

    const existing = await this.loadCommandLog(command.tenantId, operation, idempotencyKey);
    return {
      ownedByThisCaller: false,
      row: existing ?? {
        id: "",
        status: "processing",
        result: null,
        error_code: null,
        error_message: null,
      },
    };
  }

  private async completeCommandLog(
    trx: WorkflowRuntimeTransaction,
    tenantId: string,
    operation: string,
    idempotencyKey: string,
    result: OperationResult,
  ): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (trx.updateTable(COMMAND_LOG_TABLE as never) as any)
      .set({
        status: "done",
        result: JSON.stringify(result),
        completed_at: new Date(),
      } as never)
      .where("tenant_id" as never, "=" as never, tenantId as never)
      .where("operation" as never, "=" as never, operation as never)
      .where("idempotency_key" as never, "=" as never, idempotencyKey as never)
      .execute();
  }

  private async failCommandLog(
    tenantId: string,
    operation: string,
    idempotencyKey: string,
    err: WorkflowRuntimeError,
  ): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (this.deps.db.updateTable(COMMAND_LOG_TABLE as never) as any)
        .set({
          status: "error",
          error_code: err.code,
          error_message: err.message,
          completed_at: new Date(),
        } as never)
        .where("tenant_id" as never, "=" as never, tenantId as never)
        .where("operation" as never, "=" as never, operation as never)
        .where("idempotency_key" as never, "=" as never, idempotencyKey as never)
        .execute();
    } catch (updateErr) {
      this.deps.logger?.error("workflow_runtime_command_log_error", {
        err: updateErr instanceof Error ? updateErr.message : String(updateErr),
      });
    }
  }
}

export function createWorkflowLifecycleRuntime(
  deps: WorkflowLifecycleRuntimeDeps,
): WorkflowLifecycleRuntime {
  return new DefaultWorkflowLifecycleRuntime(deps);
}

function normalizeCommand<T extends { entityName: string; operationCode: string; actorId?: string }>(command: T): T {
  return {
    ...command,
    entityName: normalizeEntityName(command.entityName),
    operationCode: operationLeaf(command.operationCode),
    actorId: command.actorId ?? SYSTEM_ACTOR,
  };
}

function commandLogOperationKey(command: ExecuteOperationCommand): string {
  return `${normalizeEntityName(command.entityName)}:${command.entityId}:${operationLeaf(command.operationCode)}`;
}

function operationLeaf(operationCode: string): string {
  const leaf = operationCode.trim().toLowerCase().split(/[.:/-]+/).filter(Boolean).at(-1)
    ?? operationCode.trim().toLowerCase();
  return leaf === "submit_for_approval" ? "submit" : leaf;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

async function setTransactionPrincipal(
  trx: WorkflowRuntimeTransaction,
  actorId: string,
): Promise<void> {
  if (typeof (trx as { executeQuery?: unknown }).executeQuery !== "function") return;
  await sql`SELECT set_config('app.current_principal_id', ${actorId}, true)`.execute(trx as never);
}

function hasGate(row: {
  required_operations?: unknown;
  workflow_definition_id?: string | null;
  conditions?: unknown;
  threshold_rules?: unknown;
  resolves_via?: string | null;
}): boolean {
  return row.required_operations != null
    || row.workflow_definition_id != null
    || row.conditions != null
    || row.threshold_rules != null
    || row.resolves_via != null;
}

function parseStoredResult(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
