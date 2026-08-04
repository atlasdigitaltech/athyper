#!/usr/bin/env tsx
/**
 * Read-only Wave 0 Mesh authorization writer/capture report.
 *
 * This report intentionally accepts only MESH_DATABASE_URL. It never falls
 * back to the Neon DATABASE_URL and never installs or exercises a trigger.
 *
 * Usage:
 *   MESH_DATABASE_URL=... tsx scripts/reports/report-mesh-authorization-legacy-writes.ts
 *   MESH_DATABASE_URL=... tsx scripts/reports/report-mesh-authorization-legacy-writes.ts \
 *     --strict --output=artifacts/mesh-authorization-legacy-writes.json
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import pg from "pg";

interface Options {
  output?: string;
  strict: boolean;
}

interface SourceRow {
  source_schema: string;
  source_table: string;
  source_kind: string;
  scope_kind: string;
  owner_team: string;
  capture_enabled: boolean;
  relation_exists: boolean;
  invalid_primary_key_columns: string[];
  invalid_scope_columns: string[];
  row_trigger_state: string | null;
  truncate_trigger_state: string | null;
}

interface TelemetryRow {
  source_database_id: string;
  source_schema: string;
  source_table: string;
  operation: string;
  scope_kind: string;
  declared_writer_key: string | null;
  session_user_name: string;
  current_user_name: string;
  application_name: string | null;
  owner_team: string | null;
  write_path: string | null;
  writer_match_state: string;
  first_watermark: string;
  last_watermark: string;
  first_seen_at: Date;
  last_seen_at: Date;
  write_count: string;
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
        "Usage: report-mesh-authorization-legacy-writes.ts "
          + "[--strict] [--output=PATH]\n",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

const EXPECTED_SOURCES = new Set([
  "mesh.principal",
  "mesh.principal_identity_binding",
  "mesh.network_account",
  "mesh.account_grant",
  "mesh.network_relationship",
  "mesh.attachment_acl",
  "mesh.content_item_access_grant",
  "mesh.conversation_participant",
]);

const options = parseOptions(process.argv.slice(2));
const connectionString = process.env.MESH_DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error(
    "MESH_DATABASE_URL is required; the Mesh report never falls back to DATABASE_URL.",
  );
}

const client = new pg.Client({
  connectionString,
  application_name: "wave0-mesh-authorization-legacy-write-report",
});

let strictFailure = false;
try {
  await client.connect();
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await client.query("SET LOCAL statement_timeout = '60s'");

  const identityResult = await client.query<{
    database_name: string;
    database_oid: string;
    mesh_schema_present: boolean;
    forbidden_neon_schemas: string[];
  }>(`
    SELECT
      current_database() AS database_name,
      (
        SELECT oid::text
        FROM pg_database
        WHERE datname = current_database()
      ) AS database_oid,
      to_regnamespace('mesh') IS NOT NULL AS mesh_schema_present,
      ARRAY(
        SELECT namespace_name
        FROM unnest(ARRAY[
          'master', 'control', 'event', 'document', 'audit'
        ]::text[]) AS forbidden(namespace_name)
        WHERE to_regnamespace(namespace_name) IS NOT NULL
        ORDER BY namespace_name
      ) AS forbidden_neon_schemas
  `);

  const clockResult = await client.query<{
    plane_key: string;
    source_database_id: string;
    capture_contract_version: string;
    current_watermark: string;
    installed_at: Date;
    updated_at: Date;
  }>(`
    SELECT
      plane_key,
      source_database_id,
      capture_contract_version,
      current_watermark,
      installed_at,
      updated_at
    FROM mesh_log.authorization_capture_clock
    WHERE singleton_id = 1
  `);

  const sourceResult = await client.query<SourceRow>(`
    SELECT
      source.source_schema,
      source.source_table,
      source.source_kind,
      source.scope_kind,
      source.owner_team,
      source.capture_enabled,
      relation.oid IS NOT NULL AS relation_exists,
      ARRAY(
        SELECT key_column
        FROM unnest(source.primary_key_columns) AS key_column
        WHERE relation.oid IS NULL
           OR NOT EXISTS (
             SELECT 1
             FROM pg_attribute
             WHERE attrelid = relation.oid
               AND attname = key_column
               AND attnum > 0
               AND NOT attisdropped
           )
        ORDER BY key_column
      ) AS invalid_primary_key_columns,
      ARRAY(
        SELECT scope_column
        FROM unnest(source.scope_columns) AS scope_column
        WHERE relation.oid IS NULL
           OR NOT EXISTS (
             SELECT 1
             FROM pg_attribute
             WHERE attrelid = relation.oid
               AND attname = scope_column
               AND attnum > 0
               AND NOT attisdropped
           )
        ORDER BY scope_column
      ) AS invalid_scope_columns,
      row_trigger.tgenabled::text AS row_trigger_state,
      truncate_trigger.tgenabled::text AS truncate_trigger_state
    FROM mesh_control.authorization_capture_source AS source
    LEFT JOIN pg_namespace AS namespace
      ON namespace.nspname = source.source_schema
    LEFT JOIN pg_class AS relation
      ON relation.relnamespace = namespace.oid
     AND relation.relname = source.source_table
     AND relation.relkind IN ('r', 'p')
    LEFT JOIN pg_trigger AS row_trigger
      ON row_trigger.tgrelid = relation.oid
     AND row_trigger.tgname = 'trg_mesh_authz_wave0_capture_row'
     AND NOT row_trigger.tgisinternal
    LEFT JOIN pg_trigger AS truncate_trigger
      ON truncate_trigger.tgrelid = relation.oid
     AND truncate_trigger.tgname = 'trg_mesh_authz_wave0_capture_truncate'
     AND NOT truncate_trigger.tgisinternal
    ORDER BY source.source_schema, source.source_table
  `);

  const telemetryResult = await client.query<TelemetryRow>(`
    SELECT
      source_database_id,
      source_schema,
      source_table,
      operation::text,
      scope_kind,
      declared_writer_key,
      session_user_name,
      current_user_name,
      application_name,
      owner_team,
      write_path,
      writer_match_state,
      first_watermark,
      last_watermark,
      first_seen_at,
      last_seen_at,
      write_count
    FROM mesh_log.v_authorization_writer_telemetry
    ORDER BY
      writer_match_state,
      last_seen_at DESC,
      source_schema,
      source_table,
      operation
  `);

  const reconciliationResult = await client.query<{
    source_database_id: string;
    source_high_watermark: string;
    event_count: string;
    minimum_watermark: string | null;
    maximum_watermark: string | null;
    missing_watermarks: string;
    bad_transaction_envelopes: string;
  }>(`
    WITH event_summary AS (
      SELECT
        source_database_id,
        count(*)::bigint AS event_count,
        min(source_watermark) AS minimum_watermark,
        max(source_watermark) AS maximum_watermark
      FROM mesh_log.authorization_change_event
      GROUP BY source_database_id
    ),
    envelope_summary AS (
      SELECT count(*)::bigint AS bad_transaction_envelopes
      FROM (
        SELECT
          envelope.source_database_id,
          envelope.source_txid
        FROM mesh_log.authorization_change_transaction AS envelope
        LEFT JOIN mesh_log.authorization_change_event AS change
          ON change.source_database_id = envelope.source_database_id
         AND change.source_txid = envelope.source_txid
        GROUP BY
          envelope.source_database_id,
          envelope.source_txid,
          envelope.first_watermark,
          envelope.last_watermark,
          envelope.event_count
        HAVING count(change.source_watermark) <> envelope.event_count
            OR min(change.source_watermark)
               IS DISTINCT FROM envelope.first_watermark
            OR max(change.source_watermark)
               IS DISTINCT FROM envelope.last_watermark
      ) AS invalid_envelope
    )
    SELECT
      clock.source_database_id,
      clock.current_watermark AS source_high_watermark,
      COALESCE(summary.event_count, 0) AS event_count,
      summary.minimum_watermark,
      summary.maximum_watermark,
      GREATEST(
        clock.current_watermark - COALESCE(summary.event_count, 0),
        0
      ) AS missing_watermarks,
      envelopes.bad_transaction_envelopes
    FROM mesh_log.authorization_capture_clock AS clock
    LEFT JOIN event_summary AS summary
      ON summary.source_database_id = clock.source_database_id
    CROSS JOIN envelope_summary AS envelopes
    WHERE clock.singleton_id = 1
  `);

  const checkpointResult = await client.query<{
    migration_run_id: string;
    consumer_name: string;
    source_database_id: string;
    last_applied_watermark: string;
    last_applied_txid: string | null;
    state: string;
    updated_at: Date;
  }>(`
    SELECT
      migration_run_id,
      consumer_name,
      source_database_id,
      last_applied_watermark,
      last_applied_txid,
      state,
      updated_at
    FROM mesh_log.authorization_projection_checkpoint
    ORDER BY consumer_name, migration_run_id
  `);

  const migrationRunResult = await client.query<{
    id: string;
    run_code: string;
    status: string;
    source_database_id: string;
    rollback_owner: string;
    authorization_rpo_seconds: number;
    authorization_rto_minutes: number;
    observation_started_at: Date | null;
    observation_ends_at: Date | null;
    approval_ticket: string | null;
    approved_by: string | null;
    approved_at: Date | null;
  }>(`
    SELECT
      id,
      run_code,
      status,
      source_database_id,
      rollback_owner,
      authorization_rpo_seconds,
      authorization_rto_minutes,
      observation_started_at,
      observation_ends_at,
      approval_ticket,
      approved_by,
      approved_at
    FROM mesh_control.authorization_migration_run
    ORDER BY created_at, id
  `);

  const databaseIdentity = identityResult.rows[0];
  const clock = clockResult.rows[0];
  const reconciliation = reconciliationResult.rows[0];
  if (!databaseIdentity || !clock || !reconciliation) {
    throw new Error("Mesh identity/capture singleton reconciliation returned no row.");
  }

  const sources = sourceResult.rows.map((row) => ({
    ...row,
    rowTriggerAlways: row.row_trigger_state === "A",
    truncateTriggerAlways: row.truncate_trigger_state === "A",
  }));
  const enabledSources = sources.filter((row) => row.capture_enabled);
  const registeredSourceNames = new Set(
    sources.map((row) => `${row.source_schema}.${row.source_table}`),
  );
  const enabledSourceNames = new Set(
    enabledSources.map((row) => `${row.source_schema}.${row.source_table}`),
  );
  const missingExpectedSources = [...EXPECTED_SOURCES]
    .filter((sourceName) => !registeredSourceNames.has(sourceName))
    .sort();
  const disabledExpectedSources = [...EXPECTED_SOURCES]
    .filter((sourceName) => (
      registeredSourceNames.has(sourceName)
      && !enabledSourceNames.has(sourceName)
    ))
    .sort();
  const unexpectedRegisteredSources = [...registeredSourceNames]
    .filter((sourceName) => !EXPECTED_SOURCES.has(sourceName))
    .sort();
  const invalidShapeSources = enabledSources.filter(
    (row) => !row.relation_exists
      || row.invalid_primary_key_columns.length > 0
      || row.invalid_scope_columns.length > 0,
  );
  const invalidRowTriggerSources = enabledSources.filter(
    (row) => row.row_trigger_state !== "A",
  );
  const invalidTruncateTriggerSources = enabledSources.filter(
    (row) => row.truncate_trigger_state !== "A",
  );
  const unknownWriterRows = telemetryResult.rows.filter(
    (row) => row.writer_match_state !== "approved",
  );
  const unknownWriteCount = unknownWriterRows.reduce(
    (sum, row) => sum + BigInt(row.write_count),
    0n,
  );
  const streamShapeInvalid = reconciliation.missing_watermarks !== "0"
    || (
      reconciliation.source_high_watermark === "0"
        ? reconciliation.minimum_watermark !== null
          || reconciliation.maximum_watermark !== null
        : reconciliation.minimum_watermark !== "1"
          || reconciliation.maximum_watermark
            !== reconciliation.source_high_watermark
    );
  const approvedMigrationContracts = migrationRunResult.rows.filter((run) => (
    [
      "approved",
      "capturing",
      "backfilling",
      "replaying",
      "shadowing",
      "cutover_ready",
      "cutover",
      "observing",
      "completed",
    ].includes(run.status)
    && run.source_database_id === clock.source_database_id
    && run.rollback_owner.trim().length > 0
    && run.observation_started_at !== null
    && run.observation_ends_at !== null
    && run.approval_ticket !== null
    && run.approved_by !== null
    && run.approved_at !== null
  ));

  const blockingReasons = [
    ...(!databaseIdentity.mesh_schema_present ? ["mesh_schema_missing"] : []),
    ...(databaseIdentity.forbidden_neon_schemas.length > 0
      ? ["forbidden_neon_schema_present"]
      : []),
    ...(clock.plane_key !== "mesh" ? ["wrong_capture_plane"] : []),
    ...(missingExpectedSources.length > 0 ? ["expected_source_missing"] : []),
    ...(disabledExpectedSources.length > 0 ? ["expected_source_disabled"] : []),
    ...(unexpectedRegisteredSources.length > 0
      ? ["unexpected_registered_source"]
      : []),
    ...(invalidShapeSources.length > 0 ? ["source_registry_shape_invalid"] : []),
    ...(invalidRowTriggerSources.length > 0
      ? ["row_trigger_not_enable_always"]
      : []),
    ...(invalidTruncateTriggerSources.length > 0
      ? ["truncate_trigger_not_enable_always"]
      : []),
    ...(unknownWriteCount > 0n ? ["unknown_authorization_writer"] : []),
    ...(streamShapeInvalid ? ["watermark_gap"] : []),
    ...(reconciliation.bad_transaction_envelopes !== "0"
      ? ["transaction_envelope_mismatch"]
      : []),
    ...(approvedMigrationContracts.length === 0
      ? ["approved_mesh_migration_contract_missing"]
      : []),
  ];
  strictFailure = blockingReasons.length > 0;

  const report = {
    schemaVersion: "wave0.mesh-authorization-legacy-write-report.v1",
    generatedAt: new Date().toISOString(),
    plane: "mesh",
    readOnly: true,
    strict: options.strict,
    gate: {
      passed: !strictFailure,
      blockingReasons,
    },
    summary: {
      expectedSourceCount: EXPECTED_SOURCES.size,
      registeredSourceCount: sources.length,
      enabledSourceCount: enabledSources.length,
      missingExpectedSourceCount: missingExpectedSources.length,
      disabledExpectedSourceCount: disabledExpectedSources.length,
      unexpectedRegisteredSourceCount: unexpectedRegisteredSources.length,
      invalidSourceShapeCount: invalidShapeSources.length,
      invalidAlwaysRowTriggerCount: invalidRowTriggerSources.length,
      invalidAlwaysTruncateTriggerCount: invalidTruncateTriggerSources.length,
      telemetryBucketCount: telemetryResult.rows.length,
      unknownWriterBucketCount: unknownWriterRows.length,
      unknownWriteCount: unknownWriteCount.toString(),
      approvedMigrationContractCount: approvedMigrationContracts.length,
    },
    databaseIdentity,
    clock,
    reconciliation,
    missingExpectedSources,
    disabledExpectedSources,
    unexpectedRegisteredSources,
    sources,
    unknownWriterTelemetry: unknownWriterRows,
    writerTelemetry: telemetryResult.rows,
    checkpoints: checkpointResult.rows,
    migrationRuns: migrationRunResult.rows,
    approvedMigrationContracts,
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
