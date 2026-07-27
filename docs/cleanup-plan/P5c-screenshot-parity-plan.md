# P5c Ã¢â‚¬â€ Screenshot Parity CI Check Plan

**Status:** Planned for a focused PR. Sprint 5 delivers the surface
contracts, renderers, and registries (P5a + P5b). This document
records the plan so the parity check lands as a discrete piece of
infrastructure rather than getting bundled with surface work.

**Gates:** P6 cutover.

---

## 1. Purpose

Per cleanup-plan v5 Ã‚Â§4.5 (acceptance criterion) and Ã‚Â§8 (phasing
sequence P5c Ã¢â€ â€™ P6), the screenshot parity check is the **gate** that
prevents P6 (descriptor cutover) from shipping a visual regression
against the current PI page. Today's PI page is the visual baseline;
the new descriptor-driven render must match it within a small
perceptual diff threshold.

## 2. What it checks

For a stable PI fixture (a known invoice with known lines + PC + AD
rows):

1. Visit `/app/purchase_invoice/<fixture_id>` with the legacy route
   (current code path)
2. Visit `/app/purchase_invoice/<fixture_id>` with `pi_via_descriptor`
   feature flag enabled (descriptor-driven route)
3. Capture screenshots at a fixed viewport (1440Ãƒâ€”900)
4. Compute perceptual diff
5. Fail when diff exceeds threshold (TBD Ã¢â‚¬â€ start permissive, tighten)

## 3. Required infrastructure

| Piece | Detail |
|---|---|
| Headless browser | Playwright (already in repo for other check?  verify) |
| Fixture data | Test tenant + seed: one PI with mixed header/line PC, AD splits, supplier snapshot, payment terms |
| Authentication | Test session bootstrap; reuse existing test session util if available |
| Diff library | `pixelmatch` or `playwright-visual-comparisons` |
| Storage | Reference screenshot in repo (PNG); regenerate via `pnpm test:visual:update` |
| CI integration | New job in `.github/workflows/ci.yml` after `quality`; named `screenshot-parity-pi` |

## 4. Sequencing

The parity check makes sense AFTER:
- P5a + P5b shipped (renderers exist; you can mount the new path) Ã¢Å“â€œ
- App-boot composer + sidecar + strategy registrations land
- PI descriptor surface seeds applied to test tenant
- `pi_via_descriptor` feature flag wired (P6 work)

It makes sense BEFORE:
- P6 cutover ships to any environment beyond test

So P5c is the connective tissue. Realistic landing: a focused PR
after P5b is reviewed and the descriptor seed PR is ready.

## 5. Acceptance criteria

- [ ] CI workflow `screenshot-parity-pi` runs on every PR touching:
      - `apps/neon/app/(shell)/app/purchase_invoice/**`
      - `apps/neon/app/(shell)/app/[entity]/**`
      - `packages/shared/runtime-domain/runtime-canvas/src/surfaces/**`
      - `packages/shared/runtime-domain/runtime-canvas/src/document-runtime/**`
      - `packages/shared/ui-platform/content-ui/src/document-components/**`
      - `server/db/seed/platform/003_control/049_*.sql`
      - `server/db/seed/platform/003_control/050_*.sql`
- [ ] Reference screenshot committed at `tests/e2e/visual/__screenshots__/pi-fixture-chromium-1440x900.png`
- [ ] Diff threshold initially **5%** (permissive); tightened to **1%**
      before P7 cleanup ships
- [ ] On failure, CI annotates the PR with the diff image so reviewers
      see the visual delta
- [ ] Regeneration command documented in README:
      `pnpm test:visual:update --filter screenshot-parity-pi`

## 6. What is NOT in scope for P5c

- AR / GR / SES parity checks (different documents; out of v5 scope)
- Multi-viewport (mobile / tablet) Ã¢â‚¬â€ single 1440Ãƒâ€”900 reference for now
- Cross-browser (Chrome only)
- Animation / interaction screenshots (single static render only)

## 7. Open decisions

- Diff library: `pixelmatch` (already a dep?) vs Playwright's built-in
- Reference screenshot regeneration policy: manual via dev command vs
  CI auto-regenerate when descriptor changes land
- Fixture stability: how often does it need refresh? Tie to PI demo seed?

## 8. Owner

Recommended: ship as a follow-up PR after P5b review, BEFORE the
descriptor seed PR (P6) so we can verify P6's cutover doesn't break
parity before merging.
