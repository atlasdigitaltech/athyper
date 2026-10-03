import { expect, it } from "vitest";
import {
  Kysely,
  DummyDriver,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from "kysely";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { compileRecordCollectionScopeCondition } from "./kysely-record-repository.js";
import { createInMemoryRecordPersistence } from "./in-memory-record-repository.js";

const owner = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
const descriptor: EntityRuntimeDescriptor = {
  schema: "athyper.entity-runtime-descriptor/1.0",
  entityCode: "shipment",
  planeKey: "neon",
  releaseId: "release",
  releaseNo: 1,
  contractHash: "a".repeat(64),
  compiledHash: "b".repeat(64),
  storage: {
    schema: "master",
    object: "shipment",
    idField: "id",
    tenantField: "tenant_id",
  },
  fields: ["id", "owner", "parent"].map((key) => ({
    key,
    type: "uuid",
    storagePath: key === "owner" ? "owning_org" : key,
    required: true,
    writableOn: [],
  })),
  operations: { read: { code: "read" } },
  directoryScope: {
    schemaVersion: 1,
    mode: "organization",
    fieldBinding: {
      resolver: "neon.directory.fields.v1",
      organizationField: "owner",
    },
  },
};
const constraint = {
  kind: "entity.directory.fields.v1" as const,
  entityCode: descriptor.entityCode,
  storageSchema: "master",
  storageObject: "shipment",
  predicates: [{ field: "owner", value: owner }],
};
it("compiles the exact published storage path with a bound scope value", () => {
  const db = new Kysely({
    dialect: {
      createDriver: () => new DummyDriver(),
      createAdapter: () => new PostgresAdapter(),
      createQueryCompiler: () => new PostgresQueryCompiler(),
      createIntrospector: (db) => new PostgresIntrospector(db),
    },
  });
  const compiled = compileRecordCollectionScopeCondition(
    descriptor,
    "tenant",
    constraint,
  ).compile(db);
  expect(compiled.sql).toBe('("owning_org" = $1)');
  expect(compiled.parameters).toEqual([owner]);
  for (const c of [
    { ...constraint, storageObject: "other" },
    { ...constraint, predicates: [] },
    { ...constraint, predicates: [{ field: "parent", value: owner }] },
    { ...constraint, predicates: [{ field: "owner", value: "invalid" }] },
    {
      ...constraint,
      predicates: [...constraint.predicates, ...constraint.predicates],
    },
  ])
    expect(() =>
      compileRecordCollectionScopeCondition(descriptor, "tenant", c),
    ).toThrow();
});
it("intersects parent and organization constraints for rows, counts, groups and selected IDs", async () => {
  const persistence = createInMemoryRecordPersistence();
  persistence.seed(descriptor, "tenant", [
    { id: "one", owning_org: owner, parent: owner },
    { id: "two", owning_org: other, parent: owner },
    { id: "three", owning_org: owner, parent: other },
    { id: "four", owning_org: null, parent: owner },
  ]);
  const input = {
    descriptor,
    tenantId: "tenant",
    projection: ["id", "owner"],
    limit: 10,
    cursorScope: "principal-scope",
    filters: [],
    sort: [],
    countMode: "exact" as const,
    group: "owner",
    collectionScope: [
      constraint,
      {
        ...constraint,
        kind: "entity.parent.v1" as const,
        predicates: [{ field: "parent", value: owner }],
      },
    ],
  };
  const result = await persistence.repository.list(input);
  expect(result.data.map((row) => row.id)).toEqual(["one"]);
  expect(result.pagination.total).toBe(1);
  expect(result.groups).toEqual([{ value: owner, count: 1 }]);
  expect(
    (
      await persistence.repository.list({
        ...input,
        recordIds: ["two", "three", "four"],
      })
    ).data,
  ).toEqual([]);
  expect(
    (
      await persistence.repository.list({
        ...input,
        tenantId: "another-tenant",
      })
    ).data,
  ).toEqual([]);
});
