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

interface BulkPreflightEntityContract {
  table_schema: string;
  table_name: string;
  primary_key: string;
  tenant_column: string | null;
  runtime_enabled: boolean;
  write_capability: string;
}

async function resolvePreflightEntity(db: AnyDb, entityCode: string): Promise<BulkPreflightEntityContract | null> {
  return db
    .selectFrom("control.entity as e")
    .innerJoin("control.entity_version as ev", "ev.entity_id", "e.id")
    .select([
      "e.table_schema", "e.table_name", "e.primary_key", "e.tenant_column",
      "e.runtime_enabled", "e.write_capability",
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
    .executeTakeFirst() as Promise<BulkPreflightEntityContract | null>;
}

function scopePreflightRecord(query: any, entity: BulkPreflightEntityContract, tenantId: string, recordId: string): any {
  let scoped = query.where(entity.primary_key, "=", recordId);
  if (entity.tenant_column) scoped = scoped.where(entity.tenant_column, "=", tenantId);
  return scoped;
}

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
    .innerJoin("control.lifecycle as lc", "lc.id", "el.lifecycle_id")
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
  entity:       BulkPreflightEntityContract,
  id:           string,
  targetStatus: string,
  routeCache:   { route: StatusRouteCompiled | null | undefined; lc: Record<string, string[]> | null | undefined },
): Promise<EntityActionEligibility> {
  // 1. Fetch current record status
  let currentQuery = (db.selectFrom(fullTable) as any).select(["status"]);
  currentQuery = scopePreflightRecord(currentQuery, entity, tenantId, id);
  const current = await currentQuery.executeTakeFirst() as { status: string } | undefined;

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
  entity: BulkPreflightEntityContract,
  id: string,
): Promise<EntityActionEligibility> {
  let currentQuery = (db.selectFrom(fullTable) as any).select([entity.primary_key, "status"]);
  currentQuery = scopePreflightRecord(currentQuery, entity, tenantId, id);
  const current = await currentQuery.executeTakeFirst() as Record<string, unknown> | undefined;

  if (!current) {
    return { recordId: id, status: "denied", reason: "Record not found" };
  }
  return { recordId: id, status: "eligible", currentState: typeof current["status"] === "string" ? current["status"] : undefined };
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
      if (!ids.every((id) => id.length > 0 && id.length <= 256)) {
        res.status(400).json({ error: "INVALID_IDS", message: "Record keys must be non-empty strings of at most 256 characters" });
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

      const entityRow = await resolvePreflightEntity(db, entityCode);

      if (!entityRow) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const fullTable = `${entityRow.table_schema}.${entityRow.table_name}` as `${string}.${string}`;

      if (action === "copy" && entityRow.write_capability === "none") {
        res.status(403).json({ error: "ENTITY_READ_ONLY", message: `Entity '${entityCode}' is not writable.` });
        return;
      }

      // ── Classify each record (shared cache: route/lifecycle loaded once per request) ──

      const routeCache: {
        route: StatusRouteCompiled | null | undefined;
        lc:    Record<string, string[]> | null | undefined;
      } = { route: undefined, lc: undefined };

      const records: EntityActionEligibility[] = [];
      for (const id of ids) {
        const result = action === "copy"
          ? await classifyCopy(db, tenantId, fullTable, entityRow, id)
          : await classifyTransition(db, entityCode, tenantId, fullTable, entityRow, id, targetStatus, routeCache);
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
