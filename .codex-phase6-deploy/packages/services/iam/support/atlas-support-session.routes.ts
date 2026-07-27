import type { Request, RequestHandler, Router } from "express";
import type { VerifiedRequestContext } from "../permission-context/verified-request-context.js";
import {
  AtlasSupportSessionError,
  type AtlasSupportScope,
  type StartAtlasSupportSessionRequest,
} from "./atlas-support-session.types.js";
import type { AtlasSupportSessionService } from "./atlas-support-session.service.js";

/**
 * Server-only BFF workflow. The trusted-BFF assertion and authenticated
 * session values are dependencies so request headers can never establish
 * tenant, principal, subject, or login-session authority.
 */
export interface AtlasSupportSessionRoutesDependencies {
  service: AtlasSupportSessionService;
  assertTrustedBff(req: Request): Promise<boolean>;
  resolveVerifiedContext(req: Request): Promise<VerifiedRequestContext>;
  resolveOriginSession(req: Request): Promise<{
    subject: string;
    sessionId: string;
    principalId: string;
    stepUpBinding: StartAtlasSupportSessionRequest["stepUpBinding"];
  }>;
}

export function createAtlasSupportSessionRoutes(
  router: Router,
  deps: AtlasSupportSessionRoutesDependencies,
): Router {
  router.post("/iam/admin/atlas-support-sessions", handler(async (req, res) => {
    if (!await deps.assertTrustedBff(req)) {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }
    const body = object(req.body);
    const context = await deps.resolveVerifiedContext(req);
    const origin = await deps.resolveOriginSession(req);
    const started = await deps.service.start({
      context,
      originSubject: origin.subject,
      targetTenantId: text(body.target_tenant_id),
      ticketId: text(body.ticket_id),
      reason: text(body.reason),
      requestedScopes: scopes(body.requested_scopes),
      ttlSeconds: integer(body.ttl_seconds),
      stepUpBinding: origin.stepUpBinding,
    });
    res.setHeader("Cache-Control", "no-store");
    res.status(201).json({
      token: started.token,
      session_id: started.session.sessionId,
      target_tenant_id: started.session.targetTenantId,
      thread_id: started.session.threadId,
      expires_at: started.session.expiresAt.toISOString(),
    });
  }));

  router.post("/iam/admin/atlas-support-sessions/end", handler(async (req, res) => {
    if (!await deps.assertTrustedBff(req)) {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }
    const body = object(req.body);
    const origin = await deps.resolveOriginSession(req);
    const verified = await deps.service.verify({
      token: text(body.token),
      originSubject: origin.subject,
      originSessionId: origin.sessionId,
      authenticatedOriginPrincipalId: origin.principalId,
    });
    await deps.service.end(verified);
    res.setHeader("Cache-Control", "no-store");
    res.status(204).end();
  }));
  return router;
}

function handler(
  fn: (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) => Promise<void>,
): RequestHandler {
  return async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (error) {
      if (error instanceof AtlasSupportSessionError) {
        const status = error.code === "INVALID_REQUEST" ? 400
          : error.code === "MFA_REQUIRED" ? 401
          : error.code === "TOKEN_INVALID" ? 401
          : error.code === "SESSION_EXPIRED" ? 410
          : 403;
        res.status(status).json({ error: error.code, message: error.message });
        return;
      }
      next(error);
    }
  };
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AtlasSupportSessionError("INVALID_REQUEST", "Request body must be an object.");
  }
  return value as Record<string, unknown>;
}
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function integer(value: unknown): number { return typeof value === "number" && Number.isInteger(value) ? value : 0; }
function scopes(value: unknown): AtlasSupportScope[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is AtlasSupportScope =>
    v === "permission_denial.explain" || v === "principal.find_current_scope"
    || v === "policy_trace.explain" || v === "tenant_health.summarize");
}
