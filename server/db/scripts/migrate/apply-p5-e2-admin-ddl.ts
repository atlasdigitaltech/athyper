#!/usr/bin/env tsx
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const databaseRoot = resolve(import.meta.dirname, "../..");
const files = [
  "ddl/planes/athyper/metadata/03_phase5_operation_scope_tables.sql",
  "ddl/planes/athyper/snapshot/03_entity_release_artifact_tables.sql",
  "ddl/planes/athyper/metadata/05_phase5_operation_scope_constraints.sql",
  "ddl/planes/athyper/snapshot/05_entity_release_artifact_constraints.sql",
  "ddl/planes/athyper/metadata/06_phase5_operation_scope_indexes.sql",
  "ddl/planes/athyper/snapshot/06_entity_release_artifact_indexes.sql",
  "ddl/planes/athyper/metadata/07_phase5_operation_scope_functions.sql",
  "ddl/planes/athyper/snapshot/07_entity_release_artifact_functions.sql",
  "ddl/planes/athyper/metadata/08_phase5_operation_scope_triggers.sql",
  "ddl/planes/athyper/snapshot/08_entity_release_artifact_triggers.sql",
  "ddl/planes/athyper/metadata/10_phase5_operation_scope_rls.sql",
  "ddl/planes/athyper/snapshot/10_entity_release_artifact_rls.sql",
  "ddl/planes/athyper/metadata/11_phase5_operation_scope_grants.sql",
  "ddl/planes/athyper/snapshot/11_entity_release_artifact_grants.sql",
] as const;

function argument(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
}

const connectionString = argument("--database-url") ?? process.env["META_ENTITY_DATABASE_URL"];
const expectedDatabase = argument("--expected-database");
if (!connectionString || !expectedDatabase) {
  throw new Error("Use --database-url (or META_ENTITY_DATABASE_URL) and --expected-database.");
}

const client = new pg.Client({ connectionString });
await client.connect();
try {
  const identity = await client.query<{ database_name: string }>("SELECT current_database() AS database_name");
  if (identity.rows[0]?.database_name !== expectedDatabase) throw new Error("P5-E2 Admin database guard rejected the target.");
  const existing = await client.query<{ installed: boolean }>(
    "SELECT to_regclass('metadata.entity_operation_scope_binding') IS NOT NULL AND to_regclass('snapshot.entity_release_artifact') IS NOT NULL AS installed",
  );
  if (existing.rows[0]?.installed) {
    process.stdout.write("P5_E2_ADMIN_DDL_NOOP already-installed\n");
  } else {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.database_plane','athyper',true)");
    for (const file of files) await client.query(await readFile(resolve(databaseRoot, file), "utf8"));
    await client.query("COMMIT");
    process.stdout.write(`P5_E2_ADMIN_DDL_OK files=${files.length}\n`);
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
