import { Kysely, PostgresDialect } from "kysely";
import { expect, it } from "vitest";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import { KyselyMetaEntityAuthoringRepository } from "./kysely-authoring-repository.js";
import { validateGraph } from "./deterministic.js";

const graph = (requiresMfa?: boolean): MetaEntityGraph => ({
  contractSchema: "athyper.meta-entity-contract/2.1",
  entity: { entityCode: "fixture_reference" },
  runtimeProfiles: [
    {
      profileKey: "default",
      backingKind: "virtual",
      apiExposure: "catalog_only",
      readMode: "none",
      writeMode: "none",
    },
  ],
  fields: [],
  operations: [
    {
      id: "operation-a",
      operationKey: "read",
      operationKind: "read",
      label: "Read",
      auditEventCode: "fixture.read",
      ...(requiresMfa === undefined ? {} : { requiresMfa }),
    },
  ],
});
// SQL-adapter transaction simulation, not deployed RLS qualification.
function database(
  stored: boolean,
  options: { stale?: boolean; absent?: boolean } = {},
) {
  const statements: string[] = [];
  const inserts: Record<string, unknown>[] = [];
  let revision = 1;
  let savedRevision = 1;
  const tables = new Map<string, Record<string, unknown>[]>([
    [
      "entity_operation",
      options.absent
        ? []
        : [
            {
              id: "operation-a",
              operation_key: "read",
              operation_kind: "read",
              label: "Read",
              audit_event_code: "fixture.read",
              requires_mfa: stored,
            },
          ],
    ],
  ]);
  const saves = new Map<number, { graph: unknown; graph_hash: unknown }>();
  const query = async (statement: string, parameters: unknown[] = []) => {
    statements.push(statement);
    let rows: unknown[] = [];
    if (statement === "begin") savedRevision = revision;
    else if (statement === "rollback") revision = savedRevision;
    else if (statement.includes("fn_advance_entity_change_set")) {
      if (options.stale) throw Object.assign(Error("stale"), { code: "40001" });
      revision++;
      rows = [{ revision }];
    } else if (statement.includes("SELECT o.id,o.requires_mfa"))
      rows = tables.get("entity_operation") ?? [];
    else if (statement.includes("SELECT e.entity_code,e.entity_class"))
      rows = [
        {
          entity_code: "fixture_reference",
          entity_class: "reference",
          ownership_model: "system",
        },
      ];
    else if (statement.includes("SELECT cs.*"))
      rows = [
        {
          id: "draft",
          tenant_id: null,
          entity_id: "entity",
          entity_code: "fixture_reference",
          branch_code: "main",
          status: "draft",
          lock_version: revision,
          created_by: "author",
        },
      ];
    else if (statement.includes("SELECT tenant_id,entity_id"))
      rows = [{ tenant_id: null, entity_id: "entity" }];
    else if (statement.includes("INSERT INTO snapshot.entity_draft_save"))
      saves.set(Number(parameters[1]), {
        graph: JSON.parse(String(parameters[3])),
        graph_hash: parameters[4],
      });
    else if (statement.includes("SELECT graph, graph_hash"))
      rows = [saves.get(Number(parameters[1]))!];
    else {
      const insert = statement.match(
        /INSERT INTO "metadata"\."([^"]+)" \(([^)]+)\)/,
      );
      const select = statement.match(/FROM "metadata"\."([^"]+)"/);
      if (insert) {
        const columns = insert[2]!.split(",").map((column) => column.trim().replaceAll('"', ''));
        const row = Object.fromEntries(
          columns.map((column, i) => [column, parameters[i]]),
        );
        tables.set(insert[1]!, [...(tables.get(insert[1]!) ?? []), row]);
        if (insert[1] === "entity_operation") inserts.push(row);
      } else if (statement.startsWith("DELETE FROM") && select)
        tables.set(select[1]!, []);
      else if (statement.includes("SELECT to_jsonb") && select)
        rows = (tables.get(select[1]!) ?? []).map((value) => ({ value }));
    }
    return { rows };
  };
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({ query, release() {} }),
        end: async () => {},
      } as never,
    }),
  });
  return { db, statements, inserts, saves, revision: () => revision };
}
it.each([true, false])(
  "preserves the stored %s without rewriting the operation when input omits it",
  async (value) => {
    const f = database(value);
    const candidate = graph();
    expect(validateGraph(candidate).issues).toEqual([]);
    try {
      await new KyselyMetaEntityAuthoringRepository(f.db).replaceGraph({
        changeSetId: "draft",
        expectedRevision: 1,
        actorId: "author",
        graph: candidate,
      });
      expect(f.inserts).toHaveLength(0);
      expect(
        (f.saves.get(2)?.graph as MetaEntityGraph).operations[0]?.requiresMfa,
      ).toBe(value);
      const locked = f.statements.findIndex((s) =>
        s.includes("FOR UPDATE") && s.includes("SELECT cs.*"),
      );
      const checked = f.statements.findIndex((s) =>
        s.includes("SELECT o.id,o.requires_mfa"),
      );
      const mutated = f.statements.findIndex(s => s.includes("INSERT INTO "));
      expect(locked).toBeLessThan(checked);
      expect(checked).toBeLessThan(mutated);
      expect(f.statements.some(s => s.startsWith("DELETE FROM"))).toBe(false);
      expect(
        f.statements.at(-2) === "commit" || f.statements.includes("commit"),
      ).toBe(true);
    } finally {
      await f.db.destroy();
    }
  },
);
it.each([true, false])(
  "rejects changing stored %s before any deletion/snapshot and rolls back revision",
  async (value) => {
    const f = database(value);
    try {
      await expect(
        new KyselyMetaEntityAuthoringRepository(f.db).replaceGraph({
          changeSetId: "draft",
          expectedRevision: 1,
          actorId: "author",
          graph: graph(!value),
        }),
      ).rejects.toMatchObject({
        code: "OPERATION_PROTECTED_STATE_CHANGE_FORBIDDEN",
      });
      expect(f.statements).toContain("rollback");
      expect(f.revision()).toBe(1);
      expect(f.statements.some((s) => s.startsWith("DELETE FROM"))).toBe(false);
      expect(f.inserts).toEqual([]);
      expect(f.saves.size).toBe(0);
    } finally {
      await f.db.destroy();
    }
  },
);
it("blocks initialization and stale saves without writing members", async () => {
  for (const options of [{ absent: true }, { stale: true }]) {
    const f = database(false, options);
    try {
      await expect(
        new KyselyMetaEntityAuthoringRepository(f.db).replaceGraph({
          changeSetId: "draft",
          expectedRevision: 1,
          actorId: "author",
          graph: graph(false),
        }),
      ).rejects.toMatchObject({
        code: options.stale
          ? "AUTHORING_REVISION_CONFLICT"
          : "OPERATION_PROTECTED_SOURCE_REQUIRED",
      });
      expect(f.statements).toContain("rollback");
      expect(f.inserts).toEqual([]);
      expect(f.revision()).toBe(1);
    } finally {
      await f.db.destroy();
    }
  }
});

it("keeps no-op saves at the same revision without additional snapshots or member writes", async () => {
  const f = database(true);
  try {
    const repository = new KyselyMetaEntityAuthoringRepository(f.db);
    await repository.replaceGraph({ changeSetId: "draft", expectedRevision: 1, actorId: "author", graph: graph() });
    const saved = await repository.loadGraph("draft");
    const before = f.statements.length;
    const snapshotCount = f.saves.size;
    const result = await repository.replaceGraph({ changeSetId: "draft", expectedRevision: 2, actorId: "author", graph: saved });
    expect(result.revision).toBe(2);
    expect(f.saves.size).toBe(snapshotCount);
    expect(f.statements.slice(before).some(s => /^(INSERT|UPDATE|DELETE)/.test(s) || s.includes("fn_advance_entity_change_set"))).toBe(false);
    await expect(repository.replaceGraph({ changeSetId: "draft", expectedRevision: 1, actorId: "author", graph: saved })).rejects.toMatchObject({ code: "AUTHORING_REVISION_CONFLICT" });
  } finally { await f.db.destroy(); }
});
