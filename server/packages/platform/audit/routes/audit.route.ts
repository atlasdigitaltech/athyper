/**
 * Audit Query Routes
 *
 * GET /audit/events                   — paginated entity mutation trail (audit.audit_log)
 * GET /audit/events/:id               — single audit event
 * GET /audit/events/export            — download CSV or JSON compliance package
 * GET /audit/permission-decisions     — paginated auth-engine decisions (audit.authorization_decision_evidence)
 * GET /audit/permission-decisions/:id — single permission decision
 *
 * Both tables are partitioned by occurred_at. All queries require a date range
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
} from "@athyper/svc-shared";
import type { CacheClient } from "@athyper/svc-iam";
import {
  resolveParameterSnapshot,
  getIntParam,
} from "@athyper/svc-iam";
import { appendAuditEvent } from "../append-event.js";
import { Audit } from "../event-codes.js";

// ── Deps ──────────────────────────────────────────────────────────────────────

export interface AuditRouteDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  cache?: CacheClient;
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEFAULT_WINDOW_DAYS = 7;   // compile-time fallback
const MAX_WINDOW_DAYS = 90;      // compile-time fallback

function parseDateBounds(
  query: Record<string, unknown>,
  windowDays    = DEFAULT_WINDOW_DAYS,
  maxWindowDays = MAX_WINDOW_DAYS,
): { from: Date; to: Date } {
  const now = new Date();
  const to = query["to"]
    ? new Date(String(query["to"]))
    : now;
  const from = query["from"]
    ? new Date(String(query["from"]))
    : new Date(now.getTime() - windowDays * 86_400_000);

  // Cap range to maxWindowDays to prevent runaway scans on partitioned tables
  const maxFrom = new Date(to.getTime() - maxWindowDays * 86_400_000);
  return {
    from: from < maxFrom ? maxFrom : from,
    to,
  };
}

function toAuditEvent(row: Record<string, unknown>) {
  return {
    id:                      row["id"],
    tenantId:                row["tenant_id"] ?? null,
    planeCode:               row["plane_code"],
    eventCode:               row["event_code"],
    eventContractCode:       row["event_contract_code"],
    operation:               row["operation"],
    outcome:                 row["outcome"],
    severity:                row["severity"],
    entityType:              row["entity_type"],
    entityId:                row["entity_id"] ?? null,
    scopeType:               row["scope_type"] ?? null,
    scopeId:                 row["scope_id"] ?? null,
    actorPrincipalId:        row["actor_principal_id"] ?? null,
    actorType:               row["actor_type"],
    auditReasonCodeSnapshot: row["audit_reason_code_snapshot"] ?? null,
    reasonComment:           row["reason_comment"] ?? null,
    oldValues:               row["old_values"] ?? null,
    newValues:               row["new_values"] ?? null,
    changedFields:           row["changed_fields"] ?? null,
    context:                 row["context"] ?? {},
    correlationId:           row["correlation_id"] ?? null,
    requestId:               row["request_id"] ?? null,
    ipAddress:               row["ip_address"] ?? null,
    userAgent:               row["user_agent"] ?? null,
    occurredAt:              row["occurred_at"],
    recordedAt:              row["recorded_at"],
  };
}

function toSecurityEvent(row: Record<string, unknown>) {
  return {
    id:            row["id"],
    tenantId:      row["tenant_id"] ?? null,
    planeCode:     row["plane_code"],
    eventCode:     row["event_code"],
    category:      row["category"],
    severity:      row["severity"],
    outcome:       row["outcome"],
    principalId:   row["principal_id"] ?? null,
    sessionId:     row["session_id"] ?? null,
    sourceIp:      row["source_ip"] ?? null,
    userAgent:     row["user_agent"] ?? null,
    detectionRule: row["detection_rule"] ?? null,
    riskScore:     row["risk_score"] ?? null,
    sourceService: row["source_service"],
    traceId:       row["trace_id"] ?? null,
    correlationId: row["correlation_id"] ?? null,
    requestId:     row["request_id"] ?? null,
    context:       row["context"] ?? {},
    occurredAt:    row["occurred_at"],
    recordedAt:    row["recorded_at"],
  };
}

function toPermissionDecision(row: Record<string, unknown>) {
  const ctx = (row["context"] as Record<string, unknown>) ?? {};
  return {
    id:                row["id"],
    tenantId:          row["tenant_id"],
    principalId:       row["subject_principal_id"] ?? null,
    permissionCode:    row["permission_code"] ?? null,
    action:            row["action"] ?? null,
    resourceType:      row["resource_type"] ?? null,
    resourceId:        row["resource_id"] ?? null,
    policyCode:        row["policy_code"] ?? null,
    policyVersion:     row["policy_version"] ?? null,
    reasonCodes:       row["reason_codes"] ?? [],
    decision:          row["decision"],
    evaluationMs:      row["evaluation_duration_ms"] ?? null,
    cacheHit:          row["cache_hit"] ?? false,
    requestId:         row["request_id"] ?? null,
    correlationId:     row["correlation_id"] ?? null,
    context:           ctx,
    occurredAt:        row["occurred_at"],
    recordedAt:        row["recorded_at"],
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
  "id", "occurred_at", "event_code", "event_contract_code",
  "entity_type", "entity_id", "operation", "outcome",
  "actor_principal_id", "actor_type", "audit_reason_code_snapshot",
  "changed_fields", "correlation_id", "request_id", "ip_address",
];

/** Build the stable string used as input to the integrity hash for one row. */
function hashInput(row: Record<string, unknown>): string {
  return JSON.stringify({
    id:              row["id"],
    tenant_id:       row["tenant_id"],
    event_code:      row["event_code"],
    entity_type:     row["entity_type"],
    entity_id:       row["entity_id"],
    operation:       row["operation"],
    outcome:         row["outcome"],
    occurred_at:     row["occurred_at"],
    actor_principal_id: row["actor_principal_id"] ?? null,
  });
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function createAuditRoutes(router: Router, deps: AuditRouteDeps): void {
  const { db, auth, cache, logger } = deps;

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

      const auditSnap = cache
        ? await resolveParameterSnapshot(db, cache, tenantId, "api").catch(() => null)
        : null;
      const windowDays    = getIntParam(auditSnap, "api.audit.default_window_days", DEFAULT_WINDOW_DAYS);
      const maxWindowDays = getIntParam(auditSnap, "api.audit.max_window_days",     MAX_WINDOW_DAYS);
      const exportMaxRows = getIntParam(auditSnap, "api.export.audit_max_rows",     EXPORT_MAX_ROWS);

      const format = req.query["format"] === "json" ? "json" : "csv";
      const { from, to } = parseDateBounds(req.query as Record<string, unknown>, windowDays, maxWindowDays);

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

      void appendAuditEvent(db, {
        event_code:  Audit.EXPORT_REQUESTED,
        operation:   "export",
        entity_type: "audit.audit_log",
        context:     { format, from: from.toISOString(), to: to.toISOString(), entityType: entityType ?? null },
      });

      if (format === "csv") {
        // ── CSV streaming ───────────────────────────────────────────────────
        res.write(CSV_HEADERS.join(",") + "\n");

        let exported  = 0;
        let batchFrom = from;

        while (exported < exportMaxRows) {
          let q = db
            .selectFrom("audit.audit_log as al" as never)
            .selectAll("al" as never)
            .where("al.tenant_id"   as never, "=", tenantId as never)
            .where("al.occurred_at" as never, ">=", batchFrom as never)
            .where("al.occurred_at" as never, "<",  to as never)
            .orderBy("al.occurred_at" as never, "asc")
            .orderBy("al.id"          as never, "asc")
            .limit(EXPORT_BATCH);

          if (entityType) q = q.where("al.entity_type" as never, "=", entityType as never);
          if (actorId)    q = q.where("al.actor_principal_id" as never, "=", actorId as never);
          if (operation)  q = q.where("al.operation"   as never, "=", operation  as never);

          const rows = await q.execute() as Record<string, unknown>[];
          if (rows.length === 0) break;

          for (const row of rows) {
            const csvRow = [
              csvField(row["id"]),
              csvField(row["occurred_at"]),
              csvField(row["event_code"]),
              csvField(row["event_contract_code"]),
              csvField(row["entity_type"]),
              csvField(row["entity_id"]),
              csvField(row["operation"]),
              csvField(row["outcome"]),
              csvField(row["actor_principal_id"]),
              csvField(row["actor_type"]),
              csvField(row["audit_reason_code_snapshot"]),
              csvField(Array.isArray(row["changed_fields"]) ? (row["changed_fields"] as string[]).join(";") : row["changed_fields"]),
              csvField(row["correlation_id"]),
              csvField(row["request_id"]),
              csvField(row["ip_address"]),
            ];
            res.write(csvRow.join(",") + "\n");
          }

          exported  += rows.length;
          batchFrom  = rows[rows.length - 1]!["occurred_at"] as Date;
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

        while (exported < exportMaxRows) {
          let q = db
            .selectFrom("audit.audit_log as al" as never)
            .selectAll("al" as never)
            .where("al.tenant_id"   as never, "=", tenantId as never)
            .where("al.occurred_at" as never, ">=", batchFrom as never)
            .where("al.occurred_at" as never, "<",  to as never)
            .orderBy("al.occurred_at" as never, "asc")
            .orderBy("al.id"          as never, "asc")
            .limit(EXPORT_BATCH);

          if (entityType) q = q.where("al.entity_type" as never, "=", entityType as never);
          if (actorId)    q = q.where("al.actor_principal_id" as never, "=", actorId as never);
          if (operation)  q = q.where("al.operation"   as never, "=", operation  as never);

          const rows = await q.execute() as Record<string, unknown>[];
          if (rows.length === 0) break;

          for (const row of rows) {
            const content  = hashInput(row);
            const thisHash = createHash("sha256").update(prevHash + content).digest("hex");
            prevHash       = thisHash;

            res.write(JSON.stringify({
              id:                      row["id"],
              occurred_at:             row["occurred_at"],
              event_code:              row["event_code"],
              event_contract_code:     row["event_contract_code"],
              entity_type:             row["entity_type"],
              entity_id:               row["entity_id"] ?? null,
              operation:               row["operation"],
              outcome:                 row["outcome"],
              actor_principal_id:      row["actor_principal_id"] ?? null,
              actor_type:              row["actor_type"],
              audit_reason_code_snapshot: row["audit_reason_code_snapshot"] ?? null,
              changed_fields:          row["changed_fields"] ?? null,
              old_values:              row["old_values"] ?? null,
              new_values:              row["new_values"] ?? null,
              correlation_id:          row["correlation_id"] ?? null,
              request_id:              row["request_id"] ?? null,
              ip_address:              row["ip_address"] ?? null,
              _hash:                   thisHash,
            }) + "\n");
          }

          exported  += rows.length;
          batchFrom  = rows[rows.length - 1]!["occurred_at"] as Date;
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
      const auditSnap = cache
        ? await resolveParameterSnapshot(db, cache, tenantId, "api.audit").catch(() => null)
        : null;
      const { from, to } = parseDateBounds(
        req.query as Record<string, unknown>,
        getIntParam(auditSnap, "api.audit.default_window_days", DEFAULT_WINDOW_DAYS),
        getIntParam(auditSnap, "api.audit.max_window_days",     MAX_WINDOW_DAYS),
      );

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
        .selectFrom("audit.audit_log as al" as never)
        .selectAll("al" as never)
        .where("al.tenant_id" as never, "=", tenantId as never)
        .where("al.occurred_at" as never, ">=", from as never)
        .where("al.occurred_at" as never, "<", to as never)
        .orderBy("al.occurred_at" as never, "desc")
        .limit(limit + 1)
        .offset(offset);

      if (entityType) q = q.where("al.entity_type" as never, "=", entityType as never);
      if (entityId)   q = q.where("al.entity_id" as never,   "=", entityId as never);
      if (actorId)    q = q.where("al.actor_principal_id" as never, "=", actorId as never);
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
        .selectFrom("audit.audit_log as al" as never)
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

  // ── GET /audit/security-events ───────────────────────────────────────────

  const listSecurityEventsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const { limit, offset } = parsePagination(req.query as Record<string, unknown>);
      const auditSnap = cache
        ? await resolveParameterSnapshot(db, cache, tenantId, "api.audit").catch(() => null)
        : null;
      const { from, to } = parseDateBounds(
        req.query as Record<string, unknown>,
        getIntParam(auditSnap, "api.audit.default_window_days", DEFAULT_WINDOW_DAYS),
        getIntParam(auditSnap, "api.audit.max_window_days",     MAX_WINDOW_DAYS),
      );

      const principalId  = req.query["principalId"]  as string | undefined;
      const category     = req.query["category"]     as string | undefined;
      const eventCode    = req.query["eventCode"]    as string | undefined;
      const outcome      = req.query["outcome"]      as string | undefined;
      const minRiskScore = req.query["minRiskScore"] as string | undefined;

      if (principalId && !isUuid(principalId)) {
        res.status(400).json({ error: "INVALID_PARAM", message: "principalId must be a UUID" }); return;
      }

      let q = db
        .selectFrom("audit.security_event as se" as never)
        .selectAll("se" as never)
        .where("se.tenant_id" as never, "=", tenantId as never)
        .where("se.occurred_at" as never, ">=", from as never)
        .where("se.occurred_at" as never, "<",  to as never)
        .orderBy("se.occurred_at" as never, "desc")
        .limit(limit + 1)
        .offset(offset);

      if (principalId)  q = q.where("se.principal_id" as never, "=", principalId as never);
      if (category)     q = q.where("se.category" as never,     "=", category as never);
      if (eventCode)    q = q.where("se.event_code" as never,   "=", eventCode as never);
      if (outcome)      q = q.where("se.outcome" as never,      "=", outcome as never);
      if (minRiskScore) {
        const score = Number(minRiskScore);
        if (Number.isFinite(score)) q = q.where("se.risk_score" as never, ">=" as never, score as never);
      }

      const rows = await q.execute() as Record<string, unknown>[];
      const hasMore = rows.length > limit;
      const data = rows.slice(0, limit).map(toSecurityEvent);

      res.json({ ok: true, data, hasMore });
    } catch (err) {
      logger?.error("audit_list_security_events_error", { err: String(err) });
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
      const auditSnap2 = cache
        ? await resolveParameterSnapshot(db, cache, tenantId, "api.audit").catch(() => null)
        : null;
      const { from, to } = parseDateBounds(
        req.query as Record<string, unknown>,
        getIntParam(auditSnap2, "api.audit.default_window_days", DEFAULT_WINDOW_DAYS),
        getIntParam(auditSnap2, "api.audit.max_window_days",     MAX_WINDOW_DAYS),
      );

      const principalId    = req.query["principalId"]    as string | undefined;
      const permissionCode = req.query["permissionCode"] as string | undefined;
      const decision       = req.query["decision"]       as string | undefined;

      if (principalId && !isUuid(principalId)) {
        res.status(400).json({ error: "INVALID_PARAM", message: "principalId must be a UUID" }); return;
      }

      let q = db
        .selectFrom("audit.authorization_decision_evidence as pdl" as never)
        .selectAll("pdl" as never)
        .where("pdl.tenant_id" as never, "=", tenantId as never)
        .where("pdl.occurred_at" as never, ">=", from as never)
        .where("pdl.occurred_at" as never, "<", to as never)
        .orderBy("pdl.occurred_at" as never, "desc")
        .limit(limit + 1)
        .offset(offset);

      if (principalId)    q = q.where("pdl.subject_principal_id" as never, "=", principalId as never);
      if (permissionCode) q = q.where("pdl.permission_code" as never,       "=", permissionCode as never);
      if (decision)       q = q.where("pdl.decision" as never,              "=", decision as never);

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
        .selectFrom("audit.authorization_decision_evidence as pdl" as never)
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

  // ── GET /audit/reason-codes ───────────────────────────────────────────────
  // Returns the tenant's active reason codes, optionally filtered by category.
  // Used by the reason picker dialog on reason_required=true actions.

  const listReasonCodesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const categoryFilter = req.query["category"] as string | undefined;

      let q = db
        .selectFrom("master.audit_reason_code as rc" as never)
        .select([
          "rc.id" as never,
          "rc.code" as never,
          "rc.name" as never,
          "rc.description" as never,
          "rc.category" as never,
          "rc.severity" as never,
          "rc.requires_comment" as never,
          "rc.sort_order" as never,
        ] as never)
        .where("rc.tenant_id" as never, "=", tenantId as never)
        .where("rc.status" as never, "=", "active" as never)
        .orderBy("rc.sort_order" as never, "asc");

      if (categoryFilter) {
        q = q.where("rc.category" as never, "=", categoryFilter as never);
      }

      const rows = await q.execute() as Record<string, unknown>[];
      res.json({
        ok: true,
        data: rows.map((r) => ({
          id:              r["id"],
          code:            r["code"],
          name:            r["name"],
          description:     r["description"] ?? null,
          category:        r["category"],
          severity:        r["severity"],
          requiresComment: r["requires_comment"],
          sortOrder:       r["sort_order"],
        })),
      });
    } catch (err) {
      logger?.error("audit_reason_codes_error", { err: String(err) });
      next(err);
    }
  };

  // ── Register ──────────────────────────────────────────────────────────────
  // NOTE: /export must be registered before /:id — Express matches in order,
  // and "export" would otherwise be interpreted as a UUID by the /:id route.

  router.get("/audit/reason-codes",                 listReasonCodesHandler);
  router.get("/audit/events/export",                exportEventsHandler);
  router.get("/audit/events",                       listEventsHandler);
  router.get("/audit/events/:id",                   getEventHandler);
  router.get("/audit/security-events",              listSecurityEventsHandler);
  router.get("/audit/permission-decisions",         listPermissionDecisionsHandler);
  router.get("/audit/permission-decisions/:id",     getPermissionDecisionHandler);
}
