/**
 * Workflow Routes
 *
 * GET  /workflow/inbox/count          — pending work_item count for current user
 * GET  /workflow/inbox                — paginated inbox list
 * GET  /workflow/requests/:id         — full approval context (request + stages + work_items)
 * POST /workflow/requests/:id/action  — approve / reject / delegate / escalate
 * GET  /workflow/requests/:id/activity — workflow_event_log for a request
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import {
  verifyBearer,
  resolveTenantId,
  resolvePrincipalIdOrNull,
  isUuid,
  extractOrgHeaders,
} from "@athyper/svc-shared";
import { WorkflowEngine } from "../engine.js";

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
  const engine = new WorkflowEngine({ db, logger });

  // ── GET /workflow/inbox/count ─────────────────────────────────────────────

  const inboxCountHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ count: 0 }); return; }

      const sub = claims["sub"] as string ?? "";
      const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId);
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
      const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId);
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
      const VALID_ACTIONS = new Set(["approve", "reject", "escalate", "delegate", "acknowledge", "flag", "read"]);
      if (!action || !VALID_ACTIONS.has(action)) {
        res.status(400).json({ error: "INVALID_ACTION", message: `action must be one of: ${[...VALID_ACTIONS].join(", ")}` });
        return;
      }

      const sub = claims["sub"] as string ?? "";
      const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId);
      if (!principalId) {
        res.status(403).json({ error: "PRINCIPAL_NOT_FOUND", message: "no principal bound to this session" });
        return;
      }

      await engine.processAction({
        workItemId,
        actorId: principalId,
        tenantId,
        action,
        comment,
        delegateTo,
      });

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

  // ── Register routes ───────────────────────────────────────────────────────

  router.get("/workflow/inbox/count",        inboxCountHandler);
  router.get("/workflow/inbox",              inboxHandler);
  router.get("/workflow/requests/:id",       requestDetailHandler);
  router.post("/workflow/requests/:id/action", actionHandler);
  router.get("/workflow/requests/:id/activity", activityHandler);
}
