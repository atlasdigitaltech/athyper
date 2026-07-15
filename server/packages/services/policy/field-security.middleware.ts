/**
 * Field Security Enforcement Middleware
 *
 * Reads control.field_security_policy for the requested entity type and applies
 * field-level masking to API response payloads based on the requesting principal's
 * roles. Runs as Express middleware on list/detail entity endpoints.
 *
 * Masking strategies (defined in control.field_security_policy.masking_strategy):
 *   full    — replaces the value with null
 *   partial — masks all but the last 4 characters with '****' for strings
 *   hash    — replaces the value with a deterministic SHA-256 hash prefix (8 hex chars)
 *
 * Cache: policies are cached per (tenantId, entityType) for 5 minutes in-process.
 * Invalidation: on any UPDATE to control.field_security_policy (outbox event TBD).
 *
 * Principal role resolution:
 *   Roles are read from the JWT claims ('roles' array claim).
 *   A field is VISIBLE if the principal has ANY role from field_security_policy.access_roles.
 *   A field is MASKED if access_roles is empty (null / []) — meaning no roles grant access.
 *
 * Usage:
 *   import { createFieldSecurityMiddleware } from './field-security.middleware.js';
 *   const fsmw = createFieldSecurityMiddleware({ db, logger });
 *   router.get('/records/:entity', fsmw, listRecordsHandler);
 */

import type { RequestHandler } from "express";
import type { Kysely } from "kysely";
import { createHash } from "crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FieldSecurityMiddlewareDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  logger?: { warn(event: string, fields?: Record<string, unknown>): void };
}

export interface FieldPolicy {
  fieldName:       string;       // control.entity_field.name (logical name)
  columnName:      string;       // control.entity_field.column_name
  maskingStrategy: "full" | "partial" | "hash";
  accessRoles:     string[];     // roles that can see plaintext; empty = nobody
  piiClassification: string;
}

// ── In-process cache ─────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  policies:   FieldPolicy[];
  fetchedAt:  number;
}

const policyCache = new Map<string, CacheEntry>();

function cacheKey(tenantId: string, entityType: string): string {
  return `${tenantId}::${entityType}`;
}

// ── Masking ───────────────────────────────────────────────────────────────────

function applyMask(value: unknown, strategy: "full" | "partial" | "hash"): unknown {
  if (value === null || value === undefined) return value;

  switch (strategy) {
    case "full":
      return null;

    case "partial": {
      const s = String(value);
      if (s.length <= 4) return "****";
      return "****" + s.slice(-4);
    }

    case "hash": {
      const hex = createHash("sha256").update(String(value)).digest("hex");
      return `[pii:${hex.slice(0, 8)}]`;
    }

    default:
      return null;
  }
}

/**
 * Strip reference-label companion keys for a masked FK field. The
 * runtime label enricher attaches `${name}_label`, `${base}_label`,
 * `${name}_code`, `${base}_code` (and column-name variants) for any
 * field with a `reference_config.target_entity`. When the base FK is
 * masked, those companion keys would leak the human-readable identity
 * the policy was hiding — so delete them outright. Same base-name rule
 * the enricher uses: strip a trailing `_id`.
 *
 * Safe on non-reference fields: a `phone_label` key never exists, so
 * the deletes are no-ops for non-FK policies.
 */
export function stripReferenceCompanionKeys(
  record: Record<string, unknown>,
  fieldName: string,
): void {
  const base = fieldName.endsWith("_id") ? fieldName.slice(0, -3) : fieldName;
  delete record[`${fieldName}_label`];
  delete record[`${fieldName}_code`];
  if (base !== fieldName) {
    delete record[`${base}_label`];
    delete record[`${base}_code`];
  }
}

/**
 * Apply field security policies to a single record object.
 * Mutates the record in place for performance.
 *
 * Exported for unit testing — production callers should go through
 * createFieldSecurityMiddleware or applyFieldSecurityMask.
 */
export function maskRecord(
  record: Record<string, unknown>,
  policies: FieldPolicy[],
  principalRoles: Set<string>,
): void {
  for (const policy of policies) {
    // Check if principal has any of the access roles
    const hasAccess = policy.accessRoles.some((role) => principalRoles.has(role));
    if (hasAccess) continue; // No masking needed

    // Apply mask to both logical name and column name (API may use either)
    if (policy.fieldName in record) {
      record[policy.fieldName] = applyMask(record[policy.fieldName], policy.maskingStrategy);
    }
    if (policy.columnName in record && policy.columnName !== policy.fieldName) {
      record[policy.columnName] = applyMask(record[policy.columnName], policy.maskingStrategy);
    }
    // Strip enricher-produced label/code companions for both shapes
    // so masked FKs don't leak through the human-readable name.
    stripReferenceCompanionKeys(record, policy.fieldName);
    if (policy.columnName !== policy.fieldName) {
      stripReferenceCompanionKeys(record, policy.columnName);
    }
  }
}

// ── Policy loader ─────────────────────────────────────────────────────────────

async function loadPolicies(
  db: FieldSecurityMiddlewareDeps["db"],
  tenantId: string,
  entityType: string,
): Promise<FieldPolicy[]> {
  const key = cacheKey(tenantId, entityType);
  const cached = policyCache.get(key);

  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.policies;
  }

  // control.field_security_policy joined directly to control.entity via entity_id
  const normalizedEntityType = entityType.replace(/-/g, "_");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await (db as any)
    .selectFrom("control.field_security_policy as fsp")
    .innerJoin("control.entity as e", "e.id", "fsp.entity_id")
    .select([
      "fsp.field_path",
      "fsp.mask_strategy",
      "fsp.role_list",
      "fsp.pii_classification",
    ])
    .where("e.entity_code", "=", normalizedEntityType)
    .where("fsp.is_active", "=", true)
    .where((eb: any) =>
      eb.or([
        eb("fsp.tenant_id", "is", null),
        eb("fsp.tenant_id", "=", tenantId),
      ])
    )
    .execute() as Record<string, unknown>[];

  const policies: FieldPolicy[] = rows.map((row) => {
    const rawStrategy = row["mask_strategy"] as string;
    const maskingStrategy: "full" | "partial" | "hash" =
      rawStrategy === "partial" ? "partial" :
      rawStrategy === "hash"    ? "hash"    : "full";
    return {
      fieldName:         row["field_path"] as string,
      columnName:        row["field_path"] as string,
      maskingStrategy,
      accessRoles:       Array.isArray(row["role_list"]) ? (row["role_list"] as string[]) : [],
      piiClassification: (row["pii_classification"] as string) ?? "pii",
    };
  });

  policyCache.set(key, { policies, fetchedAt: Date.now() });
  return policies;
}

// ── Middleware factory ─────────────────────────────────────────────────────────

export interface FieldSecurityMiddlewareOptions {
  /** Extract entity type from the request. Default: req.params.entity */
  getEntityType?: (req: Parameters<RequestHandler>[0]) => string | null;
  /** Extract tenant id from request (fallback to x-tenant-id header) */
  getTenantId?: (req: Parameters<RequestHandler>[0]) => string | null;
  /** Extract principal roles from request (fallback to claims.roles array) */
  getRoles?: (req: Parameters<RequestHandler>[0]) => string[];
}

export function createFieldSecurityMiddleware(
  deps: FieldSecurityMiddlewareDeps,
  options: FieldSecurityMiddlewareOptions = {},
): RequestHandler {
  const { db, logger } = deps;

  return async (req, res, next) => {
    // Resolve entity type
    const getEntityType = options.getEntityType ?? ((r) => (r.params["entity"] as string | undefined) ?? null);
    const entityType = getEntityType(req);
    if (!entityType) { next(); return; }

    // Resolve tenant id
    const getTenantId = options.getTenantId ?? ((r) => {
      const h = r.headers["x-tenant-id"] as string | undefined;
      if (h) return h;
      // Fall back to JWT claims attached by upstream auth middleware
      const claims = (r as { claims?: Record<string, unknown> }).claims;
      const t = claims?.["tenant_id"];
      return typeof t === "string" ? t : null;
    });
    const tenantId = getTenantId(req);
    if (!tenantId) { next(); return; }

    // Load policies (may be empty = no PII fields for this entity)
    let policies: FieldPolicy[];
    try {
      policies = await loadPolicies(db, tenantId, entityType);
    } catch (err) {
      logger?.warn("field_security_policy_load_failed", { entityType, err: String(err) });
      next(); return; // Fail open — do not block the request
    }

    if (policies.length === 0) { next(); return; }

    // Resolve principal roles
    const getRoles = options.getRoles ?? ((r) => {
      const claims = (r as { claims?: Record<string, unknown> }).claims;
      const rolesRaw = claims?.["roles"];
      return Array.isArray(rolesRaw) ? (rolesRaw as string[]) : [];
    });
    const principalRoles = new Set(getRoles(req));

    // Intercept res.json to apply masking before sending
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      if (body && typeof body === "object" && !Array.isArray(body)) {
        const bodyObj = body as Record<string, unknown>;

        // Handle { data: Record } and { data: Record[] } shapes
        if (Array.isArray(bodyObj["data"])) {
          for (const record of bodyObj["data"] as Record<string, unknown>[]) {
            if (record && typeof record === "object") {
              maskRecord(record, policies, principalRoles);
            }
          }
        } else if (bodyObj["data"] && typeof bodyObj["data"] === "object" && !Array.isArray(bodyObj["data"])) {
          maskRecord(bodyObj["data"] as Record<string, unknown>, policies, principalRoles);
        } else if (bodyObj["items"] && Array.isArray(bodyObj["items"])) {
          for (const record of bodyObj["items"] as Record<string, unknown>[]) {
            if (record && typeof record === "object") {
              maskRecord(record, policies, principalRoles);
            }
          }
        }
      }
      return originalJson(body);
    };

    next();
  };
}

/** Invalidate cache for a specific (tenantId, entityType) pair */
export function invalidateFieldSecurityCache(tenantId: string, entityType: string): void {
  policyCache.delete(cacheKey(tenantId, entityType));
}

/** Invalidate entire cache (e.g. on bulk schema changes) */
export function clearFieldSecurityCache(): void {
  policyCache.clear();
}

/**
 * Inline field-security helper for use inside route handlers that have already
 * resolved tenantId and principalRoles.
 *
 * Applies masking in-place to:
 *   - body.data  when it is an array (list response)
 *   - body.data  when it is a plain object (detail response)
 *   - body itself when it is a plain object with no data wrapper
 *
 * Call this BEFORE res.json() after auth and tenant resolution to avoid
 * a second token verification pass.
 */
export async function applyFieldSecurityMask(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  tenantId:       string,
  entityType:     string,
  principalRoles: string[],
  body:           unknown,
  logger?:        { warn(event: string, fields?: Record<string, unknown>): void },
): Promise<void> {
  let policies: FieldPolicy[];
  try {
    policies = await loadPolicies(db, tenantId, entityType);
  } catch (err) {
    logger?.warn("field_security_inline_load_failed", { entityType, err: String(err) });
    return; // fail-open
  }

  if (policies.length === 0) return;

  const roles = new Set(principalRoles);

  if (!body || typeof body !== "object") return;
  const b = body as Record<string, unknown>;

  if (Array.isArray(b["data"])) {
    for (const record of b["data"] as Record<string, unknown>[]) {
      if (record && typeof record === "object") maskRecord(record, policies, roles);
    }
  } else if (b["data"] && typeof b["data"] === "object" && !Array.isArray(b["data"])) {
    maskRecord(b["data"] as Record<string, unknown>, policies, roles);
  } else if (!("data" in b)) {
    // Bare object (e.g. single-row response without data wrapper)
    maskRecord(b, policies, roles);
  }
}
