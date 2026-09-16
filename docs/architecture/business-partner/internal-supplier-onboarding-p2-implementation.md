# Internal supplier onboarding — P2 submission and cycle ownership

Date: 2026-09-14  
Status: Implemented, deployed and qualified in local DEV. Review-pack jobs await P4 execution; human workflows remain P3 work.

## Accepted submission

The existing Business Partner submit API now uses the [P2 coordinator](../../../server/apps/platform-host/src/composition/supplier-process-submission.ts) for internal, manually entered new-supplier requests. Routing uses the published requirement policy; supplier type and ownership are not separate route selectors.

The owning service authorizes submission, acquires the canonical idempotency and case locks, and reads the saved case. It checks the immutable acceptance ledger before running validation or reading policy. A matching replay returns the original process receipt. Different actor/version evidence for the same key, or a new key for an already accepted case, returns a conflict.

For an initial submission, one NEON transaction:

1. Rechecks the current version, requirement, intake fields, validation and representation evidence.
2. Calls the canonical case lifecycle command to create the submitted snapshot, without creating a case-wide workflow.
3. Resolves and evaluates the scoped policy against that snapshot, validates the exact manifest, and records immutable selection evidence.
4. Creates the selected cycle, sequential task dependencies and case subject association using the pinned cycle revision.
5. Projects preparation completion from the validated submitted snapshot: one consolidated task for Simple/Standard, four preparation tasks for Enhanced.
6. Creates a durable submitted-review-pack job and its outbox dispatch event using the P1 document intent contract.
7. Records the immutable attempt and bounded process receipt, then records the established case-submitted event and audit evidence.

The transaction commits all these records together. Any failure, including dispatch or final effects, rolls back the case snapshot, selection, run, tasks, attempt, document job and events. No renderer or network call runs inside the transaction.

The response contains `process` with cycle, attempt, selection and document-job IDs, attempt number, effective profile and `documentStatus: pending`. It contains no invented workflow/work-item IDs. The existing NEON client and Atlas command adapter accept this receipt. Case-view APIs show the actual pinned profile cycle code rather than the legacy hardcoded supplier-cycle code.

## Storage and document gates

Canonical governance DDL adds `process_attempt` and `process_document_job`. Tenant-composite foreign keys bind the attempt to its case, accepted evidence, run, snapshot and review-pack job. The reverse job-to-attempt key includes case/run/selection coordinates. Deferred constraints allow both sides to be created in one transaction and reject acceptance without a persisted job. The attempt is immutable; its receipt contains process coordinates, not another copy of the supplier proposal.

The [document intent port](../../../server/packages/platform/governance/src/process-selection/kysely-process-document-intent.ts) hashes the exact intent, enforces scope and snapshot consistency, and commits one `process.document.requested` event. Database validation compares the job's intent and document binding with the accepted manifest. New jobs must be pending; ordinary runtime privileges cannot manufacture ready results.

Review and approval tasks start blocked, without workflow stages, assignments or work items. Enhanced's submission-package task starts in progress. Database triggers reject releasing/completing human tasks, or completing the document task, before the attempt's review pack is ready. The canonical case-decision command also requires the document gate and the selected final-decision task binding; a null/legacy workflow binding cannot bypass the gate.

The subject-link command admits the selected cycle only when immutable selection evidence matches its exact revision and submitted snapshot. The legacy coordinator does not start or advance another supplier cycle for a P2-owned case. Submission omits the old reviewer-ready notification envelope; P7 owns notices from established committed events after the relevant gates.

The local catalog publisher also installs the normalized phase/category/task identities required by the cycle runtime's existing foreign keys. It checks existing task identities and preserves the published revision pins. No migration script was added.

## Qualification

Authenticated owning-API tests submitted Basic, Standard and Enhanced proposals. Concurrent calls with the same command produced exactly one acceptance and one replay. Repeated replay, including after API redeployment, returned the same IDs. Changed command keys were rejected. Each selected case has one attempt, one selection, one run and one review-pack job/dispatch, with 2/3/10 tasks and zero workflow requests/work items.

Real PostgreSQL checks verified preparation snapshot coordinates, blocked review tasks, document-job bindings, database rejection of premature task release and case approval, and replay while a newer active policy exists and policy/document service ports are unavailable. No reevaluation or document enqueue occurs on replay.

Four fault probes left the validated draft version and snapshot unchanged, with no committed process work:

- Selection configuration unavailable.
- Document dispatch fails after inserting its job/event.
- Failure after acceptance construction, before transaction commit.
- Document port returns an ID without persisting the required job; the deferred acceptance foreign key rejects it.

Fault probes use real PostgreSQL, case lifecycle, selection and document repositories, with explicit controlled authorization/failure ports. All their writes roll back. Live API qualification uses the existing authenticated DEV session and leaves synthetic accepted cases awaiting documents. A real browser reads the selected cycle through the owning view API, with no approval workflow or decision actions.

Validation: 74 case-service tests, 116 governance tests, 50 Atlas/Business Partner tests and 5 NEON client tests passed. Master-data, governance, host and NEON Business Partner typechecks passed. Affected server packages built and the source API was deployed healthy.

Reproduce against the configured local DEV environment:

```sh
node tooling/scripts/verification/install-supplier-process-submission-storage.mjs
pnpm exec tsx tooling/scripts/verification/publish-supplier-process-catalog-live.mts
pnpm exec tsx tooling/scripts/verification/qualify-supplier-process-submission-live.mts
pnpm exec tsx tooling/scripts/verification/qualify-supplier-process-submission-db.mts
```

Use `qualify-supplier-process-submission-live.mts --existing` to replay the saved qualification cases and repeat the browser check without creating new proposals.

Receipts: [live API/browser](../../../governance/policy/reports/supplier-process-submission-live.dev.json), [database/fault qualification](../../../governance/policy/reports/supplier-process-submission-db.dev.json), [canonical storage](../../../governance/policy/reports/supplier-process-submission-storage.dev.json), [combined P2 evidence](internal-supplier-onboarding-p2-evidence.json).

## Remaining package boundaries

P2 accepts and dispatches document intents; it does not claim a generated case review pack. P4 must claim pending jobs, perform authorized snapshot projection, render/store/scan with exact provenance, and commit gate results through its owning result command. P3 must consume ready gates to create task-owned reviews, resolve per-level eligibility and apply the designated final outcome. Until those owners are connected, accepted P2 cases safely wait with blocked human tasks.

P5 supplies same-profile correction and subsequent attempts; this implementation admits only the initial attempt and rejects a new submission key for an accepted case. P6–P9 and follow-ups B/C retain their defined scopes.
