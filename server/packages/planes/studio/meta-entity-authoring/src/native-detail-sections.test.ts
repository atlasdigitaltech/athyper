import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  compileNativeDetailFieldSections,
  convertLegacyDetailFieldSections,
  type NativeDetailSectionsContext,
} from "./native-detail-sections.js";
import {
  compileSharedReferenceProduct,
  parseSharedReferenceProduct,
} from "./authoring/product.js";
import { coreFixtureRow } from "../../../../contracts/meta-entity-authoring/src/normalized-core.fixtures.js";
import { layoutFixtureRow } from "../../../../contracts/meta-entity-authoring/src/normalized-layout.fixtures.js";
import type { NormalizedLayoutRow } from "@athyper/server-contract-meta-entity-authoring";
import { sha256 } from "./deterministic.js";
const id = (n: number) =>
  "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
function fixture(name = "country") {
  const g = compileSharedReferenceProduct(
    parseSharedReferenceProduct(
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
    ),
    "studio",
  ).graph;
  const legacy = g.surfaces!.find((s) => s.surfaceKind === "detail")!,
    source = (
      legacy.layoutConfig!.recordPresentation as {
        sections: {
          key: string;
          label: string;
          localizedLabel: { labelKey: string; defaultText: string };
          fields: string[];
        }[];
      }
    ).sections;
  const surface = coreFixtureRow("surface", legacy.id!, {
    surfaceKind: "detail",
    surfaceKey: legacy.surfaceKey,
    labelId: id(100),
    layoutKind: "grid",
    isDefault: true,
  });
  const c: NativeDetailSectionsContext = {
    surface,
    maximumMembers: 100,
    fields: g.fields.map((f) => ({
      id: f.id!,
      key: f.fieldKey,
      uuid: f.fieldKey === "id",
      representation: "plain",
    })),
    label(labelId) {
      const i = Number(labelId.slice(-12)) - 100;
      return {
        label: source[i]!.label,
        localizedLabel: source[i]!.localizedLabel,
      };
    },
  };
  const sections = Object.fromEntries(
    source.map((s, i) => [
      s.key,
      layoutFixtureRow("section", id(200 + i), {
        entitySurfaceId: surface.id,
        sectionKey: s.key,
        labelId: id(100 + i),
        sectionKind: "section",
        contentKind: "fields",
        position: i + 1,
        columnCount: 2,
        collapsible: false,
        collapsedByDefault: false,
        placement: "direct",
      }),
    ]),
  );
  let cursor = 300;
  const bindings = Object.fromEntries(
    source.map((s) => [
      s.key,
      Object.fromEntries(
        s.fields.map((key, i) => [
          key,
          layoutFixtureRow("binding", id(cursor++), {
            entitySurfaceId: surface.id,
            entityFieldId: c.fields.find((f) => f.key === key)!.id,
            bindingKey: "field_" + key,
            bindingKind: "field",
            position: i + 1,
            columnSpan: 1,
            meaningfulForForm: false,
          }),
        ]),
      ),
    ]),
  );
  const mapping = { sourceHash: sha256(source), sections, bindings };
  return { source, c, mapping, legacyGraph: g };
}
it.each(["country", "state_region"])(
  "normalizes %s's actual nested field sections and memberships",
  (name) => {
    const f = fixture(name),
      graph = convertLegacyDetailFieldSections(f.source, f.c, f.mapping);
    expect(compileNativeDetailFieldSections(graph, f.c)).toEqual(f.source);
    expect(graph.bindings.every((b) => b.entitySurfaceSectionId !== null)).toBe(
      true,
    );
    expect(graph.sections.map((s) => s.id)).toEqual(
      Object.values(f.mapping.sections).map((s) => s.id),
    );
  },
);
it("compiles edited typed membership/order without source-value replay", () => {
  const f = fixture(),
    g = convertLegacyDetailFieldSections(f.source, f.c, f.mapping),
    first = g.sections[0]!;
  const rows = g.bindings.filter((b) => b.entitySurfaceSectionId === first.id);
  const edited = {
    ...g,
    bindings: g.bindings.map((b) =>
      b.entitySurfaceSectionId === first.id
        ? { ...b, position: rows.length + 1 - b.position }
        : b,
    ),
  };
  expect(compileNativeDetailFieldSections(edited, f.c)[0]!.fields).toEqual(
    [...f.source[0]!.fields].reverse(),
  );
});
it("rejects incomplete inventories, stale hashes, foreign and unsafe fields", () => {
  const f = fixture(),
    g = convertLegacyDetailFieldSections(f.source, f.c, f.mapping);
  expect(() =>
    convertLegacyDetailFieldSections(f.source, f.c, {
      ...f.mapping,
      sections: {},
    }),
  ).toThrow("NATIVE_DETAIL_SECTION_MAPPING_INVENTORY_INVALID");
  expect(() =>
    convertLegacyDetailFieldSections(f.source, f.c, {
      ...f.mapping,
      sourceHash: "a".repeat(64),
    }),
  ).toThrow("NATIVE_DETAIL_SECTION_SOURCE_HASH_MISMATCH");
  for (const change of [
    { uuid: true },
    { representation: "masked" as const },
    { representation: "omitted" as const },
  ]) {
    const field = g.bindings[0]!.entityFieldId;
    expect(() =>
      compileNativeDetailFieldSections(g, {
        ...f.c,
        fields: f.c.fields.map((r) =>
          r.id === field ? { ...r, ...change } : r,
        ),
      }),
    ).toThrow("NATIVE_DETAIL_SECTION_FIELD_DENIED");
  }
  expect(() =>
    compileNativeDetailFieldSections(
      {
        ...g,
        bindings: g.bindings.map((b, i) =>
          i ? b : { ...b, entitySurfaceId: id(999) },
        ),
      },
      f.c,
    ),
  ).toThrow("NATIVE_DETAIL_SECTION_BINDING_SCOPE_INVALID");
});
it("rejects unsupported source content, duplicate fields and unqualified labels", () => {
  const f = fixture();
  const extra = f.source.map((s, i) =>
    i ? s : { ...s, component: { type: "custom" } },
  );
  expect(() =>
    convertLegacyDetailFieldSections(extra, f.c, {
      ...f.mapping,
      sourceHash: sha256(extra),
    }),
  ).toThrow();
  const duplicate = f.source.map((s, i) =>
    i ? s : { ...s, fields: [...s.fields, s.fields[0]!] },
  );
  expect(() =>
    convertLegacyDetailFieldSections(duplicate, f.c, {
      ...f.mapping,
      sourceHash: sha256(duplicate),
    }),
  ).toThrow("NATIVE_DETAIL_SECTION_DUPLICATE");
  expect(() =>
    convertLegacyDetailFieldSections(
      f.source,
      { ...f.c, label: () => ({ label: "different" }) },
      f.mapping,
    ),
  ).toThrow("NATIVE_DETAIL_SECTION_LABEL_MISMATCH");
});
it("keeps group order explicit and rejects gapped or duplicated member order", () => {
  const f = fixture(),
    g = convertLegacyDetailFieldSections(f.source, f.c, f.mapping);
  const multiple = {
    ...g,
    sections: g.sections.map((s, i) => ({
      ...s,
      navigationGroupId: id(900 + i),
      position: 1,
    })),
  };
  expect(() => compileNativeDetailFieldSections(multiple, f.c)).toThrow(
    "NATIVE_DETAIL_SECTION_ORDER_REQUIRED",
  );
  expect(
    compileNativeDetailFieldSections(
      multiple,
      f.c,
      multiple.sections.map((s) => s.id),
    ),
  ).toEqual(f.source);
  expect(() =>
    compileNativeDetailFieldSections(
      {
        ...g,
        bindings: g.bindings.map((b, i) => (i ? b : { ...b, position: 100 })),
      },
      f.c,
    ),
  ).toThrow("NATIVE_DETAIL_SECTION_ORDER_INVALID");
  expect(() =>
    compileNativeDetailFieldSections(
      {
        ...g,
        sections: g.sections.map((s, i) =>
          i ? s : { ...s, contentKind: "related_list" },
        ) as NormalizedLayoutRow<"section">[],
      },
      f.c,
    ),
  ).toThrow("NATIVE_DETAIL_SECTION_KIND_UNSUPPORTED");
});

async function graphFixture(
  name = "country",
  fullRoster = false,
  disposition = false,
) {
  const { createLegacyNativeDetailSectionsAdapter } =
    await import("./native-detail-sections.js");
  const { emptyReferenceMembers } =
    await import("@athyper/server-contract-meta-entity-authoring");
  const f = fixture(name);
  const members = Object.values(f.mapping.bindings).flatMap((m) =>
    Object.values(m),
  );
  const source = {
    ...f.legacyGraph,
    contractSchema: "athyper.meta-entity-contract/2.3" as const,
    referenceMembers: emptyReferenceMembers(),
    surfaceSections: [],
    surfaceFieldBindings: f.legacyGraph
      .surfaceFieldBindings!.filter(
        (b) =>
          fullRoster ||
          b.entitySurfaceId !== f.c.surface.id ||
          members.some((n) => n.entityFieldId === b.entityFieldId),
      )
      .map((b, i) => ({
        ...b,
        id:
          b.entitySurfaceId === f.c.surface.id
            ? (members.find((n) => n.entityFieldId === b.entityFieldId)?.id ??
              id(900 + i))
            : id(700 + i),
      })),
  };
  const input = {
    source,
    sourceHash: sha256(source),
    ...(disposition
      ? {
          bindingRetirements: source.surfaceFieldBindings
            .filter(
              (b) =>
                f.legacyGraph.fields.find(
                  (field) => field.id === b.entityFieldId,
                )?.dataType === "uuid" && !members.some((n) => n.id === b.id),
            )
            .map((b) => ({
              id: b.id!,
              surfaceId: b.entitySurfaceId,
              fieldId: b.entityFieldId,
              sourceHash: sha256(b),
              reason: "unplaced_uuid" as const,
            })),
        }
      : {}),
    resource: {
      owner: "test",
      key: "inline-sections",
      version: 1,
      hash: "a".repeat(64),
    },
    dependencies: [],
    positionConvention: "zero-based" as const,
    mappings: {
      [f.c.surface.id]: {
        context: f.c,
        sections: f.mapping.sections,
        bindings: f.mapping.bindings,
      },
    },
  };
  const adapter = createLegacyNativeDetailSectionsAdapter(input);
  const prepared = adapter.forward(source);
  const converted = convertLegacyDetailFieldSections(f.source, f.c, f.mapping);
  const target = {
    ...prepared,
    contractSchema: "athyper.meta-entity-contract/2.4" as const,
    fields: [],
    runtimeProfiles: [],
    surfaces: [f.c.surface],
    surfaceSections: converted.sections,
    surfaceFieldBindings: converted.bindings,
    authoringSource: {
      entityId: id(1),
      tenantId: null,
      sourceKind: "product" as const,
      authoringSchemaHash: "b".repeat(64),
    },
  };
  return { ...f, source, input, adapter, prepared, target };
}
it.each(["country", "state_region"])(
  "enrolls %s's selected inline sections while preserving existing binding identities and source coordinates",
  async (name) => {
    const f = await graphFixture(name);
    expect(f.adapter.reverse(f.prepared, f.target)).toEqual(f.source);
    expect(f.adapter.sectionDerivations).toHaveLength(
      f.target.surfaceSections.length,
    );
    expect(f.prepared.surfaceFieldBindings!.map((b) => b.id)).toEqual(
      f.source.surfaceFieldBindings!.map((b) => b.id),
    );
    expect(
      f.prepared.surfaces!.find((s) => s.id === f.c.surface.id)!.layoutConfig!
        .recordPresentation,
    ).not.toHaveProperty("sections");
    const first = f.target.surfaceSections[0]!;
    const rows = f.target.surfaceFieldBindings.filter(
      (b) => b.entitySurfaceSectionId === first.id,
    );
    const changed = {
      ...f.target,
      surfaceFieldBindings: f.target.surfaceFieldBindings.map((b) =>
        b.entitySurfaceSectionId === first.id
          ? { ...b, position: rows.length + 1 - b.position }
          : b,
      ),
    };
    const reverse = f.adapter.reverse(f.prepared, changed);
    const originalRecord = f.source.surfaces!.find(
      (s) => s.id === f.c.surface.id,
    )!.layoutConfig!.recordPresentation as { sections: { fields: string[] }[] };
    expect(
      (
        reverse.surfaces!.find((s) => s.id === f.c.surface.id)!.layoutConfig!
          .recordPresentation as { sections: { fields: string[] }[] }
      ).sections[0]!.fields,
    ).toEqual([...originalRecord.sections[0]!.fields].reverse());
  },
);
it("blocks actual unassigned technical rosters instead of deleting or inventing presentation", async () => {
  await expect(graphFixture("country", true)).rejects.toThrow(
    "NATIVE_DETAIL_SECTION_UNASSIGNED_BINDING",
  );
  await expect(graphFixture("state_region", true)).rejects.toThrow(
    "NATIVE_DETAIL_SECTION_UNASSIGNED_BINDING",
  );
});
it("rejects absent root inventory, conflicting visibility, lost target members and stale sources", async () => {
  const { createLegacyNativeDetailSectionsAdapter } =
    await import("./native-detail-sections.js");
  const f = await graphFixture();
  const wrongFields = {
    ...f.input,
    mappings: {
      [f.c.surface.id]: {
        ...f.input.mappings[f.c.surface.id]!,
        context: {
          ...f.c,
          fields: f.c.fields.map((field) => ({ ...field, uuid: false })),
        },
      },
    },
  };
  expect(() => createLegacyNativeDetailSectionsAdapter(wrongFields)).toThrow(
    "NATIVE_DETAIL_SECTION_FIELD_CONTEXT_MISMATCH",
  );
  const noRows = { ...f.source, surfaceSections: undefined };
  delete noRows.surfaceSections;
  expect(() =>
    createLegacyNativeDetailSectionsAdapter({
      ...f.input,
      source: noRows,
      sourceHash: sha256(noRows),
    }),
  ).toThrow("NATIVE_DETAIL_SECTION_ROW_INVENTORY_REQUIRED");
  const source = structuredClone(f.source);
  const binding = source.surfaceFieldBindings!.find(
    (b) => b.entitySurfaceId === f.c.surface.id,
  )!;
  (binding as { displayConfig: object }).displayConfig = {
    ...binding.displayConfig,
    defaultVisible: false,
  };
  expect(() =>
    createLegacyNativeDetailSectionsAdapter({
      ...f.input,
      source,
      sourceHash: sha256(source),
    }),
  ).toThrow("NATIVE_DETAIL_SECTION_CORRELATED_SOURCE_CONFLICT");
  expect(() =>
    f.adapter.reverse(f.prepared, {
      ...f.target,
      surfaceFieldBindings: f.target.surfaceFieldBindings.slice(1),
    }),
  ).toThrow("NATIVE_DETAIL_SECTION_MAPPING_INVENTORY_INVALID");
  expect(() => f.adapter.forward({ ...f.source, operations: [] })).toThrow(
    "NATIVE_DETAIL_SECTION_SOURCE_HASH_MISMATCH",
  );
});

it("rejects unrepresentable geometry changes instead of discarding them during inverse enrollment", async () => {
  const f = await graphFixture();
  expect(() =>
    f.adapter.reverse(f.prepared, {
      ...f.target,
      surfaceSections: f.target.surfaceSections.map((s) => ({
        ...s,
        columnCount: 3,
      })),
    }),
  ).toThrow("NATIVE_DETAIL_SECTION_REVERSE_NOT_REPRESENTABLE");
});

it.each(["country", "state_region"])(
  "explicitly accounts for %s's full UUID binding roster without deleting the field or source history",
  async (name) => {
    const f = await graphFixture(name, true, true);
    expect(f.adapter.bindingRetirements).toHaveLength(2);
    const retirement = f.adapter.bindingRetirements![0]!;
    expect(
      f.source.fields.find((field) => field.id === retirement.fieldId)
        ?.dataType,
    ).toBe("uuid");
    expect(f.prepared.fields).toEqual(f.source.fields);
    expect(
      f.prepared.surfaceFieldBindings!.some((b) => b.id === retirement.id),
    ).toBe(false);
    expect(f.prepared.surfaceFieldBindings!.length).toBe(
      f.source.surfaceFieldBindings!.length - 2,
    );
    expect(f.adapter.reverse(f.prepared, f.target)).toEqual(f.source);
    const reintroduced = {
      ...f.target,
      surfaceFieldBindings: [
        ...f.target.surfaceFieldBindings,
        { ...f.target.surfaceFieldBindings[0]!, id: retirement.id },
      ],
    };
    expect(() => f.adapter.reverse(f.prepared, reintroduced)).toThrow(
      "NATIVE_DETAIL_SECTION_MAPPING_INVENTORY_INVALID",
    );
    const original = structuredClone(f.source);
    // Caller mutation after admission cannot replace the historical membership.
    const retired = f.input.source.surfaceFieldBindings.find(
      (b) => b.id === retirement.id,
    )!;
    retired.position = 999;
    expect(f.adapter.reverse(f.prepared, f.target)).toEqual(original);
  },
);
it("rejects stale, non-UUID, placed, referenced and behavior-bearing binding dispositions", async () => {
  const { createLegacyNativeDetailSectionsAdapter } =
    await import("./native-detail-sections.js");
  const f = await graphFixture("country", true, true);
  const retirement = f.adapter.bindingRetirements!.find(
    (r) => r.surfaceId === f.c.surface.id,
  )!;
  for (const mutate of [
    (g: typeof f.source) => {
      Object.assign(
        g.fields.find((field) => field.id === retirement.fieldId)!,
        { dataType: "string" },
      );
    },
    (g: typeof f.source) => {
      g.surfaceFieldBindings.find(
        (b) => b.id === retirement.id,
      )!.displayConfig = { defaultVisible: true, defaultWidth: 120 };
    },
    (g: typeof f.source) => {
      g.surfaceFieldBindings.find((b) => b.id !== retirement.id)!.bindingKey =
        retirement.id;
    },
    (g: typeof f.source) => {
      const record = g.surfaces!.find((s) => s.id === retirement.surfaceId)!
        .layoutConfig!.recordPresentation as {
        sections: { fields: string[] }[];
      };
      record.sections[0]!.fields.push("id");
    },
  ]) {
    const source = structuredClone(f.source);
    mutate(source);
    const row = source.surfaceFieldBindings.find(
      (b) => b.id === retirement.id,
    )!;
    expect(() =>
      createLegacyNativeDetailSectionsAdapter({
        ...f.input,
        source,
        sourceHash: sha256(source),
        bindingRetirements: [{ ...retirement, sourceHash: sha256(row) }],
      }),
    ).toThrow("NATIVE_CONVERSION_RETIREMENT_INVALID");
  }
  expect(() =>
    createLegacyNativeDetailSectionsAdapter({
      ...f.input,
      bindingRetirements: [{ ...retirement, sourceHash: "0".repeat(64) }],
    }),
  ).toThrow("NATIVE_CONVERSION_RETIREMENT_INVALID");
});

it("requires explicitly hidden list UUID membership and rejects UUID summary references or duplicate dispositions", async () => {
  const { validateNativeBindingRetirements } =
    await import("./native-graph-conversion.js");
  const f = await graphFixture("state_region", true, true);
  const list = f.adapter.bindingRetirements!.find(
    (r) => r.surfaceId !== f.c.surface.id,
  )!;
  const detail = f.adapter.bindingRetirements!.find(
    (r) => r.surfaceId === f.c.surface.id,
  )!;
  const source = structuredClone(f.source);
  const row = source.surfaceFieldBindings.find((b) => b.id === list.id)!;
  row.displayConfig = { defaultVisible: true };
  expect(() =>
    validateNativeBindingRetirements(source, [
      { ...list, sourceHash: sha256(row) },
    ]),
  ).toThrow("NATIVE_CONVERSION_RETIREMENT_INVALID");
  const summary = structuredClone(f.source);
  Object.assign(
    summary.surfaces!.find((s) => s.id === detail.surfaceId)!.layoutConfig!
      .recordPresentation as object,
    { summaryView: { fields: ["id"] } },
  );
  expect(() => validateNativeBindingRetirements(summary, [detail])).toThrow(
    "NATIVE_CONVERSION_RETIREMENT_INVALID",
  );
  expect(() =>
    validateNativeBindingRetirements(f.source, [detail, detail]),
  ).toThrow("NATIVE_CONVERSION_RETIREMENT_INVALID");
});

it("keeps field-roster identity checks when later badge membership exists on the surface", async () => {
  const f = await graphFixture();
  const badge = {
    ...f.target.surfaceFieldBindings[0]!,
    id: id(9900),
    bindingKind: "badge" as const,
    entitySurfaceSectionId: null,
  };
  expect(
    f.adapter.reverse(f.prepared, {
      ...f.target,
      surfaceFieldBindings: [...f.target.surfaceFieldBindings, badge],
    }),
  ).toEqual(f.source);
  const changed = {
    ...f.target,
    surfaceFieldBindings: f.target.surfaceFieldBindings.map((binding, i) =>
      i ? binding : { ...binding, bindingKind: "badge" as const },
    ),
  };
  expect(() => f.adapter.reverse(f.prepared, changed)).toThrow(
    "NATIVE_DETAIL_SECTION_MAPPING_INVENTORY_INVALID",
  );
  const extra = { ...badge, id: id(9901), bindingKind: "field" as const };
  expect(() =>
    f.adapter.reverse(f.prepared, {
      ...f.target,
      surfaceFieldBindings: [...f.target.surfaceFieldBindings, extra],
    }),
  ).toThrow("NATIVE_DETAIL_SECTION_MAPPING_INVENTORY_INVALID");
});
