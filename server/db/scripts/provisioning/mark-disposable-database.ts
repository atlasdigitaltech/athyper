#!/usr/bin/env tsx

import pg from "pg";
import {
  ensureResetGuardTable,
  readSchemaFingerprintSha256,
} from "./safe-provision.js";

const args = process.argv.slice(2);
const plane = option(args, "--plane");
const expectedDatabase = option(args, "--expected-database");
const environmentClass = option(args, "--environment");
const executionProfile = option(args, "--execution-profile");
const approvalLabel = option(args, "--approval-label");
const acknowledgement = option(args, "--acknowledge");

if (plane !== "studio" && plane !== "neon" && plane !== "mesh") {
  throw new Error("--plane=studio|neon|mesh is required");
}
if (!expectedDatabase) {
  throw new Error("--expected-database is required");
}
if (executionProfile !== "development_clean_reset") {
  throw new Error("--execution-profile=development_clean_reset is required");
}
if (approvalLabel !== "LOCAL-AUTH-V2-RESET") {
  throw new Error("--approval-label=LOCAL-AUTH-V2-RESET is required");
}
if (environmentClass !== "disposable_local") {
  throw new Error(
    "--environment=disposable_local is required",
  );
}
if (acknowledgement !== `MARK_DISPOSABLE_${plane.toUpperCase()}`) {
  throw new Error(`--acknowledge=MARK_DISPOSABLE_${plane.toUpperCase()} is required`);
}

const variables = plane === "studio"
  ? ["ATHYPER_PLATFORM_DATABASE_ADMIN_URL"]
  : plane === "mesh"
    ? ["ATHYPER_MESH_DATABASE_ADMIN_URL", "MESH_DATABASE_ADMIN_URL"]
    : ["ATHYPER_NEON_DATABASE_ADMIN_URL", "DATABASE_ADMIN_URL"];
const connectionString = variables
  .map((variable) => process.env[variable]?.trim())
  .find((value): value is string => Boolean(value));
if (!connectionString) throw new Error(`${variables.join(" or ")} is required`);

const client = new pg.Client({
  connectionString,
  application_name: `wave6-mark-disposable-${plane}`,
});
await client.connect();
try {
  await client.query("BEGIN");
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`athyper:wave6:reset-guard:${plane}`],
  );
  const identity = await client.query<{
    database_name: string;
    opposite_schema_count: string | number;
  }>(`
    SELECT
      current_database() AS database_name,
      (
        SELECT count(*)
        FROM pg_namespace
        WHERE nspname = ANY(
          CASE $1
            WHEN 'neon' THEN ARRAY['mesh', 'metadata']
            WHEN 'mesh' THEN ARRAY['ledger', 'metadata', 'aggregate']
            ELSE ARRAY['ledger', 'mesh', 'aggregate']
          END
        )
      ) AS opposite_schema_count
  `, [plane]);
  const current = identity.rows[0];
  if (
    !current
    || current.database_name !== expectedDatabase
    || Number(current.opposite_schema_count) !== 0
  ) {
    throw new Error(
      `${plane} database identity mismatch or opposite-plane schema detected`,
    );
  }

  await ensureResetGuardTable(client);
  const schemaFingerprintSha256 = await readSchemaFingerprintSha256(
    client,
    plane,
  );
  await client.query(`
    INSERT INTO public.database_reset_guard_v2 (
      plane, database_name, environment_class,
      destructive_reset_allowed, schema_fingerprint_sha256,
      approval_ticket, marked_at, marked_by
    ) VALUES ($1, $2, $3, true, $4, $5, now(), session_user)
    ON CONFLICT (plane) DO UPDATE SET
      database_name = EXCLUDED.database_name,
      environment_class = EXCLUDED.environment_class,
      destructive_reset_allowed = true,
      schema_fingerprint_sha256 = EXCLUDED.schema_fingerprint_sha256,
      approval_ticket = EXCLUDED.approval_ticket,
      marked_at = now(),
      marked_by = session_user
  `, [
    plane,
    expectedDatabase,
    environmentClass,
    schemaFingerprintSha256,
    approvalLabel,
  ]);
  await client.query("COMMIT");
  process.stdout.write(`${JSON.stringify({
    contractVersion: "wave9.development-clean-reset-guard.v1",
    executionProfile,
    approvalLabel,
    plane,
    database: expectedDatabase,
    environmentClass,
    schemaFingerprintSha256,
    marked: true,
  }, null, 2)}\n`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}

function option(argsToRead: string[], name: string): string | undefined {
  return argsToRead.find((arg) => arg.startsWith(`${name}=`))
    ?.slice(name.length + 1)
    .trim();
}
