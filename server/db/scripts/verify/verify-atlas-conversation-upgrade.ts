#!/usr/bin/env tsx
/**
 * Read-only verification for databases upgraded from an earlier Atlas draft.
 * It never applies or repairs schema. A failure blocks activation until a
 * reviewed additive migration has supplied the missing object.
 */

import pg from "pg";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Atlas upgrade verification.");
}

const client = new pg.Client({ connectionString });

interface Check {
  name: string;
  sql: string;
}

const checks: Check[] = [
  table("ai", "atlas_thread"),
  table("ai", "atlas_message"),
  table("ai", "atlas_run"),
  table("ai", "atlas_conversation_retention_policy"),
  column("ai", "atlas_thread", "retention_policy_id"),
  column("ai", "atlas_thread", "expires_at"),
  column("ai", "atlas_thread", "purge_after"),
  column("ai", "atlas_thread", "legal_hold"),
  column("ai", "atlas_thread", "legal_hold_reference"),
  column("ai", "atlas_message", "protected_content_ref"),
  column("ai", "atlas_run", "client_request_id"),
  constraint("ai", "atlas_run", "atlas_run_client_request_uq"),
  index("ai", "atlas_run_one_started_per_thread_uq"),
  role("athyperadmin_atlas_maintenance"),
  policy(
    "document",
    "conversation",
    "atlas_maintenance_write",
    "athyperadmin_atlas_maintenance",
  ),
  policy(
    "ai",
    "atlas_thread",
    "atlas_maintenance_write",
    "athyperadmin_atlas_maintenance",
  ),
  tablePrivilege(
    "athyperadmin_atlas_maintenance",
    "document",
    "conversation",
    "DELETE",
    true,
  ),
  tablePrivilege(
    "athyperadmin_atlas_maintenance",
    "ai",
    "atlas_message",
    "SELECT",
    false,
  ),
  tablePrivilege(
    "athyperadmin_atlas_maintenance",
    "ai",
    "atlas_run",
    "SELECT",
    false,
  ),
  forcedRls("ai", "atlas_thread"),
  forcedRls("ai", "atlas_message"),
  forcedRls("ai", "atlas_run"),
];

try {
  await client.connect();
  await client.query("BEGIN READ ONLY");
  const failures: string[] = [];
  for (const check of checks) {
    const result = await client.query<{ present: boolean }>(check.sql);
    const passed = result.rows[0]?.present === true;
    process.stdout.write(`${passed ? "PASS" : "FAIL"} ${check.name}\n`);
    if (!passed) failures.push(check.name);
  }
  await client.query("ROLLBACK");
  if (failures.length > 0) {
    throw new Error(
      `Atlas upgraded-environment verification failed: ${failures.join(", ")}`,
    );
  }
  process.stdout.write(
    `Atlas upgraded-environment verification passed: ${checks.length} checks.\n`,
  );
} finally {
  await client.end().catch(() => undefined);
}

function table(schema: string, name: string): Check {
  return {
    name: `${schema}.${name} exists`,
    sql: `SELECT to_regclass('${schema}.${name}') IS NOT NULL AS present`,
  };
}

function column(schema: string, tableName: string, name: string): Check {
  return {
    name: `${schema}.${tableName}.${name} exists`,
    sql: `SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = '${schema}'
        AND table_name = '${tableName}'
        AND column_name = '${name}'
    ) AS present`,
  };
}

function constraint(schema: string, tableName: string, name: string): Check {
  return {
    name: `${schema}.${tableName} constraint ${name} exists`,
    sql: `SELECT EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = '${schema}'
        AND t.relname = '${tableName}'
        AND c.conname = '${name}'
    ) AS present`,
  };
}

function index(schema: string, name: string): Check {
  return {
    name: `${schema}.${name} exists`,
    sql: `SELECT to_regclass('${schema}.${name}') IS NOT NULL AS present`,
  };
}

function role(name: string): Check {
  return {
    name: `role ${name} exists`,
    sql: `SELECT EXISTS (
      SELECT 1 FROM pg_roles WHERE rolname = '${name}'
    ) AS present`,
  };
}

function policy(
  schema: string,
  tableName: string,
  name: string,
  targetRole: string,
): Check {
  return {
    name: `${schema}.${tableName} policy ${name} targets ${targetRole}`,
    sql: `SELECT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = '${schema}'
        AND tablename = '${tableName}'
        AND policyname = '${name}'
        AND '${targetRole}' = ANY(roles)
    ) AS present`,
  };
}

function tablePrivilege(
  roleName: string,
  schema: string,
  tableName: string,
  privilege: string,
  expected: boolean,
): Check {
  return {
    name:
      `${roleName} ${expected ? "has" : "lacks"} ${privilege} `
      + `on ${schema}.${tableName}`,
    sql: `SELECT (
      has_table_privilege(
        '${roleName}',
        '${schema}.${tableName}',
        '${privilege}'
      ) = ${expected ? "true" : "false"}
    ) AS present`,
  };
}

function forcedRls(schema: string, name: string): Check {
  return {
    name: `${schema}.${name} forces RLS`,
    sql: `SELECT COALESCE((
      SELECT c.relrowsecurity AND c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = '${schema}' AND c.relname = '${name}'
    ), false) AS present`,
  };
}
