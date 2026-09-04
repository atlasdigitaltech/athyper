#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { dirname, posix, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
const root = resolve(import.meta.dirname, "../../../../.."),
  dbRoot = resolve(root, "server/db"),
  baseline = JSON.parse(
    readFileSync(
      resolve(dbRoot, "migrations/baselines/2026-09-03.v1.json"),
      "utf8",
    ),
  ),
  container = "athyper-bs360-g4-supported-upgrade",
  password = randomBytes(24).toString("hex"),
  migrationKey = randomBytes(48).toString("hex"),
  raw = "GB29NWBK60161331926819",
  ids = {
    tenant: randomUUID(),
    actor: randomUUID(),
    account: randomUUID(),
    bank: randomUUID(),
  },
  report =
    "docs/architecture/reports/g4-upgrade-data-protection-certification.json";
assert.equal(baseline.contractVersion, "athyper.database-upgrade-baseline.v1");
if (capture("docker", ["ps", "-aq", "-f", `name=^${container}$`]).trim())
  throw new Error(`refusing existing container ${container}`);
try {
  run("docker", [
    "run",
    "-d",
    "--name",
    container,
    "--label",
    "athyper.environment=disposable_local",
    "--label",
    "athyper.purpose=governed-lifecycle-g4-supported-upgrade",
    "-p",
    "127.0.0.1::5432",
    "-e",
    `POSTGRES_PASSWORD=${password}`,
    "postgres:16.13-bookworm",
  ]);
  await waitFor(
    () =>
      spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres"], {
        stdio: "ignore",
      }).status === 0,
    60000,
  );
  admin(
    readFileSync(
      resolve(dbRoot, "ddl/common/_database/01_service_roles.sql"),
      "utf8",
    ),
  );
  run("docker", [
    "exec",
    container,
    "createdb",
    "-U",
    "postgres",
    "athyper_mesh",
  ]);
  for (const entry of entries(
    gitShow(`${baseline.gitRevision}:server/db/ddl/planes/mesh/_manifest.txt`),
  ))
    sql(expandGit(`server/db/ddl/${entry}`, new Set()));
  for (const migration of baseline.planes.mesh.forwardMigrations)
    sql(expandCurrent(resolve(dbRoot, "migrations", migration), new Set()));
  sql(
    expandCurrent(
      resolve(dbRoot, "migrations/20260904_mesh_governed_lifecycle_g3.sql"),
      new Set(),
    ),
  );
  seedHistorical();
  const g4Migration = expandCurrent(
    resolve(
      dbRoot,
      "migrations/20260904_mesh_bank_protected_value_upgrade.sql",
    ),
    new Set(),
  );
  let failClosed = false;
  try {
    sql(`BEGIN;\n${g4Migration}\nCOMMIT;`);
  } catch (error) {
    failClosed = String(error).includes("G4_VAULT_MIGRATION_KEY_REQUIRED");
  }
  assert.equal(failClosed, true);
  sql(
    g4Migration,
    `SELECT set_config('app.g4_bank_migration_key','${migrationKey}',false);`,
  );
  const converted = capture("docker", [
    "exec",
    container,
    "psql",
    "-X",
    "-U",
    "postgres",
    "-d",
    "athyper_mesh",
    "-At",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `SELECT (to_regclass('mesh.bank_account') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='mesh' AND table_name='bank_account' AND column_name='account_id_value') AND public.pgp_sym_decrypt(decode(substr(protected_value_token,8),'hex'),'${migrationKey}')='${raw}' AND identifier_fingerprint~'^[a-f0-9]{64}$' AND account_last4='6819') FROM mesh.bank_account WHERE id='${ids.bank}'`,
  ]).trim();
  assert.equal(converted, "t");
  sql(
    `SET session_replication_role=replica;DELETE FROM mesh.bank_account WHERE id='${ids.bank}';DELETE FROM mesh.network_account WHERE id='${ids.account}';DELETE FROM master.principal WHERE id='${ids.actor}';DELETE FROM master.tenant WHERE id='${ids.tenant}';SET session_replication_role=origin;`,
  );
  const port = publishedPort(),
    url = `postgresql://postgres:${password}@127.0.0.1:${port}/athyper_mesh`;
  run("node", [
    "server/db/scripts/tests/integration/certify-g4-data-protection.mjs",
    `--mesh-database-url=${url}`,
    `--output=${report}`,
  ]);
  const evidence = JSON.parse(readFileSync(resolve(root, report), "utf8"));
  evidence.supportedUpgrade = {
    baselineVersion: baseline.baselineVersion,
    populatedLegacyRows: 1,
    rawColumnRemoved: true,
    encryptedValueRoundTripVerified: true,
    migrationKeyPersisted: false,
    missingKeyRejected: true,
  };
  writeFileSync(
    resolve(root, report),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  process.stdout.write(
    `G4_SUPPORTED_UPGRADE_OK baseline=${baseline.baselineVersion} populatedLegacyRows=1\n`,
  );
} finally {
  if (capture("docker", ["ps", "-aq", "-f", `name=^${container}$`]).trim())
    run("docker", ["rm", "-f", container], true);
}
function seedHistorical() {
  sql(
    `SET session_replication_role=replica;INSERT INTO master.tenant(id,code,name,display_name,realm_key,status,created_by)VALUES('${ids.tenant}','g4upgrade_${ids.tenant.slice(0, 8)}','G4 upgrade','G4 upgrade','g4upgrade_${ids.tenant.slice(0, 8)}','active','${ids.tenant}');INSERT INTO master.principal(id,tenant_id,code,name,principal_type,status,created_by)VALUES('${ids.actor}','${ids.tenant}','g4.upgrade','G4 upgrade','user','active','${ids.actor}');INSERT INTO mesh.network_account(id,tenant_id,account_code,display_name,network_role,status,created_by)VALUES('${ids.account}','${ids.tenant}','g4upgrade.${ids.account.slice(0, 8)}','G4 upgrade','supplier','active','${ids.actor}');INSERT INTO mesh.bank_account(id,tenant_id,network_account_id,account_holder_name,account_id_type,account_id_value,account_last4,currency_code,bank_name_override,bank_country_override,is_verified,verified_at,verified_by,verification_method,status,created_by)VALUES('${ids.bank}','${ids.tenant}','${ids.account}','G4 Legacy','iban','${raw}','6819','MYR','Example Bank','MY',true,clock_timestamp(),'${ids.actor}','manual','active','${ids.actor}');SET session_replication_role=origin;`,
  );
}
function expandGit(path, stack) {
  const value = posix.normalize(path);
  if (!value.startsWith("server/db/ddl/") || stack.has(value))
    throw new Error(`invalid baseline include ${value}`);
  stack.add(value);
  try {
    return includes(gitShow(`${baseline.gitRevision}:${value}`), value, (x) =>
      expandGit(posix.join(posix.dirname(value), x), stack),
    );
  } finally {
    stack.delete(value);
  }
}
function expandCurrent(path, stack) {
  const value = resolve(path);
  if (!value.startsWith(`${dbRoot}/`) || stack.has(value))
    throw new Error(`invalid current include ${value}`);
  stack.add(value);
  try {
    return includes(readFileSync(value, "utf8"), value, (x) =>
      expandCurrent(resolve(dirname(value), x), stack),
    );
  } finally {
    stack.delete(value);
  }
}
function includes(source, label, load) {
  return source
    .replace(/^\uFEFF/u, "")
    .replace(/^\s*\\ir\s+(.+?)\s*$/gmu, (_line, rawValue) => {
      const name = String(rawValue)
        .trim()
        .replace(/^["']|["']$/gu, "");
      return `\n-- ${label} -> ${name}\n${load(name)}\n`;
    });
}
function sql(source, prefix = "") {
  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-U",
      "postgres",
      "-d",
      "athyper_mesh",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    {
      input: `SELECT set_config('app.database_plane','mesh',false);SELECT set_config('app.current_principal_id','00000000-0000-0000-0000-000000000000',false);${prefix}\n${source}`,
      encoding: "utf8",
      stdio: ["pipe", "ignore", "pipe"],
      maxBuffer: 256 * 1024 * 1024,
    },
  );
  if (result.status !== 0) throw new Error(String(result.stderr).slice(-8000));
}
function admin(source) {
  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: source, encoding: "utf8", stdio: ["pipe", "ignore", "pipe"] },
  );
  if (result.status !== 0) throw new Error(String(result.stderr));
}
function gitShow(spec) {
  const result = spawnSync("git", ["show", spec], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(String(result.stderr));
  return result.stdout;
}
function entries(source) {
  return source
    .split(/\r?\n/u)
    .map((x) => x.trim())
    .filter((x) => x && !x.startsWith("#"));
}
function publishedPort() {
  const match = capture("docker", ["port", container, "5432/tcp"])
    .trim()
    .match(/:(\d+)$/);
  if (!match) throw new Error("missing port");
  return match[1];
}
function run(command, args, quiet = false) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: quiet ? ["ignore", "ignore", "pipe"] : "inherit",
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error(`${command} failed: ${String(result.stderr).slice(-8000)}`);
}
function capture(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0)
    throw new Error(`${command} failed: ${String(result.stderr).slice(-2000)}`);
  return result.stdout;
}
async function waitFor(probe, timeout) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (probe()) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("PostgreSQL timeout");
}
