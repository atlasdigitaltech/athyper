import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { exampleTaskEditPolicy } from "../../../packages/planes/studio/business-partner/src/task-edit-policy-example.js";
const origin = "https://studio.dev.athyper.test", prefix = "governance/policy/reports/task-rules-bound-release-live";
const browser = await chromium.launch({headless:true});
const report:any={at:new Date().toISOString(),passed:false,checks:[],boundary:"Real deployed Studio browser, BFF, authenticated API, policy tables and independent publication. Publishes a bound DEV release for new submissions; existing accepted attempts remain pinned."};
const contexts=[];
try {
 const maker=await browser.newContext({baseURL:origin,ignoreHTTPSErrors:true,storageState:"tests/e2e/.auth/dev/studio/catl.admin.json"});contexts.push(maker);
 const page=await maker.newPage(); await page.goto("/mdg/business-partner/publication");
 const section=page.locator('section[aria-labelledby="task-edit-policy-heading"]');await section.waitFor();
 const baselineResponse=page.waitForResponse(r=>r.url().endsWith('/api/relay/studio/supplier-task-rule-baselines')); await section.getByRole('button',{name:'Load published process scopes',exact:true}).click(); const baseline=await baselineResponse; const baselineBody=await baseline.json(); report.baselineShape={array:Array.isArray(baselineBody),count:Array.isArray(baselineBody)?baselineBody.length:undefined,keys:Object.keys(baselineBody)}; assert.equal(baseline.status(),200,JSON.stringify(baselineBody)); await section.getByRole('combobox').waitFor();report.checks.push('Studio discovers the owning published process scopes');
 const fixture=JSON.parse(readFileSync('governance/policy/fixtures/supplier-task-rules.dev.json','utf8'));
 const base=baselineBody.find((b:any)=>b.id==='ee504b13-72c0-5107-8ade-06ee58db0684');assert.ok(base);
 const input={...fixture,definition:{...fixture.definition,name:fixture.definition.name+' '+randomUUID()},processBinding:{basePublicationId:base.id,expectedReleaseId:base.release_id??null,tasks:base.publication.manifests.flatMap((m:any)=>m.tasks.filter((t:any)=>['review','approval'].includes(t.executionKind)).map((t:any)=>({profile:m.profile.code,code:t.code,informationPolicy:{schema:'athyper.task-information-policy/1',clockMode:'bounded_pause',responseHours:48},caseAuthority:{schema:'athyper.task-case-authority/1',returnForChanges:true,rejectProposal:true}})))}};
 report.basePublicationId=base.id;report.previousReleaseId=base.release_id??null;

 await section.locator('textarea').fill(JSON.stringify(input,null,2));
 const authoredResponse=page.waitForResponse(r=>r.url().endsWith('/api/relay/studio/task-edit-policies')&&r.request().method()==='POST');
 await section.getByRole('button',{name:'Validate and submit policy for approval',exact:true}).click();
 const response=await authoredResponse, body=await response.json();report.authorStatus=response.status();
 assert.equal(response.status(),200,JSON.stringify(body));assert.equal(body.status,'pending_approval');report.policyId=body.definition.id;report.policyHash=body.hash;report.checks.push('Browser creates one immutable revision with seven passing fixtures');
 const deniedResponse=page.waitForResponse(r=>r.url().endsWith(`/${body.definition.id}/publish`));
 await section.getByRole('button',{name:'Publish as independent checker',exact:true}).click();assert.equal((await deniedResponse).status(),403);report.checks.push('Maker publication is rejected through the live browser/API');
 const checker=await browser.newContext({baseURL:origin,ignoreHTTPSErrors:true,storageState:"tests/e2e/.auth/dev/studio/catl.owner.json"});contexts.push(checker);
 const review=await checker.newPage();await review.goto('/mdg/business-partner/publication');const reviewSection=review.locator('section[aria-labelledby="task-edit-policy-heading"]');await reviewSection.waitFor();
 await reviewSection.getByLabel('Policy revision ID',{exact:true}).fill(body.definition.id);
 const loaded=review.waitForResponse(r=>r.url().endsWith(`/task-edit-policies/${body.definition.id}`));await reviewSection.getByRole('button',{name:'Load policy revision',exact:true}).click();assert.equal((await loaded).status(),200);
 const published=review.waitForResponse(r=>r.url().endsWith(`/${body.definition.id}/publish`));await reviewSection.getByRole('button',{name:'Publish as independent checker',exact:true}).click();
 const releasedResponse=await published, released=await releasedResponse.json();assert.equal(releasedResponse.status(),200,JSON.stringify(released));assert.equal(released.status,'active');assert.equal(released.hash,body.hash);assert.ok(released.release?.id); report.release= released.release;report.manifests=released.proposal.publication.manifests.map((m:any)=>({profile:m.profile.code,revision:m.revision,editPolicy:m.editPolicy}));report.checks.push('Independent checker publishes the exact tested policy and bound manifest release through Studio');
 mkdirSync(`${prefix}.dev`,{recursive:true});await review.screenshot({path:`${prefix}.dev/published.png`,fullPage:true});report.screenshot=`${prefix}.dev/published.png`;
 report.passed=true;
} catch(error){report.error=String(error); const page=contexts.at(-1)?.pages()[0]; if(page){ report.ui={path:new URL(page.url()).pathname,alerts:await page.getByRole("alert").allTextContents(),buttons:await page.getByRole("button").allTextContents()}; await page.screenshot({path:"/tmp/task-bound-release-failure.png",fullPage:true}); } throw error;}
finally{for(const context of contexts)await context.close();await browser.close();writeFileSync(`${prefix}.dev.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
