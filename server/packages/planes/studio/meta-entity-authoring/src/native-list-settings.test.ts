import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { coreFixture } from "../../../../contracts/meta-entity-authoring/src/normalized-core.fixtures.js";
import {
  compileSharedReferenceProduct,
  parseSharedReferenceProduct,
} from "./authoring/product.js";
import { sha256 } from "./deterministic.js";
import {
  compileNativeListSettings,
  convertLegacyListSettings,
  type LegacyListSettings,
  type NativeListSettingsContext,
} from "./native-list-settings.js";
function fixture() {
  const surface = coreFixture().surface[0]!;
  const c: NativeListSettingsContext = {
    surfaceId: surface.id,
    provider: {
      owner: "synthetic-tests",
      key: "list-provider",
      version: 1,
      hash: "e".repeat(64),
    },
    modes: ["table", "compact"],
    countModes: ["exact", "none"],
    maximumPageSize: 100,
    maximumPageSizeChoices: 10,
    maximumSortLevels: 3,
    maximumFilters: 20,
    maximumFilterDepth: 3,
  };
  const source: LegacyListSettings = {
    supportedModes: ["table", "compact"],
    limits: {
      defaultPageSize: 25,
      allowedPageSizes: [10, 25, 50],
      maxSortLevels: 3,
      countMode: "exact",
    },
  };
  return { surface, c, source };
}
it.each(["country", "state_region"])(
  "maps %s's actual list controls through typed columns",
  (name) => {
    const graph = compileSharedReferenceProduct(
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
    const layout = graph.surfaces!.find(
      (s) => s.surfaceKind === "list",
    )!.layoutConfig!;
    const source = {
      supportedModes: layout.supportedModes,
      limits: layout.limits,
    } as LegacyListSettings;
    const f = fixture(),
      surface = { ...f.surface, maxPageSize: 100 };
    const native = convertLegacyListSettings(
      source,
      surface,
      f.c,
      sha256(source),
    );
    expect(compileNativeListSettings(native, f.c, [])).toEqual(source);
    expect(native.id).toBe(surface.id);
    expect(surface.allowedPageSizes).toEqual([10, 25, 50]);
  },
);
it("preserves optional limit absence and reconstructs updated controls from typed rows", () => {
  const f = fixture();
  const native = convertLegacyListSettings(
    f.source,
    f.surface,
    f.c,
    sha256(f.source),
  );
  expect(compileNativeListSettings(native, f.c, [])).toEqual(f.source);
  expect(
    compileNativeListSettings(
      {
        ...native,
        defaultPageSize: 50,
        maxFilters: 10,
      },
      f.c,
    ),
  ).toMatchObject({
    limits: {
      defaultPageSize: 50,
      maxFilters: 10,
      maxFilterDepth: 3,
      maxPageSize: 50,
    },
  });
  const source = {
    ...f.source,
    limits: {
      ...f.source.limits,
      maxPageSize: 100,
      maxFilters: 10,
      maxFilterDepth: 2,
    },
  };
  expect(
    compileNativeListSettings(
      convertLegacyListSettings(source, f.surface, f.c, sha256(source)),
      f.c,
    ),
  ).toEqual(source);
});
it("rejects unadmitted modes/counts, inconsistent page choices and excessive provider work", () => {
  const f = fixture();
  for (const limits of [
    { ...f.source.limits, allowedPageSizes: [25, 101] },
    { ...f.source.limits, defaultPageSize: 26 },
    { ...f.source.limits, allowedPageSizes: [25, 25] },
    { ...f.source.limits, maxSortLevels: 4 },
    { ...f.source.limits, countMode: "estimated" as const },
    { ...f.source.limits, maxFilters: 21 },
    { ...f.source.limits, maxFilterDepth: 4 },
    { ...f.source.limits, maxPageSize: 20 },
  ]) {
    const source = { ...f.source, limits };
    expect(() =>
      convertLegacyListSettings(source, f.surface, f.c, sha256(source)),
    ).toThrow("NATIVE_LIST_SETTINGS_CAPABILITY_DENIED");
  }
  expect(() =>
    convertLegacyListSettings(
      f.source,
      f.surface,
      { ...f.c, modes: ["table"] },
      sha256(f.source),
    ),
  ).toThrow("NATIVE_LIST_SETTINGS_CAPABILITY_DENIED");
  expect(() =>
    compileNativeListSettings({ ...f.surface, maxFilters: 21 }, f.c, []),
  ).toThrow("NATIVE_LIST_SETTINGS_CAPABILITY_DENIED");
  expect(() =>
    compileNativeListSettings({ ...f.surface, maxPageSize: 20 }, f.c, []),
  ).toThrow("NATIVE_LIST_SETTINGS_CAPABILITY_DENIED");
});
it("rejects stale hashes, unknown properties and cross-surface provider evidence", () => {
  const f = fixture();
  expect(() =>
    convertLegacyListSettings(f.source, f.surface, f.c, "0".repeat(64)),
  ).toThrow("NATIVE_LIST_SETTINGS_SOURCE_HASH_MISMATCH");
  expect(() =>
    convertLegacyListSettings(
      { ...f.source, custom: {} } as LegacyListSettings,
      f.surface,
      f.c,
      sha256(f.source),
    ),
  ).toThrow();
  expect(() =>
    compileNativeListSettings(f.surface, {
      ...f.c,
      surfaceId: "00000000-0000-0000-0000-000000000099",
    }),
  ).toThrow("NATIVE_LIST_SETTINGS_PROVIDER_INVALID");
  expect(() =>
    compileNativeListSettings(f.surface, { ...f.c, modes: ["table", "table"] }),
  ).toThrow("NATIVE_LIST_SETTINGS_PROVIDER_INVALID");
  expect(() =>
    compileNativeListSettings(f.surface, f.c, ["maxPageSize", "maxPageSize"]),
  ).toThrow("NATIVE_LIST_SETTINGS_PROJECTION_INVALID");
});
