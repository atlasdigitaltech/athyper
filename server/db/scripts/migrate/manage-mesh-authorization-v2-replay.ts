#!/usr/bin/env tsx
/**
 * Guarded Mesh-only Wave 1 replay binding and complete-transaction staging.
 *
 * Default mode is a no-connection plan. --status is repeatable-read/read-only.
 * --bind and --stage require --apply, exact target identity, approval, the
 * Mesh advisory lock, a healthy exact eight-source Wave 0 stream, and the
 * canonical Mesh plane. This manager never transforms target rows, begins an
 * application lease, advances a checkpoint, or changes a reader selector.
 */

import pg from "pg";

import {
  meshAuthorizationV2AdvisoryLockKey,
  meshAuthorizationV2ForbiddenNeonSchemas,
  meshAuthorizationV2RequiredSchemas,
  meshAuthorizationV2Sentinels,
  meshAuthorizationV2Wave0Sources,
} from "../contracts/mesh-authorization-v2-wave1.js";

type Action = "plan" | "status" | "bind" | "stage";

interface Options {
  action: Action;
  apply: boolean;
  expectedDatabase?: string;
  approvalTicket?: string;
  migrationRunId?: string;
  snapshotMarkerId?: string;
  consumerName?: string;
  transformerVersion?: string;
  limit: number;
}

interface Identity {
  database_name: string;
  required_schemas: string[];
  forbidden_schemas: string[];
  unexpected_schemas: string[];
  session_is_admin: boolean;
}

interface SourceState {
  source_database_id: string;
  capture_contract_version: string;
  current_watermark: string;
  source_relations: string[];
  invalid_trigger_count: string;
  plane_count: string;
  exact_plane_count: string;
}

const options = parseOptions(process.argv.slice(2));

if (options.action === "plan") {
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    mode: "dry_run",
    mutatesDatabase: false,
    planeBoundary: "mesh_database_only",
    connectionEnvironment:
      "MESH_AUTHORIZATION_V2_DATABASE_URL or MESH_DATABASE_ADMIN_URL",
    actions: {
      status:
        "read-only source/binding/checkpoint/transaction/conservation health",
      bind:
        "bind one approved run to its exact source UUID, durable W0 "
        + "(including zero), capture version, and transformer",
      stage:
        "copy only complete contiguous post-W0 source transactions into inbox",
    },
    explicitlyExcluded: [
      "capture installation",
      "snapshot/backfill",
      "transformer registration or execution",
      "application lease / target-row transformation",
      "checkpoint advancement",
      "reader cutover or legacy contraction",
    ],
  }, null, 2)}\n`);
  process.exit(0);
}

if (!options.expectedDatabase || !options.migrationRunId) {
  throw new Error(
    "--status/--bind/--stage require --expected-database=<exact name> "
    + "and --migration-run-id=<uuid>.",
  );
}
assertUuid(options.migrationRunId, "migration-run-id");

if (options.action !== "status") {
  if (!options.apply || !options.approvalTicket) {
    throw new Error(
      "--bind/--stage require --apply and --approval-ticket=<ticket>.",
    );
  }
}
if (options.action === "bind") {
  if (
    !options.snapshotMarkerId
    || !options.consumerName
    || !options.transformerVersion
  ) {
    throw new Error(
      "--bind also requires --snapshot-marker-id=<uuid>, --consumer=<name>, "
      + "and --transformer-version=<version>.",
    );
  }
  assertUuid(options.snapshotMarkerId, "snapshot-marker-id");
}

const client = new pg.Client({
  connectionString: resolveMeshConnectionString(),
  application_name: "wave1-mesh-authorization-v2-replay-manager",
});

try {
  await client.connect();
  await client.query(
    options.action === "status"
      ? "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
      : "BEGIN",
  );
  await client.query("SET LOCAL statement_timeout = '120s'");
  if (options.action !== "status") {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [meshAuthorizationV2AdvisoryLockKey],
    );
    await client.query(
      "SELECT set_config('app.authorization_migration_approval_ticket', $1, true)",
      [options.approvalTicket],
    );
  }

  const identity = await readIdentity(client);
  assertIdentity(identity, options.expectedDatabase);
  const source = await readSourceState(client);
  assertSourceState(source);
  const run = await assertRunIdentity(
    client,
    options.migrationRunId,
    source,
  );

  if (options.action === "status") {
    const [
      readiness,
      replay,
      invalidation,
      evidence,
      transactionIntegrity,
    ] = await Promise.all([
      client.query(`
        SELECT *
        FROM mesh_log.v_authorization_migration_readiness_v2
        WHERE migration_run_id = $1::uuid
      `, [options.migrationRunId]),
      client.query(`
        SELECT *
        FROM mesh_log.v_authorization_replay_health_v2
        WHERE migration_run_id = $1::uuid
      `, [options.migrationRunId]),
      client.query(`
        SELECT *
        FROM mesh_log.v_authorization_invalidation_health_v2
        ORDER BY scope_kind, boundary_kind, status
      `),
      client.query(`
        SELECT
          count(*)::bigint AS evidence_count,
          min(observed_at) AS earliest_decision_at,
          max(observed_at) AS latest_decision_at
        FROM mesh_log.auth_decision_evidence_v2
      `),
      readTransactionIntegrity(client, options.migrationRunId),
    ]);
    await client.query("COMMIT");
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      mode: "status",
      database: identity.database_name,
      plane: "mesh",
      source,
      run,
      readiness: readiness.rows,
      replay: replay.rows,
      transactionIntegrity: transactionIntegrity.rows[0],
      invalidation: invalidation.rows,
      globalDecisionEvidence: evidence.rows[0],
    }, null, 2)}\n`);
  } else if (options.action === "bind") {
    const marker = (await client.query<{
      source_database_id: string;
      capture_contract_version: string;
      source_watermark: string;
      recorded_at: string;
      capture_installed_at: string | null;
      snapshot_completed_at: string | null;
      run_snapshot_watermark: string | null;
    }>(`
      SELECT
        marker.source_database_id::text,
        marker.capture_contract_version,
        marker.source_watermark::text,
        marker.recorded_at::text,
        migration_run.capture_installed_at::text,
        migration_run.snapshot_completed_at::text,
        migration_run.snapshot_watermark::text AS run_snapshot_watermark
      FROM mesh_log.authorization_snapshot_marker AS marker
      JOIN mesh_control.authorization_migration_run AS migration_run
        ON migration_run.id = marker.migration_run_id
      WHERE marker.id = $1::uuid
        AND marker.migration_run_id = $2::uuid
        AND marker.plane_key = 'mesh'
    `, [
      options.snapshotMarkerId,
      options.migrationRunId,
    ])).rows[0];
    if (
      !marker
      || marker.capture_installed_at === null
      || marker.snapshot_completed_at === null
      || marker.source_database_id !== source.source_database_id
      || marker.capture_contract_version !== source.capture_contract_version
      || marker.run_snapshot_watermark !== marker.source_watermark
      || BigInt(marker.source_watermark) < 0n
      || new Date(marker.capture_installed_at) > new Date(marker.recorded_at)
    ) {
      throw new Error(
        "Capture-before-marker/source UUID/version/W0/snapshot binding "
        + `precondition failed: ${JSON.stringify(marker)}.`,
      );
    }

    const binding = await client.query(`
      SELECT *
      FROM mesh_log.fn_authorization_bind_replay_v2(
        $1::uuid,
        $2::uuid,
        $3::text,
        $4::text,
        $5::text
      )
    `, [
      options.migrationRunId,
      options.snapshotMarkerId,
      options.consumerName,
      options.transformerVersion,
      options.approvalTicket,
    ]);
    await client.query("COMMIT");
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      mode: "bound",
      database: identity.database_name,
      sourceDatabaseId: source.source_database_id,
      snapshotWatermark: marker.source_watermark,
      binding: binding.rows[0],
      nextRequiredStep:
        "stage complete transactions; target transformation/checkpoint "
        + "application remains a separately approved projector action",
    }, null, 2)}\n`);
  } else {
    const staged = await client.query(`
      SELECT
        id,
        source_database_id,
        source_txid,
        first_watermark,
        last_watermark,
        event_count,
        inbox_sha256,
        state
      FROM mesh_log.fn_authorization_stage_replay_v2(
        $1::uuid,
        $2::integer
      )
    `, [options.migrationRunId, options.limit]);
    const transactionIntegrity = await readTransactionIntegrity(
      client,
      options.migrationRunId,
    );
    const health = transactionIntegrity.rows[0];
    if (
      !health
      || health.partial_transaction_count !== "0"
      || health.gap_count !== "0"
      || health.source_identity_mismatch_count !== "0"
    ) {
      throw new Error(
        "Staged replay is not complete, contiguous, and source-bound: "
        + JSON.stringify(health),
      );
    }
    await client.query("COMMIT");
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      mode: "staged",
      database: identity.database_name,
      sourceDatabaseId: source.source_database_id,
      stagedTransactionCount: staged.rowCount,
      transactions: staged.rows,
      transactionIntegrity: health,
      checkpointAdvanced: false,
      targetRowsTransformed: false,
    }, null, 2)}\n`);
  }
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
      + "is required.",
    );
  }
  if (new Set(explicit).size !== 1) {
    throw new Error("Explicit Mesh administrative URLs disagree.");
  }
  return explicit[0]!;
}

async function readIdentity(clientToRead: pg.Client): Promise<Identity> {
  const identity = (await clientToRead.query<Identity>(`
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
      ), ARRAY[]::text[]) AS unexpected_schemas,
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
  ])).rows[0];
  if (!identity) throw new Error("Could not identify the target database.");
  return identity;
}

function assertIdentity(identity: Identity, expectedDatabase: string): void {
  if (identity.database_name !== expectedDatabase) {
    throw new Error(
      `Database identity mismatch: expected ${expectedDatabase}, `
      + `got ${identity.database_name}.`,
    );
  }
  assertExactStrings(
    identity.required_schemas,
    [...meshAuthorizationV2RequiredSchemas].sort(),
    "required Mesh schema fingerprint",
  );
  if (
    identity.forbidden_schemas.length > 0
    || identity.unexpected_schemas.length > 0
    || !identity.session_is_admin
  ) {
    throw new Error(
      "Replay target contains a Neon-owned/unexpected schema or session "
      + "is not a member of athyperadmin.",
    );
  }
}

async function readSourceState(
  clientToRead: pg.Client,
): Promise<SourceState> {
  const state = (await clientToRead.query<SourceState>(`
    WITH source_set AS (
      SELECT COALESCE(array_agg(
        format('%I.%I', source_schema, source_table)
        ORDER BY format('%I.%I', source_schema, source_table)
      ), ARRAY[]::text[]) AS source_relations
      FROM mesh_control.authorization_capture_source
      WHERE capture_enabled
    ),
    trigger_health AS (
      SELECT count(*) FILTER (
        WHERE row_trigger.tgenabled IS DISTINCT FROM 'A'
          OR truncate_trigger.tgenabled IS DISTINCT FROM 'A'
      )::text AS invalid_trigger_count
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
    )
    SELECT
      clock.source_database_id::text,
      clock.capture_contract_version,
      clock.current_watermark::text,
      source_set.source_relations,
      trigger_health.invalid_trigger_count,
      (SELECT count(*)::text FROM mesh_control.auth_plane) AS plane_count,
      (SELECT count(*)::text FROM mesh_control.auth_plane
       WHERE id = $1::uuid
         AND plane_code = 'mesh'
         AND status = 'active') AS exact_plane_count
    FROM mesh_log.authorization_capture_clock AS clock
    CROSS JOIN source_set
    CROSS JOIN trigger_health
    WHERE clock.singleton_id = 1
      AND clock.plane_key = 'mesh'
  `, [meshAuthorizationV2Sentinels.planeId])).rows[0];
  if (!state) throw new Error("Mesh capture/plane state is absent.");
  return state;
}

function assertSourceState(source: SourceState): void {
  if (
    source.capture_contract_version
      !== meshAuthorizationV2Sentinels.captureContractVersion
    || source.invalid_trigger_count !== "0"
    || source.plane_count !== "1"
    || source.exact_plane_count !== "1"
    || BigInt(source.current_watermark) < 0n
  ) {
    throw new Error(
      `Mesh capture/plane gate failed: ${JSON.stringify(source)}.`,
    );
  }
  assertExactStrings(
    source.source_relations,
    [...meshAuthorizationV2Wave0Sources],
    "exact Wave 0 source set",
  );
}

async function assertRunIdentity(
  clientToRead: pg.Client,
  migrationRunId: string,
  source: SourceState,
) {
  const run = (await clientToRead.query<{
    migration_run_id: string;
    plane_key: string;
    source_database_id: string;
    capture_contract_version: string;
    status: string;
    snapshot_watermark: string | null;
    last_applied_watermark: string | null;
  }>(`
    SELECT
      id::text AS migration_run_id,
      plane_key,
      source_database_id::text,
      capture_contract_version,
      status,
      snapshot_watermark::text,
      last_applied_watermark::text
    FROM mesh_control.authorization_migration_run
    WHERE id = $1::uuid
  `, [migrationRunId])).rows[0];
  if (
    !run
    || run.plane_key !== "mesh"
    || run.source_database_id !== source.source_database_id
    || run.capture_contract_version !== source.capture_contract_version
  ) {
    throw new Error(
      `Migration run is not bound to this Mesh source: ${JSON.stringify(run)}.`,
    );
  }
  if (
    (run.snapshot_watermark !== null && BigInt(run.snapshot_watermark) < 0n)
    || (
      run.last_applied_watermark !== null
      && BigInt(run.last_applied_watermark) < 0n
    )
  ) {
    throw new Error("Migration run contains an invalid negative watermark.");
  }
  return run;
}

function readTransactionIntegrity(
  clientToRead: pg.Client,
  migrationRunId: string,
) {
  return clientToRead.query<{
    transaction_count: string;
    partial_transaction_count: string;
    gap_count: string;
    source_identity_mismatch_count: string;
  }>(`
    WITH binding AS (
      SELECT *
      FROM mesh_log.authorization_v2_replay_binding
      WHERE migration_run_id = $1::uuid
    ),
    ordered AS (
      SELECT
        replay_tx.*,
        lag(replay_tx.last_watermark) OVER (
          ORDER BY replay_tx.first_watermark
        ) AS previous_last_watermark
      FROM mesh_log.authorization_v2_replay_transaction AS replay_tx
      WHERE replay_tx.migration_run_id = $1::uuid
    ),
    reconciled AS (
      SELECT
        ordered.*,
        inbox.inbox_count,
        inbox.inbox_min_watermark,
        inbox.inbox_max_watermark
      FROM ordered
      LEFT JOIN LATERAL (
        SELECT
          count(*)::bigint AS inbox_count,
          min(source_watermark) AS inbox_min_watermark,
          max(source_watermark) AS inbox_max_watermark
        FROM mesh_log.authorization_v2_replay_inbox AS inbox_row
        WHERE inbox_row.replay_transaction_id = ordered.id
      ) AS inbox ON true
    )
    SELECT
      count(*)::text AS transaction_count,
      count(*) FILTER (
        WHERE inbox_count <> event_count
          OR inbox_min_watermark IS DISTINCT FROM first_watermark
          OR inbox_max_watermark IS DISTINCT FROM last_watermark
      )::text AS partial_transaction_count,
      count(*) FILTER (
        WHERE first_watermark <> COALESCE(
          previous_last_watermark,
          (SELECT snapshot_watermark FROM binding)
        ) + 1
      )::text AS gap_count,
      count(*) FILTER (
        WHERE source_database_id IS DISTINCT FROM
              (SELECT source_database_id FROM binding)
      )::text AS source_identity_mismatch_count
    FROM reconciled
  `);
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
  const result: Options = {
    action: "plan",
    apply: false,
    limit: 100,
  };
  for (const argument of args) {
    if (argument === "--apply") result.apply = true;
    else if (argument === "--status") setAction(result, "status");
    else if (argument === "--bind") setAction(result, "bind");
    else if (argument === "--stage") setAction(result, "stage");
    else if (argument === "--help") {
      process.stdout.write(
        "Usage: manage-mesh-authorization-v2-replay.ts "
        + "[--status --expected-database=NAME --migration-run-id=UUID] "
        + "[--bind|--stage --apply --expected-database=NAME "
        + "--approval-ticket=TICKET --migration-run-id=UUID ...]\n",
      );
      process.exit(0);
    } else if (argument.startsWith("--expected-database=")) {
      result.expectedDatabase = value(argument, "--expected-database=");
    } else if (argument.startsWith("--approval-ticket=")) {
      result.approvalTicket = value(argument, "--approval-ticket=");
    } else if (argument.startsWith("--migration-run-id=")) {
      result.migrationRunId = value(argument, "--migration-run-id=");
    } else if (argument.startsWith("--snapshot-marker-id=")) {
      result.snapshotMarkerId = value(argument, "--snapshot-marker-id=");
    } else if (argument.startsWith("--consumer=")) {
      result.consumerName = value(argument, "--consumer=");
    } else if (argument.startsWith("--transformer-version=")) {
      result.transformerVersion = value(argument, "--transformer-version=");
    } else if (argument.startsWith("--limit=")) {
      const parsed = Number(value(argument, "--limit="));
      if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 1000) {
        throw new Error("--limit must be an integer from 1 through 1000.");
      }
      result.limit = parsed;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (result.action === "status" && result.apply) {
    throw new Error("--status is read-only and cannot be combined with --apply.");
  }
  return result;
}

function setAction(optionsToUpdate: Options, action: Action): void {
  if (optionsToUpdate.action !== "plan") {
    throw new Error("Choose exactly one of --status, --bind, or --stage.");
  }
  optionsToUpdate.action = action;
}

function assertUuid(valueToCheck: string, label: string): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(valueToCheck)
  ) {
    throw new Error(`--${label} must be a UUID.`);
  }
}

function value(argument: string, prefix: string): string {
  const parsed = argument.slice(prefix.length).trim();
  if (!parsed) throw new Error(`${prefix.slice(0, -1)} requires a value.`);
  return parsed;
}
