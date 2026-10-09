import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from "kysely";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { RecordRepositoryListInput } from "@athyper/server-contract-records";
import { createKyselyRecordRepository } from "./kysely-record-repository.js";

// Matrix rank (Entity list Matrix blueprint section 8, phase M2) on real
// PostgreSQL: the window over every admitted record, ties, empty values,
// eligibility through the column table, difference to best in exact numeric
// arithmetic (zero best included), the participant page narrowing only the
// returned rows, and the data revision. The tables are session temporary
// tables shaped as a two-key fact (item × bid) and its column Entity, as the
// application role inside a rolled-back transaction; the M3 pilot repeats
// this on the real Neon DDL.

const url = process.env["ATHYPER_NEON_TEST_DATABASE_URL"];
const enabled = process.env["ATHYPER_SERVICE_DB_TESTS"] === "true" && Boolean(url);
const tenantId = process.env["ATHYPER_SERVICE_TEST_TENANT_ID"] ?? "11111111-1111-4111-8111-111111111111";
const otherTenantId = process.env["ATHYPER_SERVICE_TEST_OTHER_TENANT_ID"] ?? "55555555-5555-4555-8555-555555555555";
const pool = enabled ? new Pool({ connectionString: url, max: 1 }) : undefined;
afterAll(async () => {
  await pool?.end();
});

async function inSession<T>(work: (client: PoolClient, repository: ReturnType<typeof createKyselyRecordRepository>) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    await client.query("BEGIN");
    const db = new Kysely<Record<string, never>>({
      dialect: {
        createAdapter: () => new PostgresAdapter(),
        createIntrospector: (instance) => new PostgresIntrospector(instance),
        createQueryCompiler: () => new PostgresQueryCompiler(),
        createDriver: () => ({
          init: async () => undefined,
          destroy: async () => undefined,
          releaseConnection: async () => undefined,
          beginTransaction: async () => undefined,
          commitTransaction: async () => undefined,
          rollbackTransaction: async () => undefined,
          acquireConnection: async () => ({
            executeQuery: async (query: { sql: string; parameters: readonly unknown[] }) => ({ rows: (await client.query(query.sql, [...query.parameters])).rows as never[] }),
            streamQuery: () => {
              throw new Error("unused");
            },
          }),
        }),
      },
    });
    await client.query(`
      CREATE TEMP TABLE matrix_bid (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, code text NOT NULL, status text NOT NULL, deleted_at timestamptz) ON COMMIT DROP;
      CREATE TEMP TABLE matrix_line (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, version integer NOT NULL DEFAULT 1, event_id uuid NOT NULL, item_id uuid NOT NULL, bid_id uuid NOT NULL, evaluated numeric(18,4), UNIQUE (tenant_id, item_id, bid_id)) ON COMMIT DROP;
    `);
    return await work(client, createKyselyRecordRepository({ databases: { neon: db } as never }));
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

const descriptor = (object: string, fields: readonly [string, string][], extra: Record<string, unknown> = {}) =>
  ({
    schema: "athyper.entity-runtime-descriptor/1.0",
    entityCode: object,
    planeKey: "neon",
    releaseId: "matrix-rank-postgres",
    releaseNo: 1,
    contractHash: "a".repeat(64),
    compiledHash: "b".repeat(64),
    storage: { schema: "pg_temp", object, idField: "id", tenantField: "tenant_id", ...extra },
    fields: fields.map(([key, type]) => ({ key, storagePath: key, type, required: true, writableOn: [], filterable: true, sortable: true })),
    operations: { read: { code: "read" } },
  }) as unknown as EntityRuntimeDescriptor;
const line = descriptor("matrix_line", [["event_id", "reference"], ["item_id", "reference"], ["bid_id", "reference"], ["evaluated", "money"]], { versionField: "version" });
const bid = descriptor("matrix_bid", [["code", "string"], ["status", "string"]], { softDeleteField: "deleted_at" });

const ids = { event: randomUUID(), other: randomUUID(), itemA: randomUUID(), itemB: randomUUID(), bids: Array.from({ length: 5 }, () => randomUUID()) };
async function seed(client: PoolClient) {
  const statuses = ["submitted", "submitted", "submitted", "disqualified", "submitted"];
  for (const [index, id] of ids.bids.entries())
    await client.query("INSERT INTO matrix_bid (id, tenant_id, code, status) VALUES ($1, $2, $3, $4)", [id, tenantId, `B-${index + 1}`, statuses[index]]);
  // Item A: bids 1–5 at 120, 100, 100, 50 (disqualified), empty. Item B: 0 (a
  // valid zero), 80. Another tenant's cheaper line and another event's never count.
  const lines: [string, string, string | null][] = [
    [ids.itemA, ids.bids[0]!, "120.0000"],
    [ids.itemA, ids.bids[1]!, "100.0000"],
    [ids.itemA, ids.bids[2]!, "100.0000"],
    [ids.itemA, ids.bids[3]!, "50.0000"],
    [ids.itemA, ids.bids[4]!, null],
    [ids.itemB, ids.bids[0]!, "0.0000"],
    [ids.itemB, ids.bids[1]!, "80.0000"],
  ];
  for (const [item, bidId, amount] of lines)
    await client.query("INSERT INTO matrix_line (id, tenant_id, event_id, item_id, bid_id, evaluated) VALUES ($1, $2, $3, $4, $5, $6)", [randomUUID(), tenantId, ids.event, item, bidId, amount]);
  await client.query("INSERT INTO matrix_line (id, tenant_id, event_id, item_id, bid_id, evaluated) VALUES ($1, $2, $3, $4, $5, 1)", [randomUUID(), otherTenantId, ids.event, ids.itemA, randomUUID()]);
  await client.query("INSERT INTO matrix_line (id, tenant_id, event_id, item_id, bid_id, evaluated) VALUES ($1, $2, $3, $4, $5, 1)", [randomUUID(), tenantId, ids.other, ids.itemA, randomUUID()]);
}
const input = (extra: Partial<RecordRepositoryListInput> = {}): RecordRepositoryListInput => ({
  descriptor: line,
  tenantId,
  limit: 100,
  sort: [{ field: "evaluated", direction: "asc" }],
  countMode: "none",
  projection: ["item_id", "bid_id", "evaluated"],
  cursorScope: "matrix-rank-postgres",
  collectionScope: [],
  filters: [
    { field: "event_id", operator: "eq", value: ids.event },
    { field: "item_id", operator: "in", value: [ids.itemA, ids.itemB] },
  ],
  rank: { field: "evaluated", better: "lower", partition: ["item_id"] },
  ...extra,
});
const byBid = (result: Awaited<ReturnType<ReturnType<typeof createKyselyRecordRepository>["list"]>>, item: string) =>
  Object.fromEntries(
    result.data.flatMap((row, index) => (row["item_id"] === item ? [[ids.bids.indexOf(String(row["bid_id"])) + 1, result.ranks![index]]] : [])),
  );

describe.skipIf(!enabled)("Matrix rank on real PostgreSQL", () => {
  it("ranks every admitted record per row: ties share a rank, empty values are not ranked, a zero best has no percentage", async () => {
    await inSession(async (client, repository) => {
      await seed(client);
      const result = await repository.list(input());
      expect(byBid(result, ids.itemA)).toEqual({
        1: { rank: 4, count: 4, best: "50.0000", difference: "140.0" },
        2: { rank: 2, count: 4, best: "50.0000", difference: "100.0" },
        3: { rank: 2, count: 4, best: "50.0000", difference: "100.0" },
        4: { rank: 1, count: 4, best: "50.0000" },
        5: null,
      });
      expect(byBid(result, ids.itemB)).toEqual({ 1: { rank: 1, count: 2, best: "0.0000" }, 2: { rank: 2, count: 2, best: "0.0000" } });
      expect(result.rankRevision).toMatch(/^[a-f0-9]{32}$/);
    });
  });

  it("ranks only eligible column records, through the column table and its stored predicates", async () => {
    await inSession(async (client, repository) => {
      await seed(client);
      const eligibility = { field: "bid_id", column: bid, columnField: "status", values: ["submitted"] };
      const result = await repository.list(input({ rank: { field: "evaluated", better: "lower", partition: ["item_id"], eligibility } }));
      expect(byBid(result, ids.itemA)).toMatchObject({ 1: { rank: 3, count: 3, best: "100.0000", difference: "20.0" }, 2: { rank: 1 }, 3: { rank: 1 }, 4: null });
      // A soft-deleted column record is not eligible either.
      await client.query("UPDATE matrix_bid SET deleted_at = now() WHERE id = $1", [ids.bids[1]]);
      const again = await repository.list(input({ rank: { field: "evaluated", better: "lower", partition: ["item_id"], eligibility } }));
      expect(byBid(again, ids.itemA)).toMatchObject({ 1: { rank: 2, count: 2 }, 2: null, 3: { rank: 1, count: 2 } });
    });
  });

  it("narrows the returned rows to the participant page without changing any rank, and the revision follows the data", async () => {
    await inSession(async (client, repository) => {
      await seed(client);
      const full = await repository.list(input());
      const page = await repository.list(input({ rank: { field: "evaluated", better: "lower", partition: ["item_id"], output: { field: "bid_id", values: [ids.bids[0]!] } } }));
      expect(page.data.every((row) => row["bid_id"] === ids.bids[0])).toBe(true);
      expect(byBid(page, ids.itemA)).toEqual({ 1: { rank: 4, count: 4, best: "50.0000", difference: "140.0" } });
      expect(page.rankRevision).toBe(full.rankRevision);
      await client.query("UPDATE matrix_line SET evaluated = 90, version = version + 1 WHERE bid_id = $1 AND item_id = $2", [ids.bids[0], ids.itemA]);
      const changed = await repository.list(input());
      expect(changed.rankRevision).not.toBe(full.rankRevision);
      expect(byBid(changed, ids.itemA)[1]).toEqual({ rank: 2, count: 4, best: "50.0000", difference: "80.0" });
    });
  });

  it("ranks higher-is-better by the largest value", async () => {
    await inSession(async (client, repository) => {
      await seed(client);
      const result = await repository.list(input({ rank: { field: "evaluated", better: "higher", partition: ["item_id"] } }));
      expect(byBid(result, ids.itemA)).toMatchObject({ 1: { rank: 1, best: "120.0000" }, 4: { rank: 4, difference: "58.3" } });
    });
  });
});
