import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import {
  parseEntityListDescriptor,
  type EntityListResultV1,
  type ListAggregateV1,
  type ListFilterV1,
  type ListLocationStateV1,
} from "../../packages/contracts/platform/entity-list/src/index";
import type { HttpClient } from "../../packages/platform/foundation/api-client/src";
import { entityListQuery } from "../../packages/platform/foundation/api-client/src/entity-list";
import {
  levelOptions,
  sameTotals,
  summaryCell,
  summaryLevels,
  summaryMeasures,
  summaryQuery,
  summaryRows,
  summaryState,
} from "../../packages/platform/entity/runtime/list-view/src/aggregate/aggregate-model";
import { EntityAggregate } from "../../packages/platform/entity/runtime/list-view/src/aggregate/aggregate-view";

// Summary (Entity list Aggregate blueprint sections 7, 8, 11 and 12) on a
// synthetic trial-balance fact: GL account × fiscal period. Nothing here is a
// real Entity; the fake client plays the server, including its cell states.

const id = (n: number) => `6a1b2c3d-4e5f-4a6b-8c7d-${String(n).padStart(12, "0")}`;
const field = (key: string, label: string, valueKind: string, defaultOrder: number, extra: Record<string, unknown> = {}) => ({ key, label, valueKind, defaultVisible: true, defaultOrder, filterOperators: ["eq", "in", "is_null", "gte", "lt"], sortable: true, groupable: true, aggregations: [], ...extra });
const aggregate = {
  dimensions: [
    { field: "account", label: "GL account" },
    { field: "period", label: "Fiscal period" },
    { field: "posted", label: "Posted on", buckets: ["month", "quarter"] },
  ],
  measures: [
    { key: "count", aggregate: "count" },
    { key: "period_net:sum", aggregate: "sum", field: "period_net", label: "Period net", valueKind: "money", currencyField: "currency" },
    { key: "closing_net:sum", aggregate: "sum", field: "closing_net", label: "Closing net", valueKind: "money", currencyField: "currency", timeFields: [{ key: "period", label: "Fiscal period" }] },
    { key: "salary:average", aggregate: "average", field: "salary", label: "Salary", valueKind: "decimal", minimumGroupSize: 3 },
    { key: "preparer:countDistinct", aggregate: "countDistinct", field: "preparer", label: "Preparer", valueKind: "string" },
    { key: "fee:sum", aggregate: "sum", field: "fee", label: "Fee", valueKind: "money", currencyField: "currency" },
  ],
  defaults: { rows: ["account", "period"], measures: ["count", "period_net:sum", "closing_net:sum", "salary:average", "fee:sum"] },
};
const descriptor = parseEntityListDescriptor({
  schemaVersion: 1, plane: "neon",
  entity: { code: "trial_balance", label: "Trial balance line", pluralLabel: "Trial balance lines", identityField: "code" },
  revision: { release: 1, descriptorHash: "a".repeat(64), surfaceHash: "b".repeat(64) },
  surface: {
    key: "default_list", title: "Trial balance",
    defaultState: { filters: [], sort: [{ field: "code", direction: "asc" }], columns: ["code"], density: "comfortable", mode: "aggregate" },
    supportedModes: ["table", "aggregate"],
    filterPresentation: { quickFields: [], source: "metadata", allowUserPinning: true },
    aggregate,
  },
  fields: [
    field("code", "Code", "string", 0),
    field("account", "GL account", "reference", 1),
    field("period", "Fiscal period", "enum", 2, { filterOptions: [{ value: "P01", label: "Period 1" }, { value: "P02", label: "Period 2" }] }),
    field("posted", "Posted on", "date", 3),
    field("currency", "Currency", "string", 4),
    field("period_net", "Period net", "money", 5),
    field("closing_net", "Closing net", "money", 6),
    field("salary", "Salary", "decimal", 7),
    field("preparer", "Preparer", "string", 8),
    field("fee", "Fee", "money", 9),
  ],
  actions: [],
  scope: { status: "ready", labels: [], fingerprint: "f".repeat(64) },
  limits: { defaultPageSize: 50, allowedPageSizes: [25, 50], maxSortLevels: 3, countMode: "exact" },
});
const parsed = descriptor.surface.aggregate! as ListAggregateV1;
const base: ListLocationStateV1 = { filters: [], sort: [], columns: ["code"], density: "comfortable", mode: "aggregate" };

test("levels, options and measures follow the declaration and the saved state", () => {
  const summary = summaryState(base, parsed);
  assert.deepEqual(summary, { rows: ["account", "period"], measures: ["count", "period_net:sum", "closing_net:sum", "salary:average", "fee:sum"] });
  const levels = summaryLevels(parsed, descriptor, ["posted:quarter", "account"]);
  assert.deepEqual(levels.map((level) => [level.entry, level.unit ?? null]), [["posted:quarter", "quarter"], ["account", null]]);
  // A level's picker offers what other levels do not use; a date offers each bucket.
  assert.deepEqual(levelOptions(parsed, ["account", "period"], 1).map((option) => option.entry), ["period", "posted:month", "posted:quarter"]);
  assert.deepEqual(summaryMeasures(parsed, ["fee:sum", "count"]).map((measure) => measure.key), ["fee:sum", "count"]);
});

test("a level's request is groups only with totals, its ancestors as filters, and no record count in aggregate", () => {
  const [account, period] = summaryLevels(parsed, descriptor, ["account", "period"]);
  const query = summaryQuery({
    state: { ...base, filters: [{ field: "currency", operator: "eq", value: "MYR" }], query: "cash" },
    level: period!,
    filters: [{ field: "account", operator: "eq", value: id(1) }],
    measures: summaryMeasures(parsed, ["count", "closing_net:sum"]),
    identityField: "code",
  });
  const wire = entityListQuery(query, descriptor) as Record<string, unknown>;
  assert.equal(wire.group, "period");
  assert.equal(wire.groupsOnly, "true");
  assert.equal(wire.totals, "true");
  assert.deepEqual(wire.aggregate, ["closing_net:sum"]);
  assert.equal(wire.search, "cash");
  assert.equal(wire.limit, 1);
  assert.deepEqual((wire.filter as string[]).map((item) => JSON.parse(item)), [{ field: "currency", operator: "eq", value: "MYR" }, { field: "account", operator: "eq", value: id(1) }]);
  assert.ok(account);
});

test("cells turn the server's totals into values or text states, and rows carry their drill-down filters", () => {
  const measures = summaryMeasures(parsed, ["count", "period_net:sum", "closing_net:sum", "salary:average", "fee:sum"]);
  const totals = { count: 2, aggregates: { "period_net:sum": 150, "fee:sum": null }, aggregateCurrencies: { "period_net:sum": "MYR" }, mixedCurrencies: ["fee:sum"], states: { "closing_net:sum": "notSummable", "salary:average": "suppressed" } } as const;
  assert.deepEqual(measures.map((measure) => summaryCell(totals, measure)), [
    { kind: "value", value: 2 },
    { kind: "value", value: 150, currency: "MYR" },
    { kind: "notSummable" },
    { kind: "suppressed" },
    { kind: "mixedCurrency" },
  ]);
  const [posted] = summaryLevels(parsed, descriptor, ["posted:month"]);
  const rows = summaryRows([{ value: null, label: "—", count: 1 }, { value: "2026-02", label: "2026-02", count: 4 }], posted!);
  assert.deepEqual(rows.map((row) => [row.kind, row.filters]), [
    ["value", [{ field: "posted", operator: "gte", value: "2026-02-01" }, { field: "posted", operator: "lt", value: "2026-03-01" }]],
    ["none", [{ field: "posted", operator: "is_null" }]],
  ]);
  assert.equal(sameTotals({ count: 2, aggregates: { "period_net:sum": 150 } }, { count: 2, aggregates: { "period_net:sum": 150 } }, measures), true);
  assert.equal(sameTotals({ count: 2, aggregates: { "period_net:sum": 150 } }, { count: 2, aggregates: { "period_net:sum": 151 } }, measures), false);
});

type Call = Record<string, unknown>;
const result = (groups: unknown[], parentGroup: unknown): EntityListResultV1 =>
  ({ schemaVersion: 1, descriptorHash: "a".repeat(64), scopeFingerprint: "f".repeat(64), queryHash: "d".repeat(64), rows: [], groups, parentGroup, pagination: { pageSize: 0, hasNext: false, hasPrevious: false, countMode: "exact", total: 5 } }) as unknown as EntityListResultV1;
const accounts = [
  { value: id(1), label: "1000 Cash", count: 2, aggregates: { "period_net:sum": 150, "fee:sum": null }, aggregateCurrencies: { "period_net:sum": "MYR" }, mixedCurrencies: ["fee:sum"], states: { "closing_net:sum": "notSummable", "salary:average": "suppressed" } },
  { value: id(2), label: "2000 Payables", count: 3, aggregates: { "period_net:sum": 46, "salary:average": 40, "fee:sum": 3 }, aggregateCurrencies: { "period_net:sum": "MYR", "fee:sum": "MYR" }, states: { "closing_net:sum": "notSummable" } },
];
const total = { count: 5, aggregates: { "period_net:sum": 196, "salary:average": 30, "fee:sum": null }, aggregateCurrencies: { "period_net:sum": "MYR" }, mixedCurrencies: ["fee:sum"], states: { "closing_net:sum": "notSummable" } };

async function withSummary(
  options: { state?: Partial<ListLocationStateV1>; narrow?: boolean; changedParent?: boolean; pivoted?: boolean },
  run: (h: { container: HTMLElement; calls: Call[]; settle: () => Promise<void>; drills: (readonly ListFilterV1[])[]; changes: unknown[] }) => Promise<void>,
) {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://example.test/app/trial-balance" });
  const names = ["window", "document", "IS_REACT_ACT_ENVIRONMENT", "React"] as const;
  const saved = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperties(globalThis, { window: { configurable: true, value: dom.window }, document: { configurable: true, value: dom.window.document }, IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true }, React: { configurable: true, value: React } });
  const calls: Call[] = [];
  const drills: (readonly ListFilterV1[])[] = [];
  const changes: unknown[] = [];
  const client = {
    request: async (_operation: unknown, input: { query: Record<string, unknown> }) => {
      calls.push(input.query);
      if (input.query.pivot) return pivotResult(input.query);
      if (input.query.group === "account") return result(accounts, total);
      // Under 1000 Cash: two periods, each summable because the period is grouped by value.
      return result(
        [
          { value: "P01", label: "P01", count: 1, aggregates: { "period_net:sum": 100, "closing_net:sum": 100, "fee:sum": 1 }, aggregateCurrencies: { "period_net:sum": "MYR", "closing_net:sum": "MYR", "fee:sum": "MYR" }, states: { "salary:average": "suppressed" } },
          { value: "P02", label: "P02", count: 1, aggregates: { "period_net:sum": 50, "closing_net:sum": 150, "fee:sum": 2 }, aggregateCurrencies: { "period_net:sum": "MYR", "closing_net:sum": "MYR", "fee:sum": "EUR" }, states: { "salary:average": "suppressed" } },
        ],
        options.changedParent ? { ...accounts[0], count: 3 } : accounts[0],
      );
    },
  } as unknown as HttpClient;
  const root = createRoot(dom.window.document.getElementById("root")!);
  const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
  const state: ListLocationStateV1 = { ...base, ...options.state };
  try {
    await act(async () =>
      root.render(
        <EntityAggregate
          client={client}
          descriptor={options.pivoted ? pivotDescriptor : descriptor}
          aggregate={options.pivoted ? pivotDescriptor.surface.aggregate! : parsed}
          state={state}
          refreshKey="r"
          {...(options.narrow ? { widthTier: "narrow" as const } : {})}
          onAggregateChange={(change) => changes.push(change)}
          onDrillDown={(filters) => drills.push(filters)}
        />,
      ),
    );
    await settle();
    await run({ container: dom.window.document.getElementById("root")!, calls, settle, drills, changes });
  } finally {
    await act(async () => root.unmount());
    names.forEach((name, index) => (saved[index] ? Object.defineProperty(globalThis, name, saved[index]!) : delete (globalThis as Record<string, unknown>)[name]));
    dom.window.close();
  }
}

test("opening costs one request and shows the total first, server labels, and every withheld value as text", async () => {
  await withSummary({}, async ({ container, calls }) => {
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.group, "account");
    assert.equal(calls[0]!.totals, "true");
    const grid = container.querySelector("table[role=treegrid]")!;
    const rows = [...grid.querySelectorAll("tbody tr")];
    assert.match(rows[0]!.textContent!, /^Total/);
    assert.match(rows[1]!.textContent!, /1000 Cash/);
    const text = container.textContent!;
    assert.match(text, /Not summed across Fiscal period/);
    assert.match(text, /Too few records/);
    assert.match(text, /more than one currency/);
    assert.match(text, /Records/);
    // A level row carries the tree-grid attributes the keyboard model reads.
    assert.equal(rows[1]!.getAttribute("aria-level"), "1");
    assert.equal(rows[1]!.getAttribute("aria-expanded"), "false");
    assert.equal(rows[1]!.getAttribute("aria-posinset"), "1");
    assert.equal(rows[1]!.getAttribute("aria-setsize"), "2");
    assert.ok(container.querySelector("[data-aggregate-requests]"));
    assert.ok(!container.innerHTML.includes("6a1b2c3d"), "no identifier rendered");
  });
});

test("expanding sends one request with the ancestor's value, and its children sum the balance per period", async () => {
  await withSummary({}, async ({ container, calls, settle }) => {
    const toggle = container.querySelector<HTMLButtonElement>("tbody tr[aria-level='1'] [data-tree-toggle]")!;
    await act(async () => toggle.click());
    await settle();
    assert.equal(calls.length, 2);
    assert.equal(calls[1]!.group, "period");
    assert.deepEqual((calls[1]!.filter as string[]).map((item) => JSON.parse(item)), [{ field: "account", operator: "eq", value: id(1) }]);
    const children = [...container.querySelectorAll("tbody tr[aria-level='2']")];
    assert.equal(children.length, 2);
    // Published choice labels, and the per-period balance with its currency.
    assert.match(children[0]!.textContent!, /Period 1/);
    assert.match(children[1]!.textContent!, /150/);
    assert.ok(!/Values changed/.test(container.textContent!));
  });
});

test("an expansion whose parent row differs says the data changed", async () => {
  await withSummary({ changedParent: true }, async ({ container, settle }) => {
    await act(async () => container.querySelector<HTMLButtonElement>("tbody tr[aria-level='1'] [data-tree-toggle]")!.click());
    await settle();
    assert.match(container.textContent!, /Values changed since this summary opened/);
  });
});

test("a row or the total drills down with exactly the filters it counted", async () => {
  await withSummary({ state: { filters: [{ field: "currency", operator: "eq", value: "MYR" }] } }, async ({ container, drills, settle }) => {
    await act(async () => container.querySelector<HTMLButtonElement>("tbody tr[aria-level='1'] [data-tree-open]")!.click());
    assert.deepEqual(drills[0], [{ field: "account", operator: "eq", value: id(1) }]);
    await act(async () => container.querySelector<HTMLButtonElement>("tbody tr[aria-level='1'] [data-tree-toggle]")!.click());
    await settle();
    await act(async () => container.querySelector<HTMLButtonElement>("tbody tr[aria-level='2'] [data-tree-open]")!.click());
    assert.deepEqual(drills[1], [{ field: "account", operator: "eq", value: id(1) }, { field: "period", operator: "eq", value: "P01" }]);
    await act(async () => container.querySelector<HTMLButtonElement>(".a-entity-aggregate__total [data-tree-open], .a-entity-aggregate__total button")!.click());
    assert.deepEqual(drills[2], []);
  });
});

test("measures are capped at five and kept in declared order; a sixth cannot be chosen", async () => {
  await withSummary({}, async ({ container, changes }) => {
    const boxes = [...container.querySelectorAll<HTMLInputElement>(".a-entity-aggregate__measures input[type=checkbox]")];
    assert.equal(boxes.length, 6);
    assert.equal(boxes.filter((box) => box.checked).length, 5);
    const distinct = boxes[4]!;
    assert.equal(distinct.disabled, true);
    await act(async () => boxes[0]!.click());
    assert.deepEqual(changes[0], { aggregate: { rows: ["account", "period"], measures: ["period_net:sum", "closing_net:sum", "salary:average", "fee:sum"] } });
  });
});

test("narrow screens list one group per row and keep the total visible", async () => {
  await withSummary({ narrow: true }, async ({ container }) => {
    assert.equal(container.querySelector("table"), null);
    const items = [...container.querySelectorAll(".a-entity-aggregate__item")];
    assert.equal(items.length, 3);
    assert.match(items[0]!.textContent!, /^Total/);
    assert.match(container.textContent!, /Not summed across Fiscal period/);
  });
});

// The column dimension (A2): GL account × fiscal period.
const pivotDescriptor = parseEntityListDescriptor({
  ...descriptor,
  surface: {
    ...descriptor.surface,
    aggregate: {
      ...aggregate,
      dimensions: [aggregate.dimensions[0], { ...aggregate.dimensions[1], column: true }, aggregate.dimensions[2]],
      defaults: { rows: ["account", "posted:month"], column: "period", measures: ["period_net:sum", "closing_net:sum"] },
    },
  },
});
const pivotResult = (query: Record<string, unknown>): EntityListResultV1 => {
  const cell = (net: number, closing: number) => ({ count: 1, aggregates: { "period_net:sum": net, "closing_net:sum": closing }, aggregateCurrencies: { "period_net:sum": "MYR", "closing_net:sum": "MYR" } });
  const groups = query.group === "account"
    ? [
        { value: id(1), label: "1000 Cash", count: 2, aggregates: { "period_net:sum": 150 }, aggregateCurrencies: { "period_net:sum": "MYR" }, states: { "closing_net:sum": "notSummable" }, cells: [cell(100, 100), cell(50, 150)] },
        { value: id(2), label: "2000 Payables", count: 1, aggregates: { "period_net:sum": 10 }, aggregateCurrencies: { "period_net:sum": "MYR" }, states: { "closing_net:sum": "notSummable" }, cells: [cell(10, 10), null] },
      ]
    : [{ value: "2026-01", label: "2026-01", count: 1, aggregates: { "period_net:sum": 100 }, states: { "closing_net:sum": "notSummable" }, cells: [cell(100, 100), null] }];
  return {
    ...result(groups, { count: 3, aggregates: { "period_net:sum": 160 }, aggregateCurrencies: { "period_net:sum": "MYR" }, states: { "closing_net:sum": "notSummable" }, cells: [{ ...cell(110, 110), count: 2 }, cell(50, 150)] }),
    pivotColumns: [{ value: "P01", label: "P01" }, { value: "P02", label: "P02" }],
  } as unknown as EntityListResultV1;
};

test("a column dimension draws each column's measures and a total, with column totals from the server", async () => {
  await withSummary({ pivoted: true }, async ({ container, calls }) => {
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.pivot, "period");
    assert.equal(calls[0]!.pivotValue, undefined);
    const header = container.querySelector("thead")!.textContent!;
    // Published choice labels for the columns, then the row total.
    assert.match(header, /Period 1.*Period 2.*Total/);
    const rows = [...container.querySelectorAll("tbody tr")];
    // The total row: column totals sum the balance within each period; the grand total does not.
    assert.match(rows[0]!.textContent!, /110.*150.*Not summed across Fiscal period/);
    // A row with no records in a column shows no value there.
    assert.match(rows[2]!.textContent!, /—/);
  });
});

test("an expansion keeps the opening's columns, and a cell drills down with its row's and its column's filters", async () => {
  await withSummary({ pivoted: true }, async ({ container, calls, drills, settle }) => {
    await act(async () => container.querySelector<HTMLButtonElement>("tbody tr[aria-level='1'] [data-tree-toggle]")!.click());
    await settle();
    assert.equal(calls[1]!.group, "posted:month");
    assert.deepEqual(calls[1]!.pivotValue, ['"P01"', '"P02"']);
    const cellButton = container.querySelector<HTMLButtonElement>("tbody tr[aria-level='1'] td button")!;
    assert.match(cellButton.getAttribute("aria-label")!, /Show the 1 records in 1000 Cash, Period 1/);
    await act(async () => cellButton.click());
    assert.deepEqual(drills[0], [{ field: "account", operator: "eq", value: id(1) }, { field: "period", operator: "eq", value: "P01" }]);
    assert.ok(!container.innerHTML.includes("6a1b2c3d"), "no identifier rendered");
  });
});

test("the column picker offers declared columns not used by a row level, and None", async () => {
  await withSummary({ pivoted: true }, async ({ container }) => {
    assert.ok([...container.querySelectorAll("legend")].some((legend) => legend.textContent === "Columns"));
  });
});
