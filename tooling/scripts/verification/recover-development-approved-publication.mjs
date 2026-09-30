// Run via stdin inside the development worker. This only queues an already-approved release.
import {readFileSync} from 'node:fs';
import {createAthyperDatabaseAdapter} from '@athyper/server-adapter-db-athyper';
import {createBullMqJobRuntime} from '@athyper/server-runtime-jobs';
import {sql} from 'kysely';
const tenantId='44444444-4444-4444-8444-444444444444';
const releaseId='e0abaddf-5319-4393-a0a9-a30a9507d4ac';
const revisionId='4849ea52-4e91-4c09-b06a-22e511362050';
const recoveryActor='41f9d49a-35c6-55bd-8fb3-8074195b6c0f';
if(process.env.INFISICAL_ENVIRONMENT!=='dev')throw new Error('Development worker required');
const secret=name=>encodeURIComponent(readFileSync('/run/secrets/'+name,'utf8').trim());
const adapter=createAthyperDatabaseAdapter({connectionString:`postgresql://athyper_worker:${secret('worker-db-password')}@dbpool-session:5432/athyper_studio`,max:1});
const jobs=createBullMqJobRuntime({redisUrl:`redis://:${secret('redis-password')}@memorycache:6379`});
try{
 await adapter.database.transaction().execute(async database=>{
  await sql`SELECT set_config('app.current_tenant_id',${tenantId},true)`.execute(database);
  const row=(await sql`SELECT r.status,r.approved_by,r.approved_at,l.definition_revision_id FROM publication.release r JOIN publication.business_partner_definition_release_link l ON l.publication_release_id=r.id WHERE r.id=${releaseId}::uuid AND r.tenant_id=${tenantId}::uuid`.execute(database)).rows[0];
  if(!row||row.status!=='approved'||row.approved_by!=='5cd6cf93-3fe4-500c-8066-3ebf14a9eb5d'||!row.approved_at||row.definition_revision_id!==revisionId)throw new Error('Native owner approval coordinates do not match');
 });
 const jobId=await jobs.enqueue('publication.authority','publication.compile-artifact',{releaseId},{enqueueKey:`publication:${releaseId}:compile:1`,maxAttempts:5,payloadSchema:{name:'publication.compile-artifact',version:1},execution:{planeKey:'studio',scope:'tenant',tenantId,principalId:recoveryActor,correlationId:releaseId}});
 console.log(JSON.stringify({schema:'athyper.development-approved-publication-recovery/1',observedAt:new Date().toISOString(),tenantId,releaseId,revisionId,jobId,recoveryActor,nativeApprovalPreserved:true}));
}finally{await jobs.close();await adapter.close();}
