// server/src/platform-admin.ts
//
// Platform-control realm: types and helpers for product admin access.
//
// Keycloak 26.5.1 claim placement:
//   Platform control roles  → jwt.realm_access.roles       (realm roles)
//   Tenant workbench roles  → jwt.resource_access.{clientId}.roles  (client roles)
//
// These are DIFFERENT claim paths. Platform control uses realm roles so they are
// scoped to the platform-control realm only and cannot bleed into tenant realms.
//
// Security invariants (v1):
//   - All platform admin access is READ-ONLY — no write escalation
//   - DB tenant scoping is NEVER bypassed
//   - The platform-control realm is NOT the Keycloak master realm

import type { ServerConfig } from "./config.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type PlatformRole =
  | "PRODUCT_ADMIN"
  | "TENANT_MANAGER"
  | "SUPPORT_ADMIN"
  | "READ_ONLY_SUPPORT";

export const PLATFORM_ACCESS_MODE = "readonly" as const;
export type PlatformAccessMode = typeof PLATFORM_ACCESS_MODE;

/**
 * Context overlay attached to a request when it originates from
 * the platform-control realm.
 */
export interface PlatformAdminContext {
  readonly isPlatformAdmin: true;
  readonly platformRoles: PlatformRole[];
  /** Tenant the admin has switched into (null before selection). */
  readonly selectedTenantId: string | null;
  /** KC sub claim from the platform-control realm JWT. */
  readonly platformUserId: string;
  readonly platformDisplayName: string;
  readonly accessMode: PlatformAccessMode;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function isPlatformControlRealm(
  cfg: ServerConfig,
  realmKey: string,
): boolean {
  return (
    cfg.platformControl.enabled && realmKey === cfg.platformControl.realmKey
  );
}

/**
 * Extract recognised platform roles from the KC 26.5.1 `realm_access.roles`
 * array in a JWT issued by the platform-control realm.
 * Unrecognised roles are silently dropped.
 */
export function extractPlatformRoles(
  realmAccessRoles: string[],
  cfg: ServerConfig,
): PlatformRole[] {
  const recognised = new Set<string>(Object.values(cfg.platformControl.roles));
  return realmAccessRoles.filter((r): r is PlatformRole => recognised.has(r));
}

/**
 * Check whether a set of platform roles grants a given permission string.
 * Permission strings are defined in cfg.platformControl.rolePermissions.
 */
export function hasPlatformPermission(
  roles: PlatformRole[],
  permission: string,
  cfg: ServerConfig,
): boolean {
  const perms = cfg.platformControl.rolePermissions;
  return roles.some((r) => perms[r]?.includes(permission) ?? false);
}

/**
 * Resolve the highest-priority role from a set.
 * Priority: PRODUCT_ADMIN > TENANT_MANAGER > SUPPORT_ADMIN > READ_ONLY_SUPPORT
 */
export function getEffectivePlatformRole(
  roles: PlatformRole[],
): PlatformRole | undefined {
  const priority: PlatformRole[] = [
    "PRODUCT_ADMIN",
    "TENANT_MANAGER",
    "SUPPORT_ADMIN",
    "READ_ONLY_SUPPORT",
  ];
  return priority.find((r) => roles.includes(r));
}
