import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

export default defineConfig({
  testDir: "../../tests/e2e/mesh-review",
  testMatch: "**/*.spec.ts",
  globalSetup: require.resolve("../../tests/e2e/mesh-review/setup"),
  outputDir: "../../tests/e2e/.playwright-mesh-review-output",
  workers: 1,
  retries: 0,
  timeout: 60_000,
  use: {
    browserName: "chromium",
    baseURL: process.env.PLAYWRIGHT_MESH_BASE_URL ?? "https://mesh.dev.athyper.test",
    storageState: resolve(process.env.PLAYWRIGHT_MESH_STORAGE_STATE ?? "tests/e2e/.auth/mesh-review.json"),
    ignoreHTTPSErrors: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
