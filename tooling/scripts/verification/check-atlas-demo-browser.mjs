/** Read-only DEV smoke check; uses an existing session, never captures credentials. */
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch();
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  storageState: "tests/e2e/.auth/dev/neon/catl.admin.json",
});
try {
  const page = await context.newPage();
  page.on("response", async (r) => {
    const path = new URL(r.url()).pathname;
    if (path.includes("/atlas/") && !path.endsWith("/runs"))
      console.log(JSON.stringify({ path, status: r.status() }));
  });
  await page.goto(
    "https://neon.dev.athyper.test/mdg/business-partner/f7688c3d-8c92-5651-a469-da3f4f786375",
  );
  await page.getByRole("button", { name: "Atlas", exact: true }).click();
  const workspace = page.getByRole("region", {
    name: "Atlas AI workspace",
    exact: true,
  });
  await workspace.waitFor();
  await page.waitForTimeout(4000);
  await workspace
    .locator('[contenteditable="true"]')
    .fill("Explain the saved information in overview.");
  const pending = page.waitForResponse(
    (r) => r.url().endsWith("/runs") && r.request().method() === "POST",
    { timeout: 120000 },
  );
  await workspace
    .getByRole("button", { name: "Send message", exact: true })
    .click();
  const response = await pending.catch(async (error) => {
    console.log(
      JSON.stringify({
        failedMessage: await workspace
          .locator('[data-role="assistant"][data-status="failed"]')
          .last()
          .textContent()
          .catch(() => null),
      }),
    );
    throw error;
  });
  const events = (await response.text())
    .split(/\r?\n\r?\n/)
    .flatMap((frame) => {
      const data = frame
        .split(/\r?\n/)
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("\n");
      return data ? [JSON.parse(data)] : [];
    });
  const completed = events.some((e) => e.event?.type === "run.completed");
  const citations = events.filter(
    (e) => e.event?.type === "source.cited",
  ).length;
  console.log(
    JSON.stringify({
      browser: "isolated Chromium with saved admin session",
      httpStatus: response.status(),
      completed,
      citations,
      failed: events.some((e) => e.event?.type === "run.failed"),
    }),
  );
  assert.equal(response.status(), 200);
  assert.ok(completed);
  assert.ok(citations > 0);
  await workspace
    .locator('[data-role="assistant"][data-status="completed"]')
    .last()
    .waitFor();
} finally {
  await context.close();
  await browser.close();
}
