import { describe, expect, it } from "vitest";
import type { CompiledEntity } from "@athyper/api-contracts/metadata";
import { resolveEntityListContract } from "../entity-list-contract";

function entity(overrides: {
  listFeatures?: Record<string, unknown>;
  searchEnabled?: boolean;
  searchFields?: string[];
} = {}): CompiledEntity {
  return {
    entity_id: "entity-1",
    entity_code: "invoice",
    slug: "invoice",
    entity_name: "Invoice",
    entity_class: "MASTER",
    table_schema: "document",
    table_name: "invoice",
    version_no: 1,
    version_hash: "hash",
    fields: [
      {
        id: "field-code",
        name: "code",
        column_name: "code",
        label: "Code",
        data_type: "text",
        is_searchable: true,
        is_filterable: true,
        is_sortable: true,
        is_pii: false,
        is_computed: false,
        sort_order: 1,
      },
    ],
    field_groups: [],
    display_config: {
      list_columns: ["code"],
      list_features: overrides.listFeatures,
    },
    search_config: {
      enabled: overrides.searchEnabled ?? true,
      fields: overrides.searchFields,
    },
    feature_flags: {},
    governance_level: "standard",
    security_tier: "standard",
    compiled_at: "2026-07-17T00:00:00.000Z",
    compiled_hash: "hash",
  } as unknown as CompiledEntity;
}

describe("entity list feature contract", () => {
  it("preserves explicit false values and canonicalizes boundary aliases", () => {
    const contract = resolveEntityListContract(entity({
      listFeatures: {
        savedViews: false,
        multiSort: true,
        maxSortLevels: 2.9,
        maxPageSize: 120.8,
      },
    }));

    expect(contract.listFeatures).toMatchObject({
      saved_views: false,
      multi_sort: true,
      max_sort_levels: 2,
      max_page_size: 120,
    });
  });

  it("uses list feature search mode ahead of inferred searchable fields", () => {
    const contract = resolveEntityListContract(entity({
      listFeatures: { search_mode: "both" },
    }));

    expect(contract.searchMode).toBe("both");
    expect(contract.searchableFieldNames).toEqual(["code"]);
  });

  it("disables server search when entity search metadata is disabled", () => {
    const contract = resolveEntityListContract(entity({
      listFeatures: { search_mode: "server" },
      searchEnabled: false,
    }));

    expect(contract.searchMode).toBe("client");
    expect(contract.searchableFieldNames).toEqual([]);
  });

  it("drops invalid feature values instead of widening the contract", () => {
    const contract = resolveEntityListContract(entity({
      listFeatures: {
        search_mode: "offline",
        max_page_size: -10,
        max_sort_levels: "many",
      },
    }));

    expect(contract.listFeatures).toEqual({});
    expect(contract.searchMode).toBe("server");
  });
});
