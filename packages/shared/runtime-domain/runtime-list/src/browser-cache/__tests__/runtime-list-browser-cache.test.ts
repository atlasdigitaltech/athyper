import { describe, expect, it } from "vitest";

import { buildRuntimeListBrowserCacheKey, normalizeRuntimeListQuery } from "../../core/lazy-list";
import {
  DEFAULT_RUNTIME_LIST_CACHE_POLICY,
  DEFAULT_RUNTIME_LIST_BROWSER_CACHE_LIMITS,
  RuntimeListBrowserCache,
  type RuntimeListBrowserCacheIdentity,
  type RuntimeListCacheSnapshot,
} from "../runtime-list-browser-cache";

function identity(
  entityCode = "journal_entry",
  queryKey = "query-1",
): RuntimeListBrowserCacheIdentity {
  return {
    entityCode,
    queryKey,
    descriptorHash: "descriptor-v1",
    scopeFingerprint: "scope-v1",
    policy: DEFAULT_RUNTIME_LIST_CACHE_POLICY,
  };
}

function snapshot(rowCount: number, at = 1_000): RuntimeListCacheSnapshot {
  return {
    pages: [[1, {
      rows: Array.from({ length: rowCount }, (_, index) => ({ id: String(index + 1) })),
      savedAt: at,
      lastAccessed: at,
    }]],
  };
}

describe("runtime-list query normalization", () => {
  it("produces one key for equivalent query objects", () => {
    const first = buildRuntimeListBrowserCacheKey("Journal-Entry", {
      q: "  posted   journal ",
      sort: "posted_at:desc",
      "filter.status": ["posted", "draft"],
      page: "4",
      view: "compact",
    }, 20);
    const second = buildRuntimeListBrowserCacheKey("journal_entry", {
      "filter.status": ["draft", "posted"],
      sort: "posted_at:desc",
      q: "posted journal",
      page: "1",
      view: "list",
    }, 20);

    expect(first).toBe(second);
    expect(normalizeRuntimeListQuery({ q: "  posted   journal " })).toBe("q=posted%20journal");
  });
});

describe("RuntimeListBrowserCache", () => {
  it("evaluates fresh, stale, and expired windows", () => {
    const cache = new RuntimeListBrowserCache();
    const scopedIdentity = {
      ...identity(),
      policy: {
        ...DEFAULT_RUNTIME_LIST_CACHE_POLICY,
        freshForSeconds: 10,
        retainForSeconds: 30,
      },
    };
    cache.write(scopedIdentity, snapshot(2, 1_000), { savedAt: 1_000, now: 1_000 });

    expect(cache.read(scopedIdentity, 9_000).state).toBe("fresh");
    expect(cache.read(scopedIdentity, 15_000).state).toBe("stale");
    expect(cache.read(scopedIdentity, 31_000).state).toBe("expired");
    expect(cache.stats()).toMatchObject({
      entities: 0,
      queries: 0,
      rows: 0,
      approximateBytes: 0,
    });
  });

  it("invalidates descriptor and scope mismatches", () => {
    const cache = new RuntimeListBrowserCache();
    cache.write(identity(), snapshot(2), { now: 1_000, savedAt: 1_000 });
    cache.write(identity("purchase_order"), snapshot(1), { now: 1_000, savedAt: 1_000 });
    expect(cache.read({ ...identity(), descriptorHash: "descriptor-v2" }, 2_000).state)
      .toBe("invalid_descriptor");
    expect(cache.stats().queries).toBe(0);

    cache.write(identity(), snapshot(2), { now: 2_000, savedAt: 2_000 });
    expect(cache.read({ ...identity(), scopeFingerprint: "scope-v2" }, 3_000).state)
      .toBe("invalid_scope");
  });

  it("clears every entity when a newly active descriptor hash changes", () => {
    const cache = new RuntimeListBrowserCache();
    cache.write(identity("journal_entry"), snapshot(1), { now: 1_000 });
    cache.write(identity("purchase_order"), snapshot(1), { now: 1_000 });

    expect(cache.activateDescriptor("journal_entry", "descriptor-v2")).toBe(true);
    expect(cache.stats()).toMatchObject({ entities: 0, queries: 0 });
  });

  it("invalidates an entity after mutation while respecting cache policy", () => {
    const cache = new RuntimeListBrowserCache();
    cache.write(identity("journal_entry", "q1"), snapshot(1), { now: 1_000 });
    cache.write({
      ...identity("journal_entry", "q2"),
      policy: { ...DEFAULT_RUNTIME_LIST_CACHE_POLICY, invalidateOnMutation: false },
    }, snapshot(1), { now: 1_000 });
    cache.write(identity("purchase_order", "q1"), snapshot(1), { now: 1_000 });

    expect(cache.invalidateEntity("journal_entry")).toBe(1);
    expect(cache.read(identity("journal_entry", "q1"), 2_000).state).toBe("miss");
    expect(cache.read({
      ...identity("journal_entry", "q2"),
      policy: { ...DEFAULT_RUNTIME_LIST_CACHE_POLICY, invalidateOnMutation: false },
    }, 2_000).state).toBe("fresh");
    expect(cache.read(identity("purchase_order", "q1"), 2_000).state).toBe("fresh");
  });

  it("enforces entity, query, and row LRU bounds", () => {
    const cache = new RuntimeListBrowserCache({
      maxEntities: 2,
      maxQueriesPerEntity: 2,
      maxRowsPerQuery: 3,
    });
    cache.write(identity("entity-1", "q1"), snapshot(8), { now: 1_000 });
    cache.write(identity("entity-1", "q2"), snapshot(2), { now: 2_000 });
    cache.write(identity("entity-1", "q3"), snapshot(2), { now: 3_000 });
    expect(cache.read(identity("entity-1", "q1"), 3_100).state).toBe("miss");
    expect(cache.read(identity("entity-1", "q3"), 3_100).snapshot?.pages[0]?.[1].rows).toHaveLength(2);

    cache.write(identity("entity-2", "q1"), snapshot(1), { now: 4_000 });
    cache.write(identity("entity-3", "q1"), snapshot(1), { now: 5_000 });
    expect(cache.stats().entities).toBe(2);
    expect(cache.read(identity("entity-1", "q2"), 5_100).state).toBe("miss");

    const rowBoundCache = new RuntimeListBrowserCache({ maxRowsPerQuery: 3 });
    rowBoundCache.write(identity(), snapshot(8), { now: 1_000 });
    expect(rowBoundCache.read(identity(), 2_000).snapshot?.pages[0]?.[1].rows).toHaveLength(3);
  });

  it("evicts least-recently-used queries under memory pressure", () => {
    const cache = new RuntimeListBrowserCache();
    cache.write(identity("entity-1", "q1"), snapshot(1), { now: 1_000 });
    cache.write(identity("entity-1", "q2"), snapshot(1), { now: 2_000 });
    cache.write(identity("entity-2", "q1"), snapshot(1), { now: 3_000 });
    cache.write(identity("entity-2", "q2"), snapshot(1), { now: 4_000 });

    expect(cache.evictForMemoryPressure("moderate")).toBe(2);
    expect(cache.stats().queries).toBe(2);
    expect(cache.read(identity("entity-1", "q1"), 5_000).state).toBe("miss");
    expect(cache.evictForMemoryPressure("critical")).toBe(2);
    expect(cache.stats().queries).toBe(0);
  });

  it("enforces a global approximate byte ceiling with LRU eviction", () => {
    expect(DEFAULT_RUNTIME_LIST_BROWSER_CACHE_LIMITS.maxApproximateBytes).toBe(16 * 1024 * 1024);
    const maxApproximateBytes = 2_500;
    const cache = new RuntimeListBrowserCache({ maxApproximateBytes });
    const largeSnapshot = (id: string): RuntimeListCacheSnapshot => ({
      pages: [[1, {
        rows: [{ id, payload: "x".repeat(500) }],
        savedAt: 1_000,
        lastAccessed: 1_000,
      }]],
    });

    expect(cache.write(identity("entity-1", "q1"), largeSnapshot("1"), { now: 1_000 })).toBe(true);
    expect(cache.write(identity("entity-2", "q1"), largeSnapshot("2"), { now: 2_000 })).toBe(true);

    expect(cache.stats().approximateBytes).toBeLessThanOrEqual(maxApproximateBytes);
    expect(cache.stats().maxApproximateBytes).toBe(maxApproximateBytes);
    expect(cache.read(identity("entity-1", "q1"), 2_100).state).toBe("miss");
    expect(cache.read(identity("entity-2", "q1"), 2_100).state).toBe("fresh");
  });

  it("exports and restores only metadata-authorized session entries", () => {
    const cache = new RuntimeListBrowserCache();
    cache.write(identity("memory_entity"), snapshot(1, 1_000), { savedAt: 1_000, now: 1_000 });
    const sessionIdentity = {
      ...identity("journal_entry"),
      policy: { ...DEFAULT_RUNTIME_LIST_CACHE_POLICY, storage: "session" as const },
    };
    cache.write(sessionIdentity, snapshot(2, 1_000), { savedAt: 1_000, now: 1_000 });

    const persisted = cache.exportSessionSnapshot();
    expect(persisted.entries).toHaveLength(1);
    expect(persisted.entries[0]?.entityCode).toBe("journal_entry");

    const restored = new RuntimeListBrowserCache();
    expect(restored.hydrateSessionSnapshot(persisted, 2_000)).toBe(1);
    expect(restored.read(sessionIdentity, 2_000)).toMatchObject({ state: "fresh" });
    expect(restored.read(identity("memory_entity"), 2_000).state).toBe("miss");
  });

  it("rejects expired, malformed, and non-session persisted entries", () => {
    const cache = new RuntimeListBrowserCache();
    const sessionIdentity = {
      ...identity(),
      policy: {
        ...DEFAULT_RUNTIME_LIST_CACHE_POLICY,
        storage: "session" as const,
        retainForSeconds: 10,
      },
    };
    cache.write(sessionIdentity, snapshot(1, 1_000), { savedAt: 1_000, now: 1_000 });
    const persisted = cache.exportSessionSnapshot();

    expect(new RuntimeListBrowserCache().hydrateSessionSnapshot(persisted, 11_000)).toBe(0);
    expect(new RuntimeListBrowserCache().hydrateSessionSnapshot({ version: 2, entries: [] })).toBe(0);
    expect(new RuntimeListBrowserCache().hydrateSessionSnapshot({
      ...persisted,
      entries: [{ ...persisted.entries[0], policy: DEFAULT_RUNTIME_LIST_CACHE_POLICY }],
    }, 2_000)).toBe(0);
  });
});
