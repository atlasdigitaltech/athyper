import { artifactDirectory } from "../artifact-paths.mjs";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
const output = artifactDirectory("collection-presentations", "dev");
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  storageState: "tests/e2e/.auth/dev/neon/catl.admin.json",
  viewport: { width: 1500, height: 1050 },
});
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
  const addresses = page.locator(
      '.a-collection[data-presentation="addresses"]',
    ),
    contacts = page.locator('.a-collection[data-presentation="contacts"]'),
    banks = page.locator('.a-collection[data-presentation="bank-accounts"]');
  assert.equal(await addresses.count(), 1);
  assert.equal(await contacts.count(), 1);
  assert.equal(await banks.count(), 1);
  await addresses.locator(":scope > details > summary").first().click();
  assert.ok(await addresses.getByLabel("Address line 1").isVisible());
  await contacts.locator(":scope > details > summary").first().click();
  assert.equal(
    await contacts
      .locator('.a-collection[data-presentation="channels"]')
      .count(),
    1,
  );
  await banks
    .getByRole("button", { name: "Add bank account", exact: true })
    .click();
  await banks.getByLabel("Bank name").fill("Collection preview bank");
  await banks.getByLabel("IBAN / Account number").fill("123456789012");
  await banks
    .getByRole("button", { name: "Add document", exact: true })
    .click();
  assert.equal(
    await banks
      .locator(
        '.a-collection[data-presentation="documents"] input[type="file"]',
      )
      .count(),
    1,
  );
  await banks.locator(":scope > details > summary").click();
  const summary = await banks.locator(":scope > details > summary").innerText();
  assert.ok(summary.includes("9012"));
  assert.ok(!summary.includes("123456789012"));
  await banks.locator(":scope > details > summary").click();
  await page.getByLabel("Profile view", { exact: true }).selectOption("full");
  const certs = page.locator(
    '.a-collection[data-presentation="certifications"]',
  );
  await certs
    .getByRole("button", { name: "Add certificate", exact: true })
    .click();
  await certs
    .getByLabel("Certificate name")
    .fill("Example quality certificate");
  await certs
    .getByRole("button", { name: "Add document", exact: true })
    .click();
  await expect(certs.locator('input[type="file"]')).toHaveCount(1);
  await banks.scrollIntoViewIfNeeded();
  await banks.screenshot({ path: `${output}/live-bank-desktop.png` });
  await certs.scrollIntoViewIfNeeded();
  await certs.screenshot({ path: `${output}/live-certifications-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await banks.scrollIntoViewIfNeeded();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "Mobile page overflow",
  );
  await banks.screenshot({ path: `${output}/live-bank-mobile.png` });
  assert.deepEqual(errors, []);
  const receipt = {
    checkedAt: new Date().toISOString(),
    url: page.url(),
    passed: true,
    presentations: [
      "addresses",
      "contacts",
      "bank-accounts",
      "certifications",
      "documents",
      "channels",
    ],
    accountSummaryMasked: true,
    desktop: true,
    mobile: true,
    mutationsBlocked: true,
    blockedRequests: blocked,
    liveCasesCreated: 0,
    browserErrors: errors,
  };
  writeFileSync(
    "governance/policy/reports/collection-presentations-browser.dev.json",
    JSON.stringify(receipt, null, 2) + "\n",
  );
  console.log(JSON.stringify(receipt, null, 2));
} catch (error) {
  console.log(
    JSON.stringify({
      certification: await page
        .locator(".a-collection[data-presentation=certifications]")
        .innerText()
        .catch(() => ""),
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
