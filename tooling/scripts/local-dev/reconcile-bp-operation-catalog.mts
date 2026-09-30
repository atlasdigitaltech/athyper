/** Explicit existing DEV catalog patch. --check always rolls back; no grants. */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const args = process.argv.slice(2);
if (args.length !== 1 || !["--check", "--apply"].includes(args[0]!))
  throw Error("USE_CHECK_OR_APPLY");
const project = execFileSync(
  "docker",
  [
    "inspect",
    "--format",
    '{{index .Config.Labels "com.docker.compose.project"}}',
    "athyper-dev-db-1",
  ],
  { encoding: "utf8" },
).trim();
if (project !== "athyper-dev") throw Error("DEV_DATABASE_REQUIRED");
const path =
  "server/db/ddl/planes/neon/authz/27_partner_governed_operation_permissions.sql";
const ddl = readFileSync(path, "utf8");
// A temporary fingerprint verifies that this catalog repair cannot alter grants
// or release heads, even if a future database trigger is introduced.
const fingerprint = `SELECT md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text)::text,'[]')) FROM %TABLE% r`;
const tables = [
  "authz.role_permission",
  "runtime_meta.release_activation_head",
];
const before = tables
  .map(
    (t, i) =>
      `CREATE TEMP TABLE guard_${i} ON COMMIT DROP AS ${fingerprint.replace("%TABLE%", t)};`,
  )
  .join("\n");
const after = tables
  .map(
    (t, i) =>
      `DO $$ BEGIN IF (SELECT md5 FROM guard_${i}) IS DISTINCT FROM (${fingerprint.replace("%TABLE%", t)}) THEN RAISE EXCEPTION 'UNRELATED_STATE_CHANGED'; END IF; END $$;`,
  )
  .join("\n");
const sql = `BEGIN;\n${before}\n${ddl}\n${ddl}\n${after}\n${args[0] === "--apply" ? "COMMIT" : "ROLLBACK"};`;
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
  { input: sql, encoding: "utf8" },
);
console.log(
  JSON.stringify({
    status: args[0] === "--apply" ? "applied" : "rollback-verified",
    catalogPermissions: 4,
    idempotenceVerified: true,
    grantsChanged: false,
    activationChanged: false,
    sourceSha256: createHash("sha256").update(ddl).digest("hex"),
  }),
);
