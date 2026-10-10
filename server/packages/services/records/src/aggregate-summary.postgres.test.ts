import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from "kysely";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { RecordRepositoryListInput } from "@athyper/server-contract-records";
import { createKyselyRecordRepository } from "./kysely-record-repository.js";

// Summary totals (Entity list Aggregate blueprint section 8.1, phase A1) on
// real PostgreSQL: GROUPING SETS returns every group and the total over all
// of them in one statement, so an average total and a distinct-count total
// come from base rows; a money total spanning currencies is withheld; a
// zoned date bucket groups through the subquery (GROUPING names the grouped
// expression even with a bound time zone); and an authorized identity set,
// as executeAuthorizedAggregate passes it, restricts the groups and the
// total alike (section 9.2). Session temporary tables shaped as a trial
// balance, inside a rolled-back transaction; the A0 pilot repeats this on
// the real Neon view.

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
      CREATE TEMP TABLE summary_balance (
        id uuid PRIMARY KEY, tenant_id uuid NOT NULL, account text NOT NULL, period text, posted_at timestamptz NOT NULL,
        currency_code text, period_net numeric(18,4), preparer text
      ) ON COMMIT DROP;
    `);
    return await work(client, createKyselyRecordRepository({ databases: { neon: db } as never }));
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

const balance = {
  schema: "athyper.entity-runtime-descriptor/1.0",
  entityCode: "summary_balance",
  planeKey: "neon",
  releaseId: "summary-postgres",
  releaseNo: 1,
  contractHash: "a".repeat(64),
  compiledHash: "b".repeat(64),
  storage: { schema: "pg_temp", object: "summary_balance", idField: "id", tenantField: "tenant_id" },
  fields: (
    [
      ["account", "string"],
      ["period", "string"],
      ["posted_at", "datetime"],
      ["currency_code", "string"],
      ["period_net", "money"],
      ["preparer", "string"],
    ] as const
  ).map(([key, type]) => ({ key, storagePath: key, type, required: false, writableOn: [], filterable: true, sortable: true })),
  operations: { read: { code: "read" } },
} as unknown as EntityRuntimeDescriptor;

const ids = Array.from({ length: 7 }, () => randomUUID());
async function seed(client: PoolClient) {
  const row = (index: number, tenant: string, account: string, period: string | null, posted: string, currency: string | null, net: string | null, preparer: string) =>
    client.query("INSERT INTO summary_balance VALUES ($1, $2, $3, $4, $5, $6, $7, $8)", [ids[index], tenant, account, period, posted, currency, net, preparer]);
  await row(0, tenantId, "1000", "P01", "2026-01-31T20:00:00Z", "MYR", "100.0000", "ana");
  await row(1, tenantId, "1000", "P02", "2026-02-28T10:00:00Z", "MYR", "50.0000", "ana");
  await row(2, tenantId, "2000", "P01", "2026-03-31T17:00:00Z", "MYR", "10.0000", "ben");
  await row(3, tenantId, "2000", "P02", "2026-04-01T10:00:00Z", "MYR", "30.0000", "cy");
  await row(4, tenantId, "3000", null, "2026-04-15T10:00:00Z", "USD", "6.0000", "ben");
  // Another tenant's rows never reach a group or the total.
  await row(5, otherTenantId, "1000", "P01", "2026-01-15T10:00:00Z", "MYR", "999.0000", "zed");
  await row(6, otherTenantId, "9000", "P01", "2026-01-15T10:00:00Z", "MYR", "999.0000", "zed");
}

const input = (patch: Partial<RecordRepositoryListInput>): RecordRepositoryListInput =>
  ({
    descriptor: balance,
    tenantId,
    projection: ["id"],
    limit: 1,
    countMode: "exact",
    collectionScope: [],
    groupsOnly: true,
    groupTotals: true,
    group: "account",
    ...patch,
  }) as RecordRepositoryListInput;
const money = { field: "period_net", aggregate: "sum" as const, currencyField: "currency_code" };

describe.skipIf(!enabled)("Summary totals on PostgreSQL (Aggregate blueprint 8.1)", () => {
  it("returns every group and the total over all of them in one statement, from base rows", () =>
    inSession(async (client, repository) => {
      await seed(client);
      const result = await repository.list(
        input({ groupAggregates: [{ field: "period_net", aggregate: "average" }, { field: "preparer", aggregate: "countDistinct" }, money] }),
      );
      expect(result.groups?.map((group) => [group.value, group.count, group.aggregates])).toEqual([
        ["1000", 2, { "period_net:average": 75, "preparer:countDistinct": 1, "period_net:sum": 150 }],
        ["2000", 2, { "period_net:average": 20, "preparer:countDistinct": 2, "period_net:sum": 40 }],
        ["3000", 1, { "period_net:average": 6, "preparer:countDistinct": 1, "period_net:sum": 6 }],
      ]);
      // 196 / 5 over the base rows, not the average of 75, 20 and 6; three
      // distinct preparers, not 1 + 2 + 1; the money total spans MYR and USD.
      expect(result.parentGroup).toEqual({
        count: 5,
        aggregates: { "period_net:average": 39.2, "preparer:countDistinct": 3, "period_net:sum": null },
        mixedCurrencies: ["period_net:sum"],
      });
      expect(result.pagination.total).toBe(5);
    }));

  it("keeps the No value group beside the cap and the total", () =>
    inSession(async (client, repository) => {
      await seed(client);
      const result = await repository.list(input({ group: "period" }));
      expect(result.groups?.map((group) => [group.value, group.count])).toEqual([["P01", 2], ["P02", 2], [null, 1]]);
      expect(result.parentGroup?.count).toBe(5);
    }));

  it("groups a zoned date bucket through the subquery", () =>
    inSession(async (client, repository) => {
      await seed(client);
      // 2026-01-31T20:00Z is February in Kuala Lumpur; 2026-03-31T17:00Z is April.
      const result = await repository.list(input({ group: "posted_at", groupBucket: { unit: "month", timeZone: "Asia/Kuala_Lumpur" } }));
      expect(result.groups?.map((group) => [group.value, group.count])).toEqual([["2026-02", 2], ["2026-04", 3]]);
      expect(result.parentGroup?.count).toBe(5);
    }));

  it("restricts the groups and the total alike to an authorized identity set", () =>
    inSession(async (client, repository) => {
      await seed(client);
      // As executeAuthorizedAggregate passes it after per-record authorization.
      const result = await repository.list(input({ recordIds: [ids[0]!, ids[2]!, ids[3]!], groupAggregates: [money, { field: "preparer", aggregate: "countDistinct" }] }));
      expect(result.groups?.map((group) => [group.value, group.count, group.aggregates?.["period_net:sum"]])).toEqual([["1000", 1, 100], ["2000", 2, 40]]);
      expect(result.parentGroup).toMatchObject({ count: 3, aggregates: { "period_net:sum": 140, "preparer:countDistinct": 3 }, aggregateCurrencies: { "period_net:sum": "MYR" } });
      // An empty authorized set has no groups and a zero total.
      const none = await repository.list(input({ recordIds: [] }));
      expect(none.groups).toEqual([]);
      expect(none.parentGroup).toEqual({ count: 0 });
    }));
});
