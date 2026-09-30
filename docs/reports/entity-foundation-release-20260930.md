# Entity foundation release evidence — 2026-09-30

Release PR: https://github.com/atlasdigitaltech/athyper/pull/7
Base: `stack-v2-foundation`. The separate release worktree preserves concurrent
UI/layout work in the original checkout. The PR is draft and is not merged.

## Completed DEV qualification

- Principal Profile and Notification Preference: ordinary parent-scoped create
  and edit, idempotent replay, stale-version conflict, immutable-parent and invalid
  field rejection. Notification receipt:
  `notification-write-journey/2026-09-30T10-39-41.894Z-4056903/summary.json`.
- Currency and Language: actual maker/checker proposals, independent owner OTP
  activation, workload execution, and verified activation on Studio/Neon/Mesh.
  Neon standard list/detail, search/filter/sort, pagination and anonymous denial
  passed. Evidence under `reference-batch-dev/2026-09-30T10-39-29.464Z-4055869/`;
  each entity has policy, execution and `browser.json` receipts.
- Seven publications per plane, including the existing Principal family,
  Country and masked probe, read back with matching verified payload and activation
  events: `entity-activation-dev/2026-09-30T10-51-27.442Z-4151049/summary.json`.
- Generated DEV compose now retains the workload configuration for API/worker.
  Both services were force-recreated from that file; unauthenticated execution
  returned 401. Private workload/client credentials are not committed.
- DB package typechecking passes. Frozen-commit foundation source qualification
  passed 1,875 tests with 30 optional skips; all required files executed.
  Receipt: `entity-foundation/2026-09-30T10-48-55.063Z-4118936/summary.json`.

DEV remains the existing source-mode workspace. This is reproducible configuration
and live behavior evidence, not an immutable production image deployment.

## Review and required checks

The scoped review checked tenant/owner coordinates on forms and transfers,
masked-field and classification admission, source/target publication boundaries,
immutable migration receipts, fixture/grant cleanup, and exclusion of unrelated
UI edits. This is agent review and a reviewable draft PR, not independent human
approval.

`stack-v2-foundation` now requires strict/up-to-date GitHub Actions `CI Success`,
including administrators. Force pushes and branch deletion remain disabled.
The aggregate includes the independent Entity foundation job. No failing check,
warning threshold, architecture budget or test assertion was disabled to obtain
release approval. Orphaned checks for removed bespoke BP implementations were
removed with explicit disposition; the shared route/lifecycle checks remain.

## Remote CI findings and remaining release blocker

Initial run: https://github.com/atlasdigitaltech/athyper/actions/runs/36704705804
The Entity foundation, three-plane permission and IAM jobs passed. The database
runner completed, but its outer validator still required a deleted BP projection;
the validator now requires the signed publication, partial activation, recovery,
replay and three-plane masked HTTP checks instead.

Other repaired entrypoint/build defects include missing package-local Vitest
configuration for the Entity governance packages, empty removed Master Data test
entrypoints and subpath exports, package-relative bootstrap test paths, the removed
BP 360 OpenAPI test invocation, ignored hash-locked collaboration profile files,
and an ES2020 bigint literal in the shared Entity decimal formatter. Numeric
semantics are retained using `BigInt(0)`.

Full workspace tests reached a separate Atlas failure:
`server/packages/platform/ai/src/__tests__/structured-intent.test.ts`, test
“persists assessment_scope guidance with no provider, quota, fabricated citations
or tool results”: `AtlasAgentRuntime.run` calls quota reservation unexpectedly.
That behavior is not changed by this Entity-only release.

Remote static policy reports also identify wider governance debt:

- temporal parsing findings in attachment/publication code;
- kernel/cross-package ownership boundary rules and a legacy HR provisioner;
- authorization inventory generation and unclassified authorization helpers;
- a Node-version mismatch in the old BP schema workflow;
- shell/frontend dependency budgets, removed-package registrations and foundation
  CSS/token size budgets;
- API-client dependency and BFF relay architecture checks;
- ESLint warning-budget overflow;
- undocumented attachment, collection, contact-verification and legacy publication
  routes;
- DDL coverage entries pointing at removed finance route files.

These require a separately scoped remediation decision where they extend beyond
shared Entity Framework work. Do not increase budgets, disable policies, restore
removed bespoke applications, or claim green CI to close this release. The PR must
remain unmerged until its required check passes. Production promotion and Atlas
expansion remain outside this change.
