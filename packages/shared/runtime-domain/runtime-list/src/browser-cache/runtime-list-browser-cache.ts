import type {
  RuntimeListCachePolicy,
  RuntimeListPagination,
  RuntimeRecordRow,
} from "../core/types";

export const DEFAULT_RUNTIME_LIST_BROWSER_CACHE_LIMITS = Object.freeze({
  maxEntities: 20,
  maxQueriesPerEntity: 5,
  maxRowsPerQuery: 200,
  /** Approximate in-memory ceiling; 16 MiB is the midpoint of the 10–20 MB target. */
  maxApproximateBytes: 16 * 1024 * 1024,
});

export const DEFAULT_RUNTIME_LIST_CACHE_POLICY: RuntimeListCachePolicy = Object.freeze({
  mode: "stale_while_revalidate",
  freshForSeconds: 20,
  retainForSeconds: 300,
  prefetch: "intent",
  restoreScroll: true,
  invalidateOnMutation: true,
  maxQueriesPerEntity: 5,
  maxRowsPerQuery: 200,
  storage: "memory",
  source: "platform",
});

export type RuntimeListBrowserCacheState =
  | "fresh"
  | "stale"
  | "expired"
  | "miss"
  | "bypass"
  | "invalid_descriptor"
  | "invalid_scope";

export interface RuntimeListCachedPage {
  rows: RuntimeRecordRow[];
  pagination?: RuntimeListPagination;
  savedAt: number;
  lastAccessed: number;
}

export interface RuntimeListCacheSnapshot {
  pages: Array<[number, RuntimeListCachedPage]>;
  scrollY?: number;
}

export interface RuntimeListBrowserCacheLimits {
  maxEntities?: number;
  maxQueriesPerEntity?: number;
  maxRowsPerQuery?: number;
  maxApproximateBytes?: number;
}

export interface RuntimeListBrowserCacheIdentity {
  entityCode: string;
  queryKey: string;
  descriptorHash: string;
  scopeFingerprint: string;
  policy?: RuntimeListCachePolicy;
}

export interface RuntimeListBrowserCacheRead {
  state: RuntimeListBrowserCacheState;
  snapshot?: RuntimeListCacheSnapshot;
  ageMs?: number;
}

interface CacheEntry {
  descriptorHash: string;
  scopeFingerprint: string;
  snapshot: RuntimeListCacheSnapshot;
  policy: RuntimeListCachePolicy;
  savedAt: number;
  lastAccessed: number;
  rowCount: number;
  approximateBytes: number;
  invalidateOnMutation: boolean;
}

interface EntityBucket {
  queries: Map<string, CacheEntry>;
  lastAccessed: number;
}

export class RuntimeListBrowserCache {
  private readonly entities = new Map<string, EntityBucket>();
  private readonly listeners = new Set<() => void>();
  private readonly limits: Required<RuntimeListBrowserCacheLimits>;
  private approximateBytes = 0;

  constructor(limits: RuntimeListBrowserCacheLimits = {}) {
    this.limits = {
      maxEntities: boundedInt(limits.maxEntities, 1, 100, DEFAULT_RUNTIME_LIST_BROWSER_CACHE_LIMITS.maxEntities),
      maxQueriesPerEntity: boundedInt(
        limits.maxQueriesPerEntity,
        1,
        20,
        DEFAULT_RUNTIME_LIST_BROWSER_CACHE_LIMITS.maxQueriesPerEntity,
      ),
      maxRowsPerQuery: boundedInt(
        limits.maxRowsPerQuery,
        1,
        500,
        DEFAULT_RUNTIME_LIST_BROWSER_CACHE_LIMITS.maxRowsPerQuery,
      ),
      maxApproximateBytes: boundedInt(
        limits.maxApproximateBytes,
        1_024,
        100 * 1024 * 1024,
        DEFAULT_RUNTIME_LIST_BROWSER_CACHE_LIMITS.maxApproximateBytes,
      ),
    };
  }

  read(identity: RuntimeListBrowserCacheIdentity, now = Date.now()): RuntimeListBrowserCacheRead {
    const policy = resolvePolicy(identity.policy);
    if (policy.mode === "disabled" || policy.retainForSeconds <= 0) return { state: "bypass" };

    const bucket = this.entities.get(identity.entityCode);
    const entry = bucket?.queries.get(identity.queryKey);
    if (!bucket || !entry) return { state: "miss" };

    if (entry.descriptorHash !== identity.descriptorHash) {
      this.clear();
      return { state: "invalid_descriptor" };
    }
    if (entry.scopeFingerprint !== identity.scopeFingerprint) {
      this.clear();
      return { state: "invalid_scope" };
    }

    const ageMs = Math.max(0, now - entry.savedAt);
    if (ageMs >= policy.retainForSeconds * 1_000) {
      this.removeQuery(identity.entityCode, identity.queryKey);
      return { state: "expired", ageMs };
    }

    entry.lastAccessed = now;
    touchMapEntry(bucket.queries, identity.queryKey, entry);
    bucket.lastAccessed = now;
    touchMapEntry(this.entities, identity.entityCode, bucket);

    return {
      state: ageMs < policy.freshForSeconds * 1_000 ? "fresh" : "stale",
      snapshot: cloneSnapshot(entry.snapshot),
      ageMs,
    };
  }

  /**
   * Activates the current entity descriptor before a query read. Any retained
   * entry compiled from another descriptor clears the complete list cache.
   */
  activateDescriptor(entityCode: string, descriptorHash: string): boolean {
    const bucket = this.entities.get(entityCode);
    if (!bucket) return false;
    const changed = [...bucket.queries.values()].some((entry) => entry.descriptorHash !== descriptorHash);
    if (changed) this.clear();
    return changed;
  }

  write(
    identity: RuntimeListBrowserCacheIdentity,
    snapshot: RuntimeListCacheSnapshot,
    options: { savedAt?: number; now?: number } = {},
  ): boolean {
    const policy = resolvePolicy(identity.policy);
    if (policy.mode === "disabled" || policy.retainForSeconds <= 0) {
      this.removeQuery(identity.entityCode, identity.queryKey);
      return false;
    }

    const now = options.now ?? Date.now();
    const maxRows = Math.min(this.limits.maxRowsPerQuery, policy.maxRowsPerQuery);
    const limitedSnapshot = limitSnapshotRows(snapshot, maxRows);
    const rowCount = countSnapshotRows(limitedSnapshot);
    if (rowCount === 0) {
      this.removeQuery(identity.entityCode, identity.queryKey);
      return false;
    }
    const approximateBytes = estimateCacheEntryBytes(identity, limitedSnapshot);
    if (!Number.isFinite(approximateBytes)) {
      this.removeQuery(identity.entityCode, identity.queryKey);
      return false;
    }

    let bucket = this.entities.get(identity.entityCode);
    if (bucket && [...bucket.queries.values()].some((entry) => entry.descriptorHash !== identity.descriptorHash)) {
      this.clear();
      bucket = undefined;
    }
    if (!bucket) {
      bucket = { queries: new Map(), lastAccessed: now };
    }

    const previousEntry = bucket.queries.get(identity.queryKey);
    if (previousEntry) this.approximateBytes -= previousEntry.approximateBytes;
    bucket.queries.delete(identity.queryKey);
    bucket.queries.set(identity.queryKey, {
      descriptorHash: identity.descriptorHash,
      scopeFingerprint: identity.scopeFingerprint,
      snapshot: limitedSnapshot,
      policy,
      savedAt: options.savedAt ?? now,
      lastAccessed: now,
      rowCount,
      approximateBytes,
      invalidateOnMutation: policy.invalidateOnMutation,
    });
    this.approximateBytes += approximateBytes;
    bucket.lastAccessed = now;
    this.entities.set(identity.entityCode, bucket);

    const maxQueries = Math.min(this.limits.maxQueriesPerEntity, policy.maxQueriesPerEntity);
    while (bucket.queries.size > maxQueries) {
      const oldestQuery = bucket.queries.keys().next().value as string | undefined;
      if (!oldestQuery) break;
      this.removeQuery(identity.entityCode, oldestQuery);
    }

    if (bucket.queries.size > 0) touchMapEntry(this.entities, identity.entityCode, bucket);
    while (this.entities.size > this.limits.maxEntities) {
      const oldestEntity = this.entities.keys().next().value as string | undefined;
      if (!oldestEntity) break;
      this.removeEntity(oldestEntity);
    }
    while (this.approximateBytes > this.limits.maxApproximateBytes) {
      if (!this.evictOldestQuery()) break;
    }
    const retained = bucket.queries.has(identity.queryKey);
    this.notifyChange();
    return retained;
  }

  updateScroll(identity: RuntimeListBrowserCacheIdentity, scrollY: number, now = Date.now()): boolean {
    if (!Number.isFinite(scrollY) || scrollY < 0 || identity.policy?.restoreScroll === false) return false;
    const bucket = this.entities.get(identity.entityCode);
    const entry = bucket?.queries.get(identity.queryKey);
    if (!bucket || !entry) return false;
    if (entry.descriptorHash !== identity.descriptorHash || entry.scopeFingerprint !== identity.scopeFingerprint) {
      this.removeQuery(identity.entityCode, identity.queryKey);
      return false;
    }
    const previousApproximateBytes = entry.approximateBytes;
    entry.snapshot.scrollY = Math.floor(scrollY);
    const nextApproximateBytes = estimateCacheEntryBytes(identity, entry.snapshot);
    if (!Number.isFinite(nextApproximateBytes)) {
      this.removeQuery(identity.entityCode, identity.queryKey);
      return false;
    }
    entry.approximateBytes = nextApproximateBytes;
    this.approximateBytes += nextApproximateBytes - previousApproximateBytes;
    entry.lastAccessed = now;
    touchMapEntry(bucket.queries, identity.queryKey, entry);
    bucket.lastAccessed = now;
    touchMapEntry(this.entities, identity.entityCode, bucket);
    while (this.approximateBytes > this.limits.maxApproximateBytes) {
      if (!this.evictOldestQuery()) break;
    }
    const retained = bucket.queries.has(identity.queryKey);
    this.notifyChange();
    return retained;
  }

  clear(): number {
    const removed = this.queryCount();
    this.entities.clear();
    this.approximateBytes = 0;
    if (removed > 0) this.notifyChange();
    return removed;
  }

  /** Removes all cached queries for one entity after a successful mutation. */
  invalidateEntity(entityCode: string): number {
    const bucket = this.entities.get(entityCode);
    if (!bucket) return 0;
    const invalidatedQueries = [...bucket.queries.entries()]
      .filter(([, entry]) => entry.invalidateOnMutation)
      .map(([queryKey]) => queryKey);
    for (const queryKey of invalidatedQueries) this.removeQuery(entityCode, queryKey);
    if (invalidatedQueries.length > 0) this.notifyChange();
    return invalidatedQueries.length;
  }

  evictForMemoryPressure(level: "moderate" | "critical" = "moderate"): number {
    if (level === "critical") return this.clear();

    const candidates = [...this.entities.entries()]
      .flatMap(([entityCode, bucket]) => [...bucket.queries.entries()].map(([queryKey, entry]) => ({
        entityCode,
        queryKey,
        lastAccessed: entry.lastAccessed,
      })))
      .sort((a, b) => a.lastAccessed - b.lastAccessed);
    const removeCount = Math.max(1, Math.ceil(candidates.length / 2));
    for (const candidate of candidates.slice(0, removeCount)) {
      this.removeQuery(candidate.entityCode, candidate.queryKey);
    }
    const removed = Math.min(removeCount, candidates.length);
    if (removed > 0) this.notifyChange();
    return removed;
  }

  /**
   * Session persistence is deliberately opt-in per effective metadata policy.
   * Memory-only and persistent entries never cross this boundary.
   */
  exportSessionSnapshot(): RuntimeListSessionCacheSnapshot {
    const entries: RuntimeListSessionCacheEntry[] = [];
    for (const [entityCode, bucket] of this.entities) {
      for (const [queryKey, entry] of bucket.queries) {
        if (entry.policy.storage !== "session") continue;
        entries.push({
          entityCode,
          queryKey,
          descriptorHash: entry.descriptorHash,
          scopeFingerprint: entry.scopeFingerprint,
          policy: { ...entry.policy },
          snapshot: cloneSnapshot(entry.snapshot),
          savedAt: entry.savedAt,
          lastAccessed: entry.lastAccessed,
        });
      }
    }
    entries.sort((left, right) => left.lastAccessed - right.lastAccessed);
    return { version: 1, entries };
  }

  /** Restores a previously validated, same-session snapshot under normal LRU limits. */
  hydrateSessionSnapshot(value: unknown, now = Date.now()): number {
    const snapshot = parseSessionCacheSnapshot(value);
    if (!snapshot) return 0;
    let restored = 0;
    for (const entry of snapshot.entries) {
      if (entry.policy.storage !== "session") continue;
      if (now - entry.savedAt >= entry.policy.retainForSeconds * 1_000) continue;
      if (this.write({
        entityCode: entry.entityCode,
        queryKey: entry.queryKey,
        descriptorHash: entry.descriptorHash,
        scopeFingerprint: entry.scopeFingerprint,
        policy: entry.policy,
      }, entry.snapshot, { savedAt: entry.savedAt, now })) {
        restored += 1;
      }
    }
    return restored;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  stats(): {
    entities: number;
    queries: number;
    rows: number;
    approximateBytes: number;
    maxApproximateBytes: number;
  } {
    let queries = 0;
    let rows = 0;
    for (const bucket of this.entities.values()) {
      queries += bucket.queries.size;
      for (const entry of bucket.queries.values()) rows += entry.rowCount;
    }
    return {
      entities: this.entities.size,
      queries,
      rows,
      approximateBytes: Math.max(0, this.approximateBytes),
      maxApproximateBytes: this.limits.maxApproximateBytes,
    };
  }

  private queryCount(): number {
    let count = 0;
    for (const bucket of this.entities.values()) count += bucket.queries.size;
    return count;
  }

  private removeQuery(entityCode: string, queryKey: string): void {
    const bucket = this.entities.get(entityCode);
    if (!bucket) return;
    const entry = bucket.queries.get(queryKey);
    if (!entry) return;
    this.approximateBytes -= entry.approximateBytes;
    bucket.queries.delete(queryKey);
    if (bucket.queries.size === 0) this.entities.delete(entityCode);
  }

  private removeEntity(entityCode: string): void {
    const bucket = this.entities.get(entityCode);
    if (!bucket) return;
    for (const entry of bucket.queries.values()) this.approximateBytes -= entry.approximateBytes;
    this.entities.delete(entityCode);
  }

  private evictOldestQuery(): boolean {
    const oldest = [...this.entities.entries()]
      .flatMap(([entityCode, bucket]) => [...bucket.queries.entries()].map(([queryKey, entry]) => ({
        entityCode,
        queryKey,
        lastAccessed: entry.lastAccessed,
      })))
      .sort((a, b) => a.lastAccessed - b.lastAccessed)[0];
    if (!oldest) return false;
    this.removeQuery(oldest.entityCode, oldest.queryKey);
    return true;
  }

  private notifyChange(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // Cache persistence and diagnostics must not break list interaction.
      }
    }
  }
}

export interface RuntimeListSessionCacheEntry {
  entityCode: string;
  queryKey: string;
  descriptorHash: string;
  scopeFingerprint: string;
  policy: RuntimeListCachePolicy;
  snapshot: RuntimeListCacheSnapshot;
  savedAt: number;
  lastAccessed: number;
}

export interface RuntimeListSessionCacheSnapshot {
  version: 1;
  entries: RuntimeListSessionCacheEntry[];
}

function resolvePolicy(policy: RuntimeListCachePolicy | undefined): RuntimeListCachePolicy {
  return policy ?? DEFAULT_RUNTIME_LIST_CACHE_POLICY;
}

function limitSnapshotRows(snapshot: RuntimeListCacheSnapshot, maxRows: number): RuntimeListCacheSnapshot {
  const pagesByRecency = [...snapshot.pages]
    .filter(([page, value]) => Number.isFinite(page) && Array.isArray(value.rows))
    .sort(([, a], [, b]) => b.lastAccessed - a.lastAccessed);
  const kept: RuntimeListCacheSnapshot["pages"] = [];
  let remaining = maxRows;
  for (const [page, value] of pagesByRecency) {
    if (remaining <= 0) break;
    const rows = value.rows.slice(0, remaining);
    if (rows.length === 0) continue;
    kept.push([page, { ...value, rows: [...rows] }]);
    remaining -= rows.length;
  }
  kept.sort(([a], [b]) => a - b);
  return {
    pages: kept,
    ...(snapshot.scrollY !== undefined ? { scrollY: snapshot.scrollY } : {}),
  };
}

function countSnapshotRows(snapshot: RuntimeListCacheSnapshot): number {
  return snapshot.pages.reduce((count, [, page]) => count + page.rows.length, 0);
}

function cloneSnapshot(snapshot: RuntimeListCacheSnapshot): RuntimeListCacheSnapshot {
  return {
    pages: snapshot.pages.map(([page, value]) => [page, { ...value, rows: [...value.rows] }]),
    ...(snapshot.scrollY !== undefined ? { scrollY: snapshot.scrollY } : {}),
  };
}

function estimateCacheEntryBytes(
  identity: RuntimeListBrowserCacheIdentity,
  snapshot: RuntimeListCacheSnapshot,
): number {
  try {
    // Browser JS strings are commonly represented as up to two bytes per code
    // unit. The fixed and per-row allowances account approximately for object,
    // array, map-node, and property metadata not represented in JSON text.
    const serialized = JSON.stringify(snapshot);
    const identityChars = identity.entityCode.length + identity.queryKey.length
      + identity.descriptorHash.length + identity.scopeFingerprint.length;
    const rowCount = countSnapshotRows(snapshot);
    const pageCount = snapshot.pages.length;
    return (serialized.length + identityChars) * 2
      + rowCount * 48
      + pageCount * 96
      + 256;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function touchMapEntry<K, V>(map: Map<K, V>, key: K, value: V): void {
  map.delete(key);
  map.set(key, value);
}

function boundedInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function parseSessionCacheSnapshot(value: unknown): RuntimeListSessionCacheSnapshot | null {
  if (!isRecord(value) || value["version"] !== 1 || !Array.isArray(value["entries"])) return null;
  const entries = value["entries"].flatMap((item) => {
    const parsed = parseSessionCacheEntry(item);
    return parsed ? [parsed] : [];
  });
  return { version: 1, entries };
}

function parseSessionCacheEntry(value: unknown): RuntimeListSessionCacheEntry | null {
  if (!isRecord(value)) return null;
  const entityCode = nonEmptyString(value["entityCode"]);
  const queryKey = nonEmptyString(value["queryKey"]);
  const descriptorHash = nonEmptyString(value["descriptorHash"]);
  const scopeFingerprint = nonEmptyString(value["scopeFingerprint"]);
  const policy = parseRuntimeListCachePolicy(value["policy"]);
  const snapshot = parseRuntimeListCacheSnapshot(value["snapshot"]);
  const savedAt = finiteNumber(value["savedAt"]);
  const lastAccessed = finiteNumber(value["lastAccessed"]);
  if (!entityCode || !queryKey || !descriptorHash || !scopeFingerprint || !policy || !snapshot
      || savedAt === null || lastAccessed === null) return null;
  return {
    entityCode,
    queryKey,
    descriptorHash,
    scopeFingerprint,
    policy,
    snapshot,
    savedAt,
    lastAccessed,
  };
}

function parseRuntimeListCachePolicy(value: unknown): RuntimeListCachePolicy | null {
  if (!isRecord(value)) return null;
  const mode = value["mode"];
  const prefetch = value["prefetch"];
  const storage = value["storage"];
  const source = value["source"];
  const freshForSeconds = finiteNumber(value["freshForSeconds"]);
  const retainForSeconds = finiteNumber(value["retainForSeconds"]);
  const maxQueriesPerEntity = finiteNumber(value["maxQueriesPerEntity"]);
  const maxRowsPerQuery = finiteNumber(value["maxRowsPerQuery"]);
  if (!isOneOf(mode, ["disabled", "memory", "stale_while_revalidate"])
      || !isOneOf(prefetch, ["none", "intent", "viewport", "eager"])
      || storage !== "session"
      || !isOneOf(source, ["platform", "entity_class", "entity", "tenant"])
      || freshForSeconds === null || retainForSeconds === null
      || maxQueriesPerEntity === null || maxRowsPerQuery === null
      || typeof value["restoreScroll"] !== "boolean"
      || typeof value["invalidateOnMutation"] !== "boolean") return null;
  return {
    mode,
    freshForSeconds,
    retainForSeconds,
    prefetch,
    restoreScroll: value["restoreScroll"],
    invalidateOnMutation: value["invalidateOnMutation"],
    maxQueriesPerEntity,
    maxRowsPerQuery,
    storage,
    source,
  };
}

function parseRuntimeListCacheSnapshot(value: unknown): RuntimeListCacheSnapshot | null {
  if (!isRecord(value) || !Array.isArray(value["pages"])) return null;
  const pages: RuntimeListCacheSnapshot["pages"] = [];
  for (const candidate of value["pages"]) {
    if (!Array.isArray(candidate) || candidate.length !== 2) return null;
    const page = finiteNumber(candidate[0]);
    const payload = candidate[1];
    if (page === null || !Number.isInteger(page) || page < 1 || !isRecord(payload)
        || !Array.isArray(payload["rows"])) return null;
    const rows = payload["rows"].filter(isRecord) as RuntimeRecordRow[];
    if (rows.length !== payload["rows"].length) return null;
    const savedAt = finiteNumber(payload["savedAt"]);
    const lastAccessed = finiteNumber(payload["lastAccessed"]);
    if (savedAt === null || lastAccessed === null) return null;
    const pagination = isRecord(payload["pagination"])
      ? payload["pagination"] as RuntimeListPagination
      : undefined;
    pages.push([page, { rows, savedAt, lastAccessed, ...(pagination ? { pagination } : {}) }]);
  }
  const scrollY = finiteNumber(value["scrollY"]);
  return {
    pages,
    ...(scrollY !== null && scrollY >= 0 ? { scrollY } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}
