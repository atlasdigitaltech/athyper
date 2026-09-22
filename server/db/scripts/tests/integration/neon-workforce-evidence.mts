// Runtime-role protected-profile query and audit proof; synthetic rows roll back.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import { KyselyWorkforceRepository } from "../../../../packages/services/master-data/src/kysely-workforce-repository.js";

const host=process.env.PROBE_DB_HOST;
if(!host)throw Error("PROBE_DB_HOST is required");
const tenant="11111111-1111-4111-8111-111111111111";
const person="ff8950db-49b1-5574-bca7-8896b172855c";
const actor="d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c";
const requestId="9624e1e0-c27f-410e-928d-adfa03924693";
const db=new Kysely<any>({dialect:new PostgresDialect({pool:new pg.Pool({host,database:"athyper_neon",user:"postgres",password:readFileSync(`${homedir()}/.athyper/instances/dev/secrets/postgres-password`,"utf8").trim(),max:1})})});
const rollback=Symbol("rollback");
let passed=false;
try{
  await db.transaction().execute(async transaction=>{
    await sql`SELECT set_config('app.database_plane','neon',true),set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id',${actor},true)`.execute(transaction);
    await sql`INSERT INTO master.person_emergency_contact(tenant_id,person_id,name_token,phone_token,priority,effective_from,created_by) VALUES(${tenant}::uuid,${person}::uuid,'token:test-name','token:test-phone',1,current_date-1,${actor}::uuid)`.execute(transaction);
    await sql`INSERT INTO master.person_identity_document(tenant_id,person_id,document_type,value_token,issuing_country_code,verification_status,created_by) VALUES(${tenant}::uuid,${person}::uuid,'passport','token:test-passport','MY','verified',${actor}::uuid)`.execute(transaction);
    await sql`INSERT INTO master.person_health_profile(tenant_id,person_id,blood_group_code,created_by) VALUES(${tenant}::uuid,${person}::uuid,'O+',${actor}::uuid)`.execute(transaction);
    const address=(await sql<{id:string}>`INSERT INTO master.address(tenant_id,line1,city,postal_code,country_code,normalized_hash,formatted_address,status,created_by) VALUES(${tenant}::uuid,'21 Demo Road','Kuala Lumpur','50000','MY',${"a".repeat(64)},'21 Demo Road, Kuala Lumpur 50000','active',${actor}::uuid) RETURNING id`.execute(transaction)).rows[0];
    assert(address);
    await sql`INSERT INTO master.person_address_use(tenant_id,person_id,address_id,purpose,is_primary,effective_from,created_by) VALUES(${tenant}::uuid,${person}::uuid,${address.id}::uuid,'home',true,current_date-1,${actor}::uuid)`.execute(transaction);
    await sql`SET LOCAL ROLE athyper_runtime`.execute(transaction);
    const repository=new KyselyWorkforceRepository();
    const input={tenantId:tenant,personId:person,principalId:actor,requestId,expiresAt:new Date(Date.now()+900000).toISOString()};
    const employment=await repository.readPersonEvidence({...input,purpose:"employment",fields:["emergencyContacts","addresses"]},transaction);
    const compliance=await repository.readPersonEvidence({...input,purpose:"compliance",fields:["identityDocuments","healthProfile"]},transaction);
    const health=await repository.readPersonEvidence({...input,purpose:"health",fields:["healthProfile","identityDocuments"]},transaction);
    assert.equal((employment?.fields["emergencyContacts"] as any[])[0]?.nameToken,"token:test-name");
    assert.match((employment?.fields["addresses"] as any[])[0]?.formattedAddress??"",/Demo Road/);
    assert.equal((compliance?.fields["identityDocuments"] as any[])[0]?.valueToken,"token:test-passport");
    assert.deepEqual(compliance?.redactedFields,["healthProfile"]);
    assert.equal((health?.fields["healthProfile"] as any)?.bloodGroupCode,"O+");
    assert.deepEqual(health?.redactedFields,["identityDocuments"]);
    const audits=(await sql<{count:string}>`SELECT count(*)::text count FROM document.person_sensitive_access_audit WHERE tenant_id=${tenant}::uuid AND person_id=${person}::uuid AND request_id=${requestId}::uuid`.execute(transaction)).rows[0];
    assert.equal(Number(audits?.count),3);
    passed=true;
    throw rollback;
  });
}catch(error){if(error!==rollback)throw error;}finally{await db.destroy();}
assert(passed);
console.log(JSON.stringify({passed:true,purposes:["employment","compliance","health"],auditRows:3,fixtureChanges:"rolled back"}));
