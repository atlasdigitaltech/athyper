/** BP-AI-02: actual DEV browser, BFF, owner services and pinned local model.
 * Requires an existing authenticated storage state. Never changes grants or business records.
 * Raw evidence stays in a private directory outside the repository.
 */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync,chmodSync,realpathSync} from 'node:fs';
import {resolve,relative,join} from 'node:path';
import {homedir} from 'node:os';
import {validateReadStream} from './bp-ai-authenticated-evidence.mjs';
const {chromium}=createRequire(import.meta.url)('@playwright/test');
const origin=process.env.PLAYWRIGHT_NEON_BASE_URL??'https://neon.dev.athyper.test';
const storageState=process.env.ATLAS_TEST_STORAGE_STATE;assert.ok(storageState,'ATLAS_TEST_STORAGE_STATE is required');
const out=resolve(process.env.ATLAS_TOOL_RECEIPT_DIR??join(homedir(),'.athyper/instances/dev/receipts/bp-ai-02',new Date().toISOString().replace(/[:.]/g,'-')));
mkdirSync(out,{recursive:true,mode:0o700});chmodSync(out,0o700);
const within=relative(realpathSync(process.cwd()),realpathSync(out));assert.ok(within.startsWith('..'),'Private receipts must be outside the repository');
const save=(name,value)=>writeFileSync(join(out,name),JSON.stringify(value,null,2)+'\n',{mode:0o600});
const summary={schema:'atlas-business-context-qualification/1',capturedAt:new Date().toISOString(),origin,status:'running',checks:[]};
const record=(name,evidence={})=>{summary.checks.push({name,...evidence});save('summary.json',summary);console.log(`PASS ${name}`);};
const browser=await chromium.launch({env:{...process.env,...(process.env.ATLAS_PLAYWRIGHT_LIBS?{LD_LIBRARY_PATH:process.env.ATLAS_PLAYWRIGHT_LIBS}:{})}});
const context=await browser.newContext({storageState,ignoreHTTPSErrors:origin==='https://neon.dev.athyper.test',viewport:{width:1440,height:1000}});
const page=await context.newPage();page.setDefaultTimeout(20000);
const pageErrors=[],failedResponses=[];page.on('pageerror',error=>pageErrors.push(error.message));
page.on('response',response=>{if(response.status()>=400)failedResponses.push({status:response.status(),path:new URL(response.url()).pathname});});
const envelopes=text=>text.split(/\r?\n\r?\n/).flatMap(frame=>{const data=frame.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');return data?[JSON.parse(data)]:[];});
const dock=()=>page.locator('[aria-label="Atlas AI workspace"]');
async function openAtlas(){if(!await dock().isVisible())await page.getByRole('button',{name:'Atlas',exact:true}).click();await dock().waitFor();const pin=dock().getByRole('button',{name:'Pin Atlas to the right side',exact:true});if(await pin.isVisible())await pin.click();}
async function ask(name,prompt,expectedKind){
  // Allow responsive layout and lazy record sections to settle before capturing a run.
  // Human-paced turns also respect the deployed 100-request/minute API limit.
  await openAtlas();await page.waitForTimeout(4000);const started=Date.now();
  const pending=page.waitForResponse(r=>r.url().endsWith('/runs')&&r.request().method()==='POST',{timeout:120000});
  await dock().locator('[contenteditable="true"]').fill(prompt);await dock().getByRole('button',{name:'Send message',exact:true}).click();
  const response=await pending;const body=response.request().postDataJSON(),text=await response.text();save(`${name}-run.json`,{status:response.status(),body,text});
  assert.equal(response.status(),200,`${name}: HTTP ${response.status()}`);
  assert.equal(body.businessContext?.kind,expectedKind,`${name}: page context missing`);
  const events=envelopes(text);assert.ok(events.length,`${name}: empty stream`);
  assert.ok(events.every(e=>e.contextGenerationId===body.businessContext.generationId),`${name}: mismatched generation`);
  assert.equal(events.at(-1).event.type,'run.completed',`${name}: incomplete run`);
  assert.ok(!events.some(e=>e.event.type==='run.failed'));
  await dock().locator('[data-role="assistant"][data-status="completed"]').last().waitFor({timeout:120000});
  record(name,{kind:expectedKind,totalMs:Date.now()-started,generationMatched:true});
  return {body,text,events,url:response.url(),page:body.businessContext};
}
async function post(path,body){return page.evaluate(async({path,body})=>{const csrf=document.cookie.split(';').map(s=>s.trim()).find(s=>/^(?:__Host-)?athyper-csrf=/.test(s))?.split('=').slice(1).join('=');const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf??'','idempotency-key':crypto.randomUUID()},body:JSON.stringify(body)});return{status:r.status,text:await r.text()};},{path,body});}
try{
  const csrf=(await context.cookies(origin)).find(c=>/^(?:__Host-)?athyper-csrf$/.test(c.name))?.value;
  const refreshed=await context.request.post(origin+'/api/auth/refresh',{headers:{origin,'x-csrf-token':csrf??''}});assert.equal(refreshed.status(),200,'Existing session refresh');record('session-refreshed');
  const session=await context.request.get(origin+'/api/auth/session');assert.equal(session.status(),200);assert.equal((await session.json()).state,'authenticated');record('authenticated-session');
  await page.goto(origin+'/mdg/business-partner/manage');await page.locator('tbody a').first().waitFor();
  const links=await page.locator('tbody a').evaluateAll(items=>[...new Set(items.map(a=>a.getAttribute('href')))].filter(Boolean));assert.ok(links.length>=2,'Two permitted partner fixtures are required');
  const recordPath=links[0],otherPath=links[1],recordId=recordPath.split('/').at(-1),firstCode=await page.locator('tbody a').first().innerText();
  const initial=await ask('manage-filtered-set','Reply with one short acknowledgement. Do not invoke tools.','manage');assert.equal(initial.page.analysisTarget,'filtered_set');assert.ok(initial.page.visibleIds.length);assert.ok(initial.page.fields.length);assert.equal(initial.page.entityCode,'business_partner');
  await page.locator('tbody input[type="checkbox"]').first().check();
  const selected=await ask('manage-selection','Reply with one short acknowledgement. Do not invoke tools.','manage');assert.equal(selected.page.analysisTarget,'selection');assert.deepEqual(selected.page.selectedIds,[recordId]);assert.notEqual(selected.page.generationId,initial.page.generationId);
  await dock().getByRole('button',{name:'Close Atlas',exact:true}).click();await openAtlas();
  const reopened=await ask('dock-reopen','Reply with one short acknowledgement. Do not invoke tools.','manage');assert.equal(reopened.page.generationId,selected.page.generationId);
  await page.getByRole('button',{name:'Next',exact:true}).click();await page.waitForFunction(id=>!Array.from(document.querySelectorAll('tbody a')).some(a=>a.getAttribute('href')?.endsWith(id)),recordId);
  const next=await ask('manage-cursor','Reply with one short acknowledgement. Do not invoke tools.','manage');assert.ok(next.page.cursor);assert.ok(next.page.pageIndex>0);assert.notEqual(next.page.generationId,selected.page.generationId);
  await page.locator('#entity-list-search').fill(firstCode);await page.locator('#entity-list-search').press('Enter');await page.locator(`tbody a[href="${recordPath}"]`).first().waitFor();
  const searched=await ask('manage-applied-search','Reply with one short acknowledgement. Do not invoke tools.','manage');assert.equal(searched.page.search,firstCode);assert.ok(searched.page.visibleIds.includes(recordId));assert.equal(searched.page.pageIndex,0);
  await page.goto(origin+recordPath);await page.locator('[data-bp360-role-lens]').waitFor();
  const detail=await ask('record-grounded-read','Give a short summary of this business partner using bp_read_summary. Use the current page record ID.','record');assert.equal(detail.page.recordId,recordId);assert.equal(detail.page.dirty,false);assert.ok(detail.page.savedRevision);const citation=validateReadStream(detail.text,recordId);record('record-citation',{citationCount:citation.citationCount,revisionKind:citation.revisionKind});
  await page.getByRole('tablist',{name:'Record views'}).getByRole('tab').nth(1).click();
  const section=await ask('record-panel-section','Reply with one short acknowledgement. Do not invoke tools.','record');assert.equal(section.page.recordId,recordId);assert.notEqual(section.page.section,detail.page.section);
  await dock().getByRole('link',{name:'Open Atlas in full screen',exact:true}).click();await page.waitForURL(url=>url.pathname==='/atlas');await dock().locator('[data-role="assistant"][data-status="completed"]').last().waitFor();
  const full=await ask('fullscreen-context','Reply with one short acknowledgement. Do not invoke tools.','record');assert.deepEqual(full.page,section.page);
  assert.equal(new URL(full.url).pathname,new URL(section.url).pathname);record('fullscreen-thread-restored');
  // Real API rejects each forged request before generation; no mock endpoints.
  for(const [name,patch,status] of [
    ['forged-tenant',{tenantId:crypto.randomUUID()},400],
    ['forged-record',{recordId:crypto.randomUUID()},403],
    ['forged-company',{workContext:{companyCodeId:crypto.randomUUID()}},403],
  ]){
    const denied=await post(new URL(full.url).pathname,{...full.body,clientRequestId:crypto.randomUUID(),businessContext:{...full.page,...patch}});save(`${name}.json`,denied);assert.equal(denied.status,status);assert.ok(!denied.text.includes('run.started'));record(name,{status});
  }
  const mixed=await post(new URL(full.url).pathname,{...full.body,clientRequestId:crypto.randomUUID(),businessContext:{...selected.page,selectedIds:[recordId,crypto.randomUUID()]}});assert.equal(mixed.status,403);record('mixed-selection-rejected',{status:mixed.status});
  const historicalDate=new Date().toISOString().slice(0,10);
  await page.goto(origin+recordPath+'?asOf='+historicalDate);await page.locator('[data-bp360-historical="true"]').waitFor();
  const historical=await ask('historical-context','State that this is a historical context. Do not read current data.','record');assert.equal(historical.page.asOf,historicalDate+'T00:00:00.000Z');assert.ok(!historical.events.some(e=>e.event.type==='tool.previewed'));
  await page.goto(origin+recordPath+'?roleLens=supplier');await page.locator('[data-bp360-role-lens="supplier"]').waitFor();
  const role=await ask('role-context','Reply with one short acknowledgement. Do not invoke tools.','record');assert.equal(role.page.roleLens,'supplier');
  // Begin a real long stream, then navigate while it is active.
  const request=page.waitForRequest(r=>r.url().endsWith('/runs')&&r.method()==='POST');await dock().locator('[contenteditable="true"]').fill('Write a detailed numbered list of 100 general steps for organizing fictional office supplies. Do not invoke tools.');await dock().getByRole('button',{name:'Send message',exact:true}).click();const oldRequest=await request;
  await page.goto(origin+otherPath);await page.locator('[data-bp360-role-lens]').waitFor();await openAtlas();assert.equal(await dock().locator('[data-role="assistant"]').count(),0);
  const other=await ask('record-switch','Reply with one short acknowledgement. Do not invoke tools.','record');assert.notEqual(other.page.recordId,recordId);assert.notEqual(other.page.generationId,oldRequest.postDataJSON().businessContext.generationId);assert.equal(await dock().locator('[data-role="user"]').count(),1);record('active-stream-navigation-isolation');
  await page.goto(origin+'/mdg/business-partner/manage');await page.locator('tbody a').first().waitFor();
  const returned=await ask('return-to-manage','Reply with one short acknowledgement. Do not invoke tools.','manage');assert.equal(returned.page.kind,'manage');assert.ok(!('recordId' in returned.page));
  assert.deepEqual(pageErrors,[],'Browser errors');record('no-browser-errors');
  await page.screenshot({path:join(out,'manage-complete.png'),fullPage:true});await context.storageState({path:join(out,'neon-state.json')});chmodSync(join(out,'neon-state.json'),0o600);
  summary.status='passed';summary.completedAt=new Date().toISOString();save('summary.json',summary);
}catch(error){summary.status='failed';summary.error=error.message;summary.pageErrors=pageErrors;save('failed-responses.json',failedResponses);save('summary.json',summary);await page.screenshot({path:join(out,'failure.png'),fullPage:true}).catch(()=>{});console.error('Qualification failed:',error.message);process.exitCode=1;}finally{await browser.close();}
