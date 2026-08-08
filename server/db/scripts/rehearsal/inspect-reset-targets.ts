#!/usr/bin/env tsx

import pg from "pg";

for (const [plane, variable, expected, opposite] of [
  [
    "neon",
    "DATABASE_ADMIN_URL",
    "athyper_neon",
    ["mesh", "mesh_control", "mesh_log"],
  ],
  [
    "mesh",
    "MESH_DATABASE_ADMIN_URL",
    "athyper_mesh",
    ["master", "control", "document", "event", "log"],
  ],
] as const) {
  const connectionString = process.env[variable]?.trim();
  if (!connectionString) throw new Error(`${variable} is required`);
  const client = new pg.Client({
    connectionString,
    application_name: `phase7-reset-inspection-${plane}`,
  });
  await client.connect();
  try {
    const identity = (await client.query<{
      database_name: string;
      database_size: string;
      opposite_schemas: string[];
      sentinel_installed: boolean;
    }>(`
      SELECT
        current_database() AS database_name,
        pg_database_size(current_database())::text AS database_size,
        ARRAY(
          SELECT nspname
            FROM pg_namespace
           WHERE nspname = ANY($1::text[])
           ORDER BY nspname
        ) AS opposite_schemas,
        to_regclass('wave9_guard.installation') IS NOT NULL
          AS sentinel_installed
    `, [opposite])).rows[0];
    if (!identity || identity.database_name !== expected) {
      throw new Error(`${plane} expected ${expected}, got ${identity?.database_name}`);
    }
    const guardExists = (await client.query<{ present: boolean }>(
      "SELECT to_regclass('public.database_reset_guard_v2') IS NOT NULL AS present",
    )).rows[0]?.present ?? false;
    const disposableMarked = guardExists
      ? (await client.query<{ marked: boolean }>(`
          SELECT EXISTS (
            SELECT 1 FROM public.database_reset_guard_v2
             WHERE plane = $1 AND database_name = current_database()
               AND destructive_reset_allowed
          ) AS marked
        `, [plane])).rows[0]?.marked ?? false
      : false;
    process.stdout.write(`${JSON.stringify({
      plane,
      ...identity,
      disposable_marked: disposableMarked,
    })}\n`);
  } finally {
    await client.end();
  }
}
