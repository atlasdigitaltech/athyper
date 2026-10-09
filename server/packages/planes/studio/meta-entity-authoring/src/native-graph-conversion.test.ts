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
  const { createHistoricalNativeReferenceRelationsAdapter } =
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
  const nested = createHistoricalNativeReferenceRelationsAdapter({
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
