/** Disposable pre-contract schema fixture; never accepts a deployed DB target. */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { artifactDirectory } from "../artifact-paths.mjs";

const root = resolve(import.meta.dirname, "../../..");
const target = `athyper-entity-upgrade-${randomUUID()}`;
const scratch = mkdtempSync(join(tmpdir(), "athyper-entity-upgrade-"));
const output = artifactDirectory("entity-audit-upgrade");
const planes = ["studio", "neon", "mesh"];
const exportContracts = process.argv.includes("--export");
const contractKind = exportContracts ? "export" : "record";
const contractFile = exportContracts ? "14_entity_export_contracts.sql" : "13_entity_record_contracts.sql";
const expectedCount = exportContracts ? "5" : "6";
const driftCode = exportContracts ? "records_export_requested" : "records_record_created";
const name = `20260930_entity_${contractKind}_audit_contracts.sql`;
const migration = readFileSync(
  join(root, "server/db/migrations", name),
  "utf8",
);
const report = {
  startedAt: new Date().toISOString(),
  fixture: `canonical-audit-contract-table-before-${contractKind}-contracts`,
  migration: name,
  sha256: createHash("sha256").update(migration).digest("hex"),
  passed: false,
  checks: [],
};
const docker = (...args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
const sql = (database, input) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      target,
      "psql",
      "-X",
      "-h",
      "127.0.0.1",
      "-U",
      "postgres",
      "-d",
      database,
      "-v",
      "ON_ERROR_STOP=1",
      "-Atq",
    ],
    { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
const runner = () =>
  spawnSync(
    "docker",
    [
      "exec",
      "-e",
      "PGHOST=127.0.0.1",
      "-e",
      "ATHYPER_POSTGRES_PASSWORD_FILE=/app/migrations/password",
      target,
      "sh",
      "/runner.sh",
    ],
    { encoding: "utf8" },
  );
try {
  mkdirSync(join(scratch, "manifests"));
  writeFileSync(join(scratch, "password"), "disposable-test-only\n");
  writeFileSync(join(scratch, name), migration);
  writeFileSync(join(scratch, "manifests/runner-transactions.sha256"), "");
  for (const plane of planes)
    writeFileSync(join(scratch, `manifests/${plane}.txt`), name + "\n");
  docker(
    "run",
    "-d",
    "--name",
    target,
    "--network",
    "none",
    "--tmpfs",
    "/var/lib/postgresql/data",
    "--label",
    "athyper.purpose=entity-upgrade-qualification",
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "-v",
    `${scratch}:/app/migrations:ro`,
    "-v",
    `${join(root, "server/db/runtime/run-forward-migrations.sh")}:/runner.sh:ro`,
    "postgres:16.13-bookworm",
  );
  for (let attempt = 0; ; attempt++) {
    try {
      sql("postgres", "SELECT 1");
      break;
    } catch (error) {
      if (attempt >= 60) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  const domains = readFileSync(
    join(root, "server/db/ddl/common/audit/02_domains.sql"),
    "utf8",
  ).replace(/^\uFEFF/, "");
  const table = readFileSync(
    join(root, "server/db/ddl/common/audit/03_tables.sql"),
    "utf8",
  ).match(/CREATE TABLE master\.audit_event_contract \([\s\S]*?\n\);/)[0];
  for (const plane of planes) {
    sql("postgres", `CREATE DATABASE athyper_${plane}`);
    // Only the UUID default is substituted; catalogue columns, domains and
    // constraints come from canonical DDL, not a permissive mock table.
    sql(
      `athyper_${plane}`,
      `CREATE SCHEMA master; CREATE SCHEMA audit; ${domains}\n${table.replace("shared.uuidv7()", "gen_random_uuid()")}
      INSERT INTO master.audit_event_contract(code,event_code_pattern,allowed_operations,allowed_actor_types)
      VALUES('existing_contract','^existing$',ARRAY['execute']::audit.operation_d[],ARRAY['user']::audit.actor_type_d[]);`,
    );
  }
  const canonical = readFileSync(
    join(root, `server/db/ddl/common/audit/${contractFile}`),
    "utf8",
  );
  assert.ok(
    migration.includes(
      canonical.slice(canonical.indexOf(`DO $entity_${contractKind}_contracts$`)).trim(),
    ),
    "Upgrade must preserve the canonical contract seed",
  );
  let result = runner();
  assert.equal(result.status, 0, result.stderr);
  for (const plane of planes) {
    assert.equal(
      sql(
        `athyper_${plane}`,
        `SELECT count(*) FROM master.audit_event_contract WHERE code LIKE 'records_${contractKind}_%' AND capture_mode='metadata' AND allowed_scope='tenant' AND status='active'`,
      ),
      expectedCount,
    );
    assert.equal(
      sql(
        `athyper_${plane}`,
        "SELECT count(*) FROM master.audit_event_contract WHERE code='existing_contract'",
      ),
      "1",
    );
    assert.equal(
      sql(
        `athyper_${plane}`,
        "SELECT count(*) FROM master.audit_event_contract WHERE 'records.record.unknown' ~ event_code_pattern",
      ),
      "0",
    );
    report.checks.push(
      `${plane}: existing schema upgraded, unrelated contract preserved, unknown event denied`,
    );
  }
  sql("athyper_neon", `SET app.database_plane='neon'; ${canonical}`);
  sql(
    "athyper_neon",
    `UPDATE master.audit_event_contract SET priority=25 WHERE code='${driftCode}'`,
  );
  assert.throws(
    () => sql("athyper_neon", `SET app.database_plane='neon'; ${canonical}`),
    /contract drift/,
  );
  sql(
    "athyper_neon",
    `UPDATE master.audit_event_contract SET priority=24 WHERE code='${driftCode}'`,
  );
  assert.throws(
    () => sql("athyper_neon", `SET app.database_plane='wrong'; ${canonical}`),
    /exact plane/,
  );
  report.checks.push(
    "canonical seed replay, drift refusal and wrong-plane refusal",
  );
  result = runner();
  assert.equal(result.status, 0, result.stderr);
  assert.equal((result.stdout.match(/already applied/g) ?? []).length, 3);
  report.checks.push("receipt-bound idempotent replay on all planes");
  writeFileSync(join(scratch, name), migration + "\n-- checksum probe\n");
  result = runner();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /checksum differs/);
  writeFileSync(join(scratch, name), migration);
  report.checks.push("changed migration checksum rejected");
  writeFileSync(
    join(scratch, "failure.sql"),
    "BEGIN; CREATE TABLE public.must_rollback(id integer); SELECT 1/0; COMMIT;\n",
  );
  writeFileSync(
    join(scratch, "manifests/studio.txt"),
    name + "\nfailure.sql\n",
  );
  result = runner();
  assert.notEqual(result.status, 0);
  assert.equal(
    sql("athyper_studio", "SELECT to_regclass('public.must_rollback') IS NULL"),
    "t",
  );
  assert.equal(
    sql(
      "athyper_studio",
      "SELECT status FROM public.athyper_schema_migration_v1 WHERE migration_name='failure.sql'",
    ),
    "failed",
  );
  result = runner();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /operator resolution is required/);
  report.checks.push(
    "failed upgrade rolls back schema changes and blocks blind retry",
  );
  report.passed = true;
} catch (error) {
  report.error = error.message;
  process.exitCode = 1;
} finally {
  const cleanup = spawnSync("docker", ["rm", "-f", target], {
    stdio: "ignore",
  });
  report.cleanedUp = cleanup.status === 0;
  if (!report.cleanedUp) {
    report.passed = false;
    process.exitCode = 1;
  }
  rmSync(scratch, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  writeFileSync(
    join(output, "summary.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
  console.log(`Evidence: ${join(output, "summary.json")}`);
}
