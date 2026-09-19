# Existing-case runtime correction

Five accepted operation proposals incorrectly describe their command target as a
proposed resource. Update, validation, submission, decision and application all
address an existing request. Authorization must use the ownership stored in that
request's current snapshot, rather than proposed or shell coordinates.

| Operation | Previously proposed | Corrected owning-service target |
| --- | --- | --- |
| case_update | proposed | existing |
| case_validate | proposed | existing |
| case_submit | proposed | existing |
| case_decide | proposed | existing |
| case_materialize | proposed | existing |

Permission codes and organization scope kinds stay the same. Creation still uses
proposed organization ownership; case listing remains an organization-scoped
collection. No grants, scope propagation, MFA or separation-of-duties requirements
are changed by this correction.

The [revision-bound correction packet](../../governance/policy/reviews/business-partner-case-runtime-correction.dev.json)
contains the five exact proposals and regression hashes. Original authenticated
approvals remain untouched. No correction approvals are recorded. The separately
prepared governed import proposal also remains pending.

`business-partner-case-runtime.ts` now registers seven actual owning-service
methods: create, list, patch, validate, submit, decide and apply. Existing command
resolvers translate `business_partner/case_*` to `entity_case/*` and load stored
ownership. Workflow preflight translates to the owning case operation names and
preserves its blocked result. Handler registration never runs the business method
as a fake preflight.

The host's native publication configuration now provides a read-only plane catalog
adapter for published permissions and active scope definitions. Runtime checks
run the case semantics guard even when an external compiler registry is supplied.
Without a supplied registry, available case services register their actual callable
methods; unregistered operations keep complete-profile qualification closed.

Validation: two focused registration tests, host typecheck, and all 127 native
publication tests pass. These are local engineering checks. This host change has
not been deployed and does not establish signed-release or authenticated command
qualification. Complete BP registration still requires the other owning handlers
and their preflights. No signed artifact is claimed while those checks are open.

## Preparation-path fix

Normal preparation now automatically produces the
[corrected release draft](../../governance/policy/reports/business-partner-corrected-release.dev.json)
and points the readiness report at it. All five targets are corrected in both the
profile and operation-binding rows, with the versioned owning-handler references
from the correction packet. The original accepted selection remains historical
approval evidence and must not be substituted for this runtime candidate.

```sh
pnpm exec tsx tooling/scripts/verification/prepare-business-partner-accepted-operations.mts
```

The [case target check](../../governance/policy/reports/business-partner-case-target-check.dev.json)
now passes native descriptor parsing and the owning-case semantics guard. This
closes the proposed-versus-existing engineering mismatch in the corrected draft.
The transformation verifies original/correction hashes, exact prior approvals,
complete five-row coverage and unchanged permissions, scopes and workflow rules.
It preserves unrelated bindings and deferrals. Historical receipt hashes are
explicitly labelled as original approvals, not correction approvals.

Three additional regressions cover synchronized descriptor/binding correction,
stale/incomplete revisions, and attempted permission/scope/workflow expansions.
The correction review remains pending, so no signature, publication, deployment,
grant change or activation is produced by preparing this fixed candidate.

## Correction review completed

Both nominated reviewers recorded MFA-authenticated acceptance of all five exact
correction proposals. The [durable decision export](../../governance/policy/reports/business-partner-case-correction-decisions.dev.json)
contains owner receipt `neon-operation-review:47d65f2d-0ea4-431c-90a8-9bdfb7c1339e`
and admin receipt `neon-operation-review:b7845873-a295-4a2a-8724-0a67e9cf3f2a`.
There are zero unresolved correction decisions. This supersedes the pending
correction-review status above without changing the original 51-operation receipts.

Preparation now verifies durable/exported receipt equality, exact proposal hashes,
reviewer identity, both domains, MFA, nomination hash and regression file hashes.
It records `correctionReview: approved` and removes only the correction-review gate.
The corrected descriptor and binding targets continue to pass native validation.
Other runtime registrations, import review/implementation, signed compilation,
exact-release qualification and separate policy-difference acceptance remain open.
No grants, publication or activation are authorized by these correction receipts.
