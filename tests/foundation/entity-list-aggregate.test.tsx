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
import { summaryChartData } from "../../packages/platform/entity/runtime/list-view/src/aggregate/aggregate-chart";
import { chartTypes } from "../../packages/contracts/platform/chart/src/index";

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
const result = (groups: unknown[], parentGroup: unknown, truncated = false): EntityListResultV1 =>
  ({ ...(truncated ? { groupsTruncated: true } : {}), schemaVersion: 1, descriptorHash: "a".repeat(64), scopeFingerprint: "f".repeat(64), queryHash: "d".repeat(64), rows: [], groups, parentGroup, pagination: { pageSize: 0, hasNext: false, hasPrevious: false, countMode: "exact", total: 5 } }) as unknown as EntityListResultV1;
const accounts = [
  { value: id(1), label: "1000 Cash", count: 2, aggregates: { "period_net:sum": 150, "fee:sum": null }, aggregateCurrencies: { "period_net:sum": "MYR" }, mixedCurrencies: ["fee:sum"], states: { "closing_net:sum": "notSummable", "salary:average": "suppressed" } },
  { value: id(2), label: "2000 Payables", count: 3, aggregates: { "period_net:sum": 46, "salary:average": 40, "fee:sum": 3 }, aggregateCurrencies: { "period_net:sum": "MYR", "fee:sum": "MYR" }, states: { "closing_net:sum": "notSummable" } },
];
const total = { count: 5, aggregates: { "period_net:sum": 196, "salary:average": 30, "fee:sum": null }, aggregateCurrencies: { "period_net:sum": "MYR" }, mixedCurrencies: ["fee:sum"], states: { "closing_net:sum": "notSummable" } };

async function withSummary(
  options: { state?: Partial<ListLocationStateV1>; narrow?: boolean; changedParent?: boolean; pivoted?: boolean; ranking?: { groupCount: number; groupsUnranked: number; tie?: boolean }; nestedRanking?: { groupCount: number; groupsUnranked: number }; childTruncated?: boolean },
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
      // Top / Bottom N (A6): the server's ranking, with No value kept last.
      // Nested Top N: an expansion ranked under its parent, No value kept last.
      if (input.query.groupOrder && input.query.group !== "account") {
        const spec = String(input.query.groupOrder), at = spec.lastIndexOf(":");
        return {
          ...result(
            [
              { value: "P02", label: "P02", count: 1, aggregates: { "period_net:sum": 50 }, aggregateCurrencies: { "period_net:sum": "MYR" } },
              { value: "P01", label: "P01", count: 1, aggregates: { "period_net:sum": 100 }, aggregateCurrencies: { "period_net:sum": "MYR" } },
              { value: null, label: "—", count: 1 },
            ],
            accounts[0],
          ),
          groupOrder: { key: spec.slice(0, at), direction: spec.slice(at + 1), limit: Number(input.query.groupLimit) },
          groupCount: options.nestedRanking?.groupCount ?? 2,
          groupsUnranked: options.nestedRanking?.groupsUnranked ?? 0,
          ...((options.nestedRanking?.groupCount ?? 2) > Number(input.query.groupLimit) ? { groupsTruncated: true } : {}),
        } as unknown as EntityListResultV1;
      }
      if (input.query.groupOrder) {
        const spec = String(input.query.groupOrder), at = spec.lastIndexOf(":");
        return {
          ...result([accounts[1], accounts[0], { value: null, label: "—", count: 1 }], total),
          groupOrder: { key: spec.slice(0, at), direction: spec.slice(at + 1), limit: Number(input.query.groupLimit) },
          groupCount: options.ranking?.groupCount ?? 2,
          groupsUnranked: options.ranking?.groupsUnranked ?? 0,
          ...((options.ranking?.groupCount ?? 2) > Number(input.query.groupLimit) ? { groupsTruncated: true } : {}),
          ...(options.ranking?.tie ? { groupOrderTieAtCut: true } : {}),
        } as unknown as EntityListResultV1;
      }
      if (input.query.group === "account") return result(accounts, total);
      // Under 1000 Cash: two periods, each summable because the period is grouped by value.
      return result(
        [
          { value: "P01", label: "P01", count: 1, aggregates: { "period_net:sum": 100, "closing_net:sum": 100, "fee:sum": 1 }, aggregateCurrencies: { "period_net:sum": "MYR", "closing_net:sum": "MYR", "fee:sum": "MYR" }, states: { "salary:average": "suppressed" } },
          { value: "P02", label: "P02", count: 1, aggregates: { "period_net:sum": 50, "closing_net:sum": 150, "fee:sum": 2 }, aggregateCurrencies: { "period_net:sum": "MYR", "closing_net:sum": "MYR", "fee:sum": "EUR" }, states: { "salary:average": "suppressed" } },
        ],
        options.changedParent ? { ...accounts[0], count: 3 } : accounts[0],
        ...(options.childTruncated ? [true] : []),
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

// ---- A5.3: Summary's chart (blueprint 13.6) and the published choice order (decision 14).

test("decision 14: a choice dimension follows its published order; other values keep the server's order, No value last", () => {
  const [period] = summaryLevels(parsed, descriptor, ["period"]);
  const rows = summaryRows([{ value: "PX", label: "PX", count: 1 }, { value: null, label: "—", count: 1 }, { value: "P02", label: "P02", count: 1 }, { value: "P01", label: "P01", count: 1 }, { value: "PA", label: "PA", count: 1 }], period!);
  assert.deepEqual(rows.map((row) => row.value), ["P01", "P02", "PX", "PA", null]);
  // A reference keeps the server's order.
  const [account] = summaryLevels(parsed, descriptor, ["account"]);
  assert.deepEqual(summaryRows([{ value: id(2), label: "2000", count: 1 }, { value: id(1), label: "1000", count: 1 }], account!).map((row) => row.label), ["2000", "1000"]);
});

const chartOf = (measureKey: string, options: { groups?: Parameters<typeof summaryRows>[0]; parent?: Record<string, unknown>; truncated?: boolean; entry?: string; field?: typeof descriptor } = {}) => {
  const [level] = summaryLevels(parsed, options.field ?? descriptor, [options.entry ?? "account"]);
  const rows = summaryRows(options.groups ?? (accounts as never), level!);
  const measure = summaryMeasures(parsed, [measureKey])[0]!;
  return summaryChartData({ level: level!, levelLabel: level!.dimension.label, rows, rowLabel: (row) => row.label, ...(options.parent === undefined ? { parent: total as never } : options.parent ? { parent: options.parent as never } : {}), truncated: options.truncated ?? false, measure, measureLabel: measure.label ?? "Records" });
};
const typeReason = (chart: ReturnType<typeof chartOf>, type: string) => {
  const item = chartTypes(chart.data).find((entry) => entry.type === type)!;
  return item.available ? "available" : item.reason;
};

test("the adapter charts level 1 in the grid's order and labels, with the server's total, and sends nothing", () => {
  const chart = chartOf("count");
  assert.deepEqual(chart.data.categories.map((item) => item.label), ["1000 Cash", "2000 Payables"]);
  assert.deepEqual(chart.data.points, [[{ kind: "value", value: "2" }, { kind: "value", value: "3" }]]);
  assert.deepEqual([chart.data.series[0]!.partOfWhole, chart.data.series[0]!.total], [true, { kind: "value", value: "5" }]);
  assert.equal(chart.data.categoryAxis.ordered, false);
  assert.equal(typeReason(chart, "pie"), "available");
  // A drill-down applies exactly the row's filters.
  assert.deepEqual(chart.filtersOf(chart.data.categories[1]!.key, chart.data.series[0]!.key), [{ field: "account", operator: "eq", value: id(2) }]);
  assert.ok(!JSON.stringify(chart.data).includes("6a1b2c3d"), "no identifier in labels");
});

test("Others is the server's total minus the given points, exactly, and only where that is meaningful", () => {
  // A count: 10 records, 5 given.
  assert.deepEqual(chartOf("count", { parent: { count: 10 }, truncated: true }).data.series[0]!.rest, { kind: "value", value: "5" });
  // An additive money sum in one currency, past a double's precision.
  const money = chartOf("period_net:sum", {
    groups: [
      { value: id(1), label: "1000 Cash", count: 1, aggregates: { "period_net:sum": "12345678901234567.10" }, aggregateCurrencies: { "period_net:sum": "MYR" } },
      { value: id(2), label: "2000 Payables", count: 1, aggregates: { "period_net:sum": "0.20" }, aggregateCurrencies: { "period_net:sum": "MYR" } },
    ],
    parent: { count: 4, aggregates: { "period_net:sum": "12345678901234569.30" }, aggregateCurrencies: { "period_net:sum": "MYR" } },
    truncated: true,
  });
  assert.deepEqual([money.data.series[0]!.unit, money.data.series[0]!.rest], ["MYR", { kind: "value", value: "2" }]);
  // Not when the level is complete.
  assert.equal(chartOf("count").data.series[0]!.rest, undefined);
  // Not for a semi-additive balance: not parts of one whole, so no pie either.
  const balance = chartOf("closing_net:sum", { truncated: true });
  assert.deepEqual([balance.data.series[0]!.partOfWhole, balance.data.series[0]!.rest, typeReason(balance, "pie")], [false, undefined, "CHART_NOT_PART_OF_WHOLE"]);
  // Not for an average.
  assert.equal(chartOf("salary:average", { truncated: true }).data.series[0]!.partOfWhole, false);
  // Not when a given point is withheld: the remainder would include it.
  const fee = chartOf("fee:sum", { truncated: true, parent: { count: 9, aggregates: { "fee:sum": 9 }, aggregateCurrencies: { "fee:sum": "MYR" } } });
  assert.deepEqual([fee.data.points[0]![0], fee.data.series[0]!.rest, typeReason(fee, "pie")], [{ kind: "mixedCurrency" }, undefined, "CHART_WITHHELD"]);
});

test("decision 35: no Others for a measure with a floor, so a held-back group's value is never drawn", () => {
  const [level] = summaryLevels(parsed, descriptor, ["account"]);
  const floored = { ...summaryMeasures(parsed, ["period_net:sum"])[0]!, minimumGroupSize: 3 };
  // Two groups shown, one held back past the cut: total minus shown would be that group's value.
  const chart = summaryChartData({
    level: level!, levelLabel: "GL account", rows: summaryRows(accounts as never, level!), rowLabel: (row) => row.label,
    parent: { count: 6, aggregates: { "period_net:sum": 200 }, aggregateCurrencies: { "period_net:sum": "MYR" } } as never,
    truncated: true, measure: floored, measureLabel: "Period net",
  });
  assert.deepEqual([chart.data.series[0]!.partOfWhole, chart.data.series[0]!.rest], [true, undefined]);
  // A truncated pie without an exact Others is unavailable, so the remainder is never drawn.
  assert.equal(typeReason(chart, "pie"), "CHART_TRUNCATED");
});

test("values in more than one currency are never charted on one axis", () => {
  const chart = chartOf("period_net:sum", {
    groups: [
      { value: id(1), label: "1000 Cash", count: 1, aggregates: { "period_net:sum": 10 }, aggregateCurrencies: { "period_net:sum": "MYR" } },
      { value: id(2), label: "2000 Payables", count: 1, aggregates: { "period_net:sum": 20 }, aggregateCurrencies: { "period_net:sum": "EUR" } },
    ],
    parent: null as never,
  });
  assert.deepEqual(chart.data.points[0], [{ kind: "mixedCurrency" }, { kind: "mixedCurrency" }]);
  assert.deepEqual([chart.data.series[0]!.partOfWhole, chart.data.series[0]!.unit], [false, undefined]);
  assert.equal(typeReason(chart, "column"), "CHART_NO_VALUES");
});

test("colour by meaning and by published order: own-key tones only, and the choice order's positions", () => {
  const toned = parseEntityListDescriptor({
    ...JSON.parse(JSON.stringify(descriptor)),
    fields: descriptor.fields.map((item) => (item.key === "period" ? { ...item, filterOptions: [{ value: "p01", label: "Period 1" }, { value: "p02", label: "Period 2" }], statusTones: { p02: "danger" } } : item)),
  });
  const chart = chartOf("count", { entry: "period", field: toned, groups: [{ value: "p02", label: "p02", count: 1 }, { value: "p01", label: "p01", count: 2 }, { value: "toString", label: "toString", count: 1 }] });
  const [p01, p02, other] = chart.data.categories.map((item) => item.key);
  assert.deepEqual([chart.toneOf(p01!), chart.toneOf(p02!), chart.toneOf(other!)], [undefined, "danger", undefined]);
  assert.deepEqual([chart.paletteIndexOf(p01!), chart.paletteIndexOf(p02!), chart.paletteIndexOf(other!)], [0, 1, undefined]);
  // A date bucket is a sequence, so a line is meaningful.
  const [posted] = summaryLevels(parsed, descriptor, ["posted:month"]);
  const months = summaryChartData({ level: posted!, levelLabel: "Posted on by month", rows: summaryRows([{ value: "2026-01", label: "2026-01", count: 1 }], posted!), rowLabel: (row) => row.label, truncated: false, measure: summaryMeasures(parsed, ["count"])[0]!, measureLabel: "Records" });
  assert.equal(months.data.categoryAxis.ordered, true);
});

const texts = (container: HTMLElement, selector: string) => [...container.querySelectorAll(selector)].map((node) => node.textContent);
const chartState = (extra: Record<string, unknown> = {}) => ({ aggregate: { rows: ["account", "period"], measures: ["count", "period_net:sum"], view: "chart" as const, ...extra } });

test("Chart shows the opening response with no further request, and a point drills down like its row", async () => {
  await withSummary({ state: chartState() }, async ({ container, calls, drills }) => {
    const window = container.ownerDocument.defaultView!;
    assert.equal(calls.length, 1);
    assert.equal(container.querySelector("table[role=treegrid]"), null);
    const points = [...container.querySelectorAll("[data-chart-point]")];
    assert.deepEqual(points.map((point) => point.getAttribute("aria-label")), ["1000 Cash, Records: 2, 40%", "2000 Payables, Records: 3, 60%"]);
    // Unavailable types are disabled with their reasons.
    assert.match(container.querySelector(".a-entity-aggregate__reasons")!.textContent!, /Line chart: A line needs a sequence/);
    assert.match(container.textContent!, /The chart shows the first level/);
    await act(async () => { points[1]!.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
    assert.deepEqual(drills, [[{ field: "account", operator: "eq", value: id(2) }]]);
    assert.ok(!container.innerHTML.includes("6a1b2c3d"), "no identifier rendered");
  });
});

test("choosing Table or a chart setting changes saved state; withheld values use the Summary's words", async () => {
  await withSummary({ state: chartState({ chart: { type: "column", measure: "period_net:sum", label: "value" } }) }, async ({ container, changes }) => {
    const window = container.ownerDocument.defaultView!;
    // The charted measure's values, formatted as the grid formats them.
    const labels = texts(container, "text.a-chart__label");
    assert.equal(labels.length, 2);
    assert.match(labels[0]!, /150/);
    assert.match(labels[1]!, /46/);
    const table = [...container.querySelectorAll<HTMLButtonElement>("[role=radio]")].find((item) => item.textContent === "Table")!;
    await act(async () => { table.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
    assert.deepEqual(changes.at(-1), { aggregate: { rows: ["account", "period"], measures: ["count", "period_net:sum"], chart: { type: "column", measure: "period_net:sum", label: "value" } } });
  });
  await withSummary({ state: chartState({ measures: ["closing_net:sum"], chart: { type: "column", measure: "closing_net:sum", label: "value" } }) }, async ({ container }) => {
    assert.match(container.querySelector(".a-chart__withheld")!.textContent!, /1000 Cash: Not summed across Fiscal period/);
  });
});

test("with a column dimension the series are the columns, and a point drills down with its row's and its column's filters", async () => {
  await withSummary({ pivoted: true, state: { aggregate: { rows: ["account", "posted:month"], measures: ["period_net:sum"], column: "period", view: "chart" } } }, async ({ container, calls, drills }) => {
    const window = container.ownerDocument.defaultView!;
    assert.equal(calls.length, 1);
    assert.deepEqual(texts(container, ".a-chart__legend li"), ["Period 1", "Period 2"]);
    const point = [...container.querySelectorAll("[data-chart-point]")].find((item) => item.getAttribute("aria-label")!.startsWith("1000 Cash, Period 2"))!;
    await act(async () => { point.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
    assert.deepEqual(drills[0], [{ field: "account", operator: "eq", value: id(1) }, { field: "period", operator: "eq", value: "P02" }]);
  });
});

// ---- A6: Top / Bottom N (blueprint 7.5).
const orderedState = (order: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ aggregate: { rows: ["account", "period"], measures: ["count", "period_net:sum", "closing_net:sum"], order, ...extra } });

test("A6 headings and counts: Top N of M only when M > N, All M otherwise; No value is Not ranked; held-back groups are a note", async () => {
  // More ranked groups than N: "Top 5 of 36", one held back.
  await withSummary({ state: orderedState({ measure: "count", direction: "desc", limit: 5 }), ranking: { groupCount: 36, groupsUnranked: 1, tie: true } }, async ({ container, calls }) => {
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.groupOrder, "count:desc");
    assert.equal(calls[0]!.groupLimit, "5");
    assert.equal(container.querySelector(".a-entity-aggregate__ranking")?.textContent, "Top 5 of 36 GL account by Records");
    assert.match(container.textContent!, /1 group is too small to rank/);
    assert.match(container.textContent!, /Another group has the same value as the last one shown/);
    // The server's order is kept (no published-order resort), and No value is last and labelled.
    const rows = [...container.querySelectorAll("tbody tr[aria-level='1']")];
    assert.deepEqual(rows.map((row) => row.querySelector("[data-tree-open]")?.textContent), ["2000 Payables", "1000 Cash", "No value"]);
    assert.equal(rows[2]!.querySelector(".a-entity-aggregate__unranked")?.textContent, "Not ranked");
    assert.equal(rows[0]!.querySelector(".a-entity-aggregate__unranked"), null);
    // Decision 36: the Total row stands outside the ranking and says so.
    assert.equal(container.querySelector(".a-entity-aggregate__total .a-entity-aggregate__unranked")?.textContent, "Not ranked");
    // The key order's "Showing the first 50" notice is not shown under an order,
    // although the server reports the level truncated (36 > 5).
    assert.doesNotMatch(container.textContent!, /Showing the first 50/);
  });
  // Every ranked group shown: "All 2 … highest first", never "Top 10 of 2".
  await withSummary({ state: orderedState({ measure: "count", direction: "desc", limit: 10 }), ranking: { groupCount: 2, groupsUnranked: 0 } }, async ({ container }) => {
    assert.equal(container.querySelector(".a-entity-aggregate__ranking")?.textContent, "All 2 GL account by Records, highest first");
    assert.doesNotMatch(container.textContent!, /too small to rank|same value/);
  });
  // Without an order the Total row carries no label.
  await withSummary({}, async ({ container }) => {
    assert.equal(container.querySelector(".a-entity-aggregate__total .a-entity-aggregate__unranked"), null);
  });
  await withSummary({ state: orderedState({ measure: "period_net:sum", direction: "asc", limit: 10 }), ranking: { groupCount: 2, groupsUnranked: 0 } }, async ({ container }) => {
    assert.equal(container.querySelector(".a-entity-aggregate__ranking")?.textContent, "All 2 GL account by Period net total, lowest first");
  });
});

test("A6: an expansion is never ordered, and a measure that cannot rank this level says why", async () => {
  await withSummary({ state: orderedState({ measure: "count", direction: "desc", limit: 5 }) }, async ({ container, calls, settle }) => {
    await act(async () => container.querySelector<HTMLButtonElement>("tbody tr[aria-level='1'] [data-tree-toggle]")!.click());
    await settle();
    assert.equal(calls[1]!.groupOrder, undefined);
    // Closing net is semi-additive over Fiscal period and the level is GL account.
    assert.match(container.querySelector(".a-entity-aggregate__reasons")!.textContent!, /Closing net total cannot order rows: it is not summed across Fiscal period/);
  });
  // Grouped by its own time field, the balance can order.
  await withSummary({ state: { aggregate: { rows: ["period"], measures: ["closing_net:sum"] } } }, async ({ container }) => {
    assert.equal(container.querySelector(".a-entity-aggregate__reasons"), null);
  });
});

test("A6: a ranked chart follows the ranking and takes the heading as its caption", async () => {
  await withSummary({ state: orderedState({ measure: "count", direction: "desc", limit: 5 }, { view: "chart" }), ranking: { groupCount: 36, groupsUnranked: 0 } }, async ({ container }) => {
    assert.equal(container.querySelector("svg.a-chart__svg")?.getAttribute("aria-label"), "Top 5 of 36 GL account by Records");
    const names = [...container.querySelectorAll("[data-chart-point]")].map((point) => point.getAttribute("aria-label")!.split(",")[0]);
    assert.deepEqual(names, ["2000 Payables", "1000 Cash", "No value"]);
  });
});

// ---- Nested Top / Bottom N (decisions 37–41).
test("nested Top N: an expansion is ranked by the same measure, sent as its groupLimit, with its own notice and Not ranked row", async () => {
  await withSummary({ state: orderedState({ measure: "period_net:sum", direction: "desc", limit: 5, within: 5 }), ranking: { groupCount: 2, groupsUnranked: 0 }, nestedRanking: { groupCount: 12, groupsUnranked: 1 } }, async ({ container, calls, settle }) => {
    await act(async () => container.querySelector<HTMLButtonElement>("tbody tr[aria-level='1'] [data-tree-toggle]")!.click());
    await settle();
    // One request per expansion; `within` travels as the expansion's groupLimit.
    assert.equal(calls.length, 2);
    assert.deepEqual([calls[1]!.group, calls[1]!.groupOrder, calls[1]!.groupLimit], ["period", "period_net:sum:desc", "5"]);
    const text = container.textContent!;
    assert.match(text, /Top 5 of 12 Fiscal period in 2000 Payables by Period net total/);
    assert.match(text, /1 group is too small to rank/);
    // A ranked expansion's notice states its cut: no "Showing 50" notice.
    assert.doesNotMatch(text, /Showing the first 50/);
    const children = [...container.querySelectorAll("tbody tr[aria-level='2']")];
    assert.deepEqual(children.map((row) => row.querySelector("[data-tree-open]")?.textContent), ["Period 2", "Period 1", "No value"]);
    assert.equal(children[2]!.querySelector(".a-entity-aggregate__unranked")?.textContent, "Not ranked");
  });
  // Without `within`, expansions keep their own order and send no order.
  await withSummary({ state: orderedState({ measure: "count", direction: "desc", limit: 5 }) }, async ({ container, calls, settle }) => {
    await act(async () => container.querySelector<HTMLButtonElement>("tbody tr[aria-level='1'] [data-tree-toggle]")!.click());
    await settle();
    assert.equal(calls[1]!.groupOrder, undefined);
  });
});

test("nested Top N fallback: the expansion keeps its own order, says why, and keeps its truncation notice (two conditions)", async () => {
  // Fee's totals for 1000 Cash span currencies. Given a ranked level 1 this
  // cannot arise, so the case is built directly: the guard is decided from
  // the row's own totals, before any request.
  await withSummary({ state: orderedState({ measure: "fee:sum", direction: "desc", limit: 5, within: 5 }, { measures: ["count", "fee:sum"] }), ranking: { groupCount: 2, groupsUnranked: 0 }, childTruncated: true }, async ({ container, calls, settle }) => {
    const cash = [...container.querySelectorAll("tbody tr[aria-level='1']")].find((row) => row.textContent!.includes("1000 Cash"))!;
    await act(async () => cash.querySelector<HTMLButtonElement>("[data-tree-toggle]")!.click());
    await settle();
    // The expansion is requested in its own order: no refused ordered request.
    assert.equal(calls[1]!.groupOrder, undefined);
    const text = container.textContent!;
    assert.match(text, /Fiscal period in 1000 Cash keep their own order: Fee total cannot rank them, because its amounts are in more than one currency\./);
    assert.match(text, /Showing the first 50/);
  });
});

test("the Within each group control appears only once an order is chosen and there is more than one row level", async () => {
  const within = (container: HTMLElement) => [...container.querySelectorAll("[role=combobox]")].some((item) => item.getAttribute("aria-label") === "Within each group" || item.textContent === "Own order within groups");
  await withSummary({ state: orderedState({ measure: "count", direction: "desc", limit: 5 }) }, async ({ container }) => assert.equal(within(container), true));
  await withSummary({}, async ({ container }) => assert.equal(within(container), false));
  await withSummary({ state: { aggregate: { rows: ["account"], measures: ["count"], order: { measure: "count", direction: "desc", limit: 5 } } } }, async ({ container }) => assert.equal(within(container), false));
});
