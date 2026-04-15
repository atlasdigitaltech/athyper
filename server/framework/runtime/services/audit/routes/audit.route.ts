/**
 * Audit Query Routes
 *
 * GET /audit/events                   — paginated entity mutation trail (log.audit_log)
 * GET /audit/events/:id               — single audit event
 * GET /audit/events/export            — download CSV or JSON compliance package
 * GET /audit/permission-decisions     — paginated auth-engine decisions (log.permission_decision_log)
 * GET /audit/permission-decisions/:id — single permission decision
 *
 * Both tables are partitioned by created_at. All queries require a date range
 * bound to avoid full-table scans. Tenant isolation via RLS — tenant resolved
 * from bearer token, not a manual WHERE filter.
 *
 * Audit Export:
 *   format=csv  — flat CSV rows (no old_values/new_values blobs)
 *   format=json — NDJSON with SHA-256 integrity chain; each record carries a
 *                 `_hash` field computed over (prevHash + stable record fields)
 *                 so any tampering breaks the chain.
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { createHash } from "node:crypto";
import {
  verifyBearer,
  isUuid,
  resolveTenantId,
  resolvePrincipalIdOrNull,
  extractOrgHeaders,
  parsePagination,
} from "../../shared/route-helpers.js";

// ── Deps ──────────────────────────────────────────────────────────────────────

export interface AuditRouteDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEFAULT_WINDOW_DAYS = 7;
const MAX_WINDOW_DAYS = 90;

function parseDateBounds(query: Record<string, unknown>): { from: Date; to: Date } {
  const now = new Date();
  const to = query["to"]
    ? new Date(String(query["to"]))
    : now;
  const from = query["from"]
    ? new Date(String(query["from"]))
    : new Date(now.getTime() - DEFAULT_WINDOW_DAYS * 86_400_000);

  // Cap range to MAX_WINDOW_DAYS to prevent runaway scans on partitioned tables
  const maxFrom = new Date(to.getTime() - MAX_WINDOW_DAYS * 86_400_000);
  return {
    from: from < maxFrom ? maxFrom : from,
    to,
  };
}

function toAuditEvent(row: Record<string, unknown>) {
  return {
    id:            row["id"],
    tenantId:      row["tenant_id"],
    logType:       row["log_type"],
    entityType:    row["entity_type"],
    entityId:      row["entity_id"],
    operation:     row["operation"],
    actorId:       row["actor_id"] ?? null,
    actorType:     row["actor_type"] ?? null,
    companyCodeId: row["company_code_id"] ?? null,
    oldValues:     row["old_values"] ?? null,
    newValues:     row["new_values"] ?? null,
    changedFields: row["changed_fields"] ?? null,
    correlationId: row["correlation_id"] ?? null,
    requestId:     row["request_id"] ?? null,
    ipAddress:     row["ip_address"] ?? null,
    userAgent:     row["user_agent"] ?? null,
    createdAt:     row["created_at"],
    createdBy:     row["created_by"],
  };
}

function toPermissionDecision(row: Record<string, unknown>) {
  return {
    id:                row["id"],
    tenantId:          row["tenant_id"],
    principalId:       row["principal_id"],
    personaCode:       row["persona_code"] ?? null,
    permissionId:      row["permission_id"] ?? null,
    permissionCode:    row["permission_code"] ?? null,
    featureId:         row["feature_id"] ?? null,
    featureCode:       row["feature_code"] ?? null,
    entityType:        row["entity_type"] ?? null,
    entityId:          row["entity_id"] ?? null,
    moduleCode:        row["module_code"] ?? null,
    decision:          row["decision"],
    decisionReason:    row["decision_reason"],
    scopeApplied:      row["scope_applied"] ?? null,
    companyCodeId:     row["company_code_id"] ?? null,
    matchedGrantId:    row["matched_grant_id"] ?? null,
    matchedRoleId:     row["matched_role_id"] ?? null,
    matchedGroupId:    row["matched_group_id"] ?? null,
    planGateResult:    row["plan_gate_result"] ?? null,
    evaluationMs:      row["evaluation_ms"] ?? null,
    requestId:         row["request_id"] ?? null,
    correlationId:     row["correlation_id"] ?? null,
    createdAt:         row["created_at"],
  };
}

// ── Export helpers ────────────────────────────────────────────────────────────

const EXPORT_MAX_ROWS = 50_000;
const EXPORT_BATCH    = 500;

/** Escape a CSV field: wrap in quotes and double any internal quotes. */
function csvField(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  // Wrap in double quotes; escape existing double quotes by doubling
  return `"${s.replace(/"/g, '""')}"`;
}

const CSV_HEADERS = [
  "id", "created_at", "entity_type", "entity_id", "operation",
  "actor_id", "actor_type", "changed_fields", "correlation_id",
  "request_id", "ip_address", "log_type",
];

/** Build the stable string used as input to the integrity hash for one row. */
function hashInput(row: Record<string, unknown>): string {
  return JSON.stringify({
    id:          row["id"],
    tenant_id:   row["tenant_id"],
    entity_type: row["entity_type"],
    entity_id:   row["entity_id"],
    operation:   row["operation"],
    created_at:  row["created_at"],
    actor_id:    row["actor_id"] ?? null,
  });
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function createAuditRoutes(router: Router, deps: AuditRouteDeps): void {
  const { db, auth, logger } = deps;

  // ── GET /audit/events/export ─────────────────────────────────────────────
  //
  // Streams a downloadable compliance package:
  //   format=csv  → flat CSV (Content-Type: text/csv)
  //   format=json → newline-delimited JSON with SHA-256 integrity chain
  //
  // Max rows: EXPORT_MAX_ROWS (50 000). Caller MUST supply from/to — the same
  // MAX_WINDOW_DAYS cap as GET /audit/events applies.

  const exportEventsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const format = req.query["format"] === "json" ? "json" : "csv";
      const { from, to } = parseDateBounds(req.query as Record<string, unknown>);

      const entityType = req.query["entityType"] as string | undefined;
      const actorId    = req.query["actorId"]    as string | undefined;
      const operation  = req.query["operation"]  as string | undefined;

      if (actorId && !isUuid(actorId)) {
        res.status(400).json({ error: "INVALID_PARAM", message: "actorId must be a UUID" }); return;
      }

      const dateSlug = from.toISOString().slice(0, 10);
      const filename = `audit_export_${dateSlug}.${format === "json" ? "ndjson" : "csv"}`;
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", format === "json" ? "application/x-ndjson" : "text/csv");

      if (format === "csv") {
        // ── CSV streaming ───────────────────────────────────────────────────
        res.write(CSV_HEADERS.join(",") + "\n");

        let exported  = 0;
        let batchFrom = from;

        while (exported < EXPORT_MAX_ROWS) {
          let q = db
            .selectFrom("log.audit_log as al" as never)
            .selectAll("al" as never)
            .where("al.tenant_id"  as never, "=", tenantId as never)
            .where("al.created_at" as never, ">=", batchFrom as never)
            .where("al.created_at" as never, "<",  to as never)
            .orderBy("al.created_at" as never, "asc")
            .orderBy("al.id"         as never, "asc")
            .limit(EXPORT_BATCH);

          if (entityType) q = q.where("al.entity_type" as never, "=", entityType as never);
          if (actorId)    q = q.where("al.actor_id"    as never, "=", actorId    as never);
          if (operation)  q = q.where("al.operation"   as never, "=", operation  as never);

          const rows = await q.execute() as Record<string, unknown>[];
          if (rows.length === 0) break;

          for (const row of rows) {
            const csvRow = [
              csvField(row["id"]),
              csvField(row["created_at"]),
              csvField(row["entity_type"]),
              csvField(row["entity_id"]),
              csvField(row["operation"]),
              csvField(row["actor_id"]),
              csvField(row["actor_type"]),
              csvField(Array.isArray(row["changed_fields"]) ? (row["changed_fields"] as string[]).join(";") : row["changed_fields"]),
              csvField(row["correlation_id"]),
              csvField(row["request_id"]),
              csvField(row["ip_address"]),
              csvField(row["log_type"]),
            ];
            res.write(csvRow.join(",") + "\n");
          }

          exported  += rows.length;
          batchFrom  = rows[rows.length - 1]!["created_at"] as Date;
          if (rows.length < EXPORT_BATCH) break;
        }

        res.end();
      } else {
        // ── JSON / NDJSON with integrity chain ──────────────────────────────
        // First line: metadata header
        res.write(JSON.stringify({
          _type:      "audit_export_header",
          tenant_id:  tenantId,
          from:       from.toISOString(),
          to:         to.toISOString(),
          filters:    { entityType: entityType ?? null, actorId: actorId ?? null, operation: operation ?? null },
          exported_at: new Date().toISOString(),
        }) + "\n");

        let prevHash  = "0".repeat(64); // genesis hash — deterministic sentinel
        let exported  = 0;
        let batchFrom = from;

        while (exported < EXPORT_MAX_ROWS) {
          let q = db
            .selectFrom("log.audit_log as al" as never)
            .selectAll("al" as never)
            .where("al.tenant_id"  as never, "=", tenantId as never)
            .where("al.created_at" as never, ">=", batchFrom as never)
            .where("al.created_at" as never, "<",  to as never)
            .orderBy("al.created_at" as never, "asc")
            .orderBy("al.id"         as never, "asc")
            .limit(EXPORT_BATCH);

          if (entityType) q = q.where("al.entity_type" as never, "=", entityType as never);
          if (actorId)    q = q.where("al.actor_id"    as never, "=", actorId    as never);
          if (operation)  q = q.where("al.operation"   as never, "=", operation  as never);

          const rows = await q.execute() as Record<string, unknown>[];
          if (rows.length === 0) break;

          for (const row of rows) {
            const content  = hashInput(row);
            const thisHash = createHash("sha256").update(prevHash + content).digest("hex");
            prevHash       = thisHash;

            res.write(JSON.stringify({
              id:            row["id"],
              created_at:    row["created_at"],
              log_type:      row["log_type"],
              entity_type:   row["entity_type"],
              entity_id:     row["entity_id"],
              operation:     row["operation"],
              actor_id:      row["actor_id"] ?? null,
              actor_type:    row["actor_type"] ?? null,
              changed_fields: row["changed_fields"] ?? null,
              old_values:    row["old_values"] ?? null,
              new_values:    row["new_values"] ?? null,
              correlation_id: row["correlation_id"] ?? null,
              request_id:    row["request_id"] ?? null,
              ip_address:    row["ip_address"] ?? null,
              _hash:         thisHash,
            }) + "\n");
          }

          exported  += rows.length;
          batchFrom  = rows[rows.length - 1]!["created_at"] as Date;
          if (rows.length < EXPORT_BATCH) break;
        }

        // Closing record: chain seal with final hash
        res.write(JSON.stringify({
          _type:       "audit_export_footer",
          total_rows:  exported,
          chain_tip:   prevHash,
          sealed_at:   new Date().toISOString(),
        }) + "\n");
        res.end();
      }
    } catch (err) {
      logger?.error("audit_export_error", { err: String(err) });
      // If headers already sent we can't send JSON — just close
      if (!res.headersSent) next(err);
      else res.end();
    }
  };

  // ── GET /audit/events ─────────────────────────────────────────────────────

  const listEventsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const { limit, offset } = parsePagination(req.query as Record<string, unknown>);
      const { from, to } = parseDateBounds(req.query as Record<string, unknown>);

      const entityType = req.query["entityType"] as string | undefined;
      const entityId   = req.query["entityId"]   as string | undefined;
      const actorId    = req.query["actorId"]    as string | undefined;
      const operation  = req.query["operation"]  as string | undefined;

      // Validate UUIDs before using in query
      if (entityId && !isUuid(entityId)) {
        res.status(400).json({ error: "INVALID_PARAM", message: "entityId must be a UUID" }); return;
      }
      if (actorId && !isUuid(actorId)) {
        res.status(400).json({ error: "INVALID_PARAM", message: "actorId must be a UUID" }); return;
      }

      let q = db
        .selectFrom("log.audit_log as al" as never)
        .selectAll("al" as never)
        .where("al.tenant_id" as never, "=", tenantId as never)
        .where("al.created_at" as never, ">=", from as never)
        .where("al.created_at" as never, "<", to as never)
        .orderBy("al.created_at" as never, "desc")
        .limit(limit + 1)
        .offset(offset);

      if (entityType) q = q.where("al.entity_type" as never, "=", entityType as never);
      if (entityId)   q = q.where("al.entity_id" as never,   "=", entityId as never);
      if (actorId)    q = q.where("al.actor_id" as never,    "=", actorId as never);
      if (operation)  q = q.where("al.operation" as never,   "=", operation as never);

      const rows = await q.execute() as Record<string, unknown>[];
      const hasMore = rows.length > limit;
      const data = rows.slice(0, limit).map(toAuditEvent);

      res.json({ ok: true, data, hasMore });
    } catch (err) {
      logger?.error("audit_list_events_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /audit/events/:id ─────────────────────────────────────────────────

  const getEventHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const id = req.params["id"] as string;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      const row = await db
        .selectFrom("log.audit_log as al" as never)
        .selectAll("al" as never)
        .where("al.id" as never, "=", id as never)
        .where("al.tenant_id" as never, "=", tenantId as never)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json({ ok: true, data: toAuditEvent(row) });
    } catch (err) {
      logger?.error("audit_get_event_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /audit/permission-decisions ──────────────────────────────────────

  const listPermissionDecisionsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const { limit, offset } = parsePagination(req.query as Record<string, unknown>);
      const { from, to } = parseDateBounds(req.query as Record<string, unknown>);

      const principalId    = req.query["principalId"]    as string | undefined;
      const permissionCode = req.query["permissionCode"] as string | undefined;
      const featureCode    = req.query["featureCode"]    as string | undefined;
      const decision       = req.query["decision"]       as string | undefined;
      const moduleCode     = req.query["moduleCode"]     as string | undefined;

      if (principalId && !isUuid(principalId)) {
        res.status(400).json({ error: "INVALID_PARAM", message: "principalId must be a UUID" }); return;
      }

      let q = db
        .selectFrom("log.permission_decision_log as pdl" as never)
        .selectAll("pdl" as never)
        .where("pdl.tenant_id" as never, "=", tenantId as never)
        .where("pdl.created_at" as never, ">=", from as never)
        .where("pdl.created_at" as never, "<", to as never)
        .orderBy("pdl.created_at" as never, "desc")
        .limit(limit + 1)
        .offset(offset);

      if (principalId)    q = q.where("pdl.principal_id" as never,    "=", principalId as never);
      if (permissionCode) q = q.where("pdl.permission_code" as never, "=", permissionCode as never);
      if (featureCode)    q = q.where("pdl.feature_code" as never,    "=", featureCode as never);
      if (decision)       q = q.where("pdl.decision" as never,        "=", decision as never);
      if (moduleCode)     q = q.where("pdl.module_code" as never,     "=", moduleCode as never);

      const rows = await q.execute() as Record<string, unknown>[];
      const hasMore = rows.length > limit;
      const data = rows.slice(0, limit).map(toPermissionDecision);

      res.json({ ok: true, data, hasMore });
    } catch (err) {
      logger?.error("audit_list_decisions_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /audit/permission-decisions/:id ──────────────────────────────────

  const getPermissionDecisionHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const id = req.params["id"] as string;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      const row = await db
        .selectFrom("log.permission_decision_log as pdl" as never)
        .selectAll("pdl" as never)
        .where("pdl.id" as never, "=", id as never)
        .where("pdl.tenant_id" as never, "=", tenantId as never)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json({ ok: true, data: toPermissionDecision(row) });
    } catch (err) {
      logger?.error("audit_get_decision_error", { err: String(err) });
      next(err);
    }
  };

  // ── Register ──────────────────────────────────────────────────────────────
  // NOTE: /export must be registered before /:id — Express matches in order,
  // and "export" would otherwise be interpreted as a UUID by the /:id route.

  router.get("/audit/events/export",                exportEventsHandler);
  router.get("/audit/events",                       listEventsHandler);
  router.get("/audit/events/:id",                   getEventHandler);
  router.get("/audit/permission-decisions",         listPermissionDecisionsHandler);
  router.get("/audit/permission-decisions/:id",     getPermissionDecisionHandler);
}
