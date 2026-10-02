import { registerEntityMetadata } from "./metadata.js";
import type { Container } from "../../../kernel/container.js";
import { describe, expect, it } from "vitest";
import {
  entitySupportReceiptHash,
  type EntityRuntimeDescriptor,
  type EntitySupportReceipt,
} from "@athyper/server-contract-metadata";
import { ImmutableEntitySupportReceiptStore } from "@athyper/server-platform-metadata";
import { resolveAtlasEntityToolManifest } from "@athyper/server-platform-ai";
import type { HostConfig } from "../../../config/environment.js";
import {
  createHostEntityReadiness,
  entitySupportPointerKey,
  entityActivationTargetsKey,
} from "./deployment-readiness.js";

function fixture(required = false) {
  const config = {
    entityServingDeploymentId: "api-neon-a",
    env: "local",
    port: 3000,
  } as HostConfig;
  const manifest = resolveAtlasEntityToolManifest("entity_lookup", "1", "neon");
  const binding = {
    id: "entity_lookup",
    version: "1",
    manifestHash: manifest.manifestHash,
    inputSchemaHash: manifest.inputSchemaHash,
    resultSchemaHash: manifest.resultSchemaHash,
    required,
  };
  const descriptor = {
    entityCode: "country",
    planeKey: "neon",
    compiledHash: "a".repeat(64),
    aiManifestBindings: {
      schema: "entity-ai-manifest-bindings/1",
      plane: "neon",
      tools: [binding],
    },
  } as EntityRuntimeDescriptor;
  const objects = new Map<string, Uint8Array>();
  let duringRead: (() => void) | undefined;
  const storage = {
    async get(key: string) {
      const bytes = objects.get(key);
      if (!bytes) throw Error("missing");
      duringRead?.();
      return bytes;
    },
    async putIfAbsent(key: string, bytes: Uint8Array) {
      if (objects.has(key)) return false;
      objects.set(key, bytes);
      return true;
    },
  };
  let build = "build-a";
  const runtime = createHostEntityReadiness({
    configuration: () => config,
    storage,
    buildIdentity: () => build,
    now: () => 100,
  });
  async function qualify() {
    const identity = runtime.describeDescriptor(descriptor);
    const receipt: EntitySupportReceipt = {
      schema: "entity-deployment-support/1",
      target: identity.target,
      adapterVersions: identity.adapterVersions,
      supportRevision: "qualification-1",
      qualifiedAtMs: 1,
      expiresAtMs: 200,
      results: descriptor
        .aiManifestBindings!.tools.map((tool) => ({ ...tool, passed: true }))
        .map(
          ({
            id,
            version,
            manifestHash,
            inputSchemaHash,
            resultSchemaHash,
            passed,
          }) => ({
            id,
            version,
            manifestHash,
            inputSchemaHash,
            resultSchemaHash,
            passed,
          }),
        ),
    };
    await new ImmutableEntitySupportReceiptStore(storage).put(receipt);
    objects.set(
      entitySupportPointerKey(identity.target),
      new TextEncoder().encode(
        JSON.stringify({
          target: receipt.target,
          supportRevision: receipt.supportRevision,
          adapterVersions: receipt.adapterVersions,
          receiptHash: entitySupportReceiptHash(receipt),
        }),
      ),
    );
  }
  return {
    runtime,
    storage,
    objects,
    descriptor,
    config,
    qualify,
    changeBuild: () => {
      build = "build-b";
    },
    onRead: (fn: () => void) => {
      duringRead = fn;
    },
  };
}

describe("serving Entity readiness", () => {
  it("blocks required operations without evidence and hides optional capabilities", async () => {
    for (const required of [true, false]) {
      const f = fixture(required);
      expect(await f.runtime.evaluateDescriptor(f.descriptor)).toMatchObject({
        ready: !required,
        available: [],
      });
      if (required)
        await expect(
          f.runtime.assertDescriptors([f.descriptor]),
        ).rejects.toThrow("ENTITY_DEPLOYMENT_NOT_READY");
    }
  });
  it("admits an exact immutable receipt bound to this API instance", async () => {
    const f = fixture(true);
    await f.qualify();
    expect(await f.runtime.evaluateDescriptor(f.descriptor)).toMatchObject({
      ready: true,
      available: ["entity_lookup"],
    });
  });
  it.each(["manifestHash", "inputSchemaHash", "resultSchemaHash"] as const)(
    "rejects a required %s mismatch even when the receipt matches the descriptor",
    async (field) => {
      const f = fixture(true);
      Object.assign(f.descriptor.aiManifestBindings!.tools[0]!, {
        [field]: "f".repeat(64),
      });
      await f.qualify();
      expect(await f.runtime.evaluateDescriptor(f.descriptor)).toMatchObject({
        ready: false,
        available: [],
        unavailable: [
          {
            id: "entity_lookup",
            required: true,
            reason: "manifest_incompatible",
          },
        ],
      });
      await expect(f.runtime.assertDescriptors([f.descriptor])).rejects.toThrow(
        "ENTITY_DEPLOYMENT_NOT_READY:country",
      );
    },
  );
  it.each(["manifestHash", "inputSchemaHash", "resultSchemaHash"] as const)(
    "isolates an optional %s mismatch from a supported required tool",
    async (field) => {
      const f = fixture(false);
      Object.assign(f.descriptor.aiManifestBindings!.tools[0]!, {
        [field]: "f".repeat(64),
      });
      const supported = resolveAtlasEntityToolManifest(
        "entity_read_record",
        "1",
        "neon",
      );
      (
        f.descriptor.aiManifestBindings!.tools as unknown as Array<unknown>
      ).push({
        id: "entity_read_record",
        version: "1",
        manifestHash: supported.manifestHash,
        inputSchemaHash: supported.inputSchemaHash,
        resultSchemaHash: supported.resultSchemaHash,
        required: true,
      });
      await f.qualify();
      expect(await f.runtime.evaluateDescriptor(f.descriptor)).toMatchObject({
        ready: true,
        available: ["entity_read_record"],
        unavailable: [
          {
            id: "entity_lookup",
            required: false,
            reason: "manifest_incompatible",
          },
        ],
      });
    },
  );
  it("rejects evidence after configuration, deployment, artifact or loaded build changes", async () => {
    for (const change of ["config", "deployment", "artifact", "build"]) {
      const f = fixture(true);
      await f.qualify();
      if (change === "config") f.config.port++;
      if (change === "deployment")
        f.config.entityServingDeploymentId = "api-neon-b";
      if (change === "build") f.changeBuild();
      const descriptor =
        change === "artifact"
          ? { ...f.descriptor, compiledHash: "b".repeat(64) }
          : f.descriptor;
      expect((await f.runtime.evaluateDescriptor(descriptor)).ready).toBe(
        false,
      );
    }
  });
  it("fails closed on configuration rotation during asynchronous storage reads", async () => {
    const f = fixture(true);
    await f.qualify();
    f.onRead(() => {
      f.config.port++;
    });
    expect((await f.runtime.evaluateDescriptor(f.descriptor)).ready).toBe(
      false,
    );
  });
  it("does not manufacture readiness for missing deployment identity", async () => {
    const f = fixture(true);
    await f.qualify();
    delete f.config.entityServingDeploymentId;
    expect((await f.runtime.evaluateDescriptor(f.descriptor)).ready).toBe(
      false,
    );
  });
  it("preserves ordinary reads without declared capabilities", async () => {
    const f = fixture();
    expect(
      await f.runtime.evaluateDescriptor({
        ...f.descriptor,
        aiManifestBindings: undefined,
      }),
    ).toMatchObject({ ready: true, available: [] });
  });
});

it("installs readiness in the existing metadata admission path and preserves source descriptors", async () => {
  const f = fixture(true);
  const container = {
    adapters: {},
    platform: { entityReadiness: f.runtime },
  } as unknown as Container;
  const metadata = registerEntityMetadata(
    container,
    f.config,
    {},
    {} as Parameters<typeof registerEntityMetadata>[3],
    {
      async getEntityDescriptor() {
        return f.descriptor;
      },
    },
  );
  const context = {} as Parameters<typeof metadata.getEntityDescriptor>[0];
  await expect(
    metadata.getEntityDescriptor(context, "country"),
  ).rejects.toThrow("ENTITY_DEPLOYMENT_NOT_READY");
  await f.qualify();
  expect(await metadata.getEntityDescriptor(context, "country")).toMatchObject({
    capabilityReadiness: { ready: true },
  });
  expect(f.descriptor).not.toHaveProperty("capabilityReadiness");
  f.config.port++;
  await expect(
    metadata.getEntityDescriptor(context, "country"),
  ).rejects.toThrow("ENTITY_DEPLOYMENT_NOT_READY");
});

it("activation uses the trusted serving target set, not publication worker identity", async () => {
  const f = fixture(true);
  await f.qualify();
  const binding = f.runtime.describeDescriptor(f.descriptor);
  const pointer = JSON.parse(
    new TextDecoder().decode(
      await f.storage.get(entitySupportPointerKey(binding.target)),
    ),
  );
  const key = entityActivationTargetsKey("local", f.descriptor);
  await expect(
    f.runtime.assertActivationDescriptors([f.descriptor]),
  ).rejects.toThrow();
  f.objects.set(
    key,
    new TextEncoder().encode(
      JSON.stringify({
        schema: "entity-serving-targets/1",
        targets: [pointer],
      }),
    ),
  );
  const worker = createHostEntityReadiness({
    configuration: () => ({
      ...f.config,
      mode: "worker",
      entityServingDeploymentId: "worker",
    }),
    storage: f.storage,
    buildIdentity: () => "worker-build",
    now: () => 100,
  });
  await expect(
    worker.assertActivationDescriptors([f.descriptor]),
  ).resolves.toBeUndefined();
  const missing = {
    ...pointer,
    target: { ...pointer.target, deploymentId: "api-neon-b" },
  };
  f.objects.set(
    key,
    new TextEncoder().encode(
      JSON.stringify({
        schema: "entity-serving-targets/1",
        targets: [pointer, missing],
      }),
    ),
  );
  await expect(
    worker.assertActivationDescriptors([f.descriptor]),
  ).rejects.toThrow("ENTITY_DEPLOYMENT_NOT_READY");
});

it("activation refuses target-set rotation during evidence reads", async () => {
  const f = fixture(true);
  await f.qualify();
  const binding = f.runtime.describeDescriptor(f.descriptor);
  const pointer = JSON.parse(
    new TextDecoder().decode(
      await f.storage.get(entitySupportPointerKey(binding.target)),
    ),
  );
  const key = entityActivationTargetsKey("local", f.descriptor);
  f.objects.set(
    key,
    new TextEncoder().encode(
      JSON.stringify({
        schema: "entity-serving-targets/1",
        targets: [pointer],
      }),
    ),
  );
  f.onRead(() => f.objects.set(key, new TextEncoder().encode("{}")));
  await expect(
    f.runtime.assertActivationDescriptors([f.descriptor]),
  ).rejects.toThrow("ENTITY_ACTIVATION_TARGETS_CHANGED");
});

it("an unknown optional registration does not block a qualified required capability", async () => {
  const f = fixture(true);
  const bindings = f.descriptor.aiManifestBindings!;
  (bindings.tools as unknown as Array<unknown>).push({
    ...bindings.tools[0],
    id: "uninstalled_optional",
    required: false,
  });
  await f.qualify();
  const result = await f.runtime.evaluateDescriptor(f.descriptor);
  expect(result.ready).toBe(true);
  expect(result.available).toEqual(["entity_lookup"]);
  expect(result.unavailable).toMatchObject([
    { id: "uninstalled_optional", required: false },
  ]);
});

it("activation refuses configuration rotation during target evidence reads", async () => {
  const f = fixture(true);
  await f.qualify();
  const binding = f.runtime.describeDescriptor(f.descriptor);
  const pointer = JSON.parse(
    new TextDecoder().decode(
      await f.storage.get(entitySupportPointerKey(binding.target)),
    ),
  );
  f.objects.set(
    entityActivationTargetsKey("local", f.descriptor),
    new TextEncoder().encode(
      JSON.stringify({
        schema: "entity-serving-targets/1",
        targets: [pointer],
      }),
    ),
  );
  f.onRead(() => {
    f.config.port++;
  });
  await expect(
    f.runtime.assertActivationDescriptors([f.descriptor]),
  ).rejects.toThrow("ENTITY_ACTIVATION_TARGETS_CHANGED");
});
