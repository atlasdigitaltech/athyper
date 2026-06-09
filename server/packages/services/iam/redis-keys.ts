/**
 * Redis key registry — backend (server)
 *
 * Single source of truth for all key patterns written by the athyper server.
 * Import this module wherever a Redis key is constructed to prevent typos,
 * collisions, and undocumented key sprawl.
 *
 * Frontend keys (sess:*, user_sessions:*, pkce_state:*) are defined in
 * apps/web/lib/auth/redis-keys.ts and must not overlap with the patterns here.
 */

// ─── Backend key builders ─────────────────────────────────────────────────────

/** IAM session context cache. TTL: SESSION_CACHE_TTL_SEC (300s). */
export const sessionKey = (
  sub: string,
  tenant: string,
  entity: string,
  workbench: string,
  delegationId?: string,
): string => {
  const base = `session:${sub}:${tenant}:${entity}:${workbench}`;
  return delegationId ? `${base}:d:${delegationId}` : base;
};

/** Per-principal session key tracking set (P2). TTL: refreshed on each write. */
export const principalSessionsKey = (sub: string): string =>
  `principal_sessions:${sub}`;

/** Bootstrap (tenant/entity access list) cache. TTL: BOOTSTRAP_CACHE_TTL_SEC (300s). */
export const bootstrapKey = (sub: string, tenantHash: string): string =>
  `bootstrap:${sub}:${tenantHash}`;

/** Per-principal bootstrap key tracking set (P2). TTL: refreshed on each write. */
export const bootstrapKeysKey = (sub: string): string =>
  `bootstrap_keys:${sub}`;

/** JWKS warm-start cache. TTL: ~3600s. */
export const jwksKey = (realmKey: string, prefix = "jwks:"): string =>
  `${prefix}${realmKey}`;

// ─── Pattern matchers (for SCAN fallback) ────────────────────────────────────

export const sessionPattern = (sub: string): string => `session:${sub}:*`;
export const bootstrapPattern = (sub: string): string => `bootstrap:${sub}:*`;
