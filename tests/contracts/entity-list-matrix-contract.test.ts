import assert from "node:assert/strict";
import test from "node:test";
import {
  MATRIX_BLOCK_LIMIT,
  MATRIX_COLUMNS_PER_PAGE,
  MATRIX_ROWS_PER_PAGE,
  decodeListLocationState,
  encodeListLocationState,
  parseEntityListDescriptor,
  parseEntityListResult,
  parseListMatrix,
  toSaveableListState,
} from "../../packages/contracts/platform/entity-list/src/index";

// Entity list Matrix browser contract (blueprint sections 5.2, 5.4 and 5.5).
const matrix = {
  parentField: "event",
  parentLabel: "Sourcing event",
  rows: { field: "item", label: "Item", entity: "event_item", parentField: "event", identityField: "code", titleField: "name", searchable: true },
  columns: { field: "bid", label: "Bid", entity: "event_bid", parentField: "event", identityField: "code", headerFields: [{ key: "total", label: "Total", valueKind: "money" }], declined: { field: "status", values: ["declined"] }, order: [{ field: "total", direction: "asc" }] },
  measures: [
    { key: "evaluated", label: "Evaluated price", valueKind: "money", rank: true, better: "lower", evaluation: true, currencyField: "currency" },
    { key: "lead_days", label: "Lead time", valueKind: "integer" },
  ],
  absentLabel: "Not quoted",
  exactCounts: true,
};
const listed = new Map([["event", { valueKind: "reference" }], ["item", { valueKind: "reference" }], ["bid", { valueKind: "reference" }], ["evaluated", { valueKind: "money" }], ["currency", { valueKind: "string" }], ["lead_days", { valueKind: "integer" }]]);

test("page sizes keep one cell block within one list page", () => {
  assert.equal(MATRIX_ROWS_PER_PAGE * MATRIX_COLUMNS_PER_PAGE <= MATRIX_BLOCK_LIMIT, true);
});

test("parses the projection and refuses what the server never publishes", () => {
  assert.equal(parseListMatrix(matrix, listed).measures.length, 2);
  const bad = (change: (value: any) => void) => { const value = structuredClone(matrix) as any; change(value); return () => parseListMatrix(value, listed); };
  assert.throws(bad((value) => { value.rows.field = "lead_days"; }), /listed reference/);
  assert.throws(bad((value) => { value.columns.field = "item"; }), /must differ/);
  assert.throws(bad((value) => { value.measures[0].better = undefined; }), /needs better/);
  // Money ranks only as the evaluation amount; a plain number ranks without one.
  assert.throws(bad((value) => { delete value.measures[0].evaluation; }), /evaluation amount/);
  assert.equal(parseListMatrix({ ...matrix, measures: [{ key: "lead_days", label: "Lead", valueKind: "integer", rank: true, better: "lower" }] }, listed).measures[0]!.rank, true);
  assert.throws(bad((value) => { value.measures = []; }), /1 to 6/);
  assert.throws(bad((value) => { value.guess = true; }), /not a Matrix property/);
});

const field = (key: string, valueKind: string, defaultOrder: number) => ({ key, label: key, valueKind, defaultVisible: true, defaultOrder, filterOperators: ["eq", "in"], sortable: true, groupable: false, aggregations: [] });
const descriptor = (withMatrix: boolean) => parseEntityListDescriptor({
  schemaVersion: 1, plane: "neon",
  entity: { code: "bid_line", label: "Bid line", pluralLabel: "Bid lines", identityField: "line_no" },
  revision: { release: 1, descriptorHash: "a".repeat(64), surfaceHash: "b".repeat(64) },
  surface: {
    key: "default_list", title: "Bid lines",
    defaultState: { filters: [], sort: [{ field: "line_no", direction: "asc" }], columns: ["line_no"], density: "comfortable", mode: "table" },
    supportedModes: withMatrix ? ["table", "matrix"] : ["table"],
    filterPresentation: { quickFields: [], source: "metadata", allowUserPinning: true },
    ...(withMatrix ? { matrix } : {}),
  },
  fields: [field("line_no", "string", 0), field("event", "reference", 1), field("item", "reference", 2), field("bid", "reference", 3), field("evaluated", "money", 4), field("currency", "string", 5), field("lead_days", "integer", 6)],
  actions: [],
  scope: { status: "ready", labels: [], fingerprint: "c".repeat(64) },
  limits: { defaultPageSize: 50, allowedPageSizes: [25, 50], maxSortLevels: 3, countMode: "exact" },
});

test("surface.matrix is required exactly when Matrix is supported", () => {
  assert.ok(descriptor(true).surface.matrix);
  assert.throws(() => parseEntityListDescriptor({ ...descriptor(false), surface: { ...descriptor(false).surface, supportedModes: ["table", "matrix"] } }), /surface.matrix is required/);
});

test("saved state carries measures and pinned participants; pages are location only", () => {
  const offered = descriptor(true);
  const state = decodeListLocationState("view=matrix&matrix.measures=lead_days,unknown&matrix.columns=c1,c2&matrix.rows=2&matrix.cols=1", offered);
  assert.equal(state.mode, "matrix");
  assert.deepEqual(state.matrix, { measures: ["lead_days"], columns: ["c1", "c2"] });
  assert.equal(state.matrixRowPage, 2);
  assert.equal(state.matrixColumnPage, 1);
  const encoded = encodeListLocationState(state, offered);
  assert.equal(encoded.get("matrix.measures"), "lead_days");
  assert.equal(encoded.get("matrix.columns"), "c1,c2");
  assert.equal(encoded.get("matrix.rows"), "2");
  const saved = toSaveableListState(state);
  assert.deepEqual(saved.matrix, { measures: ["lead_days"], columns: ["c1", "c2"] });
  assert.equal("matrixRowPage" in saved, false);
  // Without Matrix the keys are dropped.
  assert.equal(decodeListLocationState("matrix.rows=2&matrix.columns=c1", descriptor(false)).matrixRowPage, undefined);
});

test("list results carry ranks by row id with an exact best and difference", () => {
  const base = { schemaVersion: 1, descriptorHash: "a".repeat(64), scopeFingerprint: "b".repeat(64), queryHash: "c".repeat(64), rows: [{ id: "r1", values: { line_no: "1" } }], pagination: { pageSize: 1, hasNext: false, hasPrevious: false, countMode: "none" } };
  const parsed = parseEntityListResult({ ...base, ranks: { r1: { rank: 2, count: 4, best: "50.0000", difference: "100.0" } }, rankRevision: "d".repeat(32) });
  assert.deepEqual(parsed.ranks, { r1: { rank: 2, count: 4, best: "50.0000", difference: "100.0" } });
  assert.throws(() => parseEntityListResult({ ...base, ranks: { r1: { rank: 5, count: 4, best: "1" } }, rankRevision: "d".repeat(32) }), /must not exceed count/);
  assert.throws(() => parseEntityListResult({ ...base, ranks: {} }), /rankRevision/);
});
