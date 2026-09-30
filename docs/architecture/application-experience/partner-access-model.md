# Partner Access Model

Updated: 2026-09-24.

Status: **Proposed model — evidence-gated; not locked or authorized for live grant changes.**
This document consolidates the persona, permission and prototype audit reviews.
Approval to update documentation is not approval to provision roles, change IAM,
enable authorization enforcement, or implement the qualification design.

## 1. Purpose and prototype boundary

Use small capability roles and explicit scoped assignments to provide reviewable
Business Partner access. Do not restore the retired nested persona ladder.

[Partner Access Model prototype](https://claude.ai/artifact/PTYVeMfEdfHQPBV4RktySz)
is an externally hosted illustration described by its author. The page was not
accessible during this review; its interactive implementation has not been verified
and has not been changed by this document update. Its access/sharing settings are
not verified here.

The described sample uses CirrusAtlantic, legal entity `org-1000000001`, companies
`cc-uk01` and `cc-br01`, and partner Aster Research Services. These are scenario
inputs, not a declaration of current DEV master data. Permission codes may be real
while compatibility, memberships and consumer statuses remain illustrative.

Display **“Illustrative — not connected to live authorization”** near each result,
not only in the footer. Use **“Allowed by sample model”**, not an unqualified
“Allowed”. Do not call the model locked until an explicit approval record exists.

## 2. Verified baseline and interpretation

Findings below are dated review evidence, not a continuously refreshed inventory:

- The current Neon authorization pack defines zero roles and a zero-grant
  quarantine group template. DEV review found no role/group-role assignments for
  the three demo tenants. Existing usernames do not confer authority.
- The retired Neon ladder contained 67/70/325/461/498/538/538 permission IDs for
  Viewer/Reporter/Requester/Agent/Manager/Owner/Admin. Owner and Admin were identical.
  Do not mechanically transplant retired IDs into the current catalog.
- The retired development manifest's 149 enabled subjects and the retired
  neon-admin pack's 142 assignments are different measurements. The reviewed current
  Neon pack contains 151 assignments; none of these totals is a live user count.
- Current runtime authorization uses `principal_group`, `group_member`, `group_role`,
  `role` and `role_permission`. There is no `authz.permission_set` runtime table.
- `bp_target.*` is migration-target vocabulary, not a blanket synonym for legacy
  permissions or for dormant permissions. Determine enforcement per consumer.
  The reviewed compiled BP release directly referenced `bp_target.network_read`.
- Standalone-entity and parent-section permissions are separate boundaries, not
  duplicates to merge. Shared comment/attachment actions can be explicitly bound
  in BP metadata. Notification and workflow services also have separate consumers.
- `neon.supplier.qualification.admin` exists in the authorization seed pack and
  was published in DEV. Absence from DDL reference seeds is not a missing definition.

See the [recovery runbook](../../runbooks/business-partner-publication-recovery.md)
for dated activation and access evidence. Metadata activation is not user access.

## 3. Composition and assignment model

Build time: versioned permission bundles expand into explicit role-permission rows.
Runtime: user → group membership → scoped group-role assignment → role permissions,
subject to current catalog, admission, deny, policy, MFA and owning-command checks.

A persona is a template of **(capability role, scope kind, propagation mode)**
requirements. Instantiation resolves actual tenant-owned scope targets. It is not
one broad role at one scope, and it is not an ongoing username-pattern grant rule.

| Layer | Example | Meaning |
| --- | --- | --- |
| Persona template | `neon.persona.requester` | Versioned composition, not a runtime grant |
| Instance group | `neon.persona.requester.company.cc-br01` | Members share precisely the reviewed bindings |
| Capability role | `neon.role.bp.requester` | Explicit permission bundle |
| Build-time bundle | `neon.pset.bp.section_read` | Compiler input, not a new runtime authority |
| Permission | `neon.relationship.business_partner.read` | Published capability with verified consumers |

Group codes must match `^[a-z][a-z0-9_.-]{1,126}$`. Use stable, normalized scope
identifiers and include scope kind; handle length and collision checks deterministically.
The authoritative scope UUID belongs on the assignment, not in code parsing.
Display-name changes must not create new identities.

All members of a group receive its applicable assignments. Separate groups when
membership differs by company/organization; never place several companies' bindings
on a shared persona group expecting member-specific scope filtering. A multi-company
user joins multiple reviewed instances. Generate only applicable instances, not
automatically every persona × company combination or bespoke per-person groups.

Quarantine contributes **zero grants**. It is not a deny: membership in quarantine
plus an authorized persona group does not automatically block that persona's access.
Reconciliation of quarantine membership must preserve authentication/admission rules.

## 4. Proposed persona compositions

These are responsibility templates, not final permission lists or approved assignments.
No persona inherits another persona's entire permission set automatically.

| Persona | Intended composition | Explicit boundary |
| --- | --- | --- |
| Viewer | BP viewing and applicable related-entity reads | No mutations, reveal or transfers |
| Reporter | Viewer plus approved export/print | No import or Mesh publication by implication |
| Requester | Viewer, collaborator, request authoring, necessary workflow participation | No approval or materialization by default |
| Processor | Operational stewardship and explicitly selected maker capabilities | Materializer is a separate optional role |
| Manager / Approver | Viewer, collaborator, scoped decision authority | No automatic Requester inheritance |
| Business Owner | Reviewed business accountability capabilities | No automatic system administration or restriction lifting |
| Administrator | Separately approved access/configuration administration | No automatic business decisions, reveal or delivery replay |
| Finance | Separate sensitive-read, change-author and verifier bundles | No submit/verify bundle coupling; preserve execution separation |

Keep `bp.materializer`, transfer operations and notification delivery operations
separately assignable. Qualification decision/lifecycle and restriction authority
remain dependent on their own approved design and verified consumers. They must not
silently become active through a persona template update.

The prototype reportedly has ten templates; their complete definitions were not
available for inspection. Do not invent the remaining templates or treat the table
above as approval of all prototype contents. A dual-role test user is an explicit
assignment combination, not an exemption persona.

## 5. Compiler contract

For permission `p`, define `C(p)` as its supported, active
**(scope kind, propagation mode)** pairs in the pinned catalog.

`AllowedBindings(role) = intersection(C(p) for every permission p in the role)`

Reject an empty intersection and any proposed assignment outside it. A role can
support several scope kinds if all its permissions support those combinations.
“Scope-homogeneous” is not the rule. An empty role must not compile as universally
assignable. Never silently drop an incompatible permission to make compilation pass.

The compiler must also validate:

- Exact published permission IDs/codes, plane, tenant ownership and active targets.
- Versioned bundle expansion, missing references, cycles, duplicate/conflicting
  definitions, deterministic output and stable IDs.
- Verified permission consumers and rollout status; catalog presence alone is not
  enforcement evidence. Fail or explicitly defer unverified/observed-only entries.
- Least-privilege grant diffs, provenance, approval coordinates and seed ownership.
  Do not delete unrelated or manually managed authority during reconciliation.

Compile from pinned catalog/publication inputs. At deployment, recheck fingerprints,
target state and live projection consistency; stop on drift rather than widening scope.
The database's normal constraints remain enabled as the final invariant check.

`entity_operation_binding` and `entity_operation_scope_binding` are publication-owned
projections: validate them read-only. They are one consumer category, not a requirement
for every platform permission. Coverage reports must distinguish intended human
audiences, service-only operations, intentionally unassigned operations and deferred
capabilities. Do not fabricate a human persona just to make coverage complete.

## 6. Consumer map: first implementation deliverable

For each permission/operation/surface, record:

| Field | Required evidence |
| --- | --- |
| Identity | Exact permission ID/code, catalog version/hash, plane |
| Consumer | Route, command, compiled operation/section or platform service |
| Authority mode | Enforced, observed-only, unavailable, unused or unverified |
| Scope | Required coordinates, resolver, compatible kinds and propagation |
| Runtime admission | Tenant, parent-record and ownership requirements |
| Maker/checker | Authoritative maker identity/version, checker, enforcement location |
| Assurance | MFA, separation and policy evidence; behavior when evidence is absent |
| Alternate paths | API, UI, import, bulk, replay and background execution where applicable |
| Verification | Positive/negative tests, source revision, verification date and owner |
| Disposition | Intended roles/audience, intentionally unassigned or deferred |

Published banking/tax submit/verify codes were observed with `requiresSod=false`
and `requiresMfa=false`. This is an enforcement question, not proof of a reachable
self-verification defect. Identify actual consumers before assigning these roles.
Gate affected Finance capabilities until required separation is verified.

Qualification separation currently combines catalog requirements, policy-gate
evidence and command-level self-decision rejection. Splitting create/decide roles
improves assignment control but does not replace those execution checks.

Materialization has governed command and pinned-approval checks; the inspected
materialize permission has `requires_mfa=false`. Do not claim unconditional MFA from
registration evidence. If mandatory, require and test an actual execution-time gate.

## 7. Prototype decision presentation

Retain the three views: **Access check**, **Personas & groups**, **Role compiler**.
The access trace explains membership, consumer status, role/scope grants, scope
coverage, denies, maker/checker, MFA and separate partner eligibility. These are
explanatory dimensions, not a specification of the production evaluator's exact order.

Show three distinct results:

1. **Authorization:** may this actor perform the action on this resource?
2. **Business eligibility:** may this commercial action proceed for this partner/context?
3. **Executability:** are all required controls and prerequisites satisfied?

Eligibility checks apply where the action requires them; commercial restrictions
must not automatically prevent viewing a restricted partner. Show all known blockers
without disclosing unauthorized record details. Full traces should be operator-only;
ordinary users receive safe, actionable explanations.

Sample outcomes:

- **Allowed by sample model:** all required sample checks pass.
- **Blocked:** an explicit failed control, including deny or self-approval.
- **Context required:** authoritative scope/resource coordinates are missing.
- **Requirements pending:** a declared satisfiable prerequisite remains unmet.
- **Gated:** consumer enforcement or required capability is unverified/unavailable.

MFA cannot cure missing permission, a deny, self-approval or an unverified consumer.
Choosing a company in the UI does not narrow a tenant-wide grant.

For decisions requiring separation, a missing authoritative maker identity fails
closed. Creation may legitimately have no existing maker to compare. Label the
prototype scenario specifically as approval/verification; do not present an optional
creator field in a shared gate as proof of a universal bypass.

## 8. Delegation and deny rules

Delegation requires a delegable permission, existing delegator authority, valid
memberships/grants covering the finite window, approval evidence and approver
separation. The inspected banking/tax/qualification permissions are non-delegable.
Do not enable delegation simply to avoid explicit dual-role review or to bypass
maker/checker controls. Changing delegability is a separate policy decision.

A matching deny overrides matching allows even when the allow comes through another
group. Isolation is by tenant, subject, permission, resource scope and validity—not
by the label of the group supplying the allow. The current resolver expands deny
coverage through the scope tree; resource-less requests may fail closed on deny
evidence. Verify these semantics before advertising company-specific exclusions.
Deny rules are user-authorization controls, not Business Partner restrictions.

## 9. Acceptance scenarios

Use the same versioned scenario inputs for the prototype and automated tests.
Illustrative tests do not replace integration tests against the real command paths.

| Scenario | Expected boundary |
| --- | --- |
| Quarantine-only user | No permission granted by quarantine |
| Quarantine plus valid persona | Quarantine itself is not a deny |
| Administrator attempts business approval | No implicit decision authority |
| Maker with both Requester and Approver roles decides own request | Rejected without side effects |
| Different qualified checker decides same request | Allowed only when every other requirement passes |
| Required creator evidence missing during decision | Fail closed; no invented separation |
| Same actor submits and verifies bank/tax change | Verify actual command rejection; otherwise gate the capability |
| Bank reveal without required MFA | Step-up required; do not expose protected data |
| Unverified verification consumer / observed-only export | Gated, not made effective by a grant |
| Deny at Company A plus allow through another group at A | Denied |
| Deny at A; unrelated Company B request | Not denied by A's rule when coordinates prove non-coverage |
| User not in deny-subject group | That group deny does not match |
| Descendant scope / missing resource coordinates | Matches documented scope-tree and fail-closed behavior |
| Same persona name in another tenant | No cross-tenant authority |
| Missing company context | Never defaults to tenant-wide access |
| Expired/revoked assignment, membership or deny | Fresh decision reflects current validity and invalidation |
| Approval version/creator/evidence changes | Stale evidence cannot authorize execution |
| Direct API versus UI; alternate write paths | Equivalent required controls; no UI-only protection |
| Incompatible role; wrong propagation; empty role | Compilation fails before provisioning |
| Commercially restricted partner viewed by an authorized reader | Read and action eligibility remain separate |

Dual-role approval requires the complete applicable evidence, not one maker/checker
checkbox. Required missing controls are gates, not warnings accepted by default.

## 10. Delivery and approval gates

1. Approve responsibilities/naming and produce the read-only consumer map.
2. Define versioned bundle, role and template schemas with representative assignments.
3. Implement deterministic compilation, compatibility checks and auditable grant diffs.
4. Generate applicable instance groups and an explicit reviewed membership plan.
5. Rehearse, then separately approve and apply through supported provisioning paths.
6. Verify actual access, negative cases, cache invalidation, expiry and rollback.

Before live changes, record named business/security/platform approvers, exact
environment/tenant scope, input fingerprints, approved grant diff and rollback plan.
Neither this document nor the prototype approves automatic assignment to all
`.admin`/`.owner` accounts, QA changes or qualification implementation.

## References

- [Qualification design and its separate approval gates](business-partner-qualification-business-design-and-plan.md)
- [Projection write ownership](../../../server/db/ddl/common/authz/PROJECTION-WRITE-OWNERSHIP.md)
- [Current seed ownership and historical archive boundary](../../../server/db/seed/README.md)
- [Scope compatibility enforcement](../../../server/db/ddl/common/authz/07_functions.sql)
- [Runtime permission authorizer](../../../server/packages/platform/iam/src/permission-authorizer.ts)
- [Group and assignment schema](../../../server/db/ddl/common/authz/03_tables.sql)
