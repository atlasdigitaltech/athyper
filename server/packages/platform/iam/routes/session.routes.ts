/**
 * IAM Session Routes — v4.1
 *
 * GET /api/session?tenant={code}&entity={legal_entity_code}&workbench={role}
 *
 * Called by the BFF (server-to-server) with the user's KC access token.
 * Returns the fully-resolved runtime session context.
 *
 * The `tenant` param is mandatory. The same legal entity code can
 * exist in multiple tenants — the caller must always specify tenant explicitly.
 * Middleware must NOT infer tenant by suffix-matching the org alias.
 *
 * KC 26.5.1 JWT shapes handled:
 *   organization:      ["athyper--ATHQ", "athyper--AMRE"]  ← alias string array
 *   resource_access:   { "neon-web": { roles: ["AUTHORIZED"] } }
 */

import type { RequestHandler, Router } from "express";

import {
  createSessionService,
  SessionError,
  type CacheClient,
  type CacheMetrics,
} from "../session/session.service.js";
import { appendSecurityEvent } from "@athyper/svc-audit";
import type { SessionRouteQuery } from "../session/session.types.js";
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

export interface SessionRoutesDeps {
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

function extractExternalOrganizationIds(orgClaim: unknown): string[] {
  if (!orgClaim) return [];
  if (Array.isArray(orgClaim)) {
    return orgClaim.filter((v): v is string => typeof v === "string" && v.length > 0);
  }
  if (typeof orgClaim === "object") {
    return Object.keys(orgClaim as Record<string, unknown>).filter(Boolean);
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

export function createSessionRoutes(router: Router, deps: SessionRoutesDeps): Router {
  const { auth, logger } = deps;
  const sessionService = createSessionService({
    planeDatabases: deps.planeDatabases,
    cache: deps.cache,
    metrics: deps.metrics,
  });

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
      const planeKey = normalizePlaneKey(req.header("x-plane-key") ?? req.query.plane);

      // Identity fields forwarded to the service for JIT provisioning on first login.
      const jwtUsername = typeof claims.preferred_username === "string" ? claims.preferred_username : undefined;
      const jwtName = typeof claims.name === "string" ? claims.name : jwtUsername;
      const jwtEmail = typeof claims.email === "string" ? claims.email : undefined;

      const organizationIdHeader = req.headers["x-organization-ids"];
      const externalOrganizationIds = organizationIdHeader
        && typeof organizationIdHeader === "string"
        && organizationIdHeader
        ? organizationIdHeader.split(",").map((value) => value.trim()).filter(Boolean)
        : extractExternalOrganizationIds(claims.organization);

      // Authorization gate: every request must carry AUTHORIZED on the plane client.
      if (!hasAccess(claims.resource_access, planeKey)) {
        res.status(403).json({ error: "NO_PLATFORM_ACCESS", message: "AUTHORIZED role required" });
        return;
      }

      // Prefer BFF-supplied workbenches (X-Workbenches header) over JWT resource_access.
      const bffWorkbenchHeader = req.headers["x-workbenches"];
      const workbenches = bffWorkbenchHeader && typeof bffWorkbenchHeader === "string" && bffWorkbenchHeader
        ? bffWorkbenchHeader.split(",").map((s) => s.trim()).filter(Boolean)
        : extractWorkbenches(claims.realm_access, planeKey);

      const { tenant, entity, workbench } = req.query as SessionRouteQuery;

      if (!tenant || typeof tenant !== "string") {
        res.status(400).json({
          error: "MISSING_PARAM",
          message: "'tenant' is required. e.g. ?tenant=athyper&entity=LE-ATHQ&workbench=user",
        });
        return;
      }
      if (!entity || typeof entity !== "string") {
        res.status(400).json({
          error: "MISSING_PARAM",
          message: "'entity' is required (legal_entity.code).",
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
        planeKey,
        tenant,
        entity,
        workbench,
        externalOrganizationIds,
        workbenches,
        // JIT provisioning identity — used only when principal_identity_binding is absent.
        username: jwtUsername,
        name: jwtName,
        email: jwtEmail,
        mfaSatisfied: tokenHasMfa(claims),
        sodSatisfied: false,
      });

      res.json(session);

      const securityPlane: "neon" | "mesh" | "athyper" = planeKey === "admin" ? "athyper" : planeKey;
      void appendSecurityEvent(deps.planeDatabases.forPlane(planeKey).db, {
        plane: securityPlane,
        tenant_id: session.tenantOrAccountId,
        principal_id: session.principalId,
        event_code: "auth.login_success",
        category: "authentication",
        severity: "info",
        outcome: "success",
        session_id: typeof claims.session_state === "string" ? claims.session_state : null,
        user_agent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null,
        context: { plane: planeKey, workbench },
      });
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

function tokenHasMfa(claims: Record<string, unknown>): boolean {
  const methods = Array.isArray(claims.amr)
    ? claims.amr.filter((value): value is string => typeof value === "string")
    : [];
  return methods.some((method) =>
    ["mfa", "otp", "totp", "webauthn", "hwk"].includes(method.toLowerCase())
  );
}
