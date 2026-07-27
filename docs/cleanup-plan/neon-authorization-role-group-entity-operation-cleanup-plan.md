# Neon authorization, Role, Group, and Entity Operation cleanup plan

- Status: proposed implementation plan
- Scope: Neon DB, Admin plane in Neon DB, Mesh DB, runtime authorization, seeds, IAM projections, UI/API contracts, and repository cleanup
- Source: Neon architecture scan plus a read-only audit of the current repository

## 1. Outcome

The end state is one understandable authorization model, implemented independently in the two database planes:

- Neon DB owns Neon and Admin authorization.
- Mesh DB owns Mesh authorization.
- Both planes use the same authorization concepts and decision semantics, but have separate physical data, repositories, permission catalogs, roles, groups, and seed packs.
- A business relationship, team membership, legal-entity link, network link, or Keycloak claim never grants application authority by itself.
- An entity operation has one immutable operation identity and one exact permission identity. Runtime code must not infer permissions from suffixes, tokens, or generic verbs.
- Normal access is `active plane membership -> active group membership -> scoped group role -> compiled exact permission`.
- Plans and features determine availability. Roles determine allowed actions. Scope limits the organizational area. Record ACLs share individual records. Delegation transfers a bounded subset of existing authority. Overrides are exceptional, explicit, audited, and time-bound.
- Persona is completely removed from the database, seeds, resolvers, services, contracts, UI, Keycloak configuration, generated clients, logs, tests, and documentation.
- Neon contains no Mesh authorization, Mesh operational graph, or Mesh-specific projection. Cross-plane communication is through APIs/events.
- A full reset produces a deterministic database from source-controlled DDL and seeds while preserving every approved existing human/service identity and immutable external subject ID.

This document treats the request's “Admin Plan” as “Admin plane.” Admin is a plane hosted in Neon DB; commercial plan rules for Neon tenants and platform-operated Admin access remain separate concerns.

### 1.1 Request coverage

| Requested result | Covered by |
| --- | --- |
| New Permission/Role/Group/Entity Operation design | Sections 5–10 |
| Deprecate and remove the legacy model from the repository | Sections 10–12, Wave 9, and section 18 |
| Complete seed setup | Section 13, Wave 6, and the verification matrix |
| Clean Neon DB/Admin plane versus Mesh DB architecture | Sections 6–8 and 12 |
| Full reset and seed replacement | Sections 14–16 |
| Preserve existing users and assign groups | Sections 3 and 14 |
| Remove Persona completely | Section 11 |
| Remove Mesh authority/information from Neon | Sections 6, 8, and 12 |
| Same authorization concept with different plane seeds | Sections 7–9 and 13 |
| Detailed phased cleanup plan | Sections 15–21 |

## 2. Meaning of “100%”

The following are release assertions, not aspirational percentages:

1. Every enabled entity operation has exactly one active canonical permission.
2. Every seeded active principal has the required plane membership and at least one intentional group assignment, or is explicitly marked inactive/quarantined.
3. Every role used by a group has a deterministic compiled permission set.
4. Every effective authorization mutation emits cache-invalidation/outbox evidence.
5. Every target authorization row class has an explicit lifecycle/source owner; seed-owned and runtime/manual/SCIM/JIT rows are distinguishable, with no half-populated table or row of unclear ownership.
6. A second forced seed run produces the same row counts and content hashes.
7. A scan of executable code, DDL, seeds, generated artifacts, active configuration, Keycloak configuration, and active product documentation finds zero Persona identifiers after final removal. Historical migration evidence must be archived outside active build/configuration inputs.
8. Neon has zero Mesh schemas, Mesh permissions, Mesh memberships, Mesh grants, or `network_membership` authorization scopes.
9. Mesh has zero Neon `master`, `control`, or business-table dependencies.
10. The before/after field-level identity manifest is unchanged for all preserved users, including principal/subject IDs, bindings, enabled state, selected profile fields, and service identity metadata.
11. All legacy authorization tables have zero runtime readers/writers before their physical removal.
12. All high-risk old/new resolver comparisons match; all remaining mismatches are reviewed and explicitly accepted before cutover.

## 3. Important interpretation of existing users

“Keep existing users as-is” means:

- Keep the Keycloak realm user, credentials, MFA enrollment, immutable subject ID, username, email, enabled state, and federated identity.
- Keep the application `principal_id`, principal code, status, profile, locale, timezone, and identity-binding subject wherever the current record is valid.
- Do not preserve Persona assignments or silently translate them into permanent authority at runtime.
- Use the old Persona/role/grant data once, offline, to prepare a reviewed user-to-group migration manifest.
- Rebuild plane memberships and group memberships explicitly from that manifest after reset.
- Do not invoke any IAM reset/import script that deletes live or unmanaged Keycloak users.

The database principal and identity-binding rows are rebuildable projections. Keycloak remains the authentication identity source; database groups remain the authorization source.

## 4. Current-state findings that drive the plan

| Area | Current repository state | Consequence |
| --- | --- | --- |
| Persona | `shared.persona`, `shared.persona_permission`, `shared.role.persona_id`, and `master.principal_persona` remain authoritative | Persona cannot be deleted until roles have explicit compiled permissions and every consumer is migrated |
| Multiple grant systems | `access_grant`, `company_code_access`, `tenant_admin_grant`, feature grants, delegation arrays, attachment ACL, and content ACL coexist | Precedence and scope differ depending on the route |
| Resolver divergence | Single permission, batch permission, session permission map, Admin resolver, Mesh resolver, workflow, and ACL paths use different rules | A single canonical decision service is a prerequisite to cleanup |
| Entity operation | `control.entity_operation.permission_code` doubles as the operation identifier in several paths | Runtime currently uses exact, suffix, and token inference; collisions and over-broad matches are possible |
| Plane entry | Admin discovery uses `tenant_admin_grant`, while Admin authorization uses Persona/group/access grants | Plane admission and action authorization can disagree |
| Mesh dependency | The Mesh resolver reads Mesh account grants and then Neon permissions/access grants | Mesh is not independently operable |
| Seed ordering | Persona permissions reference Mesh permissions created by a later seed | Fresh DBs silently miss grants |
| Seed safety | Tenant seed files globally truncate groups/members and delete principals | Incremental seed execution can destroy unrelated or live data |
| Reset behavior | Neon reset can drop Mesh schemas and always destroys principal projections | It does not enforce physical ownership or identity preservation |
| Keycloak tooling | Some scripts replace or delete users not present in their checked-in demo manifest | Those scripts must not be part of this cutover |
| Boundary policy | Existing Neon/Mesh boundary verification passes despite known data and runtime leaks | The policy is too narrow to be a release gate |
| ACL enforcement | Content and attachment ACLs have CRUD paths but are not uniformly used on reads/downloads | Copying their rows without migrating enforcement would create false security |

Material evidence is concentrated in:

- `server/db/ddl/shared/01_tables.sql`
- `server/db/ddl/master/01_tables_identity.sql`
- `server/db/ddl/master/01q_tables_plane_access.sql`
- `server/db/ddl/master/01m_bp_core_hardening.sql`
- `server/db/ddl/control/01_tables.sql`
- `server/db/ddl/master/05_functions.sql`
- `server/packages/services/iam/permission/permission.service.ts`
- `server/packages/services/iam/permission-context/resolvers`
- `server/packages/services/iam/session/session.service.ts`
- `server/packages/services/metadata/routes`
- `server/db/scripts/provision.ts`
- `server/db/scripts/provision-mesh.ts`
- `server/db/seed/platform/002_permission_model`
- `server/db/seed/platform/003_control/095_control_three_plane_runtime_contract.sql`
- `server/db/seed/tenants/neon`
- `stack/config/iam/realm-athyper.json`

## 5. Non-negotiable authorization invariants

1. Relationships provide context, never permission.
2. Plane membership provides entry, never action permission.
3. An entitlement makes a module/feature available, never grants an action.
4. A role contains exact permissions, never a wildcard or permission-code prefix.
5. A role has no organizational scope.
6. Scope belongs to a group-role assignment.
7. Ordinary users receive roles through groups, not through direct user-role grants.
8. Teams express work collaboration, not authorization.
9. Ownership/workflow state can be an additional policy condition only when the permission explicitly declares it.
10. An explicit deny wins over ordinary grants, delegation, ACL, and allow override.
11. An allow override cannot bypass tenant isolation, plane membership, entitlement, MFA, segregation-of-duties, lifecycle, or hard-deny policy.
12. Delegation cannot exceed the delegator's live authority, scope, plane, or expiry.
13. A record ACL applies only to an operation marked shareable.
14. Permission aliases are migration-only; no final runtime authorization decision may use an alias.
15. Permission codes are presentation and integration identifiers. Database foreign keys use permission IDs.
16. A principal, group, role, entity, operation, scope target, and permission must belong to the same tenant/plane wherever applicable; enforce this structurally.
17. Empty scope never means tenant-wide. Tenant-wide is an explicit boolean/scope row.
18. Fail closed on missing identity, membership, catalog, entitlement, scope, or database-plane configuration.
19. Database RLS protects tenant/account isolation; it is not a second business-permission engine.
20. Every decision is explainable from immutable evidence IDs and catalog/policy versions.

## 6. Target physical ownership

```text
                         Keycloak
                 authentication identity only
                    /                    \
                   v                      v
        +-----------------------+  API/events  +-----------------------+
        |       Neon DB         |<----------->|       Mesh DB         |
        |                       |              |                       |
        | shared: commercial    |              | shared: safe refs    |
        | control: entities,    |              | mesh_control: Mesh    |
        | operations, perms     |              | entities, ops, perms |
        | master: principal,    |              | mesh: subject,        |
        | Neon/Admin RBAC,      |              | account RBAC, ACL,    |
        | entitlement, scope    |              | exchange/network     |
        | Neon business data    |              | operational graph    |
        +-----------------------+              +-----------------------+
```

| Concern | Neon DB | Mesh DB | Keycloak |
| --- | --- | --- | --- |
| Authentication subject | Identity projection | Subject projection for Mesh members | Source of truth |
| Plane admission | `neon`, `admin` membership | `mesh` membership/account admission | Client login/realm roles only |
| Permission catalog | Neon/Admin only | Mesh only | None |
| Roles/groups/scopes | Neon/Admin only | Mesh account/network only | Optional non-authoritative mirror |
| Plans/features | Neon tenant commercial catalog | Required Mesh-owned account/product eligibility policy | None |
| Entity operations | Neon/Admin entities | Mesh entities | None |
| Business/tenant data | Neon-owned | No | None |
| Network account/connection/exchange | No authority or operational graph | Source of truth | None |
| Cross-plane reference | API/event contract only in the clean baseline | API/event contract only in the clean baseline | None |

### Boundary rule for integrations

This cleanup removes the current Mesh-specific projection and all Mesh-specific data/names from Neon. It has no grandfathered exception.

If a future Neon product requirement needs provider connectivity status, design it separately as a provider-neutral integration read model with no authorization effect, no `mesh_*` names, no membership/connection rights, and an explicit retention policy. That future ADR is outside this cleanup and must not preserve or rename the current Mesh projection.

## 7. Target Neon authorization model

### 7.1 Shared commercial/reference catalog

Retain or normalize:

- `shared.workspace`
- `shared.module`
- `shared.feature`
- `shared.plan`
- versioned plan/module/feature availability
- `shared.auth_permission_category`
- non-authorizing reference data such as country, currency, language, locale, timezone, UOM, and state/region

Remove Persona and the global Persona-derived role catalog from `shared`.

Permission category is shared reference data; the authoritative permission is plane/entity-aware and belongs in `control`.

### 7.2 Control catalog

#### `control.entity`

Keep the canonical entity identity. Every operation points to `entity_id`, not a free-text entity name.

#### `control.entity_version`

Keep the versioned entity contract. An operation may bind to the current entity or a specific entity version, but its stable operation identity does not change when a display label changes.

#### `control.entity_operation`

Required columns/constraints:

- `id`
- mandatory catalog owner discriminator/ID, identifying the platform catalog or a tenant catalog
- `entity_id`
- optional `entity_version_id`
- `operation_code`, such as `create`, `submit`, `approve`, `post`, `cancel`, or `share`
- `permission_id NOT NULL`
- behavior metadata: mutation/read, idempotency, risk, MFA/SoD requirement, shareable/delegable flags
- active/effective version metadata
- unique active `(catalog_owner, entity_id, operation_code)` with temporal non-overlap
- composite FK/constraint proving entity, operation, permission, and catalog-owner alignment

Use `control.entity_operation_plane(entity_operation_id, plane_code, policy_variant_id)` for exposure. A constraint/validation trigger requires a matching `auth_permission_plane` row. Plane-specific MFA/SoD/risk presentation can live in the referenced policy variant while the semantic operation and permission remain the same.

If Neon and Admin require different permissions or materially different action semantics, they are distinct operations with distinct stable codes, for example `approve` and `admin_approve`, and distinct permission IDs. Do not create two rows with the same `(catalog_owner, entity_id, operation_code)` and hope the current plane disambiguates them.

`operation_code` identifies what the entity can do. `permission_id` identifies who may do it. They are never the same field.

#### `control.auth_permission`

Required shape:

- stable `id`
- mandatory catalog owner discriminator and owner ID; use a well-known platform catalog owner instead of relying on nullable tenant uniqueness
- category
- exact canonical `code`
- `entity_id` and `operation_code` when entity-bound
- module and optional feature entitlement references
- risk tier
- shareable/delegable flags
- status/effective version
- immutable seed/catalog provenance

Use `control.auth_permission_plane(permission_id, plane_code)` for eligibility, with a unique/composite key on `(permission_id, plane_code)`. A semantically identical operation/permission can be exposed in both Neon and Admin. Policy-only differences use the operation-plane policy variant; permission or semantic differences require the distinct operation-code rule above. The entity operation still points to one exact permission ID; the evaluator additionally requires a matching eligibility row for the current plane.

Enforce active temporal uniqueness of `(catalog_owner, canonical_code)` with a range exclusion/partial-current constraint. `master.auth_role_permission` carries the role's plane and has a real composite FK `(permission_id, plane_code)` to `control.auth_permission_plane`, so a role cannot compile a permission outside its plane.

Recommended code conventions:

- platform: `{domain}.{module}.{entity}.{operation}`
- tenant extension: `tenant.{tenant-code}.{entity}.{operation}`

Do not authorize generic global codes such as only `create`, `read`, `update`, or `delete`.

#### Scope policy

Use one canonical `control.auth_permission_scope_policy` and one typed `control.entity_scope_binding` model. Remove duplicate or competing scope-policy definitions.

Examples of typed scope:

- tenant-wide, explicitly declared
- company code
- legal entity
- organizational unit
- operating unit
- business unit
- department
- cost center
- site/location

`network_membership` is not a valid Neon authorization scope.

#### Normalize all security-bearing metadata

Replace persisted permission-code strings and arrays with permission IDs or junction tables, including:

- entity surfaces and command visibility
- field security
- entity action rules
- entity relationships/mutation permissions
- lifecycle transitions
- workflow/flow/step permissions
- knowledge/Atlas permission references
- bulk actions and metadata API descriptors

Compiled API metadata may expose canonical permission codes as derived output. Source-of-truth rows must use IDs.

#### `control.permission_alias`

Keep only during migration:

- maps a contextual legacy key—legacy code plus entity/operation and, where needed, tenant and plane—to one canonical permission ID;
- has an owner, reason, introduced version, and removal version;
- rejects ambiguity within that complete context;
- is consulted by migration/import adapters, never by the final evaluator.

Generic legacy verbs such as `read`, `create`, and `update` cannot be global aliases because each can map to many entity-specific permissions. Prefer direct row-level backfill; create a contextual alias only where a compatibility importer needs it.

Drop the table only after the Wave 8 reset/cutover rehearsal and compatibility window complete; the final Wave 9 clean baseline excludes it.

### 7.3 Master identity and plane admission

#### `master.principal`

Retain the application subject identity and immutable ID.

#### `master.principal_profile`

Retain application profile preferences. Remove duplicate authentication claims where `principal_identity_binding` or Keycloak is authoritative.

#### `master.principal_identity_binding`

Make this the sole external identity binding authority:

- tenant
- principal
- provider/realm
- issuer/audience/client where required
- immutable external subject ID
- status and verification timestamps

Enforce one active principal per `(tenant, provider/issuer, external_subject_id)`. The same trusted operator subject may have explicit bindings in multiple tenants only through the shadow-principal process below.

#### `master.auth_plane_membership`

Required fields:

- tenant and principal
- `plane_code` constrained to `neon` or `admin` in Neon DB
- status
- effective start/end
- source and external reference
- approval/audit fields

This table answers only “may this identity enter this plane?”

Admin is plan-free only if explicitly documented as platform-operated. Do not encode this as an implicit resolver shortcut. Use a clear entitlement policy such as `platform_managed`/`not_applicable`, while still requiring Admin plane membership and ordinary Admin groups/roles.

#### Admin cross-tenant operation

Use an explicit target-tenant shadow principal model:

- the platform operator keeps its canonical operator identity;
- each customer tenant in which the operator may act has a local shadow principal bound to the same trusted external subject for that tenant;
- the local shadow principal requires target-tenant Admin plane membership and target-tenant Admin groups/roles/scopes;
- decision evidence records both the operator subject and local acting principal;
- support approval/effective dates are explicit;
- a principal relationship may correlate the identities for audit, but never creates membership or authority.

Do not infer cross-tenant access from `tenant_relationship`, `principal_relationship`, Keycloak realm role, email domain, support-team membership, or platform employment. If no approved target-tenant shadow membership exists, the request is denied.

### 7.4 Roles and permission compilation

#### `master.auth_permission_set`

A named, tenant/plane-owned reusable collection.

#### `master.auth_permission_set_rule`

Rules must resolve to explicit permission IDs at publication time. No runtime prefix, suffix, wildcard, category-only, or module-only allow.

#### `master.auth_role`

Required fields:

- tenant and plane
- stable role code/name/description
- business owner
- status/effective range
- version/catalog provenance

A role represents a business responsibility. It has no Persona and no scope.

#### Role assignment and compilation

- `master.auth_role_permission_set` assigns sets to roles.
- `master.auth_role_permission` stores the deterministic compiled exact permissions.
- compilation records catalog version/checksum and rejects missing/ambiguous permissions.
- publication is atomic: no role is active with a partial compilation.
- a compiler diff is reviewable before publication.

### 7.5 Groups, membership, and scope

#### `master.auth_group`

Required fields:

- tenant and plane
- stable code/name
- group type
- owner
- status
- membership source (`seed`, `manual`, `scim`, `migration`, `jit`, or approved integration)
- optional external reference

#### `master.auth_group_member`

Required fields:

- tenant, plane, group, principal
- membership status
- effective start/end
- source and external reference
- created/approved/revoked audit
- active-row uniqueness
- composite tenant/plane foreign keys

An inactive group or expired membership grants nothing.

#### `master.auth_group_role`

Required fields:

- tenant, plane, group, role
- `auth_scope_target_id`, including an explicit tenant-wide target where allowed
- effective start/end
- status/provenance/approval
- composite tenant/plane foreign keys

This is the only ordinary organizational authorization assignment.

### 7.6 Structural integrity and temporal rules

Do not leave final authority relationships dependent on nullable uniqueness or unchecked polymorphic IDs:

- define a DB-local plane domain/catalog and constrain every plane-bearing row structurally: Neon tables use `CHECK (plane_code IN ('neon','admin'))` plus the local plane FK, while Mesh tables use `CHECK (plane_code = 'mesh')` plus the Mesh plane FK;
- use a mandatory catalog owner key for platform/tenant catalog rows; if nullable ownership is unavoidable during transition, use `NULLS NOT DISTINCT` or explicit partial unique indexes;
- use composite tenant/plane foreign keys for principal, group, role, permission, assignment, and scope references;
- introduce `master.auth_scope_target` as the typed scope registry;
- bind each scope kind through a specialized table with a real FK, such as `auth_scope_company`, `auth_scope_legal_entity`, or `auth_scope_org_unit`; `auth_group_role` and overrides reference the registry ID, not an unchecked `(kind, id)` pair;
- enforce the registry row, specialized target, and assignment in the same tenant/plane;
- use PostgreSQL range exclusion constraints for memberships, assignments, catalog publications, or overrides where overlapping active effective ranges are forbidden;
- use partial uniqueness for one current published version and one active non-overlapping membership;
- clean existing anomalies, add constraints as `NOT VALID` where appropriate, validate after backfill, and only then enforce `NOT NULL`.

The exact DDL should document which histories may overlap. No resolver should decide correctness by choosing an arbitrary row from overlapping active assignments.

Release certification queries `pg_constraint` and requires zero unexpected `convalidated = false` rows in target schemas. Run FK/orphan, wrong-plane insert, and other negative-DML checks with both the migrator identity and least-privilege Neon/Admin/Mesh runtime identities under RLS.

### 7.7 Exceptions, ACLs, and delegation

#### `master.auth_deny_rule`

Use a separate exact-permission deny model:

- exact permission and canonical scope target;
- tenant/plane;
- effective range, reason, owner, approval, status, and provenance;
- either a principal subject or group subject through specialized FK-backed child bindings;
- optional subject-free hard tenant/platform policy for a documented policy class.

Do not use role as a runtime deny subject. A role is an allow bundle. Classify each legacy role-subject deny as one of:

- remove the permission from the affected role if it was correcting an over-broad allow;
- attach a deny to the affected groups;
- promote it to an approved hard policy; or
- expand it into reviewed principal denies only when membership is frozen and ongoing semantics are explicitly accepted.

Each conversion requires affected-user decision diffs and a conservation-ledger disposition. A matching active deny wins over every allow path.

#### `master.auth_override`

Use for an exceptional principal-specific allow:

- exact permission ID
- canonical `auth_scope_target_id`
- reason/ticket
- approver
- effective start/end
- status
- source

Initial implementation should support principal-only allow overrides. Principal/group/hard denies use `auth_deny_rule`. Every allow override must expire and be approved.

#### `master.auth_record_acl`

Consolidate record sharing:

- entity and record identity
- principal or group subject
- normalized `master.auth_record_acl_permission` child rows containing one exact permission ID each
- grantor/reason
- expiry/revocation
- tenant/plane

Only permissions marked shareable can be used. All read, download, share, update, and delete routes for a covered resource must call the canonical evaluator before old ACL tables are migrated.

#### Normalized delegation

Use:

- `master.auth_delegation` header
- `master.auth_delegation_permission` as the individual delegated-permission grant
- `master.auth_delegation_permission_scope`, keyed to that delegated-permission row

Scopes are paired with an individual permission grant; separate unpaired permission and scope collections are forbidden because they imply an unintended Cartesian product.

Every use revalidates:

- delegator's current ordinary group-role permission and complete proof provenance;
- delegated permission is explicitly listed and delegable;
- delegated scope is a subset of live delegator scope;
- delegator and delegate plane membership;
- effective time and revocation;
- target entity/workflow/task constraints;
- MFA/SoD and hard-deny policy.

Default policy forbids re-delegating authority obtained from another delegation, a record ACL, or an allow override. If chained delegation is ever introduced, it requires a separate versioned design with cycle detection, bounded depth, full upstream evidence, and invalidation when any upstream grant is revoked or expires.

Do not merge raw permission strings into a session.

### 7.8 Entitlement override

Physical availability authority:

- Neon modules: active `shared.plan_module_access` plus active `master.tenant_module_subscription`;
- Neon features: active `shared.plan_feature_access` plus active `master.tenant_feature_entitlement`;
- tenant exception: `master.tenant_entitlement_override` at module/feature level, with effective range, commercial approval, reason, and catalog rule declaring whether an allow override is permitted;
- Admin: an explicit versioned `platform_managed`/`not_applicable` entitlement policy row, never an omitted check;
- Mesh: a Mesh-owned `mesh.account_entitlement` (or equivalently named contract table) tied to the Mesh product/capability catalog and account, with status/effective range.

For Neon, availability is:

```text
active catalog item
AND active tenant subscription/entitlement
AND plan module/feature availability
AND NOT active entitlement-deny override
AND (ordinary availability OR approved catalog-permitted allow override)
```

A missing row fails closed. Platform suspension/hard catalog withdrawal wins. Replace permission-level tenant overrides and direct feature grants with this module/feature model. Entitlement can make a feature available/unavailable but never grant an operation, and no final plan table contains permission grants.

## 8. Target Mesh authorization model

Mesh uses the same semantic contract but owns it physically:

- Mesh-local subject/identity projection
- Mesh plane/account membership
- Mesh groups and active group membership
- Mesh roles, permission sets, compiled exact permissions
- Mesh-local entity/operation/permission catalog
- Mesh account/network scopes
- Mesh overrides, record ACLs, and delegation under the same precedence contract
- Mesh decision evidence and cache invalidation

### 8.1 Plane capability contract

| Capability | Neon | Admin | Mesh |
| --- | --- | --- | --- |
| Identity and plane admission | Tenant principal + Neon membership | Target-tenant shadow principal + Admin membership | Mesh subject + account/plane admission |
| Exact group-role permissions | Required | Required | Required |
| Typed scope | Tenant/org scope | Target-tenant Admin scope | Account/network/resource scope |
| Availability gate | Plan/module/feature | Explicit `platform_managed` policy | Mesh product/account eligibility |
| Deny and bounded override | Same precedence | Same precedence | Same precedence |
| Record ACL | Shareable operations only | Shareable operations only | Shareable operations only |
| Delegation | Delegable operations only | Delegable operations only | Delegable operations only |
| Decision evidence/cache expiry | Required | Required | Required |

If a plane does not expose an ACL, delegation, or override API at first release, the capability is explicitly disabled in its published capability manifest and attempts fail closed. The evaluator precedence and data contract do not silently diverge.

Implementation requirements:

1. The shared TypeScript authorization evaluator is repository-agnostic.
2. Neon and Mesh provide separate repository implementations.
3. Mesh runtime requires an explicit `MESH_DATABASE_URL`; remove every `meshDb ?? db` fallback.
4. Validate `current_database()` and schema fingerprint during startup, provisioning, and reset.
5. Reject source and target URLs that resolve to the same database.
6. Mesh runtime uses a dedicated least-privilege runtime identity and transaction wrapper that sets required account/subject RLS context.
7. Mesh authorization, sessions, inbox/document access, runtime bootstrap, discovery, and Keycloak sync never query Neon authorization tables.
8. Admin requests that affect Mesh go through a Mesh command/API/outbox contract; Admin does not write Mesh tables.
9. Mesh tests must pass with Neon unavailable and without Neon schemas.
10. Shared reference synchronization remains an explicit allowlist and can never include identity, groups, roles, permissions, ACLs, or delegation.
11. Both databases publish an `auth_contract_version` and capability manifest; runtime startup rejects an incompatible repository/evaluator contract.
12. Neon/Admin and Mesh are separate deployable processes or security domains. Neon runtime receives no Mesh URL/secret; Mesh runtime receives no Neon URL/secret; no ordinary runtime process can hold both.
13. Revoke default `PUBLIC CONNECT` where appropriate, grant database/schema access only to plane-specific identities, and enforce network/firewall denial to the opposite database.
14. Test Neon/Admin startup and authorization with Mesh unavailable, and Mesh startup and authorization with Neon unavailable, using least-privilege non-admin RLS identities.
15. A one-time boundary migration executor may hold two short-lived clients only under an audited job identity. Revoke those credentials at the migration watermark; never ship them to a runtime deployment.

Do not provision the entire current `shared/01_tables.sql` into Mesh. Split safe reference DDL from Neon commercial/Persona-era authorization DDL. Narrow `schema.mesh.prisma` to the exact Mesh-local schemas and regenerate clients.

## 9. One canonical decision service

### 9.1 Decision modes

The same evaluator supports three typed modes:

1. **Entity operation/resource decision** — requires the canonical entity operation and, for a concrete decision, the requested record/resource. Entity-bound permissions can be evaluated only through this mode; a direct permission-code/ID check that bypasses operation resolution is rejected.
2. **Registered non-entity capability decision** — accepts only an active permission explicitly registered with no entity binding, such as a platform configuration capability.
3. **Collection scope/batch materialization** — compiles the exact permission plus organizational allow/deny predicates for list, count, export, and bulk operations. A batch API is vectorization of these same typed requests, not a separate authorization engine.

A record ACL can allow only the named record in resource mode. It never makes a permission appear generally available in session/capability output. For a collection endpoint that explicitly includes shared records, return ACL record IDs/predicates as a separate record-specific set; never widen the organizational scope.

### 9.2 Evaluation order and complete proof paths

1. Resolve the exact external identity binding.
2. Validate active tenant/account and principal.
3. Validate active plane membership.
4. Resolve the typed request:
   - exact entity operation/permission plus operation-plane and permission-plane eligibility; or
   - exact registered non-entity permission.
5. Validate the physical module/feature/account entitlement.
6. Apply subject-free hard policy failures.
7. Resolve active group memberships.
8. Resolve matching principal/group deny rules; an inactive/expired group membership activates neither its allows nor its denies.
9. Build every alternative allow path independently:
   - active group membership -> scoped group role -> role-plane compiled exact permission;
   - bounded delegation;
   - shareable exact-record ACL, resource mode only;
   - approved principal allow override.
10. Require each alternative path to prove the exact permission, requested-target containment, permission scope policy, operation conditions, ownership/workflow/lifecycle rules, MFA/SoD, effective time, and its own source-specific scope. A delegation/ACL/override does not require an ordinary group-role proof, but it cannot bypass the common gates.
11. Intersect constraints only within an individual proof path.
12. Combine paths according to the request mode, then return and record evidence.

Do not globally intersect Company A from one valid group-role path with Company B from another; those paths authorize the union `{A, B}`. A scoped deny matches/subtracts only resources inside its scope; a tenant-wide deny matches every resource in the tenant.

For a concrete resource:

```text
eligible =
  valid_identity_and_principal
  AND active_plane_membership
  AND exact_registered_operation_or_non_entity_permission
  AND matching_plane_eligibility
  AND available_entitlement
  AND hard_policy_conditions

matching_deny =
  EXISTS(active hard or principal deny matching permission/resource)
  OR EXISTS(active group deny with active membership matching permission/resource)

valid_allow_path =
  EXISTS(complete scoped group-role proof)
  OR EXISTS(complete bounded delegation proof)
  OR EXISTS(complete shareable exact-record ACL proof)
  OR EXISTS(complete bounded allow-override proof)

allow = eligible AND NOT matching_deny AND valid_allow_path
```

For collection/list/count/export/bulk:

```text
organizational_scope =
  UNION(complete organizational/delegation/override allow scopes)
  MINUS UNION(applicable hard/principal/active-group deny scopes)

shared_record_set =
  explicit ACL record predicates minus matching deny predicates
```

List, detail, count, export, batch, and session/capability views must agree under this algebra. Relationships never appear in it.

### 9.3 Decision result

Return:

- allow/deny
- stable reason code
- exact permission ID and canonical code
- entity and operation IDs
- plane-membership evidence
- entitlement evidence
- matching hard/principal/group deny evidence
- group membership, role assignment, compiled permission, and scope evidence
- ownership/workflow/MFA/SoD evidence
- delegation, ACL, or override evidence
- catalog, role compilation, and policy versions
- authorization fingerprint
- typed result mode and, for collections, separate organizational predicate and ACL record-set predicate
- `next_authority_change_at`, the earliest known principal/account state, plane membership, group membership, role publication/assignment, entitlement, deny rule, delegation, ACL, override, scope policy, entity-operation, permission-plane, or catalog transition that can change the result

### 9.4 Consumers

Migrate all consumers to the same service or immutable decision snapshot:

- per-request and batch permission APIs
- session/bootstrap and `/me`
- metadata action and field rendering
- records, mutation, bulk, and entity action dispatch
- workflow approver and transition authorization
- document/content read, download, share, update, and delete
- Admin routes
- Mesh routes and session
- AI/tool actions

The UI may hide unavailable actions, but the server must always revalidate sensitive operations.

### 9.5 Cache and audit

- Replace Persona-based fingerprints with an authorization fingerprint based on plane membership, entitlement version, groups/memberships, role compilation, scope assignments, deny rules, overrides, delegation, ACL, and relevant policy/catalog versions.
- Emit transactional outbox events for every effective-authority mutation.
- Cache invalidation must cover create/update/revoke/expiry, not only explicit revocation.
- Expiry is a clock transition, not a row mutation. Cap cache/session TTL at `next_authority_change_at`, schedule durable expiry invalidations where long-lived caches exist, and deny/re-evaluate when freshness cannot be proven.
- Remove Persona columns and `matched_access_grant` coupling from decision logs.
- Record exact evidence IDs so a decision is reproducible and explainable.

## 10. Legacy-to-target migration map

| Legacy source | Target | Treatment |
| --- | --- | --- |
| `shared.persona` | None | Use only for one-time mapping; remove |
| `shared.persona_permission` | Compiled `auth_role_permission` | Backfill approved effective permissions, then remove |
| `shared.role` Persona × module | `master.auth_role` + permission sets | Create intentional tenant/plane roles; no Persona FK |
| `master.principal_persona` | Group membership | One-time reviewed mapping only; never a runtime fallback |
| `tenant_admin_grant` | Admin `auth_plane_membership` + Admin group membership | Migrate admission and authorization together |
| `company_code_access` | Scoped group-role or explicit override | Default to group-role; individual exceptions require override |
| `access_grant` | Group-role, `auth_deny_rule`, allow override, or record ACL | Classify each row and all affected users; do not create a generic replacement |
| group/principal feature grant | Tenant entitlement override or exact role permission | Feature availability is not authority |
| `tenant_permission_override` | Tenant entitlement override | Remove permission-as-entitlement semantics |
| `attachment_acl` | `auth_record_acl` | Migrate only after every enforcement route is canonical |
| `content_item_access_grant` | `auth_record_acl` | Same enforcement gate |
| `delegation_grant.permissions[]`/`scope_ref` | Normalized delegation tables | Revalidate authority and typed scope |
| `business_network*` in Neon | Mesh-owned graph | Move/reseed in Mesh; no Neon authority |
| `network_membership` scope | Mesh-local account/network scope | Remove from Neon enum/functions/seeds |
| textual metadata permission fields | FK/junction to `control.auth_permission` | Backfill exact IDs; remove token matching |
| `permission_alias` | None after compatibility | Time-bounded migration adapter |
| Persona fields in logs/contracts | Decision evidence/role-group summary | Version API, migrate consumers, remove |

Maintain a migration conservation ledger for every source authorization row. It records source table/primary key/checksum, classification (`migrated`, `intentionally_dropped`, or `quarantined`), target row IDs, transformation version, approver, and reason. Before deletion, reconcile source counts and checksums so every Persona permission, access/company/Admin grant, ACL, delegation, feature grant, and tenant override is classified exactly once. Unclassified and multiply classified rows block cutover.

## 11. Complete Persona removal workstream

Removal is complete only when all layers below are clean.

### Database and generated clients

- Remove Persona tables, assignments, FKs, views, functions, triggers, indexes, comments, RLS policies, and log columns.
- Remove `role.persona_id` and rebuild roles in tenant/plane scope.
- Remove Persona branches from permission and scope functions.
- Regenerate Prisma, Kysely, and any schema-derived types.
- Add a case-insensitive CI scan for `persona` across executable code, DDL, seeds, generated artifacts, active configuration, Keycloak configuration, and active product documentation. The historical tombstone and this plan must be archived or removed from active inputs at final closure.

### Seeds and provisioning

- Remove `010_persona.sql`, Persona permission seeds, generated Persona × module roles, principal-Persona inserts, and Persona-derived group inference.
- Remove Persona from demo, Technostat, Cirrus Atlantic, and Admin tenant seeds.
- Remove Persona seed registrations from entity/control metadata.
- Remove Persona from seed documentation and seed-discovery snapshots.

### Runtime and services

- Remove Persona registry and Persona JIT assignment.
- JIT must create/bind a principal and, only under an explicit policy, add a provenance-marked default group. It must fail closed; it must never fall back to a system principal.
- Remove Persona joins from bootstrap, platform identity, IAM roles, sessions, resolver fingerprints, and permission maps.
- Remove `delegatorPersona` and Persona-derived Mesh role/session behavior.

### Contracts and UI

- Introduce session/auth context v2 with decision entries and permission-specific typed scopes.
- For one compatibility release, mark Persona/global-scope fields deprecated and return no new authority from them.
- Migrate all duplicated session-plane packages and `/api/me` schemas.
- Remove Persona display/filter/edit controls from identity, settings, admin, and command hubs.

### Keycloak and tools

- Remove the `persona` user attribute, protocol mapper, and `athyper.persona` claim.
- Preserve all existing users and subject IDs.
- Retire Persona demo generation and any script that replaces or deletes unmanaged realm users.
- Replace with an additive, manifest-owned group/client reconciler.
- Explicitly exclude `reset-iam` from every database reset runbook.

### Tests, logs, events, and docs

- Replace Persona fixtures with group/role/membership fixtures.
- Remove Persona change cache events.
- Replace Persona decision-log data with exact evidence.
- Supersede Persona-centric architecture documents and ADRs.
- Keep historical migration documentation clearly marked as historical; it must not be executable configuration.

## 12. Complete Neon/Mesh segregation workstream

### Remove from Neon

- `master.business_network`, membership, and membership-role authorization.
- Neon `network_membership` assignment scope and resolver branches.
- `MESH.*` permission rows and Mesh plane eligibility.
- Mesh buyer/principal bindings, Mesh groups, Mesh account grants, and legal-entity Mesh account seed rows.
- Current Mesh-specific projection tables, columns, names, and rows.
- Combined `--with-mesh` Neon provisioning and Mesh schema discovery/reset logic.
- Cross-database authorization and `meshDb ?? db` fallbacks.
- Runtime queries that expose Neon documents through Neon grants to Mesh callers.

### Move/refactor

- Keep Neon legal-entity groups as ordinary Neon authorization seeds.
- Move Admin bindings out of tenant `network` seed folders into the Admin authorization pack.
- Rebuild Mesh buyer/partner/account assignments in Mesh-only seeds.
- Split the three-plane control seed into Neon/Admin and Mesh catalogs.
- Route Admin-to-Mesh changes through a Mesh-owned application port.
- Replace necessary connectivity UI data with an on-demand Mesh-owned API/event contract; do not carry the current projection into the clean baseline.

### One-time ownership correction

The current runtime exposes or derives some Mesh operational/document data from Neon. Before enforcing the steady-state boundary, classify those rows individually:

- ERP/business source documents, tenant masters, and transactions remain canonical in Neon and can never be reclassified as Mesh-owned;
- the one-time transferable allowlist is limited to genuinely Mesh-native exchange envelopes, inbox/outbox messages or content, delivery/receipt evidence, connection/account operational records, and their Mesh-owned objects;
- allowlisted records adjudicated as Mesh-owned are transferred once into Mesh with stable external lineage, counts/checksums, attachment/object reconciliation, and a future Neon archive/decommission disposition;
- records adjudicated as Neon-owned remain in Neon and are represented to Mesh only by a versioned exchange envelope/event carrying the minimum approved payload;
- authorization rows are never copied as business data; rebuild Mesh authorization from Mesh manifests;
- ambiguous ownership is quarantined and blocks cutover.

Maintain a globally disjoint source-row/object manifest: one stable source ID/hash has one owner and at most one canonical destination. A release gate proves no Neon business record became Mesh canonical and no object was duplicated or omitted.

This is a controlled migration exception, not permission for steady-state cross-database reads. After the migration watermark, Mesh runtime must not query Neon tables.

Do not delete or destructively tombstone the legacy source during the rollback retention window. Keep it immutable/read-only and independently restorable. Source archive/decommission happens only after acceptance and rollback expiry; the clean target may omit transferred rows immediately.

### Provisioning and database roles

- Neon provisioner creates/drops only Neon-owned schemas.
- Mesh provisioner creates/drops only Mesh-owned schemas.
- Require explicit, different URLs; check database identity before DDL or reset.
- Use distinct migrator and runtime credentials for each DB.
- No database role has cross-database privileges.
- Remove all unnecessary schemas from each Prisma datasource.

## 13. Deterministic seed architecture

### 13.1 Principles

- DDL defines the common semantic contract; plane-specific seeds define catalogs and business assignments.
- Seeds are ordered, transactional, idempotent, deterministic, and tenant/plane-scoped.
- No authorization seed may use global `TRUNCATE` or unscoped `DELETE`.
- Every seed-managed row has `seed_source`, stable `seed_key`, version/checksum, and ownership metadata or an equivalent seed ledger.
- Reconciliation may update/delete only rows owned by that seed source for that tenant/plane.
- Manual, SCIM, migration, and JIT rows are never deleted by a seed.
- Stable IDs are declared in manifests or generated deterministically from a versioned namespace.
- A seed fails on missing dependencies or wrong expected counts; notices are not sufficient.
- No wildcard permissions or username-suffix/Persona inference.
- Test-only grants, delegation, ACLs, and overrides are isolated from production seed packs.
- Publish expected counts and checksums per `seed_source`, tenant, plane, and catalog version.
- Compute hashes from canonicalized seed-owned business columns in stable key order; exclude generated audit timestamps and never mix manual/SCIM/JIT/runtime rows into a seed hash.
- Verify preserved non-seed rows separately by stable IDs/checksums and prove a seed did not change them.
- Use a cryptographic hash such as SHA-256; do not reuse mutable/non-cryptographic provisioner checksums as integrity evidence.
- Within each physical database, make `(tenant/account, plane, seed_source, version, seed_key)` immutable and record the logical database/contract identity alongside it. If content changes under an applied version, fail and require a new version.
- Apply seed mutations and the immutable ledger record in one transaction.
- Serialize each database/tenant/plane seed scope with an advisory lock and test concurrent provision attempts.
- Require canonical seed-owned equivalence between a clean build and a representative in-place upgrade at the same catalog/seed version.

### 13.2 Logical seed packs

```text
common-reference/
  safe non-authorizing global reference data

neon-catalog/
  workspace, module, feature, plan
  Neon entities, operations, permissions, scope policy

admin-catalog/
  Admin entities, operations, permissions

neon-tenant/<tenant>/
  tenant and entitlement selection
  business foundations
  Neon/Admin plane membership
  roles and permission sets
  groups
  scoped group-role assignments
  group membership
  explicit scenario exceptions

mesh-catalog/
  Mesh entities, operations, permissions, account scopes

mesh-tenant-or-account/<account>/
  account foundations and admission policy
  Mesh roles, groups, scoped assignments, membership
  network/connection/exchange fixtures

disposable-demo-identities/
  explicitly seed-owned demo principals only

migration-executors/identity-projection/   # not a seed pack
  preserved Neon/Admin principal and binding restoration
  preserved Mesh subject projection

assertions/
  counts, FK integrity, compilation, ownership, hashes
```

The exact repository directory names can follow the current provisioner conventions, but seed discovery must expose these ownership boundaries explicitly.

Preserved migration/SCIM/JIT identities are never seed-owned. Restore them with a separate one-time, idempotent migration executor that declares the source authority for each field, preserves stable IDs, and fails on any conflicting target value. Ordinary and forced seeds must not update preserved identity/profile/binding fields. Only disposable environments may use explicitly seed-owned demo identities.

### 13.3 Required provisioning stages

1. Safe common reference data.
2. Workspace/module/feature/plan catalog for Neon.
3. Entity versions, operations, exact permissions, operation/permission plane eligibility, and scope policies.
4. Tenant and entitlement selection.
5. Business/org foundations required by typed scopes.
6. Run the separate preserved-identity migration executor, or seed explicitly disposable demo identities.
7. Plane memberships.
8. Roles, permission sets/rules, and atomic compilation.
9. Groups.
10. Scoped group-role assignments.
11. Group memberships.
12. Explicit test/demo exceptions, ACLs, and delegations.
13. Assertions and seed-ledger checksum.

An entity operation and its permission should be registered in one transaction or manifest compilation so an operation can never be enabled without its permission.

### 13.4 Seed completion assertions

For each tenant/account:

- every active entity operation has one permission and every exposed operation plane has a matching permission-plane eligibility row;
- every permission has at least one eligible plane and a valid entitlement reference/policy;
- every active role compiles to at least one exact permission unless explicitly marked empty;
- every active group-role references an active role and valid typed scope;
- every active principal in the provision/migration manifest has a valid identity binding, plane membership, and group;
- no assignment crosses tenant or plane;
- no seed-owned orphan exists;
- no Persona, legacy grant, or Mesh row exists in Neon;
- no Neon authorization row exists in Mesh;
- the second run yields identical seed-owned canonical counts/checksums while manual/SCIM/JIT/runtime rows remain unchanged.

## 14. Existing-user migration manifest

Create an encrypted-at-rest, access-controlled migration artifact containing no credentials:

- realm/provider
- immutable external subject ID
- existing `principal_id`
- tenant ID/code
- username, email, enabled state, federated identities, and service-account/client identity for field-level comparison
- principal/profile/identity-binding fields to preserve
- target Neon/Admin plane membership
- target group codes
- membership source `migration`
- effective date
- mapping rationale/approver
- optional Mesh subject/account/group mapping in a physically separate Mesh manifest

### Mapping process

1. Establish an identity-change freeze or supported delta watermark covering Keycloak creation/disable/enable, federation links, MFA-relevant state, service accounts, SCIM, JIT, invites, principals, profiles, and identity bindings.
2. Export active identities and all legacy authorization evidence at that watermark.
3. Propose group membership from actual responsibilities, not simply Persona names.
4. Use Persona/legacy roles only as migration hints.
5. Have tenant/business owners approve the target group list.
6. Reject unmapped active users before cutover. Do not assign a broad fallback group.
7. Explicitly map service accounts and integration identities.
8. Mark disabled/inactive users inactive; do not delete them.
9. Hash the canonical field-level identity manifest before reset, including IDs, usernames, normalized email, enabled state, bindings, selected profile fields, and service identity metadata.
10. Reapply exact IDs and bindings after foundational tenant rows exist.
11. At final freeze, replay identity deltas, regenerate/hash the manifest, and take a matching final Keycloak snapshot.
12. Require field-level equality, source/target subject-set equality, zero duplicate subjects, and zero unmatched enabled Keycloak users.

The manifest is evidence and a database projection source; it is not a Keycloak disaster-recovery backup. Use a supported encrypted Keycloak database/realm backup that preserves credentials, MFA secrets, required signing/encryption material, and federated identity state, and prove it in a restore drill. Service secrets are preserved through the approved secret manager or explicitly rotated with dependent clients; never place plaintext secrets in the manifest.

Historically Persona-named usernames may remain unchanged because they are identity labels, not authority. New user creation and UI copy must not infer a role from such a suffix.

## 15. Phased implementation plan

### Wave 0 — decisions, inventory, and freeze contract

Deliver:

- ADR for ownership, evaluator precedence, Admin plan semantics, and the zero-Mesh-specific-data Neon boundary.
- Catalog of every authorization reader, writer, table, function, trigger, route, contract, UI field, Keycloak mapper, seed, and generated artifact.
- Golden decision corpus for every active principal and high-risk action.
- Legacy write telemetry and data-quality reports.
- Feature flags for shadow and plane/cohort cutover.
- Authorization change-capture design and a durable source watermark that can be installed before the first snapshot/backfill.
- Table-by-table data disposition and retention inventory covering business, document/object, event, audit/log, projection, cache/session, and authorization data.
- Approved synchronization, cutover, rollback, RPO, and RTO contract for both authorization migration and any fresh-database business-data move.

Gates:

- no unknown authorization source or writer;
- all cross-tenant FK anomalies classified;
- all active users included in the identity inventory;
- every database table/object store has exactly one approved disposition;
- rollback owner and observation window approved.

### Wave 1 — additive canonical DDL

Deliver:

- control permissions, exact entity-operation FK, canonical scope policy/bindings;
- plane membership;
- tenant/plane roles, permission sets/rules, compiled permissions;
- group lifecycle/provenance and scoped assignments;
- overrides, record ACL, normalized delegation;
- composite tenant/plane constraints;
- decision evidence and complete outbox invalidation;
- legacy-authority change capture installed before the initial snapshot/backfill, with replay from the recorded watermark.

Keep legacy objects intact and freeze new feature development on them. Several final names already exist. Use one of these explicit expansion patterns:

- add nullable v2 columns beside legacy columns—for example `operation_code_v2` and `permission_id_v2` on the existing `control.entity_operation`;
- create shadow tables such as `auth_group_v2`, `auth_group_member_v2`, and `auth_group_role_v2`; or
- evolve a compatible existing table additively where its identity and semantics can be proven safe.

The mandatory order is `expand -> install change capture and record watermark -> snapshot/backfill -> replay from watermark -> continuous synchronization -> compare -> clean anomalies -> validate constraints -> enforce NOT NULL -> atomic view/name/read swap -> contract legacy columns/tables`. Final names in sections 7–8 describe the end state, not necessarily the first additive migration name.

Gates:

- migrations are additive and reversible;
- initial nullable/shadow structures coexist safely with legacy data;
- constraints needed for backfill are present, with deferred validations explicitly tracked;
- target write paths reject new cross-tenant/plane rows;
- an operation cannot be published to the v2 path without an exact permission.

### Wave 2 — canonical catalog and entity-operation migration

Deliver:

- physically separate canonical Neon/Admin and Mesh entity-operation/permission manifests under the shared semantic contract;
- exact mapping for every entity surface/action/transition/flow/field relation;
- migration-only aliases;
- removal of suffix/token permission inference in new code paths;
- compiler and verification reports.

Gates:

- one-to-one operation/permission assertion passes;
- zero ambiguous contextual alias;
- no generic verb authorizes an entity mutation;
- all high-risk operations have risk/MFA/SoD/share/delegation metadata.
- Mesh catalog compiles without reading any Neon catalog table.

### Wave 3 — roles, groups, plane membership, and scope

Deliver:

- approved role/permission-set catalog;
- Persona-derived backfill into explicit compiled permissions;
- Admin grants migrated to Admin membership plus groups;
- approved existing-user group manifest;
- company/organization access migrated to scoped group-role assignments or overrides;
- physically separate Mesh subject/account-admission, entitlement, role, group, scoped-assignment, membership, ACL/delegation capability manifests and reconciliation.

Gates:

- every active user is deliberately mapped;
- every active group/role/membership is tenant/plane-consistent;
- expired/inactive groups, members, and assignments grant nothing;
- empty scope is never treated as tenant-wide;
- Mesh has a complete local permission-to-role-to-group/account proof graph before any Mesh repository is enabled;
- backfill anomalies are zero, `pg_constraint` reports no unexpected unvalidated target constraint, all deferred composite/temporal constraints are validated, and final v2 authority columns are `NOT NULL` where required.

### Wave 4 — evaluator foundation, entitlement, and exception migration

Deliver:

- repository-agnostic canonical evaluator core with the three typed decision modes and shared single/batch implementation;
- Neon/Admin and Mesh repository contracts with truth-table/unit fixtures;
- physical Neon module/feature, Admin `platform_managed`, and Mesh account entitlement gates;
- classification and migration of every `access_grant`;
- exact hard/principal/group deny rules and reviewed disposition of every legacy role-subject deny;
- canonical override service;
- canonical record ACL and normalized delegation data/services, not yet declared enforced until Wave 5 consumers move;
- removal of direct feature/principal grant semantics.

Gates:

- affected-user diffs prove each legacy group/role deny is conserved or intentionally retired;
- evaluator truth tables prove per-path scope intersection, cross-path union, collection deny subtraction, inactive-group deny behavior, ACL record isolation, and delegation provenance/subset;
- entitlement unavailability wins before any role or allow override.

### Wave 5 — canonical runtime, enforcement, and session v2

Deliver:

- production decision service and typed batch/materialization API based on the Wave 4 evaluator;
- Neon/Admin repository;
- Mesh-local repository and independent session path;
- session/context v2;
- migrated metadata, records, workflow, document, Admin, Mesh, and AI consumers;
- record ACL enforcement on every applicable read/download/share/update/delete route;
- normalized delegation enforcement in permission, workflow, session, and resource paths;
- new audit/fingerprint/outbox behavior.

Gates:

- no consumer performs its own permission suffix/token interpretation;
- deny/scope results are identical across list, detail, count, export, batch, session, workflow, and resource access;
- delegation subset/provenance and content/attachment negative ACL tests pass end to end;
- session/UI capability and server decision use the same catalog version;
- Mesh authorization tests pass while Neon is unavailable;
- missing plane DB/configuration fails closed.

### Wave 6 — safe seeds and identity tooling

Deliver:

- deterministic seed packs and seed ledger;
- removal of global authorization truncates/deletes;
- separate one-time idempotent identity migration executor with conflict-fail field authority;
- business/document/audit disposition executors and reconciliation reports required for a production-like fresh database;
- additive Keycloak group/client reconciler;
- split Neon and Mesh provision/reset commands with database identity guards;
- removal or hard environment/confirmation guarding of the broad `db:setup:reset` entry point and legacy reset wrappers;
- seed assertions and repeat-run hashing.

Gates:

- two clean builds and two forced re-seeds are identical;
- concurrent provision attempts serialize safely, immutable ledger tampering/content drift fails, and clean-build versus in-place-upgrade seed-owned hashes match;
- an unmanaged Keycloak user remains untouched;
- field-level identity diff is clean, identity count/canonical hash does not change, and the supported Keycloak restore drill succeeds;
- destructive reset refuses any non-disposable environment/database marker and an unrecognized database identity;
- Neon provision never discovers Mesh DDL/seeds and vice versa.

### Wave 7 — shadow evaluation and cohort cutover

During shadow:

- each exact legacy production consumer path remains authoritative for its traffic: single, batch, session, Admin, Mesh, workflow, company scope, or ACL path;
- evaluate that actual legacy path and the new evaluator from the same immutable identity/context input, then compare both to the approved target truth for the scenario;
- change capture is already active before the snapshot/backfill, so every later legacy authority mutation is projected through an idempotent transactional-outbox consumer from the recorded watermark;
- project every source transaction's related authority rows atomically, expose a monotonic applied watermark, and continuously reconcile classifications; block comparison/cutover on partial transactions or lag above the approved threshold;
- keep the legacy authorization write API as the sole production writer during shadow and the initial new-resolver read cutover; reject direct target-side authority mutations;
- never union old and new allows;
- compare normalized permissions and exact typed scopes;
- classify mismatch as capability, scope, precedence, plane, entitlement, operation mapping, delegation, ACL, or data defect;
- compare 100% of mutations, Admin actions, financial posting, workflow decisions, delegation uses, and ACL-protected reads;
- sampling is acceptable only for low-risk routine reads;
- every mismatch has an owner and an expected/bug disposition.

Cut over reads per plane/permission cohort while legacy remains the sole writer and continuously projects to target. This preserves a reliable resolver rollback during the observation window. After read stability:

1. freeze authorization writes;
2. catch the projection watermark to zero lag;
3. perform the final target-writer switch;
4. either keep a reviewed target-to-legacy compatibility projector for the rollback window or explicitly end the instant resolver-rollback promise before accepting target-only writes.

Do not run two unconstrained authority writers. A resolver feature flag is not an instant database rollback guarantee.

Gates:

- zero unexplained high-risk mismatch;
- exact parity for approved active-user scenarios;
- synchronization watermark is caught up and conservation reconciliation is complete;
- legacy is the sole writer during read cutover; the final writer switch occurs only under a zero-lag authorization freeze;
- any promised post-writer-switch rollback has a tested target-to-legacy projection, otherwise the rollback promise is explicitly closed;
- cache invalidation and decision evidence are verified under load;
- observation window is complete.

### Wave 8 — full reset rehearsal, cutover, and stable observation

Perform the runbook in section 16 first in an isolated production-like environment, while the legacy source and compatibility objects still exist and are independently restorable. Prefer fresh target databases and a connection switch over an in-place reset.

Gates:

- backup and restore drill succeeds;
- the approved source-to-target migration/CDC reaches the RPO cutover lag, demonstrates forward replay, and demonstrates reverse replay if lossless post-write rollback is promised;
- field-level identity and subject-set comparisons match;
- deterministic seed assertions and clean-build versus upgrade equivalence pass;
- all target constraints are validated;
- business-owner authorization and migrated-data acceptance pass;
- negative cross-plane/security and single-dispatcher side-effect tests pass;
- rollback time objective is proven;
- target resolver/writer and fresh target databases complete the approved stable observation window before contraction.

### Wave 9 — deprecation, repository removal, and final clean-baseline certification

Removal order:

1. legacy runtime consumers and writers;
2. old DB functions/views/triggers and compatibility adapters;
3. principal-Persona assignment;
4. Persona-permission mapping;
5. role-Persona FK and Persona catalog;
6. admin/company/access/feature grant tables;
7. old ACL/delegation tables;
8. Neon network-membership authorization and business-network graph;
9. aliases;
10. stale seeds, Keycloak mappers/tools, contracts, UI, generated models, tests, and docs.

For already-deployed databases, ship an idempotent tombstone migration and record its completion before deleting build-from-zero DDL files. Run a final disposable clean build/reset after contraction and prove it creates no legacy object. The final clean baseline must never recreate a legacy object.

Gates:

- Wave 8 reset/restore/cutover certification and rollback retention window are complete;
- zero live DB dependency;
- zero application reader/writer;
- zero Persona scan result;
- zero Mesh authority in Neon;
- generated clients contain only target tables;
- contextual aliases are absent from the final clean build;
- rollback no longer depends on a deleted legacy table;
- final clean-build/reset certification passes from an empty database.

## 16. Full reset and seed-replacement runbook

### 16.0 Reset safety and data disposition

Automated destructive in-place reset is allowed only for disposable local/CI environments. For staging, production-like, or production data, “full reset” means building a fresh target database from the clean baseline, migrating every approved surviving data class, validating it, and switching connections. Do not run destructive reset automation until the table-by-table disposition and migration executors are approved.

The reset command must require all of: an explicit disposable-environment marker, an exact expected database identity, a destructive-reset acknowledgement, and plane-schema fingerprint. It refuses otherwise. Retire or hard-guard the current broad `db:setup:reset` command and legacy batch/shell wrappers. In non-disposable environments the target must be a newly created empty database; provisioning creates schemas and must not issue a broad drop.

Every table, schema, external object collection, and stream receives exactly one disposition:

| Data class | Default disposition | Required evidence |
| --- | --- | --- |
| DDL/catalog/reference | Recreate from versioned DDL/seeds | Catalog/seed version and canonical checksum |
| Tenant and organizational foundations | Seed or migrate, never both ambiguously | Stable-ID map, counts, FK/checksum reconciliation |
| Principal/profile/identity binding | Import exact preserved projection | Field-level manifest diff and Keycloak subject match |
| Target authorization | Rebuild from approved manifests/seeds | Group/role/scope/permission assertions |
| Legacy authorization | Classify in conservation ledger, archive as evidence, then drop | One disposition per source row and approved checksum |
| Business master/transactional data | Migrate in declared FK order | Per-table counts, key ranges, canonical content checksums |
| Document metadata and object/blob storage | Migrate/retain together and reconcile | Object existence, size/hash, metadata/object reference report |
| Ledger/regulatory/audit/log data | Migrate or immutable archive per retention policy | Retention approval, tamper-evident checksum, retrieval drill |
| Events/outbox/inbox | Drain, capture watermarks, migrate/replay pending work | Source/target watermark and duplicate/idempotency report |
| Derived projections/search/cache | Rebuild from authoritative data | Rebuild version and source-count comparison |
| Sessions/tokens/authorization cache | Invalidate, not migrate | Revocation/epoch evidence |
| Explicitly disposable demo/test data | Drop and re-seed | Environment classification and seed checksum |

For a live fresh-database cutover, select and test one synchronization contract:

1. a complete maintenance write freeze for the entire snapshot/import/validation window; or
2. snapshot plus CDC/transactional outbox catch-up while the target remains read-only, followed by a short final write freeze and zero-lag verification.

Record RPO/RTO. RPO 0 requires all accepted source writes to be replayable. After the target accepts new business writes, switching back without data loss requires proven reverse replication/replay; otherwise rollback is limited to the pre-write freeze window and the recovery strategy is forward repair. This is separate from the fast resolver feature-flag rollback in Wave 7.

Use a cutover writer lease/epoch for database writers and external effects:

- source runtimes alone own the write/dispatcher lease during copy/catch-up; target runtimes and consumers remain read-only/disabled;
- pause or explicitly route schedulers, inbound webhooks, outbox dispatchers, email/payment/integration workers, and other side-effect producers;
- drain to recorded watermarks and verify idempotency keys;
- atomically switch the Neon/Admin and Mesh runtime/consumer epochs as one compatible release;
- prove zero duplicate and zero missing external effect before reopening traffic.

### 16.1 Preflight

1. Announce maintenance; freeze authorization/tenant-configuration changes; freeze identity provisioning or activate its supported delta capture; either begin the approved full business-write freeze or activate the approved snapshot-plus-CDC path.
2. Approve the table/object/stream disposition inventory, migration dependency graph, retention decisions, RPO/RTO, and cutover/rollback owner.
3. Record exact source revision, DDL/auth-contract/catalog versions, seed checksums, Keycloak realm, and both database identities.
4. Back up Neon and Mesh independently with a tested database restore.
5. Take a supported encrypted Keycloak backup/snapshot that preserves credentials, MFA, signing/encryption material, federated identity, clients, and realm state; also export the non-secret field-level inventory. Do not run an IAM reset.
6. Export the approved Neon/Admin identity-and-group manifest and physically separate Mesh manifest.
7. Produce migration extracts for every surviving business/document/audit/event data class, including FK order, counts, canonical checksums, external object references, and stream watermarks.
8. Export the legacy authorization conservation ledger and old/new golden decisions for rollback/comparison.
9. Verify all restore/import/replay procedures before destructive work.
10. Verify Neon and Mesh URLs differ and match expected `current_database()` and schema fingerprints.
11. Start or verify the approved business, authorization, and identity synchronization paths; record their snapshot/CDC watermarks before cutover freeze.

### 16.2 Reset Neon

1. Require a fresh empty Neon target outside disposable local/CI; only a positively identified disposable database may drop/recreate Neon-owned schemas.
2. Assert the target has no unexpected schemas/objects, then create only Neon-owned schemas.
3. Provision the safe common references.
4. Provision Neon commercial catalog and Neon/Admin entity-operation-permission catalogs.
5. Provision tenant and minimum organizational foundations.
6. Run the separate identity migration executor for principals and external identity bindings using exact IDs; stage profile values without applying unresolved business FKs.
7. Import profile-referenced company, cost/profit center, project, dimension-set, employee, and other organizational foundations.
8. Restore full principal profiles and verify every staged FK-backed field.
9. Import remaining approved business master and transactional data in the declared FK order, preserving stable IDs and validating each stage before dependents.
10. Import/match document metadata and object storage, ledger/regulatory/audit data, and pending event/outbox state according to their disposition.
11. Apply Neon/Admin plane memberships.
12. Compile roles and permission sets.
13. Create groups and scoped role assignments.
14. Apply approved group memberships.
15. Apply only approved explicit deny/override/ACL/delegation scenarios.
16. Catch up the authorization, identity, and business synchronization watermarks while the target remains read-only.
17. Run all Neon seed, per-table migration, object reconciliation, retention, constraint, and authorization assertions.

Neon reset must not discover, create, drop, or seed `mesh`, `mesh_log`, or `mesh_control`.

### 16.3 Reset Mesh

1. Require a separate fresh empty Mesh target outside disposable local/CI; only a positively identified disposable database may drop/recreate Mesh-owned schemas.
2. Assert the target has no unexpected schemas/objects, then create only Mesh-owned schemas.
3. Provision safe shared references and Mesh-local auth/catalog DDL.
4. Provision Mesh-only entity operations, permissions, capability manifest, and product/account entitlement catalog.
5. Provision/migrate active Mesh account entitlements and account/network/connection/exchange foundations; a missing entitlement policy fails closed.
6. Import approved surviving Mesh account/network/connection/exchange, document/object, audit, and pending event data in its declared dependency order. This may include the one-time transfer of rows adjudicated Mesh-owned under section 12, or versioned exchange envelopes for Neon-owned records.
7. Use the separate identity migration executor to project only subjects approved for Mesh.
8. Apply Mesh admission, groups, roles, scopes, and memberships from the separate manifest.
9. Apply explicit Mesh deny/override/record-sharing/delegation scenarios.
10. Catch up Mesh identity, data, and event synchronization watermarks while the target remains read-only.
11. Run Mesh data/object/retention, constraint, eligibility, and authorization assertions using a non-admin runtime identity and RLS context.

Mesh reset must not import Neon roles, groups, grants, or permissions. It must not make Neon-owned business records canonical in Mesh; the only cross-boundary inputs are the approved one-time Mesh-owned transfer and versioned exchange envelopes described above.

### 16.4 Post-provision

1. Run the safe non-authorizing reference sync allowlist, if required.
2. Rebuild search/projections/read models in scope and compare them to authoritative source counts.
3. Acquire the final source writer/dispatcher lease; pause identity/SCIM/JIT/invite changes, schedulers, inbound webhooks, and external-effect workers; keep target runtimes read-only/disabled.
4. Catch up authorization, identity, business, object/event, and dispatcher watermarks to the approved lag and record the final cutover epoch.
5. Take the matching final Keycloak snapshot, regenerate the field-level manifest, and require source/target subject-set equality, zero duplicate subjects, zero unmatched enabled users, service-identity equality, and the ordered canonical hash.
6. Reconcile every migrated table, disjoint source-row/object manifest, external object, audit archive, event watermark, and pending-work queue against the approved disposition manifest.
7. Verify every active user has intentional plane/group assignment.
8. Verify Neon/Admin and Mesh `auth_contract_version`, capability manifest, catalog version, and exchange-envelope versions are mutually compatible; incompatibility is a go/no-go failure.
9. Increment authorization epochs, purge old session/permission caches, and revoke or force-refresh active application sessions.
10. Run the golden decision suite and end-to-end business acceptance.
11. Run cross-plane negative tests with the opposite database/credential unavailable and prove non-admin RLS behavior in both planes.
12. Run dispatcher/idempotency tests proving zero duplicate/missing external effects.
13. Run a second forced seed and compare seed-owned hashes while proving non-seed rows are unchanged.
14. Take a pre-switch target backup.
15. Atomically switch both plane runtime/consumer leases and connections, run smoke checks, and reopen traffic only after all gates pass.

### 16.5 Rollback

- Distinguish resolver rollback from database rollback: the synchronized legacy resolver can be re-enabled quickly before its removal, but a database connection switch is governed by the approved RPO/RTO and replay design.
- Keep the matched legacy source databases immutable/read-only, untombstoned, and independently restorable throughout the rollback retention window.
- Stop traffic before any mixed-model writes spread.
- If the target has accepted no new writes, restore/switch back both databases as a matched version set.
- If the target has accepted writes, reverse-replay them with the proven mechanism before switching back; without it, do not claim a lossless rollback and use the approved forward-repair procedure.
- Restore the matching application revision and Keycloak configuration if it changed.
- Reacquire the source writer/dispatcher epoch and ensure only one side can emit external effects.
- Revoke sessions and clear authorization caches again.
- Reconcile final source/target watermarks and preserve shadow comparison logs, conservation ledger, field-level identity diff, and migration manifests for incident analysis.

Do not roll back only one plane if an exchanged contract/catalog version changed.

## 17. Verification matrix

| Test family | Required cases |
| --- | --- |
| Identity | exact issuer/subject binding; disabled user; duplicate subject; wrong tenant; JIT fails closed; identity delta replay; zero unmatched enabled users |
| Plane | no membership; expired membership; Neon/Admin separation; wrong-plane DML rejected; explicit target-tenant Admin shadow; relationship does not infer cross-tenant authority; each plane runs without opposite URL/secret/DB |
| Entitlement | plan/module/feature enabled and disabled; platform-managed Admin rule; Mesh account eligibility; missing row fails closed; override cannot grant permission |
| Entity operation | exact operation/permission; entity-bound direct check rejected; registered non-entity capability; duplicate code; stale/missing permission; dual exposure/policy variant; plane mismatch; contextual alias only in migration |
| Role/group | active/inactive group; active/expired member; inactive membership activates neither allow nor deny; active/expired assignment; exact plane-eligible compiled permission |
| Scope | explicit tenant-wide; per-proof-path intersection; cross-path union; collection deny subtraction; ACL record set remains separate; list/detail/count/export/batch/session parity; empty scope denial; cross-tenant rejection |
| Deny/override | principal/group/hard deny against all allow paths; scoped deny; legacy role-deny conversion diff; expired allow; missing approval/reason; hard-policy bypass rejected |
| Delegation | subset of permission/scope/time; delegator loses permission; no ACL/override/delegation re-delegation; plane mismatch; revoke; task/entity constraint |
| ACL | principal/group share; shareable-only; expiry/revoke; read/download/update/delete negative cases |
| Workflow | direct/group approver; inactive group; bounded delegation; transition exact permission |
| Session/UI | action map and server decision parity; permission-specific scopes; no Persona field after cutoff |
| Cache/audit | every authority mutation invalidates; TTL capped at exhaustive `next_authority_change_at`; future deny activation and plane-membership expiry work without row updates; evidence references/fingerprints change |
| Seed | clean/second/forced/concurrent runs; immutable-version drift fails; manual rows preserved; clean-build/upgrade equivalence; wrong count fails |
| Constraint certification | zero unexpected unvalidated constraints; FK/orphan and wrong-plane negative DML under migrator and least-privilege RLS identities |
| Identity preservation | field-level manifest diff and canonical hash; credentials/MFA restore drill; service secret preserve/rotate evidence; unmanaged KC user untouched |
| Boundary | Neon without Mesh schemas/URL/secret; Mesh without Neon schemas/URL/secret; no fallback; distinct DB roles; opposite `CONNECT` denied; migration credential revoked |
| Data migration/reset | table/object disposition complete; FK-ordered counts/checksums; disjoint object manifest; audit retention; CDC/outbox lag; writer/dispatcher lease; forward/reverse replay and side-effect drill |
| Repository | zero Persona; zero legacy grant consumer; zero Mesh authorization in Neon; generated schema exactness |

Run the following `pnpm` commands from `server/db`; run the boundary scripts from the repository root. Existing checks should remain green and be augmented with the new gates:

- `pnpm run typecheck`
- `pnpm run db:setup:discover`
- `pnpm run db:verify:entity-operations`
- `pnpm run db:verify:permission-aliases` during migration
- `pnpm run db:verify:plane-eligibility`
- `pnpm run db:verify:rls`
- `pnpm run db:verify:seed-contracts`
- `pnpm run db:verify`
- `node scripts/policy/verify-neon-mesh-boundary.mjs`
- `node scripts/policy/verify-plane-boundaries.mjs`

Expand the boundary policy to inspect DDL, seeds, runtime database access, datasource schema lists, fallback syntax, source/target DB identity, generated models, and Persona-zero rules. Remove its legacy network-seed/service allowlists.

## 18. Repository cleanup inventory

| Area | Primary locations | Planned action |
| --- | --- | --- |
| Shared Persona/catalog | `server/db/ddl/shared`, platform permission seeds | Replace with reference/commercial catalog and remove Persona |
| Master auth DDL | `server/db/ddl/master/01_tables_identity.sql`, constraints/functions/triggers | Add target model, backfill, then remove legacy paths |
| Admin grant | `server/db/ddl/master/01q_tables_plane_access.sql`, Admin seeds | Replace with plane membership plus groups |
| Neon network authority | `server/db/ddl/master/01m*`, `01r*`, tenant `network` seeds | Move authority to Mesh and delete the Mesh-specific display projection |
| Entity permissions | `server/db/ddl/control`, control seeds | Exact operation code + permission ID and normalized metadata refs |
| Resolver/session | `server/packages/services/iam` | One evaluator, v2 context/session, no Persona |
| Records/metadata/workflow/docs | corresponding service routes | Remove independent permission inference and enforce canonical ACL/delegation |
| Mesh runtime | Mesh resolver, inbox/runtime/admin partner bindings, KC sync | Mesh-only DB repository/API boundary |
| Provision/reset | `server/db/scripts/provision*.ts`, `server/db/package.json`, transaction wrappers | Separate commands; retire/guard broad reset; exact DB/environment identity |
| Keycloak/tools | `stack/config/iam`, `tools/scripts`, IAM reset scripts | Preserve users; remove Persona and destructive reconcilers |
| Contracts/UI | shared session/API contracts and UI platform packages | Migrate v2 then remove deprecated fields |
| Generated DB clients | Prisma/Kysely schemas and generated outputs | Regenerate from exact plane schemas |
| Logs/cache/outbox | DB log DDL and IAM outbox worker | Exact decision evidence and complete invalidation |
| Docs/ADRs | three-plane/permission/reset documentation | Supersede Persona and single-DB assumptions |

## 19. Delivery sequence by pull request

Keep pull requests reviewable and deployable:

1. ADR, inventory, golden fixtures, and stronger boundary/static guards.
2. Additive canonical DDL, tenant/plane constraints, and seed ledger.
3. Permission catalog compiler and exact entity-operation bindings.
4. Neon/Admin and Mesh roles, groups, memberships, scopes, and existing-user manifest tooling.
5. Canonical evaluator foundation and physical Neon/Admin/Mesh entitlement gates.
6. Deny, override, delegation, record ACL, decision evidence, cache invalidation, and shadow harness.
7. Neon/Admin consumer enforcement and session v2 migration.
8. Mesh-local repository/enforcement, DB wiring, RLS context, and cross-plane APIs/events.
9. Deterministic split seeds, safe Keycloak reconciler, and reset guards.
10. Cohort cutover and legacy-writer freeze.
11. Full reset rehearsal, fresh-database cutover, restore evidence, and stable observation.
12. Tombstone migration, Persona/legacy/Neon-Mesh removal, generated/docs cleanup, and final empty-database certification.

Do not mix final legacy deletion into the initial additive-schema pull request.

## 20. Risks and controls

| Risk | Control |
| --- | --- |
| Privilege escalation from different precedence rules | One evaluator; shadow comparison; deny and scope matrices |
| User lockout | Approved identity/group manifest; no fallback group; cohort cutover and rollback flag |
| Existing user deletion | Additive Keycloak reconciler; field-level subject-set comparison; explicitly ban IAM reset |
| Keycloak disaster loses credentials/MFA | Supported encrypted backup and restore drill; manifest is evidence, not backup |
| Identity changes after manifest export | Identity freeze/delta watermark; final snapshot, subject-set equality, and unmatched-user gate |
| Scope accidentally becomes tenant-wide | Explicit scope type; empty scope denies; structural constraints |
| Multiple valid scopes incorrectly intersect | Independent proof paths; intersect within a path and union across valid paths |
| Partial role compilation | Atomic publish/version/checksum; inactive until complete |
| Stale session retains authority | Complete outbox invalidation; auth epoch; session revoke at cutover |
| Authority expires without a row update | `next_authority_change_at`, bounded TTL, and scheduled expiry invalidation |
| ACL rows create false security | Migrate enforcement before data; negative route tests |
| Delegation expands authority | Live subset validation on every use |
| Cross-plane data leak | Separate URLs/roles/repos; no fallback; wrong-plane-unavailable tests |
| Manual/runtime write inserts wrong plane | DB-local plane domain, CHECK/composite FK, and negative DML tests |
| Runtime process can reach both databases | Separate deployables/secrets/network grants; revoke opposite DB connect |
| Seed destroys manual data | Seed ownership/provenance; scoped reconciliation; no global truncate/delete |
| Reset loses unseeded business data | Explicit preservation inventory, backup, fresh target DB, restore drill |
| Target/legacy drift during shadow | Transactional projection outbox/dual-write, watermark, and conservation reconciliation |
| Database rollback loses target writes | Proven reverse replay or pre-write rollback only; explicit RPO/RTO and forward-repair plan |
| Source and target both emit external effects | Single writer/dispatcher lease epoch, paused jobs/webhooks, idempotency reconciliation |
| Tombstone prevents rollback | Stable observation window; matched DB/app rollback; delete last |
| A future integration reintroduces Mesh state into Neon | Keep the clean baseline API/event-only; require a separate provider-neutral, non-authorizing read-model ADR |

## 21. Definition of done

The cleanup is complete only when:

- the target tables and evaluator are the only authorization source;
- every entity operation binds one exact permission ID;
- all active users pass the final field-level/subject-set identity comparison and have approved groups;
- Persona is absent from executable repository content and database schemas;
- legacy grants, feature grants, old ACL/delegation, and Admin grant paths are absent;
- Neon and Mesh can provision, reset, start, authorize, and test independently;
- wrong-plane DML is structurally rejected and no runtime deployment holds the opposite plane's database secret;
- Neon/Admin and Mesh availability gates are explicit and fail closed;
- Neon contains only Neon/Admin authority and Mesh contains only Mesh authority;
- Keycloak contains no Persona mapper/claim and no user was deleted or recreated;
- all seed packs are deterministic, scoped, repeatable, and complete;
- every legacy authorization row has exactly one approved conservation-ledger disposition;
- every preserved business/document/audit/event data class passes its migration, retention, object, and watermark reconciliation;
- decision logs explain permissions and scopes from exact evidence;
- all positive, negative, boundary, identity-preservation, seed-repeatability, and restore tests pass;
- the final reset baseline creates no deprecated object;
- architecture, operations, seed, and incident/rollback documentation matches the implementation.

## 22. Recommended decisions

Adopt these defaults unless an ADR records a different approved choice:

1. Admin is a plan-free platform plane in Neon DB, but still requires explicit Admin plane membership and Admin groups/roles.
2. Remove the current Mesh-specific projection; the clean baseline stores no Mesh-specific reference in Neon. Any future provider-neutral integration read model requires a separate ADR.
3. Preserve identities, not legacy authorization, through reset.
4. Use fresh target databases and connection cutover for production-like resets.
5. Require zero unexplained high-risk shadow mismatches and a full stable release before physical legacy removal.
6. Make direct allow overrides exceptional, approved, and expiring; ordinary access always comes from group-role assignment.
7. Treat permission aliases as temporary migration data and remove them from the final clean baseline.
