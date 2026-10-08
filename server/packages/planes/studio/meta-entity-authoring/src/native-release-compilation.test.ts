import { lowerNativeRuntimePublication } from "../../../../services/publication/src/compilation/native-runtime.js";
import { compileNativeRuntimeProjection } from "../../../../platform/metadata/src/native-runtime-projection.js";
import { expect, it, vi } from "vitest";
import type { Transaction } from "kysely";
import { createNativeConversionApplicationPolicy } from "./native-conversion-composition.js";
import {
  emptyReferenceMembers,
  type ExpandedNativeMetaEntityGraph,
  type NativeOperationRow,
} from "@athyper/server-contract-meta-entity-authoring";
import { coreFixtureId as id } from "../../../../contracts/meta-entity-authoring/src/normalized-core.fixtures.js";
import {
  layoutFixture,
  layoutFixtureContext,
  layoutFixtureRow,
} from "../../../../contracts/meta-entity-authoring/src/normalized-layout.fixtures.js";
import {
  compileNativeRelease,
  type NativeReleaseCompilationContext,
} from "./native-release-compilation.js";
import { convertLegacyAuthorization } from "./native-authorization.js";
import { convertLegacyDefaultListView } from "./native-list-view.js";
import { sha256 } from "./deterministic.js";
/** Complete synthetic native reference graph. No installed host, storage or
 * human review is attested by the independently supplied fixture contexts. */
function fixture() {
  const layoutContext = layoutFixtureContext(),
    core = layoutContext.core;
  const resource = {
    owner: "synthetic-tests",
    key: "reader",
    version: 1,
    hash: "b".repeat(64),
  };
  const operations: NativeOperationRow[] = ["list", "read"].map(
    (operationKey, i) => ({
      id: id(200 + i),
      operationKey,
      operationKind: "read",
      labelId: id(90 + i),
      description: null,
      auditEventCode: "fixture." + operationKey,
      executionMode: "synchronous",
      idempotencyMode: "none",
      inputSurfaceId: null,
      resultSurfaceId: null,
      authorizationTarget: i === 0 ? "collection" : "existing",
      authorizationEffect: "read",
      requiresParentRead: false,
      requiresPreflight: false,
      replacementOperationId: null,
      handlerKey: "entity.record." + operationKey + ".v1",
      handlerVersion: 1,
      preflightKey: null,
      preflightVersion: null,
      extensionFieldMode: "none",
      exportFormats: null,
      exportMaxRecords: null,
    }),
  );
  const authContext: NativeReleaseCompilationContext["authorization"] = {
    entityCode: "synthetic_reference",
    changeSetId: id(100),
    plane: "studio",
    maximumMembers: 100,
    fields: layoutContext.coreContext.identities.map((row, i) => ({
      id: core.field[i]!.id,
      key: row.fieldKey,
    })),
    permissions: operations.map((o) => ({
      operationId: o.id,
      plane: "studio",
      state: "none",
      permissionCode: null,
    })),
    scopes: operations.map((o) => ({
      operationId: o.id,
      plane: "studio",
      resolverKey: "tenant.record.v1",
      resolverVersion: 1,
    })),
    resolvers: [
      {
        key: "tenant.record.v1",
        version: 1,
        runtimeKey: "tenant.record.v1",
        resource,
      },
    ],
    handlers: operations.map((o) => ({
      key: o.handlerKey!,
      version: 1,
      runtimeKey: o.handlerKey!,
      requiresPreflight: false,
      targets: [o.authorizationTarget],
      effects: ["read"],
      operationKinds: ["read"],
      resource,
    })),
    preflights: [],
  };
  const profile = {
    schemaVersion: 1,
    entityCode: "synthetic_reference",
    planeKey: "studio",
    ownership: "tenant.record.v1",
    directory: { operation: "list", population: "tenant" },
    recordReadOperation: "read",
    operations: operations.map((o) => ({
      key: o.operationKey,
      scope: "tenant.record.v1",
      target: o.authorizationTarget,
      effect: "read",
      requiresParentRead: false,
      requiresPreflight: false,
    })),
    fieldPolicies: [
      {
        key: "readable",
        fields: ["id", "code", "name"],
        readOperation: "read",
        representation: "plain",
        writeOperations: [],
        queryUses: ["sort", "filter"],
      },
    ],
    surfaces: [],
    relationships: [],
  };
  const runtime = {
    schemaVersion: 1,
    runtimeVersion: "entity-authorization.v1",
    bindings: operations.map((o) => ({
      operation: o.operationKey,
      handler: o.handlerKey,
      resolver: "tenant.record.v1",
    })),
  };
  const authorization = convertLegacyAuthorization(
    profile,
    runtime,
    authContext,
    operations,
    {
      profileId: id(300),
      fieldIds: { id: id(301), code: id(302), name: id(303) },
    },
    sha256({ profile, runtime }),
  );
  const layout = layoutFixture();
  const listBindings = [core.field[1]!, core.field[2]!].map((f, i) =>
    layoutFixtureRow("binding", id(62 + i), {
      entitySurfaceId: id(40),
      entityFieldId: f.id,
      bindingKey: "column_" + i,
      bindingKind: "field",
      position: i + 1,
      componentDisplayId: id(80),
      columnSpan: 1,
      meaningfulForForm: false,
    }),
  );
  const presentation = layoutContext.fieldPresentation.map((p) => ({
    ...p,
    queryUses: ["sort", "filter"],
  }));
  const viewSource = {
    defaultState: {
      sort: [{ field: "code", direction: "asc" as const }],
      density: "comfortable" as const,
      mode: "table" as const,
    },
    visibleFields: ["code", "name"],
  };
  const view = convertLegacyDefaultListView(
    viewSource,
    {
      entityId: id(100),
      tenantId: null,
      surface: core.surface[0]!,
      bindings: listBindings,
      fields: core.field,
      identities: layoutContext.coreContext.identities,
      presentation,
      maximumFields: 100,
    },
    {
      sourceHash: sha256(viewSource),
      viewId: id(350),
      viewKey: "default",
      fieldMemberIds: { code: id(351), name: id(352) },
    },
  );
  const references = emptyReferenceMembers();
  Reflect.set(references.members, "target", [
    {
      id: id(399),
      targetPlane: "studio",
      requirement: "required",
      position: 1,
    },
  ]);
  Reflect.set(
    references.members,
    "authorizationProfile",
    authorization.graph.profiles,
  );
  Reflect.set(references.members, "fieldAccess", authorization.graph.fields);
  Reflect.set(references.members, "surfaceView", [view.view]);
  Reflect.set(references.members, "surfaceViewField", view.fields);
  Reflect.set(references.members, "navigationGroup", [
    {
      id: id(70),
      entitySurfaceId: id(41),
      groupKey: "main",
      labelId: id(32),
      iconKey: null,
      sectionDisplay: "continuous",
      position: 1,
    },
  ]);
  const labelIds = [
    ...new Set([...layoutContext.coreContext.labels, id(90), id(91)]),
  ];
  const graph: ExpandedNativeMetaEntityGraph = {
    contractSchema: "athyper.meta-entity-contract/2.5",
    entity: { entityCode: "synthetic_reference", entityLabelId: id(34) },
    authoringSource: {
      entityId: id(100),
      tenantId: null,
      sourceKind: "product",
      authoringSchemaHash: "a".repeat(64),
    },
    fields: core.field,
    operations,
    runtimeProfiles: core.runtime,
    surfaces: core.surface,
    surfaceSections: layout.section,
    surfaceFieldBindings: [...layout.binding, ...listBindings],
    operationScopeBindings: operations.map((o) => ({
      entityOperationId: o.id,
      bindingKey: o.operationKey + "_scope",
      targetPlane: "studio",
      decisionMode:
        o.authorizationTarget === "collection"
          ? "collection"
          : "entity_resource",
      scopeKind: "tenant",
      coordinateSource: "tenant_context",
      missingValueBehavior: "deny",
    })),
    referenceMembers: references,
    ownedLabels: {
      contract: "entity.authoring-owned-labels/1",
      entityId: id(100),
      changeSetId: id(100),
      tenantId: null,
      defaultLocale: "en",
      requiredLocales: ["en"],
      labels: labelIds.map((labelId, i) => ({
        id: labelId,
        labelKey: "fixture.label_" + i,
        defaultText: "Label " + i,
        sourceKind: "owned",
        sharedLabelKey: null,
        sharedResourceKey: null,
        sharedResourceVersion: null,
        sharedResourceHash: null,
      })),
      translations: [],
    },
    ai: { profile: [], field: [], binding: [], reference: [], term: [] },
  };
  const c: NativeReleaseCompilationContext = {
    graphHash: sha256(graph),
    authoringSchemaHash: "a".repeat(64),
    core: layoutContext.coreContext,
    layout: { ...layoutContext, fieldPresentation: presentation },
    structural: { fieldIds: core.field.map((f) => f.id), targets: [] },
    authorization: authContext,
    ai: null,
    identityResource: resource,
    listProviders: [
      {
        surfaceId: id(40),
        provider: resource,
        modes: ["table"],
        countModes: ["exact"],
        maximumPageSize: 50,
        maximumPageSizeChoices: 3,
        maximumSortLevels: 3,
        maximumFilters: 20,
        maximumFilterDepth: 3,
      },
    ],
    domains: [],
    relationLabels: [],
    components: [{ id: id(80), runtimeKey: "text" }],
  };
  const controls = operations.map((o) => ({
    ...o,
    requiresMfa: o.operationKey === "read",
  }));
  const run = () =>
    compileNativeRelease(graph, { ...c, graphHash: sha256(graph) }, controls);
  return { graph, c, controls, run };
}
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
