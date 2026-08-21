# Athyper authorization clean-slate design

Status: source baseline implemented; no live database reset has been executed. Enforcement remains disabled until the acceptance gates in this document pass.

## Decision

Reset permission catalog and derived authorization assignments in Studio, Neon, and Mesh. Do not drop the complete `authz` schema.

The current model contains durable controls that are independent of the confusing legacy permission vocabulary. A reset must preserve tenant admission, identity binding, scope topology, organization projections, trusted-device evidence, audit history, and runtime release history. It must replace only permission definitions and authority that derives from those definitions.

The reset intentionally establishes a deny-all baseline. Access is restored only from reviewed canonical catalogs and reviewed role bundles. Legacy-to-canonical parity is not a reset criterion because the legacy authority has been explicitly rejected. The replacement criterion is complete application-demand coverage plus reviewed allow/deny scenarios.

## Authority ownership

| Concern | System of record | Consumer |
| --- | --- | --- |
| Credentials, authentication session, MFA ceremony, IdP session | Keycloak | BFF and platform host |
| Organization claim and external subject | Keycloak assertion | Plane-local admission resolver |
| Organization-to-tenant admission ceiling | Studio `trustiam.*`, reconciled to plane `authz.application_projection` | Identity-context resolver |
| Principal identity and `auth_epoch` | Plane-local `master.principal` and `master.principal_identity_binding` | Identity-context resolver |
| Plane admission | Plane-local `authz.plane_membership` | Permission resolver |
| Permission definitions and compatible scopes | Plane-local published `authz.permission` and `authz.permission_scope_kind`, compiled from Studio-reviewed contracts | Permission resolver and mutation guards |
| Roles, groups, assignments, denies and exceptions | Plane-local `authz.*` | Permission resolver |
| Entity operation and lifecycle authorization | Studio metadata authoring, atomically projected to `runtime_meta.*` and `authz.entity_operation_*` | Records, workflow and document services |
| Commercial entitlement | `control.subscription_plan*` | Permission resolver before authorization |
| Hard policy and separation of duties | Policy service plus transactional business evidence | Central authorizer |
| Authorization cache invalidation | `runtime_meta.authorization_epoch` plus invalidation events | Session/request authorization cache |

Keycloak is never a fine-grained permission authority. Its client `AUTHORIZED` role is only a coarse application-admission signal. Database authorization remains exact-plane and tenant-local.

## `authz` table review

### Catalog and operation contract

| Table | Disposition | Clean-slate responsibility |
| --- | --- | --- |
| `permission` | Keep; reset rows | One immutable semantic permission identity. Only compiler-owned definitions may be published. No aliases or `legacy.*` rows. |
| `permission_scope_kind` | Keep; reset rows | Exact allow-list of legal scope kinds and propagation modes for each permission. Missing compatibility denies assignment. |
| `entity_operation_binding` | Keep; reset rows | Atomic release-owned mapping from one entity operation coordinate to exactly one published permission. |
| `entity_operation_scope_binding` | Keep; reset rows | Required coordinate sources for the operation. Missing or ambiguous coordinates deny. |

### Admission and scope topology

| Table | Disposition | Clean-slate responsibility |
| --- | --- | --- |
| `plane_membership` | Preserve | Admission gate only. It never grants a permission. Suspension/revocation must invalidate sessions through `auth_epoch`. |
| `scope_target` | Preserve and re-qualify | Stable tenant-local hierarchy over legal entities, company codes, organizations, network accounts and resources. Source projections must own target creation. |
| `application_projection` | Preserve | Reconciled organization-to-plane admission ceiling. It grants no role or permission. |
| `projection_provider` | Preserve | Permitted IdP/provider coordinates for the application projection. |
| `projection_scope` | Preserve | Maximum organization/application scope ceiling. Effective authority must be the intersection of this ceiling and local grants. |

### Role and group authority

| Table | Disposition | Clean-slate responsibility |
| --- | --- | --- |
| `role` | Reset | Reviewed job-function bundles. No wildcard role and no role generated from a generic verb tier. |
| `role_permission` | Reset | Exact reviewed edges from a role to published permission IDs. |
| `principal_group` | Reset authorization groups | Groups describe subject cohorts, not permissions. IAM-managed groups require signed source coordinates. |
| `group_member` | Reset with groups | Time-bounded principal membership in an exact local group. |
| `group_role` | Reset | Time-bounded role assignment at an exact scope target. Propagation must be implemented by a registered resolver, never inferred from a string. |

### Negative and exceptional authority

| Table | Disposition | Clean-slate responsibility |
| --- | --- | --- |
| `deny_rule` | Reset rows referencing reset permissions | Absolute deny at tenant, principal or group scope. Deny wins over every allow mechanism. |
| `delegation` | Reset existing delegations | Finite approved relationship between delegator and delegate. Source authority must be revalidated on every resolution. |
| `delegation_grant` | Reset | Exact permission and exact target; never a generic role copy. |
| `override` | Reset | Finite, independently approved exceptional allow. Cannot bypass tenant, admission, entitlement, MFA, SoD, hard policy or deny gates. |
| `record_acl` | Reset | Exact entity/resource code, record ID and shareable permission. Never collection authority. |
| `trusted_device` | Preserve | Authentication assurance evidence, not a permission. Revocation/expiry changes session elevation only. |

## Canonical permission identity

Use exactly four coordinates:

```text
{plane}.{domain}.{entity}.{operation}
```

Examples:

```text
studio.iam.application_projection.read
neon.relationship.business_partner.create
mesh.catalog.document_envelope.publish
```

Rules:

1. The first coordinate must equal the physical database plane.
2. Entity operations use the published Entity code and operation key.
3. Capabilities use a concrete managed resource, never `action.<verb>` or a UI navigation label.
4. One code has one semantic definition hash for its entire lifetime.
5. Changed semantics require a new code or a new versioned resource coordinate; IDs are never reused.
6. The application must not translate short aliases at runtime. Shared services request an operation coordinate and resolve the exact plane binding.
7. Every published permission must declare risk, MFA, SoD, delegability, shareability, overridability, module entitlement and compatible scopes.

## Application authorization API

The application currently mixes literal codes, route permissions, descriptor permissions and caller-supplied permission strings. Replace that with two typed entry points:

```text
authorizeCapability(context, { domain, entity, operation }, resource?)
authorizeEntityOperation(context, { entityCode, operationKey }, resourceCoordinates)
```

Both entry points prepend and verify `context.planeKey`. Entity operations obtain their permission only from the active `authz.entity_operation_binding`; the client, route, document payload and workflow payload may not nominate a permission.

The central evaluator order is obligatory:

1. token signature, issuer, audience and client/plane check;
2. active organization projection/provider/scope ceiling;
3. active tenant, principal, identity binding and plane membership;
4. current `auth_epoch` and immutable authorization snapshot coordinates;
5. active operation binding and complete resource/scope coordinates;
6. subscription/module entitlement;
7. explicit deny;
8. role/delegation/ACL/override allow proof;
9. scope containment and projection ceiling;
10. MFA assurance;
11. separation-of-duties and hard policy;
12. allow, with a structured decision receipt.

Any unavailable, missing, conflicting or ambiguous input denies.

## Entity and lifecycle integration

Studio owns authoring through:

- `metadata.entity_operation`
- `metadata.entity_operation_permission`
- `metadata.entity_operation_scope_binding`
- `metadata.entity_lifecycle_binding`
- `metadata.entity_lifecycle_operation_binding`
- `metadata.entity_policy_binding`

A release compiler must reject a release unless every executable operation has:

- exactly one permission for each target plane;
- an existing canonical catalog definition with matching plane/entity/operation coordinates;
- exact scope-coordinate declarations;
- a handler and audit event contract for mutations;
- a lifecycle transition mapping where applicable;
- risk/MFA/SoD and policy requirements;
- positive and negative contract tests.

Activation must atomically move the matching `runtime_meta.entity_descriptor`, `authz.entity_operation_binding`, and its scope bindings to active/published state. Rollback must restore all three from the same applied release. Records and workflow services must authorize before locking or mutating, then revalidate lifecycle state and policy inside the same transaction.

## Rebuild status and known defects

The source baseline has retired the duplicated unprefixed seed-pack permissions, all published `legacy.*` definitions and grants, the contextual alias/retirement machinery, and the plane-specific permission DDL publishers. One compiler now produces one exact catalog and zero-grant pack per plane.

The remaining defects are intentionally release-blocking:

1. Shared application services still request unprefixed permissions while v2 catalogs require four coordinates. The static gate currently reports 146 unique unqualified codes across 251 references, two unpublished exact Studio codes, and one dynamic permission expression.
2. Thirty-four executable entity-operation permissions have no reviewed operation binding. Unbound operations deny.
3. `member_companies` and `relationship_participants` are declared propagation modes but the current resolver only expands `subtree`; unsupported modes must deny until registered resolvers are implemented.
4. The platform host constructs the central authorizer without a policy gate. High/critical and SoD permissions therefore deny, correctly but permanently, until the transactional policy adapter is connected.
5. Operation-binding validation is skipped for calls that provide no entity/operation coordinates. Entity mutation, workflow and document paths must always provide them.
6. Several endpoints accept or persist caller-supplied permission strings. Those strings must be replaced by server-owned catalog coordinates.
7. Projection scope is used during login admission but is not yet intersected with every effective authorization scope.
8. Authorization-management repositories are dependency-injected but no production exact-plane repository is composed by default; mutation mode must remain disabled.
9. Live projection provenance, RLS, suspension, Keycloak session termination and double-apply evidence have not been qualified against disposable three-plane databases.

## Reset boundary and order

Before physical deletion, produce an immutable reset manifest containing plane, database identity, catalog hashes, row counts, normalized edge hash, reason, approval ticket and approvers. Archive the removed rows to a restricted immutable audit artifact.

Within one serializable transaction per plane, delete or retire in this dependency order:

1. `entity_operation_scope_binding`
2. `entity_operation_binding`
3. `delegation_grant`
4. `delegation`, `override`, `record_acl`, `deny_rule`
5. `group_role`
6. `role_permission`
7. authorization-owned `group_member` and `principal_group`
8. `role`
9. `permission_scope_kind`
10. `permission`

Preserve `plane_membership`, `scope_target`, `trusted_device`, application projection tables, principals, identity bindings, `runtime_meta.*`, audit events, outbox events and operations evidence.

After deletion, increment the tenant and plane authorization epochs and revoke active application sessions. Then publish the reviewed canonical catalogs, followed by roles, groups and assignments. No broad administrator role is created automatically; the first security administrator is a separately approved bootstrap grant with finite expiry.

## Acceptance gates

Enforcement remains disabled until all of the following are green:

- no `legacy.*`, unprefixed alias or generic action permission exists in source artifacts or live tables;
- application-demand inventory equals published catalog inventory for every plane;
- every route, entity operation, lifecycle transition, workflow action, job and document operation resolves exactly once;
- every published permission has explicit scope, entitlement, risk, MFA and SoD policy;
- role bundles have named owners and reviewed permission diffs;
- no zero-coordinate mutation authorization path exists;
- deny, delegation revocation, ACL exact-record, projection ceiling and suspension tests pass live;
- Keycloak organization removal, client-role removal, logout and `auth_epoch` invalidation revoke access within the defined SLA;
- fresh database build and double apply are deterministic;
- runtime roles are non-superuser, non-owner and `NOBYPASSRLS`;
- the release gate reports zero legacy definitions, zero legacy grants, zero unresolved application demands and zero projection-security violations.
