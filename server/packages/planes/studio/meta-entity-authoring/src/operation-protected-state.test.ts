import { Kysely, PostgresDialect } from "kysely";
import { expect, it, vi } from "vitest";
import type { MetaEntityOperation } from "@athyper/server-contract-meta-entity-authoring";
import { preserveOperationProtectedState } from "./operation-protected-state.js";

const operation = (requiresMfa?: boolean): MetaEntityOperation => ({
  id: "operation-a",
  operationKey: "read",
  operationKind: "query",
  label: "Read",
  auditEventCode: "record.read",
  ...(requiresMfa === undefined ? {} : { requiresMfa }),
});
function database(rows: readonly { id: string; requires_mfa: unknown }[]) {
  const query = vi.fn(async () => ({ rows }));
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({ query, release() {} }),
        end: async () => {},
      } as never,
    }),
  });
  return { db, query };
}
it.each([true, false])(
  "preserves stored %s when omitted or unchanged",
  async (value) => {
    const { db, query } = database([
      { id: "operation-a", requires_mfa: value },
    ]);
    try {
      const incoming = operation();
      expect(
        await preserveOperationProtectedState(db, "draft", [incoming]),
      ).toEqual([operation(value)]);
      expect(incoming.requiresMfa).toBeUndefined();
      expect(
        await preserveOperationProtectedState(db, "draft", [operation(value)]),
      ).toEqual([operation(value)]);
      const [statement, parameters] = query.mock.calls[0]! as unknown as [
        string,
        unknown[],
      ];
      expect(statement).toContain("FOR UPDATE OF o");
      expect(statement).toContain("cs.entity_id=o.entity_id");
      expect(statement).toContain(
        "cs.tenant_id IS NOT DISTINCT FROM o.tenant_id",
      );
      expect(parameters).toEqual(["draft"]);
    } finally {
      await db.destroy();
    }
  },
);
it.each([true, false])("rejects changing stored %s", async (value) => {
  const { db } = database([{ id: "operation-a", requires_mfa: value }]);
  try {
    await expect(
      preserveOperationProtectedState(db, "draft", [operation(!value)]),
    ).rejects.toMatchObject({
      code: "OPERATION_PROTECTED_STATE_CHANGE_FORBIDDEN",
    });
  } finally {
    await db.destroy();
  }
});
it.each([undefined, false, true])(
  "cannot initialize a new operation from client value %s",
  async (value) => {
    const { db } = database([]);
    try {
      await expect(
        preserveOperationProtectedState(db, "draft", [operation(value)]),
      ).rejects.toMatchObject({ code: "OPERATION_PROTECTED_SOURCE_REQUIRED" });
    } finally {
      await db.destroy();
    }
  },
);
it("rejects missing/duplicate identities and foreign IDs without matching by logical key", async () => {
  const { db } = database([{ id: "operation-a", requires_mfa: true }]);
  try {
    for (const incoming of [
      [{ ...operation(), id: undefined }],
      [operation(), operation()],
    ])
      await expect(
        preserveOperationProtectedState(db, "draft", incoming),
      ).rejects.toMatchObject({
        code: "OPERATION_PROTECTED_IDENTITY_REQUIRED",
      });
    await expect(
      preserveOperationProtectedState(db, "draft", [
        { ...operation(), id: "other-draft-operation" },
      ]),
    ).rejects.toMatchObject({ code: "OPERATION_PROTECTED_SOURCE_REQUIRED" });
  } finally {
    await db.destroy();
  }
});
it("does not treat malformed stored state as false", async () => {
  const { db } = database([{ id: "operation-a", requires_mfa: null }]);
  try {
    await expect(
      preserveOperationProtectedState(db, "draft", [operation()]),
    ).rejects.toMatchObject({ code: "OPERATION_PROTECTED_SOURCE_REQUIRED" });
  } finally {
    await db.destroy();
  }
});
