#!/usr/bin/env node
/** Local Entity build preparation. Never resets the source database implicitly. */
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const container = "athyper-dev-db-1";
const database = "athyper_studio";
export function parseArguments(args) {
  const result = { mode: "inspect" };
  let seen = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--") continue;
    if (args[i] !== "--mode" || seen)
      throw Error("LOCAL_BUILD_ARGUMENT_INVALID");
    result.mode = args[++i];
    seen = true;
  }
  if (!["inspect", "backup-verify", "verify", "reset"].includes(result.mode))
    throw Error("LOCAL_BUILD_MODE_INVALID");
  return result;
}
export function assertLocalTarget(value) {
  if (
    value.project !== "athyper-dev" ||
    value.service !== "db" ||
    value.database !== database
  )
    throw Error("LOCAL_BUILD_TARGET_INVALID");
}
export function quoteIdentifier(value) {
  if (typeof value !== "string" || !value || value.includes("\0"))
    throw Error("SQL_IDENTIFIER_INVALID");
  return '"' + value.replaceAll('"', '""') + '"';
}
export function summarizeDependencies(rows) {
  const inbound = rows.filter((row) => row.targetSchema === "metadata");
  return {
    touchingMetadata: rows.length,
    inbound: inbound.length,
    externalInbound: inbound.filter((row) => row.sourceSchema !== "metadata")
      .length,
    internal: inbound.filter((row) => row.sourceSchema === "metadata").length,
    outbound: rows.filter((row) => row.targetSchema !== "metadata").length,
  };
}
function run(args, options = {}) {
  const result = spawnSync(args[0], args.slice(1), {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0)
    throw Error(`LOCAL_BUILD_COMMAND_FAILED:${args[0]}:${args[1] ?? ""}`);
  return result.stdout;
}
function query(db, sql) {
  return run(
    [
      "docker",
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-d",
      db,
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    {
      input: `BEGIN READ ONLY; SET LOCAL statement_timeout='60s'; ${sql}; COMMIT;`,
    },
  ).trim();
}
function jsonQuery(db, sql) {
  return JSON.parse(
    query(db, `SELECT coalesce(json_agg(x),'[]'::json) FROM (${sql}) x`),
  );
}
export const dependencyQuery = `SELECT ns.nspname AS "sourceSchema",t.relname AS "sourceTable",
 nr.nspname AS "targetSchema",r.relname AS "targetTable",c.conname AS name,
 c.convalidated AS validated,pg_get_constraintdef(c.oid) AS definition
 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=t.relnamespace
 JOIN pg_class r ON r.oid=c.confrelid JOIN pg_namespace nr ON nr.oid=r.relnamespace
 WHERE c.contype='f' AND (ns.nspname='metadata' OR nr.nspname='metadata')
 ORDER BY ns.nspname,t.relname,c.conname`;
function inventory(db) {
  const dependencies = jsonQuery(db, dependencyQuery);
  const constraints = jsonQuery(
    db,
    `SELECT t.relname AS table_name,c.conname AS name,
    c.convalidated AS validated,pg_get_constraintdef(c.oid,true) AS definition,
    pg_get_constraintdef(c.oid) AS exact_definition
    FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='metadata'
    ORDER BY t.relname,c.conname`,
  );
  const tables = jsonQuery(
    db,
    `SELECT n.nspname AS schema,c.relname AS name
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind IN ('r','p') AND (n.nspname IN ('metadata','snapshot','publication','runtime_meta','entity_command_private')
    OR c.oid IN (SELECT conrelid FROM pg_constraint WHERE contype='f' AND confrelid IN
      (SELECT oid FROM pg_class WHERE relnamespace='metadata'::regnamespace)))
    ORDER BY n.nspname,c.relname`,
  );
  for (const table of tables)
    table.rows = query(
      db,
      `SELECT count(*) FROM ${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)}`,
    );
  const objects = jsonQuery(
    db,
    `SELECT n.nspname AS schema,c.relname AS name,c.relkind AS kind,
    c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls,c.relacl::text AS grants,
    CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid) ELSE NULL END AS view_definition
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('metadata','entity_command_private') ORDER BY n.nspname,c.relname`,
  );
  const routines = jsonQuery(
    db,
    `SELECT n.nspname AS schema,p.proname AS name,
    pg_get_function_identity_arguments(p.oid) AS arguments,md5(p.prosrc) AS body_hash,
    p.prosecdef AS security_definer,p.proacl::text AS grants
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('metadata','entity_command_private') ORDER BY n.nspname,p.proname,arguments`,
  );
  const triggers = jsonQuery(
    db,
    `SELECT c.relname AS table_name,t.tgname AS name,t.tgenabled AS enabled,
    pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    WHERE c.relnamespace='metadata'::regnamespace AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`,
  );
  const identities = jsonQuery(
    db,
    `SELECT id,entity_id,field_key,identity_status,introduced_change_set_id
    FROM metadata.entity_field_identity ORDER BY id`,
  );
  const drafts = jsonQuery(
    db,
    `SELECT id,entity_id,status,lock_version,native_core_layout_version
    FROM metadata.entity_change_set ORDER BY id`,
  );
  return {
    dependencies,
    summary: summarizeDependencies(dependencies),
    constraints,
    tables,
    objects,
    routines,
    triggers,
    identities,
    drafts,
  };
}
function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
}
export function restoreComparison(original, restored) {
  // PostgreSQL's pretty deparser normalizes redundant AND nesting on restore.
  // Preserve exact definitions separately; never strip SQL parentheses ourselves.
  // Live counts may change between inspection and pg_dump, so they are recorded,
  // not represented as a transaction-consistent comparison with the archive.
  const comparable = (key, rows) =>
    rows.map((row) => {
      if (key !== "constraints" || !row || typeof row !== "object") return row;
      const { exact_definition: _raw, ...definition } = row;
      return definition;
    });
  for (const key of ["dependencies", "constraints", "routines", "triggers"])
    if (
      JSON.stringify(comparable(key, original[key])) !==
      JSON.stringify(comparable(key, restored[key]))
    )
      throw Error(`LOCAL_BUILD_RESTORE_SCHEMA_MISMATCH:${key}`);
}

async function execute(mode, directory, report) {
  const labels = JSON.parse(
    run([
      "docker",
      "inspect",
      "--format",
      "{{json .Config.Labels}}",
      container,
    ]),
  );
  assertLocalTarget({
    project: labels["com.docker.compose.project"],
    service: labels["com.docker.compose.service"],
    database: query(database, "SELECT current_database()"),
  });
  report.stages.push({
    id: "target",
    status: "passed",
    database,
    container,
    role: "postgres",
    authority: "administrative-inspection-only",
  });
  const before = inventory(database);
  writeJson(join(directory, "inventory.json"), before);
  report.stages.push({
    id: "inventory",
    status: "passed",
    ...before.summary,
    pendingConstraints: before.constraints
      .filter((c) => c.name.endsWith("_native_pending_ck"))
      .map((c) => c.name),
    rowDisposition: "not-established",
    logicalDependencyClosure: "not-established",
  });
  if (mode === "backup-verify") {
    const archive = join(directory, "studio.dump");
    let fd = openSync(archive, "wx", 0o600);
    try {
      run(
        [
          "docker",
          "exec",
          container,
          "pg_dump",
          "-U",
          "postgres",
          "-d",
          database,
          "-Fc",
        ],
        { stdio: ["ignore", fd, "pipe"] },
      );
    } finally {
      closeSync(fd);
    }
    fd = openSync(join(directory, "globals.sql"), "wx", 0o600);
    try {
      run(
        [
          "docker",
          "exec",
          container,
          "pg_dumpall",
          "-U",
          "postgres",
          "--globals-only",
        ],
        { stdio: ["ignore", fd, "pipe"] },
      );
    } finally {
      closeSync(fd);
    }
    const temporary = "entity_restore_" + randomUUID().replaceAll("-", "");
    run([
      "docker",
      "exec",
      container,
      "createdb",
      "-U",
      "postgres",
      "-T",
      "template0",
      temporary,
    ]);
    report.temporaryDatabase = temporary;
    try {
      fd = openSync(archive, "r");
      try {
        run(
          [
            "docker",
            "exec",
            "-i",
            container,
            "pg_restore",
            "-U",
            "postgres",
            "--exit-on-error",
            "-d",
            temporary,
          ],
          { stdio: [fd, "pipe", "pipe"] },
        );
      } finally {
        closeSync(fd);
      }
      const restored = inventory(temporary);
      writeJson(join(directory, "restored-inventory.json"), restored);
      restoreComparison(before, restored);
      report.stages.push({
        id: "backup-restore",
        status: "passed",
        archiveSha256: createHash("sha256")
          .update(readFileSync(archive))
          .digest("hex"),
        restoredDatabase: temporary,
        scope: "Studio single-database restore; existing cluster roles reused",
        resetReadiness:
          "owner authorized scope; logical closure, quiescence and L1 not established",
      });
    } finally {
      run(["docker", "exec", container, "dropdb", "-U", "postgres", temporary]);
      report.temporaryDatabaseRemoved = true;
    }
  } else report.stages.push({ id: "backup-restore", status: "not-run" });
  report.stages.push({
    id: "L1-complete-graphs-startup",
    status: "blocked",
    code: "NATIVE_BUILD_L1_NOT_ESTABLISHED",
  });
  for (const id of [
    "reset",
    "bootstrap",
    "replay",
    "live-reads",
    "publication-activation",
  ])
    report.stages.push({ id, status: "not-run" });
  report.ready = false;
}
export async function main(args) {
  const { mode } = parseArguments(args);
  // No destructive implementation is exposed before graph/startup acceptance.
  if (mode === "reset")
    throw Error("LOCAL_RESET_BLOCKED:L1_AND_RESET_MANIFEST_NOT_ESTABLISHED");
  const directory = join(
    homedir(),
    ".athyper/instances/dev/workspace",
    "entity-native-build-" + randomUUID(),
  );
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const report = {
    schema: "entity.local-build-run/1",
    implementationHash: createHash("sha256")
      .update(readFileSync(fileURLToPath(import.meta.url)))
      .digest("hex"),
    mode,
    startedAt: new Date().toISOString(),
    revision: run(["git", "-C", root, "rev-parse", "HEAD"]).trim(),
    workingTreeChanged: Boolean(
      run([
        "git",
        "-C",
        root,
        "status",
        "--porcelain",
        "--untracked-files=no",
      ]).trim(),
    ),
    stages: [],
  };
  try {
    await execute(mode, directory, report);
  } catch (error) {
    report.ready = false;
    report.error = error.message;
  }
  report.finishedAt = new Date().toISOString();
  writeJson(join(directory, "result.json"), report);
  process.stdout.write(
    JSON.stringify({ directory, ...report }, null, 2) + "\n",
  );
  return report.error || (mode === "verify" && !report.ready) ? 1 : 0;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(error.message + "\n");
      process.exitCode = 1;
    });
