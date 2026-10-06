import { beforeEach, expect, it, vi } from "vitest";
import type { Transaction } from "kysely";
import type {
  ExpandedNativeMetaEntityGraph,
  NativeOperationRow,
} from "@athyper/server-contract-meta-entity-authoring";
import { nativeOperationToStorage } from "./native-operation-storage.js";
const mocks = vi.hoisted(() => ({ ai: vi.fn(), query: vi.fn() }));
vi.mock("./native-ai-storage.js", () => ({
  prepareNativeAiSaveState: mocks.ai,
}));
vi.mock("kysely", () => ({
  sql: (s: TemplateStringsArray, ...values: unknown[]) => ({
    execute: () => mocks.query(s.join("?"), values),
  }),
}));
import { prepareNativeSupplementalSave } from "./native-supplemental-save.js";
const id = "00000000-0000-4000-8000-000000000001";
const c = { entityId: id, changeSetId: id, tenantId: null };
const tx = { isTransaction: true } as Transaction<Record<string, never>>;
function operation(): NativeOperationRow {
  return {
    id,
    operationKey: "export",
    operationKind: "export",
    labelId: id,
    description: null,
    auditEventCode: "fixture.export",
    executionMode: "synchronous",
    idempotencyMode: "required",
    inputSurfaceId: null,
    resultSurfaceId: null,
    authorizationTarget: "collection",
    authorizationEffect: "read",
    requiresParentRead: false,
    requiresPreflight: false,
    replacementOperationId: null,
    handlerKey: "registered.export",
    handlerVersion: 1,
    preflightKey: null,
    preflightVersion: null,
    extensionFieldMode: "none",
    exportFormats: ["csv"],
    exportMaxRecords: "9007199254740993",
  };
}
function graph(): ExpandedNativeMetaEntityGraph {
  return {
    contractSchema: "athyper.meta-entity-contract/2.5",
    entity: { entityCode: "synthetic-reference" },
    operations: [operation()],
    fields: [],
    runtimeProfiles: [],
    surfaces: [],
    surfaceSections: [],
    surfaceFieldBindings: [],
    authoringSource: {
      entityId: id,
      tenantId: null,
      sourceKind: "product",
      authoringSchemaHash: "a".repeat(64),
    },
    ai: { profile: [], field: [], binding: [], reference: [], term: [] },
  };
}
beforeEach(() => {
  mocks.ai.mockReset().mockResolvedValue({ plans: [], storedMembers: 0 });
  mocks.query.mockReset().mockResolvedValue({
    rows: [{ value: nativeOperationToStorage(operation()) }],
  });
});
it("prepares operation and AI plans under the same transaction and preserves bigint precision", async () => {
  const candidate = graph();
  const plans = await prepareNativeSupplementalSave(tx, c, candidate, 100);
  expect(mocks.ai).toHaveBeenCalledWith(tx, c, candidate, 100);
  expect(plans[0]).toEqual({
    table: "entity_operation",
    insert: [],
    update: [],
    remove: [],
  });
  const [query, values] = mocks.query.mock.calls[0]!;
  expect(query).toContain("export_max_records::text");
  expect(query).toContain("tenant_id IS NOT DISTINCT FROM");
  expect(values).toEqual([c.changeSetId, c.entityId, null, 101]);
  expect(query).not.toMatch(/^(UPDATE|DELETE|INSERT)/);
});
it("does not read operations when the shared source lock or schema qualification rejects", async () => {
  mocks.ai.mockRejectedValueOnce(
    Error("ENTITY_NATIVE_SNAPSHOT_CUTOVER_REQUIRED"),
  );
  await expect(
    prepareNativeSupplementalSave(tx, c, graph(), 100),
  ).rejects.toThrow("ENTITY_NATIVE_SNAPSHOT_CUTOVER_REQUIRED");
  expect(mocks.query).not.toHaveBeenCalled();
});
it("rejects oversized combined stored families and unavailable operation initialization", async () => {
  mocks.ai.mockResolvedValueOnce({ plans: [], storedMembers: 2 });
  await expect(
    prepareNativeSupplementalSave(tx, c, graph(), 2),
  ).rejects.toMatchObject({ code: "NATIVE_SNAPSHOT_LIMIT" });
  mocks.query.mockResolvedValueOnce({ rows: [] });
  await expect(
    prepareNativeSupplementalSave(tx, c, graph(), 100),
  ).rejects.toMatchObject({ code: "OPERATION_PROTECTED_SOURCE_REQUIRED" });
});
