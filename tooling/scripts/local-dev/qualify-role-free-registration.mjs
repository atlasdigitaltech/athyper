/** Fixed DEV upgrade; dry-run by default. Includes the explicitly approved CATL owner grant. */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const args = process.argv.slice(2),
  apply = args.includes("--apply");
if (
  args.some(
    (a) =>
      ![
        "--apply",
        "--maker-update",
        "--confirm=LOCAL-CORE-REGISTRATION",
      ].includes(a),
  ) ||
  (apply && !args.includes("--confirm=LOCAL-CORE-REGISTRATION"))
)
  throw Error("Explicit local registration confirmation required");
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
const source = readFileSync(
  "server/db/ddl/planes/neon/master/07_functions.sql",
  "utf8",
);
const functions = [
  "command_materialize_business_partner_role_case",
  "fn_materialize_business_partner_case_relationships",
].map((name) => {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION master.${name}(`),
    end = source.indexOf("END $$;", start);
  if (start < 0 || end < start) throw Error("Bounded function missing");
  return source.slice(start, end + 7);
});
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
    {
      input: `BEGIN; SET LOCAL lock_timeout='5s';
      ${readFileSync("server/db/ddl/planes/neon/authz/26_partner_registration_permission.sql", "utf8")}
      ${readFileSync("server/db/ddl/planes/neon/document/31_partner_registration_approvers.sql", "utf8")}
      ${functions.join("\n")}
      ${readFileSync(args.includes("--maker-update") ? "tooling/scripts/verification/grant-catl-core-registration-maker.dev.sql" : "tooling/scripts/verification/grant-catl-core-registration.dev.sql", "utf8")}
      SET CONSTRAINTS ALL IMMEDIATE; ${apply ? "COMMIT" : "ROLLBACK"};`,
      encoding: "utf8",
    },
  ),
);
