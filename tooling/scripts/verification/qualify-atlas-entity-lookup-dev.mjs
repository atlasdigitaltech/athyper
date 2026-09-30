/** Live cross-page lookup through the ordinary Atlas composer and Entity tools. */
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
const [pagePath, recordId, directory] = process.argv.slice(2);
assert.ok(
  pagePath?.startsWith("/app/") && !pagePath.includes("://"),
  "Supply an application page path",
);
assert.match(
  recordId ?? "",
  /^[0-9a-f-]{36}$/i,
  "Supply the authorized Afghanistan Country UUID",
);
assert.ok(directory, "Supply a private evidence directory");
const out = resolve(directory);
mkdirSync(out, { recursive: true, mode: 0o700 });
const plane = process.env.ATHYPER_ATLAS_PLANE ?? "neon";
assert.ok(["neon", "studio", "mesh"].includes(plane));
const origin = `https://${plane}.dev.athyper.test`;
const browser = await chromium.launch();
const context = await browser.newContext({
  storageState:
    process.env.ATHYPER_BROWSER_STATE ??
    `tests/e2e/.auth/dev/${plane}/catl.admin.json`,
  viewport: { width: 1440, height: 1000 },
});
const report = {
  plane,
  pagePath,
  expectedEntity: "country",
  recordId,
  passed: false,
  atlasStepUpRequested: false,
};
context.on("request", (request) => {
  if (request.url().startsWith(origin + "/api/auth/step-up/"))
    report.atlasStepUpRequested = true;
});
try {
  const session = await context.request.get(origin + "/api/auth/session");
  assert.equal(
    (await session.json()).state,
    "authenticated",
    "Saved DEV browser session required",
  );
  const page = await context.newPage();
  await page.goto(origin + pagePath);
  await page.getByRole("button", { name: "Atlas", exact: true }).click();
  const workspace = page.getByRole("dialog", {
    name: "Atlas AI workspace",
    exact: true,
  });
  await workspace.waitFor();
  await workspace
    .locator('[contenteditable="true"]')
    .fill("What is Afghanistan's calling code?");
  const pending = page.waitForResponse(
    (r) => r.url().endsWith("/runs") && r.request().method() === "POST",
    { timeout: 120000 },
  );
  await workspace
    .getByRole("button", { name: "Send message", exact: true })
    .click();
  const response = await pending;
  const raw = await response.text();
  assert.equal(response.status(), 200);
  const events = raw.split(/\r?\n\r?\n/).flatMap((frame) => {
    const data = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    return data ? [JSON.parse(data)] : [];
  });
  writeFileSync(join(out, "events.json"), JSON.stringify(events, null, 2), {
    mode: 0o600,
  });
  report.tools = events
    .filter((e) => e.event?.type === "tool.completed")
    .map((e) => ({ code: e.event.toolCode, outcome: e.event.outcome }));
  assert.ok(
    events.some((e) => e.event?.type === "run.completed"),
    "Run did not complete",
  );
  assert.ok(!events.some((e) => e.event?.type === "run.failed"), "Run failed");
  for (const code of ["entity_discover", "entity_lookup"])
    assert.ok(
      report.tools.some((t) => t.code === code && t.outcome === "completed"),
      `Missing successful ${code}`,
    );
  assert.ok(
    events.some(
      (e) =>
        e.event?.type === "source.cited" &&
        e.event.callId !== "history" &&
        e.event.toolCode === "entity_lookup" &&
        e.event.coordinate?.entityCode === "country" &&
        e.event.coordinate?.recordId === recordId,
    ),
    "Expected Afghanistan source citation",
  );
  const answer = events
    .filter((e) => e.event?.type === "message.delta")
    .map((e) => e.event.text ?? "")
    .join("");
  assert.match(answer, /Afghanistan/i);
  assert.match(answer, /Calling code:\s*\+?93\b/i);
  await workspace
    .locator('[data-role="assistant"][data-status="completed"]')
    .last()
    .waitFor();
  await page.screenshot({ path: join(out, "lookup.png"), fullPage: true });
  assert.equal(report.atlasStepUpRequested, false);
  report.passed = true;
} finally {
  writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2), {
    mode: 0o600,
  });
  await context.close();
  await browser.close();
  console.log(JSON.stringify(report));
}
