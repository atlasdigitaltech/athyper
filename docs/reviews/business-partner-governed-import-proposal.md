# Business Partner governed import proposal

Status: approved by both nominated reviewers through authenticated MFA sessions.
This approval does not authorize grants, publication or activation, and does not
rewrite the original operation packet or case corrections.

The implementation proposal is now pinned in
[`business-partner-governed-import-workflow.dev.json`](../../governance/policy/reviews/business-partner-governed-import-workflow.dev.json),
revision `ef285c3c15543c113fb7321c5034c40a6be643e59c6f922cb98a7d8571bf104d`.
Both reviewers approved this exact revision. It adds a real draft-only intake
adapter and a deployment adapter for separate gateway and stored row-scope checks;
its dedicated API and native binding are now implemented locally, subject to the
separate compatible release and enforcement selection gates.

The [verified decision export](../../governance/policy/reports/business-partner-governed-import-decisions.dev.json)
records `catl.owner` receipt
`neon-operation-review:9bd1233b-b4b0-4b1b-b4cf-b7281ae4c388` and `catl.admin`
receipt `neon-operation-review:22742ecd-2285-47bb-a720-d366001390d7`.
Both cover business and security domains, the exact proposal hash and elevated
assurance. Implementation/test hashes and preservation of prior correction
receipts were checked before export. The import proposal-review gate is closed;
local native binding/API integration is implemented; deployment and exact-release
qualification remain open.

The exact input is JSON schema version 1, a stable `batchKey`, and 1–100 rows.
The total input limit is 4 MiB. Each row has a unique `rowKey`, a required UUID
`operatingOrganizationId`, an optional UUID `companyCodeId`, `proposedPayload`,
and optional typed `extensions`. Keys contain 8–100 supported characters.
Unknown top-level/row fields and generic mutation modes are rejected.

The owning service now has a non-writing `preflightCreate` path. It checks intake,
create authority and the published schema, then uses the same validator as stored
requests. Typed extensions are projected as persisted relationship proposals for
validation. Import pins that schema before creation. Revocation or another failure
during execution stops remaining rows; outcomes preserve earlier draft results.
Idempotency is scoped to tenant, principal, batch key and row key.

Seven new regression tests cover actual draft validation, incompatible subtype,
missing primary relationships, separate gateway/row authorization, scope failure,
replay/conflict, limits and revocation. These are service/adapter fixtures, not
authenticated deployment evidence. Successful qualification still requires an
explicitly authorized principal with the new gateway capability.

The target import gateway creates supplier-request drafts. It never writes a BP
master directly. Existing generic create/update/upsert/delete/replace import modes
remain unavailable, as required by the approved deferrals.

| Contract | Proposed behavior |
| --- | --- |
| Gateway | Retain `neon.relationship.bp_target.import` at exact tenant scope, with no grants inferred from installation |
| Each row | Require the existing approved `case_create` binding (`neon.relationship.entity_case.create`) at the proposed operating organization |
| Ownership | Resolve and validate the row's organization using the stored catalog; a shell company or overview filter cannot supply authority |
| Handler | A new bounded batch intake adapter delegates each row to the real BP request service's `create` method with case type `new_partner` and requested role `supplier` |
| Inputs | At most 100 rows; organization and idempotency identity required; ownership/subtype and primary relationships must be coherent |
| Validation | Parse and validate the whole batch, scope compatibility and per-row authority before creating any draft; use the owning request validator, including internal/intercompany rules |
| Execution | Reauthorize immediately before each row creation. Retain explicit per-row outcomes because the owning service owns its transaction; do not promise cross-row atomicity |
| Retry | Stable batch/row idempotency keys; replay returns prior results and cannot create duplicate requests |
| Submission | Separate explicit submit command, with fresh validation and permission checks |
| Approval/application | Existing MFA, maker/checker, immutable evidence and materializer checks remain separate commands |
| Revocation | Revocation before a row executes stops that row and remaining work; existing drafts are not silently applied or deleted |
| API/UI | A dedicated governed-request import flow; generic record import modes stay disabled |

Required qualification includes batch limits, malformed and incompatible rows,
unauthorized/mixed organizations, all-before-write validation, partial completion
under revocation, idempotent replay, and confirmation that no BP master or approval
is created by import. Positive gateway qualification also requires an explicitly
approved scoped assignment; catalog installation grants neither test user this
new capability.

This proposal retains the approved gateway and row capabilities and introduces a
new handler and workflow. Its revision-bound operation review is now complete.
Import remains unavailable in the target release until the implemented native
binding/API is deployed with compatible publication, qualification and enforcement
selection. No live runtime deployment or activation was performed by this work.
