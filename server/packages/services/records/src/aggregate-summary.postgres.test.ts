import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from "kysely";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { RecordRepositoryListInput } from "@athyper/server-contract-records";
import { LIST_AGGREGATE_MAX_CELLS, LIST_AGGREGATE_MAX_COLUMNS, LIST_GROUP_LIMIT } from "@athyper/contract-platform-entity-list";
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

/** The last statement the repository sent, so a test can explain it. */
const sent: { sql: string; parameters: readonly unknown[] }[] = [];
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
            executeQuery: async (query: { sql: string; parameters: readonly unknown[] }) => {
              sent.push(query);
              return { rows: (await client.query(query.sql, [...query.parameters])).rows as never[] };
            },
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

describe.skipIf(!enabled)("Summary column dimension on PostgreSQL (Aggregate A2)", () => {
  it("returns cells, row totals, column totals and the total in one statement, No value last among columns", () =>
    inSession(async (client, repository) => {
      await seed(client);
      const result = await repository.list(input({ pivot: { field: "period" }, groupAggregates: [money, { field: "preparer", aggregate: "countDistinct" }] }));
      expect(result.pivotColumns).toEqual(["P01", "P02", null]);
      expect(result.groups?.map((group) => [group.value, group.count, group.cells?.map((cell) => cell?.count ?? null)])).toEqual([
        ["1000", 2, [1, 1, null]],
        ["2000", 2, [1, 1, null]],
        ["3000", 1, [null, null, 1]],
      ]);
      expect(result.groups?.[0]?.cells?.[1]).toEqual({ count: 1, aggregates: { "period_net:sum": 50, "preparer:countDistinct": 1 }, aggregateCurrencies: { "period_net:sum": "MYR" } });
      // Column totals from base rows; the total spans MYR and USD.
      expect(result.parentGroup?.cells?.map((cell) => cell?.aggregates?.["period_net:sum"])).toEqual([110, 80, 6]);
      expect(result.parentGroup).toMatchObject({ count: 5, aggregates: { "period_net:sum": null, "preparer:countDistinct": 3 }, mixedCurrencies: ["period_net:sum"] });
    }));

  it("keeps an expansion's columns in their order, a missing one as no cell, and restricts to an authorized set", () =>
    inSession(async (client, repository) => {
      await seed(client);
      const result = await repository.list(input({ recordIds: [ids[0]!, ids[1]!, ids[4]!], pivot: { field: "period", values: ["P02", "P09", null] }, groupAggregates: [money] }));
      expect(result.pivotColumns).toEqual(["P02", "P09", null]);
      expect(result.groups?.map((group) => [group.value, group.cells?.map((cell) => cell?.aggregates?.["period_net:sum"] ?? null)])).toEqual([
        ["1000", [50, null, null]],
        ["3000", [null, null, 6]],
      ]);
      expect(result.parentGroup?.count).toBe(3);
    }));

  it("pivots a zoned date bucket", () =>
    inSession(async (client, repository) => {
      await seed(client);
      const result = await repository.list(input({ pivot: { field: "posted_at", bucket: { unit: "month", timeZone: "Asia/Kuala_Lumpur" } } }));
      expect(result.pivotColumns).toEqual(["2026-02", "2026-04"]);
      expect(result.groups?.map((group) => group.cells?.map((cell) => cell?.count ?? null))).toEqual([[2, null], [null, 2], [null, 1]]);
    }));

  it("stays within the checked response bound at its caps, and reports the statement's cost", () =>
    inSession(async (client, repository) => {
      // 60 accounts × 20 periods, beyond both caps, with five measures.
      await client.query(`
        INSERT INTO summary_balance (id, tenant_id, account, period, posted_at, currency_code, period_net, preparer)
        SELECT gen_random_uuid(), $1::uuid, 'A' || lpad(a::text, 3, '0'), 'P' || lpad(p::text, 2, '0'), now(), 'MYR', a * p, 'u' || (a % 7)
          FROM generate_series(1, 60) AS a, generate_series(1, 20) AS p`, [tenantId]);
      const measures = [money, { field: "period_net", aggregate: "average" as const }, { field: "period_net", aggregate: "minimum" as const }, { field: "period_net", aggregate: "maximum" as const }, { field: "preparer", aggregate: "countDistinct" as const }];
      sent.length = 0;
      const result = await repository.list(input({ pivot: { field: "period" }, groupAggregates: measures }));
      expect(result.groups).toHaveLength(LIST_GROUP_LIMIT);
      expect(result.groupsTruncated).toBe(true);
      expect(result.pivotColumns).toHaveLength(LIST_AGGREGATE_MAX_COLUMNS);
      expect(result.pivotColumnsTruncated).toBe(true);
      // Totals still cover every record, not only the shown rows and columns.
      expect(result.parentGroup?.count).toBe(1200);
      // Measure values in the response: rows, cells and totals, each with five measures.
      const values = (totals: { aggregates?: Readonly<Record<string, unknown>> } | null | undefined) => Object.keys(totals?.aggregates ?? {}).length;
      const cellsIn = (group: { cells?: readonly ({ aggregates?: Readonly<Record<string, unknown>> } | null)[] } & { aggregates?: Readonly<Record<string, unknown>> }) => values(group) + (group.cells ?? []).reduce((sum, cell) => sum + values(cell), 0);
      const total = result.groups!.reduce((sum, group) => sum + cellsIn(group), 0) + cellsIn(result.parentGroup!);
      expect(total).toBe((LIST_GROUP_LIMIT + 1) * (LIST_AGGREGATE_MAX_COLUMNS + 1) * measures.length);
      expect(total).toBeLessThanOrEqual(LIST_AGGREGATE_MAX_CELLS);
      // The statement's plan and time at this size (recorded in the build record).
      const statement = sent.at(-1)!;
      const plan = (await client.query(`EXPLAIN (ANALYZE, FORMAT JSON) ${statement.sql}`, [...statement.parameters])).rows[0]["QUERY PLAN"][0];
      console.info(`A2 pivot statement: ${result.groups!.length} rows × ${result.pivotColumns!.length} columns × ${measures.length} measures = ${total} values; plan cost ${plan.Plan["Total Cost"]}, execution ${plan["Execution Time"]} ms over 1,205 records`);
      // The column list is computed once and matched by hash (5.9 point 7);
      // a per-row re-evaluation cost about 110 ms here.
      expect(plan["Execution Time"]).toBeLessThan(50);
    }));
});

// ---- Top / Bottom N (Aggregate A6, section 7.5) on real PostgreSQL, both
// statement shapes: the flat GROUPING SETS statement and the pivot's
// "__rows" step. Rows are inserted per test into the same temporary table.
describe.skipIf(!enabled)("Top / Bottom N on PostgreSQL (Aggregate A6)", () => {
  // A6 needs No value rows, so the account may be empty here.
  const insert = async (client: PoolClient, rows: readonly [account: string | null, period: string, net: number, currency?: string | null][]) => {
    await client.query("ALTER TABLE summary_balance ALTER COLUMN account DROP NOT NULL");
    for (const [account, period, net, currency] of rows)
      await client.query("INSERT INTO summary_balance (id, tenant_id, account, period, posted_at, currency_code, period_net, preparer) VALUES (gen_random_uuid(), $1, $2, $3, now(), $4, $5, 'u')", [tenantId, account, period, currency === undefined ? "MYR" : currency, net]);
  };
  const order = (key: string, direction: "asc" | "desc", limit: 5 | 10 | 20 | 50, floor?: number) => ({ groupOrder: { key, direction, limit, ...(floor ? { floor } : {}) } });

  it("No value survives a Top 10 over 500 groups, fetched first, never ranked, drawn last (invariant 1)", () =>
    inSession(async (client, repository) => {
      await client.query(`INSERT INTO summary_balance (id, tenant_id, account, period, posted_at, currency_code, period_net, preparer)
        SELECT gen_random_uuid(), $1::uuid, 'A' || lpad(g::text, 3, '0'), 'P01', now(), 'MYR', g, 'u' FROM generate_series(1, 500) AS g`, [tenantId]);
      // No value holds the largest sum of all, and still takes no position.
      await insert(client, [[null, "P01", 1000], [null, "P02", 1000]]);
      const result = await repository.list(input({ groupAggregates: [money], ...order("period_net:sum", "desc", 10) }));
      expect(result.groups?.map((group) => group.value)).toEqual(["A500", "A499", "A498", "A497", "A496", "A495", "A494", "A493", "A492", "A491", null]);
      expect(result.groups?.at(-1)?.aggregates?.["period_net:sum"]).toBe(2000);
      // groupCount counts ranked groups only: not the total row, not No value (constraint 3).
      expect([result.groupCount, result.groupsUnranked, result.groupsTruncated, result.groupOrderTieAtCut]).toEqual([500, 0, true, undefined]);
      expect(result.parentGroup?.count).toBe(502);
      // Ascending keeps No value too.
      const bottom = await repository.list(input({ groupAggregates: [money], ...order("period_net:sum", "asc", 5) }));
      expect(bottom.groups?.map((group) => group.value)).toEqual(["A001", "A002", "A003", "A004", "A005", null]);
    }));

  it("breaks ties by key and reports a tie at the cut", () =>
    inSession(async (client, repository) => {
      await insert(client, [["K1", "P01", 9], ["K2", "P01", 8], ["K3", "P01", 7], ["K4", "P01", 6], ["K5b", "P01", 5], ["K5a", "P01", 5], ["K7", "P01", 1]]);
      const result = await repository.list(input({ groupAggregates: [money], ...order("period_net:sum", "desc", 5) }));
      expect(result.groups?.map((group) => group.value)).toEqual(["K1", "K2", "K3", "K4", "K5a"]);
      expect([result.groupCount, result.groupOrderTieAtCut, result.groupsTruncated]).toEqual([7, true, true]);
      // Every ranked group shown: no cut, so no tie and no truncation.
      const all = await repository.list(input({ groupAggregates: [money], ...order("period_net:sum", "desc", 10) }));
      expect([all.groups?.length, all.groupCount, all.groupOrderTieAtCut, all.groupsTruncated]).toEqual([7, 7, undefined, undefined]);
      // The record count orders too.
      const counted = await repository.list(input(order("count", "asc", 5)));
      expect(counted.groups?.[0]?.value).toBe("K1");
    }));

  it("a group below the floor neither appears in nor shifts the ranking, and is only counted (invariant 2)", () =>
    inSession(async (client, repository) => {
      // G2 has the largest sum but one record, below a floor of 2.
      await insert(client, [["G1", "P01", 10], ["G1", "P02", 10], ["G1", "P03", 10], ["G2", "P01", 100], ["G3", "P01", 10], ["G3", "P02", 10], [null, "P01", 1]]);
      const result = await repository.list(input({ groupAggregates: [money], ...order("period_net:sum", "desc", 5, 2) }));
      expect(result.groups?.map((group) => group.value)).toEqual(["G1", "G3", null]);
      expect([result.groupCount, result.groupsUnranked]).toEqual([2, 1]);
      // The total still covers every record, G2 included.
      expect(result.parentGroup?.aggregates?.["period_net:sum"]).toBe(151);
    }));

  it("ranks a column dimension's rows by their total across every column, counted in the rows step", () =>
    inSession(async (client, repository) => {
      await insert(client, [
        ["R1", "P01", 1], ["R1", "P02", 50],
        ["R2", "P01", 30], ["R2", "P02", 30],
        ["R3", "P01", 40],
        ["R4", "P02", 5], ["R5", "P01", 4], ["R6", "P02", 3], ["R7", "P01", 2],
        [null, "P01", 999],
      ]);
      const result = await repository.list(input({ pivot: { field: "period" }, groupAggregates: [money], ...order("period_net:sum", "desc", 5) }));
      expect(result.groups?.map((group) => group.value)).toEqual(["R2", "R1", "R3", "R4", "R5", null]);
      expect(result.groups?.[1]?.cells?.map((cell) => cell?.aggregates?.["period_net:sum"] ?? null)).toEqual([1, 50]);
      expect([result.groupCount, result.groupsUnranked, result.groupsTruncated]).toEqual([7, 0, true]);
      // The floor applies in the rows step too: one-record rows take no position.
      const floored = await repository.list(input({ pivot: { field: "period" }, groupAggregates: [money], ...order("period_net:sum", "desc", 5, 2) }));
      expect(floored.groups?.map((group) => group.value)).toEqual(["R2", "R1", null]);
      expect([floored.groupCount, floored.groupsUnranked]).toEqual([2, 5]);
    }));

  it("ranks only an authorized identity set, as executeAuthorizedAggregate passes it", () =>
    inSession(async (client, repository) => {
      await seed(client);
      const result = await repository.list(input({ recordIds: [ids[2]!, ids[3]!, ids[4]!], groupAggregates: [money], ...order("count", "desc", 5) }));
      expect(result.groups?.map((group) => [group.value, group.count])).toEqual([["2000", 2], ["3000", 1]]);
      expect(result.groupCount).toBe(2);
    }));

  it("costs about what the unordered statement costs at the caps", () =>
    inSession(async (client, repository) => {
      await client.query(`
        INSERT INTO summary_balance (id, tenant_id, account, period, posted_at, currency_code, period_net, preparer)
        SELECT gen_random_uuid(), $1::uuid, 'A' || lpad(a::text, 3, '0'), 'P' || lpad(p::text, 2, '0'), now(), 'MYR', a * p, 'u' || (a % 7)
          FROM generate_series(1, 60) AS a, generate_series(1, 20) AS p`, [tenantId]);
      const measures = [money, { field: "period_net", aggregate: "average" as const }, { field: "preparer", aggregate: "countDistinct" as const }];
      const timed = async (patch: Partial<RecordRepositoryListInput>) => {
        sent.length = 0;
        await repository.list(input({ groupAggregates: measures, ...patch }));
        const statement = sent.at(-1)!;
        return (await client.query(`EXPLAIN (ANALYZE, FORMAT JSON) ${statement.sql}`, [...statement.parameters])).rows[0]["QUERY PLAN"][0]["Execution Time"] as number;
      };
      const flat = await timed({}), flatOrdered = await timed(order("period_net:sum", "desc", 10, 3));
      const pivot = await timed({ pivot: { field: "period" } }), pivotOrdered = await timed({ pivot: { field: "period" }, ...order("period_net:sum", "desc", 10, 3) });
      console.info(`A6 over 1,200 records: flat ${flat.toFixed(2)} ms, ordered ${flatOrdered.toFixed(2)} ms; pivot ${pivot.toFixed(2)} ms, ordered ${pivotOrdered.toFixed(2)} ms`);
      expect(flatOrdered).toBeLessThan(50);
      expect(pivotOrdered).toBeLessThan(50);
    }));
});
