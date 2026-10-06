import { expect, it } from "vitest";
import {
  emptyReferenceMembers,
  type MetaEntityGraph,
  type NativeMetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  layoutFixtureContext,
  layoutFixture,
} from "../../../../contracts/meta-entity-authoring/src/normalized-layout.fixtures.js";
import { coreFixtureId } from "../../../../contracts/meta-entity-authoring/src/normalized-core.fixtures.js";
import { sha256 } from "./deterministic.js";
import { createLegacyNativeNavigationAdapter } from "./legacy-native-navigation-adapter.js";
function fixture(two = false) {
  const c = layoutFixtureContext(),
    first = c.core.surface.find((s) => s.surfaceKind === "detail")!;
  const surfaces = two
    ? [
        first,
        {
          ...first,
          id: coreFixtureId(42),
          surfaceKey: "second",
          isDefault: false,
        },
      ]
    : [first];
  const sections = surfaces.map((s, i) => ({
    ...layoutFixture().section[0]!,
    id: coreFixtureId(60 + i),
    entitySurfaceId: s.id,
    navigationGroupId: coreFixtureId(70 + i),
  }));
  const source = {
    contractSchema: "athyper.meta-entity-contract/2.3",
    entity: {
      entityCode: "synthetic_reference",
      entityClass: "master",
      ownershipModel: "system",
    },
    fields: [],
    operations: [],
    runtimeProfiles: [],
    surfaceSections: [],
    surfaceFieldBindings: [],
    referenceMembers: emptyReferenceMembers(),
    fieldIdentities: [],
    surfaces: surfaces.map((s) => ({
      id: s.id,
      surfaceKey: s.surfaceKey,
      surfaceKind: "detail",
      layoutConfig: {
        recordPresentation: {
          titleField: "name",
          navigation: {
            mode: "scroll",
            tabs: [
              { key: "details", label: "Details", sectionKeys: ["details"] },
            ],
          },
        },
      },
    })),
  } as unknown as MetaEntityGraph;
  const input = {
    source,
    sourceHash: sha256(source),
    resource: {
      owner: "synthetic-tests",
      key: "navigation",
      version: 1,
      hash: "9".repeat(64),
    },
    labelResource: {
      owner: "synthetic-tests",
      key: "labels",
      version: 1,
      hash: "d".repeat(64),
    },
    mappings: Object.fromEntries(
      surfaces.map((s, i) => [
        s.id,
        {
          context: {
            surface: s,
            maximumSections: 10,
            label: () => ({ label: "Details" }),
          },
          sections: [sections[i]!],
          groups: {
            details: { id: coreFixtureId(70 + i), labelId: coreFixtureId(32) },
          },
        },
      ]),
    ),
  };
  const target = (prepared: MetaEntityGraph) =>
    ({
      ...prepared,
      contractSchema: "athyper.meta-entity-contract/2.4",
      fields: c.core.field,
      runtimeProfiles: c.core.runtime,
      surfaces,
      surfaceSections: sections,
    }) as unknown as NativeMetaEntityGraph;
  return { source, input, target };
}
it("normalizes multiple enrolled detail surfaces and reconstructs navigation from typed groups", () => {
  const f = fixture(true),
    before = structuredClone(f.source);
  const adapter = createLegacyNativeNavigationAdapter(f.input);
  const prepared = adapter.forward(f.source);
  expect(prepared.referenceMembers!.members.navigationGroup).toHaveLength(2);
  expect(
    (prepared.surfaces![0]!.layoutConfig!.recordPresentation as any).titleField,
  ).toBe("name");
  expect(
    (prepared.surfaces![0]!.layoutConfig!.recordPresentation as any).navigation,
  ).toBeUndefined();
  expect(adapter.reverse(prepared, f.target(prepared))).toEqual(f.source);
  const target = f.target(prepared);
  const changed = {
    ...target,
    referenceMembers: {
      ...target.referenceMembers!,
      members: {
        ...target.referenceMembers!.members,
        navigationGroup: target.referenceMembers!.members.navigationGroup.map(
          (g) => ({ ...g, sectionDisplay: "selected" as const }),
        ),
      },
    },
  };
  expect(
    (
      adapter.reverse(prepared, changed).surfaces![0]!.layoutConfig!
        .recordPresentation as any
    ).navigation.mode,
  ).toBe("switch");
  expect(f.source).toEqual(before);
});
it("deduplicates equal existing navigation declarations without deleting original member identities", () => {
  const f = fixture(),
    first = createLegacyNativeNavigationAdapter(f.input);
  const groups = first.forward(f.source).referenceMembers!.members
    .navigationGroup;
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
  const adapter = createLegacyNativeNavigationAdapter({
    ...f.input,
    source,
    sourceHash: sha256(source),
  });
  const prepared = adapter.forward(source);
  expect(prepared.referenceMembers!.members.navigationGroup).toEqual(groups);
  expect(adapter.reverse(prepared, f.target(prepared))).toEqual(source);
  const conflict = {
    ...source,
    referenceMembers: {
      ...source.referenceMembers!,
      members: {
        ...source.referenceMembers!.members,
        navigationGroup: groups.map((g) => ({
          ...g,
          sectionDisplay: "selected" as const,
        })),
      },
    },
  };
  expect(() =>
    createLegacyNativeNavigationAdapter({
      ...f.input,
      source: conflict,
      sourceHash: sha256(conflict),
    }),
  ).toThrow("NATIVE_NAVIGATION_SECTION_PRESENTATION_CONFLICT");
});
it("rejects stale source, missing enrollment and conflicting section semantics", () => {
  const f = fixture();
  expect(() =>
    createLegacyNativeNavigationAdapter({
      ...f.input,
      sourceHash: "0".repeat(64),
    }),
  ).toThrow("NATIVE_NAVIGATION_SOURCE_HASH_MISMATCH");
  expect(() =>
    createLegacyNativeNavigationAdapter({ ...f.input, mappings: {} }),
  ).toThrow("NATIVE_NAVIGATION_MAPPING_INVALID");
  const id = f.source.surfaces![0]!.id!,
    mapping = f.input.mappings[id]!;
  expect(() =>
    createLegacyNativeNavigationAdapter({
      ...f.input,
      mappings: {
        [id]: {
          ...mapping,
          sections: mapping.sections.map((s) => ({
            ...s,
            navigationGroupId: null,
          })),
        },
      },
    }),
  ).toThrow("NATIVE_NAVIGATION_SECTION_PRESENTATION_CONFLICT");
  const adapter = createLegacyNativeNavigationAdapter(f.input);
  expect(() =>
    adapter.forward({
      ...f.source,
      fields: [],
      operations: [{ id: coreFixtureId(99) }] as any,
    }),
  ).toThrow("NATIVE_NAVIGATION_SOURCE_HASH_MISMATCH");
});
