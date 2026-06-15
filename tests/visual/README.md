# Visual regression tests

**Status:** Infrastructure + framework landed (Sprint 8 PR6), **not yet
running**. The Playwright dep, config, global-setup, spec, fixture seed
skeleton, and CI job are all in place; the test itself stays guarded
by `test.skip(...)` until the four prerequisites below are met. See
[P5c plan](../../docs/cleanup-plan/P5c-screenshot-parity-plan.md) for
the full architectural context.

---

## Why dormant

Sprint 8 PR1–PR5 made the descriptor-driven PI route render correctly
end-to-end (provider mount, header surface, real PiLineDrawer, real
HeaderScopePcStrip, real PostingsPreviewSheet, action-code normalize,
feature flag removed). PR6 wired the visual regression framework so a
later activation can lock down a reference snapshot.

Activation is dormant because three pieces still need a live env:
the seeded fixture, an auth strategy, and the reference image itself.
This README is the activation runbook.

---

## Activation prerequisites

Complete these in order:

### 1. Download the Chromium browser

```bash
pnpm exec playwright install chromium
```

The dep `@playwright/test` is already in root `devDependencies`
(landed PR6). This command pulls the browser binary into Playwright's
local cache (`~/.cache/ms-playwright/`, ~150 MB). The binary is
gitignored by Playwright defaults; only the lockfile commit is needed.

### 2. Seed a stable PI fixture in the test tenant

The skeleton lives at
`server/db/seed/tenants/neon/010_demo/999_visual_fixture_pi.sql` and
pins the header + 3 lines today. The pricing-component and accounting-
distribution INSERTs are marked `TODO(activation)` — author them
against the live DDL to round out the fixture so the rendered output
matches the spec's expected shape:

- 3 lines with mixed UoMs (e.g. EA, KG, M) — *seeded*
- 1 header-scope PC (freight, value apportionment) — *TODO*
- 4 line-scope PC (discount, IGST 18%, retention 2%, withholding 10%) — *TODO*
- 6 AD splits across 2 GL accounts — *TODO*
- Status: `draft` (ensures AmountSummary chips populate) — *seeded*

The fixture id is pinned in `pi-fixture.spec.ts` as `PI_FIXTURE_ID`.
Update that constant if the seed uses a different id.

### 3. Auth — test-user storage state

PR6 added `tests/visual/global-setup.ts` that signs in once and writes
`tests/visual/.auth/storage-state.json`. Subsequent test runs reuse
that file via `playwright.config.ts:use.storageState`.

Configure the credentials:

- **Local dev:** set `PLAYWRIGHT_USER` + `PLAYWRIGHT_PASSWORD` in your
  shell, then run `pnpm test:visual`. The setup step signs in via
  `/login` and saves the session.
- **CI:** add `PLAYWRIGHT_USER` + `PLAYWRIGHT_PASSWORD` (plus the base
  URL) as repo secrets and reference them from the workflow job
  (PR6 CI block already accepts these env vars).

The bypass-cookie alternative (set `ATHYPER_TEST_BYPASS=1` in the test
env and inject via `use.extraHTTPHeaders`) is faster but further from
production. Recommended: test-user with cached storageState.

### 4. Reachable Neon app

Set `PLAYWRIGHT_BASE_URL` to a running Neon instance with the test
tenant's database seeded. Local dev typically uses
`https://neon.athyper.local`; in CI use the `playwright_base_url`
workflow input today or swap to a repo secret as part of the CI flip
(step 5 below).

### 5. Generate the reference snapshot + commit

After steps 1–4 land:

```bash
pnpm test:visual --update-snapshots
git add tests/visual/__screenshots__/pi-fixture-chromium-1440x900.png
```

Then delete the `test.skip(...)` call in `pi-fixture.spec.ts` and
push. From this point any change that drifts the rendered PI from the
committed reference fails the CI check.

---

## Flip the CI gate

After all four prerequisites land, edit `.github/workflows/ci.yml`:

```yaml
jobs:
  screenshot-parity-pi:
    # Before activation:
    if: github.event_name == 'workflow_dispatch'
    # After activation — change to PR + path filter via paths-filter
    # action, OR by moving the `if:` to a paths check on the changed
    # files (using a community action like dorny/paths-filter@v3).
    # Recommended path scope (Sprint 8: legacy purchase_invoice route
    # deleted, descriptor route only):
    #   - apps/neon/app/(shell)/app/[entity]/**
    #   - apps/neon/lib/server/pi-document-runtime-surfaces.ts
    #   - apps/neon/lib/server/meta-entity-runtime.ts
    #   - apps/neon/lib/bootstrap-document-runtime.ts
    #   - packages/shared/runtime-canvas/src/surfaces/**
    #   - packages/shared/runtime-canvas/src/document-runtime/**
    #   - packages/shared/content-ui/src/document-components/**
    #   - packages/shared/content-ui/src/purchase-invoice/**
    #   - server/db/seed/platform/003_control/049_*
    #   - server/db/seed/platform/003_control/050_*
    #   - server/db/seed/tenants/neon/010_demo/999_visual_fixture_pi.sql
```

Also flip the `env:` block to read from a repo secret rather than
the `workflow_dispatch.inputs.playwright_base_url`, so PR runs don't
require manual input:

```yaml
env:
  PLAYWRIGHT_BASE_URL: ${{ secrets.PLAYWRIGHT_BASE_URL }}
  ATHYPER_TEST_BYPASS: ${{ secrets.ATHYPER_TEST_BYPASS }}
```

Then replace `test.skip(...)` calls in `pi-fixture.spec.ts` with the
real assertions.

---

## Updating reference screenshots

After activation, when intentional visual changes ship:

```bash
pnpm test:visual -- --update-snapshots
git add tests/visual/__screenshots__/
git commit -m "chore(visual): regenerate PI reference screenshot"
```

The reference image lives at `tests/visual/__screenshots__/pi-fixture-chromium-1440x900.png`.
**Review the image diff manually** — visual tests catch unintended
regressions, not intended changes. The PR description must explain
why a regenerated reference is correct.

---

## Diff thresholds

Initial threshold per [P5c plan §5](../../docs/cleanup-plan/P5c-screenshot-parity-plan.md):

- **maxDiffPixelRatio: 0.01** (1% of pixels may differ)
- **threshold: 0.2** (per-pixel color-distance tolerance)

Per the plan: tighten to **0.005 (0.5%)** before P7 lands.

---

## Running locally

```bash
# After activation:
pnpm test:visual            # run the suite
pnpm test:visual --ui       # interactive runner
pnpm test:visual --debug    # step debugger
```

For first-time local runs, `pnpm exec playwright install chromium`
downloads the browser binary into `~/.cache/ms-playwright/` (~150 MB).

---

## What this check IS NOT

- Not a screenshot diff against a design mockup (use Storybook /
  Chromatic for that workflow)
- Not a cross-browser test (Chromium only; Firefox / Safari out of scope)
- Not a multi-viewport test (1440×900 only; mobile / tablet deferred)
- Not an interaction test (single static render only; click / hover /
  type out of scope)

---

## Owner

Whoever lands P6 takes ownership of activation. The infrastructure
PR (Sprint 5.5b) lands the framework; the activation PR (post-P6)
lands the prereqs above + the CI gate flip + the reference snapshot.
