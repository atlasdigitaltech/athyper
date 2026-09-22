// Runtime-role create/update/archive proof; every fixture change rolls back.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import { KyselyWorkforceRepository } from "../../../../packages/services/master-data/src/kysely-workforce-repository.js";

const host=process.env.PROBE_DB_HOST;
if(!host)throw Error("PROBE_DB_HOST is required");
const tenant="11111111-1111-4111-8111-111111111111";
const employee="1fc65c52-0aeb-558d-b8fe-21a8a652bdba";
const other="f02875e2-cab8-5f06-8815-113e7cf0627f";
const actor="d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c";
const db=new Kysely<any>({dialect:new PostgresDialect({pool:new pg.Pool({host,database:"athyper_neon",user:"postgres",password:readFileSync(`${homedir()}/.athyper/instances/dev/secrets/postgres-password`,"utf8").trim(),max:1})})});
const rollback=Symbol("rollback");
let passed=false;
try{
  await db.transaction().execute(async transaction=>{
    await sql`SELECT set_config('app.database_plane','neon',true),set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id',${actor},true)`.execute(transaction);
    await sql`SET LOCAL ROLE athyper_runtime`.execute(transaction);
    const repository=new KyselyWorkforceRepository(),base={tenantId:tenant,actorId:actor,employeeId:employee,kind:"education" as const};
    const created=await repository.mutateProfile({...base,data:{institutionName:"Probe University",qualificationName:"BSc",completionYear:2010}},transaction);
    assert(created);assert.equal(created.rowVersion,1);
    const stale=await repository.mutateProfile({...base,recordId:created.id,expectedVersion:2,data:{institutionName:"Probe University",qualificationName:"MSc"}},transaction);
    assert.equal(stale,null);
    const wrongOwner=await repository.mutateProfile({...base,employeeId:other,recordId:created.id,expectedVersion:1,archive:true},transaction);
    assert.equal(wrongOwner,null);
    const updated=await repository.mutateProfile({...base,recordId:created.id,expectedVersion:1,data:{institutionName:"Probe University",qualificationName:"MSc"}},transaction);
    assert.equal(updated?.rowVersion,2);
    const archived=await repository.mutateProfile({...base,recordId:created.id,expectedVersion:2,archive:true},transaction);
    assert.equal(archived?.archived,true);
    passed=true;
    throw rollback;
  });
}catch(error){if(error!==rollback)throw error;}finally{await db.destroy();}
assert(passed);
console.log(JSON.stringify({passed:true,operations:["create","stale-rejected","cross-person-rejected","update","archive"],fixtureChanges:"rolled back"}));
