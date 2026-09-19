import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { request, chromium, expect } from "@playwright/test";
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
        "governance/policy/reports/supplier-process-correction-live.dev.json",
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
    path === endpoint || path.endsWith("/submit") ? 201 : 200,
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
    reason: "P5 qualification decision",
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
      name: `DEV P5 ${level} ${key}`,
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
const browser = await chromium.launch({ headless: true });
try {
  const id = await create("standard"),
    first = await submit(id);
  report.caseId = id;
  report.first = first.process;
  await pack(first.process);
  const owner = await browser.newContext({
      ignoreHTTPSErrors: true,
      storageState: "tests/e2e/.auth/dev/neon/catl.owner.json",
    }),
    admin = await browser.newContext({
      ignoreHTTPSErrors: true,
      storageState: "tests/e2e/.auth/dev/neon/catl.admin.json",
    });
  const r = await owner.newPage(),
    p = await admin.newPage(),
    path = `${origin}/mdg/business-partner/requests/${id}`;
  await r.goto(path);
  await expect(
    r.getByRole("heading", { name: "Supplier review and corrections" }),
  ).toBeVisible();
  await r
    .getByLabel("Reason for return, rejection or closure")
    .fill("Browser P5 correction: verify the supplied information");
  const returning = r.waitForResponse(
    (x) =>
      x.url().endsWith(`/process-tasks/cases/${id}/decide`) &&
      x.request().method() === "POST",
  );
  await r
    .getByRole("button", { name: "Return for changes", exact: true })
    .click();
  assert.equal((await returning).status(), 200);
  await p.goto(path);
  await expect(
    p.getByText("Returned for changes:", { exact: false }),
  ).toBeVisible();
  await expect(
    p.getByRole("link", { name: "Edit returned request" }),
  ).toBeVisible();
  report.checks.push({
    label:
      "Reviewer returns current task; requester sees feedback and edit action",
    passed: true,
  });
  // Save a changed requirement through its owning API, then qualify the visible submit error.
  let changed = (await get(id)).request;
  await call(
    client,
    `${endpoint}/${id}`,
    {
      expectedVersion: changed.rowVersion,
      idempotencyKey: randomUUID(),
      proposedPayload: {
        requestedComplianceLevel: "enhanced",
        complianceRequirementReason: "P5 browser unsupported profile change",
      },
    },
    "PATCH",
  );
  changed = (await get(id)).request;
  await post(`${endpoint}/${id}/validate`, {
    expectedVersion: changed.rowVersion,
    idempotencyKey: randomUUID(),
  });
  await p.reload();
  await expect(
    p.getByRole("button", { name: "Submit for approval", exact: true }),
  ).toBeVisible();
  const denied = p.waitForResponse(
    (x) =>
      x.url().endsWith(`/business-partner-cases/${id}/submit`) &&
      x.request().method() === "POST",
  );
  await p
    .getByRole("button", { name: "Submit for approval", exact: true })
    .click();
  assert.equal((await denied).status(), 409);
  await expect(
    p.getByText(/This correction requires a different onboarding profile/),
  ).toBeVisible();
  assert.equal((await view(id)).coordinate.attemptNumber, 1);
  report.checks.push({
    label:
      "Unsupported profile change appears in the browser and creates no new attempt",
    passed: true,
  });
  changed = (await get(id)).request;
  await call(
    client,
    `${endpoint}/${id}`,
    {
      expectedVersion: changed.rowVersion,
      idempotencyKey: randomUUID(),
      proposedPayload: {
        requestedComplianceLevel: "standard",
        complianceRequirementReason: "P5 same-profile correction",
      },
    },
    "PATCH",
  );
  await p.reload();
  const refreshed = p.waitForResponse(
    (x) =>
      x.url().endsWith(`/business-partner-cases/${id}/view`) &&
      x.request().method() === "GET",
  );
  const validated = p.waitForResponse(
    (x) =>
      x.url().endsWith(`/business-partner-cases/${id}/validate`) &&
      x.request().method() === "POST",
  );
  await p.getByRole("button", { name: "Validate", exact: true }).click();
  assert.equal((await validated).status(), 200);
  await refreshed;
  await expect(p.locator('[data-ui-state="mutation-success"]')).toBeVisible();
  await expect(
    p.getByRole("button", { name: "Submit for approval", exact: true }),
  ).toBeVisible();
  const submitted = p.waitForResponse(
    (x) =>
      x.url().endsWith(`/business-partner-cases/${id}/submit`) &&
      x.request().method() === "POST",
  );
  await p
    .getByRole("button", { name: "Submit for approval", exact: true })
    .click();
  const response = await submitted;
  const second = await response.json();
  assert.equal(response.status(), 201, JSON.stringify(second));
  report.second = second.process;
  assert.equal(second.process.attemptNumber, 2);
  assert.equal(second.process.cycleRunId, first.process.cycleRunId);
  await pack(second.process);
  await r.reload();
  await expect(
    r.getByRole("button", { name: "Accept review", exact: true }),
  ).toBeVisible();
  report.checks.push({
    label:
      "Browser validation/resubmission starts a fresh first review on the same run",
    passed: true,
  });
  await p.reload();
  await p
    .getByLabel("Reason for return, rejection or closure")
    .fill("Browser P5 explicit cancellation; retain proposal history");
  const closing = p.waitForResponse(
    (x) =>
      x.url().endsWith(`/process-tasks/cases/${id}/cancel`) &&
      x.request().method() === "POST",
  );
  await p.getByRole("button", { name: "Close proposal", exact: true }).click();
  assert.equal((await closing).status(), 200);
  await expect(
    p.getByRole("link", { name: "Create a new request", exact: true }),
  ).toBeVisible();
  await expect(
    p.getByRole("button", { name: "Close proposal", exact: true }),
  ).toHaveCount(0);
  await p.getByText("Submission history", { exact: true }).click();
  await expect(
    p.getByText("Attempt 1 (historical)", { exact: true }),
  ).toBeVisible();
  await expect(
    p.getByText("Attempt 2 (current)", { exact: true }),
  ).toBeVisible();
  await r.reload();
  await expect(
    r.getByRole("button", { name: "Accept review", exact: true }),
  ).toHaveCount(0);
  report.checks.push({
    label:
      "Browser cancellation removes active reviewer work and retains both attempts",
    passed: true,
  });
  await p
    .getByRole("link", { name: "Create a new request", exact: true })
    .click();
  await expect(p).toHaveURL(/requests\/new/);
  report.checks.push({
    label: "Explicit new-request path opens a separate form",
    passed: true,
  });
  const rejectedId = await create("basic"),
    rejectedSubmission = await submit(rejectedId);
  await pack(rejectedSubmission.process);
  await r.goto(`${origin}/mdg/business-partner/requests/${rejectedId}`);
  await r
    .getByLabel("Reason for return, rejection or closure")
    .fill("P5 browser terminal rejection");
  const rejection = r.waitForResponse(
    (x) =>
      x.url().endsWith(`/process-tasks/cases/${rejectedId}/decide`) &&
      x.request().method() === "POST",
  );
  await r.getByRole("button", { name: "Reject proposal", exact: true }).click();
  assert.equal((await rejection).status(), 200);
  await expect(
    r.getByRole("link", { name: "Create a new request", exact: true }),
  ).toBeVisible();
  assert.equal((await get(rejectedId)).request.caseStatus, "rejected");
  report.rejectedCaseId = rejectedId;
  report.checks.push({
    label:
      "Assigned reviewer rejects through the browser; proposal becomes terminal",
    passed: true,
  });
  report.passed = true;
} finally {
  await browser.close();
  await client.dispose();
  await reviewer.dispose();
  writeFileSync(
    "governance/policy/reports/supplier-process-correction-browser.dev.json",
    JSON.stringify(report, null, 2) + "\n",
  );
}
console.log(
  JSON.stringify({
    passed: report.passed,
    checks: report.checks.length,
    caseId: report.caseId,
  }),
);
