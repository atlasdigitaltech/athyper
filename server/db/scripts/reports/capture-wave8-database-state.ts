#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

type Plane = "neon" | "mesh";

const args = process.argv.slice(2);
const plane = option("--plane") as Plane | undefined;
const expectedSource = option("--expected-source-database");
const expectedTarget = option("--expected-target-database");
if (
  !plane
  || !["neon", "mesh"].includes(plane)
  || !expectedSource
  || !expectedTarget
  || expectedSource === expectedTarget
) {
  throw new Error(
    "--plane, distinct --expected-source-database and "
      + "--expected-target-database are required",
  );
}
const sourceVariable = plane === "mesh"
  ? "MESH_SOURCE_DATABASE_URL"
  : "NEON_SOURCE_DATABASE_URL";
const targetVariable = plane === "mesh"
  ? "MESH_TARGET_DATABASE_URL"
  : "NEON_TARGET_DATABASE_URL";
const sourceUrl = requiredEnv(sourceVariable);
const targetUrl = requiredEnv(targetVariable);
if (canonicalUrl(sourceUrl) === canonicalUrl(targetUrl)) {
  throw new Error("Wave 8 source and target URLs must differ");
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const contractsDirectory = resolve(scriptDirectory, "../contracts");
const identitySql = await readFile(
  resolve(contractsDirectory, `wave6-${plane}-identity-state.sql`),
  "utf8",
);
const seedSql = await readFile(
  resolve(contractsDirectory, `wave6-${plane}-seed-owned-state.sql`),
  "utf8",
);
const source = new pg.Client({
  connectionString: sourceUrl,
  application_name: `wave8-${plane}-source-inspection`,
});
const target = new pg.Client({
  connectionString: targetUrl,
  application_name: `wave8-${plane}-target-inspection`,
});
await Promise.all([source.connect(), target.connect()]);
try {
  await Promise.all([
    source.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"),
    target.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"),
  ]);
  const [sourceBoundary, targetBoundary] = await Promise.all([
    inspectBoundary(source, expectedSource, plane),
    inspectBoundary(target, expectedTarget, plane),
  ]);
  const [
    sourceIdentity,
    targetIdentity,
    sourceSeed,
    targetSeed,
    sourceSchema,
    targetSchema,
    constraints,
    wave7,
  ] = await Promise.all([
    source.query(identitySql),
    target.query(identitySql),
    source.query(seedSql),
    target.query(seedSql),
    schemaFingerprint(source),
    schemaFingerprint(target),
    target.query<{
      unexpected_unvalidated: string;
      names: string[];
    }>(`
      SELECT count(*)::text AS unexpected_unvalidated,
             COALESCE(array_agg(
               namespace.nspname || '.' || relation.relname || ':' || item.conname
               ORDER BY namespace.nspname, relation.relname, item.conname
             ) FILTER (WHERE NOT item.convalidated), '{}'::text[]) AS names
      FROM pg_constraint AS item
      JOIN pg_class AS relation ON relation.oid = item.conrelid
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = ANY($1::text[])
        AND item.contype IN ('c', 'f')
        AND NOT item.convalidated
    `, [plane === "mesh"
      ? ["mesh", "mesh_control", "mesh_log", "shared"]
      : ["master", "control", "document", "event", "log", "shared"]]),
    target.query(`
      SELECT resolver_state, writer_authority, writer_epoch,
             observation_completed_at
      FROM ${plane === "mesh" ? "mesh_control" : "control"}
        .authorization_cutover_plane_v2
      WHERE plane_code = $1
    `, [plane]),
  ]);
  const reportBody = {
    contractVersion: "wave8.database-state.v1",
    plane,
    source: {
      ...sourceBoundary,
      schemaFingerprintSha256: sourceSchema,
      identityCount: sourceIdentity.rows.length,
      identityCanonicalSha256: canonicalHash(sourceIdentity.rows),
      seedOwnedSha256: canonicalHash(sourceSeed.rows),
    },
    target: {
      ...targetBoundary,
      schemaFingerprintSha256: targetSchema,
      identityCount: targetIdentity.rows.length,
      identityCanonicalSha256: canonicalHash(targetIdentity.rows),
      seedOwnedSha256: canonicalHash(targetSeed.rows),
      unexpectedUnvalidatedConstraints:
        Number(constraints.rows[0]?.unexpected_unvalidated ?? "0"),
      unexpectedUnvalidatedConstraintNames: constraints.rows[0]?.names ?? [],
      wave7Cutover: wave7.rows,
    },
    identityMatched:
      sourceIdentity.rows.length === targetIdentity.rows.length
      && canonicalHash(sourceIdentity.rows) === canonicalHash(targetIdentity.rows),
    seedOwnedMatched:
      canonicalHash(sourceSeed.rows) === canonicalHash(targetSeed.rows),
    distinctDatabaseIdentity: expectedSource !== expectedTarget,
    transactionMode: "repeatable_read_read_only",
  };
  process.stdout.write(`${JSON.stringify({
    ...reportBody,
    canonicalSha256: canonicalHash(reportBody),
    capturedAt: new Date().toISOString(),
  }, null, 2)}\n`);
  await Promise.all([source.query("ROLLBACK"), target.query("ROLLBACK")]);
} catch (error) {
  await Promise.allSettled([source.query("ROLLBACK"), target.query("ROLLBACK")]);
  throw error;
} finally {
  await Promise.all([source.end(), target.end()]);
}

async function inspectBoundary(
  client: pg.Client,
  expectedDatabase: string,
  selectedPlane: Plane,
): Promise<{ databaseIdentity: string; oppositeSchemaCount: number }> {
  const result = await client.query<{
    database_name: string;
    opposite_schema_count: string;
  }>(`
    SELECT current_database() AS database_name,
      (SELECT count(*)::text FROM pg_namespace
       WHERE nspname = ANY($1::text[])) AS opposite_schema_count
  `, [selectedPlane === "mesh"
    ? ["master", "control", "document", "event", "log"]
    : ["mesh", "mesh_control", "mesh_log"]]);
  const row = result.rows[0];
  if (
    row?.database_name !== expectedDatabase
    || Number(row.opposite_schema_count) !== 0
  ) throw new Error("Wave 8 exact database/plane boundary mismatch");
  return {
    databaseIdentity: row.database_name,
    oppositeSchemaCount: Number(row.opposite_schema_count),
  };
}

async function schemaFingerprint(client: pg.Client): Promise<string> {
  const result = await client.query(`
    SELECT namespace.nspname AS schema_name, relation.relname AS object_name,
           relation.relkind AS object_kind
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname NOT LIKE 'pg_%'
      AND namespace.nspname <> 'information_schema'
    ORDER BY namespace.nspname, relation.relname, relation.relkind
  `);
  return canonicalHash(result.rows);
}

function canonicalHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).sort().join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${
    Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(record[key])}`
    ).join(",")
  }}`;
}

function option(name: string): string | undefined {
  return args.find((arg) => arg.startsWith(`${name}=`))
    ?.slice(name.length + 1).trim();
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function canonicalUrl(value: string): string {
  const parsed = new URL(value);
  parsed.password = "";
  return parsed.toString();
}
