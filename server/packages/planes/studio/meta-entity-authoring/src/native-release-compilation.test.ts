import { lowerNativeRuntimePublication } from "../../../../services/publication/src/compilation/native-runtime.js";
import { compileNativeRuntimeProjection } from "../../../../platform/metadata/src/native-runtime-projection.js";
import { expect, it, vi } from "vitest";
import type { Transaction } from "kysely";
import { createNativeConversionApplicationPolicy } from "./native-conversion-composition.js";
import { coreFixtureId as id } from "../../../../contracts/meta-entity-authoring/src/normalized-core.fixtures.js";
import { compileNativeRelease } from "./native-release-compilation.js";
import { sha256 } from "./deterministic.js";
import { nativeReleaseFixture as fixture } from "./native-release-compilation.fixtures.js";

it("assembles the native reference graph without legacy compilation or presentation fallbacks", () => {
  const f = fixture(),
    artifact = f.run();
  expect(artifact.contractHash).toBe(sha256(f.graph));
  expect(artifact.descriptorHash).toBe(sha256(artifact.descriptor));
  expect(artifact.descriptor.listPresentation).toMatchObject({
    identityField: "code",
    defaultState: { columns: ["code", "name"] },
  });
  expect(artifact.descriptor.recordPresentation).toMatchObject({
    titleField: "name",
    codeField: "code",
    navigation: { tabs: [{ key: "main", sectionKeys: ["details"] }] },
  });
  expect(artifact.descriptor.operations).toMatchObject([
    { operationKey: "list", requiresMfa: false },
    { operationKey: "read", requiresMfa: true },
  ]);
  expect(f.graph.operations[0]).not.toHaveProperty("requiresMfa");
});
it("rejects missing navigation, widened access context and unsupported families", () => {
  const f = fixture();
  Reflect.set(f.graph.referenceMembers!.members, "navigationGroup", []);
  expect(f.run).toThrow();
  const wider = fixture();
  Reflect.set(wider.c.layout.fieldPresentation[1]!, "display", "masked");
  expect(wider.run).toThrow();
  const unsupported = fixture();
  Reflect.set(unsupported.graph, "flows", [{ id: id(800) }]);
  expect(unsupported.run).toThrow("NATIVE_RELEASE_ADAPTER_UNAVAILABLE");
});
it("rejects changed protected projections, unknown properties and unsupported geometry", () => {
  const f = fixture();
  Reflect.set(f.controls[0]!, "operationKey", "other");
  expect(f.run).toThrow("NATIVE_RELEASE_SOURCE_MISMATCH");
  const unknown = fixture();
  Reflect.set(unknown.graph, "newFamily", []);
  expect(unknown.run).toThrow("NATIVE_RELEASE_ADAPTER_UNAVAILABLE");
  const geometry = fixture();
  Reflect.set(geometry.graph.surfaceFieldBindings[0]!, "textWrap", true);
  expect(geometry.run).toThrow("NATIVE_RELEASE_ADAPTER_UNAVAILABLE");
});

it("passes the existing shared native projection and actual runtime reader", () => {
  const f = fixture(),
    artifact = f.run();
  const runtime = compileNativeRuntimeProjection({
    native: artifact.descriptor,
    registration: {
      entityCode: f.graph.entity.entityCode,
      plane: "studio",
      storage: {
        schema: "shared",
        object: "synthetic_reference",
        idField: "id",
      },
      columns: ["id", "code", "name"],
    },
    permissions: [],
  });
  expect(Reflect.get(runtime, "listPresentation")).toMatchObject({
    identityField: "code",
  });
  expect(Reflect.get(runtime, "recordPresentation")).toMatchObject({
    navigation: { tabs: [{ sectionKeys: ["details"] }] },
  });
  expect(
    runtime.fields.find((field: { key: string }) => field.key === "id")!.list
      .defaultVisible,
  ).toBe(false);
  expect(runtime.operations.read).not.toHaveProperty("permissionCode");
});

it("connects the actual compiler/reader and rejects changed resources or storage identity", async () => {
  const f = fixture();
  const registration = {
    entityCode: f.graph.entity.entityCode,
    plane: "studio" as const,
    storage: { schema: "shared", object: "synthetic_reference", idField: "id" },
    columns: ["id", "code", "name"],
  };
  const policy = createNativeConversionApplicationPolicy({
    host: {
      commands: {
        authoringSchemaHash: f.c.authoringSchemaHash,
        maxMembers: 1000,
        maxCommands: 10,
        maxBatchBytes: 10000,
      },
      snapshotVersions: [2],
      admit: vi.fn(),
      resolveContext: vi.fn(),
      resolveInitializer: vi.fn(),
    },
    maximumBytes: 100000,
    qualify: vi.fn(),
    conversion: vi.fn(),
    compiler: vi.fn(async () => f.c),
    reader: vi.fn(async () => ({
      registration,
      storagePlane: "studio" as const,
      permissions: [],
    })),
  });
  const tx = {} as Transaction<Record<string, never>>;
  const artifact = await policy.compile(tx, f.graph, f.controls);
  await expect(
    policy.verifyReader(tx, artifact, f.graph),
  ).resolves.toBeUndefined();
  registration.storage.idField = "name";
  await expect(
    policy.verifyReader(tx, artifact, f.graph),
  ).rejects.toMatchObject({ code: "NATIVE_CONVERSION_COMPOSITION_MISMATCH" });
  registration.storage.idField = "id";
  Reflect.set(f.c.identityResource, "hash", "c".repeat(64));
  await expect(
    policy.verifyReader(tx, artifact, f.graph),
  ).rejects.toMatchObject({ code: "NATIVE_CONVERSION_COMPOSITION_MISMATCH" });
});

it("rejects unimplemented contract assertions and class profiles instead of dropping them", () => {
  for (const key of ["tests", "classProfiles"]) {
    const f = fixture();
    Reflect.set(f.graph, key, [{ id: id(801) }]);
    expect(f.run).toThrow("NATIVE_RELEASE_ADAPTER_UNAVAILABLE");
  }
});
it("retains translated surface and section labels through the shared reader", () => {
  const f = fixture();
  const owner = f.graph.ownedLabels!;
  Reflect.set(owner, "requiredLocales", ["en", "fr"]);
  Reflect.set(
    owner,
    "translations",
    owner.labels.map((label, i) => ({
      id: id(900 + i),
      labelId: label.id,
      localeCode: "fr",
      text: "Traduit " + label.defaultText,
    })),
  );
  const artifact = f.run();
  const runtime = compileNativeRuntimeProjection({
    native: artifact.descriptor,
    registration: {
      entityCode: f.graph.entity.entityCode,
      plane: "studio",
      storage: {
        schema: "shared",
        object: "synthetic_reference",
        idField: "id",
      },
      columns: ["id", "code", "name"],
    },
    permissions: [],
  });
  const record = Reflect.get(runtime, "recordPresentation") as {
    localizedLabels: { title: { values: Record<string, string> } };
    sections: { localizedLabel: { values: Record<string, string> } }[];
  };
  expect(record.localizedLabels.title.values.fr).toContain("Traduit");
  expect(record.sections[0]!.localizedLabel.values.fr).toContain("Traduit");
});

it("keeps the consumer plane distinct from independently registered storage", async () => {
  const f = fixture();
  const graph = structuredClone(f.graph);
  Reflect.set(graph.runtimeProfiles[0]!, "storagePlane", "mesh");
  const context = structuredClone(f.c);
  Reflect.set(context, "graphHash", sha256(graph));
  Reflect.set(
    context.core,
    "catalogues",
    context.core.catalogues.map((catalogue) => ({
      ...catalogue,
      plane: "mesh",
    })),
  );
  let storagePlane: "studio" | "mesh" = "mesh";
  const policy = createNativeConversionApplicationPolicy({
    host: {
      commands: {
        authoringSchemaHash: context.authoringSchemaHash,
        maxMembers: 1000,
        maxCommands: 10,
        maxBatchBytes: 10000,
      },
      snapshotVersions: [2],
      admit: vi.fn(),
      resolveContext: vi.fn(),
      resolveInitializer: vi.fn(),
    },
    maximumBytes: 100000,
    qualify: vi.fn(),
    conversion: vi.fn(),
    compiler: async () => context,
    reader: async () => ({
      registration: {
        entityCode: graph.entity.entityCode,
        plane: "studio",
        storage: {
          schema: "shared",
          object: "synthetic_reference",
          idField: "id",
        },
        columns: ["id", "code", "name"],
      },
      storagePlane,
      permissions: [],
    }),
  });
  const tx = {} as Transaction<Record<string, never>>;
  const artifact = await policy.compile(tx, graph, f.controls);
  await expect(
    policy.verifyReader(tx, artifact, graph),
  ).resolves.toBeUndefined();
  storagePlane = "studio";
  await expect(policy.verifyReader(tx, artifact, graph)).rejects.toMatchObject({
    code: "NATIVE_CONVERSION_COMPOSITION_MISMATCH",
  });
});

it.each([false, true])(
  "projects admitted reference relations through the actual reader (retained binding: %s)",
  (retained) => {
    const f = fixture();
    const graph = structuredClone(f.graph),
      context = structuredClone(f.c);
    Reflect.set(graph.fields[1]!, "relationId", id(240));
    Reflect.set(graph, "relations", [
      {
        id: id(240),
        relationKey: "parent",
        relationKind: "many_to_one",
        resolutionKind: "logical",
        ownershipMode: "reference",
        mutationMode: "read_only",
        onDelete: "restrict",
        onUpdate: "restrict",
        status: "active",
      },
    ]);
    Reflect.set(graph, "relationTargets", [
      {
        id: id(241),
        entityRelationId: id(240),
        relationTargetKey: "default",
        targetEntityId: id(242),
        targetKeyKey: "code",
        isDefault: true,
      },
    ]);
    Reflect.set(graph, "relationFields", [
      {
        id: id(243),
        entityRelationTargetId: id(241),
        sourceFieldId: graph.fields[1]!.id,
        targetFieldKey: "code",
        position: 1,
      },
    ]);
    if (retained)
      Reflect.set(graph, "fieldReferenceBindings", [
        {
          id: id(244),
          entityFieldId: graph.fields[1]!.id,
          bindingKey: "parent",
          referenceKind: "entity_relation",
          targetEntityCode: "synthetic_target",
          status: "active",
        },
      ]);
    Reflect.set(context.core, "relationIds", [id(240)]);
    Reflect.set(context.structural, "targets", [
      {
        entityId: id(242),
        entityCode: "synthetic_target",
        keyKey: "code",
        fieldKeys: ["code"],
      },
    ]);
    Reflect.set(context, "relationLabels", [
      {
        relationId: id(240),
        labelFieldKey: "name",
        resource: context.identityResource,
      },
    ]);
    const artifact = compileNativeRelease(
      graph,
      { ...context, graphHash: sha256(graph) },
      f.controls,
    );
    const runtime = compileNativeRuntimeProjection({
      native: artifact.descriptor,
      registration: {
        entityCode: graph.entity.entityCode,
        plane: "studio",
        storage: {
          schema: "shared",
          object: "synthetic_reference",
          idField: "id",
        },
        columns: ["id", "code", "name"],
      },
      permissions: [],
    });
    expect(runtime.fields.find((field) => field.key === "code")).toMatchObject({
      referenceTargetEntity: "synthetic_target",
      keyReference: {
        targetEntity: "synthetic_target",
        fields: [{ source: "code", target: "code" }],
      },
    });
  },
);

it("projects explicit live-read pins through the native compiler and versioned reader", () => {
  const f = fixture(),
    artifact = f.run();
  const source = {
    entityId: f.graph.authoringSource.entityId,
    releaseId: id(900),
    contractHash: artifact.contractHash,
    tenantId: f.graph.authoringSource.tenantId,
  };
  const pin = {
    owner: "synthetic-tests",
    namespace: "entity",
    key: "security",
    version: 1,
    hash: "a".repeat(64),
  };
  const contract = {
    schema: "entity.live-read/1" as const,
    source,
    security: pin,
    storageAuthority: { ...pin, key: "storage", hash: "b".repeat(64) },
  };
  const input = {
    native: artifact.descriptor,
    registration: {
      entityCode: f.graph.entity.entityCode,
      plane: "studio" as const,
      storage: {
        schema: "shared",
        object: "synthetic_reference",
        idField: "id",
      },
      columns: ["id", "code", "name"],
    },
    permissions: [],
  };
  const legacy = compileNativeRuntimeProjection(input);
  const projected = compileNativeRuntimeProjection({
    ...input,
    liveRead: { source, contract },
  });
  expect(projected.schema).toBe("athyper.entity-runtime-descriptor/1.1");
  expect(projected.liveReadContract).toEqual(contract);
  const publicationSource = {
    releaseId: source.releaseId,
    releaseNo: 1,
    publicationKey: "metadata.reference.synthetic",
    plane: "studio" as const,
    tenantId: source.tenantId,
    entityCode: f.graph.entity.entityCode,
    revisionId: id(904),
    sourceEntityId: source.entityId,
    sourceReleaseHash: "c".repeat(64),
    sourceContractHash: source.contractHash,
    sourceDescriptorHash: artifact.descriptorHash,
    generatedAt: "2026-10-08T00:00:00.000Z",
    native: artifact.descriptor,
    contract: f.graph as unknown as Record<string, unknown>,
  };
  expect(() =>
    compileNativeRuntimeProjection({
      ...input,
      liveRead: null as unknown as NonNullable<
        Parameters<typeof compileNativeRuntimeProjection>[0]["liveRead"]
      >,
    }),
  ).toThrow("NATIVE_PROJECTION_LIVE_SOURCE_MISMATCH");
  expect(() =>
    lowerNativeRuntimePublication(publicationSource, {
      registration: input.registration,
      permissions: [],
      liveReadContract: null as unknown as typeof contract,
    }),
  ).toThrow("ENTITY_LIVE_READ_CONTRACT_INVALID");
  const lowered = lowerNativeRuntimePublication(publicationSource, {
    registration: input.registration,
    permissions: [],
    liveReadContract: contract,
  });
  expect(lowered.runtimeContracts?.[f.graph.entity.entityCode]).toMatchObject({
    schema: "athyper.entity-runtime-descriptor/1.1",
    liveReadContract: contract,
  });
  expect(() =>
    lowerNativeRuntimePublication(
      { ...publicationSource, sourceEntityId: id(999) },
      {
        registration: input.registration,
        permissions: [],
        liveReadContract: contract,
      },
    ),
  ).toThrow("NATIVE_PROJECTION_LIVE_SOURCE_MISMATCH");

  const { liveReadContract: _pins, schema: _schema, ...rest } = projected;
  const { schema: _legacySchema, ...legacyRest } = legacy;
  expect(rest).toEqual(legacyRest);
  expect(legacy.schema).toBe("athyper.entity-runtime-descriptor/1.0");
  expect(legacy).not.toHaveProperty("liveReadContract");
  contract.security.key = "changed-after-compilation";
  expect(projected.liveReadContract!.security.key).toBe("security");
  for (const mismatch of [
    { entityId: id(901) },
    { releaseId: id(902) },
    { contractHash: "f".repeat(64) },
    { tenantId: id(903) },
  ]) {
    expect(() =>
      compileNativeRuntimeProjection({
        ...input,
        liveRead: { source: { ...source, ...mismatch }, contract },
      }),
    ).toThrow("NATIVE_PROJECTION_LIVE_SOURCE_MISMATCH");
  }
  expect(() =>
    compileNativeRuntimeProjection({
      ...input,
      liveRead: {
        source,
        contract: { ...contract, security: { ...pin, hash: "invalid" } },
      },
    }),
  ).toThrow("ENTITY_LIVE_READ_CONTRACT_INVALID");
});
