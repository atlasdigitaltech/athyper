import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from "kysely";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { RecordRepositoryListInput } from "@athyper/server-contract-records";
import { createKyselyRecordRepository } from "./kysely-record-repository.js";
import { deferredParentRefusal } from "./mutation-service.js";

// The Tree's SQL on real PostgreSQL (Entity list Tree blueprint, pilot
// prerequisite): browsing, child existence, orphans, the B2 ancestor walk, the
// B4 measurements and database refusals, and A2/A3 grouping, against the real
// Neon DDL (tables, constraints, triggers and indexes), as the application
// role inside a rolled-back tenant transaction. Descriptors are test-only:
// nothing is published.

const url = process.env["ATHYPER_NEON_TEST_DATABASE_URL"];
const enabled = process.env["ATHYPER_SERVICE_DB_TESTS"] === "true" && Boolean(url);
const tenantId = process.env["ATHYPER_SERVICE_TEST_TENANT_ID"] ?? "11111111-1111-4111-8111-111111111111";
const principalId = process.env["ATHYPER_SERVICE_TEST_PRINCIPAL_ID"] ?? "22222222-2222-4222-8222-222222222222";
const pool = enabled ? new Pool({ connectionString: url, max: 2 }) : undefined;
// The database owner, only to seed rows whose triggers write tables the
// application role cannot (organization scope targets); still rolled back.
const adminUrl = process.env["ATHYPER_NEON_DATABASE_ADMIN_URL"];
const adminPool = enabled && adminUrl ? new Pool({ connectionString: adminUrl, max: 1 }) : undefined;
afterAll(async () => {
  await pool?.end();
  await adminPool?.end();
});

type Repository = ReturnType<typeof createKyselyRecordRepository>;
interface Session {
  readonly client: PoolClient;
  readonly repository: Repository;
  readonly db: Kysely<Record<string, never>>;
  /** SQL statements the repository sent, in order. */
  readonly statements: { sql: string; parameters: readonly unknown[] }[];
  /** Refreshes a table's planner statistics, rows of this transaction
   * included; only in a session opened with { statistics: true }. */
  readonly analyze: (table: string) => Promise<void>;
}

/** One rolled-back tenant transaction as the application role, with a
 * repository whose Kysely runs on that same connection. With statistics, the
 * connection is the owner's, acting as the application role (row security
 * applies) and resuming ownership only to ANALYZE, which only the owner may. */
async function inTenant<T>(work: (session: Session) => Promise<T>, options: { readonly statistics?: boolean } = {}): Promise<T> {
  const client = await (options.statistics ? adminPool! : pool!).connect();
  const statements: Session["statements"] = [];
  const appRole = new URL(url!).username;
  const analyze = async (table: string) => {
    if (!options.statistics) throw new Error("This session cannot refresh statistics.");
    await client.query("RESET ROLE");
    await client.query(`ANALYZE ${table}`);
    await client.query(`SET LOCAL ROLE ${appRole}`);
  };
  try {
    await client.query("BEGIN");
    if (options.statistics) await client.query(`SET LOCAL ROLE ${appRole}`);
    await client.query(
      "SELECT set_config('app.database_plane', 'neon', true), set_config('app.current_plane_key', 'neon', true), set_config('app.current_tenant_id', $1, true), set_config('app.current_principal_id', $2, true), set_config('app.current_request_id', $3, true), set_config('app.current_correlation_id', $4, true)",
      [tenantId, principalId, randomUUID(), randomUUID()],
    );
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
              statements.push({ sql: query.sql, parameters: query.parameters });
              return { rows: (await client.query(query.sql, [...query.parameters])).rows as never[] };
            },
            streamQuery: () => {
              throw new Error("unused");
            },
          }),
        }),
      },
    });
    return await work({ client, db, statements, analyze, repository: createKyselyRecordRepository({ databases: { neon: db } as never }) });
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

type FieldSpec = readonly [key: string, type: string, extra?: Record<string, unknown>];
function describeTable(object: string, fields: readonly FieldSpec[], extra: Partial<EntityRuntimeDescriptor> = {}): EntityRuntimeDescriptor {
  return {
    schema: "athyper.entity-runtime-descriptor/1.0",
    entityCode: object,
    planeKey: "neon",
    releaseId: "tree-postgres",
    releaseNo: 1,
    contractHash: "a".repeat(64),
    compiledHash: "b".repeat(64),
    storage: { schema: "master", object, idField: "id", tenantField: "tenant_id" },
    fields: fields.map(([key, type, more]) => ({ key, storagePath: key, type, required: false, writableOn: [], filterable: true, sortable: true, ...more })),
    operations: { read: { code: "read" } },
    ...extra,
  } as unknown as EntityRuntimeDescriptor;
}
const listInput = (descriptor: EntityRuntimeDescriptor, extra: Partial<RecordRepositoryListInput>): RecordRepositoryListInput => ({
  descriptor,
  tenantId,
  limit: 50,
  sort: [{ field: "code", direction: "asc" }],
  countMode: "exact",
  projection: ["code", "parent_id"],
  cursorScope: "tree-postgres",
  collectionScope: [],
  filters: [],
  ...extra,
});
const codes = (rows: readonly Readonly<Record<string, unknown>>[]) => rows.map((row) => row["code"]);

// --- Commodity Category: the flat pilot shape --------------------------------

const commodity = describeTable("commodity_category", [["code", "string"], ["name", "string", { searchable: true }], ["parent_id", "reference"], ["sort_order", "integer"], ["status", "string"], ["created_at", "datetime"]]);
async function seedCommodity(client: PoolClient, rows: readonly { code: string; parent?: string; name?: string; createdAt?: string }[]) {
  const ids = new Map<string, string>();
  for (const row of rows) {
    const result = await client.query<{ id: string }>(
      "INSERT INTO master.commodity_category (tenant_id, code, name, parent_id, created_by, created_at) VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, now())) RETURNING id",
      [tenantId, row.code, row.name ?? row.code, row.parent ? ids.get(row.parent) : null, principalId, row.createdAt ?? null],
    );
    ids.set(row.code, result.rows[0]!.id);
  }
  return ids;
}
const commodityTree = [{ code: "T-A", name: "Raw materials" }, { code: "T-B", parent: "T-A", name: "Metals" }, { code: "T-C", parent: "T-B", name: "Cash-grade copper" }, { code: "T-D", name: "Services" }];

describe.skipIf(!enabled)("Tree SQL on real PostgreSQL: commodity_category", () => {
  it("browses roots and children with child existence inside the visible set", async () => {
    await inTenant(async ({ client, repository }) => {
      const ids = await seedCommodity(client, commodityTree);
      const tree = { mode: "nodes" as const, parentField: "parent_id" };
      const roots = await repository.list(listInput(commodity, { filters: [{ field: "parent_id", operator: "is_null" }, { field: "code", operator: "starts_with", value: "T-" }], hierarchy: tree }));
      expect(codes(roots.data)).toEqual(["T-A", "T-D"]);
      expect(roots.hasChildren).toEqual([true, false]);
      expect(roots.pagination.total).toBe(2);
      const children = await repository.list(listInput(commodity, { filters: [{ field: "parent_id", operator: "eq", value: ids.get("T-A")! }], hierarchy: tree }));
      expect(codes(children.data)).toEqual(["T-B"]);
      expect(children.hasChildren).toEqual([true]);
      // A record predicate hides T-B: T-A no longer has visible children, and
      // T-C becomes an orphan without its parent being read.
      const hidden = describeTable("commodity_category", commodity.fields.map((field) => [field.key, field.type] as const), { recordPredicates: [{ field: "code", operator: "ne", value: "T-B" }] } as never);
      const again = await repository.list(listInput(hidden, { filters: [{ field: "parent_id", operator: "is_null" }, { field: "code", operator: "starts_with", value: "T-" }], hierarchy: tree }));
      expect(again.hasChildren).toEqual([false, false]);
      const orphans = await repository.list(listInput(hidden, { filters: [{ field: "code", operator: "starts_with", value: "T-" }], hierarchy: { mode: "orphans", parentField: "parent_id" } }));
      expect(codes(orphans.data)).toEqual(["T-C"]);
    });
  });

  it.skipIf(!adminPool)("uses the parent index for child existence", async () => {
    await inTenant(async ({ client, repository, statements, analyze }) => {
      await seedCommodity(client, commodityTree);
      // Enough rows that the planner's choice reflects selectivity, not ties.
      await client.query(
        "INSERT INTO master.commodity_category (tenant_id, code, name, parent_id, created_by) SELECT $1, 'T-BULK-' || n, 'Bulk ' || n, (SELECT id FROM master.commodity_category WHERE tenant_id = $1 AND code = 'T-D'), $2 FROM generate_series(1, 1000) AS n",
        [tenantId, principalId],
      );
      await analyze("master.commodity_category");
      await repository.list(listInput(commodity, { filters: [{ field: "parent_id", operator: "is_null" }], hierarchy: { mode: "nodes", parentField: "parent_id" } }));
      await client.query("SET LOCAL enable_seqscan = off");
      const plan = await client.query(`EXPLAIN (FORMAT JSON) ${statements[0]!.sql}`, [...statements[0]!.parameters]);
      expect(JSON.stringify(plan.rows)).toContain("commodity_category_parent_idx");
    }, { statistics: true });
  });

  it("returns matches with their visible ancestors (B2), and marks a path stopped by a hidden parent", async () => {
    await inTenant(async ({ client, repository }) => {
      await seedCommodity(client, commodityTree);
      const matches = await repository.list(listInput(commodity, { search: "copper", hierarchy: { mode: "matches", parentField: "parent_id", maxDepth: 6 } }));
      expect(codes(matches.data)).toEqual(["T-C", "T-B", "T-A"]);
      expect(matches.treeRoles).toEqual(["match", "context", "context"]);
      expect(matches.parentOutsideView).toEqual([false, false, false]);
      const hidden = describeTable("commodity_category", commodity.fields.map((field) => [field.key, field.type, field.searchable ? { searchable: true } : {}] as const), { recordPredicates: [{ field: "code", operator: "ne", value: "T-B" }] } as never);
      const stopped = await repository.list(listInput(hidden, { search: "copper", hierarchy: { mode: "matches", parentField: "parent_id", maxDepth: 6 } }));
      expect(codes(stopped.data)).toEqual(["T-C"]);
      expect(stopped.parentOutsideView).toEqual([true]);
      // Deeper than maxDepth: counted, not returned.
      const deep = await repository.list(listInput(commodity, { search: "copper", hierarchy: { mode: "matches", parentField: "parent_id", maxDepth: 2 } }));
      expect(deep.data).toEqual([]);
      expect(deep.matchesBeyondDepth).toBe(1);
    });
  });

  it("measures depth, height and the ancestor chain for a move (B4), and the database refuses a cycle", async () => {
    await inTenant(async ({ client, repository }) => {
      const ids = await seedCommodity(client, commodityTree);
      const measure = (parentId: string, recordId: string) => repository.measureHierarchy!({ descriptor: commodity, tenantId, parentField: "parent_id", parentId, recordId, bound: 7 });
      await expect(measure(ids.get("T-D")!, ids.get("T-A")!)).resolves.toEqual({ parentDepth: 1, subtreeHeight: 3, parentChainIncludesRecord: false });
      await expect(measure(ids.get("T-C")!, ids.get("T-A")!)).resolves.toMatchObject({ parentChainIncludesRecord: true });
      await client.query("SAVEPOINT cycle");
      const refusal = await client.query("UPDATE master.commodity_category SET parent_id = $1 WHERE id = $2", [ids.get("T-C"), ids.get("T-A")]).then(() => undefined, (error: unknown) => error);
      expect(refusal).toMatchObject({ code: "23514" });
      await client.query("ROLLBACK TO SAVEPOINT cycle");
    });
  });

  it("groups a datetime by month in the viewer's zone, caps at 50 groups, and counts every record (A3)", async () => {
    await inTenant(async ({ client, repository }) => {
      await seedCommodity(client, [
        { code: "T-M1", createdAt: "2026-09-30T20:00:00Z" }, // 1 October in Kuala Lumpur
        { code: "T-M2", createdAt: "2026-09-15T00:00:00Z" },
        { code: "T-M3", createdAt: "2026-10-20T00:00:00Z" },
      ]);
      const months = await repository.list(listInput(commodity, { filters: [{ field: "code", operator: "starts_with", value: "T-M" }], group: "created_at", groupBucket: { unit: "month", timeZone: "Asia/Kuala_Lumpur" }, groupsOnly: true }));
      expect(months.groups?.map((group) => [group.value, group.count])).toEqual([["2026-09", 1], ["2026-10", 2]]);
      const quarters = await repository.list(listInput(commodity, { filters: [{ field: "code", operator: "starts_with", value: "T-M" }], group: "created_at", groupBucket: { unit: "quarter", timeZone: "Asia/Kuala_Lumpur" }, groupsOnly: true }));
      expect(quarters.groups?.map((group) => [group.value, group.count])).toEqual([["2026-Q3", 1], ["2026-Q4", 2]]);
      await seedCommodity(client, Array.from({ length: 55 }, (_, index) => ({ code: `T-L${String(index).padStart(2, "0")}`, createdAt: `${2020 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-10T00:00:00Z` })));
      const capped = await repository.list(listInput(commodity, { filters: [{ field: "code", operator: "starts_with", value: "T-L" }], group: "created_at", groupBucket: { unit: "month", timeZone: "UTC" }, groupsOnly: true }));
      expect(capped.groupsTruncated).toBe(true);
      expect(capped.groups).toHaveLength(50);
      expect(capped.groups?.[0]?.value).toBe("2020-01");
      expect(capped.pagination.total).toBe(55);
    });
  });
});

// --- Chart of Accounts: the scoped shape -------------------------------------

const account = describeTable("gl_account", [["code", "string"], ["name", "string"], ["parent_id", "reference"], ["chart_of_account_id", "reference", { required: true }], ["node_type", "string"], ["sort_order", "integer"], ["currency_code", "string"]]);
async function seedCharts(client: PoolClient) {
  const chart = async (code: string) =>
    (await client.query<{ id: string }>("INSERT INTO master.chart_of_account (tenant_id, code, name, created_by) VALUES ($1, $2, $3, $4) RETURNING id", [tenantId, code, `Chart ${code}`, principalId])).rows[0]!.id;
  const charts = { a: await chart("tree-a"), b: await chart("tree-b") };
  const accounts = new Map<string, string>();
  const add = async (key: string, chartId: string, code: string, parent: string | null, nodeType: string, sortOrder = 0, currency: string | null = null) => {
    const result = await client.query<{ id: string }>(
      "INSERT INTO master.gl_account (tenant_id, chart_of_account_id, parent_id, code, name, account_class, node_type, normal_balance, sort_order, currency_code, created_by) VALUES ($1, $2, $3, $4, $5, 'asset', $6, 'debit', $7, $8, $9) RETURNING id",
      [tenantId, chartId, parent ? accounts.get(parent) : null, code, `${key} account`, nodeType, sortOrder, currency, principalId],
    );
    accounts.set(key, result.rows[0]!.id);
  };
  // Both charts reuse the same codes, which the per-chart unique key allows.
  await add("a1000", charts.a, "1000", null, "summary", 1);
  await add("a1100", charts.a, "1100", "a1000", "summary", 2);
  await add("a1110", charts.a, "1110", "a1100", "posting", 5, "USD");
  await add("a1120", charts.a, "1120", "a1100", "posting", 7, "EUR");
  await add("b1000", charts.b, "1000", null, "summary", 1);
  await add("b1100", charts.b, "1100", "b1000", "summary", 2);
  return { charts, accounts };
}

describe.skipIf(!enabled)("Tree SQL on real PostgreSQL: gl_account (scoped)", () => {
  it("browses one chart only, even where codes repeat, and compares the scope in child existence", async () => {
    await inTenant(async ({ client, repository }) => {
      const { charts, accounts } = await seedCharts(client);
      const tree = { mode: "nodes" as const, parentField: "parent_id", scopeField: "chart_of_account_id" };
      const roots = await repository.list(listInput(account, { filters: [{ field: "parent_id", operator: "is_null" }, { field: "chart_of_account_id", operator: "eq", value: charts.a }], hierarchy: tree }));
      expect(codes(roots.data)).toEqual(["1000"]);
      expect(roots.data[0]!["id"]).toBe(accounts.get("a1000"));
      expect(roots.hasChildren).toEqual([true]);
      const children = await repository.list(listInput(account, { filters: [{ field: "parent_id", operator: "eq", value: accounts.get("a1000")! }, { field: "chart_of_account_id", operator: "eq", value: charts.a }], hierarchy: tree }));
      expect(children.data.map((row) => row["id"])).toEqual([accounts.get("a1100")]);
      // The same parent under another chart's scope returns nothing.
      const crossed = await repository.list(listInput(account, { filters: [{ field: "parent_id", operator: "eq", value: accounts.get("a1000")! }, { field: "chart_of_account_id", operator: "eq", value: charts.b }], hierarchy: tree }));
      expect(crossed.data).toEqual([]);
      const orphans = await repository.list(listInput(account, { filters: [{ field: "chart_of_account_id", operator: "eq", value: charts.b }], hierarchy: { mode: "orphans", parentField: "parent_id", scopeField: "chart_of_account_id" } }));
      expect(orphans.data).toEqual([]);
    });
  });

  it.skipIf(!adminPool)("uses the scope-first parent index", async () => {
    await inTenant(async ({ client, repository, statements, analyze }) => {
      const { charts, accounts } = await seedCharts(client);
      // Many parents with one child each, so parent_id is selective: the
      // planner's choice then reflects the index, not a tie.
      await client.query(
        "INSERT INTO master.gl_account (tenant_id, chart_of_account_id, parent_id, code, name, account_class, node_type, normal_balance, created_by) SELECT $1, $2, $3, 'B' || n, 'Bulk ' || n, 'asset', 'summary', 'debit', $4 FROM generate_series(1, 500) AS n",
        [tenantId, charts.a, accounts.get("a1000"), principalId],
      );
      await client.query(
        "INSERT INTO master.gl_account (tenant_id, chart_of_account_id, parent_id, code, name, account_class, node_type, normal_balance, created_by) SELECT $1, $2, parent.id, 'C' || substr(parent.code, 2), 'Bulk child', 'asset', 'posting', 'debit', $3 FROM master.gl_account AS parent WHERE parent.tenant_id = $1 AND parent.chart_of_account_id = $2 AND parent.code LIKE 'B%'",
        [tenantId, charts.a, principalId],
      );
      await analyze("master.gl_account");
      await repository.list(listInput(account, { filters: [{ field: "parent_id", operator: "is_null" }, { field: "chart_of_account_id", operator: "eq", value: charts.a }], hierarchy: { mode: "nodes", parentField: "parent_id", scopeField: "chart_of_account_id" } }));
      await client.query("SET LOCAL enable_seqscan = off");
      const plan = await client.query(`EXPLAIN (FORMAT JSON) ${statements[0]!.sql}`, [...statements[0]!.parameters]);
      expect(JSON.stringify(plan.rows)).toContain("gl_account_parent_idx");
    }, { statistics: true });
  });

  it("refuses a move into another chart through the deferred parent key, in the shape the mutation guard maps", async () => {
    await inTenant(async ({ client, repository }) => {
      const seeded = await seedCharts(client);
      await client.query("SET CONSTRAINTS ALL IMMEDIATE");
      await client.query("SAVEPOINT move");
      const refusal = await client.query("UPDATE master.gl_account SET parent_id = $1 WHERE id = $2", [seeded.accounts.get("b1000"), seeded.accounts.get("a1100")]).then(() => undefined, (error: unknown) => error);
      expect(refusal).toMatchObject({ code: "23503", table: "gl_account" });
      // As the application role PostgreSQL redacts the key columns from the
      // detail ("Key is not present in table …"); the guard resolves the
      // named constraint through the catalog instead.
      expect(refusal).toMatchObject({ constraint: "gl_account_parent_fk", detail: expect.not.stringMatching(/^Key \(/) });
      await client.query("ROLLBACK TO SAVEPOINT move");
      const scoped = { ...account, hierarchy: { parentField: "parent_id", scopeField: "chart_of_account_id", maxDepth: 16 } } as EntityRuntimeDescriptor;
      expect(await repository.selfReferenceKeyColumns!(scoped, "gl_account_parent_fk")).toEqual(["tenant_id", "chart_of_account_id", "parent_id"]);
      expect(await repository.selfReferenceKeyColumns!(scoped, "gl_account_chart_fk")).toBeUndefined();
      expect(await deferredParentRefusal(refusal, scoped, repository)).toBe(true);
      const otherParent = { ...scoped, fields: account.fields.map((field) => (field.key === "parent_id" ? { ...field, storagePath: "other_column" } : field)) } as EntityRuntimeDescriptor;
      expect(await deferredParentRefusal(refusal, otherParent, repository)).toBe(false);
    });
  });

  it("measures depth on real rows; the framework's walk agrees with the stored level", async () => {
    await inTenant(async ({ client, repository }) => {
      const { accounts } = await seedCharts(client);
      const measured = await repository.measureHierarchy!({ descriptor: account, tenantId, parentField: "parent_id", parentId: accounts.get("a1100")!, recordId: accounts.get("b1100")!, bound: 17 });
      const stored = await client.query<{ level_no: number }>("SELECT level_no FROM master.gl_account WHERE id = $1", [accounts.get("a1100")]);
      expect(measured.parentDepth).toBe(stored.rows[0]!.level_no);
      expect(measured.subtreeHeight).toBe(1);
    });
  });

  it("totals money per group with its one currency, withholds mixed and unrecorded currencies, and keeps decimals exact (A2)", async () => {
    await inTenant(async ({ client, repository }) => {
      const { charts } = await seedCharts(client);
      // sort_order stands in for an amount; currency_code is the declared currency field.
      const aggregates = [{ field: "sort_order", aggregate: "sum" as const, currencyField: "currency_code" }];
      const base = { filters: [{ field: "chart_of_account_id", operator: "eq" as const, value: charts.a }], group: "node_type", groupAggregates: aggregates, groupsOnly: true };
      const page = await repository.list(listInput(account, base));
      const byType = new Map(page.groups!.map((group) => [group.value, group]));
      expect(byType.get("posting")).toMatchObject({ count: 2, aggregates: { "sort_order:sum": null }, mixedCurrencies: ["sort_order:sum"] });
      expect(byType.get("summary")).toMatchObject({ count: 2, aggregates: { "sort_order:sum": null }, unknownCurrencies: ["sort_order:sum"] });
      const usd = await repository.list(listInput(account, { ...base, filters: [...base.filters, { field: "currency_code", operator: "eq", value: "USD" }] }));
      expect(usd.groups).toEqual([{ value: "posting", count: 1, aggregates: { "sort_order:sum": 5 }, aggregateCurrencies: { "sort_order:sum": "USD" } }]);
    });
  });
});

// --- Project WBS: a table-specific guard ---------------------------------------

describe.skipIf(!enabled || !adminUrl)("Tree SQL on real PostgreSQL: project_wbs", () => {
  it("the database refuses a child under a postable node, as a check violation the move guard maps", async () => {
    const client = await adminPool!.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.database_plane', 'neon', true), set_config('app.current_tenant_id', $1, true), set_config('app.current_principal_id', $2, true)", [tenantId, principalId]);
      const insert = async (sql: string, values: readonly unknown[]) => (await client.query<{ id: string }>(sql, [...values])).rows[0]!.id;
      // The owning chain is setup only: its organisation-scope sync triggers
      // write tables outside this test, so they are suspended while seeding
      // it and restored before the WBS rows under test.
      await client.query("SET LOCAL session_replication_role = replica");
      const legal = await insert("INSERT INTO master.legal_entity (tenant_id, code, name, legal_name, functional_currency, created_by) VALUES ($1, 'tree-le', 'Tree entity', 'Tree entity Ltd', 'USD', $2) RETURNING id", [tenantId, principalId]);
      const company = await insert("INSERT INTO master.company_code (tenant_id, legal_entity_id, code, name, functional_currency, created_by) VALUES ($1, $2, 'tree', 'Tree company', 'USD', $3) RETURNING id", [tenantId, legal, principalId]);
      const project = await insert("INSERT INTO master.project (tenant_id, company_code_id, code, name, project_type, currency_code, created_by) VALUES ($1, $2, 'TREE-P', 'Tree project', 'internal', 'USD', $3) RETURNING id", [tenantId, company, principalId]);
      await client.query("SET LOCAL session_replication_role = origin");
      const wbs = (code: string, parent: string | null, type: string, postable: boolean) =>
        insert("INSERT INTO master.project_wbs (tenant_id, project_id, parent_wbs_id, wbs_code, name, wbs_type, is_postable, created_by) VALUES ($1, $2, $3, $4, $4, $5, $6, $7) RETURNING id", [tenantId, project, parent, code, type, postable, principalId]);
      const root = await wbs("1", null, "summary", false);
      const leaf = await wbs("1.1", root, "control_account", true);
      await client.query("SAVEPOINT postable");
      const refusal = await wbs("1.1.1", leaf, "work_package", true).then(() => undefined, (error: unknown) => error);
      expect(refusal).toMatchObject({ code: "23514" });
      await client.query("ROLLBACK TO SAVEPOINT postable");
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });
});
