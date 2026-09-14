import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  storageState: "tests/e2e/.auth/dev/neon/catl.admin.json",
  viewport: { width: 1600, height: 1200 },
});
const page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
// Inspect the form without creating or updating business records.
await page.route("**/*", async (route) => {
  const path = new URL(route.request().url()).pathname;
  if (
    !["GET", "HEAD"].includes(route.request().method()) &&
    !path.startsWith("/api/auth/")
  )
    await route.abort();
  else await route.continue();
});
try {
  const session = await (
    await context.request.get("https://neon.dev.athyper.test/api/auth/session")
  ).json();
  assert.equal(session.state, "authenticated");
  assert.equal(session.principalId, "cca94907-7519-5871-8e3c-6b11aa545c93");
  const response = await context.request.get(
    "https://neon.dev.athyper.test/api/relay/entity-runtime/business_partner/application-descriptor",
  );
  assert.equal(response.status(), 200);
  const descriptor = await response.json();
  const fields = descriptor.intakeSurfaces.flatMap((s: any) =>
    s.sections.flatMap((section: any) => section.fields),
  );
  for (const key of ["address_line1", "address_city"])
    assert.equal(fields.find((f: any) => f.key === key)?.required, true);
  const addresses = fields.find(
    (f: any) => f.itemSurfaceKey === "partner_address_intake",
  );
  assert.deepEqual(addresses.itemFieldRules, [
    {
      when: {
        field: "details_profile_mode",
        operator: "equals",
        value: "full",
      },
      fields: ["line1", "city"],
      required: false,
    },
  ]);
  await page.goto("https://neon.dev.athyper.test/mdg/business-partner/new", {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("radio", { name: /Supplier/ }).check({ timeout: 15000 });
  await page
    .getByRole("button", { name: "Onboard new supplier", exact: true })
    .click();
  await page.locator('input[name="name"]').waitFor();
  const mode = page.getByLabel("Profile view", { exact: true });
  await mode.waitFor();
  const line = page.locator('input[name$=".line1"]');
  const city = page.locator('input[name$=".city"]');
  const checks = [];
  for (const profileMode of ["standard", "full", "standard"]) {
    await mode.selectOption(profileMode);
    assert.equal(await mode.inputValue(), profileMode);
    await line.waitFor({ state: "attached" });
    await city.waitFor({ state: "attached" });
    const values = [];
    for (const [key, locator] of [
      ["line1", line],
      ["city", city],
    ] as const) {
      const actual = await locator.evaluate((input: HTMLInputElement) => ({
        required: input.required,
        empty: input.value === "",
        valueMissing: input.validity.valueMissing,
      }));
      assert.equal(actual.empty, true);
      assert.equal(actual.required, profileMode === "standard");
      assert.equal(actual.valueMissing, profileMode === "standard");
      values.push({ key, ...actual });
    }
    checks.push({ profileMode, fields: values });
  }
  assert.deepEqual(errors, []);
  const path =
    "governance/policy/reports/business-partner-address-repair-activation.dev.json";
  const receipt = JSON.parse(readFileSync(path, "utf8"));
  receipt.runtimeVerification.browserVerification = {
    checkedAt: new Date().toISOString(),
    passed: true,
    mode: "live_read_only",
    descriptorVerified: true,
    checks,
    pageErrors: errors,
  };
  writeFileSync(path, JSON.stringify(receipt, null, 2) + "\n");
  console.log(JSON.stringify(receipt.runtimeVerification.browserVerification));
} catch (error) {
  console.error(
    JSON.stringify({
      url: page.url(),
      pageErrors: errors,
      body: (
        await page
          .locator("body")
          .innerText()
          .catch(() => "")
      ).slice(0, 2200),
    }),
  );
  throw error;
} finally {
  await context.close();
  await browser.close();
}
