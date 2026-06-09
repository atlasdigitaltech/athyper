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
 *   3. Dispatch based on handler_target:
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

import type { Request, RequestHandler, Response, Router } from "express";
import { sql, type Kysely } from "kysely";
import {
  verifyBearer,
  isUuid,
  resolveTenantId,
  resolvePrincipalIdOrNull,
  extractOrgHeaders,
  SYSTEM_PRINCIPAL_UUID,
} from "@athyper/svc-shared";
import { handlePromoteProforma } from "@athyper/svc-business";
import { handleSubmitForApproval } from "@athyper/svc-business";
import { handlePostInvoice }      from "@athyper/svc-business";
import { handleReverseInvoice }   from "@athyper/svc-business";
import { matchInvoice }           from "@athyper/svc-business";
import {
  handlePostPayment,
  handleSubmitPayment,
  handleVoidPayment,
} from "@athyper/svc-business";
import type { BusinessLifecycleSyncHook } from "@athyper/svc-business";
import { checkPermission } from "@athyper/svc-iam";
import type { CacheClient } from "@athyper/svc-iam";
import { createFeatureFlagService } from "@athyper/svc-platform";
import {
  createWorkflowLifecycleRuntime,
  syncLifecycleInstanceForStatus,
  type OperationResult,
  type WorkflowRuntimeFeatureFlags,
} from "@athyper/svc-workflow";
import { handleReverseJournalEntry } from "@athyper/svc-finance";
import { copyRecordFromMetadata } from "../copy-record.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

interface NotificationQueue {
  add(
    name: string,
    data: { messageId: string; tenantId: string },
    opts?: Record<string, unknown>,
  ): Promise<unknown>;
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
  cache?: CacheClient;
  featureFlags?: WorkflowRuntimeFeatureFlags;
  notificationQueue?: NotificationQueue;
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
  to_state: string;
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
      "ts.code as to_state",
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
    .executeTakeFirst() as { to_state: string; config: unknown } | undefined;

  if (!row) return null;
  const config = asRecord(row.config);
  return {
    to_state: row.to_state,
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

const PURCHASE_INVOICE_LIFECYCLE_CHANGED = "purchase_invoice.lifecycle.changed";
const NOTIFICATION_CHANNELS = new Set(["in_app", "email", "sms", "push", "webhook", "whatsapp"]);

function normalizeNotificationChannels(value: unknown): string[] {
  if (!Array.isArray(value)) return ["in_app"];
  const channels = value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v && NOTIFICATION_CHANNELS.has(v));
  const unique = [...new Set(channels)];
  return unique.length > 0 ? unique : ["in_app"];
}

function notificationTextArray(values: string[]) {
  return sql`ARRAY[${sql.join(values)}]::text[]`;
}

async function enqueuePendingNotification(
  db: AnyDb,
  queue: NotificationQueue | undefined,
  tenantId: string,
  messageId: string,
  logger?: ActionDispatcherDeps["logger"],
): Promise<void> {
  if (!queue) return;

  try {
    await sql`
      UPDATE event.notification_message
      SET    status = 'planning', updated_at = now()
      WHERE  id = ${messageId}::uuid
        AND  tenant_id = ${tenantId}::uuid
        AND  status = 'pending'
    `.execute(db);

    await queue.add(
      "send",
      { messageId, tenantId },
      {
        jobId:            `notif-${messageId}`,
        attempts:         3,
        backoff:          { type: "exponential", delay: 60_000 },
        removeOnComplete: { count: 500 },
        removeOnFail:     { count: 200 },
      },
    );
  } catch (err) {
    await sql`
      UPDATE event.notification_message
      SET    status = 'pending', updated_at = now()
      WHERE  id = ${messageId}::uuid
        AND  tenant_id = ${tenantId}::uuid
        AND  status = 'planning'
    `.execute(db).catch(() => undefined);
    logger?.warn("purchase_invoice_notification_enqueue_failed", { messageId, err: String(err) });
  }
}

async function emitPurchaseInvoiceLifecycleNotification(
  db: AnyDb,
  opts: {
    notificationQueue?: NotificationQueue;
    tenantId: string;
    actorId: string;
    recordId: string;
    fromStatus: string;
    toStatus: string;
    record: Record<string, unknown>;
    logger?: ActionDispatcherDeps["logger"];
  },
): Promise<void> {
  const rules = await sql<{
    id: string;
    template_key: string;
    channels: string[] | null;
    recipient_rules: Record<string, unknown> | null;
  }>`
    SELECT id, template_key, channels, recipient_rules
    FROM   control.notification_routing_rule
    WHERE  (tenant_id IS NULL OR tenant_id = ${opts.tenantId}::uuid)
      AND  event_type = ${PURCHASE_INVOICE_LIFECYCLE_CHANGED}
      AND  is_enabled = true
      AND  (entity_type IS NULL OR entity_type = 'purchase_invoice')
      AND  (lifecycle_state IS NULL OR lifecycle_state = ${opts.toStatus})
      AND  workflow_phase IS NULL
    ORDER BY sort_order ASC
  `.execute(db);

  const docNo = String(
    opts.record["invoice_number"]
      ?? opts.record["purchase_invoice_number"]
      ?? opts.record["document_number"]
      ?? opts.recordId,
  );

  for (const rule of rules.rows) {
    const explicitIds = Array.isArray(rule.recipient_rules?.["explicit_ids"])
      ? (rule.recipient_rules?.["explicit_ids"] as unknown[]).filter((id): id is string => typeof id === "string" && isUuid(id))
      : [];
    const actorRecipient = rule.recipient_rules?.["actor"] === true ? [opts.actorId] : [];
    const recipients = [...new Set([...explicitIds, ...actorRecipient])];
    if (recipients.length === 0) continue;

    const channels = normalizeNotificationChannels(rule.channels);
    for (const recipientId of recipients) {
      const payload = {
        recipient_id:    recipientId,
        actor_id:        opts.actorId,
        entity_type:     "purchase_invoice",
        entity_id:       opts.recordId,
        document_number: docNo,
        from_status:     opts.fromStatus,
        to_status:       opts.toStatus,
        lifecycle_state: opts.toStatus,
        title:           "Purchase invoice status changed",
        body:            `Purchase invoice ${docNo} changed from ${opts.fromStatus} to ${opts.toStatus}.`,
        source_plane:    "neon",
      };

      const inserted = await sql<{ id: string }>`
        INSERT INTO event.notification_message
          (tenant_id,    event_id,          event_code,
           rule_id,      template_key,      template_version,
           entity_type,  entity_id,         subject,
           payload,      channels,          priority,
           recipient_count, status,         created_by)
        VALUES
          (${opts.tenantId}::uuid,
           ${`${PURCHASE_INVOICE_LIFECYCLE_CHANGED}:${opts.recordId}:${opts.fromStatus}:${opts.toStatus}`},
           ${PURCHASE_INVOICE_LIFECYCLE_CHANGED},
           ${rule.id}::uuid,
           ${rule.template_key},
           1,
           'purchase_invoice',
           ${opts.recordId}::uuid,
           null,
           ${JSON.stringify(payload)}::jsonb,
           ${notificationTextArray(channels)},
           'normal',
           1,
           'pending',
           ${opts.actorId}::uuid)
        RETURNING id
      `.execute(db);

      const messageId = inserted.rows[0]?.id;
      if (messageId) {
        await enqueuePendingNotification(db, opts.notificationQueue, opts.tenantId, messageId, opts.logger);
      }
    }
  }
}

export function createActionDispatcherRoute(router: Router, deps: ActionDispatcherDeps): Router {
  const { db, auth, logger } = deps;
  const lifecycleSync = createLifecycleSyncHook(logger);
  const featureFlags = deps.featureFlags ?? createFeatureFlagService({
    db,
    redis: createFeatureFlagRedis(deps.cache),
    logger,
  });
  const workflowRuntime = createWorkflowLifecycleRuntime({
    db,
    logger,
    featureFlags,
    checkPermission,
  });

  const handler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const recordId   = String(req.params["id"] ?? "");
      const code       = String(req.params["code"] ?? "").toLowerCase();

      if (!isUuid(recordId)) {
        res.status(400).json({ error: "INVALID_ID", message: "Record id must be a valid UUID" });
        return;
      }

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "X-Org header is required" });
        return;
      }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub ? (await resolvePrincipalIdOrNull(db, sub, tenantId) ?? sub) : null;
      const body    = (req.body ?? {}) as Record<string, unknown>;
      const remarks = typeof body["remarks"] === "string" ? body["remarks"] : undefined;

      if (isPurchaseInvoiceRuntimePilot(entityCode, code)
        && await shouldUseWorkflowRuntime(featureFlags, tenantId, logger)) {
        if (!principalId || !isUuid(principalId)) {
          res.status(403).json({ error: "PRINCIPAL_NOT_FOUND", message: "no principal bound to this session" });
          return;
        }

        const runtimeResult = await workflowRuntime.executeOperation({
          tenantId,
          entityName: entityCode,
          entityId: recordId,
          operationCode: "submit",
          actorId: principalId,
          idempotencyKey: extractIdempotencyKey(req, body, entityCode, recordId, "submit"),
          remarks,
          payload: body,
        });
        sendRuntimeResult(res, runtimeResult);
        return;
      }

      // ── Look up the operation ─────────────────────────────────────────────────
      const operation = await db
        .selectFrom("control.entity_operation as eo")
        .innerJoin("shared.permission as p", "p.code" as never, "eo.permission_code" as never)
        .innerJoin("shared.permission_category as pc", "pc.id" as never, "p.category_id" as never)
        .select([
          "eo.permission_code",
          "eo.handler_type",
          "eo.handler_target",
          "eo.is_record_required",
          "eo.is_enabled",
          "pc.code as permission_category_code",
        ] as never[])
        .where("eo.entity_name" as never, "=", entityCode as never)
        .where("p.status" as never, "=", "active" as never)
        // Match simple code (e.g. "submit") OR qualified code ending in ".code"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .where((eb: any) =>
          eb.or([
            eb("eo.permission_code" as never, "=", code as never),
            eb("eo.permission_code" as never, "like", (`%.${code}`) as never),
          ]),
        )
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
          handler_type: string;
          handler_target: string | null;
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

      if (isWorkflowTaskDecision(operation.permission_code, operation.permission_category_code)) {
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
        .select(["e.table_schema", "e.table_name"])
        .where("e.name", "=", entityCode)
        .where("e.tenant_id", "is", null)
        .executeTakeFirst() as { table_schema: string; table_name: string } | undefined;

      if (!entityRow) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const fullTable = `${entityRow.table_schema}.${entityRow.table_name}` as `${string}.${string}`;

      // ── Fetch current record ──────────────────────────────────────────────────
      const record = await db
        .selectFrom(fullTable)
        .selectAll()
        .where("id" as never, "=", recordId as never)
        .where("tenant_id" as never, "=", tenantId as never)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!record) {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${recordId}' not found` });
        return;
      }

      const target  = (operation.handler_target ?? code).toLowerCase();
      const now     = new Date();
      const currentStatus = String(record["status"] ?? "");
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
      const targetStatus = lifecycleTransition?.to_state ?? TARGET_STATUS[target];
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

        const transitionPatch: Record<string, unknown> = {
          status:            targetStatus,
          status_changed_at: now,
          status_changed_by: principalId,
          updated_at:        now,
          updated_by:        principalId,
          ...(remarks ? { notes: remarks } : {}),
        };
        if (entityCode === "journal_entry" && targetStatus === "posted") {
          transitionPatch["posted_at"] = now;
          transitionPatch["posted_by"] = principalId;
        }

        const updated = await db.transaction().execute(async (trx) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const row = await (trx.updateTable(fullTable) as any)
            .set(transitionPatch)
            .where("id",        "=", recordId)
            .where("tenant_id", "=", tenantId)
            .where("status",    "=", currentStatus) // optimistic lock
            .returningAll()
            .executeTakeFirst() as Record<string, unknown> | undefined;

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

        if (!updated) {
          res.status(409).json({ error: "CONFLICT", message: "Record was modified by another process. Please retry." });
          return;
        }

        logger?.info("action_dispatch_transition", {
          entity: entityCode, tenantId, recordId, code, from: currentStatus, to: targetStatus,
        });

        if (entityCode === "purchase_invoice") {
          await emitPurchaseInvoiceLifecycleNotification(db, {
            notificationQueue: deps.notificationQueue,
            tenantId,
            actorId: principalId,
            recordId,
            fromStatus: currentStatus,
            toStatus: targetStatus,
            record: updated,
            logger,
          }).catch((err) => {
            logger?.warn("purchase_invoice_notification_emit_failed", {
              tenantId,
              recordId,
              from: currentStatus,
              to: targetStatus,
              err: String(err),
            });
          });
        }

        res.json({ ok: true, record: updated });
        return;
      }

      // ── Dispatch: deactivate ──────────────────────────────────────────────────
      if (target === "deactivate") {
        // Deactivation is an operational availability flag, not a lifecycle state transition.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updated = await (db.updateTable(fullTable) as any)
          .set({ is_active: false, updated_at: now, updated_by: principalId })
          .where("id",        "=", recordId)
          .where("tenant_id", "=", tenantId)
          .returningAll()
          .executeTakeFirst() as Record<string, unknown> | undefined;

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
        copyData["tenant_id"]  = tenantId;
        copyData["created_by"] = principalId;

        // For reverse: link back to original if the column exists
        if (target === "reverse" && Object.prototype.hasOwnProperty.call(record, "reversed_from_id")) {
          copyData["reversed_from_id"] = recordId;
        }

        const newRecord = await db
          .insertInto(fullTable)
          .values(copyData as never)
          .returningAll()
          .executeTakeFirst() as Record<string, unknown>;

        logger?.info(`action_dispatch_${target}`, { entity: entityCode, tenantId, recordId, newId: newRecord["id"] });
        res.status(201).json({ ok: true, newRecord: { id: newRecord["id"] } });
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

        if (flowCode === "submit_for_approval") {
          const { status, body: respBody } = await handleSubmitForApproval(
            db, tenantId, recordId, principalId, body, logger, lifecycleSync,
          );
          if (status === 200) {
            logger?.info("action_dispatch_submit_for_approval", { entity: entityCode, tenantId, recordId });
          }
          res.status(status).json(respBody);
          return;
        }

        if (flowCode === "post_invoice") {
          const { status, body: respBody } = await handlePostInvoice(
            db, tenantId, recordId, principalId, body, logger, lifecycleSync,
          );
          if (status === 200) {
            logger?.info("action_dispatch_post_invoice", { entity: entityCode, tenantId, recordId });
          }
          res.status(status).json(respBody);
          return;
        }

        if (flowCode === "reverse_invoice") {
          const { status, body: respBody } = await handleReverseInvoice(
            db, tenantId, recordId, principalId, body, logger, lifecycleSync,
          );
          if (status === 201) {
            logger?.info("action_dispatch_reverse_invoice", { entity: entityCode, tenantId, recordId });
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

  router.post("/records/:entity/:id/action/:code", handler);

  return router;
}

function isWorkflowTaskDecision(permissionCode: string, categoryCode: string): boolean {
  return categoryCode === "workflow" && WORKFLOW_TASK_DECISIONS.has(permissionLeaf(permissionCode));
}

function permissionLeaf(permissionCode: string): string {
  return permissionCode.toLowerCase().split(/[.:_/-]+/).filter(Boolean).at(-1) ?? "";
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

function createFeatureFlagRedis(cache: CacheClient | undefined): {
  get(key: string): Promise<string | null>;
  setex(key: string, seconds: number, value: string): Promise<unknown>;
} {
  if (!cache) {
    return {
      get: async () => null,
      setex: async () => undefined,
    };
  }
  return {
    get: (key) => cache.get(key),
    setex: (key, seconds, value) => cache.set(key, value, "EX", seconds),
  };
}

function isPurchaseInvoiceRuntimePilot(entityCode: string, code: string): boolean {
  return entityCode === "purchase_invoice" && (code === "submit" || code === "submit_for_approval");
}

async function shouldUseWorkflowRuntime(
  featureFlags: WorkflowRuntimeFeatureFlags,
  tenantId: string,
  logger: ActionDispatcherDeps["logger"],
): Promise<boolean> {
  try {
    const flags = await featureFlags.bulkCheck([
      "workflow_runtime.enabled",
      "workflow_runtime.entity.purchase_invoice",
    ], tenantId);
    return flags.get("workflow_runtime.enabled") === true
      && flags.get("workflow_runtime.entity.purchase_invoice") === true;
  } catch (err) {
    logger?.warn("workflow_runtime_feature_flag_error", {
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

function extractIdempotencyKey(
  req: Request,
  body: Record<string, unknown>,
  entityCode: string,
  recordId: string,
  operationCode: string,
): string {
  const header = req.headers["idempotency-key"];
  if (typeof header === "string" && header.trim()) return header.trim();
  if (Array.isArray(header)) {
    const first = header.find((value) => value.trim());
    if (first) return first.trim();
  }
  const bodyKey = body["idempotency_key"];
  if (typeof bodyKey === "string" && bodyKey.trim()) return bodyKey.trim();
  return `${entityCode}:${recordId}:${operationCode}:implicit`;
}

function sendRuntimeResult(res: Response, result: OperationResult): void {
  if (result.ok) {
    res.status(result.statusCode).json({
      ok: true,
      record: result.record,
      workflow_request_id: result.workflowRequestId,
      lifecycle: result.lifecycle,
      ...(result.replayed ? { _replayed: true } : {}),
    });
    return;
  }

  res.status(result.statusCode).json({
    error: result.error?.code ?? "WORKFLOW_RUNTIME_ERROR",
    message: result.error?.message ?? "Workflow runtime operation failed",
    details: result.error?.details,
    ...(result.replayed ? { _replayed: true } : {}),
  });
}
