#!/usr/bin/env tsx
/**
 * Explicit Mesh-only Wave 1 additive-expand installer.
 *
 * Dry-run is the default and never opens a database connection. Live mode
 * requires an exact database name and approval ticket, accepts only an
 * explicitly Mesh-scoped administrative URL, and refuses a database carrying
 * any Neon-owned schema. Wave 0 capture must already be healthy. This script
 * never installs capture, records W0, snapshots/backfills, binds/stages replay,
 * changes a reader selector, cuts over, or contracts a legacy object.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import {
  meshAuthorizationV2AdvisoryLockKey,
  meshAuthorizationV2AllTables,
  meshAuthorizationV2ExpandContractVersion,
  meshAuthorizationV2ForbiddenNeonSchemas,
  meshAuthorizationV2InvalidationTargets,
  meshAuthorizationV2OrderedDdl,
  meshAuthorizationV2RequiredSchemas,
  meshAuthorizationV2Sentinels,
  meshAuthorizationV2Wave0Sources,
} from "../contracts/mesh-authorization-v2-wave1.js";

interface Options {
  apply: boolean;
  expectedDatabase?: string;
  approvalTicket?: string;
  lockTimeoutMs: number;
  statementTimeoutMs: number;
}

interface DatabaseIdentity {
  database_name: string;
  database_oid: string;
  present_required_schemas: string[];
  present_forbidden_schemas: string[];
  unexpected_user_schemas: string[];
  admin_role_present: boolean;
  session_is_admin: boolean;
}

interface CaptureState {
  source_database_id: string;
  capture_contract_version: string;
  current_watermark: string;
  change_event_count: string;
  registered_sources: string[];
  invalid_trigger_count: string;
}

interface DeferredState {
  registry_count: string;
  unvalidated_live_count: string;
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const databaseRoot = resolve(scriptDirectory, "../..");
const options = parseOptions(process.argv.slice(2));

const ddl = await Promise.all(meshAuthorizationV2OrderedDdl.map(async (path) => {
  const sql = await readFile(resolve(databaseRoot, path), "utf8");
  assertMeshBoundary(path, sql);
  assertAdditiveSql(path, sql);
  return {
    path,
    sql,
    sha256: createHash("sha256").update(sql).digest("hex"),
  };
}));
const orderedDdlReceipt = ddl.map(({ path, sha256 }) => ({ path, sha256 }));
const orderedDdlSha256 = createHash("sha256")
  .update(JSON.stringify(orderedDdlReceipt))
  .digest("hex");

if (!options.apply) {
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    mode: "dry_run",
    mutatesDatabase: false,
    planeBoundary: "mesh_database_only",
    expandContractVersion: meshAuthorizationV2ExpandContractVersion,
    connectionEnvironment:
      "MESH_AUTHORIZATION_V2_DATABASE_URL or MESH_DATABASE_ADMIN_URL",
    requiredApplyArguments: [
      "--apply",
      "--expected-database=<exact name>",
      "--approval-ticket=<ticket>",
    ],
    requiredPrecondition: {
      captureContractVersion:
        meshAuthorizationV2Sentinels.captureContractVersion,
      sourceCount: meshAuthorizationV2Wave0Sources.length,
      exactSources: meshAuthorizationV2Wave0Sources,
      captureInstalledBeforeSnapshot: true,
    },
    explicitlyExcluded: [
      "Wave 0 capture installation",
      "snapshot marker / W0 recording",
      "transformer registration",
      "snapshot or backfill",
      "replay binding or staging",
      "continuous synchronization",
      "reader selector or cutover",
      "legacy contraction",
      "Neon/Admin DDL",
    ],
    orderedDdlSha256,
    orderedDdl: orderedDdlReceipt,
  }, null, 2)}\n`);
  process.exit(0);
}

if (!options.expectedDatabase || !options.approvalTicket) {
  throw new Error(
    "--apply requires --expected-database=<exact name> "
    + "and --approval-ticket=<ticket>.",
  );
}

const connectionString = resolveMeshConnectionString();
const client = new pg.Client({
  connectionString,
  application_name: "wave1-mesh-authorization-v2-expand-installer",
});

try {
  await client.connect();
  await client.query("BEGIN");
  await client.query(`SET LOCAL lock_timeout = '${options.lockTimeoutMs}ms'`);
  await client.query(
    `SET LOCAL statement_timeout = '${options.statementTimeoutMs}ms'`,
  );
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [meshAuthorizationV2AdvisoryLockKey],
  );
  await client.query(
    "SELECT set_config('app.authorization_migration_approval_ticket', $1, true)",
    [options.approvalTicket],
  );

  const identity = await readDatabaseIdentity(client);
  assertDatabaseIdentity(identity, options.expectedDatabase);

  // Keep the source registry and transactional clock stable while the
  // expansion and its receipt are installed.
  await client.query(`
    LOCK TABLE
      mesh_control.authorization_capture_source,
      mesh_log.authorization_capture_clock
    IN SHARE MODE
  `);

  const captureBefore = await readCaptureState(client);
  assertCaptureState(captureBefore);

  const preexistingMarkers = await client.query<{
    wave1_marker_count: string;
    invalid_marker_count: string;
  }>(`
    SELECT
      count(*)::text AS wave1_marker_count,
      count(*) FILTER (
        WHERE migration_run.capture_installed_at IS NULL
          OR migration_run.capture_installed_at > marker.recorded_at
          OR marker.source_database_id <> $1::uuid
          OR marker.capture_contract_version <> $2::text
          OR marker.source_watermark < 0
      )::text AS invalid_marker_count
    FROM mesh_log.authorization_snapshot_marker AS marker
    JOIN mesh_control.authorization_migration_run AS migration_run
      ON migration_run.id = marker.migration_run_id
    WHERE migration_run.transformation_version
            LIKE 'wave1.mesh-authz-transform.%'
  `, [
    captureBefore.source_database_id,
    captureBefore.capture_contract_version,
  ]);
  const markerState = preexistingMarkers.rows[0];
  if (
    !markerState
    || markerState.wave1_marker_count !== "0"
    || markerState.invalid_marker_count !== "0"
  ) {
    throw new Error(
      "Expand must precede the first Wave 1 Mesh snapshot marker: "
      + JSON.stringify(markerState),
    );
  }

  const progressedRuns = await client.query<{ count: string }>(`
    SELECT count(*)::text AS count
    FROM mesh_control.authorization_migration_run
    WHERE transformation_version LIKE 'wave1.mesh-authz-transform.%'
      AND (
        snapshot_started_at IS NOT NULL
        OR snapshot_watermark IS NOT NULL
        OR status IN (
          'backfilling', 'replaying', 'shadowing', 'cutover_ready',
          'cutover', 'observing', 'rolled_back', 'completed'
        )
      )
  `);
  if (progressedRuns.rows[0]?.count !== "0") {
    throw new Error(
      "Expand-only install is forbidden after snapshot/backfill has started.",
    );
  }

  for (const file of ddl) {
    await client.query(file.sql);
  }

  const planeState = (await client.query<{
    row_count: string;
    valid_count: string;
  }>(`
    SELECT
      count(*)::text AS row_count,
      count(*) FILTER (
        WHERE id = $1::uuid
          AND plane_code = 'mesh'
          AND entitlement_semantics = 'product_and_account_eligibility'
          AND status = 'active'
      )::text AS valid_count
    FROM mesh_control.auth_plane
  `, [meshAuthorizationV2Sentinels.planeId])).rows[0];
  if (
    !planeState
    || planeState.row_count !== "1"
    || planeState.valid_count !== "1"
  ) {
    throw new Error(
      `Mesh plane identity is not exact: ${JSON.stringify(planeState)}.`,
    );
  }

  const frozenSources = await client.query<{ source_relation: string }>(`
    SELECT format('%I.%I', source_schema, source_table) AS source_relation
    FROM mesh_control.authorization_v2_frozen_legacy_object
    WHERE capture_required
    ORDER BY source_relation
  `);
  assertExactStrings(
    frozenSources.rows.map((row) => row.source_relation),
    [...meshAuthorizationV2Wave0Sources],
    "frozen legacy source set",
  );

  const deferredState = await readDeferredState(client);
  if (
    deferredState.registry_count !== "0"
    || deferredState.unvalidated_live_count !== "0"
  ) {
    throw new Error(
      "Mesh Wave 1 installs empty targets with validated constraints; "
      + `the deferred manifest must be exactly empty: ${
        JSON.stringify(deferredState)
      }.`,
    );
  }

  await assertInvalidationManifest(client);
  await assertRlsManifest(client);
  await assertValidatedTargetConstraints(client);

  await client.query(`
    INSERT INTO mesh_control.authorization_v2_expand_installation (
      target_database_name,
      target_database_oid,
      source_database_id,
      capture_contract_version,
      expand_contract_version,
      ordered_ddl_sha256,
      ordered_ddl,
      approval_ticket
    )
    VALUES (
      current_database(),
      (SELECT oid FROM pg_database WHERE datname = current_database()),
      $1::uuid,
      $2::text,
      $3::text,
      $4::text,
      $5::jsonb,
      $6::text
    )
    ON CONFLICT (
      target_database_oid,
      expand_contract_version,
      ordered_ddl_sha256
    ) DO NOTHING
  `, [
    captureBefore.source_database_id,
    captureBefore.capture_contract_version,
    meshAuthorizationV2ExpandContractVersion,
    orderedDdlSha256,
    JSON.stringify(orderedDdlReceipt),
    options.approvalTicket,
  ]);

  const receipt = (await client.query<{
    id: string;
    installed_at: string;
    installed_by: string;
  }>(`
    SELECT id::text, installed_at::text, installed_by
    FROM mesh_control.authorization_v2_expand_installation
    WHERE target_database_oid = (
        SELECT oid FROM pg_database WHERE datname = current_database()
      )
      AND expand_contract_version = $1
      AND ordered_ddl_sha256 = $2
      AND source_database_id = $3::uuid
      AND capture_contract_version = $4
      AND ordered_ddl = $5::jsonb
  `, [
    meshAuthorizationV2ExpandContractVersion,
    orderedDdlSha256,
    captureBefore.source_database_id,
    captureBefore.capture_contract_version,
    JSON.stringify(orderedDdlReceipt),
  ])).rows[0];
  if (!receipt) {
    throw new Error("Could not reconcile the immutable expand receipt.");
  }

  const captureAfter = await readCaptureState(client);
  assertCaptureState(captureAfter);
  if (JSON.stringify(captureAfter) !== JSON.stringify(captureBefore)) {
    throw new Error(
      "Wave 0 capture identity, watermark, source set, or trigger health "
      + "changed during expansion.",
    );
  }

  const sideEffects = await client.query<{
    marker_count: string;
    replay_binding_count: string;
    replay_inbox_count: string;
    transformer_count: string;
    conservation_count: string;
  }>(`
    SELECT
      (
        SELECT count(*)::text
        FROM mesh_log.authorization_snapshot_marker
        WHERE recorded_at >= $1::timestamptz
      ) AS marker_count,
      (SELECT count(*)::text
       FROM mesh_log.authorization_v2_replay_binding)
        AS replay_binding_count,
      (SELECT count(*)::text
       FROM mesh_log.authorization_v2_replay_inbox)
        AS replay_inbox_count,
      (SELECT count(*)::text
       FROM mesh_control.authorization_v2_transformer_registry)
        AS transformer_count,
      (SELECT count(*)::text
       FROM mesh_control.authorization_v2_conservation_ledger)
        AS conservation_count
  `, [receipt.installed_at]);
  const effect = sideEffects.rows[0];
  if (
    !effect
    || effect.marker_count !== "0"
    || effect.replay_binding_count !== "0"
    || effect.replay_inbox_count !== "0"
    || effect.transformer_count !== "0"
    || effect.conservation_count !== "0"
  ) {
    throw new Error(
      `Expand created a forbidden migration side effect: ${
        JSON.stringify(effect)
      }.`,
    );
  }

  await client.query("COMMIT");
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    mode: "applied",
    database: identity.database_name,
    databaseOid: identity.database_oid,
    plane: "mesh",
    approvalTicket: options.approvalTicket,
    expandContractVersion: meshAuthorizationV2ExpandContractVersion,
    orderedDdlSha256,
    receipt,
    capture: captureAfter,
    deferredConstraintCount: 0,
    invalidationTargetCount: meshAuthorizationV2InvalidationTargets.length,
    targetTableCount: meshAuthorizationV2AllTables.length,
    nextRequiredStep:
      "separately approve capture-bound W0 marker, snapshot/backfill, "
      + "and replay binding; this installer performed none of them",
  }, null, 2)}\n`);
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await client.end().catch(() => undefined);
}

function resolveMeshConnectionString(): string {
  const explicit = [
    process.env.MESH_AUTHORIZATION_V2_DATABASE_URL?.trim(),
    process.env.MESH_DATABASE_ADMIN_URL?.trim(),
  ].filter((value): value is string => Boolean(value));
  if (explicit.length === 0) {
    throw new Error(
      "MESH_AUTHORIZATION_V2_DATABASE_URL or MESH_DATABASE_ADMIN_URL "
      + "is required for --apply.",
    );
  }
  if (new Set(explicit).size !== 1) {
    throw new Error(
      "The two explicit Mesh administrative URLs disagree; refusing "
      + "ambiguous target selection.",
    );
  }
  return explicit[0]!;
}

async function readDatabaseIdentity(
  clientToRead: pg.Client,
): Promise<DatabaseIdentity> {
  const result = await clientToRead.query<DatabaseIdentity>(`
    SELECT
      current_database() AS database_name,
      (
        SELECT oid::text
        FROM pg_database
        WHERE datname = current_database()
      ) AS database_oid,
      COALESCE((
        SELECT array_agg(nspname ORDER BY nspname)
        FROM pg_namespace
        WHERE nspname = ANY($1::text[])
      ), ARRAY[]::text[]) AS present_required_schemas,
      COALESCE((
        SELECT array_agg(nspname ORDER BY nspname)
        FROM pg_namespace
        WHERE nspname = ANY($2::text[])
      ), ARRAY[]::text[]) AS present_forbidden_schemas,
      COALESCE((
        SELECT array_agg(nspname ORDER BY nspname)
        FROM pg_namespace
        WHERE nspname <> ALL($1::text[])
          AND nspname <> 'public'
          AND nspname <> 'information_schema'
          AND nspname !~ '^pg_'
      ), ARRAY[]::text[]) AS unexpected_user_schemas,
      EXISTS (
        SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin'
      ) AS admin_role_present,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin'
        )
        THEN pg_has_role(session_user, 'athyperadmin', 'member')
        ELSE false
      END AS session_is_admin
  `, [
    [...meshAuthorizationV2RequiredSchemas],
    [...meshAuthorizationV2ForbiddenNeonSchemas],
  ]);
  const identity = result.rows[0];
  if (!identity) throw new Error("Could not identify the target database.");
  return identity;
}

function assertDatabaseIdentity(
  identity: DatabaseIdentity,
  expectedDatabase: string,
): void {
  if (identity.database_name !== expectedDatabase) {
    throw new Error(
      `Database identity mismatch: expected ${expectedDatabase}, `
      + `got ${identity.database_name}.`,
    );
  }
  assertExactStrings(
    identity.present_required_schemas,
    [...meshAuthorizationV2RequiredSchemas].sort(),
    "required Mesh schema fingerprint",
  );
  if (identity.present_forbidden_schemas.length > 0) {
    throw new Error(
      "Target contains Neon-owned schemas: "
      + identity.present_forbidden_schemas.join(", "),
    );
  }
  if (identity.unexpected_user_schemas.length > 0) {
    throw new Error(
      "Target is not an exact Mesh database; unexpected application "
      + `schemas are present: ${identity.unexpected_user_schemas.join(", ")}.`,
    );
  }
  if (!identity.admin_role_present || !identity.session_is_admin) {
    throw new Error(
      "The target must have athyperadmin and the session must be its member.",
    );
  }
}

async function readCaptureState(
  clientToRead: pg.Client,
): Promise<CaptureState> {
  const result = await clientToRead.query<CaptureState>(`
    WITH source_set AS (
      SELECT COALESCE(
        array_agg(
          format('%I.%I', source_schema, source_table)
          ORDER BY format('%I.%I', source_schema, source_table)
        ),
        ARRAY[]::text[]
      ) AS registered_sources
      FROM mesh_control.authorization_capture_source
      WHERE capture_enabled
    ),
    trigger_health AS (
      SELECT count(*) FILTER (
        WHERE relation_id IS NULL
          OR row_state IS DISTINCT FROM 'A'
          OR truncate_state IS DISTINCT FROM 'A'
      )::text AS invalid_trigger_count
      FROM (
        SELECT
          to_regclass(format(
            '%I.%I',
            source.source_schema,
            source.source_table
          )) AS relation_id,
          row_trigger.tgenabled::text AS row_state,
          truncate_trigger.tgenabled::text AS truncate_state
        FROM mesh_control.authorization_capture_source AS source
        LEFT JOIN pg_trigger AS row_trigger
          ON row_trigger.tgrelid = to_regclass(format(
            '%I.%I',
            source.source_schema,
            source.source_table
          ))
         AND row_trigger.tgname = 'trg_mesh_authz_wave0_capture_row'
         AND NOT row_trigger.tgisinternal
        LEFT JOIN pg_trigger AS truncate_trigger
          ON truncate_trigger.tgrelid = to_regclass(format(
            '%I.%I',
            source.source_schema,
            source.source_table
          ))
         AND truncate_trigger.tgname = 'trg_mesh_authz_wave0_capture_truncate'
         AND NOT truncate_trigger.tgisinternal
        WHERE source.capture_enabled
      ) AS triggers
    )
    SELECT
      clock.source_database_id::text,
      clock.capture_contract_version,
      clock.current_watermark::text,
      (
        SELECT count(*)::text
        FROM mesh_log.authorization_change_event
        WHERE source_database_id = clock.source_database_id
      ) AS change_event_count,
      source_set.registered_sources,
      trigger_health.invalid_trigger_count
    FROM mesh_log.authorization_capture_clock AS clock
    CROSS JOIN source_set
    CROSS JOIN trigger_health
    WHERE clock.singleton_id = 1
      AND clock.plane_key = 'mesh'
  `);
  const state = result.rows[0];
  if (!state) throw new Error("The Mesh Wave 0 capture clock is absent.");
  return state;
}

function assertCaptureState(state: CaptureState): void {
  if (
    state.capture_contract_version
      !== meshAuthorizationV2Sentinels.captureContractVersion
    || state.invalid_trigger_count !== "0"
    || BigInt(state.current_watermark) !== BigInt(state.change_event_count)
  ) {
    throw new Error(
      `Mesh Wave 0 capture is unhealthy: ${JSON.stringify(state)}.`,
    );
  }
  assertExactStrings(
    state.registered_sources,
    [...meshAuthorizationV2Wave0Sources],
    "enabled Wave 0 capture source set",
  );
}

async function readDeferredState(
  clientToRead: pg.Client,
): Promise<DeferredState> {
  const relationNames = meshAuthorizationV2AllTables.map((name) => {
    const [schema, table] = name.split(".");
    return { schema, table };
  });
  const result = await clientToRead.query<DeferredState>(`
    SELECT
      (
        SELECT count(*)::text
        FROM mesh_control.authorization_v2_deferred_constraint_registry
      ) AS registry_count,
      (
        SELECT count(*)::text
        FROM pg_constraint AS constraint_record
        JOIN pg_class AS table_record
          ON table_record.oid = constraint_record.conrelid
        JOIN pg_namespace AS namespace_record
          ON namespace_record.oid = table_record.relnamespace
        WHERE NOT constraint_record.convalidated
          AND (namespace_record.nspname, table_record.relname) IN (
            SELECT relation.schema_name, relation.table_name
            FROM jsonb_to_recordset($1::jsonb)
              AS relation(schema_name text, table_name text)
          )
      ) AS unvalidated_live_count
  `, [JSON.stringify(relationNames.map(({ schema, table }) => ({
    schema_name: schema,
    table_name: table,
  })))]);
  const state = result.rows[0];
  if (!state) throw new Error("Could not reconcile deferred constraints.");
  return state;
}

async function assertInvalidationManifest(clientToRead: pg.Client) {
  const result = await clientToRead.query<{
    target_relation: string;
    trigger_state: string;
    trigger_type: number;
  }>(`
    SELECT
      format('%I.%I', namespace_record.nspname, table_record.relname)
        AS target_relation,
      trigger_record.tgenabled::text AS trigger_state,
      trigger_record.tgtype::integer AS trigger_type
    FROM pg_trigger AS trigger_record
    JOIN pg_class AS table_record
      ON table_record.oid = trigger_record.tgrelid
    JOIN pg_namespace AS namespace_record
      ON namespace_record.oid = table_record.relnamespace
    WHERE NOT trigger_record.tgisinternal
      AND trigger_record.tgname = 'trg_authorization_v2_invalidate'
    ORDER BY target_relation
  `);
  assertExactStrings(
    result.rows.map((row) => row.target_relation),
    [...meshAuthorizationV2InvalidationTargets].sort(),
    "canonical invalidation trigger manifest",
  );
  const invalid = result.rows.filter(
    (row) => row.trigger_state !== "A" || row.trigger_type !== 29,
  );
  if (invalid.length > 0) {
    throw new Error(
      "Every invalidation trigger must be ENABLE ALWAYS AFTER ROW I/U/D: "
      + JSON.stringify(invalid),
    );
  }
}

async function assertRlsManifest(clientToRead: pg.Client) {
  const result = await clientToRead.query<{
    target_relation: string;
    row_security: boolean;
    force_row_security: boolean;
  }>(`
    SELECT
      format('%I.%I', namespace_record.nspname, table_record.relname)
        AS target_relation,
      table_record.relrowsecurity AS row_security,
      table_record.relforcerowsecurity AS force_row_security
    FROM pg_class AS table_record
    JOIN pg_namespace AS namespace_record
      ON namespace_record.oid = table_record.relnamespace
    WHERE format('%I.%I', namespace_record.nspname, table_record.relname)
          = ANY($1::text[])
  `, [[...meshAuthorizationV2AllTables]]);
  assertExactStrings(
    result.rows.map((row) => row.target_relation).sort(),
    [...meshAuthorizationV2AllTables].sort(),
    "Wave 1 target table manifest",
  );
  const unprotected = result.rows.filter(
    (row) => !row.row_security || !row.force_row_security,
  );
  if (unprotected.length > 0) {
    throw new Error(
      "Every Mesh Wave 1 target must ENABLE and FORCE RLS: "
      + JSON.stringify(unprotected),
    );
  }
}

async function assertValidatedTargetConstraints(clientToRead: pg.Client) {
  const result = await clientToRead.query<{
    unvalidated_count: string;
    exact_operation_permission_fk: string;
    exact_operation_plane_permission_fk: string;
  }>(`
    SELECT
      count(*) FILTER (WHERE NOT constraint_record.convalidated)::text
        AS unvalidated_count,
      count(*) FILTER (
        WHERE constraint_record.conname
          = 'mesh_auth_entity_operation_exact_permission_fk'
          AND constraint_record.convalidated
      )::text AS exact_operation_permission_fk,
      count(*) FILTER (
        WHERE constraint_record.conname
          = 'mesh_auth_entity_operation_plane_permission_plane_fk'
          AND constraint_record.convalidated
      )::text AS exact_operation_plane_permission_fk
    FROM pg_constraint AS constraint_record
    JOIN pg_class AS table_record
      ON table_record.oid = constraint_record.conrelid
    JOIN pg_namespace AS namespace_record
      ON namespace_record.oid = table_record.relnamespace
    WHERE format('%I.%I', namespace_record.nspname, table_record.relname)
          = ANY($1::text[])
  `, [[...meshAuthorizationV2AllTables]]);
  const state = result.rows[0];
  if (
    !state
    || state.unvalidated_count !== "0"
    || state.exact_operation_permission_fk !== "1"
    || state.exact_operation_plane_permission_fk !== "1"
  ) {
    throw new Error(
      "Validated exact-operation/permission constraint gate failed: "
      + JSON.stringify(state),
    );
  }
}

function assertExactStrings(
  actual: string[],
  expected: string[],
  label: string,
): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label} mismatch: expected ${JSON.stringify(expected)}, `
      + `got ${JSON.stringify(actual)}.`,
    );
  }
}

function assertMeshBoundary(path: string, source: string): void {
  if (!/^ddl\/(?:mesh_control|mesh|mesh_log)\//.test(path)) {
    throw new Error(`Non-Mesh path in Mesh expand manifest: ${path}`);
  }
  const executable = stripSqlComments(source);
  const forbidden = executable.match(
    /\b(?:FROM|JOIN|INTO|UPDATE|REFERENCES|TABLE|FUNCTION|VIEW|SEQUENCE)\s+(?:control|master|event|log|document|audit|ledger)\s*\./i,
  ) ?? executable.match(
    /\b(?:control|master|event|log|document|audit|ledger)\.[a-z][a-z0-9_]*\s*\(/i,
  ) ?? executable.match(
    /\bSET\s+search_path\s*=[^;]*\b(?:control|master|event|log|document|audit|ledger)\b/i,
  );
  if (forbidden) {
    throw new Error(
      `${path} contains a Neon-owned schema dependency: ${forbidden[0]}`,
    );
  }
  if (/\btenant_id\b/i.test(executable)) {
    throw new Error(`${path} contains forbidden Neon tenant semantics.`);
  }
  if (
    /\bshared\.(?:auth_permission_category|module|permission|role|persona|plan)\b/i
      .test(executable)
  ) {
    throw new Error(`${path} depends on a Neon commercial/authorization table.`);
  }
}

function assertAdditiveSql(path: string, source: string): void {
  const executable = stripSqlComments(source);
  const banned = [
    /\bDROP\s+(?:TABLE|SCHEMA|TYPE)\b/i,
    /\bALTER\s+TABLE\b[\s\S]{0,300}\bDROP\s+COLUMN\b/i,
    /(?:^|;)\s*TRUNCATE\s+(?:TABLE\s+)?[a-z"]/im,
    /\bDELETE\s+FROM\b/i,
    /\bRENAME\s+(?:TO|COLUMN)\b/i,
    /\bALTER\s+COLUMN\b[\s\S]{0,160}\bSET\s+NOT\s+NULL\b/i,
  ];
  for (const pattern of banned) {
    if (pattern.test(executable)) {
      throw new Error(
        `${path} violates the additive expand contract: ${pattern}.`,
      );
    }
  }
}

function stripSqlComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ");
}

function parseOptions(args: string[]): Options {
  const result: Options = {
    apply: false,
    lockTimeoutMs: 10_000,
    statementTimeoutMs: 120_000,
  };
  for (const argument of args) {
    if (argument === "--apply") result.apply = true;
    else if (argument === "--help") {
      process.stdout.write(
        "Usage: install-mesh-authorization-v2-expand.ts "
        + "[--apply --expected-database=NAME --approval-ticket=TICKET "
        + "--lock-timeout-ms=N --statement-timeout-ms=N]\n",
      );
      process.exit(0);
    } else if (argument.startsWith("--expected-database=")) {
      result.expectedDatabase = value(argument, "--expected-database=");
    } else if (argument.startsWith("--approval-ticket=")) {
      result.approvalTicket = value(argument, "--approval-ticket=");
    } else if (argument.startsWith("--lock-timeout-ms=")) {
      result.lockTimeoutMs = positiveInteger(
        value(argument, "--lock-timeout-ms="),
        "--lock-timeout-ms",
      );
    } else if (argument.startsWith("--statement-timeout-ms=")) {
      result.statementTimeoutMs = positiveInteger(
        value(argument, "--statement-timeout-ms="),
        "--statement-timeout-ms",
      );
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return result;
}

function positiveInteger(raw: string, label: string): number {
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return parsed;
}

function value(argument: string, prefix: string): string {
  const parsed = argument.slice(prefix.length).trim();
  if (!parsed) throw new Error(`${prefix.slice(0, -1)} requires a value.`);
  return parsed;
}
