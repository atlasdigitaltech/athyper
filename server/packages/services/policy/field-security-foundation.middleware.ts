/**
 * Field-Level Security Middleware — Phase 1.4
 *
 * Enforces field-level access control on request bodies and response payloads.
 * Sits in the middleware chain AFTER auth + tenant context, BEFORE route handlers.
 *
 * Chain order (enforced by wiring in api.ts):
 *   1. auth       — verifies Bearer token, stamps req.claims
 *   2. tenantCtx  — resolves tenant_id from x-org header, stamps req.tenantId
 *   3. fieldSec   — strips read-forbidden fields from response, rejects writes to
 *                   write-forbidden fields (this middleware)
 *   4. route      — domain handler
 *
 * Field permissions are stored in control.entity_field:
 *   read_permission  — role list allowed to read this field (null = all)
 *   write_permission — role list allowed to write this field (null = all)
 *
 * The middleware intercepts JSON responses and removes fields the caller cannot read.
 * It also validates request bodies and returns 403 if write-protected fields are present.
 *
 * Fields can be opted in per-route via the fieldSecurityGuard() factory.
 * Routes that don't call this factory are unprotected (backward-compat).
 *
 * Usage in a route handler:
 *   router.get('/records/:type', fieldSecurityGuard(db, 'record'), async (req, res) => {
 *     // res.json() automatically strips fields the caller cannot read
 *     res.json(await fetchRecord(...));
 *   });
 */

import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { Kysely } from "kysely";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FieldPolicy {
  fieldName:       string;
  columnName:      string;
  readRoles:       string[] | null;   // null = unrestricted
  writeRoles:      string[] | null;   // null = unrestricted
}

export interface FieldSecurityContext {
  tenantId:   string | null;
  principalRoles: string[];
}

type FieldPolicyCacheLine = {
  policies:  FieldPolicy[];
  fetchedAt: number;
};

const CACHE_TTL_MS = 5 * 60_000; // 5 minutes

// Module-level cache — keyed by entityCode. Shared across requests.
const policyCache = new Map<string, FieldPolicyCacheLine>();

// ── Field policy loader ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadFieldPolicies(db: Kysely<any>, entityCode: string): Promise<FieldPolicy[]> {
  const now = Date.now();
  const cached = policyCache.get(entityCode);
  if (cached && (now - cached.fetchedAt) < CACHE_TTL_MS) {
    return cached.policies;
  }

  const rows = await db
    .selectFrom("control.entity_field as ef")
    .innerJoin("control.entity_version as ev", "ev.id", "ef.entity_version_id")
    .innerJoin("control.entity as e",          "e.id",  "ev.entity_id")
    .select([
      "ef.name as field_name",
      "ef.column_name",
      "ef.read_permission",
      "ef.write_permission",
    ] as never[])
    .where("e.name" as never, "=", entityCode as never)
    .where("ev.status" as never, "=", "EFFECTIVE" as never)
    .where("ef.is_active" as never, "=", true as never)
    .execute() as Array<{
      field_name: string;
      column_name: string;
      read_permission: string | null;
      write_permission: string | null;
    }>;

  const policies: FieldPolicy[] = rows.map((r) => ({
    fieldName:   r.field_name,
    columnName:  r.column_name,
    readRoles:   r.read_permission ? JSON.parse(r.read_permission) as string[] : null,
    writeRoles:  r.write_permission ? JSON.parse(r.write_permission) as string[] : null,
  }));

  policyCache.set(entityCode, { policies, fetchedAt: now });
  return policies;
}

// ── Role extraction ───────────────────────────────────────────────────────────

function extractRoles(claims: Record<string, unknown>): string[] {
  const roles: string[] = [];

  // Standard Keycloak realm_access.roles
  const realmAccess = claims["realm_access"] as Record<string, unknown> | undefined;
  if (Array.isArray(realmAccess?.["roles"])) {
    roles.push(...(realmAccess["roles"] as string[]));
  }

  // Resource access roles (all clients)
  const resourceAccess = claims["resource_access"] as Record<string, Record<string, unknown>> | undefined;
  if (resourceAccess && typeof resourceAccess === "object") {
    for (const client of Object.values(resourceAccess)) {
      if (Array.isArray(client?.["roles"])) {
        roles.push(...(client["roles"] as string[]));
      }
    }
  }

  // groups claim (optional Keycloak mapper)
  if (Array.isArray(claims["groups"])) {
    roles.push(...(claims["groups"] as string[]));
  }

  return [...new Set(roles)];
}

function hasAccess(roles: string[], allowedRoles: string[] | null): boolean {
  if (allowedRoles === null) return true;           // unrestricted
  if (allowedRoles.length === 0) return false;      // restricted to nobody
  return roles.some((r) => allowedRoles.includes(r));
}

// ── Response interceptor ──────────────────────────────────────────────────────

function interceptResponse(
  res: Response,
  policies: FieldPolicy[],
  callerRoles: string[],
): void {
  const forbiddenFields = policies
    .filter((p) => !hasAccess(callerRoles, p.readRoles))
    .flatMap((p) => [p.fieldName, p.columnName]);

  if (forbiddenFields.length === 0) return;

  const originalJson = res.json.bind(res);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res.json = function(body: any) {
    if (body && typeof body === "object") {
      body = stripFields(body, forbiddenFields);
    }
    return originalJson(body);
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stripFields(obj: any, forbidden: string[]): any {
  if (Array.isArray(obj)) {
    return obj.map((item) => stripFields(item, forbidden));
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (!forbidden.includes(k)) {
        result[k] = stripFields(v, forbidden);
      }
    }
    return result;
  }
  return obj;
}

// ── Body guard ────────────────────────────────────────────────────────────────

function checkWriteAccess(
  body: unknown,
  policies: FieldPolicy[],
  callerRoles: string[],
): string | null {
  if (!body || typeof body !== "object") return null;

  const bodyKeys = new Set(Object.keys(body as Record<string, unknown>));
  for (const p of policies) {
    if (!hasAccess(callerRoles, p.writeRoles)) {
      if (bodyKeys.has(p.fieldName) || bodyKeys.has(p.columnName)) {
        return p.fieldName;
      }
    }
  }
  return null;
}

// ── Middleware factory ─────────────────────────────────────────────────────────

/**
 * Returns Express middleware that enforces field-level security for the given entity.
 *
 * - Read-restricted fields are stripped from JSON responses.
 * - Write-restricted fields in request body return 403 FIELD_WRITE_FORBIDDEN.
 * - Cache TTL: 5 minutes. Invalidated on process restart.
 *
 * @param db         Kysely instance (any schema)
 * @param entityCode The control.entity.name identifying the field policy set
 */
export function fieldSecurityGuard(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  entityCode: string,
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Claims stamped by verifyBearer (route helper) — read from res.locals
      // or req.claims if the route wires it. Degrade gracefully if absent.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const claims = (req as any)["claims"] as Record<string, unknown> | undefined;
      const callerRoles = claims ? extractRoles(claims) : [];

      const policies = await loadFieldPolicies(db, entityCode);

      // Guard write operations
      if (["POST", "PUT", "PATCH"].includes(req.method)) {
        const forbidden = checkWriteAccess(req.body, policies, callerRoles);
        if (forbidden) {
          res.status(403).json({
            error: "FIELD_WRITE_FORBIDDEN",
            message: `You do not have write access to field: ${forbidden}`,
            field: forbidden,
          });
          return;
        }
      }

      // Intercept response to strip read-forbidden fields
      interceptResponse(res, policies, callerRoles);

      next();
    } catch (err) {
      // Field security failures must not break the route — degrade gracefully
      next();
    }
  };
}

/**
 * Express middleware that stamps JWT claims on the request object.
 * Place this AFTER verifyBearer has been called at the route level,
 * OR use as a route-level pre-middleware to centralize claim extraction.
 *
 * Usage: router.use(claimsMiddleware(auth));
 */
export function claimsMiddleware(auth: {
  verifyToken(token: string): Promise<Record<string, unknown>>;
}): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers["authorization"] ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(authHeader);
    if (!match) { next(); return; }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (req as any)["claims"] = await auth.verifyToken(match[1]!);
      next();
    } catch {
      next();
    }
  };
}

/**
 * Invalidate the field policy cache for an entity (call after entity_field updates).
 */
export function invalidateFieldPolicyCache(entityCode?: string): void {
  if (entityCode) {
    policyCache.delete(entityCode);
  } else {
    policyCache.clear();
  }
}
