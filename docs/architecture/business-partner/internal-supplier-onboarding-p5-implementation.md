# Internal supplier onboarding — P5 correction and closure

Date: 2026-09-14  
Status: P5 implemented and qualified in local DEV. P6–P9 and follow-ups B/C remain separate scopes.

## Correction ownership

The existing task owner accepts `return` and `reject` with exact attempt, cycle task, workflow, stage, work item and expected work-item version. A nonblank reason is required. The owner rechecks current reviewer eligibility, maker/checker exclusions, document readiness and the active stage. A returned/rejected vote cannot become an approval. Its receipt is durable and replayable; after a new attempt starts, the old command is stale.

The canonical case lifecycle command commits the return evidence, snapshot and outbox event together with cancellation of outstanding work items, pending/active workflow stages, unfinished tasks and pending/processing/failed document jobs. Completed reviews, decisions, immutable selection evidence, prior snapshots and ready artifacts remain historical. Cancellation revokes render leases. Worker discovery excludes returned/cancelled cases and uses the latest attempt; database commands reject stale callbacks and creation of historical workflow/work-item executions.

The canonical editable state is `draft`; the existing evidence-based projection displays `returned`. Both the submission command and case action projection now support this validated returned draft. Authorized amendments and validation retain their existing owners.

## Same run, fresh attempt

Correction resolves the original immutable publication by scope and exact policy revision. It does not resolve a new publication head. Exact policy evaluation uses the original policy eligibility date, while current authority facts and minimum controls use the new evaluation time. New selection evidence records both dates and the corrected facts.

The effective profile and complete manifest must match the accepted selection. A different stronger or weaker profile produces HTTP 409 with `PROCESS_CORRECTION_PROFILE_CHANGE_UNSUPPORTED` and an explicit close/new-request explanation. The saved draft remains; the submission transaction creates no new snapshot, selection, attempt, task, run or document job on this failure.

An accepted correction retains the run and manifest, increments the attempt number and creates a new submitted snapshot, preparation evidence, review-pack job, tasks and workflow executions. All selected reviews restart. `cycle_task.process_attempt_id` makes task identity unique per run/template/attempt, with deferred foreign keys; ordinary cycle tasks retain their original single-instance semantics. Attempt guards enforce sequence, unchanged policy/manifest, prior return evidence and absence of old outstanding work. Completed or cancelled task history cannot be rewritten.

Concurrent identical resubmissions return one accepted attempt and one replay. The new attempt cannot make decisions until its own review pack is ready. Earlier ready packs and completed reviews cannot satisfy that requirement.

## Rejection and explicit closure

Rejection records the canonical rejected decision snapshot, cancels unfinished work and sets the cycle to `cancelled`, never `completed`. The decision document remains durable follow-up work after rejection and uses the existing real renderer, scanner, storage and recipient controls.

`POST /api/governance/process-tasks/cases/:caseId/cancel` accepts `attemptId`, `expectedVersion`, `reason` and `idempotencyKey`. It requires scoped submission authority and requester/run-owner identity. Only unmaterialized proposals can close. Its command evidence and event are `entity.case.cancel`; it does not fabricate a reviewer rejection. It cancels pending document work without deleting ready artifacts. Already materialized proposals cannot use this path.

The NEON request screen exposes task-bound return/reject actions, feedback, attempt history, requester closure and a separate new-request link after rejection/cancellation. The normal Validate/Submit actions support returned drafts. A profile-changing submission displays the owning API's explicit unsupported-change message. New requests are created separately; no confidential payload is copied or replacement run created. The qualification receipt records the independently created replacement request IDs; no automatic replacement association is inferred.

## Qualification

[P5 evidence](internal-supplier-onboarding-p5-evidence.json) contains the live API, PostgreSQL and browser receipts and deployed image identities.

- Basic, Standard and Enhanced each complete a same-profile correction with an actual saved amendment, a new pack and full re-review. The current reviewer roster requires 1, 2 and 10 votes respectively. Standard/Enhanced preserve an earlier completed review and still restart it.
- Concurrent resubmission accepts one attempt. Old task commands fail; historical pack downloads retain the original SHA-256. Final decisions leave the cases approved and cycles running, preserving P6's separate materialization/activation/closure boundaries.
- Stronger and weaker requirement changes return 409, preserve the edited draft and create no attempt or document work. Authorized cancellation then closes the old proposal; separate new drafts have distinct IDs.
- Terminal rejection creates a real downloadable decision PDF whose bytes match the stored checksum.
- PostgreSQL checks run as `athyperapp`, with fault mutations rolled back. They verify immutable attempts/tasks/decisions, forbidden historical execution creation, stale document callbacks, materialized-case cancellation denial, permitted unmaterialized approved-case closure, revoked in-flight leases and suppressed worker discovery.
- Chromium verifies reviewer return, returned feedback/edit access, visible profile-change rejection, validation/resubmission, restarted review, explicit closure, retained history, separate new-request navigation and reviewer rejection against the owning APIs. Requirement amendments in this test use the owning PATCH API; full dynamic form/UI qualification remains P8.
- Focused tests cover 25 policy-selection cases, 74 case-service cases, six case-view cases and five host route/projection cases. Host, governance, master-data and NEON builds/type checks pass.

The dedicated in-flight fixture is an ordinary submitted synthetic request. Fault qualification temporarily changes its render-job state, executes the real closure command and rolls the whole transaction back. It does not install fake ready artifacts or modify real business proposals.

## Reproduce locally

P0–P4 catalogs and the DEV services must already be configured. Use valid DEV NEON `catl.admin` and `catl.owner` sessions.

```sh
node tooling/scripts/verification/install-supplier-process-correction-storage.mjs
pnpm --filter @athyper/server-platform-governance build
pnpm --filter @athyper/server-service-master-data build
pnpm --filter @athyper/server-platform-host build
pnpm --filter @athyper/neon build
# Deploy sequentially; wait for healthy services before qualification.
node tooling/scripts/verification/deploy-supplier-process-selection.mjs --api-only
node tooling/scripts/verification/deploy-supplier-process-selection.mjs --neon-only
node tooling/scripts/verification/deploy-supplier-process-selection.mjs --worker-only
node tooling/scripts/verification/deploy-supplier-process-selection.mjs --scheduler-only
pnpm exec tsx tooling/scripts/verification/qualify-supplier-process-correction-live.mts
pnpm exec tsx tooling/scripts/verification/qualify-supplier-process-correction-db.mts
pnpm exec tsx tooling/scripts/verification/qualify-supplier-process-correction-browser.mts
```

The installer applies canonical definitions directly and binds existing P2–P4 tasks to their accepted attempts. There is no migration package. It preserves the existing local qualification evidence.
