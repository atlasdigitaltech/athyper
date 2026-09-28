import { Kysely, PostgresDialect } from "kysely";
import { expect, it, vi } from "vitest";
import { KyselyMetaEntityAuthoringRepository } from "../kysely-authoring-repository.js";
import { readFileSync } from "node:fs";
import ts from "typescript";

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

it("replacement removes governance bindings before their operation/field parents", () => {
  const source = readFileSync(new URL("../kysely-authoring-repository.ts", import.meta.url), "utf8");
  const ast = ts.createSourceFile("repository.ts", source, ts.ScriptTarget.Latest, true);
  const replacements: string[][] = [];
  function visit(node: ts.Node) {
    if (ts.isForOfStatement(node) && node.statement.getText(ast).includes("DELETE FROM")) {
      const values: string[] = [];
      function strings(child: ts.Node) {
        if (ts.isStringLiteral(child)) values.push(child.text);
        child.forEachChild(strings);
      }
      strings(node.expression); replacements.push(values);
    }
    node.forEachChild(visit);
  }
  visit(ast);
  const tables = replacements.find(values => values.includes("entity_operation"))!;
  expect(tables).toBeDefined();
  for (const table of ["entity_change_case_binding", "entity_operation_context_requirement", "entity_field_reference_binding", "entity_materialization_binding", "entity_lifecycle_binding"]) {
    expect(tables).toContain(table);
    expect(tables.indexOf(table)).toBeLessThan(tables.indexOf("entity_operation"));
    expect(tables.indexOf(table)).toBeLessThan(tables.indexOf("entity_field"));
  }
  expect(source.indexOf("DELETE FROM metadata.entity_materialization_field_mapping")).toBeLessThan(source.indexOf('"entity_materialization_binding",', source.indexOf("// Mapping rows")));
});
