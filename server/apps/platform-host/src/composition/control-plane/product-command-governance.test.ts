import { Kysely, PostgresDialect } from "kysely";
import { expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
const { resolve } = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock("@athyper/server-platform-iam", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@athyper/server-platform-iam")>()),
  createKyselyPermissionResolver: () => ({ resolve }),
}));
import { createControlProductCommandGovernance } from "./product-command-governance.js";
const authority = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  realmKey: "platform-control",
  issuer: "https://iam.dev.athyper.test/realms/platform-control",
  audience: "athyper-platform-control-api",
};
const principalId = "22222222-2222-4222-8222-222222222222";
function fixture() {
  resolve.mockReset();
  const query = vi.fn(async (text: string) => ({
    rows: text.includes("FROM master.principal p")
      ? [{ id: principalId }]
      : text.includes("SELECT c.entity_id")
        ? [{ entity_id: "33333333-3333-4333-8333-333333333333" }]
        : [],
    rowCount: 1,
  }));
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({ query, release() {} }),
        end: async () => {},
      } as never,
    }),
  });
  const context = {
    planeKey: "studio",
    realmKey: authority.realmKey,
    tenantId: authority.tenantId,
    principalId,
    authEpoch: 4,
    assurance: "elevated",
    profileHash: "stale",
    requestId: "request",
    permissions: {
      planeKey: "studio",
      tenantId: authority.tenantId,
      principalId,
      profileHash: "stale",
      allowed: [],
      denied: [],
      planLocked: [],
      planeExcluded: [],
      authorizationScopes: [],
      entries: [],
      resolvedAt: 0,
      principalFingerprint: "stale",
      schemaHash: "schema",
    },
  } as VerifiedRequestContext;
  const snapshot = {
    ...context.permissions,
    profileHash: "fresh",
    allowed: ["studio.metadata.contract.edit"],
  };
  resolve.mockResolvedValue(snapshot);
  const scope = {
    authorityTenantId: authority.tenantId,
    actorId: principalId,
    changeSetId: "44444444-4444-4444-8444-444444444444",
  };
  const service = createControlProductCommandGovernance({
    database: db,
    authority,
  });
  return {
    db,
    query,
    context,
    snapshot,
    scope,
    run: () => service.authorize(context, scope, "a".repeat(64)),
  };
}
it("uses fresh IAM grants through the existing authoring gate, then rejects revoked authority on replay", async () => {
  const f = fixture();
  try {
    await expect(f.run()).resolves.toBeUndefined();
    resolve.mockResolvedValue({
      ...f.snapshot,
      allowed: [],
      denied: ["studio.metadata.contract.edit"],
    });
    await expect(f.run()).rejects.toMatchObject({
      code: "PRODUCT_COMMAND_AUTHORITY_DENIED",
    });
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(
      f.query.mock.calls.some(([text]) => /INSERT|UPDATE|DELETE/.test(text)),
    ).toBe(false);
  } finally {
    await f.db.destroy();
  }
});
it.each(["actor", "tenant", "realm", "plane"])(
  "rejects forged %s scope before accessing the database",
  async (kind) => {
    const f = fixture();
    try {
      if (kind === "actor") f.scope.actorId = f.scope.changeSetId;
      if (kind === "tenant") f.scope.authorityTenantId = f.scope.changeSetId;
      if (kind === "realm") Object.assign(f.context, { realmKey: "tenant" });
      if (kind === "plane") Object.assign(f.context, { planeKey: "neon" });
      await expect(f.run()).rejects.toMatchObject({
        code: "PRODUCT_COMMAND_AUTHORITY_DENIED",
      });
      expect(f.query).not.toHaveBeenCalled();
    } finally {
      await f.db.destroy();
    }
  },
);
it.each(["principal", "draft"])(
  "rejects absent/stale %s evidence before IAM admission",
  async (missing) => {
    const f = fixture();
    try {
      const original = f.query.getMockImplementation()!;
      f.query.mockImplementation(async (text) =>
        text.includes(
          missing === "principal"
            ? "FROM master.principal p"
            : "SELECT c.entity_id",
        )
          ? { rows: [], rowCount: 0 }
          : original(text),
      );
      await expect(f.run()).rejects.toMatchObject({
        code: "PRODUCT_COMMAND_AUTHORITY_DENIED",
      });
      expect(resolve).not.toHaveBeenCalled();
    } finally {
      await f.db.destroy();
    }
  },
);
