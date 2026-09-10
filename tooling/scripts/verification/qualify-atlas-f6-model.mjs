import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {authenticated,save,images,sql,tenant,assistantText} from './atlas-f6-common.mjs';
const plane=process.argv[2]??'studio';assert.ok(['studio','neon','mesh'].includes(plane));
const report={observedAt:new Date().toISOString(),plane,actor:'catl.admin',images:images(),checks:[]};
let auth;
try{
 auth=await authenticated(plane,'catl.admin');report.assurance=auth.session.assurance;
 const admissionResponse=await auth.client.get('/api/relay/atlas/admission');assert.equal(admissionResponse.status(),200);const admission=await admissionResponse.json();
 assert.equal(admission.chatAllowed,true,'Current persona is not admitted to the live model');
 report.policyRevision=admission.policyRevision;
 const headers={...await auth.headers(),'idempotency-key':randomUUID()};
 const created=await auth.client.post('/api/relay/atlas/threads',{headers,data:{title:'F6 synthetic live-model and replay qualification'}});assert.equal(created.status(),201);const thread=await created.json();report.threadId=thread.threadId;
 const data={clientRequestId:randomUUID(),publicModelId:'atlas-re-1.0-local',dataClass:'synthetic',catalogPolicyRevision:admission.policyRevision,userText:'Synthetic pilot verification only. What is 7 multiplied by 9? Reply with the integer and no business facts.'};
 async function run(){const r=await auth.client.post('/api/relay/atlas/threads/'+thread.threadId+'/runs',{headers,data});assert.equal(r.status(),200);const raw=await r.text();return raw.split(/\r?\n\r?\n/).flatMap(frame=>{const text=frame.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');return text?[JSON.parse(text)]:[];});}
 const start=performance.now(),first=await run();report.elapsedMs=Math.round(performance.now()-start);report.terminalEvent=first.at(-1)?.event;assert.equal(first.at(-1)?.event.type,'run.completed');
 report.answer=first.filter(e=>e.event.type==='message.delta').map(e=>e.event.text).join('');assert.match(report.answer,/\b63\b/);report.runId=first[0].runId;assert.match(report.runId,/^[0-9a-f-]{36}$/i);
 const second=await run();assert.equal(second[0].runId,report.runId);assert.equal(second.at(-1)?.event.type,'run.completed');assert.equal(second.filter(e=>e.event.type==='message.delta').map(e=>e.event.text).join(''),report.answer);
 const history=await auth.client.get('/api/relay/atlas/threads/'+thread.threadId+'/messages');assert.equal(history.status(),200);assert.match(assistantText(await history.json()),/\b63\b/);
 const entries=JSON.parse(sql(plane,`SELECT coalesce(jsonb_agg(entry),'[]'::jsonb) FROM ai.atlas_provider_usage WHERE tenant_id='${tenant}' AND run_id='${report.runId}';`));
 assert.equal(entries.length,1,'Replay must not call the model again');const entry=entries[0];
 const config=JSON.parse(readFileSync('deploy/config/atlas/local-inference.json','utf8'));assert.equal(entry.actualModelId,config.model.upstream);assert.equal(entry.bindingRevision,config.model.digest);assert.equal(entry.providerId,'ollama');
 report.provider={providerId:entry.providerId,actualModelId:entry.actualModelId,bindingRevision:entry.bindingRevision,policyRevision:entry.policyRevision,usage:entry.usage,finish:entry.finish,providerCallCount:entries.length};
 const tags=JSON.parse(execFileSync('docker',['exec','athyper-dev-api-1','node','--input-type=module','-e','const r=await fetch("http://atlas-inference:11434/api/tags");const d=await r.json();console.log(JSON.stringify(d.models.map(m=>({name:m.name,digest:m.digest}))));'],{encoding:'utf8',stdio:'pipe'}));
 assert.ok(tags.some(m=>m.name===config.model.upstream&&m.digest.replace(/^sha256:/,'')===config.model.digest.slice(7)));report.loadedModelPins=tags;
 report.checks.push('authenticated pinned-model answer','completed durable conversation','idempotent replay with one provider usage entry','configured digest matches local registry');report.passed=true;
}catch(error){report.passed=false;report.blocker=error.message.split('\n')[0];report.failure={actual:error.actual,expected:error.expected,location:error.stack?.split('\n').find(line=>line.includes('qualify-atlas-f6-model'))};process.exitCode=1;}finally{if(auth)await auth.close();save('model-'+plane+'.json',report);console.log(JSON.stringify(report));}
