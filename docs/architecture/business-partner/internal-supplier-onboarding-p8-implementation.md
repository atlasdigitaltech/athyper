# Increment A P8 — NEON integration

Status: accepted in local DEV on 2026-09-15 (Malaysia time).

The existing Business Partner request workspace now consumes the process-selection, task, document, notification and completion owners. No new expression engine, supplier-type split, migration, replacement run or downgrade exception is introduced. Follow-ups B/C and P9 remain separate scopes.

## Integration

- Published Standard request and Full profile forms retain the P1 compliance requirement/reason fields. Draft and returned-request previews evaluate saved case facts through the exact policy adapter. Unsaved changes explicitly require saving before preview.
- The supplier journey shows requested/candidate/effective profiles, pinned selection evidence, task dependencies, review levels/quorum, final decision designation, current attempt and retained historical review evidence. Historical records have no command controls.
- The task owner supplies allowed review actions after checking scoped decision authority, current reviewer eligibility, assignee/claimant, active stage, work-item status, maker-checker and document readiness. Every command still repeats its own authorization and coordinate/version checks. Cancellation capability uses the same scoped submit authority as its command.
- Review, rejection, return and closure use existing task/case commands with exact attempt/task/work-item coordinates. A profile-changing correction explains that no new review work was created and directs the user to restore the profile or close/create a separate proposal.
- Document views expose purpose, readiness/gate state and expandable exact snapshot/template/artifact provenance. Download and retry capabilities come from the document owner. Buttons supply the relay's required idempotency key. Historical document notices retain the exact job/attempt and expose no current review or retry action; missing pins are never replaced silently.
- Readiness is read from the existing consolidated completion evaluator. Approval, materialization, activation and closure remain distinct gates. Closure is offered only with an authoritative capability and current run version. The existing supplier controls receive the request's pinned organization/company in their link, independently of the shell's currently selected company.
- Communications show only deliveries addressed to the current principal after case-read authorization. No recipient addresses or another principal's delivery ledger are projected. Operational delivery retry remains with its existing authority; the request workspace introduces no broad retry control.
- The P5/P6 closure integration now updates terminal run state without appending a redundant `data.closure` value to immutable selection pins. Closure reason/snapshot remain in the authoritative case-command and task evidence; the P6 pin guard is unchanged.
- Activity uses recorded case-command, task, document and delivery evidence. The supplier workspace does not manufacture an audit feed from mutable timestamps or row versions.
- Request commands stay disabled during validation and the subsequent version refresh. Aborted reads cannot replace a later request's state.

## Qualification

Reproducible local checks:

```sh
node tooling/scripts/verification/install-supplier-onboarding-neon-contracts.mjs
node tooling/scripts/verification/qualify-supplier-onboarding-neon-db.mjs
pnpm --filter @athyper/product-neon-business-partner typecheck
pnpm --filter @athyper/product-neon-business-partner test
pnpm --filter @athyper/server-platform-host test
pnpm --filter @athyper/server-platform-governance exec vitest run src/cycles
pnpm --filter @athyper/server-platform-governance build
pnpm --filter @athyper/server-platform-host build
pnpm --filter @athyper/neon build
pnpm exec tsx tooling/scripts/verification/qualify-supplier-onboarding-neon-actions.mts --resume
pnpm exec tsx tooling/scripts/verification/qualify-supplier-onboarding-neon-live.mts
pnpm exec tsx tooling/scripts/verification/qualify-supplier-onboarding-neon-history.mts
node tooling/scripts/verification/record-supplier-onboarding-neon-evidence.mjs
```

The action script uses three fresh P8 requests and real NEON buttons for submission and all 13 reviews. A separate returned Standard request exercises both published form views, rejected profile change without new work, same-profile resubmission, full re-review and explicit closure retaining both attempts. A further Basic request is rejected through the assigned reviewer button. Existing P7 completed fixtures supply real scanned/stored documents and activated suppliers for current-user downloads, SHA-256 verification, readiness and captured delivery views. Fresh P8 upstream qualification/activation authority is not fabricated or granted by these scripts.

The generic document-host test uses a Kysely dummy transaction to represent an invoice with no supplier-document binding. This preserves the host's new binding lookup before ordinary document authorization, instead of providing an empty object as a transaction.

Live reports are [actions](../../../governance/policy/reports/supplier-onboarding-neon-actions.dev.json) and [workspace/documents/readiness](../../../governance/policy/reports/supplier-onboarding-neon-live.dev.json). Screenshots are under `governance/policy/reports/p8-browser/`. No temporary access grants are created by P8.

The [PostgreSQL regression](../../../governance/policy/reports/supplier-onboarding-neon-db.dev.json) rolls back real lifecycle cancellation and verifies unchanged run pins, retained closure evidence and rejection of direct pin edits.

Final qualification: 204 product tests, 462 host tests (one existing skip), and 27 cycle tests pass. Product/host typechecks and governance/host/NEON builds pass. Six real user/profile browser journeys verify nine PDF checksums and the original readiness scope. The historical-notice check downloads the exact old review pack after correction and closure, exposing no current commands. All P7 temporary grants remain revoked. Evidence: [P8 acceptance](internal-supplier-onboarding-p8-evidence.json).
