import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, type Dialect } from "kysely";
import { describe, expect, it } from "vitest";
import { KyselyRuntimeCommandStore } from "./kysely-runtime-command-store.js";

describe("KyselyRuntimeCommandStore", () => {
  it("targets only append-only ops ledgers with bounded tenant reads", async () => {
    const queries: string[] = [];
    const db = new Kysely<Record<string, never>>({
      dialect: dummyDialect(),
      log: (event) => { queries.push(event.query.sql); },
    });
    const store = new KyselyRuntimeCommandStore(db);
    await expect(store.listHistory({
      tenantId: "00000000-0000-4000-8000-000000000001",
      limit: 25,
    })).resolves.toEqual([]);
    await store.health();
    const sql = queries.join("\n");
    expect(sql).toContain("ops.control_runtime_command_history");
    expect(sql).toMatch(/where tenant_id=\$1::uuid/i);
    expect(sql).toMatch(/order by sequence_no desc limit \$2/i);
    expect(sql).not.toMatch(/\bupdate\b|\bdelete\b/i);
    await db.destroy();
  });
});

function dummyDialect(): Dialect {
  return {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  };
}
