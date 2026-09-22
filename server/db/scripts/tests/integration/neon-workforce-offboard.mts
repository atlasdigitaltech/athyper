// Runtime-role lifecycle exercise; the transaction is always rolled back.
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
const actor="d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c";
const db=new Kysely<any>({dialect:new PostgresDialect({pool:new pg.Pool({host,database:"athyper_neon",user:"athyper_runtime",password:readFileSync(`${homedir()}/.athyper/instances/dev/secrets/runtime-db-password`,"utf8").trim(),max:1})})});
const rollback=Symbol("rollback");
let passed=false;
try{
  await db.transaction().execute(async transaction=>{
    await sql`SELECT set_config('app.database_plane','neon',true),set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id',${actor},true)`.execute(transaction);
    const result=await new KyselyWorkforceRepository().offboard({tenantId:tenant,employeeId:employee,exitDate:"2026-12-31",reasonCode:"synthetic_test",resourceChecklist:[{code:"return_assets",label:"Return assets",status:"pending",required:true}],idempotencyKey:"stage1-offboard-runtime-probe",actorId:actor},transaction);
    assert(result&&!result.replayed);
    const caseRow=(await sql<{row_version:number;employment_id:string;access_deprovision_status:string}>`SELECT row_version,employment_id,access_deprovision_status FROM document.offboarding_case WHERE tenant_id=${tenant}::uuid AND id=${result.caseId}::uuid`.execute(transaction)).rows[0];
    assert.equal(Number(caseRow?.row_version),1);
    assert(caseRow?.employment_id);
    assert.equal(caseRow?.access_deprovision_status,"requested");
    passed=true;
    throw rollback;
  });
}catch(error){if(error!==rollback)throw error;}finally{await db.destroy();}
assert(passed);
console.log(JSON.stringify({passed:true,offboarding:"created and read back",fixtureChanges:"rolled back"}));
