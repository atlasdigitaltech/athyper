#!/usr/bin/env tsx
/**
 * Read-only Wave 0 legacy authorization writer and capture-health report.
 *
 * Usage:
 *   DATABASE_URL=... tsx scripts/reports/report-authorization-legacy-writes.ts
 *   DATABASE_URL=... tsx scripts/reports/report-authorization-legacy-writes.ts \
 *     --output=artifacts/authz-legacy-writes.json --strict
 *
 * --strict exits non-zero when an enabled source is missing either ENABLE
 * ALWAYS trigger, a captured write has no approved writer, or the durable
 * clock/transaction envelopes do not reconcile.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

interface Options {
  output?: string;
  strict: boolean;
}

interface SourceRow {
  source_schema: string;
  source_table: string;
  source_kind: string;
  owner_team: string;
  capture_enabled: boolean;
  relation_exists: boolean;
  row_trigger_state: string | null;
  truncate_trigger_state: string | null;
}

interface TelemetryRow {
  source_schema: string;
  source_table: string;
  source_kind: string;
  operation: string;
  session_user_name: string;
  current_user_name: string;
  application_name: string | null;
  writer_key: string | null;
  writer_match_count: string;
  write_count: string;
  first_watermark: string;
  last_watermark: string;
  first_captured_at: Date;
  last_captured_at: Date;
}

function parseOptions(args: string[]): Options {
  const options: Options = { strict: false };
  for (const arg of args) {
    if (arg === "--strict") {
      options.strict = true;
    } else if (arg.startsWith("--output=")) {
      const value = arg.slice("--output=".length).trim();
      if (!value) throw new Error("--output requires a path");
      options.output = resolve(value);
    } else if (arg === "--help") {
      process.stdout.write(
        "Usage: report-authorization-legacy-writes.ts [--strict] [--output=PATH]\n",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

const options = parseOptions(process.argv.slice(2));
const databaseRoot = fileURLToPath(new URL("../../", import.meta.url));
const captureSourceDdl = await readFile(
  resolve(databaseRoot, "ddl/control/01zzo_authorization_migration_controls.sql"),
  "utf8",
);
const captureSourcePattern =
  /\('(?<schema>shared|master|control)',\s*'(?<table>[^']+)'\s*,\s*'[^']+'\s*,\s*ARRAY\[[^\]]+\]\s*,\s*(?:NULL|'[^']+')/g;
const expectedSourceIds = [...captureSourceDdl.matchAll(captureSourcePattern)]
  .map((match) => `${match.groups?.schema}.${match.groups?.table}`)
  .sort();
if (
  expectedSourceIds.length === 0 ||
  new Set(expectedSourceIds).size !== expectedSourceIds.length
) {
  throw new Error(
    "Versioned Neon capture source set is empty or contains duplicates.",
  );
}
const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for the Wave 0 legacy-write report.");
}

const client = new pg.Client({
  connectionString,
  application_name: "wave0-authorization-legacy-write-report",
});

let strictFailure = false;
try {
  await client.connect();
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await client.query("SET LOCAL statement_timeout = '60s'");

  const clockResult = await client.query<{
    database_name: string;
    database_oid: string;
    source_database_id: string;
    capture_contract_version: string;
    current_watermark: string;
    installed_at: Date;
    updated_at: Date;
  }>(`
    SELECT
      current_database() AS database_name,
      (SELECT oid::text FROM pg_database WHERE datname = current_database())
        AS database_oid,
      source_database_id,
      capture_contract_version,
      current_watermark,
      installed_at,
      updated_at
    FROM event.authorization_capture_clock
    WHERE singleton_id = 1
  `);

  const sourceResult = await client.query<SourceRow>(`
    SELECT
      source.source_schema,
      source.source_table,
      source.source_kind,
      source.owner_team,
      source.capture_enabled,
      relation.oid IS NOT NULL AS relation_exists,
      row_trigger.tgenabled::text AS row_trigger_state,
      truncate_trigger.tgenabled::text AS truncate_trigger_state
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
    ORDER BY source.source_schema, source.source_table
  `);

  const telemetryResult = await client.query<TelemetryRow>(`
    SELECT
      source_schema,
      source_table,
      source_kind,
      operation::text,
      session_user_name,
      current_user_name,
      application_name,
      writer_key,
      writer_match_count,
      write_count,
      first_watermark,
      last_watermark,
      first_captured_at,
      last_captured_at
    FROM event.v_authorization_legacy_write_telemetry
    ORDER BY
      writer_key NULLS FIRST,
      last_captured_at DESC,
      source_schema,
      source_table,
      operation
  `);

  const checkpointResult = await client.query<{
    migration_run_id: string | null;
    consumer_name: string | null;
    source_database_id: string;
    source_high_watermark: string;
    last_applied_watermark: string | null;
    watermark_lag: string | null;
    state: string | null;
    checkpoint_updated_at: Date | null;
  }>(`
    SELECT
      migration_run_id,
      consumer_name,
      source_database_id,
      source_high_watermark,
      last_applied_watermark,
      watermark_lag,
      state,
      checkpoint_updated_at
    FROM event.v_authorization_capture_health
    ORDER BY consumer_name NULLS FIRST
  `);

  const reconciliationResult = await client.query<{
    source_high_watermark: string;
    event_count: string;
    minimum_watermark: string | null;
    maximum_watermark: string | null;
    missing_or_uncommitted_watermarks: string;
    bad_transaction_envelopes: string;
  }>(`
    WITH event_summary AS (
      SELECT
        count(*)::bigint AS event_count,
        min(source_watermark) AS minimum_watermark,
        max(source_watermark) AS maximum_watermark
      FROM event.authorization_change_event
    ),
    envelope_summary AS (
      SELECT count(*)::bigint AS bad_transaction_envelopes
      FROM (
        SELECT
          envelope.source_database_id,
          envelope.source_txid
        FROM event.authorization_change_transaction AS envelope
        LEFT JOIN event.authorization_change_event AS change
          ON change.source_database_id = envelope.source_database_id
         AND change.source_txid = envelope.source_txid
        GROUP BY
          envelope.source_database_id,
          envelope.source_txid,
          envelope.first_watermark,
          envelope.last_watermark,
          envelope.event_count
        HAVING count(change.source_watermark) <> envelope.event_count
            OR min(change.source_watermark) IS DISTINCT FROM envelope.first_watermark
            OR max(change.source_watermark) IS DISTINCT FROM envelope.last_watermark
      ) AS invalid_envelope
    )
    SELECT
      clock.current_watermark AS source_high_watermark,
      summary.event_count,
      summary.minimum_watermark,
      summary.maximum_watermark,
      GREATEST(clock.current_watermark - summary.event_count, 0)
        AS missing_or_uncommitted_watermarks,
      envelopes.bad_transaction_envelopes
    FROM event.authorization_capture_clock AS clock
    CROSS JOIN event_summary AS summary
    CROSS JOIN envelope_summary AS envelopes
    WHERE clock.singleton_id = 1
  `);

  const sources = sourceResult.rows.map((row) => ({
    ...row,
    rowTriggerAlways: row.row_trigger_state === "A",
    truncateTriggerAlways: row.truncate_trigger_state === "A",
  }));
  const enabledSources = sources.filter((row) => row.capture_enabled);
  const actualSourceIds = sources
    .map((row) => `${row.source_schema}.${row.source_table}`)
    .sort();
  const actualSourceSet = new Set(actualSourceIds);
  const expectedSourceSet = new Set(expectedSourceIds);
  const missingExpectedSources = expectedSourceIds.filter(
    (source) => !actualSourceSet.has(source),
  );
  const unexpectedSources = actualSourceIds.filter(
    (source) => !expectedSourceSet.has(source),
  );
  const disabledExpectedSources = sources
    .filter(
      (row) =>
        expectedSourceSet.has(`${row.source_schema}.${row.source_table}`)
        && !row.capture_enabled,
    )
    .map((row) => `${row.source_schema}.${row.source_table}`)
    .sort();
  const sourcesWithoutRelation = enabledSources.filter((row) => !row.relation_exists);
  const sourcesWithoutAlwaysRowTrigger = enabledSources.filter(
    (row) => row.row_trigger_state !== "A",
  );
  const sourcesWithoutAlwaysTruncateTrigger = enabledSources.filter(
    (row) => row.truncate_trigger_state !== "A",
  );
  const unknownWriterRows = telemetryResult.rows.filter((row) => row.writer_key === null);
  const ambiguousWriterRows = telemetryResult.rows.filter(
    (row) => Number(row.writer_match_count) > 1,
  );
  const unknownWriteCount = unknownWriterRows.reduce(
    (sum, row) => sum + BigInt(row.write_count),
    0n,
  );
  const reconciliation = reconciliationResult.rows[0];
  if (!reconciliation || clockResult.rows.length !== 1) {
    throw new Error("Capture clock reconciliation returned no singleton row.");
  }

  const blockingReasons = [
    ...(enabledSources.length === 0 ? ["capture_source_registry_empty"] : []),
    ...(missingExpectedSources.length > 0 ? ["expected_capture_source_missing"] : []),
    ...(unexpectedSources.length > 0 ? ["unexpected_capture_source"] : []),
    ...(disabledExpectedSources.length > 0 ? ["expected_capture_source_disabled"] : []),
    ...(sourcesWithoutRelation.length > 0 ? ["registered_source_missing"] : []),
    ...(sourcesWithoutAlwaysRowTrigger.length > 0 ? ["row_trigger_not_enable_always"] : []),
    ...(sourcesWithoutAlwaysTruncateTrigger.length > 0
      ? ["truncate_trigger_not_enable_always"]
      : []),
    ...(unknownWriteCount > 0n ? ["unknown_legacy_writer"] : []),
    ...(ambiguousWriterRows.length > 0 ? ["ambiguous_legacy_writer"] : []),
    ...(reconciliation.missing_or_uncommitted_watermarks !== "0"
      ? ["watermark_gap"]
      : []),
    ...(reconciliation.bad_transaction_envelopes !== "0"
      ? ["transaction_envelope_mismatch"]
      : []),
  ];
  strictFailure = blockingReasons.length > 0;

  const report = {
    schemaVersion: "wave0.authorization-legacy-write-report.v1",
    generatedAt: new Date().toISOString(),
    readOnly: true,
    plane: "neon",
    strict: options.strict,
    gate: {
      passed: !strictFailure,
      blockingReasons,
    },
    summary: {
      expectedSourceCount: expectedSourceIds.length,
      registeredSourceCount: sources.length,
      enabledSourceCount: enabledSources.length,
      missingRelationCount: sourcesWithoutRelation.length,
      missingAlwaysRowTriggerCount: sourcesWithoutAlwaysRowTrigger.length,
      missingAlwaysTruncateTriggerCount: sourcesWithoutAlwaysTruncateTrigger.length,
      telemetryBucketCount: telemetryResult.rows.length,
      unknownWriterBucketCount: unknownWriterRows.length,
      unknownWriteCount: unknownWriteCount.toString(),
      ambiguousWriterBucketCount: ambiguousWriterRows.length,
    },
    clock: clockResult.rows[0],
    reconciliation,
    checkpoints: checkpointResult.rows,
    sources,
    missingExpectedSources,
    unexpectedSources,
    disabledExpectedSources,
    legacyWrites: telemetryResult.rows,
  };

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) {
    await mkdir(dirname(options.output), { recursive: true });
    await writeFile(options.output, serialized, "utf8");
    process.stdout.write(`Wrote ${options.output}\n`);
  } else {
    process.stdout.write(serialized);
  }
} finally {
  await client.query("ROLLBACK").catch(() => undefined);
  await client.end().catch(() => undefined);
}

if (options.strict && strictFailure) {
  process.exitCode = 2;
}
