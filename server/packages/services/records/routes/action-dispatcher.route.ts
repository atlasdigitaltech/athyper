/**
 * Action Dispatcher Route — Sprint 41
 *
 *   POST /api/records/:entity/:id/action/:code
 *
 * Executes a single entity operation on a specific record.
 * Called by ActionBar for handler_type = "API" or "MODAL" operations.
 *
 * Resolution:
 *   1. Look up control.entity_operation by entity_name + permission_code.
 *   2. Fetch the record to know current status and get field values for copies.
 *   3. Dispatch server commands from execution_target. handler_target remains
 *      UI-only metadata (for example flow:submit_for_approval).
 *
 *   Status transitions (validated via snapshot.status_route / entity_lifecycle):
 *     submit    → SUBMITTED
 *     approve   → APPROVED
 *     deny      → REJECTED
 *     post      → POSTED
 *     cancel    → CANCELLED
 *     void      → VOID
 *     close     → CLOSED
 *     archive   → ARCHIVED
 *
 *   Field mutations:
 *     deactivate → set is_active = false, updated_at/by
 *
 *   Record copies:
 *     copy    → duplicate record with status DRAFT and new ID
 *     reverse → duplicate record with status DRAFT; stores reversed_from_id if column exists
 *
 * Request body: { remarks?: string }   (from ConfirmSheet)
 * Response:     { ok: true, record: updatedRow }
 *              | { ok: true, newRecord: { id } }   (copy/reverse)
 */

import type { RequestHandler, Response, Router } from "express";
import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import {
  isUuid,
  SYSTEM_PRINCIPAL_UUID,
  emitOutboxEvent,
} from "@athyper/svc-shared";
import { handlePromoteProforma } from "@athyper/svc-business";
import { matchInvoice }           from "@athyper/svc-business";
import { runLifecycleHooks }      from "@athyper/svc-business";
import { purchaseOrderSubmitPreflight } from "@athyper/svc-business";
import { evaluatePurchaseOrderTransition } from "@athyper/svc-business";
import {
  placeInvoiceOnHold,
  releaseInvoiceHold,
  HoldNotAllowedError,
  ReleaseNotAllowedError,
} from "@athyper/svc-business";
import {
  handlePostPayment,
  handleSubmitPayment,
  handleVoidPayment,
} from "@athyper/svc-business";
import type { BusinessLifecycleSyncHook } from "@athyper/svc-business";
import { checkPermission, hasCompanyCodeAccess, requireVerifiedContext } from "@athyper/svc-iam";
import {
  createWorkflowEngine,
  syncLifecycleInstanceForStatus,
} from "@athyper/svc-workflow";
import { handleReverseJournalEntry } from "@athyper/svc-finance";
import { copyRecordFromMetadata } from "../copy-record.service.js";
import {
  LifecycleCommandResolutionError,
  resolveLifecycleCommand,
  type LifecycleCommandRegistration,
} from "./lifecycle-command.registry.js";
import {
  executeLifecycleTransition,
  LifecycleTransitionError,
} from "../lifecycle/execute-lifecycle-transition.js";
import { resolveLifecycleOrchestratorRollout } from "../lifecycle/lifecycle-orchestrator-rollout.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

interface ActionEntityContract {
  table_schema: string;
  table_name: string;
  primary_key: string;
  tenant_column: string | null;
  write_capability: string;
}

function scopeActionRecord(query: any, entity: ActionEntityContract, tenantId: string, recordId: string): any {
  let scoped = query.where(entity.primary_key, "=", recordId);
  if (entity.tenant_column) scoped = scoped.where(entity.tenant_column, "=", tenantId);
  return scoped;
}

// Cache of generated columns per (schema, table). Generated columns
// (`GENERATED ALWAYS AS … STORED`) cannot accept user-supplied values on
// INSERT — Postgres rejects with `cannot insert a non-DEFAULT value into
// column "<name>"`. We need to skip these when cloning a record for
// copy/reverse. DDL is static at runtime, so a process-lifetime cache is safe.
const GENERATED_COLS_CACHE = new Map<string, Set<string>>();

async function getGeneratedColumns(
  db: AnyDb,
  schema: string,
  table: string,
): Promise<Set<string>> {
  const key = `${schema}.${table}`;
  const cached = GENERATED_COLS_CACHE.get(key);
  if (cached) return cached;

  const rows = await db
    .selectFrom("information_schema.columns" as never)
    .select(["column_name"] as never[])
    .where("table_schema" as never, "=", schema as never)
    .where("table_name" as never, "=", table as never)
    .where("is_generated" as never, "=", "ALWAYS" as never)
    .execute() as Array<{ column_name: string }>;

  const set = new Set(rows.map((r) => r.column_name));
  GENERATED_COLS_CACHE.set(key, set);
  return set;
}

// ─── Deps ─────────────────────────────────────────────────────────────────────

export interface ActionDispatcherDeps {
  db:    AnyDb;
  auth:  { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
    info(event: string, fields?: Record<string, unknown>): void;
  };
}

function createLifecycleSyncHook(
  logger: ActionDispatcherDeps["logger"],
): BusinessLifecycleSyncHook {
  return async (params) => {
    const sync = await syncLifecycleInstanceForStatus({
      db: params.db as never,
      tenantId: params.tenantId,
      entityName: params.entityName,
      entityId: params.entityId,
      status: params.status,
      actorId: params.actorId,
      payload: params.payload,
      logger,
    });

    if (!sync.synced) {
      logger?.warn("action_dispatch_business_lifecycle_instance_sync_skipped", {
        entity: params.entityName,
        tenantId: params.tenantId,
        recordId: params.entityId,
        status: params.status,
        reason: sync.reason,
      });
    }
  };
}

// ─── handler_target → status value map ────────────────────────────────────────
// Values must match control.lifecycle_state.code (lowercase snake_case).

const TARGET_STATUS: Record<string, string> = {
  submit:   "pending_approval",
  approve:  "approved",
  deny:     "rejected",
  post:     "posted",
  cancel:   "cancelled",
  void:     "cancelled",
  close:    "closed",
  archive:  "archived",
  amend:    "amending",   // opens a new amendment cycle; revision_no incremented by DB trigger
};

const WORKFLOW_TASK_DECISIONS = new Set([
  "approve",
  "deny",
  "reject",
  "return",
  "request_info",
  "request_more_info",
  "more_info",
]);

// ─── Lifecycle helpers (inline — mirrors bulk-action.route.ts) ─────────────────

interface StatusRouteCompiled {
  allowed_transitions: Record<string, string[]>;
}

interface ActionLifecycleTransition {
  /** control.lifecycle_transition.id — used to look up hook rows. */
  transition_id: string;
  to_state: string;
  operation_code: string;
  requires_reason?: boolean;
  requires_confirmation?: boolean;
}

async function resolveLifecycleTransitionForAction(
  db: AnyDb,
  entityName: string,
  tenantId: string,
  permissionCode: string,
  fromStatus: string,
): Promise<ActionLifecycleTransition | null> {
  if (!fromStatus) return null;

  const row = await db
    .selectFrom("control.entity_lifecycle as el")
    .innerJoin("control.lifecycle_transition as lt", "lt.lifecycle_id" as never, "el.lifecycle_id" as never)
    .innerJoin("control.lifecycle_state as fs", "fs.id" as never, "lt.from_state_id" as never)
    .innerJoin("control.lifecycle_state as ts", "ts.id" as never, "lt.to_state_id" as never)
    .select([
      "lt.id as transition_id",
      "ts.code as to_state",
      "lt.operation_code as operation_code",
      "lt.config",
    ] as never[])
    .where("el.entity_name" as never, "=", entityName as never)
    .where("lt.operation_code" as never, "=", permissionCode as never)
    .where("fs.code" as never, "=", fromStatus as never)
    .where("lt.is_active" as never, "=", true as never)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .where((eb: any) =>
      eb.or([
        eb("el.tenant_id" as never, "is", null),
        eb("el.tenant_id" as never, "=", tenantId as never),
      ]),
    )
    .orderBy("el.tenant_id" as never, "desc")
    .orderBy("el.priority" as never, "asc")
    .limit(1)
    .executeTakeFirst() as { transition_id: string; to_state: string; operation_code: string; config: unknown } | undefined;

  if (!row) return null;
  const config = asRecord(row.config);
  return {
    transition_id:  row.transition_id,
    to_state:       row.to_state,
    operation_code: row.operation_code,
    requires_reason: readConfigBoolean(config, "requires_reason")
      ?? readConfigBoolean(config, "require_reason")
      ?? readConfigBoolean(config, "require_comment"),
    requires_confirmation: readConfigBoolean(config, "requires_confirmation")
      ?? readConfigBoolean(config, "confirm"),
  };
}

async function isTransitionAllowed(
  db:           AnyDb,
  entityName:   string,
  tenantId:     string,
  fromStatus:   string,
  targetStatus: string,
): Promise<{ allowed: boolean; reason?: string }> {
  // 1. snapshot.status_route — O(1) compiled lookup (populated by compile_status_route())
  const routeRow = await db
    .selectFrom("snapshot.status_route as sr")
    .select(["sr.compiled_json"])
    .where("sr.entity_name", "=", entityName)
    .where("sr.tenant_id", "=", tenantId)
    .orderBy("sr.updated_at" as never, "desc")
    .limit(1)
    .executeTakeFirst() as { compiled_json: StatusRouteCompiled | null } | undefined;

  if (routeRow?.compiled_json) {
    const map = routeRow.compiled_json.allowed_transitions;
    const allowed = map[fromStatus] ?? [];
    if (!allowed.includes(targetStatus)) {
      return { allowed: false, reason: `Transition ${fromStatus}→${targetStatus} not permitted` };
    }
    return { allowed: true };
  }

  // 2. Fallback: direct query against control.lifecycle_transition + lifecycle_state.
  //    Used when the snapshot has not yet been compiled for this tenant/entity.
  const hasBinding = await db
    .selectFrom("control.entity_lifecycle as el")
    .select(["el.id"] as never[])
    .where("el.entity_name" as never, "=", entityName as never)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .where((eb: any) =>
      eb.or([
        eb("el.tenant_id" as never, "is", null),
        eb("el.tenant_id" as never, "=", tenantId as never),
      ]),
    )
    .limit(1)
    .executeTakeFirst() as { id: string } | undefined;

  if (!hasBinding) {
    // No lifecycle registered for this entity — treat as open
    return { allowed: true };
  }

  const transition = await db
    .selectFrom("control.entity_lifecycle as el")
    .innerJoin("control.lifecycle_transition as lt", "lt.lifecycle_id" as never, "el.lifecycle_id" as never)
    .innerJoin("control.lifecycle_state as fs",      "fs.id" as never,           "lt.from_state_id" as never)
    .innerJoin("control.lifecycle_state as ts",      "ts.id" as never,           "lt.to_state_id" as never)
    .select(["lt.id"] as never[])
    .where("el.entity_name" as never, "=", entityName as never)
    .where("fs.code" as never, "=", fromStatus as never)
    .where("ts.code" as never, "=", targetStatus as never)
    .where("lt.is_active" as never, "=", true as never)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .where((eb: any) =>
      eb.or([
        eb("el.tenant_id" as never, "is", null),
        eb("el.tenant_id" as never, "=", tenantId as never),
      ]),
    )
    .limit(1)
    .executeTakeFirst() as { id: string } | undefined;

  if (!transition) {
    return { allowed: false, reason: `Transition ${fromStatus}→${targetStatus} not in lifecycle` };
  }
  return { allowed: true };
}

// ─── Route factory ─────────────────────────────────────────────────────────────

export function createActionDispatcherRoute(router: Router, deps: ActionDispatcherDeps): Router {
  const { db, logger } = deps;
  const lifecycleSync = createLifecycleSyncHook(logger);

  const handler: RequestHandler = async (req, res, next) => {
    try {
      const verifiedContext = requireVerifiedContext(req, res);

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const recordId   = String(req.params["id"] ?? "");
      const code       = String(req.params["code"] ?? "").toLowerCase();

      if (!isUuid(recordId)) {
        res.status(400).json({ error: "INVALID_ID", message: "Record id must be a valid UUID" });
        return;
      }

      const { tenantId, principalId } = verifiedContext;
      const body    = (req.body ?? {}) as Record<string, unknown>;
      const remarks = typeof body["remarks"] === "string" ? body["remarks"] : undefined;

      // ── Look up the operation ─────────────────────────────────────────────────
      const operation = await db
        .selectFrom("control.entity_operation as eo")
        .innerJoin("control.auth_permission as p", "p.id" as never, "eo.permission_id_v2" as never)
        .innerJoin("shared.auth_permission_category as pc", "pc.id" as never, "p.category_id" as never)
        .select([
          "eo.permission_code",
          "eo.operation_code_v2 as operation_code",
          "eo.handler_type",
          "eo.handler_target",
          "eo.execution_target",
          "eo.is_record_required",
          "eo.is_enabled",
          "pc.code as permission_category_code",
        ] as never[])
        .where("eo.entity_name" as never, "=", entityCode as never)
        .where("p.status" as never, "=", "published" as never)
        .where("eo.operation_code_v2" as never, "=", code as never)
        .where("eo.v2_publication_status" as never, "=", "published" as never)
        // Prefer tenant override over global
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .where((eb: any) =>
          eb.or([
            eb("eo.tenant_id" as never, "is", null),
            eb("eo.tenant_id" as never, "=", tenantId as never),
          ]),
        )
        .orderBy("eo.tenant_id" as never, "desc") // non-null tenant_id first
        .limit(1)
        .executeTakeFirst() as {
          permission_code: string;
          operation_code: string;
          handler_type: string;
          handler_target: string | null;
          execution_target: string | null;
          is_record_required: boolean;
          is_enabled: boolean;
          permission_category_code: string;
        } | undefined;

      if (!operation) {
        res.status(404).json({ error: "OPERATION_NOT_FOUND", message: `Operation '${code}' not found for entity '${entityCode}'` });
        return;
      }

      if (!operation.is_enabled) {
        res.status(403).json({ error: "OPERATION_DISABLED", message: `Operation '${code}' is disabled` });
        return;
      }

      if (isWorkflowTaskDecision(operation.operation_code, operation.permission_category_code)) {
        res.status(400).json({
          error: "WORKFLOW_TASK_ACTION",
          message: `Operation '${code}' must be executed through the workflow work-item action endpoint`,
        });
        return;
      }

      // Frontend-only operations should not reach here
      if (operation.handler_type === "NAVIGATE" || operation.handler_type === "INLINE") {
        res.status(400).json({ error: "FRONTEND_ONLY", message: `Operation '${code}' is a frontend-only action` });
        return;
      }

      if (!principalId || !isUuid(principalId)) {
        res.status(403).json({ error: "PRINCIPAL_NOT_FOUND", message: "no principal bound to this session" });
        return;
      }

      const permissionResult = await checkPermission(
        db,
        tenantId,
        principalId,
        operation.permission_code,
        {
          entity_type: entityCode,
          entity_id: recordId,
        },
        logger,
      );
      if (!requireAllowedPermission(permissionResult, res)) return;

      // ── Resolve entity table ──────────────────────────────────────────────────
      const entityRow = await db
        .selectFrom("control.entity as e")
        .innerJoin("control.entity_version as ev", "ev.entity_id", "e.id")
        .select([
          "e.table_schema", "e.table_name", "e.primary_key", "e.tenant_column", "e.write_capability",
        ] as never[])
        .where("e.name", "=", entityCode)
        .where("e.tenant_id", "is", null)
        .where("e.runtime_enabled", "=", true)
        .where("e.status", "=", "ACTIVE")
        .where("e.is_active", "=", true)
        .where("e.read_capability", "<>", "none")
        .where("e.primary_key", "is not", null)
        .where("e.backing_type", "=", "table")
        .where("ev.status", "=", "EFFECTIVE")
        .executeTakeFirst() as ActionEntityContract | undefined;

      if (!entityRow) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const fullTable = `${entityRow.table_schema}.${entityRow.table_name}` as `${string}.${string}`;
      if (entityRow.write_capability === "none") {
        res.status(403).json({ error: "ENTITY_READ_ONLY", message: `Entity '${entityCode}' does not expose write actions.` });
        return;
      }

      // ── Fetch current record ──────────────────────────────────────────────────
      let recordQuery = (db.selectFrom(fullTable) as any).selectAll();
      recordQuery = scopeActionRecord(recordQuery, entityRow, tenantId, recordId);
      const record = await recordQuery.executeTakeFirst() as Record<string, unknown> | undefined;

      if (!record) {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${recordId}' not found` });
        return;
      }

      const recordCompanyCodeId = typeof record["company_code_id"] === "string"
        ? record["company_code_id"]
        : null;
      if (recordCompanyCodeId) {
        if (verifiedContext.companyCodeId && verifiedContext.companyCodeId !== recordCompanyCodeId) {
          res.status(403).json({ error: "COMPANY_SCOPE_DENIED", message: "The record is outside the active company context." });
          return;
        }
        if (verifiedContext.legalEntityId) {
          const companyInScope = await db
            .selectFrom("master.company_code as cc")
            .select("cc.id")
            .where("cc.id", "=", recordCompanyCodeId)
            .where("cc.tenant_id", "=", tenantId)
            .where("cc.legal_entity_id", "=", verifiedContext.legalEntityId)
            .executeTakeFirst();
          if (!companyInScope) {
            res.status(403).json({ error: "COMPANY_SCOPE_DENIED", message: "The record is outside the active legal-entity context." });
            return;
          }
        }
        const companyAllowed = hasCompanyCodeAccess(
          verifiedContext.permissions,
          operation.permission_code,
          recordCompanyCodeId,
        );
        if (!companyAllowed) {
          res.status(403).json({ error: "COMPANY_SCOPE_DENIED", message: "The principal is not authorized for the record company." });
          return;
        }
      }

      const interactionTarget = (operation.handler_target ?? code).toLowerCase();
      let target = (operation.execution_target ?? interactionTarget).toLowerCase();
      let lifecycleCommand: LifecycleCommandRegistration | undefined;
      if (target.startsWith("lifecycle:")) {
        const commandOperationCode = target.slice("lifecycle:".length);
        const flowCode = interactionTarget.startsWith("flow:")
          ? interactionTarget.slice("flow:".length)
          : undefined;
        try {
          lifecycleCommand = resolveLifecycleCommand(entityCode, commandOperationCode, flowCode);
          const rollout = await resolveLifecycleOrchestratorRollout(
            db, tenantId, entityCode, commandOperationCode,
          );
          logger?.info("lifecycle_command_orchestrator_resolution", {
            tenantId,
            entity: entityCode,
            operation: commandOperationCode,
            registryKey: `${lifecycleCommand.entityCode}::${lifecycleCommand.operationCode}`,
            rolloutSource: rollout.source,
            enabled: rollout.enabled,
            legacyRoute: req.path.startsWith("/records/"),
          });
          if (req.path.startsWith("/records/")) {
            logger?.warn("lifecycle_command_legacy_route_usage", {
              tenantId,
              entity: entityCode,
              operation: commandOperationCode,
              registryKey: `${lifecycleCommand.entityCode}::${lifecycleCommand.operationCode}`,
            });
          }
          if (!rollout.enabled) {
            logger?.warn("lifecycle_command_legacy_usage", {
              tenantId,
              entity: entityCode,
              operation: commandOperationCode,
              registryKey: `${lifecycleCommand.entityCode}::${lifecycleCommand.operationCode}`,
              reason: "entity_flag_disabled",
              legacyRoute: req.path.startsWith("/records/"),
            });
            res.status(503).json({
              error: "LIFECYCLE_ORCHESTRATOR_DISABLED",
              message: `Lifecycle command orchestration is not enabled for '${entityCode}::${commandOperationCode}'.`,
            });
            return;
          }
        } catch (err) {
          if (err instanceof LifecycleCommandResolutionError) {
            logger?.warn("action_dispatch_lifecycle_command_resolution_failed", {
              entity: entityCode,
              operation: commandOperationCode,
              flowCode,
              executionTarget: target,
              error: err.code,
            });
            res.status(err.code === "LIFECYCLE_COMMAND_NOT_REGISTERED" ? 500 : 422).json({
              error: err.code,
              message: err.message,
            });
            return;
          }
          throw err;
        }
      }
      const now     = new Date();
      const currentStatus = String(record["status"] ?? "");

      if (lifecycleCommand) {
        try {
          const transitioned = await executeLifecycleTransition({
            db,
            tenantId,
            entityCode,
            recordId,
            operationCode: lifecycleCommand.operationCode,
            principalId,
            operationPayload: body,
            command: lifecycleCommand,
            expectedCurrentStatus: currentStatus,
            logger,
          });
          logger?.info("action_dispatch_lifecycle_command", {
            entity: entityCode,
            tenantId,
            recordId,
            operation: lifecycleCommand.operationCode,
            registryKey: `${lifecycleCommand.entityCode}::${lifecycleCommand.operationCode}`,
            transitionId: transitioned.transitionId,
            executionToken: transitioned.executionToken,
            idempotencyReplay: transitioned.idempotencyReplay,
            legacyRoute: req.path.startsWith("/records/"),
            from: transitioned.fromStatus,
            to: transitioned.toStatus,
          });
          res.json({ ok: true, record: transitioned.record });
          return;
        } catch (err) {
          if (err instanceof LifecycleTransitionError) {
            logger?.warn("action_dispatch_lifecycle_command_failed", {
              entity: entityCode,
              tenantId,
              recordId,
              operation: lifecycleCommand.operationCode,
              error: err.code,
            });
            res.status(err.status).json({
              error: err.code,
              message: err.message,
              ...(err.details ? { details: err.details } : {}),
            });
            return;
          }
          throw err;
        }
      }
      const lifecycleTransition = await resolveLifecycleTransitionForAction(
        db,
        entityCode,
        tenantId,
        operation.permission_code,
        currentStatus,
      );

      if (lifecycleTransition?.requires_reason && !remarks?.trim()) {
        res.status(400).json({
          error: "ACTION_REASON_REQUIRED",
          message: `Operation '${code}' requires a reason`,
        });
        return;
      }

      // Purchase-order submit is a workflow command, not a plain status flip.
      // Validation, workflow correlation, lifecycle hooks, source mutation and
      // outbox emission all share one transaction.
      if (entityCode === "purchase_order"
        && (code === "submit" || code === "submit_for_approval")) {
        if (!principalId || !isUuid(principalId)) {
          res.status(403).json({ error: "PRINCIPAL_NOT_FOUND", message: "No principal is bound to this session." });
          return;
        }

        const preflight = await purchaseOrderSubmitPreflight(db, tenantId, recordId);
        if (!preflight.ok) {
          res.status(422).json({
            error: "PO_SUBMIT_PREFLIGHT_FAILED",
            message: "Purchase order is not ready for submission.",
            ...preflight,
          });
          return;
        }

        const submitted = await db.transaction().execute(async (trx) => {
          const locked = await sql<Record<string, unknown>>`
            SELECT * FROM document.commitment
             WHERE tenant_id = ${tenantId}::uuid
               AND id = ${recordId}::uuid
               AND commitment_type = 'purchase_order'
             FOR UPDATE
          `.execute(trx);
          const po = locked.rows[0];
          if (!po || po["status"] !== "draft") return null;

          const txPreflight = await purchaseOrderSubmitPreflight(trx, tenantId, recordId);
          if (!txPreflight.ok) {
            throw Object.assign(new Error("PO_SUBMIT_PREFLIGHT_FAILED"), { code: 422, preflight: txPreflight });
          }

          const transitionId = lifecycleTransition?.transition_id;
          if (transitionId) {
            await runLifecycleHooks(trx as never, {
              tenantId,
              transitionId,
              sourceDocType: "purchase_order",
              sourceDocId: recordId,
              principalId,
              timing: "before",
              fromStatus: "draft",
              toStatus: "pending_approval",
              operationCode: lifecycleTransition.operation_code,
            });
          }

          const workflow = createWorkflowEngine({ db: trx as never, logger });
          const request = await workflow.createRequest({
            tenantId,
            entityType: "purchase_order",
            entityId: recordId,
            payload: po,
            companyCodeId: String(po["company_code_id"]),
            requestedBy: principalId,
          });

          let generatedCode = String(po["code"] ?? "");
          if (po["is_provisional"] === true) {
            const documentDate = normalizeDateOnly(po["document_date"]);
            const numberResult = await sql<{ value: string | null }>`
              SELECT control.next_entity_number(
                ${tenantId}::uuid, 'purchase_order', 'code',
                ${String(po["company_code_id"])}::uuid,
                NULL::smallint, NULL::smallint, NULL, ${documentDate!}::date
              ) AS value
            `.execute(trx);
            generatedCode = numberResult.rows[0]?.value
              ?? `PO-${new Date().toISOString().slice(0, 7).replace("-", "")}-${recordId.slice(0, 6).toUpperCase()}`;
          }

          const updatedResult = await sql<Record<string, unknown>>`
            UPDATE document.commitment
               SET status = 'pending_approval',
                   workflow_request_id = ${request.id}::uuid,
                   code = CASE WHEN is_provisional THEN ${generatedCode} ELSE code END,
                   name = CASE WHEN is_provisional AND btrim(name) = '' THEN ${`Purchase Order ${generatedCode}`} ELSE name END,
                   is_provisional = false,
                   draft_expires_at = NULL,
                   status_changed_at = now(),
                   status_changed_by = ${principalId}::uuid,
                   updated_at = now(),
                   updated_by = ${principalId}::uuid,
                   row_version = row_version + 1
             WHERE tenant_id = ${tenantId}::uuid
               AND id = ${recordId}::uuid
               AND status = 'draft'
             RETURNING *
          `.execute(trx);
          const updated = updatedResult.rows[0];
          if (!updated) return null;

          await syncLifecycleInstanceForStatus({
            db: trx as never,
            tenantId,
            entityName: "purchase_order",
            entityId: recordId,
            status: "pending_approval",
            actorId: principalId,
            payload: updated,
            logger,
          });

          if (transitionId) {
            await runLifecycleHooks(trx as never, {
              tenantId,
              transitionId,
              sourceDocType: "purchase_order",
              sourceDocId: recordId,
              principalId,
              timing: "after",
              fromStatus: "draft",
              toStatus: "pending_approval",
              operationCode: lifecycleTransition.operation_code,
            });
          }

          await emitOutboxEvent(trx as never, {
            tenantId,
            topic: "purchase_order.lifecycle",
            eventType: "purchase_order.submitted",
            eventKey: `purchase_order.submitted:${recordId}:${request.id}`,
            entityType: "purchase_order",
            entityId: recordId,
            aggregateType: "commitment",
            aggregateId: recordId,
            actorId: principalId,
            payload: {
              public_entity_type: "purchase_order",
              aggregate_root_type: "commitment",
              commitment_type: "purchase_order",
              aggregate_root_id: recordId,
              workflow_request_id: request.id,
              from_status: "draft",
              to_status: "pending_approval",
            },
          });
          return { updated, request, preflight: txPreflight };
        });

        if (!submitted) {
          res.status(409).json({ error: "CONFLICT", message: "Purchase order was modified before submission." });
          return;
        }
        res.json({ ok: true, record: submitted.updated, workflow_request_id: submitted.request.id, warnings: submitted.preflight.warnings });
        return;
      }

      // ── Dispatch: payment_entry lifecycle handlers (GL-aware) ─────────────────
      if (entityCode === "payment_entry") {
        if (target === "post") {
          const { status, body: respBody } = await handlePostPayment(
            db, tenantId, recordId, principalId, logger, lifecycleSync,
          );
          if (status === 200) logger?.info("action_dispatch_post_payment", { tenantId, recordId });
          res.status(status).json(respBody);
          return;
        }
        if (target === "submit") {
          const { status, body: respBody } = await handleSubmitPayment(
            db, tenantId, recordId, principalId, logger, lifecycleSync,
          );
          if (status === 200) logger?.info("action_dispatch_submit_payment", { tenantId, recordId });
          res.status(status).json(respBody);
          return;
        }
        if (target === "void") {
          const { status, body: respBody } = await handleVoidPayment(
            db, tenantId, recordId, principalId, body, logger, lifecycleSync,
          );
          if (status === 200) logger?.info("action_dispatch_void_payment", { tenantId, recordId });
          res.status(status).json(respBody);
          return;
        }
      }

      // ── Dispatch: purchase_invoice hold / release_hold (Model A) ──────────────
      // status='on_hold' is the authoritative hold flag; the previous status is
      // captured into metadata.hold so release can restore it. We bypass the
      // generic transition path so the metadata write happens atomically with
      // the status flip.
      if (entityCode === "purchase_invoice" && target === "hold") {
        if (!principalId) {
          res.status(403).json({ error: "PRINCIPAL_NOT_FOUND", message: "No principal bound to this session." });
          return;
        }
        const holdReason = (typeof body["hold_reason"] === "string" ? body["hold_reason"] : "")
          || (remarks ?? "");
        if (!holdReason.trim()) {
          res.status(400).json({ error: "HOLD_REASON_REQUIRED", message: "A hold reason is required." });
          return;
        }
        try {
          const result = await placeInvoiceOnHold(db, tenantId, recordId, principalId, holdReason);
          logger?.info("action_dispatch_hold_invoice", {
            tenantId, recordId, from: result.previous_status, to: result.status,
          });
          res.json({ ok: true, status: result.status, previous_status: result.previous_status });
        } catch (err) {
          if (err instanceof HoldNotAllowedError) {
            res.status(422).json({ error: err.code, message: err.message });
            return;
          }
          throw err;
        }
        return;
      }

      if (entityCode === "purchase_invoice" && target === "release_hold") {
        if (!principalId) {
          res.status(403).json({ error: "PRINCIPAL_NOT_FOUND", message: "No principal bound to this session." });
          return;
        }
        try {
          const result = await releaseInvoiceHold(db, tenantId, recordId, principalId);
          logger?.info("action_dispatch_release_hold_invoice", {
            tenantId, recordId, to: result.status,
          });
          res.json({ ok: true, status: result.status });
        } catch (err) {
          if (err instanceof ReleaseNotAllowedError) {
            res.status(422).json({ error: err.code, message: err.message });
            return;
          }
          throw err;
        }
        return;
      }

      // ── Dispatch: journal_entry reverse (full accounting reversal) ────────────
      // The generic copy/reverse path below would just clone the header row,
      // which isn't a valid accounting reversal: je_number must be regenerated,
      // lines must be cloned with debit/credit swapped, the source must be
      // marked status='reversed', and reversed_by_id wired up. Delegate to the
      // dedicated finance handler that does all of that inside one transaction.
      if (entityCode === "journal_entry" && (target === "reverse" || target === "reverse_document")) {
        const actorId = principalId ?? SYSTEM_PRINCIPAL_UUID;
        const { status, body: respBody } = await handleReverseJournalEntry(
          db, tenantId, recordId, actorId, body, logger,
        );
        if (status >= 200 && status < 300) {
          logger?.info("action_dispatch_reverse_journal_entry", { tenantId, recordId });
        }
        res.status(status).json(respBody);
        return;
      }

      if (target === "copy") {
        const actorId = principalId ?? SYSTEM_PRINCIPAL_UUID;
        const copied = await copyRecordFromMetadata(db, tenantId, entityCode, recordId, actorId, logger);
        logger?.info("action_dispatch_copy_metadata", { entity: entityCode, tenantId, recordId, newId: copied.id });
        res.status(201).json({ ok: true, newRecord: { id: copied.id }, record: copied.record, copiedChildren: copied.copiedChildren });
        return;
      }

      // ── Dispatch: status transition ───────────────────────────────────────────
      let targetStatus = lifecycleTransition?.to_state ?? TARGET_STATUS[target];
      if (entityCode === "purchase_order") {
        const command = target === "PO.PLACE_ORDER".toLowerCase() ? "place_order" : target;
        const policy = evaluatePurchaseOrderTransition(record, command, now);
        if (!policy.allowed) {
          res.status(422).json({ error: policy.code, message: policy.message });
          return;
        }
        targetStatus = policy.targetStatus ?? targetStatus;
      }
      if (targetStatus) {
        if (currentStatus === targetStatus) {
          // Idempotent — already in target state
          res.json({ ok: true, record });
          return;
        }

        const { allowed, reason } = await isTransitionAllowed(
          db, entityCode, tenantId, currentStatus, targetStatus,
        );

        if (!allowed) {
          res.status(422).json({ error: "TRANSITION_NOT_ALLOWED", message: reason ?? `Cannot transition from ${currentStatus} to ${targetStatus}` });
          return;
        }

        if (entityCode === "journal_entry" && targetStatus === "posted" && !principalId) {
          res.status(403).json({ error: "PRINCIPAL_NOT_FOUND", message: "no principal bound to this session" });
          return;
        }

        const isProvisionalPurchaseOrder = entityCode === "purchase_order"
          && record["is_provisional"] === true
          && targetStatus !== "draft";
        const provisionalDocumentDate = isProvisionalPurchaseOrder
          ? normalizeDateOnly(record["document_date"])
          : null;
        if (isProvisionalPurchaseOrder) {
          const missing = [
            !record["company_code_id"] ? "company_code_id" : null,
            !record["party_id"] ? "party_id" : null,
            !record["order_type"] ? "order_type" : null,
            !provisionalDocumentDate ? "document_date" : null,
            !record["currency_code"] ? "currency_code" : null,
            !record["requested_by"] ? "requested_by" : null,
          ].filter((value): value is string => Boolean(value));
          if (missing.length > 0) {
            res.status(422).json({
              error: "DRAFT_PROMOTION_VALIDATION_FAILED",
              message: "Required fields are missing before this Purchase Order can be submitted.",
              fields: missing,
            });
            return;
          }
        }

        const transitionPatch: Record<string, unknown> = {
          status:            targetStatus,
          status_changed_at: now,
          status_changed_by: principalId,
          updated_at:        now,
          updated_by:        principalId,
          ...(remarks && entityCode !== "purchase_order" ? { notes: remarks } : {}),
        };
        if (entityCode === "purchase_order" && target === "hold") {
          transitionPatch["metadata"] = sql`
            COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
              'lifecycle_hold', jsonb_build_object(
                'previous_status', ${currentStatus},
                'reason', ${remarks ?? String(body["hold_reason"] ?? "")},
                'held_at', now(),
                'held_by', ${principalId ?? SYSTEM_PRINCIPAL_UUID}::uuid
              )
            )
          `;
        } else if (entityCode === "purchase_order" && target === "release_hold") {
          transitionPatch["metadata"] = sql`
            (COALESCE(metadata, '{}'::jsonb) - 'lifecycle_hold') || jsonb_build_object(
              'last_hold_release', jsonb_build_object(
                'released_at', now(),
                'released_by', ${principalId ?? SYSTEM_PRINCIPAL_UUID}::uuid
              )
            )
          `;
        }
        if (entityCode === "journal_entry" && targetStatus === "posted") {
          transitionPatch["posted_at"] = now;
          transitionPatch["posted_by"] = principalId;
        }

        // Review R2 Fix 2 — invoke the LifecycleHookRunner around the
        // state mutation. Required hook failures (BEFORE or AFTER) throw
        // from the runner, abort the transaction, and surface as 422
        // REQUIRED_HOOK_FAILED. AFTER hooks run inside the same TX so
        // side effects (JE writes via transaction_flow.dispatch, activity
        // log) commit atomically with the status change.
        let updated: Record<string, unknown> | undefined;
        if (lifecycleTransition) {
          try {
            const transitioned = await executeLifecycleTransition({
              db,
              tenantId,
              entityCode,
              recordId,
              operationCode: lifecycleTransition.operation_code,
              principalId,
              operationPayload: body,
              expectedCurrentStatus: currentStatus,
              recordPatch: transitionPatch,
              logger,
              prepare: async ({ db: trx, record: lockedRecord, transition }) => {
                const recordPatch: Record<string, unknown> = {};
                if (isProvisionalPurchaseOrder) {
                  const numberResult = await sql<{ value: string | null }>`
                    SELECT control.next_entity_number(
                      ${tenantId}::uuid,
                      'purchase_order'::text,
                      'code'::text,
                      ${String(lockedRecord["company_code_id"])}::uuid,
                      NULL::smallint,
                      NULL::smallint,
                      NULL,
                      ${provisionalDocumentDate!}::date
                    ) AS value
                  `.execute(trx);
                  const generated = numberResult.rows[0]?.value
                    ?? `PO-${new Date().toISOString().slice(0, 7).replace("-", "")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
                  recordPatch["code"] = generated;
                  recordPatch["name"] = String(lockedRecord["name"] ?? "").trim()
                    || `Purchase Order ${generated}`;
                  recordPatch["is_provisional"] = false;
                  recordPatch["draft_expires_at"] = null;
                }

                if (entityCode === "purchase_order" && code === "withdraw") {
                  const workflowRequestId = lockedRecord["workflow_request_id"];
                  if (typeof workflowRequestId === "string" && isUuid(workflowRequestId)) {
                    await sql`
                      UPDATE document.workflow_request
                         SET status = 'canceled', updated_at = now(),
                             updated_by = ${principalId}::uuid
                       WHERE tenant_id = ${tenantId}::uuid
                         AND id = ${workflowRequestId}::uuid
                         AND status = 'pending'
                    `.execute(trx);
                    await sql`
                      UPDATE event.work_item
                         SET status = 'skipped', completed_at = now(), updated_at = now(),
                             updated_by = ${principalId}::uuid
                       WHERE tenant_id = ${tenantId}::uuid
                         AND workflow_request_id = ${workflowRequestId}::uuid
                         AND status IN ('pending','assigned','in_progress')
                    `.execute(trx);
                  }
                  recordPatch["workflow_request_id"] = null;
                }

                if (entityCode === "purchase_order"
                  && ["cancelled", "expired", "closed"].includes(transition.toStatus)) {
                  const lineStatus = transition.toStatus === "closed" ? "closed" : "cancelled";
                  await sql`
                    UPDATE document.commitment_line
                       SET status = ${lineStatus}, updated_at = now(), updated_by = ${principalId}::uuid
                     WHERE tenant_id = ${tenantId}::uuid
                       AND commitment_id = ${recordId}::uuid
                       AND status NOT IN ('closed','cancelled')
                  `.execute(trx);
                  await sql`
                    UPDATE document.schedule_line
                       SET is_current_version = false,
                           terminal_status = CASE WHEN ${transition.toStatus} = 'closed' THEN 'CLOSED' ELSE 'CANCELED' END,
                           updated_at = now(), updated_by = ${principalId}::uuid
                     WHERE tenant_id = ${tenantId}::uuid
                       AND source_doc_type = 'commitment_line'
                       AND source_doc_id = ${recordId}::uuid
                       AND is_current_version = true
                       AND terminal_status IS NULL
                  `.execute(trx);
                }
                return { recordPatch };
              },
            });
            logger?.info("action_dispatch_transition", {
              entity: entityCode, tenantId, recordId, code,
              from: transitioned.fromStatus, to: transitioned.toStatus,
            });
            res.json({ ok: true, record: transitioned.record });
            return;
          } catch (err) {
            if (!(err instanceof LifecycleTransitionError)) throw err;
            logger?.warn("action_dispatch_lifecycle_transition_failed", {
              entity: entityCode, tenantId, recordId, operation: code, error: err.code,
            });
            res.status(err.status).json({
              error: err.code,
              message: err.message,
              ...(err.details ? { details: err.details } : {}),
            });
            return;
          }
        }
        try {
          updated = await db.transaction().execute(async (trx) => {
            const effectiveTransitionPatch = { ...transitionPatch };
            if (isProvisionalPurchaseOrder) {
              const numberResult = await sql<{ value: string | null }>`
                SELECT control.next_entity_number(
                  ${tenantId}::uuid,
                  'purchase_order'::text,
                  'code'::text,
                  ${String(record["company_code_id"])}::uuid,
                  NULL::smallint,
                  NULL::smallint,
                  NULL,
                  ${provisionalDocumentDate!}::date
                ) AS value
              `.execute(trx);
              const generated = numberResult.rows[0]?.value
                ?? `PO-${new Date().toISOString().slice(0, 7).replace("-", "")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
              effectiveTransitionPatch["code"] = generated;
              effectiveTransitionPatch["name"] = String(record["name"] ?? "").trim()
                || `Purchase Order ${generated}`;
              effectiveTransitionPatch["is_provisional"] = false;
              effectiveTransitionPatch["draft_expires_at"] = null;
            }
            if (entityCode === "purchase_order" && code === "withdraw") {
              const workflowRequestId = record["workflow_request_id"];
              if (typeof workflowRequestId === "string" && isUuid(workflowRequestId)) {
                await sql`
                  UPDATE document.workflow_request
                     SET status = 'canceled', updated_at = now(),
                         updated_by = ${principalId ?? SYSTEM_PRINCIPAL_UUID}::uuid
                   WHERE tenant_id = ${tenantId}::uuid
                     AND id = ${workflowRequestId}::uuid
                     AND status = 'pending'
                `.execute(trx);
                await sql`
                  UPDATE event.work_item
                     SET status = 'skipped', completed_at = now(), updated_at = now(),
                         updated_by = ${principalId ?? SYSTEM_PRINCIPAL_UUID}::uuid
                   WHERE tenant_id = ${tenantId}::uuid
                     AND workflow_request_id = ${workflowRequestId}::uuid
                     AND status IN ('pending','assigned','in_progress')
                `.execute(trx);
              }
              effectiveTransitionPatch["workflow_request_id"] = null;
            }

            if (entityCode === "purchase_order"
              && ["cancelled", "expired", "closed"].includes(targetStatus)) {
              const lineStatus = targetStatus === "cancelled" || targetStatus === "expired"
                ? "cancelled"
                : "closed";
              await sql`
                UPDATE document.commitment_line
                   SET status = ${lineStatus}, updated_at = now(),
                       updated_by = ${principalId ?? SYSTEM_PRINCIPAL_UUID}::uuid
                 WHERE tenant_id = ${tenantId}::uuid
                   AND commitment_id = ${recordId}::uuid
                   AND status NOT IN ('closed','cancelled')
              `.execute(trx);
              await sql`
                UPDATE document.schedule_line
                   SET is_current_version = false,
                       terminal_status = CASE WHEN ${targetStatus} = 'closed' THEN 'CLOSED' ELSE 'CANCELED' END,
                       updated_at = now(), updated_by = ${principalId ?? SYSTEM_PRINCIPAL_UUID}::uuid
                 WHERE tenant_id = ${tenantId}::uuid
                   AND source_doc_type = 'commitment_line'
                   AND source_doc_id = ${recordId}::uuid
                   AND is_current_version = true
                   AND terminal_status IS NULL
              `.execute(trx);
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let transitionQuery = (trx.updateTable(fullTable) as any)
              .set(effectiveTransitionPatch)
            transitionQuery = scopeActionRecord(transitionQuery, entityRow, tenantId, recordId)
              .where("status", "=", currentStatus); // optimistic lock
            const row = await transitionQuery.returningAll().executeTakeFirst() as Record<string, unknown> | undefined;

            if (!row) return undefined;

            const sync = await syncLifecycleInstanceForStatus({
              db: trx as never,
              tenantId,
              entityName: entityCode,
              entityId: recordId,
              status: targetStatus,
              actorId: principalId ?? SYSTEM_PRINCIPAL_UUID,
              payload: row,
              logger,
            });
            if (!sync.synced) {
              logger?.warn("action_dispatch_lifecycle_instance_sync_skipped", {
                entity: entityCode,
                tenantId,
                recordId,
                status: targetStatus,
                reason: sync.reason,
              });
            }

            return row;
          });
        } catch (err) {
          if (err instanceof Error && /hook .* failed \(required\)/.test(err.message)) {
            logger?.warn("action_dispatch_required_hook_failed", {
              entity: entityCode, tenantId, recordId,
              from: currentStatus, to: targetStatus,
              error: err.message,
            });
            res.status(422).json({
              error:   "REQUIRED_HOOK_FAILED",
              message: err.message,
            });
            return;
          }
          throw err;
        }

        if (!updated) {
          res.status(409).json({ error: "CONFLICT", message: "Record was modified by another process. Please retry." });
          return;
        }

        logger?.info("action_dispatch_transition", {
          entity: entityCode, tenantId, recordId, code, from: currentStatus, to: targetStatus,
        });

        res.json({ ok: true, record: updated });
        return;
      }

      // ── Dispatch: deactivate ──────────────────────────────────────────────────
      if (target === "deactivate") {
        // Deactivation is an operational availability flag, not a lifecycle state transition.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let deactivateQuery = (db.updateTable(fullTable) as any)
          .set({ is_active: false, updated_at: now, updated_by: principalId })
        deactivateQuery = scopeActionRecord(deactivateQuery, entityRow, tenantId, recordId);
        const updated = await deactivateQuery.returningAll().executeTakeFirst() as Record<string, unknown> | undefined;

        logger?.info("action_dispatch_deactivate", { entity: entityCode, tenantId, recordId });
        res.json({ ok: true, record: updated ?? record });
        return;
      }

      // ── Dispatch: copy / reverse ──────────────────────────────────────────────
      if (target === "reverse") {
        // Exclude system columns that must be fresh on the new record
        const EXCLUDE_COLS = new Set([
          "id", "tenant_id", "created_at", "created_by",
          "updated_at", "updated_by", "status_changed_at", "status_changed_by",
          "deleted_at", "deleted_by",
        ]);
        EXCLUDE_COLS.add(entityRow.primary_key);
        if (entityRow.tenant_column) EXCLUDE_COLS.add(entityRow.tenant_column);

        // Generated columns (e.g. is_active, net_amount) reject any value on
        // INSERT — discover and skip them per-table at runtime.
        const generatedCols = await getGeneratedColumns(
          db, entityRow.table_schema as string, entityRow.table_name as string,
        );

        const copyData: Record<string, unknown> = {};
        for (const [col, val] of Object.entries(record)) {
          if (!EXCLUDE_COLS.has(col) && !generatedCols.has(col)) {
            copyData[col] = val;
          }
        }

        // Reset to draft state. Lifecycle status values are stored lowercase
        // (e.g. 'draft', 'posted'); DB triggers like document.trg_je_status_insert_guard
        // enforce that any new row starts in 'draft' (not 'DRAFT').
        copyData["status"]     = "draft";
        if (entityRow.tenant_column) copyData[entityRow.tenant_column] = tenantId;
        copyData["created_by"] = principalId;
        if (isUuid(String(record[entityRow.primary_key] ?? ""))) {
          copyData[entityRow.primary_key] = randomUUID();
        }

        // For reverse: link back to original if the column exists
        if (target === "reverse" && Object.prototype.hasOwnProperty.call(record, "reversed_from_id")) {
          copyData["reversed_from_id"] = recordId;
        }

        const newRecord = await db
          .insertInto(fullTable)
          .values(copyData as never)
          .returningAll()
          .executeTakeFirst() as Record<string, unknown>;

        const newRecordId = newRecord[entityRow.primary_key];
        logger?.info(`action_dispatch_${target}`, { entity: entityCode, tenantId, recordId, newId: newRecordId });
        res.status(201).json({ ok: true, newRecord: { id: newRecordId } });
        return;
      }

      // ── Dispatch: MODAL flow handlers (handler_target = 'flow:<code>') ────────
      if (target.startsWith("flow:")) {
        const flowCode = target.slice("flow:".length);

        if (flowCode === "promote_proforma") {
          const { status, body: respBody } = await handlePromoteProforma(
            db, tenantId, recordId, principalId, body, logger,
          );
          if (status === 200) {
            logger?.info("action_dispatch_promote_proforma", { entity: entityCode, tenantId, recordId });
          }
          res.status(status).json(respBody);
          return;
        }

        if (flowCode === "run_matching") {
          const result = await matchInvoice(db, tenantId, recordId, principalId, logger);
          logger?.info("action_dispatch_run_matching", { entity: entityCode, tenantId, recordId, matchStatus: result.invoiceStatus });
          // invoiceStatus "no_match" = non-PO invoice; DB match_status column = "unmatched".
          const dbMatchStatus = result.invoiceStatus === "no_match" ? "unmatched" : result.invoiceStatus;
          res.json({
            ok:           true,
            match_type:   result.invoiceStatus === "no_match" ? "no_match" : null,
            match_status: dbMatchStatus,
            line_results: result.lineResults,
            exceptions:   result.exceptions,
          });
          return;
        }

        logger?.warn("action_dispatch_unknown_flow_handler", { entity: entityCode, code, flowCode });
        res.status(400).json({
          error:   "UNKNOWN_FLOW_HANDLER",
          message: `No server handler registered for flow operation '${flowCode}'`,
        });
        return;
      }

      // ── Unknown handler_target ─────────────────────────────────────────────────
      logger?.warn("action_dispatch_unknown_target", { entity: entityCode, code, target });
      res.status(400).json({ error: "UNKNOWN_ACTION", message: `Action target '${target}' is not handled` });

    } catch (err) {
      logger?.error("action_dispatch_error", { err: String(err) });
      next(err);
    }
  };

  // Dual-mount: canonical + legacy alias. The legacy /records/* mount stays
  // until the client cleanup track migrates all callers to runtimePath.action(...).
  router.post("/runtime/v1/entities/:entity/:id/action/:code", handler);
  router.post("/records/:entity/:id/action/:code",             handler);

  return router;
}

function isWorkflowTaskDecision(operationCode: string, categoryCode: string): boolean {
  return categoryCode === "workflow" && WORKFLOW_TASK_DECISIONS.has(operationCode);
}

function normalizeDateOnly(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function requireAllowedPermission(
  result: Awaited<ReturnType<typeof checkPermission>>,
  res: Response,
): boolean {
  if (result.decision === "allow") return true;

  const statusCode = result.decision === "not_in_plan" || result.decision === "addon_required"
    ? 402
    : 403;

  res.status(statusCode).json({
    error: "PERMISSION_DENIED",
    decision: result.decision,
    reason: result.reason,
    message: permissionDecisionMessage(result.decision, result.reason),
  });
  return false;
}

function permissionDecisionMessage(decision: string, reason: string): string {
  if (decision === "not_in_plan") return "This permission is not included in the current subscription plan";
  if (decision === "addon_required") return "An add-on subscription is required for this permission";
  if (reason === "explicit_deny") return "Access explicitly denied";
  return "Permission not granted";
}

function readConfigBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["true", "t", "yes", "y", "1", "enabled", "on"].includes(normalized)) return true;
  if (["false", "f", "no", "n", "0", "disabled", "off"].includes(normalized)) return false;
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
