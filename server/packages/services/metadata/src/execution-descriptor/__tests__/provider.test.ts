import { describe, expect, it, vi } from "vitest";

import type { SerializedExecutionDescriptorV1 } from "../contract.js";
import {
  ExecutionDescriptorProvider,
  executionDescriptorGenerationKey,
  type ExecutionDescriptorRedis,
} from "../provider.js";

const IDENTITY = { plane: "neon", tenantId: "tenant-a", entityCode: "purchase_order" } as const;

class MemoryRedis implements ExecutionDescriptorRedis {
  readonly values = new Map<string, string>();
  fail = false;
  delay?: Promise<void>;
  async get(key: string): Promise<string | null> {
    if (this.fail) throw new Error("redis unavailable");
    await this.delay;
    return this.values.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    if (this.fail) throw new Error("redis unavailable");
    this.values.set(key, value);
  }
}

describe("ExecutionDescriptorProvider", () => {
  it("single-flights 100 concurrent cold requests into one L3 execution", async () => {
    const redis = new MemoryRedis();
    const load = vi.fn(async () => descriptor("a"));
    const provider = new ExecutionDescriptorProvider({ redis, loadFromL3: load });

    const results = await Promise.all(Array.from({ length: 100 }, () => provider.get(IDENTITY)));

    expect(load).toHaveBeenCalledTimes(1);
    expect(results.every((item) => item.descriptor.identity.compiledHash === "a".repeat(64))).toBe(true);
    expect(provider.size).toBe(1);
  });

  it("serves L1 without invoking L3 and shares a request-local L0 promise", async () => {
    const redis = new MemoryRedis();
    const load = vi.fn(async () => descriptor("a"));
    const provider = new ExecutionDescriptorProvider({ redis, loadFromL3: load });
    await provider.get(IDENTITY);
    expect((await provider.get(IDENTITY)).cacheState).toBe("L1");

    const memo = new Map();
    await provider.get(IDENTITY, memo);
    expect((await provider.get(IDENTITY, memo)).cacheState).toBe("L0");
    expect(load).toHaveBeenCalledTimes(1);
    expect(provider.stats).toMatchObject({ l0Hits: 1, l1Hits: 2, l3Loads: 1 });
  });

  it("bounds generation reads for repeated L1 hits", async () => {
    const redis = new MemoryRedis();
    const get = vi.spyOn(redis, "get");
    const provider = new ExecutionDescriptorProvider({ redis, generationCacheTtlMs: 60_000, loadFromL3: async () => descriptor("a") });
    await provider.get(IDENTITY);
    get.mockClear();
    await provider.get(IDENTITY);
    await provider.get(IDENTITY);
    expect(get).not.toHaveBeenCalled();
  });

  it("applies exact invalidation to local generation and descriptor state", async () => {
    const redis = new MemoryRedis();
    const load = vi.fn(async () => descriptor("a"));
    const provider = new ExecutionDescriptorProvider({ redis, loadFromL3: load });
    await provider.get(IDENTITY);
    provider.applyInvalidation({ plane: "neon", tenantId: "tenant-a", entityCode: "purchase_order" });
    redis.values.set(executionDescriptorGenerationKey("neon", "tenant-a", "purchase_order"), "1");
    const result = await provider.get(IDENTITY);
    expect(result.cacheState).toBe("L3");
    expect(provider.stats.invalidations).toBe(1);
  });

  it("hydrates a content-addressed L2 payload in a fresh process provider", async () => {
    const redis = new MemoryRedis();
    const firstLoad = vi.fn(async () => descriptor("a"));
    await new ExecutionDescriptorProvider({ redis, loadFromL3: firstLoad }).get(IDENTITY);
    const secondLoad = vi.fn(async () => descriptor("b"));

    const result = await new ExecutionDescriptorProvider({ redis, loadFromL3: secondLoad }).get(IDENTITY);

    expect(result.cacheState).toBe("L2");
    expect(result.descriptor.identity.compiledHash).toBe("a".repeat(64));
    expect(secondLoad).not.toHaveBeenCalled();
  });

  it("observes an exact generation increment and does not serve the old L1", async () => {
    const redis = new MemoryRedis();
    let version = "a";
    const load = vi.fn(async () => descriptor(version));
    const provider = new ExecutionDescriptorProvider({ redis, loadFromL3: load });
    await provider.get(IDENTITY);
    version = "b";
    redis.values.set(executionDescriptorGenerationKey("neon", "tenant-a", "purchase_order"), "1");

    const result = await provider.get(IDENTITY);

    expect(result.cacheState).toBe("L3");
    expect(result.descriptor.identity.compiledHash).toBe("b".repeat(64));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("rejects a stale fill when generation changes during L3 loading", async () => {
    const redis = new MemoryRedis();
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    let calls = 0;
    const load = vi.fn(async () => {
      calls += 1;
      if (calls === 1) await barrier;
      return descriptor(calls === 1 ? "a" : "b");
    });
    const provider = new ExecutionDescriptorProvider({ redis, loadFromL3: load });
    const pending = provider.get(IDENTITY);
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    redis.values.set(executionDescriptorGenerationKey("neon", "tenant-a", "purchase_order"), "1");
    release();

    const result = await pending;

    expect(load).toHaveBeenCalledTimes(2);
    expect(result.descriptor.identity.compiledHash).toBe("b".repeat(64));
    expect(result.generation.endsWith(".1")).toBe(true);
  });

  it("degrades to isolated L3 loads during Redis loss without retaining shared entries", async () => {
    const redis = new MemoryRedis();
    redis.fail = true;
    const load = vi.fn(async (identity: typeof IDENTITY) => descriptor(identity.tenantId === "tenant-a" ? "a" : "b"));
    const provider = new ExecutionDescriptorProvider({ redis, loadFromL3: load });

    const first = await provider.get(IDENTITY);
    const second = await provider.get({ ...IDENTITY, tenantId: "tenant-b" });
    await provider.get(IDENTITY);

    expect(first.cacheState).toBe("L3_REDIS_DEGRADED");
    expect(second.descriptor.identity.compiledHash).toBe("b".repeat(64));
    expect(load).toHaveBeenCalledTimes(3);
    expect(provider.size).toBe(0);
  });

  it("bounds L1 entries", async () => {
    const redis = new MemoryRedis();
    const provider = new ExecutionDescriptorProvider({
      redis,
      l1Limit: 2,
      loadFromL3: async (identity) => descriptor(identity.entityCode === "one" ? "a" : identity.entityCode === "two" ? "b" : "c"),
    });
    await provider.get({ ...IDENTITY, entityCode: "one" });
    await provider.get({ ...IDENTITY, entityCode: "two" });
    await provider.get({ ...IDENTITY, entityCode: "three" });
    expect(provider.size).toBe(2);
    expect(provider.stats.evictions).toBe(1);
  });

  it("isolates the same entity and tenant across Neon, Mesh, and Admin planes", async () => {
    const redis = new MemoryRedis();
    const load = vi.fn(async (identity: typeof IDENTITY) => descriptor(
      identity.plane === "neon" ? "a" : identity.plane === "mesh" ? "b" : "c",
    ));
    const provider = new ExecutionDescriptorProvider({ redis, loadFromL3: load });
    const results = await Promise.all((["neon", "mesh", "admin"] as const).map((plane) =>
      provider.get({ ...IDENTITY, plane })));
    expect(results.map((result) => result.descriptor.identity.compiledHash[0])).toEqual(["a", "b", "c"]);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("single-flights while Redis is slow and resumes normal L2 fills after reconnect and flush", async () => {
    const redis = new MemoryRedis();
    let release!: () => void;
    redis.delay = new Promise<void>((resolve) => { release = resolve; });
    const load = vi.fn(async () => descriptor("a"));
    const provider = new ExecutionDescriptorProvider({ redis, loadFromL3: load });
    const pending = Promise.all(Array.from({ length: 20 }, () => provider.get(IDENTITY)));
    release();
    await pending;
    expect(load).toHaveBeenCalledOnce();

    redis.fail = true;
    const degraded = new ExecutionDescriptorProvider({ redis, loadFromL3: async () => descriptor("b") });
    expect((await degraded.get(IDENTITY)).cacheState).toBe("L3_REDIS_DEGRADED");
    redis.fail = false;
    redis.delay = undefined;
    redis.values.clear();
    expect((await degraded.get(IDENTITY)).cacheState).toBe("L3");
    expect((await new ExecutionDescriptorProvider({ redis, loadFromL3: async () => descriptor("c") }).get(IDENTITY)).cacheState).toBe("L2");
  });
});

function descriptor(hashCharacter: string): SerializedExecutionDescriptorV1 {
  return {
    schemaVersion: 1,
    identity: {
      entityCode: "purchase_order",
      entityVersionId: "version-1",
      versionHash: "version-hash",
      compiledHash: hashCharacter.repeat(64),
      entityClass: "DOCUMENT",
    },
    storage: {
      schema: "document", table: "purchase_order", primaryKey: "id", tenantColumn: "tenant_id", backingType: "table",
    },
    fields: [
      field("id"), field("tenant_id"),
    ],
    read: {
      projection: ["id", "tenant_id"], searchableFields: [], filterableFields: [],
      defaultSort: [{ field: "id", direction: "asc", nulls: "last" }], stableTieBreaker: "id", naturalKeyFields: [],
    },
    write: {
      create: { mode: "FORM_ONLY", idempotencyRequired: false, numberingStrategy: "none" },
      mutations: {
        create: { enabled: true, kind: "generic" },
        update: { enabled: true, kind: "generic" },
        delete: { enabled: true, kind: "generic" },
      },
      arrayFields: [], jsonFields: [],
      concurrency: { strategy: "none", rollout: "observe", lockRequired: false },
      deletionMode: "hard_delete",
    },
    relations: [],
    policy: {
      governanceLevel: "standard", securityTier: "internal", mutability: "mutable", dataPolicy: {}, degradedFeatures: [],
    },
    handlers: { collectionHandlers: [], domainHooks: [] },
  };
}

function field(name: string): SerializedExecutionDescriptorV1["fields"][number] {
  return {
    name, column: name, dataType: "uuid", coercion: "scalar", required: true,
    searchable: false, filterable: false, sortable: true, computed: false,
    readOnly: false, writeOnce: false, systemManaged: false,
    createWritable: true, updateWritable: true, createRequired: true, editableInStatuses: [],
  };
}
