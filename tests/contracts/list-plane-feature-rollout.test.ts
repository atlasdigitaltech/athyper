import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveRuntimeListFeaturesWithDiagnostics } from "../../packages/shared/runtime-domain/runtime-list/src/adapter/index";
import { adminAdapter } from "../../packages/apps/admin/src/list/index";
import { createMeshAdapter } from "../../packages/apps/mesh/src/list/index";
import { createNeonAdapter } from "../../packages/apps/neon/src/list/index";

const neonAdapter = createNeonAdapter({
  fetchDescriptor: async () => null,
  fetchRecords: async () => ({ records: [] }),
});
const meshAdapter = createMeshAdapter({
  fetchDescriptor: async () => null,
  fetchRecords: async () => ({ records: [] }),
});

describe("list feature plane rollout contract", () => {
  for (const [plane, adapter, maxPageSize, searchMode] of [
    ["neon", neonAdapter, 500, "both"],
    ["mesh", meshAdapter, 200, "server"],
    ["admin", adminAdapter, 100, "server"],
  ] as const) {
    it(`keeps ${plane} fallback policy plane-local`, () => {
      const result = resolveRuntimeListFeaturesWithDiagnostics({ adapterDefaults: adapter.features });

      assert.equal(result.features.maxPageSize, maxPageSize);
      assert.equal(result.features.searchMode, searchMode);
      assert.equal(result.diagnostics.sources.maxPageSize, "adapterDefault");
      assert.equal(result.diagnostics.sources.searchMode, "adapterDefault");
    });
  }

  it("lets entity metadata override the Neon compatibility fallback", () => {
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

    assert.equal(result.features.maxPageSize, 200);
    assert.equal(result.diagnostics.sources.maxPageSize, "descriptor");
    assert.equal(result.diagnostics.sources.savedViews, "descriptor");
    assert.equal(result.diagnostics.sources.viewModes, "descriptor");
  });
});
