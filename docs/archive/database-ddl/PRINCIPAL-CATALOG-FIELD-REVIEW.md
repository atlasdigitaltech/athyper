# Principal catalogue field-level review

Date: 2026-07-30

Status: superseded by `PRINCIPAL-FINAL-FIELD-CONTRACT.md` for the finalized
Keycloak-authoritative design. Retained as current-state analysis and migration
evidence.

## Locked scope

Common table concepts for Athyper, Neon, and Mesh:

- `master.principal`
- `master.principal_identity_binding`
- `master.principal_profile`
- `master.principal_notification_preference`
- `master.principal_ui_profile`
- `master.principal_ui_preference`

Neon-only:

- `master.principal_relationship`

Parked:

- no new `principal_work_context` table
- no movement of notification preferences to `event`
- no authorization tables in this review

“Common” means one canonical field contract instantiated in each plane
database. It does not mean placing mutable principal data in `shared`.

## Cross-plane scope rule

The identity columns can be common, but the existing scope columns cannot:

- Neon currently owns principals by `tenant_id`.
- Mesh principals are plane-local and obtain account scope through account
  membership/grants.
- Athyper's tenant/workspace membership boundary is not yet locked.

Do not add an unprotected generic `scope_id`. Retain Neon's `tenant_id`, keep
Mesh principal independent of `account_code`, and add Athyper scope only after
its membership model is reviewed.

## 1. `master.principal`

| Field | Decision | Review |
|---|---|---|
| `id` | Keep/common | UUIDv7 primary key; reuse the same UUID across plane projections where possible |
| `tenant_id` | Neon extension | Keep Neon FK; do not copy into Mesh automatically |
| `code` | Keep/common | Canonical normalized machine code; use this name instead of Mesh `principal_code` |
| `name` | Keep/common | Canonical display label; use this name instead of Mesh `display_name` |
| `principal_type` | Keep/common | Required controlled value: user, service account, bot/integration, support actor as applicable |
| `is_active` | Keep/common | Generated from `status`; never write directly |
| `is_locked` | Keep/common | Authentication/security lock independent of lifecycle status |
| `is_service_account` | Keep/common | Explicit service identity marker |
| `auth_epoch` | Keep/common | Required non-negative cache/session invalidation counter |
| `login_email` | Keep/derived | Verified-primary-login cache sourced from contact data; never direct-write |
| `external_ref` | Keep/common | Optional upstream HR/IAM correlation key |
| `principal_source` | Keep/common, tighten | Make non-null with a controlled default such as `internal` |
| `metadata` | Keep/common, tighten | Require JSON object |
| `status` | Keep/common, tighten | Controlled principal lifecycle; do not represent locking in both status and `is_locked` |
| `status_changed_at` | Keep/common | Trigger maintained |
| `status_changed_by` | Keep/common | UUID principal FK where bootstrap ordering permits |
| `created_at` | Keep/common | Required |
| `created_by` | Keep/common | Standardize Mesh text actors to UUID principals |
| `updated_at` | Keep/common | Trigger maintained |
| `updated_by` | Keep/common | UUID; enforce audit-pair consistency |

Required constraints/indexes:

- primary key on `id`
- normalized non-empty `code` and non-empty `name`
- unique lower-case code within the plane ownership scope
- `auth_epoch >= 0`
- lower-case normalized `login_email`
- JSON-object check for `metadata`
- uniqueness for non-null `external_ref` within ownership scope
- active/type and verified-login lookup indexes

Security correction:

The current Neon tenant-wide table read exposes fields such as `login_email`,
`external_ref`, and `metadata`. Application directory reads should eventually
use a safe projection/view; direct table access should be self, privileged IAM,
or admin access.

## 2. `master.principal_identity_binding`

| Field | Decision | Review |
|---|---|---|
| `id` | Keep/common | UUIDv7 primary key |
| `tenant_id` | Neon extension | Preserve Neon ownership; do not force into Mesh |
| `principal_id` | Keep/common | Required FK to local `master.principal` |
| `realm_key` | Keep/common | Required realm/authority namespace |
| `provider_code` | Keep/common | Controlled provider identifier |
| `subject_id` | Keep/common | Required external subject; opaque text |
| `username` | Keep/common | Optional normalized provider username |
| `issuer` | Keep/common | Optional OIDC/SAML issuer |
| `audience` | Keep/common | Optional expected token audience |
| `client_id` | Keep/common | Optional interactive/provider client |
| `federation_link` | Keep/compatibility | Keycloak-specific but correctly belongs here, not in profile |
| `created_at_millis` | Keep/compatibility | Provider epoch value; consider a neutral provider-created timestamp later |
| `not_before` | Keep/compatibility | Keycloak token cutoff; correctly belongs in binding |
| `service_client_id` | Keep/common | Canonical service-account client binding |
| `required_actions` | Keep/common | Provider-required actions; empty array by default |
| `synced_at` | Keep/common | Last successful reconciliation |
| `sync_status` | Keep/common | pending, synced, drift, error, disabled |
| `sync_error_message` | Keep/common | Last failure; clear after successful sync |
| `sync_retry_count` | Keep/common | Non-negative retry counter |
| `idp_snapshot` | Keep/restricted | Audit/diagnostic snapshot; sensitive and not tenant-directory readable |
| `provider_attributes` | Keep/restricted | Provider-specific attributes; require JSON object when non-null |
| `idp_enabled` | Keep/common | Provider-side enabled state |
| `idp_email_verified` | Keep/common | Provider-side email verification state |
| `metadata` | Keep/common | Require JSON object |
| audit fields | Keep/common | UUID actors and audit-pair consistency |

Required uniqueness:

- one binding per principal, realm, and provider
- one subject per realm and provider within the chosen ownership model

Important runtime correction:

Service-account resolution currently reads
`principal_profile.keycloak_service_client_id`. It must be changed to read this
table's `service_client_id` before the duplicate profile field is retired.

Security correction:

Current tenant-wide read access is too broad for `idp_snapshot`,
`provider_attributes`, required actions, and synchronization errors. Limit
table reads to the subject principal, IAM jobs, support authority, and admins.

## 3. `master.principal_profile`

### Common profile fields

| Field | Decision | Review |
|---|---|---|
| `id` | Keep/common | UUIDv7 primary key |
| `tenant_id` | Neon extension | Scope only where the plane uses tenant-owned principals |
| `principal_id` | Keep/common | Required 1:1 FK |
| `given_name` | Keep/common | Personal/display profile |
| `family_name` | Keep/common | Personal/display profile |
| `preferred_name` | Keep/common | Personal/display profile |
| `display_name` | Keep/common | Profile display override |
| `avatar_url` | Keep/common | Validate supported URI/asset-reference policy at service boundary |
| `attributes` | Keep/common | Profile extension attributes; require JSON object |
| `metadata` | Keep/common | Operational metadata; require JSON object |
| audit fields | Keep/common | UUID actors and audit-pair consistency |

### Duplicate UI fields

| Field | Decision | Review |
|---|---|---|
| `locale` | Retire after compatibility update | Canonical owner is `principal_ui_profile.locale_code` |
| `timezone` | Retire after compatibility update | Canonical owner is `principal_ui_profile.timezone_code` |

### Duplicate IAM fields

These fields must not be included in the new common profile contract:

- `keycloak_id`
- `keycloak_username`
- `keycloak_created_at_millis`
- `keycloak_federation_link`
- `keycloak_not_before`
- `keycloak_required_actions`
- `keycloak_service_client_id`
- `keycloak_synced_at`
- `keycloak_sync_status`
- `idp_snapshot`

Their canonical owner is `principal_identity_binding`. Keep the existing Neon
columns temporarily until runtime readers and migration evidence are complete.

### Removed ERP/employee fields

Remove these from the new Neon `principal_profile` desired state and do not
copy them into Athyper or Mesh:

- `default_company_code_id`
- `default_cost_center_id`
- `default_profit_center_id`
- `default_project_id`
- `default_dimension_set_id`
- `default_budget_allocation_id`
- `employee_id`
- `supervisor_id`
- `supervisor_source`

Do not create `principal_work_context`.

- Resolve principal-to-employee through the existing
  `master.employee.principal_id`.
- Resolve the supervisor through `master.employee.manager_id` and the HR/org
  model.
- Require company, cost-center, profit-center, project, dimension, and budget
  context from the active request/document workflow rather than hidden
  principal defaults.

### Lifecycle fields

`enabled_date` and `disabled_date` overlap principal lifecycle and provider
enabled state. Do not add them to Athyper or Mesh. Retain them in Neon only
until their writers/readers are confirmed and then decide whether principal
status history or identity binding is authoritative.

Remove the corresponding profile FKs, indexes, triggers, view projections, API
fields, and UI presentation during the Neon desired-state rewrite.

## 4. `master.principal_notification_preference`

| Field | Decision | Review |
|---|---|---|
| `id` | Keep/common | UUIDv7 primary key |
| `tenant_id` | Neon extension | Mesh uses account scope; Athyper scope remains to be locked |
| `account_code` | Mesh extension | Real FK to network account; not a common principal field |
| `principal_id` | Keep/common | Required local principal FK |
| `plane_key` | Retire in plane-local variants | Database already identifies the plane; retain temporarily for centralized Neon compatibility |
| `event_code` | Keep/common | Required controlled notification event |
| `channel` | Keep/common | Required controlled channel |
| `is_enabled` | Keep/common | Nullable intentionally: null means inherit default |
| `frequency_code` | Keep/common | Nullable means immediate/default; validate supported digest frequencies |
| `metadata` | Keep/common | Require JSON object |
| `status` | Keep/common | active/deprecated |
| `is_active` | Keep/common | Generated from status in the canonical contract |
| `status_changed_at` | Keep/common | Add to Mesh/common lifecycle |
| `status_changed_by` | Keep/common | UUID actor |
| audit fields | Keep/common | Standardize Mesh text actors to UUID |

Natural key for a plane-local table:

`ownership scope + principal_id + event_code + channel`

Critical DDL defect:

The current Neon bundle grants access to this table but does not enable/force
RLS and defines no policies. The desired-state table must have:

- ENABLE and FORCE RLS
- self-read/self-write policies
- privileged notification-service/admin policy
- no unrestricted tenant-wide preference reads

## 5. `master.principal_ui_profile`

### Common UI fields

| Field | Decision | Review |
|---|---|---|
| `id` | Keep/common | UUIDv7 primary key |
| `tenant_id` | Neon extension | Use plane ownership adapter |
| `principal_id` | Keep/common | Required 1:1 principal FK per scope |
| `locale_code` | Keep/common | FK to `shared.locale` |
| `language_code` | Keep/common | FK to `shared.language` |
| `timezone_code` | Keep/common | FK to `shared.timezone` |
| `date_format` | Keep/common | Non-empty when present |
| `number_format` | Keep/common | Non-empty when present |
| `week_start` | Keep/common | Nullable integer 0 through 6 |
| `appearance_mode` | Keep/common | Controlled UI value |
| `density_code` | Keep/common | Controlled UI value |
| `metadata` | Keep/common | Require JSON object |
| audit fields | Keep/common | UUID actors and audit-pair consistency |

### Removed navigation and ERP defaults

- `home_workspace_code`
- `home_module_code`
- `default_company_code_id`
- `default_book_id`
- `default_dashboard_id`

Remove these fields from the new desired state in all planes. Navigation should
open from routing/module availability rather than a stored default workspace or
module. Company/book context must be explicit in the request or workflow.
Dashboard selection belongs to the dashboard capability when it is reviewed.

Removing the home fields also removes the obsolete `shared.workspace` and
`shared.module` FKs and eliminates the need for a module/workspace consistency
constraint.

The current effective-UI view, preferences API, UI form, fiscal-context
fallback, BFF session enrichment, and API schemas depend on these fields and
must be simplified before the columns disappear.

## 6. `master.principal_ui_preference`

| Field | Decision | Review |
|---|---|---|
| `id` | Keep/common | UUIDv7 primary key |
| `tenant_id` | Neon extension | Use local ownership adapter |
| `principal_id` | Keep/common | Required principal FK |
| `preference_code` | Keep/common | Required registered preference key |
| `surface_code` | Keep/common | Nullable means global preference |
| `preference_value` | Keep/common | Required JSONB; retain 8 KiB size cap |
| `metadata` | Keep/common | Require JSON object |
| audit fields | Keep/common | UUID actors and audit-pair consistency |

Natural key:

`ownership scope + principal_id + preference_code + surface_code`
using `NULLS NOT DISTINCT`.

Keep this table separate from `principal_ui_profile`. The profile stores
strongly typed, frequently read settings; preference stores small registered
module/surface overrides.

Current self-only RLS is directionally correct. Preserve self CRUD plus
privileged admin access.

## 7. Neon-only `master.principal_relationship`

| Field | Decision | Review |
|---|---|---|
| `id` | Keep | UUIDv7 primary key |
| `from_tenant_id` | Keep | Source ownership side |
| `from_principal_id` | Keep | Source principal |
| `to_tenant_id` | Keep | Target ownership side |
| `to_principal_id` | Keep | Target principal |
| `relationship_type` | Keep | Controlled directional relationship |
| `verification_status` | Keep | Controlled workflow state |
| `verified_method` | Keep | Required when verified |
| `verified_at` | Keep | Required when verified |
| `verified_by` | Keep/repair FK | Add principal FK |
| `requested_at` | Keep | Request evidence |
| `requested_by` | Keep/repair FK | Add principal FK |
| `approved_at` | Keep | Approval evidence |
| `approved_by` | Keep/repair FK | Add principal FK |
| `effective_from` | Keep | Inclusive validity start |
| `effective_until` | Keep | Exclusive validity end |
| `metadata` | Keep | Require JSON object |
| `status` | Keep | active/archived |
| `is_active` | Keep | Generated |
| `status_changed_at` | Keep | Trigger maintained |
| `status_changed_by` | Keep/repair FK | Add principal FK |
| audit fields | Keep | UUID actors and audit-pair consistency |

Current valid protections:

- source and target cannot be the same principal
- one row per directional pair and relationship type
- effective end must be after start
- verified state requires method and timestamp
- both endpoint principals have composite FKs

Required corrections:

- Add non-empty/lookup validation for workflow values.
- Add actor FKs for request, approval, verification, status change, and audit.
- Add JSON-object validation for metadata.
- Add workflow-pair checks such as timestamp/actor consistency.
- Treat relationship records as evidence: archive rather than tenant delete.
- Restrict cross-tenant mutation. Current RLS allows either participating
  tenant to insert/update/delete a cross-tenant relationship, which permits
  unilateral assertion. Use an approved service/admin workflow.
- For symmetric types such as `same_human`, prevent reverse duplicates or
  canonicalize endpoint ordering.

This table is actively used by Atlas support-session resolution for verified,
active `support_shadow_for` relationships. It cannot be removed from Neon
without redesigning that workflow.

## DDL execution order for this slice

1. `master.principal`
2. `master.principal_identity_binding`
3. `master.principal_profile`
4. `master.principal_notification_preference`
5. `master.principal_ui_profile`
6. `master.principal_ui_preference`
7. Neon-only `master.principal_relationship`

Create tables before actor FKs. Add self-referencing audit/actor FKs in
`05_constraints.sql` after the system principal is available.

## Blocking decisions before implementation

1. Confirm Athyper principal ownership: plane-global, tenant, or workspace
   membership.
2. Confirm whether Neon keeps centralized `plane_key` notification preferences
   or each database owns only its local preferences.
3. Update service-account resolution to use
   `principal_identity_binding.service_client_id`.
4. Remove runtime/API/UI dependencies on the retired profile and UI default
   fields before applying the clean desired-state DDL to an existing database.
