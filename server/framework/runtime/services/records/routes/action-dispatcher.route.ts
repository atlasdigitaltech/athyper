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
} from "@athyper/svc-shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

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

const TARGET_STATUS: Record<string, string> = {
  submit:   "SUBMITTED",
  approve:  "APPROVED",
  deny:     "REJECTED",
  post:     "POSTED",
  cancel:   "CANCELLED",
  void:     "VOID",
  close:    "CLOSED",
  archive:  "ARCHIVED",
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
  // 1. snapshot.status_route
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

  // 2. control.entity_lifecycle (fallback)
  const binding = await db
    .selectFrom("control.entity_lifecycle as el")
    .innerJoin("master.lifecycle as lc", "lc.id", "el.lifecycle_id")
    .select(["lc.status_graph"] as never[])
    .where("el.entity_name", "=", entityName)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .where((eb: any) =>
      eb.or([
        eb("el.tenant_id" as never, "is", null),
        eb("el.tenant_id" as never, "=", tenantId as never),
      ]),
    )
    .orderBy("el.priority" as never, "asc")
    .limit(1)
    .executeTakeFirst() as { status_graph: Record<string, unknown> | null } | undefined;

  if (binding?.status_graph) {
    const sg = binding.status_graph as Record<string, unknown>;
    const map = sg["allowed_transitions"] as Record<string, string[]> | undefined;
    if (map) {
      const allowed = map[fromStatus] ?? [];
      if (!allowed.includes(targetStatus)) {
        return { allowed: false, reason: `Transition ${fromStatus}→${targetStatus} not in lifecycle` };
      }
    }
  }

  // 3. No lifecycle gate — open
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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updated = await (db.updateTable(fullTable) as any)
          .set({
            status:            targetStatus,
            status_changed_at: now,
            status_changed_by: principalId,
            updated_at:        now,
            updated_by:        principalId,
            ...(remarks ? { last_remark: remarks } : {}),
          })
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
      if (target === "copy" || target === "reverse") {
        // Exclude system columns that must be fresh on the new record
        const EXCLUDE_COLS = new Set([
          "id", "tenant_id", "created_at", "created_by",
          "updated_at", "updated_by", "status_changed_at", "status_changed_by",
          "deleted_at", "deleted_by",
        ]);

        const copyData: Record<string, unknown> = {};
        for (const [col, val] of Object.entries(record)) {
          if (!EXCLUDE_COLS.has(col)) {
            copyData[col] = val;
          }
        }

        // Reset to DRAFT state
        copyData["status"]     = "DRAFT";
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
