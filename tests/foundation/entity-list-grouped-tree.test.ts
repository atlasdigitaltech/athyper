import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ListFieldDescriptorV1 } from "@athyper/contract-platform-entity-list";
import { bucketDays, combineAggregates, groupAggregates, groupChoices, groupHeadings, groupLevel, groupedPageState, headingFilters } from "../../packages/platform/entity/runtime/list-view/src/tree/grouped-tree-model";

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
    assert.deepEqual(headingFilters(status, active!), [{ field: "status", operator: "eq", value: "active" }]);
    assert.deepEqual(headingFilters(status, none!), [{ field: "status", operator: "is_null" }]);
    assert.equal(headingFilters(status, { key: "u", kind: "unmapped", values: ["legacy"] }), undefined);
  });

  it("turns the list's own page into a groups-only request under exact counts only", () => {
    const state = { groups: ["status", "region"], cursor: "abc", pageIndex: 2 };
    assert.deepEqual(groupedPageState(state, true), { groups: ["status", "region"], group: "status", groupsOnly: true, cursor: undefined, pageIndex: undefined });
    assert.deepEqual(groupedPageState(state, false), { groups: ["status", "region"], cursor: undefined, pageIndex: undefined });
    assert.equal(groupedPageState({ cursor: "x" }, true).cursor, "x");
  });
});

describe("group aggregates and date buckets (A2, A3)", () => {
  const due = { ...status, key: "due", valueKind: "date", filterOptions: undefined, filterOperators: ["gte", "lt", "is_null"] } as unknown as ListFieldDescriptorV1;
  const posted = { ...due, key: "posted", valueKind: "datetime" } as unknown as ListFieldDescriptorV1;

  it("reads date levels and the days a bucket covers", () => {
    assert.deepEqual(groupLevel("due:month"), { field: "due", unit: "month" });
    assert.deepEqual(groupLevel("status"), { field: "status" });
    assert.deepEqual(bucketDays("2026-12"), { start: "2026-12-01", end: "2027-01-01" });
    assert.deepEqual(bucketDays("2026-Q4"), { start: "2026-10-01", end: "2027-01-01" });
    assert.deepEqual(bucketDays("2026-Q1"), { start: "2026-01-01", end: "2026-04-01" });
  });

  it("draws date buckets in order from the group query, with No value, and selects each by gte and lt", () => {
    const headings = groupHeadings(due, [], [{ value: "2026-09", count: 2 }, { value: "2026-10", count: 3 }, { value: null, count: 1 }], "month");
    assert.deepEqual(headings.map((heading) => [heading.kind, heading.value ?? null, heading.count]), [["choice", "2026-09", 2], ["choice", "2026-10", 3], ["none", null, 1]]);
    assert.deepEqual(headingFilters(due, headings[1]!, "month"), [{ field: "due", operator: "gte", value: "2026-10-01" }, { field: "due", operator: "lt", value: "2026-11-01" }]);
    // A datetime bucket uses the zoned start of those days.
    const zoned = headingFilters(posted, headings[1]!, "month", "Asia/Kuala_Lumpur")!;
    assert.deepEqual(zoned.map((filter) => [filter.operator, filter.value]), [["gte", "2026-09-30T16:00:00.000Z"], ["lt", "2026-10-31T16:00:00.000Z"]]);
  });

  it("asks for the first non-count aggregate of each visible numeric column, and combines Unmapped values without averages", () => {
    const descriptor = { fields: [{ key: "budget", valueKind: "money", aggregations: ["count", "sum"] }, { key: "name", valueKind: "string", aggregations: ["count"] }, { key: "rate", valueKind: "decimal", aggregations: ["average"] }] } as never;
    assert.deepEqual(groupAggregates(descriptor, ["name", "budget", "rate"]), ["budget:sum", "rate:average"]);
    assert.deepEqual(combineAggregates([{ aggregates: { "budget:sum": 2, "rate:average": 1 } }, { aggregates: { "budget:sum": "3.5", "rate:average": 4 } }]), { aggregates: { "budget:sum": 5.5 } });
    // Exact: a large decimal total stays exact text.
    assert.deepEqual(combineAggregates([{ aggregates: { "amount:sum": "1234567890123456.78" } }, { aggregates: { "amount:sum": "0.01" } }]).aggregates, { "amount:sum": "1234567890123456.79" });
    // Money combines only within one currency.
    assert.deepEqual(combineAggregates([{ aggregates: { "amount:sum": 1 }, aggregateCurrencies: { "amount:sum": "MYR" } }, { aggregates: { "amount:sum": 2 }, aggregateCurrencies: { "amount:sum": "MYR" } }]), { aggregates: { "amount:sum": 3 }, aggregateCurrencies: { "amount:sum": "MYR" } });
    assert.deepEqual(combineAggregates([{ aggregates: { "amount:sum": 1 }, aggregateCurrencies: { "amount:sum": "MYR" } }, { aggregates: { "amount:sum": 2 }, aggregateCurrencies: { "amount:sum": "USD" } }]), { aggregates: { "amount:sum": null }, mixedCurrencies: ["amount:sum"] });
    const headings = groupHeadings(status, [{ value: "active", label: "Active" }], [{ value: "active", count: 1, aggregates: { "budget:sum": 10 } }, { value: "legacy", count: 1, aggregates: { "budget:sum": 4 } }, { value: "retired", count: 1, aggregates: { "budget:sum": 6 } }]);
    assert.deepEqual(headings.map((heading) => heading.aggregates), [{ "budget:sum": 10 }, { "budget:sum": 10 }]);
  });

  it("sends aggregates and the zone with the level-1 groups-only request", () => {
    const page = groupedPageState({ groups: ["due:month"] }, true, { aggregates: ["budget:sum"], timeZone: "Asia/Kuala_Lumpur" });
    assert.deepEqual([page.group, page.groupsOnly, page.aggregates, page.timeZone], ["due:month", true, ["budget:sum"], "Asia/Kuala_Lumpur"]);
    assert.equal(groupedPageState({ groups: ["status"] }, true, { timeZone: "UTC" }).timeZone, undefined);
  });
});

