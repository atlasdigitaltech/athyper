import { expect, it, vi } from "vitest";
import { Kysely, PostgresDialect } from "kysely";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type {
  RegisteredActionCommand,
  RecordMutationResult,
} from "@athyper/server-contract-records";
import { createTransactionalRecordActionService } from "@athyper/server-service-records";
import { createPartnerCapabilityActionHandlers } from "./capability-actions.js";

function fixture(capability: "supplier" | "customer" = "supplier") {
  const handlerKey = `neon.bp.capability.${capability}.v1`;
  const command = {
    origin: "operation",
    validationMode: "strict",
    entityCode: "party_alias",
    recordId: "00000000-0000-4000-8000-000000000001",
    actionCode: "manage_capability",
    expectedVersion: 2,
    idempotencyKey: "capability-command-001",
    input: { enabled: true, reason: "Approved setup" },
    context: {
      planeKey: "neon",
      tenantId: "00000000-0000-4000-8000-000000000002",
      principalId: "00000000-0000-4000-8000-000000000003",
      requestId: "request",
    },
  } as RegisteredActionCommand;
  const descriptor = {
    entityCode: command.entityCode,
    planeKey: "neon",
    compiledHash: "hash",
    releaseId: "release",
    releaseNo: 1,
    storage: {
      schema: "master",
      object: "v_partner_identity_read",
      idField: "id",
      tenantField: "tenant_id",
      versionField: "record_version",
    },
    operations: {},
    fields: [
      {
        key: `${capability}_enabled`,
        type: "boolean",
        storagePath: `${capability}_enabled`,
        writableOn: [],
      },
    ],
    actions: [
      {
        code: command.actionCode,
        handlerKey,
        permissionCode: "published.exact.manage",
      },
    ],
  } as unknown as EntityRuntimeDescriptor;
  const query = vi.fn(async (text: string, values: unknown[] = []) => ({
    rows: text.includes("command_business_partner_capability")
      ? [
          {
            business_partner_id: values[1],
            capability: values[2],
            enabled: values[3],
            record_version: 3,
            evidence_id: "evidence",
            replayed: false,
          },
        ]
      : [],
  }));
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: { connect: async () => ({ query, release() {} }) } as any,
    }),
  });
  const handlers = createPartnerCapabilityActionHandlers<typeof db>();
  let receipt: RecordMutationResult | undefined;
  const begin = vi.fn(async () =>
    receipt
      ? { kind: "replay", result: receipt }
      : { kind: "started", executionId: "receipt" },
  );
  const authorize = vi.fn(async () => ({ allowed: true }));
  const audit = vi.fn(async () => ({})),
    outbox = vi.fn(async () => undefined);
  const service = createTransactionalRecordActionService({
    metadata: { getEntityDescriptor: async () => descriptor },
    authorizer: { authorize },
    handlers,
    repository: {
      get: async () => ({ id: command.recordId, record_version: 2 }),
    } as any,
    transactions: {
      run: async (
        _plane: string,
        _context: unknown,
        work: (tx: typeof db) => Promise<unknown>,
      ) => db.transaction().execute(work),
    } as any,
    commandExecutions: {
      begin,
      complete: async (_id: string, result: RecordMutationResult) => {
        receipt = result;
      },
    } as any,
    audit: { record: audit } as any,
    outbox: { append: outbox },
  });
  return {
    command,
    descriptor,
    handlers,
    handlerKey,
    db,
    query,
    service,
    authorize,
    begin,
    audit,
    outbox,
  };
}
it.each(["supplier", "customer"] as const)(
  "executes %s through shared authorization, transaction, receipts and side effects",
  async (capability) => {
    const f = fixture(capability);
    expect(await f.service.execute(f.command)).toMatchObject({
      kind: "Committed",
      version: 3,
      replayed: false,
    });
    expect(f.authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        permissionCode: "published.exact.manage",
        resource: expect.objectContaining({
          tenantId: f.command.context.tenantId,
          actionHandlerKey: f.handlerKey,
          registeredActionCheck: true,
        }),
      }),
    );
    const calls = f.query.mock.calls.filter(([sql]) =>
      sql.includes("command_business_partner_capability"),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]![1]).toEqual([
      f.command.context.tenantId,
      f.command.recordId,
      capability,
      true,
      2,
      "Approved setup",
      f.command.idempotencyKey,
      f.command.context.principalId,
    ]);
    expect(f.audit).toHaveBeenCalledTimes(1);
    expect(f.outbox).toHaveBeenCalledTimes(1);
    expect(await f.service.execute(f.command)).toMatchObject({
      kind: "Committed",
      replayed: true,
    });
    expect(
      f.query.mock.calls.filter(([sql]) =>
        sql.includes("command_business_partner_capability"),
      ),
    ).toHaveLength(1);
    f.authorize.mockResolvedValueOnce({ allowed: false });
    expect(await f.service.execute(f.command)).toEqual({
      kind: "Forbidden",
      permissionCode: "published.exact.manage",
    });
    expect(f.begin).toHaveBeenCalledTimes(2);
    expect(f.audit).toHaveBeenCalledTimes(1);
  },
);
it("rejects invalid payloads, unsupported plane and missing version before receipts or SQL", async () => {
  for (const modify of [
    (f: ReturnType<typeof fixture>) => {
      (f.command as any).input = { enabled: true, reason: " " };
    },
    (f: ReturnType<typeof fixture>) => {
      (f.command as any).input.targetEntityCode = "other";
    },
    (f: ReturnType<typeof fixture>) => {
      (f.command.context as any).planeKey = "mesh";
    },
    (f: ReturnType<typeof fixture>) => {
      (f.command as any).expectedVersion = undefined;
    },
  ]) {
    const f = fixture();
    modify(f);
    expect((await f.service.execute(f.command)).kind).not.toBe("Committed");
    expect(f.begin).not.toHaveBeenCalled();
    expect(
      f.query.mock.calls.some(([sql]) =>
        sql.includes("command_business_partner_capability"),
      ),
    ).toBe(false);
  }
});
it("rolls back database command failures and mismatched results without side effects", async () => {
  for (const failure of ["database", "mismatch"]) {
    const f = fixture();
    f.query.mockImplementation(async (text) => {
      if (text.includes("command_business_partner_capability")) {
        if (failure === "database") throw Error("command denied");
        return { rows: [] };
      }
      return { rows: [] };
    });
    await expect(f.service.execute(f.command)).rejects.toThrow();
    expect(
      f.query.mock.calls.some(([sql]) =>
        sql.toLowerCase().startsWith("rollback"),
      ),
    ).toBe(true);
    expect(f.audit).not.toHaveBeenCalled();
    expect(f.outbox).not.toHaveBeenCalled();
  }
});
