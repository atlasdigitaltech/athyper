import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  storageState: "tests/e2e/.auth/dev/neon/catl.admin.json",
  viewport: { width: 1600, height: 1200 },
});
const page = await context.newPage(),
  errors: string[] = [];
let draft: any;
await page.route("**/*", async (route) => {
  const path = new URL(route.request().url()).pathname;
  if (
    !["GET", "HEAD"].includes(route.request().method()) &&
    !path.startsWith("/api/auth/")
  ) {
    if (path.endsWith("/business-partner-cases"))
      draft = route.request().postDataJSON();
    await route.abort();
  } else await route.continue();
});
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto("https://neon.dev.athyper.test/mdg/business-partner/new", {
    waitUntil: "domcontentloaded",
  });
  await page
    .getByRole("radio", { name: /Supplier/ })
    .check({ timeout: 10000 })
    .catch(async (error) => {
      console.log(
        JSON.stringify({
          url: page.url(),
          errors,
          body: (await page.locator("body").innerText()).slice(0, 1600),
        }),
      );
      throw error;
    });
  await page
    .getByRole("button", { name: "Onboard new supplier", exact: true })
    .click();
  await page.locator('input[name="name"]').waitFor();
  const view = page.getByLabel("Profile view", { exact: true });
  await view.waitFor();
  assert.equal(await view.inputValue(), "standard");
  await view.selectOption("full");
  const aliases = page
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: "Alternate names" }) });
  await aliases.locator("summary").click();
  await aliases.getByRole("button", { name: "Add alias", exact: true }).click();
  await aliases
    .getByLabel("Alias name *", { exact: true })
    .fill("Prototype trading name");
  await view.selectOption("standard");
  assert.equal(await view.inputValue(), "full");
  await aliases
    .getByRole("button", { name: "Remove alias", exact: true })
    .click();
  await view.selectOption("standard");
  assert.equal(await view.inputValue(), "standard");
  await view.selectOption("full");

  // Capture the outgoing draft command in the browser; do not create a live case.

  await page
    .locator('input[name="name"]')
    .fill("Prototype profile verification");
  for (const label of ["Registration country", "Country"]) {
    const chooser = page.getByRole("combobox", { name: label, exact: true });
    await chooser.fill("Malaysia");
    await page
      .getByRole("option", { name: /Malaysia/ })
      .first()
      .click();
  }
  await page
    .getByLabel("Contact name *", { exact: true })
    .fill("Prototype Contact");
  await page
    .getByLabel("Contact detail *", { exact: true })
    .fill("prototype@example.invalid");
  if (
    !(await aliases.evaluate((element) => (element as HTMLDetailsElement).open))
  )
    await aliases.locator("summary").click();
  await aliases.getByRole("button", { name: "Add alias", exact: true }).click();
  await aliases
    .getByLabel("Alias name *", { exact: true })
    .fill("Prototype trading name");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page
    .waitForFunction(
      () =>
        document.body.textContent?.includes("Failed to fetch") ||
        document.body.textContent?.includes("Network"),
      {},
      { timeout: 5000 },
    )
    .catch(() => {});
  assert.ok(draft, "Draft command was intercepted before persistence");
  assert.equal(draft.extensions.aliases[0].aliasName, "Prototype trading name");
  assert.equal(draft.extensions.addresses[0].countryCode, "MY");
  assert.equal(draft.extensions.contactPersons.length, 1);
  assert.equal(draft.proposedPayload.tenantFields.profileMode, "full");
  await page.screenshot({
    path: "/tmp/business-partner-full-profile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  const proof = {
    verifiedAt: new Date().toISOString(),
    standardDefault: true,
    metadataFullProfile: true,
    repeatableAlias: true,
    viewChangePreventsDataLoss: true,
    pageErrors: errors,
    draftCommandCaptured: true,
    recordsCreated: 0,
  };
  mkdirSync("governance/policy/reports", { recursive: true });
  writeFileSync(
    "governance/policy/reports/business-partner-full-profile-browser.dev.json",
    JSON.stringify(proof, null, 2) + "\n",
  );
  console.log(JSON.stringify(proof));
} finally {
  await context.close();
  await browser.close();
}
