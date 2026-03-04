// framework/runtime/src/kernel/tenantContext.ts

import { resolveRealmClientSecret } from "./config";
import {
  extractPlatformRoles,
  isPlatformControlRealm,
  PLATFORM_ACCESS_MODE,
} from "./platform-admin";

import type { RuntimeConfig } from "./config.schema";
import type { PlatformAdminContext } from "./platform-admin";

/**
 * Minimal request-like shape to keep kernel decoupled from any HTTP framework.
 * You can adapt Express/Fastify/Next easily.
 */
export interface RequestLike {
  headers?: Record<string, string | string[] | undefined>;
  auth?: {
    // decoded JWT claims if already available
    claims?: Record<string, unknown>;
  };
}

export interface TenantContext {
  realmKey: string;
  tenantKey?: string;
  orgKey?: string;
  // Effective defaults computed by cascade.
  defaults: Record<string, unknown>;
  /** Set when the request originates from the platform-control realm. */
  platformAdmin?: PlatformAdminContext;
}

export class TenantContextError extends Error {
  readonly code: string;
  readonly meta?: Record<string, unknown>;

  constructor(code: string, message: string, meta?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.meta = meta;
  }
}

function normalizeHeaderValue(
  v: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(v)) return v.find((x) => x && x.trim().length) ?? undefined;
  return v && v.trim().length ? v : undefined;
}

function getHeader(req: RequestLike, name: string): string | undefined {
  const headers = req.headers ?? {};

  const direct =
    headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];

  if (direct !== undefined) return normalizeHeaderValue(direct);

  const foundKey = Object.keys(headers).find(
    (k) => k.toLowerCase() === name.toLowerCase(),
  );

  return foundKey ? normalizeHeaderValue(headers[foundKey]) : undefined;
}

/**
 * Claim keys (customize later):
 * - realm: "realm" / "realmKey"
 * - tenant: "tenant" / "tenantKey"
 * - org: "org" / "orgKey"
 */
function getClaim(req: RequestLike, keys: string[]): string | undefined {
  const claims = req.auth?.claims;
  if (!claims) return undefined;

  for (const k of keys) {
    const v = claims[k];
    if (typeof v === "string" && v.trim().length) return v;
  }
  return undefined;
}

/**
 * Resolve TenantContext for API requests.
 *
 * Precedence:
 * 1) Headers (x-realm, x-tenant, x-org)
 * 2) Token claims (realm/tenant/org)
 * 3) Config defaults
 */
export function resolveContextFromRequest(
  cfg: RuntimeConfig,
  req: RequestLike,
): TenantContext {
  const isProd = cfg.env === "production";
  const strict = isProd && cfg.iam.requireTenantClaimsInProd === true;

  const hRealm = getHeader(req, "x-realm");
  const hTenant = getHeader(req, "x-tenant");
  const hOrg = getHeader(req, "x-org");

  const cRealm = getClaim(req, ["realmKey", "realm", "realm_key"]);
  const cTenant = getClaim(req, ["tenantKey", "tenant", "tenant_key"]);
  const cOrg = getClaim(req, ["orgKey", "org", "org_key"]);

  const realmKey =
    (strict ? (cRealm ?? hRealm) : (hRealm ?? cRealm)) ??
    cfg.iam.defaultRealmKey;

  // ─── Platform-control realm path ──────────────────────────────
  // Platform admins authenticate via a dedicated realm. Their tokens
  // do NOT contain tenant claims — the tenant comes from the
  // x-tenant-id header (set by the BFF after tenant selection).
  // We skip the normal assertRealmTenantOrg check because the
  // selected tenant belongs to a different realm's config.
  if (isPlatformControlRealm(cfg, realmKey)) {
    // Platform admin: tenant comes from header only (x-tenant or x-tenant-id)
    const selectedTenantId =
      hTenant ?? getHeader(req, "x-tenant-id") ?? undefined;

    const roles: string[] = [];
    const realmAccess = req.auth?.claims?.realm_access as
      | { roles?: string[] }
      | undefined;
    if (Array.isArray(realmAccess?.roles)) {
      roles.push(
        ...realmAccess.roles.filter((r): r is string => typeof r === "string"),
      );
    }

    const platformRoles = extractPlatformRoles(roles, cfg);
    const platformUserId = getClaim(req, ["sub"]) ?? "unknown";
    const platformDisplayName =
      getClaim(req, ["name", "preferred_username"]) ?? "unknown";

    return {
      realmKey,
      tenantKey: selectedTenantId,
      orgKey: undefined, // Platform admin does not have org context
      defaults: {},
      platformAdmin: {
        isPlatformAdmin: true,
        platformRoles,
        selectedTenantId: selectedTenantId ?? null,
        platformUserId,
        platformDisplayName,
        accessMode: PLATFORM_ACCESS_MODE,
      },
    };
  }

  // ─── Regular tenant path ──────────────────────────────────────

  const tenantKey =
    (strict ? (cTenant ?? hTenant) : (hTenant ?? cTenant)) ??
    (strict ? undefined : cfg.iam.defaultTenantKey);

  const orgKey =
    (strict ? (cOrg ?? hOrg) : (hOrg ?? cOrg)) ??
    (strict ? undefined : cfg.iam.defaultOrgKey);

  if (strict && !tenantKey) {
    throw new TenantContextError(
      "TENANT_CONTEXT_REQUIRED",
      "[iam] tenantKey is required in prod (must come from token claims or x-tenant header)",
      { env: cfg.env, realmKey },
    );
  }

  assertRealmTenantOrg(cfg, realmKey, tenantKey, orgKey);

  return {
    realmKey,
    tenantKey,
    orgKey,
    defaults: getEffectiveDefaults(cfg, realmKey, tenantKey, orgKey),
  };
}

/**
 * Resolve context for jobs/scheduler/worker.
 * Uses payload overrides if present, otherwise config defaults.
 */
export function resolveContextFromJobPayload(
  cfg: RuntimeConfig,
  payload?: {
    realmKey?: string;
    tenantKey?: string;
    orgKey?: string;
  },
): TenantContext {
  const realmKey = payload?.realmKey ?? cfg.iam.defaultRealmKey;
  const tenantKey = payload?.tenantKey ?? cfg.iam.defaultTenantKey;
  const orgKey = payload?.orgKey ?? cfg.iam.defaultOrgKey;

  assertRealmTenantOrg(cfg, realmKey, tenantKey, orgKey);

  return {
    realmKey,
    tenantKey,
    orgKey,
    defaults: getEffectiveDefaults(cfg, realmKey, tenantKey, orgKey),
  };
}

/**
 * Cascade defaults:
 * realm.defaults -> tenant.defaults -> org.defaults
 */
export function getEffectiveDefaults(
  cfg: RuntimeConfig,
  realmKey: string,
  tenantKey?: string,
  orgKey?: string,
): Record<string, unknown> {
  const realm = cfg.iam.realms[realmKey];
  if (!realm) {
    throw new TenantContextError(
      "UNKNOWN_REALM",
      `[iam] Unknown realm: ${realmKey}`,
      { realmKey },
    );
  }

  const tenant = tenantKey ? realm.tenants[tenantKey] : undefined;
  const org = tenant && orgKey ? tenant.orgs[orgKey] : undefined;

  return deepMerge(
    realm.defaults ?? {},
    tenant?.defaults ?? {},
    org?.defaults ?? {},
  );
}

/**
 * Validate realm/tenant/org keys (when provided).
 */
export function assertRealmTenantOrg(
  cfg: RuntimeConfig,
  realmKey: string,
  tenantKey?: string,
  orgKey?: string,
): void {
  const realm = cfg.iam.realms[realmKey];
  if (!realm) {
    throw new TenantContextError(
      "UNKNOWN_REALM",
      `[iam] Unknown realm: ${realmKey}`,
      {
        realmKey,
        availableRealms: Object.keys(cfg.iam.realms),
      },
    );
  }

  if (tenantKey) {
    const tenant = realm.tenants[tenantKey];
    if (!tenant) {
      throw new TenantContextError(
        "UNKNOWN_TENANT",
        `[iam] Unknown tenant: ${tenantKey} (realm=${realmKey})`,
        {
          realmKey,
          tenantKey,
          availableTenants: Object.keys(realm.tenants),
        },
      );
    }

    if (orgKey) {
      const org = tenant.orgs[orgKey];
      if (!org) {
        throw new TenantContextError(
          "UNKNOWN_ORG",
          `[iam] Unknown org: ${orgKey} (realm=${realmKey}, tenant=${tenantKey})`,
          {
            realmKey,
            tenantKey,
            orgKey,
            availableOrgs: Object.keys(tenant.orgs),
          },
        );
      }
    }
  } else if (orgKey) {
    throw new TenantContextError(
      "ORG_WITHOUT_TENANT",
      "[iam] orgKey provided without tenantKey",
      { realmKey, orgKey },
    );
  }
}

/**
 * Realm IAM config for middleware / auth initialization.
 */
export function getRealmIamConfig(cfg: RuntimeConfig, realmKey: string) {
  const realm = cfg.iam.realms[realmKey];
  if (!realm) {
    throw new TenantContextError(
      "UNKNOWN_REALM",
      `[iam] Unknown realm: ${realmKey}`,
      {
        realmKey,
      },
    );
  }

  const clientSecret = resolveRealmClientSecret(cfg, realmKey);

  return {
    issuerUrl: realm.iam.issuerUrl,
    clientId: realm.iam.clientId,
    clientSecret,
  };
}

// -------------------------
// deepMerge (objects only)
// -------------------------

type JsonObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Deep merge plain objects only.
 * Arrays & primitives overwrite.
 */
function deepMerge(...objs: unknown[]): JsonObject {
  const result: JsonObject = {};
  for (const obj of objs) {
    mergeInto(result, obj);
  }
  return result;
}

function mergeInto(target: JsonObject, src: unknown): void {
  if (!isPlainObject(src)) return;

  for (const [k, v] of Object.entries(src)) {
    if (v === undefined) continue;

    if (isPlainObject(v)) {
      const current = target[k];
      const next: JsonObject = isPlainObject(current) ? current : {};
      mergeInto(next, v);
      target[k] = next;
    } else {
      target[k] = v;
    }
  }
}
