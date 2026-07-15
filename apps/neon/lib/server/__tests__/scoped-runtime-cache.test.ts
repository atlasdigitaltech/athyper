import { describe, expect, it } from "vitest";

import {
  ScopedRuntimeCache,
  type RuntimeCacheIdentity,
} from "../scoped-runtime-cache";

const baseIdentity: RuntimeCacheIdentity = {
  tenant: "tenant-1",
  plane: "neon",
  realm: "athyper",
  entity: "purchase_order",
  principal: "principal-1",
  permissionStamp: "stamp-1",
};

describe("ScopedRuntimeCache", () => {
  it("invalidates published entity metadata immediately without touching siblings", () => {
    const cache = createCache();
    cache.set("old", "old-hash", baseIdentity, 0);
    cache.set("sibling", "sibling-hash", { ...baseIdentity, entity: "supplier" }, 0);

    cache.invalidate({ tenant: "tenant-1", entity: "purchase_order", reason: "metadata_publication" }, 1);

    expect(cache.get("old")).toBeUndefined();
    expect(cache.get("sibling")).toBe("sibling-hash");
  });

  it("invalidates lifecycle capabilities through the same entity scope", () => {
    const cache = createCache();
    cache.set("descriptor", "can-edit", baseIdentity, 0);
    cache.invalidate({ tenant: "tenant-1", entity: "purchase_order", reason: "lifecycle_publication" }, 2);
    expect(cache.get("descriptor")).toBeUndefined();
  });

  it("isolates permission changes by effective principal and stamp", () => {
    const cache = createCache();
    cache.set("p1", "one", baseIdentity, 0);
    cache.set("p2", "two", { ...baseIdentity, principal: "principal-2", permissionStamp: "stamp-2" }, 0);
    cache.invalidate({ tenant: "tenant-1", principal: "principal-1", permissionStamp: "stamp-1", reason: "permission_change" }, 3);
    expect(cache.get("p1")).toBeUndefined();
    expect(cache.get("p2")).toBe("two");
  });

  it("discards the previous tenant scope on organization switch", () => {
    const cache = createCache();
    cache.set("old-org", "old", baseIdentity, 0);
    cache.set("new-org", "new", { ...baseIdentity, tenant: "tenant-2" }, 0);
    cache.invalidate({ tenant: "tenant-1", principal: "principal-1", reason: "tenant_switch" }, 4);
    expect(cache.get("old-org")).toBeUndefined();
    expect(cache.get("new-org")).toBe("new");
  });

  it("applies one distributed event to every replica", () => {
    const replicas = [createCache(), createCache()];
    for (const cache of replicas) cache.set("descriptor", "old", baseIdentity, 0);
    for (const cache of replicas) cache.invalidate({ entity: "purchase_order", reason: "metadata_publication" }, 5);
    expect(replicas.every((cache) => cache.get("descriptor") === undefined)).toBe(true);
  });

  it("rejects a stale write that started before an invalidation event", () => {
    const cache = createCache();
    const generationAtFetchStart = cache.generation;
    cache.invalidate({ entity: "purchase_order", reason: "metadata_publication" }, 6);
    expect(cache.set("late", "stale", baseIdentity, generationAtFetchStart)).toBe(false);
  });

  it("expires safely when a distributed event is missed", () => {
    let now = 0;
    const cache = new ScopedRuntimeCache<string>({ limit: 10, ttlMs: 30_000, now: () => now });
    cache.set("descriptor", "old", baseIdentity, 0);
    now = 30_001;
    expect(cache.get("descriptor")).toBeUndefined();
  });
});

function createCache(): ScopedRuntimeCache<string> {
  return new ScopedRuntimeCache<string>({ limit: 10, ttlMs: 30_000 });
}
