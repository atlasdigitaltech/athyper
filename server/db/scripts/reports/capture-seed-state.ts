#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import pg from "pg";

type CaptureKind =
  | "clean_build_a"
  | "clean_build_b"
  | "forced_reseed_a"
  | "forced_reseed_b"
  | "in_place_upgrade";

const args = process.argv.slice(2);
const plane = option(args, "--plane");
const expectedDatabase = option(args, "--expected-database");
const captureKind = option(args, "--capture-kind") as CaptureKind | undefined;
const seedOwnedQueryPath = option(args, "--seed-owned-query");
const identityQueryPath = option(args, "--identity-query");
const outputPath = option(args, "--output");
const validKinds = new Set<CaptureKind>([
  "clean_build_a",
  "clean_build_b",
  "forced_reseed_a",
  "forced_reseed_b",
  "in_place_upgrade",
]);
if (
  (plane !== "neon" && plane !== "mesh")
  || !expectedDatabase
  || !captureKind
  || !validKinds.has(captureKind)
  || !seedOwnedQueryPath
  || !identityQueryPath
  || !outputPath
) {
  throw new Error(
    "--plane, --expected-database, --capture-kind, --seed-owned-query, "
      + "--identity-query, and --output are required",
  );
}
const seedOwnedQuery = await loadReadOnlyQuery(seedOwnedQueryPath);
const identityQuery = await loadReadOnlyQuery(identityQueryPath);
const connectionVariable = plane === "mesh"
  ? "MESH_DATABASE_URL"
  : "DATABASE_URL";
const connectionString = process.env[connectionVariable]?.trim();
if (!connectionString) throw new Error(`${connectionVariable} is required`);

const client = new pg.Client({
  connectionString,
  application_name: `wave6-seed-state-${captureKind}`,
});
await client.connect();
try {
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const boundary = await client.query<{
    database_name: string;
    opposite_schema_count: string;
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
      ) AS opposite_schema_count
  `, [plane]);
  if (
    boundary.rows[0]?.database_name !== expectedDatabase
    || Number(boundary.rows[0]?.opposite_schema_count) !== 0
  ) {
    throw new Error("seed state capture database identity/plane mismatch");
  }
  const ledger = await client.query(`
    SELECT plane, pack_key, pack_version, source_path,
           content_sha256, manifest_sha256
    FROM public.seed_pack_ledger_v2
    WHERE plane = $1
    ORDER BY pack_key, pack_version
  `, [plane]);
  const [seedOwned, identities, schemaObjects, sentinel] = await Promise.all([
    client.query(seedOwnedQuery),
    client.query(identityQuery),
    client.query(`
      SELECT namespace.nspname AS schema_name,
             relation.relname AS object_name,
             relation.relkind AS object_kind
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname NOT IN (
        'pg_catalog', 'information_schema', 'wave9_guard'
      )
        AND namespace.nspname NOT LIKE 'pg_toast%'
      ORDER BY namespace.nspname, relation.relname, relation.relkind
    `),
    client.query<{
      installed: boolean;
      observation_count: string;
    }>(`
      SELECT
        to_regclass('wave9_guard.installation') IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM wave9_guard.installation
            WHERE plane = $1 AND database_name = current_database()
          ) AS installed,
        CASE WHEN to_regclass('wave9_guard.create_observation') IS NULL
          THEN '0'
          ELSE (SELECT count(*)::text FROM wave9_guard.create_observation
                WHERE plane = $1)
        END AS observation_count
    `, [plane]),
  ]);
  const report = {
    contractVersion: "wave6.seed-state-snapshot.v1",
    plane,
    databaseIdentity: expectedDatabase,
    captureKind,
    schemaSha256: canonicalHash(schemaObjects.rows),
    schemaObjectCount: schemaObjects.rows.length,
    seedLedgerSha256: canonicalHash(ledger.rows),
    seedLedgerCount: ledger.rows.length,
    seedOwnedSha256: canonicalHash(seedOwned.rows),
    seedOwnedCount: seedOwned.rows.length,
    identityCount: identities.rows.length,
    identityCanonicalSha256: canonicalHash(identities.rows),
    sentinelInstalled: sentinel.rows[0]?.installed === true,
    sentinelObservationCount:
      Number(sentinel.rows[0]?.observation_count ?? "0"),
    capturedAt: new Date().toISOString(),
    evidenceUri: outputPath.replace(/\\/g, "/"),
  };
  await client.query("ROLLBACK");
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}

async function loadReadOnlyQuery(path: string): Promise<string> {
  const query = (await readFile(path, "utf8")).trim().replace(/;+\s*$/, "");
  if (
    !/^(?:WITH\b[\s\S]+\bSELECT\b|SELECT\b)/i.test(query)
    || /;\s*\S/.test(query)
    || /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE|CALL|COPY)\b/i
      .test(query)
  ) {
    throw new Error(`${path} is not a single read-only SELECT query`);
  }
  return query;
}

function canonicalHash(rows: Record<string, unknown>[]): string {
  const canonical = rows.map(stableJson).sort().join("\n");
  return createHash("sha256").update(canonical).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${
    Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(record[key])}`
    ).join(",")
  }}`;
}

function option(argsToRead: string[], name: string): string | undefined {
  return argsToRead.find((arg) => arg.startsWith(`${name}=`))
    ?.slice(name.length + 1)
    .trim();
}
