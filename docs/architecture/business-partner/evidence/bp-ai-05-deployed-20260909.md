# BP-AI-05 DEV deployment and qualification — 2026-09-09

BP-AI-05 is deployed and qualified in DEV for the existing authenticated principal. The final Chromium run passed **24 checks** through the real Neon BFF, API, Records owner and pinned local model. [Machine-readable evidence](bp-ai-05-deployed-20260909.json) records the running image IDs, source/artifact hashes, checks and timings. The API and Neon containers are healthy.

## Qualified behavior

- The natural starter question “Summarize this business partner” produces a cited answer. Identity and lifecycle status match the authorized owner result. A natural follow-up retains the record context and its reauthorized conversation sources, without treating lifecycle status as an eligibility evaluation.
- Dock sources open with Enter, focus the source summary and retain a visible focus indicator. Fullscreen restores the same source links and exactly the same rendered prose. Persisted streaming chunks preserve whitespace instead of becoming separate lines.
- Starter buttons fill the actual editable composer without generating a request. Opening the dock focuses the composer; Escape closes it and restores the launcher focus.
- HTML, JavaScript URLs and invented action/evidence identifiers in the adversarial live turn remain inert. No model-created executable link, image, script or action preview appears. Strict envelope tests separately reject invented structured references and unknown fields.
- Desktop (1440×1000) and mobile (390×844) dock/fullscreen layouts pass viewport-overflow checks. Fullscreen controls remain visible and history collapses on narrow screens. Screenshots were reviewed for readable source wrapping, replay text and usable controls.
- Five scoped axe scans report zero violations for the configured WCAG A/AA and best-practice rules. Unresolved contrast nodes received computed-color review, including conservative bounds across the header gradient; the lowest reviewed ratio was **5.17:1**. Chromium accessibility trees and keyboard behavior were also inspected. The successful run had no browser page errors.

The three final live turns completed in 4,096 ms, 1,066 ms and 2,985 ms, including rendering and, for business questions, an authenticated owner-history verification read. This small functional sample does not replace the BP-AI-00 latency baseline. The installed `qwen3:8b` manifest matches the pinned digest recorded in the model lock; the public model is `atlas-re-1.0-local`.

## Corrections made during qualification

The production build exposed a browser module-resolution issue in the shared answer contract. Browser checks then found incomplete editor population, an unnamed attachment input, nested/duplicate landmarks, lost focus after fragment navigation, overflowing source revisions/tooltips, and an unbounded fullscreen layout. These were corrected and redeployed.

Replay now retains server-owned source coordinates under the existing message-lineage hash and authorization checks. Bounded history supplies deduplicated, reauthorized citations separately from model content. New answers and idempotent replay can expose those sources; legacy content without authoritative source metadata does not acquire invented citations. Tests verify revocation withholding and rejection of source-like fields inside arbitrary tool data.

## Deployment and checks

The first full API production build succeeded. A subsequent full-tree rebuild encountered concurrently incomplete bank-directory work. The final API image uses that successful immutable base plus the compiled AI contract/runtime packages, with a runtime import smoke check. The private overlay, emitted artifacts, image IDs and original rollback configuration are retained in `~/.athyper/instances/dev/receipts/bp-ai-05-20260909`. Neon passed its full production build. Only DEV API and Neon were recreated; no business mutation was invoked by the qualification suite.

Validation passed: 13 envelope/client tests, 11 renderer/composer/context tests, 15 runtime/replay tests, the 94-test R9 gate, changed-package typechecks, frontend governance and test reachability. Earlier failed attempts remain in private receipts. Raw streams, screenshots, record payloads and session state are excluded from repository evidence.

Reproduce using an existing authenticated DEV storage state:

```sh
ATLAS_TEST_STORAGE_STATE=/private/neon-state.json \
ATLAS_TOOL_RECEIPT_DIR=/private/bp-ai-05-new-run \
ATLAS_PLAYWRIGHT_LIBS=/path/to/playwright-linux-libs/usr/lib/x86_64-linux-gnu \
node tooling/scripts/verification/qualify-atlas-answer-presentation.mjs
```

This closes BP-AI-05's DEV deployment and automated browser/live-model accessibility qualification. The scope is the existing DEV principal and synthetic partner fixture. It does not claim a physical screen-reader session, blanket WCAG certification, universal prose factuality, new BP owner-tool qualification, or the wider BP-AI-09 persona/production rollout gate.
