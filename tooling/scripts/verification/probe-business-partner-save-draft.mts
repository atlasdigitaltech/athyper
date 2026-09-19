import assert from "node:assert/strict";
import {writeFileSync} from "node:fs";
import {chromium} from "@playwright/test";
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({ignoreHTTPSErrors:true,storageState:"tests/e2e/.auth/dev/neon/catl.admin.json",viewport:{width:1600,height:1200}});
const page=await context.newPage();
const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
const commands:{method:string;body:any;key:string|undefined}[]=[];
const id="a0000000-0000-4000-8000-000000000041";
let version=0,payload:any={},definition:any;
await page.route("**/*",async route=>{
 const request=route.request(),path=new URL(request.url()).pathname;
 if(!["GET","HEAD"].includes(request.method())&&!path.startsWith("/api/auth/")){
  if(/\/business-partner-cases(?:\/[^/]+)?$/.test(path)){
   const body=request.postDataJSON();commands.push({method:request.method(),body,key:request.headers()["idempotency-key"]});
   if(commands.length===1){await route.abort("failed");return}
   definition??=body.expectedForm;
   payload={...payload,...body.proposedPayload,relationshipProposals:body.extensions};
   const now=new Date().toISOString();version++;
   await route.fulfill({json:{case:{schema:"athyper.governed-case-view/1",id,kind:"new_partner",status:"draft",rowVersion:version,definition:{id:definition.releaseId,version:definition.version,contentHash:definition.hash},subject:{type:"master.business_partner",displayName:"Save draft probe"},ownership:{requesterId:id},progress:{completed:0,required:1,blockers:0},sections:[],allowedActions:[],evidenceSummary:{active:0,scanning:0,quarantined:0,missing:0},timestamps:{createdAt:now,updatedAt:now}},request:{id,requestNo:"BP.SAVE.PROBE",kind:"new_partner",source:{kind:"manual"},requestedRole:"supplier",operatingOrganizationId:body.operatingOrganizationId,proposedPayload:payload,status:"draft",rowVersion:version,createdAt:now,updatedAt:now}}});return;
  }
  await route.abort();return;
 }
 await route.continue();
});
try {
 await page.goto("https://neon.dev.athyper.test/mdg/business-partner/new",{waitUntil:"domcontentloaded"});
 await page.getByRole("radio",{name:/Supplier/}).check({timeout:20000});
 await page.getByRole("button",{name:"Onboard new supplier",exact:true}).click();
 const name=page.locator('input[name="name"]');await name.waitFor();
 const save=()=>page.getByRole("button",{name:"Save draft",exact:true});
 await save().click();
 await page.getByText("The save outcome is unknown. Retry saving before making further changes.",{exact:true}).waitFor();
 assert.equal(await name.isDisabled(),true);
 await save().click();
 await page.getByRole("status").filter({hasText:"Draft saved · BP.SAVE.PROBE"}).waitFor();
 assert.deepEqual(commands[0],commands[1],"Transport retry must preserve the exact create command and key");
 assert.ok(page.url().endsWith(`/requests/${id}/edit`),"Saving replaces the URL with the draft edit route");
 await page.getByRole("heading",{name:"Edit business partner request",exact:true}).waitFor();
 assert.equal(await page.getByRole("heading",{level:1}).count(),1);
 assert.equal(await page.getByRole("button",{name:"New request",exact:true}).count(),0);
 await page.getByRole("link",{name:"Close",exact:true}).waitFor();
 assert.equal(await name.isDisabled(),false);
 await name.fill("Saved second version");await save().click();
 await page.getByRole("status").filter({hasText:"Draft saved · BP.SAVE.PROBE"}).waitFor();
 assert.equal(commands[2].method,"PATCH");assert.equal(commands[2].body.expectedVersion,1);
 assert.equal(commands[2].body.proposedPayload.name,"Saved second version");
 await name.fill("");await save().click();
 await page.getByRole("status").filter({hasText:"Draft saved · BP.SAVE.PROBE"}).waitFor();
 assert.equal(commands[3].body.expectedVersion,2);assert.equal(commands[3].body.proposedPayload.name,null);
 await page.getByRole("button",{name:"Continue to review",exact:true}).click();
 await page.locator(".a-validation-summary").filter({hasText:"Registered name is required"}).waitFor();
 assert.equal(commands.length,4,"Review validation must not submit an incomplete draft");
 await save().click();
 await page.getByRole("status").filter({hasText:"Draft saved · BP.SAVE.PROBE"}).waitFor();
 assert.equal(await page.locator(".a-validation-summary").count(),0,"Draft save clears submission-only missing-field errors");
 assert.ok(commands.every(c=>c.body.draftCapture===true));assert.deepEqual(errors,[]);
 writeFileSync("governance/policy/reports/business-partner-save-draft-browser.dev.json",JSON.stringify({checkedAt:new Date().toISOString(),passed:true,transport:"intercepted",retrySameCommand:true,saveStaysOnForm:true,subsequentSavesPatch:true,clearedFields:true,liveCasesCreated:0},null,2)+"\n");
 console.log("Save draft browser checks passed (intercepted transport; zero live cases).");
} finally {await context.close();await browser.close()}
