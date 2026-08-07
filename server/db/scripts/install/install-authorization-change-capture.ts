#!/usr/bin/env tsx
/**
 * Atomic retrofit installer for the Neon/Admin Wave 0 authorization capture.
 *
 * Dry-run is the default. Applying requires an explicit database identity and
 * approval ticket. The installer takes write-conflicting locks on every
 * registered source before it installs/replaces capture triggers, so the
 * commit that exposes the triggers is also the first post-freeze write
 * boundary. It does not take a snapshot or approve a migration run.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

interface Options {
  apply: boolean;
  allowLegacyMixedPlaneSource: boolean;
  expectedDatabase?: string;
  approvalTicket?: string;
  lockTimeoutMs: number;
  statementTimeoutMs: number;
}

interface CaptureSource {
  source_schema: string;
  source_table: string;
  capture_enabled: boolean;
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const databaseRoot = resolve(scriptDirectory, "../..");
const repositoryRoot = resolve(databaseRoot, "../..");
const orderedDdl = [
  "ddl/planes/neon/authz/03_tables.sql",
  "ddl/common/event/03_tables.sql",
  "ddl/common/event/05_constraints.sql",
  "ddl/planes/neon/authz/06_indexes.sql",
  "ddl/common/event/06_indexes.sql",
  "ddl/common/event/07_functions.sql",
  "ddl/common/event/08_triggers.sql",
  "ddl/common/event/09_views.sql",
  "ddl/planes/neon/authz/10_rls.sql",
  "ddl/common/event/10_rls.sql",
] as const;
const triggerFile = "ddl/common/event/08_triggers.sql";
const options = parseOptions(process.argv.slice(2));
const ddl = await Promise.all(orderedDdl.map(async (path) => {
  const sql = await readFile(resolve(databaseRoot, path), "utf8");
  return {
    path,
    sql,
    sha256: createHash("sha256").update(sql).digest("hex"),
  };
}));
const captureSourcePattern =
  /\('(?<schema>shared|master|control)',\s*'(?<table>[^']+)'\s*,\s*'[^']+'\s*,\s*ARRAY\[[^\]]+\]\s*,\s*(?:NULL|'[^']+')/g;
const controlDdl = ddl.find(
  (file) => file.path === "ddl/planes/neon/authz/03_tables.sql",
)?.sql ?? "";
const expectedCaptureSources = [...controlDdl.matchAll(captureSourcePattern)]
  .map((match) => `${match.groups?.schema}.${match.groups?.table}`)
  .sort();
if (
  expectedCaptureSources.length === 0 ||
  new Set(expectedCaptureSources).size !== expectedCaptureSources.length
) {
  throw new Error(
    "Versioned Neon capture-source registry is empty or contains duplicates.",
  );
}
const expectedCaptureSourceSetSha256 = createHash("sha256")
  .update(expectedCaptureSources.join("\n"))
  .digest("hex");

if (!options.apply) {
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    mode: "dry_run",
    mutatesDatabase: false,
    connectionEnvironment: "AUTHORIZATION_CAPTURE_DATABASE_URL or DATABASE_ADMIN_URL",
    requiredApplyArguments: [
      "--apply",
      "--expected-database=<exact name>",
      "--approval-ticket=<ticket>",
    ],
    lockMode: "SHARE ROW EXCLUSIVE",
    expectedCaptureSourceCount: expectedCaptureSources.length,
    expectedCaptureSourceSetSha256,
    orderedDdl: ddl.map(({ path, sha256 }) => ({ path, sha256 })),
  }, null, 2)}\n`);
  process.exit(0);
}

if (!options.expectedDatabase || !options.approvalTicket) {
  throw new Error(
    "--apply requires --expected-database=<exact name> and --approval-ticket=<ticket>.",
  );
}
const connectionString =
  process.env.AUTHORIZATION_CAPTURE_DATABASE_URL?.trim() ??
  process.env.DATABASE_ADMIN_URL?.trim();
if (!connectionString) {
  throw new Error(
    "AUTHORIZATION_CAPTURE_DATABASE_URL or DATABASE_ADMIN_URL is required for --apply.",
  );
}

const client = new pg.Client({
  connectionString,
  application_name: "wave0-authorization-capture-installer",
});

try {
  await client.connect();
  await client.query("BEGIN");
  await client.query(`SET LOCAL lock_timeout = '${options.lockTimeoutMs}ms'`);
  await client.query(
    `SET LOCAL statement_timeout = '${options.statementTimeoutMs}ms'`,
  );
  await client.query(
    "SELECT set_config('app.authorization_migration_approval_ticket', $1, true)",
    [options.approvalTicket],
  );

  const identity = (await client.query<{
    database_name: string;
    database_oid: string;
    required_schemas_present: boolean;
    mesh_schema_present: boolean;
  }>(`
    SELECT
      current_database() AS database_name,
      (SELECT oid::text FROM pg_database WHERE datname = current_database())
        AS database_oid,
      to_regnamespace('shared') IS NOT NULL
        AND to_regnamespace('master') IS NOT NULL
        AND to_regnamespace('control') IS NOT NULL
        AND to_regnamespace('event') IS NOT NULL
        AS required_schemas_present,
      to_regnamespace('mesh') IS NOT NULL
        OR to_regnamespace('mesh_control') IS NOT NULL
        OR to_regnamespace('mesh_log') IS NOT NULL
        AS mesh_schema_present
  `)).rows[0];
  if (!identity) throw new Error("Could not identify the target database.");
  if (identity.database_name !== options.expectedDatabase) {
    throw new Error(
      `Database identity mismatch: expected ${options.expectedDatabase}, got ${identity.database_name}.`,
    );
  }
  if (!identity.required_schemas_present) {
    throw new Error("Target is not a provisioned Neon/Admin database.");
  }
  if (identity.mesh_schema_present && !options.allowLegacyMixedPlaneSource) {
    throw new Error(
      "Source contains Mesh schemas; pass --allow-legacy-mixed-plane-source only for an approved one-time cleanup source.",
    );
  }

  for (const file of ddl) {
    if (file.path === triggerFile) {
      await lockRegisteredSources(client, expectedCaptureSources);
    }
    await client.query(file.sql);
  }

  const verification = (await client.query<{
    source_database_id: string;
    capture_contract_version: string;
    current_watermark: string;
    registered_source_count: string;
    invalid_source_count: string;
  }>(`
    WITH source_health AS (
      SELECT
        source.source_schema,
        source.source_table,
        relation.oid,
        row_trigger.tgenabled::text AS row_state,
        truncate_trigger.tgenabled::text AS truncate_state
      FROM control.authorization_capture_source AS source
      LEFT JOIN pg_namespace AS namespace
        ON namespace.nspname = source.source_schema
      LEFT JOIN pg_class AS relation
        ON relation.relnamespace = namespace.oid
       AND relation.relname = source.source_table
       AND relation.relkind IN ('r', 'p')
      LEFT JOIN pg_trigger AS row_trigger
        ON row_trigger.tgrelid = relation.oid
       AND row_trigger.tgname = 'trg_authz_wave0_capture_row'
       AND NOT row_trigger.tgisinternal
      LEFT JOIN pg_trigger AS truncate_trigger
        ON truncate_trigger.tgrelid = relation.oid
       AND truncate_trigger.tgname = 'trg_authz_wave0_capture_truncate'
       AND NOT truncate_trigger.tgisinternal
      WHERE source.capture_enabled
    )
    SELECT
      clock.source_database_id::text,
      clock.capture_contract_version,
      clock.current_watermark::text,
      count(*)::text AS registered_source_count,
      count(*) FILTER (
        WHERE health.oid IS NULL
           OR health.row_state IS DISTINCT FROM 'A'
           OR health.truncate_state IS DISTINCT FROM 'A'
      )::text AS invalid_source_count
    FROM event.authorization_capture_clock AS clock
    CROSS JOIN source_health AS health
    WHERE clock.singleton_id = 1
    GROUP BY
      clock.source_database_id,
      clock.capture_contract_version,
      clock.current_watermark
  `)).rows[0];
  if (
    !verification ||
    verification.invalid_source_count !== "0" ||
    Number(verification.registered_source_count) !== expectedCaptureSources.length
  ) {
    throw new Error(
      `Capture verification failed; invalid sources=${verification?.invalid_source_count ?? "unknown"}.`,
    );
  }

  await client.query("COMMIT");
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    mode: "applied",
    installedAt: new Date().toISOString(),
    approvalTicket: options.approvalTicket,
    legacyMixedPlaneSource: identity.mesh_schema_present,
    repositoryRoot: relative(process.cwd(), repositoryRoot) || ".",
    database: {
      name: identity.database_name,
      oid: identity.database_oid,
      sourceDatabaseId: verification.source_database_id,
    },
    captureContractVersion: verification.capture_contract_version,
    sourceWatermark: verification.current_watermark,
    registeredSourceCount: Number(verification.registered_source_count),
    captureSourceSetSha256: expectedCaptureSourceSetSha256,
    orderedDdl: ddl.map(({ path, sha256 }) => ({ path, sha256 })),
  }, null, 2)}\n`);
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await client.end().catch(() => undefined);
}

async function lockRegisteredSources(
  client: pg.Client,
  expectedSources: readonly string[],
): Promise<void> {
  const sources = (await client.query<CaptureSource>(`
    SELECT source_schema, source_table, capture_enabled
    FROM control.authorization_capture_source
    ORDER BY source_schema, source_table
  `)).rows;
  const actualSources = sources
    .map((source) => `${source.source_schema}.${source.source_table}`)
    .sort();
  const expected = [...expectedSources].sort();
  if (
    actualSources.length !== expected.length ||
    actualSources.some((source, index) => source !== expected[index])
  ) {
    const actualSet = new Set(actualSources);
    const expectedSet = new Set(expected);
    const missing = expected.filter((source) => !actualSet.has(source));
    const unexpected = actualSources.filter((source) => !expectedSet.has(source));
    throw new Error(
      "Live capture-source registry differs from the versioned source set; "
      + `missing=${missing.join(",") || "none"}; `
      + `unexpected=${unexpected.join(",") || "none"}.`,
    );
  }
  const disabled = sources
    .filter((source) => !source.capture_enabled)
    .map((source) => `${source.source_schema}.${source.source_table}`);
  if (disabled.length > 0) {
    throw new Error(
      `Versioned capture sources are disabled: ${disabled.join(", ")}.`,
    );
  }
  const qualified = sources.map((source) => {
    if (
      !/^[a-z][a-z0-9_]*$/.test(source.source_schema) ||
      !/^[a-z][a-z0-9_]*$/.test(source.source_table)
    ) {
      throw new Error(
        `Unsafe capture source identifier ${source.source_schema}.${source.source_table}.`,
      );
    }
    return `${quoteIdentifier(source.source_schema)}.${quoteIdentifier(source.source_table)}`;
  });
  await client.query(
    `LOCK TABLE ${qualified.join(", ")} IN SHARE ROW EXCLUSIVE MODE`,
  );
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function parseOptions(args: string[]): Options {
  const options: Options = {
    apply: false,
    allowLegacyMixedPlaneSource: false,
    lockTimeoutMs: 30_000,
    statementTimeoutMs: 300_000,
  };
  for (const argument of args) {
    if (argument === "--apply") options.apply = true;
    else if (argument === "--allow-legacy-mixed-plane-source") {
      options.allowLegacyMixedPlaneSource = true;
    }
    else if (argument === "--help") {
      process.stdout.write(
        "Usage: install-authorization-change-capture.ts "
        + "[--apply --expected-database=NAME --approval-ticket=TICKET] "
        + "[--allow-legacy-mixed-plane-source] "
        + "[--lock-timeout-ms=N] [--statement-timeout-ms=N]\n"
        + "Dry-run is the default and does not require a database connection.\n",
      );
      process.exit(0);
    } else if (argument.startsWith("--expected-database=")) {
      options.expectedDatabase = requiredValue(argument, "--expected-database=");
    } else if (argument.startsWith("--approval-ticket=")) {
      options.approvalTicket = requiredValue(argument, "--approval-ticket=");
    } else if (argument.startsWith("--lock-timeout-ms=")) {
      options.lockTimeoutMs = positiveInteger(argument, "--lock-timeout-ms=");
    } else if (argument.startsWith("--statement-timeout-ms=")) {
      options.statementTimeoutMs = positiveInteger(
        argument,
        "--statement-timeout-ms=",
      );
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function requiredValue(argument: string, prefix: string): string {
  const value = argument.slice(prefix.length).trim();
  if (!value) throw new Error(`${prefix.slice(0, -1)} requires a value.`);
  return value;
}

function positiveInteger(argument: string, prefix: string): number {
  const value = Number(requiredValue(argument, prefix));
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${prefix.slice(0, -1)} must be a positive integer.`);
  }
  return value;
}
