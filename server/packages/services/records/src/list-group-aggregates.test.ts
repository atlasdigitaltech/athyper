import { describe, expect, it } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { parseEntityListResult } from "@athyper/contract-platform-entity-list";
import { createEntityListService } from "./entity-list-service.js";
import { createInMemoryRecordPersistence } from "./in-memory-record-repository.js";
import { createRecordListExecutor, createRecordQueryService } from "./query-service.js";
import { parseRecordListParameters } from "./records-routes.js";
import { aggregateValue } from "./kysely-record-repository.js";

// Group aggregates (Tree blueprint A2) and grouping by month or quarter (A3).
const id = (n: number) => `7f3c2e1d-4b5a-4c6d-8e9f-${String(n).padStart(12, "0")}`;
const descriptor = (countMode: "exact" | "none" = "exact") =>
  ({
    schema: "athyper.entity-runtime-descriptor/1.0", entityCode: "invoice", planeKey: "neon",
    releaseId: "r", releaseNo: 1, contractHash: "a".repeat(64), compiledHash: "b".repeat(64),
    storage: { schema: "app", object: "invoice", idField: "id", tenantField: "tenant_id" },
    fields: [
      { key: "code", storagePath: "code", type: "string", required: true, writableOn: [], filterable: true, sortable: true },
      { key: "status", storagePath: "status", type: "enum", required: true, writableOn: [], filterable: true, list: { groupable: true }, validation: { options: ["open", "paid"] } },
      { key: "due", storagePath: "due", type: "date", required: false, writableOn: [], filterable: true, list: { groupable: true } },
      { key: "posted", storagePath: "posted", type: "datetime", required: true, writableOn: [], filterable: true, list: { groupable: true } },
      { key: "amount", storagePath: "amount", type: "money", required: true, writableOn: [], list: { aggregations: ["count", "sum"] } },
      { key: "rate", storagePath: "rate", type: "decimal", required: false, writableOn: [] },
    ],
    operations: { read: { code: "read", permissionCode: "invoice.read" } },
    listPresentation: { identityField: "code", limits: { countMode } },
  }) as unknown as EntityRuntimeDescriptor;
const tenantId = "11111111-1111-4111-8111-111111111111";
const context = {
  planeKey: "neon", realmKey: "athyper", tenantId, principalId: "actor", authEpoch: 1, profileHash: "p", requestId: "r",
  permissions: { planeKey: "neon", tenantId, principalId: "actor", principalFingerprint: "a", profileHash: "p", schemaHash: "s", resolvedAt: 1, allowed: [], denied: [], planLocked: [], planeExcluded: [], entries: [], authorizationScopes: [] },
} as unknown as VerifiedRequestContext;

function lists(described = descriptor()) {
  const persistence = createInMemoryRecordPersistence();
  persistence.seed(described, tenantId, [
    { id: id(1), tenant_id: tenantId, code: "INV-1", status: "open", due: "2026-09-15", posted: "2026-09-30T20:00:00Z", amount: 100, rate: 1 },
    { id: id(2), tenant_id: tenantId, code: "INV-2", status: "open", due: "2026-10-02", posted: "2026-10-01T10:00:00Z", amount: 250.5, rate: 2 },
    { id: id(3), tenant_id: tenantId, code: "INV-3", status: "paid", due: "2026-10-20", posted: "2026-10-20T10:00:00Z", amount: 50, rate: null },
    { id: id(4), tenant_id: tenantId, code: "INV-4", status: "paid", due: null, posted: "2026-12-31T10:00:00Z", amount: 10, rate: null },
  ]);
  const options = { ...persistence, metadata: { getEntityDescriptor: async () => described }, authorizer: { authorize: async () => ({ allowed: true }) } };
  const listExecutor = createRecordListExecutor(options);
  return createEntityListService({ ...options, listExecutor, queries: createRecordQueryService(options, listExecutor) });
}
const request = { context, entityCode: "invoice", countMode: "exact" as const, groupsOnly: true };

describe("group aggregates (A2)", () => {
  it("returns each group's published aggregates beside its count", async () => {
    const page = parseEntityListResult(await lists().list({ ...request, group: "status", groupAggregates: [{ field: "amount", aggregate: "sum" }] }));
    expect(page.groups).toEqual([
      { value: "open", label: "open", count: 2, aggregates: { "amount:sum": 350.5 } },
      { value: "paid", label: "paid", count: 2, aggregates: { "amount:sum": 60 } },
    ]);
  });

  it("refuses an unpublished aggregate, a non-numeric field, or aggregates without exact counts", async () => {
    for (const groupAggregates of [[{ field: "amount", aggregate: "average" as const }], [{ field: "rate", aggregate: "sum" as const }], [{ field: "code", aggregate: "sum" as const }]])
      await expect(lists().list({ ...request, group: "status", groupAggregates })).rejects.toMatchObject({ code: "LIST_GROUP_AGGREGATE_INVALID" });
    await expect(lists().list({ context, entityCode: "invoice", group: "status", groupAggregates: [{ field: "amount", aggregate: "sum" }] })).rejects.toMatchObject({ code: "LIST_GROUP_AGGREGATE_INVALID" });
  });

  it("parses repeated aggregate parameters", () => {
    expect(parseRecordListParameters({ group: "status", aggregate: ["amount:sum", "rate:average"] }).groupAggregates).toEqual([{ field: "amount", aggregate: "sum" }, { field: "rate", aggregate: "average" }]);
    expect(() => parseRecordListParameters({ aggregate: "amount:count" })).toThrow(/aggregate must be/);
  });
});

describe("grouping by month or quarter (A3)", () => {
  it("groups a date field into chronological month and quarter buckets, with no value last", async () => {
    const months = parseEntityListResult(await lists().list({ ...request, group: "due", groupBucket: { unit: "month" } }));
    expect(months.groups?.map((group) => [group.value, group.count])).toEqual([["2026-09", 1], ["2026-10", 2], [null, 1]]);
    const quarters = parseEntityListResult(await lists().list({ ...request, group: "due", groupBucket: { unit: "quarter" } }));
    expect(quarters.groups?.map((group) => [group.value, group.count])).toEqual([["2026-Q3", 1], ["2026-Q4", 2], [null, 1]]);
  });

  it("buckets a datetime field in the viewer's zone", async () => {
    // 2026-09-30T20:00Z is 1 October in Kuala Lumpur.
    const page = parseEntityListResult(await lists().list({ ...request, group: "posted", groupBucket: { unit: "month", timeZone: "Asia/Kuala_Lumpur" } }));
    expect(page.groups?.map((group) => [group.value, group.count])).toEqual([["2026-10", 3], ["2026-12", 1]]);
    await expect(lists().list({ ...request, group: "posted", groupBucket: { unit: "month" } })).rejects.toMatchObject({ code: "LIST_GROUP_INVALID" });
    await expect(lists().list({ ...request, group: "posted", groupBucket: { unit: "month", timeZone: "Mars/Olympus" } })).rejects.toMatchObject({ code: "LIST_GROUP_INVALID" });
  });

  it("refuses a date field without a bucket, a bucket on another field, and buckets without exact counts", async () => {
    await expect(lists().list({ ...request, group: "due" })).rejects.toMatchObject({ code: "LIST_GROUP_INVALID" });
    await expect(lists().list({ ...request, group: "status", groupBucket: { unit: "month" } })).rejects.toMatchObject({ code: "LIST_GROUP_INVALID" });
    await expect(lists().list({ context, entityCode: "invoice", group: "due", groupBucket: { unit: "month" } })).rejects.toMatchObject({ code: "LIST_GROUP_INVALID" });
  });

  it("publishes a date field as groupable only under exact counts", async () => {
    const exact = await lists().descriptor(context, "invoice");
    expect(exact.fields.find((field) => field.key === "due")?.groupable).toBe(true);
    const none = await lists(descriptor("none")).descriptor(context, "invoice");
    expect(none.fields.find((field) => field.key === "due")?.groupable).toBe(false);
  });

  it("parses field:month and field:quarter with the zone, and refuses anything else", () => {
    expect(parseRecordListParameters({ group: "posted:quarter", timeZone: "Asia/Kuala_Lumpur" })).toMatchObject({ group: "posted", groupBucket: { unit: "quarter", timeZone: "Asia/Kuala_Lumpur" } });
    expect(() => parseRecordListParameters({ group: "due:week" })).toThrow(/month or :quarter/);
  });
});

describe("aggregate values from the database", () => {
  it("keeps exact numbers as numbers and anything else as decimal text", () => {
    expect(aggregateValue("1705000.00")).toBe(1705000);
    expect(aggregateValue("12.50")).toBe(12.5);
    expect(aggregateValue("100")).toBe(100);
    expect(aggregateValue("12345678901234567890.12")).toBe("12345678901234567890.12");
    expect(aggregateValue(null)).toBeNull();
  });
});

