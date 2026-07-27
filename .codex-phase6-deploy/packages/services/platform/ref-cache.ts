/**
 * Versioned reference data cache
 *
 * Uses a two-key pattern to avoid Redis wildcard delete (DEL does not support
 * glob patterns). Each invalidation increments a version counter; the value
 * key includes the version so stale entries expire via TTL without a scan.
 *
 *   ref_ver:{family}          → integer version counter
 *   ref:{family}:v{version}   → JSON-serialised ref data, TTL 3600s
 *
 * invalidateRefCache() is called by the import route after a successful upsert.
 * getRefData() / setRefData() are used by read handlers that want caching.
 */

import type { RedisClient } from "@athyper/adapter-memory-cache";

const REF_TTL_SECONDS = 3600;

export async function invalidateRefCache(redis: RedisClient, family: string): Promise<void> {
  await redis.incr(`ref_ver:${family}`);
}

export async function getRefData<T>(redis: RedisClient, family: string): Promise<T[] | null> {
  const ver = await redis.get(`ref_ver:${family}`);
  if (!ver) return null;
  const raw = await redis.get(`ref:${family}:v${ver}`);
  if (!raw) return null;
  try { return JSON.parse(raw) as T[]; } catch { return null; }
}

export async function setRefData<T>(redis: RedisClient, family: string, data: T[]): Promise<void> {
  const ver = await redis.incr(`ref_ver:${family}`);
  await redis.set(`ref:${family}:v${ver}`, JSON.stringify(data), "EX", REF_TTL_SECONDS);
}

