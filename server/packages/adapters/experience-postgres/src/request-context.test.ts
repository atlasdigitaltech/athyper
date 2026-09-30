import { expect, it, vi } from "vitest";
import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from "kysely";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { KyselyExperiencePlaneRepository } from "./index.js";

const context = { tenantId: "tenant-a", principalId: "principal-a" } as VerifiedRequestContext;

it.each([undefined, { ...context, tenantId: "" }, { ...context, principalId: " " }])(
  "rejects missing actor context before invoking an injected runner",
  async (invalid) => {
    const runner = vi.fn();
    const repository = new KyselyExperiencePlaneRepository({} as Kysely<Record<string, never>>, runner);
    await expect(repository.readIdentity(invalid as VerifiedRequestContext, new Date())).rejects.toThrow("TRANSACTION_ACTOR_REQUIRED");
    expect(runner).not.toHaveBeenCalled();
  },
);

it.each([false, true])("stamps only new transactions, preserving existing actor scope (existing: %s)", async (existing) => {
  const queries: { sql: string; parameters: readonly unknown[] }[] = [];
  const database = new Kysely<Record<string, never>>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    log: (event) => { if (event.level === "query") queries.push(event.query); },
  });
  try {
    const read = async (db: Kysely<Record<string, never>>) => {
      await new KyselyExperiencePlaneRepository(db).readIdentity(context, new Date());
    };
    if (existing) await database.transaction().execute(read);
    else await read(database);
    if (existing) {
      expect(queries).toHaveLength(1);
      expect(queries[0]?.sql).not.toContain("set_config(");
    } else {
      expect(queries[0]?.sql).toContain("set_config('app.current_tenant_id'");
      expect(queries[0]?.parameters).toEqual([context.tenantId, context.principalId]);
      expect(queries.length).toBeGreaterThan(1);
    }
  } finally {
    await database.destroy();
  }
});
