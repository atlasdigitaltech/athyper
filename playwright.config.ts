/**
 * Athyper visual regression tests — Playwright config (root).
 *
 * Cleanup Plan v5 §P5c.
 *
 * Scoped to `tests/visual/` so day-to-day CI is not impacted. The suite
 * itself stays dormant via `test.skip(...)` in `pi-fixture.spec.ts`
 * until the four prerequisites in `tests/visual/README.md` are met:
 *
 *   1. PI fixture seeded in the test tenant (id pinned in the spec)
 *   2. Auth bypass cookie OR test-user storageState in env
 *   3. PLAYWRIGHT_BASE_URL points at a reachable Neon instance
 *   4. Reference snapshot generated and committed
 *
 * Once those land, remove `test.skip` and run:
 *   pnpm test:visual --update-snapshots
 *   git add tests/visual/__screenshots__/
 */

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir:        "./tests/visual",
  outputDir:      "./tests/visual/.playwright-output",
  snapshotDir:    "./tests/visual/__screenshots__",
  fullyParallel:  false,
  forbidOnly:     !!process.env.CI,
  retries:        process.env.CI ? 2 : 0,
  workers:        1,
  reporter:       process.env.CI ? "github" : "list",
  // ───────────────────────────────────────────────────────────────
  // Auth bootstrap (test-user pattern).
  // global-setup signs in once and writes the storageState file that
  // every test reuses via `use.storageState`. Skipped automatically
  // when PLAYWRIGHT_USER / PLAYWRIGHT_PASSWORD are not set, so the
  // dormant suite still type-checks + dry-runs.
  // ───────────────────────────────────────────────────────────────
  globalSetup:    require.resolve("./tests/visual/global-setup"),
  // ───────────────────────────────────────────────────────────────
  // Single fixed viewport per v5 P5c §6 — desktop only for now.
  // Tablet / mobile out of scope until visual parity is established.
  // ───────────────────────────────────────────────────────────────
  use: {
    baseURL:           process.env.PLAYWRIGHT_BASE_URL ?? "https://neon.athyper.local",
    viewport:          { width: 1440, height: 900 },
    screenshot:        "on",
    trace:             "retain-on-failure",
    ignoreHTTPSErrors: true,
    storageState:      "./tests/visual/.auth/storage-state.json",
  },
  projects: [
    {
      name: "chromium-1440x900",
      use:  { browserName: "chromium" },
    },
  ],
  // 1% diff threshold per v5 P5c §5 (tighten to 0.5% once stable).
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
      threshold:         0.2,
    },
  },
});
