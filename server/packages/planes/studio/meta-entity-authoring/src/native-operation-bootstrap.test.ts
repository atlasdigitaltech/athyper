import { Kysely, PostgresDialect, type Transaction } from "kysely";
import { expect, it, vi } from "vitest";
import type { NativeOperationRow } from "@athyper/server-contract-meta-entity-authoring";
import {
  createApprovedOperationBootstrap,
  type ApprovedOperationSource,
} from "./native-operation-bootstrap.js";
import { sha256 } from "./deterministic.js";
const id = "00000000-0000-4000-8000-000000000001";
const sourceId = "00000000-0000-4000-8000-000000000002";
const targetId = "00000000-0000-4000-8000-000000000003";
const sourceOperation = "00000000-0000-4000-8000-000000000004";
function row(): NativeOperationRow {
  return {
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
}
function setup() {
  const sources: ApprovedOperationSource[] = [
    {
      entity_id: id,
      entity_code: "synthetic_reference",
      source_change_set_id: sourceId,
      source_revision: 4,
      source_operation_id: sourceOperation,
      operation_key: "read",
      requires_mfa: false,
    },
  ];
  const options = {
    sources,
    approvedSourceRowsHash: sha256(sources),
    targets: [{ entityId: id, changeSetId: targetId }],
  };
  const query = vi.fn(async (_text: string) => ({
    rows: [{ ...sources[0]!, source_revision: "4" }],
  }));
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({ query, release() {} }),
        end: async () => {},
      } as never,
    }),
  });
  Object.defineProperty(db, "isTransaction", { value: true });
  const tx = db as Transaction<Record<string, never>>;
  const c = { entityId: id, changeSetId: targetId, tenantId: null };
  const initializer = createApprovedOperationBootstrap(options);
  const source = structuredClone(sources[0]!);
  query.mockImplementation(async () => ({
    rows: [{ ...source, source_revision: "4" }],
  }));
  return {
    sources,
    options,
    query,
    tx,
    c,
    initializer,
    run: () => initializer.prepare(tx, c, [row()], []),
  };
}
it("pins the source document and copies only rechecked values into fresh scoped insert plans", async () => {
  const f = setup();
  f.sources[0] = { ...f.sources[0]!, requires_mfa: true };
  const plan = await f.run();
  expect(plan.update).toEqual([]);
  expect(plan.remove).toEqual([]);
  expect(plan.insert[0]!.values.requires_mfa).toBe(false);
  expect(plan.insert[0]!.id).toBe(id);
  expect(
    f.query.mock.calls.every(([s]) => s.trimStart().startsWith("SELECT")),
  ).toBe(true);
  expect(f.query.mock.calls[0]![0]).toContain(
    "entity_command_private.read_operation_bootstrap_source",
  );
  expect(f.query.mock.calls[0]![0]).not.toContain("FROM metadata.");
});
it("rejects source documents without their separately approved hash", () => {
  const f = setup();
  expect(() =>
    createApprovedOperationBootstrap({
      ...f.options,
      approvedSourceRowsHash: "0".repeat(64),
    }),
  ).toThrow();
  const sources = [{ ...f.sources[0]!, clientControl: false }];
  expect(() =>
    createApprovedOperationBootstrap({
      ...f.options,
      sources,
      approvedSourceRowsHash: sha256(sources),
    }),
  ).toThrow();
});
it("rejects missing source or changed revision, identity, key and protected value", async () => {
  for (const patch of [
    null,
    { source_revision: 5 },
    { source_operation_id: targetId },
    { requires_mfa: true },
    { requires_mfa: null },
    { operation_key: "write" },
    { entity_id: targetId },
    { source_change_set_id: targetId },
    { entity_code: "other" },
  ]) {
    const f = setup();
    f.query.mockResolvedValueOnce({
      rows: patch === null ? [] : [{ ...f.sources[0]!, ...patch }],
    } as never);
    await expect(f.run()).rejects.toMatchObject({
      code: "OPERATION_BOOTSTRAP_SOURCE_REJECTED",
    });
    expect(f.query).toHaveBeenCalledTimes(1);
  }
});
it("rejects client overrides, unapproved keys, duplicate keys and reused source IDs before SQL", async () => {
  const f = setup();
  for (const incoming of [
    [{ ...row(), requiresMfa: false }],
    [{ ...row(), requires_mfa: false }],
    [{ ...row(), operationKey: "other" }],
    [{ ...row(), operationKind: "update" }],
    [{ ...row(), id: sourceOperation }],
    [row(), row()],
    [],
  ])
    await expect(
      f.initializer.prepare(f.tx, f.c, incoming as NativeOperationRow[], []),
    ).rejects.toThrow();
  expect(f.query).not.toHaveBeenCalled();
});
it("rejects wrong target, tenant, existing members and nontransaction callers before SQL", async () => {
  const f = setup();
  for (const c of [
    { ...f.c, changeSetId: sourceId },
    { ...f.c, entityId: sourceId },
    { ...f.c, tenantId: id },
  ])
    await expect(f.initializer.prepare(f.tx, c, [row()], [])).rejects.toThrow();
  await expect(
    f.initializer.prepare(f.tx, f.c, [row()], [{ id }]),
  ).rejects.toThrow();
  await expect(
    f.initializer.prepare({ isTransaction: false } as never, f.c, [row()], []),
  ).rejects.toThrow();
  expect(f.query).not.toHaveBeenCalled();
});
it("rejects contradictory source revisions and ambiguous target enrollment", () => {
  const f = setup();
  const sources = [
    ...f.sources,
    {
      ...f.sources[0]!,
      source_revision: 5,
      operation_key: "list",
      source_operation_id: targetId,
    },
  ];
  expect(() =>
    createApprovedOperationBootstrap({
      ...f.options,
      sources,
      approvedSourceRowsHash: sha256(sources),
    }),
  ).toThrow();
  expect(() =>
    createApprovedOperationBootstrap({
      ...f.options,
      targets: [...f.options.targets, ...f.options.targets],
    }),
  ).toThrow();
});

it("captures target and incoming semantics before source reads await", async () => {
  const f = setup(),
    op = row();
  const pending = f.initializer.prepare(f.tx, f.c, [op], []);
  Object.assign(op, { operationKind: "update", operationKey: "write" });
  f.c.changeSetId = sourceId;
  f.options.approvedSourceRowsHash = "0".repeat(64);
  const plan = await pending;
  expect(plan.insert[0]!.values.operation_kind).toBe("read");
  expect(plan.insert[0]!.values.operation_key).toBe("read");
});
