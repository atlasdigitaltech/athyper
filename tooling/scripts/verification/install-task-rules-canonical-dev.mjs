/** Apply reviewed canonical definitions to local DEV, without rewriting publications or cases. */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const common = readFileSync("server/db/ddl/common/control/07_functions.sql", "utf8");
const guard = common.match(/CREATE OR REPLACE FUNCTION control\.trg_fn_protect_published_policy_revision\(\)[\s\S]*?\n\$\$;/)?.[0];
if (!guard) throw Error("Canonical policy guard not found");
const records = [];
for (const database of ["athyper_studio", "athyper_neon", "athyper_mesh"]) {
 const plane = database === "athyper_studio" ? "studio" : database === "athyper_neon" ? "neon" : "mesh";
 const chunks = ["BEGIN;", `SELECT set_config('app.database_plane','${plane}',true);`, guard,
  ...["policy_rule", "policy_test_case"].map(table => `DROP TRIGGER IF EXISTS ${table}_published_immutable ON control.${table}; CREATE TRIGGER ${table}_published_immutable BEFORE INSERT OR UPDATE OR DELETE ON control.${table} FOR EACH ROW EXECUTE FUNCTION control.trg_fn_protect_published_policy_revision();`),
  ...(plane === "neon" ? [readFileSync("server/db/ddl/common/control/17_process_task_rule_publication.sql", "utf8")] : [])];
 if (plane === "neon") {
  chunks.push(readFileSync("server/db/ddl/planes/neon/document/07_task_interactions.sql", "utf8"), readFileSync("server/db/ddl/planes/neon/control/16_supplier_communications_reference_seed.sql", "utf8"));
  const source = readFileSync("server/db/ddl/planes/neon/document/07_functions.sql", "utf8");
  const start = source.indexOf("CREATE OR REPLACE FUNCTION document.command_entity_case_lifecycle(");
  const end = source.indexOf("$$;", start);
  if (start < 0 || end < start) throw Error("Canonical lifecycle function not found");
  chunks.push(source.slice(start,end+3));
  for (const name of ["process_case_has_contributor", "process_case_reviewers"]) {
    const from = source.indexOf(`CREATE OR REPLACE FUNCTION document.${name}(`), to = source.indexOf("$$;",from);
    if(from<0||to<from)throw Error("Canonical reviewer function missing");
    chunks.push(source.slice(from,to+3));
  }
  chunks.push("REVOKE ALL ON FUNCTION document.process_case_has_contributor(uuid,uuid,uuid) FROM PUBLIC;");
 }
 chunks.push("COMMIT;");
 const ddl = chunks.join("\n");
 execFileSync("docker", ["exec", "-i", "athyper-dev-db-1", "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], { input: ddl, stdio: ["pipe","pipe","pipe"] });
 records.push({ database, canonicalSha256: createHash("sha256").update(ddl).digest("hex") });
}
const report = { at: new Date().toISOString(), records, scope: "Canonical schema/functions/notification reference definitions only; includes bounded service-role database permissions; no business-principal grants, policy revisions or case mutations" };
writeFileSync("governance/policy/reports/task-rules-schema.dev.json", JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report));
