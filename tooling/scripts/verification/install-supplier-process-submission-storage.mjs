/** Apply canonical P2 definitions to local DEV. No migration or business fixture writes. */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
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
const tables = readFileSync(
  "server/db/ddl/common/governance/03_tables.sql",
  "utf8",
);
if (
  psql(
    "SELECT count(*) FROM pg_constraint WHERE conname='process_selection_tenant_id_uq' AND conrelid='governance.process_selection_evidence'::regclass;",
  ).trim() === "0"
)
  statements.push(
    "ALTER TABLE governance.process_selection_evidence ADD CONSTRAINT process_selection_tenant_id_uq UNIQUE(tenant_id,id);",
  );
const created = [];
for (const table of ["process_attempt", "process_document_job"]) {
  if (
    psql(`SELECT to_regclass('governance.${table}') IS NOT NULL;`).trim() ===
    "t"
  )
    continue;
  const start = tables.indexOf(`CREATE TABLE governance.${table} (`);
  if (start < 0) throw Error(`Missing canonical ${table}`);
  statements.push(tables.slice(start, tables.indexOf("\n);", start) + 4));
  statements.push(`ALTER TABLE governance.${table} ENABLE ROW LEVEL SECURITY; ALTER TABLE governance.${table} FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_access ON governance.${table} FOR ALL USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
    CREATE POLICY seed_write ON governance.${table} FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
    GRANT SELECT,INSERT ON governance.${table} TO athyperapp; GRANT ALL ON governance.${table} TO athyperadmin;`);
  created.push(table);
}
if (created.includes("process_attempt")) {
  const constraints = readFileSync(
    "server/db/ddl/common/governance/05_constraints.sql",
    "utf8",
  );
  const start = constraints.indexOf("ALTER TABLE governance.process_attempt");
  statements.push(
    constraints.slice(start, constraints.indexOf(";", start) + 1),
  );
}
if (
  !created.includes("process_attempt") &&
  psql(
    "SELECT count(*) FROM information_schema.columns WHERE table_schema='governance' AND table_name='process_attempt' AND column_name='review_pack_job_id';",
  ).trim() === "0"
) {
  statements.push(
    "ALTER TABLE governance.process_attempt ADD COLUMN " +
      tables
        .split("\n")
        .find((line) => line.includes("review_pack_job_id uuid GENERATED"))
        .trim()
        .replace(/,$/, ";"),
  );
}
if (
  !created.includes("process_document_job") &&
  psql(
    "SELECT count(*) FROM pg_constraint WHERE conname='process_document_job_coordinate_uq';",
  ).trim() === "0"
)
  statements.push(
    "ALTER TABLE governance.process_document_job ADD CONSTRAINT process_document_job_coordinate_uq UNIQUE(tenant_id,id,attempt_id,case_id,cycle_run_id,selection_id);",
  );
if (
  created.includes("process_attempt") ||
  psql(
    "SELECT count(*) FROM pg_constraint WHERE conname='process_attempt_review_pack_fk';",
  ).trim() === "0"
) {
  const source = readFileSync(
    "server/db/ddl/common/governance/05_constraints.sql",
    "utf8",
  );
  const start = source.indexOf(
    "ALTER TABLE governance.process_attempt\n ADD CONSTRAINT process_attempt_review_pack_fk",
  );
  statements.push(source.slice(start, source.indexOf(";", start) + 1));
}
for (const [source, fn] of [
  [
    "server/db/ddl/common/governance/07_functions.sql",
    "governance.trg_process_task_document_gate",
  ],
  [
    "server/db/ddl/common/governance/07_functions.sql",
    "governance.trg_validate_process_attempt",
  ],
  [
    "server/db/ddl/common/governance/07_functions.sql",
    "governance.trg_validate_process_document_intent",
  ],
  [
    "server/db/ddl/planes/neon/document/07_functions.sql",
    "document.command_entity_case_lifecycle",
  ],
]) {
  const text = readFileSync(source, "utf8"),
    start = text.indexOf(`CREATE OR REPLACE FUNCTION ${fn}(`);
  if (start < 0) throw Error(`Missing ${fn}`);
  statements.push(text.slice(start, text.indexOf("$$;", start) + 3));
}
statements.push(
  readFileSync("server/db/ddl/planes/neon/governance/07_functions.sql", "utf8"),
);
const triggers = readFileSync(
  "server/db/ddl/common/governance/08_triggers.sql",
  "utf8",
);
for (const [table, name] of [
  ["process_document_job", "process_document_intent_binding"],
  ["process_attempt", "process_attempt_immutable"],
  ["process_attempt", "process_attempt_coordinate"],
  ["cycle_task", "process_task_document_gate"],
]) {
  if (
    !created.includes(table) &&
    psql(
      `SELECT count(*) FROM pg_trigger WHERE tgname='${name}' AND tgrelid='governance.${table}'::regclass;`,
    ).trim() !== "0"
  )
    continue;
  const start = triggers.indexOf(`CREATE TRIGGER ${name} `);
  if (start < 0) throw Error(`Missing ${name}`);
  statements.push(triggers.slice(start, triggers.indexOf(";", start) + 1));
}
statements.push(
  "SELECT audit.install_schema_row_triggers('governance');",
  "COMMIT;",
);
psql(statements.join("\n"));
const report = {
  at: new Date().toISOString(),
  database: "athyper_neon",
  created,
  canonicalDefinitions: true,
  businessRowsCreated: 0,
};
writeFileSync(
  "governance/policy/reports/supplier-process-submission-storage.dev.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
