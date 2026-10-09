import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import {
  parseEntityListDescriptor,
  type EntityListResultV1,
  type ListLocationStateV1,
  type ListMatrixV1,
} from "../../packages/contracts/platform/entity-list/src/index";
import type { HttpClient } from "../../packages/platform/foundation/api-client/src";
import {
  buildMatrixBlock,
  cellKey,
  matrixCellsQuery,
  matrixColumns,
  matrixColumnsQuery,
  matrixParent,
  matrixRowsQuery,
  shownMeasures,
  unitsDiffer,
} from "../../packages/platform/entity/runtime/list-view/src/matrix/matrix-model";
import { EntityMatrix } from "../../packages/platform/entity/runtime/list-view/src/matrix/matrix-view";

// Matrix Layout (blueprint sections 5.4, 7, 8 and 9) on a synthetic two-key
// fact: items × bids under one event. Nothing here is a real Entity.

const id = (n: number) => `6a1b2c3d-4e5f-4a6b-8c7d-${String(n).padStart(12, "0")}`;
const field = (key: string, label: string, valueKind: string, defaultOrder: number, extra: Record<string, unknown> = {}) => ({ key, label, valueKind, defaultVisible: true, defaultOrder, filterOperators: ["eq", "in"], sortable: true, groupable: false, aggregations: [], ...extra });
const matrix = {
  parentField: "event",
  parentLabel: "Event",
  rows: { field: "item", label: "Items", entity: "event_item", parentField: "event", identityField: "code", titleField: "name", searchable: true },
  columns: {
    field: "bid",
    label: "Bids",
    entity: "event_bid",
    parentField: "event",
    identityField: "code",
    headerFields: [{ key: "total", label: "Total", valueKind: "money" }],
    declined: { field: "status", values: ["declined"] },
    eligibility: { field: "status", values: ["submitted"] },
    order: [{ field: "total", direction: "asc" }],
  },
  measures: [
    { key: "evaluated", label: "Evaluated", valueKind: "money", rank: true, better: "lower", evaluation: true, currencyField: "cur", unitField: "uom" },
    { key: "lead", label: "Lead days", valueKind: "integer" },
  ],
  absentLabel: "Not quoted",
  basisLabel: "normalized for unit and quantity",
  exactCounts: true,
} as const;
const descriptor = parseEntityListDescriptor({
  schemaVersion: 1, plane: "neon",
  entity: { code: "bid_line", label: "Bid line", pluralLabel: "Bid lines", identityField: "line_no" },
  revision: { release: 1, descriptorHash: "a".repeat(64), surfaceHash: "b".repeat(64) },
  surface: {
    key: "default_list", title: "Bid lines",
    defaultState: { filters: [], sort: [{ field: "line_no", direction: "asc" }], columns: ["line_no"], density: "comfortable", mode: "matrix" },
    supportedModes: ["table", "matrix"],
    filterPresentation: { quickFields: [], source: "metadata", allowUserPinning: true },
    matrix,
  },
  fields: [field("line_no", "Line", "string", 0), field("event", "Event", "reference", 1), field("item", "Item", "reference", 2), field("bid", "Bid", "reference", 3, { groupable: true }), field("evaluated", "Evaluated", "money", 4), field("cur", "Currency", "string", 5), field("uom", "Unit", "string", 6), field("lead", "Lead days", "integer", 7)],
  actions: [],
  scope: { status: "ready", labels: [], fingerprint: "f".repeat(64) },
  limits: { defaultPageSize: 50, allowedPageSizes: [25, 50], maxSortLevels: 3, countMode: "exact" },
});
const parsed = descriptor.surface.matrix! as ListMatrixV1;
const eventFilter = { field: "event", operator: "eq" as const, value: "ev1" };
const bids = [
  { id: id(11), values: { code: "B-1", status: "submitted", total: "200.00" } },
  { id: id(12), values: { code: "B-2", status: "submitted", total: "210.00" } },
  { id: id(13), values: { code: "B-3", status: "declined", total: null } },
  { id: id(14), values: { code: "B-4", status: "disqualified", total: "90.00" } },
];
const items = [
  { id: id(1), values: { code: "1.1", name: "Frit filter" } },
  { id: id(2), values: { code: "1.2", name: "Gate valve" } },
];
const fact = (n: number, item: number, bid: number, amount: string, uom = "EA") => ({ id: id(100 + n), values: { item: id(item), bid: id(bid), evaluated: amount, cur: "USD", uom, lead: 14 } });
const facts = [fact(1, 1, 11, "98.70"), fact(2, 1, 12, "114.70"), fact(3, 1, 14, "40.00"), fact(4, 2, 11, "50.00", "EA"), fact(5, 2, 12, "45.00", "BOX")];
const ranks = { [id(101)]: { rank: 1, count: 2, best: "98.70" }, [id(102)]: { rank: 2, count: 2, best: "98.70", difference: "16.2" }, [id(104)]: { rank: 2, count: 2, best: "45.00", difference: "11.1" }, [id(105)]: { rank: 1, count: 2, best: "45.00" } };

test("the parent is a locked scope or exactly one eq filter; otherwise the Matrix asks for one", () => {
  assert.deepEqual(matrixParent(parsed, [eventFilter]), { kind: "chosen", id: "ev1" });
  assert.deepEqual(matrixParent(parsed, []), { kind: "missing" });
  assert.deepEqual(matrixParent(parsed, [{ field: "event", operator: "in", value: ["ev1", "ev2"] }]), { kind: "missing" });
  assert.deepEqual(matrixParent({ ...parsed, parentLocked: true }, []), { kind: "locked" });
});

test("request shapes: rows and columns under the parent, cells with the rank and the page's columns as output only", () => {
  const parent = { kind: "chosen", id: "ev1" } as const;
  const rows = matrixRowsQuery({ matrix: parsed, parent, search: "valve" }) as Record<string, unknown>;
  assert.equal(rows.limit, 20);
  assert.deepEqual(rows.filter, [JSON.stringify({ field: "event", operator: "eq", value: "ev1" })]);
  assert.equal(rows.search, "valve");
  const columns = matrixColumnsQuery({ matrix: parsed, parent, pinned: [id(11)] }) as Record<string, unknown>;
  assert.equal(columns.limit, 5);
  assert.deepEqual(columns.recordIds, [id(11)]);
  assert.deepEqual(columns.sort, ["total:asc", "code:asc"]);
  assert.deepEqual(columns.fields, ["code", "total", "status"]);
  const cells = matrixCellsQuery({ matrix: parsed, parent, measures: parsed.measures, rowKeys: [id(1), id(2)], columnKeys: [id(11), id(12)], pinned: [], filters: [eventFilter, { field: "lead", operator: "lte", value: 30 }] }) as Record<string, unknown>;
  assert.equal(cells.rank, "evaluated");
  assert.deepEqual(cells.matrixColumns, [id(11), id(12)]);
  assert.equal(cells.limit, 4);
  assert.equal(cells.countMode, "none");
  // The rank covers every participant: no column filter beside the output list.
  const fieldsOf = (query: Record<string, unknown>) => (query.filter as string[]).map((item) => JSON.parse(item).field);
  assert.deepEqual(fieldsOf(cells), ["event", "item", "lead"]);
  // Without exact counts there is no rank, and the columns become a filter.
  const plain = matrixCellsQuery({ matrix: { ...parsed, exactCounts: undefined } as ListMatrixV1, parent, measures: parsed.measures, rowKeys: [id(1)], columnKeys: [id(11)], pinned: [], filters: [] }) as Record<string, unknown>;
  assert.equal(plain.rank, undefined);
  assert.deepEqual(fieldsOf(plain), ["event", "item", "bid"]);
});

test("the block: values with ranks, absence only when provable, declined columns, ineligible columns unranked, and duplicates fail closed", () => {
  const columns = matrixColumns(parsed, bids);
  assert.deepEqual(columns.map((column) => [column.declined, column.ineligible]), [[false, false], [false, false], [true, true], [false, true]]);
  const block = buildMatrixBlock({ matrix: parsed, rowIds: [id(1), id(2)], columns, facts, ranks, hasNext: false, filtered: false });
  assert.equal(block.status, "ready");
  if (block.status !== "ready") return;
  assert.deepEqual(block.cells.get(cellKey(id(1), id(11))), { kind: "value", row: facts[0], rank: ranks[id(101)] });
  assert.deepEqual(block.cells.get(cellKey(id(2), id(14))), { kind: "absent" });
  assert.deepEqual(block.cells.get(cellKey(id(1), id(13))), { kind: "declined" });
  // An ineligible column keeps its value but never a rank.
  assert.deepEqual(block.cells.get(cellKey(id(1), id(14))), { kind: "value", row: facts[2] });
  assert.equal(unitsDiffer(block, id(2), columns, parsed.measures[0]), true);
  assert.equal(unitsDiffer(block, id(1), columns, parsed.measures[0]), false);
  const filtered = buildMatrixBlock({ matrix: parsed, rowIds: [id(2)], columns, facts, hasNext: false, filtered: true });
  assert.deepEqual(filtered.status === "ready" && filtered.cells.get(cellKey(id(2), id(14))), { kind: "unknown" });
  const hidden = buildMatrixBlock({ matrix: { ...parsed, accessIndependent: true }, rowIds: [id(2)], columns, facts, hasNext: false, filtered: false });
  assert.deepEqual(hidden.status === "ready" && hidden.cells.get(cellKey(id(2), id(14))), { kind: "unknown" });
  assert.equal(buildMatrixBlock({ matrix: parsed, rowIds: [id(1)], columns, facts: [...facts, { ...facts[0]!, id: id(999) }], hasNext: false, filtered: false }).status, "incomplete");
  assert.equal(buildMatrixBlock({ matrix: parsed, rowIds: [id(1)], columns, facts, hasNext: true, filtered: false }).status, "incomplete");
  assert.deepEqual(shownMeasures(parsed, ["lead"]).map((measure) => measure.key), ["evaluated", "lead"]);
});

type Call = { entity: string; query: Record<string, unknown> };
const page = (rows: unknown[], extra: Record<string, unknown> = {}): EntityListResultV1 =>
  ({ schemaVersion: 1, descriptorHash: "a".repeat(64), scopeFingerprint: "f".repeat(64), queryHash: "d".repeat(64), rows, pagination: { pageSize: rows.length, hasNext: false, hasPrevious: false, countMode: "none", ...extra } }) as unknown as EntityListResultV1;

async function withMatrix(options: { state?: Partial<ListLocationStateV1>; revisions?: string[] }, run: (h: { container: HTMLElement; calls: Call[]; settle: () => Promise<void>; rerender: (state: Partial<ListLocationStateV1>) => Promise<void> }) => Promise<void>) {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://example.test/app/bid-line" });
  const names = ["window", "document", "IS_REACT_ACT_ENVIRONMENT", "React"] as const;
  const saved = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperties(globalThis, { window: { configurable: true, value: dom.window }, document: { configurable: true, value: dom.window.document }, IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true }, React: { configurable: true, value: React } });
  const calls: Call[] = [];
  const revisions = [...(options.revisions ?? ["e".repeat(32)])];
  const client = {
    request: async (_operation: unknown, input: { params: { entityCode: string }; query: Record<string, unknown> }) => {
      calls.push({ entity: input.params.entityCode, query: input.query });
      if (input.params.entityCode === "event_item") return page(items, { total: 2, countMode: "exact" });
      if (input.params.entityCode === "event_bid") return page(bids, { total: 4, countMode: "exact" });
      if (input.query.groupsOnly)
        return { ...page([], { countMode: "exact", total: 5 }), groups: [{ value: id(11), label: "B-1", count: 2 }, { value: id(12), label: "B-2", count: 2 }, { value: id(14), label: "B-4", count: 1 }] } as unknown as EntityListResultV1;
      const revision = revisions.length > 1 ? revisions.shift()! : revisions[0]!;
      return { ...page(facts), ranks, rankRevision: revision } as unknown as EntityListResultV1;
    },
  } as unknown as HttpClient;
  const root = createRoot(dom.window.document.getElementById("root")!);
  const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
  const base: ListLocationStateV1 = { filters: [eventFilter], sort: [], columns: ["line_no"], density: "comfortable", mode: "matrix" };
  let state: ListLocationStateV1 = { ...base, ...options.state };
  const render = () => root.render(<EntityMatrix client={client} descriptor={descriptor} matrix={parsed} state={state} refreshKey="r" onMatrixChange={(change) => { state = { ...state, ...change }; render(); }} />);
  try {
    await act(async () => render());
    await settle();
    await run({ container: dom.window.document.getElementById("root")!, calls, settle, rerender: async (next) => { state = { ...state, ...next }; await act(async () => render()); await settle(); } });
  } finally {
    await act(async () => root.unmount());
    names.forEach((name, index) => (saved[index] ? Object.defineProperty(globalThis, name, saved[index]!) : delete (globalThis as Record<string, unknown>)[name]));
    dom.window.close();
  }
}

test("a screen costs rows, columns, one cell request with ranks and one coverage count, and shows ranks, absence, declined and eligibility as text", async () => {
  await withMatrix({}, async ({ container, calls }) => {
    assert.deepEqual(calls.map((call) => call.entity).sort(), ["bid_line", "bid_line", "event_bid", "event_item"]);
    assert.equal(container.querySelector(".a-entity-matrix")!.getAttribute("data-matrix-requests") !== null, true);
    const text = container.textContent!;
    assert.match(text, /Lowest/);
    assert.match(text, /Rank 2 of 2 · \+16\.2%/);
    assert.match(text, /Not quoted/);
    assert.match(text, /Declined to participate/);
    assert.match(text, /Not ranked · not eligible/);
    assert.match(text, /Not eligible/);
    assert.match(text, /Units differ/);
    assert.match(text, /USD · normalized for unit and quantity/);
    // Coverage per column, and a partial bid named in text.
    assert.match(text, /1 of 2 Items/);
    assert.match(text, /Partial/);
    // Every declined cell keeps its text for assistive technology.
    const declined = [...container.querySelectorAll("td[data-declined]")];
    assert.equal(declined.length, 2);
    assert.ok(declined.every((cell) => /Declined to participate/.test(cell.getAttribute("aria-label")!)));
    assert.ok(!container.innerHTML.includes("6a1b2c3d"), "no identifier rendered");
  });
});

test("without one parent the Matrix asks for it and sends nothing", async () => {
  await withMatrix({ state: { filters: [] } }, async ({ container, calls }) => {
    assert.equal(calls.length, 0);
    assert.match(container.textContent!, /Choose a Event to see the matrix/);
  });
});

test("a later page ranked from different data says so, and Refresh reloads", async () => {
  await withMatrix({ revisions: ["e".repeat(32), "9".repeat(32)] }, async ({ container, rerender }) => {
    assert.ok(!/Values changed/.test(container.textContent!));
    await rerender({ matrix: { measures: ["evaluated"], columns: [] } });
    assert.match(container.textContent!, /Values changed since the first page/);
  });
});
