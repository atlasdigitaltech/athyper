// lib/finance/reporting-cache.ts
//
// Lightweight in-memory request cache for reporting queries.
// Deduplicates in-flight requests and caches results for a configurable
// stale time. No external dependencies — works with the existing finGet pattern.

type CacheEntry<T> = {
  data: T;
  fetchedAt: number;
  promise?: undefined;
};

type InflightEntry<T> = {
  promise: Promise<T>;
  data?: undefined;
  fetchedAt?: undefined;
};

const cache = new Map<string, CacheEntry<unknown> | InflightEntry<unknown>>();

const DEFAULT_STALE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch with dedup + stale-time caching.
 *
 * - If a cached result exists and is fresh, returns it immediately.
 * - If an identical request is already in-flight, returns its promise (dedup).
 * - Otherwise, calls `fetchFn`, caches the result, and returns it.
 */
export async function cachedFetch<T>(
  key: string,
  fetchFn: () => Promise<T>,
  staleMs: number = DEFAULT_STALE_MS,
): Promise<T> {
  const existing = cache.get(key);

  // Return fresh cache hit
  if (existing?.data !== undefined && existing.fetchedAt !== undefined) {
    if (Date.now() - existing.fetchedAt < staleMs) {
      return existing.data as T;
    }
  }

  // Dedup in-flight request
  if (existing?.promise !== undefined) {
    return existing.promise as Promise<T>;
  }

  // New fetch
  const promise = fetchFn().then(
    (data) => {
      cache.set(key, { data, fetchedAt: Date.now() });
      return data;
    },
    (err) => {
      // Don't cache errors
      cache.delete(key);
      throw err;
    },
  );

  cache.set(key, { promise });
  return promise;
}

/**
 * Invalidate a specific cache key (e.g. after manual refresh).
 */
export function invalidateCache(key: string): void {
  cache.delete(key);
}

/**
 * Invalidate all cache entries whose key starts with the given prefix.
 */
export function invalidateCachePrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

/**
 * Build a stable cache key from a URL path + params.
 */
export function buildCacheKey(url: string): string {
  return `rpt:${url}`;
}
