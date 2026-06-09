import type { RequestHandler, Router } from "express";

import {
  createPlaneContextResolver,
  type PlaneKey,
} from "../context/context-resolver.service.js";

export interface ContextRoutesDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: import("kysely").Kysely<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  meshDb?: import("kysely").Kysely<any>;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
  };
}

const PLANE_KEYS = new Set(["neon", "mesh", "admin"]);

function normalizePlaneKey(value: unknown): PlaneKey | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  const plane = raw.toLowerCase();
  return PLANE_KEYS.has(plane) ? (plane as PlaneKey) : null;
}

function issuerRealmKey(claims: Record<string, unknown>): string {
  const issuer = typeof claims.iss === "string" ? claims.iss : "";
  return issuer.split("/").pop() || "athyper";
}

function csvHeader(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function clientRoles(resourceAccess: unknown, clientId: string): string[] {
  if (!resourceAccess || typeof resourceAccess !== "object") return [];
  const access = resourceAccess as Record<string, unknown>;
  const clientAccess = access[clientId];
  if (!clientAccess || typeof clientAccess !== "object") return [];
  const roles = (clientAccess as Record<string, unknown>).roles;
  return Array.isArray(roles) ? roles.filter((role): role is string => typeof role === "string") : [];
}

function hasPlaneAccess(claims: Record<string, unknown>, planeKey: PlaneKey): boolean {
  const planeRoles = clientRoles(claims.resource_access, `${planeKey}-web`);
  return planeRoles.includes("AUTHORIZED");
}

function workbenchesFromClaims(claims: Record<string, unknown>, planeKey: PlaneKey): string[] {
  const result = new Set<string>();
  const roles = realmRoles(claims.realm_access);
  if (planeKey === "neon" && roles.includes("NEON_USER")) result.add("user");
  if (planeKey === "mesh" && roles.includes("MESH_BUYER_USER")) result.add("user");
  if (planeKey === "mesh" && roles.includes("MESH_PARTNER_USER")) result.add("partner");
  if (planeKey === "admin" && roles.includes("ADMIN_USER")) result.add("admin");
  return [...result];
}

function realmRoles(realmAccess: unknown): string[] {
  if (!realmAccess || typeof realmAccess !== "object") return [];
  const roles = (realmAccess as Record<string, unknown>).roles;
  return Array.isArray(roles) ? roles.filter((role): role is string => typeof role === "string") : [];
}

function normalizeIdentityUsername(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized || /\s/.test(normalized) || normalized.length > 320) return undefined;
  return normalized;
}

export function createContextRoutes(router: Router, deps: ContextRoutesDeps): Router {
  const { auth, logger } = deps;
  const resolver = createPlaneContextResolver(deps.db, deps.meshDb);

  const getContexts: RequestHandler = async (req, res, next) => {
    try {
      const planeKey = normalizePlaneKey(req.header("x-plane-key") ?? req.query.plane);
      if (!planeKey) {
        res.status(400).json({ error: "INVALID_PLANE", message: "A valid plane is required." });
        return;
      }

      const bearerMatch = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? "");
      if (!bearerMatch) {
        res.status(401).json({ error: "MISSING_TOKEN", message: "Authorization: Bearer <token> required." });
        return;
      }

      let claims: Record<string, unknown>;
      try {
        claims = await auth.verifyToken(bearerMatch[1]!);
      } catch (err) {
        res.status(401).json({
          error: "INVALID_TOKEN",
          message: err instanceof Error ? err.message : "Token verification failed.",
        });
        return;
      }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      if (!sub) {
        res.status(401).json({ error: "INVALID_TOKEN", message: "JWT missing sub claim." });
        return;
      }

      if (!hasPlaneAccess(claims, planeKey)) {
        res.status(403).json({ error: "NO_PLATFORM_ACCESS", message: "AUTHORIZED role required." });
        return;
      }

      const headerWorkbenches = csvHeader(req.header("x-workbenches"));
      const workbenches = headerWorkbenches.length > 0
        ? headerWorkbenches
        : workbenchesFromClaims(claims, planeKey);

      const result = await resolver.resolve({
        planeKey,
        realmKey: req.header("x-realm-key") ?? issuerRealmKey(claims),
        sub,
        username: normalizeIdentityUsername(claims.preferred_username ?? claims.username ?? claims.email),
        workbenches,
      });
      res.json(result);
    } catch (err) {
      logger?.error("context_resolver_route_error", { err: String(err) });
      next(err);
    }
  };

  router.get("/session/contexts", getContexts);
  return router;
}
