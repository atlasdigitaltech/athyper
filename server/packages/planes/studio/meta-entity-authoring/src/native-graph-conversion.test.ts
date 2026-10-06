import { expect, it, vi } from "vitest";
import {
  emptyReferenceMembers,
  type MetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  layoutFixture,
  layoutFixtureContext,
} from "../../../../contracts/meta-entity-authoring/src/normalized-layout.fixtures.js";
import { coreFixtureId } from "../../../../contracts/meta-entity-authoring/src/normalized-core.fixtures.js";
import {
  prepareNativeGraphConversion,
  nativeConversionFamilies,
  type NativeConversionAdapters,
  type NativeGraphConversionContext,
} from "./native-graph-conversion.js";
import { sha256 } from "./deterministic.js";
// Deliberately synthetic adapters exercise orchestration, not production legacy
// path semantics or qualification of a Country/State Region migration adapter.
function fixture() {
  const c = layoutFixtureContext(),
    l = layoutFixture();
  const target = {
    fields: c.core.field,
    runtimeProfiles: c.core.runtime,
    surfaces: c.core.surface,
    surfaceSections: l.section,
    surfaceFieldBindings: l.binding,
  };
  const source = {
    contractSchema: "athyper.meta-entity-contract/2.3",
    entity: {
      entityCode: "synthetic_reference",
      entityClass: "master",
      ownershipModel: "system",
    },
    operations: [],
    fields: [],
    runtimeProfiles: [],
    surfaces: [],
    surfaceSections: [],
    surfaceFieldBindings: [],
    referenceMembers: emptyReferenceMembers(),
    fieldIdentities: [],
    ownedLabels: {
      entityId: coreFixtureId(100),
      changeSetId: coreFixtureId(101),
      tenantId: null,
    },
  } as unknown as MetaEntityGraph;
  const adapters = Object.fromEntries(
    nativeConversionFamilies.map((kind, index) => {
      (source as any)[kind] = target[kind].map((row) => ({
        id: row.id,
        legacyToken: row.id,
      }));
      const resource = {
        owner: "synthetic-tests",
        key: kind,
        version: 1,
        hash: String(index + 1).repeat(64),
      };
      return [
        kind,
        {
          resource,
          forward: (rows: { id: string }[]) =>
            rows.map((row) =>
              structuredClone(target[kind].find((t) => t.id === row.id)!),
            ),
          reverse: (rows: { id: string }[]) =>
            rows.map((row) => ({ id: row.id, legacyToken: row.id })),
        },
      ];
    }),
  ) as unknown as NativeConversionAdapters;
  const context: NativeGraphConversionContext = {
    source: {
      entityId: coreFixtureId(100),
      changeSetId: coreFixtureId(101),
      tenantId: null,
      revision: 4,
      graphHash: sha256(source),
    },
    sourceKind: "product",
    authoringSchemaHash: "b".repeat(64),
    maximumBytes: 100_000,
    installedAdapters: [
      ...nativeConversionFamilies.map((k) => adapters[k].resource),
      {
        owner: "synthetic-tests",
        key: "retained-validator",
        version: 1,
        hash: "a".repeat(64),
      },
    ],
    retainedValidation: {
      resource: {
        owner: "synthetic-tests",
        key: "retained-validator",
        version: 1,
        hash: "a".repeat(64),
      },
      evidenceHash: "d".repeat(64),
    },
    validateRetained: vi.fn(),
    resolveLayout: (core) => ({ ...c, core }),
  };
  return { source, context, adapters };
}
it("preserves every retained branch and identity and produces a source-bound review proof", () => {
  const { source, context, adapters } = fixture();
  const before = structuredClone(source);
  const proof = prepareNativeGraphConversion(source, context, adapters);
  expect(proof.schema).toBe("entity.native-graph-conversion-proof/1");
  expect(proof).not.toHaveProperty("nested");
  expect(proof.candidate.contractSchema).toBe(
    "athyper.meta-entity-contract/2.4",
  );
  expect(proof.source).toEqual(context.source);
  expect(proof.targetHash).toBe(sha256(proof.candidate));
  expect(proof.candidate.operations).toEqual(source.operations);
  expect(proof.candidate.referenceMembers).toEqual(source.referenceMembers);
  expect(context.validateRetained).toHaveBeenCalledOnce();
  expect(source).toEqual(before);
  expect(Object.keys(proof.families)).toEqual([...nativeConversionFamilies]);
});
it("rejects uninstalled adapters and any loss of source paths or member identity", () => {
  const f = fixture();
  expect(() =>
    prepareNativeGraphConversion(
      f.source,
      { ...f.context, installedAdapters: [] },
      f.adapters,
    ),
  ).toThrow("NATIVE_CONVERSION_ADAPTER_NOT_INSTALLED");
  const lossy = {
    ...f.adapters,
    fields: { ...f.adapters.fields, reverse: () => [] },
  };
  expect(() =>
    prepareNativeGraphConversion(f.source, f.context, lossy),
  ).toThrow("NATIVE_CONVERSION_NOT_LOSSLESS");
  const renamed = {
    ...f.adapters,
    fields: {
      ...f.adapters.fields,
      forward: (rows: never) =>
        f.adapters.fields
          .forward(rows)
          .map((r) => ({ ...r, id: coreFixtureId(999) })),
    },
  };
  expect(() =>
    prepareNativeGraphConversion(f.source, f.context, renamed),
  ).toThrow();
});
it("rejects unknown source branches, missing families, stale evidence and mismatched scope", () => {
  const f = fixture(),
    extra = { ...f.source, hidden: {} };
  expect(() =>
    prepareNativeGraphConversion(
      extra,
      {
        ...f.context,
        source: { ...f.context.source, graphHash: sha256(extra) },
      },
      f.adapters,
    ),
  ).toThrow("NATIVE_CONVERSION_SOURCE_PATH_UNSUPPORTED");
  const missing = { ...f.source };
  delete (missing as any).surfaces;
  expect(() =>
    prepareNativeGraphConversion(
      missing,
      {
        ...f.context,
        source: { ...f.context.source, graphHash: sha256(missing) },
      },
      f.adapters,
    ),
  ).toThrow("NATIVE_CONVERSION_FAMILY_REQUIRED");
  expect(() =>
    prepareNativeGraphConversion(
      f.source,
      {
        ...f.context,
        source: { ...f.context.source, graphHash: "c".repeat(64) },
      },
      f.adapters,
    ),
  ).toThrow("NATIVE_CONVERSION_SOURCE_HASH_MISMATCH");
  expect(() =>
    prepareNativeGraphConversion(
      f.source,
      { ...f.context, sourceKind: "tenant_entity" },
      f.adapters,
    ),
  ).toThrow("NATIVE_CONVERSION_SCOPE_INVALID");
});
it("requires retained-member validation and a matching independently resolved layout context", () => {
  const f = fixture();
  expect(() =>
    prepareNativeGraphConversion(
      f.source,
      {
        ...f.context,
        validateRetained: () => {
          throw Error("retained security references invalid");
        },
      },
      f.adapters,
    ),
  ).toThrow("retained security references invalid");
  expect(() =>
    prepareNativeGraphConversion(
      f.source,
      { ...f.context, resolveLayout: () => layoutFixtureContext() },
      f.adapters,
    ),
  ).not.toThrow();
  expect(() =>
    prepareNativeGraphConversion(
      f.source,
      {
        ...f.context,
        resolveLayout: (core) => ({
          ...layoutFixtureContext(),
          core,
          coreContext: {
            ...layoutFixtureContext().coreContext,
            tenantId: coreFixtureId(999),
          },
        }),
      },
      f.adapters,
    ),
  ).toThrow("NATIVE_CONVERSION_CONTEXT_MISMATCH");
});

it("binds retained and core/layout evidence separately from candidate content", () => {
  const f = fixture();
  const first = prepareNativeGraphConversion(f.source, f.context, f.adapters);
  const second = prepareNativeGraphConversion(
    f.source,
    {
      ...f.context,
      retainedValidation: {
        ...f.context.retainedValidation,
        evidenceHash: "e".repeat(64),
      },
    },
    f.adapters,
  );
  expect(second.targetHash).toBe(first.targetHash);
  expect(second.contextHash).not.toBe(first.contextHash);
  expect(() =>
    prepareNativeGraphConversion(
      f.source,
      {
        ...f.context,
        retainedValidation: {
          ...f.context.retainedValidation,
          evidenceHash: "missing",
        },
      },
      f.adapters,
    ),
  ).toThrow("NATIVE_CONVERSION_RETAINED_EVIDENCE_REQUIRED");
});

it("runs all five implemented scalar adapters through the complete preservation coordinator", async () => {
  const { createLegacyNativeCoreAdapters } =
    await import("./legacy-native-core-adapters.js");
  const { createLegacyNativeLayoutAdapters } =
    await import("./legacy-native-layout-adapters.js");
  const { createLegacyNativeNavigationAdapter } =
    await import("./legacy-native-navigation-adapter.js");
  const f = fixture(),
    c = layoutFixtureContext(),
    l = layoutFixture();
  const fields = c.core.field.map((row) => ({
    id: row.id,
    fieldKey: c.coreContext.identities.find(
      (i) => i.id === row.fieldIdentityId,
    )!.fieldKey,
    dataType: row.dataType,
    typeConfig: { kind: row.dataType },
    cardinality: row.nullable ? "zero_or_one" : "one",
    valueOrigin: "stored",
    writeMode: "read_only",
    storagePath: row.storagePath!,
    dataClassification: row.dataClassification!,
  }));
  const runtimeProfiles = c.core.runtime.map((row) => ({
    id: row.id,
    profileKey: row.profileKey,
    backingKind: row.backingKind,
    storagePlane: row.storagePlane!,
    storageSchema: row.storageSchema!,
    storageObject: row.storageObject!,
    apiExposure: row.apiExposure,
    readMode: row.readMode,
    writeMode: row.writeMode,
    createMode: row.createMode,
    concurrencyMode: row.concurrencyMode,
  }));
  const surfaces = c.core.surface.map((row) => ({
    id: row.id,
    surfaceKey: row.surfaceKey,
    surfaceKind: row.surfaceKind,
    title: "Fixture label",
    layoutKind: row.layoutKind,
    isDefault: row.isDefault,
    ...(row.surfaceKind === "list"
      ? {
          layoutConfig: {
            identityField: "code",
            supportedModes: row.supportedModes!,
            limits: {
              defaultPageSize: row.defaultPageSize!,
              allowedPageSizes: row.allowedPageSizes!,
              maxSortLevels: row.maxSortLevels!,
              countMode: row.countMode!,
            },
          },
        }
      : {
          layoutConfig: {
            recordPresentation: {
              schemaVersion: 1,
              titleField: "name",
              codeField: "code",
              navigation: {
                mode: "scroll",
                tabs: [
                  {
                    key: "details",
                    label: "Fixture label",
                    sectionKeys: ["details"],
                  },
                ],
              },
            },
          },
        }),
  }));
  const surfaceSections = l.section.map((row) => ({
    id: row.id,
    entitySurfaceId: row.entitySurfaceId,
    sectionKey: row.sectionKey,
    sectionKind: row.sectionKind,
    title: "Fixture label",
    position: row.position,
    columnCount: row.columnCount,
    collapsible: row.collapsible,
    collapsedByDefault: row.collapsedByDefault,
  }));
  const surfaceFieldBindings = l.binding.map((row) => ({
    id: row.id,
    entitySurfaceId: row.entitySurfaceId!,
    entitySurfaceSectionId: row.entitySurfaceSectionId!,
    entityFieldId: row.entityFieldId,
    bindingKey: row.bindingKey,
    position: row.position,
    columnSpan: row.columnSpan,
  }));
  const source: MetaEntityGraph = {
    ...f.source,
    fields,
    runtimeProfiles,
    surfaces,
    surfaceSections,
    surfaceFieldBindings,
  };
  const core = createLegacyNativeCoreAdapters({
    fields,
    runtimeProfiles,
    context: c.coreContext,
    resources: {
      fields: f.adapters.fields.resource,
      runtimeProfiles: f.adapters.runtimeProfiles.resource,
    },
    fieldMappings: Object.fromEntries(
      c.core.field.map((r, i) => [
        r.id,
        {
          sourceHash: sha256(fields[i]),
          fieldIdentityId: r.fieldIdentityId,
          labelId: r.labelId,
          storageType: r.storageType!,
          requiredInput: r.required,
          keyGeneration: r.keyGeneration,
        },
      ]),
    ),
    runtimeMappings: Object.fromEntries(
      c.core.runtime.map((r, i) => [
        r.id,
        {
          sourceHash: sha256(runtimeProfiles[i]),
          idFieldKey: "id",
          storageCatalogueHash: r.storageCatalogueHash!,
          readHandlerVersion: r.readHandlerVersion,
          writeHandlerVersion: r.writeHandlerVersion,
        },
      ]),
    ),
  });
  const listProvider = {
    owner: "synthetic-tests",
    key: "list-provider",
    version: 1,
    hash: "e".repeat(64),
  };
  const identityResource = {
    owner: "synthetic-tests",
    key: "readable-fields",
    version: 1,
    hash: "f".repeat(64),
  };
  const navigationResource = {
    owner: "synthetic-tests",
    key: "navigation-adapter",
    version: 1,
    hash: "9".repeat(64),
  };
  const labelResource = {
    owner: "synthetic-tests",
    key: "owned-labels",
    version: 1,
    hash: "d".repeat(64),
  };
  const detail = c.core.surface.find((s) => s.surfaceKind === "detail")!;
  const nested = createLegacyNativeNavigationAdapter({
    source,
    sourceHash: sha256(source),
    resource: navigationResource,
    labelResource,
    mappings: {
      [detail.id]: {
        context: {
          surface: detail,
          maximumSections: 10,
          label: () => ({ label: "Fixture label" }),
        },
        sections: l.section,
        groups: {
          details: { id: coreFixtureId(70), labelId: coreFixtureId(32) },
        },
      },
    },
  });
  const preparedSurfaces = nested.forward(source).surfaces!;
  const layout = createLegacyNativeLayoutAdapters({
    surfaceIdentities: Object.fromEntries(
      c.core.surface.map((s) => [
        s.id,
        {
          entityId: c.coreContext.entityId,
          tenantId: c.coreContext.tenantId,
          resource: identityResource,
          fields: c.core.field,
          identities: c.coreContext.identities,
          presentation: c.fieldPresentation,
          maximumFields: 10,
        },
      ]),
    ),
    listSettings: {
      [c.core.surface[0]!.id]: {
        surfaceId: c.core.surface[0]!.id,
        provider: listProvider,
        modes: ["table"],
        countModes: ["exact"],
        maximumPageSize: 50,
        maximumPageSizeChoices: 10,
        maximumSortLevels: 3,
        maximumFilters: 20,
        maximumFilterDepth: 3,
      },
    },
    surfaces: preparedSurfaces,
    surfaceSections,
    surfaceFieldBindings,
    positionConvention: "one-based",
    labelText: () => "Fixture label",
    resources: {
      surfaces: f.adapters.surfaces.resource,
      surfaceSections: f.adapters.surfaceSections.resource,
      surfaceFieldBindings: f.adapters.surfaceFieldBindings.resource,
    },
    mappings: {
      surfaces: Object.fromEntries(
        c.core.surface.map((r, i) => [
          r.id,
          { sourceHash: sha256(preparedSurfaces[i]), initialization: r },
        ]),
      ),
      surfaceSections: Object.fromEntries(
        l.section.map((r, i) => [
          r.id,
          { sourceHash: sha256(surfaceSections[i]), initialization: r },
        ]),
      ),
      surfaceFieldBindings: Object.fromEntries(
        l.binding.map((r, i) => [
          r.id,
          { sourceHash: sha256(surfaceFieldBindings[i]), initialization: r },
        ]),
      ),
    },
  });
  const proof = prepareNativeGraphConversion(
    source,
    {
      ...f.context,
      source: { ...f.context.source, graphHash: sha256(source) },
      installedAdapters: [
        ...f.context.installedAdapters,
        listProvider,
        identityResource,
        navigationResource,
        labelResource,
      ],
    },
    { ...core, ...layout },
    nested,
  );
  expect(proof.nested!.dependencies).toEqual([labelResource]);
  expect(
    proof.candidate.referenceMembers!.members.navigationGroup,
  ).toHaveLength(1);
  expect(proof.schema).toBe("entity.native-graph-conversion-proof/2");
  expect(proof.families.surfaces!.dependencies).toEqual([
    listProvider,
    identityResource,
  ]);
  expect(proof.candidate.fields).toEqual(c.core.field);
  expect(proof.candidate.surfaces).toEqual(c.core.surface);
  expect(proof.candidate.surfaceSections).toEqual(l.section);
  expect(proof.candidate.surfaceFieldBindings).toEqual(l.binding);
  expect(proof.candidate.ownedLabels).toEqual(source.ownedLabels);
});

async function nestedFixture() {
  const { convertLegacyDetailNavigation, compileNativeDetailNavigation } =
    await import("./native-detail-navigation.js");
  const f = fixture(),
    c = layoutFixtureContext(),
    l = layoutFixture();
  const surface = c.core.surface.find((s) => s.surfaceKind === "detail")!;
  const declaration = {
    mode: "scroll" as const,
    tabs: [{ key: "details", label: "Details", sectionKeys: ["details"] }],
  };
  const source = structuredClone(f.source);
  const detail = source.surfaces!.find((s) => s.id === surface.id)!;
  (detail as any).layoutConfig = { navigation: declaration };
  const resource = {
    owner: "synthetic-tests",
    key: "nested-navigation",
    version: 1,
    hash: "9".repeat(64),
  };
  const labelContext = {
    surface,
    maximumSections: 10,
    label: () => ({ label: "Details" }),
  };
  const nested: import("./native-graph-conversion.js").NativeNestedConversionAdapter =
    {
      resource,
      forward(graph) {
        const detail = graph.surfaces!.find((s) => s.id === surface.id)!;
        const navigation = detail.layoutConfig!
          .navigation as typeof declaration;
        const converted = convertLegacyDetailNavigation(
          navigation,
          l.section,
          labelContext,
          {
            sourceHash: sha256(navigation),
            groups: {
              details: { id: coreFixtureId(70), labelId: coreFixtureId(32) },
            },
          },
        );
        delete (detail as any).layoutConfig;
        (graph.referenceMembers!.members.navigationGroup as any[]).push(
          ...converted.groups,
        );
        return graph;
      },
      reverse(graph, target) {
        const detail = graph.surfaces!.find((s) => s.id === surface.id)!;
        (detail as any).layoutConfig = {
          navigation: compileNativeDetailNavigation(
            {
              groups: target.referenceMembers!.members.navigationGroup,
              sections: target.surfaceSections,
            },
            labelContext,
          ),
        };
        (graph.referenceMembers!.members as any).navigationGroup = [];
        return graph;
      },
    };
  const context = {
    ...f.context,
    source: { ...f.context.source, graphHash: sha256(source) },
    installedAdapters: [...f.context.installedAdapters, resource],
  };
  return { ...f, source, context, nested };
}
it("integrates the real navigation mapping into a source-bound graph proof without rewriting controls", async () => {
  const f = await nestedFixture(),
    before = structuredClone(f.source);
  const proof = prepareNativeGraphConversion(
    f.source,
    f.context,
    f.adapters,
    f.nested,
  );
  expect(
    proof.candidate.referenceMembers!.members.navigationGroup,
  ).toHaveLength(1);
  expect(
    proof.candidate.referenceMembers!.members.navigationGroup[0]!
      .sectionDisplay,
  ).toBe("continuous");
  expect(proof.schema).toBe("entity.native-graph-conversion-proof/2");
  expect(proof.nested!.sourceHash).toBe(sha256(f.source));
  expect(proof.nested!.preparedHash).not.toBe(proof.nested!.sourceHash);
  expect(proof.retainedTargetHash).not.toBe(proof.preservedHash);
  expect(f.context.validateRetained).toHaveBeenCalledTimes(2);
  expect(f.source).toEqual(before);
});
it("rejects lossy nested inverses, uninstalled adapters and reversible control changes", async () => {
  const f = await nestedFixture();
  expect(() =>
    prepareNativeGraphConversion(
      f.source,
      {
        ...f.context,
        installedAdapters: f.context.installedAdapters.slice(0, -1),
      },
      f.adapters,
      f.nested,
    ),
  ).toThrow("NATIVE_CONVERSION_ADAPTER_NOT_INSTALLED");
  expect(() =>
    prepareNativeGraphConversion(f.source, f.context, f.adapters, {
      ...f.nested,
      reverse: (graph) => graph,
    }),
  ).toThrow("NATIVE_CONVERSION_NOT_LOSSLESS");
  expect(() =>
    prepareNativeGraphConversion(f.source, f.context, f.adapters, {
      ...f.nested,
      forward(graph) {
        const prepared = f.nested.forward(graph);
        (prepared as any).operations = [{ id: coreFixtureId(200) }] as any;
        return prepared;
      },
    }),
  ).toThrow("NATIVE_CONVERSION_RETAINED_BRANCH_CHANGED");
});
it("rejects replacement of existing members and invalid additive identity inventories", async () => {
  const f = await nestedFixture();
  const existing = {
    id: coreFixtureId(300),
    entityId: f.context.source.entityId,
    tenantId: null,
    fieldKey: "original",
    parentIdentityId: null,
  };
  (f.source as any).fieldIdentities = [existing] as any;
  f.context.source.graphHash = sha256(f.source);
  expect(() =>
    prepareNativeGraphConversion(f.source, f.context, f.adapters, {
      ...f.nested,
      forward(graph) {
        const prepared = f.nested.forward(graph);
        (prepared as any).fieldIdentities = [
          { ...existing, fieldKey: "renamed" },
        ] as any;
        return prepared;
      },
    }),
  ).toThrow("NATIVE_CONVERSION_RETAINED_MEMBER_CHANGED");
  expect(() =>
    prepareNativeGraphConversion(f.source, f.context, f.adapters, {
      ...f.nested,
      forward(graph) {
        const prepared = f.nested.forward(graph);
        (prepared.fieldIdentities as any[]).push(existing);
        return prepared;
      },
    }),
  ).toThrow("NATIVE_CONVERSION_IDENTITY_CHANGED");
});
it("rejects nested core identity replacement and inconsistent installed navigation evidence", async () => {
  const f = await nestedFixture();
  expect(() =>
    prepareNativeGraphConversion(f.source, f.context, f.adapters, {
      ...f.nested,
      forward(graph) {
        const prepared = f.nested.forward(graph);
        (prepared.fields![0] as any).id = coreFixtureId(999);
        return prepared;
      },
    }),
  ).toThrow("NATIVE_CONVERSION_IDENTITY_CHANGED");
  expect(() =>
    prepareNativeGraphConversion(
      f.source,
      {
        ...f.context,
        resolveLayout: (core) => ({
          ...layoutFixtureContext(),
          core,
          navigationGroups: [],
        }),
      },
      f.adapters,
      f.nested,
    ),
  ).toThrow("NATIVE_CONVERSION_CONTEXT_MISMATCH");
  expect(() =>
    prepareNativeGraphConversion(
      f.source,
      {
        ...f.context,
        validateRetained: (graph) => {
          if (graph.referenceMembers!.members.navigationGroup.length)
            throw Error("added label or reference was not admitted");
        },
      },
      f.adapters,
      f.nested,
    ),
  ).toThrow("added label or reference was not admitted");
});

it("pins installed family dependencies and rejects missing, duplicated or changed provider evidence", () => {
  const f = fixture();
  const dependency = {
    owner: "synthetic-tests",
    key: "provider",
    version: 1,
    hash: "e".repeat(64),
  };
  const adapters = {
    ...f.adapters,
    surfaces: { ...f.adapters.surfaces, dependencies: [dependency] },
  };
  expect(() =>
    prepareNativeGraphConversion(f.source, f.context, adapters),
  ).toThrow("NATIVE_CONVERSION_ADAPTER_NOT_INSTALLED");
  const context = {
    ...f.context,
    installedAdapters: [...f.context.installedAdapters, dependency],
  };
  const proof = prepareNativeGraphConversion(f.source, context, adapters);
  expect(proof.schema).toBe("entity.native-graph-conversion-proof/2");
  expect(proof.families.surfaces!.dependencies).toEqual([dependency]);
  const changed = { ...dependency, hash: "f".repeat(64) };
  expect(() =>
    prepareNativeGraphConversion(f.source, context, {
      ...adapters,
      surfaces: { ...adapters.surfaces, dependencies: [changed] },
    }),
  ).toThrow("NATIVE_CONVERSION_ADAPTER_NOT_INSTALLED");
  const second = prepareNativeGraphConversion(
    f.source,
    {
      ...f.context,
      installedAdapters: [...f.context.installedAdapters, changed],
    },
    {
      ...adapters,
      surfaces: { ...adapters.surfaces, dependencies: [changed] },
    },
  );
  expect(second.targetHash).toBe(proof.targetHash);
  expect(second.contextHash).not.toBe(proof.contextHash);
  expect(() =>
    prepareNativeGraphConversion(f.source, context, {
      ...adapters,
      surfaces: {
        ...adapters.surfaces,
        dependencies: [dependency, dependency],
      },
    }),
  ).toThrow("NATIVE_CONVERSION_ADAPTER_INVENTORY_INVALID");
});
