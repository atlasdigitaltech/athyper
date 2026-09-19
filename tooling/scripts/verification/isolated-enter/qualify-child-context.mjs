import { chromium } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import assert from "node:assert/strict";
const root =
  os.homedir() +
  "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911";
const browser = await chromium.launch(),
  context = await browser.newContext({
    ignoreHTTPSErrors: true,
    proxy: { server: "http://127.0.0.1:13320" },
    storageState: root + "/ui-auth/dev/neon/catl.admin.json",
  });
try {
  const page = await context.newPage(),
    receipts = [];
  page.on("response", (r) => {
    if (r.url().includes("neon.dev.athyper.test"))
      receipts.push({
        path: new URL(r.url()).pathname,
        status: r.status(),
        uiImage: r.headers()["x-qualification-ui-image"],
      });
  });
  await page.goto(
    "https://neon.dev.athyper.test/mdg/business-partner/requests",
  );
  const selector = page.getByRole("combobox", {
    name: "Work context organization",
  });
  await selector.waitFor();
  await page
    .getByRole("heading", { name: "Choose a work context", exact: true })
    .waitFor();
  const options = await selector
    .locator("option")
    .evaluateAll((es) => es.map((e) => e.value));
  assert.deepEqual(options.filter(Boolean), [
    "a478f9c0-8226-5d22-9599-b8fb27a45180",
  ]);
  const response = page.waitForResponse(
    (r) =>
      r.url().includes("entity-runtime/business_partner_request/list?") &&
      r.status() === 200,
  );
  await selector.selectOption("a478f9c0-8226-5d22-9599-b8fb27a45180");
  const result = await (await response).json();
  const journey = JSON.parse(
    fs.readFileSync(
      "governance/policy/reports/business-partner-dependency-commands-20260912.dev.json",
    ),
  );
  assert.ok(result.rows.some((r) => r.id === journey.testCaseId));
  const row = result.rows.find((r) => r.id === journey.testCaseId);
  await page.getByText(row.values.case_code, { exact: true }).first().waitFor();
  await page.screenshot({
    path: root + "/child-context-selected.png",
    fullPage: true,
  });
  const out =
    "governance/policy/reports/business-partner-child-context-browser-20260912.dev.json";
  fs.writeFileSync(
    out,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        account: "catl.admin",
        requiredSelector: "operatingOrganizationId",
        options,
        requiredStateRendered: true,
        selectionLoadedExpectedCase: true,
        descriptorHash: result.descriptorHash,
        receipts,
        grantsChanged: false,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  console.log({ passed: true, report: out });
} finally {
  await browser.close();
}
