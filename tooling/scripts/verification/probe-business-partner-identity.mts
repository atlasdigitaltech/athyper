import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  storageState: "tests/e2e/.auth/dev/neon/catl.admin.json",
  viewport: { width: 1440, height: 1100 },
});
try {
  const page = await context.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("https://neon.dev.athyper.test/mdg/business-partner/new", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "New business partner request" }).waitFor();
  await page.getByRole("radio", { name: /Supplier/ }).check();
  await page.getByRole("button", { name: "Onboard new supplier", exact: true }).click();
  const name = page.locator('input[name="name"]');
  await name.waitFor();
  assert.equal(await name.count(), 1);
  assert.equal(await page.locator('input[name="legalName"],input[name="displayName"]').count(), 0);
  await name.fill("N".repeat(321));
  await name.blur();
  await page.getByText(/Registered name.*320/).first().waitFor();
  await page.goto("https://neon.dev.athyper.test/mdg/business-partner/manage", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Business Partners", exact: true }).waitFor();
  await page.getByRole("button", { name: "Controls", exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({singleRegisteredName: true, removedNameInputs: 0, inlineLengthValidation: true, manageLoaded: true, pageErrors: 0, recordsCreated: 0}));
} finally {
  await context.close();
  await browser.close();
}
