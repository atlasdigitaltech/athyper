/**
 * @athyper/auth — Type Definitions
 *
 * Session and authentication types used by apps/web middleware,
 * packages/shell, and packages/navigation.
 *
 * Runtime session types mirror the runtime API responses:
 *   GET /api/session/bootstrap  → BootstrapResponse
 *   GET /api/session?tenant=X&entity=Y&workbench=Z → RuntimeSession
 */

// ─── BFF / cookie session ─────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  locale: string;
  timezone: string;
}

export interface TenantContext {
  tenant_id: string;
  tenant_name: string;
  tenant_code: string;
}

export interface PersonaContext {
  persona_code: string;
  workbench: string;
  /** All known permission codes keyed as boolean (true = granted). */
  permissions: Record<string, boolean>;
}

export interface Session {
  user: AuthUser;
  tenant: TenantContext;
  persona: PersonaContext;
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export type AuthState =
  | { status: "loading" }
  | { status: "authenticated"; session: Session }
  | { status: "unauthenticated" };

// ─── Bootstrap response (GET /api/session/bootstrap) ─────────────────────────

export interface BootstrapPrincipal {
  id: string;
  name: string;
  email: string;
}

export interface BootstrapEntity {
  code: string;
  name: string;
  type: string;
  country: string;
  legal_entity: string;
  workbenches: ("user" | "partner" | "admin")[];
  persona_summary: string;
  module_count: number;
}

export interface BootstrapTenant {
  code: string;
  name: string;
  workbenches: ("user" | "partner" | "admin")[];
  entities: BootstrapEntity[];
}

export interface BootstrapResponse {
  principal: BootstrapPrincipal;
  tenants: BootstrapTenant[];
  delegation_count: number;
}

// ─── Runtime session response (GET /api/session) ─────────────────────────────

export interface RuntimeModule {
  code: string;
  name: string;
  level: "user" | "admin";
}

export interface RuntimeScope {
  all: boolean;
  company_codes: string[];
}

export interface RuntimePartner {
  type: "supplier" | "customer" | "logistics";
  linked_id: string;
  linked_code: string;
}

export interface DelegationAvailable {
  delegation_id: string;
  delegator_name: string;
  delegator_persona: string;
  permissions: string[];
  expires_at: string;
  /** master.delegation_scope lookup code: company_code | module | task | entity | workflow */
  scope_type: string;
  /** Scope reference value, e.g. "ATHQ" for company_code. Null = tenant-wide. */
  scope_ref: string | null;
}

export interface ActiveDelegation {
  delegation_id: string;
  delegator_name: string;
  merged_permissions: string[];
}

export interface RuntimeSession {
  persona: string;
  workbench: "user" | "partner" | "admin";
  entity: { code: string; name: string; country: string };
  modules: RuntimeModule[];
  platform: { code: string }[];
  /** All known permissions as boolean map. false = not granted. */
  permissions: Record<string, boolean>;
  scope: RuntimeScope;
  partner?: RuntimePartner;
  delegations_available: DelegationAvailable[];
  active_delegation?: ActiveDelegation;
}

// ─── Phase 3: Authorization helpers ──────────────────────────────────────────

/**
 * Check whether a permission is granted in the current session.
 *
 * Usage:
 *   const session = await getSession(req);
 *   if (!checkPermission(session.permissions, "invoice.create")) return 403;
 *
 * All authorization deferred to DB; this is a local read from the cached
 * permissions map — no additional DB calls needed.
 */
export function checkPermission(
  permissions: Record<string, boolean> | undefined,
  permissionCode: string,
): boolean {
  if (!permissions) return false;
  return permissions[permissionCode] === true;
}

/**
 * Check multiple permissions — returns true only if ALL are granted.
 */
export function checkPermissions(
  permissions: Record<string, boolean> | undefined,
  permissionCodes: string[],
): boolean {
  return permissionCodes.every((code) => checkPermission(permissions, code));
}

/**
 * Check multiple permissions — returns true if ANY is granted.
 */
export function checkAnyPermission(
  permissions: Record<string, boolean> | undefined,
  permissionCodes: string[],
): boolean {
  return permissionCodes.some((code) => checkPermission(permissions, code));
}

/**
 * Scope-aware permission check — combines permission grant with company_code scope.
 *
 * Returns true only when:
 *   1. The permission is granted in the permissions map, AND
 *   2. Either scope.all is true (tenant-wide access), OR entityCode is in scope.company_codes.
 *
 * Usage — e.g. checking whether a user can create an invoice for entity "ATHQ":
 *   if (!checkPermissionForEntity(session.permissions, "invoice.create", session.scope, "ATHQ")) {
 *     return 403;
 *   }
 */
export function checkPermissionForEntity(
  permissions: Record<string, boolean> | undefined,
  permissionCode: string,
  scope: { all: boolean; company_codes: string[] },
  entityCode: string,
): boolean {
  if (!checkPermission(permissions, permissionCode)) return false;
  if (scope.all) return true;
  return scope.company_codes.includes(entityCode);
}

/**
 * Check a permission against the merged_permissions set from an active delegation.
 *
 * Use when the session has active_delegation set and you need to verify
 * that the specific action is covered by the delegated authority.
 *
 * Usage:
 *   if (session.active_delegation) {
 *     if (!checkDelegationPermission(session.active_delegation, "invoice.approve")) return 403;
 *   }
 */
export function checkDelegationPermission(
  activeDelegation: ActiveDelegation | undefined,
  permissionCode: string,
): boolean {
  if (!activeDelegation) return false;
  return activeDelegation.merged_permissions.includes(permissionCode);
}
