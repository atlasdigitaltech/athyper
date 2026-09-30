import { artifactDirectory } from "../artifact-paths.mjs";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
const output = artifactDirectory("address-region", "dev");
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
  const addresses = page.locator(
    '.a-collection[data-presentation="addresses"]',
  );
  const row = addresses.locator(":scope > details").first();
  await row.locator(":scope > summary").click();
  await addresses
    .getByRole("combobox", { name: "Country", exact: true })
    .fill("Malaysia");
  await page.getByRole("option", { name: /Malaysia/ }).click();
  await addresses.getByLabel("Address line 1").fill("Example Tower");
  await addresses.getByLabel("City", { exact: true }).fill("Shah Alam");
  await addresses
    .getByRole("combobox", { name: "State", exact: true })
    .fill("Selangor");
  await page.getByRole("option", { name: /Selangor/ }).click();
  await addresses.getByLabel("Postcode", { exact: true }).fill("01234");
  await row.getByRole("button", { name: "Done", exact: true }).click();
  await expect(row).not.toHaveAttribute("open");
  await expect(row.locator(":scope > summary")).toContainText("Selangor");
  await row.locator(":scope > summary").click();
  await addresses
    .getByRole("combobox", { name: "Country", exact: true })
    .fill("Singapore");
  await page.getByRole("option", { name: /Singapore/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Keep Malaysia", exact: true })
    .click();
  await expect(
    addresses.getByRole("combobox", { name: "State", exact: true }),
  ).toHaveValue("Selangor");
  await addresses
    .getByRole("combobox", { name: "Country", exact: true })
    .fill("Singapore");
  await page.getByRole("option", { name: /Singapore/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Change country", exact: true })
    .click();
  await expect(addresses.getByLabel("Address line 1")).toHaveValue(
    "Example Tower",
  );
  await expect(
    addresses.getByLabel("Postal code", { exact: true }),
  ).toHaveValue("01234");
  await addresses
    .getByLabel("State / Region entry", { exact: true })
    .selectOption("manual");
  await addresses.getByLabel("District", { exact: true }).fill("Central");
  await addresses.getByLabel("Postal code", { exact: true }).fill("018956");
  await row.getByRole("button", { name: "Done", exact: true }).click();
  await expect(row).not.toHaveAttribute("open");
  await expect(row.locator(":scope > summary")).toContainText("Central");
  await addresses
    .getByRole("button", { name: "Add address", exact: true })
    .click();
  const second = addresses.locator(":scope > details").nth(1);
  await second
    .getByRole("combobox", { name: "Country", exact: true })
    .fill("Singapore");
  await page.getByRole("option", { name: /Singapore/ }).click();
  await second.getByLabel("Address line 1").fill("example tower");
  await second.getByLabel("City", { exact: true }).fill("Shah Alam");
  await second
    .getByLabel("State / Region entry", { exact: true })
    .selectOption("manual");
  await second.getByLabel("District", { exact: true }).fill("Central");
  await second.getByLabel("Postal code", { exact: true }).fill("018956");
  await expect(addresses.locator(".a-collection__duplicate")).toHaveCount(2);
  await second.getByLabel("Address line 1").fill("Different Tower");
  await expect(addresses.locator(".a-collection__duplicate")).toHaveCount(0);
  await second.getByRole("button", { name: "Done", exact: true }).click();
  await row.locator(":scope > summary").click();
  await row.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/region-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: `${output}/region-mobile.png` });
  assert.deepEqual(errors, []);
  const receipt = {
    checkedAt: new Date().toISOString(),
    url: page.url(),
    passed: true,
    presentations: ["addresses"],
    countryLookup: true,
    countryChangeConfirmation: true,
    manualFallback: true,
    duplicateWarning: true,
    desktop: true,
    mobile: true,
    mutationsBlocked: true,
    blockedRequests: blocked,
    liveCasesCreated: 0,
    browserErrors: errors,
  };
  writeFileSync(
    "governance/policy/reports/address-region-browser.dev.json",
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
