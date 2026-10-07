/** Rollback-only canonical DEV rehearsal. Probe rows live only in temporary
 * copies without production guards; no application-role authority is asserted. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import {
  preparationSql,
  legacyNullabilityMigrationName,
} from "./apply-entity-native-resource-preparation.dev.mjs";
import { migrationSourcePath } from "./migration-source.mjs";
const output = process.argv[2];
if (!output || process.argv.length !== 3)
  throw Error("Supply one output receipt path");
const source = readFileSync(
  migrationSourcePath(legacyNullabilityMigrationName),
  "utf8",
);
const digest = createHash("sha256").update(source).digest("hex");
const families = {
  entity_field: ["field_key", "type_config"],
  entity_surface: ["title", "layout_config"],
  entity_surface_section: ["layout_config"],
  entity_operation: ["label"],
};
let probes = "";
for (const [table, columns] of Object.entries(families)) {
  const target = "probe_" + table;
  const constraint = table + "_legacy_required_ck";
  probes += `CREATE TEMP TABLE ${target} (LIKE metadata.${table} INCLUDING ALL) ON COMMIT DROP;\n`;
  if (table === "entity_surface_section")
    probes += `INSERT INTO ${target}(id,entity_id,change_set_id,entity_surface_id,section_key,position,created_by) SELECT gen_random_uuid(),entity_id,change_set_id,id,'native_preparation_probe',1,created_by FROM metadata.entity_surface LIMIT 1;\n`;
  else
    probes += `INSERT INTO ${target} SELECT * FROM metadata.${table} LIMIT 1;\n`;
  probes += `DO $$ BEGIN IF (SELECT count(*) FROM ${target})<>1 THEN RAISE EXCEPTION 'PROBE_SOURCE_REQUIRED: ${table}'; END IF; END $$;\n`;
  for (const column of columns)
    probes += `DO $$ DECLARE rejected boolean:=false; c text; BEGIN
    BEGIN UPDATE ${target} SET ${column}=NULL;
    EXCEPTION WHEN check_violation THEN GET STACKED DIAGNOSTICS c=CONSTRAINT_NAME; rejected:=(c='${constraint}'); END;
    IF NOT rejected THEN RAISE EXCEPTION 'LEGACY_NULL_REJECTION_MISSING: ${table}.${column}'; END IF;
    END $$;\n`;
  probes += `DO $$ DECLARE rejected boolean:=false; c text; BEGIN
    BEGIN UPDATE ${target} SET label_id=gen_random_uuid();
    EXCEPTION WHEN check_violation THEN GET STACKED DIAGNOSTICS c=CONSTRAINT_NAME; rejected:=(c='${table}_native_pending_ck'); END;
    IF NOT rejected THEN RAISE EXCEPTION 'NATIVE_PENDING_REJECTION_MISSING: ${table}'; END IF;
    END $$;\n`;
}
const run = (input) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "athyper-dev-db-1",
      "psql",
      "-X",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "athyper_studio",
    ],
    { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
const prior = run(
  `SELECT status||'|'||sha256 FROM public.athyper_schema_migration_v1 WHERE migration_name='${legacyNullabilityMigrationName}'`,
).trim();
if (prior && prior !== "applied|" + digest)
  throw Error("PROBE_APPLIED_MIGRATION_MISMATCH");
const base = prior
  ? "BEGIN;\nROLLBACK;\n"
  : preparationSql(source, digest, false, legacyNullabilityMigrationName);
const statement = base.replace(/ROLLBACK;\n$/, () => probes + "ROLLBACK;\n");
const result = run(statement);
if (!result.trim().endsWith("ROLLBACK")) throw Error("PROBE_ROLLBACK_REQUIRED");
const evidence = {
  schema: "entity.native-nullability-rehearsal/1",
  inspectedAt: new Date().toISOString(),
  migration: legacyNullabilityMigrationName,
  sha256: digest,
  migrationApplied: !!prior,
  positiveLegacyCopies: 4,
  legacyNullRejections: 6,
  nativePendingRejections: 4,
  originalRowsPreserved: true,
  rollback: true,
  qualification: "not-established",
  productionEnabled: false,
};
writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n");
console.log(JSON.stringify(evidence));
