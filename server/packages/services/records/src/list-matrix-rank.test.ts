import { describe, expect, it } from "vitest";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { ListRecordsQuery } from "@athyper/server-contract-records";
import { resolveMatrixRank } from "./list-matrix-rank.js";
import { createInMemoryRecordPersistence } from "./in-memory-record-repository.js";

const descriptor = (object: string, keys: readonly [string, string, string?][], extra: Record<string, unknown> = {}) =>
  ({
    entityCode: object,
    planeKey: "neon",
    compiledHash: "b".repeat(64),
    storage: { schema: "test", object, idField: "id", tenantField: "tenant_id", versionField: "version" },
    fields: keys.map(([key, type, target]) => ({ key, storagePath: key, type, required: true, writableOn: [], filterable: true, sortable: true, ...(target ? { referenceTargetEntity: target } : {}) })),
    operations: { read: { code: "read" } },
    ...extra,
  }) as unknown as EntityRuntimeDescriptor;
const bid = descriptor("bid", [["code", "string"], ["status", "string"]]);
const fact = descriptor("line", [["event", "reference", "event"], ["item", "reference", "item"], ["bid", "reference", "bid"], ["evaluated", "money"], ["note", "string"]], {
  listPresentation: {
    limits: { countMode: "exact" },
    supportedModes: ["table", "matrix"],
    matrix: {
      parentField: "event",
      rows: { field: "item", parentField: "event" },
      columns: { field: "bid", parentField: "event" },
      measures: [{ field: "evaluated", rank: true, better: "lower", evaluation: true }, { field: "note" }],
      rankEligibility: { field: "status", values: ["submitted"] },
    },
  },
});
const readable = new Set(["event", "item", "bid", "evaluated", "note"]);
const query = (extra: Partial<ListRecordsQuery>) => ({ context: {} as never, entityCode: "line", ...extra }) as ListRecordsQuery;
const admit = (extra: Partial<ListRecordsQuery>, overrides: Partial<Parameters<typeof resolveMatrixRank>[0]> = {}) =>
  resolveMatrixRank({ descriptor: fact, query: query(extra), readableKeys: readable, loadColumn: async () => bid, ...overrides });

describe("Matrix rank admission", () => {
  it("builds the rank input from the published Matrix, with eligibility read from the column Entity", async () => {
    const id = "6f3c2a10-1111-4111-8111-111111111111";
    await expect(admit({ rank: "evaluated", matrixColumns: [id] })).resolves.toMatchObject({
      field: "evaluated",
      better: "lower",
      partition: ["item"],
      output: { field: "bid", values: [id] },
      eligibility: { field: "bid", columnField: "status", values: ["submitted"] },
    });
    await expect(admit({})).resolves.toBeUndefined();
  });

  it("refuses what it cannot rank, and fails closed when eligibility cannot be applied", async () => {
    await expect(admit({ matrixColumns: ["6f3c2a10-1111-4111-8111-111111111111"] })).rejects.toMatchObject({ code: "LIST_MATRIX_RANK_INVALID" });
    await expect(admit({ rank: "note" })).rejects.toMatchObject({ code: "LIST_MATRIX_RANK_UNAVAILABLE" });
    await expect(admit({ rank: "evaluated" }, { readableKeys: new Set(["event", "item", "evaluated"]) })).rejects.toMatchObject({ code: "LIST_MATRIX_RANK_UNAVAILABLE" });
    await expect(admit({ rank: "evaluated", countMode: "exact" })).rejects.toMatchObject({ code: "LIST_MATRIX_RANK_INVALID" });
    await expect(admit({ rank: "evaluated", matrixColumns: ["not-an-id"] })).rejects.toMatchObject({ code: "LIST_MATRIX_RANK_INVALID" });
    await expect(admit({ rank: "evaluated" }, { loadColumn: async () => descriptor("bid", [["code", "string"]]) })).rejects.toMatchObject({ code: "LIST_MATRIX_ELIGIBILITY_UNAVAILABLE" });
    const inexact = { ...fact, listPresentation: { ...fact.listPresentation!, limits: { countMode: "none" as const } } };
    await expect(admit({ rank: "evaluated" }, { descriptor: inexact })).rejects.toMatchObject({ code: "LIST_MATRIX_RANK_UNAVAILABLE" });
  });

  it("the in-memory repository ranks like the SQL: ties, empty values, eligibility, zero best and the participant page", async () => {
    const persistence = createInMemoryRecordPersistence();
    const tenantId = "11111111-1111-4111-8111-111111111111";
    persistence.seed(bid, tenantId, [
      { id: "b1", code: "B-1", status: "submitted" },
      { id: "b2", code: "B-2", status: "submitted" },
      { id: "b3", code: "B-3", status: "disqualified" },
    ]);
    persistence.seed(fact, tenantId, [
      { id: "l1", version: 1, event: "e", item: "a", bid: "b1", evaluated: "120.00" },
      { id: "l2", version: 1, event: "e", item: "a", bid: "b2", evaluated: "100.00" },
      { id: "l3", version: 1, event: "e", item: "a", bid: "b3", evaluated: "50.00" },
      { id: "l4", version: 1, event: "e", item: "b", bid: "b1", evaluated: "0" },
      { id: "l5", version: 1, event: "e", item: "b", bid: "b2", evaluated: null },
    ]);
    const list = (rank: Record<string, unknown>) =>
      persistence.repository.list({ descriptor: fact, tenantId, limit: 100, filters: [{ field: "event", operator: "eq", value: "e" }], sort: [], countMode: "none", projection: ["item", "bid", "evaluated"], cursorScope: "test", collectionScope: [], rank: { field: "evaluated", better: "lower", partition: ["item"], ...rank } as never });
    const all = await list({});
    expect(Object.fromEntries(all.data.map((row, index) => [row["id"] ?? index, all.ranks![index]]))).toEqual({
      l1: { rank: 3, count: 3, best: "50.00", difference: "140.0" },
      l2: { rank: 2, count: 3, best: "50.00", difference: "100.0" },
      l3: { rank: 1, count: 3, best: "50.00" },
      l4: { rank: 1, count: 1, best: "0" },
      l5: null,
    });
    const eligible = await list({ eligibility: { field: "bid", column: bid, columnField: "status", values: ["submitted"] }, output: { field: "bid", values: ["b1"] } });
    expect(eligible.data.map((row) => row["id"])).toEqual(["l1", "l4"]);
    expect(eligible.ranks).toEqual([{ rank: 2, count: 2, best: "100.00", difference: "20.0" }, { rank: 1, count: 1, best: "0" }]);
    expect(eligible.rankRevision).toMatch(/^[a-f0-9]{32}$/);
  });
});
