import { Kysely, PostgresDialect, type Transaction } from "kysely";
import { expect, it, vi } from "vitest";
import { KyselyMetaEntityAuthoringRepository } from "./kysely-authoring-repository.js";
import {
  applyLegacySourceEnrollment,
  type LegacyEnrollmentApplicationPolicy,
} from "./legacy-enrollment-application.js";
import type { NativeAuthoringPolicy } from "./native-core-layout-persistence.js";
const id = "00000000-0000-4000-8000-000000000001";
const input = {
  entityId: id,
  changeSetId: id,
  tenantId: null,
  actorId: id,
  expectedRevision: 7,
  expectedSourceHash: "a".repeat(64),
  idempotencyKey: "enrollment-command-00001",
};
it("does not acquire database access without an installed enrollment writer", async () => {
  await expect(
    new KyselyMetaEntityAuthoringRepository(
      {} as Kysely<Record<string, never>>,
    ).executeLegacyEnrollment(input),
  ).rejects.toMatchObject({ code: "LEGACY_ENROLLMENT_HOST_NOT_CONFIGURED" });
});
it("rejects application outside a transaction before admission or reads", async () => {
  await expect(
    applyLegacySourceEnrollment(
      {} as Transaction<Record<string, never>>,
      input,
      {} as LegacyEnrollmentApplicationPolicy,
      async () => {
        throw Error("Must not load");
      },
    ),
  ).rejects.toMatchObject({ code: "NORMALIZED_SAVE_TRANSACTION_REQUIRED" });
});
it("rejects malformed input before host admission", async () => {
  const admit = vi.fn();
  const policy = {
    host: { admit },
  } as unknown as LegacyEnrollmentApplicationPolicy;
  for (const patch of [
    { expectedRevision: Number.MAX_SAFE_INTEGER },
    { idempotencyKey: "short" },
    { tenantId: "invalid" },
    { sourceHash: "injected" },
  ]) {
    await expect(
      applyLegacySourceEnrollment(
        { isTransaction: true } as Transaction<Record<string, never>>,
        { ...input, ...patch },
        policy,
        async () => {
          throw Error("Must not load");
        },
      ),
    ).rejects.toThrow();
  }
  expect(admit).not.toHaveBeenCalled();
});
it("rolls back its repository savepoint when independent authority rejects", async () => {
  const query = vi.fn(async (text: string) => ({
    rows: text.includes("to_jsonb(cs)")
      ? [{ source: { lock_version: "7" } }]
      : [],
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
  const resolve = vi.fn();
  const policy: LegacyEnrollmentApplicationPolicy = {
    host: {
      commands: { authoringSchemaHash: "a".repeat(64) },
      admit: async () => {},
    } as unknown as NativeAuthoringPolicy,
    qualify: async () => {
      throw Error("Product write authority unavailable");
    },
    resolve,
  };
  try {
    await expect(
      new KyselyMetaEntityAuthoringRepository(
        db,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        policy,
      ).executeLegacyEnrollment(input),
    ).rejects.toThrow("Product write authority unavailable");
    const statements = query.mock.calls.map(([text]) => text);
    expect(statements[0]).toBe("SAVEPOINT legacy_source_enrollment");
    expect(statements.at(-2)).toBe(
      "ROLLBACK TO SAVEPOINT legacy_source_enrollment",
    );
    expect(statements.at(-1)).toBe(
      "RELEASE SAVEPOINT legacy_source_enrollment",
    );
    expect(
      statements.every((s) =>
        /^(SELECT|SAVEPOINT|ROLLBACK TO SAVEPOINT|RELEASE SAVEPOINT)/.test(s),
      ),
    ).toBe(true);
    expect(resolve).not.toHaveBeenCalled();
  } finally {
    await db.destroy();
  }
});
