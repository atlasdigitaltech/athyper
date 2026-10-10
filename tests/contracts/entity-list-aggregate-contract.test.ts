import assert from "node:assert/strict";
import test from "node:test";
import {
  LIST_AGGREGATE_MAX_CELLS,
  LIST_AGGREGATE_MAX_COLUMNS,
  LIST_AGGREGATE_REQUEST_MEASURES,
  LIST_AGGREGATE_RESPONSE_CELLS,
  LIST_GROUP_LIMIT,
  decodeListLocationState,
  encodeListLocationState,
  parseEntityListDescriptor,
  parseEntityListResult,
  parseListAggregate,
  parseListAggregateState,
  toSaveableListState,
} from "../../packages/contracts/platform/entity-list/src/index";

// Entity list Aggregate (Summary) browser contract (blueprint sections 5.3,
// 5.5, 5.6 and 7.2).
const aggregate = {
  dimensions: [
    { field: "account", label: "GL account" },
    { field: "period", label: "Fiscal period", column: true },
    { field: "posted", label: "Posted on", buckets: ["month", "quarter"] },
  ],
  measures: [
    { key: "count", aggregate: "count" },
    { key: "period_net:sum", aggregate: "sum", field: "period_net", label: "Period net", valueKind: "money", currencyField: "currency" },
    { key: "closing_net:sum", aggregate: "sum", field: "closing_net", label: "Closing net", valueKind: "money", currencyField: "currency", timeFields: [{ key: "period", label: "Fiscal period" }] },
    { key: "preparer:countDistinct", aggregate: "countDistinct", field: "preparer", label: "Preparer", valueKind: "string" },
    { key: "salary:average", aggregate: "average", field: "salary", label: "Salary", valueKind: "decimal", minimumGroupSize: 3 },
  ],
  defaults: { rows: ["account", "period"], measures: ["period_net:sum", "closing_net:sum"] },
};
const listed = new Map(
  [["code", "string"], ["account", "reference"], ["period", "enum"], ["posted", "date"], ["currency", "string"], ["period_net", "money"], ["closing_net", "money"], ["preparer", "string"], ["salary", "decimal"]].map(([key, valueKind]) => [key!, { valueKind: valueKind! }]),
);

test("the caps keep one Summary response within its checked bound (section 7.2)", () => {
  // Rows and columns multiply: 54 rows (50 groups, No value, Unmapped
  // values, the parent and the column totals) × 13 cells × 5 measures.
  assert.equal(LIST_AGGREGATE_RESPONSE_CELLS, (LIST_GROUP_LIMIT + 4) * (LIST_AGGREGATE_MAX_COLUMNS + 1) * LIST_AGGREGATE_REQUEST_MEASURES);
  assert.equal(LIST_AGGREGATE_RESPONSE_CELLS, 3_510);
  assert.ok(LIST_AGGREGATE_RESPONSE_CELLS <= LIST_AGGREGATE_MAX_CELLS, "raising a cap must raise the checked bound deliberately");
});

test("parses the projection and refuses what the server never publishes", () => {
  assert.equal(parseListAggregate(aggregate, listed).measures.length, 5);
  const bad = (change: (value: any) => void) => {
    const value = structuredClone(aggregate) as any;
    change(value);
    return () => parseListAggregate(value, listed);
  };
  assert.throws(bad((value) => { value.dimensions[2].buckets = undefined; }), /required for a date field/);
  assert.throws(bad((value) => { value.dimensions[0].buckets = ["month"]; }), /required for a date field and allowed only there/);
  assert.throws(bad((value) => { value.dimensions.push({ field: "account", label: "Again" }); }), /each field once/);
  assert.throws(bad((value) => { value.measures[1].key = "period_net:average"; }), /field:aggregate/);
  assert.throws(bad((value) => { value.measures[0].field = "code"; }), /record count/);
  assert.throws(bad((value) => { value.measures[3].timeFields = [{ key: "period", label: "P" }]; }), /only to a sum/);
  assert.throws(bad((value) => { value.measures[4].minimumGroupSize = 1; }), /2 to 100/);
  assert.throws(bad((value) => { value.defaults.rows = ["posted"]; }), /declared dimension entry/);
  assert.throws(bad((value) => { value.defaults.measures = ["rate:sum"]; }), /declared measure/);
  assert.throws(bad((value) => { value.defaults.column = "account"; }), /declared as a column/);
  assert.throws(bad((value) => { value.guess = true; }), /not a Summary property/);
});

test("saved state keeps declared rows and measures, up to three levels and five measures", () => {
  const surface = parseListAggregate(aggregate, listed);
  assert.deepEqual(parseListAggregateState({ rows: ["posted:quarter", "posted:month", "code", "account", "period"], measures: ["count", "rate:sum", "count"] }, surface), {
    rows: ["posted:quarter", "account", "period"],
    measures: ["count"],
    // The fixture declares a column dimension, so "none" is explicit state.
    column: "",
  });
  // Nothing usable falls back to the declared defaults.
  assert.deepEqual(parseListAggregateState({ rows: ["posted"], measures: [] }, surface), { rows: ["account", "period"], measures: ["period_net:sum", "closing_net:sum"], column: "" });
});

const field = (key: string, valueKind: string, defaultOrder: number) => ({ key, label: key, valueKind, defaultVisible: true, defaultOrder, filterOperators: ["eq", "in"], sortable: true, groupable: false, aggregations: [] });
const descriptor = (withSummary: boolean) =>
  parseEntityListDescriptor({
    schemaVersion: 1, plane: "neon",
    entity: { code: "trial_balance", label: "Trial balance", pluralLabel: "Trial balance lines", identityField: "code" },
    revision: { release: 1, descriptorHash: "a".repeat(64), surfaceHash: "b".repeat(64) },
    surface: {
      key: "default_list", title: "Trial balance",
      defaultState: { filters: [], sort: [{ field: "code", direction: "asc" }], columns: ["code"], density: "comfortable", mode: "table" },
      supportedModes: withSummary ? ["table", "aggregate"] : ["table"],
      filterPresentation: { quickFields: [], source: "metadata", allowUserPinning: true },
      ...(withSummary ? { aggregate } : {}),
    },
    fields: [...listed].map(([key, { valueKind }], index) => field(key, valueKind, index)),
    actions: [],
    scope: { status: "ready", labels: [], fingerprint: "c".repeat(64) },
    limits: { defaultPageSize: 50, allowedPageSizes: [25, 50], maxSortLevels: 3, countMode: "exact" },
  });

test("a semi-additive field publishes the time fields its sum stays within (decision 8)", () => {
  const withTime = (sumWithin: unknown) => ({ ...descriptor(false), fields: descriptor(false).fields.map((item) => (item.key === "closing_net" ? { ...item, sumWithin } : item)) });
  assert.deepEqual(parseEntityListDescriptor(withTime([{ key: "period", label: "Fiscal period" }])).fields.find((item) => item.key === "closing_net")?.sumWithin, [{ key: "period", label: "Fiscal period" }]);
  assert.throws(() => parseEntityListDescriptor(withTime([{ key: "Not a code", label: "x" }])), /sumWithin/);
});

test("surface.aggregate is required exactly when Summary is supported", () => {
  assert.ok(descriptor(true).surface.aggregate);
  assert.throws(() => parseEntityListDescriptor({ ...descriptor(false), surface: { ...descriptor(false).surface, supportedModes: ["table", "aggregate"] } }), /surface.aggregate is required/);
});

test("rows and measures travel in the URL and saved state", () => {
  const offered = descriptor(true);
  const state = decodeListLocationState("view=aggregate&aggregate.rows=posted:quarter,account&aggregate.measures=count,unknown", offered);
  assert.equal(state.mode, "aggregate");
  assert.deepEqual(state.aggregate, { rows: ["posted:quarter", "account"], measures: ["count"], column: "" });
  const encoded = encodeListLocationState(state, offered);
  assert.equal(encoded.get("aggregate.rows"), "posted:quarter,account");
  assert.equal(encoded.get("aggregate.measures"), "count");
  assert.deepEqual(toSaveableListState(state).aggregate, { rows: ["posted:quarter", "account"], measures: ["count"], column: "" });
  // The declared defaults are not written to the URL.
  assert.equal(encodeListLocationState(decodeListLocationState("view=aggregate", offered), offered).get("aggregate.rows"), null);
  // Without Summary the keys are dropped.
  assert.equal(decodeListLocationState("aggregate.rows=account", descriptor(false)).aggregate, undefined);
});

test("list results carry Summary states and the parent total", () => {
  const base = { schemaVersion: 1, descriptorHash: "a".repeat(64), scopeFingerprint: "b".repeat(64), queryHash: "c".repeat(64), rows: [], pagination: { pageSize: 0, hasNext: false, hasPrevious: false, total: 5, countMode: "exact" } };
  const parsed = parseEntityListResult({
    ...base,
    groups: [{ value: "1000", label: "Cash", count: 2, aggregates: { "period_net:sum": 150, "preparer:countDistinct": 1 }, aggregateCurrencies: { "period_net:sum": "MYR" }, states: { "closing_net:sum": "notSummable", "salary:average": "suppressed" } }],
    parentGroup: { count: 5, aggregates: { "preparer:countDistinct": 3 }, states: { "closing_net:sum": "notSummable" } },
  });
  assert.deepEqual(parsed.groups?.[0]?.states, { "closing_net:sum": "notSummable", "salary:average": "suppressed" });
  assert.deepEqual(parsed.parentGroup, { count: 5, aggregates: { "preparer:countDistinct": 3 }, states: { "closing_net:sum": "notSummable" } });
  assert.throws(() => parseEntityListResult({ ...base, parentGroup: { count: 1, states: { "closing_net:sum": "hidden" } } }), /states/);
  assert.throws(() => parseEntityListResult({ ...base, parentGroup: { count: 1, aggregates: { "closing_net:median": 1 } } }), /aggregates key/);
});

test("the column dimension (A2): saved and URL state, and cells aligned with the columns", () => {
  const surface = parseListAggregate({ ...aggregate, defaults: { ...aggregate.defaults, rows: ["account"], column: "period" } }, listed);
  // Absent state uses the declared default; "" chooses none and survives a round trip.
  assert.equal(parseListAggregateState({}, surface).column, "period");
  assert.equal(parseListAggregateState({ column: "" }, surface).column, "");
  // A column already used by a row level, or undeclared as a column, falls back.
  assert.equal(parseListAggregateState({ rows: ["account"], column: "account" }, surface).column, "period");
  assert.equal(parseListAggregateState({ rows: ["period"], column: "posted:month" }, surface).column, "");
  const base = { schemaVersion: 1, descriptorHash: "a".repeat(64), scopeFingerprint: "b".repeat(64), queryHash: "c".repeat(64), rows: [], pagination: { pageSize: 0, hasNext: false, hasPrevious: false, total: 3, countMode: "exact" } };
  const parsed = parseEntityListResult({
    ...base,
    pivotColumns: [{ value: "P01", label: "P01" }, { value: null, label: "—" }],
    pivotColumnsTruncated: true,
    groups: [{ value: "1000", label: "Cash", count: 2, cells: [{ count: 2, aggregates: { "period_net:sum": 150 } }, null] }],
    parentGroup: { count: 3, cells: [{ count: 2 }, { count: 1 }] },
  });
  assert.equal(parsed.pivotColumnsTruncated, true);
  assert.deepEqual(parsed.groups?.[0]?.cells, [{ count: 2, aggregates: { "period_net:sum": 150 } }, null]);
  assert.throws(() => parseEntityListResult({ ...base, pivotColumns: [{ value: "P01", label: "P01" }], groups: [{ value: "1000", label: "Cash", count: 2, cells: [] }] }), /align with pivotColumns/);
  assert.throws(() => parseEntityListResult({ ...base, pivotColumns: [{ value: "P01", label: "P01" }], parentGroup: { count: 1, cells: [{ count: 1, cells: [] }] } }), /not allowed on a cell/);
  assert.throws(() => parseEntityListResult({ ...base, pivotColumns: Array.from({ length: 13 }, (_, index) => ({ value: String(index), label: String(index) })) }), /at most 12/);
});

test("the chart (A5.3): view and chart state travel in the URL and saved state, normalized", () => {
  const offered = descriptor(true);
  const state = decodeListLocationState("view=aggregate&aggregate.view=chart&aggregate.chartType=pie&aggregate.chartMeasure=count&aggregate.chartLabel=percentage&aggregate.measures=count,period_net:sum", offered);
  assert.deepEqual(state.aggregate, { rows: ["account", "period"], measures: ["count", "period_net:sum"], column: "", view: "chart", chart: { type: "pie", measure: "count", label: "percentage" } });
  const encoded = encodeListLocationState(state, offered);
  assert.deepEqual(["aggregate.view", "aggregate.chartType", "aggregate.chartMeasure", "aggregate.chartLabel"].map((key) => encoded.get(key)), ["chart", "pie", "count", "percentage"]);
  assert.deepEqual(toSaveableListState(state).aggregate?.chart, { type: "pie", measure: "count", label: "percentage" });
  // The charted measure is one of the shown measures; unknown values fall back.
  const fallback = parseListAggregateState({ measures: ["count"], view: "chart", chart: { type: "area", measure: "salary:average", label: "loud" } }, parseListAggregate(aggregate, listed));
  assert.deepEqual([fallback.view, fallback.chart], ["chart", { type: "column", measure: "count", label: "value" }]);
  // Table is the default: no view and no chart until chosen, and nothing in the URL.
  const table = decodeListLocationState("view=aggregate", offered);
  assert.deepEqual([table.aggregate?.view, table.aggregate?.chart], [undefined, undefined]);
  assert.equal(encodeListLocationState(table, offered).get("aggregate.view"), null);
  // Returning to the table from a shared chart link is written explicitly.
  const back = decodeListLocationState("view=aggregate&aggregate.view=table", offered);
  assert.equal(back.aggregate?.view, undefined);
});

test("Top / Bottom N (A6): the order travels in the URL and saved state, normalized; results carry the ranked counts", () => {
  const offered = descriptor(true);
  const state = decodeListLocationState("view=aggregate&aggregate.measures=count,period_net:sum&aggregate.orderBy=period_net:sum&aggregate.direction=asc&aggregate.top=20", offered);
  assert.deepEqual(state.aggregate?.order, { measure: "period_net:sum", direction: "asc", limit: 20 });
  const encoded = encodeListLocationState(state, offered);
  assert.deepEqual(["aggregate.orderBy", "aggregate.direction", "aggregate.top"].map((key) => encoded.get(key)), ["period_net:sum", "asc", "20"]);
  assert.deepEqual(toSaveableListState(state).aggregate?.order, { measure: "period_net:sum", direction: "asc", limit: 20 });
  // A measure not shown, a direction or a limit outside the set: back to the dimension's order.
  const parsedAggregate = parseListAggregate(aggregate, listed);
  for (const order of [{ measure: "salary:average", direction: "desc", limit: 10 }, { measure: "count", direction: "up", limit: 10 }, { measure: "count", direction: "desc", limit: 7 }])
    assert.equal(parseListAggregateState({ measures: ["count"], order }, parsedAggregate).order, undefined);
  // The record count can always order.
  assert.deepEqual(parseListAggregateState({ measures: ["period_net:sum"], order: { measure: "count", direction: "desc", limit: 5 } }, parsedAggregate).order, { measure: "count", direction: "desc", limit: 5 });
  // Clearing the order from a shared link writes an empty orderBy.
  assert.equal(decodeListLocationState("view=aggregate&aggregate.orderBy=", offered).aggregate?.order, undefined);
  // The result's ranking fields travel together with the order, or not at all.
  const page = (extra: Record<string, unknown>) => ({ schemaVersion: 1, descriptorHash: "a".repeat(64), scopeFingerprint: "f".repeat(64), queryHash: "d".repeat(64), rows: [], groups: [], parentGroup: { count: 0 }, pagination: { pageSize: 0, hasNext: false, hasPrevious: false, countMode: "exact", total: 0 }, ...extra });
  const ranked = parseEntityListResult(page({ groupOrder: { key: "count", direction: "desc", limit: 10 }, groupCount: 36, groupsUnranked: 1, groupOrderTieAtCut: true }));
  assert.deepEqual([ranked.groupCount, ranked.groupsUnranked, ranked.groupOrderTieAtCut], [36, 1, true]);
  assert.throws(() => parseEntityListResult(page({ groupCount: 36 })), /need groupOrder/);
  assert.throws(() => parseEntityListResult(page({ groupOrder: { key: "count", direction: "desc", limit: 7 }, groupCount: 1, groupsUnranked: 0 })), /limit/);
});
