# Business Partner R9 Atlas qualification

The local release contains two version-1 tools in the existing Atlas workspace:
`bp_read_summary` and `bp_submit_case`. Run `pnpm qualify:business-partner-r9`
before release; CI runs the same gate. Any failed test blocks the local gate.

`bp_read_summary` queries only one Business Partner through the existing Records
metadata, record authorization and field-security gateway. It projects code,
display name, partner category and status, with exact record/revision/descriptor
citations. Missing or inconsistent evidence fails closed. `readiness` is always
`not_evaluated`: an active BP does not establish Supplier/Customer readiness.
Source values are untrusted data and cannot select fields or command bindings.

`bp_submit_case` accepts only an entity-case UUID and positive expected version.
The normal Atlas preview must display the same target, obtain explicit user
confirmation, and reauthorize before calling the NEON case owner's `submit`.
That service checks tenant/organization scope, current validation, current
version, representation evidence, distinct approvers and atomic idempotency.
The downstream key is `atlas:<proposal UUID>`. The returned workflow request UUID
and case row version provide the submission receipt. Protected case payloads
are excluded from the result and the invocation ledger retains hashes and
coordinates. Submission does not approve or materialize the case.

## Evaluation coverage

The executable set is
`server/packages/platform/ai/src/__tests__/business-partner-evaluations.test.ts`.
Its stable `BP-EVAL-001` through `BP-EVAL-013` groups cover field projection and
citations, source injection, invalid evidence, confirmed submit/replay, schema
injection, target mismatch, missing/invalid/revoked/expired confirmation,
permission/policy/epoch/principal/tenant/plane changes, owner rejection,
unsupported commands, preview denial, concurrency and unauthorized cancellation.
The gate also executes the existing owner-service and Atlas-governance suites,
and verifies the versioned development publication.

These are deterministic command-boundary evaluations. They do not measure a
live model's recommendation accuracy or constitute target browser evidence.
Evidence extraction, scored duplicate recommendations, draft corrections,
three-way conflict resolution, role readiness recommendations and Workforce
processing require separate owner contracts and evaluation sets before addition.
No tools for those features are registered by this release.

## Target qualification

1. Deploy with the existing Atlas persistence, tools, provider, admission and
   policy dependencies configured. Keep mutation admission disabled until the
   local gate and target read checks pass. If agent profiles use a tool
   allowlist, add only the evaluated tool codes to the approved profile.
2. Publish a Business Partner descriptor exposing `record_version` as
   `storage.versionField`. The development provisioner now produces immutable
   release 10; do not modify an already published descriptor in place.
3. In the existing workspace, use a tenant/organization-scoped reader to verify
   citations and denied fields; confirm another tenant's record is inaccessible.
4. With approved mutation admission, use a requester and a validated draft to
   inspect and confirm a submit proposal. Retain the proposal/workflow/version
   coordinates and verify the independent approver receives the normal task.
5. Repeat with stale version, expired/cancelled confirmation, revoked permission,
   missing validation and an actor from another tenant. No rejected action may
   change the case or create a workflow task.
6. Retain sanitized browser and exact provider/model/prompt/policy revision
   evidence, including adversarial source prompts, and obtain accountable release
   approval. Never store tokens, protected fields or raw production prompts in
   the repository.

Target qualification remains pending until those receipts exist. To disable the
feature, remove these tool codes from the approved profile or disable the
existing Atlas tool/mutation admission controls. Inspect failed invocation
history and the owning case/workflow receipt before retrying. Do not delete
ledger rows or bypass the case command to recover an uncertain submission.
