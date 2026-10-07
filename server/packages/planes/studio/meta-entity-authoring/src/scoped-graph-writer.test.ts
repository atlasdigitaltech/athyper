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
function fixture(
  rows: Record<string, StoredRow[]> = {},
  denied = false,
  nativeOrder = false,
  constraints: string[] = [],
) {
  const query = vi.fn(async (statement: string, parameters: unknown[]) => {
    if (
      constraints.length &&
      statement.includes("SELECT conname,condeferrable")
    )
      return {
        rows: constraints.map((conname) => ({ conname, condeferrable: true })),
      };
    if (nativeOrder && statement.includes("SELECT conname,condeferrable"))
      return {
        rows: [
          { conname: "entity_ai_field_logical_1_uq", condeferrable: true },
        ],
      };
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

it("applies native AI ordering edits with scoped updates and the actual generated deferrable constraint", async () => {
  const f = fixture({}, false, true);
  try {
    await writeReconciliationPlans(
      f.db,
      [
        {
          table: "entity_ai_field",
          insert: [],
          remove: [],
          update: [
            {
              id: "first",
              before: { id: "first", position: 1 },
              values: { position: 2 },
            },
            {
              id: "second",
              before: { id: "second", position: 2 },
              values: { position: 1 },
            },
          ],
        },
      ],
      { ...c, tenant_id: null },
    );
    const statements = f.query.mock.calls.map(([statement]) => statement);
    expect(
      statements.filter((s) => s.startsWith("SET CONSTRAINTS")),
    ).toHaveLength(2);
    expect(statements[1]).toContain(
      '"metadata"."entity_ai_field_logical_1_uq" DEFERRED',
    );
    expect(statements.at(-1)).toContain("IMMEDIATE");
    for (const s of statements.filter((s) => s.startsWith("UPDATE"))) {
      expect(s).toContain('"metadata"."entity_ai_field"');
      expect(s).toContain("tenant_id IS NOT DISTINCT FROM");
      expect(s).toContain("change_set_id=");
      expect(s).toContain("entity_id=");
      expect(s).not.toContain("created_at=");
      expect(s).not.toContain("created_by=");
    }
    expect(statements.some((s) => /^(DELETE|INSERT)/.test(s))).toBe(false);
  } finally {
    await f.db.destroy();
  }
});
it("rejects native AI order edits before DML when the installed constraint cannot defer", async () => {
  const f = fixture();
  try {
    await expect(
      writeReconciliationPlans(
        f.db,
        [
          {
            table: "entity_ai_field",
            insert: [],
            remove: [],
            update: [
              { id: "first", before: { position: 1 }, values: { position: 2 } },
            ],
          },
        ],
        c,
      ),
    ).rejects.toMatchObject({ code: "AUTHORING_ORDER_MIGRATION_REQUIRED" });
    expect(
      f.query.mock.calls.some(([s]) => /^(UPDATE|INSERT|DELETE)/.test(s)),
    ).toBe(false);
  } finally {
    await f.db.destroy();
  }
});

it("writes registered SQL arrays as arrays while preserving JSONB declarations", async () => {
  const f = fixture();
  await writeReconciliationPlans(
    f.db,
    [
      {
        table: "entity_ai_profile",
        insert: [
          { id: "p", values: { context_kinds: ["record"], aliases: [] } },
        ],
        update: [],
        remove: [],
      },
      {
        table: "entity_surface",
        insert: [],
        update: [
          {
            id: "s",
            before: {},
            values: {
              allowed_page_sizes: [10, 25],
              layout_config: { supportedModes: ["table"] },
            },
          },
        ],
        remove: [],
      },
    ],
    c,
  );
  const writes = f.query.mock.calls.filter(([text]) =>
    /^(INSERT|UPDATE)/.test(text),
  );
  expect(writes[0]![0]).toContain("ARRAY[$1]::text[]");
  expect(writes[0]![0]).toContain("ARRAY[]::text[]");
  expect(writes[1]![0]).toContain("::integer[]");
  expect(writes[1]![0]).toContain("::jsonb");
  await f.db.destroy();
});

it.each(["navigation_group_id", "entity_surface_id"])(
  "defers both section guards for %s moves",
  async (key) => {
    const f = fixture({}, false, false, [
      "entity_surface_section_position_uq",
      "legacy_section_position_guard",
    ]);
    try {
      await writeReconciliationPlans(
        f.db,
        [
          {
            table: "entity_surface_section",
            insert: [],
            remove: [],
            update: [
              {
                id: "section",
                before: { id: "section" },
                values: { [key]: "destination" },
              },
            ],
          },
        ],
        c,
      );
      const statements = f.query.mock.calls
        .map(([statement]) => statement)
        .filter((s) => s.startsWith("SET CONSTRAINTS"));
      expect(statements).toHaveLength(2);
      expect(statements[0]).toContain(
        '"metadata"."legacy_section_position_guard" DEFERRED',
      );
      expect(statements[1]).toContain(
        '"metadata"."legacy_section_position_guard" IMMEDIATE',
      );
    } finally {
      await f.db.destroy();
    }
  },
);
