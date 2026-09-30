/** Fresh activation notices: owning inbox API, durable ledger, exact document pins and NEON browser. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { request, chromium } from "@playwright/test";
const origin = "https://neon.dev.athyper.test";
const fixtures = JSON.parse(
  readFileSync(
    "governance/policy/reports/supplier-communications-closure-live.dev.json",
    "utf8",
  ),
).cases;
assert.equal(fixtures.length, 3);
const report: any = {
  at: new Date().toISOString(),
  scope:
    "Fresh owning activation/document APIs; exact committed notices in inbox and Mailpit",
  checks: [],
};
const query = (sql: string) =>
  JSON.parse(
    execFileSync(
      "docker",
      [
        "exec",
        "athyper-dev-db-1",
        "psql",
        "-U",
        "postgres",
        "-d",
        "athyper_neon",
        "-At",
        "-c",
        sql,
      ],
      { encoding: "utf8" },
    ),
  );
const client = await request.newContext({
  baseURL: origin,
  storageState: "tests/e2e/.auth/dev/neon/catl.admin.json",
  ignoreHTTPSErrors: true,
});
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    storageState: await client.storageState(),
    ignoreHTTPSErrors: true,
  });
  try {
    for (const fixture of fixtures) {
      assert.match(fixture.id, /^[0-9a-f-]{36}$/);
      assert.ok(
        fixture.document.downloadVerified && fixture.document.replayVerified,
      );
      let rows: any[] = [];
      for (let i = 0; i < 45; i++) {
        if (i % 10 === 0 && !process.argv.includes("--read-only"))
          execFileSync(
            "node",
            [
              "tooling/scripts/verification/sweep-supplier-communications-dev.mjs",
            ],
            { stdio: "pipe" },
          );
        rows = query(
          `SELECT coalesce(json_agg(x),'[]'::json) FROM (SELECT m.id message_id,m.payload,d.id delivery_id,d.channel,d.status,d.recipient_id,d.external_id FROM event.notification_message m JOIN event.notification_delivery d ON d.message_id=m.id WHERE m.event_code='supplier.onboarding.notice.activation' AND m.entity_id='${fixture.id}'::uuid) x`,
        );
        if (
          rows.length === 2 &&
          rows.every((row) => row.status === "delivered")
        )
          break;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      assert.equal(rows.length, 2, fixture.level);
      assert.ok(
        rows.every((row) => row.status === "delivered"),
        JSON.stringify(
          rows.map((r) => ({ channel: r.channel, status: r.status })),
        ),
      );
      assert.equal(new Set(rows.map((row) => row.message_id)).size, 1);
      assert.deepEqual(rows.map((row) => row.channel).sort(), [
        "email",
        "in_app",
      ]);
      for (const row of rows) {
        assert.equal(row.recipient_id, "cca94907-7519-5871-8e3c-6b11aa545c93");
        assert.equal(
          row.payload.communication.documentJobId,
          fixture.document.jobId,
        );
        assert.equal(
          row.payload.communication.attachmentVersionId,
          fixture.document.result.attachmentVersionId,
        );
        assert.equal(
          row.payload.communication.sourceSnapshotId,
          fixture.document.result.sourceSnapshot.id,
        );
        assert.equal(row.payload.communication.cycleRunId, fixture.runId);
      }
      assert.match(
        rows.find((row) => row.channel === "email").external_id,
        /^capture:/,
      );
      const inbox = await client.get(
        "/api/relay/notifications/inbox?limit=100",
      );
      assert.equal(inbox.status(), 200);
      assert.ok(JSON.stringify(await inbox.json()).includes(fixture.id));
      const url = rows[0].payload.caseUrl;
      assert.equal(new URL(url).origin, origin);
      assert.equal(
        new URL(url).searchParams.get("documentJobId"),
        fixture.document.jobId,
      );
      const page = await context.newPage();
      await page.goto(url);
      await page.locator("#main-content").waitFor();
      const result = await page.evaluate(async (id) => {
        const r = await fetch(
          `/api/relay/governance/process-tasks/cases/${id}/view`,
        );
        return { status: r.status, body: await r.json() };
      }, fixture.id);
      assert.equal(result.status, 200);
      assert.equal(
        result.body.coordinate.attemptId,
        rows[0].payload.communication.attemptId,
      );
      mkdirSync("governance/policy/reports/p7-browser", { recursive: true });
      await page.screenshot({
        path: `governance/policy/reports/p7-browser/activation-${fixture.level}.png`,
        fullPage: true,
      });
      await page.close();
      report.checks.push({
        profile: fixture.level,
        caseId: fixture.id,
        messageId: rows[0].message_id,
        documentJobId: fixture.document.jobId,
        attachmentVersionId: fixture.document.result.attachmentVersionId,
        oneNoticePerChannel: true,
        authorizedRecipient: true,
        exactPins: true,
        inboxApi: 200,
        browserLink: true,
        deliveryIds: rows.map((row) => row.delivery_id),
      });
    }
  } finally {
    await context.close();
  }
  execFileSync(
    "node",
    [
      "tooling/scripts/verification/qualify-supplier-communications-capture.mjs",
    ],
    { stdio: "pipe" },
  );
  const captures = JSON.parse(
    readFileSync(
      "governance/policy/reports/supplier-onboarding-communications-capture.dev.json",
      "utf8",
    ),
  ).checks;
  for (const check of report.checks)
    assert.equal(
      captures.filter(
        (c: any) =>
          c.eventCode === "supplier.onboarding.notice.activation" &&
          check.deliveryIds.includes(c.deliveryId),
      ).length,
      1,
    );
  report.passed = true;
} finally {
  await client.dispose();
  await browser.close();
  writeFileSync(
    "governance/policy/reports/supplier-communications-activation-notices.dev.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      passed: report.passed ?? false,
      profiles: report.checks.length,
    }),
  );
}
