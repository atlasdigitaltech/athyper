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
import type { PlaneDatabaseRegistry } from "../runtime/plane-database-registry.js";

type PlaneKey = "neon" | "mesh" | "admin";
const PLANE_KEYS = new Set(["neon", "mesh", "admin"]);

function normalizePlaneKey(value: unknown): PlaneKey {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return "neon";
  const plane = raw.toLowerCase();
  return PLANE_KEYS.has(plane) ? (plane as PlaneKey) : "neon";
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BootstrapRoutesDeps {
  planeDatabases: PlaneDatabaseRegistry;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: import("kysely").Kysely<any>;
  meshDb: import("kysely").Kysely<any>;
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
    for (const [key, entry] of Object.entries(orgClaim as Record<string, unknown>)) {
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        const e = entry as Record<string, unknown>;
        if (typeof e.alias === "string" && e.alias) {
          aliases.push(e.alias);
          continue;
        }
      }
      aliases.push(key);
    }
    return aliases;
  }
  return [];
}

function clientRoles(resourceAccess: unknown, clientId: string): string[] {
  if (!resourceAccess || typeof resourceAccess !== "object") return [];
  const client = (resourceAccess as Record<string, unknown>)[clientId];
  if (!client || typeof client !== "object") return [];
  const roles = (client as Record<string, unknown>).roles;
  return Array.isArray(roles) ? roles.filter((role): role is string => typeof role === "string") : [];
}

function realmRoles(realmAccess: unknown): string[] {
  if (!realmAccess || typeof realmAccess !== "object") return [];
  const roles = (realmAccess as Record<string, unknown>).roles;
  return Array.isArray(roles) ? roles.filter((role): role is string => typeof role === "string") : [];
}

function hasAccess(resourceAccess: unknown, planeKey: PlaneKey): boolean {
  const clientIds = planeKey === "admin" ? ["admin-web", "athyper-admin"] : [`${planeKey}-web`];
  return clientIds.some((clientId) => clientRoles(resourceAccess, clientId).includes("AUTHORIZED"));
}

function extractWorkbenches(realmAccess: unknown, planeKey: PlaneKey): string[] {
  const roles = realmRoles(realmAccess);
  const workbenches = new Set<string>();
  if (planeKey === "neon" && roles.includes("NEON_USER")) workbenches.add("user");
  if (planeKey === "mesh" && roles.includes("MESH_BUYER_USER")) workbenches.add("user");
  if (planeKey === "mesh" && roles.includes("MESH_PARTNER_USER")) workbenches.add("partner");
  if (planeKey === "admin" && roles.includes("ADMIN_USER")) workbenches.add("admin");
  return [...workbenches];
}

// ─── Route factory ────────────────────────────────────────────────────────────

export function createBootstrapRoutes(router: Router, deps: BootstrapRoutesDeps): Router {
  const { auth, logger } = deps;
  const bootstrapService = createBootstrapService({
    planeDatabases: deps.planeDatabases,
    cache: deps.cache,
    metrics: deps.metrics,
  });

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
      const planeKey = normalizePlaneKey(req.header("x-plane-key") ?? req.query.plane);

      // Principal display info from JWT claims (no DB lookup needed)
      const name =
        (typeof claims.name === "string" ? claims.name : null) ??
        (typeof claims.preferred_username === "string" ? claims.preferred_username : null) ??
        sub;
      const email = typeof claims.email === "string" ? claims.email : "";

      // Authorization gate: every request must carry AUTHORIZED on the plane client.
      if (!hasAccess(claims.resource_access, planeKey)) {
        res.status(403).json({ error: "NO_PLATFORM_ACCESS", message: "AUTHORIZED role required" });
        return;
      }

      const orgAliases = extractOrgAliases(claims.organization);
      const workbenches = extractWorkbenches(claims.realm_access, planeKey);

      if (orgAliases.length === 0) {
        // No org claim in JWT (KC omits it for users with many orgs).
        // The BFF callback should have enriched sessions via the admin API;
        // this path means the caller skipped the callback flow.
        res.status(200).json({
          principal: { id: sub, name, email },
          tenants: [],
        });
        return;
      }

      const bootstrapQuery: BootstrapQuery = {
        sub, realmKey, planeKey, name, email, orgAliases, workbenches,
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
