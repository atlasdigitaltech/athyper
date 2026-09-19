import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
} from "kysely";
import { describe, expect, it } from "vitest";
import {
  KyselyOnboardingSagaRepository,
  type OnboardingTransaction,
} from "./kysely-onboarding-saga-repository.js";

function fixture(results: Record<string, unknown>[][]) {
  const queries: CompiledQuery[] = [];
  class Driver extends DummyDriver {
    override async acquireConnection(): Promise<DatabaseConnection> {
      return {
        executeQuery: async <R>(query: CompiledQuery) => {
          queries.push(query);
          return { rows: (results.shift() ?? []) as R[] };
        },
        streamQuery: async function* <R>() {
          yield { rows: [] as R[] };
        },
      };
    }
  }
  const db = new Kysely<Record<string, never>>({
    dialect: {
      createDriver: () => new Driver(),
      createAdapter: () => new PostgresAdapter(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
  return {
    db,
    transaction: db as unknown as OnboardingTransaction,
    repository: new KyselyOnboardingSagaRepository(db),
    queries,
  };
}
const input = {
  tenantId: "10000000-0000-4000-8000-000000000001",
  caseId: "10000000-0000-4000-8000-000000000002",
  actorId: "10000000-0000-4000-8000-000000000003",
  from: "awaiting_approval" as const,
  to: "approved" as const,
  changedAt: "2026-09-07T00:00:00Z",
  idempotencyKeyHash: "key",
  fingerprint: "fingerprint",
  desiredHash: "new-hash",
};
const current = {
  id: input.caseId,
  status: input.from,
  desired_version: 2,
  desired_hash: "old-hash",
};
describe("onboarding persistence", () => {
  it("advances resource desired coordinates with the canonical revision", async () => {
    const f = fixture([
      [current],
      [],
      [],
      [{ value: 3 }],
      [],
      [],
      [
        {
          ...current,
          status: "approved",
          desired_version: 3,
          desired_hash: input.desiredHash,
        },
      ],
    ]);
    try {
      expect(await f.repository.transition(input, f.transaction)).toMatchObject(
        { desiredVersion: 3, desiredHash: "new-hash" },
      );
      const update = f.queries.find((query) =>
        query.sql.startsWith("UPDATE onboarding.onboarding_case_resource"),
      )!;
      expect(update.parameters).toEqual([
        3,
        "new-hash",
        input.changedAt,
        input.actorId,
        input.tenantId,
        input.caseId,
      ]);
      expect(update.sql).toContain("WHERE tenant_id=");
      expect(update.sql).toContain("AND onboarding_case_id=");
      expect(update.sql).not.toContain("applied_version=");
    } finally {
      await f.db.destroy();
    }
  });
  it("does not change resources or append revisions on an idempotent retry", async () => {
    const f = fixture([
      [current],
      [
        {
          change_context: {
            idempotencyKeyHash: "key",
            fingerprint: "fingerprint",
          },
        },
      ],
    ]);
    try {
      expect(await f.repository.transition(input, f.transaction)).toMatchObject(
        { replayed: true },
      );
      expect(f.queries.every((query) => query.sql.startsWith("SELECT"))).toBe(
        true,
      );
    } finally {
      await f.db.destroy();
    }
  });
  it("rejects a stale version before mutating resources", async () => {
    const f = fixture([[current], []]);
    try {
      await expect(
        f.repository.transition(
          { ...input, expectedDesiredVersion: 1 },
          f.transaction,
        ),
      ).rejects.toThrow("ONBOARDING_DESIRED_VERSION_CONFLICT");
      expect(f.queries.every((query) => query.sql.startsWith("SELECT"))).toBe(
        true,
      );
    } finally {
      await f.db.destroy();
    }
  });
});
