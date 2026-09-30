import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { catlDirectCommoditySql } from "../../fixtures/business-partner-core/catl-direct-commodity.mjs";
const args = process.argv.slice(2),
  apply = args.includes("--apply");
if (
  args.some(
    (a) =>
      !["--apply", "--dry-run", "--confirm=LOCAL-DIRECT-COMMODITY"].includes(a),
  ) ||
  (apply &&
    (!args.includes("--confirm=LOCAL-DIRECT-COMMODITY") ||
      args.includes("--dry-run")))
)
  throw Error("Use --dry-run or --apply --confirm=LOCAL-DIRECT-COMMODITY");
const project = execFileSync(
  "docker",
  [
    "inspect",
    "athyper-dev-db-1",
    "--format",
    '{{ index .Config.Labels "com.docker.compose.project" }}',
  ],
  { encoding: "utf8" },
).trim();
if (project !== "athyper-dev") throw Error("Fixed local DEV required");
const ddl = readFileSync(
  "server/db/ddl/planes/neon/master/31_partner_direct_commodity.sql",
  "utf8",
);
const input = `BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
SELECT pg_advisory_xact_lock(hashtextextended('partner-direct-commodity-v1',0));
${ddl}
${catlDirectCommoditySql()}
${catlDirectCommoditySql()}
SET CONSTRAINTS ALL IMMEDIATE;
${apply ? "COMMIT" : "ROLLBACK"};`;
console.log(
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "athyper-dev-db-1",
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "athyper_neon",
    ],
    { input, encoding: "utf8" },
  ),
);
