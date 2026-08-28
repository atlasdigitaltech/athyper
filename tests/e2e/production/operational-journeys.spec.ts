import { expect, test } from "@playwright/test";
import {
  assertSurfaceContract,
  assertWebVitalBudgets,
  observeWebVitals,
  productionContext,
} from "./fixtures";

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(
    !productionContext(testInfo).enabled,
    "set PLAYWRIGHT_PRODUCTION_MATRIX=1 and provide plane credentials or a stored session",
  );
  await observeWebVitals(page);
});

test("Inbox list, direct detail and action reconcile with the server", async ({ page }) => {
  const itemTitle = process.env.PLAYWRIGHT_WORK_ITEM_TITLE;
  const actionLabel = process.env.PLAYWRIGHT_WORK_ITEM_ACTION;
  test.skip(!itemTitle || !actionLabel, "requires a seeded PLAYWRIGHT_WORK_ITEM_TITLE and PLAYWRIGHT_WORK_ITEM_ACTION");
  await page.goto("/inbox");
  await page.getByRole("button", { name: new RegExp(escapeRegExp(itemTitle!), "i") }).click();
  await expect(page.getByRole("heading", { name: itemTitle! })).toBeVisible();
  const directUrl = page.url();
  expect(new URL(directUrl).pathname).toMatch(/\/inbox\/.+/);
  page.once("dialog", (dialog) => dialog.accept());
  const responsePromise = page.waitForResponse((response) =>
    response.request().method() !== "GET" && /inbox|work-item|workflow/i.test(response.url()));
  await page.getByRole("button", { name: new RegExp(`^${escapeRegExp(actionLabel!)}$`, "i") }).click();
  expect((await responsePromise).ok()).toBe(true);
  await expect(page.getByRole("heading", { name: itemTitle! })).toHaveCount(0);
});

test("Notifications expose unread/all filters and resolve a destination", async ({ page }) => {
  await page.goto("/notifications");
  await expect(page.getByRole("button", { name: /unread/i }).or(page.getByRole("tab", { name: /unread/i })).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /all/i }).or(page.getByRole("tab", { name: /all/i })).first()).toBeVisible();
  await assertSurfaceContract(page, "notifications");
});

test("Neon business-partner list restores URL state, replaces context, and denies an invalid scope", async ({ page }, testInfo) => {
  test.skip(productionContext(testInfo).plane !== "neon", "Neon list qualification applies only to the Neon plane");

  await page.goto("/app/business_partner?q=BP&sort=code:desc&cols=code,display_name,status&pageSize=10");
  await expect(page.getByRole("heading", { name: "Business Partners" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: /search business partners/i })).toHaveValue("BP");
  await expect(page).toHaveURL(/q=BP/);
  await expect(page).toHaveURL(/sort=code%3Adesc|sort=code:desc/);
  await expect(page.getByRole("columnheader", { name: /business partner code/i })).toHaveAttribute("aria-sort", "descending");

  const context = page.getByLabel("Operating organization");
  const options = context.locator("option:not([value=''])");
  if (await options.count() > 1) {
    const current = await context.inputValue();
    const replacement = await options.evaluateAll((items, selected) =>
      items.map((item) => (item as HTMLOptionElement).value).find((value) => value !== selected), current);
    if (replacement) {
      const response = page.waitForResponse((candidate) =>
        candidate.request().method() === "GET" && candidate.url().includes("/entity-runtime/business_partner/list?"));
      await context.selectOption(replacement);
      expect((await response).ok()).toBe(true);
      await expect(page.locator(".a-entity-list__scope").filter({ hasText: "Authorized" })).toBeVisible();
      await expect(page).not.toHaveURL(/cursor=/);
    }
  }

  const deniedStatus = await page.evaluate(async () => {
    const response = await fetch("/api/relay/entity-runtime/business_partner/list-descriptor?operatingOrganizationId=00000000-0000-0000-0000-000000000001");
    return response.status;
  });
  expect([400, 403, 404]).toContain(deniedStatus);
  await assertSurfaceContract(page, "neon-business-partner-list");
  await assertWebVitalBudgets(page);
});

test("Mesh network relationships replace rows when the acting account changes", async ({ page }, testInfo) => {
  test.skip(productionContext(testInfo).plane !== "mesh", "Mesh relationship qualification applies only to Mesh");
  await page.goto("/workspace/network_relationship?sort=updated_at:desc&pageSize=10");
  await expect(page.getByRole("heading", { name: "Network Relationships" })).toBeVisible();
  const account = page.getByLabel("Acting account");
  await expect(account).toBeEnabled();
  const options = account.locator("option:not([value=''])");
  if (await options.count() > 1) {
    const current = await account.inputValue();
    const replacement = await options.evaluateAll((items, selected) => items.map((item) => (item as HTMLOptionElement).value).find((value) => value !== selected), current);
    if (replacement) {
      const response = page.waitForResponse((candidate) => candidate.request().method() === "GET" && candidate.url().includes("/entity-runtime/network_relationship/list?"));
      await account.selectOption(replacement);
      expect((await response).ok()).toBe(true);
      await expect(page).not.toHaveURL(/cursor=/);
    }
  }
  const denied = await page.evaluate(async () => (await fetch("/api/relay/entity-runtime/network_relationship/list-descriptor?networkAccountId=00000000-0000-0000-0000-000000000001")).status);
  expect([400, 403, 404]).toContain(denied);
  await assertSurfaceContract(page, "mesh-network-relationship-list");
  await assertWebVitalBudgets(page);
});

test("Studio Entity catalog uses the shared List View through its administrative adapter", async ({ page }, testInfo) => {
  test.skip(productionContext(testInfo).plane !== "studio", "Studio catalog qualification applies only to Studio");
  await page.goto("/admin/catalogs/metadata_entity?q=entity&sort=entity_code:asc&pageSize=10");
  await expect(page.getByRole("heading", { name: "Entity Catalog" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: /search metadata entities/i })).toHaveValue("entity");
  await expect(page.getByRole("columnheader", { name: /entity code/i })).toHaveAttribute("aria-sort", "ascending");
  await expect(page.getByLabel("List pagination")).toBeVisible();
  await assertSurfaceContract(page, "studio-metadata-entity-catalog");
  await assertWebVitalBudgets(page);
});

test("Settings canonical scope deep link is editable or intentionally denied", async ({ page }) => {
  const route = process.env.PLAYWRIGHT_SETTINGS_SCOPE_ROUTE;
  test.skip(!route, "requires PLAYWRIGHT_SETTINGS_SCOPE_ROUTE");
  await page.goto(route!);
  await expect(page).toHaveURL(new RegExp(escapeRegExp(route!.split("?")[0]!)));
  await expect(page.getByRole("heading").first()).toBeVisible();
  await assertSurfaceContract(page, "settings-scope");
});

test("Saved View, Setup and Content seeded destinations open", async ({ page }) => {
  const savedView = process.env.PLAYWRIGHT_SAVED_VIEW_TITLE;
  const setupDestination = process.env.PLAYWRIGHT_SETUP_DESTINATION;
  const contentTitle = process.env.PLAYWRIGHT_CONTENT_TITLE;
  test.skip(
    !savedView || !setupDestination || !contentTitle,
    "requires saved-view, setup-destination and content seeded fixture names",
  );

  await page.goto("/saved-views");
  await page.getByRole("article").filter({ hasText: savedView! }).getByRole("button", { name: /open/i }).click();
  await expect(page).not.toHaveURL(/\/saved-views(?:\?|$)/);

  await page.goto("/setup");
  await page.getByRole("link", { name: new RegExp(escapeRegExp(setupDestination!), "i") })
    .or(page.getByRole("button", { name: new RegExp(escapeRegExp(setupDestination!), "i") }))
    .first()
    .click();
  await expect(page).not.toHaveURL(/\/setup(?:\?|$)/);

  await page.goto("/content");
  await page.getByRole("button", { name: new RegExp(escapeRegExp(contentTitle!), "i") }).click();
  await expect(page.getByRole("heading", { name: contentTitle! })).toBeVisible();
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
