// Requires fresh MFA-authenticated per-plane browser states. Uses only real browser requests.
import {createRequire} from 'node:module';import {writeFileSync} from 'node:fs';import {homedir} from 'node:os';import assert from 'node:assert/strict';
const {chromium}=createRequire(process.cwd()+'/package.json')('@playwright/test');
const browser=await chromium.launch();
for(const plane of (process.env.PLANES??'neon,mesh,studio').split(',')){
 const dir=homedir()+`/.athyper/instances/dev/receipts/atlas-browser-acceptance/${plane}`,context=await browser.newContext({ignoreHTTPSErrors:true,storageState:`tests/e2e/.auth/${plane}.json`,viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();
 await page.goto(`https://${plane}.dev.athyper.test/atlas`);
 const history=page.getByRole('button',{name:'Conversation history',exact:true});if(await history.getAttribute('aria-pressed')==='true')await history.click();
 const runPromise=page.waitForRequest(r=>r.url().endsWith('/runs')&&r.method()==='POST');
 await page.locator('[contenteditable="true"]').first().fill('Write a long fictional story of at least 1000 words about a cat exploring a garden. Begin the story immediately and keep writing.');await page.getByRole('button',{name:'Send message',exact:true}).click();
 await page.waitForFunction(()=>{const e=document.querySelector('[data-role="assistant"][data-status="pending"] p');return e&&e.textContent&&e.textContent!=='Working on it…';},{},{timeout:120000});await page.screenshot({path:dir+'/mobile-streaming-visible.png',fullPage:true});const request=await runPromise;const runBody=request.postDataJSON();const runPath=new URL(request.url()).pathname;
 const invoke=()=>page.evaluate(async({path,body})=>{const csrf=document.cookie.split(';').map(s=>s.trim()).find(s=>/^(?:__Host-)?athyper-csrf=/.test(s))?.split('=').slice(1).join('=');const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf,'idempotency-key':crypto.randomUUID()},body:JSON.stringify(body)});return{status:r.status,text:await r.text()};},{path:runPath,body:runBody});
 const activeDuplicate=await invoke();assert.equal(activeDuplicate.status,409,activeDuplicate.text);
 await page.getByRole('button',{name:'Stop generating',exact:true}).click();await page.getByText('Response stopped.',{exact:true}).waitFor();await page.screenshot({path:dir+'/mobile-cancelled-visible.png',fullPage:true});
 let replay;for(let i=0;i<20;i++){replay=await invoke();if(replay.status===200)break;await page.waitForTimeout(200);}assert.equal(replay.status,200,replay.text);assert.ok(replay.text.includes('run.cancelled'),replay.text);const persisted=await page.evaluate(async(path)=>{const r=await fetch(path.replace(/runs$/,'messages'));return r.json();},runPath);assert.equal(persisted.items.length,2);assert.ok(persisted.items.some(m=>m.status==='cancelled'));

 await page.getByRole('button',{name:'New Atlas conversation',exact:true}).click();const prompt=`Mobile recovery ${plane} ${Date.now()}: What is 2+2? Answer just the number.`;
 await page.locator('[contenteditable="true"]').first().fill(prompt);await page.getByRole('button',{name:'Send message',exact:true}).click();await page.locator('[data-role="assistant"][data-status="completed"]').waitFor({timeout:120000});await page.screenshot({path:dir+'/mobile-completed-visible.png',fullPage:true});
 await page.reload();await page.getByRole('button').filter({hasText:prompt}).click();if(await history.getAttribute('aria-pressed')==='true')await history.click();await page.locator('[data-role="assistant"][data-status="completed"]').waitFor();
 const roles=await page.locator('[data-role]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-role')));const body=await page.locator('[data-role="assistant"] p').innerText();assert.equal(body.trim(),'4');await page.screenshot({path:dir+'/mobile-reloaded-visible.png',fullPage:true});
 const result={plane,cancelledThreadId:runPath.split('/').at(-2),activeDuplicate:409,cancelledReplay:200,cancelledMessageCount:2,mobileStreaming:true,cancellationFeedback:true,completion:true,recoveredRoles:roles,chronological:roles.join(',')==='user,assistant',horizontalOverflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)};console.log(JSON.stringify(result));writeFileSync(dir+'/mobile-results.json',JSON.stringify(result,null,2)+'\n',{mode:0o600});assert.equal(result.chronological,true,'Recovered messages must be chronological');assert.equal(result.horizontalOverflow,false);await context.close();
}
await browser.close();
