/**
 * Timeline Cache Service Tests
 *
 * Verifies:
 *   - In-memory cache: set/get/invalidate roundtrip
 *   - TTL expiration
 *   - LRU eviction when max entries exceeded
 *   - Redis backend delegation (mock)
 *   - Partial invalidation (tenant, entity type, entity)
 *   - Cache key determinism
 *   - Date serialization roundtrip
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import { createTimelineCacheService } from "../domain/timeline-cache.service.js";

import type { ActivityTimelineEntry, TimelineQuery } from "../domain/activity-timeline.service.js";
import type { TimelineCacheBackend , TimelineCacheService} from "../domain/timeline-cache.service.js";

// ─── Test Helpers ──────────────────────────────────────────────────

function makeEntry(id: string, source = "workflow_audit"): ActivityTimelineEntry {
  return {
    id,
    source: source as any,
    tenantId: "t-1",
    eventType: "workflow.created",
    severity: "info",
    entityType: "PO",
    entityId: "po-1",
    summary: "Test event",
    occurredAt: new Date("2025-06-15T10:00:00Z"),
  };
}

function makeQuery(overrides: Partial<TimelineQuery> = {}): TimelineQuery {
  return {
    tenantId: "t-1",
    entityType: "PO",
    entityId: "po-1",
    limit: 100,
    ...overrides,
  };
}

function createMockRedis(): TimelineCacheBackend & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
    del: vi.fn(async (...keys: string[]) => {
      let count = 0;
      for (const key of keys) {
        if (store.delete(key)) count++;
      }
      return count;
    }),
    keys: vi.fn(async (pattern: string) => {
      const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
      return [...store.keys()].filter((k) => regex.test(k));
    }),
  };
}

// ─── In-Memory Cache ───────────────────────────────────────────────

describe("TimelineCacheService (in-memory)", () => {
  let cache: TimelineCacheService;

  beforeEach(() => {
    cache = createTimelineCacheService(null, { ttlSeconds: 60 });
  });

  it("should return null on cache miss", async () => {
    const result = await cache.get(makeQuery());
    expect(result).toBeNull();
  });

  it("should roundtrip set/get", async () => {
    const entries = [makeEntry("e1"), makeEntry("e2")];
    const query = makeQuery();

    await cache.set(query, entries);
    const result = await cache.get(query);

    expect(result).toHaveLength(2);
    expect(result![0].id).toBe("e1");
    expect(result![1].id).toBe("e2");
  });

  it("should preserve Date objects through cache", async () => {
    const entries = [makeEntry("e1")];
    await cache.set(makeQuery(), entries);
    const result = await cache.get(makeQuery());

    expect(result![0].occurredAt).toBeInstanceOf(Date);
    expect(result![0].occurredAt.toISOString()).toBe("2025-06-15T10:00:00.000Z");
  });

  it("should expire entries after TTL", async () => {
    cache = createTimelineCacheService(null, { ttlSeconds: 0 }); // 0s TTL = immediate expiry

    await cache.set(makeQuery(), [makeEntry("e1")]);

    // Wait a tick for expiry
    await new Promise((r) => setTimeout(r, 10));

    const result = await cache.get(makeQuery());
    expect(result).toBeNull();
  });

  it("should evict oldest when max entries exceeded", async () => {
    cache = createTimelineCacheService(null, { maxMemoryEntries: 2, ttlSeconds: 300 });

    await cache.set(makeQuery({ entityId: "po-1" }), [makeEntry("e1")]);
    await cache.set(makeQuery({ entityId: "po-2" }), [makeEntry("e2")]);
    await cache.set(makeQuery({ entityId: "po-3" }), [makeEntry("e3")]);

    expect(cache.stats.size).toBe(2);

    // First entry should be evicted
    const r1 = await cache.get(makeQuery({ entityId: "po-1" }));
    expect(r1).toBeNull();

    // Last two should exist
    const r2 = await cache.get(makeQuery({ entityId: "po-2" }));
    expect(r2).not.toBeNull();
    const r3 = await cache.get(makeQuery({ entityId: "po-3" }));
    expect(r3).not.toBeNull();
  });

  it("should invalidate by tenant", async () => {
    await cache.set(makeQuery({ tenantId: "t-1", entityId: "po-1" }), [makeEntry("e1")]);
    await cache.set(makeQuery({ tenantId: "t-1", entityId: "po-2" }), [makeEntry("e2")]);
    await cache.set(makeQuery({ tenantId: "t-2", entityId: "po-1" }), [makeEntry("e3")]);

    const deleted = await cache.invalidate("t-1");
    expect(deleted).toBe(2);

    // t-1 entries gone
    expect(await cache.get(makeQuery({ tenantId: "t-1", entityId: "po-1" }))).toBeNull();
    // t-2 entry still exists
    expect(await cache.get(makeQuery({ tenantId: "t-2", entityId: "po-1" }))).not.toBeNull();
  });

  it("should invalidate by entity type", async () => {
    await cache.set(makeQuery({ entityType: "PO", entityId: "po-1" }), [makeEntry("e1")]);
    await cache.set(makeQuery({ entityType: "SO", entityId: "so-1" }), [makeEntry("e2")]);

    await cache.invalidate("t-1", "PO");

    expect(await cache.get(makeQuery({ entityType: "PO", entityId: "po-1" }))).toBeNull();
    expect(await cache.get(makeQuery({ entityType: "SO", entityId: "so-1" }))).not.toBeNull();
  });

  it("should invalidate by specific entity", async () => {
    await cache.set(makeQuery({ entityId: "po-1" }), [makeEntry("e1")]);
    await cache.set(makeQuery({ entityId: "po-2" }), [makeEntry("e2")]);

    await cache.invalidate("t-1", "PO", "po-1");

    expect(await cache.get(makeQuery({ entityId: "po-1" }))).toBeNull();
    expect(await cache.get(makeQuery({ entityId: "po-2" }))).not.toBeNull();
  });

  it("should clear all entries", async () => {
    await cache.set(makeQuery({ entityId: "po-1" }), [makeEntry("e1")]);
    await cache.set(makeQuery({ entityId: "po-2" }), [makeEntry("e2")]);

    await cache.clear();
    expect(cache.stats.size).toBe(0);
  });

  it("should report memory backend in stats", () => {
    expect(cache.stats.backend).toBe("memory");
  });
});

// ─── Redis Cache ───────────────────────────────────────────────────

describe("TimelineCacheService (Redis)", () => {
  let redis: ReturnType<typeof createMockRedis>;
  let cache: TimelineCacheService;

  beforeEach(() => {
    redis = createMockRedis();
    cache = createTimelineCacheService(redis, { ttlSeconds: 60 });
  });

  it("should delegate get to Redis", async () => {
    await cache.get(makeQuery());
    expect(redis.get).toHaveBeenCalledTimes(1);
  });

  it("should delegate set to Redis with TTL", async () => {
    await cache.set(makeQuery(), [makeEntry("e1")]);
    expect(redis.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "EX",
      60,
    );
  });

  it("should roundtrip through Redis", async () => {
    const entries = [makeEntry("e1")];
    await cache.set(makeQuery(), entries);
    const result = await cache.get(makeQuery());

    expect(result).toHaveLength(1);
    expect(result![0].id).toBe("e1");
  });

  it("should invalidate via Redis KEYS + DEL", async () => {
    await cache.set(makeQuery({ entityId: "po-1" }), [makeEntry("e1")]);
    await cache.set(makeQuery({ entityId: "po-2" }), [makeEntry("e2")]);

    await cache.invalidate("t-1");

    expect(redis.keys).toHaveBeenCalled();
    expect(redis.del).toHaveBeenCalled();
  });

  it("should report redis backend in stats", () => {
    expect(cache.stats.backend).toBe("redis");
  });
});

// ─── Cache Key Determinism ─────────────────────────────────────────

describe("Cache Key Determinism", () => {
  it("should produce same key for same query params", async () => {
    const cache = createTimelineCacheService(null);
    const q1 = makeQuery({ startDate: new Date("2025-06-01"), endDate: new Date("2025-06-30") });
    const q2 = makeQuery({ startDate: new Date("2025-06-01"), endDate: new Date("2025-06-30") });

    await cache.set(q1, [makeEntry("e1")]);
    const result = await cache.get(q2);
    expect(result).not.toBeNull();
  });

  it("should produce different keys for different query params", async () => {
    const cache = createTimelineCacheService(null);
    const q1 = makeQuery({ entityId: "po-1" });
    const q2 = makeQuery({ entityId: "po-2" });

    await cache.set(q1, [makeEntry("e1")]);
    const result = await cache.get(q2);
    expect(result).toBeNull();
  });
});
