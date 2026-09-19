import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
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
const report: any = process.argv.includes("--resume")
  ? JSON.parse(
      readFileSync(
        "governance/policy/reports/supplier-onboarding-materialization-live.dev.json",
        "utf8",
      ),
    )
  : { at: new Date().toISOString(), cases: [], checks: [] };
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
    path === endpoint || path.endsWith("/submit") || path.endsWith("/materialize") ? 201 : 200,
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
    reason: "P6 qualification decision",
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
      name: `DEV P6 ${level} ${key}`,
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
try {
  for (const level of ["basic", "standard", "enhanced"]) {
    let entry = report.cases.find((c: any) => c.level === level);
    if (!entry) {
      entry = { id: await create(level), level };
      report.cases.push(entry);
    }
    const id = entry.id;
    if (entry.materialization) continue;
    const recovered=await get(id);
    if(recovered.request.caseStatus==="materialized") {entry.materialization={request:recovered.request,recoveredFromOwningAPI:true};continue;}
    if (!entry.process) {
      entry.process = (await submit(id)).process;
    }
    await pack(entry.process);
    let votes = 0;
    while ((await get(id)).request.caseStatus !== "approved") {
      await vote(id);
      assert.ok(++votes <= 10);
    }
    entry.votes = votes;
    const doc = await post(
      `/api/relay/governance/process-documents/cases/${id}/request`,
      { purpose: "decision_document" },
    );
    entry.decisionDocument = doc;
    const jobId = doc.id ?? doc.jobId;
    const ready = await post(
      `/api/relay/governance/process-documents/jobs/${jobId}/process`,
      {},
    );
    assert.equal(ready.status, "ready");
    const current = await get(id);
    entry.materialization = await post(`${endpoint}/${id}/materialize`, {
      expectedVersion: current.request.rowVersion,
      idempotencyKey: randomUUID(),
    });
    assert.equal(entry.materialization.request.caseStatus, "materialized");
    writeFileSync(
      "governance/policy/reports/supplier-onboarding-materialization-live.dev.json",
      JSON.stringify(report, null, 2) + "\n",
    );
  }
  report.passed = true;
} finally {
  writeFileSync(
    "governance/policy/reports/supplier-onboarding-materialization-live.dev.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await client.dispose();
  await reviewer.dispose();
  console.log(
    JSON.stringify({
      passed: report.passed ?? false,
      cases: report.cases.length,
    }),
  );
}
