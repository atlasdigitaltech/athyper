/** Real browser/relay acceptance. Requires MFA-authenticated storage state for each plane.
 * No mocked responses, token minting, permission changes, or direct database calls.
 * Run: node tooling/scripts/verification/verify-atlas-browser-acceptance.mjs studio
 * Repeat with --recover after controlled service restarts. Artifacts are private local receipts.
 */
import {createRequire} from 'node:module';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('@playwright/test');
const plane=process.argv[2];assert.ok(['studio','neon','mesh'].includes(plane),'Specify studio, neon or mesh');
const origin=`https://${plane}.dev.athyper.test`,out=join(homedir(),'.athyper/instances/dev/receipts/atlas-browser-acceptance',plane);
mkdirSync(out,{recursive:true,mode:0o700});
const browser=await chromium.launch(),context=await browser.newContext({ignoreHTTPSErrors:true,storageState:`tests/e2e/.auth/${plane}${process.argv.includes('--cross-tenant')?'-athyper':process.argv.includes('--non-owner')?'-owner':''}.json`,viewport:{width:1440,height:1000}}),page=await context.newPage();
const resultFile=join(out,process.argv.includes('--non-owner')?'non-owner-results.json':process.argv.includes('--cross-tenant')?'cross-tenant-results.json':process.argv.includes('--pagination')?'pagination-results.json':process.argv.includes('--recover')?'recovery-results.json':process.argv.includes('--isolation')?'isolation-results.json':process.argv.includes('--unavailable')?'unavailable-results.json':process.argv.includes('--quota')?'quota-results.json':'results.json');
const results=[];const record=(name,evidence)=>{results.push({name,evidence,at:new Date().toISOString()});writeFileSync(resultFile,JSON.stringify(results,null,2)+'\n',{mode:0o600});console.log(plane,name,JSON.stringify(Object.fromEntries(Object.entries(evidence).filter(([key])=>!['body','visibleFeedback'].includes(key)))));};
async function api(path,method='GET',body,headers={}){
 return page.evaluate(async({path,method,body,headers})=>{
  const csrf=document.cookie.split(';').map(s=>s.trim()).find(s=>/^(?:__Host-)?athyper-csrf=/.test(s))?.split('=').slice(1).join('=');
  const response=await fetch('/api/relay/atlas'+path,{method,headers:{...(body?{'content-type':'application/json','x-csrf-token':csrf??'','idempotency-key':crypto.randomUUID()}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
  const text=await response.text();let json;try{json=JSON.parse(text);}catch{}return{status:response.status,json,text};
 },{path,method,body,headers});
}
async function messages(id){const r=await api(`/threads/${id}/messages`);assert.equal(r.status,200,r.text);return r.json.items;}
try{
 await page.goto(origin+'/atlas');
 const session=await page.evaluate(async()=>{const r=await fetch('/api/auth/session');return r.json();});assert.equal(session.state,'authenticated','Fresh authenticated session is required');
 record('authenticated',{state:session.state});
 if(process.argv.includes('--non-owner')){
  assert.equal(session.tenantId,'44444444-4444-4444-8444-444444444444');
  const fixture=JSON.parse(readFileSync(join(out,'fixture.json'),'utf8'));
  const admission=await api('/admission');assert.equal(admission.status,200);
  const read=await api(`/threads/${fixture.threadId}/messages`);assert.ok([403,404].includes(read.status),read.text);assert.ok(!read.text.includes(fixture.prompt));
  const edit=await api(`/threads/${fixture.threadId}`,'PATCH',{title:'Forbidden same-tenant edit',expectedRowVersion:1});assert.ok([403,404].includes(edit.status),edit.text);
  const deniedRun=await api(`/threads/${fixture.threadId}/runs`,'POST',{clientRequestId:crypto.randomUUID(),publicModelId:'atlas-re-1.0-local',dataClass:'internal',catalogPolicyRevision:admission.json.policyRevision,userText:'Unauthorized request must not generate'});assert.ok([403,404].includes(deniedRun.status),deniedRun.text);
  record('sameTenantUnauthorizedUser',{account:'catl.owner',admitted:admission.json.chatAllowed,read:read.status,edit:edit.status,run:deniedRun.status});
 }else if(process.argv.includes('--cross-tenant')){
  assert.notEqual(session.tenantId,'44444444-4444-4444-8444-444444444444');
  const own=await api('/threads','POST',{title:'Acceptance ATHYPER isolation control'});assert.equal(own.status,201,own.text);assert.equal((await api(`/threads/${own.json.threadId}/messages`)).status,200);
  const fixture=JSON.parse(readFileSync(join(out,'fixture.json'),'utf8'));
  for(const headers of [{},{'x-tenant-id':'44444444-4444-4444-8444-444444444444','x-plane-key':plane}]){const denied=await api(`/threads/${fixture.threadId}/messages`,'GET',undefined,headers);assert.equal(denied.status,404,denied.text);assert.ok(!denied.text.includes(fixture.prompt));record('crossTenantAndOtherUser',{status:denied.status,spoofedHeaders:Object.keys(headers).length>0});}
  const deniedEdit=await api(`/threads/${fixture.threadId}`,'PATCH',{title:'Forbidden cross-tenant edit',expectedRowVersion:1});assert.ok([403,404].includes(deniedEdit.status),deniedEdit.text);record('crossTenantWrite',{status:deniedEdit.status});
  const archive=await api(`/threads/${own.json.threadId}/archive`,'POST',{expectedRowVersion:own.json.rowVersion});assert.equal(archive.status,200,archive.text);
 }else if(process.argv.includes('--pagination')){const first=await api('/threads?status=all&limit=1');assert.equal(first.status,200);assert.ok(first.json.nextCursor);const second=await api('/threads?status=all&limit=1&cursor='+encodeURIComponent(first.json.nextCursor));assert.equal(second.status,200);assert.equal(second.json.items.length,1);assert.notEqual(first.json.items[0].threadId,second.json.items[0].threadId);record('pagination',{first:1,second:1});
 }else if(process.argv.includes('--isolation')){
  for(const other of ['neon','mesh','studio'].filter(p=>p!==plane)){
   const fixture=JSON.parse(readFileSync(join(out,'..',other,'fixture.json'),'utf8'));
   for(const suffix of ['/messages']){const denied=await api(`/threads/${fixture.threadId}${suffix}`);assert.ok([403,404].includes(denied.status),denied.text);record('crossPlane',{source:other,target:plane,resource:suffix||'thread',status:denied.status});}
  }
 }else if(process.argv.includes('--unavailable')||process.argv.includes('--quota')){
  const expected=process.argv.includes('--quota')?'QUOTA_EXCEEDED':'PROVIDER_UNAVAILABLE';
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:900});if(width<600&&await page.getByRole('button',{name:'Conversation history',exact:true}).getAttribute('aria-pressed')==='true')await page.getByRole('button',{name:'Conversation history',exact:true}).click();await page.getByRole('button',{name:'New Atlas conversation',exact:true}).click();
   const responsePromise=page.waitForResponse(r=>r.url().endsWith('/runs')&&r.request().method()==='POST');
   await page.locator('[contenteditable="true"]').first().fill('Acceptance controlled failure: What is 2+2?');await page.getByRole('button',{name:'Send message',exact:true}).click();
   const response=await responsePromise;const text=await response.text();assert.ok(text.includes(expected)||(!process.argv.includes('--quota')&&text.includes('run.failed')),text);
   await page.getByRole('button',{name:'Send message',exact:true}).waitFor({timeout:120000});
   if(process.argv.includes('--quota'))assert.ok(await page.getByText('Atlas usage limit reached. Wait for the quota to reset or contact your administrator.',{exact:true}).isVisible(),'Quota guidance must explain the limit');
   assert.ok(await page.locator('[data-role="assistant"][data-status="failed"]').isVisible(),'Failure feedback must be visible');
   await page.screenshot({path:join(out,`${expected}-${width}.png`),fullPage:true});record(expected,{width,status:response.status(),body:text.slice(0,2000),visibleFeedback:(await page.locator('body').innerText()).slice(-2500)});
  }
 }else if(process.argv.includes('--recover')){
  const fixture=JSON.parse(readFileSync(join(out,'fixture.json'),'utf8'));const rows=await messages(fixture.threadId);assert.deepEqual(rows.map(r=>r.messageId),fixture.messageIds);
  const history=await api('/threads?status=all&limit=50');assert.equal(history.status,200);assert.ok(history.json.items.some(t=>t.threadId===fixture.threadId));record('restartPersistence',{threadId:fixture.threadId,messageCount:rows.length,status:200});
 }else{
  const history=await api('/threads?limit=50');assert.equal(history.status,200,history.text);record('initialHistory',{status:200,count:history.json.items.length});
  const prompt=`Browser acceptance ${plane} ${Date.now()}: What is 2+2? Answer with just the number.`;
  const streamRequestPromise=page.waitForRequest(r=>r.url().endsWith('/runs')&&r.method()==='POST');
  const createdPromise=page.waitForResponse(r=>r.url().endsWith('/api/relay/atlas/threads')&&r.request().method()==='POST');
  await page.locator('[contenteditable="true"]').first().fill(prompt);await page.getByRole('button',{name:'Send message',exact:true}).click();
  const createdResponse=await createdPromise;assert.equal(createdResponse.status(),201);const thread=await createdResponse.json();
  await page.locator('[data-role="assistant"][data-status="completed"]').first().waitFor({timeout:120000});
  const submitted=await streamRequestPromise;const submittedBody=submitted.postDataJSON();
  let rows=await messages(thread.threadId);assert.equal(rows.length,2);assert.ok(rows.every(r=>r.status==='completed'));assert.equal(rows.find(r=>r.role==='assistant').content.filter(b=>b.type==='text').map(b=>b.text).join('').trim(),'4');
  writeFileSync(join(out,'fixture.json'),JSON.stringify({threadId:thread.threadId,messageIds:rows.map(r=>r.messageId),prompt},null,2),{mode:0o600});
  await page.screenshot({path:join(out,'desktop-completed.png'),fullPage:true});record('desktopGeneration',{threadId:thread.threadId,messageCount:2});
  await page.reload();await page.getByRole('button').filter({hasText:prompt}).click();await page.locator('[data-role="assistant"][data-status="completed"]').first().waitFor();assert.equal(await page.locator('[data-role="user"]').count(),1);record('reloadRecovery',{messageCount:2});
  const latest=(await api('/threads?status=all&limit=100')).json.items.find(t=>t.threadId===thread.threadId);
  const renamed=await api(`/threads/${thread.threadId}`,'PATCH',{title:`Acceptance ${plane} persisted`,expectedRowVersion:latest.rowVersion});assert.equal(renamed.status,200,renamed.text);
  const conflict=await api(`/threads/${thread.threadId}`,'PATCH',{title:'Stale edit must fail',expectedRowVersion:latest.rowVersion});assert.equal(conflict.status,409,conflict.text);record('renameAndConflict',{rename:200,staleVersion:409});
  const replay=await api(`/threads/${thread.threadId}/runs`,'POST',submittedBody);assert.equal(replay.status,200,replay.text);assert.ok(replay.text.includes('run.completed'));assert.deepEqual((await messages(thread.threadId)).map(r=>r.messageId),rows.map(r=>r.messageId));record('duplicateReplay',{status:200,messageCount:2});
  const altered=await api(`/threads/${thread.threadId}/runs`,'POST',{...submittedBody,userText:'Changed same-key payload'});assert.ok(altered.status===409||altered.text.includes('IDEMPOTENCY_CONFLICT'),altered.text);record('changedDuplicate',{status:altered.status,conflict:true});
  const page1=await api('/threads?limit=1');assert.equal(page1.status,200);assert.equal(page1.json.items.length,1);
  if(page1.json.nextCursor){const page2=await api('/threads?limit=1&cursor='+encodeURIComponent(page1.json.nextCursor));assert.equal(page2.status,200);assert.ok(page2.json.items.every(t=>t.threadId!==page1.json.items[0].threadId));record('pagination',{first:1,second:page2.json.items.length});}else record('pagination',{status:'insufficient_records'});
  await page.setViewportSize({width:390,height:844});if(await page.getByRole('button',{name:'Conversation history',exact:true}).getAttribute('aria-pressed')==='true')await page.getByRole('button',{name:'Conversation history',exact:true}).click();await page.screenshot({path:join(out,'mobile-recovered.png'),fullPage:true});
  record('mobileLayout',{horizontalOverflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
  await page.getByRole('button',{name:'New Atlas conversation',exact:true}).click();
  const cancelCreate=page.waitForResponse(r=>r.url().endsWith('/api/relay/atlas/threads')&&r.request().method()==='POST');
  await page.locator('[contenteditable="true"]').first().fill('Write a long numbered list of 100 detailed steps for organizing a fictional warehouse.');await page.getByRole('button',{name:'Send message',exact:true}).click();
  const cancelThread=await (await cancelCreate).json();
  await page.waitForFunction(()=>{const e=document.querySelector('[data-role="assistant"][data-status="pending"] p');return e&&e.textContent&&e.textContent!=='Working on it…';},{},{timeout:120000});
  await page.screenshot({path:join(out,'mobile-streaming.png'),fullPage:true});await page.getByRole('button',{name:'Stop generating',exact:true}).click();
  let canceledRows=[];for(let i=0;i<30;i++){canceledRows=await messages(cancelThread.threadId);if(canceledRows.some(r=>r.status==='cancelled'))break;await page.waitForTimeout(200);}
  assert.ok(canceledRows.some(r=>r.status==='cancelled'));await page.screenshot({path:join(out,'mobile-cancelled.png'),fullPage:true});record('mobileStreamingAndCancellation',{threadId:cancelThread.threadId,status:'cancelled'});
  const cancelLatest=(await api('/threads?status=all&limit=100')).json.items.find(t=>t.threadId===cancelThread.threadId);const cancelArchive=await api(`/threads/${cancelThread.threadId}/archive`,'POST',{expectedRowVersion:cancelLatest.rowVersion});assert.equal(cancelArchive.status,200,cancelArchive.text);
  const archived=await api(`/threads/${thread.threadId}/archive`,'POST',{expectedRowVersion:renamed.json.rowVersion});assert.equal(archived.status,200,archived.text);assert.equal(archived.json.status,'archived');record('archive',{status:200});
  const persisted=await api('/threads?status=archived&limit=50');assert.equal(persisted.status,200);assert.ok(persisted.json.items.some(t=>t.threadId===thread.threadId));record('persistedHistory',{status:200,fixturePresent:true});
 }
}catch(error){record('failure',{message:String(error)});await page.screenshot({path:join(out,'failure.png'),fullPage:true}).catch(()=>{});process.exitCode=1;}finally{await context.close();await browser.close();}
