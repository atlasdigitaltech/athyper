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
if ((plane !== "neon" && plane !== "mesh") || !expectedDatabase) {
  throw new Error("--plane=neon|mesh and --expected-database are required");
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
const variable = plane === "mesh" ? "MESH_DATABASE_URL" : "DATABASE_URL";
const connectionString = process.env[variable]?.trim();
if (!connectionString) throw new Error(`${variable} is required`);
const client = new pg.Client({
  connectionString,
  application_name: `wave9-contraction-preflight-${plane}`,
});

await client.connect();
try {
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const boundary = await client.query<{
    database_name: string;
    opposite_schema_count: string;
  }>(`
    SELECT current_database() AS database_name,
      (
        SELECT count(*)::text FROM pg_namespace
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
  ) throw new Error("Wave 9 preflight database identity or plane mismatch");

  const oidRows: Array<{ oid: number; name: string }> = [];
  for (const item of objects) {
    const [schema, name] = splitQualified(item.name);
    if (item.kind === "table") {
      const row = await client.query<{ oid: number | null }>(
        "SELECT to_regclass($1)::oid AS oid",
        [item.name],
      );
      if (row.rows[0]?.oid) oidRows.push({ oid: row.rows[0].oid, name: item.name });
    } else {
      const rows = await client.query<{ oid: number }>(`
        SELECT p.oid
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = $1 AND p.proname = $2
      `, [schema, name]);
      oidRows.push(...rows.rows.map((row) => ({ oid: row.oid, name: item.name })));
    }
  }
  const oids = oidRows.map((item) => item.oid);
  const dependencies = oids.length === 0
    ? { rows: [] as Array<{
        referenced: string;
        dependent: string;
        dependency_type: string;
      }> }
    : await client.query<{
        referenced: string;
        dependent: string;
        dependency_type: string;
      }>(`
        SELECT DISTINCT
          pg_describe_object(d.refclassid, d.refobjid, d.refobjsubid)
            AS referenced,
          pg_describe_object(d.classid, d.objid, d.objsubid)
            AS dependent,
          d.deptype::text AS dependency_type
        FROM pg_depend d
        WHERE d.refobjid = ANY($1::oid[])
          AND d.deptype NOT IN ('a', 'i', 'e')
        ORDER BY referenced, dependent, dependency_type
      `, [oids]);
  const externalDependencies = dependencies.rows.filter((item) =>
    !ownedByRetiringObject(item.dependent, objects)
  );
  const controlSchema = plane === "mesh" ? "mesh_control" : "control";
  const planeCode = plane === "mesh" ? "mesh" : "neon";
  const [writers, cutover] = await Promise.all([
    client.query<{ count: string }>(`
      SELECT count(*)::text AS count
        FROM ${controlSchema}.authorization_writer_registry
       WHERE status = 'approved'
         AND effective_from <= now()
         AND (effective_until IS NULL OR effective_until > now())
    `),
    client.query<{
      resolver_state: string;
      writer_authority: string;
      legacy_write_frozen: boolean;
      freeze_source_watermark: string | null;
      freeze_applied_watermark: string | null;
      observation_completed_at: string | null;
      instant_rollback_promised: boolean;
      reverse_projector_status: string;
    }>(`
      SELECT resolver_state, writer_authority, legacy_write_frozen,
             freeze_source_watermark::text, freeze_applied_watermark::text,
             observation_completed_at::text, instant_rollback_promised,
             reverse_projector_status
        FROM ${controlSchema}.authorization_cutover_plane_v2
       WHERE plane_code = $1
    `, [planeCode]),
  ]);
  const state = cutover.rows[0];
  const report = {
    contractVersion: "wave9.contraction-preflight.v1",
    plane,
    databaseIdentity: expectedDatabase,
    legacyObjectsPresent: oidRows.length,
    externalDependencyFindings: externalDependencies.length,
    externalDependencies,
    activeApprovedLegacyWriters: Number(writers.rows[0]?.count),
    cutover: state ?? null,
    zeroLag: Boolean(
      state
      && state.freeze_source_watermark !== null
      && state.freeze_source_watermark === state.freeze_applied_watermark
    ),
    ready: Boolean(
      externalDependencies.length === 0
      && Number(writers.rows[0]?.count) === 0
      && state?.resolver_state === "observation_complete"
      && state.writer_authority === "target"
      && state.legacy_write_frozen
      && state.observation_completed_at
      && state.freeze_source_watermark === state.freeze_applied_watermark
      && !state.instant_rollback_promised
      && state.reverse_projector_status === "retired"
    ),
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

function ownedByRetiringObject(
  description: string,
  watched: RemovalObject[],
): boolean {
  return watched.some((item) =>
    description.includes(` on table ${item.name}`)
    || description.includes(` for table ${item.name}`)
    || description.includes(` on relation ${item.name}`)
    || description === `table ${item.name}`
    || description.startsWith(`function ${item.name}(`)
  );
}

function splitQualified(value: string): [string, string] {
  const parts = value.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`invalid qualified name ${value}`);
  }
  return [parts[0], parts[1]];
}

function option(name: string): string | undefined {
  return args.find((arg) => arg.startsWith(`${name}=`))
    ?.slice(name.length + 1).trim();
}
