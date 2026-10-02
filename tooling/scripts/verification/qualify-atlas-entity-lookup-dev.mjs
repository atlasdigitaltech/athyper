/** Live cross-page lookup through the ordinary Atlas composer and Entity tools. */
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { X509Certificate, createHash } from "node:crypto";
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
// Chromium does not use Node's extra CA store. Trust only the explicitly
// configured DEV certificate key, rather than disabling all certificate checks.
const certPath = process.env.NODE_EXTRA_CA_CERTS;
assert.ok(certPath, "Set NODE_EXTRA_CA_CERTS to the trusted DEV certificate");
const certificate = new X509Certificate(readFileSync(certPath));
const spki = createHash("sha256")
  .update(certificate.publicKey.export({ type: "spki", format: "der" }))
  .digest("base64");
const browser = await chromium.launch({
  args: [`--ignore-certificate-errors-spki-list=${spki}`],
});
const context = await browser.newContext({
  storageState:
    process.env.ATHYPER_BROWSER_STATE ??
    `tests/e2e/.auth/dev/${plane}/catl.admin.json`,
  viewport: { width: 1440, height: 1000 },
});
context.setDefaultTimeout(30000);
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
let page;
report.http = [];
context.on("response", (r) => {
  const u = new URL(r.url());
  if (
    u.pathname.includes("/api/relay/atlas/") &&
    r.request().method() !== "GET"
  )
    report.http.push({ path: u.pathname, status: r.status() });
});
try {
  const session = await context.request.get(origin + "/api/auth/session");
  assert.equal(
    (await session.json()).state,
    "authenticated",
    "Saved DEV browser session required",
  );
  page = await context.newPage();
  await page.goto(origin + pagePath);
  if (process.env.ATHYPER_CURRENT_RECORD_LABEL)
    await page
      .getByRole("heading", {
        name: process.env.ATHYPER_CURRENT_RECORD_LABEL,
        exact: true,
      })
      .first()
      .waitFor();
  if (process.env.ATHYPER_CURRENT_RECORD_VALUE)
    await page.getByText(process.env.ATHYPER_CURRENT_RECORD_VALUE, { exact: true }).first().waitFor();
  await page.getByRole("button", { name: "Atlas", exact: true }).click();
  const workspace = page.getByRole("dialog", {
    name: "Atlas AI workspace",
    exact: true,
  });
  await workspace.waitFor();
  await workspace
    .getByRole("button", { name: "New Atlas conversation", exact: true })
    .click();
  const scenarios = process.env.ATHYPER_LOOKUP_SCENARIOS
    ? JSON.parse(process.env.ATHYPER_LOOKUP_SCENARIOS)
    : [
        {
          question: "What is Afghanistan's calling code?",
          names: ["Afghanistan"],
          includes: ["Calling code: 93"],
          recordIds: [recordId],
        },
      ];
  report.scenarios = [];
  for (const [index, scenario] of scenarios.entries()) {
    if (index && process.env.ATHYPER_INDEPENDENT_SCENARIOS === "true")
      await workspace.getByRole("button", {name:"New Atlas conversation",exact:true}).click();
    await workspace.locator('[contenteditable="true"]').fill(scenario.question);
    const pending = page.waitForResponse(
      (r) => r.url().endsWith("/runs") && r.request().method() === "POST",
      { timeout: 120000 },
    );
    await workspace
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    const response = await pending;
    const raw = await response.text();
    const sent = response.request().postDataJSON();
    report.currentPage = sent.businessContext
      ? {
          kind: sent.businessContext.kind,
          entityCode: sent.businessContext.entityCode,
          recordId: sent.businessContext.recordId,
        }
      : null;
    assert.equal(
      report.currentPage?.entityCode,
      pagePath.split("/")[3],
      "Expected the actual current Entity page context",
    );
    report.httpStatus = response.status();
    if (!response.ok())
      writeFileSync(join(out, "http-error.json"), raw, { mode: 0o600 });
    assert.equal(response.status(), 200);
    const events = raw.split(/\r?\n\r?\n/).flatMap((frame) => {
      const data = frame
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      return data ? [JSON.parse(data)] : [];
    });
    writeFileSync(
      join(out, `events-${index}.json`),
      JSON.stringify(events, null, 2),
      {
        mode: 0o600,
      },
    );
    report.tools = events
      .filter((e) => e.event?.type === "tool.completed")
      .map((e) => ({ code: e.event.toolCode, outcome: e.event.outcome }));
    assert.ok(
      events.some((e) => e.event?.type === "run.completed"),
      "Run did not complete",
    );
    assert.ok(
      !events.some((e) => e.event?.type === "run.failed"),
      "Run failed",
    );
    for (const code of (scenario.requiredTools ?? ["entity_discover", "entity_lookup"]))
      assert.ok(
        report.tools.some((t) => t.code === code && t.outcome === "completed"),
        `Missing successful ${code}`,
      );
    const citations = events
      .filter(
        (e) =>
          e.event?.type === "source.cited" &&
          e.event.callId !== "history" &&
          (scenario.citationTools ?? ["entity_lookup"]).includes(e.event.toolCode),
      )
      .map((e) => e.event.coordinate);
    const answer = events
      .filter((e) => e.event?.type === "message.delta")
      .map((e) => e.event.text ?? "")
      .join("");
    for (const name of [...scenario.names, ...(scenario.includes ?? [])])
      assert.ok(answer.includes(name), `Answer missing ${name}`);
    for (const id of scenario.recordIds ?? [])
      assert.ok(
        citations.some((c) => c.recordId === id),
        `Missing source ${id}`,
      );
    assert.ok(
      new Set(citations.map((c) => c.recordId)).size >= scenario.names.length,
      "Missing distinct sources for named records",
    );
    assert.ok(citations.every((c) => (scenario.citationEntities ?? ["country"]).includes(c.entityCode)));
    report.scenarios.push({
      question: scenario.question,
      tools: report.tools,
      citations,
      answer,
      passed: true,
    });
    await workspace
      .locator('[data-role="assistant"][data-status="completed"]')
      .last()
      .waitFor();
    console.log(JSON.stringify({scenario:index,question:scenario.question,passed:true}));
    await page.screenshot({
      path: join(out, `lookup-${index}.png`),
      fullPage: true,
    });
  }
  assert.equal(report.atlasStepUpRequested, false);
  report.passed = true;
} finally {
  if (page && !report.passed)
    await page
      .screenshot({ path: join(out, "failure.png"), fullPage: true })
      .catch(() => {});
  writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2), {
    mode: 0o600,
  });
  await context.close();
  await browser.close();
  console.log(JSON.stringify(report));
}
