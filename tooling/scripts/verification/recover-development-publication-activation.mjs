import {readFileSync} from 'node:fs';
import {createAthyperDatabaseAdapter} from '@athyper/server-adapter-db-athyper';
import {createBullMqJobRuntime} from '@athyper/server-runtime-jobs';
import {sql} from 'kysely';
const tenantId='44444444-4444-4444-8444-444444444444',releaseId='e0abaddf-5319-4393-a0a9-a30a9507d4ac';
if(process.env.INFISICAL_ENVIRONMENT!=='dev')throw new Error('Development worker required');
const secret=name=>encodeURIComponent(readFileSync('/run/secrets/'+name,'utf8').trim());
const adapter=createAthyperDatabaseAdapter({connectionString:`postgresql://athyper_worker:${secret('worker-db-password')}@dbpool-session:5432/athyper_studio`,max:1});
const jobs=createBullMqJobRuntime({redisUrl:`redis://:${secret('redis-password')}@memorycache:6379`});
try{
 const deployments=await adapter.database.transaction().execute(async database=>{
  await sql`SELECT set_config('app.current_tenant_id',${tenantId},true)`.execute(database);
  return (await sql`SELECT d.id,d.target_plane,d.status FROM publication.deployment d JOIN publication.artifact a ON a.id=d.artifact_id JOIN publication.release r ON r.id=a.publication_release_id WHERE r.id=${releaseId}::uuid AND r.approved_by='5cd6cf93-3fe4-500c-8066-3ebf14a9eb5d'::uuid AND a.status='signed'`.execute(database)).rows;
 });
 if(deployments.length!==2)throw new Error('Two signed native deployments required');
 const principals={neon:'26a55689-ab23-5bb3-a412-5de27a2962f4',mesh:'90b946af-7e21-58c1-98af-9b27a24c1174'};
 const receipts=[];
 for(const d of deployments){
  if(!principals[d.target_plane]||!['dispatched','received','staged','verified','activated'].includes(d.status))throw new Error('Deployment is not ready for recovery');
  const jobId=await jobs.enqueue('publication.apply','publication.apply-release',{deploymentId:d.id,targetPlane:d.target_plane},{enqueueKey:`publication:${d.id}:apply:${d.target_plane}:principal-recovery:1`,maxAttempts:3,payloadSchema:{name:'publication.apply-release',version:1},execution:{planeKey:d.target_plane,scope:'tenant',tenantId,principalId:principals[d.target_plane],correlationId:releaseId}});
  receipts.push({deploymentId:d.id,plane:d.target_plane,jobId,principalId:principals[d.target_plane]});
 }
 console.log(JSON.stringify({schema:'athyper.development-publication-activation-recovery/1',observedAt:new Date().toISOString(),releaseId,receipts}));
}finally{await jobs.close();await adapter.close();}
