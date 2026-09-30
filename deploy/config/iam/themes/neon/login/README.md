# IAM workspace preview

The shared `_iam-story.ftl` renders a static sample workspace on every custom
login-theme page. Neon uses Finance (ledger), Mesh uses Network & Relationships
(map), and Studio uses Entity Studio (release chain). The client-derived plane
resolver and authentication forms remain the authority for login behavior.

## Shared layout

`packages/platform/foundation/surface-kit/src/public-identity-layout.css` defines
the layout values for all three apps and IAM. Desktop uses form-left 42% / showcase-right 58%; medium screens
(up to 75rem) use form-left 52% / showcase-right 48%, and screens at or below 52rem show only the form.
Story padding is capped at 3rem, task padding at 5rem, and form width at 30rem.
Mobile task padding is 1.5rem with safe-area insets. `brand:sync:keycloak` copies
this stylesheet into IAM and `brand:verify` checks for drift.

The shared `public-identity-showcase.css` beside the layout stylesheet defines
the scoped Atlas background, card surface, border, accent, and focus treatment.
The same sync and verification commands cover its IAM copy. App chain rows
retain full opacity; active state is expressed through the timeline and a
surface highlight. Atlas uses focus glow rather than continuous glow.

## Updating content

- Edit `packages/platform/iam/identity-gate/src/workspace-showcase-data.ts` for
  scenarios used by both React and IAM. IAM selects the first workspace per
  plane. `IAM_PREVIEW_ACTS` supplies three informational questions per plane.
- Edit `workspace-map-data.ts` alongside it for shared coastline/network data.
- Plane slogan copy comes from the canonical brand registry. Slogan SVG text
  uses the same geometry and font fallback as the React preview.
- Run `pnpm brand:sync:keycloak` to regenerate `_showcase-*.ftl` and copy branding.
  Never edit the generated templates directly.
- Theme tokens come from `pnpm iam:build`; `pnpm iam:check` detects token drift.
  `pnpm brand:verify` checks generated preview content and identity assets.

`resources/css/workspace-showcase.css` and `resources/js/workspace-showcase.js`
are the small IAM-specific render/playback layer. All content renders without
JavaScript. Playback uses only local sample data, pauses via the visible button
or document visibility, and stops for reduced motion and narrow screens. Mobile
retains the compact product wordmark and authentication form. Atlas presents three selectable informational presets, with no free-text input,
approval action, network call, or tenant data. The first answer renders in full;
selection updates the prompt, answer and record references and persists until
the next selection. A compact pause/play icon in the Atlas header controls
only the ledger, chain and map. Question controls are hidden when JavaScript is
unavailable, leaving the first answer readable.

## Verification

Run `pnpm iam:verify`, `pnpm brand:verify`, `pnpm iam:check`, and
`pnpm --filter @athyper/platform-iam-identity-gate typecheck`.

Browser coverage:

```sh
bash tooling/scripts/verification/run-playwright-with-linux-deps.sh test \
  --config=tooling/config/playwright.foundation.config.ts \
  tests/foundation-browser/iam-showcase.spec.ts
```

This checks generated static content, accessibility, widths from 320 to 1440px,
playback controls, live reduced-motion changes, and hidden-document suspension.
It does not substitute for authenticated MFA/required-action flow testing.

The IAM Dockerfile packages the entire theme. Rebuild the development IAM image
for durable deployment; copying files into a running container only lasts until
that container is recreated. Live checks must use a real OIDC client and its
registered redirect URI and PKCE parameters to reach an authentication form.
