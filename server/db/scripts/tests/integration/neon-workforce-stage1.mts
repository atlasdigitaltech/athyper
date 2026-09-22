// Read-only local DEV probe for the Employee 360 Stage 1 repository contract.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import { KyselyWorkforceRepository } from "../../../../packages/services/master-data/src/kysely-workforce-repository.js";

const host=process.env.PROBE_DB_HOST,tenantId=process.env.PROBE_TENANT_ID,employeeId=process.env.PROBE_EMPLOYEE_ID,companyCodeId=process.env.PROBE_COMPANY_CODE_ID;
if(!host||!tenantId||!employeeId||!companyCodeId)throw Error("PROBE_DB_HOST, PROBE_TENANT_ID, PROBE_EMPLOYEE_ID and PROBE_COMPANY_CODE_ID are required");
const db=new Kysely<any>({dialect:new PostgresDialect({pool:new pg.Pool({host,database:"athyper_neon",user:"athyper_runtime",password:readFileSync(`${homedir()}/.athyper/instances/dev/secrets/runtime-db-password`,"utf8").trim(),max:1})})});
try{await db.transaction().execute(async transaction=>{
  await sql`SET TRANSACTION READ ONLY`.execute(transaction);
  await sql`SELECT set_config('app.database_plane','neon',true),set_config('app.current_tenant_id',${tenantId},true),set_config('app.current_principal_id','00000000-0000-4000-8000-000000000001',true)`.execute(transaction);
  const repository=new KyselyWorkforceRepository(),directory=await repository.list({tenantId,companyCodeId,sort:"name",limit:21},transaction);
  assert(directory.some(value=>value.employeeId===employeeId),"fixture employee must be visible in the company directory");
  const detail=await repository.get(tenantId,employeeId,transaction);assert(detail,"fixture employee detail must load");
  const sections=await Promise.all((["team","requests","documents","comments","audit","education","priorEmployment"] as const).map(section=>repository.getSection({tenantId,employeeId,companyCodeId,section,limit:21},transaction)));
  assert(sections.every((page,index)=>page.section===( ["team","requests","documents","comments","audit","education","priorEmployment"] as const)[index]));
  console.log(JSON.stringify({passed:true,directory:directory.length,employee:detail.employeeNumber,sections:Object.fromEntries(sections.map(page=>[page.section,page.items.length]))}));
});}finally{await db.destroy();}
