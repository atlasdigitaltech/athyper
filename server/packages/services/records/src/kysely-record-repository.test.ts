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
