#!/usr/bin/env tsx
/**
 * Guarded Mesh Wave 1 pre-backfill expand rollback.
 *
 * The only destructive mode is an exact pre-marker/pre-backfill uninstall of
 * the immutable expand receipt and its still-empty targets. Once a marker,
 * backfill, replay, decision, invalidation, conservation evidence, epoch, or
 * canonical business row exists, rollback means selecting legacy readers and
 * retaining the shadow/evidence structures; this script refuses to drop them.
 * Wave 0 capture is locked, fingerprinted before/after, and never removed.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import {
  meshAuthorizationV2AdvisoryLockKey,
  meshAuthorizationV2AllTables,
  meshAuthorizationV2AllViews,
  meshAuthorizationV2AuthorityTables,
  meshAuthorizationV2CatalogTables,
  meshAuthorizationV2ExpandContractVersion,
  meshAuthorizationV2ForbiddenNeonSchemas,
  meshAuthorizationV2FunctionNames,
  meshAuthorizationV2InvalidationTargets,
  meshAuthorizationV2MigrationTables,
  meshAuthorizationV2OrderedDdl,
  meshAuthorizationV2RequiredSchemas,
  meshAuthorizationV2RuntimeTables,
  meshAuthorizationV2Sentinels,
  meshAuthorizationV2Wave0Sources,
} from "../contracts/mesh-authorization-v2-expand.js";

const exactConfirmation =
  "PRE_BACKFILL_MESH_AUTHORIZATION_V2_EXPAND_ROLLBACK";

interface Options {
  apply: boolean;
  expectedDatabase?: string;
  approvalTicket?: string;
  confirmation?: string;
}

interface CaptureState {
  source_database_id: string;
  capture_contract_version: string;
  current_watermark: string;
  change_event_count: string;
  change_transaction_count: string;
  snapshot_marker_count: string;
  registered_sources: string[];
  invalid_trigger_count: string;
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const databaseRoot = resolve(scriptDirectory, "../..");
const options = parseOptions(process.argv.slice(2));
const meshAuthorizationV2TableSet = new Set<string>(
  meshAuthorizationV2AllTables,
);
const existingDecisionDependencyTargets =
  meshAuthorizationV2InvalidationTargets.filter(
    (target) => !meshAuthorizationV2TableSet.has(target),
  );
const ddl = await Promise.all(meshAuthorizationV2OrderedDdl.map(async (path) => {
  const sql = await readFile(resolve(databaseRoot, path), "utf8");
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
    operation: "pre_backfill_mesh_expand_rollback",
    exactConfirmation,
    connectionEnvironment:
      "MESH_AUTHORIZATION_V2_DATABASE_URL or MESH_DATABASE_ADMIN_URL",
    orderedDdlSha256,
    preserves: {
      wave0Capture: true,
      sourceUuid: true,
      watermarkAndEvents: true,
      exactEightSourceRegistry: true,
      legacyAuthorityRows: true,
    },
    refusalStates: [
      "snapshot marker or snapshot/backfill state",
      "replay binding, transaction, inbox, or application",
      "decision evidence",
      "invalidation outbox or nonzero epoch",
      "transformer or conservation evidence",
      "canonical target business rows",
      "capture identity/watermark/source/trigger drift",
      "receipt/hash/database mismatch",
    ],
    postBackfillPolicy:
      "atomically select legacy readers; retain v2 shadows and evidence",
  }, null, 2)}\n`);
  process.exit(0);
}

if (
  !options.expectedDatabase
  || !options.approvalTicket
  || options.confirmation !== exactConfirmation
) {
  throw new Error(
    "--apply requires --expected-database=<exact name>, "
    + "--approval-ticket=<ticket>, and "
    + `--confirm=${exactConfirmation}.`,
  );
}

const client = new pg.Client({
  connectionString: resolveMeshConnectionString(),
  application_name: "wave1-mesh-authorization-v2-prebackfill-rollback",
});

try {
  await client.connect();
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout = '10s'");
  await client.query("SET LOCAL statement_timeout = '120s'");
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [meshAuthorizationV2AdvisoryLockKey],
  );

  const identity = (await client.query<{
    database_name: string;
    required_schemas: string[];
    forbidden_schemas: string[];
    unexpected_schemas: string[];
  }>(`
    SELECT
      current_database() AS database_name,
      COALESCE((
        SELECT array_agg(nspname ORDER BY nspname)
        FROM pg_namespace
        WHERE nspname = ANY($1::text[])
      ), ARRAY[]::text[]) AS required_schemas,
      COALESCE((
        SELECT array_agg(nspname ORDER BY nspname)
        FROM pg_namespace
        WHERE nspname = ANY($2::text[])
      ), ARRAY[]::text[]) AS forbidden_schemas,
      COALESCE((
        SELECT array_agg(nspname ORDER BY nspname)
        FROM pg_namespace
        WHERE nspname <> ALL($1::text[])
          AND nspname <> 'public'
          AND nspname <> 'information_schema'
          AND nspname !~ '^pg_'
      ), ARRAY[]::text[]) AS unexpected_schemas
  `, [
    [...meshAuthorizationV2RequiredSchemas],
    [...meshAuthorizationV2ForbiddenNeonSchemas],
  ])).rows[0];
  if (!identity || identity.database_name !== options.expectedDatabase) {
    throw new Error(
      `Database identity mismatch: expected ${options.expectedDatabase}, `
      + `got ${identity?.database_name ?? "<unknown>"}.`,
    );
  }
  assertExactStrings(
    identity.required_schemas,
    [...meshAuthorizationV2RequiredSchemas].sort(),
    "required Mesh schemas",
  );
  if (
    identity.forbidden_schemas.length > 0
    || identity.unexpected_schemas.length > 0
  ) {
    throw new Error(
      "Target contains a Neon-owned or unexpected application schema: "
      + JSON.stringify({
        forbidden: identity.forbidden_schemas,
        unexpected: identity.unexpected_schemas,
      }),
    );
  }

  await client.query(`
    LOCK TABLE
      mesh_control.authorization_capture_source,
      mesh_log.authorization_capture_clock
    IN SHARE MODE
  `);
  const captureBefore = await readCaptureState(client);
  assertCaptureState(captureBefore);

  const receiptState = (await client.query<{
    total_count: string;
    exact_count: string;
  }>(`
    SELECT
      count(*)::text AS total_count,
      count(*) FILTER (
        WHERE target_database_name = current_database()
          AND target_database_oid = (
            SELECT oid FROM pg_database WHERE datname = current_database()
          )
          AND source_database_id = $1::uuid
          AND capture_contract_version = $2
          AND expand_contract_version = $3
          AND ordered_ddl_sha256 = $4
          AND ordered_ddl = $5::jsonb
      )::text AS exact_count
    FROM mesh_control.authorization_v2_expand_installation
  `, [
    captureBefore.source_database_id,
    captureBefore.capture_contract_version,
    meshAuthorizationV2ExpandContractVersion,
    orderedDdlSha256,
    JSON.stringify(orderedDdlReceipt),
  ])).rows[0];
  if (
    !receiptState
    || receiptState.total_count !== "1"
    || receiptState.exact_count !== "1"
  ) {
    throw new Error(
      "Rollback requires exactly one receipt matching this database, "
      + `capture identity, and ordered DDL hash: ${
        JSON.stringify(receiptState)
      }.`,
    );
  }

  const progression = (await client.query<{
    marker_count: string;
    progressed_run_count: string;
    transformer_count: string;
    conservation_count: string;
    replay_binding_count: string;
    replay_transaction_count: string;
    replay_inbox_count: string;
    replay_application_count: string;
    invalidation_count: string;
    evidence_count: string;
    account_epoch_count: string;
    plane_epoch_count: string;
    nonzero_global_epoch_count: string;
  }>(`
    SELECT
      (SELECT count(*)::text
       FROM mesh_log.authorization_snapshot_marker) AS marker_count,
      (SELECT count(*)::text
       FROM mesh_control.authorization_migration_run
       WHERE snapshot_started_at IS NOT NULL
          OR snapshot_completed_at IS NOT NULL
          OR snapshot_watermark IS NOT NULL
          OR last_applied_watermark IS NOT NULL
          OR status IN (
            'backfilling', 'replaying', 'shadowing', 'cutover_ready',
            'cutover', 'observing', 'rolled_back', 'completed'
          )) AS progressed_run_count,
      (SELECT count(*)::text
       FROM mesh_control.authorization_v2_transformer_registry)
        AS transformer_count,
      (SELECT count(*)::text
       FROM mesh_control.authorization_v2_conservation_ledger)
        AS conservation_count,
      (SELECT count(*)::text
       FROM mesh_log.authorization_v2_replay_binding)
        AS replay_binding_count,
      (SELECT count(*)::text
       FROM mesh_log.authorization_v2_replay_transaction)
        AS replay_transaction_count,
      (SELECT count(*)::text
       FROM mesh_log.authorization_v2_replay_inbox)
        AS replay_inbox_count,
      (SELECT count(*)::text
       FROM mesh_log.authorization_v2_replay_application)
        AS replay_application_count,
      (SELECT count(*)::text
       FROM mesh_log.authorization_invalidation_outbox_v2)
        AS invalidation_count,
      (SELECT count(*)::text
       FROM mesh_log.auth_decision_evidence_v2)
        AS evidence_count,
      (SELECT count(*)::text
       FROM mesh_log.authorization_account_epoch_v2)
        AS account_epoch_count,
      (SELECT count(*)::text
       FROM mesh_log.authorization_plane_epoch_v2)
        AS plane_epoch_count,
      (SELECT count(*) FILTER (
         WHERE singleton_id <> 1 OR epoch <> 0
       )::text
       FROM mesh_log.authorization_global_epoch_v2)
        AS nonzero_global_epoch_count
  `)).rows[0];
  if (
    !progression
    || Object.values(progression).some((count) => count !== "0")
  ) {
    throw new Error(
      "Destructive uninstall is forbidden after marker/backfill/replay/"
      + "invalidation/evidence/conservation/epoch state. Atomically select "
      + `legacy readers and retain v2 shadows: ${JSON.stringify(progression)}.`,
    );
  }

  await assertSentinelOnlyState(client);
  await assertCanonicalTargetsEmpty(client);

  await client.query(
    "SELECT set_config("
    + "'app.mesh_authorization_v2_prebackfill_rollback_ticket', $1, true)",
    [options.approvalTicket],
  );
  await client.query(
    "SELECT set_config("
    + "'app.mesh_authorization_v2_prebackfill_rollback_confirm', $1, true)",
    [exactConfirmation],
  );
  await client.query(`
    DO $guard$
    BEGIN
      IF btrim(COALESCE(current_setting(
        'app.mesh_authorization_v2_prebackfill_rollback_ticket',
        true
      ), '')) = '' THEN
        RAISE EXCEPTION 'Mesh rollback approval GUC is required';
      END IF;
      IF current_setting(
        'app.mesh_authorization_v2_prebackfill_rollback_confirm',
        true
      ) IS DISTINCT FROM
        'PRE_BACKFILL_MESH_AUTHORIZATION_V2_EXPAND_ROLLBACK'
      THEN
        RAISE EXCEPTION 'Exact Mesh rollback confirmation GUC is required';
      END IF;
    END
    $guard$
  `);

  // Views and non-internal triggers hold dependencies on functions.
  await client.query(
    `DROP VIEW IF EXISTS ${meshAuthorizationV2AllViews.join(", ")}`,
  );

  const triggerDrops = await client.query<{ drop_statement: string }>(`
    SELECT format(
      'DROP TRIGGER %I ON %I.%I',
      trigger_record.tgname,
      namespace_record.nspname,
      table_record.relname
    ) AS drop_statement
    FROM pg_trigger AS trigger_record
    JOIN pg_class AS table_record
      ON table_record.oid = trigger_record.tgrelid
    JOIN pg_namespace AS namespace_record
      ON namespace_record.oid = table_record.relnamespace
    WHERE NOT trigger_record.tgisinternal
      AND (
        format('%I.%I', namespace_record.nspname, table_record.relname)
          = ANY($1::text[])
        OR (
          format('%I.%I', namespace_record.nspname, table_record.relname)
            = ANY($2::text[])
          AND trigger_record.tgname = 'trg_authorization_v2_invalidate'
        )
      )
    ORDER BY namespace_record.nspname, table_record.relname, trigger_record.tgname
  `, [
    [...meshAuthorizationV2AllTables],
    [...existingDecisionDependencyTargets],
  ]);
  for (const row of triggerDrops.rows) {
    await client.query(row.drop_statement);
  }

  const policyDrops = await client.query<{ drop_statement: string }>(`
    SELECT format(
      'DROP POLICY %I ON %I.%I',
      policy_record.polname,
      namespace_record.nspname,
      table_record.relname
    ) AS drop_statement
    FROM pg_policy AS policy_record
    JOIN pg_class AS table_record
      ON table_record.oid = policy_record.polrelid
    JOIN pg_namespace AS namespace_record
      ON namespace_record.oid = table_record.relnamespace
    WHERE format('%I.%I', namespace_record.nspname, table_record.relname)
          = ANY($1::text[])
    ORDER BY namespace_record.nspname, table_record.relname, policy_record.polname
  `, [[...meshAuthorizationV2AllTables]]);
  for (const row of policyDrops.rows) {
    await client.query(row.drop_statement);
  }

  const functionOrder = extractCreatedFunctions().reverse();
  for (const { schema, name } of functionOrder) {
    if (!meshAuthorizationV2FunctionNames.includes(
      name as typeof meshAuthorizationV2FunctionNames[number],
    )) {
      throw new Error(
        `Function ${schema}.${name} is absent from the exact rollback manifest.`,
      );
    }
    const drops = await client.query<{ drop_statement: string }>(`
      SELECT format(
        'DROP FUNCTION %I.%I(%s)',
        namespace_record.nspname,
        function_record.proname,
        pg_get_function_identity_arguments(function_record.oid)
      ) AS drop_statement
      FROM pg_proc AS function_record
      JOIN pg_namespace AS namespace_record
        ON namespace_record.oid = function_record.pronamespace
      WHERE namespace_record.nspname = $1
        AND function_record.proname = $2
      ORDER BY function_record.oid DESC
    `, [schema, name]);
    for (const row of drops.rows) {
      await client.query(row.drop_statement);
    }
  }

  const tablesInDropOrder = [
    ...[...meshAuthorizationV2RuntimeTables].reverse(),
    ...[...meshAuthorizationV2AuthorityTables].reverse(),
    ...[...meshAuthorizationV2CatalogTables].reverse(),
    ...[...meshAuthorizationV2MigrationTables].reverse(),
  ];
  for (const relation of tablesInDropOrder) {
    await client.query(`DROP TABLE IF EXISTS ${relation}`);
  }

  const captureAfter = await readCaptureState(client);
  assertCaptureState(captureAfter);
  if (JSON.stringify(captureAfter) !== JSON.stringify(captureBefore)) {
    throw new Error(
      "Wave 0 capture changed during rollback; transaction will roll back.",
    );
  }

  const remaining = await client.query<{ relation_name: string }>(`
    SELECT relation_name
    FROM unnest($1::text[]) AS expected(relation_name)
    WHERE to_regclass(relation_name) IS NOT NULL
    ORDER BY relation_name
  `, [[...meshAuthorizationV2AllTables]]);
  if (remaining.rows.length > 0) {
    throw new Error(
      "Some Wave 1 target relations remain after rollback: "
      + JSON.stringify(remaining.rows),
    );
  }

  await client.query("COMMIT");
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    mode: "pre_backfill_expand_rolled_back",
    database: identity.database_name,
    approvalTicket: options.approvalTicket,
    orderedDdlSha256,
    wave0CapturePreserved: captureAfter,
    removedTargetTableCount: meshAuthorizationV2AllTables.length,
    postBackfillPolicy:
      "selector-to-legacy only; retain v2 shadows and evidence",
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
    throw new Error("Explicit Mesh administrative URLs disagree.");
  }
  return explicit[0]!;
}

async function readCaptureState(
  clientToRead: pg.Client,
): Promise<CaptureState> {
  const state = (await clientToRead.query<CaptureState>(`
    WITH sources AS (
      SELECT COALESCE(array_agg(
        format('%I.%I', source_schema, source_table)
        ORDER BY format('%I.%I', source_schema, source_table)
      ), ARRAY[]::text[]) AS registered_sources
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
            '%I.%I', source.source_schema, source.source_table
          )) AS relation_id,
          row_trigger.tgenabled::text AS row_state,
          truncate_trigger.tgenabled::text AS truncate_state
        FROM mesh_control.authorization_capture_source AS source
        LEFT JOIN pg_trigger AS row_trigger
          ON row_trigger.tgrelid = to_regclass(format(
            '%I.%I', source.source_schema, source.source_table
          ))
         AND row_trigger.tgname = 'trg_mesh_authz_wave0_capture_row'
         AND NOT row_trigger.tgisinternal
        LEFT JOIN pg_trigger AS truncate_trigger
          ON truncate_trigger.tgrelid = to_regclass(format(
            '%I.%I', source.source_schema, source.source_table
          ))
         AND truncate_trigger.tgname = 'trg_mesh_authz_wave0_capture_truncate'
         AND NOT truncate_trigger.tgisinternal
        WHERE source.capture_enabled
      ) AS trigger_state
    )
    SELECT
      clock.source_database_id::text,
      clock.capture_contract_version,
      clock.current_watermark::text,
      (SELECT count(*)::text
       FROM mesh_log.authorization_change_event
       WHERE source_database_id = clock.source_database_id)
        AS change_event_count,
      (SELECT count(*)::text
       FROM mesh_log.authorization_change_transaction
       WHERE source_database_id = clock.source_database_id)
        AS change_transaction_count,
      (SELECT count(*)::text
       FROM mesh_log.authorization_snapshot_marker)
        AS snapshot_marker_count,
      sources.registered_sources,
      trigger_health.invalid_trigger_count
    FROM mesh_log.authorization_capture_clock AS clock
    CROSS JOIN sources
    CROSS JOIN trigger_health
    WHERE clock.singleton_id = 1
      AND clock.plane_key = 'mesh'
  `)).rows[0];
  if (!state) throw new Error("Wave 0 Mesh capture state is absent.");
  return state;
}

function assertCaptureState(state: CaptureState): void {
  if (
    state.capture_contract_version
      !== meshAuthorizationV2Sentinels.captureContractVersion
    || state.invalid_trigger_count !== "0"
    || BigInt(state.current_watermark) !== BigInt(state.change_event_count)
  ) {
    throw new Error(`Wave 0 Mesh capture is unhealthy: ${JSON.stringify(state)}`);
  }
  assertExactStrings(
    state.registered_sources,
    [...meshAuthorizationV2Wave0Sources],
    "Wave 0 source set",
  );
}

async function assertSentinelOnlyState(clientToRead: pg.Client) {
  const state = (await clientToRead.query<{
    plane_count: string;
    exact_plane_count: string;
    owner_count: string;
    exact_owner_count: string;
    global_epoch_count: string;
    exact_global_epoch_count: string;
    frozen_count: string;
  }>(`
    SELECT
      (SELECT count(*)::text FROM mesh_control.auth_plane) AS plane_count,
      (SELECT count(*)::text FROM mesh_control.auth_plane
       WHERE id = $1::uuid
         AND plane_code = 'mesh'
         AND entitlement_semantics = 'product_and_account_eligibility')
        AS exact_plane_count,
      (SELECT count(*)::text FROM mesh_control.auth_catalog_owner)
        AS owner_count,
      (SELECT count(*)::text FROM mesh_control.auth_catalog_owner
       WHERE id = $2::uuid
         AND owner_kind = 'platform'
         AND account_id IS NULL
         AND owner_code = 'mesh.platform')
        AS exact_owner_count,
      (SELECT count(*)::text
       FROM mesh_log.authorization_global_epoch_v2)
        AS global_epoch_count,
      (SELECT count(*)::text
       FROM mesh_log.authorization_global_epoch_v2
       WHERE singleton_id = 1 AND epoch = 0)
        AS exact_global_epoch_count,
      (SELECT count(*)::text
       FROM mesh_control.authorization_v2_frozen_legacy_object
       WHERE capture_required) AS frozen_count
  `, [
    meshAuthorizationV2Sentinels.planeId,
    meshAuthorizationV2Sentinels.catalogOwnerId,
  ])).rows[0];
  if (
    !state
    || state.plane_count !== "1"
    || state.exact_plane_count !== "1"
    || state.owner_count !== "1"
    || state.exact_owner_count !== "1"
    || state.global_epoch_count !== "1"
    || state.exact_global_epoch_count !== "1"
    || state.frozen_count !== String(meshAuthorizationV2Wave0Sources.length)
  ) {
    throw new Error(
      `Rollback sentinel-only gate failed: ${JSON.stringify(state)}.`,
    );
  }
}

async function assertCanonicalTargetsEmpty(clientToRead: pg.Client) {
  const emptyTargets = [
    ...meshAuthorizationV2CatalogTables.filter(
      (name) => ![
        "mesh_control.auth_plane",
        "mesh_control.auth_catalog_owner",
      ].includes(name),
    ),
    ...meshAuthorizationV2AuthorityTables,
    "mesh_control.authorization_v2_transformer_registry",
    "mesh_control.authorization_v2_deferred_constraint_registry",
    "mesh_control.authorization_v2_conservation_ledger",
    "mesh_log.authorization_account_epoch_v2",
    "mesh_log.authorization_plane_epoch_v2",
    "mesh_log.authorization_invalidation_outbox_v2",
    "mesh_log.authorization_v2_replay_binding",
    "mesh_log.authorization_v2_replay_transaction",
    "mesh_log.authorization_v2_replay_inbox",
    "mesh_log.authorization_v2_replay_application",
    "mesh_log.auth_decision_evidence_v2",
  ];
  const populated: Array<{ relation: string; rowCount: string }> = [];
  for (const relation of emptyTargets) {
    const result = await clientToRead.query<{ row_count: string }>(
      `SELECT count(*)::text AS row_count FROM ${relation}`,
    );
    const rowCount = result.rows[0]?.row_count ?? "<missing>";
    if (rowCount !== "0") populated.push({ relation, rowCount });
  }
  if (populated.length > 0) {
    throw new Error(
      "Canonical target business rows exist. Destructive uninstall is "
      + "forbidden; select legacy readers and retain v2 shadows: "
      + JSON.stringify(populated),
    );
  }
}

function extractCreatedFunctions(): Array<{ schema: string; name: string }> {
  const ordered: Array<{ schema: string; name: string }> = [];
  const seen = new Set<string>();
  for (const file of ddl) {
    for (const match of file.sql.matchAll(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(mesh_control|mesh|mesh_log)\.([a-z][a-z0-9_]*)\s*\(/gi,
    )) {
      const schema = match[1]!.toLowerCase();
      const name = match[2]!.toLowerCase();
      const key = `${schema}.${name}`;
      if (!seen.has(key)) {
        seen.add(key);
        ordered.push({ schema, name });
      }
    }
  }
  return ordered;
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

function parseOptions(args: string[]): Options {
  const result: Options = { apply: false };
  for (const argument of args) {
    if (argument === "--apply") result.apply = true;
    else if (argument === "--help") {
      process.stdout.write(
        "Usage: rollback-mesh-authorization-v2-expand.ts "
        + "--apply --expected-database=NAME --approval-ticket=TICKET "
        + `--confirm=${exactConfirmation}\n`,
      );
      process.exit(0);
    } else if (argument.startsWith("--expected-database=")) {
      result.expectedDatabase = value(argument, "--expected-database=");
    } else if (argument.startsWith("--approval-ticket=")) {
      result.approvalTicket = value(argument, "--approval-ticket=");
    } else if (argument.startsWith("--confirm=")) {
      result.confirmation = value(argument, "--confirm=");
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return result;
}

function value(argument: string, prefix: string): string {
  const parsed = argument.slice(prefix.length).trim();
  if (!parsed) throw new Error(`${prefix.slice(0, -1)} requires a value.`);
  return parsed;
}
