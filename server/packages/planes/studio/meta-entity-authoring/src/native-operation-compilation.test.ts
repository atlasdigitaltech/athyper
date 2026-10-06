import { Kysely, PostgresDialect, type Transaction } from "kysely";
import { expect, it, vi } from "vitest";
import {
  type ExpandedNativeMetaEntityGraph,
  type NativeOperationRow,
} from "@athyper/server-contract-meta-entity-authoring";
import { nativeOperationToStorage } from "./native-operation-storage.js";
import {
  loadNativeCompilationOperations,
  verifyNativeCompiledOperationControls,
} from "./native-operation-compilation.js";
import { sha256 } from "./deterministic.js";
const id = "00000000-0000-4000-8000-000000000001";
function fixture(required: unknown = true) {
  const operation: NativeOperationRow = {
    id,
    operationKey: "read",
    operationKind: "read",
    labelId: id,
    description: null,
    auditEventCode: "fixture.read",
    executionMode: "synchronous",
    idempotencyMode: "none",
    inputSurfaceId: null,
    resultSurfaceId: null,
    authorizationTarget: "existing",
    authorizationEffect: "read",
    requiresParentRead: false,
    requiresPreflight: false,
    replacementOperationId: null,
    handlerKey: "registered.read",
    handlerVersion: 1,
    preflightKey: null,
    preflightVersion: null,
    extensionFieldMode: "none",
    exportFormats: null,
    exportMaxRecords: null,
  };
  const graph = {
    contractSchema: "athyper.meta-entity-contract/2.5",
    authoringSource: {
      entityId: id,
      tenantId: null,
      sourceKind: "product",
      authoringSchemaHash: "a".repeat(64),
    },
    operations: [operation],
    ownedLabels: { changeSetId: id },
  } as unknown as ExpandedNativeMetaEntityGraph;
  let rows = [
    {
      value: { ...nativeOperationToStorage(operation), requires_mfa: required },
    },
  ];
  const query = vi.fn(async (text: string) =>
    text.startsWith("SELECT lock_version")
      ? {
          rows: [
            {
              lock_version: "5",
              native_core_layout_version: 2,
              authoring_schema_hash: "a".repeat(64),
            },
          ],
        }
      : { rows },
  );
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({ query, release() {} }),
        end: async () => {},
      } as never,
    }),
  });
  Object.defineProperty(db, "isTransaction", { value: true });
  const coordinate = {
    entityId: id,
    changeSetId: id,
    tenantId: null,
    revision: 5,
    graphHash: sha256(graph),
  };
  return {
    query,
    graph,
    coordinate,
    remove() {
      rows = [];
    },
    run: () =>
      loadNativeCompilationOperations(
        db as Transaction<Record<string, never>>,
        coordinate,
        graph,
        10,
      ),
  };
}
it.each([true, false])(
  "preserves the exact stored control (%s) without writes or initialization",
  async (required) => {
    const f = fixture(required),
      operations = await f.run();
    expect(operations[0]!.requiresMfa).toBe(required);
    expect(f.graph.operations[0]).not.toHaveProperty("requiresMfa");
    verifyNativeCompiledOperationControls(operations, { operations });
    expect(
      f.query.mock.calls.every(([text]) => text.startsWith("SELECT")),
    ).toBe(true);
    const query = f.query.mock.calls[1]![0];
    expect(query).toContain("entity_id=");
    expect(query).toContain("change_set_id=");
    expect(query).toContain("tenant_id IS NOT DISTINCT FROM");
  },
);
it("rejects new identities, missing protected evidence and stale revisions", async () => {
  const missing = fixture();
  missing.remove();
  await expect(missing.run()).rejects.toMatchObject({
    code: "NATIVE_COMPILATION_PROTECTED_SOURCE_REQUIRED",
  });
  await expect(fixture(null).run()).rejects.toMatchObject({
    code: "NATIVE_COMPILATION_PROTECTED_SOURCE_REQUIRED",
  });
  const stale = fixture();
  stale.coordinate.revision = 4;
  await expect(stale.run()).rejects.toMatchObject({
    code: "NATIVE_COMPILATION_PROTECTED_SOURCE_REQUIRED",
  });
});
it("rejects client protected properties and compiler removal or widening", async () => {
  const f = fixture();
  const operations = await f.run();
  expect(() =>
    verifyNativeCompiledOperationControls(operations, { operations: [] }),
  ).toThrow();
  expect(() =>
    verifyNativeCompiledOperationControls(operations, {
      operations: [{ ...operations[0], requiresMfa: false }],
    }),
  ).toThrow();
  expect(() =>
    verifyNativeCompiledOperationControls(operations, {
      operations: [{ ...operations[0], operationKey: "other" }],
    }),
  ).toThrow();
  Reflect.set(f.graph.operations[0]!, "requiresMfa", false);
  f.coordinate.graphHash = sha256(f.graph);
  await expect(f.run()).rejects.toThrow("FOUNDATION_UNSUPPORTED_PROPERTY");
});
