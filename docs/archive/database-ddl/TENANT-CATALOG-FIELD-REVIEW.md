# Tenant catalogue and cross-schema dependency review

Date: 2026-07-30

Status: recommendation only; no desired-state DDL or runtime code changed.

> Superseded tenant-core decision: the retained master aggregate is now
> limited to `master.tenant`, `master.tenant_profile`, and
> `master.tenant_relationship`. See
> `TENANT-CORE-THREE-TABLE-FIELD-REVIEW.md` for the confirmed field-level
> contract. The wider inventory below remains useful as legacy dependency
> analysis.

## Executive decision

Treat `master.tenant` as the aggregate root for Athyper and Neon.

Do not copy `master.tenant` into Mesh yet. Mesh currently uses
`mesh.network_account` as its identity, membership, and RLS boundary. Adding a
second root without a locked 1:1 or 1:N mapping would create conflicting tenant
authority.

The initial tenant aggregate is:

- `master.tenant`
- `master.tenant_profile`
- `master.tenant_identity_provider`
- `master.tenant_identity_domain`
- `master.tenant_parameter_definition`
- `master.tenant_parameter_value`

Capability-specific:

- `master.tenant_relationship` — Neon and Athyper; not Mesh
- `control.risk_source_config` — Neon risk-control capability; not common master

`shared` contains only tenant-context helper functions. It must not contain
mutable tenant rows.

## Repository-wide inventory

The legacy DDL contains:

- 657 parsed physical tables/partitions
- 490 tables with a tenant-related column
- 292 direct foreign keys to `master.tenant`
- 12 physical tables whose names contain `tenant`

### Tenant-named tables

| Current table | Disposition |
|---|---|
| `master.tenant` | Tenant aggregate root |
| `master.tenant_profile` | Tenant aggregate |
| `master.tenant_identity_provider` | Tenant aggregate |
| `master.tenant_identity_domain` | Tenant aggregate |
| `master.tenant_parameter_definition` | Tenant aggregate, optional custom-parameter capability |
| `master.tenant_parameter_value` | Tenant aggregate |
| `master.tenant_relationship` | Neon/Athyper relationship capability |
| `master.tenant_risk_source_config` | Replaced by Neon `control.risk_source_config` |
| `control.atlas_tenant_provider_credential` | Athyper Atlas control; not tenant master |
| `control.atlas_tenant_provider_credential_epoch` | Athyper Atlas credential rotation state |
| `control.blueprint_tenant_application` | Neon provisioning/application receipt |
| `event.authorization_tenant_epoch_v2` | Authorization cache epoch; remains in `event` |

### Tenant-column tables by schema

| Schema | Tables carrying tenant-related columns |
|---|---:|
| `master` | 186 |
| `control` | 114 |
| `document` | 95 |
| `log` | 27 |
| `event` | 23 |
| `ledger` | 16 |
| `governance` | 16 |
| `snapshot` | 8 |
| `aggregate` | 2 |
| `mesh` | 2 legacy `tenant_code` event projections |
| `mesh_log` | 1 legacy `tenant_code` audit projection |

These are predominantly tenant-scoped business/runtime tables, not members of
the tenant aggregate.

### Direct `master.tenant` foreign keys by schema

| Schema | Direct FKs |
|---|---:|
| `master` | 119 |
| `control` | 77 |
| `log` | 41 |
| `event` | 20 |
| `document` | 17 |
| `governance` | 13 |
| `snapshot` | 5 |

The root currently has a very large cascade surface. Tenant termination must be
a status transition, never a routine `DELETE`. Physical purge needs a separate
guarded operation and retention review.

### Tenant context infrastructure

Keep these reusable Common functions:

- `shared.current_tenant_id()`
- `shared.current_tenant_id_soft()`

They read the trusted `app.current_tenant_id` session setting and underpin RLS
throughout Neon. Equivalent Mesh policies currently use network-account
context, not this tenant context.

## 1. `master.tenant`

| Field | Decision | Review |
|---|---|---|
| `id` | Keep | UUIDv7 aggregate identifier |
| `code` | Keep/tighten | Immutable normalized tenant code |
| `name` | Keep | Canonical organisation/tenant name |
| `display_name` | Keep | User-facing name; non-empty |
| `realm_key` | Keep | Actively used by authentication and tenant discovery |
| `tenant_type` | Keep | Controlled classification |
| `region` | Clarify/rename | Use `data_region_code` if it means hosting/residency; country/locale belongs in profile |
| `subscription` | Replace | Obsolete text code referencing the former shared plan |
| `metadata` | Keep/tighten | Require JSON object |
| `status` | Keep | provisioning, active, suspended, terminated |
| `is_active` | Keep | Generated from active status |
| `status_changed_at` | Keep | Trigger maintained |
| `status_changed_by` | Keep | UUID actor FK after bootstrap |
| `created_at` | Keep | Required |
| `created_by` | Keep | UUID actor; deferred FK due tenant/principal bootstrap cycle |
| `updated_at` | Keep | Trigger maintained |
| `updated_by` | Keep | UUID actor; audit-pair consistency |

Replace:

```text
subscription text
```

with:

```text
subscription_plan_id uuid
```

referencing the plane-local `control.subscription_plan(id)`. Do not reintroduce
`shared.subscription_plan`.

Runtime impact:

- Commerce routes currently join `shared.subscription_plan.code` to
  `master.tenant.subscription`.
- Tenant settings APIs and UI expose the text subscription.
- These readers/writers must move to
  `control.subscription_plan` through `subscription_plan_id`.

Required protections:

- immutable `id` and `code`
- unique code in the applicable realm/plane
- metadata JSON-object check
- explicit status check plus guarded transition function
- no application-role delete policy
- administrative provisioning writes only

## 2. `master.tenant_identity_provider`

| Field | Decision | Review |
|---|---|---|
| `id` | Keep | UUIDv7 primary key |
| `tenant_id` | Keep | Required tenant FK |
| `keycloak_alias` | Rename later | Prefer neutral `provider_alias`; retain compatibility until services change |
| `realm_key` | Keep | Identity realm used by discovery and context resolution |
| `protocol` | Keep | saml, oidc, kerberos |
| `provider_type` | Keep | Controlled provider family |
| `display_name` | Keep | Authentication-method label |
| `configuration_ref` | Keep | Secret-manager/Keycloak reference only; never plaintext secret |
| `feature_gate` | Remove from common contract | Deployment capability, not tenant identity master data |
| `login_mode` | Keep | optional, preferred, exclusive |
| `first_login_policy` | Keep | invite-only, JIT, or existing users only |
| `mfa_trust_policy` | Keep | Tenant trust decision |
| `allowed_planes` | Remove in plane-local design | Local database already identifies the plane |
| `enabled` | Keep | Operational activation flag |
| `configuration_version` | Keep/tighten | Require positive version |
| `activated_at` | Keep/tighten | Required when enabled |
| `metadata` | Keep/tighten | Require JSON object |
| audit fields | Keep | UUID actors and audit-pair consistency |

If provider configuration remains centralized in Athyper rather than local to
each plane, `allowed_planes` may remain there only. It must use the current
plane name `athyper`, not legacy `admin`.

Current hard-coded provider/type combinations belong in reviewed domains or
validation functions, not an ever-growing monolithic CHECK.

Critical defect: the current table has application SELECT grants but no RLS
enablement or policies. Provider metadata must be tenant-isolated, with writes
restricted to tenant IAM administrators and platform IAM services.

## 3. `master.tenant_identity_domain`

| Field | Decision | Review |
|---|---|---|
| `id` | Keep | UUIDv7 primary key |
| `tenant_id` | Keep | Required tenant FK |
| `provider_id` | Keep | Composite tenant/provider FK |
| `domain` | Keep | Lower-case normalized DNS domain |
| `verification_status` | Keep | pending, verified, revoked |
| `verification_method` | Keep | Required when verified |
| `verified_at` | Keep | Required when verified |
| `enabled` | Keep/tighten | Can be true only when verified |
| audit fields | Keep | UUID actors and audit-pair consistency |

Important uniqueness correction:

The existing unique key `(tenant_id, domain)` permits two tenants to claim the
same verified domain. Add global uniqueness for enabled verified domains:

```text
UNIQUE lower(domain)
WHERE verification_status = 'verified' AND enabled = true
```

A domain match selects an authentication route; it never creates tenant
membership or authorization.

Critical defect: this table also has grants but no RLS. Discovery needs a
security-definer/service path that reveals only safe routing information;
ordinary tenants must not enumerate other tenants' domains.

## 4. `master.tenant_parameter_definition`

This table is needed only when tenants are allowed to author custom parameter
definitions. Product-owned definitions remain in
`control.parameter_definition`.

| Field family | Decision | Review |
|---|---|---|
| `id`, `tenant_id` | Keep | Tenant-owned definition identity |
| `code`, `namespace` | Keep | Normalized namespaced key |
| `display_name`, `description` | Keep | Human-facing catalogue |
| `data_type`, `unit` | Keep | Value contract |
| `default_value` | Keep | Required tenant-defined default |
| `min_value`, `max_value` | Keep | Optional typed bounds |
| `allowed_values` | Keep | JSON array when present |
| `runtime_reload` | Keep | Runtime application behavior |
| `cache_ttl_seconds` | Keep | 0 through 86400 |
| `is_security_sensitive` | Keep | Controls exposure/audit |
| `is_runtime_reloadable` | Keep | Operational capability |
| `is_enabled` | Keep | Operational switch |
| `sort_order` | Keep | Display ordering |
| `metadata` | Keep | JSON object |
| `status` | Keep | active/deprecated catalogue lifecycle |
| audit fields | Keep | UUID actors and audit-pair consistency |

Prevent collisions with product-owned parameter codes. At minimum, reserve a
tenant namespace such as `custom.<tenant-code>.*` and enforce that the same
code cannot exist in `control.parameter_definition`.

Critical defect: grants exist but RLS and policies do not.

## 5. `master.tenant_parameter_value`

| Field | Decision | Review |
|---|---|---|
| `id` | Keep | UUIDv7 primary key |
| `tenant_id` | Keep | Required tenant FK |
| `parameter_code` | Keep/repair resolution | Must resolve unambiguously to one product or tenant definition |
| `override_enabled` | Keep | False means use product/default value |
| `value` | Keep/tighten | Require non-null when override is enabled |
| `reason` | Keep | Required by service policy for sensitive changes |
| `effective_from` | Keep | Scheduled activation |
| `effective_to` | Keep | Optional expiration |
| `metadata` | Keep | JSON object |
| `status` | Keep | active/deprecated |
| audit fields | Keep | UUID actors and audit-pair consistency |

The current resolver intentionally unions product definitions and tenant-owned
definitions by code. Without collision prevention, one code can resolve twice.
Lock namespace/collision rules before moving this table.

Critical defect: grants exist but RLS and policies do not. Values may be
security-sensitive, so tenant-wide reads should pass through the parameter
resolver rather than expose raw JSON indiscriminately.

## 6. `master.tenant_profile`

### Common presentation/calendar fields

| Field | Decision | Review |
|---|---|---|
| `id` | Keep | UUIDv7 primary key |
| `tenant_id` | Keep | Required 1:1 tenant FK |
| `country_code` | Keep | Shared country FK |
| `locale_code` | Keep | Shared locale FK |
| `timezone_code` | Keep | Shared timezone FK |
| `language_code` | Keep | Shared language FK |
| `date_format` | Keep | Tenant presentation default |
| `number_format` | Keep | Tenant presentation default |
| `week_start` | Keep | 0 through 6 |
| `weekend_days` | Keep | Sorted unique day array |
| `metadata` | Keep | Require JSON object |
| audit fields | Keep | UUID actors and audit-pair consistency |

### Neon finance extensions

- `currency_code`
- `reporting_currency_code`
- `fiscal_year_start_month`

Review these against company-code, legal-entity, and fiscal-calendar authority.
Do not copy them into Athyper. If retained in Neon, treat them only as
onboarding fallbacks, not accounting authority.

### Optional document-branding extensions

- `default_brand_profile_id`
- `default_letterhead_id`

Keep only in a plane that installs the corresponding document-rendering
capability. Do not make them part of the minimum tenant contract.

Critical defect: the current DDL applies FORCE RLS to `tenant_profile` but never
enables RLS. Desired-state DDL must issue ENABLE and FORCE RLS.

## 7. `master.tenant_relationship`

Keep for Neon and Athyper support/implementation/customer relationships. Do not
copy into Mesh; `mesh.network_relationship` owns business-network relations.

| Field | Decision | Review |
|---|---|---|
| `id` | Keep | UUIDv7 primary key |
| `from_tenant_id`, `to_tenant_id` | Keep | Directed endpoints |
| `relationship_type` | Keep | Controlled relationship meaning |
| `relationship_direction` | Remove | Redundant with explicit from/to endpoints |
| `scopes` | Remove or rename | Must not be interpreted as authorization grants |
| `external_ref` | Keep | Optional external correlation |
| `invited_email` | Keep | Pending invitation destination |
| `invited_at`, `accepted_at` | Keep/tighten | Enforce workflow consistency |
| `effective_from`, `effective_until` | Keep | Validity window |
| `metadata` | Keep | JSON object |
| lifecycle/audit fields | Keep | UUID actors and guarded status transitions |

Authorization remains in `authz`; the relationship alone grants nothing.

Security correction:

Current RLS lets either endpoint tenant insert, update, or delete a
cross-tenant relationship. That permits unilateral assertion. Allow endpoint
tenants to read, but require an approved service/admin workflow for mutation.
Archive/revoke relationships instead of deleting them.

## 8. `tenant_risk_source_config`

This is not part of the universal tenant core.

Final destination:

```text
control.risk_source_config
```

for Neon. Provider transport and credentials belong to the linked
`control.connector_instance`; Mesh can adopt a separate account-risk projection
when its governance capability is reviewed.

| Field | Decision | Review |
|---|---|---|
| `id`, `tenant_id`, `source_code` | Keep | Tenant/source identity |
| `is_enabled` | Generated | Derived from lifecycle status |
| `custom_trust_level` | Keep | Range 1 through 5 |
| `api_config` | Replaced | Risk-only settings remain; transport moves to connector configuration |
| `status` | Keep | active/disabled |
| audit fields | Keep | UUID actors and audit-pair consistency |

Use a non-secret `configuration_ref` to a secret manager/provider configuration
if external credentials are required.

## Other tenant-related objects across schemas

### Control

- `control.atlas_tenant_provider_credential`
- `control.atlas_tenant_provider_credential_epoch`
- `control.blueprint_tenant_application`
- `control.subscription_plan`
- 77 additional direct tenant FK dependencies for tenant-specific policies,
  entity metadata, workflow, tax, banking, and accounting configuration

### Event

- `event.authorization_tenant_epoch_v2`
- tenant-scoped outbox, notification, orchestration, work-item, connector, and
  runtime event tables

### Document

- 17 direct root dependencies plus many indirect tenant-scoped transactional
  tables

### Governance, ledger, aggregate, snapshot, and log

These schemas consume `tenant_id` as an isolation/partition key. They do not
own tenant identity or lifecycle.

### Mesh

Mesh uses:

- `mesh.network_account`
- `mesh.account_grant`/membership authority
- account-scoped RLS
- legacy `tenant_code` only in some event/audit projections

Do not treat `network_account` and `master.tenant` as synonyms without defining
the mapping and source of truth.

## Required DDL corrections

1. Replace `tenant.subscription` with
   `tenant.subscription_plan_id -> control.subscription_plan(id)`.
2. Enable and force RLS on all eight retained tenant tables.
3. Add missing tenant/self/service/admin policies for identity and parameter
   tables.
4. Add `updated_at` and lifecycle triggers consistently.
5. Add JSON-object and audit-pair checks consistently.
6. Prevent verified identity-domain collisions across tenants.
7. Prevent product/tenant parameter-code collisions.
8. Remove application delete authority from tenant and relationship roots.
9. Replace risk-source secret JSON with a non-secret configuration reference.
10. Review every root `ON DELETE CASCADE`; tenant termination is not deletion.

## Proposed DDL order

1. `control.subscription_plan`
2. `master.tenant`
3. `master.tenant_profile`
4. `master.tenant_identity_provider`
5. `master.tenant_identity_domain`
6. `master.tenant_parameter_definition`
7. `master.tenant_parameter_value`
8. Neon/Athyper `master.tenant_relationship`
9. Neon governance risk-source configuration
10. principals and tenant membership/authorization

Actor FKs that create a tenant/principal bootstrap cycle belong in deferred
constraints after the system tenant and system principal are seeded.

## Decisions required before implementation

1. Does Mesh remain network-account-rooted, or must every network account map to
   an application tenant?
2. Are tenant identity providers plane-local or centrally managed in Athyper?
3. Are tenant-authored custom parameter definitions a supported product
   capability?
4. Should Neon finance/profile fields remain as onboarding fallbacks or be
   removed in favor of company/fiscal-calendar authority?
5. Does a tenant have exactly one current subscription plan, allowing a direct
   FK, or is a separate effective-dated subscription contract required later?
