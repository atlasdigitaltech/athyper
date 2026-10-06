import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  layoutFixture,
  layoutFixtureContext,
} from "../../../../contracts/meta-entity-authoring/src/normalized-layout.fixtures.js";
import { coreFixtureId } from "../../../../contracts/meta-entity-authoring/src/normalized-core.fixtures.js";
import type { EntityDetailNavigationV1 } from "@athyper/contract-platform-entity-runtime";
import { sha256 } from "./deterministic.js";
import {
  convertLegacyDetailNavigation,
  compileNativeDetailNavigation,
  type NativeNavigationContext,
} from "./native-detail-navigation.js";
function fixture(mode: "scroll" | "switch" = "scroll") {
  const surface = layoutFixtureContext().core.surface.find(
    (s) => s.surfaceKind === "detail",
  )!;
  const sections = [
    layoutFixture().section[0]!,
    {
      ...layoutFixture().section[0]!,
      id: coreFixtureId(62),
      sectionKey: "audit",
      position: 2,
    },
  ];
  const source: EntityDetailNavigationV1 = {
    mode,
    tabs: [
      { key: "details", label: "Details", sectionKeys: ["audit", "details"] },
    ],
  };
  const c: NativeNavigationContext = {
    surface,
    maximumSections: 10,
    label: () => ({ label: "Details" }),
  };
  const mapping = {
    sourceHash: sha256(source),
    groups: { details: { id: coreFixtureId(70), labelId: coreFixtureId(32) } },
  };
  return { source, sections, c, mapping };
}
it.each(["scroll", "switch"] as const)(
  "preserves explicit %s behavior and membership order from typed rows",
  (mode) => {
    const f = fixture(mode),
      before = structuredClone(f.sections);
    const native = convertLegacyDetailNavigation(
      f.source,
      f.sections,
      f.c,
      f.mapping,
    );
    expect(compileNativeDetailNavigation(native, f.c)).toEqual(f.source);
    expect(native.groups[0]!.sectionDisplay).toBe(
      mode === "scroll" ? "continuous" : "selected",
    );
    expect(
      native.sections.find((s) => s.sectionKey === "audit")!.position,
    ).toBe(1);
    expect(f.sections).toEqual(before);
    expect(
      compileNativeDetailNavigation(
        {
          ...native,
          sections: native.sections.map((s) => ({
            ...s,
            position: 3 - s.position,
          })),
        },
        f.c,
      ).tabs![0]!.sectionKeys,
    ).toEqual(["details", "audit"]);
  },
);
it("round-trips Country's real navigation declaration through independently projected labels", () => {
  const product = JSON.parse(
    readFileSync(
      new URL(
        "../../../../../../metadata/entities/common/reference/country/definition.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const source = product.definition.navigation as EntityDetailNavigationV1;
  const f = fixture();
  const label = source.tabs![0]!;
  const c: NativeNavigationContext = {
    ...f.c,
    label: () => ({
      label: label.label,
      localizedLabel: {
        labelKey: "navigation.overview",
        defaultText: "Overview",
      },
    }),
  };
  const sections = label.sectionKeys.map((sectionKey, i) => ({
    ...f.sections[0]!,
    id: coreFixtureId(200 + i),
    sectionKey,
    position: i + 1,
  }));
  const native = convertLegacyDetailNavigation(source, sections, c, {
    sourceHash: sha256(source),
    groups: { overview: { id: coreFixtureId(70), labelId: coreFixtureId(32) } },
  });
  expect(compileNativeDetailNavigation(native, c)).toEqual(source);
});
it("rejects missing tabs, stale provenance, ambiguous ownership and label mismatch", () => {
  const f = fixture();
  expect(() =>
    convertLegacyDetailNavigation({ mode: "scroll" }, f.sections, f.c, {
      ...f.mapping,
      sourceHash: sha256({ mode: "scroll" }),
    }),
  ).toThrow("NATIVE_NAVIGATION_GROUPS_REQUIRED");
  expect(() =>
    convertLegacyDetailNavigation(f.source, f.sections, f.c, {
      ...f.mapping,
      sourceHash: "0".repeat(64),
    }),
  ).toThrow("NATIVE_NAVIGATION_SOURCE_HASH_MISMATCH");
  expect(() =>
    convertLegacyDetailNavigation(
      f.source,
      f.sections,
      { ...f.c, label: () => ({ label: "Wrong label" }) },
      f.mapping,
    ),
  ).toThrow("NATIVE_NAVIGATION_NOT_LOSSLESS");
  const native = convertLegacyDetailNavigation(
    f.source,
    f.sections,
    f.c,
    f.mapping,
  );
  expect(() =>
    compileNativeDetailNavigation(
      {
        ...native,
        sections: native.sections.map((s) => ({
          ...s,
          entitySurfaceId: coreFixtureId(99),
        })),
      },
      f.c,
    ),
  ).toThrow("NATIVE_NAVIGATION_SECTION_INVALID");
  expect(() =>
    compileNativeDetailNavigation(
      {
        ...native,
        sections: native.sections.map((s) => ({ ...s, position: 1 })),
      },
      f.c,
    ),
  ).toThrow("NATIVE_NAVIGATION_ORDER_INVALID");
  expect(() =>
    compileNativeDetailNavigation(
      {
        ...native,
        sections: [native.sections[0]!, native.sections[0]!],
      },
      f.c,
    ),
  ).toThrow("NATIVE_NAVIGATION_IDENTITY_INVALID");
});
it("rejects unsupported nested sections and mixed behavior instead of inventing navigation", () => {
  const f = fixture(),
    native = convertLegacyDetailNavigation(
      f.source,
      f.sections,
      f.c,
      f.mapping,
    );
  expect(() =>
    compileNativeDetailNavigation(
      {
        ...native,
        sections: native.sections.map((s) => ({
          ...s,
          parentSectionId: coreFixtureId(63),
        })),
      },
      f.c,
    ),
  ).toThrow("NATIVE_NAVIGATION_SECTION_INVALID");
  expect(() =>
    compileNativeDetailNavigation(
      {
        ...native,
        groups: [
          native.groups[0]!,
          {
            ...native.groups[0]!,
            id: coreFixtureId(71),
            groupKey: "second",
            position: 2,
            sectionDisplay: "selected",
          },
        ],
      },
      f.c,
    ),
  ).toThrow("NATIVE_NAVIGATION_MIXED_BEHAVIOR_UNSUPPORTED");
  expect(() =>
    compileNativeDetailNavigation(native, { ...f.c, maximumSections: 1 }),
  ).toThrow("NATIVE_NAVIGATION_INPUT_INVALID");
});
