# Authenticated Business Partner operation review

The native page `/mdg/operation-review` and API `/api/governance/operation-review`
record explicit per-operation proposal decisions using the existing NEON session,
live IAM identity, normal MFA and CSRF protection. `catl.owner` and `catl.admin`
are the nominated reviewers in both business/security domains. Each independently
records decisions; both must accept a proposal for its review to resolve. A reject
or conflicting decision remains blocked and requires an amended proposal revision.

The [concrete packet](../../governance/policy/reviews/business-partner-operation-workflow.dev.json)
contains 51 proposals: 27 dedicated target permission definitions with no grants,
nine target-operation deferrals, and 15 retained existing permission bindings.
Scope resolver and coordinate bindings, existing/proposed permission codes,
handler variants, workflow prerequisites, conditions and remaining engineering
are explicit. Dedicated capabilities do not modify existing permission scope or
inherit its grants. Deferral recommendations include certification, direct master
create/update and insufficiently defined sensitive/person/workforce/section-change
operations. Deferrals are not applied until the target release is separately built
and approved; legacy enforcement remains unchanged.

This packet approves policy proposals only. It does not prove callable runtime
registration or authenticated regression coverage. Its empty regression evidence
and `nativeCompilationEligible: false` remain explicit. Proposal receipts cannot
be passed directly to the native compiler's verified release-review adapter:
final compiled release/contract/profile/runtime/catalog hashes and qualified
operation evidence require a subsequent review binding.

Selections start empty. Reviewers inspect exact proposals, choose accept or reject,
supply a rationale and explicitly confirm both review domains. Submissions bind
packet and row hashes, server-derived identity/time and a unique idempotency key.
The server rechecks identity and pinned nomination/proposal files immediately
before an atomic state write. It rejects replay with changed content, stale
revisions, duplicate operations, identity injection, overwriting earlier decisions,
wrong Origin/CSRF and missing step-up. No runtime catalog/grant writes occur.

The isolated same-origin DEV adapter is `athyper/bp-operation-review:dev-20260910`.
Only its page/API routes are added to the gateway. Deployment inputs and durable
state live under:

```
/home/chandravel_natarajan/.athyper/instances/dev/deployments/bp-operation-review-20260910
```

`review/output/state.json` contains audit receipts when submitted. Preserve it and
all reviewed packet revisions. Rollback removes only the `bp-operation-review`
gateway router/service, restarts the gateway (file watching disabled), and stops
only that Compose service. Do not remove other services or restore grant snapshots.
Existing membership-review service and completed approvals remain separate.

Initial checks: five backend tests and NEON typechecking pass; container health
returns 200 and anonymous deployed API access returns 401. Owner MFA and live reviewer read qualification now pass. No real operation
decisions were submitted.
Synthetic test receipts live only in disposable test directories.

## Authenticated DEV qualification

The [owner evidence](../../governance/policy/reports/business-partner-operation-review-owner.dev.json)
records HTTP 200 with elevated assurance after MFA. The
[admin evidence](../../governance/policy/reports/business-partner-operation-review-admin.dev.json)
records HTTP 200 with baseline assurance. Both reviewers see all 51 proposals,
zero receipts, empty decision selections and disabled submission, with no browser
errors. Missing CSRF returns 403. A correctly CSRF-protected empty admin POST
returns `REVIEW_STEP_UP_REQUIRED`, confirming that baseline assurance cannot write.
Admin must complete fresh MFA when submitting decisions. No valid decision body
was sent to the live endpoint; write/atomicity/idempotency behavior is qualified
by synthetic backend tests, not fabricated live approvals.

## Explicit proposal approval recording

Following explicit user approval of all 51 proposals as written, the elevated
`catl.owner` session recorded its business/security decisions under receipt
`neon-operation-review:ce1ae433-298b-4dfa-8c48-855a34185a45`.
The [decision evidence](../../governance/policy/reports/business-partner-operation-decisions.dev.json)
exports the durable server receipts and independently assessed status. All 51
rows still await the second reviewer's confirmation. Admin MFA is pending; no
admin approval is inferred. Catalog/grant writes, publication and enforcement
activation remain unauthorized by these proposal receipts.

## Completed two-reviewer proposal decisions

After fresh MFA, `catl.admin` recorded acceptance of all 51 proposals under receipt
`neon-operation-review:cf21c7a3-0a36-4b46-9d6a-1914b4fe07f0`. Both authenticated
reviewer receipts now cover all 51 exact proposal revisions in business/security
domains. An independent assessment of durable state confirms zero unresolved
proposal decisions: 42 include proposals and nine deferral proposals accepted.
The decision evidence linked above contains both receipts and the final assessment.
Earlier pending-review statements are historical.

This accepts the 27 dedicated permission proposals without grant assignments,
nine target deferrals and 15 retained bindings as written. No permission catalog
entries, runtime grants, executable deferrals, publication artifacts or enforcement
selections were changed. Final runtime/contract/catalog bindings and regression
qualification still require the native release-review evidence described above.
The 29 policy-difference groups are a separate ledger and were not accepted by
this operation-proposal submission.

## Five existing-case corrections

The review endpoint now serves the separate five-row correction revision, showing
its target/effect and prior approval references. Both owner and admin completed
MFA and recorded their decisions. The original review deployment's state remains
intact; correction state is isolated under
`bp-case-correction-review-20260910/review/output/state.json`.
The [correction decision export](../../governance/policy/reports/business-partner-case-correction-decisions.dev.json)
and [corrected release review](../reviews/business-partner-case-runtime-correction.md)
record completion. An initial automation label-selector failure recorded no
approval; the selector was corrected and subsequent MFA sessions completed both
reviews. Automation now saves its authenticated session on error as well as success.

## Governed import review

The review endpoint now serves the one-row governed-import revision
`ef285c3c15543c113fb7321c5034c40a6be643e59c6f922cb98a7d8571bf104d`.
After explicit user approval, `catl.owner` and `catl.admin` each completed MFA and
recorded approval in both domains. The
[decision export](../../governance/policy/reports/business-partner-governed-import-decisions.dev.json)
verifies both receipts, exact proposal/nomination hashes and implementation/test
hashes. The proposal review is complete; publication eligibility remains false.

Durable state is isolated under
`bp-governed-import-review-20260910/review/output/state.json`. The deployment audit
pins the prior correction state hash and an immutable review image, with a
separate rollback compose file. Original and correction approvals are preserved.
Only the review service was recreated; runtime API, grants and enforcement were
not changed. MFA automation must use an interactive PTY so stdin remains open
between user turns; disable terminal echo before receiving a code.

## Route activation after the default-gateway cleanup

The default DEV gateway no longer includes these review routes. Append
`deploy/compose/instance/reviews/operation.compose.yaml` to the same Compose
file set that includes the DEV base stack and this review backend's generated
`review.compose.json`. Keep `deploy/compose/instance/compose.yaml` first so mount
paths resolve correctly. The overlay requires the backend service to be declared;
rendering fails when it is missing. Recreate the gateway with that file set to
activate the routes. Apply only to DEV. Both review overlays can be combined.

For rollback, omit this route overlay and recreate the gateway with the remaining
approved file set. Preserve review state and stop only the retired review backend.
The older instructions to edit route blocks in `dev.yaml` are superseded by this
procedure. Historical backend-only deployment scripts do not activate gateway routes.
