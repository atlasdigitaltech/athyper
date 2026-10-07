/** Rollback-only DEV rehearsal. Cannot activate a route, provision login roles,
 * approve governance or persist the packaged upgrade. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { migrationSourcePath } from "./migration-source.mjs";
export const migrationName = "20261008_entity_product_command_authority.sql";
const hash = (value) => createHash("sha256").update(value).digest("hex");
export function rollbackInstallationSql(source, digest) {
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(hash(source), digest, "Installation package hash mismatch");
  assert.ok(source.startsWith("BEGIN;\n") && source.endsWith("COMMIT;\n"));
  return source
    .replace("BEGIN;\n", "BEGIN;\nSET LOCAL statement_timeout='30s';\n")
    .replace(/COMMIT;\n$/, "ROLLBACK;\n");
}
export function rehearse(args) {
  assert.equal(
    args.length,
    2,
    "Use --output PATH; this command has no apply mode",
  );
  assert.equal(args[0], "--output");
  assert.ok(args[1]);
  const source = readFileSync(migrationSourcePath(migrationName), "utf8");
  const inventory = JSON.parse(
    readFileSync(
      new URL("../../../server/db/migrations/inventory.json", import.meta.url),
      "utf8",
    ),
  );
  const pin = inventory.entries.find(
    (e) => e.originalPath === `migrations/${migrationName}`,
  );
  assert.equal(pin.disposition, "operational-upgrade");
  assert.deepEqual(pin.planes, []);
  const sql = rollbackInstallationSql(source, pin.sha256);
  const run = (input) =>
    execFileSync(
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
    );
  assert.equal(run("SELECT current_database();").trim(), "athyper_studio");
  const absent = () =>
    assert.equal(
      run(`BEGIN READ ONLY;
    SELECT (SELECT count(*) FROM pg_roles WHERE rolname IN ('athyper_product_command_owner','athyper_product_command_issuer','athyper_product_command_app'))
      +(SELECT count(*) FROM pg_namespace WHERE nspname='entity_command_private'); COMMIT;`).trim(),
      "0",
      "Existing product command installation requires separate inspection",
    );
  const fingerprint = () =>
    hash(
      run(`BEGIN READ ONLY;
    SELECT 'drafts',md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) FROM metadata.entity_change_set t;
    SELECT 'history',md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY change_set_id,lock_version)::text,'[]')) FROM snapshot.entity_draft_save t;
    SELECT 'grants',md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) FROM authz.role_permission t;
    SELECT 'heads',md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) FROM runtime_meta.release_activation_head t;
    COMMIT;`),
    );
  absent();
  const before = fingerprint();
  run(sql);
  absent();
  const after = fingerprint();
  assert.equal(after, before, "DEV state changed during rehearsal");
  const result = {
    schema: "entity.product-command-installation-rehearsal/1",
    migration: migrationName,
    sha256: pin.sha256,
    database: "athyper_studio",
    verifiedAt: new Date().toISOString(),
    rollbackVerified: true,
    beforeFingerprint: before,
    afterFingerprint: after,
    applied: false,
    governanceQualified: false,
    enrolled: false,
    activated: false,
  };
  writeFileSync(args[1], JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  rehearse(process.argv.slice(2));
