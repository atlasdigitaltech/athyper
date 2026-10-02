import { expect, it, vi } from "vitest";
import type {
  MetadataReader,
  EntityRuntimeDescriptor,
} from "@athyper/server-contract-metadata";
import type { Authorizer } from "@athyper/server-contract-auth";
import { createAtlasEntityRecordTool } from "./entity-record-tool.js";
import { createAtlasEntityContextTools } from "./entity-context-tools.js";
import { createAtlasEntityLookupTools } from "./entity-lookup-tools.js";
import { resolveAtlasEntityToolManifest } from "./entity-tool-manifest.js";
import {
  AtlasToolRegistry,
  atlasEntityManifestCompatible,
} from "./tool-service.js";
it("compiler vocabulary is identical to actual serving factories on every allowed plane", () => {
  const metadata = {} as MetadataReader;
  const registry = new AtlasToolRegistry([
    createAtlasEntityRecordTool(metadata),
    ...createAtlasEntityContextTools(metadata, { read: vi.fn() }),
    ...createAtlasEntityLookupTools(metadata, {} as Authorizer),
  ]);
  for (const tool of registry.list())
    for (const plane of tool.manifest.allowedPlanes)
      expect(
        resolveAtlasEntityToolManifest(
          tool.manifest.toolCode,
          tool.manifest.version,
          plane,
        ),
      ).toEqual(
        registry.resolveManifest(
          tool.manifest.toolCode,
          tool.manifest.version,
          plane,
        ),
      );
  expect(() =>
    resolveAtlasEntityToolManifest("entity_read_record", "latest", "neon"),
  ).toThrow();
  expect(() =>
    resolveAtlasEntityToolManifest("arbitrary_handler", "1", "neon"),
  ).toThrow();
});
it("compares release requirements independently of authorization and preserves historical compatibility", () => {
  const identity = resolveAtlasEntityToolManifest(
    "entity_read_record",
    "1",
    "neon",
  );
  const descriptor = {
    capabilityReadiness: {
      ready: true,
      available: ["entity_read_record"],
      unavailable: [],
    },
    planeKey: "neon",
    aiManifestBindings: {
      schema: "entity-ai-manifest-bindings/1",
      plane: "neon",
      tools: [
        {
          id: identity.manifest.toolCode,
          version: identity.manifest.version,
          manifestHash: identity.manifestHash,
          inputSchemaHash: identity.inputSchemaHash,
          resultSchemaHash: identity.resultSchemaHash,
        },
      ],
    },
  } as unknown as EntityRuntimeDescriptor;
  expect(atlasEntityManifestCompatible(descriptor, identity)).toBe(true);
  expect(
    atlasEntityManifestCompatible(
      { ...descriptor, capabilityReadiness: undefined },
      identity,
    ),
  ).toBe(false);
  expect(
    atlasEntityManifestCompatible(
      {
        ...descriptor,
        capabilityReadiness: {
          ready: true,
          available: [],
          unavailable: [
            {
              id: "entity_read_record",
              required: false,
              reason: "receipt_expired",
            },
          ],
        },
      },
      identity,
    ),
  ).toBe(false);
  expect(
    atlasEntityManifestCompatible(descriptor, {
      ...identity,
      manifestHash: "a".repeat(64),
    }),
  ).toBe(false);
  expect(
    atlasEntityManifestCompatible(descriptor, {
      ...identity,
      inputSchemaHash: "a".repeat(64),
    }),
  ).toBe(false);
  expect(
    atlasEntityManifestCompatible(descriptor, {
      ...identity,
      resultSchemaHash: "a".repeat(64),
    }),
  ).toBe(false);
  expect(
    atlasEntityManifestCompatible(descriptor, { ...identity, plane: "mesh" }),
  ).toBe(false);
  expect(
    atlasEntityManifestCompatible(
      { planeKey: "neon" } as EntityRuntimeDescriptor,
      identity,
    ),
  ).toBe(true);
});

it.each(["manifest", "support"])(
  "excludes changed %s from discovery and denies execution before reading owner data",
  async (change) => {
    const { AtlasRegisteredToolCoordinator } =
      await import("./runtime-tool-coordinator.js");
    const { context: actor } = await import("./__tests__/review-fixture.js");
    const identity = resolveAtlasEntityToolManifest(
      "entity_read_record",
      "1",
      "neon",
    );
    const descriptor = {
      capabilityReadiness: {
        ready: true,
        available: ["entity_read_record"],
        unavailable: [],
      },
      entityCode: "country",
      planeKey: "neon",
      compiledHash: "published",
      storage: { idField: "id" },
      operations: {
        read: { permissionCode: "common.platform.reference.view" },
      },
      fields: [{ key: "name", type: "string" }],
      ai: {
        enabled: true,
        contextKinds: ["record"],
        aliases: ["country"],
        summaryFieldKeys: ["name"],
        insightProviders: [{ id: "entity_read_record", version: 1 }],
      },
      aiManifestBindings: {
        schema: "entity-ai-manifest-bindings/1",
        plane: "neon",
        tools: [
          {
            id: "entity_read_record",
            version: "1",
            manifestHash: identity.manifestHash,
            inputSchemaHash: identity.inputSchemaHash,
            resultSchemaHash: identity.resultSchemaHash,
          },
        ],
      },
    } as unknown as EntityRuntimeDescriptor;
    const metadata = { getEntityDescriptor: vi.fn(async () => descriptor) };
    const tool = createAtlasEntityRecordTool(metadata),
      registry = new AtlasToolRegistry([tool]);
    const context = {
      ...actor,
      planeKey: "neon" as const,
      permissions: {
        ...actor.permissions,
        allowed: ["common.platform.reference.view"],
      },
    };
    const scope = {
      page: {
        schemaVersion: 1 as const,
        kind: "record" as const,
        entityCode: "country",
        recordId: actor.tenantId,
        section: "overview",
        dirty: false,
        generationId: actor.tenantId,
        locale: "en",
      },
      descriptorHash: "published",
      scopeFingerprint: "scope",
    };
    const coordinator = new AtlasRegisteredToolCoordinator(
      registry,
      {} as never,
      metadata,
    );
    expect(
      (
        await coordinator.definitions(
          context,
          { readToolsAllowed: true, mutationToolsAllowed: false },
          undefined,
          scope,
        )
      ).map((tool) => tool.name),
    ).toEqual(["entity_read_record"]);
    if (change === "manifest")
      Object.assign(descriptor.aiManifestBindings!.tools[0]!, {
        manifestHash: "a".repeat(64),
      });
    else
      Object.assign(descriptor, {
        capabilityReadiness: {
          ready: true,
          available: [],
          unavailable: [
            {
              id: "entity_read_record",
              required: false,
              reason: "receipt_expired",
            },
          ],
        },
      });
    expect(
      await coordinator.definitions(
        context,
        { readToolsAllowed: true, mutationToolsAllowed: false },
        undefined,
        scope,
      ),
    ).toEqual([]);
    const query = vi.fn();
    await expect(
      tool.readHandler!.execute({
        context: {
          context,
          records: { query },
          signal: new AbortController().signal,
        },
        arguments: {
          entityCode: "country",
          recordId: actor.tenantId,
          descriptorHash: "published",
        },
      }),
    ).rejects.toThrow("unavailable or changed");
    expect(query).not.toHaveBeenCalled();
  },
);

it.each([true, false])(
  "rejects unpinned explicit required=%s even when a caller bypasses descriptor parsing",
  (required) => {
    const identity = resolveAtlasEntityToolManifest(
      "entity_read_record",
      "1",
      "neon",
    );
    const ai: NonNullable<EntityRuntimeDescriptor["ai"]> = {
      schemaVersion: 1,
      enabled: true,
      aliases: [],
      summaryFieldKeys: [],
      searchFieldKeys: [],
      relationshipKeys: [],
      contextKinds: ["record"],
      actions: [],
      presentationProfiles: [],
      insightProviders: [{ id: "entity_read_record", version: 1, required }],
    };
    const descriptor: EntityRuntimeDescriptor = {
      schema: "athyper.entity-runtime-descriptor/1.0",
      entityCode: "country",
      planeKey: "neon",
      releaseId: "release-1",
      releaseNo: 1,
      contractHash: "a".repeat(64),
      compiledHash: "b".repeat(64),
      storage: { schema: "shared", object: "country", idField: "id" },
      fields: [],
      operations: {},
      ai,
    };
    expect(atlasEntityManifestCompatible(descriptor, identity)).toBe(false);
    expect(
      atlasEntityManifestCompatible(
        {
          ...descriptor,
          ai: {
            ...ai,
            insightProviders: [{ id: "entity_read_record", version: 1 }],
          },
        },
        identity,
      ),
    ).toBe(true);
  },
);
