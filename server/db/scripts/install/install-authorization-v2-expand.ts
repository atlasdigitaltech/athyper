#!/usr/bin/env tsx
/**
 * Explicit Neon/Admin Wave 1 additive-expand installer.
 *
 * Dry-run is the default and never opens a database connection. Live apply
 * requires an exact database name and approval ticket, rejects Mesh schemas,
 * applies one immutable ordered DDL set transactionally, fingerprints the
 * frozen Wave 0 source relations, registers exact NOT VALID definitions, and
 * writes a durable receipt. It does not install capture, record a snapshot,
 * seed a transformer, backfill data, bind replay, or cut over readers.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

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
  required_schemas_present: boolean;
  mesh_schema_present: boolean;
  admin_role_present: boolean;
  app_role_present: boolean;
}

interface CaptureClock {
  source_database_id: string;
  capture_contract_version: string;
  current_watermark: string;
}

interface FreezeHealth {
  source_count: string;
  missing_relation_count: string;
  hash_mismatch_count: string;
}

interface DeferredHealth {
  expected_count: string;
  registered_count: string;
  missing_count: string;
  unexpected_count: string;
  definition_mismatch_count: string;
}

const expandContractVersion = "wave1.authz-v2-expand.v1";
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const databaseRoot = resolve(scriptDirectory, "../..");
const repositoryRoot = resolve(databaseRoot, "../..");

export const authorizationV2OrderedDdl = [
  "ddl/planes/neon/authz/03_tables.sql",
  "ddl/planes/neon/authz/03_tables.sql",
  "ddl/planes/neon/authz/03_tables.sql",
  "ddl/planes/neon/authz/03_tables.sql",
  "ddl/common/event/03_tables.sql",
  "ddl/common/event/03_tables.sql",

  "ddl/planes/neon/authz/05_constraints.sql",
  "ddl/planes/neon/authz/05_constraints.sql",
  "ddl/common/event/05_constraints.sql",

  "ddl/planes/neon/authz/06_indexes.sql",
  "ddl/planes/neon/authz/06_indexes.sql",
  "ddl/planes/neon/authz/06_indexes.sql",
  "ddl/common/event/06_indexes.sql",
  "ddl/common/event/06_indexes.sql",

  "ddl/planes/neon/authz/07_functions.sql",
  "ddl/common/event/07_functions.sql",

  "ddl/planes/neon/authz/08_triggers.sql",
  "ddl/planes/neon/authz/08_triggers.sql",
  "ddl/common/event/08_triggers.sql",
  "ddl/common/event/08_triggers.sql",

  "ddl/planes/neon/authz/09_views.sql",
  "ddl/planes/neon/authz/09_views.sql",
  "ddl/common/event/09_views.sql",

  "ddl/planes/neon/authz/10_rls.sql",
  "ddl/planes/neon/authz/10_rls.sql",
  "ddl/planes/neon/authz/10_rls.sql",
  "ddl/common/event/10_rls.sql",
  "ddl/common/event/10_rls.sql",

  "ddl/common/shared/09_function_search_path_hardening.sql",
] as const;

const options = parseOptions(process.argv.slice(2));
const ddl = await Promise.all(authorizationV2OrderedDdl.map(async (path) => {
  if (path.includes("/mesh") || path.includes("\\mesh")) {
    throw new Error(`Mesh DDL is forbidden in the Neon expand set: ${path}`);
  }
  const sql = await readFile(resolve(databaseRoot, path), "utf8");
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
    planeBoundary: "neon_admin_only",
    expandContractVersion,
    connectionEnvironment:
      "AUTHORIZATION_V2_DATABASE_URL or DATABASE_ADMIN_URL",
    requiredApplyArguments: [
      "--apply",
      "--expected-database=<exact name>",
      "--approval-ticket=<ticket>",
    ],
    explicitlyExcluded: [
      "capture installation",
      "snapshot marker",
      "transformer registration",
      "backfill",
      "replay binding",
      "reader cutover",
      "legacy contraction",
      "Mesh DDL",
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

const connectionString =
  process.env.AUTHORIZATION_V2_DATABASE_URL?.trim()
  ?? process.env.DATABASE_ADMIN_URL?.trim();
if (!connectionString) {
  throw new Error(
    "AUTHORIZATION_V2_DATABASE_URL or DATABASE_ADMIN_URL is required "
    + "for --apply.",
  );
}

const client = new pg.Client({
  connectionString,
  application_name: "wave1-authorization-v2-expand-installer",
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

  const identity = (await client.query<DatabaseIdentity>(`
    SELECT
      current_database() AS database_name,
      (SELECT oid::text FROM pg_database WHERE datname = current_database())
        AS database_oid,
      to_regnamespace('shared') IS NOT NULL
        AND to_regnamespace('master') IS NOT NULL
        AND to_regnamespace('control') IS NOT NULL
        AND to_regnamespace('event') IS NOT NULL
        AND to_regnamespace('log') IS NOT NULL
        AS required_schemas_present,
      to_regnamespace('mesh') IS NOT NULL
        OR to_regnamespace('mesh_control') IS NOT NULL
        OR to_regnamespace('mesh_log') IS NOT NULL
        AS mesh_schema_present,
      EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin')
        AS admin_role_present,
      EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp')
        AS app_role_present
  `)).rows[0];
  if (!identity) throw new Error("Could not identify the target database.");
  if (identity.database_name !== options.expectedDatabase) {
    throw new Error(
      `Database identity mismatch: expected ${options.expectedDatabase}, `
      + `got ${identity.database_name}.`,
    );
  }
  if (!identity.required_schemas_present) {
    throw new Error("Target is not a provisioned Neon/Admin database.");
  }
  if (identity.mesh_schema_present) {
    throw new Error(
      "Target contains Mesh schemas; Wave 1 Neon expansion is boundary-sealed.",
    );
  }
  if (!identity.admin_role_present || !identity.app_role_present) {
    throw new Error(
      "Target is missing the provisioned athyperadmin/athyperapp roles.",
    );
  }

  const preexistingBadMarkers = await client.query<{ count: string }>(`
    SELECT count(*)::text AS count
    FROM event.authorization_snapshot_marker AS marker
    JOIN control.authorization_migration_run AS migration_run
      ON migration_run.id = marker.migration_run_id
    WHERE migration_run.transformation_version LIKE 'wave1.authz-transform.%'
      AND (
          migration_run.capture_installed_at IS NULL
          OR migration_run.capture_installed_at > marker.recorded_at
      )
  `);
  if (preexistingBadMarkers.rows[0]?.count !== "0") {
    throw new Error(
      "A Wave 1 marker violates capture-before-snapshot; expansion refused.",
    );
  }

  for (const file of ddl) {
    await client.query(file.sql);
  }

  const captureClock = (await client.query<CaptureClock>(`
    SELECT
      source_database_id::text,
      capture_contract_version,
      current_watermark::text
    FROM event.authorization_capture_clock
    WHERE singleton_id = 1
  `)).rows[0];
  if (!captureClock) {
    throw new Error(
      "Wave 0 capture clock DDL is required before Wave 1 expansion.",
    );
  }

  const freezeBefore = (await client.query<FreezeHealth>(`
    WITH fingerprint AS (
      SELECT
        frozen.source_schema,
        frozen.source_table,
        to_regclass(format(
          '%I.%I',
          frozen.source_schema,
          frozen.source_table
        )) AS relation_id,
        frozen.object_contract_sha256,
        CASE
          WHEN to_regclass(format(
            '%I.%I',
            frozen.source_schema,
            frozen.source_table
          )) IS NULL THEN NULL
          ELSE encode(public.digest(
            concat_ws(
              '|',
              (
                SELECT relation.relkind::text
                FROM pg_class AS relation
                WHERE relation.oid = to_regclass(format(
                  '%I.%I',
                  frozen.source_schema,
                  frozen.source_table
                ))
              ),
              (
                SELECT string_agg(
                  format(
                    '%s:%s:%s:%s:%s',
                    attribute.attnum,
                    attribute.attname,
                    pg_catalog.format_type(
                      attribute.atttypid,
                      attribute.atttypmod
                    ),
                    attribute.attnotnull,
                    COALESCE(
                      pg_get_expr(default_record.adbin, default_record.adrelid),
                      '-'
                    )
                  ),
                  ';'
                  ORDER BY attribute.attnum
                )
                FROM pg_attribute AS attribute
                LEFT JOIN pg_attrdef AS default_record
                  ON default_record.adrelid = attribute.attrelid
                 AND default_record.adnum = attribute.attnum
                WHERE attribute.attrelid = to_regclass(format(
                  '%I.%I',
                  frozen.source_schema,
                  frozen.source_table
                ))
                  AND attribute.attnum > 0
                  AND NOT attribute.attisdropped
              ),
              (
                SELECT string_agg(
                  format(
                    '%s:%s',
                    constraint_record.conname,
                    pg_get_constraintdef(constraint_record.oid, true)
                  ),
                  ';'
                  ORDER BY constraint_record.conname
                )
                FROM pg_constraint AS constraint_record
                WHERE constraint_record.conrelid = to_regclass(format(
                  '%I.%I',
                  frozen.source_schema,
                  frozen.source_table
                ))
              ),
              (
                SELECT string_agg(
                  pg_get_indexdef(index_record.indexrelid),
                  ';'
                  ORDER BY index_record.indexrelid
                )
                FROM pg_index AS index_record
                WHERE index_record.indrelid = to_regclass(format(
                  '%I.%I',
                  frozen.source_schema,
                  frozen.source_table
                ))
              )
            ),
            'sha256'
          ), 'hex')
        END AS live_sha256
      FROM control.authorization_v2_frozen_legacy_object AS frozen
      WHERE frozen.capture_required
    )
    SELECT
      count(*)::text AS source_count,
      count(*) FILTER (WHERE relation_id IS NULL)::text
        AS missing_relation_count,
      count(*) FILTER (
        WHERE object_contract_sha256 IS NOT NULL
          AND object_contract_sha256 IS DISTINCT FROM live_sha256
      )::text AS hash_mismatch_count
    FROM fingerprint
  `)).rows[0];
  if (
    !freezeBefore
    || freezeBefore.missing_relation_count !== "0"
    || freezeBefore.hash_mismatch_count !== "0"
    || Number(freezeBefore.source_count) < 60
  ) {
    throw new Error(
      "Frozen legacy fingerprint precondition failed: "
      + JSON.stringify(freezeBefore),
    );
  }

  await client.query(`
    WITH fingerprint AS (
      SELECT
        frozen.source_schema,
        frozen.source_table,
        encode(public.digest(
          concat_ws(
            '|',
            relation.relkind::text,
            (
              SELECT string_agg(
                format(
                  '%s:%s:%s:%s:%s',
                  attribute.attnum,
                  attribute.attname,
                  pg_catalog.format_type(
                    attribute.atttypid,
                    attribute.atttypmod
                  ),
                  attribute.attnotnull,
                  COALESCE(
                    pg_get_expr(default_record.adbin, default_record.adrelid),
                    '-'
                  )
                ),
                ';'
                ORDER BY attribute.attnum
              )
              FROM pg_attribute AS attribute
              LEFT JOIN pg_attrdef AS default_record
                ON default_record.adrelid = attribute.attrelid
               AND default_record.adnum = attribute.attnum
              WHERE attribute.attrelid = relation.oid
                AND attribute.attnum > 0
                AND NOT attribute.attisdropped
            ),
            (
              SELECT string_agg(
                format(
                  '%s:%s',
                  constraint_record.conname,
                  pg_get_constraintdef(constraint_record.oid, true)
                ),
                ';'
                ORDER BY constraint_record.conname
              )
              FROM pg_constraint AS constraint_record
              WHERE constraint_record.conrelid = relation.oid
            ),
            (
              SELECT string_agg(
                pg_get_indexdef(index_record.indexrelid),
                ';'
                ORDER BY index_record.indexrelid
              )
              FROM pg_index AS index_record
              WHERE index_record.indrelid = relation.oid
            )
          ),
          'sha256'
        ), 'hex') AS live_sha256
      FROM control.authorization_v2_frozen_legacy_object AS frozen
      JOIN pg_class AS relation
        ON relation.oid = to_regclass(format(
          '%I.%I',
          frozen.source_schema,
          frozen.source_table
        ))
      WHERE frozen.capture_required
    )
    UPDATE control.authorization_v2_frozen_legacy_object AS frozen
    SET
      object_contract_sha256 = fingerprint.live_sha256,
      status = 'frozen',
      frozen_at = clock_timestamp(),
      frozen_by = session_user,
      approval_ticket = $1
    FROM fingerprint
    WHERE frozen.source_schema = fingerprint.source_schema
      AND frozen.source_table = fingerprint.source_table
      AND (
        frozen.object_contract_sha256 IS NULL
        OR frozen.object_contract_sha256 = fingerprint.live_sha256
      )
  `, [options.approvalTicket]);

  await client.query(`
    INSERT INTO control.authorization_v2_deferred_constraint_registry (
      target_schema,
      target_table,
      constraint_name,
      constraint_type,
      expected_definition,
      expected_definition_sha256,
      initially_validated,
      validation_status,
      defer_reason,
      owner_team,
      validation_deadline,
      approval_ticket,
      validated_at,
      validated_by
    )
    SELECT
      split_part(expected.relation_name, '.', 1),
      split_part(expected.relation_name, '.', 2),
      expected.constraint_name,
      constraint_record.contype,
      pg_get_constraintdef(constraint_record.oid, true),
      encode(public.digest(
        pg_get_constraintdef(constraint_record.oid, true),
        'sha256'
      ), 'hex'),
      constraint_record.convalidated,
      CASE
        WHEN constraint_record.convalidated THEN 'validated'
        ELSE 'pending'
      END,
      expected.reason,
      'identity-access',
      clock_timestamp() + interval '90 days',
      $1,
      CASE
        WHEN constraint_record.convalidated THEN clock_timestamp()
      END,
      CASE
        WHEN constraint_record.convalidated THEN session_user
      END
    FROM control.v_authorization_v2_deferred_constraints AS expected
    JOIN pg_constraint AS constraint_record
      ON constraint_record.conrelid = to_regclass(expected.relation_name)
     AND constraint_record.conname = expected.constraint_name
    ON CONFLICT (target_schema, target_table, constraint_name) DO NOTHING
  `, [options.approvalTicket]);

  const deferredHealth = (await client.query<DeferredHealth>(`
    WITH expected AS (
      SELECT
        split_part(expected.relation_name, '.', 1) AS target_schema,
        split_part(expected.relation_name, '.', 2) AS target_table,
        expected.constraint_name,
        pg_get_constraintdef(constraint_record.oid, true) AS definition,
        encode(public.digest(
          pg_get_constraintdef(constraint_record.oid, true),
          'sha256'
        ), 'hex') AS definition_sha256
      FROM control.v_authorization_v2_deferred_constraints AS expected
      JOIN pg_constraint AS constraint_record
        ON constraint_record.conrelid = to_regclass(expected.relation_name)
       AND constraint_record.conname = expected.constraint_name
    ),
    missing AS (
      SELECT target_schema, target_table, constraint_name
      FROM expected
      EXCEPT
      SELECT target_schema, target_table, constraint_name
      FROM control.authorization_v2_deferred_constraint_registry
    ),
    unexpected AS (
      SELECT target_schema, target_table, constraint_name
      FROM control.authorization_v2_deferred_constraint_registry
      EXCEPT
      SELECT target_schema, target_table, constraint_name
      FROM expected
    )
    SELECT
      (SELECT count(*)::text FROM expected) AS expected_count,
      (
        SELECT count(*)::text
        FROM control.authorization_v2_deferred_constraint_registry
      ) AS registered_count,
      (SELECT count(*)::text FROM missing) AS missing_count,
      (SELECT count(*)::text FROM unexpected) AS unexpected_count,
      (
        SELECT count(*)::text
        FROM expected
        JOIN control.authorization_v2_deferred_constraint_registry AS registry
          USING (target_schema, target_table, constraint_name)
        WHERE registry.expected_definition IS DISTINCT FROM expected.definition
           OR registry.expected_definition_sha256
                IS DISTINCT FROM expected.definition_sha256
      ) AS definition_mismatch_count
  `)).rows[0];
  if (
    !deferredHealth
    || deferredHealth.missing_count !== "0"
    || deferredHealth.unexpected_count !== "0"
    || deferredHealth.definition_mismatch_count !== "0"
    || deferredHealth.expected_count !== deferredHealth.registered_count
  ) {
    throw new Error(
      "Deferred-constraint registry does not exactly match the catalog view: "
      + JSON.stringify(deferredHealth),
    );
  }

  const markerHealth = await client.query<{ invalid_count: string }>(`
    SELECT count(*)::text AS invalid_count
    FROM event.authorization_snapshot_marker AS marker
    JOIN control.authorization_migration_run AS migration_run
      ON migration_run.id = marker.migration_run_id
    WHERE migration_run.capture_installed_at IS NULL
       OR migration_run.capture_installed_at > marker.recorded_at
       OR migration_run.source_database_id <> marker.source_database_id
       OR migration_run.snapshot_watermark <> marker.source_watermark
  `);
  if (markerHealth.rows[0]?.invalid_count !== "0") {
    throw new Error("Capture-before-snapshot marker invariant failed.");
  }

  const installationInsert = await client.query<{ id: string }>(`
    INSERT INTO control.authorization_v2_expand_installation (
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
      $2,
      $3,
      $4,
      $5::jsonb,
      $6
    )
    ON CONFLICT (
      target_database_oid,
      expand_contract_version,
      ordered_ddl_sha256
    ) DO NOTHING
    RETURNING id::text
  `, [
    captureClock.source_database_id,
    captureClock.capture_contract_version,
    expandContractVersion,
    orderedDdlSha256,
    JSON.stringify(orderedDdlReceipt),
    options.approvalTicket,
  ]);
  const installation = installationInsert.rows[0]
    ?? (await client.query<{ id: string }>(`
      SELECT id::text
      FROM control.authorization_v2_expand_installation
      WHERE target_database_oid =
            (SELECT oid FROM pg_database WHERE datname = current_database())
        AND expand_contract_version = $1
        AND ordered_ddl_sha256 = $2
    `, [expandContractVersion, orderedDdlSha256])).rows[0];
  if (!installation) throw new Error("Expand receipt was not recorded.");

  await client.query("COMMIT");
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    mode: "applied",
    expandContractVersion,
    installedAt: new Date().toISOString(),
    installationId: installation.id,
    approvalTicket: options.approvalTicket,
    repositoryRoot: relative(process.cwd(), repositoryRoot) || ".",
    database: {
      name: identity.database_name,
      oid: identity.database_oid,
      sourceDatabaseId: captureClock.source_database_id,
    },
    captureContractVersion: captureClock.capture_contract_version,
    captureWatermarkObservedNotSnapshotted: captureClock.current_watermark,
    frozenLegacySourceCount: Number(freezeBefore.source_count),
    deferredConstraintCount: Number(deferredHealth.expected_count),
    orderedDdlSha256,
    orderedDdl: orderedDdlReceipt,
  }, null, 2)}\n`);
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await client.end().catch(() => undefined);
}

function assertAdditiveSql(path: string, sql: string): void {
  const executable = sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ");
  const banned = [
    /\bDROP\s+(?:TABLE|SCHEMA|TYPE)\b/i,
    /\bALTER\s+TABLE\b[\s\S]{0,300}\bDROP\s+COLUMN\b/i,
    /\bTRUNCATE\s+TABLE\b/i,
    /\bDELETE\s+FROM\b/i,
    /\bRENAME\s+(?:TO|COLUMN)\b/i,
    /\bALTER\s+COLUMN\b[\s\S]{0,160}\bSET\s+NOT\s+NULL\b/i,
  ];
  for (const pattern of banned) {
    if (pattern.test(executable)) {
      throw new Error(`Non-additive SQL in ${path}: ${pattern.source}`);
    }
  }
}

function parseOptions(args: string[]): Options {
  const result: Options = {
    apply: false,
    lockTimeoutMs: 30_000,
    statementTimeoutMs: 600_000,
  };
  for (const argument of args) {
    if (argument === "--apply") result.apply = true;
    else if (argument === "--help") {
      process.stdout.write(
        "Usage: install-authorization-v2-expand.ts "
        + "[--apply --expected-database=NAME --approval-ticket=TICKET] "
        + "[--lock-timeout-ms=N] [--statement-timeout-ms=N]\n"
        + "Dry-run is the default and does not connect to a database.\n",
      );
      process.exit(0);
    } else if (argument.startsWith("--expected-database=")) {
      result.expectedDatabase = requiredValue(
        argument,
        "--expected-database=",
      );
    } else if (argument.startsWith("--approval-ticket=")) {
      result.approvalTicket = requiredValue(
        argument,
        "--approval-ticket=",
      );
    } else if (argument.startsWith("--lock-timeout-ms=")) {
      result.lockTimeoutMs = positiveInteger(
        argument,
        "--lock-timeout-ms=",
      );
    } else if (argument.startsWith("--statement-timeout-ms=")) {
      result.statementTimeoutMs = positiveInteger(
        argument,
        "--statement-timeout-ms=",
      );
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return result;
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
