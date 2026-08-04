#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import pg from "pg";

const args = process.argv.slice(2);
const plane = option("--plane");
const expectedDatabase = option("--expected-database");
if (!["neon", "admin", "mesh"].includes(plane ?? "") || !expectedDatabase) {
  throw new Error("--plane=neon|admin|mesh and --expected-database are required");
}
const isMesh = plane === "mesh";
const connectionVariable = isMesh ? "MESH_DATABASE_URL" : "DATABASE_URL";
const connectionString = process.env[connectionVariable]?.trim();
if (!connectionString) throw new Error(`${connectionVariable} is required`);

const controlSchema = isMesh ? "mesh_control" : "control";
const evidenceSchema = isMesh ? "mesh_log" : "event";
const client = new pg.Client({
  connectionString,
  application_name: `wave7-readiness-${plane}`,
});
await client.connect();
try {
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const boundary = await client.query<{
    database_name: string;
    opposite_schema_count: string;
  }>(`
    SELECT current_database() AS database_name,
      (SELECT count(*)::text FROM pg_namespace
       WHERE nspname = ANY($1::text[])) AS opposite_schema_count
  `, [isMesh
    ? ["master", "control", "event", "document"]
    : ["mesh", "mesh_control", "mesh_log"]]);
  if (
    boundary.rows[0]?.database_name !== expectedDatabase
    || Number(boundary.rows[0]?.opposite_schema_count) !== 0
  ) {
    throw new Error("Wave 7 report database identity/plane mismatch");
  }
  const [readiness, cohorts, dispositions, guards, comparisons] =
    await Promise.all([
      client.query(
        `SELECT * FROM ${evidenceSchema}.v_authorization_wave7_readiness_v2
         WHERE plane_code = $1`,
        [plane],
      ),
      client.query(
        `SELECT cohort_code, state, permission_codes, consumer_paths,
                minimum_applied_watermark, effective_from,
                observation_window_ends_at, owner_team, rollback_owner
         FROM ${controlSchema}.authorization_cutover_cohort_v2
         WHERE plane_code = $1 ORDER BY cohort_code`,
        [plane],
      ),
      client.query(
        `SELECT risk_class, disposition, count(*)::bigint AS count
         FROM ${controlSchema}.authorization_shadow_mismatch_disposition_v2
         WHERE plane_code = $1 GROUP BY risk_class, disposition
         ORDER BY risk_class, disposition`,
        [plane],
      ),
      client.query(
        `SELECT status, count(*)::bigint AS count
         FROM ${controlSchema}.authorization_target_guard_installation_v2
         GROUP BY status ORDER BY status`,
      ),
      client.query(
        `SELECT consumer_path, action_class, risk_class, comparison_status,
                count(*)::bigint AS count
         FROM ${evidenceSchema}.authorization_shadow_comparison_v2
         WHERE plane_code = $1
         GROUP BY consumer_path, action_class, risk_class, comparison_status
         ORDER BY consumer_path, action_class, risk_class, comparison_status`,
        [plane],
      ),
    ]);
  if (readiness.rows.length !== 1) {
    throw new Error("Wave 7 readiness row is unavailable or ambiguous");
  }
  const reportBody = {
    contractVersion: "wave7.readiness-report.v1",
    plane,
    databaseIdentity: expectedDatabase,
    readiness: readiness.rows[0],
    cohorts: cohorts.rows,
    mismatchDispositions: dispositions.rows,
    targetGuards: guards.rows,
    comparisonCoverage: comparisons.rows,
  };
  const report = {
    ...reportBody,
    canonicalSha256: canonicalHash(reportBody),
    capturedAt: new Date().toISOString(),
    transactionMode: "repeatable_read_read_only",
  };
  await client.query("ROLLBACK");
  process.stdout.write(`${JSON.stringify(report, bigintReplacer, 2)}\n`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}

function option(name: string): string | undefined {
  return args.find((arg) => arg.startsWith(`${name}=`))
    ?.slice(name.length + 1).trim();
}

function canonicalHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value, bigintReplacer))
    .digest("hex");
}

function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}
