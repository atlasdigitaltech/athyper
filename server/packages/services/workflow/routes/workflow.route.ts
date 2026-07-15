/**
 * Workflow Routes
 *
 * GET  /workflow/inbox/count              — pending work_item count for current user
 * GET  /workflow/inbox                    — paginated inbox list
 * GET  /workflow/requests/:id             — full approval context (request + stages + work_items)
 * GET  /workflow/requests/:id/context     — alias for /:id (used by WorkflowClient.getApprovalContext)
 * POST /workflow/requests/:id/action      — approve / reject / delegate / escalate (requestId in path)
 * POST /workflow/items/:id/action         — approve / reject / delegate / escalate (workItemId in path)
 * GET  /workflow/requests/:id/activity    — workflow_event_log for a request
 * GET  /workflow/reports/compliance       — compliance KPIs: avg approval time, SLA breach rate, rejection rate
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import {
  verifyBearer,
  resolveTenantId,
  resolvePrincipalIdOrNull,
  isUuid,
  extractOrgHeaders,
  withDomainSpan,
} from "@athyper/svc-shared";
import { createWorkflowEngine } from "../engine-factory.js";
import type { WorkflowSourceEntityAdapter } from "../source-entity-adapter.js";

// ── Deps ─────────────────────────────────────────────────────────────────────

export interface WorkflowRouteDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
  };
  sourceEntityAdapter?: WorkflowSourceEntityAdapter;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function engineError(err: unknown): { status: number; body: { error: string; message: string } } {
  const e = err as { code?: number; message?: string };
  const status = typeof e.code === "number" && e.code >= 400 && e.code < 600 ? e.code : 500;
  const message = e.message ?? "Internal workflow error";
  const error = message.split(":")[0] ?? "WORKFLOW_ERROR";
  return { status, body: { error, message } };
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function createWorkflowRoutes(router: Router, deps: WorkflowRouteDeps): void {
  const { db, auth, logger } = deps;
  const engine = createWorkflowEngine({ db, logger, sourceEntityAdapter: deps.sourceEntityAdapter });

  // ── GET /workflow/inbox/count ─────────────────────────────────────────────

  const inboxCountHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ count: 0 }); return; }

      const sub = claims["sub"] as string ?? "";
      const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm);
      if (!principalId) { res.json({ count: 0 }); return; }

      const count = await engine.getInboxCount({ principalId, tenantId });
      res.json({ count });
    } catch (err) {
      logger?.error("workflow_inbox_count_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /workflow/inbox ───────────────────────────────────────────────────

  const inboxHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ items: [], total: 0 }); return; }

      const sub = claims["sub"] as string ?? "";
      const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm);
      if (!principalId) { res.json({ items: [], total: 0 }); return; }

      const limit  = Math.min(parseInt(String(req.query["limit"]  ?? "50"), 10), 200);
      const offset = Math.max(parseInt(String(req.query["offset"] ?? "0"),  10), 0);

      const result = await engine.getInbox({ principalId, tenantId, limit, offset });
      res.json(result);
    } catch (err) {
      logger?.error("workflow_inbox_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /workflow/requests/:id ────────────────────────────────────────────

  const requestDetailHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const requestId = (req.params["id"] as string | undefined)?.trim();
      if (!requestId || !isUuid(requestId)) {
        res.status(400).json({ error: "INVALID_ID", message: "request id must be a UUID" });
        return;
      }

      const detail = await engine.getRequestDetail({ requestId, tenantId });
      if (!detail) {
        res.status(404).json({ error: "NOT_FOUND", message: "workflow request not found" });
        return;
      }
      res.json(detail);
    } catch (err) {
      logger?.error("workflow_request_detail_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /workflow/requests/:id/action ────────────────────────────────────

  const actionHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const requestId = (req.params["id"] as string | undefined)?.trim();
      if (!requestId || !isUuid(requestId)) {
        res.status(400).json({ error: "INVALID_ID", message: "request id must be a UUID" });
        return;
      }

      const body = req.body as Record<string, unknown> ?? {};
      const workItemId = body["work_item_id"] as string | undefined;
      const action     = body["action"]       as string | undefined;
      const comment    = body["comment"]      as string | undefined;
      const delegateTo = body["delegate_to"]  as string | undefined;

      if (!workItemId || !isUuid(workItemId)) {
        res.status(400).json({ error: "MISSING_WORK_ITEM_ID", message: "work_item_id is required" });
        return;
      }
      const VALID_ACTIONS = new Set(["approve", "reject", "return", "escalate", "delegate", "acknowledge", "flag", "read", "request_info", "comment"]);
      if (!action || !VALID_ACTIONS.has(action)) {
        res.status(400).json({ error: "INVALID_ACTION", message: `action must be one of: ${[...VALID_ACTIONS].join(", ")}` });
        return;
      }

      const sub = claims["sub"] as string ?? "";
      const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm);
      if (!principalId) {
        res.status(403).json({ error: "PRINCIPAL_NOT_FOUND", message: "no principal bound to this session" });
        return;
      }

      await withDomainSpan("workflow.request.action", {
        tenant_id: tenantId,
        request_id: requestId,
        work_item_id: workItemId,
        actor_id: principalId,
        action,
      }, () => engine.processAction({
        workItemId,
        actorId: principalId,
        tenantId,
        action,
        comment,
        delegateTo,
      }));

      res.json({ ok: true });
    } catch (err) {
      const { status, body } = engineError(err);
      if (status >= 500) logger?.error("workflow_action_error", { err: String(err) });
      res.status(status).json(body);
    }
  };

  // ── GET /workflow/requests/:id/activity ───────────────────────────────────

  const activityHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json([]); return; }

      const requestId = (req.params["id"] as string | undefined)?.trim();
      if (!requestId || !isUuid(requestId)) {
        res.status(400).json({ error: "INVALID_ID", message: "request id must be a UUID" });
        return;
      }

      const limit = Math.min(parseInt(String(req.query["limit"] ?? "100"), 10), 500);
      const items = await engine.getActivity({ requestId, tenantId, limit });
      res.json({ items });
    } catch (err) {
      logger?.error("workflow_activity_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /workflow/reports/compliance ─────────────────────────────────────
  //
  // Returns aggregate compliance KPIs across all workflow requests in a
  // date window. Query params:
  //   from         ISO date string (default: 30 days ago)
  //   to           ISO date string (default: now)
  //   entity_type  optional filter
  //   template_id  optional UUID filter

  const complianceHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ summary: {}, byTemplate: [] }); return; }

      // Parse date window (default: last 30 days)
      const now      = new Date();
      const toDate   = req.query["to"]   ? new Date(String(req.query["to"]))   : now;
      const fromDate = req.query["from"] ? new Date(String(req.query["from"])) : new Date(now.getTime() - 30 * 86_400_000);

      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        res.status(400).json({ error: "INVALID_DATE_RANGE", message: "from/to must be valid ISO date strings" });
        return;
      }

      const entityType  = String(req.query["entity_type"] ?? "").trim() || undefined;
      const templateId  = String(req.query["template_id"] ?? "").trim() || undefined;
      if (templateId && !isUuid(templateId)) {
        res.status(400).json({ error: "INVALID_TEMPLATE_ID" }); return;
      }

      // ── Per-template breakdown ────────────────────────────────────────────

      type TemplateRow = {
        template_id:         string | null;
        template_name:       string | null;
        template_code:       string | null;
        entity_type:         string;
        total_requests:      string;   // bigint → string via pg driver
        approved:            string;
        rejected:            string;
        pending:             string;
        avg_approval_min:    string | null;
        sla_breached:        string;
      };

      const byTemplateResult = await sql<TemplateRow>`
        SELECT
          wt.id::text                                                       AS template_id,
          wt.name                                                           AS template_name,
          wt.code                                                           AS template_code,
          wr.entity_type,
          COUNT(*)::text                                                    AS total_requests,
          COUNT(*) FILTER (
            WHERE wr.status = 'completed' AND wr.decision = 'approved'
          )::text                                                           AS approved,
          COUNT(*) FILTER (
            WHERE wr.status = 'completed' AND wr.decision = 'rejected'
          )::text                                                           AS rejected,
          COUNT(*) FILTER (
            WHERE wr.status = 'pending'
          )::text                                                           AS pending,
          AVG(
            CASE WHEN wr.status = 'completed'
              THEN EXTRACT(EPOCH FROM (wr.updated_at - wr.created_at)) / 60.0
            END
          )::text                                                           AS avg_approval_min,
          COUNT(*) FILTER (
            WHERE EXISTS (
              SELECT 1 FROM event.work_item wi
              WHERE  wi.workflow_request_id = wr.id
                AND  wi.status IN ('pending', 'in_progress', 'escalated')
                AND  wi.due_at IS NOT NULL
                AND  wi.due_at < now()
            )
          )::text                                                           AS sla_breached
        FROM   document.workflow_request wr
        LEFT   JOIN control.workflow_template wt ON wt.id = wr.workflow_template_id
        WHERE  wr.tenant_id  = ${tenantId}::uuid
          AND  wr.created_at >= ${fromDate.toISOString()}::timestamptz
          AND  wr.created_at <  ${toDate.toISOString()}::timestamptz
          ${entityType ? sql`AND wr.entity_type = ${entityType}` : sql``}
          ${templateId ? sql`AND wr.workflow_template_id = ${templateId}::uuid` : sql``}
        GROUP  BY wt.id, wt.name, wt.code, wr.entity_type
        ORDER  BY COUNT(*) DESC
        LIMIT  50
      `.execute(db);

      // ── Summary totals (across all templates in window) ───────────────────

      type SummaryRow = {
        total_requests:   string;
        approved:         string;
        rejected:         string;
        pending:          string;
        avg_approval_min: string | null;
        sla_breached:     string;
        stuck_count:      string;
      };

      const summaryResult = await sql<SummaryRow>`
        SELECT
          COUNT(*)::text                                                    AS total_requests,
          COUNT(*) FILTER (
            WHERE wr.status = 'completed' AND wr.decision = 'approved'
          )::text                                                           AS approved,
          COUNT(*) FILTER (
            WHERE wr.status = 'completed' AND wr.decision = 'rejected'
          )::text                                                           AS rejected,
          COUNT(*) FILTER (
            WHERE wr.status = 'pending'
          )::text                                                           AS pending,
          AVG(
            CASE WHEN wr.status = 'completed'
              THEN EXTRACT(EPOCH FROM (wr.updated_at - wr.created_at)) / 60.0
            END
          )::text                                                           AS avg_approval_min,
          COUNT(*) FILTER (
            WHERE EXISTS (
              SELECT 1 FROM event.work_item wi
              WHERE  wi.workflow_request_id = wr.id
                AND  wi.status IN ('pending', 'in_progress', 'escalated')
                AND  wi.due_at IS NOT NULL
                AND  wi.due_at < now()
            )
          )::text                                                           AS sla_breached,
          (
            SELECT COUNT(*)::text
            FROM   event.work_item wi2
            WHERE  wi2.tenant_id   = ${tenantId}::uuid
              AND  wi2.status      IN ('pending', 'in_progress')
              AND  wi2.started_at  IS NOT NULL
              AND  wi2.started_at  < now() - interval '24 hours'
              AND  NOT EXISTS (
                     SELECT 1 FROM log.workflow_event_log el
                     WHERE  el.work_item_id = wi2.id
                       AND  el.created_at   > now() - interval '24 hours'
                   )
          )                                                                 AS stuck_count
        FROM   document.workflow_request wr
        WHERE  wr.tenant_id  = ${tenantId}::uuid
          AND  wr.created_at >= ${fromDate.toISOString()}::timestamptz
          AND  wr.created_at <  ${toDate.toISOString()}::timestamptz
          ${entityType ? sql`AND wr.entity_type = ${entityType}` : sql``}
          ${templateId ? sql`AND wr.workflow_template_id = ${templateId}::uuid` : sql``}
      `.execute(db);

      const s = summaryResult.rows[0];
      const total    = parseInt(s?.total_requests   ?? "0", 10);
      const approved = parseInt(s?.approved         ?? "0", 10);
      const rejected = parseInt(s?.rejected         ?? "0", 10);
      const pending  = parseInt(s?.pending          ?? "0", 10);
      const slaBreached = parseInt(s?.sla_breached  ?? "0", 10);
      const stuckCount  = parseInt(s?.stuck_count   ?? "0", 10);
      const avgMin   = s?.avg_approval_min ? parseFloat(s.avg_approval_min) : null;

      const summary = {
        totalRequests:     total,
        approved,
        rejected,
        pending,
        avgApprovalMinutes: avgMin !== null ? Math.round(avgMin * 10) / 10 : null,
        slaBreachedCount:  slaBreached,
        slaBreachRate:     total > 0 ? Math.round((slaBreached / total) * 1000) / 10 : 0,
        rejectionRate:     total > 0 ? Math.round((rejected   / total) * 1000) / 10 : 0,
        stuckItemCount:    stuckCount,
        fromDate:          fromDate.toISOString(),
        toDate:            toDate.toISOString(),
      };

      const byTemplate = byTemplateResult.rows.map((r) => ({
        templateId:        r.template_id,
        templateName:      r.template_name,
        templateCode:      r.template_code,
        entityType:        r.entity_type,
        totalRequests:     parseInt(r.total_requests,   10),
        approved:          parseInt(r.approved,         10),
        rejected:          parseInt(r.rejected,         10),
        pending:           parseInt(r.pending,          10),
        avgApprovalMinutes: r.avg_approval_min ? Math.round(parseFloat(r.avg_approval_min) * 10) / 10 : null,
        slaBreachedCount:  parseInt(r.sla_breached,     10),
      }));

      res.json({ summary, byTemplate });
    } catch (err) {
      logger?.error("workflow_compliance_report_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /workflow/items/:id/action ──────────────────────────────────────
  //
  // Work-item-centric action endpoint. The WorkflowClient calls this via
  // submitAction(workItemId, body) where body is ApprovalAction:
  //   { action, remarks?, delegate_to? }
  //
  // Differs from /requests/:id/action in that the workItemId is in the path
  // and no requestId lookup is required — the engine only needs workItemId.

  const workItemActionHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const workItemId = (req.params["id"] as string | undefined)?.trim();
      if (!workItemId || !isUuid(workItemId)) {
        res.status(400).json({ error: "INVALID_ID", message: "work item id must be a UUID" });
        return;
      }

      const body       = req.body as Record<string, unknown> ?? {};
      const action     = body["action"]       as string | undefined;
      const comment    = (body["remarks"]     as string | undefined) ?? (body["comment"] as string | undefined);
      const delegateTo = body["delegate_to"]  as string | undefined;

      const VALID_ACTIONS = new Set(["approve", "reject", "return", "escalate", "delegate", "acknowledge", "flag", "read", "request_info", "comment"]);
      if (!action || !VALID_ACTIONS.has(action)) {
        res.status(400).json({ error: "INVALID_ACTION", message: `action must be one of: ${[...VALID_ACTIONS].join(", ")}` });
        return;
      }

      const sub = claims["sub"] as string ?? "";
      const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm);
      if (!principalId) {
        res.status(403).json({ error: "PRINCIPAL_NOT_FOUND", message: "no principal bound to this session" });
        return;
      }

      await withDomainSpan("workflow.work_item.action", {
        tenant_id: tenantId,
        work_item_id: workItemId,
        actor_id: principalId,
        action,
      }, () => engine.processAction({
        workItemId,
        actorId: principalId,
        tenantId,
        action,
        comment,
        delegateTo,
      }));

      res.json({ ok: true });
    } catch (err) {
      const { status, body } = engineError(err);
      if (status >= 500) logger?.error("workflow_work_item_action_error", { err: String(err) });
      res.status(status).json(body);
    }
  };

  // ── Register routes ───────────────────────────────────────────────────────

  router.get("/workflow/inbox/count",             inboxCountHandler);
  router.get("/workflow/inbox",                   inboxHandler);
  router.get("/workflow/requests/:id",            requestDetailHandler);
  router.get("/workflow/requests/:id/context",    requestDetailHandler);
  router.post("/workflow/requests/:id/action",    actionHandler);
  router.post("/workflow/items/:id/action",       workItemActionHandler);
  router.get("/workflow/requests/:id/activity",   activityHandler);
  router.get("/workflow/reports/compliance",      complianceHandler);
}
