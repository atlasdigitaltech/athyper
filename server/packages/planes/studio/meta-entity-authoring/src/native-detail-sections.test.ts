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
  return { source, c, mapping };
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
