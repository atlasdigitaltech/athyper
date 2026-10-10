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
import {
  ApiTransportError,
  entityListDescriptorOperation,
  entityListQuery,
  recordBookmarkMembershipOperation,
  recordBookmarksOperation,
  type HttpClient,
} from "../../packages/platform/foundation/api-client/src";
import { EntityListRuntime } from "../../packages/platform/entity/runtime/list-view/src/index";
import { buildCompareModel, compareQueryState, compareRequestFields } from "../../packages/platform/entity/runtime/list-view/src/compare/compare-model";
import { ComparePanel } from "../../packages/platform/entity/runtime/list-view/src/compare/compare-panel";

// Entity list Compare C2 (blueprint sections 7–10): the model and the panel
// on a synthetic Material list. Record IDs look like UUIDs so a leak shows.

const id = (n: number) => `7f3c2e1d-4b5a-4c6d-8e9f-${String(n).padStart(12, "0")}`;
const field = (key: string, label: string, valueKind: string, defaultOrder: number, extra: Record<string, unknown> = {}) => ({
  key, label, valueKind, defaultVisible: true, defaultOrder, filterOperators: ["eq"], sortable: true, groupable: false, aggregations: [], ...extra,
});
const compareProjection = {
  sections: [
    {
      key: "basic",
      label: "Basic data",
      fields: [
        { key: "uom", label: "Base unit", valueKind: "enum", options: [{ value: "KG", label: "Kilogram" }, { value: "M", label: "Metre" }] },
        { key: "group", label: "Material group", valueKind: "reference" },
        { key: "status", label: "Status", valueKind: "enum", options: [{ value: "active", label: "Active" }] },
        { key: "desc", label: "Description", valueKind: "text" },
      ],
    },
    {
      key: "costing",
      label: "Costing",
      fields: [
        { key: "cost", label: "Standard cost", valueKind: "money", currencyField: "cur" },
        { key: "margin", label: "Margin", valueKind: "decimal", masked: true },
      ],
    },
    { key: "audit", label: "Record details", collapsed: true, fields: [{ key: "lead", label: "Lead time (days)", valueKind: "integer" }] },
  ],
  fieldsRestricted: true,
  statusField: "status",
  maxRecords: 4,
};
const descriptor = parseEntityListDescriptor({
  schemaVersion: 1,
  plane: "neon",
  entity: { code: "material", label: "Material", pluralLabel: "Materials", identityField: "code", detailRouteTemplate: "/app/material/:recordId" },
  revision: { release: 1, descriptorHash: "a".repeat(64), surfaceHash: "b".repeat(64) },
  surface: {
    key: "default_list",
    title: "Materials",
    defaultState: { filters: [], sort: [{ field: "code", direction: "asc" }], columns: ["code", "name"], density: "comfortable", mode: "table" },
    supportedModes: ["table"],
    filterPresentation: { quickFields: [], source: "metadata", allowUserPinning: true },
    compare: compareProjection,
  },
  fields: [
    field("code", "Material", "string", 0),
    field("name", "Name", "string", 1, { semanticRole: "title" }),
    field("uom", "Base unit", "enum", 2, { filterOptions: [{ value: "KG", label: "Kilogram" }, { value: "M", label: "Metre" }] }),
    field("group", "Material group", "reference", 3),
    field("status", "Status", "enum", 4, { filterOptions: [{ value: "active", label: "Active" }], statusTones: { active: "success" } }),
    field("desc", "Description", "text", 5),
    field("cost", "Standard cost", "money", 6),
    field("cur", "Currency", "string", 7),
    field("margin", "Margin", "decimal", 8),
    field("lead", "Lead time (days)", "integer", 9),
  ],
  actions: [],
  scope: { status: "ready", labels: [], fingerprint: "c".repeat(64) },
  limits: { defaultPageSize: 50, allowedPageSizes: [25, 50], maxSortLevels: 3, countMode: "exact" },
});
const compare = descriptor.surface.compare!;
const row = (n: number, values: Record<string, unknown>, displayValues: Record<string, string> = {}) => ({ id: id(n), values, displayValues });
const rows = [
  row(1, { code: "MAT-1001", name: "Steel bar 12 mm", uom: "KG", group: id(91), status: "active", desc: "Hot rolled steel bar, 12 mm, 6 m length.", cost: "4.85", cur: "MYR", margin: "••", lead: 14 }, { group: "Steel" }),
  row(2, { code: "MAT-1002", name: "Steel bar 16 mm", uom: "KG", group: id(91), status: "active", desc: "Hot rolled steel bar, 16 mm, 6 m length.", cost: "4.850", cur: "MYR", margin: "••", lead: 14 }, { group: "Steel" }),
  row(3, { code: "MAT-1003", name: "Steel rod 12 mm", uom: "M", group: id(92), status: "active", desc: "Hot rolled steel rod, 12 mm, coil.", cost: "4.85", cur: "USD", margin: "••", lead: 14 }, { group: "Steel" }),
];
const location = (records: readonly string[], extra: Partial<ListCompareLocationV1> = {}): ListCompareLocationV1 => ({ records, ...extra });

test("the Compare request names only declared fields plus identity, title and currency, and nothing that binds a cursor or a hierarchy", () => {
  assert.deepEqual(compareRequestFields(descriptor, compare), ["code", "name", "uom", "group", "status", "desc", "cost", "cur", "margin", "lead"]);
  const query = { ...entityListQuery(compareQueryState(descriptor, compare, location([id(3), id(1)])), descriptor), countMode: "none" };
  assert.deepEqual(query.recordIds, [id(3), id(1)]);
  assert.equal(query.limit, 2);
  for (const excluded of ["cursor", "hierarchy", "group", "search", "filter", "sort", "standardView"]) assert.equal(excluded in query, false, excluded);
});

test("cells, outcomes and marks follow section 8", () => {
  const model = buildCompareModel({ descriptor, compare, location: location([id(1), id(2), id(3)], { baseline: id(1) }), rows });
  const rowOf = (key: string) => model.sections.flatMap((section) => section.rows).find((item) => item.key === key)!;
  assert.deepEqual(model.columns.map((column) => [column.code, column.title, column.baseline]), [["MAT-1001", "Steel bar 12 mm", true], ["MAT-1002", "Steel bar 16 mm", false], ["MAT-1003", "Steel rod 12 mm", false]]);
  assert.equal(rowOf("uom").outcome, "differs");
  assert.deepEqual(rowOf("uom").relative, ["same", "same", "differs"]);
  // Same label "Steel" for two different groups: marked, never an identifier.
  assert.deepEqual(rowOf("group").differentRecord, [true, true, true]);
  // Money: equal amounts, but a different currency in one column.
  assert.equal(rowOf("cost").outcome, "differs");
  assert.deepEqual(rowOf("cost").relative, ["same", "same", "differs"]);
  assert.equal(rowOf("cost").cells[0]!.state === "value" && rowOf("cost").cells[0]!.display, "MYR 4.85");
  assert.equal(rowOf("margin").outcome, "not_comparable");
  assert.equal(rowOf("lead").outcome, "same");
  // Words differing from the baseline, text fields only.
  const words = rowOf("desc").words[1]!;
  assert.deepEqual(words.filter((segment) => segment.differs).map((segment) => segment.text), ["16"]);
  assert.equal(rowOf("desc").words[0], undefined);
  assert.equal(model.columns[1]!.differFromBaseline, 1);
  assert.equal(model.columns[2]!.differFromBaseline, 4);
  assert.ok(!JSON.stringify(model.columns).includes(id(91)));
});

test("a masked currency or an unavailable record follows the revision 2 and 3 rules", () => {
  const masked = { ...compare, sections: compare.sections.map((section) => ({ ...section, fields: section.fields.map((item) => (item.key === "cost" ? { ...item, currencyMasked: true as const } : item)) })) };
  const model = buildCompareModel({ descriptor, compare: masked, location: location([id(1), id(2)]), rows });
  const cost = model.sections[1]!.rows[0]!;
  assert.equal(cost.outcome, "not_comparable");
  assert.equal(cost.currencyNotCompared, true);
  // Record 9 is not returned: its column leaves the outcomes (decision 11).
  const partial = buildCompareModel({ descriptor, compare, location: location([id(1), id(9), id(2)]), rows });
  assert.equal(partial.available, 2);
  assert.equal(partial.columns[1]!.unavailable, true);
  assert.equal(partial.sections[0]!.rows.find((item) => item.key === "uom")!.outcome, "same");
});

type Pending = { query: Record<string, unknown>; resolve: (page: EntityListResultV1) => void; reject: (cause: unknown) => void };

async function withPanel(run: (h: { container: HTMLElement; requests: Pending[]; changes: ListCompareLocationV1[]; closed: () => number; render: (where: ListCompareLocationV1, narrow?: boolean, override?: typeof compare) => Promise<void> }) => Promise<void>) {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://example.test/app/material" });
  const names = ["window", "document", "IS_REACT_ACT_ENVIRONMENT", "React"] as const;
  const saved = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperties(globalThis, { window: { configurable: true, value: dom.window }, document: { configurable: true, value: dom.window.document }, IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true }, React: { configurable: true, value: React } });
  const requests: Pending[] = [];
  const changes: ListCompareLocationV1[] = [];
  let closes = 0;
  const client = { request: (_operation: unknown, input: { query: Record<string, unknown> }) => new Promise((resolve, reject) => requests.push({ query: input.query, resolve, reject })) } as unknown as HttpClient;
  const container = dom.window.document.getElementById("root")!;
  const root = createRoot(container);
  try {
    await run({
      container,
      requests,
      changes,
      closed: () => closes,
      render: (where, narrow = false, override = compare) =>
        act(async () =>
          root.render(<ComparePanel client={client} descriptor={descriptor} compare={override} location={where} narrow={narrow} onChange={(next) => changes.push(next)} onClose={() => closes++} />),
        ),
    });
  } finally {
    await act(async () => root.unmount());
    names.forEach((name, index) => (saved[index] ? Object.defineProperty(globalThis, name, saved[index]!) : delete (globalThis as Record<string, unknown>)[name]));
    dom.window.close();
  }
}

const result = (list: typeof rows): EntityListResultV1 =>
  ({ schemaVersion: 1, descriptorHash: "a".repeat(64), scopeFingerprint: "c".repeat(64), queryHash: "d".repeat(64), rows: list, pagination: { pageSize: list.length, hasNext: false, hasPrevious: false, countMode: "none" } }) as unknown as EntityListResultV1;

test("the panel reads once, shows differences only by default, and never shows a record identifier", async () => {
  await withPanel(async ({ container, requests, changes, render }) => {
    await render(location([id(1), id(2), id(3)]));
    assert.equal(requests.length, 1);
    assert.match(container.textContent!, /Reading 3 records/);
    await act(async () => requests[0]!.resolve(result(rows)));
    assert.equal(container.querySelector("h2")!.textContent, "Comparing 3 Materials");
    const headers = [...container.querySelectorAll("thead th")].map((cell) => cell.textContent);
    assert.deepEqual(headers.slice(1).map((text) => text!.replace("⋯", "")), ["MAT-1001Steel bar 12 mmActive", "MAT-1002Steel bar 16 mmActive", "MAT-1003Steel rod 12 mmActive"]);
    assert.match(container.textContent!, /Some fields aren't shown because of your access\./);
    assert.match(container.textContent!, /4 of 7 fields differ · 1 not compared/);
    const rowHeaders = [...container.querySelectorAll("tbody th[scope=row]")].map((cell) => cell.querySelector(".a-comparison__label")!.textContent);
    // Differences only: Lead time (same, and in a collapsed section) is not shown; Margin is under "Not compared".
    assert.deepEqual(rowHeaders, ["Base unit", "Material group", "Description", "Standard cost", "Margin"]);
    assert.match(container.textContent!, /Different record/);
    assert.ok(!container.innerHTML.includes("7f3c2e1d"), "no record identifier is rendered");
    // Toggling differences only and setting a baseline change only the URL state; no request is sent.
    await act(async () => container.querySelector<HTMLInputElement>("input[role=switch]")!.click());
    assert.deepEqual(changes.at(-1), { records: [id(1), id(2), id(3)], all: true });
    const menuButton = container.querySelectorAll<HTMLButtonElement>(".a-entity-compare__menu-trigger")[1]!;
    await act(async () => menuButton.click());
    await act(async () => [...container.querySelectorAll<HTMLButtonElement>("[role=menuitem]")].find((item) => item.textContent === "Set as baseline")!.click());
    assert.deepEqual(changes.at(-1), { records: [id(1), id(2), id(3)], baseline: id(2) });
    assert.equal(requests.length, 1);
  });
});

test("baseline marks, removal clears the baseline, and next difference moves focus", async () => {
  await withPanel(async ({ container, requests, changes, render }) => {
    await render(location([id(1), id(2), id(3)], { baseline: id(1) }));
    await act(async () => requests[0]!.resolve(result(rows)));
    assert.match(container.textContent!, /Baseline/);
    assert.match(container.textContent!, /1 differ from baseline/);
    assert.match(container.textContent!, /Differs from baseline/);
    assert.ok(container.querySelector("mark"), "differing words are highlighted against the baseline");
    await act(async () => container.querySelectorAll<HTMLButtonElement>(".a-entity-compare__menu-trigger")[0]!.click());
    await act(async () => [...container.querySelectorAll<HTMLButtonElement>("[role=menuitem]")].find((item) => item.textContent === "Remove from comparison")!.click());
    assert.deepEqual(changes.at(-1), { records: [id(2), id(3)] }, "the baseline is cleared, never moved to a neighbour");
    const next = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Next difference")!;
    await act(async () => next.click());
    assert.equal(container.ownerDocument.activeElement?.textContent?.startsWith("Base unit"), true);
    assert.match(container.textContent!, /Difference 1 of 4: Base unit/);
  });
});

test("access changes, failures and a single available record are stated, with no partial comparison", async () => {
  await withPanel(async ({ container, requests, render }) => {
    await render(location([id(1), id(2)]));
    await act(async () => requests[0]!.reject(new ApiTransportError("http", "Forbidden", 400, { type: "about:blank", title: "Bad request", status: 400, code: "PROJECTION_FIELD_NOT_ALLOWED" })));
    assert.match(container.textContent!, /Your access to this list changed\. Reload to compare\./);
    assert.ok(!container.querySelector("table"), "no table");
  });
  await withPanel(async ({ container, requests, render }) => {
    await render(location([id(1), id(9)]));
    await act(async () => requests[0]!.resolve(result([rows[0]!])));
    assert.match(container.textContent!, /Only one of these records is available/);
  });
  await withPanel(async ({ container, requests, render }) => {
    await render(location([id(1), id(2)]));
    await act(async () => requests[0]!.reject(new Error("offline")));
    await act(async () => [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Try again")!.click());
    assert.equal(requests.length, 2);
  });
});

test("narrow screens show a pair of columns, with the baseline fixed in the first slot", async () => {
  await withPanel(async ({ container, requests, render }) => {
    await render(location([id(1), id(2), id(3)], { baseline: id(3) }), true);
    await act(async () => requests[0]!.resolve(result(rows)));
    assert.equal(container.querySelectorAll("thead th").length, 3);
    // Each slot is a segmented choice of record (at most four), not a native select.
    const slots = [...container.querySelectorAll<HTMLElement>(".a-entity-compare__pair [role=radiogroup]")];
    const checked = (slot: HTMLElement) => [...slot.querySelectorAll<HTMLButtonElement>("[role=radio]")].findIndex((radio) => radio.getAttribute("aria-checked") === "true");
    assert.equal(checked(slots[0]!), 2);
    assert.equal(slots[0]!.getAttribute("aria-disabled"), "true");
  });
  await withPanel(async ({ container, requests, render }) => {
    await render(location([id(1), id(2), id(3)]), true);
    await act(async () => requests[0]!.resolve(result(rows)));
    const slots = () => [...container.querySelectorAll<HTMLElement>(".a-entity-compare__pair [role=radiogroup]")];
    const radios = (slot: HTMLElement) => [...slot.querySelectorAll<HTMLButtonElement>("[role=radio]")];
    const checked = (slot: HTMLElement) => radios(slot).findIndex((radio) => radio.getAttribute("aria-checked") === "true");
    // The record shown in the other slot cannot be chosen again.
    assert.equal(radios(slots()[1]!)[0]!.disabled, true);
    await act(async () => radios(slots()[1]!)[2]!.click());
    assert.equal(checked(slots()[1]!), 2);
    // A change of baseline returns the pair to the first two columns.
    await render(location([id(1), id(2), id(3)], { baseline: id(1) }), true);
    assert.deepEqual(slots().map(checked), [0, 1]);
  });
});

test("in the list: Compare is offered for 2 to 4 selected records, opens from the URL, and Close goes back", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://example.test/app/material" });
  const names = ["window", "document", "navigator", "HTMLElement", "IS_REACT_ACT_ENVIRONMENT", "React"] as const;
  const saved = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    navigator: { configurable: true, value: dom.window.navigator },
    HTMLElement: { configurable: true, value: dom.window.HTMLElement },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
    React: { configurable: true, value: React },
  });
  const listQueries: Record<string, unknown>[] = [];
  const client = {
    request: async (operation: unknown, input: { query?: Record<string, unknown> }) => {
      if (operation === entityListDescriptorOperation) return descriptor;
      if (operation === recordBookmarkMembershipOperation) return new Set();
      if (operation === recordBookmarksOperation) return [];
      listQueries.push(input.query ?? {});
      const ids = input.query?.recordIds as string[] | undefined;
      return result(ids ? rows.filter((item) => ids.includes(item.id)) : rows);
    },
  } as unknown as HttpClient;
  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async () => root.render(<EntityListRuntime client={client} entityCode="material" />));
    const boxes = () => [...dom.window.document.querySelectorAll<HTMLInputElement>("tbody input[type=checkbox]")];
    const compareButton = () => [...dom.window.document.querySelectorAll<HTMLButtonElement>(".a-entity-list__selection-bar button")].find((button) => button.textContent === "Compare");
    await act(async () => boxes()[0]!.click());
    assert.equal(compareButton()?.disabled, true);
    assert.match(dom.window.document.querySelector(".a-entity-list__selection-bar")!.textContent!, /Select 2 to 4 records to compare/);
    await act(async () => boxes()[2]!.click());
    assert.equal(compareButton()?.disabled, false);
    const before = listQueries.length;
    await act(async () => compareButton()!.click());
    // Column order is the selection order, and the URL holds the comparison.
    assert.equal(new URL(dom.window.location.href).searchParams.get("compare"), `${id(1)},${id(3)}`);
    assert.equal(listQueries.length, before + 1, "one standalone request, no list refetch");
    assert.deepEqual(listQueries.at(-1)!.recordIds, [id(1), id(3)]);
    assert.equal(dom.window.document.querySelector(".a-entity-compare h2")!.textContent, "Comparing 2 Materials");
    assert.ok(!dom.window.document.querySelector(".a-entity-list__pagination"), "no .a-entity-list__pagination");
    // Close goes back through the one pushed history entry.
    const close = [...dom.window.document.querySelectorAll<HTMLButtonElement>(".a-entity-compare button")].find((button) => button.textContent === "Close")!;
    await act(async () => {
      close.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    assert.equal(new URL(dom.window.location.href).searchParams.get("compare"), null);
    assert.ok(!dom.window.document.querySelector(".a-entity-compare"), "no .a-entity-compare");
    // Opened, then Back by the browser: the marker went with its entry, so a
    // later comparison opened from a link closes in place, not by going back.
    await act(async () => boxes()[0]!.click());
    await act(async () => boxes()[1]!.click());
    await act(async () => compareButton()!.click());
    await act(async () => {
      dom.window.history.back();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    assert.ok(!dom.window.document.querySelector(".a-entity-compare"), "no .a-entity-compare");
    let backs = 0;
    const back = dom.window.history.back.bind(dom.window.history);
    dom.window.history.back = () => {
      backs++;
      back();
    };
    dom.window.history.pushState(null, "", `/app/material?compare=${id(1)},${id(2)}`);
    dom.window.dispatchEvent(new dom.window.PopStateEvent("popstate"));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    const closeLinked = [...dom.window.document.querySelectorAll<HTMLButtonElement>(".a-entity-compare button")].find((button) => button.textContent === "Close")!;
    await act(async () => {
      closeLinked.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    assert.equal(new URL(dom.window.location.href).searchParams.get("compare"), null);
    assert.equal(backs, 0, "closing in place, not going back");
    assert.ok(!dom.window.document.querySelector(".a-entity-compare"), "no .a-entity-compare");
    // A shared link opens the comparison directly, with the baseline.
    await act(async () => root.unmount());
    dom.window.history.replaceState(null, "", `/app/material?compare=${id(2)},${id(1)}&compareBaseline=${id(1)}`);
    const reopenedFrom = listQueries.length;
    const reopened = createRoot(dom.window.document.getElementById("root")!);
    await act(async () => reopened.render(<EntityListRuntime client={client} entityCode="material" />));
    assert.deepEqual(listQueries.find((query, index) => index >= reopenedFrom && query.recordIds)!.recordIds, [id(2), id(1)]);
    assert.match(dom.window.document.querySelector(".a-entity-compare")!.textContent!, /Baseline/);
    await act(async () => reopened.unmount());
  } finally {
    names.forEach((name, index) => (saved[index] ? Object.defineProperty(globalThis, name, saved[index]!) : delete (globalThis as Record<string, unknown>)[name]));
    dom.window.close();
  }
});

test("best value (C3): marks, summary chips with ties, and mixed currencies ranking nothing", () => {
  const ranked = {
    ...compare,
    sections: compare.sections.map((section) => ({
      ...section,
      fields: section.fields.map((item) =>
        item.key === "cost" ? { ...item, better: "lower" as const, summaryLabel: "Lowest cost" } : item.key === "lead" ? { ...item, better: "lower" as const, summaryLabel: "Shortest lead time" } : item,
      ),
    })),
  };
  const priced = rows.map((item, index) => ({ ...item, values: { ...item.values, cur: "MYR", cost: ["4.85", "5.40", "4.850"][index], lead: [14, 21, 28][index] } }));
  const model = buildCompareModel({ descriptor, compare: ranked, location: location([id(1), id(2), id(3)]), rows: priced });
  const rowOf = (key: string) => model.sections.flatMap((section) => section.rows).find((item) => item.key === key)!;
  assert.deepEqual(rowOf("cost").best, [0, 2]);
  assert.deepEqual(rowOf("lead").best, [0]);
  assert.deepEqual(model.summaries.map((summary) => [summary.label, summary.columns, summary.display]), [["Lowest cost", [0, 2], "MYR 4.85"], ["Shortest lead time", [0], "14"]]);
  // A different currency in one column ranks nothing and says so.
  const mixed = buildCompareModel({ descriptor, compare: ranked, location: location([id(1), id(2), id(3)]), rows });
  const cost = mixed.sections.flatMap((section) => section.rows).find((item) => item.key === "cost")!;
  assert.deepEqual(cost.best, []);
  assert.equal(cost.mixedCurrencies, true);
  assert.deepEqual(mixed.summaries.map((summary) => summary.label), []);
});

test("the panel shows Best marks, tie-aware summary chips and the mixed-currency note (C3)", async () => {
  const ranked = { ...compare, sections: compare.sections.map((section) => ({ ...section, fields: section.fields.map((item) => (item.key === "cost" ? { ...item, better: "lower" as const, summaryLabel: "Lowest cost" } : item)) })) };
  const priced = rows.map((item, index) => ({ ...item, values: { ...item.values, cur: "MYR", cost: ["4.85", "5.40", "4.850"][index] } }));
  await withPanel(async ({ container, requests, render }) => {
    await render(location([id(1), id(2), id(3)]), false, ranked);
    await act(async () => requests[0]!.resolve(result(priced)));
    assert.equal(container.querySelector(".a-entity-compare__summaries")!.textContent, "Lowest cost: MAT-1001, MAT-1003 · MYR 4.85 (tie)");
    assert.equal(container.querySelectorAll("td[data-best]").length, 2);
    assert.match(container.textContent!, /Best/);
  });
  await withPanel(async ({ container, requests, render }) => {
    await render(location([id(1), id(2), id(3)]), false, ranked);
    await act(async () => requests[0]!.resolve(result(rows)));
    assert.ok(!container.querySelector(".a-entity-compare__summaries"), "no .a-entity-compare__summaries");
    assert.match(container.textContent!, /Mixed currencies/);
    assert.equal(container.querySelectorAll("td[data-best]").length, 0);
  });
});
