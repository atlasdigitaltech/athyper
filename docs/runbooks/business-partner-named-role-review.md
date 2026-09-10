# Business Partner named-role review

Status: all 79 rows now have complete recommendations in the revision below. No approved responsibilities
or grant changes are recorded. The user explicitly nominated `catl.owner` for both
business and security review of this 79-combination packet. The nomination does
not approve any row or grant runtime access to another tenant.

## Review packet

- [Named candidate inventory](../../governance/policy/reports/business-partner-role-review.named.dev.json)
- [Editable review packet](../../governance/policy/reviews/business-partner-named-role-review.dev.json)
- [Assessment](../../governance/policy/reports/business-partner-named-role-assessment.dev.json)
- [All 79 combinations](../reviews/business-partner-named-role-candidates.dev.md)

A fresh read-only DEV inventory still contains 79 combinations, covering 19
principals: 49 combinations in Athyper, 16 in CirrusAtlantic, and 14 in Technostat.
All 13 persisted authorization-table fingerprints equal the prior inventory.
Actual principal names/status and scope target IDs are included. A scope-target
registry ID is kept separate from the organization/legal-entity/tenant target ID.

This is a review of the prepared BP-bearing-role cohort. It is not a complete
inventory of all case-only roles, delegates or effective permissions. The
permission lists describe role contents; denies, ACLs, policy gates, principal
status, time windows and assurance still affect effective authority.

## Findings requiring explicit decisions

| Finding | Candidate combinations | Review consequence |
| --- | ---: | --- |
| “Reader” role includes mutation or sensitive capabilities | 27 | Review capabilities individually; do not approve based on the role name |
| Legal-entity scope | 22 | Do not reinterpret as company-code ownership or assign company configuration automatically |
| Legacy direct mutation capabilities | 72 | These are not evidence of global stewardship; use a separate governed capability proposal |
| Sensitive read/write/reveal capabilities | 30 | Review data class, purpose, scope and MFA separately |
| Scoped directory read | 49 | Does not establish explicit global-record authority |
| Subtree propagation | 49 | Review coverage of both current and future descendants |
| Principal has requester and approver candidates across memberships | 61 | Preserve command-level maker/checker separation |
| Principal has approver and applier candidates across memberships | 61 | Preserve independent approval/application boundaries |

Counts overlap and refer to combinations, not distinct people. Combined candidate
capabilities do not establish a separation-of-duties violation or effective access.

## Named approval procedure

1. User/business owner nominates reviewers and their authority. Add each to
   `reviewers` with stable ID, name, authority reference, covered tenant IDs and
   domains (`business`, `security`). One explicitly authorized reviewer may cover
   both domains. No reviewer is inferred from administrator membership.
2. For each candidate, record one decision: approve defined responsibilities,
   retain legacy only, or exclude from target mapping. Retention/exclusion requires
   a rationale and leaves current effective grants unchanged.
3. For approved responsibilities, explicitly select capabilities and the exact
   existing scope/propagation. Record MFA and rationale, maker/checker conditions,
   deny/revocation precedence, effective dates or reviewed no-expiry policy, and
   reviewed descendant coverage. Critical approval/apply/reveal capabilities
   require MFA and explicit separation conditions in this packet.
4. Assess the packet to obtain each row's `proposalSha256`. Each business and
   security reviewer records approval of that hash, a review reference and time.
   Hashes bind the candidate identity, inventory snapshot and proposed decision.
5. Reassess. Missing rows/reviewers, wrong-tenant approvals, stale hashes,
   undefined responsibility/capability mappings and scope widening keep the gate
   closed. Refreshing evidence or editing a proposal requires renewed review.

This tooling does not accept widened scopes or new permission capabilities as
unchanged-grant assignments. Global stewardship, company configuration without
company scope, and other new capabilities need a separately specified grant-change
review. Such changes remain blocked here; the tool has no apply mode. Sensitive
and legacy mutation review placeholders cannot become responsibilities merely by
being copied into the approved list.

The gate records completion of review for this cohort. Even if every candidate is
retained/excluded and review completes, that does not prove target responsibility
coverage. The report keeps `targetRoleCoverageQualified` and `activationEligible`
false. Approval entries are review evidence, not cryptographic deployment receipts.

```sh
node --test tooling/scripts/verification/entity-authorization/named-role-review.test.mjs
node tooling/scripts/verification/prepare-business-partner-named-role-review.mjs assess \
  governance/policy/reports/business-partner-role-review.named.dev.json \
  governance/policy/reviews/business-partner-named-role-review.dev.json \
  governance/policy/reports/business-partner-named-role-assessment.dev.json \
  --require-reviewed
```

The final command exits 2 while the cohort review is incomplete. Preparation
refuses to overwrite an existing review packet, so it cannot erase approvals.


## Complete recommendation revision

Use [the complete batch review](../reviews/business-partner-role-recommendations.dev.md)
and [its machine-readable packet](../../governance/policy/reviews/business-partner-named-role-recommendations.dev.json).
The original candidate packet is preserved. The new revision recommends:

- 21 scoped assignments: 16 requester/reader/applier combinations, two dedicated
  reader/approver combinations, and three contact-verifier combinations.
- 56 legacy-only retentions while global-read, stewardship, sensitive capability
  or legal-entity/company-code boundaries are resolved.
- Two acceptance-fixture exclusions from target mapping, retaining all their
  current grants until a separately approved cleanup.

Nine equivalent batches cover 41 combinations; 38 exceptions remain individual.
A batch does not create a group-wide grant: its approved subjects are only its
explicit named members. Each member includes tenant, principal, group, exact scope,
propagation and proposal hash. The batch manifest has a separate hash. Five
exceptions concern `catl.owner` as subject and require explicit acknowledgement.

Assignments propose a 90-day window, 2026-09-11T00:00:00Z to
2026-12-10T00:00:00Z, with issuer MFA, maker/checker and independent-applier
conditions. Separate activation must occur within the window; an expired window
requires renewed review. Retention/exclusion dates are review dates only. Existing
grant validity and effective permissions remain untouched.

The [separate grant-change proposal](../../governance/policy/reviews/business-partner-role-grant-proposal.dev.json)
contains zero changes and explicitly lists unresolved future capability designs.
Approving mapped subsets does not approve remaining legacy capabilities for target
enforcement, delete them, or grant global-record admission.

### Record actual batch approval

After explicit approval is received, save its evidence with these fields:
`decision: "approve"`, `domains: ["business", "security"]`, `reviewerId: "catl.owner"`,
`reference`, `approvedAt`, `batchId` and the exact `batchSha256` from the review.
Reviewer-as-subject exceptions additionally require `selfReviewAcknowledged: true`.
The reference must identify the actual approval, not the earlier reviewer nomination.

```sh
node tooling/scripts/verification/recommend-business-partner-roles.mjs record-approval \
  governance/policy/reports/business-partner-role-review.named.dev.json \
  governance/policy/reviews/business-partner-named-role-recommendations.dev.json \
  /path/to/new-reviewed-packet.json /path/to/received-approval.json
node tooling/scripts/verification/prepare-business-partner-named-role-review.mjs assess \
  governance/policy/reports/business-partner-role-review.named.dev.json \
  /path/to/new-reviewed-packet.json /path/to/new-assessment.json --require-reviewed
```

Recording refuses stale batches, an unauthorized reviewer/domain/tenant, incomplete
conditions, expired assignment windows, or overwriting prior approvals. Changing
one member's proposal invalidates approvals for the whole original batch. A new
approval writes a new packet revision and never modifies the source or runtime.

The checker currently reports only missing business/security approvals for all 79
rows. No actual approvals have been supplied for this complete recommendation
revision. Do not manufacture them from the instruction to prepare the package.

## Automated single-submission approval recording

The [prepared approval request](../../governance/policy/reviews/business-partner-owner-approval.dev/request.json)
binds all 47 manifests to the exact inventory and packet bytes. Its
[response template](../../governance/policy/reviews/business-partner-owner-approval.dev/response-template.json)
starts with `decision: pending`, no selected manifests and no self-review
acknowledgements. Creating the request grants no approval.

`catl.owner` supplies one explicit response for the selected manifest IDs, both
review domains, review reference and actual approval timestamp. The five
reviewer-as-subject manifests must be acknowledged by exact ID. Partial selection
is supported; unselected rows remain pending. A stale source, packet, manifest,
wrong reviewer, missing acknowledgement or incomplete conditions rejects the
submission before any artifacts are written.

```sh
node tooling/scripts/verification/automate-business-partner-role-approval.mjs record \
  governance/policy/reports/business-partner-role-review.named.dev.json \
  governance/policy/reviews/business-partner-named-role-recommendations.dev.json \
  /path/to/new-recorded-approval-directory \
  governance/policy/reviews/business-partner-owner-approval.dev/request.json \
  /path/to/received-owner-response.json
```

The command records all selected manifests, reruns the assessment, and publishes
the packet, assessment, request, response and recording receipt together in a new
directory. The original packet is preserved. It makes no runtime calls, grants or
activation changes. Approval timestamps must follow the prepared request.

This is an automated artifact recorder, **not an authenticated NEON reviewer UI**.
The recording receipt explicitly states `authenticatedReviewer: false`: the
review reference must point to the actual externally received reviewer decision.
The account name, supplied test credentials, reviewer nomination and request
creation are not evidence that the owner approved. A future authenticated inbox
or browser flow must bind its verified reviewer decision to the same request hash;
this recorder cannot be treated as a signed activation receipt.

## Authenticated NEON review screen (DEV)

The native page `/mdg/authorization-review` and backend
`/api/governance/named-role-review` now use the shared authenticated review handler.
The artifact recorder above remains an unauthenticated alternative; it does not
inherit the browser handler's identity assurance.

The browser starts with no selections. The nominated `catl.owner` must select
manifests, explicitly confirm both review domains, acknowledge any selected
self-review exceptions and complete normal MFA before submitting. The server
verifies the session and live IAM identity, checks CSRF and origin, rechecks
identity before saving, and atomically records the packet, assessment and receipt.
Submission IDs make identical retries idempotent. Changed proposals, source bytes,
missing conditions or reviewer identity fail closed. No grants or activation are
changed. Live IAM currently supplies identity and authorization epoch, not a
policy-profile hash; activation must independently compare fresh grants and
revocations against the reviewed inventory.

For isolated DEV qualification, the native UI and same handler are bundled into
`athyper/bp-owner-review:dev-20260910`. Only the two review route prefixes are
routed to `bp-role-review`; existing NEON authentication endpoints and Redis
sessions are reused. The existing NEON application image is unchanged.
Deployment artifacts, readonly input snapshots, gateway backup and persistent
review output are under:

```
/home/chandravel_natarajan/.athyper/instances/dev/deployments/bp-owner-review-20260910
```

The review state is `review/output/state.json`. Preserve this audit state during
rollback. Remove only the `bp-role-review` router/service blocks from
`deploy/compose/instance/config/traefik/dev.yaml`, restart
`athyper-dev-gateway-1` (file watching is disabled), then stop only the review
service using `review.compose.json`. Do not restore grant snapshots or run
Compose with `--remove-orphans`. The original gateway backup is for comparison;
do not overwrite unrelated subsequent configuration changes.

Initial qualification: six authenticated-handler tests pass, NEON typechecking
passes, the isolated service health endpoint returns 200, and anonymous access to
the deployed review API returns 401. Owner MFA succeeded; the authenticated review API returns 200 with elevated
assurance, 47 manifests, 79 rows and zero receipts. The browser renders without
page errors or alerts, starts with zero checked boxes and disables approval. A
POST without CSRF returns 403 `REVIEW_CSRF_INVALID`. No real review approvals
have been recorded.
Synthetic handler write tests do not establish real reviewer approval.

The existing admin session returned 401 (expired), so authenticated non-reviewer
denial remains covered by handler tests rather than a live admin journey.
[Qualification evidence](../../governance/policy/reports/business-partner-authenticated-review-qualification.dev.json)
records these boundaries. Real approval writes await the explicit owner decision.

## Two-reviewer routing and recorded approval

The user explicitly nominated `catl.admin` for business/security review of the five
`catl.owner` membership manifests. The new
[packet](../../governance/policy/reviews/business-partner-two-reviewer-recommendations.dev.json)
assigns those five to admin and the other 42 manifests to owner. Proposals and
manifest revisions are unchanged. Each reviewer sees only assigned rows; both
are prohibited from self-approval. Recording and assessment both enforce routing;
changing the reviewer authority invalidates its recorded approvals.

The isolated DEV release is now `athyper/bp-owner-review:dev-20260910-two-reviewers`,
with deployment and separate persistent state under the previous deployment path
suffixed `-two-reviewers`. The original pending packet/state is preserved. Do not
roll back to the old routing to bypass outstanding independent review; preserve
both audit directories and fail closed until compatible routing can be restored.

Following the user's explicit approval of all manifests, the elevated owner
session recorded 42 assigned manifests (74 rows) at `2026-09-09T18:41:54.058Z`.
Receipt: `neon-role-review:7457b4d4-304b-4d33-b395-d9e3c39b34c6`.
The independently rerun checker leaves exactly five rows pending admin review.
[Recorded packet](../../governance/policy/reviews/business-partner-two-reviewer-recorded.dev.json),
[assessment](../../governance/policy/reports/business-partner-two-reviewer-assessment.dev.json),
and [receipts](../../governance/policy/reports/business-partner-two-reviewer-receipts.dev.json)
are exported from the durable server state. All 34 role-review tests and NEON
typechecking pass. Admin's fresh MFA challenge is pending. No runtime grants or
activation were changed.

### Completion: authenticated independent review

At `2026-09-09T18:43:21.613Z`, after fresh MFA, the admin session recorded all five
assigned owner-membership manifests under receipt
`neon-role-review:37fce15d-a20b-4f33-8d40-4b1f752add37`. The preceding pending-admin
status is historical. The durable packet, assessment and receipt exports linked
above now include both authenticated submissions.

An independent checker rerun confirms 79/79 resolved rows, both review domains
approved, two authenticated receipts and no self-approvals. The live API reports
`platformReviewComplete: true`. This completes the named-role proposal review,
not the migration: `activationEligible: false`, no grant changes and no activation
authorization. Compatible publication, deployment/command qualification, policy
resolution and enforcement approval remain separate gates. Current revocations
must be checked again before any activation.
