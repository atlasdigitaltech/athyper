import { expect, it } from "vitest";
import { sql } from "kysely";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { RecordRepositoryListInput } from "@athyper/server-contract-records";
import {
  compileRecordCollectionScopeCondition,
  createKyselyRecordRepository,
  type RecordCollectionScopeSqlCompiler,
} from "./kysely-record-repository.js";

const descriptor = {
  schema: "athyper.entity-runtime-descriptor/1.0",
  entityCode: "sample",
  planeKey: "neon",
  releaseId: "release",
  releaseNo: 1,
  contractHash: "a".repeat(64),
  compiledHash: "b".repeat(64),
  storage: { schema: "shared", object: "sample", idField: "id" },
  fields: [],
  operations: {},
} satisfies EntityRuntimeDescriptor;
const constraint = {
  kind: "entity.parent.v1",
  entityCode: "sample",
  storageSchema: "shared",
  storageObject: "sample",
  predicates: [{ field: "id", value: "record" }],
} as const satisfies RecordRepositoryListInput["collectionScope"][number];

it("accepts one trusted compiler per scope kind and keeps unregistered kinds closed", () => {
  const compiler: RecordCollectionScopeSqlCompiler = {
    kind: "entity.parent.v1",
    compile: () => sql`FALSE`,
  };
  expect(
    compileRecordCollectionScopeCondition(
      descriptor,
      "tenant",
      constraint,
      new Map([[compiler.kind, compiler]]),
    ),
  ).toBeDefined();
  expect(() =>
    createKyselyRecordRepository({
      databases: {},
      scopeCompilers: [compiler, compiler],
    }),
  ).toThrow("Duplicate record scope SQL compiler");
  expect(() =>
    compileRecordCollectionScopeCondition(descriptor, "tenant", {
      kind: "unknown",
    } as never),
  ).toThrow("Unsupported record collection scope kind");
});

it("admits platform-owned rows to reads only when the descriptor opts in", async () => {
  const { Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } = await import("kysely");
  const statements: string[] = [];
  const database = new Kysely<Record<string, never>>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
      createDriver: () => ({
        init: async () => undefined,
        destroy: async () => undefined,
        releaseConnection: async () => undefined,
        beginTransaction: async () => undefined,
        commitTransaction: async () => undefined,
        rollbackTransaction: async () => undefined,
        acquireConnection: async () => ({
          executeQuery: async (query: { sql: string }) => {
            statements.push(query.sql);
            return { rows: [] };
          },
          streamQuery: () => { throw new Error("unused"); },
        }),
      }),
    },
  });
  const shared = {
    ...descriptor,
    storage: { schema: "metadata", object: "entity_release", idField: "id", tenantField: "tenant_id", tenantVisibility: "tenant_or_platform" },
  } satisfies EntityRuntimeDescriptor;
  const repository = createKyselyRecordRepository({ databases: { neon: database } });
  await repository.get(shared, "00000000-0000-0000-0000-000000000001", "record", []);
  await repository.patch(shared, "00000000-0000-0000-0000-000000000001", "record", {}, undefined, database as never).catch(() => undefined);
  await repository.get({ ...shared, storage: { ...shared.storage, tenantVisibility: "tenant" } }, "00000000-0000-0000-0000-000000000001", "record", []);
  expect(statements[0]).toContain('("tenant_id" IS NULL OR "tenant_id" = $1::uuid)');
  expect(statements.slice(1).some((statement) => statement.includes("IS NULL OR"))).toBe(false);
  expect(statements.at(-1)).toContain('"tenant_id" = $1::uuid');
});

it("computes child existence and orphans inside the visible set with aliased correlated subqueries", async () => {
  const { Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } = await import("kysely");
  const statements: string[] = [];
  const database = new Kysely<Record<string, never>>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
      createDriver: () => ({
        init: async () => undefined, destroy: async () => undefined, releaseConnection: async () => undefined,
        beginTransaction: async () => undefined, commitTransaction: async () => undefined, rollbackTransaction: async () => undefined,
        acquireConnection: async () => ({
          executeQuery: async (query: { sql: string }) => { statements.push(query.sql); return { rows: [{ id: "a", code: "1000", __tree_has_children: true }] as never[] }; },
          streamQuery: () => { throw new Error("unused"); },
        }),
      }),
    },
  });
  const tree = {
    ...descriptor,
    storage: { schema: "app", object: "gl_account", idField: "id", tenantField: "tenant_id" },
    fields: [
      { key: "code", storagePath: "code", type: "string", required: true, writableOn: [], filterable: true },
      { key: "parent", storagePath: "parent_id", type: "reference", required: false, writableOn: [], filterable: true },
      { key: "status", storagePath: "status", type: "enum", required: true, writableOn: [], filterable: true },
    ],
  } as unknown as EntityRuntimeDescriptor;
  const repository = createKyselyRecordRepository({ databases: { neon: database } });
  const input = {
    descriptor: tree, tenantId: "00000000-0000-0000-0000-000000000001", limit: 5, sort: [], countMode: "none" as const,
    projection: ["code"], cursorScope: "scope", collectionScope: [],
    filters: [{ field: "parent", operator: "is_null" as const }, { field: "status", operator: "eq" as const, value: "active" }],
  };
  const nodes = await repository.list({ ...input, hierarchy: { mode: "nodes", parentField: "parent" } });
  expect(nodes.hasChildren).toEqual([true]);
  expect(nodes.data[0]).not.toHaveProperty("__tree_has_children");
  const [nodesSql] = statements;
  expect(nodesSql).toContain('FROM "app"."gl_account" AS "__tree_row"');
  expect(nodesSql).toContain('EXISTS (SELECT 1 FROM "app"."gl_account" AS "__tree_child" WHERE "__tree_child"."parent_id" = "__tree_row"."id"');
  // Inside the child check: the tenant and the list's other filters, never the parent filter.
  const child = nodesSql!.slice(nodesSql!.indexOf('AS "__tree_child"'), nodesSql!.indexOf(') AS "__tree_has_children"'));
  expect(child).toContain('"tenant_id" =');
  expect(child).toContain('"status" =');
  expect(child).not.toContain('"parent_id" IS NULL');
  statements.length = 0;
  await repository.list({ ...input, filters: [], hierarchy: { mode: "orphans", parentField: "parent" } });
  expect(statements[0]).toContain('("__tree_row"."parent_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "app"."gl_account" AS "__tree_parent" WHERE "__tree_parent"."id" = "__tree_row"."parent_id" AND "tenant_id" =');
  // An ordinary request computes no child existence and returns no child flags.
  statements.length = 0;
  const flat = await repository.list(input);
  expect(flat.hasChildren).toBeUndefined();
  expect(statements.join("\n")).not.toContain("__tree");
});
