import assert from "node:assert/strict";
import {writeFileSync} from "node:fs";
import {chromium} from "@playwright/test";
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({ignoreHTTPSErrors:true,storageState:"tests/e2e/.auth/dev/neon/catl.admin.json",viewport:{width:1600,height:1200}});
const page=await context.newPage();
const receipt:any={checkedAt:new Date().toISOString(),mode:"live_draft_only",steps:[],operationalRecordsCreated:0};
const report="governance/policy/reports/business-partner-save-draft-live.dev.json";
async function save(method:"POST"|"PATCH"){
 const responsePromise=page.waitForResponse(r=>new URL(r.url()).pathname.match(/\/business-partner-cases(?:\/[^/]+)?$/)!==null&&r.request().method()===method,{timeout:20000});
 await page.getByRole("button",{name:"Save draft",exact:true}).click();
 const response=await responsePromise;const body=await response.json();
 receipt.steps.push({method,status:response.status(),caseId:body.request?.id,version:body.request?.rowVersion,...(!response.ok()?{problem:body}:{})});
 writeFileSync(report,JSON.stringify(receipt,null,2)+"\n");
 assert.ok(response.ok(),`Save returned ${response.status()}: ${body.code??body.error??body.detail??body.title}`);
 await page.getByRole("status").filter({hasText:"Draft saved"}).waitFor();
 return body;
}
try{
 const existingId=process.env.SAVE_DRAFT_REQUEST_ID;
 if(existingId&&!/^[0-9a-f-]{36}$/.test(existingId))throw Error("Invalid saved request ID");
 const name=page.locator('input[name="name"]');
 let first:any;
 if(existingId){
  await page.goto(`https://neon.dev.athyper.test/mdg/business-partner/requests/${existingId}/edit`,{waitUntil:"domcontentloaded"});
  await name.waitFor();first={request:{id:existingId}};
 }else{
  await page.goto("https://neon.dev.athyper.test/mdg/business-partner/new",{waitUntil:"domcontentloaded"});
  await page.getByRole("radio",{name:/Supplier/}).check({timeout:20000});
  await page.getByRole("button",{name:"Onboard new supplier",exact:true}).click();
  await name.waitFor();
  first=await save("POST");
  assert.ok(!first.request.proposedPayload.name,"Missing name must not become a generated request number");
 }
 receipt.requestId=first.request.id;
 const label="DEV Save draft verification 2026-09-13";
 await name.fill(label);const second=await save("PATCH");
 receipt.requestNo=second.request.requestNo;first.request.requestNo=second.request.requestNo;assert.equal(second.request.id,first.request.id);assert.equal(second.request.proposedPayload.name,label);
 await page.goto(`https://neon.dev.athyper.test/mdg/business-partner/requests/${first.request.id}/edit`,{waitUntil:"domcontentloaded"});
 await name.waitFor();assert.equal(await name.inputValue(),label);
 await name.fill("");const third=await save("PATCH");assert.ok(!third.request.proposedPayload.name);
 await name.fill(label);await save("PATCH");
 receipt.passed=true;receipt.reopened=true;receipt.clearedField=true;
 writeFileSync(report,JSON.stringify(receipt,null,2)+"\n");
 console.log(JSON.stringify({passed:true,requestId:first.request.id,requestNo:first.request.requestNo,steps:receipt.steps.length}));
}finally{await context.close();await browser.close()}
