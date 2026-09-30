import { expect, test } from "@playwright/test";
import { authenticateBrowser } from "../authenticate-browser";

test("Neon login, tenant context, governed aliases, and workforce relay", async ({ page, baseURL }) => {
  await authenticateBrowser(page, {
    origin: baseURL!, username: process.env.PLAYWRIGHT_NEON_USER!, password: process.env.PLAYWRIGHT_NEON_PASSWORD!,
    tenantName: process.env.PLAYWRIGHT_NEON_TENANT_NAME,
  });
  for (const [path, destination] of [
    ["/mdg/business-partner/business-partners", "/mdg/business-partner/partners"],
    ["/mdg/business-partner/business-partners/new", "/mdg/business-partner/new"],
    ["/mdg/business-partner/requests/new", "/mdg/business-partner/new"],
    ["/people/workforce/requests", "/people/workforce/requests"],
    ["/people/workforce/requests/new", "/people/workforce/requests/new"],
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(new URL(destination, baseURL!).href);
    await expect(page.locator("main").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Access unavailable" })).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("Application error");
  }
  await expect(page.getByRole("heading", { name: "New workforce onboarding request", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create workforce draft" })).toBeVisible();
  const response = await page.request.get("/api/relay/neon/workforce-requests?limit=1");
  expect(response.status(), "The signed-in workforce list must reach the runtime and authorize the selected tenant").toBe(200);
  expect(Array.isArray(await response.json())).toBe(true);
});
