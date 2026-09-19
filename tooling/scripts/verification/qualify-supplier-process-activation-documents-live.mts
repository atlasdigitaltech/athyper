import { request } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import assert from "node:assert/strict";
const origin = "https://neon.dev.athyper.test",
  auth = "tests/e2e/.auth/dev/neon/catl.admin.json",
  client = await request.newContext({
    baseURL: origin,
    storageState: auth,
    ignoreHTTPSErrors: true,
  }),
  before = process.argv.includes("--before-activation"),
  path =
    "governance/policy/reports/supplier-process-activation-documents-live.dev.json";
const report: any = {
  at: new Date().toISOString(),
  mode: before
    ? "Authenticated missing-activation precondition"
    : "Authenticated P4 activation document API with controlled upstream fixture and real owner activation evidence",
  checks: [],
};
try {
  const csrf = (await client.storageState()).cookies.find((c) =>
    c.name.includes("csrf"),
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
  for (const c of cases) {
    const current = await (
      await client.get(`/api/relay/neon/business-partner-cases/${c.id}`)
    ).json();
    const response = await client.post(
        `/api/relay/governance/process-documents/cases/${c.id}/request`,
        { headers, data: { purpose: "activation_confirmation" } },
      ),
      receipt = await response.json();
    if (before) {
      assert.equal(response.status(), 409, JSON.stringify(receipt));
      assert.equal(receipt.code, "PROCESS_DOCUMENT_SOURCE_NOT_READY");
      const after = await (
        await client.get(`/api/relay/neon/business-partner-cases/${c.id}`)
      ).json();
      assert.equal(after.request.status, current.request.status);
      assert.equal(after.request.rowVersion, current.request.rowVersion);
      report.checks.push({
        profile: c.level,
        caseId: c.id,
        blocked: 409,
        businessStateUnchanged: true,
      });
      continue;
    }
    assert.equal(response.status(), 200, JSON.stringify(receipt));
    const rendered = await client.post(
        `/api/relay/governance/process-documents/jobs/${receipt.jobId}/process`,
        { headers, data: {} },
      ),
      body = await rendered.json();
    assert.equal(rendered.status(), 200, JSON.stringify(body));
    assert.equal(body.status, "ready", JSON.stringify(body));
    assert.equal(body.gateStatus, "succeeded", JSON.stringify(body));
    const replay = await client.post(
      `/api/relay/governance/process-documents/jobs/${receipt.jobId}/process`,
      { headers, data: {} },
    );
    assert.deepEqual((await replay.json()).result, body.result);
    const download = await client.post(
      `/api/relay/governance/process-documents/jobs/${receipt.jobId}/download`,
      { headers, data: {} },
    );
    assert.equal(download.status(), 200);
    const link = await download.json();
    assert.equal(link.document.id, body.result.attachmentVersionId);
    const pdf = await client.get(link.url);
    assert.equal(pdf.status(), 200);
    const bytes = await pdf.body();
    assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      body.result.sha256,
    );
    const after = await (
      await client.get(`/api/relay/neon/business-partner-cases/${c.id}`)
    ).json();
    assert.equal(after.request.status, current.request.status);
    assert.equal(after.request.rowVersion, current.request.rowVersion);
    report.checks.push({
      profile: c.level,
      caseId: c.id,
      body,
      downloadVerified: true,
      replayVerified: true,
      businessStateUnchanged: true,
    });
  }
  report.passed = true;
} finally {
  await client.storageState({ path: auth });
  await client.dispose();
  writeFileSync(
    before ? path.replace(".dev.json", "-precondition.dev.json") : path,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      passed: report.passed ?? false,
      checks: report.checks.length,
    }),
  );
}
