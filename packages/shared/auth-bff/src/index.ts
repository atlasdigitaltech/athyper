import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  assertRealmAllowed,
  getPlaneConfig,
  getSessionNamespace,
  isPlaneKey,
  isRealmKey,
  isSupportSession,
  kcSessionReverseKey,
  normalizeRealmKey,
  pkceStateKey,
  refreshLockKey,
  resolveKeycloakRuntime,
  sessKey,
  SESSION_POLICY_DEFAULTS,
  sidRotationKey,
  type SessionPolicyDefaults,
  type EnvBag,
  type PlaneKey,
  type RealmKey,
  type SessionNamespace,
  userSessionsKey,
} from "@athyper/session-plane";
import { createSessionRedisClient as getSessionRedis } from "@athyper/session-store";

type RedisClient = Awaited<ReturnType<typeof getSessionRedis>>;

export interface OrgMembership {
  id: string;
  name: string;
  alias: string;
  roles: string[];
  tenantId?: string;
  tenantCode?: string;
  tenantName?: string;
  contextType?: string;
  workspaceId?: string;
  workspaceCode?: string;
  workspaceType?: string;
  organizationId?: string;
  organizationCode?: string;
  organizationName?: string;
  legalEntityId?: string;
  legalEntityCode?: string;
  legalEntityName?: string;
  keycloakOrganizationId?: string;
  keycloakOrganizationAlias?: string;
}

export interface V4Session {
  version: 2;
  sid: string;
  planeKey: PlaneKey;
  realmKey: RealmKey;
  sessionNamespace: SessionNamespace;
  userId: string;
  username: string;
  displayName: string;
  email?: string;
  organizations: Record<string, OrgMembership>;
  activeOrg: string | null;
  activeWorkbench: string | null;
  scope: string;
  tokenType: string;
  keycloakSessionId?: string;
  accessToken: string;
  refreshToken?: string;
  accessExpiresAt: number;
  refreshExpiresAt?: number;
  idToken?: string;
  ipHash: string;
  uaHash: string;
  csrfToken: string;
  previousCsrfToken?: string;
  csrfRotatedAt?: number;
  createdAt: number;
  lastSeenAt: number;
  mfaRequired: boolean;
  mfaVerified: boolean;
  mfaVerifiedAt?: number;
}

export interface PublicSession {
  authenticated: true;
  planeKey: PlaneKey;
  realmKey: RealmKey;
  sessionNamespace: SessionNamespace;
  supportMode: boolean;
  userId: string;
  username: string;
  displayName: string;
  email?: string;
  organizations: Record<string, OrgMembership>;
  activeOrg: string | null;
  activeWorkbench: string | null;
  accessExpiresAt: number;
  mfaRequired: boolean;
  mfaVerified: boolean;
  sessionPolicy: SessionPolicyDefaults;
}

export type ServerPlaneSessionFailureReason =
  | "MFA_REQUIRED"
  | "SESSION_BINDING_MISMATCH"
  | "SESSION_IDLE_EXPIRED"
  | "SESSION_NOT_FOUND"
  | "SESSION_REFRESH_EXPIRED"
  | "SESSION_REFRESH_FAILED"
  | "SESSION_STORE_UNAVAILABLE";

export type ServerPlaneSessionValidation =
  | { ok: true; sid: string; session: V4Session; publicSession: PublicSession; sessionPolicy: SessionPolicyDefaults }
  | { ok: false; reason: ServerPlaneSessionFailureReason; requestId: string; status: number };

type HeaderReader = {
  get(name: string): string | null | undefined;
};

type CookieReader = {
  get(name: string): { value?: string } | string | null | undefined;
};

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  token_type: string;
  expires_in: number;
  refresh_expires_in?: number;
  scope?: string;
  session_state?: string;
}

interface PkceState {
  codeVerifier: string;
  returnUrl: string;
  realmKey: RealmKey;
  realm: string;
  clientId: string;
  redirectUri: string;
  provider: string | null;
  expectedContext?: LoginExpectedContext;
  silent?: boolean;
  forceAuthn?: boolean;
}

interface LoginExpectedContext {
  tenantId: string;
  tenantCode: string;
  organizationCode: string;
  organizationName: string;
  workspaceId: string;
  workspaceType: string;
  networkRole: string;
}

interface DiscoveryCandidate {
  id: string;
  planeKey: PlaneKey;
  tenantId: string;
  tenantCode: string;
  tenantName: string;
  workspaceId: string;
  workspaceCode: string;
  workspaceName: string;
  workspaceType: string;
  workspaceSubtitle: string;
  realmKey: string;
  providerHint: string | null;
  authMethodLabel: string;
  hostname: string | null;
  deliveryEmail: string | null;
  networkAccountId?: string | null;
  networkAccountCode?: string | null;
  networkAccountName?: string | null;
  networkAccountRole?: string | null;
  networkRelationshipType?: string | null;
}

interface DiscoveryTokenPayload {
  version: 1;
  planeKey: PlaneKey;
  identifier: string;
  email?: string;
  deliveryEmail: string | null;
  returnUrl: string;
  candidates: DiscoveryCandidate[];
  createdAt: number;
  expiresAt: number;
  stage1VerificationMode?: DiscoveryStage1VerificationMode;
  verifiedTrustTtlDays?: number;
}

interface DiscoveryPublicCandidate {
  id: string;
  tenantCode: string;
  tenantName: string;
  workspaceId: string;
  workspaceCode: string;
  workspaceName: string;
  workspaceType: string;
  workspaceSubtitle: string;
  authMethodLabel: string;
  hostname: string | null;
  networkAccountId?: string | null;
  networkAccountCode?: string | null;
  networkAccountName?: string | null;
  networkAccountRole?: string | null;
  networkRelationshipType?: string | null;
}

type DiscoveryStage1VerificationMode = "required" | "disabled";

interface DiscoveryPolicy {
  stage1VerificationMode: DiscoveryStage1VerificationMode;
  tokenTtlSeconds: number;
  resendCooldownSeconds: number;
  verifiedTrustTtlDays: number;
}

interface DiscoveryResolverResponse {
  candidates?: unknown;
  policy?: unknown;
}

interface DiscoveryResolution {
  candidates: DiscoveryCandidate[];
  policy: DiscoveryPolicy;
}

interface DiscoveryTrustPayload {
  version: 1;
  planeKey: PlaneKey;
  identifierHash: string;
  createdAt: number;
  expiresAt: number;
}

interface NormalizedDiscoveryIdentifier {
  kind: "email" | "username";
  value: string;
}

const SESSION_TTL_SECONDS = SESSION_POLICY_DEFAULTS.absoluteTtlSeconds;
// PKCE state is created before there is a validated BFF session, bearer token,
// or tenant context. Keep this as a shared fallback instead of resolving it via
// the runtime session-policy endpoint.
const PKCE_STATE_TTL_SECONDS = SESSION_POLICY_DEFAULTS.pkceStateTtlSeconds;
const MFA_PENDING_TTL_SECONDS = SESSION_POLICY_DEFAULTS.mfaPendingTtlSeconds;
const AUTHORIZATION_SCOPE = "openid";
const AUTH_SELECT_PATH = "/auth/select";
const DEFAULT_DISCOVERY_TOKEN_TTL_SECONDS = readIntegerEnv("AUTH_DISCOVERY_TOKEN_TTL_SECONDS", 900, 60, 3600);
const DEFAULT_DISCOVERY_RESEND_COOLDOWN_SECONDS = readIntegerEnv(
  "AUTH_DISCOVERY_RESEND_COOLDOWN_SECONDS",
  readIntegerEnv("NEXT_PUBLIC_AUTH_DISCOVERY_RESEND_COOLDOWN_SECONDS", 30, 0, 300),
  0,
  300,
);
const DEFAULT_DISCOVERY_TRUST_TTL_DAYS = readIntegerEnv("AUTH_DISCOVERY_VERIFIED_TRUST_TTL_DAYS", 30, 0, 90);
const DEFAULT_DISCOVERY_POLICY: DiscoveryPolicy = defaultDiscoveryPolicy();
const DISCOVERY_RATE_LIMIT_WINDOW_SECONDS = 60;
const DISCOVERY_RATE_LIMIT_MAX = 5;
// Minimum artificial delay for all discovery POST responses. Without this, an
// attacker can determine whether an identifier exists by observing that invalid
// identifiers return a 400 faster than valid ones that go through resolver and
// email-delivery calls. The constant 240ms is well above typical KC round-trip
// times while remaining imperceptible to end users.
const DISCOVERY_RESPONSE_MIN_MS = 240;
const AUTH_POLICY_CACHE_TTL_MS = 30_000;

interface ParameterSnapshotPayload {
  values?: Record<string, unknown>;
}

interface CachedAuthPolicy {
  expiresAt: number;
  policy: SessionPolicyDefaults;
}

const authPolicyCache = new Map<string, CachedAuthPolicy>();

// Returns the __Host- prefixed cookie name in non-local environments.
// __Host- enforces: Secure flag, no Domain attribute, Path=/ — all browser-enforced.
// Local dev uses plain names because __Host- requires HTTPS (unavailable over HTTP).
function effectiveCookieName(base: string): string {
  const env = process.env.ENVIRONMENT ?? "local";
  return env === "local" ? base : `__Host-${base}`;
}

// Per-plane idle timeout defaults used when no tenant-level override is configured.
// Admin is capped at 15 min (high-privilege surface). Mesh at 30 min. Neon at 60 min.
const PLANE_IDLE_TIMEOUT_DEFAULTS: Record<PlaneKey, number> = {
  neon: 3_600,
  mesh: 1_800,
  admin: 900,
};

function getPlaneSessionDefaults(plane: PlaneKey): SessionPolicyDefaults {
  return { ...SESSION_POLICY_DEFAULTS, idleTimeoutSeconds: PLANE_IDLE_TIMEOUT_DEFAULTS[plane] };
}

const AUTH_POLICY_BOUNDS = {
  absoluteTtlSeconds: { min: 1_800, max: 43_200 },
  idleTimeoutSeconds: { min: 300, max: 3_600 },
  idleWarningSeconds: { min: 30, max: 600 },
  heartbeatIntervalMs: { min: 60_000, max: 600_000 },
  serverRefreshBufferSeconds: { min: 60, max: 600 },
  clientRefreshBeforeExpirySeconds: { min: 30, max: 300 },
  refreshLockTtlSeconds: { min: 3, max: 60 },
  refreshLockWaitMs: { min: 50, max: 2_000 },
  refreshRotationGraceSeconds: { min: 5, max: 120 },
  mfaPendingTtlSeconds: { min: 300, max: 1_800 },
  expiredRedirectCountdownSeconds: { min: 5, max: 300 },
} as const;

async function resolveAuthSessionPolicy(
  plane: PlaneKey,
  session: Pick<V4Session, "accessToken" | "activeOrg" | "organizations" | "planeKey" | "realmKey"> | null,
): Promise<SessionPolicyDefaults> {
  if (!session) return getPlaneSessionDefaults(plane);

  const activeOrgAlias = session.activeOrg && session.organizations[session.activeOrg]
    ? session.activeOrg
    : Object.keys(session.organizations)[0] ?? null;
  const activeMembership = activeOrgAlias ? session.organizations[activeOrgAlias] : undefined;
  const tenantKey = activeMembership?.tenantId ?? activeOrgAlias;
  if (!activeOrgAlias || !tenantKey) return getPlaneSessionDefaults(plane);

  const cacheKey = `${plane}:${session.realmKey}:${tenantKey}`;
  const cached = authPolicyCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.policy;

  const runtimeUrl = process.env.RUNTIME_API_URL;
  if (!runtimeUrl) return getPlaneSessionDefaults(plane);

  try {
    const response = await fetch(`${runtimeUrl.replace(/\/+$/, "")}/api/iam/parameters/effective?namespace=auth`, {
      cache: "no-store",
      headers: buildRuntimePolicyHeaders(session, activeOrgAlias, activeMembership),
      signal: AbortSignal.timeout(1_500),
    });
    if (!response.ok) return getPlaneSessionDefaults(plane);

    const snapshot = await response.json().catch(() => null) as ParameterSnapshotPayload | null;
    const policy = normalizeAuthPolicy(snapshot?.values ?? {});
    authPolicyCache.set(cacheKey, { expiresAt: Date.now() + AUTH_POLICY_CACHE_TTL_MS, policy });
    return policy;
  } catch {
    return getPlaneSessionDefaults(plane);
  }
}

function buildRuntimePolicyHeaders(
  session: Pick<V4Session, "accessToken" | "organizations" | "planeKey" | "realmKey">,
  activeOrgAlias: string,
  activeMembership: OrgMembership | undefined,
): Record<string, string> {
  const orgAliases = Object.keys(session.organizations);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.accessToken}`,
    "X-Realm": session.realmKey,
    "X-Plane": session.planeKey,
    "X-Org": activeOrgAlias,
  };

  if (activeMembership?.tenantId) headers["X-Tenant-ID"] = activeMembership.tenantId;
  if (activeMembership?.tenantCode) headers["X-Tenant-Code"] = activeMembership.tenantCode;
  if (activeMembership?.contextType) headers["X-Org-Context-Type"] = activeMembership.contextType;
  if (activeMembership?.organizationId) headers["X-Organization-ID"] = activeMembership.organizationId;
  if (activeMembership?.organizationCode) headers["X-Organization-Code"] = activeMembership.organizationCode;
  if (activeMembership?.legalEntityId) headers["X-Legal-Entity-ID"] = activeMembership.legalEntityId;
  if (activeMembership?.legalEntityCode) headers["X-Legal-Entity-Code"] = activeMembership.legalEntityCode;
  if (orgAliases.length > 0) headers["X-Org-Aliases"] = orgAliases.join(",");
  if (activeMembership?.roles.length) headers["X-Workbenches"] = activeMembership.roles.join(",");

  return headers;
}

function normalizeAuthPolicy(values: Record<string, unknown>): SessionPolicyDefaults {
  const fallback = SESSION_POLICY_DEFAULTS;
  const serverRefreshBufferSeconds = boundedInt(
    values["auth.token.server_refresh_buffer_seconds"],
    fallback.serverRefreshBufferSeconds,
    AUTH_POLICY_BOUNDS.serverRefreshBufferSeconds.min,
    AUTH_POLICY_BOUNDS.serverRefreshBufferSeconds.max,
  );
  const clientRefreshBeforeExpirySeconds = Math.min(
    boundedInt(
      values["auth.token.client_refresh_lead_seconds"],
      fallback.clientRefreshBeforeExpirySeconds,
      AUTH_POLICY_BOUNDS.clientRefreshBeforeExpirySeconds.min,
      AUTH_POLICY_BOUNDS.clientRefreshBeforeExpirySeconds.max,
    ),
    Math.max(AUTH_POLICY_BOUNDS.clientRefreshBeforeExpirySeconds.min, serverRefreshBufferSeconds - 1),
  );
  const idleTimeoutSeconds = boundedInt(
    values["auth.idle.timeout_seconds"],
    fallback.idleTimeoutSeconds,
    AUTH_POLICY_BOUNDS.idleTimeoutSeconds.min,
    AUTH_POLICY_BOUNDS.idleTimeoutSeconds.max,
  );
  const idleWarningSeconds = Math.min(
    boundedInt(
      values["auth.idle.warning_seconds"],
      fallback.idleWarningSeconds,
      AUTH_POLICY_BOUNDS.idleWarningSeconds.min,
      AUTH_POLICY_BOUNDS.idleWarningSeconds.max,
    ),
    Math.max(AUTH_POLICY_BOUNDS.idleWarningSeconds.min, idleTimeoutSeconds - 30),
  );

  return {
    absoluteTtlSeconds: boundedInt(
      values["auth.session.absolute_ttl_seconds"],
      fallback.absoluteTtlSeconds,
      AUTH_POLICY_BOUNDS.absoluteTtlSeconds.min,
      AUTH_POLICY_BOUNDS.absoluteTtlSeconds.max,
    ),
    // PKCE state is pre-session, so auth.pkce.state_ttl_seconds is not read
    // from a tenant-scoped runtime snapshot here.
    pkceStateTtlSeconds: fallback.pkceStateTtlSeconds,
    idleTimeoutSeconds,
    idleWarningSeconds,
    heartbeatIntervalMs: boundedInt(
      values["auth.heartbeat.interval_ms"],
      fallback.heartbeatIntervalMs,
      AUTH_POLICY_BOUNDS.heartbeatIntervalMs.min,
      AUTH_POLICY_BOUNDS.heartbeatIntervalMs.max,
    ),
    serverRefreshBufferSeconds,
    clientRefreshBeforeExpirySeconds,
    refreshLockTtlSeconds: boundedInt(
      values["auth.refresh.lock_ttl_seconds"],
      fallback.refreshLockTtlSeconds,
      AUTH_POLICY_BOUNDS.refreshLockTtlSeconds.min,
      AUTH_POLICY_BOUNDS.refreshLockTtlSeconds.max,
    ),
    refreshLockWaitMs: boundedInt(
      values["auth.refresh.lock_wait_ms"],
      fallback.refreshLockWaitMs,
      AUTH_POLICY_BOUNDS.refreshLockWaitMs.min,
      AUTH_POLICY_BOUNDS.refreshLockWaitMs.max,
    ),
    refreshRotationGraceSeconds: boundedInt(
      values["auth.refresh.sid_rotation_grace_seconds"],
      fallback.refreshRotationGraceSeconds,
      AUTH_POLICY_BOUNDS.refreshRotationGraceSeconds.min,
      AUTH_POLICY_BOUNDS.refreshRotationGraceSeconds.max,
    ),
    mfaPendingTtlSeconds: boundedInt(
      values["auth.mfa.pending_ttl_seconds"],
      fallback.mfaPendingTtlSeconds,
      AUTH_POLICY_BOUNDS.mfaPendingTtlSeconds.min,
      AUTH_POLICY_BOUNDS.mfaPendingTtlSeconds.max,
    ),
    expiredRedirectCountdownSeconds: boundedInt(
      values["auth.session.expired_redirect_countdown_seconds"],
      fallback.expiredRedirectCountdownSeconds,
      AUTH_POLICY_BOUNDS.expiredRedirectCountdownSeconds.min,
      AUTH_POLICY_BOUNDS.expiredRedirectCountdownSeconds.max,
    ),
  };
}

function boundedInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const integer = Math.floor(parsed);
  return Math.min(max, Math.max(min, integer));
}

type AuthErrorCode =
  | "AUTH_CALLBACK_ERROR"
  | "AUTH_PROVIDER_DENIED"
  | "CONTEXT_RESOLUTION_FAILED"
  | "CONTEXT_NOT_ALLOWED"
  | "CONTEXT_UPDATE_FAILED"
  | "CSRF_VALIDATION_FAILED"
  | "INVALID_AUTH_CALLBACK"
  | "INVALID_CODE"
  | "INVALID_REALM"
  | "LOGIN_EXPIRED"
  | "MFA_REQUIRED"
  | "MFA_VERIFIER_UNAVAILABLE"
  | "MISSING_CONTEXT"
  | "NO_ACCESS_CONTEXT"
  | "NO_PLATFORM_ACCESS"
  | "SESSION_BINDING_MISMATCH"
  | "SESSION_EXPIRED"
  | "SESSION_IDLE_EXPIRED"
  | "SESSION_NOT_FOUND"
  | "SESSION_REFRESH_FAILED"
  | "SESSION_REFRESH_EXPIRED"
  | "SESSION_STORE_UNAVAILABLE";

const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  AUTH_CALLBACK_ERROR: "We could not complete sign in. Please try again.",
  AUTH_PROVIDER_DENIED: "The identity provider did not complete sign in.",
  CONTEXT_RESOLUTION_FAILED: "We could not resolve your access context. Please try again shortly.",
  CONTEXT_NOT_ALLOWED: "This account is not allowed to enter the selected context.",
  CONTEXT_UPDATE_FAILED: "We could not activate the selected context. Please try again.",
  CSRF_VALIDATION_FAILED: "Security validation failed. Refresh the page and try again.",
  INVALID_AUTH_CALLBACK: "The sign-in callback was incomplete. Please start again.",
  INVALID_CODE: "The verification code is invalid or expired.",
  INVALID_REALM: "The sign-in realm is not valid for this app.",
  LOGIN_EXPIRED: "The sign-in session expired. Please start again.",
  MFA_REQUIRED: "Step-up verification is required before continuing.",
  MFA_VERIFIER_UNAVAILABLE: "Verification is temporarily unavailable. Please try again shortly.",
  MISSING_CONTEXT: "Choose a valid access context before continuing.",
  NO_ACCESS_CONTEXT: "No active access context was found for this app.",
  NO_PLATFORM_ACCESS: "Your account is not authorized for this app.",
  SESSION_BINDING_MISMATCH: "For your security, this session was closed because the browser context changed.",
  SESSION_EXPIRED: "Your session expired. Please sign in again.",
  SESSION_IDLE_EXPIRED: "Your session was closed after being idle. Please sign in again.",
  SESSION_NOT_FOUND: "No active session was found. Please sign in again.",
  SESSION_REFRESH_FAILED: "We could not refresh your session. Please try again shortly.",
  SESSION_REFRESH_EXPIRED: "Your sign-in expired. Please sign in again.",
  SESSION_STORE_UNAVAILABLE: "Session services are temporarily unavailable.",
};

interface AuthErrorBody {
  error: AuthErrorCode;
  message: string;
  requestId: string;
  authenticated?: false;
  redirect?: string;
  retryAfter?: number;
}

interface AuthAuditEvent {
  eventType: string;
  outcome: "success" | "failure" | "blocked" | "partial";
  planeKey: PlaneKey;
  realmKey?: RealmKey | undefined;
  sessionNamespace?: SessionNamespace | undefined;
  requestId: string;
  userId?: string | undefined;
  username?: string | undefined;
  sidHash?: string | undefined;
  activeOrg?: string | null;
  activeWorkbench?: string | null;
  reasonCode?: AuthErrorCode | string | undefined;
  detail?: Record<string, unknown> | undefined;
}

class AuthFlowError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message?: string) {
    super(message ?? AUTH_ERROR_MESSAGES[code]);
    this.name = "AuthFlowError";
    this.code = code;
  }
}

interface ContextResolverResponse {
  organizations?: unknown;
  contextCount?: unknown;
  source?: unknown;
}

export function createLoginGetHandler(plane: PlaneKey) {
  return (request: NextRequest) => handleLogin(plane, request);
}

export function createDiscoveryGetHandler(plane: PlaneKey) {
  return (request: NextRequest) => handleDiscoveryGet(plane, request);
}

export function createDiscoveryPostHandler(plane: PlaneKey) {
  return (request: NextRequest) => handleDiscoveryPost(plane, request);
}

export function createCallbackGetHandler(plane: PlaneKey) {
  return (request: NextRequest) => handleCallback(plane, request);
}

export function createSessionGetHandler(plane: PlaneKey) {
  return (request: NextRequest) => handleSessionGet(plane, request);
}

export function createSessionPatchHandler(plane: PlaneKey) {
  return (request: NextRequest) => handleSessionPatch(plane, request);
}

export function createSessionDeleteHandler(plane: PlaneKey) {
  return (request: NextRequest) => handleSessionDelete(plane, request);
}

export function createRefreshPostHandler(plane: PlaneKey) {
  return (request: NextRequest) => handleRefresh(plane, request);
}

export function createTouchPostHandler(plane: PlaneKey) {
  return (request: NextRequest) => handleTouch(plane, request);
}

export function createLogoutGetHandler(plane: PlaneKey) {
  return (request: NextRequest) => handleLogout(plane, request);
}

export function createLogoutPostHandler(plane: PlaneKey) {
  return (request: NextRequest) => handleLogout(plane, request);
}

export function createMfaVerifyPostHandler(plane: PlaneKey) {
  return (request: NextRequest) => handleMfaVerify(plane, request);
}

export function createMfaVerifyGetHandler(plane: PlaneKey) {
  return () => NextResponse.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });
}

export function createBackchannelLogoutPostHandler(plane: PlaneKey) {
  return (request: NextRequest) => handleBackchannelLogout(plane, request);
}

export async function validatePlaneServerSession(
  plane: PlaneKey,
  input: {
    cookies: CookieReader;
    headers?: HeaderReader;
    allowMfaPending?: boolean;
  },
): Promise<ServerPlaneSessionValidation> {
  const requestId = requestIdFromHeaders(input.headers);
  const config = getPlaneConfig(plane);
  const sid = readCookieValue(input.cookies, effectiveCookieName(config.cookieName));
  if (!sid) {
    return { ok: false, reason: "SESSION_NOT_FOUND", requestId, status: 401 };
  }

  const realmKey = normalizeRealmKey(readCookieValue(input.cookies, effectiveCookieName(config.realmCookieName)), plane);
  const namespace = getSessionNamespace(plane, realmKey);
  const redis = await getSessionRedis().catch(() => null);
  if (!redis) {
    await recordAuthAudit({
      eventType: "session_load_failed",
      outcome: "failure",
      planeKey: plane,
      realmKey,
      sessionNamespace: namespace,
      requestId,
      sidHash: hashValue(sid),
      reasonCode: "SESSION_STORE_UNAVAILABLE",
    });
    return { ok: false, reason: "SESSION_STORE_UNAVAILABLE", requestId, status: 503 };
  }

  let raw = await redis.get(sessKey(namespace, sid));
  let effectiveSid = sid;
  if (!raw) {
    const rotatedSid = await redis.get(sidRotationKey(namespace, sid)).catch(() => null);
    if (rotatedSid) {
      effectiveSid = String(rotatedSid);
      raw = await redis.get(sessKey(namespace, effectiveSid));
    }
  }

  if (!raw) {
    await recordAuthAudit({
      eventType: "session_not_found",
      outcome: "failure",
      planeKey: plane,
      realmKey,
      sessionNamespace: namespace,
      requestId,
      sidHash: hashValue(sid),
      reasonCode: "SESSION_NOT_FOUND",
    });
    return { ok: false, reason: "SESSION_NOT_FOUND", requestId, status: 401 };
  }

  let session: V4Session;
  try {
    session = JSON.parse(String(raw)) as V4Session;
  } catch {
    await destroySession(redis, namespace, effectiveSid);
    await recordAuthAudit({
      eventType: "session_parse_failed",
      outcome: "failure",
      planeKey: plane,
      realmKey,
      sessionNamespace: namespace,
      requestId,
      sidHash: hashValue(effectiveSid),
      reasonCode: "SESSION_NOT_FOUND",
    });
    return { ok: false, reason: "SESSION_NOT_FOUND", requestId, status: 401 };
  }

  if (isBindingMismatchForValues(session, clientIpFromHeaders(input.headers), input.headers?.get("user-agent") ?? "unknown")) {
    await destroySession(redis, session.sessionNamespace, effectiveSid, session);
    await recordAuthAudit({
      eventType: "session_binding_mismatch",
      outcome: "blocked",
      planeKey: plane,
      realmKey: session.realmKey,
      sessionNamespace: session.sessionNamespace,
      requestId,
      userId: session.userId,
      username: session.username,
      sidHash: hashValue(effectiveSid),
      activeOrg: session.activeOrg,
      activeWorkbench: session.activeWorkbench,
      reasonCode: "SESSION_BINDING_MISMATCH",
    });
    return { ok: false, reason: "SESSION_BINDING_MISMATCH", requestId, status: 401 };
  }

  const now = Math.floor(Date.now() / 1000);
  const sessionPolicy = await resolveAuthSessionPolicy(plane, session);
  if (now - session.lastSeenAt >= sessionPolicy.idleTimeoutSeconds) {
    await destroySession(redis, session.sessionNamespace, effectiveSid, session);
    await recordAuthAudit({
      eventType: "session_idle_expired",
      outcome: "failure",
      planeKey: plane,
      realmKey: session.realmKey,
      sessionNamespace: session.sessionNamespace,
      requestId,
      userId: session.userId,
      username: session.username,
      sidHash: hashValue(effectiveSid),
      activeOrg: session.activeOrg,
      activeWorkbench: session.activeWorkbench,
      reasonCode: "SESSION_IDLE_EXPIRED",
    });
    return { ok: false, reason: "SESSION_IDLE_EXPIRED", requestId, status: 401 };
  }

  if (session.mfaRequired && !session.mfaVerified && !input.allowMfaPending) {
    return { ok: false, reason: "MFA_REQUIRED", requestId, status: 403 };
  }

  const refresh = await refreshServerSessionForValidation({
    plane,
    redis,
    sid: effectiveSid,
    session,
    requestId,
    now,
    sessionPolicy,
  });
  if (refresh.status === "expired") {
    return { ok: false, reason: "SESSION_REFRESH_EXPIRED", requestId, status: 401 };
  }
  if (refresh.status === "failed" && session.accessExpiresAt <= now) {
    return { ok: false, reason: "SESSION_REFRESH_FAILED", requestId, status: 503 };
  }
  if (refresh.status === "ready") {
    session = refresh.session;
  }

  if (session.lastSeenAt !== now) {
    session = {
      ...session,
      lastSeenAt: now,
    };
    await saveSessionPreservingTtl(redis, session, session.sid);
  }

  return {
    ok: true,
    sid: session.sid,
    session,
    publicSession: toPublicSession(plane, session, sessionPolicy),
    sessionPolicy,
  };
}

type ServerSessionRefreshResult =
  | { status: "not_needed" }
  | { status: "ready"; session: V4Session }
  | { status: "expired" }
  | { status: "failed" };

async function refreshServerSessionForValidation(args: {
  plane: PlaneKey;
  redis: RedisClient;
  sid: string;
  session: V4Session;
  requestId: string;
  now: number;
  sessionPolicy: SessionPolicyDefaults;
}): Promise<ServerSessionRefreshResult> {
  const { plane, redis, sid, session, requestId, now, sessionPolicy } = args;
  if (session.accessExpiresAt - now > sessionPolicy.serverRefreshBufferSeconds) {
    return { status: "not_needed" };
  }

  if (!session.refreshToken || (session.refreshExpiresAt && session.refreshExpiresAt < now)) {
    await destroySession(redis, session.sessionNamespace, sid, session);
    await recordAuthAudit({
      eventType: "session_refresh_expired",
      outcome: "failure",
      planeKey: plane,
      realmKey: session.realmKey,
      sessionNamespace: session.sessionNamespace,
      requestId,
      userId: session.userId,
      username: session.username,
      sidHash: hashValue(sid),
      activeOrg: session.activeOrg,
      activeWorkbench: session.activeWorkbench,
      reasonCode: "SESSION_REFRESH_EXPIRED",
    });
    return { status: "expired" };
  }

  // Distributed refresh lock prevents thundering-herd: when multiple concurrent
  // requests for the same session all detect an expiring token, only the first one
  // to acquire the NX lock performs the actual KC token exchange. The others wait
  // for the configured bounded lock wait, then read the refreshed session from Redis.
  const lockKey = refreshLockKey(session.sessionNamespace, sid);
  const acquired = await redis.set(lockKey, "1", { NX: true, EX: sessionPolicy.refreshLockTtlSeconds });
  if (!acquired) {
    await new Promise((resolve) => setTimeout(resolve, sessionPolicy.refreshLockWaitMs));
    const refreshed = await readSessionAfterRefreshWait(redis, session.sessionNamespace, sid, now);
    return refreshed ? { status: "ready", session: refreshed } : { status: "failed" };
  }

  try {
    const runtime = resolveKeycloakRuntime(plane, session.realmKey, process.env);
    const tokens = await refreshTokens({
      baseUrl: process.env.KEYCLOAK_BASE_URL ?? "https://iam.athyper.local",
      realm: runtime.realm,
      clientId: runtime.clientId,
      clientSecret: resolveKeycloakClientSecret(plane, session.realmKey, runtime.clientId, process.env),
      refreshToken: session.refreshToken,
    });
    const updated: V4Session = {
      ...session,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? session.refreshToken,
      accessExpiresAt: now + (tokens.expires_in ?? 3600),
      refreshExpiresAt: tokens.refresh_expires_in ? now + tokens.refresh_expires_in : session.refreshExpiresAt,
      idToken: tokens.id_token ?? session.idToken,
      lastSeenAt: now,
    };
    await saveSessionPreservingTtl(redis, updated, sid);
    await recordAuthAudit({
      eventType: "session_refreshed",
      outcome: "success",
      planeKey: plane,
      realmKey: session.realmKey,
      sessionNamespace: session.sessionNamespace,
      requestId,
      userId: session.userId,
      username: session.username,
      sidHash: hashValue(sid),
      activeOrg: session.activeOrg,
      activeWorkbench: session.activeWorkbench,
    });
    return { status: "ready", session: updated };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Refresh failed";
    if (isHardRefreshFailure(reason)) {
      await destroySession(redis, session.sessionNamespace, sid, session);
      await recordAuthAudit({
        eventType: "session_refresh_failed",
        outcome: "failure",
        planeKey: plane,
        realmKey: session.realmKey,
        sessionNamespace: session.sessionNamespace,
        requestId,
        userId: session.userId,
        username: session.username,
        sidHash: hashValue(sid),
        activeOrg: session.activeOrg,
        activeWorkbench: session.activeWorkbench,
        reasonCode: "SESSION_REFRESH_EXPIRED",
        detail: { reason },
      });
      return { status: "expired" };
    }

    await recordAuthAudit({
      eventType: "session_refresh_failed",
      outcome: "failure",
      planeKey: plane,
      realmKey: session.realmKey,
      sessionNamespace: session.sessionNamespace,
      requestId,
      userId: session.userId,
      username: session.username,
      sidHash: hashValue(sid),
      activeOrg: session.activeOrg,
      activeWorkbench: session.activeWorkbench,
      reasonCode: "SESSION_REFRESH_FAILED",
      detail: { reason },
    });
    return { status: "failed" };
  } finally {
    await redis.del(lockKey).catch(() => {});
  }
}

async function readSessionAfterRefreshWait(
  redis: RedisClient,
  namespace: SessionNamespace,
  sid: string,
  now: number,
): Promise<V4Session | null> {
  const raw = await redis.get(sessKey(namespace, sid)).catch(() => null);
  const session = parseSessionJson(raw);
  if (session && session.accessExpiresAt > now) return session;

  const rotatedSid = await redis.get(sidRotationKey(namespace, sid)).catch(() => null);
  if (!rotatedSid) return null;

  const rotatedRaw = await redis.get(sessKey(namespace, String(rotatedSid))).catch(() => null);
  const rotated = parseSessionJson(rotatedRaw);
  return rotated && rotated.accessExpiresAt > now ? rotated : null;
}

function parseSessionJson(raw: unknown): V4Session | null {
  if (!raw) return null;
  try {
    return JSON.parse(String(raw)) as V4Session;
  } catch {
    return null;
  }
}

// These Keycloak error strings indicate the refresh token is permanently invalid
// (user logged out server-side, session revoked, or password changed). Unlike
// transient network errors, these must destroy the local session rather than
// returning a retryable error — the client can never recover without re-authenticating.
function isHardRefreshFailure(reason: string): boolean {
  return reason.includes("invalid_grant") || reason.includes("Session not active") || reason.includes("Token not found");
}

export async function handleDiscoveryGet(plane: PlaneKey, request: NextRequest): Promise<NextResponse> {
  const requestId = requestIdFrom(request);
  const token = request.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "MISSING_TOKEN", requestId }, { status: 400 });
  }

  const payload = await loadDiscoveryPayload(token).catch(() => null);
  if (!payload || payload.planeKey !== plane) {
    return NextResponse.json({ error: "DISCOVERY_TOKEN_INVALID", requestId }, { status: 410 });
  }

  const response = NextResponse.json({
    verified: true,
    identifier: payload.identifier,
    email: payload.email ?? payload.identifier,
    expiresAt: payload.expiresAt,
    candidates: payload.candidates.map(publicDiscoveryCandidate),
  });
  await rememberDiscoveryTrust(plane, request, response, payload, requestId);
  return response;
}

export async function handleDiscoveryPost(plane: PlaneKey, request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();
  const requestId = requestIdFrom(request);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (body["action"] === "select") {
    return handleDiscoverySelect(plane, request, body, requestId);
  }

  const identifier = normalizeDiscoveryIdentifier(
    body["identifier"] ?? body["email"] ?? body["username"] ?? body["userId"],
  );
  const config = getPlaneConfig(plane);
  const returnUrl = sanitizeReturnUrl(
    typeof body["returnUrl"] === "string" ? body["returnUrl"] : null,
    config.defaultPath,
  );
  if (!identifier) {
    await minimumDiscoveryResponseDelay(startedAt);
    return NextResponse.json(
      { error: "INVALID_IDENTIFIER", message: "Enter a valid username or email.", requestId },
      { status: 400 },
    );
  }
  const identifierValue = identifier.value;

  const redis = await getSessionRedis().catch(() => null);
  if (!redis) {
    await recordAuthAudit({
      eventType: "discovery_start_failed",
      outcome: "failure",
      planeKey: plane,
      requestId,
      reasonCode: "SESSION_STORE_UNAVAILABLE",
    });
    await minimumDiscoveryResponseDelay(startedAt);
    return NextResponse.json(
      { error: "DISCOVERY_UNAVAILABLE", message: "Sign-in discovery is temporarily unavailable.", requestId },
      { status: 503 },
    );
  }

  let attempts: number;
  try {
    const rateKey = discoveryRateKey(plane, identifierValue, clientIp(request));
    attempts = await redis.incr(rateKey);
    if (attempts === 1) await redis.expire(rateKey, DISCOVERY_RATE_LIMIT_WINDOW_SECONDS);
  } catch (err) {
    console.warn(`[auth-bff/${plane}/discovery/${requestId}] rate limit unavailable`, err);
    await recordAuthAudit({
      eventType: "discovery_start_failed",
      outcome: "failure",
      planeKey: plane,
      requestId,
      reasonCode: "DISCOVERY_RATE_LIMIT_UNAVAILABLE",
    });
    await minimumDiscoveryResponseDelay(startedAt);
    return discoveryUnavailableResponse(requestId);
  }
  if (attempts > DISCOVERY_RATE_LIMIT_MAX) {
    await recordAuthAudit({
      eventType: "discovery_rate_limited",
      outcome: "blocked",
      planeKey: plane,
      requestId,
      detail: { identifierHash: hashValue(identifierValue), identifierKind: identifier.kind },
    });
    await minimumDiscoveryResponseDelay(startedAt);
    // Return a fake "verification_sent" rather than a 429 to prevent enumeration:
    // a 429 would confirm that the identifier is valid (otherwise there would be
    // nothing to rate-limit). The Retry-After header is still set for legitimate
    // clients that respect it.
    return NextResponse.json(
      {
        status: "verification_sent",
        identifierHint: maskIdentifier(identifierValue),
        emailHint: maskIdentifier(identifierValue),
        expiresInSeconds: DEFAULT_DISCOVERY_TOKEN_TTL_SECONDS,
        resendCooldownSeconds: DEFAULT_DISCOVERY_RESEND_COOLDOWN_SECONDS,
      },
      { status: 202, headers: { "Retry-After": String(DISCOVERY_RATE_LIMIT_WINDOW_SECONDS) } },
    );
  }

  let resolution: DiscoveryResolution;
  try {
    resolution = await resolveDiscoveryResolution(plane, identifierValue, requestId);
  } catch (err) {
    console.warn(`[auth-bff/${plane}/discovery/${requestId}]`, err);
    await recordAuthAudit({
      eventType: "discovery_start_failed",
      outcome: "failure",
      planeKey: plane,
      requestId,
      reasonCode: "DISCOVERY_RESOLVER_UNAVAILABLE",
      detail: {
        identifierHash: hashValue(identifierValue),
        identifierKind: identifier.kind,
      },
    });
    await minimumDiscoveryResponseDelay(startedAt);
    return discoveryUnavailableResponse(requestId);
  }
  const { candidates, policy } = resolution;

  if (candidates.length === 0) {
    await recordAuthAudit({
      eventType: "discovery_no_route",
      outcome: "blocked",
      planeKey: plane,
      requestId,
      detail: {
        identifierHash: hashValue(identifierValue),
        identifierKind: identifier.kind,
      },
    });
    await minimumDiscoveryResponseDelay(startedAt);
    return NextResponse.json(
      {
        error: "DISCOVERY_NO_MATCH",
        message: "We could not find an organization for that user ID or email.",
        requestId,
      },
      { status: 404 },
    );
  }

  const deliveryEmail = resolveDiscoveryDeliveryEmail(candidates, identifier);

  if (
    policy.stage1VerificationMode === "disabled"
    || await hasValidDiscoveryTrust(redis, plane, request, identifierValue)
  ) {
    let token: string;
    try {
      token = await storeDiscoverySelectionToken(redis, {
        plane,
        identifier,
        deliveryEmail,
        returnUrl,
        candidates,
        policy,
      });
    } catch (err) {
      console.warn(`[auth-bff/${plane}/discovery/${requestId}] token store unavailable`, err);
      await recordAuthAudit({
        eventType: "discovery_start_failed",
        outcome: "failure",
        planeKey: plane,
        requestId,
        reasonCode: "DISCOVERY_TOKEN_STORE_UNAVAILABLE",
      });
      await minimumDiscoveryResponseDelay(startedAt);
      return discoveryUnavailableResponse(requestId);
    }

    await recordAuthAudit({
      eventType: "discovery_stage1_verified",
      outcome: "success",
      planeKey: plane,
      requestId,
      detail: {
        identifierHash: hashValue(identifierValue),
        identifierKind: identifier.kind,
        candidateCount: candidates.length,
        policyMode: policy.stage1VerificationMode,
      },
    });

    await minimumDiscoveryResponseDelay(startedAt);
    return NextResponse.json({
      status: "verified",
      verified: true,
      token,
      identifier: identifierValue,
      email: identifier.kind === "email" ? identifierValue : deliveryEmail ?? null,
      expiresInSeconds: policy.tokenTtlSeconds,
      candidates: candidates.map(publicDiscoveryCandidate),
    });
  }

  if (!deliveryEmail && !shouldExposeDiscoveryDebugLink()) {
    await recordAuthAudit({
      eventType: "discovery_start_failed",
      outcome: "failure",
      planeKey: plane,
      requestId,
      reasonCode: "DISCOVERY_DELIVERY_EMAIL_MISSING",
      detail: {
        identifierHash: hashValue(identifierValue),
        identifierKind: identifier.kind,
      },
    });
    await minimumDiscoveryResponseDelay(startedAt);
    return discoveryUnavailableResponse(requestId);
  }

  const resendWaitSeconds = await readDiscoveryResendCooldown(redis, plane, identifierValue, clientIp(request), policy)
    .catch(() => 0);
  if (resendWaitSeconds > 0) {
    await minimumDiscoveryResponseDelay(startedAt);
    return NextResponse.json(
      {
        status: "verification_sent",
        identifierHint: maskIdentifier(identifierValue),
        emailHint: maskIdentifier(identifierValue),
        expiresInSeconds: policy.tokenTtlSeconds,
        resendCooldownSeconds: resendWaitSeconds,
      },
      { status: 202, headers: { "Retry-After": String(resendWaitSeconds) } },
    );
  }

  let debugVerifyUrl: string | undefined;
  let token: string;
  try {
    token = await storeDiscoverySelectionToken(redis, {
      plane,
      identifier,
      deliveryEmail,
      returnUrl,
      candidates,
      policy,
    });
  } catch (err) {
    console.warn(`[auth-bff/${plane}/discovery/${requestId}] token store unavailable`, err);
    await recordAuthAudit({
      eventType: "discovery_start_failed",
      outcome: "failure",
      planeKey: plane,
      requestId,
      reasonCode: "DISCOVERY_TOKEN_STORE_UNAVAILABLE",
    });
    await minimumDiscoveryResponseDelay(startedAt);
    return discoveryUnavailableResponse(requestId);
  }
  const publicBaseUrl = resolvePublicBaseUrl(plane, request);
  const verifyUrl = discoveryVerifyUrl(publicBaseUrl, token, returnUrl);
  if (deliveryEmail) {
    await deliverDiscoveryLink({
      plane,
      email: deliveryEmail,
      verifyUrl,
      requestId,
      expiresInSeconds: policy.tokenTtlSeconds,
    }).catch((err) => {
      console.warn(`[auth-bff/${plane}/discovery/${requestId}] delivery failed`, err);
    });
  } else {
    console.warn(`[auth-bff/${plane}/discovery/${requestId}] no delivery email available for identifier discovery`);
  }
  if (shouldExposeDiscoveryDebugLink()) debugVerifyUrl = verifyUrl;
  await writeDiscoveryResendCooldown(redis, plane, identifierValue, clientIp(request), policy).catch(() => undefined);

  await recordAuthAudit({
    eventType: "discovery_started",
    outcome: "success",
    planeKey: plane,
    requestId,
    detail: {
      identifierHash: hashValue(identifierValue),
      identifierKind: identifier.kind,
      candidateCount: candidates.length,
      deliveryConfigured: Boolean(process.env.AUTH_DISCOVERY_DELIVERY_URL),
      policyMode: policy.stage1VerificationMode,
    },
  });

  await minimumDiscoveryResponseDelay(startedAt);
  return NextResponse.json(
    {
      status: "verification_sent",
      identifierHint: maskIdentifier(identifierValue),
      emailHint: maskIdentifier(identifierValue),
      expiresInSeconds: policy.tokenTtlSeconds,
      resendCooldownSeconds: policy.resendCooldownSeconds,
      debugVerifyUrl,
    },
    { status: 202 },
  );
}

async function handleDiscoverySelect(
  plane: PlaneKey,
  request: NextRequest,
  body: Record<string, unknown>,
  requestId: string,
): Promise<NextResponse> {
  const token = typeof body["token"] === "string" ? body["token"].trim() : "";
  const optionId = typeof body["optionId"] === "string" ? body["optionId"].trim() : "";
  const payload = token ? await loadDiscoveryPayload(token).catch(() => null) : null;
  if (!payload || payload.planeKey !== plane) {
    return NextResponse.json({ error: "DISCOVERY_TOKEN_INVALID", requestId }, { status: 410 });
  }

  const candidate = payload.candidates.find((item) => item.id === optionId);
  if (!candidate) {
    return NextResponse.json({ error: "DISCOVERY_OPTION_INVALID", requestId }, { status: 400 });
  }

  const config = getPlaneConfig(plane);
  const realmKey = parseRequestedRealmKey(candidate.realmKey, plane, false);
  if (!realmKey) {
    return NextResponse.json({ error: "INVALID_REALM", requestId }, { status: 400 });
  }
  const returnUrl = sanitizeReturnUrl(
    typeof body["returnUrl"] === "string" ? body["returnUrl"] : payload.returnUrl,
    config.defaultPath,
  );
  const loginUrl = buildInternalLoginUrl({
    config,
    realmKey,
    provider: candidate.providerHint,
    loginHint: payload.identifier,
    returnUrl,
    expectedContext: {
      tenantId: candidate.tenantId,
      tenantCode: candidate.tenantCode,
      organizationCode: candidate.workspaceCode,
      organizationName: candidate.workspaceName,
      workspaceId: candidate.workspaceId,
      workspaceType: candidate.workspaceType,
      networkRole: candidate.networkRelationshipType ?? candidate.networkAccountRole ?? "",
    },
  });

  await recordAuthAudit({
    eventType: "discovery_organization_selected",
    outcome: "success",
    planeKey: plane,
    realmKey,
    requestId,
    detail: {
      identifierHash: hashValue(payload.identifier),
      tenantCode: candidate.tenantCode,
      organizationCode: candidate.workspaceCode,
      providerHint: candidate.providerHint,
    },
  });

  return NextResponse.json({
    loginUrl,
    organization: publicDiscoveryCandidate(candidate),
    workspace: publicDiscoveryCandidate(candidate),
  });
}

export async function handleLogin(plane: PlaneKey, request: NextRequest): Promise<NextResponse> {
  const requestId = requestIdFrom(request);
  const config = getPlaneConfig(plane);
  const returnUrl = sanitizeReturnUrl(
    request.nextUrl.searchParams.get("returnUrl") ?? request.nextUrl.searchParams.get("redirect"),
    config.defaultPath,
  );
  const provider = request.nextUrl.searchParams.get("provider");
  const loginHint = normalizeLoginHint(request.nextUrl.searchParams.get("login_hint") ?? request.nextUrl.searchParams.get("email"));
  const expectedContext = normalizeLoginExpectedContext({
    tenantId: request.nextUrl.searchParams.get("selected_tenant_id"),
    tenantCode: request.nextUrl.searchParams.get("selected_tenant"),
    organizationCode: request.nextUrl.searchParams.get("selected_org"),
    organizationName: request.nextUrl.searchParams.get("selected_org_name"),
    workspaceId: request.nextUrl.searchParams.get("selected_workspace_id"),
    workspaceType: request.nextUrl.searchParams.get("selected_workspace_type"),
    networkRole: request.nextUrl.searchParams.get("selected_role"),
  });
  const realmKey = parseRequestedRealmKey(request.nextUrl.searchParams.get("realm"), plane, true);
  if (!realmKey) {
    await recordAuthAudit({
      eventType: "login_start_failed",
      outcome: "failure",
      planeKey: plane,
      requestId,
      reasonCode: "INVALID_REALM",
      detail: { requestedRealm: request.nextUrl.searchParams.get("realm") },
    });
    return redirectToLoginError(plane, request, "INVALID_REALM", requestId);
  }
  const policy = assertRealmAllowed(plane, realmKey);
  const runtime = resolveKeycloakRuntime(plane, realmKey, process.env);
  const publicBaseUrl = resolvePublicBaseUrl(plane, request);
  const redirectUri = `${publicBaseUrl}/api/auth/callback`;
  const baseUrl = process.env.KEYCLOAK_BASE_URL ?? "https://iam.athyper.local";
  const { codeVerifier, codeChallenge, state } = generatePkceChallenge();
  const redis = await getSessionRedis().catch(() => null);
  if (!redis) {
    await recordAuthAudit({
      eventType: "login_start_failed",
      outcome: "failure",
      planeKey: plane,
      realmKey,
      sessionNamespace: runtime.sessionNamespace,
      requestId,
      reasonCode: "SESSION_STORE_UNAVAILABLE",
    });
    return redirectToLoginError(plane, request, "SESSION_STORE_UNAVAILABLE", requestId);
  }

  const isSilent = request.nextUrl.searchParams.get("silent") === "true";
  const forceAuthn =
    request.nextUrl.searchParams.get("force") === "1" ||
    request.nextUrl.searchParams.get("force_authn") === "true";
  const promptValue = isSilent ? "none" : (forceAuthn ? "login" : undefined);

  const pkce: PkceState = {
    codeVerifier,
    returnUrl,
    realmKey,
    realm: runtime.realm,
    clientId: runtime.clientId,
    redirectUri,
    provider,
    expectedContext: expectedContext ?? undefined,
    silent: isSilent || undefined,
    forceAuthn: forceAuthn || undefined,
  };
  await redis.set(pkceStateKey(state), JSON.stringify(pkce), { EX: PKCE_STATE_TTL_SECONDS });

  const authUrl = buildAuthorizationUrl({
    baseUrl,
    realm: runtime.realm,
    clientId: runtime.clientId,
    redirectUri,
    codeChallenge,
    state,
    prompt: promptValue,
    idpHint: provider ?? undefined,
    loginHint: loginHint ?? undefined,
  });
  const finalUrl = new URL(authUrl);
  finalUrl.searchParams.set("athyper_plane", plane);
  finalUrl.searchParams.set("athyper_realm_role", policy.role);

  // Admin logins re-authenticate if the KC SSO session is older than 1 hour.
  // MFA is enforced by the admin-mfa-required flow bound to admin-web in KC;
  // acr_values is intentionally omitted — aal2 is not mapped in the realm LoA
  // table, which causes KC to loop indefinitely after completing OTP.
  if (plane === "admin" && realmKey === "athyper") {
    finalUrl.searchParams.set("max_age", "3600");
  }

  await recordAuthAudit({
    eventType: "login_started",
    outcome: "success",
    planeKey: plane,
    realmKey,
    sessionNamespace: runtime.sessionNamespace,
      requestId,
      detail: { returnUrl, provider: provider ?? null, expectedContext: expectedContext ?? null },
    });
  return NextResponse.redirect(finalUrl);
}

export async function handleCallback(plane: PlaneKey, request: NextRequest): Promise<NextResponse> {
  const requestId = requestIdFrom(request);
  const config = getPlaneConfig(plane);
  const publicBaseUrl = resolvePublicBaseUrl(plane, request);
  const error = request.nextUrl.searchParams.get("error");
  if (error) {
    // login_required from a silent SSO attempt means KC has no active session.
    // Redirect back to the login page to show the form instead of an error.
    if (error === "login_required") {
      const stateParam = request.nextUrl.searchParams.get("state");
      if (stateParam) {
        const silentRedis = await getSessionRedis().catch(() => null);
        if (silentRedis) {
          const rawPkce = await silentRedis.get(pkceStateKey(stateParam));
          if (rawPkce) {
            await silentRedis.del(pkceStateKey(stateParam));
            const silentPkce = JSON.parse(String(rawPkce)) as PkceState;
            if (silentPkce.silent) {
              const dest = new URL(config.loginPath, publicBaseUrl);
              if (silentPkce.returnUrl) dest.searchParams.set("returnUrl", silentPkce.returnUrl);
              const env = process.env.ENVIRONMENT ?? "local";
              const res = NextResponse.redirect(dest);
              res.cookies.set("sso_skip", "1", {
                httpOnly: true,
                secure: env !== "local",
                sameSite: "lax",
                path: config.loginPath,
                maxAge: 60,
              });
              return res;
            }
          }
        }
      }
    }
    await recordAuthAudit({
      eventType: "login_provider_denied",
      outcome: "failure",
      planeKey: plane,
      requestId,
      reasonCode: "AUTH_PROVIDER_DENIED",
      detail: {
        providerError: error,
        providerDescription: request.nextUrl.searchParams.get("error_description") ?? null,
      },
    });
    return redirectToLoginError(plane, request, "AUTH_PROVIDER_DENIED", requestId);
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!code || !state) {
    await recordAuthAudit({
      eventType: "login_callback_invalid",
      outcome: "failure",
      planeKey: plane,
      requestId,
      reasonCode: "INVALID_AUTH_CALLBACK",
      detail: { hasCode: Boolean(code), hasState: Boolean(state) },
    });
    return redirectToLoginError(plane, request, "INVALID_AUTH_CALLBACK", requestId);
  }

  const redis = await getSessionRedis().catch(() => null);
  if (!redis) {
    await recordAuthAudit({
      eventType: "login_callback_failed",
      outcome: "failure",
      planeKey: plane,
      requestId,
      reasonCode: "SESSION_STORE_UNAVAILABLE",
    });
    return redirectToLoginError(plane, request, "SESSION_STORE_UNAVAILABLE", requestId);
  }
  const stateRaw = await redis.get(pkceStateKey(state));
  if (!stateRaw) {
    await recordAuthAudit({
      eventType: "login_state_expired",
      outcome: "failure",
      planeKey: plane,
      requestId,
      reasonCode: "LOGIN_EXPIRED",
    });
    return redirectToLoginError(plane, request, "LOGIN_EXPIRED", requestId);
  }
  // Delete the PKCE state immediately after reading so it can only be used once.
  // Leaving it in Redis until TTL expiry would allow an attacker who captures the
  // callback URL (e.g., via referrer header) to replay the code exchange.
  await redis.del(pkceStateKey(state));

  try {
    const pkce = JSON.parse(String(stateRaw)) as PkceState;
    const realmKey = normalizeRealmKey(pkce.realmKey, plane);
    const runtime = resolveKeycloakRuntime(plane, realmKey, process.env);
    const sessionNamespace = runtime.sessionNamespace;
    const tokens = await exchangeCodeForTokens({
      baseUrl: process.env.KEYCLOAK_BASE_URL ?? "https://iam.athyper.local",
      realm: runtime.realm,
      clientId: runtime.clientId,
      clientSecret: resolveKeycloakClientSecret(plane, realmKey, runtime.clientId, process.env),
      code,
      codeVerifier: pkce.codeVerifier,
      redirectUri: pkce.redirectUri,
    });
    const claims = decodeJwtPayload(tokens.access_token);

    // Admin native logins may receive an id_token without amr even after the
    // admin-web Keycloak flow challenged for OTP. Do not use a missing amr claim
    // to send the browser back to prompt=login; that creates a password/OTP loop.
    const idClaims = plane === "admin" && realmKey === "athyper" && tokens.id_token
      ? decodeJwtPayload(tokens.id_token)
      : null;
    const keycloakMfaSatisfied = keycloakAdminMfaSatisfied(plane, realmKey, pkce, idClaims);

    if (!hasAccessRole(claims.resource_access, claims.groups, runtime.clientId)) {
      await recordAuthAudit({
        eventType: "login_access_denied",
        outcome: "blocked",
        planeKey: plane,
        realmKey,
        sessionNamespace,
        requestId,
        userId: optionalStringClaim(claims.sub),
        username: optionalStringClaim(claims.preferred_username),
        reasonCode: "NO_PLATFORM_ACCESS",
      });
      return redirectToLoginError(plane, request, "NO_PLATFORM_ACCESS", requestId);
    }

    const sub = stringClaim(claims.sub, "unknown");
    const preferredUsername = stringClaim(claims.preferred_username, sub);
    const email = optionalStringClaim(claims.email);
    const displayName = stringClaim(claims.name, preferredUsername);
    const workbenches = resolveWorkbenchRoles(plane, realmKey, claims, runtime.clientId);
    let organizations = await resolveSessionOrganizations({
      plane,
      realmKey,
      accessToken: tokens.access_token,
      workbenches,
      requestId,
    });
    if (pkce.expectedContext && !isExpectedContextAllowed(plane, pkce.expectedContext, organizations)) {
      await recordAuthAudit({
        eventType: "login_context_boundary_denied",
        outcome: "blocked",
        planeKey: plane,
        realmKey,
        sessionNamespace,
        requestId,
        userId: sub,
        username: preferredUsername,
        reasonCode: "CONTEXT_NOT_ALLOWED",
        detail: {
          expectedContext: pkce.expectedContext,
          availableOrganizations: Object.keys(organizations),
          availableOrganizationDetails: summarizeOrganizationsForAudit(organizations),
        },
      });
      return redirectToLoginError(plane, request, "CONTEXT_NOT_ALLOWED", requestId);
    }
    if (pkce.expectedContext) {
      organizations = filterOrganizationsByExpectedContext(plane, pkce.expectedContext, organizations);
      if (Object.keys(organizations).length === 0) {
        await recordAuthAudit({
          eventType: "login_context_boundary_denied",
          outcome: "blocked",
          planeKey: plane,
          realmKey,
          sessionNamespace,
          requestId,
          userId: sub,
          username: preferredUsername,
          reasonCode: "CONTEXT_NOT_ALLOWED",
          detail: {
            expectedContext: pkce.expectedContext,
            availableOrganizations: Object.keys(organizations),
            availableOrganizationDetails: summarizeOrganizationsForAudit(organizations),
          },
        });
        return redirectToLoginError(plane, request, "CONTEXT_NOT_ALLOWED", requestId);
      }
    }

    const now = Math.floor(Date.now() / 1000);
    const sid = generateSid();
    const csrfToken = randomUUID();
    const realmPolicy = assertRealmAllowed(plane, realmKey);
    const appMfaEnforced = process.env.APP_MFA_ENFORCED === "true";
    // Admin plane always requires MFA regardless of APP_MFA_ENFORCED; other
    // planes respect the global flag (tenant-configurable in the future).
    const mfaRequired = realmPolicy.mandatoryMfa && (appMfaEnforced || plane === "admin") && !keycloakMfaSatisfied;
    const session: V4Session = {
      version: 2,
      sid,
      planeKey: plane,
      realmKey,
      sessionNamespace,
      userId: sub,
      username: preferredUsername,
      displayName,
      email,
      organizations,
      activeOrg: null,
      activeWorkbench: null,
      scope: tokens.scope ?? AUTHORIZATION_SCOPE,
      tokenType: tokens.token_type ?? "Bearer",
      keycloakSessionId: tokens.session_state,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      accessExpiresAt: now + tokens.expires_in,
      refreshExpiresAt: tokens.refresh_expires_in ? now + tokens.refresh_expires_in : undefined,
      idToken: tokens.id_token,
      ipHash: hashValue(clientIp(request)),
      uaHash: hashValue(request.headers.get("user-agent") ?? "unknown"),
      csrfToken,
      createdAt: now,
      lastSeenAt: now,
      mfaRequired,
      mfaVerified: !mfaRequired,
      mfaVerifiedAt: keycloakMfaSatisfied ? now : undefined,
    };

    const sessionPolicy = await resolveAuthSessionPolicy(plane, session);
    await redis.set(sessKey(sessionNamespace, sid), JSON.stringify(session), { EX: sessionPolicy.absoluteTtlSeconds });
    await redis.sAdd(userSessionsKey(sessionNamespace, sub), sid);
    await redis.expire(userSessionsKey(sessionNamespace, sub), sessionPolicy.absoluteTtlSeconds);

    // Reverse index for KC back-channel logout: maps KC session → app sessions
    // so a single KC logout token can wipe all plane sessions for that user.
    if (session.keycloakSessionId) {
      const reverseKey = kcSessionReverseKey(session.keycloakSessionId);
      await redis.sAdd(reverseKey, `${sessionNamespace}:${sid}`);
      await redis.expire(reverseKey, sessionPolicy.absoluteTtlSeconds);
    }

    const destination = mfaRequired
      ? new URL(`/mfa/challenge?returnUrl=${encodeURIComponent(pkce.returnUrl)}`, publicBaseUrl)
      : new URL(pkce.returnUrl, publicBaseUrl);
    const response = NextResponse.redirect(destination);
    setPlaneCookies(response, plane, sid, csrfToken, realmKey, sessionPolicy.absoluteTtlSeconds);
    if (mfaRequired) setMfaPendingCookie(response, plane, sessionPolicy.mfaPendingTtlSeconds);
    response.cookies.set("sso_skip", "", { path: config.loginPath, maxAge: 0 });
    await recordAuthAudit({
      eventType: "login_succeeded",
      outcome: "success",
      planeKey: plane,
      realmKey,
      sessionNamespace,
      requestId,
      userId: sub,
      username: preferredUsername,
      sidHash: hashValue(sid),
      detail: {
        organizationCount: Object.keys(organizations).length,
        mfaRequired,
        destination: destination.pathname,
      },
    });
    return response;
  } catch (err) {
    const code = err instanceof AuthFlowError ? err.code : "AUTH_CALLBACK_ERROR";
    console.error(`[auth-bff/${plane}/callback/${requestId}]`, err);
    await recordAuthAudit({
      eventType: "login_callback_failed",
      outcome: "failure",
      planeKey: plane,
      requestId,
      reasonCode: code,
      detail: { reason: err instanceof Error ? err.message : "Unknown callback error" },
    });
    return NextResponse.redirect(loginErrorUrl(config.loginPath, publicBaseUrl, code, requestId));
  }
}

export async function handleSessionGet(plane: PlaneKey, request: NextRequest): Promise<NextResponse> {
  const requestId = requestIdFrom(request);
  // allowMfaPending=true is required here: the MFA challenge page itself calls
  // GET /api/auth/session to render the current user's identity. If we returned
  // MFA_REQUIRED (403) from this endpoint, the challenge page would redirect back
  // to login, creating an infinite redirect loop.
  const validation = await validatePlaneServerSession(plane, {
    cookies: request.cookies,
    headers: request.headers,
    allowMfaPending: true,
  });

  if (!validation.ok) {
    const response = jsonAuthError(validation.reason, requestId, validation.status, { authenticated: false });
    if (validation.status === 401) {
      clearPlaneCookies(response, plane);
    }
    return response;
  }

  const response = NextResponse.json(validation.publicSession);
  const config = getPlaneConfig(plane);
  const cookieSid = request.cookies.get(effectiveCookieName(config.cookieName))?.value;
  if (cookieSid && cookieSid !== validation.sid) {
    setPlaneCookies(
      response,
      plane,
      validation.sid,
      validation.session.csrfToken,
      validation.session.realmKey,
      validation.sessionPolicy.absoluteTtlSeconds,
    );
  }
  return response;
}

export async function handleSessionPatch(plane: PlaneKey, request: NextRequest): Promise<NextResponse> {
  const requestId = requestIdFrom(request);
  const loaded = await loadSession(plane, request);
  if (!loaded.ok) return loaded.response;
  const csrfError = await requireCsrf(plane, request, loaded.session, loaded.sid, requestId);
  if (csrfError) return csrfError;
  const inactiveError = await rejectInactiveSession(plane, request, loaded, requestId, "context_activation_denied");
  if (inactiveError) return inactiveError;
  if (loaded.session.mfaRequired && !loaded.session.mfaVerified) {
    await recordAuthAudit({
      eventType: "context_activation_denied",
      outcome: "blocked",
      planeKey: plane,
      realmKey: loaded.session.realmKey,
      sessionNamespace: loaded.session.sessionNamespace,
      requestId,
      userId: loaded.session.userId,
      username: loaded.session.username,
      sidHash: hashValue(loaded.sid),
      reasonCode: "MFA_REQUIRED",
    });
    return jsonAuthError("MFA_REQUIRED", requestId, 403);
  }

  const body = await request.json().catch(() => ({})) as { org?: string; workbench?: string };
  if (!body.org || !body.workbench) {
    await recordAuthAudit({
      eventType: "context_activation_failed",
      outcome: "failure",
      planeKey: plane,
      realmKey: loaded.session.realmKey,
      sessionNamespace: loaded.session.sessionNamespace,
      requestId,
      userId: loaded.session.userId,
      username: loaded.session.username,
      sidHash: hashValue(loaded.sid),
      reasonCode: "MISSING_CONTEXT",
    });
    return jsonAuthError("MISSING_CONTEXT", requestId, 400);
  }
  const org = loaded.session.organizations[body.org];
  if (!org) {
    await recordAuthAudit({
      eventType: "context_activation_denied",
      outcome: "blocked",
      planeKey: plane,
      realmKey: loaded.session.realmKey,
      sessionNamespace: loaded.session.sessionNamespace,
      requestId,
      userId: loaded.session.userId,
      username: loaded.session.username,
      sidHash: hashValue(loaded.sid),
      reasonCode: "CONTEXT_NOT_ALLOWED",
      detail: { requestedOrg: body.org },
    });
    return jsonAuthError("CONTEXT_NOT_ALLOWED", requestId, 403);
  }
  if (!org.roles.includes(body.workbench)) {
    await recordAuthAudit({
      eventType: "context_activation_denied",
      outcome: "blocked",
      planeKey: plane,
      realmKey: loaded.session.realmKey,
      sessionNamespace: loaded.session.sessionNamespace,
      requestId,
      userId: loaded.session.userId,
      username: loaded.session.username,
      sidHash: hashValue(loaded.sid),
      reasonCode: "CONTEXT_NOT_ALLOWED",
      detail: { requestedOrg: body.org, requestedWorkbench: body.workbench, allowedWorkbenches: org.roles },
    });
    return jsonAuthError("CONTEXT_NOT_ALLOWED", requestId, 403);
  }

  const updated = {
    ...loaded.session,
    activeOrg: body.org,
    activeWorkbench: body.workbench,
    lastSeenAt: Math.floor(Date.now() / 1000),
  } satisfies V4Session;
  await saveSessionPreservingTtl(loaded.redis, updated, loaded.sid);
  await recordAuthAudit({
    eventType: "context_activated",
    outcome: "success",
    planeKey: plane,
    realmKey: loaded.session.realmKey,
    sessionNamespace: loaded.session.sessionNamespace,
    requestId,
    userId: loaded.session.userId,
    username: loaded.session.username,
    sidHash: hashValue(loaded.sid),
    activeOrg: body.org,
    activeWorkbench: body.workbench,
  });
  const response = NextResponse.json({ ok: true, requestId });
  await syncRotatedPlaneCookies(response, plane, { ...loaded, session: updated });
  return response;
}

export async function handleSessionDelete(plane: PlaneKey, request: NextRequest): Promise<NextResponse> {
  const requestId = requestIdFrom(request);
  const loaded = await loadSession(plane, request, { allowMissing: true });
  if (loaded.ok) {
    const csrfError = await requireCsrf(plane, request, loaded.session, loaded.sid, requestId);
    if (csrfError) return csrfError;
    await destroySession(loaded.redis, loaded.session.sessionNamespace, loaded.sid, loaded.session);
    if (loaded.cookieSid !== loaded.sid) {
      await loaded.redis.del(sidRotationKey(loaded.session.sessionNamespace, loaded.cookieSid)).catch(() => {});
    }
  }
  const response = NextResponse.json({ ok: true });
  clearPlaneCookies(response, plane);
  return response;
}

export async function handleRefresh(plane: PlaneKey, request: NextRequest): Promise<NextResponse> {
  const requestId = requestIdFrom(request);
  const loaded = await loadSession(plane, request);
  if (!loaded.ok) return loaded.response;
  const csrfError = await requireCsrf(plane, request, loaded.session, loaded.sid, requestId);
  if (csrfError) return csrfError;
  const { redis, session, sid } = loaded;
  const sessionPolicy = await resolveAuthSessionPolicy(plane, session);
  const now = Math.floor(Date.now() / 1000);
  if (now - session.lastSeenAt >= sessionPolicy.idleTimeoutSeconds) {
    await destroySession(redis, session.sessionNamespace, sid, session);
    await recordAuthAudit({
      eventType: "session_idle_expired",
      outcome: "failure",
      planeKey: plane,
      realmKey: session.realmKey,
      sessionNamespace: session.sessionNamespace,
      requestId,
      userId: session.userId,
      username: session.username,
      sidHash: hashValue(sid),
      activeOrg: session.activeOrg,
      activeWorkbench: session.activeWorkbench,
      reasonCode: "SESSION_IDLE_EXPIRED",
    });
    const response = jsonAuthError("SESSION_IDLE_EXPIRED", requestId, 401, {
      redirect: "/api/auth/login",
    });
    clearPlaneCookies(response, plane);
    return response;
  }
  if (session.accessExpiresAt - now > sessionPolicy.serverRefreshBufferSeconds) {
    const response = NextResponse.json({ ok: true, accessExpiresAt: session.accessExpiresAt, sessionPolicy });
    await syncRotatedPlaneCookies(response, plane, loaded, sessionPolicy);
    return response;
  }
  if (!session.refreshToken || (session.refreshExpiresAt && session.refreshExpiresAt < now)) {
    await destroySession(redis, session.sessionNamespace, sid, session);
    await recordAuthAudit({
      eventType: "session_refresh_expired",
      outcome: "failure",
      planeKey: plane,
      realmKey: session.realmKey,
      sessionNamespace: session.sessionNamespace,
      requestId,
      userId: session.userId,
      username: session.username,
      sidHash: hashValue(sid),
      activeOrg: session.activeOrg,
      activeWorkbench: session.activeWorkbench,
      reasonCode: "SESSION_REFRESH_EXPIRED",
    });
    const response = jsonAuthError("SESSION_REFRESH_EXPIRED", requestId, 401, { redirect: "/api/auth/login" });
    clearPlaneCookies(response, plane);
    return response;
  }

  const lockKey = refreshLockKey(session.sessionNamespace, sid);
  const acquired = await redis.set(lockKey, "1", { NX: true, EX: sessionPolicy.refreshLockTtlSeconds });
  if (!acquired) {
    await new Promise((resolve) => setTimeout(resolve, sessionPolicy.refreshLockWaitMs));
    const refreshed = await readSessionAfterRefreshWait(redis, session.sessionNamespace, sid, now);
    if (refreshed) {
      const response = NextResponse.json({
        ok: true,
        accessExpiresAt: refreshed.accessExpiresAt,
        csrfToken: refreshed.csrfToken,
        sessionPolicy,
      });
      if (loaded.cookieSid !== refreshed.sid) {
        const ttl = await redis.ttl(sessKey(refreshed.sessionNamespace, refreshed.sid)).catch(() => sessionPolicy.absoluteTtlSeconds);
        setPlaneCookies(
          response,
          plane,
          refreshed.sid,
          refreshed.csrfToken,
          refreshed.realmKey,
          ttl > 0 ? ttl : sessionPolicy.absoluteTtlSeconds,
        );
      }
      return response;
    }
    return NextResponse.json({
      ok: false,
      message: "Refresh in progress",
      accessExpiresAt: session.accessExpiresAt,
      retryAfter: Math.max(1, Math.ceil(sessionPolicy.refreshLockWaitMs / 1000)),
      sessionPolicy,
    }, { status: 202 });
  }

  try {
    const runtime = resolveKeycloakRuntime(plane, session.realmKey, process.env);
    const tokens = await refreshTokens({
      baseUrl: process.env.KEYCLOAK_BASE_URL ?? "https://iam.athyper.local",
      realm: runtime.realm,
      clientId: runtime.clientId,
      clientSecret: resolveKeycloakClientSecret(plane, session.realmKey, runtime.clientId, process.env),
      refreshToken: session.refreshToken,
    });
    const newSid = generateSid();
    const newCsrfToken = randomUUID();
    const updated: V4Session = {
      ...session,
      sid: newSid,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? session.refreshToken,
      accessExpiresAt: now + (tokens.expires_in ?? 3600),
      refreshExpiresAt: tokens.refresh_expires_in ? now + tokens.refresh_expires_in : session.refreshExpiresAt,
      idToken: tokens.id_token ?? session.idToken,
      csrfToken: newCsrfToken,
      previousCsrfToken: session.csrfToken,
      csrfRotatedAt: now,
      lastSeenAt: now,
    };
    const ttl = await redis.ttl(sessKey(session.sessionNamespace, sid));
    const sessionTtl = ttl > 0 ? ttl : sessionPolicy.absoluteTtlSeconds;
    await redis.set(sessKey(session.sessionNamespace, newSid), JSON.stringify(updated), { EX: sessionTtl });
    // SID rotation grace: keep a pointer from the old SID to the new one for
    // the configured grace window. In-flight requests that already read the
    // old cookie but haven't reached the server yet will follow the rotation
    // pointer and find the valid session, preventing spurious 401s during refresh.
    await redis.set(sidRotationKey(session.sessionNamespace, sid), newSid, { EX: sessionPolicy.refreshRotationGraceSeconds });
    await redis.del(sessKey(session.sessionNamespace, sid));
    await redis.sRem(userSessionsKey(session.sessionNamespace, session.userId), sid);
    await redis.sAdd(userSessionsKey(session.sessionNamespace, session.userId), newSid);
    await redis.expire(userSessionsKey(session.sessionNamespace, session.userId), sessionTtl);

    const response = NextResponse.json({
      ok: true,
      accessExpiresAt: updated.accessExpiresAt,
      csrfToken: newCsrfToken,
      sessionPolicy,
    });
    setPlaneCookies(response, plane, newSid, newCsrfToken, session.realmKey, sessionTtl);
    await recordAuthAudit({
      eventType: "session_refreshed",
      outcome: "success",
      planeKey: plane,
      realmKey: session.realmKey,
      sessionNamespace: session.sessionNamespace,
      requestId,
      userId: session.userId,
      username: session.username,
      sidHash: hashValue(newSid),
      activeOrg: session.activeOrg,
      activeWorkbench: session.activeWorkbench,
    });
    return response;
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Refresh failed";
    if (isHardRefreshFailure(reason)) {
      await destroySession(redis, session.sessionNamespace, sid, session);
      await recordAuthAudit({
        eventType: "session_refresh_failed",
        outcome: "failure",
        planeKey: plane,
        realmKey: session.realmKey,
        sessionNamespace: session.sessionNamespace,
        requestId,
        userId: session.userId,
        username: session.username,
        sidHash: hashValue(sid),
        activeOrg: session.activeOrg,
        activeWorkbench: session.activeWorkbench,
        reasonCode: "SESSION_REFRESH_EXPIRED",
        detail: { reason },
      });
      const response = jsonAuthError("SESSION_REFRESH_EXPIRED", requestId, 401, { redirect: "/api/auth/login" });
      clearPlaneCookies(response, plane);
      return response;
    }
    await recordAuthAudit({
      eventType: "session_refresh_failed",
      outcome: "failure",
      planeKey: plane,
      realmKey: session.realmKey,
      sessionNamespace: session.sessionNamespace,
      requestId,
      userId: session.userId,
      username: session.username,
      sidHash: hashValue(sid),
      activeOrg: session.activeOrg,
      activeWorkbench: session.activeWorkbench,
      reasonCode: "SESSION_REFRESH_FAILED",
      detail: { reason },
    });
    return jsonAuthError("SESSION_REFRESH_FAILED", requestId, 503, { retryAfter: 30 });
  } finally {
    await redis.del(lockKey).catch(() => {});
  }
}

export async function handleTouch(plane: PlaneKey, request: NextRequest): Promise<NextResponse> {
  const requestId = requestIdFrom(request);
  const loaded = await loadSession(plane, request);
  if (!loaded.ok) return loaded.response;
  const csrfError = await requireCsrf(plane, request, loaded.session, loaded.sid, requestId);
  if (csrfError) return csrfError;
  const sessionPolicy = await resolveAuthSessionPolicy(plane, loaded.session);
  const now = Math.floor(Date.now() / 1000);
  if (now - loaded.session.lastSeenAt >= sessionPolicy.idleTimeoutSeconds && request.headers.get("x-session-continue") !== "1") {
    await destroySession(loaded.redis, loaded.session.sessionNamespace, loaded.sid, loaded.session);
    await recordAuthAudit({
      eventType: "session_idle_expired",
      outcome: "failure",
      planeKey: plane,
      realmKey: loaded.session.realmKey,
      sessionNamespace: loaded.session.sessionNamespace,
      requestId,
      userId: loaded.session.userId,
      username: loaded.session.username,
      sidHash: hashValue(loaded.sid),
      activeOrg: loaded.session.activeOrg,
      activeWorkbench: loaded.session.activeWorkbench,
      reasonCode: "SESSION_IDLE_EXPIRED",
    });
    const response = jsonAuthError("SESSION_IDLE_EXPIRED", requestId, 401);
    clearPlaneCookies(response, plane);
    return response;
  }
  const updated = { ...loaded.session, lastSeenAt: now };
  await saveSessionPreservingTtl(loaded.redis, updated, loaded.sid);
  const response = NextResponse.json({ ok: true });
  await syncRotatedPlaneCookies(response, plane, { ...loaded, session: updated });
  return response;
}

export async function handleLogout(plane: PlaneKey, request: NextRequest): Promise<NextResponse> {
  const requestId = requestIdFrom(request);
  const config = getPlaneConfig(plane);
  const publicBaseUrl = resolvePublicBaseUrl(plane, request);
  const sid = request.cookies.get(effectiveCookieName(config.cookieName))?.value ?? null;
  let logoutUrl = `${publicBaseUrl}${config.loginPath}`;
  let loggedOutSession: V4Session | null = null;

  if (sid) {
    const realmKey = normalizeRealmKey(request.cookies.get(effectiveCookieName(config.realmCookieName))?.value, plane);
    const namespace = getSessionNamespace(plane, realmKey);
    const redis = await getSessionRedis().catch(() => null);
    if (redis) {
      let effectiveSid = sid;
      let raw = await redis.get(sessKey(namespace, effectiveSid)).catch(() => null);
      if (!raw) {
        const rotatedSid = await redis.get(sidRotationKey(namespace, sid)).catch(() => null);
        if (rotatedSid) {
          effectiveSid = String(rotatedSid);
          raw = await redis.get(sessKey(namespace, effectiveSid)).catch(() => null);
        }
      }
      // Guard against corrupted session data in Redis; a bad parse must not
      // abort logout — the session should be destroyed and cookies cleared.
      const session = raw ? parseSessionJson(raw) : null;
      if (session) {
        if (request.method !== "GET") {
          const csrfError = await requireCsrf(plane, request, session, effectiveSid, requestId);
          if (csrfError) return csrfError;
        }
        const runtime = resolveKeycloakRuntime(plane, session.realmKey, process.env);
        if (session.refreshToken) {
          await revokeToken({
            baseUrl: process.env.KEYCLOAK_BASE_URL ?? "https://iam.athyper.local",
            realm: runtime.realm,
            clientId: runtime.clientId,
            clientSecret: resolveKeycloakClientSecret(plane, session.realmKey, runtime.clientId, process.env),
            token: session.refreshToken,
            tokenTypeHint: "refresh_token",
          }).catch(async (err) => {
            const reason = err instanceof Error ? err.message : "Token revocation failed";
            console.warn(`[auth-bff/${plane}/logout/${requestId}] refresh token revoke failed`, err);
            await recordAuthAudit({
              eventType: "logout_revoke_failed",
              outcome: "partial",
              planeKey: plane,
              realmKey: session.realmKey,
              sessionNamespace: session.sessionNamespace,
              requestId,
              userId: session.userId,
              username: session.username,
              sidHash: hashValue(effectiveSid),
              activeOrg: session.activeOrg,
              activeWorkbench: session.activeWorkbench,
              reasonCode: "LOGOUT_REVOKE_FAILED",
              detail: { reason },
            });
          });
        }
        logoutUrl = buildFrontChannelLogoutUrl({
          baseUrl: process.env.KEYCLOAK_BASE_URL ?? "https://iam.athyper.local",
          realm: runtime.realm,
          clientId: runtime.clientId,
          idToken: session.idToken,
          postLogoutRedirectUri: `${publicBaseUrl}${config.loginPath}`,
        });
        await destroySession(redis, namespace, effectiveSid, session);
        if (effectiveSid !== sid) {
          await redis.del(sidRotationKey(namespace, sid)).catch(() => {});
        }
        loggedOutSession = session;
      } else if (raw) {
        await destroySession(redis, namespace, effectiveSid);
        if (effectiveSid !== sid) {
          await redis.del(sidRotationKey(namespace, sid)).catch(() => {});
        }
      } else if (effectiveSid !== sid) {
        await redis.del(sidRotationKey(namespace, sid)).catch(() => {});
      }
    }
  }

  const wantsJson = request.method === "POST" || request.headers.get("accept")?.includes("application/json");
  const response = wantsJson ? NextResponse.json({ ok: true, logoutUrl }) : NextResponse.redirect(logoutUrl);
  clearPlaneCookies(response, plane);
  await recordAuthAudit({
    eventType: "logout_completed",
    outcome: "success",
    planeKey: plane,
    realmKey: loggedOutSession?.realmKey,
    sessionNamespace: loggedOutSession?.sessionNamespace,
    requestId,
    userId: loggedOutSession?.userId,
    username: loggedOutSession?.username,
    sidHash: sid ? hashValue(sid) : undefined,
    activeOrg: loggedOutSession?.activeOrg,
    activeWorkbench: loggedOutSession?.activeWorkbench,
    detail: { hadSession: Boolean(loggedOutSession) },
  });
  return response;
}

export async function handleMfaVerify(plane: PlaneKey, request: NextRequest): Promise<NextResponse> {
  const requestId = requestIdFrom(request);
  const loaded = await loadSession(plane, request);
  if (!loaded.ok) return loaded.response;
  const csrfError = await requireCsrf(plane, request, loaded.session, loaded.sid, requestId);
  if (csrfError) return csrfError;
  const inactiveError = await rejectInactiveSession(plane, request, loaded, requestId, "mfa_verify_denied");
  if (inactiveError) return inactiveError;
  const body = await request.json().catch(() => ({})) as { code?: string };
  if (!loaded.session.mfaRequired) {
    const response = NextResponse.json({ ok: true });
    clearMfaPendingCookie(response, plane);
    return response;
  }
  const code = body.code?.trim();
  if (!code || !/^\d{6}$/.test(code)) {
    await recordAuthAudit({
      eventType: "mfa_verify_failed",
      outcome: "failure",
      planeKey: plane,
      realmKey: loaded.session.realmKey,
      sessionNamespace: loaded.session.sessionNamespace,
      requestId,
      userId: loaded.session.userId,
      username: loaded.session.username,
      sidHash: hashValue(loaded.sid),
      reasonCode: "INVALID_CODE",
    });
    return jsonAuthError("INVALID_CODE", requestId, 400);
  }
  const orgAlias = loaded.session.activeOrg ?? Object.keys(loaded.session.organizations)[0] ?? "";
  const runtimeUrl = process.env.RUNTIME_API_URL;
  if (!runtimeUrl || !orgAlias) {
    await recordAuthAudit({
      eventType: "mfa_verify_failed",
      outcome: "failure",
      planeKey: plane,
      realmKey: loaded.session.realmKey,
      sessionNamespace: loaded.session.sessionNamespace,
      requestId,
      userId: loaded.session.userId,
      username: loaded.session.username,
      sidHash: hashValue(loaded.sid),
      reasonCode: "MFA_VERIFIER_UNAVAILABLE",
      detail: { hasRuntimeUrl: Boolean(runtimeUrl), hasOrg: Boolean(orgAlias) },
    });
    return jsonAuthError("MFA_VERIFIER_UNAVAILABLE", requestId, 503);
  }
  const upstream = await fetch(`${runtimeUrl}/api/iam/mfa/elevate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${loaded.session.accessToken}`,
      "X-Org": orgAlias,
      "X-Realm": loaded.session.realmKey,
    },
    body: JSON.stringify({ action_class: "security_change", code, method_type: "totp" }),
  });
  if (!upstream.ok) {
    const err = await upstream.json().catch(() => ({})) as { message?: string };
    await recordAuthAudit({
      eventType: "mfa_verify_failed",
      outcome: "failure",
      planeKey: plane,
      realmKey: loaded.session.realmKey,
      sessionNamespace: loaded.session.sessionNamespace,
      requestId,
      userId: loaded.session.userId,
      username: loaded.session.username,
      sidHash: hashValue(loaded.sid),
      reasonCode: "INVALID_CODE",
      detail: { upstreamStatus: upstream.status, upstreamMessage: err.message ?? null },
    });
    return jsonAuthError("INVALID_CODE", requestId, 422);
  }
  const updated = {
    ...loaded.session,
    mfaRequired: false,
    mfaVerified: true,
    mfaVerifiedAt: Math.floor(Date.now() / 1000),
  } satisfies V4Session;
  await saveSessionPreservingTtl(loaded.redis, updated, loaded.sid);
  const response = NextResponse.json({ ok: true });
  await syncRotatedPlaneCookies(response, plane, { ...loaded, session: updated });
  clearMfaPendingCookie(response, plane);
  await recordAuthAudit({
    eventType: "mfa_verified",
    outcome: "success",
    planeKey: plane,
    realmKey: loaded.session.realmKey,
    sessionNamespace: loaded.session.sessionNamespace,
    requestId,
    userId: loaded.session.userId,
    username: loaded.session.username,
    sidHash: hashValue(loaded.sid),
  });
  return response;
}

type LoadedSession = {
  ok: true;
  redis: RedisClient;
  cookieSid: string;
  sid: string;
  session: V4Session;
  response: NextResponse;
};
type LoadSessionResult = LoadedSession | { ok: false; response: NextResponse };

async function loadSession(
  plane: PlaneKey,
  request: NextRequest,
  options: { allowMissing?: boolean } = {},
): Promise<LoadSessionResult> {
  const requestId = requestIdFrom(request);
  const config = getPlaneConfig(plane);
  const sid = request.cookies.get(effectiveCookieName(config.cookieName))?.value;
  if (!sid) {
    return options.allowMissing
      ? { ok: false, response: NextResponse.json({ authenticated: false }, { status: 200 }) }
      : { ok: false, response: jsonAuthError("SESSION_NOT_FOUND", requestId, 401, { authenticated: false }) };
  }
  const realmKey = normalizeRealmKey(request.cookies.get(effectiveCookieName(config.realmCookieName))?.value, plane);
  const namespace = getSessionNamespace(plane, realmKey);
  const redis = await getSessionRedis().catch(() => null);
  if (!redis) {
    await recordAuthAudit({
      eventType: "session_load_failed",
      outcome: "failure",
      planeKey: plane,
      realmKey,
      sessionNamespace: namespace,
      requestId,
      sidHash: hashValue(sid),
      reasonCode: "SESSION_STORE_UNAVAILABLE",
    });
    return { ok: false, response: jsonAuthError("SESSION_STORE_UNAVAILABLE", requestId, 503) };
  }
  let raw = await redis.get(sessKey(namespace, sid));
  let effectiveSid = sid;
  if (!raw) {
    const rotatedSid = await redis.get(sidRotationKey(namespace, sid)).catch(() => null);
    if (rotatedSid) {
      effectiveSid = String(rotatedSid);
      raw = await redis.get(sessKey(namespace, effectiveSid));
    }
  }
  if (!raw) {
    await recordAuthAudit({
      eventType: "session_not_found",
      outcome: "failure",
      planeKey: plane,
      realmKey,
      sessionNamespace: namespace,
      requestId,
      sidHash: hashValue(sid),
      reasonCode: "SESSION_NOT_FOUND",
    });
    const response = jsonAuthError("SESSION_NOT_FOUND", requestId, 401, { authenticated: false });
    clearPlaneCookies(response, plane);
    return { ok: false, response };
  }
  const session = parseSessionJson(raw);
  if (!session) {
    await destroySession(redis, namespace, effectiveSid);
    if (effectiveSid !== sid) {
      await redis.del(sidRotationKey(namespace, sid)).catch(() => {});
    }
    await recordAuthAudit({
      eventType: "session_parse_failed",
      outcome: "failure",
      planeKey: plane,
      realmKey,
      sessionNamespace: namespace,
      requestId,
      sidHash: hashValue(effectiveSid),
      reasonCode: "SESSION_NOT_FOUND",
    });
    const response = jsonAuthError("SESSION_NOT_FOUND", requestId, 401, { authenticated: false });
    clearPlaneCookies(response, plane);
    return { ok: false, response };
  }
  return {
    ok: true,
    redis,
    cookieSid: sid,
    sid: effectiveSid,
    session,
    response: NextResponse.next(),
  };
}

async function rejectInactiveSession(
  plane: PlaneKey,
  request: NextRequest,
  loaded: LoadedSession,
  requestId: string,
  bindingEventType: string,
): Promise<NextResponse | null> {
  if (isBindingMismatch(loaded.session, request)) {
    await destroySession(loaded.redis, loaded.session.sessionNamespace, loaded.sid, loaded.session);
    await recordAuthAudit({
      eventType: bindingEventType,
      outcome: "blocked",
      planeKey: plane,
      realmKey: loaded.session.realmKey,
      sessionNamespace: loaded.session.sessionNamespace,
      requestId,
      userId: loaded.session.userId,
      username: loaded.session.username,
      sidHash: hashValue(loaded.sid),
      activeOrg: loaded.session.activeOrg,
      activeWorkbench: loaded.session.activeWorkbench,
      reasonCode: "SESSION_BINDING_MISMATCH",
    });
    const response = jsonAuthError("SESSION_BINDING_MISMATCH", requestId, 401);
    clearPlaneCookies(response, plane);
    return response;
  }

  const now = Math.floor(Date.now() / 1000);
  const sessionPolicy = await resolveAuthSessionPolicy(plane, loaded.session);
  if (now - loaded.session.lastSeenAt < sessionPolicy.idleTimeoutSeconds) return null;

  await destroySession(loaded.redis, loaded.session.sessionNamespace, loaded.sid, loaded.session);
  await recordAuthAudit({
    eventType: "session_idle_expired",
    outcome: "failure",
    planeKey: plane,
    realmKey: loaded.session.realmKey,
    sessionNamespace: loaded.session.sessionNamespace,
    requestId,
    userId: loaded.session.userId,
    username: loaded.session.username,
    sidHash: hashValue(loaded.sid),
    activeOrg: loaded.session.activeOrg,
    activeWorkbench: loaded.session.activeWorkbench,
    reasonCode: "SESSION_IDLE_EXPIRED",
  });
  const response = jsonAuthError("SESSION_IDLE_EXPIRED", requestId, 401, { redirect: "/api/auth/login" });
  clearPlaneCookies(response, plane);
  return response;
}

async function requireCsrf(
  plane: PlaneKey,
  request: NextRequest,
  session: V4Session,
  sid: string,
  requestId: string,
): Promise<NextResponse | null> {
  const config = getPlaneConfig(plane);
  const sessionPolicy = await resolveAuthSessionPolicy(plane, session);
  const headerToken = request.headers.get("x-csrf-token") ?? request.headers.get("x-xsrf-token");
  const cookieToken = request.cookies.get(effectiveCookieName(config.csrfCookieName))?.value;
  const headerMatchesCookie =
    headerToken != null &&
    cookieToken != null &&
    timingSafeStringEqual(headerToken, cookieToken);
  const currentTokenValid =
    cookieToken != null &&
    timingSafeStringEqual(cookieToken, session.csrfToken);
  const previousTokenValid =
    cookieToken != null &&
    session.previousCsrfToken != null &&
    session.csrfRotatedAt != null &&
    Math.floor(Date.now() / 1000) - session.csrfRotatedAt <= sessionPolicy.refreshRotationGraceSeconds &&
    timingSafeStringEqual(cookieToken, session.previousCsrfToken);
  const valid = headerMatchesCookie && (currentTokenValid || previousTokenValid);

  if (valid) return null;

  await recordAuthAudit({
    eventType: "csrf_validation_failed",
    outcome: "blocked",
    planeKey: plane,
    realmKey: session.realmKey,
    sessionNamespace: session.sessionNamespace,
    requestId,
    userId: session.userId,
    username: session.username,
    sidHash: hashValue(sid),
    activeOrg: session.activeOrg,
    activeWorkbench: session.activeWorkbench,
    reasonCode: "CSRF_VALIDATION_FAILED",
    detail: {
      hasHeaderToken: Boolean(headerToken),
      hasCookieToken: Boolean(cookieToken),
      hasPreviousToken: Boolean(session.previousCsrfToken),
    },
  });

  return jsonAuthError("CSRF_VALIDATION_FAILED", requestId, 403);
}

async function syncRotatedPlaneCookies(
  response: NextResponse,
  plane: PlaneKey,
  loaded: LoadedSession,
  sessionPolicy?: SessionPolicyDefaults,
): Promise<void> {
  if (loaded.cookieSid === loaded.sid) return;

  const policy = sessionPolicy ?? await resolveAuthSessionPolicy(plane, loaded.session);
  const fallbackMaxAge = policy.absoluteTtlSeconds;
  const ttl = await loaded.redis.ttl(sessKey(loaded.session.sessionNamespace, loaded.sid)).catch(() => fallbackMaxAge);
  setPlaneCookies(
    response,
    plane,
    loaded.sid,
    loaded.session.csrfToken,
    loaded.session.realmKey,
    ttl > 0 ? ttl : fallbackMaxAge,
  );
}

async function saveSessionPreservingTtl(redis: RedisClient, session: V4Session, sid: string): Promise<void> {
  const key = sessKey(session.sessionNamespace, sid);
  const ttl = await redis.ttl(key);
  await redis.set(key, JSON.stringify(session), { EX: ttl > 0 ? ttl : SESSION_TTL_SECONDS });
}

async function destroySession(
  redis: RedisClient,
  namespace: string,
  sid: string,
  session?: Pick<V4Session, "userId">,
): Promise<void> {
  await redis.del(sessKey(namespace, sid)).catch(() => {});
  await redis.del(sidRotationKey(namespace, sid)).catch(() => {});
  if (session?.userId) {
    await redis.sRem(userSessionsKey(namespace, session.userId), sid).catch(() => {});
  }
}

function requestIdFrom(request: NextRequest): string {
  const inbound =
    request.headers.get("x-request-id") ??
    request.headers.get("x-correlation-id") ??
    request.headers.get("traceparent");
  if (inbound && /^[A-Za-z0-9._:;=+/-]{1,128}$/.test(inbound)) return inbound;
  return randomUUID();
}

function requestIdFromHeaders(headers: HeaderReader | undefined): string {
  const inbound =
    headers?.get("x-request-id") ??
    headers?.get("x-correlation-id") ??
    headers?.get("traceparent");
  if (inbound && /^[A-Za-z0-9._:;=+/-]{1,128}$/.test(inbound)) return inbound;
  return randomUUID();
}

function readCookieValue(cookies: CookieReader, name: string): string | undefined {
  const cookie = cookies.get(name);
  if (!cookie) return undefined;
  if (typeof cookie === "string") return cookie;
  return typeof cookie.value === "string" && cookie.value ? cookie.value : undefined;
}

function toPublicSession(plane: PlaneKey, session: V4Session, sessionPolicy: SessionPolicyDefaults): PublicSession {
  return {
    authenticated: true,
    planeKey: plane,
    realmKey: session.realmKey,
    sessionNamespace: session.sessionNamespace,
    supportMode: isSupportSession(plane, session.realmKey),
    userId: session.userId,
    username: session.username,
    displayName: session.displayName,
    email: session.email,
    organizations: session.organizations,
    activeOrg: session.activeOrg,
    activeWorkbench: session.activeWorkbench,
    accessExpiresAt: session.accessExpiresAt,
    mfaRequired: session.mfaRequired,
    mfaVerified: session.mfaVerified,
    sessionPolicy,
  };
}

function jsonAuthError(
  code: AuthErrorCode,
  requestId: string,
  status: number,
  extra: Partial<AuthErrorBody> = {},
): NextResponse {
  const body: AuthErrorBody = {
    error: code,
    message: AUTH_ERROR_MESSAGES[code],
    requestId,
    ...extra,
  };
  return NextResponse.json(body, { status });
}

function loginErrorUrl(
  loginPath: string,
  publicBaseUrl: string,
  code: AuthErrorCode,
  requestId: string,
): URL {
  const url = new URL(loginPath, publicBaseUrl);
  url.searchParams.set("error", code);
  url.searchParams.set("ref", requestId);
  return url;
}

function redirectToLoginError(
  plane: PlaneKey,
  request: NextRequest,
  code: AuthErrorCode,
  requestId: string,
): NextResponse {
  const config = getPlaneConfig(plane);
  return NextResponse.redirect(loginErrorUrl(config.loginPath, resolvePublicBaseUrl(plane, request), code, requestId));
}

async function recordAuthAudit(event: AuthAuditEvent): Promise<void> {
  const payload = {
    event_time: new Date().toISOString(),
    service: "auth-bff",
    ...event,
  };
  console.info("[auth-audit]", JSON.stringify(payload));

  const endpoint = process.env.AUTH_AUDIT_ENDPOINT;
  if (!endpoint) return;
  try {
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(1_500),
    });
  } catch {
    // Audit export is best-effort here; local structured logs remain authoritative.
  }
}

function resolvePublicBaseUrl(plane: PlaneKey, request: NextRequest): string {
  const envName = `${plane.toUpperCase()}_PUBLIC_WEB_URL`;
  const configured = process.env[envName] ?? process.env.PUBLIC_WEB_URL ?? process.env.PUBLIC_BASE_URL;
  if (configured) return normalizePublicBaseUrl(configured);

  const config = getPlaneConfig(plane);
  const hostHeader = request.headers.get("host") ?? request.nextUrl.host;
  const normalizedHost = normalizeHost(hostHeader);
  const localRuntime = isLocalRuntime();
  if (
    normalizedHost &&
    (normalizedHost === config.publicHost ||
      (localRuntime && (normalizedHost === config.localHost || isLoopbackHost(normalizedHost))))
  ) {
    const proto = localRuntime
      ? safeForwardedProto(request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", ""))
      : "https";
    return `${proto}://${hostHeader.replace(/\/+$/, "")}`;
  }

  return `https://${config.publicHost}`;
}

function normalizePublicBaseUrl(value: string): string {
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

function normalizeHost(host: string | null | undefined): string | null {
  const value = host?.trim().toLowerCase();
  if (!value) return null;
  if (value.startsWith("[::1]")) return "::1";
  return value.replace(/:\d+$/, "");
}

function safeForwardedProto(value: string): "http" | "https" {
  return value === "http" ? "http" : "https";
}

function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function isLocalRuntime(): boolean {
  const environment = (process.env.ENVIRONMENT ?? process.env.NODE_ENV ?? "local").toLowerCase();
  return environment === "local" || environment === "development" || environment === "test";
}

function buildAuthorizationUrl(opts: {
  baseUrl: string;
  realm: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
  prompt?: string;
  idpHint?: string;
  loginHint?: string;
}): string {
  const url = new URL(`${opts.baseUrl}/realms/${opts.realm}/protocol/openid-connect/auth`);
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("response_type", "code");
  // Keycloak adds configured default client scopes automatically. Requesting
  // realm-specific scopes here breaks login for planes that do not define them.
  url.searchParams.set("scope", AUTHORIZATION_SCOPE);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("code_challenge", opts.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", opts.state);
  if (opts.prompt) url.searchParams.set("prompt", opts.prompt);
  if (opts.idpHint) url.searchParams.set("kc_idp_hint", opts.idpHint);
  if (opts.loginHint) url.searchParams.set("login_hint", opts.loginHint);
  return url.toString();
}

async function exchangeCodeForTokens(opts: {
  baseUrl: string;
  realm: string;
  clientId: string;
  clientSecret?: string | undefined;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: opts.clientId,
    code: opts.code,
    code_verifier: opts.codeVerifier,
    redirect_uri: opts.redirectUri,
  });
  if (opts.clientSecret) body.set("client_secret", opts.clientSecret);

  const res = await fetch(`${opts.baseUrl}/realms/${opts.realm}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AuthFlowError("AUTH_CALLBACK_ERROR", `Token exchange failed: ${res.status} ${body}`);
  }
  return res.json() as Promise<TokenResponse>;
}

async function refreshTokens(opts: {
  baseUrl: string;
  realm: string;
  clientId: string;
  clientSecret?: string | undefined;
  refreshToken: string;
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: opts.clientId,
    refresh_token: opts.refreshToken,
  });
  if (opts.clientSecret) body.set("client_secret", opts.clientSecret);

  const res = await fetch(`${opts.baseUrl}/realms/${opts.realm}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status} ${await res.text().catch(() => "")}`);
  return res.json() as Promise<TokenResponse>;
}

async function revokeToken(opts: {
  baseUrl: string;
  realm: string;
  clientId: string;
  clientSecret?: string | undefined;
  token: string;
  tokenTypeHint?: string;
}): Promise<void> {
  const body = new URLSearchParams({
    client_id: opts.clientId,
    token: opts.token,
    ...(opts.tokenTypeHint ? { token_type_hint: opts.tokenTypeHint } : {}),
  });
  if (opts.clientSecret) body.set("client_secret", opts.clientSecret);

  await fetch(`${opts.baseUrl}/realms/${opts.realm}/protocol/openid-connect/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(5_000),
  }).catch(() => {});
}

function resolveKeycloakClientSecret(
  plane: PlaneKey,
  realmKey: RealmKey,
  clientId: string,
  env: EnvBag,
): string | undefined {
  const prefix = plane.toUpperCase();
  const direct =
    readNonEmptyEnv(env[`${prefix}_KEYCLOAK_CLIENT_SECRET`]) ??
    readNonEmptyEnv(env[`${prefix}_WEB_CLIENT_SECRET`]) ??
    readNonEmptyEnv(env[`${clientId.replace(/[^a-z0-9]/gi, "_").toUpperCase()}_CLIENT_SECRET`]) ??
    (realmKey === "platform-control" ? readNonEmptyEnv(env.PLATFORM_KEYCLOAK_CLIENT_SECRET) : undefined);

  if (direct) return direct;

  if (
    plane === "admin" &&
    realmKey === "athyper" &&
    clientId === "admin-web" &&
    isLocalEnvironment(env)
  ) {
    return "AdminWeb@1234";
  }

  return undefined;
}

function readNonEmptyEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isLocalEnvironment(env: EnvBag): boolean {
  const value = (env.ENVIRONMENT ?? env.NODE_ENV ?? "development").toLowerCase();
  return value === "local" || value === "development" || value === "test";
}

function buildFrontChannelLogoutUrl(opts: {
  baseUrl: string;
  realm: string;
  clientId: string;
  idToken?: string;
  postLogoutRedirectUri: string;
}): string {
  const url = new URL(`${opts.baseUrl}/realms/${opts.realm}/protocol/openid-connect/logout`);
  url.searchParams.set("client_id", opts.clientId);
  if (opts.idToken) url.searchParams.set("id_token_hint", opts.idToken);
  url.searchParams.set("post_logout_redirect_uri", opts.postLogoutRedirectUri);
  return url.toString();
}

function keycloakAdminMfaSatisfied(
  plane: PlaneKey,
  realmKey: RealmKey,
  pkce: PkceState,
  idClaims: Record<string, unknown> | null,
): boolean {
  if (plane !== "admin" || realmKey !== "athyper" || pkce.clientId !== "admin-web") return false;

  const amr = Array.isArray(idClaims?.amr) ? idClaims.amr : [];
  if (amr.some(isMfaAmrValue)) return true;

  // admin-web is bound to the admin-mfa-required Keycloak flow. When this BFF
  // explicitly sent prompt=login, reaching the callback means that flow accepted
  // password + OTP even if the realm did not map an amr claim into the token.
  return pkce.forceAuthn === true && pkce.silent !== true;
}

function isMfaAmrValue(value: unknown): boolean {
  return (
    typeof value === "string" &&
    ["otp", "totp", "mfa", "sms", "webauthn", "hwk"].includes(value.toLowerCase())
  );
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) throw new Error("Invalid JWT format");
  return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
}

function organizationAttributes(value: Record<string, unknown>): Record<string, unknown> {
  const attributes = value.attributes;
  if (attributes && typeof attributes === "object" && !Array.isArray(attributes)) {
    return attributes as Record<string, unknown>;
  }
  return {};
}

function firstStringAttribute(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const first = value.find((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
    return first?.trim();
  }
  return undefined;
}

async function resolveSessionOrganizations(opts: {
  plane: PlaneKey;
  realmKey: RealmKey;
  accessToken: string;
  workbenches: string[];
  requestId: string;
}): Promise<Record<string, OrgMembership>> {
  const resolverUrls = contextResolverUrls();
  if (resolverUrls.length === 0) {
    throw new AuthFlowError("CONTEXT_RESOLUTION_FAILED", "No auth context resolver URL is configured.");
  }

  let sawEmptyResolverResult = false;
  let lastResolverFailure: string | null = null;

  for (const resolverUrl of resolverUrls) {
    try {
      const res = await fetch(resolverUrl, {
        method: "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${opts.accessToken}`,
          "X-Plane-Key": opts.plane,
          "X-Realm-Key": opts.realmKey,
          "X-Workbenches": opts.workbenches.join(","),
          "X-Request-Id": opts.requestId,
        },
      });
      const data = (await res.json().catch(() => ({}))) as ContextResolverResponse;
      if (res.ok) {
        const resolved = normalizeResolvedOrganizations(data.organizations, opts.workbenches);
        if (Object.keys(resolved).length > 0) return resolved;
        sawEmptyResolverResult = true;
        console.warn(`[auth-bff/${opts.plane}/contexts/${opts.requestId}] empty context resolver result from ${resolverUrl}`);
      } else {
        lastResolverFailure = `Context resolver returned ${res.status} for ${resolverUrl}`;
        console.warn(`[auth-bff/${opts.plane}/contexts/${opts.requestId}] ${lastResolverFailure}`);
      }
    } catch (err) {
      lastResolverFailure = err instanceof Error ? err.message : "Context resolver failed";
      console.warn(`[auth-bff/${opts.plane}/contexts/${opts.requestId}]`, err);
    }
  }

  if (sawEmptyResolverResult) throw new AuthFlowError("NO_ACCESS_CONTEXT");
  throw new AuthFlowError("CONTEXT_RESOLUTION_FAILED", lastResolverFailure ?? "Context resolver failed");
}

function contextResolverUrls(): string[] {
  return runtimeResolverUrls("/api/session/contexts", process.env.AUTH_CONTEXT_RESOLVER_URL ?? process.env.IAM_CONTEXT_RESOLVER_URL);
}

function discoveryResolverUrls(): string[] {
  return runtimeResolverUrls("/api/auth/discovery", process.env.AUTH_DISCOVERY_RESOLVER_URL);
}

function runtimeResolverUrls(path: string, explicit?: string): string[] {
  const urls: string[] = [];
  const addUrl = (url: string | null) => {
    if (url && !urls.includes(url)) urls.push(url);
  };
  if (explicit) addUrl(explicit);
  for (const base of [
    process.env.RUNTIME_API_URL,
    process.env.IAM_SERVICE_URL,
    defaultLocalRuntimeApiUrl(),
  ]) {
    if (!base || isLikelyKeycloakBaseUrl(base)) continue;
    try {
      addUrl(new URL(path, base).toString());
    } catch {
      // Ignore malformed optional resolver bases.
    }
  }
  return urls;
}

function isLikelyKeycloakBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const keycloak = new URL(process.env.KEYCLOAK_BASE_URL ?? "https://iam.athyper.local");
    return url.origin === keycloak.origin || url.pathname.includes("/realms/");
  } catch {
    return false;
  }
}

function defaultLocalRuntimeApiUrl(): string | null {
  const environment = (process.env.ENVIRONMENT ?? process.env.NODE_ENV ?? "").toLowerCase();
  if (!environment || environment === "local" || environment === "development") return "http://localhost:4000";
  return null;
}

function parseRequestedRealmKey(
  value: string | null | undefined,
  plane: PlaneKey,
  allowMissing: boolean,
): RealmKey | null {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!normalized) return allowMissing ? getPlaneConfig(plane).nativeRealm : null;
  return isRealmKey(normalized) ? normalized : null;
}

function normalizeResolvedOrganizations(raw: unknown, workbenches: string[]): Record<string, OrgMembership> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: Record<string, OrgMembership> = {};
  for (const [key, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const value = entry as Record<string, unknown>;
    const alias = typeof value.alias === "string" && value.alias ? value.alias : key;
    if (!alias) continue;
    const roles = Array.isArray(value.roles)
      ? value.roles.filter((role): role is string => typeof role === "string" && role.length > 0)
      : [];
    result[alias] = {
      id: typeof value.id === "string" ? value.id : "",
      name: typeof value.name === "string" && value.name ? value.name : alias,
      alias,
      roles: roles.length > 0 ? [...new Set(roles)] : workbenches,
      ...optionalOrgMembershipMetadata(value),
    };
  }
  return result;
}

function normalizeLoginExpectedContext(value: {
  tenantId: unknown;
  tenantCode: unknown;
  organizationCode: unknown;
  organizationName: unknown;
  workspaceId: unknown;
  workspaceType: unknown;
  networkRole: unknown;
}): LoginExpectedContext | null {
  const tenantCode = normalizeContextCode(value.tenantCode);
  if (!tenantCode) return null;
  return {
    tenantId: normalizeContextToken(value.tenantId) ?? "",
    tenantCode,
    organizationCode: normalizeContextCode(value.organizationCode) ?? "",
    organizationName: typeof value.organizationName === "string" ? value.organizationName.trim() : "",
    workspaceId: normalizeContextToken(value.workspaceId) ?? "",
    workspaceType: normalizeContextCode(value.workspaceType) ?? "",
    networkRole: normalizeContextCode(value.networkRole) ?? "",
  };
}

function filterOrganizationsByExpectedContext(
  plane: PlaneKey,
  expected: LoginExpectedContext,
  organizations: Record<string, OrgMembership>,
): Record<string, OrgMembership> {
  return Object.fromEntries(
    Object.entries(organizations).filter(([alias, membership]) =>
      isExpectedContextAllowed(plane, expected, { [alias]: membership })
    ),
  );
}

function isExpectedContextAllowed(
  plane: PlaneKey,
  expected: LoginExpectedContext,
  organizations: Record<string, OrgMembership>,
): boolean {
  const tenantCode = normalizeContextCode(expected.tenantCode);
  if (!tenantCode) return false;

  const expectedOrgCode = normalizeContextCode(expected.organizationCode);
  const expectedOrgName = normalizeContextName(expected.organizationName);
  const expectedTenantId = normalizeContextToken(expected.tenantId);
  const expectedWorkspaceId = normalizeContextToken(expected.workspaceId);
  const expectedAlias = expectedOrgCode
    ? `${tenantCode}--${plane === "admin" ? "admin" : expectedOrgCode}`
    : null;

  for (const membership of Object.values(organizations)) {
    const alias = membership.alias || "";
    const aliasParts = parseInternalOrgAlias(alias);
    const membershipTenantCode = normalizeContextCode(membership.tenantCode) ?? aliasParts?.tenant ?? null;
    const membershipTenantId = normalizeContextToken(membership.tenantId);
    const tenantMatches = membershipTenantCode === tenantCode
      || Boolean(expectedTenantId && membershipTenantId === expectedTenantId);
    if (!tenantMatches) continue;

    const workspaceTokens = [
      membership.workspaceId,
      membership.organizationId,
      membership.legalEntityId,
      membership.id,
      plane === "admin" ? membership.tenantId : undefined,
    ];
    if (expectedWorkspaceId && workspaceTokens.some((value) => normalizeContextToken(value) === expectedWorkspaceId)) {
      return true;
    }

    if (!expectedWorkspaceId && !expectedOrgCode && !expectedOrgName) return true;
    if (expectedAlias && aliasParts && alias.toLowerCase() === expectedAlias) return true;
    if (expectedOrgCode && [
      membership.organizationCode,
      membership.legalEntityCode,
      membership.workspaceCode,
      plane === "admin" ? membership.tenantCode : undefined,
      aliasParts?.entity,
    ].some((value) => normalizeContextCode(value) === expectedOrgCode)) {
      return true;
    }

    if (
      (looksLikeKeycloakOrganizationRef(expectedOrgCode) || looksLikeKeycloakOrganizationRef(expectedWorkspaceId))
      && [
        membership.keycloakOrganizationAlias,
        membership.keycloakOrganizationId,
      ].some((value) => normalizeContextToken(value) === expectedOrgCode || normalizeContextToken(value) === expectedWorkspaceId)
    ) {
      return true;
    }

    if (expectedOrgName && [
      membership.organizationName,
      membership.legalEntityName,
      membership.name,
    ].some((value) => normalizeContextName(value) === expectedOrgName)) {
      return true;
    }
  }

  return false;
}

function optionalOrgMembershipMetadata(value: Record<string, unknown>): Partial<OrgMembership> {
  const attributes = organizationAttributes(value);
  const m = (keys: readonly string[]) => metadataString(value, attributes, keys);
  const result: Partial<OrgMembership> = {};
  let v: string | undefined;
  // contextType intentionally falls back to workspaceType so that resolvers
  // that only emit workspaceType still populate the contextType field.
  if ((v = m(["tenantId", "tenant_id"]))) result.tenantId = v;
  if ((v = m(["tenantCode", "tenant_code"]))) result.tenantCode = v;
  if ((v = m(["tenantName", "tenant_name"]))) result.tenantName = v;
  if ((v = m(["contextType", "context_type", "workspaceType", "workspace_type"]))) result.contextType = v;
  if ((v = m(["workspaceId", "workspace_id"]))) result.workspaceId = v;
  if ((v = m(["workspaceCode", "workspace_code"]))) result.workspaceCode = v;
  if ((v = m(["workspaceType", "workspace_type"]))) result.workspaceType = v;
  if ((v = m(["organizationId", "organization_id"]))) result.organizationId = v;
  if ((v = m(["organizationCode", "organization_code"]))) result.organizationCode = v;
  if ((v = m(["organizationName", "organization_name"]))) result.organizationName = v;
  if ((v = m(["legalEntityId", "legal_entity_id"]))) result.legalEntityId = v;
  if ((v = m(["legalEntityCode", "legal_entity_code"]))) result.legalEntityCode = v;
  if ((v = m(["legalEntityName", "legal_entity_name"]))) result.legalEntityName = v;
  if ((v = m(["keycloakOrganizationId", "keycloak_organization_id"]))) result.keycloakOrganizationId = v;
  if ((v = m(["keycloakOrganizationAlias", "keycloak_organization_alias"]))) result.keycloakOrganizationAlias = v;
  return result;
}

function parseInternalOrgAlias(alias: string): { tenant: string; entity: string } | null {
  const normalized = alias.toLowerCase();
  const idx = normalized.indexOf("--");
  if (idx < 1) return null;
  return {
    tenant: normalized.slice(0, idx),
    entity: normalized.slice(idx + 2),
  };
}

function looksLikeKeycloakOrganizationRef(value: string | null): boolean {
  return Boolean(value && value.startsWith("org-"));
}

function summarizeOrganizationsForAudit(organizations: Record<string, OrgMembership>) {
  return Object.fromEntries(
    Object.entries(organizations).slice(0, 10).map(([alias, membership]) => [
      alias,
      {
        tenantId: membership.tenantId,
        tenantCode: membership.tenantCode,
        workspaceId: membership.workspaceId,
        workspaceCode: membership.workspaceCode,
        organizationId: membership.organizationId,
        organizationCode: membership.organizationCode,
        legalEntityId: membership.legalEntityId,
        legalEntityCode: membership.legalEntityCode,
        keycloakOrganizationAlias: membership.keycloakOrganizationAlias,
        roles: membership.roles,
      },
    ]),
  );
}

function metadataString(
  value: Record<string, unknown>,
  attributes: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const direct = stringMetadata(value[key]) ?? firstStringAttribute(value[key]);
    if (direct) return direct;
    const attr = stringMetadata(attributes[key]) ?? firstStringAttribute(attributes[key]);
    if (attr) return attr;
  }
  return undefined;
}

function stringMetadata(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeContextCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > 128) return null;
  return /^[a-z0-9._-]+$/.test(normalized) ? normalized : null;
}

function normalizeContextToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > 128) return null;
  return /^[a-z0-9._:-]+$/.test(normalized) ? normalized : null;
}

function normalizeContextName(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").toLowerCase() : "";
}

function hasAccessRole(resourceAccess: unknown, _groups: unknown, clientId: string): boolean {
  const roles = clientRoles(resourceAccess, clientId);
  return roles.includes("AUTHORIZED");
}

function resolveWorkbenchRoles(
  plane: PlaneKey,
  realmKey: RealmKey,
  claims: Record<string, unknown>,
  _clientId: string,
): string[] {
  const result = new Set<string>();
  const roles = realmRoles(claims.realm_access);
  if (plane === "neon" && roles.includes("NEON_USER")) result.add("user");
  if (plane === "mesh" && roles.includes("MESH_BUYER_USER")) result.add("user");
  if (plane === "mesh" && roles.includes("MESH_PARTNER_USER")) result.add("partner");
  if (plane === "admin" && roles.includes("ADMIN_USER")) result.add("admin");
  if (result.size > 0) return [...result];
  if (realmKey === "platform-control") {
    if (plane === "mesh") return ["partner"];
    if (plane === "admin") return ["admin"];
    return ["user", "admin"];
  }
  return [];
}

function clientRoles(resourceAccess: unknown, clientId: string): string[] {
  if (!resourceAccess || typeof resourceAccess !== "object") return [];
  const access = resourceAccess as Record<string, unknown>;
  const clientAccess = access[clientId];
  if (!clientAccess || typeof clientAccess !== "object") return [];
  const roles = (clientAccess as Record<string, unknown>).roles;
  return Array.isArray(roles) ? roles.filter((role): role is string => typeof role === "string") : [];
}

function realmRoles(realmAccess: unknown): string[] {
  if (!realmAccess || typeof realmAccess !== "object") return [];
  const roles = (realmAccess as Record<string, unknown>).roles;
  return Array.isArray(roles) ? roles.filter((role): role is string => typeof role === "string") : [];
}

function discoveryTokenKey(token: string): string {
  return `session:auth_discovery:${hashValue(token)}`;
}

function discoveryTrustKey(token: string): string {
  return `session:auth_discovery_trust:${hashValue(token)}`;
}

function discoveryTrustCookieName(plane: PlaneKey): string {
  return `${plane}_discovery_trust`;
}

function discoveryRateKey(plane: PlaneKey, identifier: string, ip: string): string {
  return `ratelimit:auth_discovery:${plane}:${hashValue(`${identifier}:${ip}`)}`;
}

function discoveryResendCooldownKey(plane: PlaneKey, identifier: string, ip: string): string {
  return `cooldown:auth_discovery_resend:${plane}:${hashValue(`${identifier}:${ip}`)}`;
}

function generateDiscoveryToken(): string {
  return randomBytes(32).toString("base64url");
}

async function readDiscoveryResendCooldown(
  redis: RedisClient,
  plane: PlaneKey,
  identifier: string,
  ip: string,
  policy: DiscoveryPolicy,
): Promise<number> {
  if (policy.resendCooldownSeconds <= 0) return 0;
  const raw = await redis.get(discoveryResendCooldownKey(plane, identifier, ip));
  const availableAt = Number(raw);
  if (!Number.isFinite(availableAt)) return 0;
  return Math.max(0, Math.ceil((availableAt - Date.now()) / 1000));
}

async function writeDiscoveryResendCooldown(
  redis: RedisClient,
  plane: PlaneKey,
  identifier: string,
  ip: string,
  policy: DiscoveryPolicy,
): Promise<void> {
  if (policy.resendCooldownSeconds <= 0) return;
  const seconds = clampInteger(policy.resendCooldownSeconds, 0, 300, DEFAULT_DISCOVERY_RESEND_COOLDOWN_SECONDS);
  if (seconds <= 0) return;
  await redis.set(discoveryResendCooldownKey(plane, identifier, ip), String(Date.now() + seconds * 1000), { EX: seconds });
}

async function storeDiscoverySelectionToken(
  redis: RedisClient,
  opts: {
    plane: PlaneKey;
    identifier: NormalizedDiscoveryIdentifier;
    deliveryEmail: string | null;
    returnUrl: string;
    candidates: DiscoveryCandidate[];
    policy: DiscoveryPolicy;
  },
): Promise<string> {
  const token = generateDiscoveryToken();
  const now = Math.floor(Date.now() / 1000);
  const ttl = clampInteger(opts.policy.tokenTtlSeconds, 60, 3600, DEFAULT_DISCOVERY_TOKEN_TTL_SECONDS);
  const payload: DiscoveryTokenPayload = {
    version: 1,
    planeKey: opts.plane,
    identifier: opts.identifier.value,
    email: opts.identifier.kind === "email" ? opts.identifier.value : opts.deliveryEmail ?? undefined,
    deliveryEmail: opts.deliveryEmail,
    returnUrl: opts.returnUrl,
    candidates: opts.candidates,
    createdAt: now,
    expiresAt: now + ttl,
    stage1VerificationMode: opts.policy.stage1VerificationMode,
    verifiedTrustTtlDays: opts.policy.verifiedTrustTtlDays,
  };
  await redis.set(discoveryTokenKey(token), JSON.stringify(payload), { EX: ttl });
  return token;
}

async function hasValidDiscoveryTrust(
  redis: RedisClient,
  plane: PlaneKey,
  request: NextRequest,
  identifier: string,
): Promise<boolean> {
  const token = request.cookies.get(discoveryTrustCookieName(plane))?.value?.trim();
  if (!token) return false;
  const raw = await redis.get(discoveryTrustKey(token)).catch(() => null);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(String(raw)) as Partial<DiscoveryTrustPayload>;
    return parsed.version === 1
      && parsed.planeKey === plane
      && parsed.identifierHash === hashValue(identifier)
      && typeof parsed.expiresAt === "number"
      && parsed.expiresAt > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

// Sets a long-lived HttpOnly cookie that records a hash of the user's identifier
// after a successful email verification. On subsequent discovery requests from the
// same browser, this trust allows skipping the email step and going straight to the
// organization picker — improving UX for repeat logins without weakening security
// (the hash is checked server-side against the Redis trust record).
async function rememberDiscoveryTrust(
  plane: PlaneKey,
  request: NextRequest,
  response: NextResponse,
  payload: DiscoveryTokenPayload,
  requestId: string,
): Promise<void> {
  const ttlDays = clampInteger(
    payload.verifiedTrustTtlDays ?? DEFAULT_DISCOVERY_TRUST_TTL_DAYS,
    0,
    90,
    DEFAULT_DISCOVERY_TRUST_TTL_DAYS,
  );
  if (ttlDays <= 0) return;

  const redis = await getSessionRedis().catch(() => null);
  if (!redis) return;

  const token = generateDiscoveryToken();
  const now = Math.floor(Date.now() / 1000);
  const maxAge = ttlDays * 86_400;
  const trust: DiscoveryTrustPayload = {
    version: 1,
    planeKey: plane,
    identifierHash: hashValue(payload.identifier),
    createdAt: now,
    expiresAt: now + maxAge,
  };

  try {
    await redis.set(discoveryTrustKey(token), JSON.stringify(trust), { EX: maxAge });
  } catch (err) {
    console.warn(`[auth-bff/${plane}/discovery/${requestId}] trust store unavailable`, err);
    return;
  }

  const env = process.env.ENVIRONMENT ?? "local";
  response.cookies.set(discoveryTrustCookieName(plane), token, {
    httpOnly: true,
    secure: env !== "local",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320 ? email : null;
}

function normalizeDiscoveryIdentifier(value: unknown): NormalizedDiscoveryIdentifier | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || /\s/.test(normalized) || normalized.length > 320) return null;
  const email = normalizeEmail(normalized);
  if (email) return { kind: "email", value: email };
  if (normalized.includes("@") || normalized.length > 128) return null;
  if (!/^[a-z0-9._-]+$/.test(normalized)) return null;
  return { kind: "username", value: normalized };
}

function normalizeLoginHint(value: unknown): string | null {
  return normalizeDiscoveryIdentifier(value)?.value ?? null;
}

function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  if (!local || !domain) return "your email";
  const visible = local.length <= 2 ? local[0] ?? "" : `${local[0]}${local.slice(-1)}`;
  return `${visible}${"*".repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

function maskIdentifier(identifier: string): string {
  const normalized = normalizeDiscoveryIdentifier(identifier);
  if (!normalized) return "your sign-in";
  if (normalized.kind === "email") return maskEmail(normalized.value);
  if (normalized.value.length <= 2) return `${normalized.value[0] ?? ""}*`;
  return `${normalized.value[0]}${"*".repeat(Math.min(6, normalized.value.length - 2))}${normalized.value.slice(-1)}`;
}

function discoveryVerifyUrl(publicBaseUrl: string, token: string, returnUrl: string): string {
  const url = new URL("/login", publicBaseUrl);
  url.searchParams.set("verify", token);
  if (returnUrl) url.searchParams.set("returnUrl", returnUrl);
  return url.toString();
}

function publicDiscoveryCandidate(candidate: DiscoveryCandidate): DiscoveryPublicCandidate {
  return {
    id: candidate.id,
    tenantCode: candidate.tenantCode,
    tenantName: candidate.tenantName,
    workspaceId: candidate.workspaceId,
    workspaceCode: candidate.workspaceCode,
    workspaceName: candidate.workspaceName,
    workspaceType: candidate.workspaceType,
    workspaceSubtitle: candidate.workspaceSubtitle,
    authMethodLabel: candidate.authMethodLabel,
    hostname: candidate.hostname,
    networkAccountId: candidate.networkAccountId ?? null,
    networkAccountCode: candidate.networkAccountCode ?? null,
    networkAccountName: candidate.networkAccountName ?? null,
    networkAccountRole: candidate.networkAccountRole ?? null,
    networkRelationshipType: candidate.networkRelationshipType ?? null,
  };
}

async function loadDiscoveryPayload(token: string): Promise<DiscoveryTokenPayload | null> {
  const redis = await getSessionRedis();
  const raw = await redis.get(discoveryTokenKey(token));
  if (!raw) return null;
  const parsed = JSON.parse(String(raw)) as Partial<DiscoveryTokenPayload>;
  if (!isPlaneKey(parsed.planeKey)) return null;
  const identifier = typeof parsed.identifier === "string" && parsed.identifier
    ? parsed.identifier
    : typeof parsed.email === "string" && parsed.email
      ? parsed.email
      : null;
  if (parsed.version !== 1 || !identifier || !parsed.expiresAt || parsed.expiresAt <= Math.floor(Date.now() / 1000)) {
    return null;
  }
  return {
    version: 1,
    planeKey: parsed.planeKey,
    identifier,
    email: typeof parsed.email === "string" && parsed.email ? parsed.email : undefined,
    deliveryEmail: typeof parsed.deliveryEmail === "string" && parsed.deliveryEmail ? parsed.deliveryEmail : null,
    returnUrl: typeof parsed.returnUrl === "string" ? parsed.returnUrl : getPlaneConfig(parsed.planeKey).defaultPath,
    candidates: Array.isArray(parsed.candidates) ? parsed.candidates : [],
    createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : 0,
    expiresAt: parsed.expiresAt,
    stage1VerificationMode: normalizeDiscoveryStage1Mode(parsed.stage1VerificationMode),
    verifiedTrustTtlDays: normalizeIntegerValue(parsed.verifiedTrustTtlDays, DEFAULT_DISCOVERY_TRUST_TTL_DAYS, 0, 90),
  };
}

async function resolveDiscoveryResolution(
  plane: PlaneKey,
  identifier: string,
  requestId: string,
): Promise<DiscoveryResolution> {
  const resolverUrls = discoveryResolverUrls();
  if (resolverUrls.length === 0) return { candidates: [], policy: defaultDiscoveryPolicy(plane) };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Request-Id": requestId,
  };
  if (process.env.AUTH_DISCOVERY_SHARED_SECRET) {
    headers["X-Discovery-Secret"] = process.env.AUTH_DISCOVERY_SHARED_SECRET;
  }

  let lastFailure: string | null = null;
  for (const resolverUrl of resolverUrls) {
    try {
      const res = await fetch(resolverUrl, {
        method: "POST",
        cache: "no-store",
        headers,
        body: JSON.stringify({ planeKey: plane, identifier }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) {
        lastFailure = `Discovery resolver returned ${res.status} for ${resolverUrl}`;
        continue;
      }
      const data = (await res.json().catch(() => ({}))) as DiscoveryResolverResponse;
      return {
        candidates: normalizeDiscoveryCandidates(data.candidates, plane),
        policy: normalizeDiscoveryPolicy(data.policy, plane),
      };
    } catch (err) {
      lastFailure = err instanceof Error ? err.message : "Discovery resolver failed";
    }
  }
  throw new Error(lastFailure ?? "Discovery resolver failed");
}

function normalizeDiscoveryCandidates(raw: unknown, plane: PlaneKey): DiscoveryCandidate[] {
  if (!Array.isArray(raw)) return [];
  const result: DiscoveryCandidate[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const value = entry as Record<string, unknown>;
    const id = typeof value.id === "string" ? value.id : "";
    const tenantId = typeof value.tenantId === "string" ? value.tenantId : "";
    const tenantCode = typeof value.tenantCode === "string" ? value.tenantCode : "";
    const tenantName = typeof value.tenantName === "string" ? value.tenantName : "";
    const workspaceId = typeof value.workspaceId === "string" && value.workspaceId ? value.workspaceId : tenantId;
    const workspaceCode = typeof value.workspaceCode === "string" && value.workspaceCode ? value.workspaceCode : tenantCode;
    const workspaceName = typeof value.workspaceName === "string" && value.workspaceName ? value.workspaceName : tenantName;
    const workspaceType = typeof value.workspaceType === "string" && value.workspaceType ? value.workspaceType : "tenant";
    const workspaceSubtitle = typeof value.workspaceSubtitle === "string" && value.workspaceSubtitle
      ? value.workspaceSubtitle
      : organizationSubtitleForPlane(plane);
    const realmKey = typeof value.realmKey === "string" ? value.realmKey : getPlaneConfig(plane).nativeRealm;
    if (!id || !tenantId || !tenantCode || !tenantName || seen.has(id)) continue;
    seen.add(id);
    result.push({
      id,
      planeKey: plane,
      tenantId,
      tenantCode,
      tenantName,
      workspaceId,
      workspaceCode,
      workspaceName,
      workspaceType,
      workspaceSubtitle,
      realmKey,
      providerHint: typeof value.providerHint === "string" && value.providerHint ? value.providerHint : null,
      authMethodLabel: typeof value.authMethodLabel === "string" && value.authMethodLabel
        ? value.authMethodLabel
        : "Organization sign-in",
      hostname: typeof value.hostname === "string" && value.hostname ? value.hostname : null,
      deliveryEmail: normalizeEmail(value.deliveryEmail) ?? null,
      networkAccountId: typeof value.networkAccountId === "string" && value.networkAccountId
        ? value.networkAccountId
        : null,
      networkAccountCode: typeof value.networkAccountCode === "string" && value.networkAccountCode
        ? value.networkAccountCode
        : null,
      networkAccountName: typeof value.networkAccountName === "string" && value.networkAccountName
        ? value.networkAccountName
        : null,
      networkAccountRole: typeof value.networkAccountRole === "string" && value.networkAccountRole
        ? value.networkAccountRole
        : null,
      networkRelationshipType: typeof value.networkRelationshipType === "string" && value.networkRelationshipType
        ? value.networkRelationshipType
        : null,
    });
  }
  return result.slice(0, 10);
}

function normalizeDiscoveryPolicy(raw: unknown, plane: PlaneKey): DiscoveryPolicy {
  const defaults = defaultDiscoveryPolicy(plane);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaults;
  const value = raw as Record<string, unknown>;
  return {
    stage1VerificationMode: normalizeDiscoveryStage1Mode(value.stage1VerificationMode, defaults.stage1VerificationMode),
    tokenTtlSeconds: normalizeIntegerValue(value.tokenTtlSeconds, defaults.tokenTtlSeconds, 60, 3600),
    resendCooldownSeconds: normalizeIntegerValue(
      value.resendCooldownSeconds,
      defaults.resendCooldownSeconds,
      0,
      300,
    ),
    verifiedTrustTtlDays: normalizeIntegerValue(value.verifiedTrustTtlDays, defaults.verifiedTrustTtlDays, 0, 90),
  };
}

function defaultDiscoveryPolicy(plane?: PlaneKey): DiscoveryPolicy {
  const planeOverride = plane
    ? process.env[`AUTH_DISCOVERY_STAGE1_VERIFICATION_MODE_${plane.toUpperCase()}`]
    : undefined;
  return {
    stage1VerificationMode: normalizeDiscoveryStage1Mode(planeOverride ?? process.env.AUTH_DISCOVERY_STAGE1_VERIFICATION_MODE),
    tokenTtlSeconds: DEFAULT_DISCOVERY_TOKEN_TTL_SECONDS,
    resendCooldownSeconds: DEFAULT_DISCOVERY_RESEND_COOLDOWN_SECONDS,
    verifiedTrustTtlDays: DEFAULT_DISCOVERY_TRUST_TTL_DAYS,
  };
}

function normalizeDiscoveryStage1Mode(
  value: unknown,
  fallback: DiscoveryStage1VerificationMode = "required",
): DiscoveryStage1VerificationMode {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["disabled", "optional", "off", "false", "none"].includes(normalized)) return "disabled";
  if (normalized === "required") return "required";
  return fallback;
}

function normalizeIntegerValue(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
  return clampInteger(parsed, min, max, fallback);
}

function readIntegerEnv(name: string, fallback: number, min: number, max: number): number {
  return normalizeIntegerValue(process.env[name], fallback, min, max);
}

function clampInteger(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function organizationSubtitleForPlane(plane: PlaneKey): string {
  if (plane === "mesh") return "Mesh organization";
  if (plane === "admin") return "Admin organization";
  return "Neon organization";
}

function resolveDiscoveryDeliveryEmail(
  candidates: DiscoveryCandidate[],
  identifier: NormalizedDiscoveryIdentifier,
): string | null {
  if (identifier.kind === "email") return identifier.value;
  const emails = [...new Set(candidates.map((candidate) => candidate.deliveryEmail).filter((email): email is string => Boolean(email)))];
  return emails.length === 1 ? emails[0] ?? null : null;
}

async function deliverDiscoveryLink(opts: {
  plane: PlaneKey;
  email: string;
  verifyUrl: string;
  requestId: string;
  expiresInSeconds?: number;
}): Promise<void> {
  const deliveryUrl = process.env.AUTH_DISCOVERY_DELIVERY_URL;
  if (!deliveryUrl) {
    if (shouldExposeDiscoveryDebugLink()) {
      console.info(`[auth-bff/${opts.plane}/discovery/${opts.requestId}] verification link: ${opts.verifyUrl}`);
    } else {
      console.warn(`[auth-bff/${opts.plane}/discovery/${opts.requestId}] AUTH_DISCOVERY_DELIVERY_URL is not configured`);
    }
    return;
  }

  const res = await fetch(deliveryUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.AUTH_DISCOVERY_DELIVERY_SECRET
        ? { "X-Delivery-Secret": process.env.AUTH_DISCOVERY_DELIVERY_SECRET }
        : {}),
    },
    body: JSON.stringify({
      plane: opts.plane,
      email: opts.email,
      verifyUrl: opts.verifyUrl,
      expiresInSeconds: opts.expiresInSeconds ?? DEFAULT_DISCOVERY_TOKEN_TTL_SECONDS,
    }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error(`Discovery delivery returned ${res.status}`);
}

function shouldExposeDiscoveryDebugLink(): boolean {
  const environment = process.env.ENVIRONMENT ?? process.env.NEXT_PUBLIC_ENVIRONMENT ?? "local";
  const explicitlyConfigured = process.env.AUTH_DISCOVERY_EXPOSE_DEV_LINK;
  if (explicitlyConfigured !== undefined) {
    return explicitlyConfigured === "true"
      && environment !== "production"
      && process.env.NODE_ENV !== "production";
  }
  return environment === "local" && process.env.NODE_ENV !== "production";
}

async function minimumDiscoveryResponseDelay(startedAt: number): Promise<void> {
  const elapsed = Date.now() - startedAt;
  if (elapsed < DISCOVERY_RESPONSE_MIN_MS) {
    await new Promise((resolve) => setTimeout(resolve, DISCOVERY_RESPONSE_MIN_MS - elapsed));
  }
}

function discoveryUnavailableResponse(requestId: string): NextResponse {
  return NextResponse.json(
    { error: "DISCOVERY_UNAVAILABLE", message: "Sign-in discovery is temporarily unavailable.", requestId },
    { status: 503 },
  );
}

function buildInternalLoginUrl(opts: {
  config: ReturnType<typeof getPlaneConfig>;
  realmKey: RealmKey;
  provider: string | null;
  loginHint: string;
  returnUrl: string;
  expectedContext?: LoginExpectedContext;
}): string {
  const params = new URLSearchParams();
  params.set("realm", opts.realmKey);
  params.set("returnUrl", buildAuthSelectReturnUrl(
    opts.returnUrl,
    defaultWorkbenchForPlane(opts.config.key, opts.expectedContext),
  ));
  params.set("login_hint", opts.loginHint);
  params.set("force", "1");
  if (opts.expectedContext) {
    if (opts.expectedContext.tenantId) params.set("selected_tenant_id", opts.expectedContext.tenantId);
    params.set("selected_tenant", opts.expectedContext.tenantCode);
    if (opts.expectedContext.organizationCode) params.set("selected_org", opts.expectedContext.organizationCode);
    if (opts.expectedContext.organizationName) params.set("selected_org_name", opts.expectedContext.organizationName);
    if (opts.expectedContext.workspaceId) params.set("selected_workspace_id", opts.expectedContext.workspaceId);
    if (opts.expectedContext.workspaceType) params.set("selected_workspace_type", opts.expectedContext.workspaceType);
    if (opts.expectedContext.networkRole) params.set("selected_role", opts.expectedContext.networkRole);
  }
  if (opts.provider) params.set("provider", opts.provider);
  return `/api/auth/login?${params.toString()}`;
}

function buildAuthSelectReturnUrl(finalDestination: string, filter: string | null): string {
  const params = new URLSearchParams();
  params.set("returnUrl", finalDestination);
  if (filter) params.set("filter", filter);
  return `/auth/select?${params.toString()}`;
}

function defaultWorkbenchForPlane(plane: PlaneKey, expectedContext?: LoginExpectedContext): string | null {
  if (plane === "mesh") {
    const fromRole = meshWorkbenchForRole(expectedContext?.networkRole);
    if (fromRole) return fromRole;
    const code = normalizeContextCode(expectedContext?.organizationCode);
    if (code?.endsWith("-buyer")) return "user";
    if (code?.endsWith("-partner")) return "partner";
    return null;
  }
  if (plane === "admin") return "admin";
  return "user";
}

function meshWorkbenchForRole(role: string | null | undefined): "user" | "partner" | null {
  const normalized = role?.trim().toLowerCase();
  if (!normalized || normalized === "both") return null;
  if (normalized === "buyer" || normalized === "user") return "user";
  if (
    normalized === "partner"
    || normalized === "supplier"
    || normalized === "carrier"
    || normalized === "broker"
    || normalized === "service_provider"
  ) {
    return "partner";
  }
  return null;
}

function generatePkceChallenge(): { codeVerifier: string; codeChallenge: string; state: string } {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  const state = randomBytes(16).toString("hex");
  return { codeVerifier, codeChallenge, state };
}

function generateSid(): string {
  return randomBytes(32).toString("hex");
}

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// Hashing both sides to a fixed-length digest before comparing ensures the
// timingSafeEqual call always operates on equal-length buffers regardless of
// input length, which prevents an attacker from inferring the expected token
// length through response-time differences.
function timingSafeStringEqual(left: string, right: string): boolean {
  const h1 = createHash("sha256").update(left).digest();
  const h2 = createHash("sha256").update(right).digest();
  return timingSafeEqual(h1, h2);
}

function isBindingMismatch(session: V4Session, request: NextRequest): boolean {
  return isBindingMismatchForValues(session, clientIp(request), request.headers.get("user-agent") ?? "unknown");
}

// Both hashes must mismatch simultaneously to count as a binding violation.
// Using AND (not OR) avoids false positives: mobile users frequently change IP
// (network handoffs), and browsers occasionally update their UA string. Requiring
// BOTH to differ at once is a strong signal that the cookie is on a different
// device rather than a legitimate roaming user.
function isBindingMismatchForValues(session: V4Session, ip: string, userAgent: string): boolean {
  const currentIp = hashValue(ip);
  const currentUa = hashValue(userAgent);
  return Boolean(session.ipHash && session.ipHash !== currentIp && session.uaHash && session.uaHash !== currentUa);
}

function clientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const firstForwardedIp = forwardedFor?.split(",")[0]?.trim();
  return firstForwardedIp || request.headers.get("x-real-ip")?.trim() || "unknown";
}

function clientIpFromHeaders(headers: HeaderReader | undefined): string {
  const forwardedFor = headers?.get("x-forwarded-for");
  const firstForwardedIp = forwardedFor?.split(",")[0]?.trim();
  return firstForwardedIp || headers?.get("x-real-ip")?.trim() || "unknown";
}

// The login flow is allowed to continue through /auth/select, but the final
// post-auth destination must never be another auth/API endpoint. Otherwise a
// crafted returnUrl can create redirect loops or bounce a new session into logout.
function sanitizeReturnUrl(value: string | null | undefined, fallback: string): string {
  const path = normalizeRelativeReturnPath(value);
  if (!path) return fallback;
  if (isAuthSelectContinuation(path)) {
    return sanitizeAuthSelectContinuation(path, fallback);
  }
  return isBlockedFinalReturnPath(path) ? fallback : path;
}

function sanitizeAuthSelectContinuation(path: string, fallback: string): string {
  if (path === AUTH_SELECT_PATH) return path;
  const query = path.slice(path.indexOf("?") + 1);
  const params = new URLSearchParams(query);
  const finalDestination = sanitizeFinalReturnDestination(params.get("returnUrl"), fallback);
  const filter = params.get("filter");
  const next = new URLSearchParams();
  next.set("returnUrl", finalDestination);
  if (filter === "user" || filter === "partner" || filter === "admin") {
    next.set("filter", filter);
  }
  return `${AUTH_SELECT_PATH}?${next.toString()}`;
}

function sanitizeFinalReturnDestination(value: string | null | undefined, fallback: string): string {
  const path = normalizeRelativeReturnPath(value);
  if (!path || isBlockedFinalReturnPath(path)) return fallback;
  return path;
}

function normalizeRelativeReturnPath(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || !trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  try {
    const parsed = new URL(trimmed, "https://sentinel.invalid");
    if (parsed.origin !== "https://sentinel.invalid") return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

function isAuthSelectContinuation(path: string): boolean {
  return path === AUTH_SELECT_PATH || path.startsWith(`${AUTH_SELECT_PATH}?`);
}

function isBlockedFinalReturnPath(path: string): boolean {
  return path === "/login"
    || path.startsWith("/login?")
    || path === "/logout"
    || path.startsWith("/logout?")
    || path === "/auth"
    || path.startsWith("/auth/")
    || path.startsWith("/auth?")
    || path === "/mfa"
    || path.startsWith("/mfa/")
    || path.startsWith("/mfa?")
    || path === "/api"
    || path.startsWith("/api/");
}

function setPlaneCookies(
  response: NextResponse,
  plane: PlaneKey,
  sid: string,
  csrfToken: string,
  realmKey: RealmKey,
  maxAge: number = SESSION_TTL_SECONDS,
): void {
  const config = getPlaneConfig(plane);
  const env = process.env.ENVIRONMENT ?? "local";
  response.cookies.set(effectiveCookieName(config.cookieName), sid, {
    httpOnly: true,
    secure: env !== "local",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  response.cookies.set(effectiveCookieName(config.csrfCookieName), csrfToken, {
    httpOnly: false,
    secure: env !== "local",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  response.cookies.set(effectiveCookieName(config.realmCookieName), realmKey, {
    httpOnly: true,
    secure: env !== "local",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

function setMfaPendingCookie(response: NextResponse, plane: PlaneKey, maxAge: number = MFA_PENDING_TTL_SECONDS): void {
  const config = getPlaneConfig(plane);
  const env = process.env.ENVIRONMENT ?? "local";
  response.cookies.set(effectiveCookieName(config.mfaPendingCookieName), "1", {
    httpOnly: false,
    secure: env !== "local",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

function clearMfaPendingCookie(response: NextResponse, plane: PlaneKey): void {
  response.cookies.delete(effectiveCookieName(getPlaneConfig(plane).mfaPendingCookieName));
}

function clearPlaneCookies(response: NextResponse, plane: PlaneKey): void {
  const config = getPlaneConfig(plane);
  response.cookies.delete(effectiveCookieName(config.cookieName));
  response.cookies.delete(effectiveCookieName(config.csrfCookieName));
  response.cookies.delete(effectiveCookieName(config.realmCookieName));
  response.cookies.delete(effectiveCookieName(config.mfaPendingCookieName));
}

function stringClaim(value: unknown, fallback: string): string {
  return typeof value === "string" && value ? value : fallback;
}

function optionalStringClaim(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

// ─── KC back-channel logout handler (Phase 3A) ────────────────────────────────
//
// Keycloak POSTs a signed logout token (JWT) when it invalidates a session via
// the admin console, token revocation, or user-initiated global logout. This
// handler verifies the token and wipes all app-plane Redis sessions that were
// created under the same KC session ID.
//
// JWKS keys are cached in Redis for 1 hour to avoid per-request fetches.
// Signature verification uses Node.js crypto.subtle (requires Node 18+).

interface JwkKey {
  kid?: string;
  kty: string;
  use?: string;
  alg?: string;
  n?: string;
  e?: string;
  x?: string;
  y?: string;
  crv?: string;
}

async function handleBackchannelLogout(plane: PlaneKey, request: NextRequest): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return new Response("Unsupported Media Type", { status: 415 });
  }

  const body = await request.text().catch(() => "");
  const params = new URLSearchParams(body);
  const logoutToken = params.get("logout_token");
  if (!logoutToken) return new Response("missing logout_token", { status: 400 });

  // Decode header + payload without verifying (needed to locate the signing key).
  const parts = logoutToken.split(".");
  if (parts.length !== 3) return new Response("malformed token", { status: 400 });

  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(Buffer.from(parts[0]!, "base64url").toString("utf8"));
    payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8"));
  } catch {
    return new Response("malformed token", { status: 400 });
  }

  const { iss, aud, sid, sub, events, nonce } = payload as {
    iss?: string; aud?: string | string[]; sid?: string; sub?: string;
    events?: Record<string, unknown>; nonce?: unknown;
  };

  // Per spec: logout tokens MUST NOT contain a nonce.
  if (nonce !== undefined) return new Response("invalid token", { status: 400 });

  // Validate the back-channel logout event marker.
  const BACKCHANNEL_EVENT = "http://schemas.openid.net/event/backchannel-logout";
  if (!events?.[BACKCHANNEL_EVENT]) return new Response("invalid token events", { status: 400 });

  if (!iss || typeof iss !== "string") return new Response("missing iss", { status: 400 });

  // Fetch JWKS with Redis cache (1 hour TTL).
  const redis = await getSessionRedis().catch(() => null);
  if (!redis) return new Response("service unavailable", { status: 503 });

  const jwksCacheKey = `jwks:${iss}`;
  let jwksRaw = await redis.get(jwksCacheKey).catch(() => null);
  if (!jwksRaw) {
    const jwksRes = await fetch(`${iss}/protocol/openid-connect/certs`, {
      signal: AbortSignal.timeout(5_000),
    }).catch(() => null);
    if (!jwksRes?.ok) return new Response("JWKS fetch failed", { status: 502 });
    jwksRaw = await jwksRes.text();
    await redis.set(jwksCacheKey, jwksRaw, { EX: 3_600 }).catch(() => {});
  }

  let jwks: { keys: JwkKey[] };
  try {
    jwks = JSON.parse(jwksRaw) as { keys: JwkKey[] };
  } catch {
    return new Response("invalid JWKS", { status: 502 });
  }

  // Find the signing key by kid (fall back to first sig key if kid absent).
  const kid = typeof header.kid === "string" ? header.kid : undefined;
  const jwk = jwks.keys.find((k) => (!kid || k.kid === kid) && (k.use === "sig" || !k.use));
  if (!jwk) return new Response("signing key not found", { status: 400 });

  // Verify JWT signature using Node.js built-in crypto.subtle (no external dep).
  try {
    const algo = jwk.kty === "EC"
      ? { name: "ECDSA", namedCurve: jwk.crv ?? "P-256", hash: "SHA-256" }
      : { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
    const key = await globalThis.crypto.subtle.importKey("jwk", jwk as JsonWebKey, algo, false, ["verify"]);
    const signingInput = Buffer.from(`${parts[0]}.${parts[1]}`);
    const signature = Buffer.from(parts[2]!, "base64url");
    const valid = await globalThis.crypto.subtle.verify(algo, key, signature, signingInput);
    if (!valid) return new Response("invalid signature", { status: 400 });
  } catch {
    return new Response("signature verification failed", { status: 400 });
  }

  // Validate audience against the plane's expected client ID.
  const expectedClientId = resolveKeycloakRuntime(plane, "athyper", process.env).clientId;
  const audList = Array.isArray(aud) ? aud : [aud].filter(Boolean);
  if (!audList.includes(expectedClientId)) {
    return new Response("audience mismatch", { status: 400 });
  }

  const SESSION_NAMESPACES = ["neon", "mesh", "admin", "platform"] as const;

  // Primary wipe path: use KC session reverse index if sid is present.
  if (sid && typeof sid === "string") {
    const reverseKey = kcSessionReverseKey(sid);
    const entries = await redis.sMembers(reverseKey).catch(() => [] as string[]);
    for (const entry of entries) {
      const colonIdx = entry.indexOf(":");
      if (colonIdx < 0) continue;
      const ns = entry.slice(0, colonIdx);
      const appSid = entry.slice(colonIdx + 1);
      await redis.del(sessKey(ns, appSid)).catch(() => {});
      if (sub) await redis.sRem(userSessionsKey(ns, sub), appSid).catch(() => {});
    }
    await redis.del(reverseKey).catch(() => {});
  }

  // Fallback: if no sid in token, wipe all sessions for the sub across all planes.
  if (!sid && sub && typeof sub === "string") {
    for (const ns of SESSION_NAMESPACES) {
      const sids = await redis.sMembers(userSessionsKey(ns, sub)).catch(() => [] as string[]);
      if (sids.length > 0) {
        await redis.del(sids.map((s) => sessKey(ns, s))).catch(() => {});
      }
      await redis.del(userSessionsKey(ns, sub)).catch(() => {});
    }
  }

  return new Response(null, { status: 200 });
}
