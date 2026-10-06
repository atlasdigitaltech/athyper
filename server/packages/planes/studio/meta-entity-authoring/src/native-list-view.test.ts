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
  return { context, source, mapping };
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
