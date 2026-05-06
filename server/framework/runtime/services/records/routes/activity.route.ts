/**
 * Per-Record Activity Route — Sprint 40
 *
 *   GET /api/activity/:entity/:id
 *
 * Returns activity log entries for a specific entity record from log.activity_log.
 * Maps DB rows to the ActivityEntry contract expected by ActivityTimeline.
 *
 * Query params:
 *   domain  — filter by domain (document|workflow|accounting|payment|system)
 *   limit   — max entries (default 100, max 500)
 *   offset  — pagination offset
 *
 * Actor enrichment: joins master.principal_profile (display_name) for each unique actor_id.
 *
 * Response: { data: ActivityEntry[] }
 *
 * ActivityEntry shape (from @athyper/api-contracts/workflow):
 *   { id, domain, activity_type, description, actor_name, from_state, to_state, detail, created_at }
 *
 * Falls back gracefully to empty array if log.activity_log partition doesn't exist yet
 * (Postgres error 42P01 — relation not found).
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import {
  verifyBearer,
  isUuid,
  resolveTenantId,
  extractOrgHeaders,
} from "@athyper/svc-shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

// ─── Deps ─────────────────────────────────────────────────────────────────────

export interface ActivityRouteDeps {
  db:   AnyDb;
  auth: { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
  };
}

// ─── Mapping ──────────────────────────────────────────────────────────────────

interface ActivityRow {
  id:            string;
  domain:        string;
  activity_type: string;
  detail:        Record<string, unknown> | null;
  actor_id:      string | null;
  created_at:    string;
}

interface PersonaRow {
  principal_id:  string;
  display_name:  string | null;
}

function describeActivity(row: ActivityRow): string {
  // Build a human-readable description from activity_type + detail.
  // The detail JSONB carries domain-specific context; use it when available.
  const type = row.activity_type.replace(/_/g, " ");

  if (!row.detail || typeof row.detail !== "object") return type;

  const d = row.detail as Record<string, unknown>;

  // Common detail patterns across domains
  if (d["message"])         return String(d["message"]);
  if (d["description"])     return String(d["description"]);
  if (d["action"])          return `${String(d["action"])} — ${type}`;

  return type;
}

// ─── Route factory ─────────────────────────────────────────────────────────────

export function createActivityRoute(router: Router, deps: ActivityRouteDeps): Router {
  const { db, auth, logger } = deps;

  // GET /activity/recent — cross-entity recent activity for the tenant.
  // Registered BEFORE /:entity/:id so "recent" is not captured as the :entity param.
  const recentHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "X-Org header is required" });
        return;
      }

      const q     = req.query as Record<string, unknown>;
      const limit = Math.min(50, Math.max(1, parseInt(String(q["limit"] ?? "20"), 10)));

      interface RecentRow extends ActivityRow { entity_type: string; entity_id: string }
      let rows: RecentRow[] = [];

      try {
        rows = await db
          .selectFrom("log.activity_log as al")
          .select([
            "al.id", "al.domain", "al.activity_type",
            "al.detail", "al.actor_id", "al.created_at",
            "al.entity_type", "al.entity_id",
          ] as never[])
          .where("al.tenant_id" as never, "=", tenantId as never)
          .orderBy("al.created_at" as never, "desc")
          .limit(limit)
          .execute() as RecentRow[];
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === "42P01") { rows = []; }
        else throw err;
      }

      const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[];
      const personas: PersonaRow[] = actorIds.length > 0
        ? await db
            .selectFrom("master.principal_profile as pe")
            .select(["pe.principal_id", "pe.display_name"] as never[])
            .where("pe.principal_id" as never, "in", actorIds as never)
            .execute() as PersonaRow[]
        : [];

      const personaMap = new Map(personas.map((p) => [p.principal_id, p.display_name]));

      const data = rows.map((row) => ({
        id:            row.id,
        domain:        (["document", "workflow", "accounting", "payment", "system"].includes(row.domain)
          ? row.domain : "system") as "document" | "workflow" | "accounting" | "payment" | "system",
        activity_type: row.activity_type,
        description:   `${row.entity_type.replace(/_/g, " ")}: ${describeActivity(row)}`,
        actor_name:    row.actor_id ? (personaMap.get(row.actor_id) ?? null) : null,
        from_state:    (row.detail as Record<string, unknown> | null)?.["from_state"] as string | null ?? null,
        to_state:      (row.detail as Record<string, unknown> | null)?.["to_state"]   as string | null ?? null,
        detail:        (row.detail as Record<string, unknown> | null) ?? null,
        created_at:    typeof row.created_at === "string"
          ? row.created_at
          : new Date(row.created_at as unknown as Date).toISOString(),
      }));

      res.json({ data });
    } catch (err) {
      logger?.error("activity_recent_error", { err: String(err) });
      next(err);
    }
  };

  router.get("/activity/recent", recentHandler);

  const handler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const recordId   = String(req.params["id"] ?? "");

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

      const q        = req.query as Record<string, unknown>;
      const domain   = typeof q["domain"] === "string" ? q["domain"] : null;
      const limit    = Math.min(500, Math.max(1, parseInt(String(q["limit"]  ?? "100"), 10)));
      const offset   = Math.max(0,              parseInt(String(q["offset"] ?? "0"),   10));

      // ── Query log.activity_log ────────────────────────────────────────────────
      let rows: ActivityRow[] = [];

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q_: any = db
          .selectFrom("log.activity_log as al")
          .select([
            "al.id", "al.domain", "al.activity_type",
            "al.detail", "al.actor_id", "al.created_at",
          ] as never[])
          .where("al.tenant_id"   as never, "=",   tenantId   as never)
          .where("al.entity_type" as never, "=",   entityCode as never)
          .where("al.entity_id"   as never, "=",   recordId   as never)
          .orderBy("al.created_at" as never, "desc")
          .limit(limit)
          .offset(offset);

        if (domain && domain !== "all") {
          q_ = q_.where("al.domain" as never, "=", domain as never);
        }

        rows = await q_.execute() as ActivityRow[];
      } catch (err) {
        // Graceful degradation: if activity_log partition doesn't exist yet
        const code = (err as { code?: string }).code;
        if (code === "42P01") {
          logger?.warn("activity_route_table_missing", { entityCode, recordId });
          rows = [];
        } else {
          throw err;
        }
      }

      // ── Enrich with actor display names ───────────────────────────────────────
      const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[];
      const personas: PersonaRow[] = actorIds.length > 0
        ? await db
            .selectFrom("master.principal_profile as pe")
            .select(["pe.principal_id", "pe.display_name"] as never[])
            .where("pe.principal_id" as never, "in", actorIds as never)
            .execute() as PersonaRow[]
        : [];

      const personaMap = new Map(personas.map((p) => [p.principal_id, p.display_name]));

      // ── Map to ActivityEntry ──────────────────────────────────────────────────
      const data = rows.map((row) => ({
        id:            row.id,
        domain:        (["document", "workflow", "accounting", "payment", "system"].includes(row.domain)
          ? row.domain : "system") as "document" | "workflow" | "accounting" | "payment" | "system",
        activity_type: row.activity_type,
        description:   describeActivity(row),
        actor_name:    row.actor_id ? (personaMap.get(row.actor_id) ?? null) : null,
        from_state:    (row.detail as Record<string, unknown> | null)?.["from_state"] as string | null ?? null,
        to_state:      (row.detail as Record<string, unknown> | null)?.["to_state"]   as string | null ?? null,
        detail:        (row.detail as Record<string, unknown> | null) ?? null,
        created_at:    typeof row.created_at === "string"
          ? row.created_at
          : new Date(row.created_at as unknown as Date).toISOString(),
      }));

      res.json({ data });
    } catch (err) {
      logger?.error("activity_route_error", { err: String(err) });
      next(err);
    }
  };

  router.get("/activity/:entity/:id", handler);

  return router;
}
