import assert from "node:assert/strict";
import {writeFileSync} from "node:fs";
import {chromium} from "@playwright/test";
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({ignoreHTTPSErrors:true,storageState:"tests/e2e/.auth/dev/neon/catl.admin.json",viewport:{width:1600,height:1200}});
const page=await context.newPage();const errors:string[]=[];let draft:any;
page.on("pageerror",error=>errors.push(error.message));
await page.route("**/*",async route=>{const path=new URL(route.request().url()).pathname;if(!["GET","HEAD"].includes(route.request().method())&&!path.startsWith("/api/auth/")){if(path.endsWith("/business-partner-cases"))draft=route.request().postDataJSON();await route.abort()}else await route.continue()});
try{
 await page.goto("https://neon.dev.athyper.test/mdg/business-partner/new",{waitUntil:"domcontentloaded"});
 await page.getByRole("radio",{name:/Supplier/}).check({timeout:15000});
 await page.getByRole("button",{name:"Onboard new supplier",exact:true}).click();
 await page.locator('input[name="name"]').waitFor();
 const banks=page.locator("details").filter({has:page.locator("summary",{hasText:"Bank accounts"})});
 await banks.locator("summary").click();
 await banks.getByRole("button",{name:"Add bank account",exact:true}).click();
 await banks.getByLabel("Account holder name",{exact:true}).fill("Capture probe");
 await banks.getByRole("button",{name:"Add document",exact:true}).click();
 assert.equal(await banks.locator('input[type="file"]').count(),1);
 assert.equal(await banks.getByRole("combobox",{name:"Account currency",exact:true}).count(),1);
 await page.getByLabel("Profile view",{exact:true}).selectOption("full");
 for(const title of ["Business registration identifiers","Tax registrations","Commodity and industry classifications","Governance and ownership","Certifications"]){
 const section=page.locator("details").filter({has:page.locator("summary",{hasText:title})});
 await section.locator("summary").click();
 await section.getByRole("button",{name:/^Add /}).first().click();
 assert.equal(await section.getByRole("button",{name:"Add document",exact:true}).count(),1);
 // Remove the incomplete test entry after confirming its document control.
 await section.getByRole("button",{name:/^Remove /}).first().click();
 }
 await page.getByRole("button",{name:"Save draft",exact:true}).click();
 await page.waitForTimeout(1500);
 assert.ok(draft,"Draft request should reach intercepted transport");
 assert.equal(draft.draftCapture,true);
 assert.equal(draft.extensions.bankAccounts.length,1);
 assert.equal(draft.extensions.supportingDocuments.length,1);
 assert.equal(draft.extensions.supportingDocuments[0].entryKey,draft.extensions.bankAccounts[0].clientItemKey);
 assert.ok(!("accountIdentifier" in draft.extensions.bankAccounts[0]));
 assert.deepEqual(errors,[]);
 writeFileSync("governance/policy/reports/business-partner-request-capture-browser.dev.json",JSON.stringify({checkedAt:new Date().toISOString(),passed:true,sections:6,draftCapture:true,stableDocumentAssociation:true,liveCasesCreated:0,mutationsBlocked:true},null,2)+"\n");
 console.log("Request capture browser checks passed; no live cases created.");
}finally{await context.close();await browser.close()}
