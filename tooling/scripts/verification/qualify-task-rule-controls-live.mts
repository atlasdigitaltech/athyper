import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
const published=JSON.parse(readFileSync('governance/policy/reports/task-policy-authoring-live.dev.json','utf8'));
assert.equal(published.passed,true);
const browser=await chromium.launch();
try{
 const context=await browser.newContext({baseURL:'https://studio.dev.athyper.test',ignoreHTTPSErrors:true,storageState:'tests/e2e/.auth/dev/studio/catl.admin.json'});
 const page=await context.newPage();await page.goto('/mdg/business-partner/publication');
 const section=page.locator('section[aria-labelledby="task-edit-policy-heading"]');await section.waitFor();
 await section.getByLabel('Policy revision ID',{exact:true}).fill(published.policyId);
 const loading=page.waitForResponse(r=>r.url().endsWith(`/task-edit-policies/${published.policyId}`));await section.getByRole('button',{name:'Load policy revision',exact:true}).click();const loaded=await loading;assert.equal(loaded.status(),200);assert.equal((await loaded.json()).hash,published.policyHash);
 await section.getByRole('button',{name:'Load published process scopes',exact:true}).click();await section.getByLabel('Process scope',{exact:true}).selectOption({index:1});
 const controls=section.getByRole('group',{name:'Task information, decision authority and supervisor rules',exact:true});await controls.waitFor();
 assert.ok(await controls.getByRole('checkbox').count()>0);assert.ok(await controls.getByRole('combobox').count()>0);
 await page.screenshot({path:'governance/policy/reports/task-policy-authoring-live.dev/controls.png',fullPage:true});
 const result={at:new Date().toISOString(),passed:true,policyId:published.policyId,checks:['Final deployed Studio reads the independently published exact hash','Published scope populates task authority, information clock and supervisor draft controls'],boundary:'Browser reads existing publication and edits only the local draft; no new process release or business mutation'};
 writeFileSync('governance/policy/reports/task-rule-controls-live.dev.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));await context.close();
}finally{await browser.close();}
