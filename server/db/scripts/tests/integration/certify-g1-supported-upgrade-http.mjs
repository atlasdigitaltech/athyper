#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { dirname, posix, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const repositoryRoot = resolve(import.meta.dirname, "../../../../.."),
  databaseRoot = resolve(repositoryRoot, "server/db");
const baseline = JSON.parse(
  readFileSync(
    resolve(databaseRoot, "migrations/baselines/2026-09-03.v1.json"),
    "utf8",
  ),
);
const container = "athyper-bs360-g1-supported-upgrade",
  password = randomBytes(24).toString("hex"),
  planes = ["studio", "neon", "mesh"];
assert.equal(baseline.contractVersion, "athyper.database-upgrade-baseline.v1");
if (capture("docker", ["ps", "-aq", "-f", `name=^${container}$`]).trim())
  throw new Error(`refusing to replace existing container ${container}`);

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
    60_000,
    "PostgreSQL",
  );
  applyAdminSql(
    readFileSync(
      resolve(databaseRoot, "ddl/common/_database/01_service_roles.sql"),
      "utf8",
    ),
  );
  for (const plane of planes)
    run("docker", [
      "exec",
      container,
      "createdb",
      "-U",
      "postgres",
      `athyper_${plane}`,
    ]);
  for (const plane of planes) {
    const manifest = gitShow(
      `${baseline.gitRevision}:server/db/ddl/planes/${plane}/_manifest.txt`,
    );
    for (const entry of entries(manifest))
      applySql(plane, expandGitSql(`server/db/ddl/${entry}`, new Set()));
    if (plane === "neon") restoreMigrationOnlyWorkforceIamProjection();
    for (const migration of baseline.planes[plane].forwardMigrations)
      applySql(
        plane,
        expandCurrentSql(
          resolve(databaseRoot, "migrations", migration),
          new Set(),
        ),
      );
  }
  const port = publishedPort(container),
    url = (plane) =>
      `postgresql://postgres:${password}@127.0.0.1:${port}/athyper_${plane}`;
  const environment = {
    ATHYPER_ENV: "local",
    ATHYPER_PLATFORM_DATABASE_ADMIN_URL: url("studio"),
    ATHYPER_NEON_DATABASE_ADMIN_URL: url("neon"),
    ATHYPER_MESH_DATABASE_ADMIN_URL: url("mesh"),
  };
  run(
    "pnpm",
    [
      "--dir",
      "server/db",
      "exec",
      "tsx",
      "scripts/provisioning/provision-three-plane.ts",
      "--apply",
      "--skip-foundation",
      "--skip-keycloak",
    ],
    environment,
    true,
  );
  run(
    "pnpm",
    [
      "--dir",
      "server/db",
      "exec",
      "tsx",
      "scripts/provisioning/provision-development-business-partner-fixtures.ts",
      "--confirm=LOCAL-NEON-BUSINESS-PARTNER-FIXTURES",
    ],
    environment,
    true,
  );
  run(
    "node",
    ["server/db/scripts/tests/integration/governed-entity-case-foundation.mjs"],
    environment,
  );
  run(
    "node",
    [
      "--import",
      "tsx",
      "server/db/scripts/tests/integration/governed-internal-business-partner-http.mjs",
    ],
    { DATABASE_URL: url("neon") },
  );
  process.stdout.write(
    `G1_GOVERNED_INTERNAL_BUSINESS_PARTNER_SUPPORTED_UPGRADE_HTTP_OK baseline=${baseline.baselineVersion}\n`,
  );
} finally {
  if (capture("docker", ["ps", "-aq", "-f", `name=^${container}$`]).trim())
    run("docker", ["rm", "-f", container], {}, true, false);
}

function expandGitSql(path, stack) {
  const normalized = posix.normalize(path);
  if (!normalized.startsWith("server/db/ddl/"))
    throw new Error(`baseline include escapes DDL root: ${path}`);
  if (stack.has(normalized))
    throw new Error(`recursive baseline SQL include: ${normalized}`);
  stack.add(normalized);
  try {
    return expandIncludes(
      gitShow(`${baseline.gitRevision}:${normalized}`),
      normalized,
      (include) =>
        expandGitSql(posix.join(posix.dirname(normalized), include), stack),
    );
  } finally {
    stack.delete(normalized);
  }
}
function expandCurrentSql(path, stack) {
  const normalized = resolve(path);
  if (!normalized.startsWith(`${databaseRoot}/`))
    throw new Error(`current include escapes database root: ${path}`);
  if (stack.has(normalized))
    throw new Error(`recursive current SQL include: ${normalized}`);
  stack.add(normalized);
  try {
    return expandIncludes(
      readFileSync(normalized, "utf8"),
      normalized,
      (include) =>
        expandCurrentSql(resolve(dirname(normalized), include), stack),
    );
  } finally {
    stack.delete(normalized);
  }
}
function expandIncludes(source, label, load) {
  return source
    .replace(/^\uFEFF/u, "")
    .replace(/^\s*\\ir\s+(.+?)\s*$/gmu, (_line, raw) => {
      const include = String(raw)
        .trim()
        .replace(/^["']|["']$/gu, "");
      return `\n-- begin included SQL ${label} -> ${include}\n${load(include)}\n-- end included SQL ${include}\n`;
    });
}
function restoreMigrationOnlyWorkforceIamProjection() {
  const source = gitShow(
      `${baseline.gitRevision}:server/db/migrations/20260829_neon_workforce_lifecycle.sql`,
    ),
    patterns = [
      /CREATE TABLE document\.workforce_iam_projection \([\s\S]*?\n\);/u,
      /^COMMENT ON TABLE document\.workforce_iam_projection .*;$/mu,
      /ALTER TABLE document\.workforce_iam_projection ENABLE ROW LEVEL SECURITY;/u,
      /ALTER TABLE document\.workforce_iam_projection FORCE ROW LEVEL SECURITY;/u,
      /CREATE POLICY workforce_iam_projection_tenant[^;]*;/u,
      /GRANT SELECT,INSERT,UPDATE ON document\.workforce_iam_projection TO athyperapp;/u,
    ],
    statements = patterns.map((pattern) => source.match(pattern)?.[0]);
  if (statements.some((value) => !value))
    throw new Error(
      "pinned baseline workforce IAM projection cannot be reconstructed",
    );
  applySql("neon", statements.join("\n"));
}
function applySql(plane, source) {
  const input = `SELECT set_config('app.database_plane','${plane}',false);\nSELECT set_config('app.current_principal_id','00000000-0000-0000-0000-000000000000',false);\n${source}`;
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
      `athyper_${plane}`,
      "-v",
      "ON_ERROR_STOP=1",
    ],
    {
      cwd: repositoryRoot,
      input,
      encoding: "utf8",
      stdio: ["pipe", "ignore", "pipe"],
      maxBuffer: 256 * 1024 * 1024,
    },
  );
  if (result.status !== 0)
    throw new Error(
      `${plane} SQL apply failed (${result.status ?? "unknown"}): ${String(result.stderr ?? "").slice(-6000)}`,
    );
}
function applyAdminSql(source) {
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
    {
      cwd: repositoryRoot,
      input: source,
      encoding: "utf8",
      stdio: ["pipe", "ignore", "pipe"],
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (result.status !== 0)
    throw new Error(
      `cluster prerequisite failed (${result.status ?? "unknown"}): ${String(result.stderr ?? "").slice(-4000)}`,
    );
}
function gitShow(specification) {
  const result = spawnSync("git", ["show", specification], {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error(
      `git show failed for ${specification}: ${String(result.stderr ?? "").slice(-2000)}`,
    );
  return result.stdout;
}
function entries(source) {
  return source
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}
function publishedPort(name) {
  const value = capture("docker", ["port", name, "5432/tcp"])
      .trim()
      .split("\n")[0],
    match = value?.match(/:(\d+)$/);
  if (!match) throw new Error("no published PostgreSQL port");
  return match[1];
}
function run(command, args, extraEnvironment = {}, quiet = false, fail = true) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: { ...process.env, ...extraEnvironment },
    stdio: quiet ? ["ignore", "ignore", "pipe"] : "inherit",
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.status !== 0 && fail)
    throw new Error(
      `${command} failed (${result.status ?? "unknown"}): ${String(result.stderr ?? "").slice(-6000)}`,
    );
  return result;
}
function capture(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (result.status !== 0)
    throw new Error(`${command} failed (${result.status ?? "unknown"})`);
  return result.stdout;
}
async function waitFor(probe, timeoutMs, name) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (probe()) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
  }
  throw new Error(`${name} did not become ready`);
}
