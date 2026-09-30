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
const rollback=new Error('ROLLBACK_TEST_FIXTURES');
for(const plane of ['neon','mesh','studio']){
 const db=new Kysely({dialect:new PostgresDialect({pool:new Pool({host:databaseHost,user:'postgres',password,database:'athyper_'+plane,max:1})})});
 try{await db.transaction().execute(async(tx:any)=>{
  const actor=(await sql`SELECT tenant_id,principal_id FROM master.principal_identity_binding WHERE username='catl.admin' AND status='active' LIMIT 1`.execute(tx)).rows[0];assert.ok(actor);
  const context={...base,planeKey:plane,realmKey:plane,tenantId:actor.tenant_id,principalId:actor.principal_id,permissions:{...base.permissions,planeKey:plane,tenantId:actor.tenant_id,principalId:actor.principal_id,allowed:[plane+'.ai.agent.use']}};
  await sql`SET LOCAL ROLE athyper_runtime`.execute(tx);
  const transactions={run:async(p:string,c:any,work:any)=>{
   assert.equal(p,plane);await sql`SELECT set_config('app.current_tenant_id',${c.tenantId},true),set_config('app.current_principal_id',${c.principalId},true)`.execute(tx);
   const result=await work(tx);await sql`SET CONSTRAINTS ALL IMMEDIATE`.execute(tx);await sql`SET CONSTRAINTS ALL DEFERRED`.execute(tx);return result;
  }};
  let calls=0;let fail=false;
  const provider=new OllamaModelProvider({modelDigest:config.model.digest,engineVersion:config.engine.version,fetch:async(url:any,init:any)=>{
   if(String(url).endsWith('/api/chat')){calls++;if(fail)return new Response('synthetic failure',{status:503});}
   const u=new URL(url);u.hostname=inferenceHost;return fetch(u,init);
  }});
  const services=createAtlasLocalGenerationServices({transactions:transactions as never,config,provider});
  const thread=await services.threads.create(context as never,'Synthetic Atlas integration verification');
  const admission=await services.admission.resolve(context as never);
  const command={context:context as never,threadId:thread.threadId,clientRequestId:randomUUID(),publicModelId:config.model.publicId,dataClass:'internal' as const,userText:'What is 2 + 2? Reply with only the number.',catalogPolicyRevision:admission.policyRevision};
  const collect=async(c=command)=>{const events=[];for await(const event of services.runtime.run(c))events.push(event);return events;};
  const answer=await collect();assert.equal(answer.at(-1)?.event.type,'run.completed');assert.equal(answer.filter(v=>v.event.type==='message.delta').map(v=>(v.event as any).text).join('').trim(),'4');
  const replay=await collect();assert.equal(replay[0]?.runId,answer[0]?.runId);assert.equal(calls,1);
  const rows=await services.threads.messages(context as never,thread.threadId);assert.equal(rows.items.length,2);assert.ok(rows.items.every((r:any)=>r.status==='completed'));
  const meter=(await sql`SELECT * FROM ai.ai_agent_run WHERE id=${answer[0]!.runId}::uuid`.execute(tx)).rows[0];assert.equal(meter.outcome,'completed');assert.equal(meter.resolved_provider_id,'ollama');assert.ok(Number(meter.output_tokens)>0);assert.equal(meter.provider_account_class,'local');
  const changed={...command,userText:'different request'};await assert.rejects(()=>collect(changed),{code:'IDEMPOTENCY_CONFLICT'});
  await assert.rejects(()=>collect({...command,clientRequestId:randomUUID(),userText:'你'.repeat(2000)}),{code:'RESULT_TOO_LARGE'});
  const denied={...context,permissions:{...context.permissions,allowed:[]}};
  await assert.rejects(()=>collect({...command,context:denied as never,clientRequestId:randomUUID()}),{code:'ADMISSION_DENIED'});assert.equal(calls,1);
  const abort=new AbortController();const cancelCommand={...command,clientRequestId:randomUUID(),userText:'Write a long numbered guide with 60 detailed steps for a fictional warehouse.',signal:abort.signal};
  const cancelled=[];for await(const event of services.runtime.run(cancelCommand)){cancelled.push(event);if(event.event.type==='message.delta')abort.abort();}
  assert.equal(cancelled.at(-1)?.event.type,'run.cancelled');
  const cancelledRun=await services.runs.get({context:context as never,runId:cancelled[0]!.runId});assert.equal(cancelledRun?.status,'cancelled');
  const replayCancelled=await collect({...cancelCommand,signal:undefined} as any);assert.equal(replayCancelled.at(-1)?.event.type,'run.cancelled');assert.equal(calls,2);
  fail=true;const failed=await collect({...command,clientRequestId:randomUUID()});assert.equal(failed.at(-1)?.event.type,'run.failed');assert.equal((await services.runs.get({context:context as never,runId:failed[0]!.runId}))?.status,'failed');
  const callRows=(await sql`SELECT c.* FROM ai.ai_agent_call c JOIN ai.ai_agent_run r ON r.id=c.run_id AND r.tenant_id=c.tenant_id WHERE r.thread_id=${thread.threadId}::uuid`.execute(tx)).rows;
  assert.equal(callRows.length,3);assert.ok(callRows.every((r:any)=>r.credential_owner===null&&r.credential_source===null));
  const staleInput={context:context as never,runId:randomUUID(),threadId:thread.threadId,clientRequestId:randomUUID(),inputMessageId:randomUUID(),outputMessageId:randomUUID(),userContent:[{type:'text' as const,text:'Abandoned request fixture'}],publicModelId:services.binding.publicModelId,bindingId:services.binding.bindingId,bindingRevision:services.binding.bindingRevision,policyRevision:admission.policyRevision,promptRevision:'atlas-local-chat-v1',startedAt:new Date().toISOString()};
  await services.runs.begin(staleInput);
  const realNow=Date.now,expiredAt=realNow()+360000;
  try{Date.now=()=>expiredAt;const stale=await services.runs.begin(staleInput);assert.equal(stale.replayed,true);assert.equal(stale.run.status,'failed');assert.equal(stale.run.terminalErrorClass,'stream_incomplete');}finally{Date.now=realNow;}
  console.log(JSON.stringify({plane,abandonedRunRecovery:'passed',authorizedStream:'passed',durableMessageAndUsage:'passed',duplicateReplay:'passed',changedDuplicate:'denied',oversizedContext:'denied',permission:'denied',cancellation:'passed',providerFailure:'passed',providerCalls:calls,rollback:true}));
  throw rollback;
 });}catch(error){if(error!==rollback)throw error;}finally{await db.destroy();}
}
