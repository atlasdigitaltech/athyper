import { request, chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, chmodSync } from "node:fs";
const origin = "https://neon.dev.athyper.test",
  auth =
    process.env.NEON_AUTH_STATE ?? "tests/e2e/.auth/dev/neon/catl.admin.json";
const c = await request.newContext({
  baseURL: origin,
  ignoreHTTPSErrors: true,
  storageState: auth,
});
const report: any = { at: new Date().toISOString(), checks: [] };
try {
  const cases = JSON.parse(
    readFileSync(
      "governance/policy/reports/supplier-onboarding-p1-live.dev.json",
      "utf8",
    ),
  ).cases;
  for (const id of cases) {
    const path = `/api/relay/governance/process-selection/cases/${id}/preview`;
    const r = await c.get(path),
      body = await r.json();
    report.checks.push({ caseId: id, httpStatus: r.status(), body });
    assert.equal(r.status(), 200, JSON.stringify(body));
    assert.ok(["incomplete", "ready"].includes(body.status));
  }
  assert.equal(
    report.checks.filter((x: any) => x.body.status === "incomplete").length,
    1,
  );
  assert.equal(
    report.checks.filter((x: any) => x.body.status === "ready").length,
    4,
  );
  const expected = {
    basic: "simple",
    standard: "standard",
    enhanced: "enhanced",
  };
  for (const check of report.checks.filter(
    (x: any) => x.body.status === "ready",
  )) {
    const selection = check.body.selection;
    assert.equal(
      selection.candidateProfile.code,
      expected[selection.requestedRequirement as keyof typeof expected],
    );
    assert.equal(
      selection.effectiveProfile.code,
      selection.candidateProfile.code,
    );
    assert.equal(
      selection.executionManifest.tasks.length,
      { simple: 2, standard: 3, enhanced: 10 }[
        selection.effectiveProfile.code as "simple"
      ],
    );
    assert.equal(selection.executionManifest.documents.length, 3);
  }
  const endpoint = `/api/relay/governance/process-selection/cases/${cases[0]}/preview`;
  const injected = await c.get(endpoint + "?minimumProfile=simple");
  assert.equal(injected.status(), 400);
  report.checks.push({
    label: "caller control injection rejected",
    status: injected.status(),
  });
  const missing = await c.get(
    "/api/relay/governance/process-selection/cases/00000000-0000-4000-8000-999999999999/preview",
  );
  assert.equal(missing.status(), 404);
  report.checks.push({ label: "missing case", status: missing.status() });
  const anon = await request.newContext({
    baseURL: origin,
    ignoreHTTPSErrors: true,
  });
  try {
    const denied = await anon.get(endpoint);
    assert.equal(denied.status(), 401);
    report.checks.push({ label: "anonymous denied", status: denied.status() });
  } finally {
    await anon.dispose();
  }
  const browser = await chromium.launch({ headless: true });
  try {
    const browserContext = await browser.newContext({
      ignoreHTTPSErrors: true,
      storageState: await c.storageState(),
    });
    const page = await browserContext.newPage();
    await page.goto(`${origin}/mdg/business-partner/requests/${cases[0]}/edit`);
    await page.locator('[name="requestedComplianceLevel"]').waitFor();
    const preview = await page.evaluate(async (path) => {
      const r = await fetch(path);
      return { status: r.status, body: await r.json() };
    }, endpoint);
    assert.equal(preview.status, 200);
    assert.equal(preview.body.status, "ready");
    report.checks.push({
      label: "authenticated browser form and preview relay",
      ...preview,
    });
    await browserContext.close();
  } finally {
    await browser.close();
  }
  report.passed = true;
  console.log(JSON.stringify(report));
} finally {
  writeFileSync(
    "governance/policy/reports/supplier-process-preview-live.dev.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await c.storageState({ path: auth });
  chmodSync(auth, 0o600);
  await c.dispose();
}
