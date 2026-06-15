/**
 * Athyper visual regression tests — Playwright global setup.
 *
 * Cleanup Plan v5 §P5c.
 *
 * Signs in once with PLAYWRIGHT_USER / PLAYWRIGHT_PASSWORD and writes
 * the resulting `storage-state.json` so every spec inherits the
 * session via `use.storageState` (configured in playwright.config.ts).
 *
 * Skips silently when credentials aren't set — keeps the dormant suite
 * runnable for dry-runs / typechecks without an env.
 *
 * The bypass-cookie alternative (set `ATHYPER_TEST_BYPASS=1` + inject
 * via `use.extraHTTPHeaders`) is faster but further from production
 * behavior. See tests/visual/README.md § "Auth bypass or test-user
 * credentials" for the tradeoff.
 */

import { chromium, type FullConfig } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const STORAGE_STATE_PATH = "./tests/visual/.auth/storage-state.json";

export default async function globalSetup(config: FullConfig): Promise<void> {
  const username = process.env.PLAYWRIGHT_USER;
  const password = process.env.PLAYWRIGHT_PASSWORD;
  const baseURL  = process.env.PLAYWRIGHT_BASE_URL
    ?? config.projects[0]?.use.baseURL
    ?? "https://neon.athyper.local";

  // Dormant path: no credentials → leave whatever storageState exists
  // alone. The downstream `test.skip(...)` guards prevent any test
  // from actually trying to navigate.
  if (!username || !password) {
    if (!existsSync(STORAGE_STATE_PATH)) {
      mkdirSync(dirname(STORAGE_STATE_PATH), { recursive: true });
      const fs = await import("node:fs/promises");
      await fs.writeFile(
        STORAGE_STATE_PATH,
        JSON.stringify({ cookies: [], origins: [] }, null, 2),
      );
    }
    return;
  }

  // Activation path: real sign-in. The flow assumes Athyper's
  // Keycloak-driven login at `/login` redirects to the post-auth
  // landing page once credentials submit successfully. Adjust the
  // selectors if the login form changes.
  mkdirSync(dirname(STORAGE_STATE_PATH), { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true });
  const page    = await context.newPage();

  await page.goto("/login");
  await page.getByLabel(/email|username/i).fill(username);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();

  // Wait until the post-login redirect settles. `/app` is the common
  // landing route for Neon — adjust if the post-auth target changes.
  await page.waitForURL(/\/app(\/|$)/, { timeout: 30_000 });

  await context.storageState({ path: STORAGE_STATE_PATH });
  await browser.close();
}
