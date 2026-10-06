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
  composeNativeNestedConversionAdapters,
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

it.each([false, true])(
  "runs all five scalar adapters and nested composition through preservation (list=%s)",
  async (listView) => {
    const { createLegacyNativeCoreAdapters } =
      await import("./legacy-native-core-adapters.js");
    const { createLegacyNativeLayoutAdapters } =
      await import("./legacy-native-layout-adapters.js");
    const { createLegacyNativeNavigationAdapter } =
      await import("./legacy-native-navigation-adapter.js");
    const f = fixture(),
      c = layoutFixtureContext(),
      l = layoutFixture();
    if (listView) {
      (c.core.field[1] as { dataType: string }).dataType = "enum";
      (c.core.field[1] as { semanticRole: string }).semanticRole = "status";
      (
        c.coreContext.catalogues[0]!.columns[1] as {
          supportedDataTypes: readonly string[];
        }
      ).supportedDataTypes = ["enum"];
      (c.components[0]! as { dataTypes: readonly string[] }).dataTypes = [
        "string",
        "text",
        "enum",
      ];
      (l as { binding: unknown }).binding = [
        ...l.binding,
        {
          ...l.binding[0]!,
          id: coreFixtureId(62),
          width: 240,
          entitySurfaceId: c.core.surface[0]!.id,
          entitySurfaceSectionId: null,
        },
      ];
    }
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
              ...(listView
                ? {
                    defaultState: {
                      sort: [],
                      density: "comfortable",
                      mode: "table",
                    },
                  }
                : {}),
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
      ...(listView && row.entitySurfaceId === c.core.surface[0]!.id
        ? {
            displayConfig: {
              defaultVisible: true,
              defaultWidth: 240,
              lookup: {
                options: [{ value: "active", label: "Fixture label" }],
              },
              statusTones: { active: "success" },
              semanticRole: "status",
            },
          }
        : {}),
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
            ...(r.semanticRole === null
              ? {}
              : { semanticRole: r.semanticRole }),
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
    let nested = createLegacyNativeNavigationAdapter({
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
    if (listView) {
      const { createLegacyNativeListViewAdapter } =
        await import("./native-list-view.js");
      const afterNavigation = nested.forward(source);
      const list = c.core.surface[0]!;
      const listResource = {
        owner: "synthetic-tests",
        key: "list-view-adapter",
        version: 1,
        hash: "7".repeat(64),
      };
      const viewAdapter = createLegacyNativeListViewAdapter({
        source: afterNavigation,
        sourceHash: sha256(afterNavigation),
        resource: listResource,
        dependencies: [identityResource],
        mappings: {
          [list.id]: {
            context: {
              entityId: c.coreContext.entityId,
              tenantId: null,
              surface: list,
              fields: c.core.field,
              bindings: l.binding.filter((b) => b.entitySurfaceId === list.id),
              identities: c.coreContext.identities,
              presentation: c.fieldPresentation,
              maximumFields: 10,
            },
            viewId: coreFixtureId(90),
            viewKey: "default",
            fieldMemberIds: { code: coreFixtureId(91) },
          },
        },
      });
      const { createLegacyNativeFieldChoicesAdapter } =
        await import("./native-field-choices.js");
      const afterView = viewAdapter.forward(afterNavigation);
      const choiceAdapter = createLegacyNativeFieldChoicesAdapter({
        source: afterView,
        sourceHash: sha256(afterView),
        resource: {
          owner: "synthetic-tests",
          key: "choices-adapter",
          version: 1,
          hash: "5".repeat(64),
        },
        dependencies: [labelResource],
        mappings: {
          [c.core.field[1]!.id]: {
            context: {
              field: c.core.field[1]!,
              maximumChoices: 10,
              domainValues: null,
              labelText: () => "Fixture label",
            },
            choices: {
              active: { id: coreFixtureId(95), labelId: coreFixtureId(32) },
            },
          },
        },
      });
      const { createLegacyNativeFieldSemanticsAdapter } =
        await import("./native-field-semantics.js");
      const afterChoices = choiceAdapter.forward(afterView);
      const semanticsAdapter = createLegacyNativeFieldSemanticsAdapter({
        source: afterChoices,
        sourceHash: sha256(afterChoices),
        fields: c.core.field,
        resource: {
          owner: "synthetic-tests",
          key: "semantics-adapter",
          version: 1,
          hash: "4".repeat(64),
        },
        dependencies: [identityResource],
      });
      nested = composeNativeNestedConversionAdapters(
        {
          owner: "synthetic-tests",
          key: "nested-composition",
          version: 1,
          hash: "6".repeat(64),
        },
        [nested, viewAdapter, choiceAdapter, semanticsAdapter],
      );
    }
    const preparedGraph = nested.forward(source);
    const preparedSurfaces = preparedGraph.surfaces!;
    const preparedBindings = preparedGraph.surfaceFieldBindings!;
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
      surfaceFieldBindings: preparedBindings,
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
            { sourceHash: sha256(preparedBindings[i]), initialization: r },
          ]),
        ),
      },
    });
    const proof = prepareNativeGraphConversion(
      source,
      {
        ...f.context,
        resolveLayout: (core) => ({ ...c, core }),
        source: { ...f.context.source, graphHash: sha256(source) },
        installedAdapters: [
          ...new Map(
            [
              ...f.context.installedAdapters,
              listProvider,
              identityResource,
              navigationResource,
              labelResource,
              ...(listView
                ? [nested.resource, ...(nested.dependencies ?? [])]
                : []),
            ].map((r) => [JSON.stringify(r), r]),
          ).values(),
        ],
      },
      { ...core, ...layout },
      nested,
    );
    if (!listView) expect(proof.nested!.dependencies).toEqual([labelResource]);
    else {
      expect(
        proof.candidate.referenceMembers!.members.surfaceView,
      ).toHaveLength(1);
      expect(
        proof.candidate.referenceMembers!.members.surfaceViewField,
      ).toHaveLength(1);
      expect(proof.nested!.dependencies).toEqual(nested.dependencies);
      expect(
        proof.candidate.referenceMembers!.members.fieldChoice,
      ).toHaveLength(1);
      expect(
        proof.candidate.surfaceFieldBindings.find(
          (b) => b.id === coreFixtureId(62),
        )!.width,
      ).toBe(240);
      expect(() =>
        prepareNativeGraphConversion(
          source,
          {
            ...f.context,
            resolveLayout: (core) => ({ ...c, core }),
            source: { ...f.context.source, graphHash: sha256(source) },
            installedAdapters: [
              ...new Map(
                [
                  ...f.context.installedAdapters,
                  listProvider,
                  identityResource,
                  navigationResource,
                  labelResource,
                  nested.resource,
                  ...(nested.dependencies ?? []),
                ]
                  .filter((r) => r.key !== "list-view-adapter")
                  .map((r) => [JSON.stringify(r), r]),
              ).values(),
            ],
          },
          { ...core, ...layout },
          nested,
        ),
      ).toThrow("NATIVE_CONVERSION_ADAPTER_NOT_INSTALLED");
    }
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
  },
);

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

it("requires a nonempty registered nested composition", () => {
  expect(() =>
    composeNativeNestedConversionAdapters(
      { owner: "test", key: "empty", version: 1, hash: "a".repeat(64) },
      [],
    ),
  ).toThrow("NATIVE_CONVERSION_NESTED_ADAPTERS_REQUIRED");
});

it.each([false, true])(
  "binds derived sections and optional explicit UUID disposition (%s) through the scalar layout adapter",
  async (retirement) => {
    const { createLegacyNativeDetailSectionsAdapter } =
      await import("./native-detail-sections.js");
    const { createLegacyNativeLayoutAdapters } =
      await import("./legacy-native-layout-adapters.js");
    const f = fixture(),
      c = layoutFixtureContext(),
      l = layoutFixture();
    const detail = c.core.surface.find((s) => s.surfaceKind === "detail")!;
    const declaration = {
      key: "details",
      label: "Fixture label",
      fields: ["code"],
    };
    const refs = emptyReferenceMembers();
    (refs.members as { navigationGroup: unknown }).navigationGroup = [
      {
        id: coreFixtureId(70),
        entitySurfaceId: detail.id,
        groupKey: "details",
        labelId: coreFixtureId(32),
        iconKey: null,
        sectionDisplay: "continuous",
        position: 1,
      },
    ];
    const source = {
      ...f.source,
      fields: f.source.fields.map((f) => ({
        ...f,
        fieldKey: c.coreContext.identities.find(
          (i) =>
            i.id === c.core.field.find((n) => n.id === f.id)!.fieldIdentityId,
        )!.fieldKey,
        dataType: c.core.field.find((n) => n.id === f.id)!.dataType,
      })),
      referenceMembers: refs,
      surfaces: c.core.surface.map((s) => ({
        id: s.id,
        surfaceKey: s.surfaceKey,
        surfaceKind: s.surfaceKind,
        title: "Fixture label",
        layoutKind: s.layoutKind,
        isDefault: s.isDefault,
        ...(s.id === detail.id
          ? {
              layoutConfig: { recordPresentation: { sections: [declaration] } },
            }
          : {}),
      })),
      surfaceSections: [],
      surfaceFieldBindings: [
        ...(retirement
          ? [
              {
                id: coreFixtureId(62),
                entitySurfaceId: detail.id,
                entityFieldId: coreFixtureId(1),
                bindingKey: "technical",
                position: 1,
                displayConfig: { defaultVisible: true },
              },
            ]
          : []),
        {
          id: l.binding[0]!.id,
          entitySurfaceId: detail.id,
          entityFieldId: coreFixtureId(2),
          bindingKey: "code",
          position: 0,
          displayConfig: { defaultVisible: true },
        },
      ],
    };
    const resource = {
      owner: "synthetic-tests",
      key: "inline-section-adapter",
      version: 1,
      hash: "8".repeat(64),
    };
    const nested = createLegacyNativeDetailSectionsAdapter({
      source,
      sourceHash: sha256(source),
      resource,
      dependencies: [],
      positionConvention: "zero-based",
      ...(retirement
        ? {
            bindingRetirements: [
              {
                id: coreFixtureId(62),
                surfaceId: detail.id,
                fieldId: coreFixtureId(1),
                sourceHash: sha256(source.surfaceFieldBindings[0]),
                reason: "unplaced_uuid" as const,
              },
            ],
          }
        : {}),
      mappings: {
        [detail.id]: {
          context: {
            surface: detail,
            maximumMembers: 10,
            fields: [
              {
                id: coreFixtureId(2),
                key: "code",
                uuid: false,
                representation: "plain",
              },
            ],
            label: () => ({ label: "Fixture label" }),
          },
          sections: { details: l.section[0]! },
          bindings: { details: { code: l.binding[0]! } },
        },
      },
    });
    const prepared = nested.forward(source);
    const layout = createLegacyNativeLayoutAdapters({
      surfaces: prepared.surfaces!,
      surfaceSections: prepared.surfaceSections!,
      surfaceFieldBindings: prepared.surfaceFieldBindings!,
      positionConvention: "zero-based",
      labelText: () => "Fixture label",
      resources: {
        surfaces: f.adapters.surfaces.resource,
        surfaceSections: f.adapters.surfaceSections.resource,
        surfaceFieldBindings: f.adapters.surfaceFieldBindings.resource,
      },
      mappings: {
        surfaces: Object.fromEntries(
          c.core.surface.map((s) => [
            s.id,
            {
              sourceHash: sha256(prepared.surfaces!.find((r) => r.id === s.id)),
              initialization: s,
            },
          ]),
        ),
        surfaceSections: {
          [l.section[0]!.id]: {
            sourceHash: sha256(prepared.surfaceSections![0]),
            initialization: l.section[0]!,
          },
        },
        surfaceFieldBindings: {
          [l.binding[0]!.id]: {
            sourceHash: sha256(prepared.surfaceFieldBindings![0]),
            initialization: l.binding[0]!,
          },
        },
      },
    });
    const context = {
      ...f.context,
      source: { ...f.context.source, graphHash: sha256(source) },
      installedAdapters: [...f.context.installedAdapters, resource],
      resolveLayout: (core: typeof c.core) => ({ ...c, core }),
    };
    const adapters: NativeConversionAdapters = {
      ...f.adapters,
      ...layout,
      fields: {
        ...f.adapters.fields,
        reverse: (rows) =>
          rows.map((r) => ({
            id: r.id,
            legacyToken: r.id,
            fieldKey: c.coreContext.identities.find(
              (i) => i.id === r.fieldIdentityId,
            )!.fieldKey,
            dataType: r.dataType,
          })) as unknown as MetaEntityGraph["fields"],
      },
    };
    const proof = prepareNativeGraphConversion(
      source,
      context,
      adapters,
      nested,
    );
    expect(proof.schema).toBe(
      `entity.native-graph-conversion-proof/${retirement ? 4 : 3}`,
    );
    if (retirement) {
      expect(proof.nested!.bindingRetirements).toEqual(
        nested.bindingRetirements,
      );
      expect(proof.candidate.fields).toHaveLength(source.fields.length);
      expect(() =>
        prepareNativeGraphConversion(source, context, adapters, {
          ...nested,
          bindingRetirements: [],
        }),
      ).toThrow("NATIVE_CONVERSION_IDENTITY_CHANGED");
      expect(() =>
        prepareNativeGraphConversion(source, context, adapters, {
          ...nested,
          bindingRetirements: [
            { ...nested.bindingRetirements![0]!, sourceHash: "0".repeat(64) },
          ],
        }),
      ).toThrow("NATIVE_CONVERSION_RETIREMENT_INVALID");
    }
    expect(proof.nested!.sectionDerivations).toEqual(nested.sectionDerivations);
    expect(proof.candidate.surfaceSections).toEqual(l.section);
    expect(proof.candidate.surfaceFieldBindings).toEqual(l.binding);
    for (const patch of [
      { sectionDerivations: [] },
      {
        sectionDerivations: [
          { ...nested.sectionDerivations![0]!, sourceHash: "0".repeat(64) },
        ],
      },
      {
        sectionDerivations: [
          {
            ...nested.sectionDerivations![0]!,
            surfaceId: c.core.surface[0]!.id,
          },
        ],
      },
      {
        sectionDerivations: [
          nested.sectionDerivations![0]!,
          nested.sectionDerivations![0]!,
        ],
      },
    ])
      expect(() =>
        prepareNativeGraphConversion(source, context, adapters, {
          ...nested,
          ...patch,
        }),
      ).toThrow();
    // A manifest cannot authorize deletion of an existing binding.
    expect(() =>
      prepareNativeGraphConversion(source, context, adapters, {
        ...nested,
        forward: (g) => ({ ...nested.forward(g), surfaceFieldBindings: [] }),
      }),
    ).toThrow("NATIVE_CONVERSION_IDENTITY_CHANGED");
  },
);

// This exercises the 2.4-to-2.5 coordinator using the same deliberately synthetic
// core adapters above. Production supplemental resource semantics are tested
// separately against actual Country/State Region declarations.
function expandedFixture() {
  const f = fixture();
  Reflect.set(f.source, "ownedLabels", {
    ...f.source.ownedLabels,
    labels: [],
    translations: [],
    defaultLocale: "en",
    requiredLocales: ["en"],
  });
  const resource = {
    owner: "synthetic-tests",
    key: "supplemental",
    version: 1,
    hash: "e".repeat(64),
  };
  const supplemental = {
    resource,
    contextHash: "f".repeat(64),
    dependencies: [],
    forward: (source: MetaEntityGraph) => ({
      prepared: structuredClone(source),
      operations: [],
      ai: { profile: [], field: [], binding: [], reference: [], term: [] },
    }),
    reverse: (prepared: MetaEntityGraph) => structuredClone(prepared),
  };
  return {
    ...f,
    supplemental,
    context: {
      ...f.context,
      maximumSupplementalMembers: 100,
      source: { ...f.context.source, graphHash: sha256(f.source) },
      installedAdapters: [...f.context.installedAdapters, resource],
    },
  };
}
it("connects the existing whole-core inverse to an installed native 2.5 stage and binds both target and context evidence", async () => {
  const { prepareExpandedNativeGraphConversion } =
    await import("./native-expanded-conversion.js");
  const f = expandedFixture(),
    before = structuredClone(f.source);
  const proof = prepareExpandedNativeGraphConversion(
    f.source,
    f.context,
    f.adapters,
    undefined,
    f.supplemental,
  );
  expect(proof.schema).toBe("entity.native-expanded-conversion-proof/1");
  expect(proof.candidate.contractSchema).toBe(
    "athyper.meta-entity-contract/2.5",
  );
  expect(proof.coreProof.candidate.contractSchema).toBe(
    "athyper.meta-entity-contract/2.4",
  );
  expect(proof.source).toEqual(f.context.source);
  expect(proof.targetHash).toBe(sha256(proof.candidate));
  expect(proof.supplemental.contextHash).toBe(f.supplemental.contextHash);
  expect(f.source).toEqual(before);
  expect(proof).not.toHaveProperty("qualified");
  const different = prepareExpandedNativeGraphConversion(
    f.source,
    f.context,
    f.adapters,
    undefined,
    { ...f.supplemental, contextHash: "a".repeat(64) },
  );
  expect(different.targetHash).toBe(proof.targetHash);
  expect(different.contextHash).not.toBe(proof.contextHash);
});
it("rejects uninstalled supplemental resources, changed retained branches and a lossy final inverse", async () => {
  const { prepareExpandedNativeGraphConversion } =
    await import("./native-expanded-conversion.js");
  const f = expandedFixture();
  expect(() =>
    prepareExpandedNativeGraphConversion(
      f.source,
      {
        ...f.context,
        installedAdapters: f.context.installedAdapters.slice(0, -1),
      },
      f.adapters,
      undefined,
      f.supplemental,
    ),
  ).toThrow("NATIVE_CONVERSION_ADAPTER_NOT_INSTALLED");
  expect(() =>
    prepareExpandedNativeGraphConversion(
      f.source,
      f.context,
      f.adapters,
      undefined,
      {
        ...f.supplemental,
        forward: (s) => ({
          ...f.supplemental.forward(s),
          prepared: { ...s, entity: { ...s.entity, entityCode: "changed" } },
        }),
      },
    ),
  ).toThrow("NATIVE_EXPANDED_RETAINED_CHANGED");
  expect(() =>
    prepareExpandedNativeGraphConversion(
      f.source,
      f.context,
      f.adapters,
      undefined,
      {
        ...f.supplemental,
        reverse: (s) => ({ ...s, entity: { ...s.entity, entityCode: "lost" } }),
      },
    ),
  ).toThrow("NATIVE_CONVERSION_NOT_LOSSLESS");
  expect(() =>
    prepareExpandedNativeGraphConversion(
      f.source,
      { ...f.context, maximumSupplementalMembers: 0 },
      f.adapters,
      undefined,
      f.supplemental,
    ),
  ).toThrow("NATIVE_SNAPSHOT_LIMIT");
});
it("rejects supplemental identity injection and native AI references outside the final candidate", async () => {
  const { prepareExpandedNativeGraphConversion } =
    await import("./native-expanded-conversion.js");
  const f = expandedFixture();
  const ai = {
    profile: [
      {
        id: coreFixtureId(700),
        enabled: true,
        description: null,
        aliases: [],
        contextKinds: ["record" as const],
        searchProfileId: null,
        vocabularyLocale: null,
      },
    ],
    field: [
      {
        id: coreFixtureId(701),
        aiProfileId: coreFixtureId(700),
        entityFieldId: coreFixtureId(999),
        position: 1,
      },
    ],
    binding: [],
    reference: [],
    term: [],
  };
  expect(() =>
    prepareExpandedNativeGraphConversion(
      f.source,
      f.context,
      f.adapters,
      undefined,
      {
        ...f.supplemental,
        forward: (s) => ({ ...f.supplemental.forward(s), ai }),
      },
    ),
  ).toThrow("NATIVE_SNAPSHOT_REFERENCE_INVALID");
  expect(() =>
    prepareExpandedNativeGraphConversion(
      f.source,
      f.context,
      f.adapters,
      undefined,
      {
        ...f.supplemental,
        forward: (s) => ({
          ...f.supplemental.forward(s),
          prepared: {
            ...s,
            referenceMembers: {
              ...s.referenceMembers!,
              members: {
                ...s.referenceMembers!.members,
                fieldChoice: [{} as never],
              },
            },
          },
        }),
      },
    ),
  ).toThrow("NATIVE_EXPANDED_RETAINED_CHANGED");
});
it("rejects malformed supplemental output with a named diagnostic", async () => {
  const { prepareExpandedNativeGraphConversion } =
    await import("./native-expanded-conversion.js");
  const f = expandedFixture();
  for (const invalid of [{ prepared: null }, { operations: null }]) {
    expect(() =>
      prepareExpandedNativeGraphConversion(
        f.source,
        f.context,
        f.adapters,
        undefined,
        {
          ...f.supplemental,
          forward: (s) =>
            ({ ...f.supplemental.forward(s), ...invalid }) as never,
        },
      ),
    ).toThrow("NATIVE_EXPANDED_SOURCE_INVALID");
  }
});
it("binds source-derived relation additions to version 5 and rejects undeclared or stale structural changes", async () => {
  const { createLegacyNativeReferenceRelationsAdapter } =
    await import("./native-reference-relations.js");
  const f = fixture();
  const field = f.source.fields[1]!;
  const reference = {
    targetEntity: "related_reference",
    labelField: "name",
    fields: [{ source: "code", target: "code" }],
  };
  const enriched = {
    ...field,
    fieldKey: "code",
    valueOrigin: "stored",
    typeConfig: { kind: "string", keyReference: reference },
  };
  const source = {
    ...f.source,
    referenceMembers: {
      ...f.source.referenceMembers!,
      members: {
        ...f.source.referenceMembers!.members,
        navigationGroup: layoutFixtureContext().navigationGroups.map((g) => ({
          ...g,
          groupKey: "details",
          labelId: null,
          iconKey: null,
          sectionDisplay: "continuous" as const,
        })),
      },
    },
    fields: f.source.fields.map((r) => (r.id === field.id ? enriched : r)),
  };
  const resource = {
    owner: "synthetic-tests",
    key: "relation-adapter",
    version: 1,
    hash: "e".repeat(64),
  };
  const dependency = { ...resource, key: "target-key-catalogue" };
  const relationId = coreFixtureId(700),
    targetId = coreFixtureId(701);
  const derivations = [
    {
      sourceFieldId: field.id!,
      sourceHash: sha256(reference),
      labelFieldKey: "name",
      resource: dependency,
      targetKey: {
        entityId: coreFixtureId(800),
        entityCode: "related_reference",
        keyKey: "code",
        fieldKeys: ["code"],
      },
      relation: {
        id: relationId,
        relationKey: "related",
        relationKind: "many_to_one",
        resolutionKind: "logical",
        ownershipMode: "reference",
        mutationMode: "read_only",
        onDelete: "restrict",
        onUpdate: "restrict",
        status: "active" as const,
      },
      target: {
        id: targetId,
        entityRelationId: relationId,
        relationTargetKey: "default",
        targetEntityId: coreFixtureId(800),
        targetEntityCode: "related_reference",
        targetKeyKey: "code",
        isDefault: true,
      },
      fields: [
        {
          id: coreFixtureId(702),
          entityRelationTargetId: targetId,
          sourceFieldId: field.id!,
          targetFieldKey: "code",
          position: 1,
        },
      ],
    },
  ];
  const nested = createLegacyNativeReferenceRelationsAdapter({
    source,
    sourceHash: sha256(source),
    resource,
    derivations,
  });
  const adapters = {
    ...f.adapters,
    fields: {
      ...f.adapters.fields,
      forward: (rows: typeof source.fields) =>
        f.adapters.fields
          .forward(rows)
          .map((r) => (r.id === field.id ? { ...r, relationId } : r)),
      reverse: (rows: Parameters<typeof f.adapters.fields.reverse>[0]) =>
        f.adapters.fields
          .reverse(rows)
          .map((r) => (r.id === field.id ? enriched : r)),
    },
  };
  const context = {
    ...f.context,
    source: { ...f.context.source, graphHash: sha256(source) },
    installedAdapters: [...f.context.installedAdapters, resource, dependency],
    resolveLayout: (core: Parameters<typeof f.context.resolveLayout>[0]) => {
      const c = f.context.resolveLayout(core);
      return {
        ...c,
        coreContext: { ...c.coreContext, relationIds: [relationId] },
      };
    },
  };
  const proof = prepareNativeGraphConversion(source, context, adapters, nested);
  expect(proof.schema).toBe("entity.native-graph-conversion-proof/5");
  expect(proof.nested!.relationDerivations).toEqual(derivations);
  expect(proof.candidate.relations).toEqual(derivations.map((d) => d.relation));
  expect(() =>
    prepareNativeGraphConversion(source, context, adapters, {
      ...nested,
      relationDerivations: [],
    }),
  ).toThrow("NATIVE_CONVERSION_NESTED_GRAPH_INVALID");
  expect(() =>
    prepareNativeGraphConversion(source, context, adapters, {
      ...nested,
      relationDerivations: derivations.map((d) => ({
        ...d,
        sourceHash: "f".repeat(64),
      })),
    }),
  ).toThrow("NATIVE_RELATION_DERIVATION_INVALID");
  expect(() =>
    prepareNativeGraphConversion(
      source,
      {
        ...context,
        installedAdapters: context.installedAdapters.filter(
          (r) => r.key !== dependency.key,
        ),
      },
      adapters,
      nested,
    ),
  ).toThrow("NATIVE_CONVERSION_ADAPTER_NOT_INSTALLED");
});
it("captures nested resource pins before installed callbacks execute", () => {
  const f = fixture();
  const c = layoutFixtureContext();
  const groups = c.navigationGroups.map((g) => ({
    ...g,
    groupKey: "details",
    labelId: null,
    iconKey: null,
    sectionDisplay: "continuous" as const,
  }));
  const source = {
    ...f.source,
    referenceMembers: {
      ...f.source.referenceMembers!,
      members: {
        ...f.source.referenceMembers!.members,
        navigationGroup: groups,
      },
    },
  };
  const resource = {
    owner: "synthetic-tests",
    key: "immutable-nested-resource",
    version: 1,
    hash: "e".repeat(64),
  };
  const admitted = structuredClone(resource);
  const nested = {
    resource,
    forward: (s: MetaEntityGraph) => {
      Reflect.set(resource, "key", "callback_mutation");
      return s;
    },
    reverse: (s: MetaEntityGraph) => s,
  };
  const proof = prepareNativeGraphConversion(
    source,
    {
      ...f.context,
      source: { ...f.context.source, graphHash: sha256(source) },
      installedAdapters: [...f.context.installedAdapters, admitted],
    },
    f.adapters,
    nested,
  );
  expect(proof.nested!.adapter).toEqual(admitted);
});

it("enrolls source-bound badge membership and root-label ownership in the conversion proof", async () => {
  const { source, context, adapters } = fixture();
  const layout = context.resolveLayout({
    field: adapters.fields.forward(source.fields!),
    runtime: adapters.runtimeProfiles.forward(source.runtimeProfiles!),
    surface: adapters.surfaces.forward(source.surfaces!),
  });
  const surface = layout.core.surface.find((s) => s.surfaceKind === "detail")!;
  const field = layout.core.field.find((f) => f.storagePath === "code")!;
  Reflect.set(
    source.fields!.find((f) => f.id === field.id)!,
    "fieldKey",
    "code",
  );
  const legacySurface = source.surfaces!.find((s) => s.id === surface.id)!;
  Reflect.set(legacySurface, "surfaceKind", "detail");
  const text = { labelKey: "reference.entity", defaultText: "Reference" };
  const badge = { field: "code", tones: {} };
  Reflect.set(legacySurface, "layoutConfig", {
    recordPresentation: { badges: [badge], localizedLabels: { entity: text } },
  });
  Reflect.set(source, "ownedLabels", {
    ...source.ownedLabels,
    contract: "entity.authoring-owned-labels/1",
    defaultLocale: "en",
    requiredLocales: ["en"],
    labels: [],
    translations: [],
  });
  Reflect.set(
    source.referenceMembers!.members,
    "navigationGroup",
    layout.navigationGroups.map((g) => ({
      ...g,
      groupKey: "details",
      labelId: null,
      iconKey: null,
      sectionDisplay: "continuous",
    })),
  );
  const original = structuredClone(source);
  const id = coreFixtureId(850);
  const labelId = coreFixtureId(851);
  const resource = {
    owner: "synthetic-tests",
    key: "badge-and-root-proof",
    version: 1,
    hash: "e".repeat(64),
  };
  const mapping = {
    id,
    surfaceId: surface.id,
    fieldId: field.id,
    bindingKey: "code_badge",
    sourceIndex: 0,
    sourceHash: sha256(badge),
  };
  const root = {
    labelId,
    sources: [{ surfaceId: surface.id, sourceHash: sha256(text) }],
  };
  const prepared = structuredClone(source);
  Reflect.set(prepared, "entity", { ...source.entity, entityLabelId: labelId });
  Reflect.set(prepared.ownedLabels!, "labels", [
    ...(prepared.ownedLabels!.labels ?? []),
    {
      id: labelId,
      ...text,
      sourceKind: "owned",
      sharedLabelKey: null,
      sharedResourceKey: null,
      sharedResourceVersion: null,
      sharedResourceHash: null,
    },
  ]);
  Reflect.set(
    prepared.surfaces!.find((s) => s.id === surface.id)!,
    "layoutConfig",
    { recordPresentation: {} },
  );
  Reflect.set(prepared, "surfaceFieldBindings", [
    ...source.surfaceFieldBindings!,
    {
      id,
      entitySurfaceId: surface.id,
      entityFieldId: field.id,
      bindingKey: "code_badge",
      position: 1,
      columnSpan: 1,
    },
  ]);
  const { layoutFixtureRow } =
    await import("../../../../contracts/meta-entity-authoring/src/normalized-layout.fixtures.js");
  const targetBinding = layoutFixtureRow("binding", id, {
    entitySurfaceId: surface.id,
    entityFieldId: field.id,
    bindingKey: "code_badge",
    bindingKind: "badge",
    position: 1,
    columnSpan: 1,
    meaningfulForForm: false,
    componentDisplayId: coreFixtureId(80),
  });
  const originalBindings = adapters.surfaceFieldBindings.forward(
    source.surfaceFieldBindings!,
  );
  const scalar = {
    ...adapters,
    fields: {
      ...adapters.fields,
      reverse: () => structuredClone(prepared.fields!),
    },
    surfaces: {
      ...adapters.surfaces,
      reverse: () => structuredClone(prepared.surfaces!),
    },
    surfaceFieldBindings: {
      ...adapters.surfaceFieldBindings,
      forward: () => [...originalBindings, targetBinding],
      reverse: () => structuredClone(prepared.surfaceFieldBindings!),
    },
  } as NativeConversionAdapters;
  const bound = {
    ...context,
    source: { ...context.source, graphHash: sha256(source) },
    installedAdapters: [...context.installedAdapters, resource],
    resolveLayout: (core: typeof layout.core) => ({ ...layout, core }),
  };
  const nested = {
    resource,
    badgeDerivations: [mapping],
    entityLabelDerivation: root,
    forward: () => structuredClone(prepared),
    reverse: () => structuredClone(original),
  };
  const proof = prepareNativeGraphConversion(source, bound, scalar, nested);
  expect(proof.schema).toBe("entity.native-graph-conversion-proof/7");
  expect(proof.nested!.entityLabelDerivation).toEqual(root);
  expect(proof.nested!.badgeDerivations).toEqual([mapping]);
  expect(proof.candidate.entity.entityLabelId).toBe(labelId);
  expect(() =>
    prepareNativeGraphConversion(source, bound, scalar, {
      ...nested,
      badgeDerivations: [{ ...mapping, sourceHash: "a".repeat(64) }],
    }),
  ).toThrow("NATIVE_DETAIL_BADGES_INVALID");
  expect(() =>
    prepareNativeGraphConversion(source, bound, scalar, {
      ...nested,
      entityLabelDerivation: { ...root, labelId: coreFixtureId(999) },
    }),
  ).toThrow("NATIVE_PRESENTATION_LOCALIZATION_INVALID");
  expect(() =>
    prepareNativeGraphConversion(source, bound, scalar, {
      ...nested,
      forward: () => ({
        ...prepared,
        entity: { ...prepared.entity, ownershipModel: "rewritten" },
      }),
    }),
  ).toThrow("NATIVE_PRESENTATION_LOCALIZATION_INVALID");
});
