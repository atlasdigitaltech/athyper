/** Explicit DEV-only additive upgrade. Dry-run is the default and rolls everything back. */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { classificationSeedSql } from "../../fixtures/business-partner-core/classification-seed.mjs";
export function classificationCommandFunctions() {
  const root = "server/db/ddl/planes/neon/";
  const functions = readFileSync(root + "master/07_functions.sql", "utf8");
  const replacements = [
    "fn_pin_business_partner_child_activation",
    "command_materialize_business_partner_change_case",
    "fn_materialize_business_partner_case_relationships",
  ].map((name) => {
    const start = functions.indexOf(
        "CREATE OR REPLACE FUNCTION master." + name + "(",
      ),
      end = functions.indexOf("END $$;", start);
    if (start < 0 || end < start)
      throw Error("Missing bounded function: " + name);
    return functions.slice(start, end + 7);
  });
  const control = readFileSync(root + "control/07_functions.sql", "utf8");
  const controlStart = control.indexOf(
    "CREATE OR REPLACE FUNCTION control.command_create_business_partner_decision(",
  );
  const controlEnd = control.indexOf(
    "$$;",
    control.indexOf("AS $$", controlStart) + 5,
  );
  if (controlStart < 0 || controlEnd < controlStart)
    throw Error("Missing qualification command");
  replacements.push(control.slice(controlStart, controlEnd + 3));
  return replacements.join("\n");
}
export function classificationUpgradeSql({ apply = false, demo = true } = {}) {
  const root = "server/db/ddl/planes/neon/";
  return `BEGIN;
 SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='120s';
 SELECT pg_advisory_xact_lock(hashtextextended('partner-classification-cutover-v1',0));
 DO $$ BEGIN
  IF current_database()<>'athyper_neon' THEN RAISE EXCEPTION 'NEON database required'; END IF;
  IF to_regclass('master.business_partner_commodity_classification') IS NOT NULL THEN RAISE EXCEPTION 'Already installed; inspect current state rather than replaying historical backfill'; END IF;
 END $$;
 ${["master/29_partner_commodity_classification.sql", "authz/25_partner_classification_permissions.sql", "master/30_partner_classification_cutover.sql"].map((path) => readFileSync(root + path, "utf8")).join("\n")}
 ${classificationCommandFunctions()}
 ${demo ? classificationSeedSql() + "\n" + classificationSeedSql() : ""}
 SELECT (SELECT count(*) FROM master.business_partner_commodity_classification) AS classification_facts,
 (SELECT count(*) FROM control.business_partner_qualification_classification) AS qualification_references;
 ${apply ? "COMMIT" : "ROLLBACK"};`;
}
export function main(args = process.argv.slice(2)) {
  const apply = args.includes("--apply");
  if (
    args.some(
      (a) =>
        ![
          "--apply",
          "--dry-run",
          "--confirm=LOCAL-PARTNER-CLASSIFICATION",
        ].includes(a),
    ) ||
    (apply &&
      (!args.includes("--confirm=LOCAL-PARTNER-CLASSIFICATION") ||
        args.includes("--dry-run")))
  )
    throw Error(
      "Use --dry-run or --apply --confirm=LOCAL-PARTNER-CLASSIFICATION",
    );
  const container = JSON.parse(
    execFileSync("docker", ["inspect", "athyper-dev-db-1"], {
      encoding: "utf8",
    }),
  )[0];
  if (
    container.Name !== "/athyper-dev-db-1" ||
    container.Config.Labels["com.docker.compose.project"] !== "athyper-dev"
  )
    throw Error("Fixed local DEV instance required");
  const output = execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "athyper-dev-db-1",
      "psql",
      "-X",
      "-U",
      "postgres",
      "-d",
      "athyper_neon",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    {
      input: classificationUpgradeSql({ apply }),
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    },
  );
  console.log(output);
  console.log(
    apply
      ? "DEV role-free classification setup and demo committed; metadata publication is separate."
      : "DEV role-free classification installation rehearsal passed; rolled back.",
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
