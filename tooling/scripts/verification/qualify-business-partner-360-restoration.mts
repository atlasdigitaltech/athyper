import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch({ headless: true });
const report: any = {
  at: new Date().toISOString(),
  responses: [],
  passed: false,
};
try {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    storageState: "tests/e2e/.auth/dev/neon/catl.admin.json",
  });
  const page = await context.newPage();
  page.on("response", (r) => {
    if (r.url().includes("/360/") || r.url().includes("/atlas/experience"))
      report.responses.push({
        path: new URL(r.url()).pathname,
        status: r.status(),
      });
  });
  await page.goto(
    "https://neon.dev.athyper.test/mdg/business-partner/01a09f6a-fa77-71bc-9847-4a933ae23559",
  );
  await page.waitForTimeout(8000);
  report.headings = await page.getByRole("heading").allTextContents();
  report.alerts = await page.getByRole("alert").allTextContents();
  report.text = (await page.locator("main").innerText()).slice(0, 7000);
  report.passed =
    report.text.includes("360 View") &&
    report.text.includes("Roles & scope") &&
    report.responses.some(
      (r: any) => r.path.endsWith("/360/summary") && r.status === 200,
    ) &&
    report.responses
      .filter((r: any) => r.path.includes("/360/"))
      .every((r: any) => r.status === 200);
  await page.screenshot({
    path: "governance/policy/reports/business-partner-360-restored.dev.png",
    fullPage: true,
  });
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
  writeFileSync(
    "governance/policy/reports/business-partner-360-restoration.dev.json",
    JSON.stringify(report, null, 2) + "\n",
  );
}

if (!report.passed) process.exitCode = 1;
