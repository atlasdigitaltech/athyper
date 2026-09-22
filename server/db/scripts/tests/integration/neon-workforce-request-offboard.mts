// Approved-request offboarding materialization and replay; all changes roll back.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import { KyselyWorkforceRequestRepository } from "../../../../packages/services/master-data/src/kysely-workforce-request-repository.js";

const host=process.env.PROBE_DB_HOST;if(!host)throw Error("PROBE_DB_HOST is required");
const tenant="11111111-1111-4111-8111-111111111111",person="ff8950db-49b1-5574-bca7-8896b172855c",employee="1fc65c52-0aeb-558d-b8fe-21a8a652bdba",employment="38f8c1bf-9d66-5381-bad2-58fde32dbffc",legalEntity="a42d1e81-7e5d-5ecd-9294-d14b90a6b26f",actor="d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c",approver="34ce3386-ed20-5933-91d1-699d38b197fe";
const db=new Kysely<any>({dialect:new PostgresDialect({pool:new pg.Pool({host,database:"athyper_neon",user:"postgres",password:readFileSync(`${homedir()}/.athyper/instances/dev/secrets/postgres-password`,"utf8").trim(),max:1})})});
const rollback=Symbol("rollback");let passed=false;
try{await db.transaction().execute(async transaction=>{
  await sql`SELECT set_config('app.database_plane','neon',true),set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id',${actor},true)`.execute(transaction);
  const token=randomUUID().replaceAll("-",""),request=(await sql<{id:string;row_version:number}>`INSERT INTO document.workforce_request(tenant_id,request_no,request_kind,source_kind,target_person_id,target_employee_id,target_employment_id,legal_entity_id,payload_schema_code,payload_schema_version,payload_schema_hash,requested_changes,idempotency_key,created_by) VALUES(${tenant}::uuid,${`WFR.PROBE.${token.toUpperCase()}`},'offboard_employment','manual',${person}::uuid,${employee}::uuid,${employment}::uuid,${legalEntity}::uuid,'workforce.request.v1',1,${"a".repeat(64)},${JSON.stringify({terminationDate:"2026-12-31",terminationReason:"resignation",resourceChecklist:[{code:"equipment",label:"Return equipment",required:true,status:"pending"}]})}::jsonb,${`probe-${token}`},${actor}::uuid) RETURNING id,row_version`.execute(transaction)).rows[0];assert(request);
  const workflow=(await sql<{id:string}>`INSERT INTO document.workflow_request(tenant_id,entity_type,entity_id,requested_by,decision,decided_by,decided_at,status,created_by) VALUES(${tenant}::uuid,'workforce_request',${request.id},${actor}::uuid,'approved',${approver}::uuid,now(),'approved',${actor}::uuid) RETURNING id`.execute(transaction)).rows[0];assert(workflow);
  await sql`UPDATE document.workforce_request SET status='validating',updated_by=${actor}::uuid WHERE tenant_id=${tenant}::uuid AND id=${request.id}::uuid`.execute(transaction);
  await sql`UPDATE document.workforce_request SET status='pending_approval',submitted_at=now(),submitted_by=${actor}::uuid,workflow_request_id=${workflow.id}::uuid,decision_fingerprint=${"b".repeat(64)},updated_by=${actor}::uuid WHERE tenant_id=${tenant}::uuid AND id=${request.id}::uuid`.execute(transaction);
  const approved=(await sql<{row_version:number}>`UPDATE document.workforce_request SET status='approved',approved_at=now(),approved_by=${approver}::uuid,updated_by=${actor}::uuid WHERE tenant_id=${tenant}::uuid AND id=${request.id}::uuid RETURNING row_version`.execute(transaction)).rows[0];assert(approved);
  await sql`SET LOCAL ROLE athyper_runtime`.execute(transaction);
  const repository=new KyselyWorkforceRequestRepository(),input={tenantId:tenant,command:{requestId:request.id,expectedVersion:Number(approved.row_version),idempotencyKey:`apply-${token}`},appliedBy:actor,applicationFingerprint:"c".repeat(64)};
  const result=await repository.apply(input,transaction);assert(result);assert(result.materialization.offboardingCaseId);
  const replay=await repository.apply(input,transaction);assert.equal(replay?.replayed,true);assert.equal(replay?.materialization.offboardingCaseId,result.materialization.offboardingCaseId);
  const caseRows=(await sql<{count:string}>`SELECT count(*)::text count FROM document.offboarding_case WHERE tenant_id=${tenant}::uuid AND id=${result.materialization.offboardingCaseId}::uuid AND employee_id=${employee}::uuid AND employment_id=${employment}::uuid`.execute(transaction)).rows[0];assert.equal(Number(caseRows?.count),1);
  const current=(await sql<{status:string;termination_date:string}>`SELECT status,termination_date::text FROM master.employment WHERE tenant_id=${tenant}::uuid AND id=${employment}::uuid`.execute(transaction)).rows[0];assert.equal(current?.status,"active");assert.equal(current?.termination_date,"2026-12-31");
  passed=true;throw rollback;
});}catch(error){if(error!==rollback)throw error;}finally{await db.destroy();}
assert(passed);console.log(JSON.stringify({passed:true,offboardingCase:"created",replay:"stable",futureEmployment:"active until exit",fixtureChanges:"rolled back"}));
