#!/usr/bin/env tsx

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

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
const acknowledgement = option("--acknowledge");
if (
  (plane !== "neon" && plane !== "mesh")
  || !expectedDatabase
  || !buildId
  || acknowledgement !== `INSTALL_WAVE9_SENTINEL_${plane.toUpperCase()}`
) {
  throw new Error(
    "--plane, --expected-database, --build-id and the exact "
      + "--acknowledge=INSTALL_WAVE9_SENTINEL_<PLANE> are required",
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
const variable = plane === "mesh"
  ? "MESH_DATABASE_ADMIN_URL"
  : "DATABASE_ADMIN_URL";
const connectionString = process.env[variable]?.trim();
if (!connectionString) throw new Error(`${variable} is required`);

const client = new pg.Client({
  connectionString,
  application_name: `wave9-clean-build-sentinel-${plane}`,
});
await client.connect();
try {
  await client.query("BEGIN");
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`athyper:wave9:clean-build-sentinel:${plane}`],
  );
  const guard = await client.query<{
    database_name: string;
    opposite_schema_count: string;
    environment_class: string | null;
    destructive_reset_allowed: boolean | null;
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
      reset.destructive_reset_allowed
    FROM (SELECT 1) singleton
    LEFT JOIN public.database_reset_guard_v2 reset
      ON reset.plane = $1 AND reset.database_name = current_database()
  `, [plane]);
  const row = guard.rows[0];
  if (
    row?.database_name !== expectedDatabase
    || Number(row.opposite_schema_count) !== 0
    || !row.environment_class?.startsWith("disposable_")
    || !row.destructive_reset_allowed
  ) throw new Error("clean-build sentinel requires an exact disposable plane database");

  await client.query("CREATE SCHEMA IF NOT EXISTS wave9_guard");
  await client.query(`
    CREATE TABLE IF NOT EXISTS wave9_guard.legacy_object (
      plane text NOT NULL,
      object_kind text NOT NULL,
      qualified_name text NOT NULL,
      PRIMARY KEY (plane, object_kind, qualified_name)
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS wave9_guard.create_observation (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      build_id text NOT NULL,
      plane text NOT NULL,
      command_tag text NOT NULL,
      object_type text NOT NULL,
      object_identity text NOT NULL,
      observed_at timestamptz NOT NULL DEFAULT clock_timestamp()
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS wave9_guard.installation (
      plane text PRIMARY KEY,
      build_id text NOT NULL UNIQUE,
      database_name text NOT NULL,
      installed_at timestamptz NOT NULL DEFAULT clock_timestamp()
    )
  `);
  await client.query(
    "DELETE FROM wave9_guard.legacy_object WHERE plane = $1",
    [plane],
  );
  for (const item of objects) {
    await client.query(`
      INSERT INTO wave9_guard.legacy_object (plane, object_kind, qualified_name)
      VALUES ($1, $2, $3)
      ON CONFLICT DO NOTHING
    `, [plane, item.kind, item.name]);
  }
  await client.query(`
    INSERT INTO wave9_guard.installation (plane, build_id, database_name)
    VALUES ($1, $2, current_database())
    ON CONFLICT (plane) DO UPDATE SET
      build_id = EXCLUDED.build_id,
      database_name = EXCLUDED.database_name,
      installed_at = clock_timestamp()
  `, [plane, buildId]);
  await client.query(`
    CREATE OR REPLACE FUNCTION wave9_guard.capture_legacy_create()
    RETURNS event_trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, wave9_guard
    AS $function$
    DECLARE
      command record;
      install record;
    BEGIN
      SELECT plane, build_id INTO install
        FROM wave9_guard.installation
       WHERE database_name = current_database()
       LIMIT 1;
      IF install.plane IS NULL THEN
        RAISE EXCEPTION 'Wave 9 clean-build sentinel installation is missing';
      END IF;
      FOR command IN SELECT * FROM pg_event_trigger_ddl_commands()
      LOOP
        IF EXISTS (
          SELECT 1
            FROM wave9_guard.legacy_object legacy
           WHERE legacy.plane = install.plane
             AND (
               command.object_identity = legacy.qualified_name
               OR command.object_identity LIKE legacy.qualified_name || '(%'
             )
        ) THEN
          INSERT INTO wave9_guard.create_observation (
            build_id, plane, command_tag, object_type, object_identity
          ) VALUES (
            install.build_id, install.plane, command.command_tag,
            command.object_type, command.object_identity
          );
        END IF;
      END LOOP;
    END
    $function$
  `);
  await client.query(
    "DROP EVENT TRIGGER IF EXISTS wave9_capture_legacy_create",
  );
  await client.query(`
    CREATE EVENT TRIGGER wave9_capture_legacy_create
      ON ddl_command_end
      WHEN TAG IN (
        'CREATE TABLE', 'CREATE TABLE AS', 'CREATE VIEW',
        'CREATE MATERIALIZED VIEW', 'CREATE FUNCTION',
        'CREATE PROCEDURE'
      )
      EXECUTE FUNCTION wave9_guard.capture_legacy_create()
  `);
  await client.query("REVOKE ALL ON SCHEMA wave9_guard FROM PUBLIC");
  await client.query(
    "REVOKE ALL ON ALL TABLES IN SCHEMA wave9_guard FROM PUBLIC",
  );
  await client.query("COMMIT");
  process.stdout.write(`${JSON.stringify({
    contractVersion: "wave9.clean-build-sentinel.v1",
    plane,
    buildId,
    databaseIdentity: expectedDatabase,
    watchedLegacyObjects: objects.length,
    installed: true,
  }, null, 2)}\n`);
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
