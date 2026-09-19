import { artifactDirectory } from "../artifact-paths.mjs";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
const output = artifactDirectory("bank-country-capture", "dev");
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
  for (const [country, account] of Object.entries({
    Malaysia: "00123456789",
    "Saudi Arabia": "SA03 8000 0000 6080 1016 7519",
    Egypt: "EG38 0019 0005 0000 0000 2631 8000 2",
    India: "00123456789",
    Qatar: "QA58 DOHB 0000 1234 5678 90AB CDEF G",
  })) {
    await banks
      .getByRole("button", { name: "Add bank account", exact: true })
      .click();
    const row = banks.locator(":scope > details").last();
    await row
      .getByRole("combobox", { name: "Bank country", exact: true })
      .fill(country);
    await page
      .getByRole("option", { name: new RegExp(country) })
      .first()
      .click();
    await row.getByLabel("Bank selection").selectOption("unlisted");
    await row.getByLabel("Bank name").fill("Example bank");
    await expect(
      row.getByRole("combobox", { name: "Account number format", exact: true }),
    ).toHaveCount(0);
    await row.getByLabel("Account holder name").fill("Example account holder");
    const iban = !["Malaysia", "India"].includes(country);
    await row.getByLabel(iban ? "IBAN" : "Account number").fill(account);
    if (country === "India") await row.getByLabel("IFSC").fill("ABCD0123456");
    else
      await expect(
        row.getByRole("textbox", { name: "Local routing code", exact: true }),
      ).toHaveCount(0);
    for (const text of [
      "Unlisted bank details are captured",
      "Directory selection fills",
      "Enter the name held",
      "Formats follow",
      "Enter the account number exactly",
    ])
      await expect(row.getByText(text, { exact: false })).toHaveCount(0);
    await row.getByRole("button", { name: "Done", exact: true }).click();
    await expect(row).not.toHaveAttribute("open");
    console.log(country + " passed");
  }
  await banks.scrollIntoViewIfNeeded();
  await page.screenshot({ path: output + "/countries-desktop.png" });
  assert.deepEqual(errors, []);
  const receipt = {
    passed: true,
    countries: ["MY", "SA", "EG", "IN", "QA"],
    checkedAt: new Date().toISOString(),
    liveCasesCreated: 0,
    browserErrors: errors,
  };
  writeFileSync(
    "governance/policy/reports/bank-country-capture-browser.dev.json",
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
