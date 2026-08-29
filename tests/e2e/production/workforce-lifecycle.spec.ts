import { expect, test } from "@playwright/test";
import { productionContext } from "./fixtures";

test.beforeEach(async ({},testInfo)=>{
  test.skip(productionContext(testInfo).plane!=="neon","Workforce lifecycle belongs to NEON");
  test.skip(!productionContext(testInfo).enabled,"Production matrix credentials or stored session are required");
});

test("new-hire and returned/rejected request surfaces expose the governed lifecycle",async({page})=>{
  await page.goto("/app/business_partner/person/new");
  await expect(page.getByRole("heading",{name:"New workforce person onboarding"})).toBeVisible();
  await expect(page.getByLabel("Legal entity ID")).toBeVisible();
  await expect(page.getByLabel("Employee number")).toBeVisible();
  await expect(page.getByRole("button",{name:"Create person request"})).toBeVisible();

  for(const [environment,status] of [["PLAYWRIGHT_WORKFORCE_RETURNED_REQUEST_ID","returned"],["PLAYWRIGHT_WORKFORCE_REJECTED_REQUEST_ID","rejected"]] as const){
    const requestId=process.env[environment];
    if(!requestId)continue;
    await page.goto(`/app/business_partner/requests/${encodeURIComponent(requestId)}`);
    await expect(page.getByText(status,{exact:true})).toBeVisible();
    if(status==="returned")await expect(page.getByRole("link",{name:/edit draft fields/i})).toBeVisible();
  }
});

test("applied hire exposes onboarding, readiness, effective job change, and separated offboarding evidence",async({page})=>{
  const employeeId=process.env.PLAYWRIGHT_WORKFORCE_EMPLOYEE_ID;
  test.skip(!employeeId,"requires a seeded PLAYWRIGHT_WORKFORCE_EMPLOYEE_ID");
  await page.goto("/app/business_partner/requests");
  const result=await page.evaluate(async id=>{
    const [detail,readiness,checklist]=await Promise.all([
      fetch(`/api/neon/workforce/${id}`),fetch(`/api/neon/workforce/${id}/readiness`),fetch(`/api/neon/workforce/${id}/onboarding-checklist`),
    ]);
    return{statuses:[detail.status,readiness.status,checklist.status],detail:await detail.json() as Record<string,unknown>,readiness:await readiness.json() as Record<string,unknown>,checklist:await checklist.json() as Record<string,unknown>};
  },employeeId);
  expect(result.statuses).toEqual([200,200,200]);
  expect(result.detail).toMatchObject({employeeId,personId:expect.any(String),businessPartnerId:expect.any(String),employment:{id:expect.any(String)},assignment:{id:expect.any(String)},onboarding:{id:expect.any(String)}});
  expect(result.readiness).toMatchObject({eligible:expect.any(Boolean),reasons:expect.any(Array),evidenceVersion:expect.any(Number)});
  expect(result.checklist).toMatchObject({checklist:expect.any(Array)});
  if(result.detail.offboarding)expect(result.detail.offboarding).toMatchObject({employmentTerminationRecorded:true,resourceChecklistCompleted:expect.any(Boolean),accessDeprovisionStatus:expect.stringMatching(/pending|requested|completed|failed/)});

  const changeRequestId=process.env.PLAYWRIGHT_WORKFORCE_CHANGE_REQUEST_ID;
  if(changeRequestId){await page.goto(`/app/business_partner/requests/${encodeURIComponent(changeRequestId)}`);await expect(page.getByText(/change employment/i).first()).toBeVisible();}
});
