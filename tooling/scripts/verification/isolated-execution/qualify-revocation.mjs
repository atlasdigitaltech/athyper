import{execFileSync}from'node:child_process';import{readFileSync,writeFileSync}from'node:fs';import assert from'node:assert/strict';import{createHash}from'node:crypto';
import{artifactHash,releaseId}from'./release-boundary.mjs';import{authoritySnapshot,assertAuthorityUnchanged}from'./authority-check.mjs';
const positive=JSON.parse(readFileSync('governance/policy/reports/business-partner-release-19-isolated-export-ai.dev.json','utf8'));
assert.equal(positive.exportQualified,true);assert.equal(positive.aiRetrievalQualified,true);assert.equal(positive.blocker,undefined);assert.equal(positive.artifactHash,artifactHash);
const baseline=assertAuthorityUnchanged(),report={schemaVersion:1,kind:'release19_live_isolated_revocation',releaseId,artifactHash,baseline,checks:[],qualified:false,sharedDevGrantsChanged:false,revokedAccessRestored:false};
const save=()=>writeFileSync('governance/policy/reports/business-partner-release-19-isolated-revocation.dev.json',JSON.stringify(report,null,2)+'\n');
const docker=args=>execFileSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:3000000});
const send=(name,path,method,body,status,account='catl.admin')=>{const r=JSON.parse(execFileSync('docker',['exec','-i','athyper-bp-r19-auth-client','node','/client/session-client.mjs',account,path,method],{input:JSON.stringify(body??{}),encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:3000000}));report.checks.push({name,account,status:r.status,artifact:r.artifact,passed:r.status===status&&r.artifact===artifactHash,checkedAt:new Date().toISOString()});save();assert.equal(report.checks.at(-1).passed,true,name);return r.body;};
const ai={entityCode:'business_partner',recordId:'01a08a39-b146-7553-803b-87e5a47e2e8a',descriptorHash:'83ca015f869bfe90bce4a8bb4eedc5d5ffa48f50523faa8a04997dd9b4d923ec'};
let paused=false;
try{
 send('owner_without_target_export','/api/records/business_partner/exports','POST',{filter:{fields:['id']}},403,'catl.owner');
 send('owner_without_target_ai_read','/api/isolated/ai-record-retrieval','POST',ai,403,'catl.owner');
 send('admin_read_before_revocation','/api/records/business_partner/'+ai.recordId,'GET',{},200);
 docker(['pause','athyper-bp-r19-worker']);paused=true;
 const queued=send('export_queued_before_revocation','/api/records/business_partner/exports','POST',{filter:{fields:['id'],_transfer:{fields:['id'],format:'json'}}},202);report.queuedExport=queued.exportRequestId;
 execFileSync('node',['tooling/scripts/verification/isolated-execution/revoke-test-grants.mjs','--revoke'],{stdio:['pipe','pipe','pipe']});
 report.revocation=JSON.parse(readFileSync('governance/policy/reports/business-partner-release-19-isolated-test-grants-cleanup.applied.dev.json','utf8'));assert.equal(report.revocation.membershipsRevoked,3);assert.equal(report.revocation.assignmentsRevoked,3);
 const after=authoritySnapshot();assert.equal(after.source,baseline.sha256);assert.notEqual(after.clone,baseline.sha256);report.after=after;save();
 send('new_export_after_revocation','/api/records/business_partner/exports','POST',{filter:{fields:['id']}},403);
 send('download_after_revocation','/api/records/exports/'+positive.exportRequestId+'/download','GET',{},403);
 send('ai_after_revocation','/api/isolated/ai-record-retrieval','POST',ai,403);
 send('record_after_revocation','/api/records/business_partner/'+ai.recordId,'GET',{},403);
 docker(['unpause','athyper-bp-r19-worker']);paused=false;
 assert.match(queued.exportRequestId,/^[a-f0-9-]{36}$/);
 let job;for(let n=0;n<60;n++){job=JSON.parse(docker(['exec','athyper-bp-r19-db','psql','-X','-U','postgres','-d','athyper_neon','-Atc',`select json_build_object('status',status,'artifactKey',artifact_key,'error',error_code,'detail',error_detail) from ops.record_export_request where id='${queued.exportRequestId}'`]));if(['failed','completed'].includes(job.status))break;await new Promise(r=>setTimeout(r,500));}
 report.staleQueuedContext=job;assert.equal(job.status,'failed');assert.equal(job.artifactKey,null);assert.ok(job.error==='FORBIDDEN'||(job.error==='ERROR'&&job.detail==='Record export authority was revoked before execution'));
 const final=authoritySnapshot();assert.equal(final.source,baseline.sha256);assert.equal(final.clone,after.clone);report.final=final;
 report.qualified=true;report.completedAt=new Date().toISOString();
 report.limitations=['Clone test assignments remain revoked; they are never restored from the source snapshot.','This proves local live authority refresh including a queued stale context; it does not establish continuous cross-instance revocation synchronization.','Previously issued object-store presigned URLs retain their bounded TTL; no new download URL is issued after revocation.'];
}catch(e){report.blocker=String(e.message).split('\n')[0].slice(0,200);process.exitCode=1;}finally{if(paused)docker(['unpause','athyper-bp-r19-worker']);save();console.log(JSON.stringify({qualified:report.qualified,blocker:report.blocker}));}
