#!/usr/bin/env tsx
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

function argument(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
}
const url=argument("--database-url"), expected=argument("--expected-database"), plane=argument("--plane");
if (!url || !expected || !["neon","mesh"].includes(plane ?? "")) throw new Error("Explicit URL, database guard and plane required");
const root=resolve(import.meta.dirname,"../..");
const client=new pg.Client({connectionString:url}); await client.connect();
try {
  const identity=await client.query<{database_name:string}>("SELECT current_database() database_name");
  if(identity.rows[0]?.database_name!==expected) throw new Error("P5-E5 database guard rejected target");
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.database_plane',$1,true)",[plane]);
  for(const file of ["ddl/_migration/p5_e5_cohort_qualification.sql","ddl/common/ops/09_authorization_shadow_comparison_views.sql","ddl/common/ops/07_authorization_operation_rollout_functions.sql"])
    await client.query(await readFile(resolve(root,file),"utf8"));
  await client.query("COMMIT");
  process.stdout.write(`P5_E5_COHORT_DDL_OK plane=${plane} database=${expected}\n`);
} catch(error) { await client.query("ROLLBACK").catch(()=>undefined); throw error; } finally { await client.end(); }
