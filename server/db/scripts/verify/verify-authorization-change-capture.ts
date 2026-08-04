#!/usr/bin/env tsx
/**
 * Static by default; --live adds read-only catalog and stream reconciliation.
 *
 * This verifier never installs DDL and never exercises a source-table write.
 */

import { readFile, readdir } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const dbRoot = fileURLToPath(new URL("../../", import.meta.url));
const ddlRoot = resolve(dbRoot, "ddl");
const live = process.argv.includes("--live");
const unknownArgs = process.argv.slice(2).filter((arg) => arg !== "--live");
if (unknownArgs.length > 0) {
  throw new Error(`Unknown argument(s): ${unknownArgs.join(", ")}`);
}

let failures = 0;
function pass(message: string): void {
  process.stdout.write(`PASS ${message}\n`);
}
function fail(message: string): void {
  failures += 1;
  process.stderr.write(`FAIL ${message}\n`);
}
function expect(condition: boolean, message: string): void {
  if (condition) pass(message);
  else fail(message);
}

const files = {
  controlTables: resolve(ddlRoot, "control/01zzo_authorization_migration_controls.sql"),
  controlIndexes: resolve(ddlRoot, "control/04_authorization_migration_controls_indexes.sql"),
  controlRls: resolve(ddlRoot, "control/08_authorization_migration_controls_rls.sql"),
  eventTables: resolve(ddlRoot, "event/01g_authorization_change_capture.sql"),
  eventConstraints: resolve(ddlRoot, "event/03_authorization_change_capture_constraints.sql"),
  eventIndexes: resolve(ddlRoot, "event/04_authorization_change_capture_indexes.sql"),
  eventFunctions: resolve(ddlRoot, "event/05_authorization_change_capture_functions.sql"),
  eventTriggers: resolve(ddlRoot, "event/06_authorization_change_capture_triggers.sql"),
  eventViews: resolve(ddlRoot, "event/07_authorization_change_capture_views.sql"),
  eventRls: resolve(ddlRoot, "event/08_authorization_change_capture_rls.sql"),
} as const;

const sourceByName = new Map<string, string>();
for (const [name, path] of Object.entries(files)) {
  sourceByName.set(name, await readFile(path, "utf8"));
}
const source = (name: keyof typeof files): string => sourceByName.get(name) ?? "";
const combinedCaptureSql = [...sourceByName.values()].join("\n");
const executableCaptureSql = combinedCaptureSql.replace(/--.*$/gm, "");

expect(
  !/(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|FROM|JOIN)\s+event\.outbox\b/i
    .test(executableCaptureSql),
  "capture is independent of the mutable delivery outbox",
);
expect(
  source("eventTables").includes("authorization_capture_clock")
    && source("eventTables").includes("current_watermark"),
  "durable transactional source clock is declared",
);
expect(
  source("eventTables").includes(
    "set_config('app.authorization_capture_internal', 'on', true)",
  )
    && source("eventTables").includes(
      "set_config('app.authorization_capture_internal', 'off', true)",
    ),
  "repeat provisioning scopes the internal clock marker",
);
expect(
  source("eventFunctions").includes("UPDATE event.authorization_capture_clock")
    && source("eventFunctions").includes("txid_current()")
    && !source("eventFunctions").includes("nextval("),
  "capture allocates rollback-safe watermarks under the clock row lock",
);
expect(
  source("eventFunctions").includes("fn_authorization_capture_redact")
    && source("eventFunctions").includes("[REDACTED]")
    && source("eventTables").includes("privacy_redacted"),
  "privacy redaction occurs before capture persistence and hashing",
);
expect(
  source("eventTriggers").includes("AFTER INSERT OR UPDATE OR DELETE")
    && source("eventTriggers").includes("AFTER TRUNCATE")
    && (
      source("eventTriggers").match(
        /ENABLE ALWAYS TRIGGER trg_authz_wave0_capture_/g,
      )?.length ?? 0
    ) === 2,
  "row and TRUNCATE triggers are installed ENABLE ALWAYS",
);
expect(
  source("eventTriggers").includes("RAISE EXCEPTION")
    && source("eventTriggers").includes("undefined_column")
    && source("eventTriggers").includes("undefined_table"),
  "trigger installer fails closed for registry drift",
);
expect(
  source("eventFunctions").includes("SECURITY DEFINER")
    && source("eventFunctions").includes("REVOKE ALL ON FUNCTION")
    && source("eventRls").includes("REVOKE ALL ON TABLE"),
  "capture writes are security-definer/internal with PUBLIC privileges revoked",
);
expect(
  (source("eventRls").match(/FORCE ROW LEVEL SECURITY/g)?.length ?? 0) === 5
    && (source("controlRls").match(/FORCE ROW LEVEL SECURITY/g)?.length ?? 0) === 4,
  "all nine evidence/control tables force RLS",
);
expect(
  source("eventViews").includes("authorization_writer_registry")
    && source("eventViews").includes("matched.writer_key")
    && source("eventViews").includes("writer_match_count"),
  "legacy write telemetry resolves approved writers and rejects ambiguity",
);
expect(
  source("eventFunctions").includes("REPEATABLE READ")
    && source("eventFunctions").includes("first_watermark > W0"),
  "snapshot marker documents a durable W0 replay protocol",
);

const phaseFiles = [
  files.controlIndexes,
  files.controlRls,
  files.eventConstraints,
  files.eventIndexes,
  files.eventFunctions,
  files.eventTriggers,
  files.eventViews,
  files.eventRls,
];
expect(
  phaseFiles.every((path) => /^(03|04|05|06|07|08)_/.test(basename(path))),
  "post-table files match the provisioner's phase-prefix contract",
);

// Parse the source registry and reconcile registered stable key and tenant
// columns against repo DDL. This prevents a bad registry row from making the
// fail-closed live installer surprise the first deployment.
const registryPattern =
  /\('(?<schema>shared|master|control)',\s*'(?<table>[^']+)'\s*,\s*'[^']+'\s*,\s*ARRAY\[(?<keys>[^\]]+)\]\s*,\s*(?<tenant>NULL|'[^']+')/g;
const registryEntries = [...source("controlTables").matchAll(registryPattern)];
expect(registryEntries.length >= 60, "authorization source registry is exhaustive (60+ inputs)");

async function collectSql(directory: string): Promise<string[]> {
  const output: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) output.push(...await collectSql(path));
    else if (entry.isFile() && entry.name.endsWith(".sql")) {
      output.push(await readFile(path, "utf8"));
    }
  }
  return output;
}

const allDdl = (await collectSql(ddlRoot)).join("\n");
const registryShapeIssues: string[] = [];
for (const entry of registryEntries) {
  const schema = entry.groups?.schema;
  const table = entry.groups?.table;
  const keys = [...(entry.groups?.keys ?? "").matchAll(/'([^']+)'/g)]
    .map((match) => match[1])
    .filter((value): value is string => value !== undefined);
  const tenantRaw = entry.groups?.tenant;
  if (!schema || !table || keys.length === 0 || !tenantRaw) {
    fail("source registry parser found a malformed row");
    continue;
  }

  const marker = `CREATE TABLE IF NOT EXISTS ${schema}.${table} (`;
  const start = allDdl.toLowerCase().indexOf(marker.toLowerCase());
  if (start < 0) {
    fail(`registered source ${schema}.${table} exists in repo DDL`);
    continue;
  }
  const next = allDdl.toLowerCase().indexOf(
    "create table if not exists ",
    start + marker.length,
  );
  const block = allDdl.slice(start, next < 0 ? undefined : next);
  for (const key of keys) {
    if (
      !new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "mi")
        .test(block)
    ) {
      registryShapeIssues.push(`${schema}.${table} missing key column ${key}`);
    }
  }
  if (tenantRaw !== "NULL") {
    const tenant = tenantRaw.slice(1, -1);
    if (
      !new RegExp(`^\\s*${tenant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "mi")
        .test(block)
    ) {
      registryShapeIssues.push(`${schema}.${table} missing tenant column ${tenant}`);
    }
  }
}
expect(
  registryShapeIssues.length === 0,
  "every registered source has its stable key and tenant columns in repo DDL",
);
for (const issue of registryShapeIssues) fail(issue);

if (live) {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required with --live.");
  }
  const client = new pg.Client({
    connectionString,
    application_name: "wave0-authorization-capture-verifier",
  });
  try {
    await client.connect();
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout = '60s'");

    const sourceHealth = await client.query<{
      source_count: string;
      missing_relation_count: string;
      invalid_key_count: string;
      invalid_tenant_count: string;
      invalid_trigger_count: string;
    }>(`
      WITH enabled_source AS (
        SELECT
          source.*,
          to_regclass(format('%I.%I', source_schema, source_table)) AS relation_id
        FROM control.authorization_capture_source AS source
        WHERE capture_enabled
      )
      SELECT
        count(*)::text AS source_count,
        count(*) FILTER (WHERE relation_id IS NULL)::text
          AS missing_relation_count,
        count(*) FILTER (
          WHERE relation_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM unnest(primary_key_columns) AS key_column(name)
              WHERE NOT EXISTS (
                SELECT 1 FROM pg_attribute
                WHERE attrelid = relation_id
                  AND attname = key_column.name
                  AND attnum > 0
                  AND NOT attisdropped
              )
            )
        )::text AS invalid_key_count,
        count(*) FILTER (
          WHERE relation_id IS NOT NULL
            AND tenant_column IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM pg_attribute
              WHERE attrelid = relation_id
                AND attname = tenant_column
                AND attnum > 0
                AND NOT attisdropped
            )
        )::text AS invalid_tenant_count,
        count(*) FILTER (
          WHERE relation_id IS NOT NULL
            AND (
              NOT EXISTS (
                SELECT 1 FROM pg_trigger
                WHERE tgrelid = relation_id
                  AND tgname = 'trg_authz_wave0_capture_row'
                  AND tgenabled = 'A'
                  AND NOT tgisinternal
              )
              OR NOT EXISTS (
                SELECT 1 FROM pg_trigger
                WHERE tgrelid = relation_id
                  AND tgname = 'trg_authz_wave0_capture_truncate'
                  AND tgenabled = 'A'
                  AND NOT tgisinternal
              )
            )
        )::text AS invalid_trigger_count
      FROM enabled_source
    `);
    const health = sourceHealth.rows[0];
    expect(
      Number(health?.source_count) === registryEntries.length
        && health?.missing_relation_count === "0"
        && health.invalid_key_count === "0"
        && health.invalid_tenant_count === "0"
        && health.invalid_trigger_count === "0",
      "live registry exactly matches the versioned source set and ENABLE ALWAYS triggers",
    );

    const streamHealth = await client.query<{
      clock_count: string;
      clock_watermark: string;
      event_count: string;
      bad_envelopes: string;
    }>(`
      WITH clock AS (
        SELECT count(*)::bigint AS clock_count,
               COALESCE(max(current_watermark), 0)::bigint AS clock_watermark
        FROM event.authorization_capture_clock
      ),
      events AS (
        SELECT count(*)::bigint AS event_count
        FROM event.authorization_change_event
      ),
      bad_envelopes AS (
        SELECT count(*)::bigint AS bad_envelopes
        FROM (
          SELECT envelope.source_database_id, envelope.source_txid
          FROM event.authorization_change_transaction AS envelope
          LEFT JOIN event.authorization_change_event AS change
            ON change.source_database_id = envelope.source_database_id
           AND change.source_txid = envelope.source_txid
          GROUP BY envelope.source_database_id, envelope.source_txid,
                   envelope.first_watermark, envelope.last_watermark,
                   envelope.event_count
          HAVING count(change.source_watermark) <> envelope.event_count
              OR min(change.source_watermark) IS DISTINCT FROM envelope.first_watermark
              OR max(change.source_watermark) IS DISTINCT FROM envelope.last_watermark
        ) AS invalid
      )
      SELECT clock_count::text, clock_watermark::text, event_count::text,
             bad_envelopes::text
      FROM clock CROSS JOIN events CROSS JOIN bad_envelopes
    `);
    const stream = streamHealth.rows[0];
    expect(
      stream?.clock_count === "1"
        && stream.clock_watermark === stream.event_count
        && stream.bad_envelopes === "0",
      "live clock, events, and transaction envelopes reconcile",
    );

    const rlsHealth = await client.query<{ forced_count: string }>(`
      SELECT count(*)::text AS forced_count
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE relation.relforcerowsecurity
        AND (namespace.nspname, relation.relname) IN (
          ('control', 'authorization_capture_source'),
          ('control', 'authorization_writer_registry'),
          ('control', 'authorization_anomaly_disposition'),
          ('control', 'authorization_migration_run'),
          ('event', 'authorization_capture_clock'),
          ('event', 'authorization_change_transaction'),
          ('event', 'authorization_change_event'),
          ('event', 'authorization_projection_checkpoint'),
          ('event', 'authorization_snapshot_marker')
        )
    `);
    expect(rlsHealth.rows[0]?.forced_count === "9", "live evidence tables force RLS");

    const publicDml = await client.query<{ privilege_count: string }>(`
      SELECT count(*)::text AS privilege_count
      FROM information_schema.role_table_grants
      WHERE grantee = 'PUBLIC'
        AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
        AND table_schema IN ('control', 'event')
        AND table_name IN (
          'authorization_capture_source',
          'authorization_writer_registry',
          'authorization_anomaly_disposition',
          'authorization_migration_run',
          'authorization_capture_clock',
          'authorization_change_transaction',
          'authorization_change_event',
          'authorization_projection_checkpoint',
          'authorization_snapshot_marker'
        )
    `);
    expect(
      publicDml.rows[0]?.privilege_count === "0",
      "PUBLIC has no direct DML on capture/control evidence",
    );
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.end().catch(() => undefined);
  }
}

if (failures > 0) {
  process.stderr.write(`\n${failures} authorization capture check(s) failed.\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("\nAuthorization change-capture verification passed.\n");
}
