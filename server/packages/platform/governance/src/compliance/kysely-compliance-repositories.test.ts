import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from "kysely";
import { describe, expect, it } from "vitest";
import { KyselyLegalHoldRepository } from "./kysely-compliance-repositories.js";

describe("legal-hold transaction boundaries", () => {
  it("locks the tenant hold before work, uses that transaction for release, and rolls back failures", async () => {
    const queries: { sql: string; parameters: readonly unknown[] }[] = [];
    const db = new Kysely<Record<string, never>>({
      dialect: {
        createAdapter: () => new PostgresAdapter(),
        createDriver: () => new DummyDriver(),
        createIntrospector: (db) => new PostgresIntrospector(db),
        createQueryCompiler: () => new PostgresQueryCompiler(),
      },
      log: (event) => {
        queries.push(event.query);
      },
    });
    const repository = new KyselyLegalHoldRepository(db);
    try {
      await expect(
        repository.withHoldLock("tenant", "hold", async (locked) => {
          expect(queries[0]?.sql).toMatch(
            /WHERE tenant_id=.*AND id=.*FOR UPDATE/,
          );
          expect(queries[0]?.parameters).toEqual(["tenant", "hold"]);
          await locked.get("tenant", "hold");
          // Calling transaction() again on a Kysely Transaction throws.
          await locked.release(
            "tenant",
            "hold",
            "principal",
            "2026-09-01T00:00:00Z",
          );
          throw new Error("adapter failed");
        }),
      ).rejects.toThrow("adapter failed");
      expect(
        queries.some((query) => query.sql.includes("status='released'")),
      ).toBe(true);
    } finally {
      await db.destroy();
    }
  });
});
