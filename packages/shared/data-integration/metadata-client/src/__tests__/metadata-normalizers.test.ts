import { describe, expect, it } from "vitest";
import {
  normalizeEntityFeatureFlags,
  normalizeEntityListFeatures,
} from "@athyper/api-contracts/metadata-normalizers";

describe("metadata boundary normalizers", () => {
  it("canonicalizes feature flag aliases without losing explicit false", () => {
    expect(normalizeEntityFeatureFlags({
      export_enabled: "false",
      allow_bulk_edit: true,
      approval_workflow: true,
    })).toMatchObject({
      is_exportable: false,
      is_bulk_editable: true,
      is_approvable: true,
      has_workflow: true,
    });
  });

  it("normalizes list feature aliases and keeps view modes out of the feature policy", () => {
    expect(normalizeEntityListFeatures({
      savedViews: true,
      grouping: false,
      multi_sort: true,
      maxSortLevels: 2.8,
      max_page_size: 200.9,
      view_modes: ["table", "spreadsheet"],
    })).toEqual({
      saved_views: true,
      grouping: false,
      multi_sort: true,
      max_sort_levels: 2,
      max_page_size: 200,
      view_modes: ["table", "spreadsheet"],
    });
  });

  it("drops invalid search mode values instead of inventing a policy", () => {
    expect(normalizeEntityListFeatures({ searchMode: "offline" })).toBeUndefined();
  });
});
