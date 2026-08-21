import { defineConfig } from "@playwright/test";

export default defineConfig({
  tsconfig: "./tooling/config/tsconfig-react.json",
  testDir: "./tests/foundation-browser",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { browserName: "chromium", viewport: { width: 900, height: 600 }, colorScheme: "light" },
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.005, animations: "disabled" } },
});
