import { Kysely, PostgresDialect } from "kysely";
import { expect, it, vi } from "vitest";
import {
  readReconciliationPlans,
  writeReconciliationPlans,
} from "./scoped-graph-writer.js";
import type { StoredRow } from "./graph-reconciliation.js";
const c = {
  tenant_id: "tenant",
  entity_id: "entity",
  change_set_id: "draft",
  created_by: "author",
};
function fixture(rows: Record<string, StoredRow[]> = {}, denied = false) {
  const query = vi.fn(async (statement: string, parameters: unknown[]) => {
    if (statement.includes("SELECT to_jsonb")) {
      const table = /FROM (?:"metadata"\."|metadata\.)(\w+)/.exec(
        statement,
      )?.[1];
      return { rows: (rows[table ?? ""] ?? []).map((value) => ({ value })) };
    }
    if (/^(UPDATE|INSERT|DELETE)/.test(statement)) {
      if (denied) throw Error("permission denied");
      return { rows: [{ id: parameters[0] }] };
    }
    return { rows: [] };
  });
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({ query, release() {} }),
        end: async () => {},
      } as never,
    }),
  });
  return { db, query };
}
it("does not request write privileges for unchanged or omitted execution families", async () => {
  const f = fixture(
    {
      entity_change_case_binding: [
        { id: "case", entity_operation_id: "op", binding_key: "case" },
      ],
    },
    true,
  );
  try {
    const plans = await readReconciliationPlans(f.db, "draft", [
      ["entity_change_case_binding", undefined],
      ["entity_materialization_binding", []],
      ["entity_materialization_field_mapping", []],
    ]);
    await writeReconciliationPlans(f.db, plans, c);
    expect(f.query.mock.calls).toHaveLength(3);
    for (const [statement] of f.query.mock.calls) {
      expect(statement).toContain("SELECT to_jsonb");
      expect(statement).not.toContain("FOR UPDATE");
    }
  } finally {
    await f.db.destroy();
  }
});
it("retains denial of an explicitly removed execution binding", async () => {
  const f = fixture(
    {
      entity_change_case_binding: [
        { id: "case", entity_operation_id: "op", binding_key: "case" },
      ],
    },
    true,
  );
  try {
    const plans = await readReconciliationPlans(f.db, "draft", [
      ["entity_change_case_binding", []],
    ]);
    await expect(writeReconciliationPlans(f.db, plans, c)).rejects.toThrow(
      "permission denied",
    );
  } finally {
    await f.db.destroy();
  }
});
it("deletes selected mapping identities before selected parents with NULL-safe scope", async () => {
  const f = fixture({
    entity_materialization_binding: [{ id: "parent", binding_key: "bind" }],
    entity_materialization_field_mapping: [
      {
        id: "child",
        entity_materialization_binding_id: "parent",
        source_field_key: "code",
      },
    ],
  });
  try {
    const plans = await readReconciliationPlans(f.db, "draft", [
      ["entity_materialization_binding", []],
      ["entity_materialization_field_mapping", []],
    ]);
    await writeReconciliationPlans(f.db, plans, c);
    const deletes = f.query.mock.calls.filter(([statement]) =>
      statement.startsWith("DELETE"),
    );
    expect(deletes).toHaveLength(2);
    expect(deletes[0]![0]).toContain('"entity_materialization_field_mapping"');
    expect(deletes[1]![0]).toContain('"entity_materialization_binding"');
    for (const [statement, parameters] of deletes) {
      expect(statement).toContain("WHERE id=");
      expect(statement).toContain("tenant_id IS NOT DISTINCT FROM");
      expect(parameters).toContain("draft");
      expect(parameters).toContain("entity");
    }
  } finally {
    await f.db.destroy();
  }
});
it("does not update creation evidence or unchanged JSONB when changing a scalar", async () => {
  const f = fixture({
    entity_surface: [
      {
        id: "surface",
        surface_key: "main",
        title: "Old",
        layout_config: { nested: { preserved: true } },
        created_by: "original",
      },
    ],
  });
  try {
    const plans = await readReconciliationPlans(f.db, "draft", [
      ["entity_surface", [{ id: "surface", surfaceKey: "main", title: "New" }]],
    ]);
    await writeReconciliationPlans(f.db, plans, c);
    const writes = f.query.mock.calls.filter(([statement]) =>
      /^(UPDATE|INSERT|DELETE)/.test(statement),
    );
    expect(writes).toHaveLength(1);
    const statement = writes[0]![0];
    expect(statement).toContain('"title"=');
    expect(statement).toContain("updated_by=");
    expect(statement).not.toContain("created_by");
    expect(statement).not.toContain("layout_config");
  } finally {
    await f.db.destroy();
  }
});
it("rejects an ordered update when the forward migration is unavailable", async () => {
  const f = fixture({
    entity_search_field: [
      {
        id: "member",
        entity_search_profile_id: "profile",
        entity_field_id: "field",
        position: 1,
      },
    ],
  });
  try {
    const plans = await readReconciliationPlans(f.db, "draft", [
      [
        "entity_search_field",
        [
          {
            id: "member",
            entitySearchProfileId: "profile",
            entityFieldId: "field",
            position: 2,
          },
        ],
      ],
    ]);
    await expect(
      writeReconciliationPlans(f.db, plans, c),
    ).rejects.toMatchObject({ code: "AUTHORING_ORDER_MIGRATION_REQUIRED" });
    expect(
      f.query.mock.calls.some(([statement]) =>
        /^(UPDATE|INSERT|DELETE)/.test(statement),
      ),
    ).toBe(false);
  } finally {
    await f.db.destroy();
  }
});
