/** Install the new canonical storage objects in local NEON; no migration or fixture publication. */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const tableNames = {
  control: [
    "process_selection_publication",
    "process_selection_catalog_revision",
  ],
  governance: ["process_selection_evidence"],
};
const psql = (input) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "athyper-dev-db-1",
      "psql",
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "athyper_neon",
    ],
    { input, encoding: "utf8" },
  );
const statements = ["BEGIN;"];
const created = [];
for (const [schema, tables] of Object.entries(tableNames))
  for (const table of tables) {
    const exists =
      psql(`SELECT to_regclass('${schema}.${table}') IS NOT NULL;`).trim() ===
      "t";
    if (exists) continue;
    const source = readFileSync(
        `server/db/ddl/common/${schema}/03_tables.sql`,
        "utf8",
      ),
      start = source.indexOf(`CREATE TABLE ${schema}.${table} (`);
    if (start < 0) throw Error("Canonical table missing");
    statements.push(source.slice(start, source.indexOf("\n);", start) + 4));
    created.push(`${schema}.${table}`);
    statements.push(`ALTER TABLE ${schema}.${table} ENABLE ROW LEVEL SECURITY;ALTER TABLE ${schema}.${table} FORCE ROW LEVEL SECURITY;
 CREATE POLICY tenant_access ON ${schema}.${table} FOR ALL USING (tenant_id=shared.current_tenant_id_soft()) WITH CHECK (tenant_id=shared.current_tenant_id());
 CREATE POLICY seed_write ON ${schema}.${table} FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
 GRANT SELECT ${schema === "governance" ? ",INSERT" : ""} ON ${schema}.${table} TO athyperapp;GRANT ALL ON ${schema}.${table} TO athyperadmin;`);
  }
for (const [schema, fn] of [
  ["control", "trg_reject_process_publication_mutation"],
  ["control", "trg_fn_protect_published_policy_revision"],
  ["governance", "trg_reject_process_selection_mutation"],
]) {
  const source = readFileSync(
      `server/db/ddl/common/${schema}/07_functions.sql`,
      "utf8",
    ),
    start = source.indexOf(`CREATE OR REPLACE FUNCTION ${schema}.${fn}`);
  statements.push(source.slice(start, source.indexOf("$$;", start) + 3));
}
for (const [schema, table, trigger, fn] of [
  [
    "control",
    "process_selection_publication",
    "process_selection_publication_immutable",
    "trg_reject_process_publication_mutation",
  ],
  [
    "control",
    "process_selection_catalog_revision",
    "process_selection_catalog_immutable",
    "trg_reject_process_publication_mutation",
  ],
  [
    "governance",
    "process_selection_evidence",
    "process_selection_evidence_immutable",
    "trg_reject_process_selection_mutation",
  ],
]) {
  if (created.includes(`${schema}.${table}`))
    statements.push(
      `CREATE TRIGGER ${trigger} BEFORE UPDATE OR DELETE ON ${schema}.${table} FOR EACH ROW EXECUTE FUNCTION ${schema}.${fn}();`,
    );
}
for (const [schema, table] of [
  ["control", "process_selection_publication"],
  ["governance", "process_selection_evidence"],
])
  if (created.includes(`${schema}.${table}`)) {
    const source = readFileSync(
      `server/db/ddl/common/${schema}/05_constraints.sql`,
      "utf8",
    );
    const start = source.indexOf(`ALTER TABLE ${schema}.${table}`);
    statements.push(source.slice(start, source.indexOf(";", start) + 1));
  }
statements.push(
  "SELECT audit.install_schema_row_triggers('governance');",
  "COMMIT;",
);
psql(statements.join("\n"));
const report = {
  at: new Date().toISOString(),
  database: "athyper_neon",
  canonicalTables: tableNames,
  created,
  fixtureRowsCreated: 0,
  existingObjectGrantsChanged: false,
};
writeFileSync(
  "governance/policy/reports/supplier-process-selection-storage.dev.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
