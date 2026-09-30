import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ListFieldDescriptorV1 } from "@athyper/contract-platform-entity-list";
import { groupAvailableColumns, matchesColumnSearch, reorderColumn } from "../../packages/platform/entity/runtime/list-view/src/columns";

const field = (key: string, label: string, valueKind: ListFieldDescriptorV1["valueKind"], options: Partial<ListFieldDescriptorV1> = {}): ListFieldDescriptorV1 => ({ key, label, valueKind, defaultVisible: false, defaultOrder: 0, filterOperators: [], sortable: false, groupable: false, aggregations: [], ...options });

describe("entity list column browser", () => {
  it("searches labels, technical keys, semantic roles, types, and metadata groups", () => {
    const country = field("registration_country_code", "Country", "string", { semanticRole: "country_code", columnGroup: "Registration" });
    assert.equal(matchesColumnSearch(country, "country"), true);
    assert.equal(matchesColumnSearch(country, "registration_country"), true);
    assert.equal(matchesColumnSearch(country, "country-code"), true);
    assert.equal(matchesColumnSearch(country, "Registration"), true);
    assert.equal(matchesColumnSearch(country, "money"), false);
  });

  it("honours metadata groups and provides deterministic fallback groups", () => {
    const groups = groupAvailableColumns([
      field("custom", "Custom", "string", { columnGroup: "Commercial" }),
      field("status", "Status", "enum"),
      field("updated_at", "Updated", "datetime", { semanticRole: "updated_at" }),
      field("owner", "Owner", "reference"),
      field("legal_name", "Legal name", "string", { defaultVisible: true }),
    ]);
    assert.deepEqual(groups.map((group) => group.label), ["Recommended fields", "Status and classification", "Related records", "Audit and system fields", "Commercial"]);
  });

  it("reorders before or after a target without mutating the input", () => {
    const original = ["code", "name", "status", "updated_at"];
    assert.deepEqual(reorderColumn(original, "code", "status", "after"), ["name", "status", "code", "updated_at"]);
    assert.deepEqual(reorderColumn(original, "updated_at", "name", "before"), ["code", "updated_at", "name", "status"]);
    assert.deepEqual(original, ["code", "name", "status", "updated_at"]);
  });
});
