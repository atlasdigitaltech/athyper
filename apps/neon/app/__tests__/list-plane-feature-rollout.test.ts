import { describe, expect, it } from "vitest";
import { resolveRuntimeListFeaturesWithDiagnostics } from "@athyper/runtime-list/adapter";
import { createNeonAdapter } from "../../../../packages/apps/neon/src/list/createNeonAdapter";
import { meshAdapter } from "../../../../packages/apps/mesh/src/list/meshAdapter";
import { adminAdapter } from "../../../../packages/apps/admin/src/list/adminAdapter";

const neonAdapter = createNeonAdapter({
  fetchDescriptor: async () => null,
  fetchRecords: async () => ({ records: [] }),
});

describe("list feature plane rollout", () => {
  it.each([
    ["neon", neonAdapter, 500, "both"],
    ["mesh", meshAdapter, 200, "server"],
    ["admin", adminAdapter, 100, "server"],
  ] as const)("keeps %s fallback policy plane-local", (_plane, adapter, maxPageSize, searchMode) => {
    const result = resolveRuntimeListFeaturesWithDiagnostics({ adapterDefaults: adapter.features });

    expect(result.features.maxPageSize).toBe(maxPageSize);
    expect(result.features.searchMode).toBe(searchMode);
    expect(result.diagnostics.sources.maxPageSize).toBe("adapterDefault");
    expect(result.diagnostics.sources.searchMode).toBe("adapterDefault");
  });

  it("lets migrated entity metadata override the Neon compatibility fallback", () => {
    const result = resolveRuntimeListFeaturesWithDiagnostics({
      descriptor: {
        listPresentation: {
          viewModes: ["list", "compact", "excel"],
          features: {
            savedViews: true,
            maxPageSize: 200,
            searchMode: "both",
          },
        },
      },
      adapterDefaults: neonAdapter.features,
    });

    expect(result.features.maxPageSize).toBe(200);
    expect(result.diagnostics.sources.maxPageSize).toBe("descriptor");
    expect(result.diagnostics.sources.savedViews).toBe("descriptor");
    expect(result.diagnostics.sources.viewModes).toBe("descriptor");
  });
});
