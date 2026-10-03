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
