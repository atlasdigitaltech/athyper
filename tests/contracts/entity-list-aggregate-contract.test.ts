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
  });
  // Nothing usable falls back to the declared defaults.
  assert.deepEqual(parseListAggregateState({ rows: ["posted"], measures: [] }, surface), { rows: ["account", "period"], measures: ["period_net:sum", "closing_net:sum"] });
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

test("surface.aggregate is required exactly when Summary is supported", () => {
  assert.ok(descriptor(true).surface.aggregate);
  assert.throws(() => parseEntityListDescriptor({ ...descriptor(false), surface: { ...descriptor(false).surface, supportedModes: ["table", "aggregate"] } }), /surface.aggregate is required/);
});

test("rows and measures travel in the URL and saved state", () => {
  const offered = descriptor(true);
  const state = decodeListLocationState("view=aggregate&aggregate.rows=posted:quarter,account&aggregate.measures=count,unknown", offered);
  assert.equal(state.mode, "aggregate");
  assert.deepEqual(state.aggregate, { rows: ["posted:quarter", "account"], measures: ["count"] });
  const encoded = encodeListLocationState(state, offered);
  assert.equal(encoded.get("aggregate.rows"), "posted:quarter,account");
  assert.equal(encoded.get("aggregate.measures"), "count");
  assert.deepEqual(toSaveableListState(state).aggregate, { rows: ["posted:quarter", "account"], measures: ["count"] });
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
