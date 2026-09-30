import { Kysely, PostgresDialect } from "kysely";
import { expect, it } from "vitest";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import {
  createRecordOwnerAccessAdapter,
  prepareRecordOwnerAccess,
} from "../record-owner-access.js";
const context = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  principalId: "22222222-2222-4222-8222-222222222222",
  planeKey: "neon",
} as VerifiedRequestContext;
const other = "33333333-3333-4333-8333-333333333333";
const descriptor = {
  entityCode: "owned",
  storage: { schema: "master", object: "owned" },
  ownerAccess: {
    schemaVersion: 1,
    ownerField: "owner_id",
    createdByField: "created_by",
    updatedByField: "updated_by",
    administerPermission: "common.test.owned.administer",
  },
} as unknown as EntityRuntimeDescriptor;
it("checks separate admin authority and resets the transaction marker after revocation", async () => {
  let admin = true;
  const captured: unknown[][] = [];
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        end: async () => {},
        connect: async () => ({
          release() {},
          query: async (_sql: string, p: unknown[]) => {
            captured.push(p);
            return { rows: [] };
          },
        }),
      } as any,
    }),
  });
  const requests: string[] = [];
  const adapter = createRecordOwnerAccessAdapter({
    authorize: async (input) => {
      requests.push(input.permissionCode);
      return admin
        ? { allowed: true }
        : { allowed: false, reason: "missing_permission" };
    },
  });
  try {
    const input = {
      context,
      descriptor,
      operation: "create",
      ownerPrincipalId: other,
    };
    expect(await adapter.prepare(input, db as never)).toEqual({
      owner_id: other,
      created_by: context.principalId,
    });
    expect(JSON.parse(String(captured.at(-1)?.[0]))).toMatchObject({
      admin: true,
      actorId: context.principalId,
      tenantId: context.tenantId,
    });
    admin = false;
    await expect(adapter.prepare(input, db as never)).rejects.toThrow(
      "another user's",
    );
    await adapter.prepare(
      { ...input, operation: "read", ownerPrincipalId: context.principalId },
      db as never,
    );
    expect(JSON.parse(String(captured.at(-1)?.[0]))).toMatchObject({
      admin: false,
    });
    expect(
      requests.every((code) => code === "common.test.owned.administer"),
    ).toBe(true);
  } finally {
    await db.destroy();
  }
});
it("fails closed when the owner adapter is absent", async () => {
  await expect(
    prepareRecordOwnerAccess(
      undefined,
      { context, descriptor, operation: "read" },
      {},
    ),
  ).rejects.toThrow("ownership enforcement");
});
