// Read-only local DEV probe for request review metadata.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {Kysely,PostgresDialect,sql} from 'kysely';
import pg from 'pg';
import {KyselyBusinessPartnerCaseRepository} from '../../../../packages/services/master-data/src/kysely-business-partner-case-repository.js';
const caseId=process.env.PROBE_CASE_ID, host=process.env.PROBE_DB_HOST;
if(!caseId||!host)throw Error('PROBE_CASE_ID and PROBE_DB_HOST required');
const db=new Kysely<any>({dialect:new PostgresDialect({pool:new pg.Pool({host,database:'athyper_neon',user:'athyper_runtime',password:readFileSync(`${homedir()}/.athyper/instances/dev/secrets/runtime-db-password`,'utf8').trim(),max:1})})});
try {await db.transaction().execute(async tx=>{
 await sql`SET TRANSACTION READ ONLY`.execute(tx);
 await sql`SELECT set_config('app.database_plane','neon',true),set_config('app.current_tenant_id','44444444-4444-4444-8444-444444444444',true),set_config('app.current_principal_id','cca94907-7519-5871-8e3c-6b11aa545c93',true)`.execute(tx);
 const view=await new KyselyBusinessPartnerCaseRepository().getView('44444444-4444-4444-8444-444444444444',caseId,tx);
 assert(view?.validationRun);assert(!view.validationRun.stale);
 const codes=view.onboardingCycle?.tasks.map(task=>task.code);
 assert.deepEqual(codes,['INVITATION','REGISTRATION','DUPLICATE_REVIEW','QUALIFICATION','BANK_REGISTRATION','BANK_VERIFICATION','SUPPLIER_READINESS','ACTIVATION']);
 const reviewers=view.workflow?.stages.flatMap(stage=>stage.workItems).filter(item=>item.ownerPrincipalId);
 assert(reviewers?.length);assert(reviewers.every(item=>item.ownerDisplayName===undefined || typeof item.ownerDisplayName==="string"));
 console.log(JSON.stringify({passed:true,validationRevision:view.validationRun.requestVersion,stale:view.validationRun.stale,taskOrder:codes,reviewerNamesVisible:reviewers.filter(item=>item.ownerDisplayName).length}));
});}finally{await db.destroy();}
