import { artifactDirectory } from "../artifact-paths.mjs";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
const output = artifactDirectory("bank-change-popups", "dev");
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

  const banks = page.locator(
    '.a-collection[data-presentation="bank-accounts"]',
  );

  await banks
    .getByRole("button", { name: "Add bank account", exact: true })
    .click();
  const row = banks.locator(":scope > details").last();
  const country = row.getByRole("combobox", {
    name: "Bank country",
    exact: true,
  });
  const choose = async (name: string) => {
    await country.fill(name);
    await page
      .getByRole("option", { name: new RegExp(name) })
      .first()
      .click();
  };
  await choose("Malaysia");
  await row.getByLabel("Bank selection").selectOption("unlisted");
  await row.getByLabel("Bank name").fill("Example bank");
  await row.getByLabel("Account holder name").fill("Example holder");
  await row.getByLabel("Account number").fill("00123456789");
  await choose("Saudi Arabia");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAccessibleName(
    "Change bank country to Saudi Arabia?",
  );
  await expect(country).toHaveValue("Malaysia");
  await dialog.getByRole("button", { name: "Keep Malaysia" }).click();
  await expect(country).toBeFocused();
  await expect(row.getByLabel("Bank name")).toHaveValue("Example bank");
  await row.getByLabel("Bank selection").selectOption("directory");
  await expect(dialog).toHaveAccessibleName("Change bank selection?");
  await page.keyboard.press("Escape");
  await expect(row.getByLabel("Bank selection")).toHaveValue("unlisted");
  await row.getByLabel("Bank selection").selectOption("directory");
  await dialog
    .getByRole("button", { name: "Change bank selection", exact: true })
    .click();
  await expect(row.getByLabel("Account number")).toHaveValue("00123456789");
  await expect(row.getByLabel("Account holder name")).toHaveValue(
    "Example holder",
  );
  await row.getByLabel("Bank selection").selectOption("unlisted");
  await expect(dialog).toHaveCount(0);
  await choose("Saudi Arabia");
  await expect(dialog).toHaveAccessibleName(
    "Change bank country to Saudi Arabia?",
  );
  await page.screenshot({ path: output + "/country-popup.png" });
  await dialog
    .getByRole("button", { name: "Change country", exact: true })
    .click();
  await expect(row.getByLabel("IBAN")).toHaveValue("00123456789");
  await expect(row.getByLabel("Account holder name")).toHaveValue(
    "Example holder",
  );
  assert.deepEqual(errors, []);
  const receipt = {
    passed: true,
    checkedAt: new Date().toISOString(),
    countryDialog: true,
    bankSelectionDialog: true,
    cancelAndEscape: true,
    preservedAccountDetails: true,
    liveCasesCreated: 0,
    browserErrors: errors,
  };
  writeFileSync(
    "governance/policy/reports/bank-change-popups-browser.dev.json",
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
