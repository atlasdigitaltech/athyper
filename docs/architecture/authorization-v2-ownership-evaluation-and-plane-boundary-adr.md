# Authorization v2 ownership, evaluation, and plane boundary ADR

- Decision status: Accepted as the Wave 0 implementation baseline
- Production cutover approval: Pending named approvers and recovery-contract sign-off
- Date: 2026-07-27
- Runtime behavior changed: No
- Existing authorization decisions changed: No
- Database behavior changed: Additive change capture only; no source authority is removed
- Scope: Neon, Admin, Mesh, Keycloak, authorization caches, and migration tooling

## Context

Authorization is currently decided by overlapping Persona permissions, group-role
assignments, generic access grants, company-code ACLs, Admin grants, feature
grants, delegations, record ACLs, and legacy network membership. Multiple
evaluators do not apply these sources in the same order. Some runtime processes
also hold both Neon and Mesh database clients.

Wave 0 freezes the intended authority model before any backfill or evaluator
switch. It does not normalize current results. Known differences between legacy
single, batch, Admin, Mesh, workflow, and record-access paths remain visible in
the golden corpus until they are classified.

## Decision 1: physical ownership

| Plane | Database authority | Owned authorization data |
| --- | --- | --- |
| Neon | Neon DB | Neon identity projection, Neon plane admission, tenant entitlements, groups, roles, scopes, overrides, delegation, ACLs, and decision evidence |
| Admin | Neon DB | Target-tenant Admin admission, platform-managed entitlement policy, Admin groups, roles, scopes, overrides, delegation, ACLs, and decision evidence |
| Mesh | Mesh DB | Mesh subject projection, account admission, product eligibility, groups, roles, network/account/resource scopes, overrides, delegation, ACLs, and decision evidence |
| Authentication | Keycloak | Credentials, authentication factors, federation, external subject lifecycle, and token claims required to bind an exact subject |

Keycloak authenticates. It does not grant application permission through realm
roles, client roles, groups, naming conventions, email domains, or Persona
claims. An exact, active plane-local identity binding is required before
authorization.

Neon and Admin share a physical database but remain distinct authorization
planes. A caller entering Admin must have explicit target-tenant Admin admission
and target-tenant Admin group/role/scope evidence.

## Decision 2: zero Mesh-specific-data Neon boundary

The clean Neon baseline contains no Mesh-specific:

- account, membership, connection, grant, role, permission, ACL, delegation, or
  document-exchange row;
- Mesh schema, seed, bootstrap record, feature-cutover record, runtime cache, or
  decision log;
- Mesh database URL, credential, fallback client, or direct Mesh repository
  access;
- mirrored Mesh authorization graph or authorization-bearing network
  relationship.

Plane-neutral contracts may define common authorization semantics. They do not
carry Mesh data. Approved shared reference synchronization is an explicit
allowlist and excludes identities, memberships, groups, roles, permissions,
entitlements, ACLs, delegation, and decisions.

Neon-to-Mesh and Admin-to-Mesh interaction uses authenticated APIs, commands,
and events. An ordinary runtime process receives credentials for exactly one
physical authorization database. A one-time migration executor may receive both
only under an audited, expiring migration identity, and those credentials are
revoked at the boundary-migration watermark.

Neon/Admin must start and authorize while Mesh is unavailable. Mesh must start
and authorize while Neon is unavailable.

## Decision 3: one semantic evaluator, plane-local repositories

A repository-independent evaluator contract is shared. Neon/Admin and Mesh
provide separate plane-local repositories and catalogs. The evaluator supports:

1. an exact entity-operation/resource decision;
2. a registered non-entity capability decision; and
3. collection-scope materialization.

Direct permission checks cannot bypass a registered entity operation when the
permission is entity-bound. List, detail, batch, export, bulk, session, metadata,
workflow, document, Admin, Mesh, and tool-action consumers use the same semantic
contract or a versioned immutable snapshot produced by it.

## Decision 4: evaluator precedence

The target evaluator performs these gates in order:

1. Bind the exact external subject.
2. Validate the active tenant or account and active principal.
3. Validate active membership in the requested plane.
4. Resolve an exact active entity operation and permission, or an explicitly
   registered non-entity permission, including plane eligibility.
5. Validate module, feature, or account entitlement.
6. Apply subject-free hard failures, including tenant isolation, mandatory MFA,
   lifecycle, workflow separation-of-duties, and platform suspension.
7. Resolve active group membership.
8. Resolve matching hard, principal, and active-group denies.
9. Build each alternative allow proof independently:
   scoped group-role permission, bounded delegation, shareable exact-record ACL,
   or bounded principal allow override.
10. Require each proof to satisfy its own scope, effective time, target
    containment, operation conditions, ownership/workflow/lifecycle, MFA, and
    separation-of-duties constraints.
11. Union complete allow paths, subtract matching deny scopes, and return
    versioned evidence.

Absolute precedence is:

```text
tenant/RLS failure
> inactive identity, principal, account, or plane admission
> operation/plane incompatibility
> commercial or platform entitlement failure
> hard policy/MFA/workflow/SoD failure
> matching explicit deny
> incomplete scope or target containment
> scoped group-role allow
> bounded delegation
> shareable exact-record ACL
> bounded allow override
```

An allow override cannot bypass tenant isolation, inactive plane membership,
commercial or platform unavailability, mandatory MFA, workflow
separation-of-duties, or a matching deny. Delegation cannot exceed the
delegator. An ACL can grant only an explicitly shareable operation on its exact
record. Relationship, team, entitlement, and scope data never create a
permission.

Complete allow paths are unioned. Constraints from unrelated paths are not
intersected. A scoped deny subtracts only its matching resources; a tenant-wide
deny matches the tenant.

## Decision 5: Admin entitlement semantics

Admin is not authorized by a missing plan check or a hard-coded plan bypass.
Admin uses an explicit, versioned `platform_managed` entitlement policy whose
commercial applicability result is `not_applicable`.

That result permits evaluation to continue; it is not an allow. Admin still
requires:

- an exact external identity binding;
- an active target-tenant shadow principal where acting in another tenant;
- active Admin plane membership;
- an exact Admin entity operation and permission;
- target-tenant groups, roles, and scopes;
- all hard policy, deny, workflow, MFA, delegation, ACL, and override rules.

Missing or invalid Admin entitlement policy fails closed.

## Decision 6: relationships and commercial data

Relationships describe context. Entitlements make products available. Roles
grant exact permissions. Assignment scope limits a role. ACLs share named
records. Delegation transfers only current bounded authority. Overrides are
exceptional.

`*_link`, `*_relationship`, `*_assignment`, and `*_membership` tables do not
authorize unless the object is explicitly registered as part of the canonical
`auth_*` model. The named exceptions are plane admission, group membership, and
scoped group-role assignment.

## Rollout consequence

The authorization selector is one atomic mode for an exact plane, named cohort,
and revision:

- `legacy`: execute and return only the legacy evaluator;
- `shadow`: execute both, return exactly the legacy result, and record a
  normalized comparison;
- `enforce`: execute and return only v2.

Results are never unioned. Percentage rollout is prohibited. Missing, invalid,
expired, stale, or unapproved policy resolves to `legacy`. Mesh rollout policy
is stored and read in Mesh, not in Neon. A revision is pinned for an entire
request or job.

The legacy write path remains the sole authority writer through shadow and
initial read cutover. A writer switch requires a separate freeze, zero capture
lag, and recovery approval.

## Required evidence before production promotion

- deterministic source and writer inventory with no unknowns;
- complete active-principal identity inventory;
- golden corpus covering every active principal and active high/critical action,
  with every legacy-engine disagreement classified;
- append-only source change capture installed before the snapshot watermark;
- all cross-tenant findings classified;
- every database table and object store assigned exactly one approved
  disposition;
- separate approved resolver, authorization-writer, and fresh-database
  synchronization/recovery objectives;
- named rollback owner, tested restore/replay evidence, and an approved
  observation window.

## Rejected alternatives

- A single database authority for Neon and Mesh.
- `meshDb ?? neonDb` or any other cross-plane database fallback.
- Keycloak roles, groups, or Persona claims as application authorization.
- Independent booleans or percentage rollout that can select mixed evaluators.
- Dual unconstrained writers.
- Treating the mutable, purgeable general outbox as the migration watermark.
- Claiming RPO 0 after target writes without tested lossless reverse replay.

