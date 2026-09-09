# BP-AI-02 deployed qualification — 2026-09-09

BP-AI-02's remaining DEV browser/live-model and frontend governance gates are closed. The authenticated Chromium run passed all 22 checks through the deployed Neon BFF, API, authorized owner services and existing `atlas-re-1.0-local` model mode. No mocked browser endpoints were used. [Machine-readable evidence](bp-ai-02-deployed-20260909.json) records the exact running images, check results, timings and private receipt hashes. [Governance closure](bp-ai-02-governance-20260909.md) records the dependency audit and contract-purity correction.

## Deployed behavior

- Manage publishes filtered scope, visible rows and fields; selecting a row changes the target and generation. Closing/reopening Atlas preserves that selection. Pinned pagination remains clickable; the next cursor and applied search produce the correct snapshots.
- BP360 sends the admitted record ID and saved revision. The local model invokes `bp_read_summary`, receives an owner-backed citation, and completes a grounded answer. Changing the record panel tab changes its section context.
- Fullscreen retains both the exact page snapshot and completed thread binding.
- Forged tenant input returns 400. Forged record/company and mixed permitted/denied selection requests return 403 before `run.started`.
- Historical context retains its instant and invokes no current-data tools. The supplier role lens survives transport.
- Navigating to another record during an outstanding run clears its transcript and starts a new generation/conversation for the destination. Returning to Manage removes record coordinates. No browser page errors occurred in the successful run.

Twelve completed model turns took 541–2,657 ms each, measured from submission through the terminal stream and rendered answer; intentional pacing is excluded. This is functional qualification, not a latency sample replacing BP-AI-00. Generic mounted Manage/record-panel restoration, dirty-state behavior and controlled late-event races remain covered by the focused client/controller suite; the deployed BP360 check exercises its real record panel tabs.

## Corrections found during qualification

The full Manage scope plus tool definitions exceeded the conservative local prompt bound. The runtime now passes a compact navigation projection to the model while retaining complete validated query coordinates server-side. A subsequent verified tool result could also exhaust the window. When necessary, the answer step omits another round's tool definitions, preserving all current-turn evidence and instructions and reserving at least 128 output tokens within the unchanged 4,096-token limit. A runtime regression verifies that evidence survives this fallback intact.

Pinned Atlas originally defined its width only on the workspace itself, leaving the shell's reservation unresolved. Moving the variable to the shell fixes background controls being covered by the pinned dock; the deployed browser verifies pagination by ordinary pointer interaction.

Failed qualification attempts are preserved privately, including budget failures, interrupted response capture, a transient record load failure, and an expired-token admission failure. The final runner refreshes the existing session through the normal auth endpoint and allows responsive/lazy content to settle at a human request pace. It does not bypass authentication, authorization, rate limits or model bounds.

## Validation and deployment

AI contracts: 20 tests; AI runtime: 189 tests; focused client/controller: 13 tests; R9: 94 assertions. AI typechecking, Neon/API production builds, frontend-spine governance, shared purity (63 packages), governance policy tests (3), and frontend contract/transport regressions (17) passed.

Only DEV API and Neon were recreated with the qualified images. Original image/environment overlays and rollback command are retained privately in `~/.athyper/instances/dev/receipts/bp-ai-02-20260909`. Raw streams, screenshots and session state stay outside the repository; the public receipt contains no cookies or business-record payloads. Qualification created Atlas conversations and performed read-only business operations. This closes BP-AI-02's stated gates; later roadmap packages and production rollout retain their own qualification scope.

Reproduce with an existing authenticated DEV storage state:

```sh
ATLAS_TEST_STORAGE_STATE=/private/neon-state.json \
ATLAS_TOOL_RECEIPT_DIR=/private/new-bp-ai-02-receipts \
node tooling/scripts/verification/qualify-atlas-business-context.mjs
```

Set `ATLAS_PLAYWRIGHT_LIBS` when Chromium needs an external shared-library directory.
