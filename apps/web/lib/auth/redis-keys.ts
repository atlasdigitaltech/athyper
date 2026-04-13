/**
 * Redis key registry — frontend (web BFF)
 *
 * Single source of truth for all key patterns written by the Next.js BFF.
 * Import this module wherever a Redis key is constructed.
 *
 * Backend keys (session:*, bootstrap:*, principal_sessions:*, etc.) are
 * defined in server/framework/runtime/services/iam/redis-keys.ts.
 *
 * namespace = realmKey, either "athyper" or "platform-control"
 */

// ─── Frontend key builders ────────────────────────────────────────────────────

/** OAuth2 PKCE state + codeVerifier ephemeral key. TTL: 1800s (30 min). */
export const pkceStateKey = (state: string): string => `pkce_state:${state}`;

/** Web BFF session blob (V4Session JSON). TTL: 28800s (8 hr). */
export const sessKey = (namespace: string, sid: string): string =>
  `sess:${namespace}:${sid}`;

/** Per-user active SID index set. TTL: 28800s (8 hr). */
export const userSessionsKey = (namespace: string, userId: string): string =>
  `user_sessions:${namespace}:${userId}`;

// ─── Pattern matchers ─────────────────────────────────────────────────────────

export const sessPattern = (namespace: string): string => `sess:${namespace}:*`;
export const userSessionsPattern = (namespace: string): string =>
  `user_sessions:${namespace}:*`;

// ─── Known namespaces ─────────────────────────────────────────────────────────

/** All KC realm keys used as session namespaces. Used for cross-namespace operations. */
export const SESSION_NAMESPACES = [
  process.env.KEYCLOAK_REALM ?? "athyper",
  process.env.PLATFORM_KEYCLOAK_REALM ?? "platform-control",
] as const;
