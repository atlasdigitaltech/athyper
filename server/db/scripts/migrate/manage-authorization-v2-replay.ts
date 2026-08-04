#!/usr/bin/env tsx
/**
 * Guarded operator entry point for Wave 1 replay binding and inbox staging.
 *
 * Default mode prints the contract and does not connect. --status is read-only.
 * --bind/--stage require --apply, an exact Neon database name, and an approval
 * ticket. This script never transforms rows or advances a checkpoint.
 */

import pg from "pg";

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

interface DatabaseIdentity {
  database_name: string;
  mesh_schema_present: boolean;
}

const options = parseOptions(process.argv.slice(2));
if (options.action === "plan") {
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    mode: "dry_run",
    mutatesDatabase: false,
    actions: {
      status: "read-only binding/checkpoint/inbox health",
      bind: "bind approved run to exact Wave 0 source UUID and durable W0",
      stage: "copy complete contiguous post-W0 source transactions into inbox",
    },
    explicitlyExcluded: [
      "transformer registration",
      "target-row transformation",
      "backfill",
      "checkpoint advancement",
      "reader cutover",
    ],
    applyRequirements: [
      "--apply",
      "--expected-database=<exact name>",
      "--approval-ticket=<ticket>",
      "--migration-run-id=<uuid>",
    ],
  }, null, 2)}\n`);
  process.exit(0);
}

if (!options.migrationRunId) {
  throw new Error("--migration-run-id=<uuid> is required.");
}
assertUuid(options.migrationRunId, "migration-run-id");
if (options.action !== "status") {
  if (
    !options.apply
    || !options.expectedDatabase
    || !options.approvalTicket
  ) {
    throw new Error(
      "--bind/--stage require --apply, --expected-database, "
      + "--approval-ticket, and --migration-run-id.",
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
      "--bind also requires --snapshot-marker-id, --consumer, "
      + "and --transformer-version.",
    );
  }
  assertUuid(options.snapshotMarkerId, "snapshot-marker-id");
}

const connectionString =
  process.env.AUTHORIZATION_V2_DATABASE_URL?.trim()
  ?? process.env.DATABASE_ADMIN_URL?.trim();
if (!connectionString) {
  throw new Error(
    "AUTHORIZATION_V2_DATABASE_URL or DATABASE_ADMIN_URL is required.",
  );
}

const client = new pg.Client({
  connectionString,
  application_name: "wave1-authorization-v2-replay-manager",
});

try {
  await client.connect();
  await client.query(
    options.action === "status"
      ? "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
      : "BEGIN",
  );
  await client.query("SET LOCAL statement_timeout = '120s'");

  const identity = (await client.query<DatabaseIdentity>(`
    SELECT
      current_database() AS database_name,
      to_regnamespace('mesh') IS NOT NULL
        OR to_regnamespace('mesh_control') IS NOT NULL
        OR to_regnamespace('mesh_log') IS NOT NULL
        AS mesh_schema_present
  `)).rows[0];
  if (!identity) throw new Error("Could not identify database.");
  if (identity.mesh_schema_present) {
    throw new Error("Replay manager is sealed to a Neon/Admin database.");
  }
  if (
    options.expectedDatabase
    && identity.database_name !== options.expectedDatabase
  ) {
    throw new Error(
      `Database mismatch: expected ${options.expectedDatabase}, `
      + `got ${identity.database_name}.`,
    );
  }

  if (options.action === "status") {
    const status = await client.query(`
      SELECT *
      FROM event.v_authorization_replay_health_v2
      WHERE migration_run_id = $1::uuid
    `, [options.migrationRunId]);
    await client.query("COMMIT");
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      mode: "status",
      database: identity.database_name,
      rows: status.rows,
    }, null, 2)}\n`);
  } else if (options.action === "bind") {
    await client.query(
      "SELECT set_config('app.authorization_migration_approval_ticket', $1, true)",
      [options.approvalTicket],
    );
    const binding = await client.query(`
      SELECT *
      FROM event.fn_authorization_bind_replay_v2(
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
      binding: binding.rows[0],
    }, null, 2)}\n`);
  } else {
    await client.query(
      "SELECT set_config('app.authorization_migration_approval_ticket', $1, true)",
      [options.approvalTicket],
    );
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
      FROM event.fn_authorization_stage_replay_v2($1::uuid, $2::integer)
    `, [options.migrationRunId, options.limit]);
    await client.query("COMMIT");
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      mode: "staged",
      database: identity.database_name,
      stagedTransactionCount: staged.rowCount,
      transactions: staged.rows,
    }, null, 2)}\n`);
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await client.end().catch(() => undefined);
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
        "Usage: manage-authorization-v2-replay.ts "
        + "[--status --migration-run-id=UUID] "
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

function value(argument: string, prefix: string): string {
  const parsed = argument.slice(prefix.length).trim();
  if (!parsed) throw new Error(`${prefix.slice(0, -1)} requires a value.`);
  return parsed;
}

function assertUuid(candidate: string, label: string): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(candidate)
  ) {
    throw new Error(`--${label} must be a UUID.`);
  }
}
