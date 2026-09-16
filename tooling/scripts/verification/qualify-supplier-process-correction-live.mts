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
try {
  for (const [actor, id] of [
    [client, "cca94907-7519-5871-8e3c-6b11aa545c93"],
    [reviewer, "645b6a55-3355-526a-9643-3900425bde47"],
  ] as const) {
    const s = await call(actor, "/api/auth/session", undefined, "GET");
    assert.equal(s.principalId, id);
  }
  for (const level of ["basic", "standard", "enhanced"]) {
    if (report.cases.some((e: any) => e.level === level && e.fullReviewVotes))
      continue;
    const id = await create(level),
      entry: any = { id, level };
    report.cases.push(entry);
    const first = await submit(id);
    entry.first = first.process;
    await pack(first.process);
    if (level !== "basic") await vote(id); // Preserve a completed earlier review and still restart it.
    const returned = await vote(id, "return");
    entry.returned = returned;
    assert.equal((await get(id)).request.caseStatus, "draft");
    const replay = await call(
      reviewer,
      `/api/relay/governance/process-tasks/cases/${id}/decide`,
      returned.command,
    );
    assert.equal(replay.replayed, true);
    const draft = (await get(id)).request;
    await call(
      client,
      `${endpoint}/${id}`,
      {
        expectedVersion: draft.rowVersion,
        idempotencyKey: randomUUID(),
        proposedPayload: {
          complianceRequirementReason:
            "P5 corrected information after reviewer feedback",
        },
      },
      "PATCH",
    );
    const second = await submit(id, true);
    entry.second = second.process;
    entry.concurrentReplayVerified = true;
    assert.equal(second.process.cycleRunId, first.process.cycleRunId);
    assert.equal(second.process.attemptNumber, 2);
    assert.notEqual(second.process.attemptId, first.process.attemptId);
    await call(
      reviewer,
      `/api/relay/governance/process-tasks/cases/${id}/decide`,
      returned.command,
      "POST",
      409,
    );
    const before = await view(id);
    assert.equal(before.executions.length, 0);
    await pack(second.process);
    const oldLink = await call(
      reviewer,
      `/api/relay/governance/process-documents/jobs/${first.process.reviewPackJobId}/download`,
      {},
    );
    const historical = await reviewer.get(oldLink.url);
    assert.equal(historical.status(), 200);
    entry.historicalPackSha256 = createHash("sha256")
      .update(await historical.body())
      .digest("hex");
    let votes = 0;
    for (let n = 0; n < 20; n++) {
      const v = await view(id);
      if (
        !v.executions.some(
          (e: any) =>
            e.stage_status === "active" &&
            ["open", "claimed"].includes(e.work_item_status),
        )
      )
        break;
      await vote(id);
      votes++;
    }
    assert.equal((await get(id)).request.caseStatus, "approved");
    assert.equal(votes, level === "basic" ? 1 : level === "standard" ? 2 : 10);
    entry.fullReviewVotes = votes;
  }
  for (const [level, next] of [
    ["basic", "enhanced"],
    ["enhanced", "basic"],
  ]) {
    let entry: any = report.cases.find(
      (e: any) => e.level === level && e.profileChange === next,
    );
    if (entry?.replacementId) continue;
    if (!entry) {
      entry = { id: await create(level), level, profileChange: next };
      report.cases.push(entry);
    }
    const id = entry.id;
    const first = entry.first ? { process: entry.first } : await submit(id);
    entry.first = first.process;
    if ((await get(id)).request.caseStatus === "submitted") {
      await pack(first.process);
      await vote(id, "return");
    }
    const current = (await get(id)).request;
    await call(
      client,
      `${endpoint}/${id}`,
      {
        expectedVersion: current.rowVersion,
        idempotencyKey: randomUUID(),
        proposedPayload: {
          requestedComplianceLevel: next,
          complianceRequirementReason:
            "P5 different route requires explicit new proposal",
        },
      },
      "PATCH",
    );
    const draft = (await get(id)).request;
    const v = await post(`${endpoint}/${id}/validate`, {
      expectedVersion: draft.rowVersion,
      idempotencyKey: randomUUID(),
    });
    const rejected = await call(
      client,
      `${endpoint}/${id}/submit`,
      { expectedVersion: v.request.rowVersion, idempotencyKey: randomUUID() },
      "POST",
      409,
    );
    entry.profileChangeResult = rejected;
    assert.equal((await get(id)).request.caseStatus, "draft");
    entry.savedDraftVersion = (await get(id)).request.rowVersion;
    const cancel = {
      attemptId: first.process.attemptId,
      expectedVersion: entry.savedDraftVersion,
      reason:
        "Close proposal; different onboarding profile requires a new request",
      idempotencyKey: randomUUID(),
    };
    await call(
      reviewer,
      `/api/relay/governance/process-tasks/cases/${id}/cancel`,
      cancel,
      "POST",
      403,
    );
    entry.cancel = await post(
      `/api/relay/governance/process-tasks/cases/${id}/cancel`,
      cancel,
    );
    assert.equal((await get(id)).request.caseStatus, "cancelled");
    const replacementId = await create(next);
    entry.replacementId = replacementId;
    assert.notEqual(id, replacementId);
  }
  if (
    !report.cases.some(
      (e: any) => e.terminalRejection && e.rejectionDocumentVerified,
    )
  ) {
    const id = await create("standard"),
      entry: any = { id, level: "standard", terminalRejection: true };
    report.cases.push(entry);
    const first = await submit(id);
    entry.first = first.process;
    await pack(first.process);
    entry.rejection = await vote(id, "reject");
    assert.equal((await get(id)).request.caseStatus, "rejected");
    const job = await post(
      `/api/relay/governance/process-documents/cases/${id}/request`,
      { purpose: "decision_document" },
    );
    entry.decision = await post(
      `/api/relay/governance/process-documents/jobs/${job.jobId}/process`,
      {},
    );
    assert.equal(entry.decision.status, "ready");
    const link = await post(
      `/api/relay/governance/process-documents/jobs/${job.jobId}/download`,
      {},
    );
    const pdf = await client.get(link.url);
    assert.equal(pdf.status(), 200);
    assert.equal(
      createHash("sha256")
        .update(await pdf.body())
        .digest("hex"),
      entry.decision.result.sha256,
    );
    entry.rejectionDocumentVerified = true;
  }
  if (!report.faultFixture) {
    const id = await create("basic");
    const submitted = await submit(id);
    report.faultFixture = {
      id,
      process: submitted.process,
      purpose:
        "Dedicated in-flight cancellation fixture; qualification mutations roll back",
    };
  }
  report.passed = true;
} finally {
  writeFileSync(
    "governance/policy/reports/supplier-process-correction-live.dev.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await client.dispose();
  await reviewer.dispose();
}
console.log(
  JSON.stringify({ passed: report.passed, cases: report.cases.length }),
);
