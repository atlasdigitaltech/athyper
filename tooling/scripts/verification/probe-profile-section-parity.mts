import { artifactDirectory } from "../artifact-paths.mjs";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
const output = artifactDirectory("profile-section-parity", "dev");
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
  const contacts = page.locator('.a-collection[data-presentation="contacts"]');
  const row = contacts.locator(":scope > details").first();
  await expect(row.locator(":scope > summary strong")).toHaveText("Contact 1");
  await row.locator(":scope > summary").click();
  await contacts.getByLabel("Contact name").fill("Alex Example");
  await contacts.getByLabel("Business title").fill("Finance manager");
  await expect(row.locator(":scope > summary strong")).toHaveText(
    "Alex Example",
  );
  await expect(
    contacts.getByRole("heading", { name: "Contact details", exact: true }),
  ).toHaveClass(/a-subsection-header/);
  await expect(
    contacts.getByRole("heading", {
      name: "Communication channels (1)",
      exact: true,
    }),
  ).toBeVisible();
  const channels = contacts.locator(
    '.a-collection[data-presentation="channels"]',
  );
  await channels.locator(":scope > details > summary").click();
  await channels.getByLabel("Contact detail").fill("alex@example.test");
  await expect(row.locator(":scope > summary")).toContainText(
    "alex@example.test",
  );
  await expect(
    channels.locator(":scope > details > summary strong"),
  ).toContainText("alex@example.test");
  const primary = contacts.getByRole("radio", {
    name: "Primary contact",
    exact: true,
  });
  await expect(primary.locator("..")).toHaveClass(/field--primary/);
  assert.equal(
    await primary
      .locator("..")
      .evaluate((n) => getComputedStyle(n).flexDirection),
    "row",
  );
  await contacts
    .getByRole("heading", { name: "Contact details", exact: true })
    .evaluate((n) => n.scrollIntoView({ block: "center" }));
  await page.screenshot({ path: `${output}/contacts-desktop.png` });
  await channels
    .getByRole("button", { name: "Add channel", exact: true })
    .click();
  const second = channels.locator(":scope > details").last();
  await second.getByLabel("Contact detail").fill("other@example.test");
  await second
    .getByRole("button", { name: "Remove channel", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove channel", exact: true })
    .click();
  await expect(
    channels.getByRole("heading", {
      name: "Communication channels (1)",
      exact: true,
    }),
  ).toBeVisible();
  const addresses = page.locator(
    '.a-collection[data-presentation="addresses"]',
  );
  await addresses.locator(":scope > details > summary").first().click();
  await addresses.getByLabel("Address line 1").fill("12 Example Street");
  await expect(
    addresses.locator(":scope > details > summary strong").first(),
  ).toHaveText("12 Example Street");
  await expect(
    addresses.getByRole("heading", { name: "Address details", exact: true }),
  ).toHaveClass(/a-subsection-header/);
  await addresses
    .getByRole("heading", { name: "Purpose and country", exact: true })
    .evaluate((n) => n.scrollIntoView({ block: "center" }));
  await page.screenshot({ path: `${output}/addresses-desktop.png` });
  const certs = page.locator(
    '.a-collection[data-presentation="certifications"]',
  );
  await certs
    .getByRole("button", { name: "Add certificate", exact: true })
    .click();
  await certs.getByLabel("Certificate name").fill("Example certificate");
  await expect(
    certs.getByRole("heading", { name: "Validity and scope", exact: true }),
  ).toHaveClass(/a-subsection-header/);
  await expect(
    certs.getByRole("heading", {
      name: "Supporting documents (0)",
      exact: true,
    }),
  ).toBeVisible();
  await certs
    .getByRole("heading", { name: "Certificate details", exact: true })
    .evaluate((n) => n.scrollIntoView({ block: "center" }));
  await page.screenshot({ path: `${output}/certifications-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await contacts
    .getByRole("heading", { name: "Contact details", exact: true })
    .evaluate((n) => n.scrollIntoView({ block: "center" }));
  await page.screenshot({ path: `${output}/contacts-mobile.png` });
  assert.deepEqual(errors, []);
  const receipt = {
    checkedAt: new Date().toISOString(),
    url: page.url(),
    passed: true,
    presentations: ["addresses", "contacts", "certifications", "channels"],
    primaryContactSummary: true,
    namedTitleFallback: true,
    channelRemovalDialog: true,
    desktop: true,
    mobile: true,
    mutationsBlocked: true,
    blockedRequests: blocked,
    liveCasesCreated: 0,
    browserErrors: errors,
  };
  writeFileSync(
    "governance/policy/reports/profile-section-parity-browser.dev.json",
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
