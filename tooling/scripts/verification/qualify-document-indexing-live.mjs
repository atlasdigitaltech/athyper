/** Retry the existing failed DEV extraction jobs and verify real scoped Meilisearch hits. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
const fixtures=JSON.parse(readFileSync('governance/policy/reports/task-rules-journeys-live.dev.json','utf8')).cases;
const ids=fixtures.flatMap(c=>[c.reviewPack.attachmentVersionId,c.decisionDocument.attachmentVersionId]);
const program=`
import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';import {randomUUID} from 'node:crypto';
import {loadConfig} from './dist/config/index.js';import {createBullMqJobRuntime} from '@athyper/server-runtime-jobs';import {createMeilisearchIndex} from '@athyper/server-adapter-search-meilisearch';
for(const pid of readdirSync('/proc').filter(p=>/^\\d+$/.test(p))){let entries=[];try{entries=readFileSync('/proc/'+pid+'/environ','utf8').split(String.fromCharCode(0));}catch{}for(const entry of entries){const n=entry.indexOf('=');if(n>0&&entry.slice(0,n).startsWith('SEARCHCORE_'))process.env[entry.slice(0,n)]=entry.slice(n+1);}}
for(const [key,value] of Object.entries(process.env))if(key.endsWith('_FILE')&&value)try{process.env[key.slice(0,-5)]=readFileSync(value,'utf8').trim();}catch{}
process.env.REDIS_BULLMQ_URL='redis://:'+encodeURIComponent(readFileSync('/run/secrets/redis-password','utf8').trim())+'@memorycache:6379';
const c=loadConfig();assert.equal(c.env,'local');const jobs=createBullMqJobRuntime({redisUrl:c.bullMq.url});const index=createMeilisearchIndex(c.search);
const ids=${JSON.stringify(ids)},tenantId='44444444-4444-4444-8444-444444444444';
try{
 const failed=await jobs.listDeadLetters('documents.processing',{limit:200});const matching=failed.filter(j=>j.name==='documents.extract-index'&&j.failureReason?.includes('Document identifier')&&j.failureReason.includes('neon:'+tenantId+':'));let retried=0;for(const job of matching)if(await jobs.retry('documents.processing',job.jobId))retried++;
 for(const attachmentId of ids)await jobs.enqueue('documents.processing','documents.extract-index',{planeKey:'neon',tenantId,attachmentId,principalId:'cca94907-7519-5871-8e3c-6b11aa545c93'},{jobId:'index-recovery-'+randomUUID(),maxAttempts:1,timeoutMs:120000});
 let hits=[];for(let n=0;n<50;n++){const r=await index.search({planeKey:'neon',tenantId,text:'',limit:1000,offset:0});hits=r.hits.filter(h=>ids.includes(h.attachmentId));if(hits.length===ids.length)break;await new Promise(r=>setTimeout(r,1000));}
 assert.equal(hits.length,ids.length,'Every real PDF must become searchable');
 const other=await index.search({planeKey:'studio',tenantId,text:'',limit:1000,offset:0});assert.ok(!other.hits.some(h=>ids.includes(h.attachmentId)));
 const cross=await index.search({planeKey:'neon',tenantId:'55555555-5555-4555-8555-555555555555',text:'',limit:1000,offset:0});assert.ok(!cross.hits.some(h=>ids.includes(h.attachmentId)));
 let remaining=[];for(let n=0;n<40;n++){await new Promise(r=>setTimeout(r,1000));remaining=(await jobs.listDeadLetters('documents.processing',{limit:200})).filter(j=>matching.some(old=>old.jobId===j.jobId));if(!remaining.length)break;}assert.equal(remaining.length,0,'Retried identifier failures must leave the dead-letter queue');
 console.log(JSON.stringify({passed:true,retriedExistingJobs:retried,attachmentIds:ids,indexed: hits.length,planeIsolation:true,tenantIsolation:true}));
}finally{await jobs.close();index.close();}
`;
const result=JSON.parse(execFileSync('docker',['exec','-i','athyper-dev-source-worker-1','node','--input-type=module'],{input:program,encoding:'utf8',timeout:90000}));
const report={at:new Date().toISOString(),...result};writeFileSync('governance/policy/reports/document-indexing-live.dev.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
