import assert from "node:assert/strict";
import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { request, chromium } from "@playwright/test";
const origin = "https://neon.dev.athyper.test",
  auth = "tests/e2e/.auth/dev/neon/catl.admin.json";
const client = await request.newContext({
  baseURL: origin,
  storageState: auth,
  ignoreHTTPSErrors: true,
});
const existingOnly = process.argv.includes("--existing");
const report: any = existingOnly
  ? JSON.parse(
      readFileSync(
        "governance/policy/reports/supplier-process-submission-live.dev.json",
        "utf8",
      ),
    )
  : { at: new Date().toISOString(), cases: [], checks: [] };
delete report.passed;
report.checks = report.checks.filter((check: any) => !check.label);
const endpoint = "/api/relay/neon/business-partner-cases";
try {
  const cookies = (await client.storageState()).cookies;
  const csrf = cookies.find((c) => /^(__Host-)?athyper-csrf$/.test(c.name));
  assert.ok(csrf);
  const headers = { origin, "x-csrf-token": decodeURIComponent(csrf.value) };
  async function post(path: string, data: any) {
    const r = await client.post(path, {
      headers: {
        ...headers,
        "Idempotency-Key": data.idempotencyKey ?? randomUUID(),
      },
      data,
    });
    const body = await r.json();
    assert.ok(r.ok(), JSON.stringify({ path, status: r.status(), body }));
    return body;
  }
  for (const level of existingOnly
    ? []
    : (["basic", "standard", "enhanced", "rollback"] as const)) {
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
        name: `DEV P2 ${level} ${key}`,
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
    const id = created.request.id;
    report.cases.push({
      level,
      id,
      createdVersion: created.request.rowVersion,
    });
    const validated = await post(`${endpoint}/${id}/validate`, {
      expectedVersion: created.request.rowVersion,
      idempotencyKey: randomUUID(),
    });
    assert.equal(
      validated.validation.valid,
      true,
      JSON.stringify(validated.validation),
    );
    const expectedVersion = validated.request.rowVersion;
    Object.assign(report.cases.at(-1), { validatedVersion: expectedVersion });
    if (level === "rollback") continue;
    const command = { expectedVersion, idempotencyKey: randomUUID() };
    const [first, second] = await Promise.all([
      post(`${endpoint}/${id}/submit`, command),
      post(`${endpoint}/${id}/submit`, command),
    ]);
    assert.deepEqual(first.process, second.process);
    assert.equal(Number(first.replayed) + Number(second.replayed), 1);
    assert.equal(first.workflow, undefined);
    assert.equal(first.process.profile, level === "basic" ? "simple" : level);
    assert.equal(first.process.documentStatus, "pending");
    const replay = await post(`${endpoint}/${id}/submit`, command);
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.process, first.process);
    Object.assign(report.cases.at(-1), {
      command,
      process: first.process,
      submittedVersion: first.request.rowVersion,
    });
    const conflicting = await client.post(`${endpoint}/${id}/submit`, {
      headers: { ...headers, "Idempotency-Key": "p2-conflict-" + id },
      data: { ...command, idempotencyKey: "p2-conflict-" + id },
    });
    assert.equal(conflicting.status(), 409);
    Object.assign(report.cases.at(-1), {
      command,
      process: first.process,
      submittedVersion: first.request.rowVersion,
    });
    report.checks.push({
      level,
      concurrentReplay: true,
      acceptedProfile: first.process.profile,
      changedKeyRejected: true,
      workflowAbsent: true,
    });
  }
  if (existingOnly)
    for (const c of report.cases.filter((c: any) => c.process)) {
      const results = await Promise.all([
        post(`${endpoint}/${c.id}/submit`, c.command),
        post(`${endpoint}/${c.id}/submit`, c.command),
      ]);
      for (const r of results) {
        assert.equal(r.replayed, true);
        assert.deepEqual(r.process, c.process);
      }
    }
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      storageState: await client.storageState(),
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    await page.goto(
      `${origin}/mdg/business-partner/requests/${report.cases[0].id}`,
    );
    await page.waitForLoadState("domcontentloaded");
    await page.locator("#main-content").waitFor();
    assert.ok(
      !/Application error|Internal Server Error/.test(
        await page.locator("body").innerText(),
      ),
    );
    const view = await page.evaluate(async (path) => {
      const r = await fetch(path);
      return { status: r.status, body: await r.json() };
    }, `${endpoint}/${report.cases[0].id}/view`);
    assert.equal(view.status, 200);
    assert.equal(view.body.workflow, undefined);
    assert.equal(
      view.body.onboardingCycle.runId,
      report.cases[0].process.cycleRunId,
    );
    assert.equal(view.body.onboardingCycle.template.code, "BP_SUPPLIER_SIMPLE");
    assert.equal(view.body.onboardingCycle.tasks.length, 2);
    assert.ok(
      !view.body.case.allowedActions.some((a: any) =>
        ["approve", "reject", "return"].includes(a.id),
      ),
    );
    report.checks.push({
      label: "browser can read submitted case without approval work",
      passed: true,
    });
    await context.close();
  } finally {
    await browser.close();
  }
  report.passed = true;
  report.qualifiedAt = new Date().toISOString();
} finally {
  writeFileSync(
    "governance/policy/reports/supplier-process-submission-live.dev.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await client.storageState({ path: auth });
  chmodSync(auth, 0o600);
  await client.dispose();
  console.log(JSON.stringify(report));
}
