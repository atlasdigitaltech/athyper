import { type ContractNode } from "./foundation-contract.js";
import {
  referenceMembers,
  referencePredicateOwners,
} from "./reference-member-contract.js";
const literal = (v: string) => `'${v.replaceAll("'", "''")}'`;
export function contractColumnCheck(
  node: ContractNode,
  column: string,
): string {
  if ("anyOf" in node)
    return (
      "(" +
      node.anyOf.map((n) => contractColumnCheck(n, column)).join(" OR ") +
      ")"
    );
  if ("const" in node) return `${column}=${literal(node.const)}`;
  if (node.type === "null") return `${column} IS NULL`;
  if (node.type === "integer")
    return `${column} BETWEEN ${node.minimum} AND ${node.maximum}`;
  if (node.type === "string")
    return (
      [
        node.minLength !== undefined
          ? `length(${column})>=${node.minLength}`
          : "",
        node.maxLength !== undefined
          ? `length(${column})<=${node.maxLength}`
          : "",
        node.pattern ? `${column} ~ ${literal(node.pattern)}` : "",
      ]
        .filter(Boolean)
        .join(" AND ") || "true"
    );
  if (node.type === "array") {
    const items = node.items;
    const values =
      "anyOf" in items && items.anyOf.every((i) => "const" in i)
        ? items.anyOf.map((i) => literal((i as { const: string }).const))
        : null;
    return (
      `array_position(${column},NULL) IS NULL` +
      (values ? ` AND ${column}<@ARRAY[${values.join(",")}]::text[]` : "")
    );
  }
  if (node.type === "boolean") return "true";
  throw Error("REFERENCE_DDL_NODE_UNSUPPORTED");
}
/** Generated structural SQL; custom graph guards live in the reviewed canonical
 * validation file, independently checksum-pinned. No source-data backfill. */
export function referenceMemberDdl(): string {
  const existing = [
    "entity_field",
    "entity_surface",
    "entity_operation",
    "entity_surface_field_binding",
    "entity_surface_operation",
    "entity_surface_section",
  ];
  const sql = existing.map(
    (table) =>
      `ALTER TABLE metadata.${table} ADD CONSTRAINT ${table}_draft_id_uq UNIQUE(change_set_id,id);`,
  );
  sql.push(
    `ALTER TABLE metadata.entity_change_set ADD COLUMN reference_contract_version integer CHECK(reference_contract_version=1);`,
  );
  const members = Object.values(referenceMembers);
  for (const descriptor of members) {
    const columns = Object.values(descriptor.columns).map(
      (c) =>
        `${c.column} ${c.sqlType}${c.nullable ? "" : " NOT NULL"} CHECK(${contractColumnCheck(c.sqlType === "text" || c.sqlType === "integer" || c.sqlType.endsWith("[]") ? c.node : c.nullable ? { anyOf: [{ type: "null" }, { type: "boolean" }] } : { type: "boolean" }, c.column)})`,
    );
    const uniques = descriptor.unique.map(
      (keys, i) =>
        `CONSTRAINT ${descriptor.table}_logical_${i}_uq UNIQUE ${descriptor.table === "entity_surface_view_field" && keys.some((k) => k === "visible_position" || k === "sort_position") ? "" : "NULLS NOT DISTINCT "}(change_set_id,${keys.join(",")}) DEFERRABLE INITIALLY IMMEDIATE`,
    );
    sql.push(
      `CREATE TABLE metadata.${descriptor.table} (\n id uuid PRIMARY KEY DEFAULT shared.uuidv7(), tenant_id uuid, entity_id uuid NOT NULL, change_set_id uuid NOT NULL REFERENCES metadata.entity_change_set(id) ON DELETE RESTRICT,\n ${columns.join(",\n ")},\n created_at timestamptz NOT NULL DEFAULT clock_timestamp(),created_by uuid NOT NULL,updated_at timestamptz,updated_by uuid,\n CONSTRAINT ${descriptor.table}_draft_id_uq UNIQUE(change_set_id,id),\n ${uniques.join(",\n ")}${descriptor.checks.length ? ",\n " + descriptor.checks.map((c) => `CHECK(${c})`).join(",\n ") : ""},\n CHECK((updated_at IS NULL)=(updated_by IS NULL))\n);`,
    );
  }
  for (const descriptor of members) {
    for (const c of Object.values(descriptor.columns))
      if (c.reference)
        sql.push(
          `ALTER TABLE metadata.${descriptor.table} ADD CONSTRAINT ${descriptor.table}_${c.column}_fk FOREIGN KEY(change_set_id,${c.column}) REFERENCES metadata.${c.reference}(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;\nCREATE INDEX ON metadata.${descriptor.table}(change_set_id,${c.column});`,
        );
    sql.push(
      `CREATE TRIGGER graph_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.${descriptor.table} FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row(${Object.values(
        descriptor.columns,
      )
        .filter((c) => c.immutable)
        .map((c) => literal(c.column))
        .join(",")});`,
    );
    sql.push(
      `ALTER TABLE metadata.${descriptor.table} ENABLE ROW LEVEL SECURITY; ALTER TABLE metadata.${descriptor.table} FORCE ROW LEVEL SECURITY;`,
    );
  }
  sql.push(
    `CREATE UNIQUE INDEX entity_surface_view_default_uq ON metadata.entity_surface_view(change_set_id,entity_surface_id) WHERE view_kind='default';\nCREATE UNIQUE INDEX entity_surface_view_field_group_uq ON metadata.entity_surface_view_field(change_set_id,view_id) WHERE grouped;`,
  );
  for (const p of referencePredicateOwners) {
    const c = referenceMembers.predicate.columns[p].column;
    sql.push(
      `CREATE UNIQUE INDEX entity_predicate_root_${c}_uq ON metadata.entity_predicate(change_set_id,purpose,${c}) WHERE parent_predicate_id IS NULL AND ${c} IS NOT NULL;`,
    );
  }
  const tables = members.map((d) => literal(d.table)).join(",");
  sql.push(`DO $$ DECLARE t text; BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN FOREACH t IN ARRAY ARRAY[${tables}] LOOP
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON metadata.%I TO athyperapp',t);
 EXECUTE format('CREATE POLICY tenant_read ON metadata.%I FOR SELECT TO athyperapp USING(tenant_id=shared.current_tenant_id_soft())',t);
 EXECUTE format('CREATE POLICY tenant_insert ON metadata.%I FOR INSERT TO athyperapp WITH CHECK(tenant_id=shared.current_tenant_id() AND created_by=master.current_principal_id_soft())',t);
 EXECUTE format('CREATE POLICY tenant_update ON metadata.%I FOR UPDATE TO athyperapp USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id() AND updated_by=master.current_principal_id_soft())',t);
 EXECUTE format('CREATE POLICY tenant_delete ON metadata.%I FOR DELETE TO athyperapp USING(tenant_id=shared.current_tenant_id_soft())',t);
 END LOOP; END IF; END $$;`);
  return (
    "-- GENERATED from contracts/meta-entity-authoring/reference-member-contract.ts\n" +
    sql.join("\n\n") +
    "\n"
  );
}
