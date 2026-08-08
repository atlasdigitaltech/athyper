import type { RequestHandler, Router } from "express";

import {
  createPlaneContextResolver,
  type PlaneKey,
} from "../context/context-resolver.service.js";
import type { PlaneDatabaseRegistry } from "../runtime/plane-database-registry.js";

export interface ContextRoutesDeps {
  planeDatabases: PlaneDatabaseRegistry;
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

const AUTHORIZED_CLIENT_IDS: Record<PlaneKey, readonly string[]> = {
  admin: ["admin-web", "athyper-admin"],
  neon: ["neon-web"],
  mesh: ["mesh-web"],
};

function hasPlaneAccess(claims: Record<string, unknown>, planeKey: PlaneKey): boolean {
  return AUTHORIZED_CLIENT_IDS[planeKey].some((clientId) =>
    clientRoles(claims.resource_access, clientId).includes("AUTHORIZED"),
  );
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

function extractExternalOrgIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
  }
  if (!value || typeof value !== "object") return [];
  return Object.keys(value as Record<string, unknown>).filter((k) => k.trim() !== "");
}

export function createContextRoutes(router: Router, deps: ContextRoutesDeps): Router {
  const { auth, logger } = deps;
  const resolver = createPlaneContextResolver(deps.planeDatabases);

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

      const realmKey = req.header("x-realm-key") ?? issuerRealmKey(claims);
      const organizationIdHeader = req.header("x-organization-ids");
      const externalOrganizationIds = organizationIdHeader
        ? csvHeader(organizationIdHeader)
        : extractExternalOrgIds(claims.organization);
      const result = await resolver.resolve({
        planeKey,
        realmKey,
        sub,
        externalOrganizationIds,
        workbenches,
        username: claimString(claims.preferred_username),
        displayName: claimString(claims.name) ?? claimString(claims.preferred_username),
        email: claimString(claims.email),
        issuer: claimString(claims.iss),
        audience: audienceClaim(claims.aud),
        allowJit: realmKey !== "platform-control",
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

function claimString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function audienceClaim(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const values = value.filter((entry): entry is string => typeof entry === "string");
    return values.length > 0 ? values.join(" ").slice(0, 512) : undefined;
  }
  return undefined;
}
