// DEV Docker only. Every synthetic transcript, run and quota change is rolled back.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const root=new URL('../../../',import.meta.url).pathname;
const requireDb=createRequire(root+'server/db/package.json');const {Pool}=requireDb('pg');
const requireAi=createRequire(root+'server/packages/platform/ai/package.json');const {Kysely,PostgresDialect,sql}=requireAi('kysely');
const {createAtlasLocalGenerationServices,parseAtlasLocalConfiguration}=await import(root+'server/packages/platform/ai/src/local-generation-composition.ts');
const {OllamaModelProvider}=await import(root+'server/packages/adapters/ai-ollama/src/index.ts');
const {context:base}=await import(root+'server/packages/platform/ai/src/__tests__/review-fixture.ts');
const config=parseAtlasLocalConfiguration(JSON.parse(readFileSync(root+'deploy/config/atlas/local-inference.json','utf8')));
const ip=(name:string,network?:string)=>execFileSync('docker',['inspect',name,'--format',network?`{{(index .NetworkSettings.Networks "${network}").IPAddress}}`:'{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'],{encoding:'utf8'}).trim();
const databaseHost=ip('athyper-dev-db-1'),inferenceHost=ip('athyper-dev-atlas-atlas-inference-1','athyper-dev-atlas_inference');
const password=execFileSync('docker',['exec','athyper-dev-db-1','sh','-c','cat "$POSTGRES_PASSWORD_FILE"'],{encoding:'utf8'}).trim();

// One explicitly named synthetic Neon thread is retained and archived so that
// commit/reopen and competing independent transactions are tested, not mocked.
const plane='neon';
const db=new Kysely({dialect:new PostgresDialect({pool:new Pool({host:databaseHost,user:'postgres',password,database:'athyper_neon',max:4})})});
let services:any,context:any,threadId:string|undefined;
try {
 const actor=(await sql`SELECT tenant_id,principal_id FROM master.principal_identity_binding WHERE username='catl.admin' AND status='active' LIMIT 1`.execute(db)).rows[0];
 context={...base,planeKey:plane,realmKey:plane,tenantId:actor.tenant_id,principalId:actor.principal_id,permissions:{...base.permissions,planeKey:plane,tenantId:actor.tenant_id,principalId:actor.principal_id,allowed:['neon.ai.agent.use']}};
 const transactions={run:async(p:string,c:any,work:any)=>db.transaction().execute(async(tx:any)=>{
  assert.equal(p,plane);await sql`SET LOCAL ROLE athyper_runtime`.execute(tx);
  await sql`SELECT set_config('app.current_tenant_id',${c.tenantId},true),set_config('app.current_principal_id',${c.principalId},true)`.execute(tx);
  return work(tx);
 })};
 let providerCalls=0;
 const provider=new OllamaModelProvider({modelDigest:config.model.digest,engineVersion:config.engine.version,fetch:async(url:any,init:any)=>{
  if(String(url).endsWith('/api/chat'))providerCalls++;
  const u=new URL(url);u.hostname=inferenceHost;return fetch(u,init);
 }});
 services=createAtlasLocalGenerationServices({transactions:transactions as never,config,provider});
 const thread=await services.threads.create(context,'Synthetic Atlas generation race verification');threadId=thread.threadId;
 const admission=await services.admission.resolve(context);
 const abort=new AbortController();
 const command={context,threadId:thread.threadId,clientRequestId:randomUUID(),publicModelId:config.model.publicId,dataClass:'synthetic' as const,userText:'Write a long numbered guide to fictional inventory management.',catalogPolicyRevision:admission.policyRevision,signal:abort.signal};
 const iterator=services.runtime.run(command)[Symbol.asyncIterator]();const first=await iterator.next();assert.equal(first.value.event.type,'run.started');
 const drain=async(c:any)=>{for await(const e of services.runtime.run(c)){};};
 await assert.rejects(()=>drain({...command,signal:undefined}),{code:'IDEMPOTENCY_CONFLICT'});
 await assert.rejects(()=>drain({...command,signal:undefined,clientRequestId:randomUUID()}),{code:'IDEMPOTENCY_CONFLICT'});
 for(;;){const e=await iterator.next();assert.equal(e.done,false);if(e.value.event.type==='message.delta')break;}
 abort.abort();await iterator.return();
 const reopened=createAtlasLocalGenerationServices({transactions:transactions as never,config,provider});
 assert.equal((await reopened.runs.get({context,runId:first.value.runId}))?.status,'cancelled');
 await drain({...command,signal:undefined});assert.equal(providerCalls,1);
 const b=services.binding,runId=randomUUID(),callId=randomUUID();
 const begun=await services.runs.begin({context,runId,threadId,clientRequestId:randomUUID(),inputMessageId:randomUUID(),outputMessageId:randomUUID(),userContent:[{type:'text',text:'What is 2 + 2? Reply only the number.'}],publicModelId:b.publicModelId,bindingId:b.bindingId,bindingRevision:b.bindingRevision,policyRevision:admission.policyRevision,promptRevision:'atlas-local-chat-v1',startedAt:new Date().toISOString()});
 let text='',usage:any;const started=Date.now();
 for await(const event of provider.invoke({binding:b,credential:{authMode:'local_transport',endpoint:config.endpoint,ownerId:b.credentialOwnerId,credentialId:null,credentialRevision:null},prompt:{messages:[{role:'user',content:[{type:'text',text:'What is 2 + 2? Reply only the number.'}]}],maxOutputTokens:16},trace:{runId,providerCallId:callId,tenantId:context.tenantId,principalHash:'synthetic-verification',safetyIdentifier:'synthetic-verification',promptRevision:'atlas-local-chat-v1',policyRevision:admission.policyRevision}})){
  if(event.kind==='text_delta')text+=event.text;if(event.kind==='usage'&&event.final)usage=event.usage;if(event.kind==='failed')throw Error(event.error.code);
 }
 assert.equal(text.trim(),'4');assert.ok(usage);
 await services.runs.append({ledgerId:randomUUID(),runId,providerCallId:callId,tenantId:context.tenantId,planeKey:plane,principalHash:'synthetic-verification',providerId:'ollama',providerRequestId:null,credentialId:null,credentialRevision:null,credentialOwnerId:b.credentialOwnerId,providerRegion:'local',publicModelId:b.publicModelId,bindingId:b.bindingId,bindingRevision:b.bindingRevision,actualModelId:b.upstreamModelId,adapterId:b.adapterId,adapterVersion:b.adapterVersion,policyRevision:admission.policyRevision,promptRevision:'atlas-local-chat-v1',priceVersion:b.priceVersion,usage,inputCostUsd:0,outputCostUsd:0,totalCostUsd:0,finishReason:'stop',errorClass:null,durationMs:Date.now()-started,recordedAt:new Date().toISOString()},context);
 const winners=await Promise.all([services.runs.complete({context,runId,assistantContent:[{type:'text',text}],completedAt:new Date().toISOString()}),services.runs.cancel({context,runId,cancelledAt:new Date().toISOString()})]);
 assert.equal(winners[0].status,winners[1].status);assert.ok(['completed','cancelled'].includes(winners[0].status));
 const rows=(await sql`SELECT status,content_blocks FROM ai.atlas_message WHERE id=${begun.run.outputMessageId}::uuid`.execute(db)).rows;assert.equal(rows.length,1);assert.equal(rows[0].status,winners[0].status);
 assert.equal((await sql`SELECT count(*)::int AS n FROM ai.ai_agent_run WHERE id=${runId}::uuid`.execute(db)).rows[0].n,1);
 assert.equal((await sql`SELECT count(*)::int AS n FROM ai.ai_agent_call WHERE run_id=${runId}::uuid`.execute(db)).rows[0].n,1);
 assert.equal((await sql`SELECT model_call_count FROM ai.ai_agent_run WHERE id=${first.value.runId}::uuid`.execute(db)).rows[0].model_call_count,1);
 console.log(JSON.stringify({plane,threadId,committedDurability:'passed',activeDuplicate:'denied',concurrentThreadRun:'denied',consumerDisconnect:'cancelled_with_usage_receipt',terminalRace:winners[0].status,oneOutputAndMeteringRecord:'passed',providerCalls,fixture:'archived'}));
}finally{
 if(threadId&&services){const t=await services.threads.get(context,threadId);await services.threads.archive(context,threadId,t.rowVersion);}
 await db.destroy();
}
