# Authorization Wave 1 additive canonical DDL

Status: repository implementation complete and verified; no live database has
been changed.

Wave 1 creates a second, fail-closed authorization model beside the legacy
authority. It does not switch an evaluator, make a target table authoritative,
backfill a row, enforce a formerly nullable v2 field, rename a relation, or
remove a legacy object.

The machine-readable contract is
`config/governance/authorization-wave1-additive-contract.v1.json`. Ownership,
evaluator precedence, Admin entitlement semantics, and the zero-Mesh-data Neon
boundary remain governed by
`docs/architecture/authorization-v2-ownership-evaluation-and-plane-boundary-adr.md`.
The guarded execution and rollback sequence is
`docs/runbooks/authorization-v2-wave1-expand-snapshot-replay.md`.

## Physical ownership

| Database | Plane | Catalog | Tenant/account authority | Runtime evidence |
| --- | --- | --- | --- | --- |
| Neon | `neon` | `shared` reference plus `control` exact permissions and operations | `master` | `event` invalidation/replay and `log` decision evidence |
| Neon | `admin` | same physical catalog, explicit Admin eligibility | target-tenant shadow principals and Admin membership in `master` | same Neon-local evidence schemas |
| Mesh | `mesh` | Mesh-local `mesh_control` catalog | Mesh-local account authority in `mesh` | Mesh-local `mesh_log` |

Neon DDL admits only `neon` and `admin`. Mesh DDL admits only `mesh`. Neither
catalog, membership graph, replay queue, decision log, nor invalidation epoch
crosses the database boundary.

## Additive Neon model

### Catalog and operation contract

- `shared.auth_permission_category` is non-authorizing reference data and
  coexists with the legacy category.
- `control.auth_plane` contains exactly the Neon-local plane contract. Admin
  records `platform_managed_not_applicable`; this advances evaluation to the
  next gate and never grants a permission.
- `control.auth_catalog_owner` makes platform or tenant catalog ownership
  mandatory.
- `control.auth_permission` owns an exact canonical permission. Entity-bound
  rows pair `entity_id` and `operation_code`; registered non-entity
  capabilities carry neither.
- `control.auth_permission_plane` is the exact permission/plane eligibility
  edge.
- `control.auth_permission_scope_policy` and
  `control.entity_scope_binding` are the only new Neon scope-policy and
  resource-binding contracts.
- `control.entity_operation_plane` exposes one operation and its same exact
  permission to one local plane.

Existing `control.entity_operation` keeps all legacy columns and receives only
nullable expansion columns:

```text
catalog_owner_id_v2
entity_id_v2
entity_version_id_v2
operation_code_v2
permission_id_v2
v2_publication_status
v2 effective/security metadata
```

`NULL v2_publication_status` means legacy-only. A row cannot enter the
`published` v2 state unless a composite foreign key and publication guard prove
the same active catalog owner, entity, operation code, exact permission, and
effective window. Operation-plane publication additionally proves active
permission-plane eligibility.

Thirteen checks and foreign keys on the populated legacy relation are installed
`NOT VALID`. PostgreSQL still applies them to every new or changed row. Their
exact set is exposed through
`control.v_authorization_v2_deferred_constraints` and is registered durably by
the explicit expand installer. No other Wave 1 target constraint is expected to
remain unvalidated.

### Tenant and plane authority

The Neon target uses:

- `master.auth_plane_membership`;
- a typed `master.auth_scope_target` registry with tenant, company, legal
  entity, and operating-organization child tables;
- `master.auth_permission_set` and exact published rules;
- `master.auth_role`, compilation header, permission-set inputs, and compiled
  exact permission rows;
- `master.auth_group_v2`, `auth_group_member_v2`, and `auth_group_role_v2`;
- exact-permission denies, principal-only allow overrides, normalized
  record-ACL permission rows, and permission-paired delegation scopes;
- module/feature `master.tenant_entitlement_override`.

Every authority edge repeats tenant and plane where needed and uses composite
foreign keys. A target write cannot rely on an id-only lookup to join a
principal, group, role, scope, assignment, ACL, delegation, or permission from
another tenant or plane. Typed scope children prove their target kind and local
ownership.

ACL permission rows carry a literal `is_shareable = true` assertion backed by a
composite foreign key to the exact permission. Delegated permission rows do the
same for `is_delegable = true`. Delegation scopes belong to one delegated
permission row, preventing a permission/scope Cartesian product.

Permission-plane eligibility is necessary but is not sufficient for a
tenant-owned catalog row. Target write guards also prove that each permission
or entity is platform-owned or belongs to the same tenant as the authority
edge. A valid permission UUID from another tenant is therefore rejected on
draft insertion, not deferred until evaluation.

Role compilation is reviewable and checksum-addressed. Publication is one
function-controlled state transition; a role never becomes published with a
partially compiled permission set.

## Additive Mesh model

Mesh implements the same semantics without importing a Neon schema or
authorization row.

`mesh_control` owns a Mesh-only plane row, permission category, mandatory
platform/account catalog owner, entity and entity-version catalog, exact
permission, permission-plane eligibility, exact entity operation and
operation-plane exposure, scope policy, and entity-scope binding. Its scope
vocabulary is limited to account, network relationship, and resource.

`mesh` owns 25 additive authority relations:

- account/plane membership and typed account, network-relationship, and
  resource scopes;
- permission sets/rules and immutable role compilations;
- `auth_group_v2`, member, and scoped role assignments;
- principal, group, and hard-policy denies, bounded principal overrides,
  normalized record ACL permissions, and permission-paired delegation scopes;
- account product/capability entitlement overrides.

Every Mesh authority root carries `account_id` and `plane_code = 'mesh'`.
Composite account/plane foreign keys reject cross-account principals, groups,
roles, scopes, assignments, ACLs, and delegations. Permission and entity guards
add the catalog-owner rule: a catalog row must be platform-owned or owned by
that same account. No valid foreign-account catalog UUID can cross that
boundary.

`mesh_log` owns the Mesh global/account/plane epochs, append-only invalidation
outbox, complete-transaction replay state, and hashed decision evidence.
The invalidation trigger installer declares the exact 40-row decision-input
manifest: 11 `mesh_control` catalog relations, 25 `mesh` authority relations,
and the four existing Mesh account/relationship/principal identity inputs. It
fails if a target is missing or an unexpected v2 trigger is active.

## Decision evidence and invalidation

`log.auth_decision_evidence_v2` is append-only proof evidence. It records
identity hashes rather than raw external subjects or resource keys, exact
permission and operation identity, catalog/entitlement/compiler versions,
global/tenant/plane epochs, matched proof IDs, and a deterministic evidence
checksum.

The v2 invalidation path is independent of the mutable general outbox:

- global, tenant, and plane epochs;
- affected principal, group, role, permission, scope, entitlement, catalog,
  and record identities;
- scheduled effective/expiry boundaries;
- explicit worker leases and retry state;
- the source database and source watermark when invalidation came from replay.

Target mutations enqueue invalidation through the complete trigger manifest.
Neon uses an exact 47-row manifest: all 34 v2 catalog/authority relations plus
13 existing entity, identity, and module/feature/plan inputs read by the v2
contract. Rollback removes only the named v2 invalidation trigger from those
existing relations and leaves their legacy triggers intact. Expiry is not
dependent on a future row update: scheduled boundaries are represented
explicitly.

## Frozen legacy authority and replay

`control.authorization_v2_frozen_legacy_object` is populated from the exact Wave
0 capture-source registry. It records the rule
`no_new_feature_reads_or_writes`; it does not change legacy semantics or expand
the capture source set.

Replay is fail-closed:

1. bind one migration run to the durable snapshot marker, source database ID,
   capture contract, and watermark;
2. stage only complete source transactions strictly after that watermark;
3. require an approved, checksum-addressed transformer disposition for every
   source relation in a transaction;
4. apply one source transaction atomically and idempotently;
5. write conservation evidence and advance the checkpoint in that same target
   transaction;
6. reject `TRUNCATE`, partial transactions, unknown sources, unknown
   transformers, and watermark gaps.

The captured general row image is evidence, not an instruction to interpolate
SQL. Replay invokes only approved transformer contracts.

The Mesh equivalent freezes exactly the eight Wave 0 Mesh legacy sources.
Neither frozen-source registry is widened by the target tables or by
invalidation triggers.

## Required execution order

The only approved state machine is:

```text
expand
-> install change capture and record watermark
-> snapshot/backfill
-> replay from watermark
-> continuous synchronization
-> compare
-> clean anomalies
-> validate constraints
-> enforce NOT NULL
-> atomic view/name/read swap
-> contract legacy
```

The repository may contain code for later transitions, but the explicit
installer refuses to infer approval. Snapshot/backfill remains blocked until
the capture installation receipt and durable watermark exist. Enforcing
`NOT NULL`, swapping reads, and contracting legacy objects are not Wave 1
installation actions.

Wave 0 capture control/evidence relations are a preparation prerequisite.
Mesh expansion also verifies the already-active Wave 0 trigger set before it
derives the frozen-source rows. The ordered Wave 1 capture gate is still the
post-expand, source-locked capture reconciliation and receipt: it must run
after expand and before the first snapshot/backfill, even when capture was
already active.

## Privilege boundary

All empty target relations use FORCE RLS and are admin/migration-only during
expansion. The final security phase re-revokes their privileges after the
repository's broad legacy schema grants. For the legacy
`control.entity_operation` table, `athyperapp` receives column-level SELECT only
on the pre-Wave-1 projection; target v2 backfill columns are not exposed before
the atomic read swap.

## Gate interpretation

Repository checks can prove additive file content, ordering, declared
constraints, trigger coverage, boundary references, privilege policy, and
reversible object scope. PostgreSQL 17 PGlite smoke tests additionally exercise
the principal cross-tenant/account and plane write rejections. Repository
checks cannot prove live target trigger state, database identity, live negative
DML behavior, capture receipt, replay conservation, or constraint validation.

Those execution gates remain pending until an approved operator runs the
Wave 1 runbook against separate, explicitly named Neon and Mesh databases and
stores the resulting receipts. A successful repository build is never reported
as a live installation.
