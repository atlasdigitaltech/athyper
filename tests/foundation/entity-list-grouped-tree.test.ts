import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ListFieldDescriptorV1 } from "@athyper/contract-platform-entity-list";
import { groupChoices, groupHeadings, groupedPageState, headingFilter } from "../../packages/platform/entity/runtime/list-view/src/tree/grouped-tree-model";

const status = {
  key: "status", label: "Status", valueKind: "enum", defaultVisible: true, defaultOrder: 0, sortable: false, groupable: true, aggregations: [],
  filterOperators: ["eq", "is_null"],
  filterOptions: [{ value: "active", label: "Active" }, { value: "blocked", label: "Blocked for posting" }, { value: "deprecated", label: "Deprecated" }],
} as unknown as ListFieldDescriptorV1;
const flag = { ...status, key: "posting", valueKind: "boolean", filterOptions: undefined, filterOperators: ["eq"] } as unknown as ListFieldDescriptorV1;
const labels = { yes: "Yes", no: "No" };

describe("grouped tree headings", () => {
  it("under exact counts: published choice order, then No value, then Unmapped values; empty choices omitted", () => {
    const headings = groupHeadings(status, groupChoices(status, labels), [
      { value: "deprecated", count: 3 }, { value: null, count: 2 }, { value: "active", count: 57 }, { value: "legacy", count: 1 }, { value: "retired", count: 4 },
    ]);
    assert.deepEqual(headings.map((heading) => [heading.kind, heading.label ?? null, heading.count]), [
      ["choice", "Active", 57], ["choice", "Deprecated", 3], ["none", null, 2], ["unmapped", null, 5],
    ]);
    assert.deepEqual(headings.at(-1)!.values, ["legacy", "retired"]);
    assert.notEqual(headings[0]!.key, headings[1]!.key);
  });

  it("otherwise: every published choice with no counts and no query, No value when the field can be empty, no Unmapped values", () => {
    const headings = groupHeadings(status, groupChoices(status, labels), undefined);
    assert.deepEqual(headings.map((heading) => [heading.kind, heading.label ?? null, heading.count ?? null]), [
      ["choice", "Active", null], ["choice", "Blocked for posting", null], ["choice", "Deprecated", null], ["none", null, null],
    ]);
    assert.deepEqual(groupHeadings(flag, groupChoices(flag, labels), undefined).map((heading) => heading.label ?? heading.kind), ["Yes", "No"]);
  });

  it("selects a heading's records with eq or is_null; Unmapped values load per value", () => {
    const [active, , , none] = groupHeadings(status, groupChoices(status, labels), undefined);
    assert.deepEqual(headingFilter("status", active!), { field: "status", operator: "eq", value: "active" });
    assert.deepEqual(headingFilter("status", none!), { field: "status", operator: "is_null" });
    assert.equal(headingFilter("status", { key: "u", kind: "unmapped", values: ["legacy"] }), undefined);
  });

  it("turns the list's own page into a groups-only request under exact counts only", () => {
    const state = { groups: ["status", "region"], cursor: "abc", pageIndex: 2 };
    assert.deepEqual(groupedPageState(state, true), { groups: ["status", "region"], group: "status", groupsOnly: true, cursor: undefined, pageIndex: undefined });
    assert.deepEqual(groupedPageState(state, false), { groups: ["status", "region"], cursor: undefined, pageIndex: undefined });
    assert.equal(groupedPageState({ cursor: "x" }, true).cursor, "x");
  });
});
