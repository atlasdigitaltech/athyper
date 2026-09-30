import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { request, chromium, expect } from "@playwright/test";
const origin = "https://neon.dev.athyper.test",
  auth = "tests/e2e/.auth/dev/neon/catl.admin.json";
const client = await request.newContext({
  baseURL: origin,
  storageState: auth,
  ignoreHTTPSErrors: true,
});
const path =
  "governance/policy/reports/supplier-communications-closure-live.dev.json";
const report: any = existsSync(path)
  ? JSON.parse(readFileSync(path, "utf8"))
  : {
      at: new Date().toISOString(),
      cases: JSON.parse(
        readFileSync(
          "governance/policy/reports/supplier-communications-activation-live.dev.json",
          "utf8",
        ),
      ).cases.map((c: any) => ({
        id: c.id,
        level: c.level,
        runId: c.runId,
        activationCaseId: c.activation.id,
      })),
      checks: [],
    };
const save = () => writeFileSync(path, JSON.stringify(report, null, 2) + "\n");
async function call(path: string, data?: any, expected = 200) {
  const csrf = (await client.storageState()).cookies.find((c) =>
    /^(__Host-)?athyper-csrf$/.test(c.name),
  );
  assert.ok(csrf);
  const r = await client.fetch(path, {
    method: data ? "POST" : "GET",
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
  assert.equal(
    r.status(),
    expected,
    JSON.stringify({ path, status: r.status(), body }),
  );
  return body;
}
try {
  for (const c of report.cases) {
    const base = `/api/relay/governance/supplier-onboarding/runs/${c.runId}`;
    if (!c.document) {
      c.before = await call(`${base}/readiness`);
      if (!c.before.ready) {
        assert.ok(c.before.reasons.includes("activation_confirmation"));
        const blocked = await call(
          `${base}/completion`,
          {
            expectedVersion: c.before.evidence.runVersion,
            idempotencyKey: randomUUID(),
          },
          409,
        );
        assert.equal(blocked.code, "GOVERNANCE_CYCLE_NOT_READY");
      } else {
        c.activationConfirmationAutomaticallyReady = true;
      }
      const job = await call(
        `/api/relay/governance/process-documents/cases/${c.id}/request`,
        { purpose: "activation_confirmation" },
      );
      const processed = await call(
        `/api/relay/governance/process-documents/jobs/${job.jobId}/process`,
        {},
      );
      assert.equal(processed.status, "ready");
      assert.equal(processed.gateStatus, "succeeded");
      const replay = await call(
        `/api/relay/governance/process-documents/jobs/${job.jobId}/process`,
        {},
      );
      assert.deepEqual(replay.result, processed.result);
      const link = await call(
        `/api/relay/governance/process-documents/jobs/${job.jobId}/download`,
        {},
      );
      const pdf = await client.get(link.url);
      assert.equal(pdf.status(), 200);
      const bytes = await pdf.body();
      assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
      assert.equal(
        createHash("sha256").update(bytes).digest("hex"),
        processed.result.sha256,
      );
      c.document = {
        jobId: job.jobId,
        result: processed.result,
        downloadVerified: true,
        replayVerified: true,
      };
      save();
    }
    if (!c.closure) {
      const ready = await call(`${base}/readiness`);
      assert.equal(ready.ready, true, JSON.stringify(ready.reasons));
      c.ready = ready;
      const stale = await call(
        `${base}/completion`,
        {
          expectedVersion: ready.evidence.runVersion + 1,
          idempotencyKey: randomUUID(),
        },
        409,
      );
      c.staleClosure = stale.code;
      c.command ??= {
        expectedVersion: ready.evidence.runVersion,
        idempotencyKey: randomUUID(),
      };
      save();
      c.closure = await call(`${base}/completion`, c.command);
      save();
    }
    const replay = await call(`${base}/completion`, c.command);
    assert.deepEqual(replay, c.closure);
    c.replayed = true;
    save();
  }
  const activated = JSON.parse(
    readFileSync(
      "governance/policy/reports/supplier-communications-activation-live.dev.json",
      "utf8",
    ),
  ).cases;
  for (const c of activated) {
    const replay = await call(
      `/api/relay/neon/business-partner-cases/${c.activation.id}/materialize`,
      c.activation.command,
    );
    assert.equal(replay.replayed, true);
    assert.deepEqual(
      replay.materialization,
      c.activation.materialization.materialization,
    );
    report.cases.find((x: any) => x.id === c.id).activationReplayVerified =
      true;
    save();
  }
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      storageState: auth,
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    mkdirSync("governance/policy/reports/p7-browser", { recursive: true });
    for (const c of report.cases) {
      await page.goto(`${origin}/mdg/business-partner/requests/${c.id}`);
      await expect(
        page.getByRole("heading", { name: "Supplier review and corrections" }),
      ).toBeVisible();
      const live = await page.evaluate(async (runId) => {
        const r = await fetch(
          `/api/relay/governance/supplier-onboarding/runs/${runId}/readiness`,
        );
        return { status: r.status, body: await r.json() };
      }, c.runId);
      assert.equal(live.status, 200);
      assert.equal(live.body.ready, true, JSON.stringify(live.body.reasons));
      c.browser = {
        url: page.url(),
        readinessStatus: live.status,
        screenshot: `governance/policy/reports/p7-browser/${c.level}.png`,
      };
      await page.screenshot({ path: c.browser.screenshot, fullPage: true });
      save();
    }
  } finally {
    await browser.close();
  }
  report.passed = true;
} finally {
  save();
  await client.dispose();
  console.log(
    JSON.stringify({
      passed: report.passed ?? false,
      cases: report.cases.map((c: any) => ({
        level: c.level,
        document: !!c.document,
        closed: !!c.closure,
        browser: !!c.browser,
      })),
    }),
  );
}
