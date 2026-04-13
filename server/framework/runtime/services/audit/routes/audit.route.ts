/**
 * Audit Query Routes
 *
 * GET /audit/events                  — paginated entity mutation trail (log.audit_log)
 * GET /audit/events/:id              — single audit event
 * GET /audit/permission-decisions    — paginated auth-engine decisions (log.permission_decision_log)
 * GET /audit/permission-decisions/:id — single permission decision
 *
 * Both tables are partitioned by created_at. All queries require a date range
 * bound to avoid full-table scans. Tenant isolation via RLS — tenant resolved
 * from bearer token, not a manual WHERE filter.
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
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

// ── Route factory ─────────────────────────────────────────────────────────────

export function createAuditRoutes(router: Router, deps: AuditRouteDeps): void {
  const { db, auth, logger } = deps;

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

  router.get("/audit/events",                       listEventsHandler);
  router.get("/audit/events/:id",                   getEventHandler);
  router.get("/audit/permission-decisions",         listPermissionDecisionsHandler);
  router.get("/audit/permission-decisions/:id",     getPermissionDecisionHandler);
}
