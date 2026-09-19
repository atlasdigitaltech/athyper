import { request } from "@playwright/test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
const origin = "https://neon.dev.athyper.test",
  auth = "tests/e2e/.auth/dev/neon/catl.admin.json";
const client = await request.newContext({
  baseURL: origin,
  storageState: auth,
  ignoreHTTPSErrors: true,
});
const reviewer = await request.newContext({
  baseURL: origin,
  storageState: "tests/e2e/.auth/dev/neon/catl.owner.json",
  ignoreHTTPSErrors: true,
});
const report: any = { at: new Date().toISOString(), checks: [] };
try {
  const reviewerSession = await (
    await reviewer.get("/api/auth/session")
  ).json();
  assert.equal(
    reviewerSession.principalId,
    "645b6a55-3355-526a-9643-3900425bde47",
    "Capture DEV NEON catl.owner before qualification",
  );
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
    const r = await client.post(
        `/api/relay/governance/process-documents/jobs/${fixture.process.reviewPackJobId}/process`,
        { headers, data: {} },
      ),
      body = await r.json();
    report.checks.push({
      profile: fixture.level,
      httpStatus: r.status(),
      body,
    });
    assert.equal(r.status(), 200, JSON.stringify(body));
    assert.equal(body.status, "ready", JSON.stringify(body));
    assert.equal(body.gateStatus, "succeeded", JSON.stringify(body));
    const again = await client.post(
      `/api/relay/governance/process-documents/jobs/${fixture.process.reviewPackJobId}/process`,
      { headers, data: {} },
    );
    assert.deepEqual((await again.json()).result, body.result);
    const download = await client.post(
        `/api/relay/governance/process-documents/jobs/${fixture.process.reviewPackJobId}/download`,
        { headers, data: {} },
      ),
      link = await download.json();
    assert.equal(download.status(), 403, JSON.stringify(link));
    const reviewerCsrf = (await reviewer.storageState()).cookies.find((c) =>
      /^(__Host-)?athyper-csrf$/.test(c.name),
    );
    assert.ok(reviewerCsrf);
    const allowed = await reviewer.post(
        `/api/relay/governance/process-documents/jobs/${fixture.process.reviewPackJobId}/download`,
        {
          headers: {
            origin,
            "x-csrf-token": decodeURIComponent(reviewerCsrf.value),
            "Idempotency-Key": randomUUID(),
          },
          data: {},
        },
      ),
      authorized = await allowed.json();
    assert.equal(allowed.status(), 200, JSON.stringify(authorized));
    assert.equal(authorized.document.id, body.result.attachmentVersionId);
    report.checks.at(-1).downloadAuthorized = true;
    report.checks.at(-1).requesterDownloadDenied = true;
    const pdf = await reviewer.get(authorized.url);
    assert.equal(pdf.status(), 200);
    const bytes = await pdf.body();
    assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      body.result.sha256,
    );
    report.checks.at(-1).storedPdfVerified = true;
    const reviewHeaders = {
      origin,
      "x-csrf-token": decodeURIComponent(reviewerCsrf.value),
      "Idempotency-Key": randomUUID(),
    };
    let votes = 0;
    for (let step = 0; step < 20; step++) {
      const view = await reviewer.get(
          `/api/relay/governance/process-tasks/cases/${fixture.id}/view`,
        ),
        tasks = await view.json();
      assert.equal(view.status(), 200, JSON.stringify(tasks));
      const item = tasks.executions.find(
        (e: any) =>
          e.stage_status === "active" &&
          ["open", "claimed"].includes(e.work_item_status),
      );
      if (!item) break;
      const voteKey = randomUUID();
      const vote = await reviewer.post(
        `/api/relay/governance/process-tasks/cases/${fixture.id}/decide`,
        {
          headers: { ...reviewHeaders, "Idempotency-Key": voteKey },
          data: {
            attemptId: tasks.coordinate.attemptId,
            cycleTaskId: item.cycle_task_id,
            workflowRequestId: item.workflow_request_id,
            workflowStageId: item.workflow_stage_id,
            workItemId: item.work_item_id,
            expectedWorkItemVersion: Number(item.work_item_version),
            idempotencyKey: voteKey,
            action: item.action,
          },
        },
      );
      const outcome = await vote.json();
      assert.equal(vote.status(), 200, JSON.stringify(outcome));
      const caseAfter = await (
        await client.get(`/api/relay/neon/business-partner-cases/${fixture.id}`)
      ).json();
      assert.equal(
        caseAfter.request.caseStatus,
        outcome.receipt.caseApproved ? "approved" : "submitted",
      );
      votes++;
    }
    report.checks.at(-1).realTaskVotes = votes;
    const requested = await client.post(
        `/api/relay/governance/process-documents/cases/${fixture.id}/request`,
        { headers, data: { purpose: "decision_document" } },
      ),
      receipt = await requested.json();
    assert.equal(requested.status(), 200, JSON.stringify(receipt));
    const decision = await client.post(
        `/api/relay/governance/process-documents/jobs/${receipt.jobId}/process`,
        { headers, data: {} },
      ),
      decisionBody = await decision.json();
    assert.equal(decision.status(), 200, JSON.stringify(decisionBody));
    assert.equal(decisionBody.status, "ready", JSON.stringify(decisionBody));
    assert.equal(
      decisionBody.gateStatus,
      "succeeded",
      JSON.stringify(decisionBody),
    );
    report.checks.at(-1).decisionDocument = decisionBody;
    const downloadDecision = await client.post(
      `/api/relay/governance/process-documents/jobs/${receipt.jobId}/download`,
      { headers, data: {} },
    );
    assert.equal(downloadDecision.status(), 200);
    const decisionLink = await downloadDecision.json();
    const decisionPdf = await client.get(decisionLink.url);
    assert.equal(decisionPdf.status(), 200);
    const decisionBytes = await decisionPdf.body();
    assert.equal(decisionBytes.subarray(0, 5).toString(), "%PDF-");
    assert.equal(
      createHash("sha256").update(decisionBytes).digest("hex"),
      decisionBody.result.sha256,
    );
    report.checks.at(-1).decisionDownloadVerified = true;
    const current = await (
      await client.get(`/api/relay/neon/business-partner-cases/${fixture.id}`)
    ).json();
    if (current.request.status === "applied") {
      report.checks.at(-1).materialization = { alreadyMaterialized: true };
      continue;
    }
    const applyKey = randomUUID(),
      applied = await client.post(
        `/api/relay/neon/business-partner-cases/${fixture.id}/materialize`,
        {
          headers: { ...headers, "Idempotency-Key": applyKey },
          data: {
            expectedVersion: current.request.rowVersion,
            idempotencyKey: applyKey,
          },
        },
      ),
      materialized = await applied.json();
    assert.ok(applied.ok(), JSON.stringify(materialized));
    assert.equal(materialized.request.status, "applied");
    report.checks.at(-1).materialization = materialized.materialization;
  }
  report.passed = true;
} finally {
  await client.storageState({ path: auth });
  chmodSync(auth, 0o600);
  const finalSession = await (await reviewer.get("/api/auth/session")).json();
  if (finalSession.principalId === "645b6a55-3355-526a-9643-3900425bde47")
    await reviewer.storageState({
      path: "tests/e2e/.auth/dev/neon/catl.owner.json",
    });
  chmodSync("tests/e2e/.auth/dev/neon/catl.owner.json", 0o600);
  await reviewer.dispose();
  await client.dispose();
  writeFileSync(
    "governance/policy/reports/supplier-process-documents-live.dev.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
}
