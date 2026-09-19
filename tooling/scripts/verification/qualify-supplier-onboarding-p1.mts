import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { chromium, request } from "@playwright/test";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  storageState:
    process.env.NEON_AUTH_STATE ?? "tests/e2e/.auth/dev/neon/catl.admin.json",
  viewport: { width: 1600, height: 1200 },
});
const page = await context.newPage();
const report: any = { at: new Date().toISOString(), checks: [], cases: [] };
try {
  await page.goto("https://neon.dev.athyper.test/mdg/business-partner/new");
  await page.getByRole("radio", { name: /Supplier/ }).check();
  await page
    .getByRole("button", { name: "Onboard new supplier", exact: true })
    .click();
  await page.locator('input[name="name"]').waitFor();
  const level = page.locator('[name="requestedComplianceLevel"]'),
    reason = page.locator('[name="complianceRequirementReason"]');
  for (const view of ["standard", "full"]) {
    await page.getByLabel("Profile view", { exact: true }).selectOption(view);
    assert.equal(await level.inputValue(), "");
    assert.deepEqual(
      await level
        .locator("option")
        .evaluateAll((es) => es.map((e) => (e as HTMLOptionElement).value)),
      ["", "basic", "standard", "enhanced"],
    );
    for (const value of ["basic", "standard", "enhanced"]) {
      await level.selectOption(value);
      assert.equal(
        await reason.evaluate((e) => (e as HTMLTextAreaElement).required),
        value === "basic",
      );
    }
    await level.selectOption("");
    report.checks.push({
      view,
      allLevels: true,
      basicReasonRequired: true,
      noDefault: true,
    });
  }
  await level.selectOption("standard");
  await page.locator('[name="name"]').fill("DEV P1 qualification " + report.at);
  const pending = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      new URL(r.url()).pathname.endsWith("/business-partner-cases"),
  );
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  const response = await pending;
  const body = await response.json();
  report.create = { status: response.status(), caseId: body.request?.id };
  writeFileSync(
    "/tmp/supplier-p1-browser-command.json",
    JSON.stringify(response.request().postDataJSON()),
  );
  assert.ok(response.ok(), JSON.stringify(body));
  report.cases.push(body.request.id);
  const base = response.request().postDataJSON(),
    endpoint = response.url();
  const csrf = (await context.cookies()).find((c) =>
    /^(__Host-)?athyper-csrf$/.test(c.name),
  );
  assert.ok(csrf);
  const headers = {
    origin: "https://neon.dev.athyper.test",
    "x-csrf-token": decodeURIComponent(csrf.value),
  };
  async function call(
    label: string,
    method: string,
    url: string,
    data: any,
    status: number,
  ) {
    const r = await context.request.fetch(url, {
      method,
      headers: {
        ...headers,
        "Idempotency-Key": data.idempotencyKey ?? randomUUID(),
      },
      data,
    });
    const b = await r.json();
    report.checks.push({
      label,
      status: r.status(),
      code: b.code ?? b.error ?? null,
    });
    assert.equal(r.status(), status, `${label}: ${JSON.stringify(b)}`);
    return b;
  }
  for (const value of ["basic", "standard", "enhanced"]) {
    const data = {
      ...base,
      idempotencyKey: randomUUID(),
      proposedPayload: {
        ...base.proposedPayload,
        requestedComplianceLevel: value,
        complianceRequirementReason: "P1 synthetic qualification",
      },
    };
    const b = await call(`create ${value}`, "POST", endpoint, data, 201);
    report.cases.push(b.request.id);
    assert.equal(b.request.proposedPayload.requestedComplianceLevel, value);
  }
  for (const [label, changes] of [
    ["invalid enum", { requestedComplianceLevel: "unsafe" }],
    ["null enum", { requestedComplianceLevel: null }],
    ["Basic missing reason", { requestedComplianceLevel: "basic" }],
    [
      "Basic blank reason",
      { requestedComplianceLevel: "basic", complianceRequirementReason: "  " },
    ],
    ["overlong reason", { complianceRequirementReason: "x".repeat(2001) }],
  ] as const)
    await call(
      label,
      "POST",
      endpoint,
      {
        ...base,
        idempotencyKey: randomUUID(),
        proposedPayload: { ...base.proposedPayload, ...changes },
      },
      422,
    );
  await call(
    "profile injection",
    "POST",
    endpoint,
    {
      ...base,
      idempotencyKey: randomUUID(),
      proposedPayload: { ...base.proposedPayload, selectedProfile: "simple" },
    },
    400,
  );
  const missingData = {
    ...base,
    idempotencyKey: randomUUID(),
    proposedPayload: { ...base.proposedPayload },
  };
  delete missingData.proposedPayload.requestedComplianceLevel;
  const missing = await call(
    "incomplete requirement draft",
    "POST",
    endpoint,
    missingData,
    201,
  );
  report.cases.push(missing.request.id);
  await call(
    "missing requirement validate",
    "POST",
    `${endpoint}/${missing.request.id}/validate`,
    { expectedVersion: 1 },
    422,
  );
  await call(
    "missing requirement submit",
    "POST",
    `${endpoint}/${missing.request.id}/submit`,
    { expectedVersion: 1, idempotencyKey: randomUUID() },
    422,
  );
  const caseUrl = `${endpoint}/${body.request.id}`;
  await call(
    "change without reason",
    "PATCH",
    caseUrl,
    {
      expectedVersion: 1,
      draftCapture: true,
      proposedPayload: { requestedComplianceLevel: "enhanced" },
    },
    422,
  );
  const changed = await call(
    "change with reason",
    "PATCH",
    caseUrl,
    {
      expectedVersion: 1,
      draftCapture: true,
      proposedPayload: {
        requestedComplianceLevel: "enhanced",
        complianceRequirementReason: "P1 explained draft change",
      },
    },
    200,
  );
  assert.equal(
    changed.request.proposedPayload.requestedComplianceLevel,
    "enhanced",
  );
  const anon = await request.newContext({ ignoreHTTPSErrors: true });
  try {
    const denied = await anon.patch(caseUrl, {
      headers: { origin: headers.origin },
      data: {
        expectedVersion: 2,
        draftCapture: true,
        proposedPayload: {
          requestedComplianceLevel: "basic",
          complianceRequirementReason: "unauthorized",
        },
      },
    });
    assert.ok([401, 403].includes(denied.status()));
    report.checks.push({
      label: "unauthenticated update denied",
      status: denied.status(),
    });
  } finally {
    await anon.dispose();
  }
  await page.goto(
    `https://neon.dev.athyper.test/mdg/business-partner/requests/${body.request.id}/edit`,
  );
  await level.waitFor();
  assert.equal(await level.inputValue(), "enhanced");
  assert.equal(await reason.inputValue(), "P1 explained draft change");
  report.checks.push({
    label: "browser reopened persisted assertion and reason",
    passed: true,
  });
  report.passed = true;
  console.log(JSON.stringify(report));
  await page.screenshot({ path: "/tmp/supplier-p1-live.png", fullPage: true });
} finally {
  writeFileSync(
    "governance/policy/reports/supplier-onboarding-p1-live.dev.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await context.close();
  await browser.close();
}
