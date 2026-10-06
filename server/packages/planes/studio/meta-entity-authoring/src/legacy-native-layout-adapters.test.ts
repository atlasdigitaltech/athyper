import { expect, it } from "vitest";
import {
  coreFixtureId,
  coreFixtureRow,
} from "../../../../contracts/meta-entity-authoring/src/normalized-core.fixtures.js";
import { layoutFixture } from "../../../../contracts/meta-entity-authoring/src/normalized-layout.fixtures.js";
import {
  createLegacyNativeLayoutAdapters,
  type LegacyNativeLayoutAdapterInput,
} from "./legacy-native-layout-adapters.js";
import { sha256 } from "./deterministic.js";
function fixture(): LegacyNativeLayoutAdapterInput {
  const layout = layoutFixture();
  const surface = coreFixtureRow("surface", coreFixtureId(41), {
    surfaceKey: "detail",
    surfaceKind: "detail",
    labelId: coreFixtureId(32),
    layoutKind: "grid",
    isDefault: true,
  });
  const section = layout.section[0]!,
    binding = layout.binding[0]!;
  const sources = {
    surfaces: [
      {
        id: surface.id,
        surfaceKey: "detail",
        surfaceKind: "detail",
        title: "Details",
        layoutKind: "grid",
        isDefault: true,
      },
    ],
    surfaceSections: [
      {
        id: section.id,
        entitySurfaceId: surface.id,
        sectionKey: "details",
        sectionKind: "section",
        title: "Details",
        position: 0,
        columnCount: 2,
        collapsible: false,
        collapsedByDefault: false,
      },
    ],
    surfaceFieldBindings: [
      {
        id: binding.id,
        entitySurfaceId: surface.id,
        entitySurfaceSectionId: section.id,
        entityFieldId: binding.entityFieldId,
        bindingKey: "code",
        position: 0,
        columnSpan: 1,
        status: "active" as const,
      },
    ],
  };
  const resource = {
    owner: "component-test",
    key: "scalar-layout",
    version: 1,
    hash: "a".repeat(64),
  };
  return {
    ...sources,
    positionConvention: "zero-based",
    labelText: () => "Details",
    resources: {
      surfaces: resource,
      surfaceSections: resource,
      surfaceFieldBindings: resource,
    },
    mappings: {
      surfaces: {
        [surface.id]: {
          sourceHash: sha256(sources.surfaces[0]),
          initialization: surface,
        },
      },
      surfaceSections: {
        [section.id]: {
          sourceHash: sha256(sources.surfaceSections[0]),
          initialization: section,
        },
      },
      surfaceFieldBindings: {
        [binding.id]: {
          sourceHash: sha256(sources.surfaceFieldBindings[0]),
          initialization: binding,
        },
      },
    },
  };
}
it("reconstructs all three scalar families, preserving identities, absence and declared position boundary", () => {
  const input = fixture(),
    a = createLegacyNativeLayoutAdapters(input);
  expect(a.surfaces.reverse(a.surfaces.forward(input.surfaces))).toEqual(
    input.surfaces,
  );
  const sections = a.surfaceSections.forward(input.surfaceSections);
  expect(sections[0]!.position).toBe(1);
  expect(a.surfaceSections.reverse(sections)).toEqual(input.surfaceSections);
  expect(
    a.surfaceFieldBindings.reverse(
      a.surfaceFieldBindings.forward(input.surfaceFieldBindings),
    ),
  ).toEqual(input.surfaceFieldBindings);
});
it("reconstructs changed represented values instead of replaying captured source", () => {
  const input = fixture(),
    a = createLegacyNativeLayoutAdapters(input);
  const rows = a.surfaceSections
    .forward(input.surfaceSections)
    .map((r) => ({ ...r, position: 4, columnCount: 3 }));
  const reversed = a.surfaceSections.reverse(rows);
  expect(reversed[0]!.position).toBe(3);
  expect(reversed[0]!.columnCount).toBe(3);
  expect(input.surfaceSections[0]!.position).toBe(0);
});
it("rejects unrepresented normalized semantics and stale source hashes", () => {
  const input = fixture(),
    a = createLegacyNativeLayoutAdapters(input);
  expect(() =>
    a.surfaceSections.reverse(
      a.surfaceSections
        .forward(input.surfaceSections)
        .map((r) => ({ ...r, placement: "overflow" })),
    ),
  ).toThrow("NATIVE_LAYOUT_REVERSE_NOT_REPRESENTABLE");
  expect(() =>
    a.surfaces.forward(input.surfaces.map((r) => ({ ...r, isDefault: false }))),
  ).toThrow("NATIVE_LAYOUT_SOURCE_HASH_MISMATCH");
  expect(() =>
    createLegacyNativeLayoutAdapters({
      ...input,
      mappings: { ...input.mappings, surfaces: {} },
    }),
  ).toThrow("NATIVE_LAYOUT_MAPPING_INVENTORY_INVALID");
});
it("rejects nested blobs by path and checks admitted label text", () => {
  const input = fixture(),
    original = input.surfaces[0]!;
  const unsupported = {
    ...original,
    layoutConfig: { authorization: { permission: "unknown" } },
  };
  expect(() =>
    createLegacyNativeLayoutAdapters({
      ...input,
      surfaces: [unsupported],
      mappings: {
        ...input.mappings,
        surfaces: {
          [original.id!]: {
            ...input.mappings.surfaces[original.id!]!,
            sourceHash: sha256(unsupported),
          },
        },
      },
    }),
  ).toThrow("NATIVE_LAYOUT_LEGACY_PATH_UNSUPPORTED");
  expect(() =>
    createLegacyNativeLayoutAdapters({
      ...input,
      labelText: () => "Other label",
    }),
  ).toThrow("NATIVE_LAYOUT_LABEL_SOURCE_MISMATCH");
});
it("requires explicit order provenance and rejects deprecated or ambiguous navigation", () => {
  const input = fixture();
  const deprecated = { ...input.surfaces[0]!, status: "deprecated" as const };
  expect(() =>
    createLegacyNativeLayoutAdapters({
      ...input,
      surfaces: [deprecated],
      mappings: {
        ...input.mappings,
        surfaces: {
          [deprecated.id!]: {
            ...input.mappings.surfaces[deprecated.id!]!,
            sourceHash: sha256(deprecated),
          },
        },
      },
    }),
  ).toThrow("NATIVE_LAYOUT_LEGACY_STATUS_UNSUPPORTED");
  expect(() =>
    createLegacyNativeLayoutAdapters({
      ...input,
      positionConvention: "unknown" as "zero-based",
    }),
  ).toThrow("NATIVE_LAYOUT_POSITION_SOURCE_REQUIRED");
  const section = { ...input.surfaceSections[0]!, sectionKind: "group" };
  expect(() =>
    createLegacyNativeLayoutAdapters({
      ...input,
      surfaceSections: [section],
      mappings: {
        ...input.mappings,
        surfaceSections: {
          [section.id!]: {
            ...input.mappings.surfaceSections[section.id!]!,
            sourceHash: sha256(section),
          },
        },
      },
    }),
  ).toThrow();
});

it("blocks an actual reference surface until all nested declarations have normalized mappings", async () => {
  const { readFileSync } = await import("node:fs");
  const { parseSharedReferenceProduct, compileSharedReferenceProduct } =
    await import("./authoring/product.js");
  const product = parseSharedReferenceProduct(
    JSON.parse(
      readFileSync(
        new URL(
          "../../../../../../metadata/entities/common/reference/country/definition.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
  const surface = compileSharedReferenceProduct(product, "studio").graph
    .surfaces![0]!;
  const input = fixture(),
    seed = Object.values(input.mappings.surfaces)[0]!.initialization;
  expect(() =>
    createLegacyNativeLayoutAdapters({
      ...input,
      surfaces: [surface],
      mappings: {
        ...input.mappings,
        surfaces: {
          [surface.id!]: {
            sourceHash: sha256(surface),
            initialization: { ...seed, id: surface.id! },
          },
        },
      },
    }),
  ).toThrow("NATIVE_LAYOUT_LEGACY_PATH_UNSUPPORTED");
});

it("reconstructs nested list controls and readable identity through the production adapter without source replay", async () => {
  const { coreFixture, coreFixtureContext } =
    await import("../../../../contracts/meta-entity-authoring/src/normalized-core.fixtures.js");
  const { layoutFixtureContext } =
    await import("../../../../contracts/meta-entity-authoring/src/normalized-layout.fixtures.js");
  const core = coreFixture(),
    context = coreFixtureContext(),
    surface = core.surface[0]!;
  const resource = {
    owner: "synthetic-tests",
    key: "provider",
    version: 1,
    hash: "e".repeat(64),
  };
  const source = {
    id: surface.id,
    surfaceKey: "list",
    surfaceKind: "list",
    title: "Details",
    layoutConfig: {
      identityField: "code",
      iconKey: "globe",
      supportedModes: ["table"],
      limits: {
        defaultPageSize: 25,
        allowedPageSizes: [10, 25, 50],
        maxSortLevels: 3,
        countMode: "exact",
      },
    },
  };
  const f = fixture();
  const adapter = createLegacyNativeLayoutAdapters({
    ...f,
    surfaces: [source],
    listSettings: {
      [surface.id]: {
        surfaceId: surface.id,
        provider: resource,
        modes: ["table"],
        countModes: ["exact"],
        maximumPageSize: 50,
        maximumPageSizeChoices: 10,
        maximumSortLevels: 3,
        maximumFilters: 20,
        maximumFilterDepth: 3,
      },
    },
    surfaceIdentities: {
      [surface.id]: {
        entityId: context.entityId,
        tenantId: null,
        resource,
        fields: core.field,
        identities: context.identities,
        presentation: layoutFixtureContext().fieldPresentation,
        maximumFields: 10,
      },
    },
    mappings: {
      ...f.mappings,
      surfaces: {
        [surface.id]: { sourceHash: sha256(source), initialization: surface },
      },
    },
  });
  const native = adapter.surfaces.forward([source]);
  expect(adapter.surfaces.dependencies).toEqual([resource]);
  expect(adapter.surfaces.reverse(native)).toEqual([source]);
  const changed = native.map((row) => ({
    ...row,
    defaultPageSize: 50,
    identityFieldId: coreFixtureId(3),
  }));
  expect(adapter.surfaces.reverse(changed)[0]!.layoutConfig).toEqual({
    ...source.layoutConfig,
    identityField: "name",
    limits: { ...source.layoutConfig.limits, defaultPageSize: 50 },
  });
  expect(() =>
    adapter.surfaces.reverse(native.map((row) => ({ ...row, maxFilters: 21 }))),
  ).toThrow("NATIVE_LIST_SETTINGS_CAPABILITY_DENIED");
});
it("maps explicit legacy column width into the typed binding and compiles edits without replay", () => {
  const f = fixture();
  const binding = {
    ...f.surfaceFieldBindings[0]!,
    displayConfig: { defaultWidth: 240 },
  };
  const input = {
    ...f,
    surfaceFieldBindings: [binding],
    mappings: {
      ...f.mappings,
      surfaceFieldBindings: {
        [binding.id!]: {
          ...f.mappings.surfaceFieldBindings[binding.id!]!,
          sourceHash: sha256(binding),
        },
      },
    },
  };
  const a = createLegacyNativeLayoutAdapters(input).surfaceFieldBindings;
  const rows = a.forward(input.surfaceFieldBindings);
  expect(rows[0]!.width).toBe(240);
  expect(a.reverse(rows)).toEqual(input.surfaceFieldBindings);
  expect(
    a.reverse(rows.map((r) => ({ ...r, width: 320 })))[0]!.displayConfig,
  ).toEqual({ defaultWidth: 320 });
  expect(() => a.reverse(rows.map((r) => ({ ...r, width: 32 })))).toThrow(
    "NATIVE_LAYOUT_WIDTH_RUNTIME_UNSUPPORTED",
  );
  for (const displayConfig of [
    { defaultWidth: 0 },
    { defaultWidth: 47 },
    { defaultWidth: 1201 },
    { defaultWidth: 1.5 },
    { defaultWidth: "240" },
    { defaultWidth: 240, widget: "unknown" },
    {},
  ]) {
    const invalid = { ...binding, displayConfig };
    expect(() =>
      createLegacyNativeLayoutAdapters({
        ...input,
        surfaceFieldBindings: [invalid],
        mappings: {
          ...input.mappings,
          surfaceFieldBindings: {
            [binding.id!]: {
              ...input.mappings.surfaceFieldBindings[binding.id!]!,
              sourceHash: sha256(invalid),
            },
          },
        },
      }),
    ).toThrow();
  }
});
