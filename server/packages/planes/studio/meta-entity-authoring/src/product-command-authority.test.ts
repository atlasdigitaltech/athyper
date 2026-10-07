import { expect, it, vi } from "vitest";
import { Kysely, PostgresDialect } from "kysely";
import {
  createProductCommandAuthority,
  enterProductCommand,
  withProductCommandAuthority,
  ProductCommandCleanupError,
} from "./product-command-authority.js";
import { sha256 } from "./deterministic.js";

function fixture() {
  const query = vi.fn(async (_query: unknown) => ({ rows: [], rowCount: 1 }));
  const database = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({ query, release() {} }),
        end: async () => {},
      } as never,
    }),
  });
  const scope = {
    authorityTenantId: "00000000-0000-4000-8000-000000000001",
    actorId: "00000000-0000-4000-8000-000000000002",
    changeSetId: "00000000-0000-4000-8000-000000000003",
  };
  return { database, query, scope };
}

it("never issues a database admission when current governance denies", async () => {
  const { database, query, scope } = fixture();
  try {
    const authority = createProductCommandAuthority({
      issuer: database,
      applicationLogin: "application",
      governance: {
        async authorize() {
          throw Error("REVOKED");
        },
      },
    });
    await expect(
      authority.issue(null, scope, { command: "labels" }),
    ).rejects.toThrow("REVOKED");
    expect(query).not.toHaveBeenCalled();
  } finally {
    await database.destroy();
  }
});

it("pins scope and command before asynchronous governance evaluation", async () => {
  const { database, scope } = fixture();
  try {
    const command = { command: "labels" };
    const originalScope = structuredClone(scope);
    const expected = sha256({ scope: originalScope, command });
    const authority = createProductCommandAuthority({
      issuer: database,
      applicationLogin: "application",
      governance: {
        async authorize(_context, captured, hash) {
          scope.actorId = scope.changeSetId;
          command.command = "different";
          expect(captured).toEqual(originalScope);
          expect(hash).toBe(expected);
        },
      },
    });
    const admission = await authority.issue(null, scope, command);
    expect(admission.requestHash).toBe(expected);
    expect(admission.scope).toEqual(originalScope);
    await expect(
      enterProductCommand(database, admission, command),
    ).rejects.toThrow("CONTENT_MISMATCH");
  } finally {
    await database.destroy();
  }
});

it.each(["committed", "execute-failed", "commit-unconfirmed"] as const)(
  "reports cleanup failure without misrepresenting %s",
  async (scenario) => {
    const { database, query, scope } = fixture();
    const transactionError = Error("transaction failure");
    if (scenario === "commit-unconfirmed")
      query.mockImplementation(async (input) => {
        const text =
          typeof input === "string" ? input : (input as { text: string }).text;
        if (text.toLowerCase() === "commit") throw transactionError;
        return { rows: [], rowCount: 1 };
      });
    const authority = createProductCommandAuthority({
      issuer: database,
      applicationLogin: "application",
      governance: { async authorize() {} },
    });
    const result = { revision: 5 };
    try {
      const error = await withProductCommandAuthority({
        authority: {
          ...authority,
          async revoke() {
            throw Error("private cleanup transport detail");
          },
        },
        context: null,
        scope,
        command: { command: "labels" },
        database,
        async execute() {
          if (scenario === "execute-failed") throw transactionError;
          return result;
        },
      }).catch((error) => error);
      expect(error).toBeInstanceOf(ProductCommandCleanupError);
      expect(error.outcome).toBe(
        scenario === "committed" ? "committed" : "unconfirmed",
      );
      expect(error.committedResult).toEqual(
        scenario === "committed" ? result : undefined,
      );
      expect(error.cause).toBe(
        scenario === "committed" ? undefined : transactionError,
      );
      expect(String(error)).not.toContain("private cleanup transport detail");
    } finally {
      await database.destroy();
    }
  },
);
