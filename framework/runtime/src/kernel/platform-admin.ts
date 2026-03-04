// framework/runtime/src/kernel/platform-admin.ts
//
// Types and helpers for the platform-control realm.
// Platform admins authenticate via a dedicated Keycloak realm ("platform-control")
// and can switch into any tenant's context for read-only management/support.
//
// Security invariants:
//   - Platform admin access is READ-ONLY by default (no write escalation in v1)
//   - DB tenant scoping is NEVER bypassed — platform admin operates within the selected tenant
//   - The platform-control realm is NOT the Keycloak master realm

import type { RuntimeConfig } from "./config.schema";

// ─── Types ────────────────────────────────────────────────────────

export type PlatformRole =
  | "PRODUCT_ADMIN"
  | "TENANT_MANAGER"
  | "SUPPORT_ADMIN"
  | "READ_ONLY_SUPPORT";

/**
 * Platform admin access mode.
 * All platform admin access to tenant data is read-only by default.
 * Write escalation is a future enhancement.
 */
export const PLATFORM_ACCESS_MODE = "readonly" as const;
export type PlatformAccessMode = typeof PLATFORM_ACCESS_MODE;

/**
 * Context overlay attached to TenantContext when the request
 * originates from the platform-control realm.
 */
export interface PlatformAdminContext {
  readonly isPlatformAdmin: true;
  /** Platform-level roles from the Keycloak realm_access claim. */
  readonly platformRoles: PlatformRole[];
  /** Currently selected tenant ID (null before tenant selection). */
  readonly selectedTenantId: string | null;
  /** Platform admin user ID from the platform-control realm. */
  readonly platformUserId: string;
  /** Platform admin display name. */
  readonly platformDisplayName: string;
  /** Access mode — always "readonly" in v1. */
  readonly accessMode: PlatformAccessMode;
}

// ─── Guards & Helpers ─────────────────────────────────────────────

/**
 * Check if a realmKey corresponds to the platform-control realm.
 */
export function isPlatformControlRealm(
  cfg: RuntimeConfig,
  realmKey: string,
): boolean {
  return (
    cfg.platformControl.enabled && realmKey === cfg.platformControl.realmKey
  );
}

/**
 * Extract recognised platform roles from a Keycloak realm_access.roles array.
 * Unrecognised roles are silently dropped.
 */
export function extractPlatformRoles(
  roles: string[],
  cfg: RuntimeConfig,
): PlatformRole[] {
  const recognised = new Set<string>(Object.values(cfg.platformControl.roles));
  return roles.filter((r): r is PlatformRole => recognised.has(r));
}

/**
 * Check if a set of platform roles grants a specific permission.
 * Permissions are defined in `cfg.platformControl.rolePermissions`.
 */
export function hasPlatformPermission(
  roles: PlatformRole[],
  permission: string,
  cfg: RuntimeConfig,
): boolean {
  const perms = cfg.platformControl.rolePermissions;
  return roles.some((r) => perms[r]?.includes(permission) ?? false);
}

/**
 * Get the highest-priority platform role from a set.
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
