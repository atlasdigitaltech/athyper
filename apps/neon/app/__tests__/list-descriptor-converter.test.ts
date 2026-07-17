import { describe, expect, it } from "vitest";
import type { MetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";
import { compileMetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";
import { toRuntimeDescriptor } from "../../../../packages/apps/neon/src/list/descriptorConverter";

function descriptor(displayConfig: Record<string, unknown>): MetaEntityRuntimeDescriptor {
  return {
    entityCode: "journal_entry",
    entityName: "Journal Entry",
    routeSlug: "journal_entry",
    source: { tableSchema: "public", tableName: "journal_entry" },
    capabilities: { canCreate: true },
    policy: { hasFieldSecurity: false },
    fields: [],
    operations: [],
    extensions: { displayConfig },
  } as unknown as MetaEntityRuntimeDescriptor;
}

describe("Neon list descriptor conversion", () => {
  it("preserves explicit false list feature values", () => {
    const result = toRuntimeDescriptor(descriptor({
      list_features: { saved_views: false, grouping: false },
    }));

    expect(result.listPresentation?.features).toMatchObject({
      savedViews: false,
      grouping: false,
    });
  });

  it("accepts legacy camelCase list feature aliases at the boundary", () => {
    const result = toRuntimeDescriptor(descriptor({
      listFeatures: { savedViews: true, maxPageSize: 200 },
    }));

    expect(result.listPresentation?.features).toMatchObject({
      savedViews: true,
      maxPageSize: 200,
    });
  });

  it("drops invalid feature values without changing canonical view modes", () => {
    const result = toRuntimeDescriptor(descriptor({
      list_features: { search_mode: "offline", view_modes: ["spreadsheet"] },
      view_modes: ["table", "spreadsheet"],
    }));

    expect(result.listPresentation?.features?.searchMode).toBeUndefined();
    expect(result.listPresentation?.viewModes).toEqual(["list", "excel"]);
  });

  it("keeps compiler output and direct descriptor conversion in feature parity", () => {
    const displayConfig = {
      list_renderer: "spreadsheet",
      view_modes: ["table", "spreadsheet"],
      list_features: {
        saved_views: false,
        multi_sort: true,
        max_sort_levels: 2,
        search_mode: "server",
        max_page_size: 100,
      },
    };
    const compiled = compileMetaEntityRuntimeDescriptor({
      entity_id: "entity-invoice",
      version_id: "version-invoice",
      version_no: 1,
      version_hash: "hash",
      entity_code: "invoice",
      slug: "invoice",
      entity_name: "Invoice",
      entity_class: "MASTER",
      table_schema: "master",
      table_name: "invoice",
      backing_type: "table",
      fields: [{
        id: "field-code",
        name: "code",
        column_name: "code",
        label: "Code",
        data_type: "text",
        sort_order: 1,
      }],
      display_config: displayConfig,
    });

    const fromCompiler = toRuntimeDescriptor(compiled);
    const fromBoundaryFixture = toRuntimeDescriptor(descriptor(displayConfig));

    expect(fromCompiler.listPresentation).toEqual(fromBoundaryFixture.listPresentation);
  });
});
