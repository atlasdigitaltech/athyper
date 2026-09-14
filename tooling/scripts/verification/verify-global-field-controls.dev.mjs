/** Read-only browser smoke of deployed DEV controls; does not submit business data. */
import { chromium, expect } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const root = join(homedir(), ".athyper/deployments/global-field-controls");
const browser = await chromium.launch();
const evidence = {
  capturedAt: new Date().toISOString(),
  pageErrors: [],
  historyRequests: [],
  failedRequests: [],
};
try {
  const page = await browser.newPage({
    ignoreHTTPSErrors: true,
    storageState: "tests/e2e/.auth/dev/neon/catl.admin.json",
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (e) => evidence.pageErrors.push(e.message));
  page.on("request", (r) => {
    if (/reference.*recent|choice.*recent|reference-history/.test(r.url()))
      evidence.historyRequests.push({
        method: r.method(),
        path: new URL(r.url()).pathname,
      });
  });
  page.on("response", (r) => {
    if (r.status() >= 400)
      evidence.failedRequests.push({
        status: r.status(),
        path: new URL(r.url()).pathname,
      });
  });
  await page.goto("https://neon.dev.athyper.test/mdg/business-partner/new");
  await page.getByText("Supplier", { exact: true }).click();
  await page
    .getByRole("button", { name: "Onboard new supplier", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  const countryRow = page
    .getByRole("dialog")
    .locator(".a-entity-list__filter-row")
    .filter({ hasText: "Country" });
  await expect(countryRow.locator("select")).toHaveValue("eq");
  evidence.countryFilterDefault = "eq";
  const filterCountry = page.getByRole("combobox", {
    name: /^Value for Country filter/,
  });
  await filterCountry.click();
  const filterSearch = page.getByRole("combobox", {
    name: "Search by name or code…",
    exact: true,
  });
  await filterSearch.fill("Malaysia");
  await expect(
    page.getByRole("option").filter({ hasText: "Malaysia" }).first(),
  ).toBeVisible();
  const bounds = await page.getByRole("listbox").boundingBox();
  if (
    !bounds ||
    bounds.x < 0 ||
    bounds.y < 0 ||
    bounds.x + bounds.width > 1441 ||
    bounds.y + bounds.height > 1001
  )
    throw Error("Country filter popup outside viewport");
  evidence.drawerPopupWithinViewport = true;
  await filterSearch.press("Escape");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("button", { name: "Onboard new supplier", exact: true })
    .click();
  const country = page.getByRole("combobox", {
    name: "Registration country",
    exact: true,
  });
  await country.waitFor();
  evidence.historyBeforeOpen = evidence.historyRequests.length;
  await country.click();
  const search = page.getByRole("combobox", {
    name: "Search by name or code…",
    exact: true,
  });
  const initialValue = await country.inputValue();
  await search.fill("MY");
  await expect(
    page.getByRole("listbox").getByRole("option").first(),
  ).toContainText("Malaysia");
  await search.press("Escape");
  await expect(country).toHaveValue(initialValue);
  await expect(country).toBeFocused();
  const requestsAfterFirstOpen = evidence.historyRequests.length;
  await country.click();
  await search.fill("Malaysia");
  await expect(
    page.getByRole("listbox").getByRole("option").first(),
  ).toContainText("Malaysia");
  await search.press("Escape");
  await expect(country).toHaveValue(initialValue);
  if (
    evidence.historyBeforeOpen !== 0 ||
    requestsAfterFirstOpen !== 1 ||
    evidence.historyRequests.length !== 1
  )
    throw Error("Unexpected history request count");
  evidence.historyAfterRepeatedOpen = evidence.historyRequests.length;
  evidence.countrySearchByCodeAndName = true;
  evidence.escapePreservesSelectionAndFocus = true;
  evidence.nativeSelectAppearance = await page
    .locator("select")
    .first()
    .evaluate((el) => getComputedStyle(el).appearance);
  if (evidence.nativeSelectAppearance !== "none")
    throw Error("Shared native dropdown styling missing");
  if (evidence.pageErrors.length)
    throw Error("Live page has JavaScript errors");
  await page.screenshot({ path: join(root, "country-live.png") });
  writeFileSync(
    join(root, "live-smoke.json"),
    JSON.stringify(evidence, null, 2),
    { mode: 0o600 },
  );
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
}
