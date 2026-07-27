/**
 * Visual regression: Purchase Invoice — fixture document.
 *
 * Cleanup Plan v5 §P5c.
 *
 * Purpose: lock down PI rendering on the descriptor-driven route
 * (generic `[entity]/[id]` + injected document-runtime surfaces) so
 * future refactors don't regress the rendered output for a stable
 * fixture. Sprint 7 deleted the legacy PI route, Sprint 8 PR5 removed
 * the cutover flag — the descriptor route is THE PI path.
 *
 * Activation prerequisites (see tests/e2e/README.md):
 *   1. Test tenant seeded with PI_FIXTURE_ID
 *   2. Auth: PLAYWRIGHT_USER + PLAYWRIGHT_PASSWORD set in env, OR
 *      `tests/e2e/.auth/storage-state.json` created for the fixture tenant
 *   3. PLAYWRIGHT_BASE_URL points at a reachable Neon instance
 *   4. Reference snapshot generated via `pnpm test:visual --update-snapshots`
 *
 * Until then this file stays guarded by `test.skip(...)`. The CI job
 * is gated to manual dispatch so it doesn't break PR builds.
 */

import { test, expect } from "@playwright/test";

// ─── Fixture pin ─────────────────────────────────────────────────────

/**
 * Stable PI fixture seeded in the test tenant. The fixture has:
 *   - 3 lines with mixed UoMs
 *   - 1 header-scope PC (freight, value apportionment)
 *   - 4 line-scope PC (discount, IGST, retention, withholding)
 *   - 6 AD splits across 2 GL accounts
 *   - Status: draft (so amount summary chips are populated)
 *
 * Update this id when the fixture seed file changes. See
 * `server/db/seed/tenants/_fixtures/visual_fixture_pi.sql`.
 */
const PI_FIXTURE_ID = "ffffffff-aaaa-0000-0000-000000000001";

const ACTIVATION_PENDING =
  "Dormant: complete the four activation prereqs in tests/e2e/README.md, "
  + "generate the reference snapshot, then delete this `test.skip` call.";

// ─── Tests ───────────────────────────────────────────────────────────

test.describe("Purchase Invoice — visual regression", () => {
  test("descriptor route — regression snapshot", async ({ page }) => {
    test.skip(true, ACTIVATION_PENDING);

    // After Sprint 7 + Sprint 8 PR5 the static PI route is gone — this
    // URL is served entirely by the generic `[entity]/[id]` renderer
    // with the 4 PI surfaces injected at descriptor-resolution time.
    await page.goto(`/app/purchase_invoice/${PI_FIXTURE_ID}`);
    await page.waitForLoadState("networkidle");

    // maxDiffPixelRatio inherits from playwright.config.ts (1%); tighten
    // to 0.5% once the suite has caught a few real regressions.
    await expect(page).toHaveScreenshot("pi-fixture.png");
  });
});
