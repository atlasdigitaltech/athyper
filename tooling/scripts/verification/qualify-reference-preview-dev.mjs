/** Read-only qualification of the shared reference detail/preview experience. */
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {X509Certificate,createHash} from 'node:crypto';
const [baselineFile,outArg]=process.argv.slice(2);assert.ok(baselineFile&&outArg,'Supply baseline browser report and private output directory');
const out=resolve(outArg);mkdirSync(out,{recursive:true,mode:0o700});
assert.ok(process.env.NODE_EXTRA_CA_CERTS,'Trusted DEV CA required');
const spki=createHash('sha256').update(new X509Certificate(readFileSync(process.env.NODE_EXTRA_CA_CERTS)).publicKey.export({type:'spki',format:'der'})).digest('base64');
const browser=await chromium.launch({args:[`--ignore-certificate-errors-spki-list=${spki}`]});
const context=await browser.newContext({storageState:'tests/e2e/.auth/dev/neon/catl.admin.json',viewport:{width:1440,height:1000}});
const page=await context.newPage();const origin='https://neon.dev.athyper.test';const report={passed:false,entities:[],preview:false,newTab:false,mobile:false,errors:[]};
page.on('pageerror',error=>report.errors.push(error.message));
try {
 assert.equal((await (await context.request.get(origin+'/api/auth/session')).json()).state,'authenticated');
 for(const {entity,recordId} of JSON.parse(readFileSync(baselineFile,'utf8')).entities){
   await page.goto(`${origin}/app/entity/${entity}/${recordId}`);
   await page.getByRole('tab',{name:'Overview',exact:true}).waitFor();
   assert.equal(await page.getByRole('combobox',{name:'Record sections'}).count(),0);
   const heading=await page.locator('[data-detail-section="overview"] h2').textContent();
   report.entities.push({entity,recordId,heading});
   await page.screenshot({animations:'disabled',path:join(out,`${entity}.png`)});
 }
 const sourcePath='/app/entity/state_region/01a0d433-80a8-77d5-bdd1-f0f0c497003a';
 const targetPath='/app/entity/country/01a0d433-8079-7f29-aae5-f9f5386e4e6f';
 await page.goto(origin+sourcePath);
 const link=page.getByRole('link',{name:'Preview Malaysia',exact:true});await link.waitFor();assert.equal(await link.getAttribute('href'),targetPath);
 const childReady=context.waitForEvent('page');await link.click({modifiers:['Control']});const child=await childReady;await child.waitForLoadState();await child.getByRole('heading',{name:'Malaysia',exact:true}).first().waitFor();report.newTab=true;await child.close();
 await link.click();const panel=page.locator('.a-entity-reference-preview');await panel.getByRole('heading',{name:'Malaysia',exact:true}).waitFor();assert.ok(page.url().includes(sourcePath));await panel.locator('.a-badge').filter({hasText:'Active'}).waitFor();
 const pin=panel.getByRole('button',{name:'Pin panel to the side'});if(await pin.count())await pin.click();await panel.getByRole('button',{name:'Unpin panel'}).waitFor();await page.screenshot({animations:'disabled',path:join(out,'country-preview-pinned.png')});await panel.getByRole('button',{name:'Unpin panel'}).click();
 await panel.getByRole('link',{name:'Open record',exact:true}).click();await page.waitForURL('**'+targetPath+'*');await page.getByRole('heading',{name:'Malaysia',exact:true}).first().waitFor();report.preview=true;
 await page.setViewportSize({width:390,height:850});await page.goto(origin+sourcePath);await page.getByRole('link',{name:'Preview Malaysia',exact:true}).click();await panel.getByRole('heading',{name:'Malaysia',exact:true}).waitFor();assert.equal(await panel.getAttribute('role'),'dialog');assert.ok(Math.round((await panel.boundingBox()).width)<=390);await page.screenshot({animations:'disabled',path:join(out,'country-preview-mobile.png')});await panel.getByRole('button',{name:'Close reference preview',exact:true}).click();report.mobile=true;
 assert.deepEqual(report.errors,[]);report.passed=true;
}finally{if(!report.passed)await page.screenshot({animations:'disabled',path:join(out,'failure.png')}).catch(()=>{});writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));await browser.close();}
