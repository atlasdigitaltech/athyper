/**
 * IAM Session Routes — v4.1
 *
 * GET /api/session?tenant={code}&entity={cc_code}&workbench={role}
 *
 * Called by the BFF (server-to-server) with the user's KC access token.
 * Returns the fully-resolved runtime session context.
 *
 * The `tenant` param is mandatory. The same entity code (e.g. "ATHQ") can
 * exist in multiple tenants — the caller must always specify tenant explicitly.
 * Middleware must NOT infer tenant by suffix-matching the org alias.
 *
 * KC 26.5.1 JWT shapes handled:
 *   organization:      ["athyper--ATHQ", "athyper--AMRE"]  ← alias string array
 *   resource_access:   { "neon-web": { roles: ["neon:WORKBENCH:USER"] } }
 */

import type { RequestHandler, Router } from "express";

import {
  createSessionService,
  SessionError,
  type CacheClient,
  type CacheMetrics,
} from "../session/session.service.js";
import type { SessionRouteQuery } from "../session/session.types.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SessionRoutesDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: import("kysely").Kysely<any>;
  cache: CacheClient;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
  };
  metrics?: CacheMetrics;
}

// ─── KC claim helpers ─────────────────────────────────────────────────────────

function extractOrgAliases(orgClaim: unknown): string[] {
  if (!orgClaim) return [];
  if (Array.isArray(orgClaim)) {
    return orgClaim.filter((v): v is string => typeof v === "string" && v.length > 0);
  }
  if (typeof orgClaim === "object") {
    const aliases: string[] = [];
    for (const entry of Object.values(orgClaim as Record<string, unknown>)) {
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        const e = entry as Record<string, unknown>;
        if (typeof e.alias === "string" && e.alias) aliases.push(e.alias);
      }
    }
    return aliases;
  }
  return [];
}

function hasAccess(resourceAccess: unknown): boolean {
  if (!resourceAccess || typeof resourceAccess !== "object") return false;
  const neonWeb = (resourceAccess as Record<string, unknown>)["neon-web"];
  if (!neonWeb || typeof neonWeb !== "object") return false;
  const roles = (neonWeb as Record<string, unknown>).roles;
  return Array.isArray(roles) && roles.includes("ACCESS");
}

function extractWorkbenches(resourceAccess: unknown): string[] {
  if (!resourceAccess || typeof resourceAccess !== "object") return [];
  const neonWeb = (resourceAccess as Record<string, unknown>)["neon-web"];
  if (!neonWeb || typeof neonWeb !== "object") return [];
  const roles = (neonWeb as Record<string, unknown>).roles;
  if (!Array.isArray(roles)) return [];
  const workbenches: string[] = [];
  for (const r of roles) {
    if (r === "WB_USER") workbenches.push("user");
    else if (r === "WB_PARTNER") workbenches.push("partner");
    else if (r === "WB_ADMIN") workbenches.push("admin");
  }
  return workbenches;
}

// ─── Route factory ────────────────────────────────────────────────────────────

export function createSessionRoutes(router: Router, deps: SessionRoutesDeps): Router {
  const { auth, logger } = deps;
  const sessionService = createSessionService({ db: deps.db, cache: deps.cache, metrics: deps.metrics });

  const getSession: RequestHandler = async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization ?? "";
      const bearerMatch = /^Bearer\s+(.+)$/i.exec(authHeader);
      if (!bearerMatch) {
        res.status(401).json({ error: "MISSING_TOKEN", message: "Authorization: Bearer <token> required" });
        return;
      }

      let claims: Record<string, unknown>;
      try {
        claims = await auth.verifyToken(bearerMatch[1]!);
      } catch (err) {
        res.status(401).json({
          error: "INVALID_TOKEN",
          message: err instanceof Error ? err.message : "Token verification failed",
        });
        return;
      }

      const sub = typeof claims.sub === "string" ? claims.sub : null;
      if (!sub) {
        res.status(401).json({ error: "INVALID_TOKEN", message: "JWT missing sub claim" });
        return;
      }

      const iss = typeof claims.iss === "string" ? claims.iss : "";
      const realmKey = iss.split("/").pop() ?? "athyper";

      // Identity fields forwarded to the service for JIT provisioning on first login.
      const jwtUsername = typeof claims.preferred_username === "string" ? claims.preferred_username : undefined;
      const jwtName = typeof claims.name === "string" ? claims.name : jwtUsername;
      const jwtEmail = typeof claims.email === "string" ? claims.email : undefined;

      // Prefer the BFF-supplied org alias list (X-Org-Aliases header) over the
      // JWT organization claim. KC truncates the claim for users in many orgs;
      // the BFF already enriches the full list via the KC admin API at login time.
      const bffAliasHeader = req.headers["x-org-aliases"];
      const orgAliases = bffAliasHeader && typeof bffAliasHeader === "string" && bffAliasHeader
        ? bffAliasHeader.split(",").map((s) => s.trim()).filter(Boolean)
        : extractOrgAliases(claims.organization);

      // ACCESS gate — every request must carry the ACCESS client role (IAM §6 step 3).
      if (!hasAccess(claims.resource_access)) {
        res.status(403).json({ error: "NO_PLATFORM_ACCESS", message: "ACCESS role required" });
        return;
      }

      // Prefer BFF-supplied workbenches (X-Workbenches header) over JWT resource_access.
      const bffWorkbenchHeader = req.headers["x-workbenches"];
      const workbenches = bffWorkbenchHeader && typeof bffWorkbenchHeader === "string" && bffWorkbenchHeader
        ? bffWorkbenchHeader.split(",").map((s) => s.trim()).filter(Boolean)
        : extractWorkbenches(claims.resource_access);

      const { tenant, entity, workbench, delegation } = req.query as SessionRouteQuery;

      if (!tenant || typeof tenant !== "string") {
        res.status(400).json({
          error: "MISSING_PARAM",
          message: "'tenant' is required. e.g. ?tenant=athyper&entity=ATHQ&workbench=user",
        });
        return;
      }
      if (!entity || typeof entity !== "string") {
        res.status(400).json({
          error: "MISSING_PARAM",
          message: "'entity' is required (company_code.code).",
        });
        return;
      }
      if (!workbench || typeof workbench !== "string") {
        res.status(400).json({
          error: "MISSING_PARAM",
          message: "'workbench' is required. e.g. ?workbench=user",
        });
        return;
      }

      const session = await sessionService.resolve({
        sub,
        realmKey,
        tenant,
        entity,
        workbench,
        orgAliases,
        workbenches,
        delegationId: typeof delegation === "string" && delegation ? delegation : undefined,
        // JIT provisioning identity — used only when principal_auth_binding is absent.
        username: jwtUsername,
        name: jwtName,
        email: jwtEmail,
      });

      res.json(session);
    } catch (err) {
      if (err instanceof SessionError) {
        res.status(err.httpStatus).json({ error: err.code, message: err.message });
        return;
      }
      logger?.error("session_route_error", { err: String(err) });
      next(err);
    }
  };

  router.get("/session", getSession);
  return router;
}
