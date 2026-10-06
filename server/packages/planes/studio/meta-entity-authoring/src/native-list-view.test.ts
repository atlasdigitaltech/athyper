import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  coreFixtureContext,
  coreFixtureId,
} from "../../../../contracts/meta-entity-authoring/src/normalized-core.fixtures.js";
import { layoutFixtureRow } from "../../../../contracts/meta-entity-authoring/src/normalized-layout.fixtures.js";
import {
  normalizedCoreMembers,
  type NormalizedCoreRow,
} from "@athyper/server-contract-meta-entity-authoring";
import { normalizeLegacyReadField } from "./normalized-core-codec.js";
import {
  parseSharedReferenceProduct,
  compileSharedReferenceProduct,
} from "./authoring/product.js";
import { sha256 } from "./deterministic.js";
import {
  createLegacyNativeListViewAdapter,
  convertLegacyDefaultListView,
  compileNativeDefaultListView,
  type LegacyDefaultListView,
  type NativeListViewContext,
} from "./native-list-view.js";
function fixture(name = "country") {
  const product = parseSharedReferenceProduct(
    JSON.parse(
      readFileSync(
        new URL(
          "../../../../../../metadata/entities/common/reference/" +
            name +
            "/definition.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
  const graph = compileSharedReferenceProduct(product, "studio").graph,
    c = coreFixtureContext("draft");
  const list = graph.surfaces!.find((s) => s.surfaceKind === "list")!;
  const identities = graph.fields.map((f, i) => ({
    id: coreFixtureId(500 + i),
    entityId: c.entityId,
    tenantId: c.tenantId,
    fieldKey: f.fieldKey,
    parentIdentityId: null,
  }));
  const relations = graph.fields
    .map((f, i) => (f.typeConfig.keyReference ? coreFixtureId(1000 + i) : null))
    .filter((id): id is string => id !== null);
  const fields = graph.fields.map((f, i) =>
    normalizeLegacyReadField(
      f,
      { ...c, identities, relationIds: relations },
      {
        sourceHash: sha256(f),
        fieldIdentityId: identities[i]!.id,
        labelId: null,
        storageType: f.dataType === "uuid" ? "uuid" : "text",
        requiredInput: false,
        keyGeneration: f.dataType === "uuid" ? "provided" : "none",
        ...(f.typeConfig.keyReference
          ? {
              relation: {
                id: coreFixtureId(1000 + i),
                sourceConfigHash: sha256(f.typeConfig.keyReference),
              },
            }
          : {}),
      },
    ),
  );
  const bindings = fields.map((f, i) =>
    layoutFixtureRow("binding", coreFixtureId(2000 + i), {
      entitySurfaceId: list.id!,
      entityFieldId: f.id,
      bindingKey: "list_" + graph.fields[i]!.fieldKey,
      bindingKind: "field",
      position: i + 1,
      columnSpan: 1,
      meaningfulForForm: false,
    }),
  );
  const surface = {
    id: list.id!,
    ...Object.fromEntries(
      Object.keys(normalizedCoreMembers.surface.columns).map((key) => [
        key,
        null,
      ]),
    ),
    surfaceKey: "list",
    surfaceKind: "list",
    layoutKind: "stack",
    isDefault: true,
  } as NormalizedCoreRow<"surface">;
  // Independent synthetic resource context: actual source declarations, not
  // installed storage/security evidence or a complete graph conversion.
  const context: NativeListViewContext = {
    entityId: c.entityId,
    tenantId: null,
    surface,
    fields,
    bindings,
    identities,
    maximumFields: 100,
    presentation: fields.map((f) => ({
      fieldId: f.id,
      display: "plain",
      queryUses: ["sort"],
      filterOperators: [],
      inputSurfaceIds: [],
      referenceSurfaceKeys: [],
      referenceLoadModes: [],
    })),
  };
  const source: LegacyDefaultListView = {
    defaultState: list.layoutConfig!
      .defaultState as LegacyDefaultListView["defaultState"],
    visibleFields: graph
      .surfaceFieldBindings!.filter(
        (b) =>
          b.entitySurfaceId === list.id &&
          b.displayConfig!.defaultVisible === true,
      )
      .sort((a, b) => a.position - b.position)
      .map((b) => graph.fields.find((f) => f.id === b.entityFieldId)!.fieldKey),
  };
  const keys = [
    ...new Set([
      ...source.visibleFields,
      ...source.defaultState.sort.map((s) => s.field),
    ]),
  ];
  const mapping = {
    sourceHash: sha256(source),
    viewId: coreFixtureId(3000),
    viewKey: "default",
    fieldMemberIds: Object.fromEntries(
      keys.map((key, i) => [key, coreFixtureId(4000 + i)]),
    ),
  };
  return { context, source, mapping, graph };
}
for (const name of ["country", "state_region"])
  it(
    "converts and compiles actual " +
      name +
      " default view source without entity dispatch",
    () => {
      const f = fixture(name),
        before = structuredClone(f.source);
      const rows = convertLegacyDefaultListView(f.source, f.context, f.mapping);
      expect(compileNativeDefaultListView(rows, f.context)).toEqual(f.source);
      expect(f.source).toEqual(before);
      expect(rows.fields.every((r) => r.viewId === rows.view.id)).toBe(true);
    },
  );
it("rejects visible UUIDs, omitted display and unapproved sort use", () => {
  const f = fixture();
  const source = { ...f.source, visibleFields: ["id"] };
  expect(() =>
    convertLegacyDefaultListView(source, f.context, {
      ...f.mapping,
      sourceHash: sha256(source),
      fieldMemberIds: { id: coreFixtureId(4001), name: coreFixtureId(4002) },
    }),
  ).toThrow("NATIVE_VIEW_UUID_PRESENTATION_FORBIDDEN");
  const omitted = {
    ...f.context,
    presentation: f.context.presentation.map((p) => ({
      ...p,
      display: "omitted" as const,
    })),
  };
  expect(() =>
    convertLegacyDefaultListView(f.source, omitted, f.mapping),
  ).toThrow("NATIVE_VIEW_DISPLAY_DENIED");
  const denied = {
    ...f.context,
    presentation: f.context.presentation.map((p) => ({ ...p, queryUses: [] })),
  };
  expect(() =>
    convertLegacyDefaultListView(f.source, denied, f.mapping),
  ).toThrow("NATIVE_VIEW_SORT_DENIED");
});
it("rejects unknown nested paths, stale hashes, duplicate fields and identity inventory gaps", () => {
  const f = fixture();
  expect(() =>
    convertLegacyDefaultListView(
      { ...f.source, typo: true } as LegacyDefaultListView,
      f.context,
      f.mapping,
    ),
  ).toThrow();
  expect(() =>
    convertLegacyDefaultListView(f.source, f.context, {
      ...f.mapping,
      sourceHash: "f".repeat(64),
    }),
  ).toThrow("NATIVE_VIEW_SOURCE_HASH_MISMATCH");
  const duplicate = {
    ...f.source,
    visibleFields: [...f.source.visibleFields, f.source.visibleFields[0]!],
  };
  expect(() =>
    convertLegacyDefaultListView(duplicate, f.context, {
      ...f.mapping,
      sourceHash: sha256(duplicate),
    }),
  ).toThrow("NATIVE_VIEW_DUPLICATE_FIELD");
  expect(() =>
    convertLegacyDefaultListView(f.source, f.context, {
      ...f.mapping,
      fieldMemberIds: {},
    }),
  ).toThrow("NATIVE_VIEW_ID_INVENTORY_INVALID");
});
it("compiles row edits and rejects gapped order, mismatched scope or duplicate member IDs", () => {
  const f = fixture(),
    rows = convertLegacyDefaultListView(f.source, f.context, f.mapping);
  expect(
    compileNativeDefaultListView(
      { ...rows, view: { ...rows.view, density: "compact" } },
      f.context,
    ).defaultState.density,
  ).toBe("compact");
  expect(() =>
    compileNativeDefaultListView(
      {
        ...rows,
        fields: rows.fields.map((r) => ({
          ...r,
          visiblePosition:
            r.visiblePosition === null ? null : r.visiblePosition + 1,
        })),
      },
      f.context,
    ),
  ).toThrow("NATIVE_VIEW_ORDER_INVALID");
  expect(() =>
    compileNativeDefaultListView(
      { ...rows, view: { ...rows.view, entitySurfaceId: coreFixtureId(999) } },
      f.context,
    ),
  ).toThrow("NATIVE_VIEW_VARIANT_UNSUPPORTED");
  expect(() =>
    compileNativeDefaultListView(
      { ...rows, fields: [rows.fields[0]!, rows.fields[0]!] },
      f.context,
    ),
  ).toThrow("NATIVE_VIEW_MEMBER_SCOPE_INVALID");
});

async function adapterFixture(name = "country") {
  const { emptyReferenceMembers } =
    await import("@athyper/server-contract-meta-entity-authoring");
  const f = fixture(name);
  const graph = {
    ...f.graph,
    contractSchema: "athyper.meta-entity-contract/2.3" as const,
    referenceMembers: emptyReferenceMembers(),
    surfaceFieldBindings: f.graph.surfaceFieldBindings!.map((b) => {
      const native = f.context.bindings.find(
        (n) => n.entityFieldId === b.entityFieldId,
      );
      return {
        ...b,
        id:
          b.entitySurfaceId === f.context.surface.id
            ? native!.id
            : coreFixtureId(6000 + b.position),
      };
    }),
  };
  const resource = {
    owner: "component-tests",
    key: "default-list-view",
    version: 1,
    hash: "c".repeat(64),
  };
  const input = {
    source: graph,
    sourceHash: sha256(graph),
    resource,
    dependencies: [resource],
    mappings: { [f.context.surface.id]: { context: f.context, ...f.mapping } },
  };
  const adapter = createLegacyNativeListViewAdapter(input);
  const prepared = adapter.forward(graph);
  const target = {
    ...prepared,
    contractSchema: "athyper.meta-entity-contract/2.4" as const,
    fields: f.context.fields,
    surfaces: [f.context.surface],
    runtimeProfiles: [],
    surfaceSections: [],
    surfaceFieldBindings: f.context.bindings,
    authoringSource: {
      entityId: f.context.entityId,
      tenantId: null,
      sourceKind: "product" as const,
      authoringSchemaHash: "d".repeat(64),
    },
  };
  return { ...f, input, graph, adapter, prepared, target };
}
for (const name of ["country", "state_region"])
  it(
    "accounts for actual " +
      name +
      " list visibility/state in the graph adapter",
    async () => {
      const f = await adapterFixture(name);
      expect(f.adapter.reverse(f.prepared, f.target)).toEqual(f.graph);
      expect(
        f.prepared.surfaces!.find((s) => s.id === f.context.surface.id)!
          .layoutConfig,
      ).not.toHaveProperty("defaultState");
      expect(
        f.prepared
          .surfaceFieldBindings!.filter(
            (b) => b.entitySurfaceId === f.context.surface.id,
          )
          .every(
            (b) =>
              !b.displayConfig ||
              !Object.hasOwn(b.displayConfig, "defaultVisible"),
          ),
      ).toBe(true);
      // Detail declarations are preserved for their own mappings, not discarded.
      expect(
        f.prepared.surfaces!.find((s) => s.surfaceKind === "detail"),
      ).toEqual(f.graph.surfaces!.find((s) => s.surfaceKind === "detail"));
      const target = structuredClone(f.target);
      (
        target.referenceMembers!.members.surfaceView[0] as { density: string }
      ).density = "compact";
      const inverse = f.adapter.reverse(f.prepared, target);
      expect(
        (
          inverse.surfaces!.find((s) => s.id === f.context.surface.id)!
            .layoutConfig!.defaultState as { density: string }
        ).density,
      ).toBe("compact");
    },
  );
it("preserves unaccounted display properties and rejects missing visibility, conflicting identity or stale source", async () => {
  const f = await adapterFixture();
  const source = structuredClone(f.graph);
  const binding = source.surfaceFieldBindings!.find(
    (b) => b.entitySurfaceId === f.context.surface.id,
  )!;
  (binding as { displayConfig: object }).displayConfig = {
    ...binding.displayConfig,
    unsupported: "retain",
  };
  const a = createLegacyNativeListViewAdapter({
    ...f.input,
    source,
    sourceHash: sha256(source),
  });
  expect(
    a.forward(source).surfaceFieldBindings!.find((b) => b.id === binding.id)!
      .displayConfig,
  ).toEqual({ unsupported: "retain" });
  expect(
    a.reverse(a.forward(source), {
      ...f.target,
      referenceMembers: a.forward(source).referenceMembers,
    }),
  ).toEqual(source);
  delete (binding as { displayConfig?: object }).displayConfig;
  expect(() =>
    createLegacyNativeListViewAdapter({
      ...f.input,
      source,
      sourceHash: sha256(source),
    }),
  ).toThrow("NATIVE_VIEW_EXPLICIT_VISIBILITY_REQUIRED");
  expect(() => f.adapter.forward(source)).toThrow(
    "NATIVE_VIEW_SOURCE_HASH_MISMATCH",
  );
  const bad = structuredClone(f.input);
  (Object.values(bad.mappings)[0]!.context.bindings[0] as { id: string }).id =
    coreFixtureId(8888);
  expect(() => createLegacyNativeListViewAdapter(bad)).toThrow(
    "NATIVE_VIEW_BINDING_SCOPE_INVALID",
  );
});
it("rejects missing typed members, prepared tampering and unrepresentable visible-order edits", async () => {
  const f = await adapterFixture();
  const duplicate = structuredClone(f.graph);
  (
    duplicate.referenceMembers!.members as { surfaceView: unknown }
  ).surfaceView = [
    {
      ...f.target.referenceMembers!.members.surfaceView[0]!,
      id: coreFixtureId(7777),
    },
  ];
  expect(() =>
    createLegacyNativeListViewAdapter({
      ...f.input,
      source: duplicate,
      sourceHash: sha256(duplicate),
    }),
  ).toThrow("NATIVE_VIEW_CORRELATED_SOURCE_CONFLICT");
  const missing = structuredClone(f.target);
  (
    missing.referenceMembers!.members as { surfaceViewField: unknown }
  ).surfaceViewField = [];
  expect(() => f.adapter.reverse(f.prepared, missing)).toThrow(
    "NATIVE_VIEW_ID_INVENTORY_INVALID",
  );
  expect(() =>
    f.adapter.reverse({ ...f.prepared, operations: [] }, f.target),
  ).toThrow("NATIVE_VIEW_SOURCE_HASH_MISMATCH");
  const reordered = structuredClone(f.target);
  const visible = reordered.referenceMembers!.members.surfaceViewField.filter(
    (v) => v.visiblePosition !== null,
  );
  (visible[0] as { visiblePosition: number }).visiblePosition = visible.length;
  (visible[visible.length - 1] as { visiblePosition: number }).visiblePosition =
    1;
  expect(() => f.adapter.reverse(f.prepared, reordered)).toThrow(
    "NATIVE_VIEW_REVERSE_NOT_REPRESENTABLE",
  );
});
