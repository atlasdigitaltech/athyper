import "server-only";

// lib/diagnostics/cache-patterns.ts
//
// SCAN-based Redis cache clearing utility for the diagnostics control tower.
// Uses SCAN with COUNT:100 per iteration to avoid blocking Redis.

export const CACHE_PATTERNS = {
  app: ["cache:api:*", "cache:dashboard:*", "cache:config:*"],
  rbac: ["rbac:*", "policy:*", "acl:*"],
  ep: ["ep:*"],
} as const;

export type CacheScope = keyof typeof CACHE_PATTERNS;

export const VALID_SCOPES: readonly CacheScope[] = [
  "app",
  "rbac",
  "ep",
] as const;

export function isValidScope(scope: string): scope is CacheScope {
  return VALID_SCOPES.includes(scope as CacheScope);
}

interface ScanResult {
  cursor: number;
  keys: string[];
}

interface RedisLike {
  scan(
    cursor: number,
    options: { MATCH: string; COUNT: number },
  ): Promise<ScanResult>;
  del(keys: string | string[]): Promise<number>;
}

/**
 * Scan Redis for keys matching the given patterns and delete them.
 * Returns the total number of keys deleted.
 */
export async function scanAndDelete(
  redis: RedisLike,
  patterns: readonly string[],
): Promise<number> {
  let totalDeleted = 0;
  for (const pattern of patterns) {
    let cursor = 0;
    do {
      const result = await redis.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = result.cursor;
      if (result.keys.length > 0) {
        await redis.del(result.keys);
        totalDeleted += result.keys.length;
      }
    } while (cursor !== 0);
  }
  return totalDeleted;
}
