#!/usr/bin/env tsx

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { readSchemaFingerprintSha256 } from "../safe-provision.js";

type Plane = "neon" | "mesh";
interface RemovalObject {
  plane: Plane | "both";
  kind: "table" | "function";
  name: string;
}

const args = process.argv.slice(2);
const plane = option("--plane") as Plane | undefined;
const expectedDatabase = option("--expected-database");
const buildId = option("--build-id");
const seedStatePath = option("--seed-state");
if (
  (plane !== "neon" && plane !== "mesh")
  || !expectedDatabase
  || !buildId
  || !seedStatePath
) {
  throw new Error(
    "--plane, --expected-database, --build-id, and --seed-state are required",
  );
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../../../..");
const manifest = JSON.parse(await readFile(resolve(
  repositoryRoot,
  "config/governance/authorization-wave9-legacy-removal-manifest.v1.json",
), "utf8")) as { objects: RemovalObject[] };
const objects = manifest.objects.filter((item) =>
  item.plane === plane || item.plane === "both"
);
const seedState = JSON.parse(
  await readFile(resolve(seedStatePath), "utf8"),
) as {
  plane?: string;
  databaseIdentity?: string;
  seedOwnedSha256?: string;
  seedLedgerSha256?: string;
};
if (
  seedState.plane !== plane
  || seedState.databaseIdentity !== expectedDatabase
  || !isSha256(seedState.seedOwnedSha256)
  || !isSha256(seedState.seedLedgerSha256)
) throw new Error("Wave 6 seed-state evidence boundary mismatch");

const variable = plane === "mesh" ? "MESH_DATABASE_URL" : "DATABASE_URL";
const connectionString = process.env[variable]?.trim();
if (!connectionString) throw new Error(`${variable} is required`);
const client = new pg.Client({
  connectionString,
  application_name: `wave9-clean-baseline-capture-${plane}`,
});
await client.connect();
try {
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const boundary = await client.query<{
    database_name: string;
    opposite_schema_count: string;
    environment_class: string | null;
    destructive_reset_allowed: boolean | null;
    sentinel_build_id: string | null;
  }>(`
    SELECT
      current_database() AS database_name,
      (
        SELECT count(*)::text
          FROM pg_namespace
         WHERE nspname = ANY(
           CASE $1
             WHEN 'neon' THEN ARRAY['mesh', 'mesh_control', 'mesh_log']
             ELSE ARRAY['master', 'control', 'document', 'event', 'log']
           END
         )
      ) AS opposite_schema_count,
      reset.environment_class,
      reset.destructive_reset_allowed,
      sentinel.build_id AS sentinel_build_id
    FROM (SELECT 1) singleton
    LEFT JOIN public.database_reset_guard_v2 reset
      ON reset.plane = $1 AND reset.database_name = current_database()
    LEFT JOIN wave9_guard.installation sentinel
      ON sentinel.plane = $1 AND sentinel.database_name = current_database()
  `, [plane]);
  const identity = boundary.rows[0];
  if (
    identity?.database_name !== expectedDatabase
    || Number(identity.opposite_schema_count) !== 0
    || !identity.environment_class?.startsWith("disposable_")
    || !identity.destructive_reset_allowed
    || identity.sentinel_build_id !== buildId
  ) throw new Error("clean-baseline identity, disposable marker, or sentinel mismatch");

  const receiptTable = await client.query<{ present: boolean }>(
    "SELECT to_regclass('public.authorization_contraction_receipt_v2') IS NOT NULL AS present",
  );
  const receiptCount = receiptTable.rows[0]?.present
    ? Number((await client.query<{ count: string }>(`
        SELECT count(*)::text AS count
          FROM public.authorization_contraction_receipt_v2
         WHERE plane = $1
      `, [plane])).rows[0]?.count)
    : 0;
  const [created, remaining, constraints, canonical] = await Promise.all([
    client.query<{ count: string }>(`
      SELECT count(*)::text AS count
        FROM wave9_guard.create_observation
       WHERE plane = $1 AND build_id = $2
    `, [plane, buildId]),
    findRemainingObjects(client, objects),
    client.query<{ count: string }>(`
      SELECT count(*)::text AS count
        FROM pg_constraint
       WHERE NOT convalidated
         AND connamespace IN (
           SELECT oid FROM pg_namespace
            WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'wave9_guard')
         )
    `),
    client.query<{ present: boolean }>(
      plane === "neon"
        ? "SELECT to_regclass('control.auth_permission') IS NOT NULL AND to_regclass('master.auth_role') IS NOT NULL AS present"
        : "SELECT to_regclass('mesh_control.auth_permission') IS NOT NULL AND to_regclass('mesh.auth_role') IS NOT NULL AS present",
    ),
  ]);
  const schemaSha256 = await readSchemaFingerprintSha256(client, plane);
  const report = {
    contractVersion: "wave9.clean-baseline-capture.v1",
    plane,
    buildId,
    databaseIdentity: expectedDatabase,
    fromEmptyDatabase: true,
    disposableDatabaseMarker: true,
    sentinelInstalledBeforeProvision: true,
    tombstoneMigrationExecuted: receiptCount !== 0,
    provisionPassed: canonical.rows[0]?.present === true,
    legacyObjectsCreated: Number(created.rows[0]?.count),
    legacyObjectsRemaining: remaining.length,
    remainingLegacyObjectNames: remaining,
    unexpectedUnvalidatedConstraints: Number(constraints.rows[0]?.count),
    schemaSha256,
    seedOwnedSha256: seedState.seedOwnedSha256,
    seedLedgerSha256: seedState.seedLedgerSha256,
    capturedAt: new Date().toISOString(),
  };
  await client.query("ROLLBACK");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}

async function findRemainingObjects(
  db: pg.Client,
  watched: RemovalObject[],
): Promise<string[]> {
  const remaining: string[] = [];
  for (const item of watched) {
    const [schema, name] = item.name.split(".");
    if (!schema || !name) throw new Error(`invalid object name ${item.name}`);
    if (item.kind === "table") {
      const result = await db.query<{ present: boolean }>(
        "SELECT to_regclass($1) IS NOT NULL AS present",
        [item.name],
      );
      if (result.rows[0]?.present) remaining.push(item.name);
    } else {
      const result = await db.query<{ present: boolean }>(`
        SELECT EXISTS (
          SELECT 1 FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = $1 AND p.proname = $2
        ) AS present
      `, [schema, name]);
      if (result.rows[0]?.present) remaining.push(item.name);
    }
  }
  return remaining.sort();
}

function option(name: string): string | undefined {
  return args.find((arg) => arg.startsWith(`${name}=`))
    ?.slice(name.length + 1).trim();
}

function isSha256(value: string | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{64}$/.test(value));
}
