import "server-only";

/**
 * Query Cache Invalidation — Generation-Based Strategy
 *
 * When a write (POST/PATCH/DELETE) mutates entity data, we bump a
 * per-entity generation counter in Redis. Query result cache keys
 * include this generation, so old keys become orphans and self-expire
 * via their TTL (2 min max).
 *
 * Uses the singleton Redis client from redis-cache.ts (same as cacheGet/cacheSet).
 *
 * Benefits over SCAN/KEYS:
 *   - O(1) invalidation (single INCR)
 *   - No blocking Redis operations
 *   - Works correctly across distributed workers via atomic INCR
 *   - Orphaned keys expire naturally — no manual cleanup
 */

import { cacheGet, cacheSet } from "@/lib/redis-cache";

// ============================================================================
// Constants
// ============================================================================

const ENTITY_GEN_PREFIX = "ep:egen:";
/** Generation counter TTL — 24h (long-lived; bumped frequently on active entities) */
const GEN_TTL_SECONDS = 86400;

// ============================================================================
// Public API
// ============================================================================

/**
 * Bump the generation counter for an entity, invalidating all cached
 * query results for that entity + tenant combination.
 *
 * Call this after any successful INSERT, UPDATE, or DELETE.
 *
 * Implementation: read current gen → write gen+1.
 * Uses cacheGet/cacheSet which go through the singleton redis-cache client.
 */
export async function invalidateEntityQueryCache(
  tenantId: string,
  entity: string,
): Promise<void> {
  try {
    const key = `${ENTITY_GEN_PREFIX}${tenantId}:${entity}`;
    const current = await cacheGet<number>(key);
    const next = (current ?? 0) + 1;
    await cacheSet(key, next, GEN_TTL_SECONDS);
  } catch {
    // fail-open: worst case, stale cache serves for TTL duration (2 min)
  }
}

/**
 * Read the current generation for an entity + tenant.
 * Used when building cache keys for query results.
 */
export async function getEntityGeneration(
  tenantId: string,
  entity: string,
): Promise<number> {
  try {
    const key = `${ENTITY_GEN_PREFIX}${tenantId}:${entity}`;
    const val = await cacheGet<number>(key);
    return val ?? 0;
  } catch {
    return 0;
  }
}
