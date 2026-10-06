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
  const layout = createLegacyNativeLayoutAdapters({
    surfaces,
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
          { sourceHash: sha256(surfaces[i]), initialization: r },
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
    },
    { ...core, ...layout },
  );
  expect(proof.candidate.fields).toEqual(c.core.field);
  expect(proof.candidate.surfaces).toEqual(c.core.surface);
  expect(proof.candidate.surfaceSections).toEqual(l.section);
  expect(proof.candidate.surfaceFieldBindings).toEqual(l.binding);
  expect(proof.candidate.ownedLabels).toEqual(source.ownedLabels);
});
