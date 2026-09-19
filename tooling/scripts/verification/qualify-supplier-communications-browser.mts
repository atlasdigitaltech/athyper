import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const origin = "https://neon.dev.athyper.test";
const fixture = JSON.parse(
  readFileSync(
    "governance/policy/reports/supplier-onboarding-communications-live.dev.json",
    "utf8",
  ),
).cases[0];
assert.ok(fixture?.process);
const browser = await chromium.launch({ headless: true });
const report: any = {
  at: new Date().toISOString(),
  scope:
    "Existing NEON screen and owning inbox/task APIs; pinned URL does not assert historical-view UX",
  checks: [],
};
try {
  for (const principal of ["catl.admin", "catl.owner"]) {
    const context = await browser.newContext({
      storageState: `tests/e2e/.auth/dev/neon/${principal}.json`,
      ignoreHTTPSErrors: true,
    });
    try {
      const page = await context.newPage();
      await page.goto(
        `${origin}/mdg/business-partner/requests/${fixture.id}?attemptId=${fixture.process.attemptId}`,
      );
      await page.locator("#main-content").waitFor();
      const observed = await page.evaluate(async (id) => {
        const inbox = await fetch("/api/relay/notifications/inbox?limit=100");
        const tasks = await fetch(
          `/api/relay/governance/process-tasks/cases/${id}/view`,
        );
        return {
          inboxStatus: inbox.status,
          inbox: await inbox.json(),
          taskStatus: tasks.status,
          tasks: await tasks.json(),
        };
      }, fixture.id);
      assert.equal(observed.inboxStatus, 200);
      assert.equal(observed.taskStatus, 200);
      assert.equal(
        observed.tasks.coordinate.attemptId,
        fixture.process.attemptId,
      );
      assert.ok(JSON.stringify(observed.inbox).includes(fixture.id));
      mkdirSync("governance/policy/reports/p7-browser", { recursive: true });
      await page.screenshot({
        path: `governance/policy/reports/p7-browser/${principal}.png`,
        fullPage: true,
      });
      await page.goto(`${origin}/mdg/business-partner/requests/${fixture.id}?attemptId=00000000-0000-4000-8000-000000000001`);
      await page.getByRole("heading",{name:"This notice is no longer actionable"}).waitFor();
      const currentLink=page.getByRole("link",{name:"Open current request",exact:true});assert.equal(await currentLink.getAttribute("href"),`/mdg/business-partner/requests/${fixture.id}`);
      await page.screenshot({path:`governance/policy/reports/p7-browser/stale-${principal}.png`,fullPage:true});
      report.checks.push({
        principal,
        owningInbox: 200,
        owningTaskView: 200,
        caseId: fixture.id,
        attemptId: fixture.process.attemptId,
        pinnedLinkOpens: true,
        stalePinRequiresExplicitCurrentRequest: true,
      });
    } finally {
      await context.close();
    }
  }
  report.passed = true;
} finally {
  await browser.close();
  writeFileSync(
    "governance/policy/reports/supplier-onboarding-communications-browser.dev.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
}
