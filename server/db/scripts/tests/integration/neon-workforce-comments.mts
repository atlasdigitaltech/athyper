// Private employee comments are visible only to their author; fixture rows roll back.
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
const author="d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c";
const other="00000000-0000-4000-8000-000000000001";
const db=new Kysely<any>({dialect:new PostgresDialect({pool:new pg.Pool({host,database:"athyper_neon",user:"postgres",password:readFileSync(`${homedir()}/.athyper/instances/dev/secrets/postgres-password`,"utf8").trim(),max:1})})});
const rollback=Symbol("rollback");
let passed=false;
try{
  await db.transaction().execute(async transaction=>{
    await sql`SELECT set_config('app.database_plane','neon',true),set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id',${author},true)`.execute(transaction);
    await sql`INSERT INTO document.comment(tenant_id,entity_type,entity_id,commenter_id,comment_text,visibility,created_by) VALUES
      (${tenant}::uuid,'employee',${employee},${author}::uuid,'Private workforce probe','private',${author}::uuid),
      (${tenant}::uuid,'employee',${employee},${author}::uuid,'Public workforce probe','public',${author}::uuid)`.execute(transaction);
    await sql`SET LOCAL ROLE athyper_runtime`.execute(transaction);
    const repository=new KyselyWorkforceRepository();
    const read=(principalId:string)=>repository.getSection({tenantId:tenant,employeeId:employee,section:"comments",principalId,limit:20},transaction);
    const owner=await read(author),visitor=await read(other);
    assert(owner.items.some(item=>item.title==="Private workforce probe"));
    assert(visitor.items.some(item=>item.title==="Public workforce probe"));
    assert(!visitor.items.some(item=>item.title==="Private workforce probe"));
    passed=true;
    throw rollback;
  });
}catch(error){if(error!==rollback)throw error;}finally{await db.destroy();}
assert(passed);
console.log(JSON.stringify({passed:true,privateComment:"author only",fixtureChanges:"rolled back"}));
