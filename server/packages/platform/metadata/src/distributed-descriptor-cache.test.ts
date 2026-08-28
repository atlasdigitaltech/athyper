import { describe, expect, it, vi } from "vitest";
import type { EntityDescriptorCoordinate, EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { createDistributedDescriptorCache, type DistributedDescriptorCacheStore } from "./distributed-descriptor-cache.js";

const coordinate: EntityDescriptorCoordinate = { planeKey: "neon", tenantId: "tenant-1", principalId: "principal-1", entityCode: "business_partner" };
const descriptor: EntityRuntimeDescriptor = {
  schema: "athyper.entity-runtime-descriptor/1.0",
  entityCode: "business_partner",
  planeKey: "neon",
  releaseId: "release-1",
  releaseNo: 1,
  contractHash: "a".repeat(64),
  compiledHash: "b".repeat(64),
  storage: { schema: "master", object: "business_partner", idField: "id", tenantField: "tenant_id" },
  fields: [{ key: "code", storagePath: "code", type: "string", required: true, writableOn: [], searchable: true }],
  operations: { read: { code: "read", permissionCode: "partner.read" } },
};

describe("distributed descriptor cache", () => {
  it("uses generation-bound keys and validates cached descriptors", async () => {
    const values = new Map<string, string>();
    const store: DistributedDescriptorCacheStore = {
      get: vi.fn(async (key) => values.get(key) ?? null),
      set: vi.fn(async (key, value) => { values.set(key, value); return true; }),
      delete: vi.fn(async (key) => Number(values.delete(key))),
    };
    const cache = createDistributedDescriptorCache(store);

    await cache.set(coordinate, descriptor, 60_000);
    await expect(cache.get(coordinate)).resolves.toMatchObject({ entityCode: "business_partner", planeKey: "neon" });

    values.set("invalidation:{metadata:neon:tenant-1:business_partner}:generation", "1");
    await expect(cache.get(coordinate)).resolves.toBeUndefined();
  });

  it("fails open when cached content is corrupt", async () => {
    const store: DistributedDescriptorCacheStore = {
      get: vi.fn(async (key) => key.includes(":generation") ? null : "{not-json"),
      set: vi.fn(async () => true),
      delete: vi.fn(async () => 0),
    };
    await expect(createDistributedDescriptorCache(store).get(coordinate)).resolves.toBeUndefined();
  });
});
