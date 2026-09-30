import { Kysely, PostgresDialect } from "kysely";
import { expect, it, vi } from "vitest";
import { clearExecutionBindings } from "./execution-binding-replacement.js";

function fixture(present: boolean, denied = false) {
  const query = vi.fn(async (statement: string) => {
    if (denied && statement.startsWith("DELETE"))
      throw Error("permission denied");
    return { rows: [{ present }] };
  });
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({ query, release: () => {} }),
        end: async () => {},
      } as never,
    }),
  });
  return { db, query };
}
it("saves empty configuration branches without execution-table write privileges", async () => {
  const f = fixture(false, true);
  try {
    await clearExecutionBindings(f.db, "draft");
    expect(f.query).toHaveBeenCalledTimes(5);
    for (const [statement, values] of f.query.mock.calls as unknown as [
      string,
      unknown[],
    ][]) {
      expect(statement).toContain("SELECT EXISTS");
      expect(statement).toContain("change_set_id=");
      expect(values).toEqual(["draft"]);
    }
  } finally {
    await f.db.destroy();
  }
});
it("does not bypass a denied mutation of existing execution bindings", async () => {
  const f = fixture(true, true);
  try {
    await expect(clearExecutionBindings(f.db, "draft")).rejects.toThrow(
      "permission denied",
    );
  } finally {
    await f.db.destroy();
  }
});
it("deletes existing mapping rows before their parent bindings", async () => {
  const f = fixture(true);
  try {
    await clearExecutionBindings(f.db, "draft");
    const deletes = f.query.mock.calls
      .map(([statement]) => statement)
      .filter((statement) => statement.startsWith("DELETE"));
    expect(deletes).toHaveLength(5);
    expect(deletes[0]).toContain("entity_materialization_field_mapping");
    expect(deletes[4]).toContain("entity_materialization_binding");
  } finally {
    await f.db.destroy();
  }
});
