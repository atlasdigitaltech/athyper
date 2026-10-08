import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizedCoreMembers,
  normalizedLayoutMembers,
  nativeStructuralMembers,
  referenceMembers,
  nativeOperationMember,
  nativeRetiredColumns,
  nativeAiMembers,
} from "../../../server/packages/contracts/meta-entity-authoring/src/index.ts";
import { BRANCH_COLUMNS } from "../../../server/packages/planes/studio/meta-entity-authoring/src/graph-storage-columns.ts";
const canonical = readFileSync(
  new URL(
    "../../../server/db/ddl/planes/studio/metadata/49_native_bootstrap_privileges.sql",
    import.meta.url,
  ),
  "utf8",
);
test("native grants cover only the selected descriptor columns and insert-only structural families", () => {
  const expected = new Map();
  for (const d of [
    ...Object.values(normalizedCoreMembers),
    ...Object.values(normalizedLayoutMembers),
    ...Object.values(nativeStructuralMembers),
    ...Object.values(referenceMembers),
    nativeOperationMember,
  ]) {
    const name = d.table.replace(/^metadata\./, "");
    const columns = [
      "id",
      "change_set_id",
      "entity_id",
      "tenant_id",
      "created_by",
      ...Object.values(d.columns).map((c) =>
        typeof c === "string" ? c : c.column,
      ),
      ...(nativeRetiredColumns[name] ?? []),
    ];
    if (name === "entity_operation") columns.push("requires_mfa");
    expected.set(name, [...new Set(columns)].sort());
  }
  for (const name of [
    "entity_field_reference_binding",
    "entity_operation_permission",
    "entity_operation_scope_binding",
  ])
    expected.set(
      name,
      [
        ...new Set([
          "id",
          "change_set_id",
          "entity_id",
          "tenant_id",
          "created_by",
          ...BRANCH_COLUMNS[name].map((p) =>
            p.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase()),
          ),
        ]),
      ].sort(),
    );
  const actual = new Map(
    [
      ...canonical.matchAll(
        /GRANT INSERT\(([^)]+)\) ON metadata\.(\w+) TO athyper_product_command_app;/g,
      ),
    ].map((m) => [m[2], m[1].split(",").sort()]),
  );
  assert.deepEqual(actual, expected);
  for (const name of expected.keys())
    assert.ok(
      canonical.includes(
        `native_bootstrap_insert_fence ON metadata.${name} AS RESTRICTIVE`,
      ),
    );
  assert.doesNotMatch(
    canonical,
    /DROP CONSTRAINT|GRANT ALL|GRANT DELETE|GRANT UPDATE\(requires_mfa/,
  );
  assert.match(canonical, /NEW.requires_mfa=b.requires_mfa/);
  assert.match(canonical, /FOR SHARE OF b,s,e,o/);
});

test("AI bootstrap grants cover typed columns, retain scope fences and exclude learned promotion", () => {
  const source = readFileSync(
    new URL(
      "../../../server/db/ddl/planes/studio/metadata/56_native_bootstrap_ai_privileges.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const actual = new Map(
    [
      ...source.matchAll(
        /GRANT INSERT\(([^)]+)\) ON metadata\.(\w+) TO athyper_product_command_app;/g,
      ),
    ].map((m) => [m[2], m[1].split(",").sort()]),
  );
  const expected = new Map(
    Object.values(nativeAiMembers)
      .filter((d) => d.table !== "entity_ai_term")
      .map((d) => [
        d.table,
        [
          "id",
          "change_set_id",
          "entity_id",
          "tenant_id",
          "created_by",
          ...Object.values(d.columns).map((c) => c.column),
        ].sort(),
      ]),
  );
  assert.deepEqual(actual, expected);
  for (const table of expected.keys()) {
    assert.ok(
      source.includes(
        `native_bootstrap_insert_fence ON metadata.${table} AS RESTRICTIVE`,
      ),
    );
  }
  assert.match(source, /WITH CHECK\(vocabulary_locale IS NULL AND/);
  assert.doesNotMatch(source, /ON metadata\.entity_ai_term/);
  assert.doesNotMatch(
    source,
    /GRANT (ALL|UPDATE|DELETE|SELECT)|DROP |CREATE FUNCTION/,
  );
});
