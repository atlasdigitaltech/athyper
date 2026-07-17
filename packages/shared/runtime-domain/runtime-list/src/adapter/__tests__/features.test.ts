import { describe, expect, it } from "vitest";
import {
  normalizeRuntimeListFeatures,
  resolveRuntimeListFeatures,
  resolveRuntimeListFeaturesWithDiagnostics,
} from "../types";

describe("runtime list feature resolution", () => {
  it("preserves explicit entity false values over adapter defaults", () => {
    const result = resolveRuntimeListFeatures({
      descriptor: {
        listPresentation: {
          features: {
            savedViews: false,
            grouping: false,
          },
          viewModes: ["list"],
        },
      },
      adapterDefaults: {
        savedViews: true,
        grouping: true,
        viewModes: ["list", "compact", "excel"],
        maxPageSize: 500,
      },
    });

    expect(result.savedViews).toBe(false);
    expect(result.grouping).toBe(false);
    // View-mode restrictions remain in listPresentation.viewModes and are
    // intersected by the presenter after this feature resolution step.
    expect(result.viewModes).toEqual(["list", "compact", "excel"]);
  });

  it("applies entity overrides before adapter defaults and safe fallbacks", () => {
    const result = resolveRuntimeListFeatures({
      descriptor: { listPresentation: undefined },
      applicationDefaults: { maxPageSize: 100, multiSort: true },
      adapterDefaults: { maxPageSize: 200, maxSortLevels: 4 },
      entityOverride: { maxPageSize: 50, maxSortLevels: 2 },
    });

    expect(result.maxPageSize).toBe(50);
    expect(result.maxSortLevels).toBe(2);
    expect(result.multiSort).toBe(true);
  });

  it("keeps descriptor limits inside adapter policy ceilings", () => {
    const result = resolveRuntimeListFeatures({
      descriptor: {
        listPresentation: {
          features: { maxPageSize: 500, maxSortLevels: 5, multiSort: true },
        },
      },
      adapterDefaults: { maxPageSize: 100, maxSortLevels: 3, multiSort: true },
    });

    expect(result.maxPageSize).toBe(100);
    expect(result.maxSortLevels).toBe(3);
  });

  it("does not treat omitted descriptor fields as explicit false values", () => {
    const result = resolveRuntimeListFeatures({
      descriptor: { listPresentation: { features: { maxPageSize: 50 } } },
      adapterDefaults: {
        savedViews: true,
        grouping: true,
        viewModes: ["list", "compact"],
        maxPageSize: 200,
      },
    });

    expect(result.savedViews).toBe(true);
    expect(result.grouping).toBe(true);
    expect(result.maxPageSize).toBe(50);
  });

  it("validates view modes and clamps policy limits", () => {
    const result = normalizeRuntimeListFeatures({
      multiSort: true,
      maxSortLevels: 99,
      maxPageSize: 5000,
      viewModes: ["excel", "excel", "invalid" as never],
      searchMode: "invalid" as never,
    });

    expect(result.maxSortLevels).toBe(5);
    expect(result.maxPageSize).toBe(500);
    expect(result.viewModes).toEqual(["excel"]);
    expect(result.searchMode).toBe("both");
  });

  it("forces a single sort level when multi-sort is disabled", () => {
    const result = normalizeRuntimeListFeatures({
      multiSort: false,
      maxSortLevels: 5,
    });

    expect(result.multiSort).toBe(false);
    expect(result.maxSortLevels).toBe(1);
  });

  it("uses descriptor search mode ahead of entity and adapter fallbacks", () => {
    const result = resolveRuntimeListFeatures({
      descriptor: {
        listPresentation: { features: { searchMode: "client" } },
      },
      entityOverride: { searchMode: "server" },
      adapterDefaults: { searchMode: "both" },
      applicationDefaults: { searchMode: "server" },
    });

    expect(result.searchMode).toBe("client");
  });

  it("uses the nearest configured fallback when descriptor metadata is absent", () => {
    const entityResult = resolveRuntimeListFeatures({
      entityOverride: { searchMode: "client" },
      adapterDefaults: { searchMode: "server" },
      applicationDefaults: { searchMode: "both" },
    });
    const adapterResult = resolveRuntimeListFeatures({
      adapterDefaults: { searchMode: "server" },
      applicationDefaults: { searchMode: "both" },
    });

    expect(entityResult.searchMode).toBe("client");
    expect(adapterResult.searchMode).toBe("server");
  });

  it("reports the effective source for descriptor, override, adapter, and safe values", () => {
    const result = resolveRuntimeListFeaturesWithDiagnostics({
      descriptor: {
        listPresentation: {
          viewModes: ["list", "excel"],
          features: { savedViews: false, maxPageSize: 80 },
        },
      },
      entityOverride: { grouping: true, maxPageSize: 120 },
      adapterDefaults: { export: true, maxPageSize: 200 },
    });

    expect(result.features).toMatchObject({
      savedViews: false,
      grouping: true,
      export: true,
      import: false,
      maxPageSize: 80,
    });
    expect(result.diagnostics.sources).toMatchObject({
      savedViews: "descriptor",
      grouping: "entityOverride",
      export: "adapterDefault",
      import: "safeDefault",
      viewModes: "descriptor",
      maxPageSize: "descriptor",
    });
  });

  it("attributes a tightened policy limit to the layer that supplied the ceiling", () => {
    const result = resolveRuntimeListFeaturesWithDiagnostics({
      descriptor: { listPresentation: { features: { multiSort: true, maxSortLevels: 5 } } },
      entityOverride: { maxSortLevels: 4 },
      adapterDefaults: { maxSortLevels: 2 },
      applicationDefaults: { maxSortLevels: 3 },
    });

    expect(result.features.maxSortLevels).toBe(2);
    expect(result.diagnostics.sources.maxSortLevels).toBe("adapterDefault");
    expect(result.diagnostics.sources.multiSort).toBe("descriptor");
  });
});
