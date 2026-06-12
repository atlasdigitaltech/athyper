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
import { sql } from "kysely";
import {
  verifyBearer,
  isUuid,
  resolveTenantId,
  extractOrgHeaders,
  resolvePrincipalIdOrNull,
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
  created_at:    string | Date;
}

interface LifecycleRow {
  id:             string;
  operation_code: string | null;
  from_status:    string | null;
  to_status:      string;
  actor_id:       string | null;
  remarks:        string | null;
  payload:        Record<string, unknown> | string | null;
  created_at:     string | Date;
}

interface WorkflowLogRow {
  id:                  string;
  event_type:          string;
  from_status:         string | null;
  to_status:           string | null;
  action:              string | null;
  actor_id:            string | null;
  comment:             string | null;
  detail:              Record<string, unknown> | string | null;
  instance_id:         string;
  workflow_request_id: string;
  created_at:          string | Date;
}

interface AuditLogRow {
  id:             string;
  entity_type:    string;
  entity_id:      string;
  operation:      string;
  actor_id:       string | null;
  old_values:     Record<string, unknown> | string | null;
  new_values:     Record<string, unknown> | string | null;
  changed_fields: string[] | null;
  created_at:     string | Date;
}

interface JournalEntryRow {
  id:                string;
  je_number:         string;
  status:            string;
  description:       string | null;
  created_at:        string | Date;
  created_by:        string | null;
  updated_at:        string | Date | null;
  updated_by:        string | null;
  status_changed_at: string | Date | null;
  status_changed_by: string | null;
  posted_at:         string | Date | null;
  posted_by:         string | null;
}

interface ActivityEntryOut {
  id:            string;
  domain:        "document" | "workflow" | "accounting" | "payment" | "system";
  activity_type: string;
  description:   string;
  actor_name:    string | null;
  from_state:    string | null;
  to_state:      string | null;
  detail:        Record<string, unknown> | null;
  created_at:    string;
}

interface PersonaRow {
  principal_id:  string;
  display_name:  string | null;
}

interface RecentPickerOption {
  value: string;
  label: string;
  code?: string;
  description?: string;
  recordId?: string;
  raw?: Record<string, unknown>;
}

interface RecentPickerRow {
  detail: Record<string, unknown> | null;
  created_at: string | Date;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionFromBody(body: unknown): RecentPickerOption | null {
  const record = body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
  const rawOption = record["option"] && typeof record["option"] === "object" && !Array.isArray(record["option"])
    ? record["option"] as Record<string, unknown>
    : record;

  const value = stringValue(rawOption["value"]);
  const label = stringValue(rawOption["label"]);
  if (!value || !label) return null;

  const raw = rawOption["raw"] && typeof rawOption["raw"] === "object" && !Array.isArray(rawOption["raw"])
    ? rawOption["raw"] as Record<string, unknown>
    : undefined;

  return {
    value,
    label,
    code:        stringValue(rawOption["code"]),
    description: stringValue(rawOption["description"]),
    recordId:    stringValue(rawOption["recordId"]) ?? stringValue(raw?.["id"]),
    raw,
  };
}

function optionFromActivityDetail(detail: Record<string, unknown> | null): RecentPickerOption | null {
  const option = detail?.["option"];
  if (!option || typeof option !== "object" || Array.isArray(option)) return null;
  return optionFromBody(option);
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

function asIso(value: string | Date): string {
  return typeof value === "string" ? value : value.toISOString();
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function domainFromActivityType(activityType: string): "document" | "workflow" | "accounting" | "payment" | "system" {
  const [domain] = activityType.split(".");
  return domain === "document" || domain === "workflow" || domain === "accounting" || domain === "payment"
    ? domain
    : "system";
}

function activityTypeForLifecycle(row: LifecycleRow): string {
  switch (row.to_status) {
    case "created":
      return "document.ready";
    case "pending_approval":
      return "document.submitted";
    case "approved":
      return "document.approved";
    case "rejected":
      return "document.rejected";
    case "posted":
      return "accounting.posted";
    case "reversed":
      return "accounting.reversed";
    case "draft":
      return "document.reopened";
    default:
      return "document.updated";
  }
}

function describeLifecycleActivity(row: LifecycleRow): string {
  if (row.remarks) return row.remarks;
  const from = row.from_status?.replace(/_/g, " ") ?? "unknown";
  const to = row.to_status.replace(/_/g, " ");
  return `Status changed from ${from} to ${to}`;
}

function activityTypeForWorkflow(row: WorkflowLogRow): string {
  const action = row.action ?? "";
  if (row.event_type === "request_created") return "workflow.initiated";
  if (action === "approve" || row.to_status === "approved") return "workflow.approved";
  if (action === "reject" || row.to_status === "rejected") return "workflow.rejected";
  if (action === "delegate" || row.event_type === "item_reassigned") return "workflow.delegated";
  if (action === "escalate" || row.to_status === "escalated") return "workflow.escalated";
  return "workflow.initiated";
}

function describeWorkflowActivity(row: WorkflowLogRow): string {
  if (row.comment) return row.comment;
  switch (activityTypeForWorkflow(row)) {
    case "workflow.approved":
      return "Approval workflow approved";
    case "workflow.rejected":
      return "Approval workflow rejected";
    case "workflow.delegated":
      return "Approval workflow delegated";
    case "workflow.escalated":
      return "Approval workflow escalated";
    default:
      return "Approval workflow initiated";
  }
}

function activityTypeForAudit(row: AuditLogRow): string {
  if (row.entity_type === "journal_line") {
    if (row.operation === "insert") return "document.item_created";
    if (row.operation === "delete") return "document.item_deleted";
    return "document.item_updated";
  }
  if (row.operation === "insert") return "document.created";
  if (row.operation === "delete") return "document.deleted";
  return "document.updated";
}

function lineNoFromAudit(oldValues: Record<string, unknown>, newValues: Record<string, unknown>): string | null {
  const value = newValues["line_no"] ?? oldValues["line_no"];
  return typeof value === "number" || typeof value === "string" ? String(value) : null;
}

function describeAuditActivity(row: AuditLogRow, oldValues: Record<string, unknown>, newValues: Record<string, unknown>): string {
  if (row.entity_type === "journal_line") {
    const lineNo = lineNoFromAudit(oldValues, newValues);
    const label = lineNo ? `Journal line ${lineNo}` : "Journal line";
    if (row.operation === "insert") return `${label} added`;
    if (row.operation === "delete") return `${label} removed`;
    return `${label} updated`;
  }
  if (row.operation === "insert") return "Journal entry header created";
  if (row.operation === "delete") return "Journal entry header deleted";
  return "Journal entry header updated";
}

function auditFields(
  changedFields: string[] | null,
  oldValues: Record<string, unknown>,
  newValues: Record<string, unknown>,
): string[] {
  const fields = changedFields?.filter(Boolean);
  if (fields?.length) return fields;
  return [...new Set([...Object.keys(oldValues), ...Object.keys(newValues)])]
    .filter((field) => String(oldValues[field] ?? "") !== String(newValues[field] ?? ""))
    .sort();
}

function pickFields(record: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [field, record[field]]));
}

function activityTypeForJournalStatus(status: string): string {
  switch (status) {
    case "created":
      return "document.ready";
    case "pending_approval":
      return "document.submitted";
    case "approved":
      return "document.approved";
    case "rejected":
      return "document.rejected";
    case "posted":
      return "accounting.posted";
    case "reversed":
      return "accounting.reversed";
    case "draft":
      return "document.created";
    default:
      return "document.updated";
  }
}

function descriptionForJournalStatus(status: string): string {
  switch (status) {
    case "created":
      return "Journal entry marked ready";
    case "pending_approval":
      return "Journal entry submitted";
    case "approved":
      return "Journal entry approved";
    case "rejected":
      return "Journal entry rejected";
    case "posted":
      return "Journal entry posted";
    case "reversed":
      return "Journal entry reversed";
    case "draft":
      return "Journal entry draft created";
    default:
      return `Journal entry status changed to ${status.replace(/_/g, " ")}`;
  }
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

  const recentPickerHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "X-Org header is required" });
        return;
      }

      const principalId = await resolvePrincipalIdOrNull(db, String(claims["sub"] ?? ""), tenantId, xRealm);
      if (!principalId) {
        res.json({ data: [] });
        return;
      }

      const entityCode = String(req.params["entity"] ?? "").replace(/-/g, "_").trim();
      if (!entityCode) {
        res.status(400).json({ error: "INVALID_ENTITY", message: "Entity code is required" });
        return;
      }

      const limit = Math.min(10, Math.max(1, parseInt(String(req.query["limit"] ?? "5"), 10)));
      let rows: RecentPickerRow[] = [];

      try {
        const result = await sql<RecentPickerRow>`
          WITH latest AS (
            SELECT DISTINCT ON (COALESCE(al.entity_id::text, al.detail #>> '{option,value}'))
                   al.detail,
                   al.created_at,
                   COALESCE(al.entity_id::text, al.detail #>> '{option,value}') AS record_key
            FROM log.activity_log al
            WHERE al.tenant_id = ${tenantId}::uuid
              AND al.actor_id = ${principalId}::uuid
              AND al.domain = 'user'
              AND al.activity_type IN ('user.record_selected', 'user.record_view')
              AND al.entity_type = ${entityCode}
              AND al.detail ->> 'source' = 'entity_picker'
              AND COALESCE(al.entity_id::text, al.detail #>> '{option,value}') IS NOT NULL
            ORDER BY COALESCE(al.entity_id::text, al.detail #>> '{option,value}'), al.created_at DESC
          )
          SELECT detail, created_at
          FROM latest
          ORDER BY created_at DESC
          LIMIT ${limit}
        `.execute(db);
        rows = result.rows;
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === "42P01") rows = [];
        else throw err;
      }

      const data = rows
        .map((row) => optionFromActivityDetail(row.detail))
        .filter((option): option is RecentPickerOption => Boolean(option));

      res.json({ data });
    } catch (err) {
      logger?.error("activity_recent_picker_error", { err: String(err) });
      next(err);
    }
  };

  const rememberPickerHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "X-Org header is required" });
        return;
      }

      const principalId = await resolvePrincipalIdOrNull(db, String(claims["sub"] ?? ""), tenantId, xRealm);
      if (!principalId) {
        res.status(403).json({ error: "PRINCIPAL_NOT_FOUND", message: "No principal bound to this session" });
        return;
      }

      const entityCode = String(req.params["entity"] ?? "").replace(/-/g, "_").trim();
      const option = optionFromBody(req.body);
      if (!entityCode || !option) {
        res.status(400).json({ error: "INVALID_RECENT_PICKER_PAYLOAD", message: "Entity code and option are required" });
        return;
      }

      const recordId = option.recordId ?? option.value;
      const insertActivity = (activityType: "user.record_selected" | "user.record_view") => db
        .insertInto("log.activity_log" as never)
        .values({
          tenant_id:     tenantId,
          log_type:      "business",
          domain:        "user",
          activity_type: activityType,
          entity_type:   entityCode,
          entity_id:     isUuid(recordId) ? recordId : null,
          actor_id:      principalId,
          actor_type:    "principal",
          detail:        JSON.stringify({
            source:  "entity_picker",
            message: `Selected ${option.label}`,
            option,
          }),
          created_by:    principalId,
        } as never)
        .execute();

      try {
        await insertActivity("user.record_selected");
      } catch {
        await insertActivity("user.record_view");
      }

      res.status(204).send();
    } catch (err) {
      logger?.error("activity_remember_picker_error", { err: String(err) });
      next(err);
    }
  };

  router.get("/activity/recent-picker/:entity", recentPickerHandler);
  router.post("/activity/recent-picker/:entity", rememberPickerHandler);

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
      const sourceLimit = limit + offset;
      let rows: ActivityRow[] = [];
      let lifecycleRows: LifecycleRow[] = [];
      let workflowRows: WorkflowLogRow[] = [];
      let auditRows: AuditLogRow[] = [];
      let journalEntryRow: JournalEntryRow | null = null;

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
          .limit(sourceLimit);

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

      try {
        lifecycleRows = await db
          .selectFrom("log.entity_lifecycle_log as ell")
          .select([
            "ell.id",
            "ell.operation_code",
            "ell.from_status",
            "ell.to_status",
            "ell.actor_id",
            "ell.remarks",
            "ell.payload",
            "ell.created_at",
          ] as never[])
          .where("ell.tenant_id" as never, "=", tenantId as never)
          .where("ell.entity_type" as never, "=", entityCode as never)
          .where("ell.entity_id" as never, "=", recordId as never)
          .orderBy("ell.created_at" as never, "desc")
          .limit(sourceLimit)
          .execute() as LifecycleRow[];
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === "42P01") lifecycleRows = [];
        else {
          logger?.warn("activity_lifecycle_query_error", { entityCode, recordId, err: String(err) });
          lifecycleRows = [];
        }
      }

      try {
        const result = await sql<WorkflowLogRow>`
          SELECT wel.id,
                 wel.event_type,
                 wel.from_status,
                 wel.to_status,
                 wel.action,
                 wel.actor_id,
                 wel.comment,
                 wel.detail,
                 wel.instance_id,
                 wr.id AS workflow_request_id,
                 wel.created_at
            FROM log.workflow_event_log wel
            JOIN document.workflow_request wr
              ON wr.id::text = wel.instance_id
           WHERE wel.tenant_id = ${tenantId}::uuid
             AND wr.tenant_id = ${tenantId}::uuid
             AND wr.entity_type = ${entityCode}
             AND wr.entity_id = ${recordId}
           ORDER BY wel.created_at DESC
           LIMIT ${sourceLimit}
        `.execute(db);
        workflowRows = result.rows;
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === "42P01") workflowRows = [];
        else {
          logger?.warn("activity_workflow_query_error", { entityCode, recordId, err: String(err) });
          workflowRows = [];
        }
      }

      if (entityCode === "journal_entry") {
        try {
          const result = await sql<JournalEntryRow>`
            SELECT je.id,
                   je.je_number,
                   je.status,
                   je.description,
                   je.created_at,
                   je.created_by,
                   je.updated_at,
                   je.updated_by,
                   je.status_changed_at,
                   je.status_changed_by,
                   je.posted_at,
                   je.posted_by
              FROM document.journal_entry je
             WHERE je.tenant_id = ${tenantId}::uuid
               AND je.id = ${recordId}::uuid
             LIMIT 1
          `.execute(db);
          journalEntryRow = result.rows[0] ?? null;
        } catch (err) {
          const code = (err as { code?: string }).code;
          if (code === "42P01") journalEntryRow = null;
          else {
            logger?.warn("activity_journal_entry_query_error", { recordId, err: String(err) });
            journalEntryRow = null;
          }
        }

        try {
          const result = await sql<AuditLogRow>`
            SELECT al.id,
                   al.entity_type,
                   al.entity_id,
                   al.operation,
                   al.actor_id,
                   al.old_values,
                   al.new_values,
                   al.changed_fields,
                   al.created_at
              FROM log.audit_log al
             WHERE al.tenant_id = ${tenantId}::uuid
               AND al.operation <> 'status_change'
               AND (
                 (al.entity_type = 'journal_entry' AND al.entity_id = ${recordId}::uuid)
                 OR (
                   al.entity_type = 'journal_line'
                   AND COALESCE(al.new_values ->> 'journal_entry_id', al.old_values ->> 'journal_entry_id') = ${recordId}
                 )
               )
             ORDER BY al.created_at DESC
             LIMIT ${sourceLimit}
          `.execute(db);
          auditRows = result.rows;
        } catch (err) {
          const code = (err as { code?: string }).code;
          if (code === "42P01") auditRows = [];
          else {
            logger?.warn("activity_audit_query_error", { recordId, err: String(err) });
            auditRows = [];
          }
        }
      }

      // ── Enrich with actor display names ───────────────────────────────────────
      const actorIds = [...new Set([
        ...rows.map((r) => r.actor_id),
        ...lifecycleRows.map((r) => r.actor_id),
        ...workflowRows.map((r) => r.actor_id),
        ...auditRows.map((r) => r.actor_id),
        journalEntryRow?.created_by,
        journalEntryRow?.status_changed_by,
        journalEntryRow?.updated_by,
        journalEntryRow?.posted_by,
      ].filter(Boolean))] as string[];
      const personas: PersonaRow[] = actorIds.length > 0
        ? await db
            .selectFrom("master.principal_profile as pe")
            .select(["pe.principal_id", "pe.display_name"] as never[])
            .where("pe.principal_id" as never, "in", actorIds as never)
            .execute() as PersonaRow[]
        : [];

      const personaMap = new Map(personas.map((p) => [p.principal_id, p.display_name]));

      // ── Map to ActivityEntry ──────────────────────────────────────────────────
      const activityEntries: ActivityEntryOut[] = rows.map((row) => {
        const detail = jsonRecord(row.detail);
        return {
          id:            row.id,
          domain:        (["document", "workflow", "accounting", "payment", "system"].includes(row.domain)
            ? row.domain : "system") as "document" | "workflow" | "accounting" | "payment" | "system",
          activity_type: row.activity_type,
          description:   describeActivity(row),
          actor_name:    row.actor_id ? (personaMap.get(row.actor_id) ?? null) : null,
          from_state:    detail?.["from_state"] as string | null ?? null,
          to_state:      detail?.["to_state"] as string | null ?? null,
          detail,
          created_at:    asIso(row.created_at),
        };
      });

      const lifecycleEntries: ActivityEntryOut[] = lifecycleRows.map((row) => {
        const activityType = activityTypeForLifecycle(row);
        const payload = jsonRecord(row.payload) ?? {};
        return {
          id:            row.id,
          domain:        domainFromActivityType(activityType),
          activity_type: activityType,
          description:   describeLifecycleActivity(row),
          actor_name:    row.actor_id ? (personaMap.get(row.actor_id) ?? null) : null,
          from_state:    row.from_status,
          to_state:      row.to_status,
          detail:        {
            ...payload,
            source_log:     "log.entity_lifecycle_log",
            operation_code: row.operation_code,
            entity_table:   entityCode,
            entity_id:      recordId,
          },
          created_at:    asIso(row.created_at),
        };
      });

      const workflowEntries: ActivityEntryOut[] = workflowRows.map((row) => {
        const activityType = activityTypeForWorkflow(row);
        const detail = jsonRecord(row.detail) ?? {};
        return {
          id:            row.id,
          domain:        "workflow",
          activity_type: activityType,
          description:   describeWorkflowActivity(row),
          actor_name:    row.actor_id ? (personaMap.get(row.actor_id) ?? null) : null,
          from_state:    row.from_status,
          to_state:      row.to_status,
          detail:        {
            ...detail,
            source_log:          "log.workflow_event_log",
            event_type:          row.event_type,
            action:              row.action,
            comment:             row.comment,
            workflow_request_id: row.workflow_request_id,
            instance_id:         row.instance_id,
          },
          created_at:    asIso(row.created_at),
        };
      });

      const auditEntries: ActivityEntryOut[] = auditRows.map((row) => {
        const oldValues = jsonRecord(row.old_values) ?? {};
        const newValues = jsonRecord(row.new_values) ?? {};
        const fields = auditFields(row.changed_fields, oldValues, newValues);
        const before = row.operation === "insert" ? {} : pickFields(oldValues, fields);
        const after = row.operation === "delete" ? {} : pickFields(newValues, fields);
        const activityType = activityTypeForAudit(row);
        const lineNo = lineNoFromAudit(oldValues, newValues);

        return {
          id:            row.id,
          domain:        domainFromActivityType(activityType),
          activity_type: activityType,
          description:   describeAuditActivity(row, oldValues, newValues),
          actor_name:    row.actor_id ? (personaMap.get(row.actor_id) ?? null) : null,
          from_state:    null,
          to_state:      null,
          detail:        {
            source_log:     "log.audit_log",
            entity_table:   row.entity_type,
            entity_id:      row.entity_id,
            operation:      row.operation,
            changed_fields: fields,
            ...(lineNo ? { line_no: lineNo } : {}),
            before,
            after,
          },
          created_at:    asIso(row.created_at),
        };
      });

      const rowDerivedEntries: ActivityEntryOut[] = [];
      if (journalEntryRow) {
        const hasCreatedEvent =
          rows.some((row) => row.activity_type === "document.created") ||
          auditRows.some((row) => row.entity_type === "journal_entry" && row.operation === "insert");

        if (!hasCreatedEvent) {
          rowDerivedEntries.push({
            id:            `${recordId}:draft-created`,
            domain:        "document",
            activity_type: "document.created",
            description:   "Journal entry draft created",
            actor_name:    journalEntryRow.created_by ? (personaMap.get(journalEntryRow.created_by) ?? null) : null,
            from_state:    null,
            to_state:      "draft",
            detail:        {
              source_log:     "document.journal_entry",
              entity_table:   "journal_entry",
              entity_id:      recordId,
              operation:      "row_snapshot",
              changed_fields: ["status"],
              je_number:      journalEntryRow.je_number,
              before:         {},
              after:          { status: "draft" },
            },
            created_at:    asIso(journalEntryRow.created_at),
          });
        }

        if (journalEntryRow.status !== "draft") {
          const activityType = activityTypeForJournalStatus(journalEntryRow.status);
          const hasStatusEvent =
            rows.some((row) => row.activity_type === activityType) ||
            lifecycleRows.some((row) => row.to_status === journalEntryRow.status);
          const occurredAt = journalEntryRow.status === "posted"
            ? journalEntryRow.posted_at ?? journalEntryRow.status_changed_at ?? journalEntryRow.updated_at
            : journalEntryRow.status_changed_at ?? journalEntryRow.updated_at;

          if (!hasStatusEvent && occurredAt) {
            const actorId = journalEntryRow.status === "posted"
              ? journalEntryRow.posted_by ?? journalEntryRow.status_changed_by ?? journalEntryRow.updated_by ?? journalEntryRow.created_by
              : journalEntryRow.status_changed_by ?? journalEntryRow.updated_by ?? journalEntryRow.created_by;

            rowDerivedEntries.push({
              id:            `${recordId}:status-${journalEntryRow.status}`,
              domain:        domainFromActivityType(activityType),
              activity_type: activityType,
              description:   descriptionForJournalStatus(journalEntryRow.status),
              actor_name:    actorId ? (personaMap.get(actorId) ?? null) : null,
              from_state:    "draft",
              to_state:      journalEntryRow.status,
              detail:        {
                source_log:     "document.journal_entry",
                entity_table:   "journal_entry",
                entity_id:      recordId,
                operation:      "row_snapshot",
                changed_fields: ["status"],
                je_number:      journalEntryRow.je_number,
                before:         { status: "draft" },
                after:          { status: journalEntryRow.status },
              },
              created_at:    asIso(occurredAt),
            });
          }
        }
      }

      const combined = [...activityEntries, ...lifecycleEntries, ...workflowEntries, ...auditEntries, ...rowDerivedEntries]
        .filter((entry) => !domain || domain === "all" || entry.domain === domain)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      const data = combined.slice(offset, offset + limit);

      res.json({ data });
    } catch (err) {
      logger?.error("activity_route_error", { err: String(err) });
      next(err);
    }
  };

  router.get("/activity/:entity/:id", handler);

  return router;
}
