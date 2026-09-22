// Runtime-role recursive team proof; fixture updates are always rolled back.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import { KyselyWorkforceRepository } from "../../../../packages/services/master-data/src/kysely-workforce-repository.js";

const host=process.env.PROBE_DB_HOST;
if(!host)throw Error("PROBE_DB_HOST is required");
const tenant="11111111-1111-4111-8111-111111111111";
const company="7e0e3d2c-c5fc-5960-b4c3-80153c1e95a7";
const manager="1fc65c52-0aeb-558d-b8fe-21a8a652bdba";
const direct="f02875e2-cab8-5f06-8815-113e7cf0627f";
const indirect="aff223cb-7477-5967-806a-121d2248d71b";
const db=new Kysely<any>({dialect:new PostgresDialect({pool:new pg.Pool({host,database:"athyper_neon",user:"athyper_runtime",password:readFileSync(`${homedir()}/.athyper/instances/dev/secrets/runtime-db-password`,"utf8").trim(),max:1})})});
const rollback=Symbol("rollback");
let passed=false;
try{
  await db.transaction().execute(async transaction=>{
    await sql`SELECT set_config('app.database_plane','neon',true),set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id','d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c',true)`.execute(transaction);
    await sql`UPDATE master.work_assignment SET manager_employee_id=${manager}::uuid,updated_by='d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c'::uuid WHERE tenant_id=${tenant}::uuid AND employee_id=${direct}::uuid`.execute(transaction);
    await sql`UPDATE master.employment SET hire_date=current_date-1,updated_by='d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c'::uuid WHERE tenant_id=${tenant}::uuid AND employee_id=${indirect}::uuid`.execute(transaction);
    await sql`UPDATE master.work_assignment SET manager_employee_id=${direct}::uuid,effective_from=current_date-1,updated_by='d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c'::uuid WHERE tenant_id=${tenant}::uuid AND employee_id=${indirect}::uuid`.execute(transaction);
    const page=await new KyselyWorkforceRepository().getSection({tenantId:tenant,employeeId:manager,companyCodeId:company,section:"team",limit:10},transaction);
    assert.deepEqual(page.items.map(item=>item.id),[direct,indirect]);
    assert.match(page.items[0]!.subtitle??"",/Direct report/);
    assert.match(page.items[1]!.subtitle??"",/Level 2/);
    passed=true;
    throw rollback;
  });
}catch(error){if(error!==rollback)throw error;}finally{await db.destroy();}
assert(passed);
console.log(JSON.stringify({passed:true,directReports:1,indirectReports:1,fixtureChanges:"rolled back"}));
