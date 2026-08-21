# Unified authorization model recommendation

Date: 2026-07-30

Status: the unified authority DDL is implemented identically in Athyper, Neon,
and Mesh. Plane permission seeds, legacy migration, evaluator cutover, epoch
invalidation, and decision evidence remain separate follow-up work.

## Decision summary

Use one identical `authz` schema contract in Athyper, Neon, and Mesh, but keep
all authorization rows physically plane-local. Unified DDL does not mean
shared authorization data.

Key rules:

- Keycloak authenticates; it does not grant application permissions.
- `master.principal` is the actor FK.
- `master.tenant` is the RLS and authorization ownership boundary.
- The database name identifies the plane, so clean tables do not carry
  `plane_code`.
- Permissions, scope policies, roles, groups, memberships, denies,
  delegations, ACLs, and overrides live in `authz`, not `master`.
- Entitlements and subscription availability remain in `control`.
- Authorization invalidation state and compiled caches belong in
  `runtime_meta`.
- Authorization decisions and change evidence belong in `audit` / `event`.

Because the schema already communicates ownership, use names such as
`authz.permission` instead of `authz.auth_permission`. Legacy names can be
exposed temporarily through compatibility views during migration.

## Recommended unified authority tables

| Legacy name | Clean table | Decision |
|---|---|---|
| `auth_permission` | `authz.permission` | Keep; plane-local, seed-owned exact permission catalog |
| `auth_permission_scope_policy` | `authz.permission_scope_policy` | Keep |
| `auth_plane_membership` | `authz.plane_membership` | Keep, but remove `plane_code` |
| `auth_scope_target` | `authz.scope_target` | Keep as a generic hierarchical target |
| `auth_role` | `authz.role` | Keep |
| `auth_role_permission` | `authz.role_permission` | Keep |
| `auth_group` / `auth_group_v2` | `authz.principal_group` | Keep one canonical table; avoid the reserved SQL keyword `GROUP` |
| `auth_group_member` / `auth_group_member_v2` | `authz.group_member` | Keep one canonical table |
| `auth_group_role` / `auth_group_role_v2` | `authz.group_role` | Keep one canonical table |
| `auth_deny_rule` plus V2 subject tables | `authz.deny_rule` | Keep one constrained subject model |
| `auth_delegation` | `authz.delegation` | Keep |
| `auth_delegation_grant` plus V2 permission/scope tables | `authz.delegation_grant` | Keep one exact permission/scope row |
| `auth_override` | `authz.override` | Keep as bounded exceptional allow |
| `auth_record_acl` plus V2 permission table | `authz.record_acl` | Keep one exact permission per ACL row |

This produces fourteen authoritative tables.

## 1. `authz.permission`

Purpose: immutable, exact operation or capability recognized by the local
plane evaluator. It is platform/manifest managed and not tenant configurable.

Recommended fields:

| Field | Decision |
|---|---|
| `id` | UUIDv7 PK |
| `canonical_code` | Immutable unique exact code; must equal `resource_code || '.' || operation_code` |
| `permission_kind` | `entity_operation`, `capability`, or `system_action` |
| `resource_code` | Fully qualified entity/resource/capability family, for example `document.invoice` |
| `operation_code` | Exact operation; required for every permission kind |
| `module_id` | Required FK to plane-local `master.module`; system permissions use the seeded platform/core module |
| `risk_tier` | `low`, `medium`, `high`, `critical` |
| `requires_mfa` | Hard evaluator requirement |
| `requires_sod` | Hard separation-of-duties requirement |
| `is_shareable` | Whether an exact-record ACL may use the permission |
| `is_delegable` | Whether delegation may use the permission |
| `is_overridable` | Whether an approved bounded override may use the permission |
| `provenance_ref` | Required manifest/source reference |
| `metadata` | Non-authoritative JSON object |
| `status` | `draft`, `published`, `suspended`, `retired` |
| status and audit fields | Standard lifecycle evidence |

Remove:

- `plane_code` because the database is plane-local;
- Mesh `catalog_owner_id`, `account_id`, and `account_scope_key`;
- separate `auth_permission_plane`;
- nullable `entity_id` tied to a plane-specific metadata catalog.
- `category_code`; presentation grouping remains non-authoritative metadata
  until a governed taxonomy is required;
- `version_no` and `definition_sha256`; the live row is not a revision store
  and an input checksum does not prove its fields;
- `effective_from`, `effective_until`, and generated `is_active`; the manually
  reviewed catalog uses its status lifecycle, while history belongs in
  snapshot/audit.

Permission values differ by plane, but the table definition is identical.
Only `published` permissions participate in decisions.

## 2. `authz.permission_scope_policy`

Purpose: declares which scope kinds are valid for one exact permission and how
containment may propagate.

This is a definition child owned by `authz.permission`, not an independently
versioned catalog.

Recommended fields:

- `permission_id`, `scope_kind`, `propagation_mode`;
- standard created/updated audit fields.

Primary key:

`PRIMARY KEY (permission_id, scope_kind)`

Unified `scope_kind` vocabulary:

- `tenant`
- `workspace`
- `module`
- `company_code`
- `legal_entity`
- `operating_organization`
- `account`
- `network_relationship`
- `resource`

Unified `propagation_mode` vocabulary:

- `exact`
- `subtree`
- `member_companies`
- `relationship_participants`

The database must constrain invalid combinations. For example,
`relationship_participants` is valid only for `network_relationship`, and
`resource` accepts only `exact`. `subtree` means the assignment anchor plus
its descendants and is restricted to registered hierarchical scope kinds.

Remove the surrogate `id`, independent status/effective dates, policy version,
provenance and metadata. Scope rules may be inserted, changed, or deleted only
while their parent permission is `draft` or `suspended`; they are immutable
while the parent is `published` or `retired`. Publishing a permission requires
at least one rule. This eliminates contradictory permission/policy lifecycle
states.

Permission publication is deferred and revalidates existing active or pending
group-role, delegation, deny, override, and record-ACL dependencies against the
new rule set. A permission cannot be republished with incompatible authority
rows or with shareable/delegable/overridable flags that invalidate them.

`authz.fn_permission_is_assignable_at_scope` checks only that a published
permission accepts an assignment anchor's scope kind. Propagation is resolved
separately by `authz.fn_scope_assignment_covers_target`. The latter implements
`exact` and `subtree`; graph modes fail closed until their authoritative
plane-specific relationship resolver is wired.

## 3. `authz.plane_membership`

Purpose: explicit admission of a principal into the current plane. Membership
is a gate, never a permission grant.

Recommended fields:

- `id`, `tenant_id`, `principal_id`;
- `membership_kind`: `standard`, `support`, `service`, `integration`;
- `source_type`: `seed`, `manual`, `iam_sync`, `invite`, `api`, `import`;
- `source_ref`, `metadata`;
- `status`: `pending`, `active`, `suspended`, `revoked`;
- effective, status-audit, and row-audit fields.

Current-row uniqueness:

`UNIQUE (tenant_id, principal_id) WHERE status <> 'revoked'`

Remove `plane_code`. The same principal may have separate membership rows in
separate plane databases. Revoked membership is retained as evidence and a new
row may later re-admit the same principal. Activation requires an active tenant,
an active principal, and a non-expired effective window. Membership kind,
source coordinates, principal, and `effective_from` are immutable.

## 4. `authz.scope_target`

Purpose: stable authorization scope object. It limits a role, delegation,
deny, ACL, or override but never grants authority by itself.

Recommended fields:

- `id`, `tenant_id`;
- `scope_kind`;
- `scope_key`, an immutable normalized key;
- required `target_id`, an opaque UUID identifying the plane-owned target;
- `parent_scope_target_id`, nullable self-reference for containment;
- `display_name`, `metadata`;
- `status`: `active`, `suspended`, `retired`;
- status and row audit fields.

Required uniqueness:

- `UNIQUE (tenant_id, id)`
- `UNIQUE (tenant_id, scope_kind, scope_key)`
- `UNIQUE (tenant_id, scope_kind, target_id)`

The current Neon-wide nullable columns (`company_code_id`, `legal_entity_id`,
`operating_organization_id`, and `tenant_scope_id`) do not unify with Mesh.
Replace them with the generic target plus parent hierarchy. Plane services are
responsible for registering and retiring targets as source objects change.
Targets remain as historical references rather than cascading away with
business records. Parent coordinates are immutable in foundation DDL; a future
reparent operation must be an explicit guarded workflow. Active children require
an active parent, active parents cannot be suspended/retired while they have
active children, and recursive traversal is cycle-safe.

## 5. `authz.role`

Recommended fields:

- `id`, `tenant_id`, `code`, `name`, `description`;
- `role_kind`: `system`, `custom`, `managed`;
- `source_type`, `source_ref`, `metadata`;
- `status`: `draft`, `active`, `suspended`, `retired`;
- status-audit and row-audit fields.

Required uniqueness:

- `UNIQUE (tenant_id, id)`
- `UNIQUE (tenant_id, code)`

System roles are protected seed rows. Tenant administrators may manage only
`custom` roles. Roles do not contain scope; scope is assigned by
`group_role`. Role identity, kind, and provisioning source are immutable.
System and managed roles are seed-owned; custom roles use manual, API, or
import provisioning.

Role permissions may change only while the role is `draft` or `suspended`.
Deferred activation requires at least one permission, requires every
permission to be published, and revalidates all non-revoked scoped
assignments. Live role version/effective fields and generated `is_active` are
removed; history belongs in snapshot/audit.

## 6. `authz.role_permission`

Recommended fields:

- `id`, `tenant_id`, `role_id`, `permission_id`;
- created/updated audit fields.

Natural key:

`UNIQUE (tenant_id, role_id, permission_id)`

`permission_id` references the plane-local non-tenant permission catalog.
`role_id` uses a composite tenant FK. This is a role-definition child, not an
independently effective authority row. Insert, update, and delete are allowed
only while the parent role is `draft` or `suspended`.

## 7. `authz.principal_group`

Recommended fields:

- `id`, `tenant_id`, `code`, `name`, `description`;
- `group_kind`: `system`, `custom`, `iam_managed`;
- `source_type`, `source_ref`, `metadata`;
- `status`: `active`, `suspended`, `retired`;
- status and row audit fields.

Replace the overlapping `is_system` and `managed_externally` booleans with
`group_kind`. Keycloak may synchronize an `iam_managed` group, but the
plane-local row remains the application authorization authority. IAM-managed
groups require `source_type = 'iam_sync'` and a unique non-retired external
`source_ref`; system groups are seed-owned, and custom groups are locally
managed. Group kind and source coordinates are immutable.

## 8. `authz.group_member`

Recommended fields:

- `id`, `tenant_id`, `group_id`, `principal_id`;
- `source_type`, `source_ref`, `metadata`;
- `status`: `active`, `suspended`, `revoked`;
- effective and audit fields.

Current-row uniqueness:

`UNIQUE (tenant_id, group_id, principal_id) WHERE status <> 'revoked'`

Activation requires an active principal, active group, and currently effective
plane membership. IAM-managed groups accept only IAM-synchronized membership;
other groups reject `iam_sync`. A revoked membership remains historical while
a later row may re-grant the same membership.

No direct principal-role table is recommended. Direct assignments should use
a managed group so every role grant follows the same evaluation path.

## 9. `authz.group_role`

Purpose: the canonical scoped allow assignment.

Recommended fields:

- `id`, `tenant_id`, `group_id`, `role_id`, `scope_target_id`;
- `source_type`, `source_ref`, `metadata`;
- `status`, effective dates, and audit fields.

Current-row uniqueness:

`UNIQUE (tenant_id, group_id, role_id, scope_target_id)
 WHERE status <> 'revoked'`

The assigned role's permissions must each accept the target's scope kind under
`permission_scope_policy`. Activation requires active group, role and scope,
a non-expired assignment, and a non-empty compatible permission set. A revoked
assignment remains historical while a later row may re-grant the same scoped
role.

## 10. `authz.deny_rule`

Purpose: explicit deny with absolute precedence over every allow proof.

Recommended fields:

- `id`, `tenant_id`, `permission_id`, `scope_target_id`;
- `subject_kind`: `tenant`, `principal`, or `group`;
- nullable `principal_id` and `group_id` with an exact XOR check;
- `reason`, `metadata`;
- `status`: `active`, `suspended`, `revoked`;
- effective and audit fields.

Remove:

- `precedence`; all matching denies have the same absolute precedence;
- `policy_code` and `policy_version`; platform hard failures belong to the
  evaluator policy/catalog, not mutable tenant deny rows;
- `plane_code`.

V2's `auth_deny_rule_principal`, `auth_deny_rule_group`, and
`auth_deny_rule_hard_policy` are unnecessary in the clean compact model.

## 11. `authz.delegation`

Recommended fields:

- `id`, `tenant_id`, `delegator_id`, `delegate_id`;
- `reason`, optional `approval_ticket`;
- `approved_by`, `approved_at`;
- `status`: `pending`, `active`, `revoked`;
- `effective_from`, required `effective_until`;
- `revoked_by`, `revoked_at`, `revocation_reason`;
- `metadata` and standard audit fields.

The endpoints must differ. Delegation must have a finite expiry and may never
exceed the delegator's currently effective permission and scope. Activation
requires an independent active approver, memberships covering the complete
delegation window, at least one grant, and a deny-free base group-role proof
for every permission/scope grant. Delegated authority is never accepted as the
delegator's source proof, preventing transitive delegation.

## 12. `authz.delegation_grant`

Recommended fields:

- `id`, `tenant_id`, `delegation_id`, `permission_id`, `scope_target_id`;
- `created_at`, `created_by`.

Natural key:

`UNIQUE (tenant_id, delegation_id, permission_id, scope_target_id)`

The permission must be published and `is_delegable = true`. A validation
trigger enforces this without copying `is_delegable` into the grant.
Grant rows may be inserted or deleted only while the parent delegation is
`pending`; they cannot be changed after activation or revocation.

This compact row replaces V2's separate delegation-permission and
delegation-permission-scope tables.

## 13. `authz.override`

Purpose: exceptional, approved, bounded principal allow. It cannot bypass
tenant isolation, inactive membership, entitlement failure, MFA, SoD, hard
policy, or a matching deny.

Recommended fields:

- `id`, `tenant_id`, `principal_id`, `permission_id`, `scope_target_id`;
- `reason`, `approval_ticket`, `approved_by`, `approved_at`;
- `status`: `pending`, `active`, `revoked`;
- `effective_from`, required `effective_until`;
- revocation fields, `metadata`, and audit fields.

Require different requester/approver where separation of duties applies.
Overrides are never permanent.

## 14. `authz.record_acl`

Purpose: share one exact record using one explicitly shareable permission.

Recommended fields:

- `id`, `tenant_id`;
- `resource_code`, `record_id`, `permission_id`;
- `subject_kind`: `principal` or `group`;
- nullable `principal_id` / `group_id` with exact XOR;
- `reason`, `granted_by`;
- `status`: `active`, `revoked`;
- effective and optional expiry fields;
- revocation, metadata, and audit fields.

Active-row uniqueness:

`UNIQUE NULLS NOT DISTINCT
(tenant_id, resource_code, record_id, permission_id, subject_kind,
 principal_id, group_id) WHERE status = 'active'`

The permission must be published, `is_shareable = true`, and match
`resource_code`. An ACL never grants collection/list access.

Expiry is always derived from `effective_until`; it is not stored as a status.
This avoids authorization depending on a background job changing rows at the
correct instant.

## Authorization V2 tables not retained as authority

| Current/V2 table | Recommendation |
|---|---|
| `auth_permission_category` | Drop from authority; use non-authoritative metadata for presentation grouping until a governed taxonomy is justified |
| `auth_permission_plane` / `auth_plane` | Drop; physical DB establishes the plane |
| `auth_catalog_owner` | Drop initially; tenant-defined permission catalogs are a security boundary expansion |
| `auth_entitlement_target_policy`, Mesh `auth_entitlement_policy` | Keep in `control`; availability/entitlement is an evaluator gate, not an allow grant |
| `auth_permission_set`, `auth_permission_set_rule` | Park; direct role-permission rows are sufficient |
| `auth_role_permission_set` | Park with permission sets |
| `auth_role_compilation` | Derived cache; move to `runtime_meta` if performance requires it |
| `auth_scope_tenant`, `auth_scope_company`, `auth_scope_legal_entity`, `auth_scope_operating_organization` | Collapse into generic `scope_target` |
| `auth_scope_account`, `auth_scope_network_relationship`, `auth_scope_resource` | Collapse into generic `scope_target` |
| `auth_deny_rule_principal`, `auth_deny_rule_group`, `auth_deny_rule_hard_policy` | Collapse into constrained `deny_rule`; hard policy remains evaluator-owned |
| `auth_record_acl_permission` | Collapse into one exact-permission ACL row |
| `auth_delegation_permission`, `auth_delegation_permission_scope` | Collapse into `delegation_grant` |
| migration ledgers, transformer registries, cutover cohorts | Keep outside desired-state authority DDL |
| authorization epochs and invalidation outboxes | `runtime_meta` / `event` |
| decision evidence and shadow comparisons | `audit` |

Adjacent legacy access tables should be contracted as follows:

| Legacy table/capability | Recommendation |
|---|---|
| `account_grant`, generic access grants | Migrate to scoped group-role, delegation, ACL, or override according to actual semantics |
| `attachment_acl`, `content_item_access_grant` | Migrate exact-record shares to `authz.record_acl` |
| `account_entitlement`, `tenant_feature_entitlement`, `tenant_module_subscription` | Keep in `control`; these make a capability available but never grant it |
| `account_entitlement_override`, `tenant_entitlement_override` | Keep in `control` with approval/versioning; do not merge with principal `authz.override` |
| Keycloak roles/groups/client roles | Authentication/provisioning inputs only; never application authorization authority |

## Domain strategy

Use sealed domains for evaluator-controlled values:

- permission kind, risk tier, permission catalog status;
- scope kind and propagation mode;
- role kind, group kind, subject kind;
- authority source type;
- membership, assignment, delegation, override, ACL, and deny statuses.

Implemented domain values:

| Domain | Values |
|---|---|
| `permission_kind_d` | `entity_operation`, `capability`, `system_action` |
| `risk_tier_d` | `low`, `medium`, `high`, `critical` |
| `catalog_status_d` | `draft`, `published`, `suspended`, `retired` |
| `scope_kind_d` | `tenant`, `workspace`, `module`, `company_code`, `legal_entity`, `operating_organization`, `account`, `network_relationship`, `resource` |
| `propagation_mode_d` | `exact`, `subtree`, `member_companies`, `relationship_participants` |
| `source_type_d` | `seed`, `manual`, `iam_sync`, `invite`, `api`, `import` |
| `membership_kind_d` | `standard`, `support`, `service`, `integration` |
| `membership_status_d` | `pending`, `active`, `suspended`, `revoked` |
| `authority_status_d` | `active`, `suspended`, `revoked` |
| `definition_status_d` | `draft`, `active`, `suspended`, `retired` |
| `scope_status_d` | `active`, `suspended`, `retired` |
| `role_kind_d` | `system`, `custom`, `managed` |
| `group_kind_d` | `system`, `custom`, `iam_managed` |
| `subject_kind_d` | `tenant`, `principal`, `group` |
| `approval_status_d` | `pending`, `active`, `revoked` |
| `acl_status_d` | `active`, `revoked` |

Codes such as `canonical_code`, `resource_code`, `operation_code`, and
`source_ref` remain normalized text because their values
come from signed/versioned plane manifests rather than customer-managed lookup
rows.

Do not use PostgreSQL native ENUM types. Domains with checks are easier to
review and evolve in the manual DDL lifecycle.

## Security requirements

- ENABLE and FORCE RLS on every tenant authority table.
- Ordinary principals receive no direct write privileges on authorization
  tables.
- Tenant authorization administrators write only through guarded functions or
  services.
- Permission and scope-policy catalogs are seed/manifest owned and read-only to
  the application.
- Provide safe self-effective-access views instead of exposing raw group,
  deny, delegation, ACL, or override rows.
- Every authority mutation increments a plane/tenant authorization epoch and
  emits durable invalidation and audit evidence.
- No cascading delete of authorization evidence after it has participated in a
  decision; revoke/retire it instead.
- The evaluator order remains membership, permission/entitlement/hard gates,
  denies, then independent allow proofs from scoped group-role, delegation,
  record ACL, or override.

## Final foundation hardening applied

- Temporal authority does not expose a generated `is_active`; callers must
  evaluate lifecycle status and the effective window together.
- Permission publication requires an active plane-local `master.module`.
- Override uniqueness covers both `pending` and `active` rows, preventing
  parallel approval requests for the same principal, permission, and scope.
- Delegation approval/revocation, override approval/revocation, and ACL
  grant/revocation actors use tenant-safe composite principal foreign keys.
- Creation, status, approval, revocation, and ACL grant evidence is immutable
  once recorded.
- Active record ACL principals require current plane membership; expired ACL
  and deny rows cannot be activated.
- Permission/role drafts and pending membership/approval requests may be
  deleted before use. Authority and catalog rows that have participated in a
  decision must be revoked, suspended, or retired and retained.

## Recommended implementation sequence

1. Approve table names, fields, domains, and scope vocabulary.
2. Implement identical `authz/02_domains.sql` through `authz/11_grants.sql`
   under each plane.
3. Seed separate plane-local permission and scope-policy manifests.
4. Add authorization epoch, invalidation, and audit wiring.
5. Rewire repositories to `authz` without changing evaluator precedence.
6. Backfill legacy/V2 data through reviewed migrations.
7. Compare old and new decisions before retiring `master.auth_*`,
   `control.auth_*`, `mesh.auth_*`, and `mesh_control.auth_*`.
