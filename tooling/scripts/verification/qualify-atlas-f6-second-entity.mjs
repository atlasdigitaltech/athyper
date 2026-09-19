import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {images,save,sql,authenticated,tenant} from './atlas-f6-common.mjs';
const report={observedAt:new Date().toISOString(),plane:'mesh',entityCode:'network_relationship',images:images()};let auth;
try{
 const binding=JSON.parse(sql('mesh',"SELECT jsonb_build_object('compiledHash',d.compiled_hash,'releaseId',a.source_release_id,'aiEnabled',d.compiled_json#>'{ai,enabled}') FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id JOIN runtime_meta.entity_descriptor d ON d.applied_release_id=a.id WHERE h.publication_key='metadata.entity.network_relationship.tenant.44444444-4444-4444-8444-444444444444';"));report.binding=binding;
 assert.equal(binding.aiEnabled,true,'Second-entity AI definition must be reviewed and published before pilot execution');
 const scope=JSON.parse(readFileSync('docs/examples/atlas-f6/mesh-pilot-scope.json','utf8'));assert.equal(scope.tenantId,tenant);
 for(const k of ['principalId','recordId','networkAccountId'])assert.match(scope[k],/^[a-f0-9-]{36}$/i);
 auth=await authenticated('mesh','catl.admin',scope.principalId);
 const admission=await(await auth.client.get('/api/relay/atlas/admission')).json();assert.equal(admission.chatAllowed,true);
 const headers={...await auth.headers(),'idempotency-key':randomUUID()};
 const created=await auth.client.post('/api/relay/atlas/threads',{headers,data:{title:'F6 second-entity qualification'}});assert.equal(created.status(),201);const thread=await created.json();
 const r=await auth.client.post(`/api/relay/atlas/threads/${thread.threadId}/runs`,{headers,data:{clientRequestId:randomUUID(),publicModelId:'atlas-re-1.0-local',dataClass:'internal',catalogPolicyRevision:admission.policyRevision,userText:'Show this record summary',businessContext:{schemaVersion:1,kind:'record',entityCode:'network_relationship',recordId:scope.recordId,workContext:{networkAccountId:scope.networkAccountId},dirty:false,locale:'en',generationId:randomUUID()}}});assert.equal(r.status(),200);
 const events=(await r.text()).split(/\r?\n\r?\n/).flatMap(f=>{const d=f.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');return d?[JSON.parse(d)]:[];});
 report.eventTypes=events.map(e=>e.event.type);report.intents=events.filter(e=>e.event.type==='intent.resolved').map(e=>e.event.intent);report.runFailure=events.find(e=>e.event.type==='run.failed')?.event;
 assert.equal(events.at(-1)?.event.type,'run.completed');assert.ok(events.some(e=>e.event.type==='source.cited'&&e.event.coordinate.entityCode==='network_relationship'&&e.event.coordinate.recordId===scope.recordId));
 report.threadId=thread.threadId;report.runId=events[0].runId;report.accountId=scope.networkAccountId;report.recordId=scope.recordId;report.policyRevision=admission.policyRevision;
 // Persist coordinates and event kinds only; no relationship record values.
 report.events=events.map(e=>({type:e.event.type,...(e.event.type==='source.cited'?{coordinate:e.event.coordinate}:{})}));
 const usage=Number(sql('mesh',`SELECT count(*) FROM ai.atlas_provider_usage WHERE tenant_id='${tenant}' AND run_id='${report.runId}'`));assert.equal(usage,0);report.providerCalls=usage;
 const denied=await auth.client.post(`/api/relay/atlas/threads/${thread.threadId}/runs`,{headers:{...await auth.headers(),'idempotency-key':randomUUID()},data:{clientRequestId:randomUUID(),publicModelId:'atlas-re-1.0-local',dataClass:'internal',catalogPolicyRevision:admission.policyRevision,userText:'Show this record summary',businessContext:{schemaVersion:1,kind:'record',entityCode:'network_relationship',recordId:scope.recordId,workContext:{networkAccountId:'c2452ba4-5f07-5214-863f-2b5212a557bf'},dirty:false,locale:'en',generationId:randomUUID()}}});
 assert.equal(denied.status(),200);const deniedEvents=(await denied.text()).split(/\r?\n\r?\n/).flatMap(f=>{const d=f.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');return d?[JSON.parse(d)]:[];});
 assert.equal(deniedEvents.at(-1)?.event.type,'run.completed');assert.ok(deniedEvents.some(e=>e.event.type==='intent.resolved'&&e.event.intent.kind==='denied'));assert.ok(!deniedEvents.some(e=>['source.cited','tool.completed'].includes(e.event.type)));report.foreignAccountDenied=true;
 const owner=await authenticated('mesh','catl.owner');try{const r=await owner.client.get('/api/relay/atlas/threads/'+thread.threadId+'/messages');assert.ok([403,404].includes(r.status()));report.crossPersonaHistoryDenied=true;}finally{await owner.close();}
 const history=await auth.client.get('/api/relay/atlas/threads/'+thread.threadId+'/messages');assert.equal(history.status(),200);report.ownHistoryAvailable=true;report.finalImages=images();report.passed=true;
}catch(error){report.passed=false;report.blocker=error.message.split('\n')[0];report.failure={code:error.code,actual:error.actual,expected:error.expected,location:error.stack?.split('\n').find(line=>line.includes('qualify-atlas-f6-second-entity'))};}finally{if(auth)await auth.close();save('second-entity.json',report);console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;}
