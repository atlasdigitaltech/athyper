import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { request } from "@playwright/test";
const origin = "https://neon.dev.athyper.test",
  endpoint = "/api/relay/neon/business-partner-cases";
const admin = await request.newContext({
  baseURL: origin,
  storageState: "tests/e2e/.auth/dev/neon/catl.admin.json",
  ignoreHTTPSErrors: true,
});
const owner = await request.newContext({
  baseURL: origin,
  storageState: "tests/e2e/.auth/dev/neon/catl.owner.json",
  ignoreHTTPSErrors: true,
});
async function call(
  actor: any,
  path: string,
  data?: any,
  expected?: number,
  method?: string,
) {
  const csrf = (await actor.storageState()).cookies.find((c: any) =>
    /^(__Host-)?athyper-csrf$/.test(c.name),
  );
  const r = await actor.fetch(path, {
    method: method ?? (data ? "POST" : "GET"),
    headers: {
      origin,
      "x-csrf-token": decodeURIComponent(csrf.value),
      ...(data
        ? { "Idempotency-Key": data.idempotencyKey ?? randomUUID() }
        : {}),
    },
    ...(data ? { data } : {}),
  });
  const body = await r.json();
  assert.ok(
    expected ? r.status() === expected : r.ok(),
    JSON.stringify({
      path,
      status: r.status(),
      code: body.code,
      detail: body.detail ?? body.message,
      body: r.ok() ? undefined : body,
    }),
  );
  return body;
}

const report: any = {
  at: new Date().toISOString(),
  boundary:
    "Real owning API rejects bank-change creation without a current Mesh source; no source disclosure or bank master outcome is fabricated",
  cases: [],
};
try {
  const cases = JSON.parse(
    readFileSync(
      "governance/policy/reports/supplier-onboarding-activation-live.dev.json",
      "utf8",
    ),
  ).cases;
  for (const c of cases) {
    const denied = await call(
      admin,
      endpoint,
      {
        kind: "change_bank",
        source: { kind: "manual" },
        requestedRole: "supplier",
        targetBusinessPartnerId: c.businessPartnerId,
        operatingOrganizationId: "a478f9c0-8226-5d22-9599-b8fb27a45180",
        companyCodeId: "793b6cb3-3c61-57c0-9562-2cbc288bd4cf",
        proposedPayload: { qualificationTypeCode: "compliance" },
        idempotencyKey: `p6-missing-bank-source:${c.id}`,
      },
      409,
    );
    assert.equal(denied.code, "BUSINESS_PARTNER_BANK_SOURCE_UNAVAILABLE");
    report.cases.push({
      caseId: c.id,
      level: c.level,
      missingSourceRejected: true,
    });
  }
  report.passed = true;
} finally {
  writeFileSync(
    "governance/policy/reports/supplier-onboarding-bank-source-live.dev.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await admin.dispose();
  await owner.dispose();
  console.log(
    JSON.stringify({
      passed: report.passed ?? false,
      cases: report.cases.length,
    }),
  );
}
