export type PlaneKey = "neon" | "mesh" | "admin";
export type RealmKey = "athyper" | "platform-control";
export type SessionNamespace = "neon" | "mesh" | "admin" | "platform";
export type TrustLevel = "tenant" | "partner" | "internal";
export type MutationMode = "full" | "read-only";
export type RealmRole = "native" | "support";
export type SupportLoginVisibility = "hidden" | "visible";

export interface RealmPolicy {
  realmKey: RealmKey;
  namespace: SessionNamespace;
  role: RealmRole;
  mandatoryMfa: boolean;
  hardwareKeyPreferred: boolean;
}

export interface PlaneConfig {
  key: PlaneKey;
  appName: string;
  browserTitle: string;
  productName: string;
  productSubtitle: string;
  audience: string;
  trustLevel: TrustLevel;
  publicHost: string;
  localHost: string;
  defaultPath: string;
  loginPath: string;
  logoutPath: string;
  cookieName: string;
  csrfCookieName: string;
  localeCookieName: string;
  realmCookieName: string;
  mfaPendingCookieName: string;
  themePreset: string;
  nativeRealm: Exclude<RealmKey, "platform-control">;
  supportRealm: "platform-control";
  supportLoginVisibility: SupportLoginVisibility;
  allowedRealms: readonly RealmPolicy[];
  mutationMode: MutationMode;
  mutationPolicy: string;
}

export interface KeycloakRuntimeConfig {
  realmKey: RealmKey;
  realm: string;
  clientId: string;
  sessionNamespace: SessionNamespace;
}

export type EnvBag = Record<string, string | undefined>;

export interface SessionPolicyDefaults {
  absoluteTtlSeconds: number;
  pkceStateTtlSeconds: number;
  idleTimeoutSeconds: number;
  idleWarningSeconds: number;
  heartbeatIntervalMs: number;
  serverRefreshBufferSeconds: number;
  clientRefreshBeforeExpirySeconds: number;
  refreshLockTtlSeconds: number;
  refreshLockWaitMs: number;
  refreshRotationGraceSeconds: number;
  mfaPendingTtlSeconds: number;
  expiredRedirectCountdownSeconds: number;
}

export function cookieNamesWithHostPrefix(baseCookieName: string): string[] {
  const hostPrefixed = `__Host-${baseCookieName}`;
  if (hostPrefixed === baseCookieName) return [baseCookieName];
  return [hostPrefixed, baseCookieName];
}

// Policy values that govern every session across all planes. Shared here so that
// auth-bff and any future server-side validators use the same constants without
// importing from each other.
//
// Key invariants:
//   serverRefreshBufferSeconds (120) < idleTimeoutSeconds (900): tokens are
//     refreshed proactively while the session is still active.
//   clientRefreshBeforeExpirySeconds (90) < serverRefreshBufferSeconds (120):
//     browser refresh attempts land inside the server refresh window.
//   refreshRotationGraceSeconds (30): old SID stays reachable long enough for
//     in-flight requests that already read the old cookie to complete.
//   refreshLockTtlSeconds (10) > refreshLockWaitMs / 1000 (0.3s): the lock
//     outlives the wait so waiters always find a refreshed session on retry.
export const SESSION_POLICY_DEFAULTS = {
  absoluteTtlSeconds: 28_800,
  pkceStateTtlSeconds: 1_800,
  idleTimeoutSeconds: 900,
  idleWarningSeconds: 60,
  heartbeatIntervalMs: 60_000,
  serverRefreshBufferSeconds: 120,
  clientRefreshBeforeExpirySeconds: 90,
  refreshLockTtlSeconds: 10,
  refreshLockWaitMs: 300,
  refreshRotationGraceSeconds: 30,
  mfaPendingTtlSeconds: 900,
  expiredRedirectCountdownSeconds: 30,
} as const satisfies SessionPolicyDefaults;

export const LOCALE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

export function pkceStateKey(state: string): string {
  return `pkce_state:${state}`;
}

export function sessKey(namespace: string, sid: string): string {
  return `sess:${namespace}:${sid}`;
}

export function userSessionsKey(namespace: string, userId: string): string {
  return `user_sessions:${namespace}:${userId}`;
}

export function refreshLockKey(namespace: string, sid: string): string {
  return `refresh_lock:${namespace}:${sid}`;
}

export function sidRotationKey(namespace: string, sid: string): string {
  return `sid_rotation:${namespace}:${sid}`;
}

// Reverse index key: maps a Keycloak session ID to the set of app session
// entries ("{namespace}:{appSid}") across all planes, enabling coordinated
// wipe on KC back-channel logout.
export function kcSessionReverseKey(kcSessionId: string): string {
  return `kc_session:${kcSessionId}`;
}

export type RuntimeWorkbench = "user" | "partner" | "admin";

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

export interface RuntimeSessionDecision {
  permissionId: string;
  canonicalCode: string;
  entityOperationId?: string;
  available: boolean;
  decision: "allow" | "deny";
  reason: string;
}

export interface RuntimeSession {
  contractVersion: "wave5.authorization-session.v2";
  evaluatorContractVersion: string;
  plane: "neon" | "admin" | "mesh";
  tenantOrAccountId: string;
  principalId: string;
  catalogVersion: string;
  authorizationFingerprint: string;
  decisions: RuntimeSessionDecision[];
  resolvedAt: string;
  expiresAt: string;
}

export function checkPermission(
  decisions: readonly RuntimeSessionDecision[] | undefined,
  permissionCode: string,
): boolean {
  return decisions?.some((entry) =>
    entry.canonicalCode === permissionCode && entry.available
  ) === true;
}

export function checkPermissions(
  decisions: readonly RuntimeSessionDecision[] | undefined,
  permissionCodes: readonly string[],
): boolean {
  return permissionCodes.every((code) => checkPermission(decisions, code));
}

export function checkAnyPermission(
  decisions: readonly RuntimeSessionDecision[] | undefined,
  permissionCodes: readonly string[],
): boolean {
  return permissionCodes.some((code) => checkPermission(decisions, code));
}

export function checkPermissionForEntity(
  decisions: readonly RuntimeSessionDecision[] | undefined,
  permissionCode: string,
  scope: RuntimeScope,
  entityCode: string,
): boolean {
  if (!checkPermission(decisions, permissionCode)) return false;
  return scope.all || scope.company_codes.includes(entityCode);
}

// Support staff log in through the "platform-control" Keycloak realm rather than
// the tenant "athyper" realm. Keeping them in a separate namespace ("platform")
// means their Redis sessions never collide with tenant-user sessions even when
// they access the same plane, and revocation of a support grant cannot affect
// ordinary user sessions.
export const PLATFORM_REALM_KEY = "platform-control" as const;
export const PLATFORM_SESSION_NAMESPACE = "platform" as const;

const SUPPORT_REALM_POLICY: RealmPolicy = {
  realmKey: PLATFORM_REALM_KEY,
  namespace: PLATFORM_SESSION_NAMESPACE,
  role: "support",
  mandatoryMfa: true,
  hardwareKeyPreferred: true,
};

export const PLANE_CONFIGS = {
  neon: {
    key: "neon",
    appName: "Neon",
    browserTitle: "Neon - Business Operating Platform",
    productName: "Business Operating Platform",
    productSubtitle: "Tenant user control plane",
    audience: "tenant-users",
    trustLevel: "tenant",
    publicHost: "neon.athyper.com",
    localHost: "neon.athyper.local",
    defaultPath: "/dashboard",
    loginPath: "/login",
    logoutPath: "/logout",
    cookieName: "neon_sid",
    csrfCookieName: "__csrf",
    localeCookieName: "neon_locale",
    realmCookieName: "neon_realm",
    mfaPendingCookieName: "neon_mfa_pending",
    themePreset: "neon-base",
    nativeRealm: "athyper",
    supportRealm: PLATFORM_REALM_KEY,
    supportLoginVisibility: "visible",
    allowedRealms: [
      {
        realmKey: "athyper",
        namespace: "neon",
        role: "native",
        mandatoryMfa: false,
        hardwareKeyPreferred: false,
      },
      SUPPORT_REALM_POLICY,
    ],
    mutationMode: "full",
    mutationPolicy:
      "Tenant-owned writes require tenant context and tenant_id. Support writes require an active audited support grant.",
  },
  mesh: {
    key: "mesh",
    appName: "Mesh",
    browserTitle: "Mesh - Business Collaboration Network",
    productName: "Business Collaboration Network",
    productSubtitle: "Partner control plane",
    audience: "partner-users",
    trustLevel: "partner",
    publicHost: "mesh.athyper.com",
    localHost: "mesh.athyper.local",
    defaultPath: "/dashboard",
    loginPath: "/login",
    logoutPath: "/logout",
    cookieName: "mesh_sid",
    csrfCookieName: "__mesh_csrf",
    localeCookieName: "mesh_locale",
    realmCookieName: "mesh_realm",
    mfaPendingCookieName: "mesh_mfa_pending",
    themePreset: "neon-base",
    nativeRealm: "athyper",
    supportRealm: PLATFORM_REALM_KEY,
    supportLoginVisibility: "hidden",
    allowedRealms: [
      {
        realmKey: "athyper",
        namespace: "mesh",
        role: "native",
        mandatoryMfa: false,
        hardwareKeyPreferred: false,
      },
      SUPPORT_REALM_POLICY,
    ],
    mutationMode: "read-only",
    mutationPolicy:
      "Partners may submit collaboration actions only through explicit tenant delegation. Mesh never directly mutates tenant business records.",
  },
  admin: {
    key: "admin",
    appName: "Admin",
    browserTitle: "Admin - Business Technology Platform",
    productName: "Business Technology Platform",
    productSubtitle: "Internal platform control plane",
    audience: "platform-admins",
    trustLevel: "internal",
    publicHost: "admin.athyper.com",
    localHost: "admin.athyper.local",
    defaultPath: "/dashboard",
    loginPath: "/login",
    logoutPath: "/logout",
    cookieName: "admin_sid",
    csrfCookieName: "__admin_csrf",
    localeCookieName: "admin_locale",
    realmCookieName: "admin_realm",
    mfaPendingCookieName: "admin_mfa_pending",
    themePreset: "neon-base",
    nativeRealm: "athyper",
    supportRealm: PLATFORM_REALM_KEY,
    supportLoginVisibility: "hidden",
    allowedRealms: [
      {
        realmKey: "athyper",
        namespace: "admin",
        role: "native",
        mandatoryMfa: true,
        hardwareKeyPreferred: true,
      },
      SUPPORT_REALM_POLICY,
    ],
    mutationMode: "full",
    mutationPolicy:
      "Internal platform writes require admin realm or active platform-control support context and must be audit logged.",
  },
} as const satisfies Record<PlaneKey, PlaneConfig>;

export function getPlaneConfig(plane: PlaneKey): PlaneConfig {
  return PLANE_CONFIGS[plane];
}

export function isPlaneKey(value: string | null | undefined): value is PlaneKey {
  return value === "neon" || value === "mesh" || value === "admin";
}

export function isRealmKey(value: string | null | undefined): value is RealmKey {
  return value === "athyper" || value === PLATFORM_REALM_KEY;
}

export function normalizeRealmKey(
  value: string | null | undefined,
  plane: PlaneKey,
): RealmKey {
  if (isRealmKey(value)) return value;
  return getPlaneConfig(plane).nativeRealm;
}

export function getRealmPolicy(plane: PlaneKey, realmKey: RealmKey): RealmPolicy | null {
  const config = getPlaneConfig(plane);
  return config.allowedRealms.find((policy) => policy.realmKey === realmKey) ?? null;
}

export function assertRealmAllowed(plane: PlaneKey, realmKey: RealmKey): RealmPolicy {
  const policy = getRealmPolicy(plane, realmKey);
  if (!policy) {
    throw new Error(`Realm ${realmKey} is not allowed for ${plane}`);
  }
  return policy;
}

export function isRealmAllowed(plane: PlaneKey, realmKey: RealmKey): boolean {
  return getRealmPolicy(plane, realmKey) != null;
}

export function getSessionNamespace(plane: PlaneKey, realmKey: RealmKey): SessionNamespace {
  return assertRealmAllowed(plane, realmKey).namespace;
}

export function isSupportRealm(realmKey: RealmKey): boolean {
  return realmKey === PLATFORM_REALM_KEY;
}

export function isSupportSession(plane: PlaneKey, realmKey: RealmKey): boolean {
  const policy = getRealmPolicy(plane, realmKey);
  return policy?.role === "support";
}

export function resolveKeycloakRuntime(
  plane: PlaneKey,
  realmKey: RealmKey,
  env: EnvBag,
): KeycloakRuntimeConfig {
  const policy = assertRealmAllowed(plane, realmKey);
  if (realmKey === PLATFORM_REALM_KEY) {
    return {
      realmKey,
      realm: env.PLATFORM_KEYCLOAK_REALM ?? PLATFORM_REALM_KEY,
      clientId: env.PLATFORM_KEYCLOAK_CLIENT_ID ?? "athyper-admin",
      sessionNamespace: policy.namespace,
    };
  }

  return {
    realmKey,
    realm: env.KEYCLOAK_REALM ?? env.ATHYPER_KEYCLOAK_REALM ?? "athyper",
    clientId: env[`${plane.toUpperCase()}_KEYCLOAK_CLIENT_ID`] ?? `${plane}-web`,
    sessionNamespace: policy.namespace,
  };
}

export type HostGuardDecision =
  | { action: "pass" }
  | { action: "reject"; reason: "host_not_allowed" | "host_missing" };

export function decideHostGuard(args: {
  host: string | null | undefined;
  allowedHosts: ReadonlySet<string>;
  allowDirectAccess: boolean;
}): HostGuardDecision {
  const { host, allowedHosts, allowDirectAccess } = args;
  if (allowDirectAccess) {
    return { action: "pass" };
  }
  // An empty allowedHosts set with allowDirectAccess=false is a misconfiguration.
  // Fail closed (reject) rather than open (allow all) to avoid accidentally
  // exposing the app if the host list is not yet populated at boot.
  if (allowedHosts.size === 0) {
    return { action: "reject", reason: "host_not_allowed" };
  }

  if (!host) {
    return { action: "reject", reason: "host_missing" };
  }

  const normalised = host.toLowerCase().replace(/:\d+$/, "");
  if (allowedHosts.has(normalised)) {
    return { action: "pass" };
  }

  return { action: "reject", reason: "host_not_allowed" };
}

export function buildPlaneHeaders(args: {
  plane: PlaneKey;
  realmKey: RealmKey;
  tenantId?: string | null;
  principalId?: string | null;
  supportGrantId?: string | null;
}): Record<string, string> {
  const namespace = getSessionNamespace(args.plane, args.realmKey);
  const headers: Record<string, string> = {
    "X-Plane": args.plane,
    "X-Realm": args.realmKey,
    "X-Session-Namespace": namespace,
  };

  if (args.tenantId) headers["X-Tenant-Id"] = args.tenantId;
  if (args.principalId) headers["X-Principal-Id"] = args.principalId;
  if (args.supportGrantId) headers["X-Support-Grant-Id"] = args.supportGrantId;

  return headers;
}
