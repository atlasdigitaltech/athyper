import { artifactDirectory } from "../artifact-paths.mjs";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
const output = artifactDirectory("collection-actions", "dev");
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  storageState: "tests/e2e/.auth/dev/neon/catl.admin.json",
  viewport: { width: 1500, height: 1050 },
});
context.setDefaultTimeout(20000);
const page = await context.newPage(),
  errors: string[] = [],
  blocked: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**/*", async (route) => {
  const req = route.request(),
    path = new URL(req.url()).pathname;
  if (
    !["GET", "HEAD"].includes(req.method()) &&
    !path.startsWith("/api/auth/")
  ) {
    blocked.push(`${req.method()} ${path}`);
    await route.abort();
  } else await route.continue();
});
try {
  await page.goto("https://neon.dev.athyper.test/mdg/business-partner/new", {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("radio", { name: /Supplier/ }).check({ timeout: 30000 });
  await page
    .getByRole("button", { name: "Onboard new supplier", exact: true })
    .click();
  await page.locator('input[name="name"]').waitFor({ timeout: 30000 });
  await page.getByLabel("Profile view", { exact: true }).selectOption("full");
  for (const [renderer, label] of [
    ["addresses", "Addresses"],
    ["contacts", "Contacts"],
    ["bank-accounts", "Bank accounts"],
    ["certifications", "Certifications"],
  ]) {
    const section = page.locator(
      `.a-collection[data-presentation="${renderer}"]`,
    );
    const before = await section.locator(":scope > details").count();
    await expect(section.locator(".a-collection__heading").first()).toHaveText(
      `${label} (${before})`,
    );
    await section.locator(":scope > .a-collection__toolbar button").click();
    const row = section.locator(":scope > details").last();
    await expect(row).toHaveAttribute("open");
    await expect(
      row.locator(":scope > summary .a-collection__edit"),
    ).toBeHidden();
    await expect(section.locator(".a-collection__heading").first()).toHaveText(
      `${label} (${before + 1})`,
    );
    await row
      .locator(".a-collection__actions")
      .last()
      .getByRole("button", { name: "Done", exact: true })
      .click();
    await expect(row).toHaveAttribute("open");
    await expect(row.locator(".a-validation-summary").first()).toBeVisible();
    // Newly added defaults do not count as entered details.
    await row
      .locator(".a-collection__actions")
      .last()
      .getByRole("button", { name: /Remove/ })
      .click();
    await expect(section.locator(":scope > details")).toHaveCount(before);
  }
  const banks = page.locator(
    '.a-collection[data-presentation="bank-accounts"]',
  );
  await banks
    .getByRole("button", { name: "Add bank account", exact: true })
    .click();
  await banks.getByLabel("Bank selection").selectOption("unlisted");
  await banks.getByLabel("Bank name").fill("Example bank");
  await banks
    .getByRole("button", { name: "Remove bank account", exact: true })
    .click();
  await expect(banks.locator(".a-collection__confirmation")).toBeVisible();
  await banks.getByRole("button", { name: "Keep entry", exact: true }).click();
  await expect(banks.getByLabel("Bank name")).toHaveValue("Example bank");
  await banks
    .getByRole("button", { name: "Remove bank account", exact: true })
    .click();
  await banks
    .locator(".a-collection__confirmation")
    .getByRole("button", { name: /Remove/ })
    .click();
  await expect(banks.locator(":scope > details")).toHaveCount(0);
  await banks.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: `${output}/mobile.png` });
  assert.deepEqual(errors, []);
  const receipt = {
    checkedAt: new Date().toISOString(),
    url: page.url(),
    passed: true,
    presentations: ["addresses", "contacts", "bank-accounts", "certifications"],
    headingCounts: true,
    entryValidation: true,
    removalConfirmation: true,
    desktop: true,
    mobile: true,
    mutationsBlocked: true,
    blockedRequests: blocked,
    liveCasesCreated: 0,
    browserErrors: errors,
  };
  writeFileSync(
    "governance/policy/reports/collection-actions-browser.dev.json",
    JSON.stringify(receipt, null, 2) + "\n",
  );
  console.log(JSON.stringify(receipt, null, 2));
} catch (error) {
  console.log(
    JSON.stringify({
      url: page.url(),
      errors,
      body: (await page.locator("body").innerText()).slice(-4000),
    }),
  );
  await page.screenshot({ path: `${output}/live-failure.png`, fullPage: true });
  throw error;
} finally {
  await context.close();
  await browser.close();
}
