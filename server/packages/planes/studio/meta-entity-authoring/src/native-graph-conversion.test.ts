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
