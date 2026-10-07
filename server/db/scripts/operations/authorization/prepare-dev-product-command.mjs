/** DEV-only installation of the already reviewed bounded command transport.
 * No human grant, enrollment, review, publication or activation is performed. */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  lstatSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { assertDevContainer } from "./setup-dev-test-admin.mjs";
import { migrationSourcePath } from "../../../../../tooling/scripts/verification/migration-source.mjs";
export const migrationName = "20261008_entity_product_command_authority.sql";
export const auditMigrationName = "20261008_entity_product_authoring_audit.sql";
export const issuerLogin = "athyper_dev_product_issuer";
export const applicationLogin = "athyper_dev_product_command";
export const auditSignature =
  "audit.append_event(text,audit.operation_d,text,uuid,audit.outcome_d,audit.event_severity_d,text,uuid,uuid,text,jsonb,jsonb,text[],jsonb,uuid,text,timestamp with time zone)";
export const commandFunctions = [
  "shared.current_tenant_id_soft()",
  "shared.current_tenant_id()",
  "master.current_principal_id_soft()",
  "shared.uuidv7()",
  "metadata.current_actor_id(uuid)",
  "metadata.fn_advance_entity_change_set(uuid,bigint,uuid)",
  "metadata.entity_root_patch_keeps_revision(jsonb,jsonb)",
];
const runtimeGrants = `GRANT EXECUTE ON FUNCTION ${commandFunctions.join(",")} TO athyper_product_command_app;`;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const passwordsValid = (passwords) =>
  ["issuer", "application"].every((key) =>
    /^[A-Za-z0-9_-]{54}$/.test(passwords[key]),
  );
export function installationSql(source, digest, passwords, apply) {
  assert.equal(hash(source), digest, "Package digest mismatch");
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.ok(source.startsWith("BEGIN;\n") && source.endsWith("COMMIT;\n"));
  assert.ok(passwordsValid(passwords), "Managed passwords required");
  assert.equal(typeof apply, "boolean");
  const start = `BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(hashtextextended('${migrationName}',0));
DO $$ BEGIN
 IF current_database()<>'athyper_studio' THEN RAISE EXCEPTION 'STUDIO_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM public.athyper_schema_migration_v1 WHERE migration_name='${migrationName}') THEN
  RAISE EXCEPTION 'INSTALLATION_LEDGER_CHANGED'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('${issuerLogin}','${applicationLogin}')) THEN
  RAISE EXCEPTION 'UNMANAGED_COMMAND_LOGIN'; END IF;
 IF to_regprocedure('${auditSignature}') IS NULL THEN RAISE EXCEPTION 'AUDIT_CONTRACT_REQUIRED'; END IF;
END $$;
`;
  const finish = `
CREATE ROLE ${issuerLogin} LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${passwords.issuer}';
CREATE ROLE ${applicationLogin} LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${passwords.application}';
COMMENT ON ROLE ${issuerLogin} IS 'dev:product-command:issuer:v1';
COMMENT ON ROLE ${applicationLogin} IS 'dev:product-command:application:v1';
GRANT athyper_product_command_issuer TO ${issuerLogin};
GRANT athyper_product_command_app TO ${applicationLogin};
GRANT CONNECT ON DATABASE athyper_studio TO ${issuerLogin},${applicationLogin};
GRANT USAGE ON SCHEMA audit TO athyper_product_command_app;
${runtimeGrants}
GRANT EXECUTE ON FUNCTION ${auditSignature} TO athyper_product_command_app;
DO $qualification$ BEGIN
 IF has_table_privilege('${applicationLogin}','entity_command_private.admission','INSERT')
   OR has_table_privilege('${applicationLogin}','audit.audit_log','INSERT')
   OR has_function_privilege('${applicationLogin}','entity_command_private.revoke(bytea)','EXECUTE')
   OR has_function_privilege('${issuerLogin}','entity_command_private.enter(text,text)','EXECUTE') THEN
   RAISE EXCEPTION 'COMMAND_PRIVILEGE_SEPARATION_FAILED'; END IF;
 IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
   WHERE n.nspname='entity_command_private' AND p.proname IN ('enter','admitted','revoke') AND p.prosecdef
   AND r.rolname='athyper_product_command_owner' AND p.proconfig=ARRAY['search_path=pg_catalog, entity_command_private'])<>3 THEN
   RAISE EXCEPTION 'COMMAND_ROUTINE_OWNERSHIP_FAILED'; END IF;
END $qualification$;
${
  apply
    ? `INSERT INTO public.athyper_schema_migration_v1(migration_name,sha256,status,runner_id,started_at,completed_at)
VALUES('${migrationName}','${digest}','applied','dev-product-command-installation',transaction_timestamp(),clock_timestamp());\nCOMMIT;`
    : "ROLLBACK;"
}
`;
  return source
    .replace("BEGIN;\n", () => start)
    .replace(/COMMIT;\n$/, () => finish);
}
function privateFile(path) {
  const stat = lstatSync(path);
  assert.ok(
    stat.isFile() && !(stat.mode & 0o077) && stat.size <= 65536,
    "Private regular file required",
  );
  return readFileSync(path, "utf8").trim();
}
export function prepare(args) {
  assert.ok(
    args.length === 3 &&
      ["--rehearse", "--apply=DEV-PRODUCT-COMMAND"].includes(args[0]) &&
      args[1] === "--output",
    "Use --rehearse or --apply=DEV-PRODUCT-COMMAND --output PATH",
  );
  const apply = args[0] === "--apply=DEV-PRODUCT-COMMAND";
  assertDevContainer(
    JSON.parse(
      execFileSync("docker", ["inspect", "athyper-dev-db-1"], {
        encoding: "utf8",
      }),
    )[0],
  );
  const query = (input) => {
    try {
      return execFileSync(
        "docker",
        [
          "exec",
          "-i",
          "athyper-dev-db-1",
          "sh",
          "-c",
          'psql -X -qAt -U "${POSTGRES_USER:-postgres}" -d athyper_studio -v ON_ERROR_STOP=1',
        ],
        { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
      ).trim();
    } catch {
      throw Error(
        "DEV product-command database operation failed; SQL and credential output suppressed",
      );
    }
  };
  const source = readFileSync(migrationSourcePath(migrationName), "utf8");
  const inventory = JSON.parse(
    readFileSync(
      new URL("../../../migrations/inventory.json", import.meta.url),
      "utf8",
    ),
  );
  const entry = inventory.entries.find(
    (row) => row.originalPath === `migrations/${migrationName}`,
  );
  assert.equal(entry.disposition, "operational-upgrade");
  assert.deepEqual(entry.planes, []);
  assert.equal(hash(source), entry.sha256);
  const prior = query(
    `SELECT coalesce(jsonb_agg(jsonb_build_object('hash',sha256,'status',status)),'[]') FROM public.athyper_schema_migration_v1 WHERE migration_name='${migrationName}';`,
  );
  const ledger = JSON.parse(prior);
  assert.ok(
    ledger.length === 0 ||
      (ledger.length === 1 &&
        ledger[0].hash === entry.sha256 &&
        ledger[0].status === "applied"),
    "Existing installation ledger conflict",
  );
  const directory = join(
    homedir(),
    ".athyper/instances/dev/secrets/product-command",
  );
  if (existsSync(directory)) {
    const stat = lstatSync(directory);
    assert.ok(
      stat.isDirectory() && !(stat.mode & 0o077),
      "Private credential directory required",
    );
  }
  const passwords = {};
  for (const key of ["issuer", "application"]) {
    const path = join(directory, key + "-password");
    if (ledger.length) {
      passwords[key] = privateFile(path);
    } else if (!apply) passwords[key] = randomBytes(40).toString("base64url");
    else {
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      if (!existsSync(path))
        writeFileSync(path, randomBytes(40).toString("base64url"), {
          mode: 0o600,
          flag: "wx",
        });
      passwords[key] = privateFile(path);
    }
  }
  assert.ok(passwordsValid(passwords));
  const fingerprint = () =>
    hash(
      query(`BEGIN READ ONLY;
 SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) FROM metadata.entity_change_set t;
 SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY change_set_id,lock_version)::text,'[]')) FROM snapshot.entity_draft_save t;
 SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) FROM authz.role_permission t;
 SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) FROM runtime_meta.release_activation_head t;
 COMMIT;`),
    );
  const before = fingerprint();
  if (!ledger.length) {
    query(installationSql(source, entry.sha256, passwords, false));
    if (apply) query(installationSql(source, entry.sha256, passwords, true));
  }
  const installed = apply || ledger.length === 1;
  if (installed) {
    const roleCheck = query(`SELECT count(*) FROM pg_roles r WHERE
      (r.rolname='${issuerLogin}' AND shobj_description(r.oid,'pg_authid')='dev:product-command:issuer:v1'
        AND pg_has_role(r.oid,'athyper_product_command_issuer','MEMBER') AND NOT pg_has_role(r.oid,'athyper_product_command_app','MEMBER'))
      OR (r.rolname='${applicationLogin}' AND shobj_description(r.oid,'pg_authid')='dev:product-command:application:v1'
        AND pg_has_role(r.oid,'athyper_product_command_app','MEMBER') AND NOT pg_has_role(r.oid,'athyper_product_command_issuer','MEMBER'));`);
    assert.equal(roleCheck, "2", "Installed login topology drift");
    assert.equal(
      query(`SELECT count(*) FROM pg_roles r WHERE r.rolname IN ('${issuerLogin}','${applicationLogin}') AND EXISTS (
      SELECT 1 FROM pg_roles other WHERE other.oid<>r.oid AND pg_has_role(r.oid,other.oid,'MEMBER')
      AND other.rolname <> CASE r.rolname WHEN '${issuerLogin}' THEN 'athyper_product_command_issuer' ELSE 'athyper_product_command_app' END);`),
      "0",
      "Unexpected transitive login membership",
    );
    assert.equal(
      query(
        `SELECT count(*) FROM pg_roles WHERE rolname IN ('athyper_product_command_owner','athyper_product_command_app','athyper_product_command_issuer') AND rolcanlogin;`,
      ),
      "0",
      "Non-login authority role required",
    );
    assert.equal(
      query(`SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
      WHERE n.nspname='entity_command_private' AND p.proname IN ('enter','admitted','revoke') AND p.prosecdef
      AND r.rolname='athyper_product_command_owner' AND p.proconfig=ARRAY['search_path=pg_catalog, entity_command_private'];`),
      "3",
      "Admission routine ownership/configuration drift",
    );
    assert.equal(
      query(`SELECT has_table_privilege('${applicationLogin}','entity_command_private.admission','INSERT')
      OR has_table_privilege('${applicationLogin}','audit.audit_log','INSERT')
      OR has_function_privilege('${applicationLogin}','entity_command_private.revoke(bytea)','EXECUTE')
      OR has_function_privilege('${issuerLogin}','entity_command_private.enter(text,text)','EXECUTE');`),
      "f",
      "Unexpected command privilege",
    );

    assert.equal(
      query(`SELECT count(*) FROM pg_roles r WHERE r.rolname IN ('${issuerLogin}','${applicationLogin}','athyper_product_command_owner','athyper_product_command_app','athyper_product_command_issuer')
      AND (r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication);`),
      "0",
      "Unsafe installation role",
    );
    assert.equal(
      query(
        `SELECT has_schema_privilege('${applicationLogin}','audit','USAGE') AND has_function_privilege('${applicationLogin}','${auditSignature}','EXECUTE');`,
      ),
      "t",
    );
    if (apply) {
      query(`BEGIN; SET LOCAL lock_timeout='5s'; ${runtimeGrants} COMMIT;`);
      for (const [key, login] of [
        ["issuer", issuerLogin],
        ["application", applicationLogin],
      ])
        writeFileSync(
          join(directory, key + "-database-url"),
          `postgresql://${login}:${passwords[key]}@db:5432/athyper_studio`,
          { mode: 0o600 },
        );
    }
  }
  const auditSource = readFileSync(
    migrationSourcePath(auditMigrationName),
    "utf8",
  );
  const auditEntry = inventory.entries.find(
    (row) => row.originalPath === `migrations/${auditMigrationName}`,
  );
  assert.equal(hash(auditSource), auditEntry.sha256);
  const auditLedger = JSON.parse(
    query(
      `SELECT coalesce(jsonb_agg(jsonb_build_object('hash',sha256,'status',status)),'[]') FROM public.athyper_schema_migration_v1 WHERE migration_name='${auditMigrationName}';`,
    ),
  );
  assert.ok(
    auditLedger.length === 0 ||
      (auditLedger.length === 1 &&
        auditLedger[0].hash === auditEntry.sha256 &&
        auditLedger[0].status === "applied"),
    "Audit installation ledger conflict",
  );
  const auditTransaction = (commit) =>
    auditSource
      .replace(
        "BEGIN;\n",
        () =>
          `BEGIN;\nSET LOCAL statement_timeout='30s';\nSELECT pg_advisory_xact_lock(hashtextextended('${auditMigrationName}',0));\nDO $$ BEGIN IF EXISTS(SELECT 1 FROM public.athyper_schema_migration_v1 WHERE migration_name='${auditMigrationName}') THEN RAISE EXCEPTION 'AUDIT_LEDGER_CHANGED'; END IF; END $$;\n`,
      )
      .replace(
        /COMMIT;\n$/,
        commit
          ? `INSERT INTO public.athyper_schema_migration_v1(migration_name,sha256,status,runner_id,started_at,completed_at) VALUES('${auditMigrationName}','${auditEntry.sha256}','applied','dev-product-command-installation',transaction_timestamp(),clock_timestamp());\nCOMMIT;\n`
          : "ROLLBACK;\n",
      );
  if (!auditLedger.length) {
    query(auditTransaction(false));
    if (apply) query(auditTransaction(true));
  } else query(auditSource.replace(/COMMIT;\n$/, "ROLLBACK;\n"));
  const after = fingerprint();
  assert.equal(after, before, "Unrelated DEV state changed");
  const receipt = {
    schema: "entity.product-command-installation/1",
    migration: migrationName,
    sha256: entry.sha256,
    database: "athyper_studio",
    verifiedAt: new Date().toISOString(),
    applied: installed,
    auditContractInstalled: apply || auditLedger.length === 1,
    auditContractHash: auditEntry.sha256,
    replayed: ledger.length === 1,
    beforeFingerprint: before,
    afterFingerprint: after,
    enrolled: false,
    activated: false,
    humanAuthenticated: false,
  };
  writeFileSync(args[2], JSON.stringify(receipt, null, 2) + "\n", {
    mode: 0o600,
  });
  console.log(JSON.stringify(receipt));
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    prepare(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
