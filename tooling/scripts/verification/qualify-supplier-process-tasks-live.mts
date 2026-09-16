import { request, chromium } from "@playwright/test";
import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const origin = "https://neon.dev.athyper.test",
  auth = "tests/e2e/.auth/dev/neon/catl.admin.json";
const client = await request.newContext({
  baseURL: origin,
  storageState: auth,
  ignoreHTTPSErrors: true,
});
const report: any = {
  at: new Date().toISOString(),
  mode: "Authenticated DEV API/NEON relay; existing P2 cases retain pending real document jobs.",
  checks: [],
};
try {
  const csrf = (await client.storageState()).cookies.find((c) =>
    /^(__Host-)?athyper-csrf$/.test(c.name),
  );
  assert.ok(csrf);
  const headers = {
    origin,
    "x-csrf-token": decodeURIComponent(csrf.value),
    "Idempotency-Key": randomUUID(),
  };
  const cases = JSON.parse(
    readFileSync(
      "governance/policy/reports/supplier-process-submission-live.dev.json",
      "utf8",
    ),
  ).cases.filter((c: any) => c.process);
  for (const fixture of cases) {
    const path = `/api/relay/governance/process-tasks/cases/${fixture.id}`;
    const view = await client.get(`${path}/view`),
      body = await view.json();
    assert.equal(view.status(), 200, JSON.stringify(body));
    assert.equal(body.coordinate.attemptId, fixture.process.attemptId);
    assert.deepEqual(body.executions, []);
    const start = await client.post(`${path}/start`, { headers, data: {} }),
      blocked = await start.json();
    assert.equal(start.status(), 409, JSON.stringify(blocked));
    assert.match(JSON.stringify(blocked), /PROCESS_REVIEW_DOCUMENT_NOT_READY/);
    const malformed = await client.post(`${path}/decide`, {
      headers,
      data: { action: "approve" },
    });
    assert.equal(malformed.status(), 400);
    report.checks.push({
      profile: fixture.level,
      view: 200,
      documentGate: 409,
      invalidDecision: 400,
      attemptId: body.coordinate.attemptId,
      noPrematureWork: true,
    });
  }
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      storageState: await client.storageState(),
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    await page.goto(`${origin}/mdg/business-partner/requests/${cases[0].id}`);
    await page.locator("#main-content").waitFor();
    const result = await page.evaluate(async (path) => {
      const r = await fetch(path);
      return { status: r.status, body: await r.json() };
    }, `/api/relay/governance/process-tasks/cases/${cases[0].id}/view`);
    assert.equal(result.status, 200);
    assert.equal(result.body.coordinate.attemptId, cases[0].process.attemptId);
    report.browser = { owningTaskViewReadable: true };
    await context.close();
  } finally {
    await browser.close();
  }
  report.passed = true;
} finally {
  await client.storageState({ path: auth });
  chmodSync(auth, 0o600);
  await client.dispose();
  writeFileSync(
    "governance/policy/reports/supplier-process-tasks-live.dev.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
}
