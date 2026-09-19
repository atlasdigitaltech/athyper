# Atlas authenticated browser acceptance — 2026-09-07

DEV applications: `https://neon.dev.athyper.test`, `https://mesh.dev.athyper.test`, and `https://studio.dev.athyper.test`.

## Evidence and authentication

Checks use Chromium through Playwright, real application pages, browser cookies, same-origin CSRF-protected relay requests and the deployed local GPU provider. No authentication tokens were minted, no MFA checks were bypassed, and database unit tests were not used as browser evidence. Fresh password authentication completed separately for each application for `catl.admin` (CIRRUSATLANTIC) and `athyper.admin` (ATHYPER). The same-tenant negative checks additionally authenticated `catl.owner` separately in every application. Studio challenged all three accounts for MFA, which was completed with fresh user-supplied codes. Neon/Mesh did not issue additional MFA challenges in their actual login flows.

Private receipts and screenshots: `~/.athyper/instances/dev/receipts/atlas-browser-acceptance/{neon,mesh,studio}/`. Authentication state stays outside Git in private `tests/e2e/.auth/` files. Receipts contain synthetic prompts and response evidence, not credentials.

## Matrix

| Check | Neon | Mesh | Studio |
| --- | --- | --- | --- |
| History HTTP 200 includes newly persisted fixture | Pass | Pass | Pass after approved permission grant |
| UI create, stream answer, reload and recover user + assistant | Pass | Pass | Pass |
| Chronological message order after reload | Fixed, verified | Fixed, verified | Fixed, verified |
| Rename and stale row-version conflict | 200 / 409 | 200 / 409 | 200 / 409 |
| Archive and archived-history lookup | Pass | Pass | Pass |
| Cursor pagination with distinct results | Pass | Pass | Pass |
| API restart + inference stop/start preserve original message IDs | Pass | Pass | Pass |
| Completed same-key retry adds no messages | Pass | Pass | Pass |
| Active duplicate request | 409 | 409 | 409 |
| Changed payload under existing request key | 409 | 409 | 409 |
| Cancel streaming + replay cancelled request, exactly two messages | Pass | Pass | Pass |
| Quota exhaustion, desktop and mobile | 429 + explanatory feedback | 429 + explanatory feedback | 429 + explanatory feedback |
| Inference unavailable, desktop and mobile | Failed SSE + visible feedback | Failed SSE + visible feedback | Failed SSE + visible feedback |
| Cross-plane message reads | 404 | 404 | 404 |
| Other tenant/user read, header spoofing and edit | 404 | 404 | 404 |
| Anonymous history read | 401 | 401 | 401 |
| Same-tenant `catl.owner` read/edit/generation | 404 read/edit; 403 generation | 404 read/edit; 403 generation | 404 read/edit; 403 generation |
| Fresh mobile viewport: stream, stop, complete, reload, no horizontal overflow | Pass | Pass | Pass |

Rename, archive, pagination and conflict checks use the supported browser relay from the authenticated page. The UI exposes conversation selection; it does not expose every REST operation. Direct thread GET is not browser-allowlisted, so row versions are taken from the supported history list. That denied route is not counted as authorization-isolation evidence. Cross-plane and cross-tenant probes use the allowlisted messages and mutation routes. `catl.owner` lacks Atlas admission in all three planes: the same-tenant checks therefore demonstrate rejection of an authenticated unauthorized user, not the additional case of an Atlas-admitted non-participant. No permissions were added to that account.

Inference failure begins an SSE stream with HTTP 200 and then emits `run.failed`; HTTP 200 alone is not treated as successful generation. Quota rejection returns HTTP 429. For quota tests, only the CIRRUSATLANTIC per-plane quota policy was temporarily set below the request budget, then restored in `finally`. Original policy snapshots are saved as `quota-before.json`; provider/metering counters were not erased. This tests the real browser-to-runtime quota gate without spending an entire normal tenant quota window.

## Findings fixed

1. **Studio Atlas permission missing for the selected account.** `catl.admin` had context-reader and `local.studio.catl.definition-author` roles; neither granted `studio.ai.agent.use`. Fresh authenticated history returned 403. With explicit user approval, only that permission was added to the existing local definition-author role. No other user membership or permission was changed.
2. **Recovered messages displayed backwards.** The API returns newest-first message pages. The shared answer client now sorts its returned view by sequence without mutating the API page. A regression test preserves cursor metadata and checks ordering/immutability. Browser screenshots verify `user, assistant` after reload in all three applications.
3. **Quota feedback was misleading.** The shared UI previously advised trying again after HTTP 429 without identifying exhaustion. It now states that the Atlas usage limit has been reached and advises waiting for reset or contacting an administrator. This exact text was verified on desktop and mobile in all three applications.

The history drawer can cover the conversation on mobile while open. Mobile streaming/error screenshots close it with the visible history toggle. No layout overflow was observed in fresh 390×844 mobile contexts.

## Reproduction and rollout

From the repository root, use the existing Linux Playwright dependency wrapper or set `LD_LIBRARY_PATH` to `node_modules/.cache/playwright-linux-libs/usr/lib/x86_64-linux-gnu` where required.

- `node tooling/scripts/verification/verify-atlas-browser-acceptance.mjs <plane>` runs the core authenticated matrix and archives its principal fixtures.
- `--recover` rechecks the recorded fixture IDs after a controlled restart.
- `--isolation` tests other-plane fixture IDs through the current application's messages relay.
- `--cross-tenant` uses `<plane>-athyper.json` and tests another tenant/user plus spoofed tenant headers.
- `--non-owner` uses `<plane>-owner.json` for same-tenant read/edit/generation rejection.
- `--pagination` checks two pages independently, including archived fixtures.
- `node --import tsx tooling/scripts/verification/verify-atlas-browser-quota.mts --dev-only` temporarily applies a restrictive CIRRUSATLANTIC quota, runs browser assertions and restores the previous policy.
- `--unavailable` and `--quota` require a deliberately controlled outage/quota policy; they do not create or restore those conditions themselves. Always restore the condition in an outer `finally` block.
- `node tooling/scripts/verification/verify-atlas-mobile-acceptance.mjs` runs fresh mobile streaming, cancellation, active-duplicate, cancelled-replay, completion and chronological recovery checks separately for all planes.

Six targeted client contract tests and both affected package typechecks passed. All three production web images built and were deployed only to DEV. Image IDs, original Compose file lists and the new `local-atlas-browser.compose.json` overlay are recorded in `web-deployment.json` in the receipt directory. Rollback by replacing the overlay's three image IDs with their recorded previous IDs and recreating only the corresponding DEV web services with their recorded Compose files plus that overlay.

The DEV API was restarted and inference was stopped/started for this test. QA was not redeployed. Final checks found 48 running containers, no unhealthy containers, and HTTP 200 from API/Neon/Mesh/Studio readiness in both DEV and QA. Private generation readiness verified the pinned model after restart. Tools remain disabled.

At completion, 39 still-active synthetic conversations from this acceptance run were archived through authenticated browser relays (Neon 14, Mesh 13, Studio 12). Other fixtures were already archived by their tests. Original user conversations were not renamed, archived or deleted. `cleanup.json` records the archived fixture IDs.
