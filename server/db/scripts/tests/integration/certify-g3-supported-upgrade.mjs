#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { dirname, posix, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
const root = resolve(import.meta.dirname, "../../../../.."),
  dbRoot = resolve(root, "server/db"),
  baseline = JSON.parse(
    readFileSync(
      resolve(dbRoot, "migrations/baselines/2026-09-03.v1.json"),
      "utf8",
    ),
  ),
  container = "athyper-bs360-g3-supported-upgrade",
  password = randomBytes(24).toString("hex");
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
    "athyper.purpose=business-partner-360-integration-baseline",
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
  const port = publishedPort(),
    url = `postgresql://postgres:${password}@127.0.0.1:${port}/athyper_mesh`;
  run("node", [
    "server/db/scripts/tests/integration/certify-g3-mesh-lifecycle.mjs",
    `--mesh-database-url=${url}`,
    "--output=docs/architecture/reports/g3-upgrade-mesh-lifecycle-certification.json",
  ]);
  process.stdout.write(
    `G3_SUPPORTED_UPGRADE_OK baseline=${baseline.baselineVersion}\n`,
  );
} finally {
  if (capture("docker", ["ps", "-aq", "-f", `name=^${container}$`]).trim())
    run("docker", ["rm", "-f", container], {}, true);
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
    .replace(/^\s*\\ir\s+(.+?)\s*$/gmu, (_line, raw) => {
      const name = String(raw)
        .trim()
        .replace(/^["']|["']$/gu, "");
      return `\n-- ${label} -> ${name}\n${load(name)}\n`;
    });
}
function sql(source) {
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
      input: `SELECT set_config('app.database_plane','mesh',false);\nSELECT set_config('app.current_principal_id','00000000-0000-0000-0000-000000000000',false);\n${source}`,
      encoding: "utf8",
      stdio: ["pipe", "ignore", "pipe"],
      maxBuffer: 256 * 1024 * 1024,
    },
  );
  if (result.status !== 0) throw new Error(String(result.stderr).slice(-6000));
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
    throw new Error(`${command} failed: ${String(result.stderr).slice(-6000)}`);
}
function capture(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command} failed`);
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
