import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const source=JSON.parse(readFileSync('governance/policy/reports/task-rules-journeys-live.dev.json','utf8'));
const report:any={at:new Date().toISOString(),passed:false,checks:[],boundary:'Real deployed NEON browser reads of fresh approved cases and pinned documents; underlying votes and PDF hashes are recorded in task-rules-journeys-live.dev.json.'};
const browser=await chromium.launch();
try{
 const context=await browser.newContext({baseURL:'https://neon.dev.athyper.test',ignoreHTTPSErrors:true,storageState:'tests/e2e/.auth/dev/neon/catl.owner.json'});
 const page=await context.newPage();mkdirSync('governance/policy/reports/task-rules-browser.dev',{recursive:true});
 for(const c of source.cases){
  await page.goto(`/mdg/business-partner/requests/${c.id}`);await page.locator('#main-content').waitFor();
  const v=await page.evaluate(async id=>{const r=await fetch(`/api/relay/governance/process-tasks/cases/${id}/view`);return {status:r.status,body:await r.json()};},c.id);
  assert.equal(v.status,200);assert.equal(v.body.coordinate.attemptId,c.process.attemptId);
  await page.getByText(/DEV R1 qualification/).first().waitFor();
  const download=page.waitForResponse(r=>r.url().includes('/process-documents/jobs/')&&r.url().endsWith('/download'));
  await page.getByRole('button',{name:'Download submitted review pack',exact:true}).click();assert.equal((await download).status(),200);
  await page.screenshot({path:`governance/policy/reports/task-rules-browser.dev/${c.level}.png`,fullPage:true});
  report.checks.push({profile:c.level,caseId:c.id,attemptId:c.process.attemptId,browserTaskView:200,browserDownloadCommand:200});
 }
 report.passed=true;await context.close();
}catch(error){report.error=String(error);throw error;}finally{await browser.close();writeFileSync('governance/policy/reports/task-rules-browser-live.dev.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
