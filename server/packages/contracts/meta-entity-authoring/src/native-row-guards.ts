import type { ContractNode } from "./foundation-contract.js";
import { normalizedCoreMembers } from "./normalized-core-contract.js";
import { normalizedLayoutMembers } from "./normalized-layout-contract.js";
import { nativeOperationMember } from "./native-operation-contract.js";
import { nativeRetiredColumns } from "./native-storage-transition.js";

const literal = (s: string) => "'" + s.replaceAll("'", "''") + "'";
const identifier = (s: string) => '"' + s.replaceAll('"', '""') + '"';

/** SQL predicates for physical typed columns, not JSON coercion. Every branch
 * returns a boolean: PostgreSQL CHECK's acceptance of UNKNOWN cannot admit a
 * missing required value. Unsupported node/type combinations reject generation. */
export function nativeColumnPredicate(
  node: ContractNode,
  column: string,
  sqlType: string,
  depth = 0,
): string {
  if ("anyOf" in node)
    return (
      "(" +
      node.anyOf
        .map((n) => nativeColumnPredicate(n, column, sqlType, depth))
        .join(" OR ") +
      ")"
    );
  if ("const" in node)
    return `(${column}::text = ${literal(node.const)}) IS TRUE`;
  if (node.type === "null") return `${column} IS NULL`;
  const required = (expression: string) =>
    `(${column} IS NOT NULL AND (${expression})) IS TRUE`;
  if (node.type === "boolean") {
    if (sqlType !== "boolean") throw Error("NATIVE_GUARD_BOOLEAN_TYPE");
    return `${column} IS NOT NULL`;
  }
  if (node.type === "integer") {
    if (!["integer", "smallint", "bigint"].includes(sqlType))
      throw Error("NATIVE_GUARD_INTEGER_TYPE");
    return required(`${column} BETWEEN ${node.minimum} AND ${node.maximum}`);
  }
  if (node.type === "array") {
    if (!sqlType.endsWith("[]")) throw Error("NATIVE_GUARD_ARRAY_TYPE");
    const item = `native_item_${depth}`;
    return required(
      [
        `coalesce(array_ndims(${column}),1)=1`,
        `coalesce(array_lower(${column},1),1)=1`,
        ...(node.minItems === undefined
          ? []
          : [`cardinality(${column})>=${node.minItems}`]),
        `NOT EXISTS (SELECT 1 FROM unnest(${column}) AS ${item}(value) WHERE NOT (${nativeColumnPredicate(node.items, `${item}.value`, sqlType.slice(0, -2), depth + 1)}))`,
      ].join(" AND "),
    );
  }
  if (node.type === "string") {
    if (sqlType.endsWith("[]") || sqlType === "jsonb" || sqlType === "boolean")
      throw Error("NATIVE_GUARD_STRING_TYPE");
    // Match the codec's UTC representation independently of session TimeZone.
    const value =
      sqlType === "timestamptz"
        ? `to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
        : sqlType === "date"
          ? `to_char(${column},'YYYY-MM-DD')`
          : `${column}::text`;
    return required(
      [
        ...(node.minLength === undefined
          ? []
          : [`length(${value})>=${node.minLength}`]),
        ...(node.maxLength === undefined
          ? []
          : [`length(${value})<=${node.maxLength}`]),
        ...(node.pattern === undefined
          ? []
          : [`${value} ~ ${literal(node.pattern)}`]),
      ].join(" AND ") || "true",
    );
  }
  throw Error("NATIVE_GUARD_NODE_UNSUPPORTED");
}

export const nativeGuardMembers = [
  ...Object.values(normalizedCoreMembers),
  ...Object.values(normalizedLayoutMembers),
  nativeOperationMember,
];

/** Structural component of final native validation. It does not replace graph
 * semantics, resource qualification, deferred final-state enforcement or the
 * two complete-contract admission functions. Installing this alone cannot
 * enable native authoring. No grants, marker edits or constraint removal. */
export function nativeRowGuardsDdl(): string {
  const checks: string[] = [];
  for (const member of nativeGuardMembers) {
    const table = identifier(member.table);
    const rules = [
      `r.entity_id IS NOT DISTINCT FROM root.entity_id`,
      `r.tenant_id IS NOT DISTINCT FROM root.tenant_id`,
    ];
    for (const c of Object.values(member.columns)) {
      const column = `r.${identifier(c.column)}`;
      rules.push(nativeColumnPredicate(c.node, column, c.sqlType));
      if ("reference" in c && c.reference) {
        const identity = c.reference === "entity_field_identity";
        rules.push(
          `(${column} IS NULL OR EXISTS (SELECT 1 FROM metadata.${identifier(c.reference)} target WHERE target.id=${column} AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND ${identity ? "(target.identity_status='active' OR (target.identity_status='reserved' AND target.introduced_change_set_id=root.id))" : "target.change_set_id=root.id"}))`,
        );
      }
    }
    const retired =
      nativeRetiredColumns[member.table as keyof typeof nativeRetiredColumns] ??
      [];
    rules.push(...retired.map((c) => `r.${identifier(c)} IS NULL`));
    const statement = `IF EXISTS (SELECT 1 FROM metadata.${table} r WHERE r.change_set_id=root.id AND NOT (\n    ${rules.map((r) => `(${r}) IS TRUE`).join(" AND\n    ")}\n  )) THEN RAISE EXCEPTION 'NATIVE_TYPED_ROW_INVALID:${member.table}' USING ERRCODE='23514'; END IF;`;
    checks.push(
      member.table === "entity_operation"
        ? `IF expected_version=2 THEN ${statement} END IF;`
        : statement,
    );
  }
  return `-- GENERATED from the normalized core/layout/operation contracts.
-- Structural component only. Pending cutover guards remain in force.
CREATE OR REPLACE FUNCTION metadata.fn_assert_native_typed_rows(change_set uuid, expected_version integer)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,metadata AS $native_rows$
DECLARE root metadata.entity_change_set%ROWTYPE;
BEGIN
  IF expected_version IS NULL OR expected_version NOT IN (1,2) THEN RAISE EXCEPTION 'NATIVE_TYPED_VERSION_UNSUPPORTED' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT root FROM metadata.entity_change_set WHERE id=change_set FOR SHARE;
  IF root.native_core_layout_version IS DISTINCT FROM expected_version THEN RAISE EXCEPTION 'NATIVE_TYPED_VERSION_MISMATCH' USING ERRCODE='23514'; END IF;
  ${checks.join("\n  ")}
END;
$native_rows$;
`;
}
