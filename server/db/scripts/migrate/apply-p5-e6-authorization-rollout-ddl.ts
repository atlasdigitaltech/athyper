#!/usr/bin/env tsx
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const databaseRoot = resolve(import.meta.dirname, "../..");
const files = [
  "ddl/common/ops/03_tables.sql",
  "ddl/common/ops/06_indexes.sql",
  "ddl/common/ops/07_functions.sql",
  "ddl/common/ops/08_triggers.sql",
  "ddl/common/ops/10_rls.sql",
  "ddl/common/ops/11_grants.sql",
] as const;

function argument(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
}

const connectionString = argument("--database-url");
const expectedDatabase = argument("--expected-database");
const plane = argument("--plane");
if (!connectionString || !expectedDatabase || !["neon", "mesh"].includes(plane ?? "")) {
  throw new Error("Explicit --database-url, --expected-database and --plane=neon|mesh are required.");
}

const client = new pg.Client({ connectionString });
await client.connect();
try {
  const identity = await client.query<{ database_name: string }>("SELECT current_database() AS database_name");
  if (identity.rows[0]?.database_name !== expectedDatabase) throw new Error("P5-E6 database guard rejected the target.");
  const existing = await client.query<{ installed: boolean }>(
    "SELECT to_regclass('ops.authorization_operation_rollout') IS NOT NULL AS installed",
  );
  if (existing.rows[0]?.installed) {
    process.stdout.write(`P5_E6_DDL_NOOP plane=${plane} database=${expectedDatabase}\n`);
  } else {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.database_plane',$1,true)", [plane]);
    for (const file of files) await client.query(await readFile(resolve(databaseRoot, file), "utf8"));
    await client.query("COMMIT");
    process.stdout.write(`P5_E6_DDL_OK plane=${plane} database=${expectedDatabase} files=${files.length}\n`);
  }
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.database_plane',$1,true)", [plane]);
  await client.query(await readFile(resolve(databaseRoot, "scripts/verify/smoke-authorization-operation-rollout.sql"), "utf8"));
  await client.query("COMMIT");
  process.stdout.write(`P5_E6_SMOKE_OK plane=${plane} active=blocked shadow=persisted\n`);
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
