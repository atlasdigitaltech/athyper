import { artifactDirectory } from "../artifact-paths.mjs";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
const output = artifactDirectory("unified-form-layout", "dev");
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

  const layout = page.locator(".a-form-layout");
  const nav = layout.getByRole("navigation");
  await expect(nav).toBeVisible();
  await page.locator('input[name="name"]').fill("Example navigation test");
  await nav.getByRole("button", { name: /Bank accounts/ }).click();
  await expect(
    layout.locator('[data-form-section="request_bank_accounts"]'),
  ).toBeFocused();
  await nav
    .getByRole("button", { name: "Organization identity", exact: true })
    .click();
  await expect(page.locator('input[name="name"]')).toHaveValue(
    "Example navigation test",
  );
  await page.getByLabel("Profile view", { exact: true }).selectOption("full");
  await expect(
    nav.getByRole("button", { name: /Certifications/ }),
  ).toBeVisible();
  const collections = page.locator(
    '.a-collection[data-presentation="generic"]',
  );
  await expect(collections).toHaveCount(6);
  for (let i = 0; i < 6; i++) {
    const collection = collections.nth(i);
    await collection.getByRole("button", { name: /^Add / }).first().click();
    const row = collection.locator(":scope > details").first();
    await expect(row).toHaveAttribute("open", "");
    const textField = row
      .locator('input[type="text"], input[type="password"]')
      .first();
    if (await textField.count()) await textField.fill("Example entry");
    await row
      .getByRole("button", { name: /^Remove / })
      .last()
      .click();
    if ((await collection.locator(":scope > details").count()) === 0) continue;
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(row).toBeVisible();
    await row
      .getByRole("button", { name: /^Remove / })
      .last()
      .click();
    await dialog.getByRole("button", { name: /^Remove / }).click();
    await expect(collection.locator(":scope > details")).toHaveCount(0);
  }
  await nav.getByRole("button", { name: /Alternate names/ }).click();
  await page.screenshot({ path: output + "/profile-collections.png" });
  assert.deepEqual(errors, []);
  const receipt = {
    passed: true,
    checkedAt: new Date().toISOString(),
    desktop: true,
    collectionsChecked: 6,
    addCancelRemove: true,
    metadataNavigation: true,
    preservesEdits: true,
    liveCasesCreated: 0,
    browserErrors: errors,
  };
  writeFileSync(
    "governance/policy/reports/profile-collections-browser.dev.json",
    JSON.stringify(receipt, null, 2),
  );
  console.log(JSON.stringify(receipt));
} catch (error) {
  await page
    .getByText("Technical details", { exact: true })
    .click({ timeout: 500 })
    .catch(() => {});
  console.log(
    JSON.stringify({
      errors,
      body: (await page.locator("body").innerText()).slice(-4000),
    }),
  );
  await page.screenshot({ path: output + "/failure.png", fullPage: true });
  throw error;
} finally {
  await context.close();
  await browser.close();
}
