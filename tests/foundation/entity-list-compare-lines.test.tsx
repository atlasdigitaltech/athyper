import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import {
  parseEntityListDescriptor,
  type EntityListResultV1,
  type ListCompareLocationV1,
} from "../../packages/contracts/platform/entity-list/src/index";
import type { HttpClient } from "../../packages/platform/foundation/api-client/src";
import { buildLineRows, checkLineRead, lineQuery, masterQuery } from "../../packages/platform/entity/runtime/list-view/src/compare/compare-lines";
import { ComparePanel } from "../../packages/platform/entity/runtime/list-view/src/compare/compare-panel";

// Compare C4 (blueprint 5.8 and 10a): line items paged by a master list, on a
// synthetic sourcing event (awards × allocation lines × demand lines).

const id = (n: number) => `7f3c2e1d-4b5a-4c6d-8e9f-${String(n).padStart(12, "0")}`;
const hash = "c".repeat(64);
const field = (key: string, label: string, valueKind: string, defaultOrder: number, extra: Record<string, unknown> = {}) => ({ key, label, valueKind, defaultVisible: true, defaultOrder, filterOperators: ["eq"], sortable: true, groupable: false, aggregations: [], ...extra });
const collection = {
  key: "lines",
  label: "Allocation lines",
  targetEntity: "allocation",
  relationshipKey: "allocations",
  parentDescriptorHash: hash,
  matchKey: [{ key: "demand", label: "Demand line", valueKind: "reference" }],
  fields: [
    { key: "qty", label: "Quantity", valueKind: "decimal", better: "higher", unitField: "uom" },
    { key: "amount", label: "Amount", valueKind: "money", currencyField: "cur", better: "lower", evaluation: true },
  ],
  master: { entity: "demand", parentField: "event", recordParentField: "event", identityField: "code", titleField: "name", searchable: true, filters: [{ key: "category", label: "Category", options: [{ value: "valves", label: "Valves" }] }], exactCounts: true },
  exactCounts: true,
  absentLabel: "Not allocated",
};
const descriptor = parseEntityListDescriptor({
  schemaVersion: 1, plane: "neon",
  entity: { code: "award", label: "Award", pluralLabel: "Awards", identityField: "code" },
  revision: { release: 1, descriptorHash: "a".repeat(64), surfaceHash: "b".repeat(64) },
  surface: {
    key: "default_list", title: "Awards",
    defaultState: { filters: [], sort: [{ field: "code", direction: "asc" }], columns: ["code"], density: "comfortable", mode: "table" },
    supportedModes: ["table"],
    filterPresentation: { quickFields: [], source: "metadata", allowUserPinning: true },
    compare: { sections: [{ key: "basic", label: "Award", fields: [{ key: "status", label: "Status", valueKind: "enum" }] }], collections: [collection], maxRecords: 4 },
  },
  fields: [field("code", "Award", "string", 0), field("name", "Supplier", "string", 1, { semanticRole: "title" }), field("status", "Status", "enum", 2), field("event", "Event", "reference", 3)],
  actions: [],
  scope: { status: "ready", labels: [], fingerprint: "f".repeat(64) },
  limits: { defaultPageSize: 50, allowedPageSizes: [25, 50], maxSortLevels: 3, countMode: "exact" },
});
const parsed = descriptor.surface.compare!.collections![0]!;
const line = (n: number, demand: string, qty: string, uom: string, amount: string) => ({ id: id(100 + n), values: { demand, qty, uom, amount, cur: "USD" }, displayValues: { demand: `Line ${demand}` } });
const linesFor: Record<string, ReturnType<typeof line>[]> = {
  [id(1)]: [line(1, "d1", "10", "EA", "500.00"), line(2, "d2", "5", "EA", "300.00")],
  [id(2)]: [line(3, "d1", "10", "EA", "480.00"), line(4, "d2", "5", "BOX", "290.00"), line(5, "d3", "2", "EA", "80.00")],
  [id(3)]: [line(6, "d1", "10", "EA", "480"), line(7, "d2", "5", "EA", "310.00")],
};
const masterRows = [{ id: "d1", label: "1.1 Gate valve" }, { id: "d2", label: "1.2 Ball valve" }, { id: "d3", label: "1.3 Check valve" }];

test("request shapes: lines carry only the match-key filter and the parent scope; the master is narrowed by its own filters and pins", () => {
  const query = lineQuery(parsed, "award", id(2), ["d1", "d2"]) as Record<string, unknown>;
  assert.deepEqual(query.filter, [JSON.stringify({ field: "demand", operator: "in", value: ["d1", "d2"] })]);
  assert.equal(query.countMode, "none");
  assert.equal(query.parentRecordId, id(2));
  assert.equal(query.relationshipKey, "allocations");
  assert.equal(query.parentDescriptorHash, hash);
  for (const excluded of ["sort", "search", "group", "hierarchy", "cursor"]) assert.equal(excluded in query, false, excluded);
  assert.deepEqual(query.fields, ["demand", "qty", "uom", "amount", "cur"]);
  const master = masterQuery(parsed, "ev1", { search: "valve", filters: { category: "valves", unknown: "x" }, pinned: ["d1"] }) as Record<string, unknown>;
  assert.deepEqual(master.filter, [JSON.stringify({ field: "event", operator: "eq", value: "ev1" }), JSON.stringify({ field: "category", operator: "eq", value: "valves" })]);
  assert.deepEqual(master.recordIds, ["d1"]);
  assert.equal(master.search, "valve");
  assert.equal(master.limit, 50);
});

test("line rows: absent lines, best over present lines, units gate the mark only for evaluation amounts, and the baseline marks", () => {
  const rows = buildLineRows({ collection: parsed, records: [id(1), id(2), id(3)], lines: new Map(Object.entries(linesFor)), masterRows, baseline: 0 });
  const of = (label: string) => rows.find((row) => row.label === label)!;
  assert.deepEqual(rows.map((row) => row.label), ["1.1 Gate valve · Quantity", "1.1 Gate valve · Amount", "1.2 Ball valve · Quantity", "1.2 Ball valve · Amount", "1.3 Check valve · Quantity", "1.3 Check valve · Amount"]);
  assert.equal(of("1.1 Gate valve · Amount").outcome, "differs");
  assert.deepEqual(of("1.1 Gate valve · Amount").best, [1, 2]);
  // Quantity is not an evaluation amount: a unit difference ranks nothing.
  assert.deepEqual(of("1.2 Ball valve · Quantity").best, []);
  assert.equal(of("1.2 Ball valve · Quantity").outcome, "not_comparable");
  assert.deepEqual(of("1.2 Ball valve · Quantity").unitsDiffer, [false, true, false]);
  assert.deepEqual(of("1.3 Check valve · Amount").cells.map((cell) => cell.state), ["absent", "value", "absent"]);
  assert.deepEqual(of("1.3 Check valve · Amount").relative, ["same", "not_in_baseline", "same"]);
  const independent = buildLineRows({ collection: { ...parsed, accessIndependent: true }, records: [id(1), id(2)], lines: new Map(Object.entries(linesFor)), masterRows, baseline: -1 });
  assert.equal(independent.find((row) => row.label === "1.3 Check valve · Amount")!.cells[0]!.state, "unavailable");
});

test("a line read with more pages or a repeated key is refused, never drawn as absent", () => {
  assert.deepEqual(checkLineRead(parsed, id(1), linesFor[id(1)]!, true), { kind: "incomplete", record: id(1) });
  assert.deepEqual(checkLineRead(parsed, id(1), [...linesFor[id(1)]!, line(9, "d1", "1", "EA", "1")], false), { kind: "duplicate", record: id(1), label: "Line d1" });
  assert.equal(checkLineRead(parsed, id(1), linesFor[id(1)]!, false), undefined);
});

type Call = { entity: string; query: Record<string, unknown> };
const page = (rows: unknown[], extra: Record<string, unknown> = {}): EntityListResultV1 =>
  ({ schemaVersion: 1, descriptorHash: "a".repeat(64), scopeFingerprint: "f".repeat(64), queryHash: "d".repeat(64), rows, pagination: { pageSize: rows.length, hasNext: false, hasPrevious: false, countMode: "none", ...extra } }) as unknown as EntityListResultV1;

async function withPanel(options: { lineHasNext?: boolean; events?: string[] }, run: (h: { container: HTMLElement; calls: Call[]; changes: ListCompareLocationV1[]; settle: () => Promise<void> }) => Promise<void>) {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://example.test/app/award" });
  const names = ["window", "document", "IS_REACT_ACT_ENVIRONMENT", "React"] as const;
  const saved = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperties(globalThis, { window: { configurable: true, value: dom.window }, document: { configurable: true, value: dom.window.document }, IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true }, React: { configurable: true, value: React } });
  const calls: Call[] = [];
  const changes: ListCompareLocationV1[] = [];
  const events = options.events ?? ["ev1", "ev1", "ev1"];
  const client = {
    request: async (_operation: unknown, input: { params: { entityCode: string }; query: Record<string, unknown> }) => {
      calls.push({ entity: input.params.entityCode, query: input.query });
      if (input.params.entityCode === "award")
        return page([1, 2, 3].map((n, index) => ({ id: id(n), values: { code: `AW-${n}`, name: `Supplier ${n}`, status: "approved", event: events[index] } })));
      if (input.params.entityCode === "demand") return page(input.query.limit === 1 ? [] : masterRows.map((row) => ({ id: row.id, values: { code: row.label.split(" ")[0], name: row.label.split(" ").slice(1).join(" ") } })), { total: 3, countMode: "exact" });
      const record = String(input.query.parentRecordId);
      if (input.query.limit === 1) return page([], { total: linesFor[record]!.length, countMode: "exact" });
      return page(linesFor[record] ?? [], { hasNext: options.lineHasNext === true && record === id(2) });
    },
  } as unknown as HttpClient;
  const root = createRoot(dom.window.document.getElementById("root")!);
  const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
  try {
    await act(async () => root.render(<ComparePanel client={client} descriptor={descriptor} compare={descriptor.surface.compare!} location={{ records: [id(1), id(2), id(3)], baseline: id(1) }} narrow={false} onChange={(next) => changes.push(next)} onClose={() => undefined} />));
    await settle();
    await run({ container: dom.window.document.getElementById("root")!, calls, changes, settle });
  } finally {
    await act(async () => root.unmount());
    names.forEach((name, index) => (saved[index] ? Object.defineProperty(globalThis, name, saved[index]!) : delete (globalThis as Record<string, unknown>)[name]));
    dom.window.close();
  }
}

test("the panel reads one master page and one line request per record, shows coverage and the authored absent label, and pins into the URL", async () => {
  await withPanel({}, async ({ container, calls, changes, settle }) => {
    const masterCalls = calls.filter((call) => call.entity === "demand" && call.query.limit === 50);
    const lineCalls = calls.filter((call) => call.entity === "allocation" && call.query.limit === 100);
    assert.equal(masterCalls.length, 1);
    assert.deepEqual(lineCalls.map((call) => call.query.parentRecordId).sort(), [id(1), id(2), id(3)].sort());
    assert.ok(lineCalls.every((call) => JSON.stringify(call.query.filter).includes("d1")));
    const heading = container.querySelector<HTMLButtonElement>(".a-entity-compare__collection-heading")!;
    assert.match(heading.textContent!, /3 items differ among items 1–3/);
    assert.equal(heading.getAttribute("aria-expanded"), "false");
    await act(async () => heading.click());
    const text = container.textContent!;
    assert.match(text, /Not allocated/);
    assert.match(text, /Lines for 2 of 3 items/);
    assert.match(text, /Not in baseline/);
    assert.match(text, /Units differ/);
    assert.ok(!container.innerHTML.includes("7f3c2e1d"), "no identifier rendered");
    await act(async () => container.querySelector<HTMLButtonElement>(".a-entity-compare__pin")!.click());
    assert.deepEqual(changes.at(-1)!.items, ["d1"]);
    await settle();
  });
});

test("an incomplete line read fails closed, and records under different parents cannot compare lines", async () => {
  await withPanel({ lineHasNext: true }, async ({ container }) => {
    await act(async () => container.querySelector<HTMLButtonElement>(".a-entity-compare__collection-heading")!.click());
    assert.match(container.textContent!, /This page couldn't be read completely/);
    assert.ok(!/Not allocated/.test(container.textContent!));
  });
  await withPanel({ events: ["ev1", "ev2", "ev1"] }, async ({ container }) => {
    await act(async () => container.querySelector<HTMLButtonElement>(".a-entity-compare__collection-heading")!.click());
    assert.match(container.textContent!, /Line items compare within one parent record/);
  });
});
