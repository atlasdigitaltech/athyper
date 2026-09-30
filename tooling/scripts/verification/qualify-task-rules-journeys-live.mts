import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { request, chromium } from "@playwright/test";
const origin = "https://neon.dev.athyper.test",
  endpoint = "/api/relay/neon/business-partner-cases";
const client = await request.newContext({
  baseURL: origin,
  storageState: "tests/e2e/.auth/dev/neon/catl.admin.json",
  ignoreHTTPSErrors: true,
});
const reviewer = await request.newContext({
  baseURL: origin,
  storageState: "tests/e2e/.auth/dev/neon/catl.owner.json",
  ignoreHTTPSErrors: true,
});
const report: any = { at: new Date().toISOString(), passed:false, cases:[], checks:[], boundary:"Fresh cases through deployed NEON owning APIs and real rendering/storage/scanning; existing published manifests. New task-rule controls are not claimed until their live release is published." };
const save=()=>writeFileSync("governance/policy/reports/task-rules-journeys-live.dev.json",JSON.stringify(report,null,2)+"\n");
async function call(
  actor: any,
  path: string,
  data?: any,
  method = "POST",
  expected = 200,
) {
  const csrf = (await actor.storageState()).cookies.find((c: any) =>
    /^(__Host-)?athyper-csrf$/.test(c.name),
  );
  assert.ok(csrf);
  const r = await actor.fetch(path, {
    method,
    headers: {
      origin,
      "x-csrf-token": decodeURIComponent(csrf.value),
      ...(method !== "GET"
        ? { "Idempotency-Key": data?.idempotencyKey ?? randomUUID() }
        : {}),
    },
    ...(data ? { data } : {}),
  });
  const body = await r.json();
  assert.ok(
    r.status() === expected ||
      (expected === 201 &&
        path.endsWith("/submit") &&
        r.status() === 200 &&
        body.replayed === true),
    JSON.stringify({ path, status: r.status(), expected, body }),
  );
  return body;
}
const post = (path: string, data: any) =>
  call(
    client,
    path,
    data,
    "POST",
    path === endpoint ||
      path.endsWith("/submit") ||
      path.endsWith("/materialize")
      ? 201
      : 200,
  );
const get = (id: string) => call(client, `${endpoint}/${id}`, undefined, "GET");
const view = (id: string) =>
  call(
    reviewer,
    `/api/relay/governance/process-tasks/cases/${id}/view`,
    undefined,
    "GET",
  );
async function vote(id: string, action?: string) {
  const v = await view(id),
    i = v.executions.find(
      (e: any) =>
        e.stage_status === "active" &&
        ["open", "claimed"].includes(e.work_item_status),
    );
  assert.ok(i, JSON.stringify(v));
  const command = {
    attemptId: v.coordinate.attemptId,
    cycleTaskId: i.cycle_task_id,
    workflowRequestId: i.workflow_request_id,
    workflowStageId: i.workflow_stage_id,
    workItemId: i.work_item_id,
    expectedWorkItemVersion: Number(i.work_item_version),
    idempotencyKey: randomUUID(),
    action: action ?? i.action,
    reason: "P7 qualification decision",
  };
  const receipt = await call(
    reviewer,
    `/api/relay/governance/process-tasks/cases/${id}/decide`,
    command,
  );
  return { command, receipt };
}
async function pack(p: any) {
  const r = await post(
    `/api/relay/governance/process-documents/jobs/${p.reviewPackJobId}/process`,
    {},
  );
  assert.equal(r.status, "ready", JSON.stringify(r));
  assert.equal(r.gateStatus, "succeeded", JSON.stringify(r));
  return r;
}
async function submit(id: string, concurrent = false) {
  const c = await get(id),
    v = await post(`${endpoint}/${id}/validate`, {
      expectedVersion: c.request.rowVersion,
      idempotencyKey: randomUUID(),
    });
  assert.equal(v.validation.valid, true, JSON.stringify(v.validation));
  const command = {
    expectedVersion: v.request.rowVersion,
    idempotencyKey: randomUUID(),
  };
  if (!concurrent) return post(`${endpoint}/${id}/submit`, command);
  const [a, b] = await Promise.all([
    post(`${endpoint}/${id}/submit`, command),
    post(`${endpoint}/${id}/submit`, command),
  ]);
  assert.deepEqual(a.process, b.process);
  assert.equal(Number(a.replayed) + Number(b.replayed), 1);
  return a;
}
async function create(level: string) {
  const key = randomUUID(),
    contactKey = randomUUID();
  const created = await post(endpoint, {
    idempotencyKey: key,
    draftCapture: true,
    kind: "new_partner",
    source: { kind: "manual" },
    requestedRole: "supplier",
    operatingOrganizationId: "a478f9c0-8226-5d22-9599-b8fb27a45180",
    companyCodeId: "793b6cb3-3c61-57c0-9562-2cbc288bd4cf",
    proposedPayload: {
      partnerCategory: "organization",
      registrationCountryCode: "MY",
      name: `DEV R1 qualification ${level} ${key}`,
      ownershipClass: "external",
      supplierType: "general",
      qualificationTypeCode: "compliance",
      requestedComplianceLevel: level === "rollback" ? "standard" : level,
      complianceRequirementReason: "Local Increment A qualification",
      tenantFields: { profileMode: "standard" },
    },
    extensions: {
      addresses: [
        {
          clientItemKey: randomUUID(),
          definitionFieldCode: "address.primary",
          purpose: "default",
          addressKind: "street",
          regionEntryMode: "directory",
          line1: "10 Qualification Street",
          city: "Kuala Lumpur",
          postalCode: "50000",
          countryCode: "MY",
          normalizedHash: createHash("sha256")
            .update("10 qualification street||kuala lumpur||50000|my")
            .digest("hex"),
          isPrimary: true,
        },
      ],
      contactPersons: [
        {
          clientItemKey: contactKey,
          definitionFieldCode: "contact.primary",
          contactName: "Qualification contact",
          isPrimary: true,
        },
      ],
      contactChannels: [
        {
          clientItemKey: randomUUID(),
          definitionFieldCode: "contact.channel.email",
          contactClientItemKey: contactKey,
          channelType: "email",
          value: `p2-${key}@example.invalid`,
          purpose: "default",
          isPrimary: true,
        },
      ],
    },
  });
  return created.request.id;
}

async function verifyPdf(actor:any,jobId:string,result:any){
 const link=await call(actor,`/api/relay/governance/process-documents/jobs/${jobId}/download`,{});
 const r=await actor.get(link.url);assert.equal(r.status(),200);const bytes=await r.body();assert.equal(bytes.subarray(0,5).toString(),"%PDF-");assert.equal(createHash("sha256").update(bytes).digest("hex"),result.sha256);
 return {jobId,attachmentVersionId:result.attachmentVersionId,sha256:result.sha256,bytes:bytes.length};
}
try{
 for(const level of ["basic","standard","enhanced"]){
  const id=await create(level),fixture:any={level,id};report.cases.push(fixture);save();
  const submitted=await submit(id,true);fixture.process=submitted.process;save();
  const rendered=await pack(submitted.process);fixture.reviewPack=await verifyPdf(reviewer,submitted.process.reviewPackJobId,rendered.result);save();
  let votes=0;
  for(let step=0;step<20;step++){
   const current=await view(id);const active=current.executions.find((e:any)=>e.stage_status==="active"&&["open","claimed"].includes(e.work_item_status));if(!active)break;
   const result=await vote(id);votes++;fixture.votes= votes;fixture.lastDecision=result.receipt;save();
  }
  const current=await get(id);assert.equal(current.request.caseStatus,"approved");assert.ok(votes>0);fixture.approved=true;
  const requested=await post(`/api/relay/governance/process-documents/cases/${id}/request`,{purpose:"decision_document"});
  const decision=await post(`/api/relay/governance/process-documents/jobs/${requested.jobId}/process`,{});assert.equal(decision.status,"ready");fixture.decisionDocument=await verifyPdf(client,requested.jobId,decision.result);save();
  report.checks.push(`${level}: replay-safe submission, real review pack, ${votes} task votes, approved outcome and verified decision PDF`);save();
 }
 report.passed=true;
}catch(error){report.error=String(error);throw error;}
finally{save();await client.dispose();await reviewer.dispose();console.log(JSON.stringify(report,null,2));}
