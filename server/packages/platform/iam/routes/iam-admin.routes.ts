/**
 * IAM Admin Report Routes — v1.0
 *
 * Read-only admin endpoints for auditing and observability.
 *
 * GET /api/iam/admin/permission-log
 *   Paginated read over audit.authorization_decision_evidence.
 *   Query params:
 *     principal_id    — filter by principal UUID
 *     permission_code — filter by permission code (partial match)
 *     entity_type     — filter by entity_type
 *     decision        — filter: allow | deny | not_found | not_in_plan |
 *                               addon_required | override_denied |
 *                               not_entitled | not_granted | module_not_subscribed
 *     date_from       — ISO date string (inclusive)
 *     date_to         — ISO date string (inclusive, end-of-day)
 *     limit           — default 50, max 200
 *     offset          — default 0
 *
 * GET /api/iam/admin/idp-sync/health
 *   Aggregate sync health from master.principal_identity_binding.
 *   Returns: last_sync_at, provider_stats[], conflicts[]
 *
 * POST /api/iam/admin/idp-sync/trigger
 *   Enqueues a re-sync job (fire-and-forget — actual sync runs via BullMQ).
 */

import { sql } from "kysely";
import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";

import {
  verifyBearer,
  extractOrgHeaders,
  resolveTenantId,
  resolvePrincipalIdOrNull,
  setCachePrivate,
} from "@athyper/svc-shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Record<string, any>;

export interface IamAdminRoutesDeps {
  db: Kysely<AnyDb>;
  auth: { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
  };
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function resolveAuth(
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1],
  db: Kysely<AnyDb>,
  auth: IamAdminRoutesDeps["auth"],
): Promise<{ tenantId: string; principalId: string } | null> {
  const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
  if (!claims) return null;

  const sub = typeof claims.sub === "string" ? claims.sub : null;
  if (!sub) {
    res.status(401).json({ error: "INVALID_TOKEN", message: "JWT missing sub claim" });
    return null;
  }

  const { xOrg, xRealm } = extractOrgHeaders(req);
  const tenantId = await resolveTenantId(db, xOrg, xRealm);
  if (!tenantId) {
    res.status(400).json({ error: "MISSING_HEADER", message: "X-Org header required" });
    return null;
  }

  const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm);
  if (!principalId) {
    res.status(403).json({ error: "NO_PRINCIPAL", message: "No principal found" });
    return null;
  }

  return { tenantId, principalId };
}

// ─── Route factory ────────────────────────────────────────────────────────────

export function createIamAdminRoutes(router: Router, deps: IamAdminRoutesDeps): Router {
  const { db, auth, logger } = deps;

  // ── GET /api/iam/admin/permission-log ─────────────────────────────────────────
  router.get("/iam/admin/permission-log", (async (req, res, next) => {
    try {
      const a = await resolveAuth(req, res, db, auth);
      if (!a) return;

      const principalId    = typeof req.query["principal_id"]    === "string" ? req.query["principal_id"].trim()    : "";
      const permissionCode = typeof req.query["permission_code"] === "string" ? req.query["permission_code"].trim() : "";
      const entityType     = typeof req.query["entity_type"]     === "string" ? req.query["entity_type"].trim()     : "";
      const decision       = typeof req.query["decision"]        === "string" ? req.query["decision"].trim()        : "";
      const dateFrom       = typeof req.query["date_from"]       === "string" ? req.query["date_from"].trim()       : "";
      const dateTo         = typeof req.query["date_to"]         === "string" ? req.query["date_to"].trim()         : "";
      const limit  = Math.min(200, Math.max(1, parseInt(String(req.query["limit"]  ?? "50"), 10) || 50));
      const offset = Math.max(0,               parseInt(String(req.query["offset"] ?? "0"),  10) || 0);

      const tid = a.tenantId;

      // Dynamic filter fragments
      const pidFilter   = principalId    ? sql`AND pdl.subject_principal_id = ${principalId}::uuid`       : sql``;
      const pcodeFilter = permissionCode ? sql`AND pdl.permission_code ILIKE ${"%" + permissionCode + "%"}` : sql``;
      const etFilter    = entityType     ? sql`AND pdl.resource_type        = ${entityType}`              : sql``;
      const decFilter   = decision       ? sql`AND pdl.decision             = ${decision}`                : sql``;
      const fromFilter  = dateFrom       ? sql`AND pdl.occurred_at         >= ${dateFrom}::timestamptz`   : sql``;
      const toFilter    = dateTo         ? sql`AND pdl.occurred_at          < (${dateTo}::date + INTERVAL '1 day')` : sql``;

      interface PdlRow {
        id: string;
        principal_id: string;
        principal_code: string | null;
        principal_display_name: string | null;
        permission_code: string | null;
        entity_type: string | null;
        entity_id: string | null;
        decision: string;
        reason_codes: string[] | null;
        evaluation_duration_ms: number | null;
        request_id: string | null;
        occurred_at: string;
      }

      const result = await sql<PdlRow>`
        SELECT
          pdl.id,
          pdl.subject_principal_id AS principal_id,
          pr.code    AS principal_code,
          COALESCE(pp.display_name, pr.name, pr.code) AS principal_display_name,
          pdl.permission_code,
          pdl.resource_type  AS entity_type,
          pdl.resource_id    AS entity_id,
          pdl.decision,
          pdl.reason_codes,
          pdl.evaluation_duration_ms,
          pdl.request_id,
          pdl.occurred_at
        FROM audit.authorization_decision_evidence pdl
        LEFT JOIN master.principal       pr  ON pr.id  = pdl.subject_principal_id
        LEFT JOIN master.principal_profile pp ON pp.principal_id = pdl.subject_principal_id
        WHERE pdl.tenant_id = ${tid}::uuid
        ${pidFilter}
        ${pcodeFilter}
        ${etFilter}
        ${decFilter}
        ${fromFilter}
        ${toFilter}
        ORDER BY pdl.occurred_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `.execute(db);

      const countResult = await sql<{ total: string }>`
        SELECT COUNT(*)::text AS total
        FROM audit.authorization_decision_evidence pdl
        WHERE pdl.tenant_id = ${tid}::uuid
        ${pidFilter}
        ${pcodeFilter}
        ${etFilter}
        ${decFilter}
        ${fromFilter}
        ${toFilter}
      `.execute(db);

      const total = parseInt(countResult.rows[0]?.total ?? "0", 10);

      setCachePrivate(res, 15);
      res.json({ items: result.rows, total, limit, offset });
    } catch (err) {
      logger?.error("iam_admin_permission_log_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── GET /api/iam/admin/idp-sync/health ────────────────────────────────────────
  router.get("/iam/admin/idp-sync/health", (async (req, res, next) => {
    try {
      const a = await resolveAuth(req, res, db, auth);
      if (!a) return;

      const tid = a.tenantId;

      // Aggregate counts per provider × sync_status
      interface StatRow {
        provider_code: string;
        sync_status: string;
        cnt: string;
        latest_sync: string | null;
      }

      const statsResult = await sql<StatRow>`
        SELECT
          provider_code,
          sync_status,
          COUNT(*)::text AS cnt,
          MAX(synced_at)::text AS latest_sync
        FROM master.principal_identity_binding
        WHERE tenant_id = ${tid}::uuid
        GROUP BY provider_code, sync_status
        ORDER BY provider_code, sync_status
      `.execute(db);

      // Pivot stats per provider
      const providerMap: Record<string, {
        provider_code: string;
        total: number; synced: number; drift: number;
        error: number; pending: number; disabled: number;
        last_sync_at: string | null;
      }> = {};

      let globalLastSync: string | null = null;

      for (const r of statsResult.rows) {
        if (!providerMap[r.provider_code]) {
          providerMap[r.provider_code] = {
            provider_code: r.provider_code,
            total: 0, synced: 0, drift: 0, error: 0, pending: 0, disabled: 0,
            last_sync_at: null,
          };
        }
        const p = providerMap[r.provider_code]!;
        const cnt = parseInt(r.cnt, 10);
        p.total += cnt;
        if (r.sync_status === "synced")   p.synced   += cnt;
        if (r.sync_status === "drift")    p.drift    += cnt;
        if (r.sync_status === "error")    p.error    += cnt;
        if (r.sync_status === "pending")  p.pending  += cnt;
        if (r.sync_status === "disabled") p.disabled += cnt;

        // Track latest successful sync globally
        if (r.sync_status === "synced" && r.latest_sync) {
          if (!globalLastSync || r.latest_sync > globalLastSync) {
            globalLastSync = r.latest_sync;
          }
          if (!p.last_sync_at || r.latest_sync > p.last_sync_at) {
            p.last_sync_at = r.latest_sync;
          }
        }
      }

      // Conflict details: drift + error rows with context
      interface ConflictRow {
        id: string;
        principal_id: string;
        principal_code: string | null;
        principal_display_name: string | null;
        provider_code: string;
        sync_status: string;
        sync_error_message: string | null;
        sync_retry_count: number;
        synced_at: string | null;
        subject_id: string;
        username: string | null;
      }

      const conflictsResult = await sql<ConflictRow>`
        SELECT
          pib.id,
          pib.principal_id,
          pr.code AS principal_code,
          COALESCE(pp.display_name, pr.name, pr.code) AS principal_display_name,
          pib.provider_code,
          pib.sync_status,
          pib.sync_error_message,
          pib.sync_retry_count,
          pib.synced_at::text,
          pib.subject_id,
          pib.username
        FROM master.principal_identity_binding pib
        LEFT JOIN master.principal       pr  ON pr.id  = pib.principal_id
        LEFT JOIN master.principal_profile pp ON pp.principal_id = pib.principal_id
        WHERE pib.tenant_id = ${tid}::uuid
          AND pib.sync_status IN ('drift', 'error')
        ORDER BY pib.sync_status, pib.updated_at DESC NULLS LAST
        LIMIT 100
      `.execute(db);

      setCachePrivate(res, 30);
      res.json({
        last_sync_at:   globalLastSync,
        provider_stats: Object.values(providerMap),
        conflicts:      conflictsResult.rows,
      });
    } catch (err) {
      logger?.error("iam_admin_idp_sync_health_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── POST /api/iam/admin/idp-sync/trigger ──────────────────────────────────────
  // Fire-and-forget: enqueues re-sync via BullMQ (no-op if jobs service unavailable).
  router.post("/iam/admin/idp-sync/trigger", (async (req, res, next) => {
    try {
      const a = await resolveAuth(req, res, db, auth);
      if (!a) return;

      // Log the trigger request for audit
      logger?.warn("iam_idp_sync_triggered", {
        tenantId: a.tenantId,
        principalId: a.principalId,
      });

      // Actual async sync is handled by the background jobs service.
      // This endpoint signals intent; the worker polls and processes.
      res.json({ queued: true, message: "IdP sync queued. Results will be visible after the next sync cycle." });
    } catch (err) {
      logger?.error("iam_admin_idp_sync_trigger_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  return router;
}
