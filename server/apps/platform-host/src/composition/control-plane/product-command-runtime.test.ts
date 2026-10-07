import { Kysely, PostgresDialect } from "kysely";
import { expect, it, vi } from "vitest";
import { createControlProductCommandRuntime } from "./product-command-runtime.js";
const authority = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  realmKey: "platform-control",
  issuer: "https://iam.dev.athyper.test/realms/platform-control",
  audience: "athyper-platform-control-api",
};
const issuerRole = {
  login: "issuer",
  database: "athyper_studio",
  safe: true,
  isolated: true,
  issuer: true,
  application: false,
  owner: false,
};
const appRole = {
  login: "application",
  database: "athyper_studio",
  safe: true,
  isolated: true,
  issuer: false,
  application: true,
  owner: false,
};
function database(row: unknown, auditAllowed = true) {
  return new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({
          query: async (query: string) => ({
            rows: [
              query.includes("has_schema_privilege")
                ? { allowed: auditAllowed }
                : row,
            ],
            rowCount: 1,
          }),
          release() {},
        }),
        end: async () => {},
      } as never,
    }),
  });
}
async function fixture(issuer = issuerRole, application = appRole) {
  const issuerDatabase = database(issuer),
    commandDatabase = database(application);
  const audit = {
    record: vi.fn(async (event: any, _tx: unknown) => ({
      ...event,
      id: "audit",
    })),
  };
  return {
    issuerDatabase,
    commandDatabase,
    audit,
    options: {
      governanceDatabase: issuerDatabase,
      issuerDatabase,
      commandDatabase,
      applicationLogin: "application",
      authority,
      labels: {
        supportedLocales: ["en"],
        maxCommands: 100,
        maxBatchBytes: 65536,
      },
      audit: audit as never,
    },
    async close() {
      await issuerDatabase.destroy();
      await commandDatabase.destroy();
    },
  };
}
it.each([
  { issuer: true },
  { owner: true },
  { safe: false },
  { isolated: false },
  { database: "athyper_neon" },
  { login: "wrong" },
  { application: false },
])(
  "rejects unsafe command role %j before enabling the route",
  async (patch) => {
    const f = await fixture(issuerRole, { ...appRole, ...patch });
    try {
      await expect(
        createControlProductCommandRuntime(f.options),
      ).rejects.toThrow(/PRODUCT_COMMAND_LOGIN/);
    } finally {
      await f.close();
    }
  },
);
it("rejects an issuer with application membership", async () => {
  const f = await fixture({ ...issuerRole, application: true });
  try {
    await expect(createControlProductCommandRuntime(f.options)).rejects.toThrow(
      "SEPARATION",
    );
  } finally {
    await f.close();
  }
});
it("uses transactional audit and refuses fabricated audit attribution", async () => {
  const f = await fixture();
  try {
    const runtime = await createControlProductCommandRuntime(f.options);
    const context = {
      tenantId: authority.tenantId,
      principalId: "human",
      requestId: "request",
    };
    const input = {
      changeSetId: "draft",
      proposal: { idempotencyKey: "enrollment" },
    };
    const result = {
      sourceHash: "source",
      proposalHash: "proposal",
      revision: 2,
    };
    await runtime.audit(
      f.commandDatabase,
      context as never,
      input as never,
      result as never,
    );
    expect(f.audit.record.mock.calls[0]?.[1]).toBe(f.commandDatabase);
    f.audit.record.mockImplementation(async (event) => ({
      ...event,
      id: "audit",
      actor: { kind: "user", principalId: "other" },
    }));
    await expect(
      runtime.audit(
        f.commandDatabase,
        context as never,
        input as never,
        result as never,
      ),
    ).rejects.toThrow("AUDIT_REQUIRED");
    expect(() => runtime.host.commands).toThrow("legacy label enrollment only");
    await expect(
      runtime.host.resolveInitializer(f.commandDatabase as never, {} as never),
    ).rejects.toThrow("legacy label enrollment only");
  } finally {
    await f.close();
  }
});

it("rejects a command connection without the transactional audit privilege", async () => {
  const f = await fixture();
  const denied = database(appRole, false);
  try {
    await expect(
      createControlProductCommandRuntime({
        ...f.options,
        commandDatabase: denied,
      }),
    ).rejects.toThrow("AUDIT_PRIVILEGE_REQUIRED");
  } finally {
    await denied.destroy();
    await f.close();
  }
});
