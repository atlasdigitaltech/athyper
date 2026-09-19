import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {chromium} from "@playwright/test";
const fixture=JSON.parse(readFileSync("governance/policy/reports/supplier-onboarding-neon-actions.dev.json","utf8")).correction;
const browser=await chromium.launch({headless:true}),context=await browser.newContext({storageState:"tests/e2e/.auth/dev/neon/catl.owner.json",ignoreHTTPSErrors:true});
const report:any={at:new Date().toISOString(),caseId:fixture.id,attemptId:fixture.process.attemptId,jobId:fixture.process.reviewPackJobId,passed:false};
try{
 const page=await context.newPage();await page.goto(`https://neon.dev.athyper.test/mdg/business-partner/requests/${fixture.id}?attemptId=${report.attemptId}&documentJobId=${report.jobId}`);
 await page.getByRole("heading",{name:"This notice is no longer actionable"}).waitFor();await page.getByText("Linked document · ready",{exact:false}).waitFor();
 assert.equal(await page.locator("[data-document-job]").count(),1);assert.equal(await page.locator("[data-document-job]").getAttribute("data-document-job"),report.jobId);
 assert.equal(await page.getByRole("button",{name:/Approve assigned step|Accept review|Close proposal|Retry/}).count(),0);
 const response=page.waitForResponse(r=>r.url().endsWith(`/jobs/${report.jobId}/download`)&&r.request().method()==="POST");await page.getByRole("button",{name:"Download submitted review pack",exact:true}).click();assert.equal((await response).status(),200);
 report.screenshot="governance/policy/reports/p8-browser/historical-notice.png";await page.screenshot({path:report.screenshot,fullPage:true});report.onlyPinnedDocument=true;report.currentCommandsHidden=true;report.downloadAuthorized=true;report.passed=true;
}catch(error){report.error=error instanceof Error?error.message:String(error);throw error;}finally{writeFileSync("governance/policy/reports/supplier-onboarding-neon-history.dev.json",JSON.stringify(report,null,2)+"\n");await context.close();await browser.close();console.log(JSON.stringify(report));}
