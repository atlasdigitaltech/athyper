/**
 * Bulk Preflight Route
 *
 *   POST /api/records/:entity/bulk-preflight
 *
 * Dry-run eligibility check for a bulk action. Returns per-record status
 * WITHOUT executing the action. Always call this before showing a confirm
 * dialog — never execute a bulk action without first checking preflight.
 *
 * Supported actions:
 *
 *   status_transition
 *     Body: { action: "status_transition", ids: string[], targetStatus: string }
 *     For each ID:
 *       1. Fetch current status.
 *       2. Check transition eligibility via status_route → lifecycle → open.
 *       3. Classify record as: eligible | skipped (already at target) | denied.
 *     Returns: BulkPreflightResult
 *
 * Future actions (set_field etc.) extend this route; classification logic is shared.
 *
 * Max IDs per request: 500 (same cap as bulk-action.route.ts).
 * Reads only — no state mutations.
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import {
  verifyBearer,
  isUuid,
  resolveTenantId,
  extractOrgHeaders,
} from "@athyper/svc-shared";
type EntityActionEligibility = {
  recordId: string;
  status: "eligible" | "skipped" | "denied" | "requires_workflow";
  reason?: string;
  currentState?: string;
};
type BulkPreflightResult = {
  action: string;
  total: number;
  eligible: number;
  skipped: number;
  denied: number;
  requiresWorkflow: number;
  canProceed: boolean;
  records: EntityActionEligibility[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

// ─── Deps ─────────────────────────────────────────────────────────────────────

export interface BulkPreflightRouteDeps {
  db:   AnyDb;
  auth: { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    info(event: string, fields?: Record<string, unknown>): void;
  };
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const BULK_MAX_IDS = 500;
const TARGET_STATUS: Record<string, string> = {
  submit:  "pending_approval",
  approve: "approved",
  deny:    "rejected",
  reject:  "rejected",
  post:    "posted",
  cancel:  "cancelled",
  void:    "cancelled",
  close:   "closed",
  archive: "archived",
};

function requestIds(body: Record<string, unknown>): string[] {
  const raw = Array.isArray(body["ids"])
    ? body["ids"]
    : Array.isArray(body["recordIds"])
    ? body["recordIds"]
    : [];
  return raw.map(String);
}

async function operationEnabled(
  db: AnyDb,
  tenantId: string,
  entityCode: string,
  action: string,
): Promise<boolean> {
  const operation = await db
    .selectFrom("control.entity_operation as eo")
    .select(["eo.is_enabled"] as never[])
    .where("eo.entity_name" as never, "=", entityCode as never)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .where((eb: any) =>
      eb.or([
        eb("eo.permission_code" as never, "=", action as never),
        eb("eo.handler_target" as never, "=", action as never),
        eb("eo.permission_code" as never, "like", (`%.${action}`) as never),
      ]),
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .where((eb: any) =>
      eb.or([
        eb("eo.tenant_id" as never, "is", null),
        eb("eo.tenant_id" as never, "=", tenantId as never),
      ]),
    )
    .orderBy("eo.tenant_id" as never, "desc")
    .limit(1)
    .executeTakeFirst() as { is_enabled: boolean } | undefined;

  return operation?.is_enabled === true;
}

// ─── Lifecycle helpers (read-only mirrors of bulk-action.route.ts) ─────────────

interface StatusRouteCompiled {
  allowed_transitions: Record<string, string[]>;
}

async function loadStatusRoute(
  db:         AnyDb,
  entityName: string,
  tenantId:   string,
): Promise<StatusRouteCompiled | null> {
  const row = await db
    .selectFrom("snapshot.status_route as sr")
    .select(["sr.compiled_json"])
    .where("sr.entity_name", "=", entityName)
    .where("sr.tenant_id",   "=", tenantId)
    .orderBy("sr.updated_at" as never, "desc")
    .limit(1)
    .executeTakeFirst() as { compiled_json: StatusRouteCompiled | null } | undefined;

  return row?.compiled_json ?? null;
}

async function loadLifecycleTransitions(
  db:         AnyDb,
  entityName: string,
  tenantId:   string,
): Promise<Record<string, string[]> | null> {
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
  return (binding.status_graph["allowed_transitions"] as Record<string, string[]>) ?? null;
}

/**
 * Classify one record's eligibility for a status transition.
 * Does NOT mutate any state — pure read.
 */
async function classifyTransition(
  db:           AnyDb,
  entityName:   string,
  tenantId:     string,
  fullTable:    `${string}.${string}`,
  id:           string,
  targetStatus: string,
  routeCache:   { route: StatusRouteCompiled | null | undefined; lc: Record<string, string[]> | null | undefined },
): Promise<EntityActionEligibility> {
  // 1. Fetch current record status
  const current = await db
    .selectFrom(fullTable)
    .select(["status"] as never[])
    .where("id"        as never, "=", id        as never)
    .where("tenant_id" as never, "=", tenantId  as never)
    .executeTakeFirst() as { status: string } | undefined;

  if (!current) {
    return { recordId: id, status: "denied", reason: "Record not found" };
  }

  const currentState = current.status;

  // 2. Already at target — idempotent skip
  if (currentState === targetStatus) {
    return { recordId: id, status: "skipped", currentState, reason: "Already in target state" };
  }

  // 3. Load route/lifecycle (lazy, cached per request)
  if (routeCache.route === undefined) {
    routeCache.route = await loadStatusRoute(db, entityName, tenantId);
  }
  if (routeCache.lc === undefined && !routeCache.route) {
    routeCache.lc = await loadLifecycleTransitions(db, entityName, tenantId);
  }

  // 4. Check transition gate
  if (routeCache.route) {
    const allowed = routeCache.route.allowed_transitions[currentState] ?? [];
    if (!allowed.includes(targetStatus)) {
      return {
        recordId: id,
        status: "denied",
        currentState,
        reason: `Transition ${currentState}→${targetStatus} is not allowed`,
      };
    }
    return { recordId: id, status: "eligible", currentState };
  }

  if (routeCache.lc) {
    const allowed = routeCache.lc[currentState] ?? [];
    if (!allowed.includes(targetStatus)) {
      return {
        recordId: id,
        status: "denied",
        currentState,
        reason: `Transition ${currentState}→${targetStatus} is not in lifecycle definition`,
      };
    }
    return { recordId: id, status: "eligible", currentState };
  }

  // 5. No lifecycle gate — transition is open
  return { recordId: id, status: "eligible", currentState };
}

async function classifyCopy(
  db: AnyDb,
  tenantId: string,
  fullTable: `${string}.${string}`,
  id: string,
): Promise<EntityActionEligibility> {
  const current = await db
    .selectFrom(fullTable)
    .select(["id", "status"] as never[])
    .where("id" as never, "=", id as never)
    .where("tenant_id" as never, "=", tenantId as never)
    .executeTakeFirst() as { id: string; status?: string | null } | undefined;

  if (!current) {
    return { recordId: id, status: "denied", reason: "Record not found" };
  }
  return { recordId: id, status: "eligible", currentState: current.status ?? undefined };
}

// ─── Route factory ─────────────────────────────────────────────────────────────

export function createBulkPreflightRoute(router: Router, deps: BulkPreflightRouteDeps): Router {
  const { db, auth, logger } = deps;

  const preflightHandler: RequestHandler = async (req, res, next) => {
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

      const body         = req.body as Record<string, unknown>;
      const action       = String(body["action"] ?? "");
      const ids          = requestIds(body);
      const targetStatus = String(body["targetStatus"] ?? TARGET_STATUS[action] ?? "");

      // ── Validate ────────────────────────────────────────────────────────────

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
      if (!ids.every((id) => isUuid(id))) {
        res.status(400).json({ error: "INVALID_IDS", message: "All ids must be valid UUIDs" });
        return;
      }
      if ((action === "status_transition" || TARGET_STATUS[action]) && !targetStatus) {
        res.status(400).json({ error: "MISSING_TARGET_STATUS", message: "'targetStatus' is required for status_transition" });
        return;
      }
      if (action !== "status_transition" && action !== "copy" && !TARGET_STATUS[action]) {
        res.status(400).json({ error: "UNSUPPORTED_ACTION", message: `Preflight for action '${action}' is not yet supported` });
        return;
      }
      if (action === "copy" && !(await operationEnabled(db, tenantId, entityCode, action))) {
        res.status(403).json({ error: "OPERATION_DISABLED", message: `Operation '${action}' is not enabled for '${entityCode}'` });
        return;
      }

      // ── Resolve backing table ───────────────────────────────────────────────

      const entityRow = await db
        .selectFrom("control.entity as e")
        .select(["e.table_schema", "e.table_name"])
        .where("e.name",      "=", entityCode)
        .where("e.tenant_id", "is", null)
        .executeTakeFirst() as { table_schema: string; table_name: string } | undefined;

      if (!entityRow) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const fullTable = `${entityRow.table_schema}.${entityRow.table_name}` as `${string}.${string}`;

      // ── Classify each record (shared cache: route/lifecycle loaded once per request) ──

      const routeCache: {
        route: StatusRouteCompiled | null | undefined;
        lc:    Record<string, string[]> | null | undefined;
      } = { route: undefined, lc: undefined };

      const records: EntityActionEligibility[] = [];
      for (const id of ids) {
        const result = action === "copy"
          ? await classifyCopy(db, tenantId, fullTable, id)
          : await classifyTransition(db, entityCode, tenantId, fullTable, id, targetStatus, routeCache);
        records.push(result);
      }

      // ── Tally ───────────────────────────────────────────────────────────────

      const eligible        = records.filter((r) => r.status === "eligible").length;
      const skipped         = records.filter((r) => r.status === "skipped").length;
      const denied          = records.filter((r) => r.status === "denied").length;
      const requiresWorkflow = records.filter((r) => r.status === "requires_workflow").length;

      const result: BulkPreflightResult = {
        action,
        total:   ids.length,
        eligible,
        skipped,
        denied,
        requiresWorkflow,
        canProceed: eligible > 0,
        records,
      };

      logger?.info("bulk_preflight", {
        entity:    entityCode,
        tenantId,
        action,
        total:     ids.length,
        eligible,
        skipped,
        denied,
      });

      res.json(result);
    } catch (err) {
      logger?.error("bulk_preflight_error", { err: String(err) });
      next(err);
    }
  };

  router.post("/records/:entity/bulk-preflight", preflightHandler);

  return router;
}
