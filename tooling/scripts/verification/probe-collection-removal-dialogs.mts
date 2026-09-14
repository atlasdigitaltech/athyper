import { artifactDirectory } from "../artifact-paths.mjs";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
const output = artifactDirectory("collection-removal-dialogs", "dev");
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
  for (const title of ["Bank details", "Account details"]) {
    await expect(
      banks.getByRole("heading", { name: title, exact: true }),
    ).toHaveClass(/a-subsection-header/);
  }
  const documents = banks.locator(
    '.a-collection[data-presentation="documents"]',
  );
  await expect(
    documents.getByRole("heading", {
      name: "Supporting documents (1)",
      exact: true,
    }),
  ).toBeVisible();
  await expect(documents.locator(":scope > .a-subsection-header")).toHaveCount(
    1,
  );
  const bars = [
    banks.getByRole("heading", { name: "Bank details", exact: true }),
    banks.getByRole("heading", { name: "Account details", exact: true }),
    documents.locator(":scope > .a-subsection-header"),
  ];
  const dimensions = await Promise.all(
    bars.map((bar) =>
      bar.evaluate((node) => {
        const r = node.getBoundingClientRect();
        return { x: r.x, width: r.width, height: r.height };
      }),
    ),
  );
  for (const d of dimensions) {
    assert.ok(Math.abs(d.width - dimensions[0]!.width) < 2);
    assert.ok(Math.abs(d.height - dimensions[0]!.height) < 2);
    assert.ok(Math.abs(d.x - dimensions[0]!.x) < 2);
  }
  console.log({ subsectionDimensions: dimensions });
  await banks
    .getByRole("heading", { name: "Bank details", exact: true })
    .evaluate((node) => node.scrollIntoView({ block: "center" }));
  await page.screenshot({ path: `${output}/live-bank-desktop.png` });
  await documents
    .getByRole("heading", { name: "Supporting documents (1)", exact: true })
    .evaluate((node) => node.scrollIntoView({ block: "center" }));
  await page.screenshot({ path: `${output}/live-documents-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Mobile overflow",
  );
  await page.screenshot({ path: `${output}/live-bank-mobile.png` });
  await documents.getByLabel("Document type").selectOption({ index: 1 });
  const removeDocument = documents.getByRole("button", {
    name: "Remove document",
    exact: true,
  });
  await removeDocument.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCount(1);
  await expect(dialog).toContainText(
    "This document will be removed from this request.",
  );
  await expect(
    dialog.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  assert.ok(
    await dialog.evaluate((node) => {
      const r = node.getBoundingClientRect();
      return r.x >= 0 && r.right <= innerWidth;
    }),
  );
  await page.screenshot({ path: `${output}/document-dialog-mobile.png` });
  await page.keyboard.press("Escape");
  await expect(removeDocument).toBeFocused();
  await removeDocument.click();
  await dialog
    .getByRole("button", { name: "Remove document", exact: true })
    .click();
  await expect(
    documents.getByRole("heading", {
      name: "Supporting documents (0)",
      exact: true,
    }),
  ).toBeVisible();
  await documents
    .getByRole("button", { name: "Add document", exact: true })
    .click();
  await banks.getByLabel("Bank name").fill("Example bank");
  await page.setViewportSize({ width: 1500, height: 1050 });
  const removeBank = banks.getByRole("button", {
    name: "Remove bank account",
    exact: true,
  });
  await removeBank.click();
  await expect(dialog).toHaveAccessibleName("Remove Example bank · •••• 9012?");
  await expect(dialog).toContainText("supporting document entries (1)");
  await expect(
    dialog.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await page.screenshot({ path: `${output}/bank-dialog-desktop.png` });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(removeBank).toBeFocused();
  await removeBank.click();
  await dialog
    .getByRole("button", { name: "Remove bank account", exact: true })
    .click();
  await expect(
    banks.getByRole("heading", { name: "Bank accounts (0)", exact: true }),
  ).toBeVisible();
  await expect(
    banks.getByRole("button", { name: "Add bank account", exact: true }),
  ).toBeFocused();
  assert.deepEqual(errors, []);
  const receipt = {
    checkedAt: new Date().toISOString(),
    url: page.url(),
    passed: true,
    presentations: ["bank-accounts", "documents"],
    documentRemovalDialog: true,
    bankRemovalDialog: true,
    cancelAndEscapeRestoreFocus: true,
    subsectionHeaders: true,
    documentHeadingCount: true,
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
    "governance/policy/reports/collection-removal-dialogs-browser.dev.json",
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
