# Principal final field contract

Date: 2026-07-30

Status: implemented as a unified desired-state model in Athyper, Neon, and
Mesh.

This contract supersedes the earlier identity-binding recommendations in
`PRINCIPAL-CATALOG-FIELD-REVIEW.md` and earlier revisions of this document.

## Final table decision

| Table | Placement | Plane scope | Decision |
|---|---|---|---|
| `principal` | `master.principal` | Athyper, Neon, Mesh | Required |
| `principal_profile` | `master.principal_profile` | Athyper, Neon, Mesh | Required |
| `principal_ui_profile` | `master.principal_ui_profile` | Athyper, Neon, Mesh | Required |
| `principal_ui_preference` | `master.principal_ui_preference` | Athyper, Neon, Mesh | Required |
| `principal_notification_preference` | `master.principal_notification_preference` | Athyper, Neon, Mesh | Required |
| `principal_identity_binding` | `master.principal_identity_binding` | Athyper, Neon, Mesh | Required IAM-to-application identity mapping |
| `principal_relationship` | — | None | Parked; the mixed correlation, merge, and transfer model is not approved |

No table in this set belongs in `authz`. Authorization tables reference
`master.principal.id`; principal identity and profile tables must not store
roles, permissions, scopes, grants, memberships, denials, or ACLs.

All retained tables are tenant scoped in the new three-plane foundation.
Mesh account/network access and Athyper workspace/module access remain
authorization memberships rather than columns on `principal`.

## 1. `master.principal`

Purpose: tenant-local application actor representing a user, service account,
bot, integration, or support identity. Keycloak remains authoritative for
credentials, authentication state, federation, required actions, MFA, email
verification, and provider synchronization.

### Final fields

| Field | Required | Decision |
|---|---:|---|
| `id` | Yes | UUIDv7 primary key; application principal ID |
| `tenant_id` | Yes | FK to the plane-local `master.tenant`; RLS boundary |
| `code` | Yes | Immutable normalized application code |
| `name` | Yes | Application directory label |
| `principal_type` | Yes | `user`, `service_account`, `bot`, `integration`, or `support` |
| `auth_epoch` | Yes | Non-negative local authorization/session-cache revision |
| `external_ref` | No | Opaque HR/upstream business correlation key |
| `provisioning_source` | Yes | `internal`, `jit`, `sync`, `import`, or `api` |
| `metadata` | Yes | Non-authoritative JSON object |
| `status` | Yes | Application lifecycle: `active`, `suspended`, `deactivated` |
| `is_active` | Generated | `status = 'active'` |
| `status_changed_at` | No | Trigger maintained |
| `status_changed_by` | No | Local principal actor |
| `created_at`, `created_by` | Yes | Standard audit |
| `updated_at`, `updated_by` | No | Standard audit pair |

### Remove

- `is_locked` — Keycloak authentication state
- `is_service_account` — derived from `principal_type`
- `login_email` — Keycloak owns authentication email; business/notification
  email uses `master.contact_link`
- `principal_source` — replaced by the clearer `provisioning_source`
- all provider snapshots, required actions, federation data, client IDs,
  sync status, retry counters, and provider-enabled flags

### Required integrity

- PK `(id)`
- unique `(tenant_id, id)`
- unique `(tenant_id, code)`
- unique `(tenant_id, external_ref)` when `external_ref IS NOT NULL`
- `auth_epoch >= 0`
- normalized non-empty code/name
- JSON-object metadata
- immutable `id`, `tenant_id`, and `code`
- tenant FK with `ON DELETE RESTRICT`

IAM realm, issuer, provider, and subject identifiers belong only to
`master.principal_identity_binding`. This keeps `master.principal`
provider-neutral and allows a principal to acquire more than one verified IAM
binding without duplicating the application actor.

### Security

Direct principal-table reads must be limited to the subject principal, IAM
services, support authority, and administrators. Provide a safe tenant
directory view that excludes `auth_epoch`, `external_ref`, and unrestricted
metadata.

## 2. `master.principal_profile`

Purpose: application-facing human/display profile. It is not a Keycloak shadow,
employee record, UI-settings table, or working-context default store.

### Final fields

| Field | Required | Decision |
|---|---:|---|
| `id` | Yes | UUIDv7 primary key |
| `tenant_id` | Yes | Tenant scope |
| `principal_id` | Yes | 1:1 FK to local principal |
| `given_name` | No | Product-facing name |
| `family_name` | No | Product-facing name |
| `preferred_name` | No | Preferred product name |
| `display_name` | No | Optional override of principal directory label |
| `avatar_url` | No | Validated application avatar/asset URL |
| `attributes` | Yes | JSON object for approved profile extensions |
| `metadata` | Yes | JSON object for non-authoritative operational metadata |
| audit fields | Yes/optional pair | Standard UUID actors |

### Remove

- `locale`, `timezone` — owned by `principal_ui_profile`
- every `keycloak_*` field
- `idp_snapshot`
- `enabled_date`, `disabled_date`
- company, cost-center, profit-center, project, dimension, budget, book, and
  dashboard defaults
- `employee_id`
- `supervisor_id`, `supervisor_source`

Employee correlation remains on Neon `master.employee` through its
`principal_id` and `person_id`. Working context must come from the active
request, document, membership, or workflow.

### Required integrity/security

- unique `(tenant_id, principal_id)`
- composite principal FK `(tenant_id, principal_id)`
- JSON-object checks
- audit-pair consistency
- self-read/self-update for permitted fields
- privileged directory/admin access through a safe projection

## 3. `master.principal_ui_profile`

Purpose: strongly typed, frequently read user-interface defaults. NULL means
inherit the tenant/platform default.

### Final fields

| Field | Required | Decision |
|---|---:|---|
| `id` | Yes | UUIDv7 primary key |
| `tenant_id` | Yes | Tenant scope |
| `principal_id` | Yes | 1:1 local principal FK |
| `locale_code` | No | FK to `shared.locale` |
| `language_code` | No | FK to `shared.language` |
| `timezone_code` | No | FK to `shared.timezone` |
| `date_format` | No | Non-empty when present |
| `number_format` | No | Non-empty when present |
| `week_start` | No | Integer 0 through 6 |
| `appearance_mode` | No | `light`, `dark`, or `system` |
| `density_code` | No | `compact`, `comfortable`, or `spacious` |
| `metadata` | Yes | JSON object |
| audit fields | Yes/optional pair | Standard UUID actors |

### Remove

- `home_workspace_code`
- `home_module_code`
- `default_company_code_id`
- `default_book_id`
- `default_dashboard_id`

Workspace/module availability comes from plane-local catalog and authorization
membership. Company/book context belongs to the active workflow. Dashboard
selection belongs to the dashboard capability.

### Required integrity/security

- unique `(tenant_id, principal_id)`
- composite principal FK
- locale/language/timezone FKs
- UI value and JSON checks
- self CRUD plus privileged admin access

## 4. `master.principal_ui_preference`

Purpose: small registered module/surface overrides that do not justify typed
columns in `principal_ui_profile`.

### Final fields

| Field | Required | Decision |
|---|---:|---|
| `id` | Yes | UUIDv7 primary key |
| `tenant_id` | Yes | Tenant scope |
| `principal_id` | Yes | Local principal FK |
| `preference_code` | Yes | Registered preference key |
| `surface_code` | No | NULL means global |
| `preference_value` | Yes | JSON value capped at 8 KiB |
| `metadata` | Yes | JSON object |
| audit fields | Yes/optional pair | Standard UUID actors |

Required natural key:

`UNIQUE NULLS NOT DISTINCT (tenant_id, principal_id, preference_code, surface_code)`

Do not store saved views, dashboard layouts, recents, navigation history,
search history, documents, or large arbitrary payloads here.

RLS is self CRUD plus privileged admin access.

## 5. `master.principal_notification_preference`

Purpose: principal-specific override of notification routing defaults.

### Final fields

| Field | Required | Decision |
|---|---:|---|
| `id` | Yes | UUIDv7 primary key |
| `tenant_id` | Yes | Tenant scope |
| `principal_id` | Yes | Local principal FK |
| `event_code` | Yes | Registered notification event |
| `channel` | Yes | Controlled `in_app`, `email`, `sms`, `push`, `webhook`, or `whatsapp` |
| `is_enabled` | No | NULL means inherit the routing default |
| `frequency_code` | No | NULL means immediate/default |
| `metadata` | Yes | JSON object |
| `status` | Yes | `active` or `deprecated` |
| `is_active` | Generated | Derived from status |
| status audit | No | Trigger maintained |
| row audit | Yes/optional pair | Standard UUID actors |

### Remove

- `plane_key` — the plane-local database already identifies the plane

Required natural key:

`UNIQUE (tenant_id, principal_id, event_code, channel)`

This table must ENABLE and FORCE RLS. The principal receives self read/write;
the notification service receives scoped read; ordinary tenant-directory
access receives none.

Notification delivery addresses resolve through `master.contact_link`, not
fields on this preference table.

## 6. `principal_identity_binding`

Final decision: retain `master.principal_identity_binding` in Athyper, Neon,
and Mesh. It is the canonical mapping between a tenant-local application
principal and an external IAM identity. Keycloak remains authoritative for
credentials and authentication state; this table stores correlation and the
minimum operational synchronization state needed by the platform.

### Final fields

| Field | Required | Decision |
|---|---:|---|
| `id` | Yes | UUIDv7 primary key |
| `tenant_id` | Yes | Plane-local tenant and RLS scope |
| `principal_id` | Yes | Composite FK to the tenant-local principal |
| `provider_code` | Yes | Controlled provider code; initially `keycloak` |
| `realm_key` | Yes | Stable realm/authority namespace |
| `subject_id` | Yes | Opaque JWT/OIDC subject identifier |
| `issuer` | No | Normalized token issuer used for validation/routing |
| `audience` | No | Expected token audience where binding-specific |
| `username` | No | Restricted discovery/display cache; not authoritative |
| `service_client_id` | No | Service-account client correlation |
| `is_primary` | Yes | Preferred binding when a principal has several |
| `status` | Yes | `active`, `disabled`, or `revoked` |
| `last_verified_at` | No | Last successful identity verification |
| `synced_at` | No | Last successful provider reconciliation |
| `sync_status` | Yes | `pending`, `synced`, `drift`, `error`, or `disabled` |
| `sync_error_message` | No | Restricted last error; clear after success |
| `sync_retry_count` | Yes | Non-negative retry counter |
| `provider_attributes` | Yes | Restricted JSON object for required provider extensions |
| `metadata` | Yes | Non-authoritative JSON object |
| status audit | No | Trigger maintained |
| row audit | Yes/optional pair | Standard UUID actors |

Keycloak-only shadow data such as MFA state, required actions, federation
details, authentication email, enabled/locked state, and full IdP snapshots
must not be part of the new common contract. Query Keycloak when that live
state is required. Legacy columns may remain temporarily until their runtime
consumers are rewired.

### Required integrity

- PK `(id)`
- unique `(tenant_id, id)`
- unique `(tenant_id, provider_code, realm_key, subject_id)`
- unique `(tenant_id, principal_id, provider_code, realm_key, subject_id)`
- at most one active primary binding per `(tenant_id, principal_id)`
- composite principal FK `(tenant_id, principal_id)` with `ON DELETE RESTRICT`
- normalized non-empty provider, realm, and subject values
- `sync_retry_count >= 0`
- JSON-object checks
- immutable identity coordinates: `tenant_id`, `provider_code`, `realm_key`,
  and `subject_id`

Binding reassignment must be an explicit privileged operation with audit
evidence; ordinary updates cannot move a subject between principals. Revoked
bindings are retained for security history and are never used for login
resolution.

### Resolution and security

After token signature, issuer, audience, and expiry validation, resolve the
actor by:

`(tenant_id, provider_code, realm_key, subject_id) -> principal_id`

Only an active binding may resolve an active principal. JIT provisioning must
create the principal and binding atomically and must never silently reassign an
existing subject.

ENABLE and FORCE RLS. Direct reads/writes are limited to the subject where
safe, IAM synchronization/provisioning services, support authority, and
administrators. Tenant directory projections must exclude subject IDs,
service-client IDs, provider attributes, and synchronization errors.

Service-account resolution must move from
`principal_profile.keycloak_service_client_id` to this table's
`service_client_id`. Provider fields currently duplicated in
`principal_profile` must be retired only after all consumers use the binding
table.

## 7. Parked `master.principal_relationship`

`master.principal_relationship` is not part of the Athyper, Neon, or Mesh
foundation. Its proposed values combine incompatible concepts:

- duplicate detection is an identity-resolution case;
- `same_human` is symmetric verified identity evidence;
- merge is a directional principal-lifecycle operation;
- transfer is a directional, resource-item operation.

No authorization, delegation, support-session, merge, or transfer table may
depend on this parked table. A later approved capability must model identity
resolution, merge execution, and transfer execution separately, including
their own lifecycle and item-level evidence.

Atlas support sessions instead reference both real principal endpoints and the
exact target-tenant support membership used by the shadow principal. This is
authorization/session evidence, not a principal relationship.

## Implementation status

1. The six common desired-state tables and sealed domains are present in all
   three plane manifests.
2. Constraints, indexes, triggers, forced RLS, grants, and the safe principal
   directory projection are implemented.
3. Runtime token/JIT/session, service-account, Keycloak sync, IAM admin, MFA,
   logout, discovery, authorization, finance, documents, and Mesh consumers
   still require compatibility rewiring to the finalized binding contract.
4. Atlas support-shadow runtime must be rewired from the legacy relationship
   lookup to the target principal and target support membership contract.
5. Migrate data and only then retire duplicate IAM fields from legacy
   `principal_profile` and obsolete legacy binding columns.
