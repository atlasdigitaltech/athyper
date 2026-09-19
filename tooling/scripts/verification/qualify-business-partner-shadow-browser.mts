/** Real BFF sign-in and read-only BP browser/API evidence. Never fabricates a session. */
import { chromium, expect } from "@playwright/test";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const { authenticateBrowser } = createRequire(import.meta.url)("../../../tests/e2e/authenticate-browser.ts");
const [recordId, output] = process.argv.slice(2);
if (!recordId || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(recordId) || !output) throw new Error("Usage: qualify-business-partner-shadow-browser.mts <BP UUID> <output.json>");
const origin = process.env.PLAYWRIGHT_NEON_BASE_URL ?? "https://neon.dev.athyper.test";
const statePath = process.env.PLAYWRIGHT_NEON_STATE_PATH ?? "tests/e2e/.auth/neon.json";
const hash = (s:string) => createHash("sha256").update(s).digest("hex");
const evidence:{[key:string]:unknown}={schemaVersion:1,generatedAt:new Date().toISOString(),evidence:"authenticated_browser_and_bff",authenticated:false,readJourneyQualified:false,canAttestDeployment:false,grantChanges:[],recordRef:hash(recordId),checks:[]};
const checks=evidence.checks as {surface:string;status?:number;passed:boolean;requestRef?:string}[];
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
try {
 browser=await chromium.launch();
 const context=await browser.newContext({baseURL:origin,ignoreHTTPSErrors:true,...(existsSync(statePath)?{storageState:statePath}:{})});
 const page=await context.newPage();
 let session=await (await context.request.get("/api/auth/session")).json();
 if(session.state!=="authenticated") {
  const username=process.env.PLAYWRIGHT_NEON_USER??process.env.PLAYWRIGHT_USER,password=process.env.PLAYWRIGHT_NEON_PASSWORD??process.env.PLAYWRIGHT_PASSWORD;
  if(username&&password) await authenticateBrowser(page,{origin,username,password,tenantName:process.env.PLAYWRIGHT_NEON_TENANT_NAME});
  else {await page.goto("/api/auth/login?returnTo=%2Fhome");await page.waitForLoadState("networkidle");}
  session=await (await context.request.get("/api/auth/session")).json();
 }
 if(session.state!=="authenticated"||!session.tenantId||!session.principalId) {
  evidence.blocker="normal_sign_in_required";process.exitCode=2;
 } else {
  evidence.authenticated=true;evidence.principalRef=hash(session.tenantId+":"+session.principalId);
  mkdirSync(dirname(statePath),{recursive:true});await context.storageState({path:statePath});
  const inspect=(value:unknown):boolean=>{
   if(!value||typeof value!=="object")return true;
   return Object.entries(value).every(([key,child])=>!["protectedValueToken","old_values","new_values","proposed_payload"].includes(key)&&inspect(child));
  };
  const get=async(surface:string,path:string,expectedCode?:string)=>{
   const response=await context.request.get("/api/relay"+path);
   const body=await response.json();const safe=inspect(body);
   const expected = expectedCode ? response.status()===409 && body.code===expectedCode : response.ok();
   checks.push({surface,status:response.status(),passed:expected&&safe,...(response.headers()["x-request-id"]?{requestRef:hash(response.headers()["x-request-id"]!)}:{})});
   if(!expected||!safe)throw new Error("READ_CHECK_FAILED");return body;
  };
  await get("application","/entity-runtime/business_partner/application-descriptor");
  await get("list_descriptor","/entity-runtime/business_partner/list-descriptor");
  await get("list","/entity-runtime/business_partner/list?limit=10");
  await get("record","/entity-runtime/business_partner/records/"+recordId);
  const summary=await get("summary","/neon/business-partners/"+recordId+"/360/summary");
  const sections=new Set(["overview","identity","contacts","addresses","identifiers-tax","governance","roles-scope","supplier-company","customer-company","banking","qualifications-certificates","credit","network","requests","activity","comments","attachments","business-activity","person","workforce"]);
  for(const section of summary.sections??[]) {
   if(!sections.has(section.code))throw new Error("UNKNOWN_SECTION");
   if(section.authorization!=="granted")continue;
   if(section.code==="overview") { checks.push({surface:"section:overview:summary",status:200,passed:true});continue; }
   const aliases:Record<string,string>={"identifiers-tax":"identifiers","roles-scope":"roles","supplier-company":"company-configuration?roleLens=supplier","customer-company":"company-configuration?roleLens=customer","qualifications-certificates":"qualifications"};
   await get("section:"+section.code,"/neon/business-partners/"+recordId+"/360/"+(aliases[section.code]??section.code),section.reasonCode === "BP_360_SCOPE_REQUIRED" ? "BP_360_SCOPE_REQUIRED" : undefined);
  }
  await page.goto("/mdg/business-partner/"+recordId);
  await expect(page.locator('[data-bp360-ready="true"]')).toBeVisible({timeout:30000});
  checks.push({surface:"record_ui",passed:true});
  const checkActions=async(surface:string,header:{actions:{href?:string;disabledReason?:unknown}[];readOnly?:boolean})=>{
   const expected=header.readOnly?[]:header.actions.filter(a=>a.href&&!a.disabledReason).map(a=>a.href!).sort();
   await expect(page.locator('[data-slot="record-header"]').first()).toBeVisible();
   const actual=await page.locator('[data-slot="record-header"]').first().locator('a.a-button').evaluateAll(nodes=>nodes.map(n=>n.getAttribute("href")!).sort());
   expect(actual).toEqual(expected);checks.push({surface,passed:true});
  };
  await checkActions("unscoped_ui_actions_match_legacy",summary.recordHeader);
  for(const code of ["identity","contacts","addresses"]) {
   if(!(summary.sections??[]).some((s:{code:string;authorization:string})=>s.code===code&&s.authorization==="granted"))continue;
   await page.getByRole("navigation",{name:"360 sections"}).getByRole("button",{name:new RegExp("^"+code,"i")}).click();
   await expect(page.locator('[data-bp360-ready="true"]')).toHaveAttribute("data-bp360-section",code,{timeout:30000});
   checks.push({surface:"ui_section:"+code,passed:true});
  }
  const work=await get("authorized_companies","/neon/work-contexts");
  const organizations=await get("authorized_organizations","/neon/operating-organizations");
  if(work.companies?.length!==1 || organizations.organizations?.length!==1) throw new Error("QUALIFICATION_SCOPE_SELECTION_REQUIRED");
  const scoped=new URLSearchParams({companyCodeId:work.companies[0].companyCodeId,operatingOrganizationId:organizations.organizations[0].id,roleLens:"supplier"});
  const scopedSummary=await get("scoped_summary","/neon/business-partners/"+recordId+"/360/summary?"+scoped);
  for(const section of ["company-configuration","business-activity","network"]) {
   if(section==="network" && process.env.QUALIFICATION_EXPECT_DENIED_NETWORK==="1") {
    if(scopedSummary.sections.some((s:{code:string;authorization:string})=>s.code==="network"&&s.authorization==="granted"))throw Error("NETWORK_DENIAL_PERSONA_CHANGED");
    const response=await context.request.get("/api/relay/neon/business-partners/"+recordId+"/360/network?"+scoped);
    const body=await response.json();const passed=response.status()===403&&body.code==="BP_360_SECTION_FORBIDDEN"&&inspect(body);
    checks.push({surface:"denied_scoped_section:network",status:response.status(),passed,...(response.headers()["x-request-id"]?{requestRef:hash(response.headers()["x-request-id"]!)}:{})});
    if(!passed)throw Error("NETWORK_DENIAL_CHANGED");
   } else await get("scoped_section:"+section,"/neon/business-partners/"+recordId+"/360/"+section+"?"+scoped);
  }
  await page.goto("/mdg/business-partner/"+recordId+"?"+scoped);
  await expect(page.locator('[data-bp360-ready="true"]')).toBeVisible({timeout:30000});
  await checkActions("scoped_ui_actions_match_legacy",scopedSummary.recordHeader);
  for(const [tab,section] of [["roles","roles-scope"],["requests","requests"],["transactions","business-activity"],["activity","activity"]]) {
   if(tab==="activity" && process.env.QUALIFICATION_EXPECT_DENIED_ACTIVITY==="1") {
    if(scopedSummary.sections.some((s:{code:string;authorization:string})=>s.code===section&&s.authorization==="granted"))throw Error("ACTIVITY_DENIAL_PERSONA_CHANGED");
    await deny("denied_scoped_section:activity","/neon/business-partners/"+recordId+"/360/activity?"+scoped,403,"BP_360_SECTION_FORBIDDEN");
    await page.getByRole("tab",{name:"Activity",exact:true}).click();
    await expect(page.getByText("This section is not available under the current authorization policy.",{exact:true})).toBeVisible();
    checks.push({surface:"denied_ui_tab:activity",passed:true});continue;
   }
   if(!scopedSummary.sections.some((s:{code:string;authorization:string})=>s.code===section&&s.authorization==="granted")) throw new Error("TAB_FIXTURE_UNAVAILABLE");
   const labels:Record<string,string>={roles:"Roles & scope",requests:"Requests",transactions:"Business Transactions",activity:"Activity"};
   await page.getByRole("tab",{name:labels[tab!],exact:true}).click();
   await expect(page.locator('[data-bp360-ready="true"]')).toHaveAttribute("data-bp360-section",section!,{timeout:30000});
   checks.push({surface:"scoped_ui_tab:"+tab,passed:true});
  }
  async function deny(surface:string,path:string,status:number,code:string){
   const response=await context.request.get("/api/relay"+path);const body=await response.json();
   const passed=response.status()===status&&body.code===code&&inspect(body);
   checks.push({surface,status:response.status(),passed,...(response.headers()["x-request-id"]?{requestRef:hash(response.headers()["x-request-id"]!)}:{})});if(!passed)throw new Error("DENIAL_CHECK_FAILED");
  };
  for(const section of ["comments","attachments"]) {
   if(summary.sections.some((s:{code:string;authorization:string})=>s.code===section&&s.authorization==="granted"))throw new Error("DENIAL_PERSONA_CHANGED");
   await deny("denied_section:"+section,"/neon/business-partners/"+recordId+"/360/"+section,403,"BP_360_SECTION_FORBIDDEN");
  }
  await deny("invalid_company_closed","/neon/business-partners/"+recordId+"/360/summary?companyCodeId=00000000-0000-4000-8000-000000000001",400,"BP_360_SCOPE_INVALID");
  await deny("missing_record_closed","/neon/business-partners/00000000-0000-4000-8000-000000000002/360/summary",404,"BP_360_NOT_FOUND");
  const anonymous=await browser.newContext({baseURL:origin,ignoreHTTPSErrors:true});
  const anonymousResponse=await anonymous.request.get("/api/relay/neon/business-partners/"+recordId+"/360/summary");
  checks.push({surface:"anonymous_closed",status:anonymousResponse.status(),passed:anonymousResponse.status()===401});
  if(anonymousResponse.status()!==401)throw new Error("ANONYMOUS_ACCESS_CHANGED");await anonymous.close();
  evidence.authenticatedPrincipalCount=1;
  evidence.scopeCases=["partner_wide","authorized_organization_company","missing_company","invalid_company","missing_record","denied_sections","anonymous"];
  evidence.readJourneyQualified=true;
  evidence.remaining=["Distinct steward/requester/approver personas, same-phase commands and independent-ownership qualification remain enforcement/generalization gates. Shadow deployment and grant equality must be attested separately."];
 }
} catch {
 evidence.blocker="qualification_failed";process.exitCode=1;
} finally {
 await browser?.close();mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(evidence,null,2)+"\n");
 console.log(JSON.stringify({output,authenticated:evidence.authenticated,readJourneyQualified:evidence.readJourneyQualified,blocker:evidence.blocker,checks:checks.length}));
}
