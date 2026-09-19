import { artifactDirectory } from "../artifact-paths.mjs";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
const output = artifactDirectory("bank-editor", "dev");
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
  console.log("Form ready");
  await page.locator('input[name="name"]').fill("Registered Example");
  const banks = page.locator(
    '.a-collection[data-presentation="bank-accounts"]',
  );
  await banks
    .getByRole("button", { name: "Add bank account", exact: true })
    .click();
  const choose = async (label: string, query: string) => {
    await banks.getByRole("combobox", { name: label, exact: true }).fill(query);
    await page
      .getByRole("option", { name: new RegExp(query) })
      .first()
      .click();
  };
  console.log("Bank added");
  await choose("Bank country", "Malaysia");
  await expect(banks.getByText(/No published banks/)).toBeVisible();
  console.log("Directory empty confirmed");
  await banks.getByLabel("Bank selection").selectOption("unlisted");
  await banks.getByLabel("Bank name").fill("Unlisted example bank");
  await banks.getByLabel("SWIFT / BIC").fill("MBBYEXX");
  await banks.getByLabel("Branch", { exact: true }).click();
  await expect(banks.getByLabel("SWIFT / BIC")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await banks.getByLabel("SWIFT / BIC").fill("MBBEMYKL");
  await banks.getByLabel("Branch", { exact: true }).fill("Example branch");
  await expect(banks.getByLabel("SWIFT / BIC")).not.toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await choose("Account identifier type", "Local account");
  await banks.getByLabel("Account number").fill("123456789012");
  await banks.getByRole("button", { name: "Use registered name" }).click();
  await expect(banks.getByLabel("Account holder name")).toHaveValue(
    "Registered Example",
  );
  await banks.getByRole("button", { name: "Show", exact: true }).click();
  await expect(banks.getByLabel("Account number")).toHaveAttribute(
    "type",
    "text",
  );
  await banks.getByRole("button", { name: "Hide", exact: true }).click();
  await choose("Bank country", "Singapore");
  await banks.getByRole("button", { name: "Confirm change" }).click();
  await expect(banks.getByLabel("IBAN / Account number")).toHaveValue(
    "123456789012",
  );
  await expect(banks.getByLabel("Account holder name")).toHaveValue(
    "Registered Example",
  );
  await expect(banks.getByLabel("SWIFT / BIC")).toHaveValue("");
  await banks
    .getByRole("button", { name: "Add document", exact: true })
    .click();
  await expect(banks.locator('input[type="file"]')).toHaveCount(1);
  await banks.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/live-bank-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Mobile overflow",
  );
  await page.screenshot({ path: `${output}/live-bank-mobile.png` });
  assert.deepEqual(errors, []);
  const receipt = {
    checkedAt: new Date().toISOString(),
    url: page.url(),
    passed: true,
    presentations: ["bank-accounts", "documents"],
    accountVisibilityToggle: true,
    dependentClearingPreservesAccount: true,
    liveDirectoryEmpty: true,
    desktop: true,
    mobile: true,
    mutationsBlocked: true,
    blockedRequests: blocked,
    liveCasesCreated: 0,
    browserErrors: errors,
  };
  writeFileSync(
    "governance/policy/reports/bank-editor-browser.dev.json",
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
