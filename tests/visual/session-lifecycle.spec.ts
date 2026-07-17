import { test, expect } from "@playwright/test";

const enabled = Boolean(process.env.PLAYWRIGHT_USER && process.env.PLAYWRIGHT_PASSWORD);

test.describe("session lifecycle", () => {
  test.skip(!enabled, "requires PLAYWRIGHT_USER and PLAYWRIGHT_PASSWORD");

  test("manual logout clears the browser session and redirects to login", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /sign out|log out/i }).first().click();
    await expect(page).toHaveURL(/login|logout/i);
  });

  test("idle warning exposes Continue and Sign out actions", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("dialog").waitFor({ state: "visible", timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Continue session" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeEnabled();
  });

  test("absolute warning prevents extending the session", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("dialog").waitFor({ state: "visible", timeout: 20_000 });
    await expect(page.getByText(/maximum lifetime/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue unavailable" })).toBeDisabled();
  });

  test("cross-tab termination event redirects both tabs", async ({ context }) => {
    const first = await context.newPage();
    const second = await context.newPage();
    const sender = await context.newPage();
    await Promise.all([first.goto("/"), second.goto("/"), sender.goto("/")]);
    await sender.evaluate(() => new BroadcastChannel("athyper:neon:session-activity").postMessage({ type: "session_terminated", reason: "logout" }));
    await expect(first).toHaveURL(/login|logout/i);
    await expect(second).toHaveURL(/login|logout/i);
  });
});
