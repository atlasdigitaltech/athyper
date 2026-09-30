# Entity authorization adoption and review

Status: the DEV Business Partner shadow integration milestone is complete for the
qualified authenticated principal and scoped/denied paths. Grants are unchanged.
Target enforcement, governance-persona/workflow qualification, platform-wide
generality and compatibility retirement remain pending. See the
[BP shadow runbook](business-partner-authorization-shadow.md) and
[attestation](../../governance/policy/reports/business-partner-shadow-attestation.dev.json).

## Operator constraint

Keep effective grants unchanged until the named steward/requester mapping is
reviewed. Existing BP administrator roles identify candidates only. No automatic
global stewardship, grant widening, activation, or compatibility retirement is
part of the current dry run.

## Implemented components

- Strict `EntityAuthorizationProfileV1` parser in server metadata contracts.
  Rejects unknown versions/properties, unregistered scope resolvers, incomplete
  root-field/operation coverage, mismatched permissions, recursive discovery and
  unsafe query uses of masked fields.
- Authoring compiler validates exact-plane permission and required scope bindings;
  runtime descriptor hydration validates the profile again.
- Shared evaluator resolves existing/proposed targets through trusted service
  ports and requires installed compatible operation bindings. Safe readiness DTOs
  omit grant evidence, data payloads and arbitrary URLs.
- Field projection, command-field allowlist, query-use authorization and independent
  relationship helpers. Nested providers must supply their own projection policy;
  these helpers are not automatically applied to every existing endpoint.
- Stored ownership adapter checks tenant/entity/record/resolver evidence. Domain
  services must provide real ownership/catalog/preflight implementations.
- Legacy/shadow/enforce selector requires exact release compatibility, verified
  qualification, reviewed differences, full coverage and revocation-safe rollback
  evidence before enforce.
- Bounded, isolated IAM shadow observer can be injected through
  `ServiceRegistrationDependencies.entityAuthorizationShadow`. Generic service
  and BP authorizers pass advisory observations without replacing their decisions.
  The default remains off. DEV now configures a pinned BP observer around both
  authorizers with read-only scope storage and sanitized evidence. This activates
  shadow observation only, not target enforcement.
- Descriptor hydration now retains existing field read/write permissions,
  classification/retention annotations and operation authorization mode rather
  than silently discarding them.

The profile schema is a first executable subset of the target design. Application
and section policy references exist, but shared UI rendering, all BP providers,
workflow authority and transport schemas still need adoption. The existing
authoring operation-permission tables support NEON/MESH target planes; Studio
authoring adoption requires its own compatible schema work. No platform-wide
generality or complete BP migration is claimed.

## Reproducible inventory and dry run

From the repository root:

```sh
node tooling/scripts/verification/inventory-entity-authorization.mjs dev governance/policy/reports/entity-authorization-inventory.dev.json
node tooling/scripts/verification/plan-entity-authorization-migration.mjs governance/policy/reports/entity-authorization-inventory.dev.json packages/contracts/platform/fixtures/entity-authorization/business-partner.v1.json governance/policy/reports/entity-authorization-migration.dev.json
pnpm exec tsx tooling/scripts/verification/qualify-entity-authorization.mts governance/policy/reports/entity-authorization-shadow.dev.json
```

Inventory uses read-only transactions and bounded queries. It captures active
descriptor rows and role/scope grant aggregates. It is not an effective activation
head resolver or a complete principal/deny/ACL/delegation inventory. Protected
business rows and credentials are not read into the report.

The migration script has no apply mode or writer. It records missing operations,
permission mismatches, unmapped fields/legacy operations, candidate administrator
roles, pending responsibility mappings and activation blockers. `grantChanges`
remains empty. Inventory and profile file hashes bind the proposal inputs.

The qualification script uses the real IAM evaluator with synthetic snapshots and
storage adapters. Its four BP comparisons include an existing organization-only
requester and an explicitly hypothetical, unprovisioned steward/requester. Two
differences remain unresolved. Company ownership and independent child denial are
fixture checks, not live database, workflow or browser qualification.

## Selected-release publication preparation

The [publication dry-run runbook](entity-authorization-publication-dry-run.md)
now documents a read-only effective-head resolver and versioned operation binding
review packet. DEV CirrusAtlantic selects tenant BP release 17 over global release
25. All 51 candidate operations have source handler/workflow mappings or explicit
review dispositions; the selected descriptor needs 39 additions. Catalog/scope and
semantic gates remain explicit. This is an unsigned preparation artifact, not a
native publication or enforcement approval. Effective grants remain unchanged.

## Backend enforcement integration

The [backend enforcement runbook](business-partner-backend-enforcement.md) records
an implemented first slice: a qualified target authorizer boundary, explicit
server-selected profile enforcement, Records field/query/row guards, mutation
field checks and transfer execution/delivery reauthorization. Default legacy and
shadow modes remain unchanged. Complete nested provider policies, independent
child routes, authorized SQL aggregates and real deployment adapter/command
qualification remain engineering work; the backend completion criterion is not
yet satisfied.

## Evidence and remaining work

| Requested stage | Current result | Remaining gate |
| --- | --- | --- |
| Inventory | DEV descriptor/grant aggregate artifact captured for three planes | Effective principal/deny/ACL/delegation evidence and activation-head lineage |
| Profiles/ownership | Decisions documented; BP and two qualification profiles authored | Named global steward/requester mapping; provider-specific field profiles |
| Types/compiler/fixtures | Implemented with boundary and regression tests | Real metadata graph publication and provider/handler reference coverage |
| Shared adapters/DTOs | BP generic/domain gates observed; real read-only scope adapter deployed | Qualified authenticated UI projections and observed mappings; independent-provider ownership remains a migration gate |
| Shadow comparison | DEV API/worker/scheduler configured; unchanged authorization rows verified | One authenticated principal qualified across scoped/denied cases; broader governance personas and same-phase commands remain before enforcement |
| BP migration | Proposal/dry run prepared; legacy behavior selected | Reads, sections, nested fields, commands, exports/AI and UI migrated together |
| Generality qualification | Company and child fixture checks pass | Real company-owned service and independently owned child journeys |
| Activation/rollback | Enforce gate and rollback constraints implemented | Signed governance receipt, approved mappings and complete parity |
| Compatibility retirement | Explicitly ineligible | Reviewed parity after the full migration |

Command-path shadow evaluations intentionally use discovery-only target previews
so they cannot invoke command preflights. Evidence labels the original phase and
target phase; a discovery preview cannot satisfy execution parity.

## Steward/requester review proposal

The [named review artifact](../../governance/policy/reports/business-partner-role-review.dev.json)
now records 79 principal/group/role/scope combinations and their role permission
codes. Suggested responsibilities are review options, not assigned roles. All
review rows default to retaining current grants; named assignments and grant
changes remain empty. Deployment and storage evidence are linked from the
[BP shadow runbook](business-partner-authorization-shadow.md).


The DEV inventory identifies these role candidates:

- `demo.neon.testing-admin-tenant-exact`
- `demo.neon.testing-admin-operating_organization-subtree`
- `demo.neon.testing-admin-legal_entity-exact`

For each proposed assignment, review the actual principal/group, responsibility,
target tenant/organization/company, capability set, approval/apply separation,
effective dates and revocation handling. Candidate role membership alone is not
approval. Global read, global proposal, global approval and global apply are
separate decisions; a role name is not proof of any of them.

## Activation and rollback

No release is activated by these scripts. The future owning deployment must
verify the qualification receipt, matching descriptor/profile/binding/runtime
revisions, every coverage dimension, zero unresolved differences, company/child
qualification, grant review, rollback reference and current revocation watermark.

Preserve compatible prior metadata/bindings/images. Never restore an old grant
database snapshot as rollback. Revalidate current grants, denials and revocations;
if old code/artifacts cannot honor them, rollback remains closed and requires a
compatible repair release. Do not union old and new allow results.

## Native publication integration follow-up (2026-09-10)

The native publication worker now has an authorization compiler path and the
receiving loader requires exact callable runtime compatibility for artifacts with
`authorizationRuntime`. Strict authoring validation, descriptor hydration and signed
artifact regression tests are implemented. See
[Native entity authorization publication](entity-authorization-native-publication.md)
for the input contract, configuration and remaining gates.

This does not make the DEV review packet publishable. Complete BP runtime descriptor
lowering, actual owning-service registrations and authenticated handler/resolver
journeys remain open, alongside the recorded permission/scope/semantic review gates.
No grants, activation or enforcement selections were changed.

## Named-role review completion — 2026-09-09 UTC

The [two-reviewer assessment](../../governance/policy/reports/business-partner-two-reviewer-assessment.dev.json)
now records all 79 candidate mappings resolved, with zero unresolved review rows.
Following explicit user approval and reviewer nomination, MFA-authenticated
`catl.owner` approved 42 manifests/74 rows and MFA-authenticated `catl.admin`
approved the five owner-membership manifests. No reviewer approved their own
membership. [Authenticated receipts](../../governance/policy/reports/business-partner-two-reviewer-receipts.dev.json)
and the [recorded packet](../../governance/policy/reviews/business-partner-two-reviewer-recorded.dev.json)
provide the exact revision evidence. Earlier pending-review statements describe
previous artifacts; this is the current named-role proposal review status.

This review does not add unproposed global stewardship, mutate effective grants,
or authorize activation. Publication compatibility, live policy differences,
remaining command/deployment qualification and enforcement approval remain gated.
The assessment deliberately retains `activationEligible: false` and
`targetRoleCoverageQualified: false`.

## Activation-readiness package

The [DEV readiness review](../reviews/business-partner-activation-readiness.dev.md)
refreshes the approved mapping comparison, current grant fingerprints, effective
publication head and database-adapter checks. It includes the exact zero-change
persisted-grant proposal and enumerates remaining engineering/review gates.
Package generation is complete; activation is not authorized or ready.

The [ownership command milestone](business-partner-ownership-command-fix.md) now
has a successful fresh-MFA application and negative validation evidence. This
closes the specific internal/general default conflict, while preserving the old
approved snapshot and all grants. It does not qualify every target-policy path.

The [runtime completion status](../reviews/business-partner-runtime-completion-status.md)
records the subsequent local work: 42 of 42 selected registrations, dual-reviewed
governed import with local native/API integration, read-only export preflight,
and a fresh confirmation of unchanged activation head 17. The native registry
passes all selected operation contracts; qualification creation now has a real
read-only database preflight. The explicit
provider permission transition now requires both legacy domain and target
authority. Restricted-value bindings use the existing reveal owners; existing
qualification decisions cannot fall back to proposed-resource authority.
The selected import draft and registration checks are local fixture evidence;
no signed release, authenticated target qualification, policy-difference
acceptance, grant migration or activation is claimed.
