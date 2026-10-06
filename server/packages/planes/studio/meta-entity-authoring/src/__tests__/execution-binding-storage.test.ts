import { Kysely, PostgresDialect } from "kysely";
import { expect, it, vi } from "vitest";
import { KyselyMetaEntityAuthoringRepository } from "../kysely-authoring-repository.js";

it("loads mapping children through their same-tenant parent change set", async () => {
  const query = vi.fn(async (text: string) => ({ rows: text.includes("e.entity_code,e.entity_class")
    ? [{ entity_code: "sample", entity_class: "reference", ownership_model: "system" }]
    : text.includes("entity_materialization_field_mapping t")
      ? [{ value: { id: "mapping", entity_materialization_binding_id: "binding", source_field_key: "code", target_field_key: "code", position: 0, required: true } }]
      : [] }));
  const db = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool: {
    connect: async () => ({ query, release() {} }), end: async () => {},
  } as never }) });
  try {
    const graph = await new KyselyMetaEntityAuthoringRepository(db).loadGraph("source-change-set");
    expect(graph.materializationFieldMappings).toEqual([{ id: "mapping", entityMaterializationBindingId: "binding", sourceFieldKey: "code", targetFieldKey: "code", position: 0, required: true }]);
    const call = query.mock.calls.find(([text]) => text.includes("entity_materialization_field_mapping t"))!;
    expect(call[0]).toContain("b.id=t.entity_materialization_binding_id");
    expect(call[0]).toContain("b.tenant_id IS NOT DISTINCT FROM t.tenant_id");
    expect(call[0]).toContain("b.change_set_id=$1::uuid");
    expect(call[0]).not.toContain("t.change_set_id");
  } finally { await db.destroy(); }
});
