import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { createReferenceHistoryStore } from "../../../../packages/platform/preferences/src/reference-choice-routes";
const preferencesRequire=createRequire(new URL("../../../../packages/platform/preferences/package.json",import.meta.url));
const databaseRequire=createRequire(new URL("../../../../packages/adapters/database/core/package.json",import.meta.url));
const {Kysely,PostgresDialect,sql}=preferencesRequire("kysely"),{Pool}=databaseRequire("pg");

test("PostgreSQL reference history merges devices, isolates owners, trims, clears, and expires",{skip:!process.env.REFERENCE_HISTORY_TEST_URL},async()=>{
 const db=new Kysely({dialect:new PostgresDialect({pool:new Pool({connectionString:process.env.REFERENCE_HISTORY_TEST_URL})})});
 const tenantId="11111111-1111-4111-8111-111111111111", alice="22222222-2222-4222-8222-222222222222",bob="33333333-3333-4333-8333-333333333333";
 const scope={planeKey:"neon" as const,tenantId,principalId:alice,sourceKey:"iso.country",contextKey:""};
 const store=createReferenceHistoryStore({run:async(_plane,actor,work)=>db.transaction().execute(async(tx:any)=>{
   await sql`SET LOCAL ROLE athyperapp`.execute(tx);
   await sql`SELECT set_config('test.tenant',${actor.tenantId},true),set_config('test.principal',${actor.principalId},true)`.execute(tx);
   return work(tx);
 })} as never);
 const command=(action:"read"|"select"|"clear",key?:string)=>({action,key,limit:5,retentionDays:90});
 try{
  await Promise.all([store.execute(scope,command("select","MY")),store.execute(scope,command("select","SA"))]);
  assert.deepEqual((await store.execute(scope,command("read"))).map(item=>item.key).sort(),["MY","SA"]);
  assert.deepEqual(await store.execute({...scope,principalId:bob},command("read")),[]);
  await store.execute({...scope,principalId:bob},command("select","MY"));
  for(const key of ["SG","AU","DE","GB","US"])await store.execute(scope,command("select",key));
  assert.equal((await store.execute(scope,command("read"))).length,5);
  await store.execute(scope,command("clear"));
  assert.deepEqual(await store.execute(scope,command("read")),[]);
  assert.equal((await store.execute({...scope,principalId:bob},command("read"))).length,1);
  await sql`UPDATE master.reference_choice_recent SET last_selected_at=now()-interval '91 days',expires_at=now()-interval '1 day'`.execute(db);
  const result=await sql`SELECT master.purge_expired_reference_choices(100) AS removed`.execute(db);
  assert.equal(Number(result.rows[0].removed),1);
  assert.deepEqual(await store.execute({...scope,principalId:bob},command("read")),[]);
 }finally{await db.destroy()}
});
