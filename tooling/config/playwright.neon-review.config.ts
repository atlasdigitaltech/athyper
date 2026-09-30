import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "../../tests/e2e/neon-review",
  testMatch: "**/*.spec.ts",
  globalSetup: "../../tests/e2e/neon-review/preflight.ts",
  outputDir: "../../tests/e2e/.playwright-neon-review-output",
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 60_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_NEON_BASE_URL ?? "https://neon.dev.athyper.test",
    browserName: "chromium",
    ignoreHTTPSErrors: true,
    // Login and tenant data must not be captured in test traces.
    trace: "off",
    screenshot: "off",
    video: "off",
  },
});
