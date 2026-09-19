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
        "governance/policy/reports/supplier-onboarding-neon-actions.dev.json",
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
      name: `DEV P8 ${level} ${key}`,
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
const ownerContext = await browser.newContext({
  storageState: "tests/e2e/.auth/dev/neon/catl.owner.json",
  ignoreHTTPSErrors: true,
});
const adminContext = await browser.newContext({
  storageState: "tests/e2e/.auth/dev/neon/catl.admin.json",
  ignoreHTTPSErrors: true,
});
report.passed = false;
delete report.error;
const save = () =>
  writeFileSync(
    "governance/policy/reports/supplier-onboarding-neon-actions.dev.json",
    JSON.stringify(report, null, 2) + "\n",
  );
try {
  for (const level of ["basic", "standard", "enhanced"]) {
    let entry = report.cases.find((c: any) => c.level === level);
    if (!entry) {
      entry = { id: await create(level), level };
      report.cases.push(entry);
      save();
    }
    if (entry.passed) continue;
    const page = await adminContext.newPage();
    await page.goto(`${origin}/mdg/business-partner/requests/${entry.id}`);
    if (!entry.process) {
      await page
        .getByRole("heading", {
          name: "Onboarding profile preview",
          exact: true,
        })
        .waitFor();
      await page
        .getByText(`Effective: ${level === "basic" ? "simple" : level}`, {
          exact: false,
        })
        .waitFor();
      entry.preview = true;
      const validate = page.getByRole("button", {
        name: "Validate",
        exact: true,
      });
      if (await validate.count()) {
        const response = page.waitForResponse(
          (r) =>
            r.url().endsWith(`/${entry.id}/validate`) &&
            r.request().method() === "POST",
        );
        await validate.click();
        assert.equal((await response).status(), 200);
      }
      const response = page.waitForResponse(
        (r) =>
          r.url().endsWith(`/${entry.id}/submit`) &&
          r.request().method() === "POST",
      );
      await page
        .getByRole("button", { name: "Submit for approval", exact: true })
        .click();
      const result = await response;
      assert.ok(
        [200, 201].includes(result.status()),
        `submit HTTP ${result.status()}`,
      );
      const body = await result.json();
      entry.process = body.process;
      save();
    }
    await pack(entry.process);
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto(`${origin}/mdg/business-partner/requests/${entry.id}`);
    await ownerPage
      .getByRole("heading", {
        name: "Supplier onboarding journey",
        exact: true,
      })
      .waitFor();
    let votes = entry.votes ?? 0;
    while (true) {
      const current = await view(entry.id);
      if (
        ["approved", "materializing", "materialized"].includes(
          current.caseStatus,
        )
      )
        break;
      const item = current.executions.find(
        (i: any) => i.allowedActions?.length,
      );
      assert.ok(
        item,
        `No authorized review action for ${level}; case ${entry.id}; active stages ${current.executions.filter((i: any) => i.stage_status === "active").length}`,
      );
      const response = ownerPage.waitForResponse(
        (r) =>
          r.url().endsWith(`/${entry.id}/decide`) &&
          r.request().method() === "POST",
      );
      await ownerPage
        .getByRole("button", {
          name:
            item.action === "approve"
              ? "Approve assigned step"
              : "Accept review",
          exact: true,
        })
        .click();
      const r = await response;
      assert.equal(r.status(), 200, `review HTTP ${r.status()}`);
      votes++;
      entry.votes = votes;
      save();
      await ownerPage
        .getByRole("heading", {
          name: "Supplier onboarding journey",
          exact: true,
        })
        .waitFor();
      if (votes > 15) throw Error("Unexpected review loop");
    }
    assert.equal(votes, level === "basic" ? 1 : level === "standard" ? 2 : 10);
    entry.passed = true;
    save();
    await page.close();
    await ownerPage.close();
  }
  if (!report.correction) {
    report.correction = { id: await create("standard") };
    save();
  }
  const correction = report.correction;
  if (!correction.returned) {
    if (!correction.process) {
      correction.process = (await submit(correction.id)).process;
      save();
    }
    await pack(correction.process);
    const p = await ownerContext.newPage();
    await p.goto(`${origin}/mdg/business-partner/requests/${correction.id}`);
    await p
      .getByLabel("Reason for return, rejection or closure")
      .fill("P8 browser correction qualification");
    const response = p.waitForResponse(
      (r) =>
        r.url().endsWith(`/${correction.id}/decide`) &&
        r.request().method() === "POST",
    );
    await p
      .getByRole("button", { name: "Return for changes", exact: true })
      .click();
    assert.equal((await response).status(), 200);
    correction.returned = true;
    save();
    await p.close();
  }
  if (!correction.edited) {
    const p = await adminContext.newPage();
    await p.goto(`${origin}/mdg/business-partner/requests/${correction.id}`);
    await p.getByRole("link", { name: "Edit returned request" }).click();
    await p.getByLabel("Compliance requirement", { exact: false }).waitFor();
    await p
      .getByLabel("Requirement reason", { exact: false })
      .fill("P8 same-profile correction from the existing form");
    const response = p.waitForResponse(
      (r) =>
        r.url().endsWith(`/business-partner-cases/${correction.id}`) &&
        r.request().method() === "PATCH",
    );
    await p.getByRole("button", { name: "Save draft", exact: true }).click();
    assert.equal((await response).status(), 200);
    correction.edited = true;
    save();
    await p.close();
  }
  if (!correction.profileChangeRejected) {
    const before = await view(correction.id);
    const p = await adminContext.newPage();
    await p.goto(
      `${origin}/mdg/business-partner/requests/${correction.id}/edit`,
    );
    for (const mode of ["standard", "full"]) {
      await p.getByLabel("Profile view", { exact: false }).selectOption(mode);
      const requirement = p.getByLabel("Compliance requirement", {
        exact: false,
      });
      assert.equal(await requirement.isVisible(), true);
      assert.equal(
        await p.getByLabel("Requirement reason", { exact: false }).isVisible(),
        true,
      );
      assert.deepEqual(
        (
          await requirement
            .locator("option")
            .evaluateAll((options) =>
              options.map((o) => (o as HTMLOptionElement).value),
            )
        ).filter(Boolean),
        ["basic", "standard", "enhanced"],
      );
    }
    await p
      .getByLabel("Profile view", { exact: false })
      .selectOption("standard");
    correction.bothFormViews = true;
    await p
      .getByLabel("Compliance requirement", { exact: false })
      .selectOption("enhanced");
    await p
      .getByLabel("Requirement reason", { exact: false })
      .fill("P8 unsupported profile change qualification");
    const saved = p.waitForResponse(
      (r) =>
        r.url().endsWith(`/business-partner-cases/${correction.id}`) &&
        r.request().method() === "PATCH",
    );
    await p.getByRole("button", { name: "Save draft", exact: true }).click();
    assert.equal((await saved).status(), 200);
    await p.goto(`${origin}/mdg/business-partner/requests/${correction.id}`);
    const validated = p.waitForResponse(
      (r) =>
        r.url().endsWith(`/${correction.id}/validate`) &&
        r.request().method() === "POST",
    );
    await p.getByRole("button", { name: "Validate", exact: true }).click();
    assert.equal((await validated).status(), 200);
    const response = p.waitForResponse(
      (r) =>
        r.url().endsWith(`/${correction.id}/submit`) &&
        r.request().method() === "POST",
    );
    await p
      .getByRole("button", { name: "Submit for approval", exact: true })
      .click();
    const rejected = await response;
    assert.equal(rejected.status(), 409);
    correction.rejection = await rejected.json();
    save();
    await p
      .getByText("This correction changes the onboarding profile.", {
        exact: false,
      })
      .waitFor();
    const after = await view(correction.id);
    assert.equal(after.coordinate.attemptId, before.coordinate.attemptId);
    assert.equal(after.history.length, before.history.length);
    assert.equal(after.executions.length, before.executions.length);
    correction.profileChangeRejected = true;
    save();
    await p.close();
  }
  if (!correction.resubmitted) {
    const p = await adminContext.newPage();
    await p.goto(
      `${origin}/mdg/business-partner/requests/${correction.id}/edit`,
    );
    await p
      .getByLabel("Compliance requirement", { exact: false })
      .selectOption("standard");
    await p
      .getByLabel("Requirement reason", { exact: false })
      .fill("Restore pinned Standard profile for full re-review");
    const saved = p.waitForResponse(
      (r) =>
        r.url().endsWith(`/business-partner-cases/${correction.id}`) &&
        r.request().method() === "PATCH",
    );
    await p.getByRole("button", { name: "Save draft", exact: true }).click();
    assert.equal((await saved).status(), 200);
    await p.goto(`${origin}/mdg/business-partner/requests/${correction.id}`);
    const validated = p.waitForResponse(
      (r) =>
        r.url().endsWith(`/${correction.id}/validate`) &&
        r.request().method() === "POST",
    );
    await p.getByRole("button", { name: "Validate", exact: true }).click();
    assert.equal((await validated).status(), 200);
    const response = p.waitForResponse(
      (r) =>
        r.url().endsWith(`/${correction.id}/submit`) &&
        r.request().method() === "POST",
    );
    await p
      .getByRole("button", { name: "Submit for approval", exact: true })
      .click();
    const r = await response;
    assert.ok([200, 201].includes(r.status()));
    correction.second = (await r.json()).process;
    assert.equal(correction.second.attemptNumber, 2);
    assert.notEqual(correction.second.attemptId, correction.process.attemptId);
    correction.resubmitted = true;
    save();
    await p.close();
  }
  if (!correction.reviewed) {
    await pack(correction.second);
    const p = await ownerContext.newPage();
    await p.goto(`${origin}/mdg/business-partner/requests/${correction.id}`);
    let votes = correction.votes ?? 0;
    while ((await view(correction.id)).caseStatus !== "approved") {
      const v = await view(correction.id),
        item = v.executions.find((i: any) => i.allowedActions?.length);
      assert.ok(item);
      const response = p.waitForResponse(
        (r) =>
          r.url().endsWith(`/${correction.id}/decide`) &&
          r.request().method() === "POST",
      );
      await p
        .getByRole("button", {
          name:
            item.action === "approve"
              ? "Approve assigned step"
              : "Accept review",
          exact: true,
        })
        .click();
      assert.equal((await response).status(), 200);
      correction.votes = ++votes;
      save();
      await p
        .getByRole("heading", {
          name: "Supplier onboarding journey",
          exact: true,
        })
        .waitFor();
    }
    assert.equal(votes, 2);
    correction.reviewed = true;
    save();
    await p.close();
  }
  if (!correction.closed) {
    const p = await adminContext.newPage();
    await p.goto(`${origin}/mdg/business-partner/requests/${correction.id}`);
    await p
      .getByLabel("Reason for return, rejection or closure")
      .fill("Close P8 qualification proposal while retaining both attempts");
    const response = p.waitForResponse(
      (r) =>
        r.url().endsWith(`/${correction.id}/cancel`) &&
        r.request().method() === "POST",
    );
    await p
      .getByRole("button", { name: "Close proposal", exact: true })
      .click();
    const closed = await response;
    correction.closeResponse = await closed.json();
    save();
    assert.equal(
      closed.status(),
      200,
      JSON.stringify(correction.closeResponse),
    );
    await p
      .getByRole("link", { name: "Create a new request", exact: true })
      .waitFor();
    const current = await view(correction.id);
    assert.equal(current.caseStatus, "cancelled");
    assert.equal(current.history.length, 2);
    assert.ok(current.historicalReviews.length > 0);
    assert.ok(
      current.executions.every((i: any) => i.allowedActions.length === 0),
    );
    correction.closed = true;
    correction.retainedAttempts = current.history.length;
    save();
    await p.close();
  }
  if (!report.rejectionFixture) {
    report.rejectionFixture = { id: await create("basic") };
    save();
  }
  const rejection = report.rejectionFixture;
  if (!rejection.passed) {
    if (!rejection.process) {
      rejection.process = (await submit(rejection.id)).process;
      save();
    }
    await pack(rejection.process);
    const p = await ownerContext.newPage();
    await p.goto(`${origin}/mdg/business-partner/requests/${rejection.id}`);
    await p
      .getByLabel("Reason for return, rejection or closure")
      .fill("P8 authorized rejection qualification");
    const response = p.waitForResponse(
      (r) =>
        r.url().endsWith(`/${rejection.id}/decide`) &&
        r.request().method() === "POST",
    );
    await p
      .getByRole("button", { name: "Reject proposal", exact: true })
      .click();
    const result = await response;
    assert.equal(result.status(), 200);
    await p
      .getByRole("link", { name: "Create a new request", exact: true })
      .waitFor();
    assert.equal((await view(rejection.id)).caseStatus, "rejected");
    rejection.passed = true;
    save();
    await p.close();
  }
  report.passed = true;
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  save();
  await ownerContext.close();
  await adminContext.close();
  await browser.close();
  await client.dispose();
  await reviewer.dispose();
  console.log(
    JSON.stringify({
      passed: report.passed,
      cases: report.cases.length,
      error: report.error,
    }),
  );
}
