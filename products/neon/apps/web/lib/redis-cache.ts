import "server-only";

/**
 * Redis L2 Cache Utility for Entity Rendering Architecture
 *
 * Module-level singleton Redis client for cache operations.
 * Separate from the per-request session client in api-context.ts.
 *
 * Architecture: L1 (in-process Map, 10 min) → L2 (Redis, 24h) → Compute (DB)
 * All operations are fail-open: errors return null, computation continues.
 * REDIS_URL not set = L1-only mode (graceful degradation).
 */

// ============================================================================
// Singleton Client
// ============================================================================

type RedisClient = {
  isOpen: boolean;
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    options?: { EX?: number; NX?: boolean },
  ): Promise<string | null>;
  mGet(keys: string[]): Promise<(string | null)[]>;
  del(key: string | string[]): Promise<number>;
  incr(key: string): Promise<number>;
  multi(): {
    set(key: string, value: string, options?: { EX?: number }): unknown;
    exec(): Promise<unknown[]>;
  };
  connect(): Promise<void>;
  on(event: string, handler: (...args: any[]) => void): void;
};

let _client: RedisClient | null = null;
let _connecting: Promise<RedisClient | null> | null = null;

async function getClient(): Promise<RedisClient | null> {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (_client?.isOpen) return _client;
  if (_connecting) return _connecting;
  _connecting = (async () => {
    try {
      const { createClient } = await import("redis");
      const client = createClient({
        url,
        socket: {
          reconnectStrategy: (retries: number) => Math.min(retries * 100, 3000),
        },
      });
      client.on("error", (err: Error) =>
        console.warn("[redis-cache] error:", err.message),
      );
      await client.connect();
      _client = client as unknown as RedisClient;
      _connecting = null;
      return _client;
    } catch (err) {
      console.warn("[redis-cache] connection failed:", err);
      _connecting = null;
      return null;
    }
  })();
  return _connecting;
}

// ============================================================================
// Namespace Version (O(1) bulk invalidation)
// ============================================================================

let _nsVersion: number | null = null;
let _nsVersionExpiresAt = 0;
const NS_KEY = "ep:ns:v1";
const NS_CACHE_MS = 60_000; // Re-check namespace version every 60s

export async function getNamespaceVersion(): Promise<number> {
  if (_nsVersion !== null && Date.now() < _nsVersionExpiresAt)
    return _nsVersion;
  const client = await getClient();
  if (!client) return 0;
  try {
    const val = await client.get(NS_KEY);
    const parsed = val ? parseInt(val, 10) : 0;
    _nsVersion = Number.isFinite(parsed) ? parsed : 0;
    _nsVersionExpiresAt = Date.now() + NS_CACHE_MS;
    return _nsVersion;
  } catch {
    return _nsVersion ?? 0;
  }
}

/** Bump namespace version — O(1) bulk invalidation of all ep:* caches */
export async function bumpNamespaceVersion(): Promise<void> {
  const client = await getClient();
  if (!client) return;
  try {
    const newVersion = await client.incr(NS_KEY);
    _nsVersion = newVersion;
    _nsVersionExpiresAt = Date.now() + NS_CACHE_MS;
  } catch {
    // fail-open
  }
}

// ============================================================================
// Key Builders
// ============================================================================

export function dpKey(ns: number, schema: string, table: string): string {
  return `ep:dp:ns${ns}:${schema}.${table}`;
}

export function fieldsKey(
  ns: number,
  tenantId: string,
  entityName: string,
  versionId: string,
): string {
  return `ep:fields:ns${ns}:${tenantId}:${entityName}:${versionId}`;
}

export function fkMapKey(ns: number, schema: string, table: string): string {
  return `ep:fkmap:ns${ns}:${schema}.${table}`;
}

export function colsKey(ns: number, schema: string, table: string): string {
  return `ep:cols:ns${ns}:${schema}.${table}`;
}

export function refKey(
  ns: number,
  tenantId: string,
  schema: string,
  table: string,
  id: string,
): string {
  return `ep:ref:ns${ns}:${tenantId}:${schema}.${table}:${id}`;
}

export function queryResultKey(
  ns: number,
  tenantId: string,
  entity: string,
  gen: number,
  queryHash: string,
): string {
  return `ep:qr:ns${ns}:${tenantId}:${entity}:g${gen}:${queryHash}`;
}

export function queryCountKey(
  ns: number,
  tenantId: string,
  entity: string,
  gen: number,
  filterHash: string,
): string {
  return `ep:qc:ns${ns}:${tenantId}:${entity}:g${gen}:${filterHash}`;
}

// ============================================================================
// TTL Constants
// ============================================================================

export const REDIS_TTL = {
  displayPolicy: 86400, // 24h
  entityFields: 86400, // 24h (version in key = immutable)
  fkMap: 86400, // 24h
  schemaColumns: 86400, // 24h
  refLabel: 1800, // 30 min (stale label tolerance)
  queryResult: 120, // 2 min (server-side filtered query results)
  queryCount: 300, // 5 min (filtered COUNT — changes less often)
} as const;

// ============================================================================
// CacheMetrics
// ============================================================================

export interface CacheMetrics {
  dp?: "hit" | "miss";
  fields?: "hit" | "miss";
  fkmap?: "hit" | "miss";
  cols?: "hit" | "miss";
  ref?: { hits: number; misses: number };
  redis_errors: number;
  payload_bytes?: number;
}

export function createCacheMetrics(): CacheMetrics {
  return { redis_errors: 0 };
}

// ============================================================================
// Typed Operations (all fail-open)
// ============================================================================

const PAYLOAD_WARN_BYTES = 65_536; // 64KB — log warning
const PAYLOAD_MAX_BYTES = 262_144; // 256KB — hard guard, skip caching

export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = await getClient();
  if (!client) return null;
  try {
    const val = await client.get(key);
    if (val === null) return null;
    try {
      return JSON.parse(val) as T;
    } catch {
      // Corrupted JSON — treat as miss, async delete
      void client.del(key).catch(() => {});
      return null;
    }
  } catch {
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<number> {
  const json = JSON.stringify(value);
  const bytes = Buffer.byteLength(json, "utf8");
  if (bytes > PAYLOAD_MAX_BYTES) {
    console.error(
      `[redis-cache] payload too large, skipping cache: ${key} = ${bytes} bytes`,
    );
    return bytes;
  }
  if (bytes > PAYLOAD_WARN_BYTES) {
    console.warn(`[redis-cache] large payload: ${key} = ${bytes} bytes`);
  }
  const client = await getClient();
  if (!client) return bytes;
  try {
    await client.set(key, json, { EX: ttlSeconds });
  } catch {
    // fail-open
  }
  return bytes;
}

export async function cacheMGet<T>(keys: string[]): Promise<Map<string, T>> {
  const result = new Map<string, T>();
  const client = await getClient();
  if (!client || keys.length === 0) return result;
  try {
    const values = await client.mGet(keys);
    for (let i = 0; i < keys.length; i++) {
      if (values[i] === null) continue;
      try {
        result.set(keys[i], JSON.parse(values[i]!) as T);
      } catch {
        // Corrupted JSON — treat as miss, schedule async delete
        void client.del(keys[i]).catch(() => {});
      }
    }
  } catch {
    // fail-open
  }
  return result;
}

export async function cacheMSet(
  entries: Array<{ key: string; value: unknown; ttl: number }>,
): Promise<void> {
  const client = await getClient();
  if (!client || entries.length === 0) return;
  try {
    const multi = client.multi();
    for (const entry of entries) {
      const json = JSON.stringify(entry.value);
      const bytes = Buffer.byteLength(json, "utf8");
      if (bytes > PAYLOAD_MAX_BYTES) {
        console.error(
          `[redis-cache] payload too large, skipping: ${entry.key} = ${bytes} bytes`,
        );
        continue;
      }
      multi.set(entry.key, json, { EX: entry.ttl });
    }
    await multi.exec();
  } catch {
    // fail-open
  }
}

// ============================================================================
// Distributed Lock-Lite
// ============================================================================

export async function acquireComputeLock(
  lockKey: string,
  ttlSec: number,
): Promise<boolean> {
  const client = await getClient();
  if (!client) return true; // no Redis = always "acquired" (proceed to compute)
  try {
    const result = await client.set(lockKey, "1", { NX: true, EX: ttlSec });
    return result === "OK";
  } catch {
    return true; // fail-open
  }
}

const LOCK_WAIT_MS: Record<string, number> = {
  dp: 75, // 50–100ms — DisplayPolicy compute is fast
  fields: 75, // 50–100ms — FieldMeta query is indexed
  cols: 200, // 150–250ms — schema introspection is slow
  fkmap: 200, // 150–250ms — FK constraint introspection is slow
};

export async function waitForLock(cacheType: string): Promise<void> {
  const base = LOCK_WAIT_MS[cacheType] ?? 100;
  const jitter = Math.floor(Math.random() * 50);
  await new Promise((r) => setTimeout(r, base + jitter));
}
