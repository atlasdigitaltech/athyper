/**
 * IAM Bootstrap Routes — v4.1
 *
 * GET /api/session/bootstrap
 *
 * Auth: valid JWT (Bearer token) required.
 *
 * Reads the JWT `organization` claim for the tenant list and resolves all
 * accessible company codes per tenant via the auth_group_role DB model.
 *
 * Response: BootstrapResponse — principal info, full tenant/entity tree,
 *           delegation count. Used by the frontend entity selector on login.
 *
 * Cache: `bootstrap:{sub}:{tenant_hash}` — TTL 5 min
 * Invalidated by outbox events (same worker as session cache).
 */

import type { RequestHandler, Router } from "express";

import { createBootstrapService } from "../bootstrap/bootstrap.service.js";
import type { CacheClient, CacheMetrics } from "../session/session.service.js";
import type { BootstrapQuery } from "../session/session.types.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BootstrapRoutesDeps {
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

export function createBootstrapRoutes(router: Router, deps: BootstrapRoutesDeps): Router {
  const { auth, logger } = deps;
  const bootstrapService = createBootstrapService({ db: deps.db, cache: deps.cache, metrics: deps.metrics });

  /**
   * GET /api/session/bootstrap
   *
   * Headers:
   *   Authorization: Bearer <access_token>
   *
   * Responses:
   *   200  — BootstrapResponse JSON
   *   401  — Missing or invalid token
   *   500  — Unexpected error
   */
  const getBootstrap: RequestHandler = async (req, res, next) => {
    try {
      // ── Extract and verify Bearer token ────────────────────────────────────
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

      // realmKey from issuer URL (last path segment)
      const iss = typeof claims.iss === "string" ? claims.iss : "";
      const realmKey = iss.split("/").pop() ?? "athyper";

      // Principal display info from JWT claims (no DB lookup needed)
      const name =
        (typeof claims.name === "string" ? claims.name : null) ??
        (typeof claims.preferred_username === "string" ? claims.preferred_username : null) ??
        sub;
      const email = typeof claims.email === "string" ? claims.email : "";

      // ACCESS gate — IAM §6 step 3
      if (!hasAccess(claims.resource_access)) {
        res.status(403).json({ error: "NO_PLATFORM_ACCESS", message: "ACCESS role required" });
        return;
      }

      const orgAliases = extractOrgAliases(claims.organization);
      const workbenches = extractWorkbenches(claims.resource_access);

      if (orgAliases.length === 0) {
        // No org claim in JWT (KC omits it for users with many orgs).
        // The BFF callback should have enriched sessions via the admin API;
        // this path means the caller skipped the callback flow.
        res.status(200).json({
          principal: { id: sub, name, email },
          tenants: [],
          delegation_count: 0,
        });
        return;
      }

      const bootstrapQuery: BootstrapQuery = {
        sub, realmKey, name, email, orgAliases, workbenches,
      };

      const result = await bootstrapService.resolve(bootstrapQuery);
      res.json(result);
    } catch (err) {
      logger?.error("bootstrap_route_error", { err: String(err) });
      next(err);
    }
  };

  // Register as /session/bootstrap so it's mounted under the /api router
  // as GET /api/session/bootstrap
  router.get("/session/bootstrap", getBootstrap);
  return router;
}
