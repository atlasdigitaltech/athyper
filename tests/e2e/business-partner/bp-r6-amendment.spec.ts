import {expect, type Page} from "@playwright/test";
import {test} from "./bp-v1-009.fixture";

test("BP-R6-006 retains field decisions through independent approval and amendment",async({bpActors},testInfo)=>{
  const {requesterPage,approverPage,materializerPage,config}=bpActors;
  const snapshotId=coordinate("PLAYWRIGHT_BP_R6_CHANGE_SNAPSHOT_ID"),businessPartnerId=coordinate("PLAYWRIGHT_BP_R6_CHANGE_PARTNER_ID");
  const before=await aggregate(requesterPage,businessPartnerId,config.operatingOrganizationId);
  await requesterPage.goto("/mdg/business-partner/mesh-proposals");
  await requesterPage.getByLabel("Verified disclosure").selectOption(snapshotId);
  await requesterPage.getByLabel("Existing Business Partner ID (optional)").fill(businessPartnerId);
  const previewResponse=requesterPage.waitForResponse(response=>response.request().method()==="POST"&&new URL(response.url()).pathname==="/api/relay/neon/business-partner-profile-change-previews");
  await requesterPage.getByRole("button",{name:"Compare profile changes",exact:true}).click();
  const response=await previewResponse;expect(response.ok()).toBe(true);const preview=await response.json();
  const legalName=preview.fields.find((field:{path:string})=>field.path==="partner.legalName");
  expect(legalName.incoming).toBeTruthy();expect(legalName.incoming).not.toBe(legalName.current);
  for(const field of preview.fields)await requesterPage.getByLabel(`Decision for ${field.path.replace("partner.","")}`).selectOption(field.path==="partner.legalName"?"source":"local");
  const resolutionResponse=requesterPage.waitForResponse(result=>result.request().method()==="POST"&&new URL(result.url()).pathname==="/api/relay/neon/business-partner-profile-change-resolutions");
  await requesterPage.getByRole("button",{name:"Create governed amendment",exact:true}).click();
  const created=await resolutionResponse;expect(created.ok()).toBe(true);const resolution=await created.json();
  await expect(requesterPage).toHaveURL(new RegExp(`/mdg/business-partner/requests/${resolution.requestId}$`));
  await requesterPage.getByRole("button",{name:"Validate",exact:true}).click();
  await requesterPage.getByRole("button",{name:"Submit for approval",exact:true}).click();
  await expect(requesterPage.getByText("Pending Approval",{exact:true})).toBeVisible();
  await approverPage.goto(`/mdg/business-partner/requests/${resolution.requestId}`);
  await expect(approverPage.getByRole("heading",{name:"Retained profile field decisions"})).toBeVisible();
  await approverPage.getByRole("button",{name:"Approve",exact:true}).click();
  const dialog=approverPage.getByRole("dialog",{name:"Approve request"});
  await dialog.getByLabel("Reason").fill("R6 independent review of retained profile choices");
  await dialog.getByRole("button",{name:"Confirm approval"}).click();
  await expect(approverPage.getByText("Approved",{exact:true})).toBeVisible();
  await materializerPage.goto(`/mdg/business-partner/requests/${resolution.requestId}`);
  await materializerPage.getByRole("button",{name:"Apply amendment",exact:true}).click();
  await expect(materializerPage.getByText("Applied",{exact:true})).toBeVisible();
  const after=await aggregate(requesterPage,businessPartnerId,config.operatingOrganizationId);
  expect(after.businessPartner.id).toBe(before.businessPartner.id);
  expect(after.businessPartner.code).toBe(before.businessPartner.code);
  expect(after.businessPartner.status).toBe(before.businessPartner.status);
  expect(after.businessPartner.legalName).toBe(legalName.incoming);
  expect(roles(after)).toEqual(roles(before));
  await testInfo.attach("bp-r6-amendment.json",{body:JSON.stringify({schema:"athyper.business-partner-r6-amendment-target/1",snapshotId,businessPartnerId,resolutionId:resolution.resolutionId,caseId:resolution.requestId,comparisonFingerprint:preview.fingerprint,identityPreserved:true,rolesPreserved:true,selectedFieldApplied:true},null,2),contentType:"application/json"});
});
function coordinate(name:string){const value=process.env[name]?.trim();if(!value||! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw new Error(`Mandatory R6 amendment fixture is missing/invalid: ${name}`);return value;}
async function aggregate(page:Page,id:string,org:string){const response=await page.request.get(`/api/relay/neon/business-partners/${id}?operatingOrganizationId=${encodeURIComponent(org)}`);expect(response.ok()).toBe(true);return response.json();}
function roles(value:{suppliers:Record<string,unknown>[];customers:Record<string,unknown>[]}){return{supplier:value.suppliers.map(row=>({id:row.id,status:row.status})).sort((a,b)=>String(a.id).localeCompare(String(b.id))),customer:value.customers.map(row=>({id:row.id,status:row.status})).sort((a,b)=>String(a.id).localeCompare(String(b.id)))};}
