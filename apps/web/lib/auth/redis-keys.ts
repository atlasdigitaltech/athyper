/**
 * Redis key registry — frontend (web BFF)
 *
 * Single source of truth for all key patterns written by the Next.js BFF.
 * Import this module wherever a Redis key is constructed.
 *
 * Backend keys (session:*, bootstrap:*, principal_sessions:*, etc.) are
 * defined in server/framework/runtime/services/iam/redis-keys.ts.
 *
 * namespace = realmKey for tenant sessions, or "platform" for platform sessions.
 */

// ─── Frontend key builders ────────────────────────────────────────────────────

export {
  CLIENT_REFRESH_BEFORE_EXPIRY_SECONDS,
  HEARTBEAT_INTERVAL_MS,
  IDLE_TIMEOUT_SECONDS,
  IDLE_WARNING_SECONDS,
  REFRESH_LOCK_WAIT_MS,
  REFRESH_LOCK_TTL_SECONDS,
  REFRESH_ROTATION_GRACE_SECONDS,
  SERVER_REFRESH_BUFFER_SECONDS,
  SESSION_EXPIRED_REDIRECT_COUNTDOWN_SECONDS,
  SESSION_TTL_SECONDS,
  PKCE_STATE_TTL_SECONDS,
} from "./session-policy";

/** OAuth2 PKCE state + codeVerifier ephemeral key. TTL: 1800s (30 min). */
export const pkceStateKey = (state: string): string => `pkce_state:${state}`;

/** Web BFF session blob (V4Session JSON). TTL: 28800s (8 hr). */
export const sessKey = (namespace: string, sid: string): string =>
  `sess:${namespace}:${sid}`;

/** Per-user active SID index set. TTL: 28800s (8 hr). */
export const userSessionsKey = (namespace: string, userId: string): string =>
  `user_sessions:${namespace}:${userId}`;

/** Distributed lock used to serialise concurrent refresh attempts. TTL: 10s. */
export const refreshLockKey = (namespace: string, sid: string): string =>
  `refresh_lock:${namespace}:${sid}`;

/** Short-lived pointer from a rotated old SID to its new SID. TTL: 30s. */
export const sidRotationKey = (namespace: string, sid: string): string =>
  `sid_rotation:${namespace}:${sid}`;

/** Legacy rotation pointer used before the dedicated sid_rotation prefix. */
export const legacySidRotationKey = (namespace: string, sid: string): string =>
  `refresh_lock:${namespace}:${sid}:rotated`;

// ─── Pattern matchers ─────────────────────────────────────────────────────────

export const sessPattern = (namespace: string): string => `sess:${namespace}:*`;
export const userSessionsPattern = (namespace: string): string =>
  `user_sessions:${namespace}:*`;

// ─── Known namespaces ─────────────────────────────────────────────────────────

/** All KC realm keys used as session namespaces. Used for cross-namespace operations. */
export const SESSION_NAMESPACES = [
  ...new Set([
    ...((process.env.SESSION_NAMESPACES ?? process.env.AUTH_SESSION_NAMESPACES)
      ?.split(",")
      .map((namespace) => namespace.trim())
      .filter(Boolean) ?? [process.env.KEYCLOAK_REALM ?? "athyper"]),
    "platform", // platform sessions always use "platform" namespace (see realm-config.ts)
  ]),
] as const;
