/** DEV-only clean-break removal. It refuses to discard legacy data or qualification pointers. */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2), apply = args.includes("--apply");
if (args.some((arg) => !["--dry-run", "--apply", "--confirm=LOCAL-REMOVE-LEGACY-COMMODITY"].includes(arg)) ||
  (apply && (!args.includes("--confirm=LOCAL-REMOVE-LEGACY-COMMODITY") || args.includes("--dry-run"))))
  throw Error("Use --dry-run or --apply --confirm=LOCAL-REMOVE-LEGACY-COMMODITY");
const project = execFileSync("docker", ["inspect", "athyper-dev-db-1", "--format", '{{ index .Config.Labels "com.docker.compose.project" }}'], { encoding: "utf8" }).trim();
if (project !== "athyper-dev") throw Error("Fixed local DEV instance required");
const read = (path) => readFileSync(path, "utf8");
const functionSql = (path, qualifiedName) => {
  const source = read(path), marker = `CREATE OR REPLACE FUNCTION ${qualifiedName}(`,
    start = source.indexOf(marker), end = source.indexOf("$$;", start);
  if (start < 0 || end < start) throw Error(`Missing bounded function ${qualifiedName}`);
  return source.slice(start, end + 3);
};
const input = `BEGIN;
SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('remove-legacy-commodity-capability-v1',0));
${functionSql("server/db/ddl/planes/neon/control/07_functions.sql", "control.trg_validate_business_partner_control_scope")}
${functionSql("server/db/ddl/planes/neon/control/07_functions.sql", "control.trg_materialize_legacy_decision_scope")}
${functionSql("server/db/ddl/planes/neon/master/07_functions.sql", "master.fn_pin_business_partner_child_activation")}
${read("server/db/ddl/planes/neon/master/32_remove_legacy_commodity_capability.sql")}
SELECT to_regclass('master.business_partner_commodity_capability') AS legacy_capability,
       to_regclass('master.business_partner_commodity_classification_origin') AS legacy_origin,
       EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='control' AND table_name='business_partner_qualification' AND column_name='commodity_capability_id') AS legacy_pointer;
${apply ? "COMMIT" : "ROLLBACK"};`;
console.log(execFileSync("docker", ["exec", "-i", "athyper-dev-db-1", "psql", "-X", "-U", "postgres", "-d", "athyper_neon", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }));
console.log(apply ? "DEV clean-break removal committed." : "DEV clean-break removal rehearsal rolled back.");
