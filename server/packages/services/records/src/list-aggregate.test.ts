import { describe, expect, it } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { parseEntityListDescriptor, parseEntityListResult } from "@athyper/contract-platform-entity-list";
import { createEntityListService } from "./entity-list-service.js";
import { createInMemoryRecordPersistence } from "./in-memory-record-repository.js";
import { createRecordListExecutor, createRecordQueryService } from "./query-service.js";
import { parseRecordListParameters } from "./records-routes.js";
import { resolveListAggregate } from "./list-aggregate.js";

// The Aggregate Layout, shown as Summary (Entity list Aggregate blueprint),
// end to end on the in-memory repository: the per-viewer projection,
// admission against the declaration, totals from base rows, the
// semi-additive rule and the floor. The fact is shaped like a trial balance
// (account × fiscal period × currency), the A0 pilot's shape.

const id = (n: number) => `7f3c2e1d-4b5a-4c6d-8e9f-${String(n).padStart(12, "0")}`;
const tenantId = "11111111-1111-4111-8111-111111111111";
const aggregate = {
  dimensions: [{ field: "account", column: true }, { field: "period", column: true }, { field: "posted", buckets: ["month", "quarter"], column: true }],
  measures: [
    { aggregates: ["count"] },
    { field: "period_net", aggregates: ["sum", "average"] },
    { field: "closing_net", aggregates: ["sum", "maximum"] },
    { field: "preparer", aggregates: ["countDistinct"] },
    { field: "salary", aggregates: ["average"], minimumGroupSize: 3 },
  ],
  defaults: { rows: ["account", "period"], measures: ["period_net:sum", "closing_net:sum"] },
};
const descriptor = (overrides: Record<string, unknown> = {}) =>
  ({
    schema: "athyper.entity-runtime-descriptor/1.0", entityCode: "trial_balance", planeKey: "neon",
    releaseId: "r", releaseNo: 1, contractHash: "a".repeat(64), compiledHash: "b".repeat(64),
    storage: { schema: "app", object: "trial_balance", idField: "id", tenantField: "tenant_id" },
    fields: [
      { key: "code", storagePath: "code", type: "string", required: true, writableOn: [], filterable: true, sortable: true },
      { key: "account", storagePath: "account", type: "enum", required: true, writableOn: [], filterable: true, list: { groupable: true }, validation: { options: ["1000", "2000"] } },
      { key: "period", storagePath: "period", type: "enum", required: true, writableOn: [], filterable: true, list: { groupable: true }, validation: { options: ["P01", "P02"] } },
      { key: "posted", storagePath: "posted", type: "date", required: true, writableOn: [], filterable: true, list: { groupable: true } },
      { key: "currency", storagePath: "currency", type: "string", required: true, writableOn: [] },
      { key: "period_net", storagePath: "period_net", type: "money", required: true, writableOn: [], list: { currencyField: "currency", additivity: { kind: "additive" }, aggregations: ["count", "sum"] } },
      { key: "closing_net", storagePath: "closing_net", type: "money", required: true, writableOn: [], list: { currencyField: "currency", additivity: { kind: "semiAdditive", timeFields: ["period"] }, aggregations: ["count", "sum"] } },
      // Declares no additivity: grouped Table sums it exactly as before decision 8.
      { key: "adjustment", storagePath: "adjustment", type: "decimal", required: false, writableOn: [], list: { aggregations: ["sum"] } },
      { key: "preparer", storagePath: "preparer", type: "string", required: true, writableOn: [] },
      { key: "salary", storagePath: "salary", type: "decimal", required: false, writableOn: [], list: { additivity: { kind: "additive" } } },
    ],
    operations: { read: { code: "read", permissionCode: "trial_balance.read" } },
    listPresentation: { identityField: "code", limits: { countMode: "exact" }, supportedModes: ["table", "aggregate"], aggregate, ...overrides },
  }) as unknown as EntityRuntimeDescriptor;
const context = {
  planeKey: "neon", realmKey: "athyper", tenantId, principalId: "actor", authEpoch: 1, profileHash: "p", requestId: "r",
  permissions: { planeKey: "neon", tenantId, principalId: "actor", principalFingerprint: "a", profileHash: "p", schemaHash: "s", resolvedAt: 1, allowed: [], denied: [], planLocked: [], planeExcluded: [], entries: [], authorizationScopes: [] },
} as unknown as VerifiedRequestContext;

// Account 1000: P01 net 100 closing 100, P02 net 50 closing 150.
// Account 2000: P01 net 10 closing 10 (twice: two currencies' worth is not
// used here), P02 net 30 closing 40.
const rows = [
  { id: id(1), adjustment: "1.50", code: "TB-1", account: "1000", period: "P01", posted: "2026-01-31", currency: "MYR", period_net: 100, closing_net: 100, preparer: "ana", salary: 10 },
  { id: id(2), adjustment: "2.25", code: "TB-2", account: "1000", period: "P02", posted: "2026-02-28", currency: "MYR", period_net: 50, closing_net: 150, preparer: "ana", salary: 20 },
  { id: id(3), adjustment: "3", code: "TB-3", account: "2000", period: "P01", posted: "2026-01-31", currency: "MYR", period_net: 10, closing_net: 10, preparer: "ben", salary: 30 },
  { id: id(4), adjustment: "4", code: "TB-4", account: "2000", period: "P02", posted: "2026-02-28", currency: "MYR", period_net: 30, closing_net: 40, preparer: "cy", salary: 40 },
  { id: id(5), adjustment: "0.25", code: "TB-5", account: "2000", period: "P02", posted: "2026-03-31", currency: "MYR", period_net: 6, closing_net: 46, preparer: "ben", salary: 50 },
];

function lists(described = descriptor(), data: readonly Record<string, unknown>[] = rows) {
  const persistence = createInMemoryRecordPersistence();
  persistence.seed(described, tenantId, data.map((row) => ({ ...row, tenant_id: tenantId })));
  const options = { ...persistence, metadata: { getEntityDescriptor: async () => described }, authorizer: { authorize: async () => ({ allowed: true as const }) } };
  const listExecutor = createRecordListExecutor(options);
  return createEntityListService({ ...options, listExecutor, queries: createRecordQueryService(options, listExecutor) });
}
const summary = { context, entityCode: "trial_balance", countMode: "exact" as const, groupsOnly: true, groupTotals: true };

describe("Summary projection (Aggregate blueprint 5.3)", () => {
  it("publishes the declared dimensions and measures, one entry per field and aggregate", async () => {
    const published = parseEntityListDescriptor(await lists().descriptor(context, "trial_balance"));
    expect(published.surface.supportedModes).toContain("aggregate");
    const surface = published.surface.aggregate!;
    expect(surface.dimensions.map((item) => item.field)).toEqual(["account", "period", "posted"]);
    expect(surface.measures.map((item) => item.key)).toEqual(["count", "period_net:sum", "period_net:average", "closing_net:sum", "closing_net:maximum", "preparer:countDistinct", "salary:average"]);
    expect(surface.measures.find((item) => item.key === "closing_net:sum")).toMatchObject({ currencyField: "currency", timeFields: [{ key: "period" }] });
    expect(surface.measures.find((item) => item.key === "salary:average")).toMatchObject({ minimumGroupSize: 3 });
    expect(surface.defaults).toEqual({ rows: ["account", "period"], measures: ["period_net:sum", "closing_net:sum"] });
  });

  it("is unavailable without exact counts", async () => {
    const published = await lists(descriptor({ limits: { countMode: "none" } })).descriptor(context, "trial_balance");
    expect(published.surface.aggregate).toBeUndefined();
    expect(published.surface.unavailableModes).toContainEqual({ mode: "aggregate", code: "LIST_AGGREGATE_COUNTS_UNAVAILABLE" });
  });

  it("drops a masked dimension or measure with one restricted statement, and a money measure whose currency is masked", () => {
    const listed = descriptor().fields.map((field) => ({ key: field.key, label: field.key, valueKind: field.type }) as never);
    const resolution = resolveListAggregate({
      aggregate: descriptor().listPresentation!.aggregate!,
      fields: listed,
      entityFields: descriptor().fields,
      masked: (key) => key === "account" || key === "currency",
      technical: new Set(),
      exactCounts: true,
    });
    expect("aggregate" in resolution && resolution.aggregate.fieldsRestricted).toBe(true);
    const projected = "aggregate" in resolution ? resolution.aggregate : undefined;
    expect(projected?.dimensions.map((item) => item.field)).toEqual(["period", "posted"]);
    expect(projected?.measures.map((item) => item.key)).toEqual(["count", "preparer:countDistinct", "salary:average"]);
    // Defaults fall back to what remains readable.
    expect(projected?.defaults).toEqual({ rows: ["period"], measures: ["count"] });
    expect(
      resolveListAggregate({ aggregate: descriptor().listPresentation!.aggregate!, fields: listed, entityFields: descriptor().fields, masked: (key) => ["account", "period", "posted"].includes(key), technical: new Set(), exactCounts: true }),
    ).toEqual({ unavailable: "LIST_AGGREGATE_DIMENSION_UNAVAILABLE" });
  });
});

describe("Summary requests (Aggregate blueprint 5.4, 8, 9)", () => {
  it("returns each group and the parent total from base rows in one request", async () => {
    const page = parseEntityListResult(
      await lists().list({ ...summary, group: "account", groupAggregates: [{ field: "period_net", aggregate: "average" }, { field: "preparer", aggregate: "countDistinct" }] }),
    );
    expect(page.groups?.map((group) => [group.value, group.count, group.aggregates])).toEqual([
      ["1000", 2, { "period_net:average": 75, "preparer:countDistinct": 1 }],
      ["2000", 3, { "period_net:average": "15.333333333333", "preparer:countDistinct": 2 }].map((value, index) => (index === 2 ? expect.objectContaining({ "preparer:countDistinct": 2 }) : value)),
    ]);
    // The average total is the base rows' average (196 / 5), never the
    // average of the two group averages; the distinct total is three people,
    // never 1 + 2.
    expect(page.parentGroup).toMatchObject({ count: 5, aggregates: { "period_net:average": 39.2, "preparer:countDistinct": 3 } });
  });

  it("never sums a semi-additive measure across its time field", async () => {
    const byAccount = parseEntityListResult(await lists().list({ ...summary, group: "account", groupAggregates: [{ field: "period_net", aggregate: "sum" }, { field: "closing_net", aggregate: "sum" }, { field: "closing_net", aggregate: "maximum" }] }));
    for (const group of [...byAccount.groups!, byAccount.parentGroup!]) {
      expect(group.states).toEqual({ "closing_net:sum": "notSummable" });
      expect(group.aggregates?.["closing_net:sum"]).toBeUndefined();
      expect(group.aggregateCurrencies?.["closing_net:sum"]).toBeUndefined();
      // The additive measure and the maximum of the balance stay.
      expect(group.aggregates?.["period_net:sum"]).toBeDefined();
      expect(group.aggregates?.["closing_net:maximum"]).toBeDefined();
    }
    // Grouped by the time field: each period's cells sum; the parent, which
    // rolls up across periods, does not.
    const byPeriod = parseEntityListResult(await lists().list({ ...summary, group: "period", groupAggregates: [{ field: "closing_net", aggregate: "sum" }] }));
    expect(byPeriod.groups?.map((group) => group.aggregates?.["closing_net:sum"])).toEqual([110, 236]);
    expect(byPeriod.parentGroup?.states).toEqual({ "closing_net:sum": "notSummable" });
    // Pinned by an eq filter (an ancestor level or a list filter): sums everywhere.
    const pinned = parseEntityListResult(await lists().list({ ...summary, group: "account", filters: [{ field: "period", operator: "eq", value: "P02" }], groupAggregates: [{ field: "closing_net", aggregate: "sum" }] }));
    expect(pinned.groups?.map((group) => group.aggregates?.["closing_net:sum"])).toEqual([150, 86]);
    expect(pinned.parentGroup?.aggregates?.["closing_net:sum"]).toBe(236);
  });

  it("withholds a measure below its floor, and keeps the count", async () => {
    const page = parseEntityListResult(await lists().list({ ...summary, group: "account", groupAggregates: [{ field: "salary", aggregate: "average" }] }));
    expect(page.groups?.[0]).toMatchObject({ value: "1000", count: 2, states: { "salary:average": "suppressed" } });
    expect(page.groups?.[0]?.aggregates?.["salary:average"]).toBeUndefined();
    expect(page.groups?.[1]?.aggregates?.["salary:average"]).toBe(40);
    expect(page.parentGroup?.aggregates?.["salary:average"]).toBe(30);
  });

  it("groups a date dimension by a declared bucket", async () => {
    const page = parseEntityListResult(await lists().list({ ...summary, group: "posted", groupBucket: { unit: "quarter" } }));
    expect(page.groups?.map((group) => [group.value, group.count])).toEqual([["2026-Q1", 5]]);
    expect(page.parentGroup?.count).toBe(5);
  });

  it("refuses what the declaration does not offer", async () => {
    const refused = (request: Record<string, unknown>) => expect(lists().list({ ...summary, group: "account", ...request } as never)).rejects.toMatchObject({ code: "LIST_AGGREGATE_INVALID" });
    // An ungroupable field is refused by the list's own grouping rule first.
    await expect(lists().list({ ...summary, group: "code" })).rejects.toMatchObject({ code: "GROUP_FIELD_NOT_ALLOWED" });
    await expect(lists().list({ ...summary, group: "posted" })).rejects.toMatchObject({ code: "LIST_GROUP_INVALID" });
    // A bucket the declaration does not offer.
    const monthly = descriptor({ aggregate: { ...aggregate, dimensions: [{ field: "account" }, { field: "posted", buckets: ["month"] }] } });
    await expect(lists(monthly).list({ ...summary, group: "posted", groupBucket: { unit: "quarter" } })).rejects.toMatchObject({ code: "LIST_AGGREGATE_INVALID" });
    await refused({ group: "posted", groupBucket: { unit: "month" }, groupAggregates: [{ field: "salary", aggregate: "sum" }] });
    await refused({ groupAggregates: [{ field: "period_net", aggregate: "minimum" }] });
    await expect(lists(descriptor({ supportedModes: ["table"], aggregate: undefined })).list({ ...summary, group: "account" })).rejects.toMatchObject({ code: "LIST_AGGREGATE_INVALID" });
    // A distinct count belongs to a Summary request.
    await expect(lists().list({ context, entityCode: "trial_balance", countMode: "exact", groupsOnly: true, group: "account", groupAggregates: [{ field: "preparer", aggregate: "countDistinct" }] })).rejects.toMatchObject({ code: "LIST_GROUP_AGGREGATE_INVALID" });
  });

  it("parses totals and countDistinct on the list operation", () => {
    expect(parseRecordListParameters({ group: "account", groupsOnly: "true", countMode: "exact", totals: "true", aggregate: "preparer:countDistinct" })).toMatchObject({
      groupTotals: true,
      groupAggregates: [{ field: "preparer", aggregate: "countDistinct" }],
    });
    expect(() => parseRecordListParameters({ group: "account", totals: "true" })).toThrow(/totals requires groupsOnly/);
  });
});

describe("grouped Table sums follow additivity (decision 8)", () => {
  const grouped = { context, entityCode: "trial_balance", countMode: "exact" as const, groupsOnly: true };

  it("leaves a field that declares no additivity exactly as it was", async () => {
    const page = parseEntityListResult(await lists().list({ ...grouped, group: "account", groupAggregates: [{ field: "adjustment", aggregate: "sum" }] }));
    expect(page.groups?.map((group) => [group.value, group.aggregates, group.states])).toEqual([
      ["1000", { "adjustment:sum": 3.75 }, undefined],
      ["2000", { "adjustment:sum": 7.25 }, undefined],
    ]);
    expect(page.parentGroup).toBeUndefined();
  });

  it("withholds a semi-additive sum across its time field, as a Summary does", async () => {
    const page = parseEntityListResult(await lists().list({ ...grouped, group: "account", groupAggregates: [{ field: "period_net", aggregate: "sum" }, { field: "closing_net", aggregate: "sum" }] }));
    for (const group of page.groups!) {
      expect(group.states).toEqual({ "closing_net:sum": "notSummable" });
      expect(group.aggregates?.["closing_net:sum"]).toBeUndefined();
      expect(group.aggregates?.["period_net:sum"]).toBeDefined();
    }
    // The same rule on a grouped page that also returns rows.
    const rowsAndGroups = parseEntityListResult(await lists().list({ context, entityCode: "trial_balance", countMode: "exact", group: "account", groupAggregates: [{ field: "closing_net", aggregate: "sum" }] }));
    expect(rowsAndGroups.rows.length).toBeGreaterThan(0);
    expect(rowsAndGroups.groups?.every((group) => group.states?.["closing_net:sum"] === "notSummable")).toBe(true);
  });

  it("still sums a cell that is safe: grouped by the time field, or with it pinned", async () => {
    const byPeriod = parseEntityListResult(await lists().list({ ...grouped, group: "period", groupAggregates: [{ field: "closing_net", aggregate: "sum" }] }));
    expect(byPeriod.groups?.map((group) => group.aggregates?.["closing_net:sum"])).toEqual([110, 236]);
    expect(byPeriod.groups?.some((group) => group.states)).toBe(false);
    const pinned = parseEntityListResult(await lists().list({ ...grouped, group: "account", filters: [{ field: "period", operator: "eq", value: "P01" }], groupAggregates: [{ field: "closing_net", aggregate: "sum" }] }));
    expect(pinned.groups?.map((group) => group.aggregates?.["closing_net:sum"])).toEqual([100, 10]);
  });

  it("publishes the time fields a semi-additive sum stays within", async () => {
    const published = parseEntityListDescriptor(await lists().descriptor(context, "trial_balance"));
    expect(published.fields.find((field) => field.key === "closing_net")?.sumWithin).toEqual([{ key: "period", label: "Period" }]);
    expect(published.fields.find((field) => field.key === "period_net")?.sumWithin).toBeUndefined();
    expect(published.fields.find((field) => field.key === "adjustment")?.sumWithin).toBeUndefined();
  });
});

describe("Summary column dimension (Aggregate A2)", () => {
  const measures = [{ field: "period_net", aggregate: "sum" as const }, { field: "closing_net", aggregate: "sum" as const }];

  it("returns each row's cells aligned with the columns, row totals, column totals and the total from base rows", async () => {
    const page = parseEntityListResult(await lists().list({ ...summary, group: "account", pivot: "period", groupAggregates: measures }));
    expect(page.pivotColumns).toEqual([{ value: "P01", label: "P01" }, { value: "P02", label: "P02" }]);
    const [cash, payables] = page.groups!;
    expect(cash!.cells?.map((cell) => cell?.aggregates)).toEqual([{ "period_net:sum": 100, "closing_net:sum": 100 }, { "period_net:sum": 50, "closing_net:sum": 150 }]);
    expect(payables!.cells?.map((cell) => [cell?.count, cell?.aggregates?.["closing_net:sum"]])).toEqual([[1, 10], [2, 86]]);
    // A row total crosses periods: the balance is withheld, the movement sums.
    expect(cash!.states).toEqual({ "closing_net:sum": "notSummable" });
    expect(cash!.aggregates?.["period_net:sum"]).toBe(150);
    // A column total is within one period: it sums; the grand total does not.
    expect(page.parentGroup?.cells?.map((cell) => cell?.aggregates?.["closing_net:sum"])).toEqual([110, 236]);
    expect(page.parentGroup?.states).toEqual({ "closing_net:sum": "notSummable" });
    expect(page.parentGroup?.count).toBe(5);
  });

  it("keeps an expansion's columns, with no cell where a row has no records", async () => {
    const page = parseEntityListResult(
      await lists().list({ ...summary, group: "period", filters: [{ field: "account", operator: "eq", value: "1000" }], pivot: "account", pivotValues: ["2000", "1000"], groupAggregates: [measures[0]!] }),
    );
    expect(page.pivotColumns?.map((column) => column.value)).toEqual(["2000", "1000"]);
    expect(page.groups?.map((group) => group.cells?.map((cell) => cell?.aggregates?.["period_net:sum"] ?? null))).toEqual([[null, 100], [null, 50]]);
  });

  it("applies the floor to each cell", async () => {
    const page = parseEntityListResult(await lists().list({ ...summary, group: "account", pivot: "period", groupAggregates: [{ field: "salary", aggregate: "average" }] }));
    // Every cell holds one or two records, below the floor of 3.
    expect(page.groups?.flatMap((group) => group.cells?.map((cell) => cell?.states?.["salary:average"]))).toEqual(["suppressed", "suppressed", "suppressed", "suppressed"]);
    expect(page.groups?.[1]?.aggregates?.["salary:average"]).toBe(40);
  });

  it("refuses an undeclared column, the row level's own field, or a column without totals", async () => {
    const monthlyOnly = descriptor({ aggregate: { ...aggregate, dimensions: [{ field: "account" }, { field: "period" }] } });
    await expect(lists(monthlyOnly).list({ ...summary, group: "account", pivot: "period" })).rejects.toMatchObject({ code: "LIST_AGGREGATE_INVALID" });
    await expect(lists().list({ ...summary, group: "account", pivot: "account" })).rejects.toMatchObject({ code: "LIST_AGGREGATE_INVALID" });
    await expect(lists().list({ ...summary, group: "account", pivot: "posted" })).rejects.toMatchObject({ code: "LIST_AGGREGATE_INVALID" });
    expect(() => parseRecordListParameters({ group: "account", groupsOnly: "true", countMode: "exact", pivot: "period" })).toThrow(/pivot is a Summary column/);
    expect(parseRecordListParameters({ group: "account", groupsOnly: "true", countMode: "exact", totals: "true", pivot: "posted:month", timeZone: "Asia/Kuala_Lumpur", pivotValue: ['"2026-01"', "null"] })).toMatchObject({
      pivot: "posted",
      pivotBucket: { unit: "month", timeZone: "Asia/Kuala_Lumpur" },
      pivotValues: ["2026-01", null],
    });
  });
});

describe("Top / Bottom N (Aggregate A6, section 7.5)", () => {
  const ordered = (key: string, direction: "asc" | "desc" = "desc", limit: 5 | 10 | 20 | 50 = 5) => ({ groupOrder: { key, direction, limit } });

  it("orders groups by a measure across every group, echoes the order and counts ranked groups", async () => {
    const page = parseEntityListResult(await lists().list({ ...summary, group: "account", ...ordered("count") }));
    expect(page.groups?.map((group) => [group.value, group.count])).toEqual([["2000", 3], ["1000", 2]]);
    expect([page.groupOrder, page.groupCount, page.groupsUnranked, page.groupOrderTieAtCut]).toEqual([{ key: "count", direction: "desc", limit: 5 }, 2, 0, undefined]);
    const lowest = parseEntityListResult(await lists().list({ ...summary, group: "account", groupAggregates: [{ field: "period_net", aggregate: "sum" }], ...ordered("period_net:sum", "asc") }));
    expect(lowest.groups?.map((group) => group.value)).toEqual(["2000", "1000"]);
    // Without an order nothing changes.
    expect(parseEntityListResult(await lists().list({ ...summary, group: "account" })).groupCount).toBeUndefined();
  });

  it("keeps a group below the measure's floor out of the ranking, counted only, and still suppressed", async () => {
    // Account 1000 has two records, below the salary floor of 3.
    const page = parseEntityListResult(await lists().list({ ...summary, group: "account", groupAggregates: [{ field: "salary", aggregate: "average" }], ...ordered("salary:average") }));
    expect(page.groups?.map((group) => group.value)).toEqual(["2000"]);
    expect([page.groupCount, page.groupsUnranked]).toEqual([1, 1]);
    expect(page.parentGroup?.aggregates?.["salary:average"]).toBe(30);
  });

  it("ranks a semi-additive sum only where each group's value is shown", async () => {
    await expect(lists().list({ ...summary, group: "account", groupAggregates: [{ field: "closing_net", aggregate: "sum" }], ...ordered("closing_net:sum") })).rejects.toMatchObject({ code: "LIST_AGGREGATE_ORDER_NOT_SUMMABLE" });
    // Grouped by its own time field, or with it pinned, each group's value is valid.
    const byPeriod = parseEntityListResult(await lists().list({ ...summary, group: "period", groupAggregates: [{ field: "closing_net", aggregate: "sum" }], ...ordered("closing_net:sum") }));
    expect(byPeriod.groups?.map((group) => [group.value, group.aggregates?.["closing_net:sum"]])).toEqual([["P02", 236], ["P01", 110]]);
    const pinned = parseEntityListResult(await lists().list({ ...summary, group: "account", filters: [{ field: "period", operator: "eq", value: "P02" }], groupAggregates: [{ field: "closing_net", aggregate: "sum" }], ...ordered("closing_net:sum", "asc") }));
    expect(pinned.groups?.map((group) => group.value)).toEqual(["2000", "1000"]);
  });

  it("refuses the whole level when the measure spans currencies or has an unknown one, never a partial ranking", async () => {
    const request = { ...summary, group: "account", groupAggregates: [{ field: "period_net", aggregate: "sum" as const }], ...ordered("period_net:sum") };
    // Every group is single-currency on its own, but they differ: still refused (deliberately conservative).
    const differing = rows.map((row) => (row.account === "2000" ? { ...row, currency: "EUR" } : row));
    await expect(lists(descriptor(), differing).list(request)).rejects.toMatchObject({ code: "LIST_AGGREGATE_ORDER_MIXED_CURRENCY" });
    const unknown = [...rows, { ...rows[0]!, id: id(9), code: "TB-9", currency: null }];
    await expect(lists(descriptor(), unknown).list(request)).rejects.toMatchObject({ code: "LIST_AGGREGATE_ORDER_UNKNOWN_CURRENCY" });
    // A measure the request does not aggregate cannot order it.
    await expect(lists().list({ ...summary, group: "account", ...ordered("period_net:sum") })).rejects.toMatchObject({ code: "LIST_AGGREGATE_INVALID" });
  });

  it("parses groupOrder and groupLimit on the list operation, together and only on a Summary request", () => {
    const base = { group: "account", groupsOnly: "true", countMode: "exact", totals: "true" };
    expect(parseRecordListParameters({ ...base, groupOrder: "period_net:sum:desc", groupLimit: "10" }).groupOrder).toEqual({ key: "period_net:sum", direction: "desc", limit: 10 });
    expect(parseRecordListParameters({ ...base, groupOrder: "count:asc", groupLimit: "5" }).groupOrder).toEqual({ key: "count", direction: "asc", limit: 5 });
    for (const bad of [{ groupOrder: "count:desc" }, { groupLimit: "10" }, { groupOrder: "count:up", groupLimit: "10" }, { groupOrder: "salary:median:desc", groupLimit: "10" }])
      expect(() => parseRecordListParameters({ ...base, ...bad })).toThrow(/groupOrder/);
    expect(() => parseRecordListParameters({ ...base, groupOrder: "count:desc", groupLimit: "7" })).toThrow();
    expect(() => parseRecordListParameters({ group: "account", groupsOnly: "true", countMode: "exact", groupOrder: "count:desc", groupLimit: "10" })).toThrow(/groupOrder/);
  });
});

describe("nested Top N (decisions 37-41)", () => {
  const ordered = { groupOrder: { key: "closing_net:sum", direction: "desc" as const, limit: 5 as const } };
  // A balance kept per posting date: its time field is a date.
  const dated = descriptor();
  (dated as unknown as { fields: { key: string; list?: unknown }[] }).fields.find((field) => field.key === "closing_net")!.list = { currencyField: "currency", additivity: { kind: "semiAdditive", timeFields: ["posted"] }, aggregations: ["count", "sum"] };

  it("an ancestor's eq filter pins the time field, so an expansion can rank a balance its parent level cannot", async () => {
    const request = { ...summary, group: "account", groupAggregates: [{ field: "closing_net", aggregate: "sum" as const }], ...ordered };
    await expect(lists(dated).list(request)).rejects.toMatchObject({ code: "LIST_AGGREGATE_ORDER_NOT_SUMMABLE" });
    // Under one posting date (an expansion's eq filter), the accounts rank.
    const page = parseEntityListResult(await lists(dated).list({ ...request, filters: [{ field: "posted", operator: "eq", value: "2026-02-28" }] }));
    expect(page.groups?.map((group) => [group.value, group.aggregates?.["closing_net:sum"]])).toEqual([["1000", 150], ["2000", 40]]);
  });

  it("a date bucket is not its own time field: a balance grouped by posting month cannot rank", async () => {
    await expect(lists(dated).list({ ...summary, group: "posted", groupBucket: { unit: "month" }, groupAggregates: [{ field: "closing_net", aggregate: "sum" }], ...ordered })).rejects.toMatchObject({ code: "LIST_AGGREGATE_ORDER_NOT_SUMMABLE" });
  });
});
