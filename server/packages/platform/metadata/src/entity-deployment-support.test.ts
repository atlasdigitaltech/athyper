import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  createEntityReadinessEvaluator,
  entitySupportReceiptHash,
  type EntityCapabilityRequirement,
  type EntityDeploymentSupportPointer,
  type EntitySupportReceipt,
} from "@athyper/server-contract-metadata";
import {
  createEntityDeploymentSupportLookup,
  ImmutableEntitySupportReceiptStore,
} from "./entity-deployment-support.js";

const target = {
  deploymentId: "api-1",
  configurationRevision: "config-1",
  plane: "neon" as const,
  releaseArtifactHash: "a".repeat(64),
};
const requirement: EntityCapabilityRequirement = {
  id: "entity_read_record",
  version: "1",
  required: true,
  manifestHash: "b".repeat(64),
  inputSchemaHash: "c".repeat(64),
  resultSchemaHash: "d".repeat(64),
};
function receipt(): EntitySupportReceipt {
  const { required: _required, ...binding } = requirement;
  return {
    schema: "entity-deployment-support/1",
    target: { ...target },
    supportRevision: "support-1",
    adapterVersions: { records: "1", metadata: "1" },
    qualifiedAtMs: 100,
    expiresAtMs: 200,
    results: [{ ...binding, passed: true }],
  };
}
function fixture() {
  const objects = new Map<string, Uint8Array>();
  const storage = {
    putIfAbsent: vi.fn(async (key: string, bytes: Uint8Array | string) => {
      if (objects.has(key)) return false;
      objects.set(
        key,
        typeof bytes === "string"
          ? new TextEncoder().encode(bytes)
          : bytes.slice(),
      );
      return true;
    }),
    get: vi.fn(async (key: string) => {
      const bytes = objects.get(key);
      if (!bytes) throw Error("private storage error");
      return bytes.slice();
    }),
  };
  return {
    objects,
    storage,
    store: new ImmutableEntitySupportReceiptStore(storage),
  };
}
function pointer(
  value: EntitySupportReceipt,
  receiptHash = entitySupportReceiptHash(value),
): EntityDeploymentSupportPointer {
  return {
    target: { ...value.target },
    supportRevision: value.supportRevision,
    adapterVersions: { ...value.adapterVersions },
    receiptHash,
  };
}

it("requires atomic create support before accepting any receipt", () => {
  expect(
    () => new ImmutableEntitySupportReceiptStore({ get: vi.fn() }),
  ).toThrow("ENTITY_SUPPORT_ATOMIC_STORAGE_REQUIRED");
});
it("persists canonical hash-addressed receipts and permits exact concurrent replays", async () => {
  const f = fixture(),
    value = receipt();
  const hashes = await Promise.all([f.store.put(value), f.store.put(value)]);
  expect(hashes).toEqual([
    entitySupportReceiptHash(value),
    entitySupportReceiptHash(value),
  ]);
  expect(f.objects.size).toBe(1);
  expect(await f.store.get(hashes[0]!)).toEqual(value);
  expect(Object.isFrozen((await f.store.get(hashes[0]!)).results[0])).toBe(
    true,
  );
});
it("preserves historical receipts when the current support revision changes", async () => {
  const f = fixture(),
    original = receipt(),
    successor = { ...original, supportRevision: "support-2" };
  const oldHash = await f.store.put(original),
    newHash = await f.store.put(successor);
  expect(newHash).not.toBe(oldHash);
  expect(await f.store.get(oldHash)).toEqual(original);
  expect(await f.store.get(newHash)).toEqual(successor);
});
it("rejects corrupted reads and conflicting immutable replay", async () => {
  const f = fixture(),
    value = receipt(),
    hash = await f.store.put(value);
  f.objects.set([...f.objects.keys()][0]!, new TextEncoder().encode("{}"));
  await expect(f.store.get(hash)).rejects.toThrow(
    "ENTITY_SUPPORT_RECEIPT_CHANGED",
  );
  await expect(f.store.put(value)).rejects.toThrow(
    "ENTITY_SUPPORT_IMMUTABILITY_CONFLICT",
  );
});
it("malformed receipt declarations never reach storage", async () => {
  const f = fixture();
  for (const change of [
    { schema: "other" },
    { handler: "arbitrary" },
    { results: [receipt().results[0], receipt().results[0]] },
    { expiresAtMs: 99 },
  ]) {
    await expect(
      f.store.put({ ...receipt(), ...change } as EntitySupportReceipt),
    ).rejects.toThrow();
  }
  expect(f.storage.putIfAbsent).not.toHaveBeenCalled();
});
it.each(["../receipt", "A".repeat(64), "a".repeat(63)])(
  "rejects an invalid hash %s before storage access",
  async (hash) => {
    const f = fixture();
    await expect(f.store.get(hash)).rejects.toThrow(
      "ENTITY_SUPPORT_RECEIPT_HASH_INVALID",
    );
    expect(f.storage.get).not.toHaveBeenCalled();
  },
);
it("rejects a correctly hashed object containing an unsupported receipt schema", async () => {
  const f = fixture(),
    bytes = new TextEncoder().encode('{"schema":"other"}');
  const hash = createHash("sha256").update(bytes).digest("hex");
  f.objects.set(
    `entity-framework/deployment-support/v1/receipts/${hash}.json`,
    bytes,
  );
  await expect(f.store.get(hash)).rejects.toThrow(
    "ENTITY_SUPPORT_RECEIPT_INVALID",
  );
});
it("snapshots a receipt before crossing the storage boundary", async () => {
  const f = fixture(),
    value = receipt(),
    hash = entitySupportReceiptHash(value);
  const pending = f.store.put(value);
  Object.assign(value.target, { configurationRevision: "changed" });
  expect(await pending).toBe(hash);
  expect((await f.store.get(hash)).target).toEqual(target);
});
it("re-reads trusted authority on each evaluation and rejects stale configuration evidence", async () => {
  const f = fixture(),
    value = receipt(),
    hash = await f.store.put(value);
  let current = pointer(value, hash);
  const readCurrent = vi.fn(async () => current);
  const evaluate = createEntityReadinessEvaluator({
    lookup: createEntityDeploymentSupportLookup({
      receipts: f.store,
      current: readCurrent,
    }),
    now: () => 150,
  });
  expect(await evaluate({ target, requirements: [requirement] })).toMatchObject(
    { ready: true, available: [requirement.id] },
  );
  current = {
    ...current,
    target: { ...target, configurationRevision: "config-2" },
  };
  expect(
    await evaluate({ target: current.target, requirements: [requirement] }),
  ).toMatchObject({
    ready: false,
    unavailable: [{ reason: "target_changed" }],
  });
  expect(readCurrent).toHaveBeenCalledTimes(4);
});
it("an absent authority pointer does not fall back to historical evidence", async () => {
  const f = fixture();
  await f.store.put(receipt());
  const evaluate = createEntityReadinessEvaluator({
    lookup: createEntityDeploymentSupportLookup({
      receipts: f.store,
      current: async () => null,
    }),
    now: () => 150,
  });
  expect(await evaluate({ target, requirements: [requirement] })).toMatchObject(
    { ready: false, unavailable: [{ reason: "support_unavailable" }] },
  );
  expect(f.storage.get).not.toHaveBeenCalled();
});
it("storage outage hides optional capabilities without exposing private errors or blocking unrelated reads", async () => {
  const f = fixture(),
    value = receipt();
  const evaluate = createEntityReadinessEvaluator({
    lookup: createEntityDeploymentSupportLookup({
      receipts: f.store,
      current: async () => pointer(value),
    }),
    now: () => 150,
  });
  expect(
    await evaluate({
      target,
      requirements: [{ ...requirement, required: false }],
    }),
  ).toEqual({
    ready: true,
    available: [],
    unavailable: [
      { id: requirement.id, required: false, reason: "support_lookup_failed" },
    ],
  });
  expect(await evaluate({ target, requirements: [requirement] })).toMatchObject(
    { ready: false },
  );
});
it("rejects authority mutation during asynchronous receipt retrieval", async () => {
  const value = receipt(),
    current = pointer(value);
  const lookup = createEntityDeploymentSupportLookup({
    current: async () => current,
    receipts: {
      get: async () => {
        Object.assign(current.target, { deploymentId: "worker" });
        Object.assign(current.adapterVersions, { records: "2" });
        return value;
      },
    },
  });
  const result = await createEntityReadinessEvaluator({
    lookup,
    now: () => 150,
  })({ target, requirements: [requirement] });
  expect(result).toMatchObject({
    ready: false,
    available: [],
    unavailable: [{ reason: "support_lookup_failed" }],
  });
});
it.each(["revoked", "receipt", "revision", "configuration", "adapters"])(
  "fails closed when support is %s during receipt retrieval",
  async (change) => {
    const value = receipt();
    let current: EntityDeploymentSupportPointer | null = pointer(value);
    const lookup = createEntityDeploymentSupportLookup({
      current: async () => current,
      receipts: {
        get: async () => {
          const previous = current!;
          current =
            change === "revoked"
              ? null
              : {
                  ...previous,
                  ...(change === "receipt"
                    ? { receiptHash: "f".repeat(64) }
                    : {}),
                  ...(change === "revision"
                    ? { supportRevision: "support-2" }
                    : {}),
                  ...(change === "configuration"
                    ? {
                        target: {
                          ...target,
                          configurationRevision: "config-2",
                        },
                      }
                    : {}),
                  ...(change === "adapters"
                    ? { adapterVersions: { records: "2" } }
                    : {}),
                };
          return value;
        },
      },
    });
    await expect(lookup(target)).rejects.toThrow(
      "ENTITY_SUPPORT_AUTHORITY_CHANGED",
    );
  },
);
it("accepts equivalent fresh pointer objects irrespective of adapter key order", async () => {
  const value = receipt();
  const read = vi
    .fn()
    .mockResolvedValueOnce(pointer(value))
    .mockResolvedValueOnce({
      ...pointer(value),
      adapterVersions: { metadata: "1", records: "1" },
    });
  const lookup = createEntityDeploymentSupportLookup({
    current: read,
    receipts: { get: async () => value },
  });
  expect(await lookup(target)).toEqual({
    current: pointer(value),
    receipt: value,
  });
  expect(read).toHaveBeenCalledTimes(2);
});
it("rejects malformed authority pointers before fetching evidence", async () => {
  const get = vi.fn(),
    value = receipt();
  const lookup = createEntityDeploymentSupportLookup({
    receipts: { get },
    current: async () => ({ ...pointer(value), handler: "untrusted" }),
  });
  await expect(lookup(target)).rejects.toThrow(
    "ENTITY_SUPPORT_POINTER_INVALID",
  );
  expect(get).not.toHaveBeenCalled();
});
