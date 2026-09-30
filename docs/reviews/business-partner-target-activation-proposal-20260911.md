# Release 19 target activation: concrete read-grant proposal

Status: exact read grants and population dispositions approved by the user; grants applied at 09:38 MYT on 11 September 2026; enforcement not activated. Review revision `e4f76cbdecd7962a0adf1a3584552a605f73b6419b12124540ef5cdce4fb2bc2`.

## Exact grant change

Create one dedicated role and one dedicated group, with exactly two explicit members: `catl.admin` and `catl.owner`. Bind the role at the existing CirrusAtlantic tenant scope with **exact** propagation. Grant the 17 read permissions listed below. Existing roles, group memberships, denies, delegations, ACLs and grants remain untouched.

This is an explicit expansion to tenant-wide BP reading. It is not inferred from either account's administrator role and does not make either account a global steward. It covers every BP in the tenant, subject to field/provider policies; it is not restricted to qualification records. No export, import, reveal or mutation permission is included.

Window: 11 September 2026 08:00 MYT through 10 December 2026 08:00 MYT. Passing the start time does not activate anything automatically.

| Operation               | Proposed disposition                              |
| ----------------------- | ------------------------------------------------- |
| `enter`                 | `catl.admin`, `catl.owner` — approved tenant read |
| `discover`              | `catl.admin`, `catl.owner` — approved tenant read |
| `read`                  | `catl.admin`, `catl.owner` — approved tenant read |
| `navigate_manage`       | `catl.admin`, `catl.owner` — approved tenant read |
| `navigate_overview`     | `catl.admin`, `catl.owner` — approved tenant read |
| `export`                | No new grant; separate review                     |
| `configure_company`     | No new grant; separate review                     |
| `import`                | No new grant; separate review                     |
| `identity_read`         | `catl.admin`, `catl.owner` — approved tenant read |
| `contacts_read`         | `catl.admin`, `catl.owner` — approved tenant read |
| `addresses_read`        | `catl.admin`, `catl.owner` — approved tenant read |
| `identifier_read`       | `catl.admin`, `catl.owner` — approved tenant read |
| `tax_read`              | `catl.admin`, `catl.owner` — approved tenant read |
| `bank_read`             | `catl.admin`, `catl.owner` — approved tenant read |
| `qualification_read`    | `catl.admin`, `catl.owner` — approved tenant read |
| `certificate_read`      | `catl.admin`, `catl.owner` — approved tenant read |
| `credit_read`           | No new grant; separate review                     |
| `requests_read`         | `catl.admin`, `catl.owner` — approved tenant read |
| `activity_read`         | `catl.admin`, `catl.owner` — approved tenant read |
| `network_read`          | No new grant; separate review                     |
| `comments_read`         | `catl.admin`, `catl.owner` — approved tenant read |
| `attachments_read`      | `catl.admin`, `catl.owner` — approved tenant read |
| `bank_reveal`           | No new grant; separate review                     |
| `tax_reveal`            | No new grant; separate review                     |
| `qualification_company` | No new grant; separate review                     |
| `supplier_company_read` | No new grant; separate review                     |
| `customer_company_read` | No new grant; separate review                     |

Exact principal, role, group, permission and scope IDs are in the [JSON proposal](../../governance/policy/reviews/business-partner-target-read-grants.proposal.dev.json). The [transactional rehearsal](../../governance/policy/reports/business-partner-target-read-grants.dry-run.dev.json) created the exact role/group, 17 role-permission links, two memberships and one scoped assignment inside a transaction, checked constraints, then rolled back. All 13 authorization fingerprints were unchanged afterward.

## Whole-tenant activation impact

Three existing BP candidate accounts are not included: `acceptance.bp.v1.approver`, `acceptance.bp.v1.requester`, and `acceptance.bp.v1.materializer`. Their existing grants must not be removed, expired, restored or silently converted. The user approved case-only target access for these three accounts, including denial of target directory/master reads; case journeys still require qualification. A grant for two users is not a principal-scoped rollout mechanism.

The 21 previously approved responsibility rows compile onto their existing role/scope bindings; those bindings already carry their reviewed case/contact capabilities. This does not cover the 27 new BP target capabilities.

## Artifact compatibility defect

The current native loader compared the authored runtime binding array directly with the parsed, sorted binding array. Release 19 preserves authoring order, so its load failed with `ARTIFACT_PAYLOAD_INVALID` despite matching binding values and qualified current registrations.

The loader now parses both runtime binding sets before comparing their canonical hashes, matching native compiler behavior. Signatures, envelope/descriptor hashes, unique bindings, handler/resolver/workflow values, profile consistency and callable registration qualification remain mandatory. The artifact and original approvals are not modified. A regression now compiles **and loads** a signed artifact with reversed authored binding order; changed binding values remain rejected.

## Evidence review

The policy-difference checker currently reports `evidence_changed` for `entity-backend-authorizer.test.ts`. The change supplies the mandatory denial reason in a test mock; production policy behavior was not changed by that edit. The old acceptance still refers to its exact old evidence revision. It must not be rewritten as approval of the updated file. The user has now accepted the exact successor evidence revision; the current checker passes while preserving the old acceptance.

## Remaining activation requirements

1. Completed: applied the exact read grants within their effective window after successful grant and rollback rehearsals.
2. Preserve the accepted evidence revision and rerun its checker if evidence changes.
3. Current-runtime signed-artifact verification and fresh authenticated target qualification with an approved grant set.
4. Enforcement approval for the exact release, tenant/entity/plane selection, current grant migration and revocation-preserving rollback, within the approved time window.

No release-head or enforcement change is authorized merely by a passing rehearsal or reaching 08:00 MYT.

## Current verification and concrete decisions

The loader correction is deployed to API and worker. Both verified the existing release-19 signature, manifest, payload and all 42 operations / 48 scope bindings against the current registration factories. See [current runtime verification](../../governance/policy/reports/business-partner-release-19-current-runtime-verification.dev.json). This is compatibility evidence, not authenticated execution under the proposed new grants. All 13 authorization-table fingerprints remained unchanged, and the head remains release 18.

The [successor evidence proposal](../../governance/policy/reviews/business-partner-release-19-differences.successor-20260911.proposal.dev.json), revision `043ba1efdefd6863ae0a8b19111e139a8fc6f49ce80c91f3121e06da3fd14df1`, preserves all 29 historical and 37 current group dispositions. Only the changed regression-file hash is refreshed. Its checker now passes with all 66 dispositions accepted and zero unresolved reviewed dispositions. Old acceptance is preserved.

For the three acceptance accounts, the approved disposition is **case-only target access**: retain their existing IAM grants and reviewed case responsibilities, add no tenant BP read grant, and explicitly accept that target BP directory/master reads will be denied after activation. This is an effective behavior change even though no existing grant is deleted. The separate population approval records this acknowledgement; it does not authorize enforcement. Their case journeys still need qualification under the chosen policy.

## Recorded approvals and guarded execution

The user explicitly approved the three concrete proposals with “go ahead”. Separate receipts preserve the reviewed proposal hashes and do not impersonate the nominated account reviewers:

- [Exact read-grant approval](../../governance/policy/reviews/business-partner-target-read-grants.approval.dev.json).
- [Successor evidence acceptance](../../governance/policy/reviews/business-partner-release-19-differences.successor-20260911.acceptance.dev.json) and [passing check](../../governance/policy/reports/business-partner-release-19-differences.successor-20260911.check.dev.json).
- [Case-only population approval](../../governance/policy/reviews/business-partner-target-population.approval.dev.json).

`apply-business-partner-target-read-grants.mjs --apply` validates exact approval, proposal hashes, rehearsal, compatible deployed runtime images and health before database writes. Both the application and database enforce the effective window. The serializable transaction creates only new bindings, checks preservation of all existing authorization rows, and fails on collisions. It has no upsert or restoration path and never activates a release.

An attempted run at approximately 01:44 MYT on 11 September was correctly rejected before database access: [readiness result](../../governance/policy/reports/business-partner-target-read-grants.apply-readiness.dev.json). The window starts at **08:00 MYT**. No automatic activation or future execution is scheduled.

The [rollback rehearsal](../../governance/policy/reports/business-partner-target-read-grants.rollback-rehearsal.dev.json) created the proposed bindings, revoked only the two new memberships and one assignment, repeated revocation, checked preservation of every existing authorization row, and rolled back the whole transaction. The reusable revocation SQL never restores old grants or denies. Rehearsal does not qualify cache invalidation or live cross-instance revocation.

After application, fresh authenticated target journeys and explicit enforcement approval remain required. Shared DEV remains on release 18; the signed release-19 runtime verification is not a substitute for that qualification.

## Grant application completed — 11 September 2026

At 09:38 MYT the guarded transaction committed the approved role, group, 17 role-permission links, two memberships and one exact tenant assignment. See the [application receipt](../../governance/policy/reports/business-partner-target-read-grants.applied.dev.json). All existing authorization rows were checked for preservation inside the transaction. The post-application fingerprint comparison found exactly the expected additions across five tables; the other eight fingerprints were unchanged. No new permission definitions, export/import/reveal/mutation grants or steward responsibilities were added.

The time-window blocker is resolved; its earlier rejection is historical. Release 18 remains active. Both saved `catl.admin` and `catl.owner` NEON sessions returned `anonymous` after application. Fresh normal sign-in is required for authenticated target qualification; no session or qualification evidence was fabricated. The application receipt does not authorize release-19 enforcement.

## Authenticated recapture after session refresh

The refreshed `catl.admin` session passed 16 shared-DEV API checks: identity, approved permission presence, list, record, available unscoped providers and rejection of an invalid company. All 17 approved target permission codes were present and no additional target codes were present. Anonymous access was rejected. The [authenticated recapture](../../governance/policy/reports/business-partner-target-read-grants.authenticated.dev.json) contains status-only checks without business record values or session secrets.

Review & Approval also passed its browser/API qualification: one required organization selector, no premature list query, 10 rows after selection, no inherited company filter, unauthorized organization rejected and anonymous access rejected. See the refreshed [queue qualification](../../governance/policy/reports/business-partner-queue-context.qualified.dev.json).

`catl.owner` still returned `anonymous` at this capture and needs its normal session refreshed. The active head was verified as release 18 with artifact hash `95231dee569ed4f9acb9c4b180049965e96b3ba3c680e0d8b47119c01e43db96`. These shared-DEV checks do not establish release-19 target execution. No further grants or enforcement selection were changed by this qualification.

## Both named sessions qualified — 11 September 2026

After the second refresh, both named accounts authenticated with their expected principal and tenant IDs. The current [authenticated recapture](../../governance/policy/reports/business-partner-target-read-grants.authenticated.dev.json) passes for both: `catl.admin` completed 16 API checks and `catl.owner` completed eight, reflecting their different available providers under active release 18. Both expose all 17 approved target permission codes and no additional target codes. Anonymous access remains rejected.

The owner also passed [Review & Approval browser qualification](../../governance/policy/reports/business-partner-queue-context.qualified.catl.owner.dev.json): one organization selector, no list before selection, 10 scoped rows afterward, no inherited company filter, unauthorized organization rejected and anonymous access rejected. The reusable queue qualifier now accepts either named account and preserves separate owner evidence.

The expired-session blocker is closed. The shared activation head was rechecked and remains release 18 with artifact hash `95231dee569ed4f9acb9c4b180049965e96b3ba3c680e0d8b47119c01e43db96`. These are post-grant shared-DEV read/UI checks; release-19 execution qualification and enforcement approval remain separate. No grants or activation were changed during recapture.

## Current-process enforcement audit — 11 September 2026

The [current execution gate](../../governance/policy/reports/business-partner-current-execution-gate.dev.json) reverified release 19 inside both running shared API/worker containers, then inspected their deployed startup modules. Signature, manifest and all 42 runtime operation registrations pass. Current accepted policy dispositions also pass, and both named readers passed shared-DEV recapture.

**Target enforcement is not installed by normal process startup.** The deployed API calls `registerServices(container, {}, config)`. The deployed worker supplies release-review dependencies only. Neither supplies `businessPartnerBackendAuthorization`. `register-services.ts` exposes the optional adapter seam but does not manufacture deployment qualification, a release selector or a revocation watermark. Activating metadata alone cannot fill that seam.

The current checker therefore rejects activation readiness. It also distinguishes the old isolated command/import and export/AI/revocation execution images from the current shared runtime image. Their old passing receipts remain intact; neither becomes current-image evidence. The former isolated host has expired trust and revoked qualification grants, as documented in its runbook. It must not be repaired by restoring revoked memberships.

Required implementation and evidence before enforcement review:

1. Supply one reviewed deployment adapter to both normal API and worker startup: exact signed artifact/profile/runtime bindings, stored ownership and preflight, fresh IAM, verified qualification reference, current revocation watermark and explicit tenant/entity/plane rollout selection. Startup and requests must remain closed on incompatible or unavailable evidence. Keep shadow and enforcement selection mutually exclusive.
2. Qualify that same implementation and image against release 19 in a separately identified execution environment with the current approved authority. Preserve the prior isolated instance and its revoked grants. Positive tests must use capabilities actually assigned; import/export grants are not included in the 17 approved read additions.
3. Capture same-release reads/providers/fields, command/import boundaries, export/AI/revocation, company-owned and independent-child journeys. Existing shared-release-18 tests cannot satisfy this gate.
4. Qualify compatible release rollback in addition to the already-tested grant revocation procedure. Then present the complete exact deployment and rollout bundle for enforcement approval.

Run `node tooling/scripts/verification/capture-business-partner-current-execution-gate.mjs` for the read-only audit. Exit code 2 means the execution gate is incomplete. Its four regression tests reject absent adapters, release-18 reads, historical image/authority mismatches and missing relationship/rollback evidence; even complete evidence does not invent an enforcement approval.

No publication head, runtime image, grant or activation hold was changed by this audit. Shared DEV remains release 18.
