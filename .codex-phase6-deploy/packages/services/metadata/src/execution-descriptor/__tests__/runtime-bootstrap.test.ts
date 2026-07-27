import { describe, expect, it, vi } from "vitest";

import {
  projectRuntimeBootstrapPermissions,
  RuntimeBootstrapProvider,
  type RuntimeBootstrapPayload,
  type RuntimeBootstrapRedis,
} from "../../../routes/runtime-bootstrap.route.js";
import { executionDescriptorGenerationKey } from "../provider.js";

const IDENTITY = { plane: "neon", tenantId: "tenant-a", entityCode: "purchase_order" } as const;

class MemoryRedis implements RuntimeBootstrapRedis {
  readonly values = new Map<string, string>();
  readonly mget = vi.fn(async (...keys: string[]) => keys.map((key) => this.values.get(key) ?? null));
  readonly set = vi.fn(async (key: string, value: string) => { this.values.set(key, value); });
}

describe("RuntimeBootstrapProvider", () => {
  it("uses one Redis round trip and zero L3 loads on a warm L1 request", async () => {
    const redis = new MemoryRedis();
    const load = vi.fn(async () => source("purchase_order"));
    const provider = new RuntimeBootstrapProvider({ redis, load });
    await provider.get(IDENTITY);
    redis.mget.mockClear(); redis.set.mockClear();

    const warm = await provider.get(IDENTITY);

    expect(warm.cacheState).toBe("L1");
    expect(redis.mget).toHaveBeenCalledTimes(1);
    expect(redis.set).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("hydrates principal-agnostic L2 in a fresh process", async () => {
    const redis = new MemoryRedis();
    await new RuntimeBootstrapProvider({ redis, load: async () => source("purchase_order") }).get(IDENTITY);
    const load = vi.fn(async () => source("wrong"));
    redis.mget.mockClear();

    const result = await new RuntimeBootstrapProvider({ redis, load }).get(IDENTITY);

    expect(result.cacheState).toBe("L2");
    expect(result.payload.entityCode).toBe("purchase_order");
    expect(redis.mget).toHaveBeenCalledTimes(1);
    expect(load).not.toHaveBeenCalled();
  });

  it("single-flights concurrent cold bootstrap assembly", async () => {
    const redis = new MemoryRedis();
    const load = vi.fn(async () => source("purchase_order"));
    const provider = new RuntimeBootstrapProvider({ redis, load });
    await Promise.all(Array.from({ length: 100 }, () => provider.get(IDENTITY)));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("observes exact descriptor generation changes", async () => {
    const redis = new MemoryRedis();
    let version = 1;
    const load = vi.fn(async () => ({ ...source("purchase_order"), schemaVersion: 1 as const, policy: { version } }));
    const provider = new RuntimeBootstrapProvider({ redis, load });
    const first = await provider.get(IDENTITY);
    version = 2;
    redis.values.set(executionDescriptorGenerationKey("neon", "tenant-a", "purchase_order"), "1");
    const second = await provider.get(IDENTITY);
    expect(second.payload.bootstrapHash).not.toBe(first.payload.bootstrapHash);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("falls back to the authoritative L3 payload when Redis fill is unavailable", async () => {
    const redis = {
      mget: async (...keys: string[]) => keys.map((key) => key.includes("generation") ? "1" : null),
      set: async () => { throw new Error("redis unavailable"); },
    };
    const provider = new RuntimeBootstrapProvider({
      redis,
      load: async () => ({
        schemaVersion: 1,
        entityCode: "master",
        compiledEntity: { entity_code: "master" },
        operations: [],
        policy: null,
        lifecycleStateMasks: [],
        permissionAliases: {},
        childProjections: [],
      }),
    });
    const result = await provider.get({ plane: "neon", tenantId: "tenant", entityCode: "master" });
    expect(result.cacheState).toBe("L3_REDIS_DEGRADED");
    expect(result.payload.entityCode).toBe("master");
  });

  it("keeps L1 within its configured heap bound", async () => {
    const redis = new MemoryRedis();
    const provider = new RuntimeBootstrapProvider({
      redis, l1Limit: 2, load: async (identity) => source(identity.entityCode),
    });
    await provider.get({ ...IDENTITY, entityCode: "one" });
    await provider.get({ ...IDENTITY, entityCode: "two" });
    await provider.get({ ...IDENTITY, entityCode: "three" });
    expect(provider.size).toBe(2);
  });
});

describe("runtime bootstrap permission projection", () => {
  it("filters root and child operations without changing the principal-agnostic hash", () => {
    const payload = { ...source("purchase_order"), bootstrapHash: "base-hash" } satisfies RuntimeBootstrapPayload;
    const projected = projectRuntimeBootstrapPermissions(payload, {
      allowed: new Set(["purchase_order.read", "line.read"]), denied: new Set(),
    });
    expect(projected.operations.map((item) => item["permission_code"])).toEqual(["purchase_order.read"]);
    expect(projected.childProjections[0]?.operations.map((item) => item["permission_code"])).toEqual(["line.read"]);
    expect(projected.bootstrapHash).toBe("base-hash");
    expect(payload.operations).toHaveLength(2);
  });

  it("keeps Mesh operations deny-by-default behind permission and handler authority", () => {
    const payload = {
      ...source("purchase_order"),
      bootstrapHash: "mesh-hash",
      operations: [
        operation("purchase_order.read", "API", "/api/mesh/documents/read"),
        operation("purchase_order.update", "API", "/api/records/purchase_order"),
        operation("purchase_order.navigate", "NAVIGATE", "/app/purchase_order"),
      ],
    } satisfies RuntimeBootstrapPayload;

    const projected = projectRuntimeBootstrapPermissions(payload, {
      allowed: new Set([
        "purchase_order.read",
        "purchase_order.update",
        "purchase_order.navigate",
      ]),
      denied: new Set(),
    }, "mesh");

    expect(projected.operations.map((item) => item["permission_code"])).toEqual([
      "purchase_order.read",
      "purchase_order.navigate",
    ]);
    expect(projected.operations.every((item) => item["permission_decision"] === "allow")).toBe(true);
  });

  it("emits no Mesh operation when request permission context is absent", () => {
    const payload = {
      ...source("purchase_order"),
      bootstrapHash: "mesh-hash",
      operations: [operation("purchase_order.read", "API", "/api/mesh/documents/read")],
    } satisfies RuntimeBootstrapPayload;
    const projected = projectRuntimeBootstrapPermissions(payload, undefined, "mesh");
    expect(projected.operations).toEqual([]);
    expect(projected.effectiveSurfaceIds).toEqual([]);
    expect(projected.effectiveFieldIds).toEqual([]);
  });
});

function source(entityCode: string): Omit<RuntimeBootstrapPayload, "bootstrapHash"> {
  return {
    schemaVersion: 1,
    entityCode,
    compiledEntity: { entity_code: entityCode, fields: [], relations: [] },
    operations: [operation("purchase_order.read"), operation("purchase_order.update")],
    policy: null,
    lifecycleStateMasks: [],
    permissionAliases: {},
    childProjections: [{
      relationName: "lines", entityCode: "purchase_order_line", descriptorHash: "child-hash",
      compiledEntity: { entity_code: "purchase_order_line", fields: [], relations: [] },
      operations: [operation("line.read"), operation("line.update")],
      policy: null, lifecycleStateMasks: [],
    }],
  };
}

function operation(
  permissionCode: string,
  handlerType = "API",
  handlerTarget = "/api/mesh/runtime/read",
): Record<string, unknown> {
  return {
    permission_code: permissionCode,
    is_enabled: true,
    handler_type: handlerType,
    handler_target: handlerTarget,
  };
}
