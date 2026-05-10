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

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import {
  verifyBearer,
  isUuid,
  resolveTenantId,
  resolvePrincipalIdOrNull,
  extractOrgHeaders,
  SYSTEM_PRINCIPAL_UUID,
} from "@athyper/svc-shared";
import { handlePromoteProforma } from "../../business/ap/promote-proforma.handler.js";
import { handleSubmitForApproval } from "../../business/ap/invoice-submit.handler.js";
import { handlePostInvoice }      from "../../business/ap/invoice-posting.service.js";
import { handleReverseInvoice }   from "../../business/ap/invoice-posting.service.js";
import { matchInvoice }           from "../../business/ap/invoice-match.service.js";
import {
  handlePostPayment,
  handleSubmitPayment,
  handleVoidPayment,
} from "../../business/ap/payment-posting.service.js";
import { handleReverseJournalEntry } from "../../finance/routes/journal.route.js";
import { copyRecordFromMetadata } from "../copy-record.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

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
};

// ─── Lifecycle helpers (inline — mirrors bulk-action.route.ts) ─────────────────

interface StatusRouteCompiled {
  allowed_transitions: Record<string, string[]>;
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
  const { db, auth, logger } = deps;

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

      // ── Look up the operation ─────────────────────────────────────────────────
      const operation = await db
        .selectFrom("control.entity_operation as eo")
        .select([
          "eo.handler_type",
          "eo.handler_target",
          "eo.is_record_required",
          "eo.is_enabled",
        ] as never[])
        .where("eo.entity_name" as never, "=", entityCode as never)
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
          handler_type: string;
          handler_target: string | null;
          is_record_required: boolean;
          is_enabled: boolean;
        } | undefined;

      if (!operation) {
        res.status(404).json({ error: "OPERATION_NOT_FOUND", message: `Operation '${code}' not found for entity '${entityCode}'` });
        return;
      }

      if (!operation.is_enabled) {
        res.status(403).json({ error: "OPERATION_DISABLED", message: `Operation '${code}' is disabled` });
        return;
      }

      // Frontend-only operations should not reach here
      if (operation.handler_type === "NAVIGATE" || operation.handler_type === "INLINE") {
        res.status(400).json({ error: "FRONTEND_ONLY", message: `Operation '${code}' is a frontend-only action` });
        return;
      }

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

      const body    = (req.body ?? {}) as Record<string, unknown>;
      const remarks = typeof body["remarks"] === "string" ? body["remarks"] : undefined;
      const target  = (operation.handler_target ?? code).toLowerCase();
      const now     = new Date();

      // ── Dispatch: payment_entry lifecycle handlers (GL-aware) ─────────────────
      if (entityCode === "payment_entry") {
        if (target === "post") {
          const { status, body: respBody } = await handlePostPayment(db, tenantId, recordId, principalId, logger);
          if (status === 200) logger?.info("action_dispatch_post_payment", { tenantId, recordId });
          res.status(status).json(respBody);
          return;
        }
        if (target === "submit") {
          const { status, body: respBody } = await handleSubmitPayment(db, tenantId, recordId, principalId, logger);
          if (status === 200) logger?.info("action_dispatch_submit_payment", { tenantId, recordId });
          res.status(status).json(respBody);
          return;
        }
        if (target === "void") {
          const { status, body: respBody } = await handleVoidPayment(db, tenantId, recordId, principalId, body, logger);
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
      const targetStatus = TARGET_STATUS[target];
      if (targetStatus) {
        const currentStatus = String(record["status"] ?? "");

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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updated = await (db.updateTable(fullTable) as any)
          .set(transitionPatch)
          .where("id",        "=", recordId)
          .where("tenant_id", "=", tenantId)
          .where("status",    "=", currentStatus) // optimistic lock
          .returningAll()
          .executeTakeFirst() as Record<string, unknown> | undefined;

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
            db, tenantId, recordId, principalId, body, logger,
          );
          if (status === 200) {
            logger?.info("action_dispatch_submit_for_approval", { entity: entityCode, tenantId, recordId });
          }
          res.status(status).json(respBody);
          return;
        }

        if (flowCode === "post_invoice") {
          const { status, body: respBody } = await handlePostInvoice(
            db, tenantId, recordId, principalId, body, logger,
          );
          if (status === 200) {
            logger?.info("action_dispatch_post_invoice", { entity: entityCode, tenantId, recordId });
          }
          res.status(status).json(respBody);
          return;
        }

        if (flowCode === "reverse_invoice") {
          const { status, body: respBody } = await handleReverseInvoice(
            db, tenantId, recordId, principalId, body, logger,
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
