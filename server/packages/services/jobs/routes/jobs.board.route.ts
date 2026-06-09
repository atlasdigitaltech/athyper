/**
 * Jobs Board Route — embedded BullBoard UI, gated by RBAC.
 *
 * Mount: /api/jobs/admin/board
 *
 * Why embedded (not a standalone container behind Traefik):
 *   The sidecar `deadly0/bull-board:3` container was exposed through Traefik
 *   without any middleware and evaluated no permissions. Mounting the UI
 *   inside the API runtime routes it through the same verifyBearer chain as
 *   every other admin endpoint and lets us authorise it through the existing
 *   persona → group → role → permission evaluator — no phantom isAdmin
 *   flag, no hardcoded role claim.
 *
 * Permissions (seeded in 020_permission_platform_admin.sql):
 *   - JOBS.BOARD.VIEW    — required for all reads (UI page, queue state XHRs)
 *   - JOBS.QUEUE.MANAGE  — required additionally for mutations (pause, resume,
 *                          retry, clean, remove)
 *
 * Split between view and manage is deliberate: SRE read-only can inspect DLQ
 * depth and job state without holding authority to drain or retry.
 *
 * Persona bindings (seeded in 021_persona_permission_platform_admin.sql):
 *   - persona `admin`  → JOBS.BOARD.VIEW
 *   - persona `owner`  → JOBS.BOARD.VIEW + JOBS.QUEUE.MANAGE
 * Any other persona (viewer/reporter/requester/agent/manager) gets 403. This
 * matches Athyper's tier model where `admin` owns platform configuration and
 * `owner` owns the full-access tier that includes destructive queue ops.
 *
 * Browser access note:
 *   The UI is served at an authenticated backend path. Direct browser
 *   navigation will not carry a Bearer token — operators reach it either
 *   through the web BFF relay (which converts session cookie → Bearer) or
 *   through developer tooling (a token-injecting proxy). The standalone
 *   `deadly0/bull-board:3` container remains available as an internal-only
 *   break-glass fallback when the API runtime itself is unhealthy (see
 *   rb-08-bullboard-emergency-activation.md).
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";

import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";

import {
  verifyBearer,
  extractOrgHeaders,
  resolveTenantId,
  resolvePrincipalIdOrNull,
} from "@athyper/svc-shared";
import { checkPermission } from "@athyper/svc-iam";
import type { JobsQueues } from "../jobs.service.js";
import type { JobLogger } from "../jobs.types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

// ── Mount path (must match api.ts registration) ───────────────────────────────
// Kept as a constant rather than a parameter because BullBoard's setBasePath
// generates absolute URLs in the HTML shell — drift between this constant
// and the mount call silently breaks the UI's asset and XHR links.
export const BOARD_BASE_PATH = "/api/jobs/admin/board";

// ── Permission codes (seeded in 020_permission_platform_admin.sql) ────────────
const PERM_BOARD_VIEW   = "JOBS.BOARD.VIEW";
const PERM_QUEUE_MANAGE = "JOBS.QUEUE.MANAGE";

export interface JobsBoardRouteDeps {
  queues:  JobsQueues;
  db:      AnyDb;
  auth:    { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: JobLogger;
}

/**
 * Resolve { tenantId, principalId } from the Bearer token + X-Org / X-Realm
 * headers. Returns null and sends a terminal response on any failure (missing
 * token, invalid token, unknown tenant, unbound principal).
 *
 * Inline here rather than shared with operator.routes.ts because that module's
 * helper carries extra fields (claims, sub) this route doesn't need, and the
 * module-local scope is the Athyper pattern for route-specific auth shapes.
 */
async function resolveAuth(
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1],
  db: AnyDb,
  auth: JobsBoardRouteDeps["auth"],
): Promise<{ tenantId: string; principalId: string } | null> {
  const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
  if (!claims) return null;

  const sub = typeof claims["sub"] === "string" ? (claims["sub"] as string) : null;
  if (!sub) {
    res.status(401).json({ error: "INVALID_TOKEN", message: "JWT missing sub claim" });
    return null;
  }

  const { xOrg, xRealm } = extractOrgHeaders(req);
  const tenantId = await resolveTenantId(db, xOrg, xRealm);
  if (!tenantId) {
    res.status(400).json({ error: "MISSING_TENANT", message: "X-Org header is required" });
    return null;
  }

  const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId);
  if (!principalId) {
    res.status(403).json({ error: "NO_PRINCIPAL_BINDING", message: "No principal bound to this token in this tenant" });
    return null;
  }

  return { tenantId, principalId };
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function registerJobsBoardRoutes(router: Router, deps: JobsBoardRouteDeps): Router {
  const { queues, db, auth, logger } = deps;

  // Build the BullMQ adapters once — the underlying Queue instances are long-lived.
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(BOARD_BASE_PATH);

  createBullBoard({
    queues: [
      new BullMQAdapter(queues.lifecycleTimers),
      new BullMQAdapter(queues.notifications),
      new BullMQAdapter(queues.domainOutbox),
      new BullMQAdapter(queues.slaCheck),
      new BullMQAdapter(queues.import),
      new BullMQAdapter(queues.cmsPreview),
      new BullMQAdapter(queues.renderDocument),
      new BullMQAdapter(queues.iamKcSync),
      new BullMQAdapter(queues.endpointHealth),
      new BullMQAdapter(queues.tikaExtract),
    ],
    serverAdapter,
    options: {
      // UI-only options; permission enforcement lives in our guard below.
      uiConfig: { boardTitle: "Athyper Jobs" },
    },
  });

  // Guard: runs for every request to /api/jobs/admin/board/* before the
  // BullBoard adapter sees it. GETs need VIEW; any mutation (POST/PUT/PATCH/
  // DELETE) needs MANAGE as well. Any other verb is rejected — the adapter
  // only uses GET and POST/PUT today, but we fail closed on anything else to
  // avoid silently trusting new BullBoard surfaces added by future versions.
  const guard: RequestHandler = (async (req, res, next) => {
    try {
      const resolved = await resolveAuth(req, res, db, auth);
      if (!resolved) return;
      const { tenantId, principalId } = resolved;

      const method = req.method.toUpperCase();
      const isRead = method === "GET" || method === "HEAD";
      const isMutation = method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";

      if (!isRead && !isMutation) {
        res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
        return;
      }

      // Every request must pass VIEW. Mutations additionally need MANAGE.
      const viewDecision = await checkPermission(db, tenantId, principalId, PERM_BOARD_VIEW);
      if (viewDecision.decision !== "allow") {
        logger?.warn("jobs_board_permission_denied", {
          principalId,
          tenantId,
          permission: PERM_BOARD_VIEW,
          reason:     viewDecision.reason,
        });
        res.status(403).json({ error: "PERMISSION_DENIED", message: `Missing ${PERM_BOARD_VIEW}` });
        return;
      }

      if (isMutation) {
        const manageDecision = await checkPermission(db, tenantId, principalId, PERM_QUEUE_MANAGE);
        if (manageDecision.decision !== "allow") {
          logger?.warn("jobs_board_permission_denied", {
            principalId,
            tenantId,
            permission: PERM_QUEUE_MANAGE,
            reason:     manageDecision.reason,
          });
          res.status(403).json({ error: "PERMISSION_DENIED", message: `Missing ${PERM_QUEUE_MANAGE}` });
          return;
        }
      }

      next();
    } catch (err) {
      logger?.error("jobs_board_guard_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler;

  router.use(BOARD_BASE_PATH.replace(/^\/api/, ""), guard, serverAdapter.getRouter());

  return router;
}
