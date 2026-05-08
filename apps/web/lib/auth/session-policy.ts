/**
 * Session policy constants shared by the BFF server routes and client shell.
 *
 * Keep all durations here unless they are imposed by Keycloak realm config.
 * Values are intentionally plain constants so they can be referenced from
 * client components without importing server-only modules.
 */

/** Web BFF absolute session lifetime: 8 hours. */
export const SESSION_TTL_SECONDS = 28_800;

/** OAuth PKCE state lifetime: 30 minutes. */
export const PKCE_STATE_TTL_SECONDS = 1_800;

/** App-level inactivity timeout: 15 minutes. */
export const IDLE_TIMEOUT_SECONDS = 900;

/** Show the client inactivity warning this long before idle expiry: 2 minutes. */
export const IDLE_WARNING_SECONDS = 120;

/** Client heartbeat throttle while the user is active: 5 minutes. */
export const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

/** Client token refresh lead time before access token expiry: 90 seconds. */
export const CLIENT_REFRESH_BEFORE_EXPIRY_SECONDS = 90;

/** Server token refresh lead time before access token expiry: 120 seconds. */
export const SERVER_REFRESH_BUFFER_SECONDS = 120;

/** Redis distributed refresh lock lifetime: 10 seconds. */
export const REFRESH_LOCK_TTL_SECONDS = 10;

/** How long a lock loser waits before re-reading the session. */
export const REFRESH_LOCK_WAIT_MS = 300;

/** Short grace lookup from old SID to rotated SID for in-flight requests. */
export const REFRESH_ROTATION_GRACE_SECONDS = 30;

/** Session-expired auto-redirect countdown: 30 seconds. */
export const SESSION_EXPIRED_REDIRECT_COUNTDOWN_SECONDS = 30;

/** MFA pending cookie lifetime: 15 minutes. */
export const MFA_PENDING_TTL_SECONDS = 900;

/** Trusted-device registration lifetime requested during MFA: 30 days. */
export const TRUSTED_DEVICE_TTL_DAYS = 30;

export interface PublicSessionPolicy {
  idleTimeoutSeconds: number;
  idleWarningSeconds: number;
  heartbeatIntervalMs: number;
  clientRefreshBeforeExpirySeconds: number;
  sessionExpiredRedirectCountdownSeconds: number;
  mfaPendingTtlSeconds: number;
  trustedDeviceTtlDays: number;
}

export const DEFAULT_PUBLIC_SESSION_POLICY: PublicSessionPolicy = {
  idleTimeoutSeconds: IDLE_TIMEOUT_SECONDS,
  idleWarningSeconds: IDLE_WARNING_SECONDS,
  heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
  clientRefreshBeforeExpirySeconds: CLIENT_REFRESH_BEFORE_EXPIRY_SECONDS,
  sessionExpiredRedirectCountdownSeconds: SESSION_EXPIRED_REDIRECT_COUNTDOWN_SECONDS,
  mfaPendingTtlSeconds: MFA_PENDING_TTL_SECONDS,
  trustedDeviceTtlDays: TRUSTED_DEVICE_TTL_DAYS,
};
