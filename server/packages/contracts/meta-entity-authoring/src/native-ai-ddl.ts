import { nativeAiMembers } from "./native-ai-contract.js";
import { contractColumnCheck } from "./reference-member-ddl.js";
/** Canonical target DDL only. No backfill, policy grants, activation or rewrite
 * of applied migrations. Forced RLS starts with no allowed application writes. */
export function nativeAiDdl(): string {
  const sql = [
    "-- GENERATED from contracts/meta-entity-authoring/native-ai-contract.ts; NOT a cutover migration.",
    "-- Scoped anchors required by AI search/relation references; existing field/operation anchors are installed by the reference contract.",
    "ALTER TABLE metadata.entity_search_profile ADD CONSTRAINT entity_search_profile_draft_id_uq UNIQUE(change_set_id,id);",
    "ALTER TABLE metadata.entity_relation ADD CONSTRAINT entity_relation_draft_id_uq UNIQUE(change_set_id,id);",
    `CREATE FUNCTION metadata.fn_native_ai_text_array_valid(values_ text[], maximum_length integer) RETURNS boolean LANGUAGE sql IMMUTABLE STRICT AS $$ SELECT (cardinality(values_)=0 OR (array_ndims(values_)=1 AND array_lower(values_,1)=1)) AND cardinality(values_)=(SELECT count(DISTINCT v) FROM unnest(values_) AS v) AND NOT EXISTS(SELECT 1 FROM unnest(values_) AS v WHERE v IS NULL OR length(v)<1 OR length(v)>maximum_length) $$;`,
  ];
  for (const d of Object.values(nativeAiMembers)) {
    const columns = Object.values(d.columns).map((c) => {
      let check =
        c.sqlType === "uuid" ? "true" : contractColumnCheck(c.node, c.column);
      if (c.sqlType.endsWith("[]"))
        check = `CASE WHEN cardinality(${c.column})=0 OR (array_ndims(${c.column})=1 AND array_lower(${c.column},1)=1) THEN (${check}) ELSE false END`;
      return `${c.column} ${c.sqlType}${c.nullable ? "" : " NOT NULL"} CHECK((${check}) IS TRUE)`;
    });
    const unique = d.unique.map(
      (keys, i) =>
        `CONSTRAINT ${d.table}_logical_${i}_uq UNIQUE NULLS NOT DISTINCT (change_set_id${keys.length ? "," + keys.join(",") : ""}) DEFERRABLE INITIALLY IMMEDIATE`,
    );
    sql.push(`CREATE TABLE metadata.${d.table} (
 id uuid PRIMARY KEY DEFAULT shared.uuidv7(),tenant_id uuid,entity_id uuid NOT NULL,change_set_id uuid NOT NULL REFERENCES metadata.entity_change_set(id) ON DELETE RESTRICT,
 ${columns.join(",\n ")},
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),created_by uuid NOT NULL,updated_at timestamptz,updated_by uuid,
 CONSTRAINT ${d.table}_draft_id_uq UNIQUE(change_set_id,id),
 ${unique.join(",\n ")}${d.checks.length ? ",\n " + d.checks.map((c) => `CHECK((${c}) IS TRUE)`).join(",\n ") : ""},
 CHECK((updated_at IS NULL)=(updated_by IS NULL))
);`);
  }
  for (const d of Object.values(nativeAiMembers)) {
    for (const c of Object.values(d.columns))
      if ("reference" in c && c.reference)
        sql.push(
          `ALTER TABLE metadata.${d.table} ADD CONSTRAINT ${d.table}_${c.column}_fk FOREIGN KEY(change_set_id,${c.column}) REFERENCES metadata.${c.reference}(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;\nCREATE INDEX ON metadata.${d.table}(change_set_id,${c.column});`,
        );
    sql.push(
      `CREATE TRIGGER graph_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.${d.table} FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row();\nALTER TABLE metadata.${d.table} ENABLE ROW LEVEL SECURITY;\nALTER TABLE metadata.${d.table} FORCE ROW LEVEL SECURITY;`,
    );
  }
  return sql.join("\n\n") + "\n";
}
