import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EntityListDescriptorV1, ListFieldDescriptorV1 } from "@athyper/contract-platform-entity-list";
import { parseStoredListState } from "../../packages/platform/entity/runtime/list-view/src/preferences";

const field = (key: string, valueKind: ListFieldDescriptorV1["valueKind"], filterOperators: ListFieldDescriptorV1["filterOperators"]): ListFieldDescriptorV1 =>
  ({ key, label: key, valueKind, defaultVisible: true, defaultOrder: 0, filterOperators, sortable: true, groupable: valueKind === "enum", aggregations: [] });
const descriptor = {
  entity: { identityField: "code" },
  fields: [field("code", "string", ["eq", "contains"]), field("status", "enum", ["eq", "in"]), field("due_on", "date", ["gte", "lt"])],
  surface: { supportedModes: ["table", "compact"], defaultState: { mode: "table" } },
  limits: { maxSortLevels: 2, allowedPageSizes: [10], defaultPageSize: 10 },
} as unknown as EntityListDescriptorV1;
const saved = (filters: unknown[], extra: Record<string, unknown> = {}) =>
  ({ filters, sort: [{ field: "code", direction: "asc" }], columns: ["code", "status"], density: "comfortable", mode: "table", ...extra });

describe("stored list views apply exactly as saved or not at all", () => {
  it("keeps a view whose filters all still apply", () => {
    const state = parseStoredListState(saved([{ field: "status", operator: "in", value: ["open"] }, { field: "due_on", operator: "gte", value: "2026-10-01" }]), descriptor);
    assert.equal(state.filters.length, 2);
  });

  it("refuses a view whose filter field no longer exists", () => {
    assert.throws(() => parseStoredListState(saved([{ field: "retired_field", operator: "eq", value: "x" }]), descriptor), /no longer applies/);
  });

  it("refuses a view whose operator the field no longer permits", () => {
    assert.throws(() => parseStoredListState(saved([{ field: "status", operator: "contains", value: "op" }]), descriptor), /no longer applies/);
  });

  it("refuses a view with a date value that is not written as YYYY-MM-DD", () => {
    assert.throws(() => parseStoredListState(saved([{ field: "due_on", operator: "gte", value: "2026-10-01T00:00:00" }]), descriptor), /YYYY-MM-DD/);
  });

  it("refuses a view whose sort no longer applies, and drops grouping fields that no longer qualify", () => {
    assert.throws(() => parseStoredListState(saved([], { sort: [{ field: "retired_field", direction: "asc" }] }), descriptor), /no longer applies/);
    // Grouping is display state: an ineligible field is dropped and the rest
    // move up (Tree blueprint section 5.1), never retiring the view.
    assert.equal(parseStoredListState(saved([], { group: "code" }), descriptor).groups, undefined);
  });
});
