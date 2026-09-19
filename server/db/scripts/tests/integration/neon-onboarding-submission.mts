// Local DEV rollback probe. Does not commit a submission or notify reviewers.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {Kysely, PostgresDialect, sql} from 'kysely';
import pg from 'pg';
import {KyselyBusinessPartnerCaseRepository} from '../../../../packages/services/master-data/src/kysely-business-partner-case-repository.js';
import {KyselyBusinessPartnerOnboardingCycleCoordinator} from '../../../../packages/services/master-data/src/business-partner-onboarding-cycle.js';
import {LocalBusinessPartnerDefinitionConsumer} from '../../../../packages/services/publication/src/business-partner-definition-consumer.js';
import {KyselyLocalProjectionRepository} from '../../../../packages/services/publication/src/kysely-local-projection-repository.js';
import {canonicalBytes,sha256} from '../../../../packages/adapters/publication-signing/src/index.js';
const caseId=process.env.PROBE_CASE_ID;
if (!caseId || !process.env.PROBE_DB_HOST) throw Error('PROBE_CASE_ID and PROBE_DB_HOST required');
const db=new Kysely<any>({dialect:new PostgresDialect({pool:new pg.Pool({host:process.env.PROBE_DB_HOST,port:5432,database:'athyper_neon',user:'athyper_runtime',password:readFileSync(`${homedir()}/.athyper/instances/dev/secrets/runtime-db-password`,'utf8').trim(),max:1})})});
const rollback=Symbol('rollback');
try {
 await db.transaction().execute(async tx=>{
  await sql`SELECT set_config('app.database_plane','neon',true),set_config('app.current_tenant_id','44444444-4444-4444-8444-444444444444',true),set_config('app.current_principal_id','cca94907-7519-5871-8e3c-6b11aa545c93',true)`.execute(tx);
  const repository=new KyselyBusinessPartnerCaseRepository();
  const request=await repository.get('44444444-4444-4444-8444-444444444444',caseId,tx);
  assert(request);assert.equal(request.status,'draft');
  const approvers=(await sql<{principal_id:string}>`SELECT principal_id::text FROM document.fn_entity_case_approvers(${request.tenantId}::uuid,${request.operatingOrganizationId}::uuid,${request.companyCodeId??null}::uuid,'cca94907-7519-5871-8e3c-6b11aa545c93'::uuid)`.execute(tx)).rows.map(row=>row.principal_id);
  assert(approvers.length>0);
  const artifact=await new LocalBusinessPartnerDefinitionConsumer({local:new KyselyLocalProjectionRepository(tx),canonicalizer:{canonicalBytes,sha256}}).workflow({kind:request.kind,proposedPayload:request.proposedPayload,requestedRole:request.requestedRole});
  const definition={...artifact,approverPrincipalIds:approvers,stages:artifact.stages.map(stage=>({...stage,approverPrincipalIds:approvers,escalationPrincipalIds:approvers.slice(1)}))};
  const submitted=await repository.submit({tenantId:request.tenantId,requestId:caseId,expectedVersion:request.rowVersion,submittedBy:'cca94907-7519-5871-8e3c-6b11aa545c93',idempotencyKey:`probe-${crypto.randomUUID()}`,definition:definition as never,decisionFingerprint:'a'.repeat(64)},tx);
  assert(submitted);assert.equal(submitted.request.status,'pending_approval');
  const coordinator=new KyselyBusinessPartnerOnboardingCycleCoordinator();
  const event={tenantId:'44444444-4444-4444-8444-444444444444',principalId:'cca94907-7519-5871-8e3c-6b11aa545c93',eventCode:'business_partner.case.submitted',request:submitted.request};
  await coordinator.advance(event,tx);
  await coordinator.advance(event,tx);
  const runs=(await sql`SELECT id FROM governance.cycle_run WHERE tenant_id=${event.tenantId}::uuid AND idempotency_key=${`business-partner-onboarding:${caseId}`}`.execute(tx)).rows;
  assert.equal(runs.length,1);
  const tasks=(await sql<{code:string;status:string}>`SELECT code,status FROM governance.cycle_task WHERE cycle_run_id=${runs[0].id}::uuid`.execute(tx)).rows;
  assert.equal(tasks.length,8);
  for(const code of ['INVITATION','REGISTRATION','DUPLICATE_REVIEW'])assert.equal(tasks.find(t=>t.code===code)?.status,'completed');
  assert.equal(tasks.find(t=>t.code==='QUALIFICATION')?.status,'ready');
  console.log(JSON.stringify({passed:true,submittedRevision:request.rowVersion+1,tasks,rollback:true}));
  throw rollback;
 });
} catch(e) {if(e!==rollback)throw e;} finally {await db.destroy();}
