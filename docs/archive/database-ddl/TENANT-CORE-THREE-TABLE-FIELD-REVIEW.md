# Tenant core: three-table field review

Date: 2026-07-30

Status: confirmed desired-state contract. Implemented in the Athyper, Neon,
and Mesh plane-local `master` DDL slices. Runtime rewiring remains separate.

## Locked boundary

The plane-local tenant master contains only:

```text
master.tenant
├── master.tenant_profile        1:1
└── master.tenant_relationship   from_tenant_id / to_tenant_id
```

Excluded from `master`:

- identity-provider and identity-domain configuration: Keycloak Organizations
- parameter definitions and values: `control`
- risk-source configuration: Neon `governance`
- subscription-plan catalogue: plane-local `control.subscription_plan`
- authorization, membership, grants, and delegation: `authz`

The same three-table shape can be installed in Athyper, Neon, and Mesh.
`master.tenant_relationship` must not replace Mesh
`mesh.network_relationship`; the latter owns buyer, supplier, sourcing, and
trading-network relationships.

## 1. `master.tenant`

### Confirmed fields

| Field | Null/default | Decision and authority |
|---|---|---|
| `id uuid` | PK, UUIDv7 | Keep. Immutable tenant identifier and RLS root. The Keycloak organization reconciler already uses this UUID as the Keycloak organization alias, so no duplicate `keycloak_organization_id` is required. |
| `code text` | required | Keep. Immutable normalized tenant slug used in `X-Org` resolution. |
| `name text` | required | Keep. Canonical tenant/organization name. It is not a legal-entity name. |
| `display_name text` | required | Keep. User-facing label; may differ from canonical name. |
| `realm_key text` | required | Keep. Actively used with `code` by authentication, tenant resolution, identity binding, and three-plane reconciliation. |
| `subscription_plan_id uuid` | nullable while provisioning | Replace legacy `subscription text`. FK to plane-local `control.subscription_plan(id)`. |
| `metadata jsonb` | `{}` | Keep as non-contract extension metadata; require a JSON object. Do not place secrets, permissions, or authoritative settings here. |
| `status text` | `provisioning` | Keep. Controlled lifecycle. |
| `is_active boolean` | generated | Keep. Generated only from `status = 'active'`; never directly writable. |
| `status_changed_at timestamptz` | trigger managed | Keep. Set on every status transition. |
| `status_changed_by uuid` | trigger/workflow managed | Keep. Deferred FK to `master.principal(id)` after bootstrap. |
| `created_at timestamptz` | `now()` | Keep. |
| `created_by uuid` | required | Keep. Deferred FK to `master.principal(id)` after bootstrap. |
| `updated_at timestamptz` | nullable | Keep. Trigger managed. |
| `updated_by uuid` | nullable | Keep. Must be paired with `updated_at`; deferred principal FK. |

### Remove

| Current field | Reason |
|---|---|
| `region` | Ambiguous and unused for authoritative routing. Country belongs in `tenant_profile`; hosting/data-residency placement belongs in `ops` or `runtime_meta`. |
| `subscription` | Text duplicates the subscription catalogue and currently depends on the removed shared plan. Replace with `subscription_plan_id`. |
| `tenant_type` | No production runtime or authorization dependency. Customer/partner are contextual roles and may overlap; system/platform-owner tenants are identified by immutable seeded IDs. |

Do not add `keycloak_organization_id` or `keycloak_organization_alias`.
Current reconciliation intentionally maps:

```text
Keycloak organization alias = master.tenant.id
```

The Keycloak-native organization ID may remain external provider state.

Tenant classification is derived from authoritative context:

- system and platform-owner tenants: immutable seeded tenant IDs
- commercial subscription: `subscription_plan_id`
- customer/partner/support relationships: `tenant_relationship`
- Mesh buyer/supplier participation: network-account roles
- access: membership and grants in `authz`

This avoids a tenant simultaneously needing several contradictory type values.

### Required integrity

- primary key: `(id)`
- unique: `(realm_key, code)`
- unique optional relationship: `(subscription_plan_id)` is **not** required;
  many tenants may use one plan
- code format: `^[a-z][a-z0-9_-]{1,62}$`
- non-empty trimmed `name` and `display_name`
- normalized `realm_key`
- metadata must be a JSON object
- audit-pair check: `(updated_at IS NULL) = (updated_by IS NULL)`
- status transitions:
  `provisioning -> active|terminated`,
  `active -> suspended|terminated`,
  `suspended -> active|terminated`
- `id`, `code`, and `realm_key` become immutable after creation
- no routine delete; tenant termination is a lifecycle transition

### Required indexes

- unique btree `(realm_key, code)`
- partial btree `(code) WHERE status = 'active'`
- btree `(subscription_plan_id) WHERE subscription_plan_id IS NOT NULL`

### Access

- tenant/application session: read its own row
- platform provisioning service/admin: create and controlled update
- subscription assignment: controlled commerce service only
- no tenant self-delete and no direct application delete
- enable and force RLS

## 2. `master.tenant_profile`

This is the tenant-wide regional and presentation-default extension. A NULL
value means inherit the plane/platform default.

### Confirmed common fields

| Field | Null/default | Decision and authority |
|---|---|---|
| `id uuid` | PK, UUIDv7 | Keep for the common entity/audit convention. |
| `tenant_id uuid` | required, unique | Keep. FK to `master.tenant(id)` and enforce one profile per tenant. |
| `country_code char(2)` | nullable | Keep. Default operating/presentation country; FK to `shared.country`. It is not tax or legal-entity authority. |
| `locale_code text` | nullable | Keep. Formatting locale; FK to `shared.locale`. |
| `timezone_code text` | nullable | Keep. Tenant-wide default IANA timezone; FK to `shared.timezone`. |
| `language_code text` | nullable | Keep. Default UI/document language; FK to `shared.language`. |
| `date_format text` | nullable | Keep. Tenant display default, overridable by principal UI profile. |
| `number_format text` | nullable | Keep. Tenant display default, overridable by principal UI profile. |
| `week_start smallint` | nullable | Keep. Presentation/calendar default, 0 through 6. |
| `weekend_days smallint[]` | nullable | Keep. Tenant calendar default only; formal working calendars remain in holiday/work-calendar tables. Normalize to sorted unique values 0 through 6. |
| `metadata jsonb` | `{}` | Keep for non-authoritative extension metadata; require a JSON object. |
| `created_at timestamptz` | `now()` | Keep. |
| `created_by uuid` | required | Keep. Deferred FK to `master.principal(id)`. |
| `updated_at timestamptz` | nullable | Keep. Trigger managed. |
| `updated_by uuid` | nullable | Keep. Audit-pair check and deferred principal FK. |

### Remove from the common profile

| Current field | Destination/reason |
|---|---|
| `currency_code` | Remove. Neon company code/legal entity owns functional or transaction currency. It has no common Athyper/Mesh meaning. |
| `reporting_currency_code` | Remove. Neon ledger/book/reporting configuration owns reporting currency. |
| `fiscal_year_start_month` | Remove. Neon fiscal-calendar and ledger-book configuration owns fiscal periods. |
| `default_brand_profile_id` | Remove from common tenant profile. Document-rendering capability should own its default binding. |
| `default_letterhead_id` | Remove from common tenant profile. Document-rendering capability should own its default binding. |

The current runtime uses these profile fields for the UI resolution cascade:

```text
platform default
  -> tenant_profile
  -> principal_ui_profile
  -> principal preference
```

The confirmed common profile preserves every field required by that cascade.
The removed finance and branding fields are not authoritative runtime inputs.

### Required integrity

- primary key: `(id)`
- unique: `(tenant_id)`
- tenant FK: `ON DELETE RESTRICT` in desired state
- reference FKs for country, locale, timezone, and language
- `week_start` between 0 and 6
- `weekend_days` contains unique values between 0 and 6
- metadata must be a JSON object
- audit-pair check

### Required indexes

The unique `(tenant_id)` index is sufficient for the main access path. Do not
add country, locale, or timezone indexes until a verified administrative query
requires them.

### Access

- tenant session: read its own profile
- authorized tenant-administration service: insert/update its tenant profile
- platform admin: operational read/write
- no application delete; the profile follows the tenant lifecycle
- issue both `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`

The legacy DDL currently has `FORCE` without `ENABLE`; that must be corrected.

## 3. `master.tenant_relationship`

This table records a directed relationship between two existing tenants.
It is not an invitation store, network trading relationship, membership,
permission, grant, or delegation.

### Confirmed fields

| Field | Null/default | Decision and authority |
|---|---|---|
| `id uuid` | PK, UUIDv7 | Keep. Immutable relationship identifier. |
| `from_tenant_id uuid` | required | Keep. Source/provider/initiating side, defined by `relationship_type`. |
| `to_tenant_id uuid` | required | Keep. Target/consumer side, defined by `relationship_type`. |
| `relationship_type text` | required | Keep. Plane-local controlled meaning. Direction is already expressed by from/to. |
| `activated_at timestamptz` | nullable until first activation | Rename from `accepted_at`. Records when the relationship was first approved/activated without assuming every relationship uses an invitation flow. |
| `effective_from timestamptz` | nullable until activation | Keep. Set when the relationship becomes effective; do not default pending rows to effective now. |
| `effective_until timestamptz` | nullable | Keep. Exclusive end of validity. |
| `metadata jsonb` | `{}` | Keep for non-authoritative descriptive metadata only. Never store permissions or secrets. |
| `status text` | `pending` | Keep. Recommended values: `pending`, `active`, `suspended`, `revoked`. |
| `status_changed_at timestamptz` | trigger managed | Keep. |
| `status_changed_by uuid` | workflow managed | Keep. Deferred FK to `master.principal(id)`. |
| `created_at timestamptz` | `now()` | Keep. |
| `created_by uuid` | required | Keep. Deferred FK to `master.principal(id)`. |
| `updated_at timestamptz` | nullable | Keep. Trigger managed. |
| `updated_by uuid` | nullable | Keep. Audit-pair check and deferred principal FK. |

### Remove

| Current field | Reason |
|---|---|
| `relationship_direction` | Redundant and contradictory: `from_tenant_id` and `to_tenant_id` already encode direction. |
| `scopes` | Relationship metadata must not be interpreted as authorization. Permissions belong in `authz`. |
| `external_ref` | The existing generic `master.external_reference` capability owns external correlations. |
| `invited_email` | Invitation/contact workflow data does not belong on an established tenant-to-tenant relationship. |
| `invited_at` | Invitation workflow/event owns this timestamp. |
| `accepted_at` | Rename to neutral `activated_at`; support and platform relationships may be activated without an invitation acceptance. |
| `is_active` | Remove. `status = active` alone is insufficient because effective dates also determine usability; a generated flag would be misleading. |

### Relationship types

Keep only types that describe platform-level tenant relationships, for example:

- `implementation_partner`
- `support_provider`
- `platform_support`
- `affiliate`
- `intercompany`

Remove Mesh trading concepts such as `customer_supplier` and
`customer_invited_supplier`, and the current Mesh-specific
`customer_partner`, from this lookup. They belong to
`mesh.network_relationship`, `connection_request`, and `network_invitation`.

### Required integrity

- primary key: `(id)`
- unique current anchor: `(from_tenant_id, to_tenant_id, relationship_type)`
- `from_tenant_id <> to_tenant_id`
- both tenant FKs use `ON DELETE RESTRICT`, not cascade
- `effective_until > effective_from` when both are present
- active status requires non-null `activated_at` and `effective_from`
- metadata must be a JSON object
- audit-pair check
- guarded status transitions; revoke rather than delete

### Required indexes

- btree `(from_tenant_id, relationship_type, status)`
- btree `(to_tenant_id, relationship_type, status)`
- partial active lookup on
  `(from_tenant_id, to_tenant_id, relationship_type)`
  where `status = 'active'`

### Access

- either endpoint tenant: read
- approved platform relationship workflow/service: create and transition
- endpoint tenants must not directly insert, update, or delete
- no delete policy; revoke the relationship
- enable and force RLS

The legacy policies currently allow either endpoint to unilaterally insert,
update, or delete a cross-tenant relationship. That is a critical defect.

## Cross-table rules

1. `tenant_profile.tenant_id` must identify exactly one existing tenant.
2. Relationship endpoints must identify two distinct existing tenants.
3. A relationship never grants access. `authz` must independently grant and
   evaluate access.
4. Tenant and relationship termination/revocation never cascade-delete
   business history.
5. Actor foreign keys are installed in deferred constraints after the system
   tenant and system principal bootstrap cycle.
6. All three tables require consistent updated-at, status-changed, JSON-object,
   immutability, and audit-pair guards.

## Desired DDL dependency order

1. `control.subscription_plan`
2. `master.tenant`
3. bootstrap system tenant and system principal
4. deferred tenant actor foreign keys
5. `master.tenant_profile`
6. `master.tenant_relationship`
7. indexes
8. functions and guarded mutation APIs
9. triggers
10. RLS
11. least-privilege grants

## Runtime changes required when implementing

- Replace every `master.tenant.subscription` reader/writer with
  `subscription_plan_id` joined to plane-local `control.subscription_plan`.
- Remove the legacy subscription lookup trigger and lookup-domain binding.
- Remove `tenant_type`, its lookup domain, validation trigger, index, metadata
  field contract, and seed-script values.
- Remove `region` from tenant APIs and UI; use profile `country_code` for the
  regional display use case.
- Remove finance and branding fields from tenant-profile API contracts, UI,
  and seeds.
- Remove direction, scopes, invitation, external-ref, and generated-active
  handling from tenant-relationship metadata.
- Change the support relationship query to require:
  `status = 'active'`, `effective_from <= now()`, and
  `(effective_until IS NULL OR effective_until > now())`.
- Correct the current type mismatch: runtime queries `implementation`, while
  the seeded lookup code is `implementation_partner`.
- Remove the relationship-direction lookup domain and Mesh trading types from
  the tenant-relationship lookup.
