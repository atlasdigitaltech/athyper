import {readFileSync} from 'node:fs';
import {createBullMqJobRuntime,createDeterministicEnqueueId} from '@athyper/server-runtime-jobs';
if(process.env.INFISICAL_ENVIRONMENT!=='dev')throw new Error('Development required');
const runtime=createBullMqJobRuntime({redisUrl:`redis://:${encodeURIComponent(readFileSync('/run/secrets/redis-password','utf8').trim())}@memorycache:6379`});
const deployments=[['mesh','01a06fe8-fccb-76f6-bcf7-9582956d78eb'],['neon','01a06fe8-fccb-74ec-ab0f-f89b54110de9']];
try{
 const previous=await runtime.listDeadLetters('publication.apply');
 const receipts=[];
 for(const [plane,id] of deployments){
  const applyId=createDeterministicEnqueueId('publication.apply','publication.apply-release',`publication:${id}:apply:${plane}:1`);
  const dispatchId=createDeterministicEnqueueId('publication.authority','publication.dispatch',`publication:${id}:dispatch:1`);
  // Preserve failed evidence below, then replace only the failed obsolete target-principal job.
  if(previous.some(job=>job.jobId===applyId))await runtime.cancel('publication.apply',applyId);
  const replayJobId = await runtime.replayDeadLetter('publication.authority',dispatchId,'target-principal-recovery-v2');
  if (!replayJobId) throw new Error('Expected failed dispatch job for replay');
  receipts.push({plane,deploymentId:id,applyId,dispatchId,replayJobId});
 }
 console.log(JSON.stringify({observedAt:new Date().toISOString(),previousFailedApplyJobs:previous,receipts}));
}finally{await runtime.close();}
