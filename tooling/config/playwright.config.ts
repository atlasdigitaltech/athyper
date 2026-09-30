/**
 * Athyper browser and visual regression test configuration.
 *
 * Cleanup Plan v5 §P5c.
 *
 * Session E2E and PI visual checks share authentication setup but run as
 * separate projects. The PI visual project stays dormant via `test.skip(...)`
 * until the prerequisites in `tests/e2e/README.md` are met.
 *
 *   1. PI fixture seeded in the test tenant (id pinned in the spec)
 *   2. Auth bypass cookie OR test-user storageState in env
 *   3. PLAYWRIGHT_BASE_URL points at a reachable Neon instance
 *   4. Reference snapshot generated and committed
 *
 * Once those land, remove `test.skip` and run:
 *   pnpm test:visual --update-snapshots
 *   git add tests/e2e/visual/__screenshots__/
 */

import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

const planeBaseUrls = {
  studio:
    process.env.PLAYWRIGHT_STUDIO_BASE_URL ?? "https://studio.athyper.local",
  neon:
    process.env.PLAYWRIGHT_NEON_BASE_URL ??
    process.env.PLAYWRIGHT_BASE_URL ??
    "https://neon.athyper.local",
  mesh: process.env.PLAYWRIGHT_MESH_BASE_URL ?? "https://mesh.athyper.local",
} as const;
const requestedSessionPlane = process.env.PLAYWRIGHT_SESSION_PLANE;
const sessionPlane =
  requestedSessionPlane === "studio" || requestedSessionPlane === "mesh"
    ? requestedSessionPlane
    : "neon";

export default defineConfig({
  testDir: "../../tests/e2e",
  outputDir: "../../tests/e2e/.playwright-output",
  snapshotDir: "../../tests/e2e/visual/__screenshots__",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  // ───────────────────────────────────────────────────────────────
  // Auth bootstrap (test-user pattern).
  // global-setup signs in once and writes the storageState file that
  // every test reuses via `use.storageState`. Skipped automatically
  // when PLAYWRIGHT_USER / PLAYWRIGHT_PASSWORD are not set, so the
  // dormant suite still type-checks + dry-runs.
  // ───────────────────────────────────────────────────────────────
  globalSetup: require.resolve("../../tests/e2e/global-setup"),
  // ───────────────────────────────────────────────────────────────
  // Single fixed viewport per v5 P5c §6 — desktop only for now.
  // Tablet / mobile out of scope until visual parity is established.
  // ───────────────────────────────────────────────────────────────
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "https://neon.athyper.local",
    viewport: { width: 1440, height: 900 },
    screenshot: "on",
    trace: "retain-on-failure",
    ignoreHTTPSErrors: true,
    storageState: resolve(__dirname, "../../tests/e2e/.auth/storage-state.json"),
  },
  projects: [
    {
      name: "session",
      testMatch: "**/session/**/*.spec.ts",
      metadata: { plane: sessionPlane },
      use: {
        browserName: "chromium",
        baseURL: planeBaseUrls[sessionPlane],
        storageState: resolve(__dirname, `../../tests/e2e/.auth/${sessionPlane}.json`),
      },
    },
    {
      name: "visual",
      testMatch: "**/visual/**/*.spec.ts",
      use: { browserName: "chromium" },
    },
    {
      name: "bp-v1-009",
      testMatch: "**/business-partner/bp-v1-009.spec.ts",
      use: {
        browserName: "chromium",
        baseURL: planeBaseUrls.neon,
        storageState: undefined,
      },
    },
    {
      name: "bp-r2",
      testMatch: "**/business-partner/bp-r2.spec.ts",
      use: {
        browserName: "chromium",
        baseURL: planeBaseUrls.neon,
        storageState: undefined,
      },
    },
    {
      name: "bp-r3",
      testMatch: "**/business-partner/bp-r3.spec.ts",
      use: { browserName: "chromium", baseURL: planeBaseUrls.neon, storageState: undefined },
    },
    { name:"bp-r5",testMatch:"**/business-partner/bp-r5.spec.ts",use:{browserName:"chromium",baseURL:planeBaseUrls.neon,storageState:undefined} },
    { name:"bp-r6-amendment",testMatch:"**/business-partner/bp-r6-amendment.spec.ts",use:{browserName:"chromium",baseURL:planeBaseUrls.neon,storageState:undefined} },
    { name:"bp-r6",testMatch:"**/business-partner/bp-r6.spec.ts",use:{browserName:"chromium",baseURL:planeBaseUrls.mesh,storageState:undefined} },
    { name:"bp-r7",testMatch:"**/business-partner/bp-r7.spec.ts",use:{browserName:"chromium",baseURL:planeBaseUrls.neon,storageState:undefined} },
    ...(["studio", "neon", "mesh"] as const).flatMap((plane) => [
      {
        name: `production-${plane}-desktop`,
        testMatch: "**/production/**/*.spec.ts",
        metadata: { plane, formFactor: "desktop" },
        use: {
          browserName: "chromium" as const,
          baseURL: planeBaseUrls[plane],
          storageState: resolve(__dirname, `../../tests/e2e/.auth/${plane}.json`),
          viewport: { width: 1440, height: 900 },
        },
      },
      {
        name: `production-${plane}-mobile`,
        testMatch: "**/production/**/*.spec.ts",
        metadata: { plane, formFactor: "mobile" },
        use: {
          ...devices["Pixel 7"],
          baseURL: planeBaseUrls[plane],
          storageState: resolve(__dirname, `../../tests/e2e/.auth/${plane}.json`),
        },
      },
    ]),
  ],
  // 1% diff threshold per v5 P5c §5 (tighten to 0.5% once stable).
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
      threshold: 0.2,
    },
  },
});
