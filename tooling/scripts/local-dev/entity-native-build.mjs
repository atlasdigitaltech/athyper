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

import {
  buildCleanupPlan,
  validateCleanupScope,
} from "./entity-cleanup-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const container = "athyper-dev-db-1";
const database = "athyper_studio";
export function parseArguments(args) {
  const result = { mode: "inspect" };
  let seen = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--") continue;
    if (args[i] === "--scope" && !result.scope) {
      result.scope = args[++i];
      if (!result.scope) throw Error("LOCAL_BUILD_SCOPE_REQUIRED");
      continue;
    }
    if (args[i] !== "--mode" || seen)
      throw Error("LOCAL_BUILD_ARGUMENT_INVALID");
    result.mode = args[++i];
    seen = true;
  }
  if (
    !["inspect", "backup-verify", "verify", "reset", "plan-cleanup"].includes(
      result.mode,
    )
  )
    throw Error("LOCAL_BUILD_MODE_INVALID");
  if ((result.mode === "plan-cleanup") !== Boolean(result.scope))
    throw Error("LOCAL_BUILD_SCOPE_REQUIRED");
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

async function execute(mode, directory, report, scope) {
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
  if (mode === "plan-cleanup") {
    const plan = await createCleanupPlan(scope);
    writeJson(join(directory, "cleanup-plan.json"), plan);
    report.stages.push({
      id: "cleanup-dispositions",
      status: plan.blockers.length ? "blocked" : "passed",
      candidateRows: plan.candidateRows,
      tables: plan.tables.length,
      blockers: plan.blockers.length,
      executable: false,
      logicalDependencies: "not-established",
    });
    report.ready = false;
    return;
  }
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
function literal(value) {
  return "'" + String(value).replaceAll("'", "''") + "'";
}
async function createCleanupPlan(scope) {
  const keys = new Map(
    jsonQuery(
      database,
      `SELECT n.nspname AS schema,c.relname AS name,
    array_agg(a.attname ORDER BY u.ord) AS columns FROM pg_constraint p
    JOIN pg_class c ON c.oid=p.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN LATERAL unnest(p.conkey) WITH ORDINALITY u(attnum,ord)
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=u.attnum
    WHERE p.contype='p' GROUP BY n.nspname,c.relname`,
    ).map((t) => [t.schema + "." + t.name, t.columns]),
  );
  const table = (schema, name) =>
    quoteIdentifier(schema) + "." + quoteIdentifier(name);
  const tuple = (schema, name, alias) => {
    const columns = keys.get(schema + "." + name);
    if (!columns?.length)
      throw Error("CLEANUP_PRIMARY_KEY_REQUIRED:" + schema + "." + name);
    return (
      "jsonb_build_array(" +
      columns
        .map((c) => alias + "." + quoteIdentifier(c) + "::text")
        .join(",") +
      ")"
    );
  };
  const columns = new Map(
    jsonQuery(
      database,
      `SELECT n.nspname AS schema,c.relname AS name,array_agg(a.attname ORDER BY a.attnum) AS columns
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    WHERE c.relkind IN ('r','p') GROUP BY n.nspname,c.relname`,
    ).map((t) => [t.schema + "." + t.name, t.columns]),
  );
  const scopeIds = scope.entityIds.map(literal).join(",");
  const entities = jsonQuery(
    database,
    `SELECT id FROM metadata.entity WHERE id IN (${scopeIds})
    AND tenant_id IS NULL AND ownership_model='system'`,
  );
  if (entities.length !== scope.entityIds.length)
    throw Error("CLEANUP_PRODUCT_SCOPE_MISMATCH");
  return buildCleanupPlan(scope, {
    async edges() {
      return jsonQuery(
        database,
        `SELECT ns.nspname AS "sourceSchema",s.relname AS "sourceTable",
      nt.nspname AS "targetSchema",t.relname AS "targetTable",c.conname AS name,
      ARRAY(SELECT a.attname FROM unnest(c.conkey) WITH ORDINALITY u(num,ord) JOIN pg_attribute a ON a.attrelid=s.oid AND a.attnum=u.num ORDER BY u.ord) AS "sourceColumns",
      ARRAY(SELECT a.attname FROM unnest(c.confkey) WITH ORDINALITY u(num,ord) JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=u.num ORDER BY u.ord) AS "targetColumns"
      FROM pg_constraint c JOIN pg_class s ON s.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=s.relnamespace
      JOIN pg_class t ON t.oid=c.confrelid JOIN pg_namespace nt ON nt.oid=t.relnamespace
      WHERE c.contype='f' ORDER BY ns.nspname,s.relname,c.conname`,
      );
    },
    async roots(name) {
      return jsonQuery(
        database,
        `SELECT ${tuple("metadata", name, "r")} AS key
      FROM ${table("metadata", name)} r WHERE r.entity_id IN (${scopeIds}) AND r.tenant_id IS NULL ORDER BY key`,
      ).map((r) => r.key);
    },
    async children(edge, parentKeys) {
      const result = [];
      for (let offset = 0; offset < parentKeys.length; offset += 100) {
        const tuples = parentKeys
          .slice(offset, offset + 100)
          .map((k) => literal(JSON.stringify(k)) + "::jsonb")
          .join(",");
        const join = edge.sourceColumns
          .map(
            (c, i) =>
              "c." +
              quoteIdentifier(c) +
              "=p." +
              quoteIdentifier(edge.targetColumns[i]),
          )
          .join(" AND ");
        // PostgreSQL FK equality skips null child keys. Join equality preserves that behavior.
        const attrs =
          columns.get(edge.sourceSchema + "." + edge.sourceTable) ?? [];
        const fences = [];
        if (attrs.includes("entity_id"))
          fences.push(`c.entity_id IN (${scopeIds})`);
        if (attrs.includes("change_set_id"))
          fences.push(
            `EXISTS(SELECT 1 FROM metadata.entity_change_set owned WHERE owned.id=c.change_set_id AND owned.entity_id IN (${scopeIds}) AND owned.tenant_id IS NULL)`,
          );
        if (attrs.includes("tenant_id")) fences.push("c.tenant_id IS NULL");
        // Metadata rows without a declared owner require explicit disposition,
        // even when an FK points into an obsolete graph.
        if (
          edge.sourceSchema === "metadata" &&
          !attrs.includes("entity_id") &&
          !attrs.includes("change_set_id")
        )
          fences.push("false");
        const scoped = fences.length
          ? "(" + fences.join(" AND ") + ") IS TRUE"
          : "true";
        result.push(
          ...jsonQuery(
            database,
            `SELECT DISTINCT ${tuple(edge.sourceSchema, edge.sourceTable, "c")} AS key, ${scoped} AS scoped
          FROM ${table(edge.sourceSchema, edge.sourceTable)} c JOIN ${table(edge.targetSchema, edge.targetTable)} p ON ${join}
          WHERE ${tuple(edge.targetSchema, edge.targetTable, "p")} IN (${tuples}) ORDER BY key`,
          ),
        );
      }
      return result;
    },
  });
}

export async function main(args) {
  const { mode, scope: scopePath } = parseArguments(args);
  const scope = scopePath
    ? validateCleanupScope(JSON.parse(readFileSync(resolve(scopePath), "utf8")))
    : undefined;
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
    await execute(mode, directory, report, scope);
  } catch (error) {
    report.ready = false;
    report.error = error.message;
  }
  report.finishedAt = new Date().toISOString();
  writeJson(join(directory, "result.json"), report);
  process.stdout.write(
    JSON.stringify({ directory, ...report }, null, 2) + "\n",
  );
  return report.error ||
    report.stages.some(
      (stage) =>
        stage.id === "cleanup-dispositions" && stage.status === "blocked",
    ) ||
    (mode === "verify" && !report.ready)
    ? 1
    : 0;
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
