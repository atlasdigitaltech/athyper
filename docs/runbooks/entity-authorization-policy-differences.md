# Entity authorization policy difference review

The canonical review is
[the disposition ledger](../../governance/policy/reviews/entity-authorization-differences.dev.json),
assessed into [the gate report](../../governance/policy/reports/entity-authorization-difference-review.dev.json).
Original synthetic and live reports remain unchanged historical evidence. Their
raw counts must not be interpreted as reviewed acceptance or execution parity.

## Synthetic dispositions prepared for acceptance

| Difference | Explanation | Proposed disposition | Regression evidence |
| --- | --- | --- | --- |
| Organization requester read: allowed → denied | Legacy directory fallback accepts an organization permission; target global-record reading requires explicit tenant read | Accept separate discovery and global reading capabilities. Preserve legacy authority and grants until named responsibilities are reviewed. No organization-to-tenant widening | Actual IAM fixture reproduces both states and explicit-deny precedence |
| Hypothetical requester proposal: denied → context_required | Explicit root/entry and scoped proposal permissions permit discovery before selecting the proposed case's organization | Accept the context prompt as UX only. Reauthorize the chosen organization before execution; keep workflow boundaries. The persona remains unprovisioned | Actual IAM fixture reproduces context_required, permits the authorized selected organization and denies another organization |

Both dispositions are proposed until user acceptance is recorded. Acceptance of
these semantics does not approve named assignments, grant changes, rollout or
compatibility retirement. Existing instructions authorize shadow containment;
they do not constitute acceptance of every target policy difference.

## Observed live differences

The historical authenticated attestation records **27 differing groups, comprising
519 of 1,204 observations**, for one principal on the recorded shadow image. The
ledger retains each exact operation/permission/legacy/installed/candidate/evidence
tuple, its count and its source hash. Neither this review nor the later command
journey is a fresh capture of all groups against the current local implementation.

Read, navigation, directory and nested-provider groups show legacy allows versus
target denials. Root/parent admission and scope-contract differences are plausible
causes, and the synthetic fixture demonstrates that mechanism. However, the
aggregate does not retain denial stage or selected coordinates. It cannot prove
that every provider denial has the same cause. These explanations are explicitly
labelled **inference**, and acceptance remains blocked by missing causal evidence.

Create shows installed denial versus candidate preflight_required. Other command
and proposal groups show legacy allows versus target denials. These observations
are labelled **command_discovery_preview**. The observer never executes their
preflight or business commands. Installed/candidate divergence is retained even
when one target agrees with legacy.

The subsequent authenticated command journey established approval after MFA but
application failed on the internal-ownership/general-supplier invariant. That is
an engineering defect and a command qualification blocker; it is not an accepted
policy difference or evidence that preview denials should be ignored.

For each live group, the next required evidence is a bounded trace identifying
binding/root/parent/scope/domain/preflight admission under the same verified
persona and compatible profile. Repair implementation defects, then recapture.
Only a proven intended policy change goes to acceptance review. Never union allow
results or relax grants to force parity.

## Completion rule

A difference resolves only when all of these are present:

- Its exact source evidence remains hash-compatible.
- Its explanation and resolution are explicit, and its cause is confirmed.
- Referenced regression evidence exists and matches its recorded hash.
- Acceptance records a reviewer, review reference and timestamp.

New differences, changed evidence, unconfirmed causes, absent acceptance and stale
or duplicate disposition entries keep the gate closed. Raw differences may remain
when accepted; unresolved differences may not. A completed difference gate still
cannot activate enforcement: named-role review, complete engineering/deployment
qualification and compatible signed release/rollback gates remain separate.

```sh
node --test tooling/scripts/verification/entity-authorization/policy-differences.test.mjs
node tooling/scripts/verification/review-entity-policy-differences.mjs \
  governance/policy/reviews/entity-authorization-differences.dev.json \
  governance/policy/reports/entity-authorization-difference-review.dev.json \
  --require-resolved
```

The final command deliberately exits 2 while any review gate is open. Reports are
unsigned review artifacts. Do not fabricate reviewer acceptance to make it pass.

## Catalog installation and causal diagnostics (2026-09-10)

The 27 dedicated target capabilities have been installed as published, plane-owned
catalog entries. The catalog transaction checked all 19 non-catalog authorization
tables under locks before/after and changed no grants or activation. The
[installation receipt](../../governance/policy/reports/business-partner-target-catalog.installed.dev.json)
contains the real catalog IDs and inherited MFA/SoD flags. This does not grant any
user the new capabilities.

The [29-row triage](../../governance/policy/reviews/business-partner-policy-triage.dev.json)
separates two synthetic intended changes, four operations with approved deferral
choices needing current traces, and 23 live groups with unconfirmed causes.
Acceptance is still absent for all 29; operation approvals do not substitute for
release-bound policy-difference acceptance.

The evaluator now has a trusted diagnostic sink reporting bounded stage names:
binding, record, input scope, ownership, scope conflict, permission, parent read,
context, verification, historical state, preflight, completion and deferral.
The sink cannot change access, and its data never enters the client DTO. Shadow
telemetry retains installed and candidate traces, coordinate names (not values),
and whether a record coordinate was present. Aggregation and difference identity
preserve different causes even when final states match. Old trace-free evidence
remains historical and cannot claim this diagnostic qualification.

Tests establish binding/ownership/permission diagnosis, unchanged access if the
sink fails, telemetry privacy, and preservation of distinct causal groups.
Deployment of these diagnostics and authenticated recapture against a signed,
compatible selected release remain open. No current live cause is labelled
confirmed from those unit tests.

```sh
node tooling/scripts/verification/install-business-partner-target-catalog.mjs
# Explicit catalog-only installation; no grant/apply-rollout options exist:
node tooling/scripts/verification/install-business-partner-target-catalog.mjs --apply
node tooling/scripts/verification/prepare-business-partner-policy-triage.mjs
```

Rollback keeps new catalog definitions inert and retains current grants, denies
and revocations. Do not delete catalog entries or restore prior authorization
snapshots: grants may have changed after installation. Target enforcement has not
been activated, and this catalog transaction requires no enforcement rollback.

## Authenticated causal recapture (2026-09-10)

Diagnostic deployment and recapture are now complete for the current legacy-shadow
profile, rather than the proposed signed release. The focused API overlay changed
only the evaluator and observer JavaScript files. A concurrent Atlas API deployment
subsequently replaced the image and retained both exact file hashes. The
[deployment evidence](../../governance/policy/reports/business-partner-causal-deployment.dev.json)
records that distinction; restoring the original overlay rollback now would discard
concurrent work and must not be done blindly.

- `catl.admin`: 40 UI/API checks, 1,204 correlated observations, zero unavailable
  candidates in the clean repeat [capture](../../governance/policy/reports/business-partner-causal-shadow.admin-repeat.dev.json).
- `catl.owner`: 29 UI/API checks, 482 correlated observations, zero unavailable
  candidates in the [restricted-persona capture](../../governance/policy/reports/business-partner-causal-shadow.owner-qualified.dev.json).
  Network and Activity are explicit negative checks, including the restricted UI
  explanation. The original administrator-only test assumptions were not a reason
  to broaden the owner's grants.
- All 27 historical live difference groups have matching current observations and
  stage evidence in the [correlation report](../../governance/policy/reports/business-partner-policy-causal-correlation.repeat.dev.json).

Preserve the first capture containing 54 unavailable candidates and the failed
owner runs. The clean recapture does not prove the earlier transient unavailable
checks can never recur. Stage `verification` identifies the evaluator's final
non-allow branch; it alone does not prove MFA was the reason (scope denials also
reach that branch). Acceptance must account for the actual permission/scope rule.

The capture command now rejects API replacement after the browser capture began
or during log collection. It binds exact browser hashes, principal/grant snapshot
references, profile hash and image to the observations. No new signed release,
command application, grant assignment or reviewer acceptance was created by these
read-only journeys. All 29 original dispositions remain unresolved pending their
explicit evidence-bound decisions and selected-release qualification.

```sh
node tooling/scripts/verification/capture-business-partner-causal-evidence.mjs \
  governance/policy/reports/business-partner-causal-browser.admin-repeat.dev.json \
  /tmp/current-causal-capture.json
```

For the owner qualification run, use the explicit negative fixture flags
`QUALIFICATION_EXPECT_DENIED_NETWORK=1` and
`QUALIFICATION_EXPECT_DENIED_ACTIVITY=1`. Each flag asserts the denial and fails if
that access changes; it does not skip the API or UI check.

The [governed import proposal](../reviews/business-partner-governed-import-proposal.md)
defines an import gateway plus per-row organization-authorized request drafts,
separate submission and unchanged approval/application controls. It remains a
proposal requiring explicit operation review, implementation and qualification;
generic master mutations remain deferred.
