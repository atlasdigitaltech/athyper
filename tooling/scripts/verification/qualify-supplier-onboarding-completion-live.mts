import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { request } from "@playwright/test";
const origin = "https://neon.dev.athyper.test";
const client = await request.newContext({
  baseURL: origin,
  storageState: "tests/e2e/.auth/dev/neon/catl.admin.json",
  ignoreHTTPSErrors: true,
});
const report: any = { at: new Date().toISOString(), checks: [] };
try {
  const fixtures = JSON.parse(
    readFileSync(
      "governance/policy/reports/supplier-process-correction-live.dev.json",
      "utf8",
    ),
  ).cases.filter((c: any) => c.second);
  const csrf = (await client.storageState()).cookies.find((c: any) =>
    /^(__Host-)?athyper-csrf$/.test(c.name),
  );
  assert.ok(csrf);
  for (const fixture of fixtures) {
    const path = `/api/relay/governance/supplier-onboarding/runs/${fixture.first.cycleRunId}`;
    const response = await client.get(`${path}/readiness`, {
      headers: { origin, "x-csrf-token": decodeURIComponent(csrf.value) },
    });
    assert.equal(response.status(), 200, `readiness HTTP ${response.status()}`);
    const body = await response.json();
    assert.equal(body.ready, false);
    assert.ok(body.reasons.includes("materialization"));
    const idempotencyKey = randomUUID();
    const blocked = await client.post(`${path}/completion`, {
      headers: {
        origin,
        "x-csrf-token": decodeURIComponent(csrf.value),
        "Idempotency-Key": idempotencyKey,
      },
      data: { expectedVersion: body.evidence.runVersion, idempotencyKey },
    });
    assert.equal(blocked.status(), 409, `closure HTTP ${blocked.status()}`);
    const denial=await blocked.json();
    assert.equal(denial.code,"GOVERNANCE_CYCLE_NOT_READY");
    report.checks.push({
      caseId: fixture.id,
      runId: fixture.first.cycleRunId,
      readinessStatus: response.status(),
      closureStatus: blocked.status(),
      closureCode: denial.code,
      reasons: body.reasons,
    });
  }
  report.passed = true;
  writeFileSync(
    "governance/policy/reports/supplier-onboarding-completion-live.dev.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    "Three profile readiness APIs and premature closure rejection passed.",
  );
} finally {
  await client.dispose();
}
