/**
 * Bulk Action Routes — Sprint 39
 *
 *   POST /api/records/:entity/bulk-action
 *
 * Applies a single action to a batch of entity records (up to BULK_MAX_IDS per request).
 *
 * Supported actions:
 *
 *   status_transition
 *     Body: { action: "status_transition", ids: string[], targetStatus: string }
 *     For each ID:
 *       1. Fetch current status from the entity table.
 *       2. Check whether the transition is allowed:
 *          a. Primary:  snapshot.status_route (compiled route map for this entity + tenant)
 *          b. Fallback: control.entity_lifecycle (lifecycle binding for this entity)
 *          c. If neither exists: transition is permitted (unstructured entity — no lifecycle gate)
 *       3. Apply UPDATE if allowed; record reason if blocked.
 *     Returns: { succeeded: string[], failed: { id: string; reason: string }[] }
 *
 *   set_field
 *     Body: { action: "set_field", ids: string[], field: string, value: unknown }
 *     Sets a single logical field on all matching records (no lifecycle validation).
 *     Returns: { succeeded: string[], failed: { id: string; reason: string }[] }
 *
 * Max IDs per request: 500 (BULK_MAX_IDS).
 * Tenant isolation is enforced on every SELECT and UPDATE.
 * Operations are applied row-by-row (not in one SQL bulk UPDATE) so per-row errors
 * are captured individually without rolling back the whole batch.
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import {
  verifyBearer,
  isUuid,
  resolveTenantId,
  resolvePrincipalIdOrNull,
  resolveFieldMap,
  extractOrgHeaders,
} from "@athyper/svc-shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

// ─── Deps ─────────────────────────────────────────────────────────────────────

export interface BulkActionRouteDeps {
  db:    AnyDb;
  auth:  { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
    info(event: string, fields?: Record<string, unknown>): void;
  };
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const BULK_MAX_IDS = 500;

// ─── Lifecycle helpers ─────────────────────────────────────────────────────────

interface StatusRouteCompiled {
  allowed_transitions: Record<string, string[]>;
  terminal_states?:    string[];
}

/**
 * Load the compiled status route for an entity from snapshot.status_route.
 * Returns null if no route exists (unstructured entity — all transitions open).
 */
async function loadStatusRoute(
  db:         AnyDb,
  entityName: string,
  tenantId:   string,
): Promise<StatusRouteCompiled | null> {
  const row = await db
    .selectFrom("snapshot.status_route as sr")
    .select(["sr.compiled_json"])
    .where("sr.entity_name", "=", entityName)
    .where("sr.tenant_id", "=", tenantId)
    .orderBy("sr.updated_at" as never, "desc")
    .limit(1)
    .executeTakeFirst() as { compiled_json: StatusRouteCompiled | null } | undefined;

  return row?.compiled_json ?? null;
}

/**
 * Fall back to control.entity_lifecycle + the lifecycle definition to extract
 * allowed transitions. Returns null if no binding exists.
 * Only used when snapshot.status_route is absent.
 */
async function loadLifecycleTransitions(
  db:         AnyDb,
  entityName: string,
  tenantId:   string,
): Promise<Record<string, string[]> | null> {
  // Find the highest-priority lifecycle binding for this entity + tenant
  const binding = await db
    .selectFrom("control.entity_lifecycle as el")
    .innerJoin("master.lifecycle as lc", "lc.id", "el.lifecycle_id")
    .select(["lc.status_graph"] as never[])
    .where("el.entity_name", "=", entityName)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .where((eb: any) =>
      eb.or([
        eb("el.tenant_id", "is", null),
        eb("el.tenant_id", "=", tenantId),
      ])
    )
    .orderBy("el.priority" as never, "asc")
    .limit(1)
    .executeTakeFirst() as { status_graph: Record<string, unknown> | null } | undefined;

  if (!binding?.status_graph) return null;

  // Extract allowed_transitions from status_graph jsonb
  const sg = binding.status_graph;
  const transitions = sg["allowed_transitions"] as Record<string, string[]> | undefined;
  return transitions ?? null;
}

/**
 * Returns true if the transition fromStatus → targetStatus is allowed.
 * - If compiled route exists: check its allowed_transitions map.
 * - If lifecycle binding exists (fallback): check its status_graph.
 * - If neither: transition is open (unstructured entity).
 */
async function isTransitionAllowed(
  db:           AnyDb,
  entityName:   string,
  tenantId:     string,
  fromStatus:   string,
  targetStatus: string,
): Promise<{ allowed: boolean; reason?: string }> {
  // 1. snapshot.status_route (primary)
  const route = await loadStatusRoute(db, entityName, tenantId);
  if (route) {
    const allowed = route.allowed_transitions[fromStatus] ?? [];
    if (!allowed.includes(targetStatus)) {
      return { allowed: false, reason: `Transition ${fromStatus}→${targetStatus} not in status route` };
    }
    return { allowed: true };
  }

  // 2. control.entity_lifecycle (secondary)
  const lcTransitions = await loadLifecycleTransitions(db, entityName, tenantId);
  if (lcTransitions) {
    const allowed = lcTransitions[fromStatus] ?? [];
    if (!allowed.includes(targetStatus)) {
      return { allowed: false, reason: `Transition ${fromStatus}→${targetStatus} not in lifecycle definition` };
    }
    return { allowed: true };
  }

  // 3. No lifecycle gate — open transition
  return { allowed: true };
}

// ─── Route factory ─────────────────────────────────────────────────────────────

export function createBulkActionRoute(router: Router, deps: BulkActionRouteDeps): Router {
  const { db, auth, logger } = deps;

  const bulkActionHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "X-Org header is required" });
        return;
      }

      const sub         = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub ? (await resolvePrincipalIdOrNull(db, sub, tenantId) ?? sub) : null;

      const body = req.body as Record<string, unknown>;
      const action      = String(body["action"] ?? "");
      const ids         = Array.isArray(body["ids"]) ? (body["ids"] as unknown[]).map(String) : [];

      if (!action) {
        res.status(400).json({ error: "MISSING_ACTION", message: "'action' is required" });
        return;
      }
      if (ids.length === 0) {
        res.status(400).json({ error: "MISSING_IDS", message: "'ids' array must be non-empty" });
        return;
      }
      if (ids.length > BULK_MAX_IDS) {
        res.status(400).json({ error: "TOO_MANY_IDS", message: `Maximum ${BULK_MAX_IDS} ids per request` });
        return;
      }

      // Validate all IDs are UUIDs
      if (!ids.every((id) => isUuid(id))) {
        res.status(400).json({ error: "INVALID_IDS", message: "All ids must be valid UUIDs" });
        return;
      }

      // Resolve backing table
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
      const succeeded: string[] = [];
      const failed: { id: string; reason: string }[] = [];

      // ── status_transition ─────────────────────────────────────────────────────
      if (action === "status_transition") {
        const targetStatus = String(body["targetStatus"] ?? "");
        if (!targetStatus) {
          res.status(400).json({ error: "MISSING_TARGET_STATUS", message: "'targetStatus' is required for status_transition" });
          return;
        }

        for (const id of ids) {
          try {
            // Fetch current status
            const current = await db
              .selectFrom(fullTable)
              .select(["status"] as never[])
              .where("id" as never, "=", id as never)
              .where("tenant_id" as never, "=", tenantId as never)
              .executeTakeFirst() as { status: string } | undefined;

            if (!current) {
              failed.push({ id, reason: "RECORD_NOT_FOUND" });
              continue;
            }

            if (current.status === targetStatus) {
              succeeded.push(id); // already in target state — idempotent
              continue;
            }

            const { allowed, reason } = await isTransitionAllowed(
              db, entityCode, tenantId, current.status, targetStatus,
            );

            if (!allowed) {
              failed.push({ id, reason: reason ?? "TRANSITION_NOT_ALLOWED" });
              continue;
            }

            // Apply transition
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (db.updateTable(fullTable) as any)
              .set({
                status:             targetStatus,
                status_changed_at:  new Date(),
                status_changed_by:  principalId,
                updated_at:         new Date(),
                updated_by:         principalId,
              })
              .where("id", "=", id)
              .where("tenant_id", "=", tenantId)
              .where("status", "=", current.status) // optimistic lock
              .execute();

            succeeded.push(id);
          } catch (err) {
            failed.push({ id, reason: err instanceof Error ? err.message.slice(0, 200) : String(err) });
          }
        }

        logger?.info("bulk_status_transition", {
          entity:        entityCode,
          tenantId,
          targetStatus,
          total:         ids.length,
          succeeded:     succeeded.length,
          failed:        failed.length,
        });

        res.json({ ok: true, action, succeeded, failed });
        return;
      }

      // ── set_field ────────────────────────────────────────────────────────────
      if (action === "set_field") {
        const fieldName = String(body["field"] ?? "");
        const value     = body["value"];

        if (!fieldName) {
          res.status(400).json({ error: "MISSING_FIELD", message: "'field' is required for set_field" });
          return;
        }

        // Resolve logical field name → physical column name
        const fieldMap   = await resolveFieldMap(db, entityCode);
        const columnName = fieldMap.get(fieldName) ?? fieldName;

        // Block system-managed audit columns
        const PROTECTED = ["id", "tenant_id", "created_by", "created_at", "status_changed_by", "status_changed_at"];
        if (PROTECTED.includes(columnName)) {
          res.status(400).json({ error: "PROTECTED_FIELD", message: `Field '${fieldName}' cannot be set via bulk action` });
          return;
        }

        for (const id of ids) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = await (db.updateTable(fullTable) as any)
              .set({
                [columnName]: value,
                updated_at:   new Date(),
                updated_by:   principalId,
              })
              .where("id", "=", id)
              .where("tenant_id", "=", tenantId)
              .executeTakeFirst() as { numUpdatedRows?: bigint } | undefined;

            if (Number(result?.numUpdatedRows ?? 0) > 0) {
              succeeded.push(id);
            } else {
              failed.push({ id, reason: "RECORD_NOT_FOUND" });
            }
          } catch (err) {
            failed.push({ id, reason: err instanceof Error ? err.message.slice(0, 200) : String(err) });
          }
        }

        logger?.info("bulk_set_field", {
          entity:    entityCode,
          tenantId,
          field:     fieldName,
          column:    columnName,
          total:     ids.length,
          succeeded: succeeded.length,
          failed:    failed.length,
        });

        res.json({ ok: true, action, succeeded, failed });
        return;
      }

      res.status(400).json({ error: "UNKNOWN_ACTION", message: `Action '${action}' is not supported. Use: status_transition, set_field` });
    } catch (err) {
      logger?.error("bulk_action_error", { err: String(err) });
      next(err);
    }
  };

  router.post("/records/:entity/bulk-action", bulkActionHandler);

  return router;
}
