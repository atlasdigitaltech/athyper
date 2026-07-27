import { expect, test } from "@playwright/test";
import { assertSurfaceContract, productionContext } from "./fixtures";

test.beforeEach(({}, testInfo) => {
  test.skip(
    !productionContext(testInfo).enabled,
    "set PLAYWRIGHT_PRODUCTION_MATRIX=1 and plane credentials",
  );
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
