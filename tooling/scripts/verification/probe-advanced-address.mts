import { artifactDirectory } from "../artifact-paths.mjs";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
const output = artifactDirectory("advanced-address", "dev");
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
  const advanced = addresses.locator("details.a-data-section--collapsible");
  await expect(advanced).not.toHaveAttribute("open");
  await addresses
    .getByRole("combobox", { name: "Country", exact: true })
    .fill("Malaysia");
  await page.getByRole("option", { name: /Malaysia/ }).click();
  await addresses.getByLabel("Address line 1").fill("Example Tower");
  await addresses.getByLabel("City", { exact: true }).fill("Kuala Lumpur");
  await advanced.locator(":scope > summary").click();
  await addresses.getByLabel("Building name").fill("Q Sentral");
  await addresses.getByLabel("Floor", { exact: true }).fill("31");
  await addresses.getByLabel("Unit / Suite").fill("BC13");
  await advanced.locator(":scope > summary").click();
  await expect(advanced.locator(":scope > summary")).toContainText(
    "Unit / Suite: BC13",
  );
  await advanced.locator(":scope > summary").click();
  await addresses.getByLabel("Address kind").selectOption("po_box");
  await addresses
    .getByRole("button", { name: "Keep current", exact: true })
    .click();
  await expect(addresses.getByLabel("Building name")).toHaveValue("Q Sentral");
  await addresses.getByLabel("Address kind").selectOption("po_box");
  await addresses
    .getByRole("button", { name: "Change address kind", exact: true })
    .click();
  await expect(addresses.getByLabel("PO box number")).toBeVisible();
  await expect(addresses.getByLabel("Building name")).toBeHidden();
  await expect(addresses.getByLabel("Address line 1")).toHaveValue(
    "Example Tower",
  );
  await advanced.locator(":scope > summary").click();
  await row.getByRole("button", { name: "Done", exact: true }).click();
  await expect(advanced).toHaveAttribute("open");
  await expect(addresses.getByLabel("PO box number")).toBeFocused();
  await addresses.getByLabel("PO box number").fill("127");
  await advanced
    .locator(":scope > summary")
    .evaluate((n) => n.scrollIntoView({ block: "center" }));
  await page.screenshot({
    path: `output-placeholder/po-box-desktop.png`.replace(
      "output-placeholder",
      output,
    ),
  });
  await row.getByRole("button", { name: "Done", exact: true }).click();
  await expect(row).not.toHaveAttribute("open");
  await row.locator(":scope > summary").click();
  await expect(addresses.getByLabel("PO box number")).toHaveValue("127");
  await addresses.getByLabel("Address kind").selectOption("street");
  await addresses
    .getByRole("button", { name: "Change address kind", exact: true })
    .click();
  await addresses.getByLabel("Building name").fill("Q Sentral");
  await addresses.getByLabel("Floor", { exact: true }).fill("31");
  await addresses.getByLabel("Unit / Suite").fill("BC13");
  await advanced
    .locator(":scope > summary")
    .evaluate((n) => n.scrollIntoView({ block: "center" }));
  await page.screenshot({ path: `${output}/street-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: `${output}/street-mobile.png` });
  assert.deepEqual(errors, []);
  const receipt = {
    checkedAt: new Date().toISOString(),
    url: page.url(),
    passed: true,
    presentations: ["addresses"],
    advancedDetails: true,
    kindChangeConfirmation: true,
    poBoxRequired: true,
    desktop: true,
    mobile: true,
    mutationsBlocked: true,
    blockedRequests: blocked,
    liveCasesCreated: 0,
    browserErrors: errors,
  };
  writeFileSync(
    "governance/policy/reports/advanced-address-browser.dev.json",
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
