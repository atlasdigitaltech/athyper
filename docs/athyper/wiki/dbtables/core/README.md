# Core Schema (`core`)

> Athyper Platform -- PostgreSQL 16+
>
> The `core` schema is the foundational layer of the Athyper database. It contains all tables related to multi-tenancy, background job processing, address management, workspace organization, system configuration, identity and access management (IAM), and the permissions/authorization model.

---

## Table of Contents

- [Foundation](#foundation)
  - [core.tenant](#coretenant)
  - [core.outbox](#coreoutbox)
  - [core.job](#corejob)
  - [core.job\_run](#corejob_run)
- [Address System](#address-system)
  - [core.address](#coreaddress)
  - [core.contact\_point](#corecontact_point)
  - [core.contact\_phone](#corecontact_phone)
  - [core.address\_link](#coreaddress_link)
- [Workspace](#workspace)
  - [core.workspace](#coreworkspace)
  - [core.workspace\_feature](#coreworkspace_feature)
  - [core.principal\_workspace\_access](#coreprincipal_workspace_access)
  - [core.workspace\_usage\_metric](#coreworkspace_usage_metric)
  - [core.workspace\_feature\_view (VIEW)](#coreworkspace_feature_view-view)
- [Configuration](#configuration)
  - [core.tenant\_locale\_policy](#coretenant_locale_policy)
  - [core.principal\_locale\_override](#coreprincipal_locale_override)
  - [core.entity\_tag](#coreentity_tag)
  - [core.system\_config](#coresystem_config)
  - [core.feature\_flag](#corefeature_flag)
- [IAM (Identity and Access Management)](#iam-identity-and-access-management)
  - [core.principal](#coreprincipal)
  - [core.idp\_identity](#coreidp_identity)
  - [core.principal\_profile](#coreprincipal_profile)
  - [core.tenant\_profile](#coretenant_profile)
  - [core.principal\_group](#coreprincipal_group)
  - [core.group\_member](#coregroup_member)
  - [core.role](#corerole)
  - [core.principal\_role](#coreprincipal_role)
  - [core.organizational\_unit](#coreorganizational_unit)
  - [core.principal\_ou](#coreprincipal_ou)
  - [core.entitlement](#coreentitlement)
- [Permissions](#permissions)
  - [core.operation\_category](#coreoperation_category)
  - [core.operation](#coreoperation)
  - [core.persona](#corepersona)
  - [core.persona\_capability](#corepersona_capability)
  - [core.module](#coremodule)
  - [core.tenant\_module\_subscription](#coretenant_module_subscription)

---

## Foundation

### core.tenant

**Functional Description**

The tenant table is the root of all multi-tenant data isolation in the platform. Every tenant represents a distinct organizational customer with its own subscription tier, geographic region, and IAM realm. Nearly every other table in the `core` schema (and beyond) holds a foreign key back to this table, making it the single source of truth for tenant identity.

**Technical Details**

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `code` | `text` | NOT NULL | -- | Unique short code for the tenant (e.g., `demomalaysia`). |
| `name` | `text` | NOT NULL | -- | Internal name. |
| `display_name` | `text` | NOT NULL | -- | User-friendly display name. |
| `realm_key` | `text` | NOT NULL | `'main'` | IAM realm key (links to Keycloak realm). |
| `status` | `text` | NOT NULL | `'active'` | Lifecycle status of the tenant. |
| `region` | `text` | YES | -- | Geographic region (e.g., `APAC`, `EU`). |
| `subscription` | `text` | NOT NULL | `'base'` | Subscription tier. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp. |
| `created_by` | `text` | NOT NULL | -- | Actor who created the row. |
| `updated_at` | `timestamptz` | YES | -- | Last update timestamp. |
| `updated_by` | `text` | YES | -- | Actor who last updated the row. |

**Primary Key:** `id`

**Foreign Keys:** None (root table).

**Constraints**

| Constraint | Type | Details |
|---|---|---|
| `tenant_status_chk` | CHECK | `status IN ('active', 'suspended', 'archived')` |
| `tenant_subscription_chk` | CHECK | `subscription IN ('base', 'professional', 'enterprise')` |
| `code` | UNIQUE | Globally unique tenant code. |

**Indexes**

| Index | Columns | Filter |
|---|---|---|
| `idx_tenant_realm_key` | `realm_key` | -- |
| `idx_tenant_status_active` | `status` | `WHERE status = 'active'` |

**Relationships**

- **Referenced by:** Almost every table in `core` via `tenant_id` foreign key. Key dependents include `core.outbox`, `core.job`, `core.job_run`, `core.address`, `core.contact_point`, `core.workspace_feature`, `core.principal`, `core.role`, `core.principal_group`, `core.entitlement`, `core.feature_flag`, `core.system_config`, `core.tenant_profile`, `core.tenant_locale_policy`, `core.tenant_module_subscription`, and many others.

---

### core.outbox

**Functional Description**

The outbox table implements the transactional outbox pattern for reliable asynchronous event processing. When a business operation needs to emit a domain event, it writes a row into this table within the same database transaction. A background poller picks up pending messages and dispatches them to downstream consumers, guaranteeing at-least-once delivery even if the application crashes after committing the transaction.

**Technical Details**

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `tenant_id` | `uuid` | NOT NULL | -- | FK to `core.tenant`. |
| `topic` | `text` | NOT NULL | -- | Event topic/channel name. |
| `event_key` | `text` | YES | -- | Optional deduplication or routing key. |
| `payload` | `jsonb` | NOT NULL | -- | Event payload. |
| `status` | `text` | NOT NULL | `'pending'` | Processing status. |
| `attempts` | `int` | NOT NULL | `0` | Number of delivery attempts so far. |
| `available_at` | `timestamptz` | NOT NULL | `now()` | Earliest time the message becomes eligible for pickup. |
| `locked_at` | `timestamptz` | YES | -- | Timestamp when a worker locked this message. |
| `locked_by` | `text` | YES | -- | Identifier of the worker that locked this message. |
| `last_error` | `text` | YES | -- | Most recent error message from a failed attempt. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp. |
| `created_by` | `text` | NOT NULL | -- | Actor who created the row. |

**Primary Key:** `id`

**Foreign Keys**

| Column | References | On Delete |
|---|---|---|
| `tenant_id` | `core.tenant(id)` | CASCADE |

**Constraints**

| Constraint | Type | Details |
|---|---|---|
| `outbox_status_chk` | CHECK | `status IN ('pending', 'processing', 'sent', 'failed', 'dead')` |

**Indexes**

| Index | Columns | Filter |
|---|---|---|
| `idx_outbox_pick` | `tenant_id, status, available_at` | -- |

**Relationships**

- **References:** `core.tenant`
- **Referenced by:** None.

---

### core.job

**Functional Description**

The job table stores scheduler and background job definitions scoped to each tenant. Each job has a schedule kind (cron expression, fixed interval, or manual trigger) and optional configuration. The runtime uses these definitions to decide when and how to create job runs.

**Technical Details**

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `tenant_id` | `uuid` | NOT NULL | -- | FK to `core.tenant`. |
| `code` | `text` | NOT NULL | -- | Unique job code within the tenant. |
| `name` | `text` | NOT NULL | -- | Human-readable job name. |
| `schedule_kind` | `text` | NOT NULL | -- | How the job is scheduled. |
| `schedule_expr` | `text` | YES | -- | Cron expression or interval string (when applicable). |
| `is_active` | `boolean` | NOT NULL | `true` | Whether the job is enabled. |
| `config` | `jsonb` | YES | -- | Arbitrary configuration payload for the job handler. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp. |
| `created_by` | `text` | NOT NULL | -- | Actor who created the row. |
| `updated_at` | `timestamptz` | YES | -- | Last update timestamp. |
| `updated_by` | `text` | YES | -- | Actor who last updated the row. |

**Primary Key:** `id`

**Foreign Keys**

| Column | References | On Delete |
|---|---|---|
| `tenant_id` | `core.tenant(id)` | CASCADE |

**Constraints**

| Constraint | Type | Details |
|---|---|---|
| `job_schedule_kind_chk` | CHECK | `schedule_kind IN ('cron', 'interval', 'manual')` |
| `job_code_uniq` | UNIQUE | `(tenant_id, code)` -- one code per tenant. |

**Indexes**

None beyond the primary key and unique constraint.

**Relationships**

- **References:** `core.tenant`
- **Referenced by:** `core.job_run` (via `job_id`)

---

### core.job_run

**Functional Description**

The job_run table records individual execution instances of scheduled or manually triggered jobs. Each run tracks its lifecycle status, start and finish times, retry attempts, and any error output. This table serves as both an operational log and an audit trail for background processing.

**Technical Details**

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `tenant_id` | `uuid` | NOT NULL | -- | FK to `core.tenant`. |
| `job_id` | `uuid` | NOT NULL | -- | FK to `core.job`. |
| `status` | `text` | NOT NULL | `'queued'` | Execution status. |
| `started_at` | `timestamptz` | YES | -- | When execution began. |
| `finished_at` | `timestamptz` | YES | -- | When execution completed. |
| `attempts` | `int` | NOT NULL | `0` | Number of attempts so far. |
| `max_attempts` | `int` | NOT NULL | `3` | Maximum retry attempts allowed. |
| `log_ref` | `text` | YES | -- | Reference to external log storage (e.g., object storage key). |
| `last_error` | `text` | YES | -- | Most recent error message. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp. |

**Primary Key:** `id`

**Foreign Keys**

| Column | References | On Delete |
|---|---|---|
| `tenant_id` | `core.tenant(id)` | CASCADE |
| `job_id` | `core.job(id)` | CASCADE |

**Constraints**

| Constraint | Type | Details |
|---|---|---|
| `job_run_status_chk` | CHECK | `status IN ('queued', 'running', 'succeeded', 'failed', 'canceled')` |

**Indexes**

| Index | Columns | Filter |
|---|---|---|
| `idx_job_run_tenant_job_time` | `tenant_id, job_id, created_at DESC` | -- |

**Relationships**

- **References:** `core.tenant`, `core.job`
- **Referenced by:** None.

---

## Address System

### core.address

**Functional Description**

The address table stores physical and mailing addresses scoped to a tenant. Addresses are generic records that can be linked to any business entity (customer, employee, supplier, etc.) through the `core.address_link` junction table. This decoupled design allows a single address to be shared across multiple entities with different purposes.

**Technical Details**

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `tenant_id` | `uuid` | NOT NULL | -- | FK to `core.tenant`. |
| `country_code` | `text` | YES | -- | ISO country code. |
| `line1` | `text` | YES | -- | Street address line 1. |
| `line2` | `text` | YES | -- | Street address line 2. |
| `city` | `text` | YES | -- | City name. |
| `region` | `text` | YES | -- | State, province, or region. |
| `postal_code` | `text` | YES | -- | Postal/ZIP code. |
| `metadata` | `jsonb` | YES | -- | Additional unstructured address data. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp. |
| `created_by` | `text` | NOT NULL | -- | Actor who created the row. |

**Primary Key:** `id`

**Foreign Keys**

| Column | References | On Delete |
|---|---|---|
| `tenant_id` | `core.tenant(id)` | CASCADE |

**Constraints**

| Constraint | Type | Details |
|---|---|---|
| `address_tenant_id_id_uq` | UNIQUE | `(tenant_id, id)` -- composite uniqueness for FK referencing. |

**Indexes**

| Index | Columns | Filter |
|---|---|---|
| `idx_address_tenant` | `tenant_id` | -- |

**Relationships**

- **References:** `core.tenant`
- **Referenced by:** `core.address_link` (via `address_id`)

---

### core.contact_point

**Functional Description**

The contact_point table stores multi-channel contact information (email, phone, WhatsApp, website, etc.) for any entity in the system. Contacts are polymorphically linked to their owner through the `owner_type` and `owner_id` columns, allowing customers, employees, organizations, and other entities to all use the same contact infrastructure. Each contact point tracks its verification status and whether it is the primary contact for its owner.

**Technical Details**

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `tenant_id` | `uuid` | NOT NULL | -- | FK to `core.tenant`. |
| `owner_type` | `text` | NOT NULL | -- | Polymorphic type discriminator (e.g., `customer`, `employee`). |
| `owner_id` | `uuid` | NOT NULL | -- | ID of the owning entity. |
| `channel_type` | `text` | NOT NULL | -- | Communication channel (e.g., `email`, `phone`, `whatsapp`). |
| `value` | `text` | NOT NULL | -- | The actual contact value (email address, phone number, etc.). |
| `purpose` | `text` | YES | -- | Purpose of this contact (e.g., `billing`, `support`). |
| `is_primary` | `boolean` | NOT NULL | `false` | Whether this is the primary contact for the owner. |
| `is_verified` | `boolean` | NOT NULL | `false` | Whether the contact value has been verified. |
| `metadata` | `jsonb` | YES | -- | Additional unstructured data. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp. |
| `created_by` | `text` | NOT NULL | -- | Actor who created the row. |

**Primary Key:** `id`

**Foreign Keys**

| Column | References | On Delete |
|---|---|---|
| `tenant_id` | `core.tenant(id)` | CASCADE |

**Constraints**

None beyond the primary key and foreign key.

**Indexes**

| Index | Columns | Filter |
|---|---|---|
| `idx_contact_point_owner` | `tenant_id, owner_type, owner_id` | -- |

**Relationships**

- **References:** `core.tenant`
- **Referenced by:** `core.contact_phone` (via `contact_point_id`)

---

### core.contact_phone

**Functional Description**

The contact_phone table stores structured phone data linked to a contact point. While the parent `core.contact_point` stores the raw phone value, this table breaks it into E.164 format, country code, national number, and carrier hint. This structured representation supports international phone formatting, validation, and carrier-based routing.

**Technical Details**

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `tenant_id` | `uuid` | NOT NULL | -- | FK to `core.tenant`. |
| `contact_point_id` | `uuid` | NOT NULL | -- | FK to `core.contact_point`. |
| `e164` | `text` | YES | -- | Phone number in E.164 format (e.g., `+60123456789`). |
| `country_code` | `text` | YES | -- | ISO country calling code (e.g., `60`). |
| `national_number` | `text` | YES | -- | National phone number without country code. |
| `carrier_hint` | `text` | YES | -- | Optional carrier/network hint. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp. |
| `created_by` | `text` | NOT NULL | -- | Actor who created the row. |

**Primary Key:** `id`

**Foreign Keys**

| Column | References | On Delete |
|---|---|---|
| `tenant_id` | `core.tenant(id)` | CASCADE |
| `contact_point_id` | `core.contact_point(id)` | CASCADE |

**Constraints**

None beyond the primary key and foreign keys.

**Indexes**

None beyond the primary key.

**Relationships**

- **References:** `core.tenant`, `core.contact_point`
- **Referenced by:** None.

---

### core.address_link

**Functional Description**

The address_link table is a junction table that associates addresses with business entities. It uses a polymorphic pattern (`owner_type` + `owner_id`) so any entity type -- customers, employees, tenants, organizational units -- can have multiple addresses, each tagged with a specific purpose (billing, shipping, headquarters, etc.). Temporal validity is supported through `effective_from` and `effective_until` columns.

**Technical Details**

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `tenant_id` | `uuid` | NOT NULL | -- | FK to `core.tenant`. |
| `owner_type` | `text` | NOT NULL | -- | Polymorphic type discriminator. |
| `owner_id` | `uuid` | NOT NULL | -- | ID of the owning entity. |
| `address_id` | `uuid` | NOT NULL | -- | FK to `core.address`. |
| `purpose` | `text` | NOT NULL | -- | Purpose of this address link. |
| `priority` | `int` | NOT NULL | `0` | Sort priority among same-purpose addresses. |
| `is_primary` | `boolean` | NOT NULL | `false` | Whether this is the primary address for the purpose. |
| `effective_from` | `timestamptz` | NOT NULL | `now()` | Start of validity period. |
| `effective_until` | `timestamptz` | YES | -- | End of validity period (NULL = indefinite). |
| `metadata` | `jsonb` | YES | -- | Additional unstructured data. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp. |
| `created_by` | `text` | NOT NULL | -- | Actor who created the row. |
| `updated_at` | `timestamptz` | YES | -- | Last update timestamp. |
| `updated_by` | `text` | YES | -- | Actor who last updated the row. |

**Primary Key:** `id`

**Foreign Keys**

| Column | References | On Delete |
|---|---|---|
| `tenant_id` | `core.tenant(id)` | CASCADE |
| `address_id` | `core.address(id)` | CASCADE |

**Constraints**

| Constraint | Type | Details |
|---|---|---|
| `address_link_owner_purpose_address_uniq` | UNIQUE | `(tenant_id, owner_type, owner_id, purpose, address_id)` |
| `address_link_purpose_chk` | CHECK | `purpose IN ('billing', 'shipping', 'mailing', 'office', 'home', 'hq', 'legal', 'other')` |

**Indexes**

| Index | Columns | Filter |
|---|---|---|
| `idx_address_link_owner` | `tenant_id, owner_type, owner_id` | -- |
| `idx_address_link_address` | `address_id` | -- |
| `idx_address_link_purpose` | `tenant_id, purpose` | -- |
| `idx_address_link_primary` | `tenant_id, owner_type, owner_id` | `WHERE is_primary = true` |

**Relationships**

- **References:** `core.tenant`, `core.address`
- **Referenced by:** None.

---

## Workspace

### core.workspace

**Functional Description**

The workspace table defines system-wide logical workspaces that organize the platform into functional areas such as Finance, Supply Chain, Human Resources, and so on. Workspaces are not tenant-scoped -- they represent platform-level organizational namespaces. Tenants interact with workspaces through feature enablement and principal access grants.

**Technical Details**

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `code` | `text` | NOT NULL | -- | Globally unique workspace code. |
| `name` | `text` | NOT NULL | -- | Human-readable workspace name. |
| `description` | `text` | YES | -- | Workspace description. |
| `sort_order` | `int` | NOT NULL | `0` | Display ordering. |
| `metadata` | `jsonb` | YES | -- | Additional unstructured data. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp. |
| `created_by` | `text` | NOT NULL | `'system'` | Actor who created the row. |
| `updated_at` | `timestamptz` | YES | -- | Last update timestamp. |
| `updated_by` | `text` | YES | -- | Actor who last updated the row. |

**Primary Key:** `id`

**Foreign Keys:** None.

**Constraints**

| Constraint | Type | Details |
|---|---|---|
| `code` | UNIQUE | Globally unique workspace code. |

**Indexes**

| Index | Columns | Filter |
|---|---|---|
| `idx_workspace_sort` | `sort_order` | -- |

**Relationships**

- **References:** None.
- **Referenced by:** `core.workspace_feature` (via `workspace_id`), `core.principal_workspace_access` (via `workspace_id`), `core.workspace_usage_metric` (via `workspace_id`), `core.module` (via `workspace_id`)

---

### core.workspace_feature

**Functional Description**

The workspace_feature table tracks which features are enabled in each workspace for each tenant. This enables tenant-specific feature gating at the workspace level -- for example, a tenant might have "Advanced Reporting" enabled in the Finance workspace but not in HR. Each feature can carry its own configuration payload and metadata.

**Technical Details**

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `tenant_id` | `uuid` | NOT NULL | -- | FK to `core.tenant`. |
| `workspace_id` | `uuid` | NOT NULL | -- | FK to `core.workspace`. |
| `feature_code` | `text` | NOT NULL | -- | Code identifying the feature. |
| `feature_name` | `text` | YES | -- | Human-readable feature name. |
| `is_enabled` | `boolean` | NOT NULL | `true` | Whether the feature is currently enabled. |
| `enabled_at` | `timestamptz` | YES | -- | When the feature was enabled. |
| `config` | `jsonb` | YES | -- | Feature-specific configuration. |
| `metadata` | `jsonb` | YES | -- | Additional unstructured data. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp. |
| `created_by` | `text` | NOT NULL | -- | Actor who created the row. |
| `updated_at` | `timestamptz` | YES | -- | Last update timestamp. |
| `updated_by` | `text` | YES | -- | Actor who last updated the row. |

**Primary Key:** `id`

**Foreign Keys**

| Column | References | On Delete |
|---|---|---|
| `tenant_id` | `core.tenant(id)` | CASCADE |
| `workspace_id` | `core.workspace(id)` | CASCADE |

**Constraints**

| Constraint | Type | Details |
|---|---|---|
| `workspace_feature_ws_feat_uniq` | UNIQUE | `(workspace_id, feature_code)` |

**Indexes**

| Index | Columns | Filter |
|---|---|---|
| `idx_workspace_feature_workspace` | `workspace_id, is_enabled` | -- |
| `idx_workspace_feature_code` | `feature_code` | -- |

**Relationships**

- **References:** `core.tenant`, `core.workspace`
- **Referenced by:** None directly. Exposed through `core.workspace_feature_view`.

---

### core.principal_workspace_access

**Functional Description**

The principal_workspace_access table governs which principals (users, services) can access which workspaces and at what access level. Each access grant can optionally be associated with a role or a persona (but not both simultaneously), enabling fine-grained workspace-level authorization. Access grants can carry an expiration date for time-limited workspace access.

**Technical Details**

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `tenant_id` | `uuid` | NOT NULL | -- | FK to `core.tenant`. |
| `principal_id` | `uuid` | NOT NULL | -- | FK to `core.principal` (deferred). |
| `workspace_id` | `uuid` | NOT NULL | -- | FK to `core.workspace`. |
| `role_id` | `uuid` | YES | -- | FK to `core.role` (deferred, optional). |
| `persona_id` | `uuid` | YES | -- | FK to `core.persona` (deferred, optional). |
| `access_level` | `text` | NOT NULL | `'member'` | Level of access within the workspace. |
| `granted_at` | `timestamptz` | NOT NULL | `now()` | When access was granted. |
| `granted_by` | `text` | YES | -- | Actor who granted access. |
| `expires_at` | `timestamptz` | YES | -- | Optional expiration (NULL = indefinite). |
| `metadata` | `jsonb` | YES | -- | Additional unstructured data. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp. |
| `created_by` | `text` | NOT NULL | -- | Actor who created the row. |
| `updated_at` | `timestamptz` | YES | -- | Last update timestamp. |
| `updated_by` | `text` | YES | -- | Actor who last updated the row. |

**Primary Key:** `id`

**Foreign Keys**

| Column | References | On Delete | Notes |
|---|---|---|---|
| `tenant_id` | `core.tenant(id)` | CASCADE | Inline FK. |
| `workspace_id` | `core.workspace(id)` | CASCADE | Inline FK. |
| `principal_id` | `core.principal(id)` | CASCADE | Deferred FK (`pwa_principal_fk`). |
| `role_id` | `core.role(id)` | SET NULL | Deferred FK (`pwa_role_fk`). |
| `persona_id` | `core.persona(id)` | SET NULL | Deferred FK (`pwa_persona_fk`). |

**Constraints**

| Constraint | Type | Details |
|---|---|---|
| `principal_workspace_access_uniq` | UNIQUE | `(principal_id, workspace_id)` -- one access record per principal per workspace. |
| `principal_workspace_access_level_chk` | CHECK | `access_level IN ('owner', 'admin', 'manager', 'member', 'viewer', 'guest')` |
| `principal_workspace_access_role_persona_ck` | CHECK | `(role_id IS NULL OR persona_id IS NULL)` -- cannot assign both a role and a persona simultaneously. |

**Indexes**

| Index | Columns | Filter |
|---|---|---|
| `idx_principal_workspace_access_principal` | `principal_id` | -- |
| `idx_principal_workspace_access_workspace` | `workspace_id` | -- |
| `idx_principal_workspace_access_role` | `role_id` | -- |
| `idx_principal_workspace_access_access_level` | `access_level` | -- |

**Relationships**

- **References:** `core.tenant`, `core.workspace`, `core.principal`, `core.role`, `core.persona`
- **Referenced by:** None.

---

### core.workspace_usage_metric

**Functional Description**

The workspace_usage_metric table captures quantitative usage metrics per workspace per tenant over defined time periods. It supports billing, quota enforcement, and capacity planning by recording metrics such as API call counts, storage consumed, active users, and more. Each metric is identified by a key and includes a numeric value with an optional unit.

**Technical Details**

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `tenant_id` | `uuid` | NOT NULL | -- | FK to `core.tenant`. |
| `workspace_id` | `uuid` | NOT NULL | -- | FK to `core.workspace`. |
| `metric_key` | `text` | NOT NULL | -- | Metric identifier (e.g., `api_calls`, `storage_bytes`). |
| `metric_name` | `text` | YES | -- | Human-readable metric name. |
| `metric_value` | `numeric` | YES | -- | Numeric measurement value. |
| `metric_unit` | `text` | YES | -- | Unit of measurement (e.g., `bytes`, `count`). |
| `period_start` | `timestamptz` | NOT NULL | -- | Start of the measurement period. |
| `period_end` | `timestamptz` | YES | -- | End of the measurement period (NULL = ongoing). |
| `recorded_at` | `timestamptz` | NOT NULL | `now()` | When the metric was recorded. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp. |

**Primary Key:** `id`

**Foreign Keys**

| Column | References | On Delete |
|---|---|---|
| `tenant_id` | `core.tenant(id)` | CASCADE |
| `workspace_id` | `core.workspace(id)` | CASCADE |

**Constraints**

None beyond the primary key and foreign keys.

**Indexes**

| Index | Columns | Filter |
|---|---|---|
| `idx_workspace_usage_metric_workspace` | `workspace_id, period_end DESC` | -- |
| `idx_workspace_usage_metric_metric_key` | `workspace_id, metric_key, period_end DESC` | -- |

**Relationships**

- **References:** `core.tenant`, `core.workspace`
- **Referenced by:** None.

---

### core.workspace_feature_view (VIEW)

**Functional Description**

A denormalized read-only view that joins `core.workspace_feature` with `core.workspace` to provide a convenient flattened representation of features within workspaces. This view includes the workspace code and name alongside the feature details, eliminating the need for application-level joins in common read queries.

**Definition**

```sql
SELECT
  wf.id,
  wf.tenant_id,
  wf.workspace_id,
  w.code   AS workspace_code,
  w.name   AS workspace_name,
  wf.feature_code,
  wf.feature_name,
  wf.is_enabled,
  wf.config
FROM core.workspace_feature wf
JOIN core.workspace w ON wf.workspace_id = w.id;
```

---

## Configuration

### core.tenant_locale_policy

**Functional Description**

The tenant_locale_policy table stores tenant-specific regional, locale, and compliance policies. Each policy defines defaults for locale, timezone, currency, date/time formats, and number formatting. It also captures data residency requirements and language constraints for regulatory compliance (e.g., GDPR, data sovereignty). A tenant can have multiple named policies (e.g., one per region or business unit).

**Technical Details**

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `tenant_id` | `uuid` | NOT NULL | -- | FK to `core.tenant`. |
| `code` | `text` | NOT NULL | -- | Policy code (unique within tenant). |
| `name` | `text` | YES | -- | Human-readable policy name. |
| `default_locale` | `text` | NOT NULL | `'en-US'` | Default locale identifier. |
| `default_timezone` | `text` | NOT NULL | `'UTC'` | Default timezone (IANA). |
| `default_currency` | `text` | NOT NULL | `'USD'` | Default currency code (ISO 4217). |
| `default_date_format` | `text` | NOT NULL | `'MM/dd/yyyy'` | Default date format pattern. |
| `default_time_format` | `text` | NOT NULL | `'hh:mm:ss a'` | Default time format pattern. |
| `default_decimal_sep` | `text` | NOT NULL | `'.'` | Decimal separator character. |
| `default_thousands_sep` | `text` | NOT NULL | `','` | Thousands separator character. |
| `data_residency` | `text` | YES | -- | Data residency requirement (e.g., `EU`, `US`, `APAC`). |
| `language_requirements` | `text[]` | YES | -- | Required languages for compliance. |
| `phone_format_hint` | `text` | YES | -- | Phone number formatting hint. |
| `postal_code_pattern` | `text` | YES | -- | Regex pattern for postal code validation. |
| `metadata` | `jsonb` | YES | -- | Additional unstructured data. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp. |
| `created_by` | `text` | NOT NULL | -- | Actor who created the row. |
| `updated_at` | `timestamptz` | YES | -- | Last update timestamp. |
| `updated_by` | `text` | YES | -- | Actor who last updated the row. |

**Primary Key:** `id`

**Foreign Keys**

| Column | References | On Delete |
|---|---|---|
| `tenant_id` | `core.tenant(id)` | CASCADE |

**Constraints**

| Constraint | Type | Details |
|---|---|---|
| `tenant_locale_policy_tenant_code_uniq` | UNIQUE | `(tenant_id, code)` |

**Indexes**

| Index | Columns | Filter |
|---|---|---|
| `idx_tenant_locale_policy_tenant` | `tenant_id` | -- |
| `idx_tenant_locale_policy_code` | `tenant_id, code` | -- |

**Relationships**

- **References:** `core.tenant`
- **Referenced by:** None.

---

### core.principal_locale_override

**Functional Description**

The principal_locale_override table stores per-principal locale, timezone, and currency preferences that override the tenant-level locale policy. When a user prefers a different language, timezone, or date format than their tenant's default, their preferences are stored here. Each principal may have at most one override record.

**Technical Details**

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `tenant_id` | `uuid` | NOT NULL | -- | FK to `core.tenant`. |
| `principal_id` | `uuid` | NOT NULL | -- | FK to `core.principal` (deferred). |
| `preferred_locale` | `text` | NOT NULL | -- | Preferred locale identifier. |
| `preferred_timezone` | `text` | NOT NULL | -- | Preferred timezone (IANA). |
| `preferred_currency` | `text` | YES | -- | Preferred currency code (ISO 4217). |
| `preferred_date_format` | `text` | YES | -- | Preferred date format pattern. |
| `preferred_time_format` | `text` | YES | -- | Preferred time format pattern. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp. |
| `created_by` | `text` | NOT NULL | -- | Actor who created the row. |
| `updated_at` | `timestamptz` | YES | -- | Last update timestamp. |
| `updated_by` | `text` | YES | -- | Actor who last updated the row. |

**Primary Key:** `id`

**Foreign Keys**

| Column | References | On Delete | Notes |
|---|---|---|---|
| `tenant_id` | `core.tenant(id)` | CASCADE | Inline FK. |
| `principal_id` | `core.principal(id)` | CASCADE | Deferred FK (`plo_principal_fk`). |

**Constraints**

| Constraint | Type | Details |
|---|---|---|
| `principal_locale_override_principal_uniq` | UNIQUE | `(principal_id)` -- one override per principal. |

**Indexes**

| Index | Columns | Filter |
|---|---|---|
| `idx_principal_locale_override_principal` | `principal_id` | -- |

**Relationships**

- **References:** `core.tenant`, `core.principal`
- **Referenced by:** None.

---

### core.entity_tag

**Functional Description**

The entity_tag table provides a generic, flexible tagging system for any entity in the platform. Tags are key-value pairs attached to entities identified by a polymorphic `entity_type` + `entity_id` pair. This enables ad-hoc categorization, filtering, and metadata enrichment without requiring schema changes -- for example, tagging a customer as `priority:high` or a document as `department:legal`.

**Technical Details**

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `tenant_id` | `uuid` | NOT NULL | -- | FK to `core.tenant`. |
| `entity_type` | `text` | NOT NULL | -- | Polymorphic type discriminator. |
| `entity_id` | `uuid` | NOT NULL | -- | ID of the tagged entity. |
| `tag_key` | `text` | NOT NULL | -- | Tag key. |
| `tag_value` | `text` | YES | -- | Tag value (optional; key-only tags are valid). |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp. |
| `created_by` | `text` | NOT NULL | -- | Actor who created the row. |

**Primary Key:** `id`

**Foreign Keys**

| Column | References | On Delete |
|---|---|---|
| `tenant_id` | `core.tenant(id)` | CASCADE |

**Constraints**

| Constraint | Type | Details |
|---|---|---|
| `entity_tag_entity_tag_uniq` | UNIQUE | `(entity_type, entity_id, tag_key)` -- one value per key per entity. |

**Indexes**

| Index | Columns | Filter |
|---|---|---|
| `idx_entity_tag_entity` | `tenant_id, entity_type, entity_id` | -- |
| `idx_entity_tag_key_value` | `tenant_id, tag_key, tag_value` | -- |

**Relationships**

- **References:** `core.tenant`
- **Referenced by:** None.

---

### core.system_config

**Functional Description**

The system_config table is a centralized key-value configuration store that supports both tenant-scoped and global (system-wide) configuration entries. Each entry has a typed value (string, integer, boolean, JSON, or secret) and can be flagged as encrypted for sensitive data. The functional unique index ensures that each configuration key exists at most once per tenant (or once globally for system-wide settings).

**Technical Details**

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `tenant_id` | `uuid` | YES | -- | FK to `core.tenant` (NULL for global config). |
| `config_key` | `text` | NOT NULL | -- | Configuration key. |
| `config_value` | `text` | NOT NULL | -- | Configuration value (stored as text). |
| `config_type` | `text` | NOT NULL | `'string'` | Value type hint for deserialization. |
| `description` | `text` | YES | -- | Human-readable description. |
| `is_encrypted` | `boolean` | NOT NULL | `false` | Whether the value is stored encrypted. |
| `is_global` | `boolean` | NOT NULL | `false` | Whether this is a system-wide setting. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp. |
| `created_by` | `text` | NOT NULL | -- | Actor who created the row. |
| `updated_at` | `timestamptz` | YES | -- | Last update timestamp. |
| `updated_by` | `text` | YES | -- | Actor who last updated the row. |

**Primary Key:** `id`

**Foreign Keys**

| Column | References | On Delete |
|---|---|---|
| `tenant_id` | `core.tenant(id)` | CASCADE |

**Constraints**

| Constraint | Type | Details |
|---|---|---|
| `system_config_type_chk` | CHECK | `config_type IN ('string', 'integer', 'boolean', 'json', 'secret')` |

**Indexes**

| Index | Columns | Filter |
|---|---|---|
| `idx_system_config_key_uniq` | `COALESCE(tenant_id, '00000000-...'::uuid), config_key` | -- (UNIQUE functional index; NULL tenant coalesced to sentinel UUID) |
| `idx_system_config_tenant_key` | `tenant_id, config_key` | -- |
| `idx_system_config_global` | `config_key` | `WHERE is_global = true` |

**Relationships**

- **References:** `core.tenant`
- **Referenced by:** None.

---

### core.feature_flag

**Functional Description**

The feature_flag table provides runtime feature toggles scoped to each tenant. Each flag supports a rollout percentage (0-100) for gradual feature rollouts, along with optional configuration and metadata payloads. Flags can be enabled or disabled independently per tenant, with timestamps tracking when the state last changed.

**Technical Details**

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `tenant_id` | `uuid` | NOT NULL | -- | FK to `core.tenant`. |
| `flag_key` | `text` | NOT NULL | -- | Unique flag identifier within the tenant. |
| `flag_name` | `text` | YES | -- | Human-readable flag name. |
| `description` | `text` | YES | -- | Description of the feature flag. |
| `is_enabled` | `boolean` | NOT NULL | `false` | Whether the flag is currently on. |
| `enabled_at` | `timestamptz` | YES | -- | When the flag was last enabled. |
| `disabled_at` | `timestamptz` | YES | -- | When the flag was last disabled. |
| `rollout_pct` | `int` | YES | `100` | Percentage of traffic to receive the feature (0-100). |
| `config` | `jsonb` | YES | -- | Flag-specific configuration payload. |
| `metadata` | `jsonb` | YES | -- | Additional unstructured data. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp. |
| `created_by` | `text` | NOT NULL | -- | Actor who created the row. |
| `updated_at` | `timestamptz` | YES | -- | Last update timestamp. |
| `updated_by` | `text` | YES | -- | Actor who last updated the row. |

**Primary Key:** `id`

**Foreign Keys**

| Column | References | On Delete |
|---|---|---|
| `tenant_id` | `core.tenant(id)` | CASCADE |

**Constraints**

| Constraint | Type | Details |
|---|---|---|
| `feature_flag_tenant_key_uniq` | UNIQUE | `(tenant_id, flag_key)` |
| `feature_flag_rollout_pct_chk` | CHECK | `rollout_pct >= 0 AND rollout_pct <= 100` |

**Indexes**

| Index | Columns | Filter |
|---|---|---|
| `idx_feature_flag_tenant_enabled` | `tenant_id, is_enabled` | -- |

**Relationships**

- **References:** `core.tenant`
- **Referenced by:** None.

---

## IAM (Identity and Access Management)

### core.principal

**Functional Description**

The principal table is the unified identity registry for the platform. It stores all types of security principals -- human users, service accounts, abstract identities, and groups -- in a single table differentiated by `principal_type`. Each principal belongs to a tenant and an IAM realm, and can be linked to an external identity provider (Keycloak) via `external_id` and `subject_id`. The table also caches select IDP-sourced profile attributes for efficient read access without requiring IDP round-trips.

**Technical Details**

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `tenant_id` | `uuid` | NOT NULL | -- | FK to `core.tenant`. |
| `realm_key` | `text` | NOT NULL | `'main'` | IAM realm key. |
| `principal_type` | `text` | NOT NULL | -- | Type of principal. |
| `principal_code` | `text` | NOT NULL | -- | Unique business code (e.g., `demomalaysia_viewer`). |
| `display_name` | `text` | YES | -- | Display name. |
| `email` | `text` | YES | -- | Primary email address. |
| `phone` | `text` | YES | -- | Primary phone number. |
| `given_name` | `text` | YES | -- | Given (first) name. |
| `family_name` | `text` | YES | -- | Family (last) name. |
| `preferred_name` | `text` | YES | -- | Preferred name. |
| `external_id` | `text` | YES | -- | External ID from IDP (Keycloak subject). |
| `subject_id` | `text` | YES | -- | OIDC subject claim (immutable). |
| `is_active` | `boolean` | NOT NULL | `true` | Whether the principal is active. |
| `is_service_account` | `boolean` | NOT NULL | `false` | Whether this is a service account. |
| `is_locked` | `boolean` | NOT NULL | `false` | Whether the account is locked. |
| `password_hash` | `text` | YES | -- | Hashed password (for local auth). |
| `password_updated_at` | `timestamptz` | YES | -- | When the password was last changed. |
| `last_login_at` | `timestamptz` | YES | -- | Timestamp of last successful login. |
| `last_login_ip` | `text` | YES | -- | IP address of last login. |
| `idp_display_name` | `text` | YES | -- | Display name from IDP. |
| `idp_family_name` | `text` | YES | -- | Family name from IDP. |
| `idp_given_name` | `text` | YES | -- | Given name from IDP. |
| `idp_email` | `text` | YES | -- | Email from IDP. |
| `idp_email_verified` | `boolean` | YES | -- | IDP email verification status. |
| `idp_phone_number` | `text` | YES | -- | Phone from IDP. |
| `idp_phone_verified` | `boolean` | YES | -- | IDP phone verification status. |
| `idp_picture` | `text` | YES | -- | Profile picture URL from IDP. |
| `idp_locale` | `text` | YES | -- | Locale from IDP. |
| `idp_timezone` | `text` | YES | -- | Timezone from IDP. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp. |
| `created_by` | `text` | NOT NULL | -- | Actor who created the row. |
| `updated_at` | `timestamptz` | YES | -- | Last update timestamp. |
| `updated_by` | `text` | YES | -- | Actor who last updated the row. |

**Primary Key:** `id`

**Foreign Keys**

| Column | References | On Delete |
|---|---|---|
| `tenant_id` | `core.tenant(id)` | CASCADE |

**Constraints**

| Constraint | Type | Details |
|---|---|---|
| `principal_type_chk` | CHECK | `principal_type IN ('user', 'service', 'identity', 'group')` |
| `principal_tenant_external_uniq` | UNIQUE (DEFERRABLE) | `(tenant_id, external_id)` |
| `principal_code` | UNIQUE | Globally unique principal code. |

**Indexes**

| Index | Columns | Filter |
|---|---|---|
| `idx_principal_tenant_type` | `tenant_id, principal_type` | -- |
| `idx_principal_email` | `tenant_id, email` | -- |
| `idx_principal_code` | `principal_code` | -- |
| `idx_principal_active` | `tenant_id, is_active` | `WHERE is_active = true` |
| `idx_principal_external_id` | `tenant_id, external_id` | -- |

**Relationships**

- **References:** `core.tenant`
- **Referenced by:** `core.idp_identity`, `core.principal_profile`, `core.group_member`, `core.principal_role`, `core.principal_ou`, `core.entitlement`, `core.principal_workspace_access`, `core.principal_locale_override`

---

### core.idp_identity

**Functional Description**

The idp_identity table links platform principals to their OAuth/OIDC identity provider records. Each row represents a principal's identity at a specific IDP (e.g., Keycloak realm), storing the IDP subject identifier, tokens (access, refresh, ID), token expiration timestamps, and raw OIDC claims. This table supports multi-IDP scenarios where a single principal might authenticate through different providers.

**Technical Details**

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `tenant_id` | `uuid` | NOT NULL | -- | FK to `core.tenant`. |
| `principal_id` | `uuid` | NOT NULL | -- | FK to `core.principal`. |
| `idp_name` | `text` | NOT NULL | -- | Identity provider name (e.g., `keycloak-main`). |
| `idp_subject` | `text` | NOT NULL | -- | Subject identifier at the IDP. |
| `access_token` | `text` | YES | -- | Current access token. |
| `access_token_expires_at` | `timestamptz` | YES | -- | Access token expiration. |
| `refresh_token` | `text` | YES | -- | Current refresh token. |
| `refresh_token_expires_at` | `timestamptz` | YES | -- | Refresh token expiration. |
| `id_token` | `text` | YES | -- | Current ID token. |
| `id_token_expires_at` | `timestamptz` | YES | -- | ID token expiration. |
| `token_type` | `text` | YES | -- | Token type (e.g., `Bearer`). |
| `scope` | `text` | YES | -- | OAuth scopes granted. |
| `last_refreshed_at` | `timestamptz` | YES | -- | When tokens were last refreshed. |
| `last_authenticated_at` | `timestamptz` | YES | -- | When the user last authenticated. |
| `raw_claims` | `jsonb` | YES | -- | Raw OIDC claims from the ID token. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp. |
| `created_by` | `text` | NOT NULL | -- | Actor who created the row. |
| `updated_at` | `timestamptz` | YES | -- | Last update timestamp. |
| `updated_by` | `text` | YES | -- | Actor who last updated the row. |

**Primary Key:** `id`

**Foreign Keys**

| Column | References | On Delete |
|---|---|---|
| `tenant_id` | `core.tenant(id)` | CASCADE |
| `principal_id` | `core.principal(id)` | CASCADE |

**Constraints**

| Constraint | Type | Details |
|---|---|---|
| `idp_identity_tenant_idp_subject_uniq` | UNIQUE (DEFERRABLE) | `(tenant_id, idp_name, idp_subject)` |

**Indexes**

| Index | Columns | Filter |
|---|---|---|
| `idx_idp_identity_principal` | `tenant_id, principal_id` | -- |
| `idx_idp_identity_idp_subject` | `tenant_id, idp_name, idp_subject` | -- |

**Relationships**

- **References:** `core.tenant`, `core.principal`
- **Referenced by:** None.

---

### core.principal_profile

**Functional Description**

The principal_profile table extends principal records with detailed profile attributes that are synchronized from Keycloak. It stores personal information (first/last name, locale, timezone), Keycloak-specific metadata (Keycloak ID, creation timestamp, federation link), and a flexible `attributes` JSONB column for custom profile data. Each principal has at most one profile record.

**Technical Details**

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `tenant_id` | `uuid` | NOT NULL | -- | FK to `core.tenant`. |
| `principal_id` | `uuid` | NOT NULL | -- | FK to `core.principal`. |
| `first_name` | `text` | YES | -- | First name. |
| `last_name` | `text` | YES | -- | Last name. |
| `locale` | `text` | YES | -- | Preferred locale. |
| `timezone` | `text` | YES | -- | Preferred timezone. |
| `keycloak_id` | `text` | YES | -- | Keycloak internal user ID. |
| `keycloak_created_at_millis` | `bigint` | YES | -- | Keycloak account creation timestamp (epoch millis). |
| `keycloak_federation_link` | `text` | YES | -- | Keycloak user federation link. |
| `attributes` | `jsonb` | YES | -- | Custom attributes (flexible key-value store). |
| `enabled_date` | `timestamptz` | YES | -- | When the account was enabled in Keycloak. |
| `disabled_date` | `timestamptz` | YES | -- | When the account was disabled in Keycloak. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp. |
| `created_by` | `text` | NOT NULL | -- | Actor who created the row. |
| `updated_at` | `timestamptz` | YES | -- | Last update timestamp. |
| `updated_by` | `text` | YES | -- | Actor who last updated the row. |

**Primary Key:** `id`

**Foreign Keys**

| Column | References | On Delete |
|---|---|---|
| `tenant_id` | `core.tenant(id)` | CASCADE |
| `principal_id` | `core.principal(id)` | CASCADE |

**Constraints**

| Constraint | Type | Details |
|---|---|---|
| `principal_profile_principal_uniq` | UNIQUE | `(principal_id)` -- one profile per principal. |

**Indexes**

| Index | Columns | Filter |
|---|---|---|
| `idx_principal_profile_tenant` | `tenant_id` | -- |
| `idx_principal_profile_keycloak_id` | `tenant_id, keycloak_id` | -- |

**Relationships**

- **References:** `core.tenant`, `core.principal`
- **Referenced by:** None.

---

### core.tenant_profile

**Functional Description**

The tenant_profile table stores regional and business configuration specific to each tenant. It captures the tenant's country, default currency, locale, timezone, and fiscal year start month. This information drives localization, financial reporting, and regulatory compliance behavior across the platform. Each tenant has exactly one profile record.

**Technical Details**

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `tenant_id` | `uuid` | NOT NULL | -- | FK to `core.tenant` (1:1). |
| `country` | `text` | YES | -- | ISO country code. |
| `currency` | `text` | YES | -- | Default currency code (ISO 4217). |
| `locale` | `text` | YES | -- | Default locale. |
| `timezone` | `text` | YES | -- | Default timezone (IANA). |
| `fiscal_year_start_month` | `int` | YES | -- | Month number (1-12) when the fiscal year begins. |
| `metadata` | `jsonb` | YES | -- | Additional unstructured data. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp. |
| `created_by` | `text` | NOT NULL | -- | Actor who created the row. |
| `updated_at` | `timestamptz` | YES | -- | Last update timestamp. |
| `updated_by` | `text` | YES | -- | Actor who last updated the row. |

**Primary Key:** `id`

**Foreign Keys**

| Column | References | On Delete |
|---|---|---|
| `tenant_id` | `core.tenant(id)` | CASCADE |

**Constraints**

| Constraint | Type | Details |
|---|---|---|
| `tenant_id` | UNIQUE | One profile per tenant (1:1 relationship). |

**Indexes**

| Index | Columns | Filter |
|---|---|---|
| `idx_tenant_profile_tenant` | `tenant_id` | -- |

**Relationships**

- **References:** `core.tenant`
- **Referenced by:** None.

---

### core.principal_group

**Functional Description**

The principal_group table defines named groups within a tenant for bulk principal management. Groups enable administrators to assign roles, entitlements, and workspace access to a collection of principals at once rather than individually. Each group has a unique code within its tenant and can carry arbitrary metadata.

**Technical Details**

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `tenant_id` | `uuid` | NOT NULL | -- | FK to `core.tenant`. |
| `code` | `text` | NOT NULL | -- | Unique group code within the tenant. |
| `name` | `text` | NOT NULL | -- | Human-readable group name. |
| `description` | `text` | YES | -- | Group description. |
| `metadata` | `jsonb` | YES | -- | Additional unstructured data. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp. |
| `created_by` | `text` | NOT NULL | -- | Actor who created the row. |
| `updated_at` | `timestamptz` | YES | -- | Last update timestamp. |
| `updated_by` | `text` | YES | -- | Actor who last updated the row. |

**Primary Key:** `id`

**Foreign Keys**

| Column | References | On Delete |
|---|---|---|
| `tenant_id` | `core.tenant(id)` | CASCADE |

**Constraints**

| Constraint | Type | Details |
|---|---|---|
| `principal_group_tenant_code_uniq` | UNIQUE | `(tenant_id, code)` |

**Indexes**

| Index | Columns | Filter |
|---|---|---|
| `idx_principal_group_tenant` | `tenant_id` | -- |

**Relationships**

- **References:** `core.tenant`
- **Referenced by:** `core.group_member` (via `group_id`), `core.entitlement` (via `group_id`)

---

### core.group_member

**Functional Description**

The group_member table records membership of principals in groups. It is a junction table that creates a many-to-many relationship between principals and groups. When a principal joins a group, they inherit all entitlements and access grants associated with that group.

**Technical Details**

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `tenant_id` | `uuid` | NOT NULL | -- | FK to `core.tenant`. |
| `group_id` | `uuid` | NOT NULL | -- | FK to `core.principal_group`. |
| `principal_id` | `uuid` | NOT NULL | -- | FK to `core.principal`. |
| `joined_at` | `timestamptz` | NOT NULL | `now()` | When the principal joined the group. |

**Primary Key:** `id`

**Foreign Keys**

| Column | References | On Delete |
|---|---|---|
| `tenant_id` | `core.tenant(id)` | CASCADE |
| `group_id` | `core.principal_group(id)` | CASCADE |
| `principal_id` | `core.principal(id)` | CASCADE |

**Constraints**

| Constraint | Type | Details |
|---|---|---|
| `group_member_gp_princ_uniq` | UNIQUE | `(group_id, principal_id)` -- a principal can only be in a group once. |

**Indexes**

| Index | Columns | Filter |
|---|---|---|
| `idx_group_member_principal` | `tenant_id, principal_id` | -- |

**Relationships**

- **References:** `core.tenant`, `core.principal_group`, `core.principal`
- **Referenced by:** None.

---

### core.role

**Functional Description**

The role table defines named roles within each tenant for role-based access control (RBAC). Roles are logical groupings of permissions that can be assigned to principals. Each role has a unique code within its tenant and can be categorized (e.g., `administrative`, `operational`, `financial`) to support role management UIs and policy decisions.

**Technical Details**

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `tenant_id` | `uuid` | NOT NULL | -- | FK to `core.tenant`. |
| `code` | `text` | NOT NULL | -- | Unique role code within the tenant. |
| `name` | `text` | NOT NULL | -- | Human-readable role name. |
| `description` | `text` | YES | -- | Role description. |
| `category` | `text` | YES | -- | Role category for classification. |
| `metadata` | `jsonb` | YES | -- | Additional unstructured data. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp. |
| `created_by` | `text` | NOT NULL | -- | Actor who created the row. |
| `updated_at` | `timestamptz` | YES | -- | Last update timestamp. |
| `updated_by` | `text` | YES | -- | Actor who last updated the row. |

**Primary Key:** `id`

**Foreign Keys**

| Column | References | On Delete |
|---|---|---|
| `tenant_id` | `core.tenant(id)` | CASCADE |

**Constraints**

| Constraint | Type | Details |
|---|---|---|
| `role_tenant_code_uniq` | UNIQUE | `(tenant_id, code)` |

**Indexes**

| Index | Columns | Filter |
|---|---|---|
| `idx_role_tenant` | `tenant_id` | -- |
| `idx_role_category` | `tenant_id, category` | -- |

**Relationships**

- **References:** `core.tenant`
- **Referenced by:** `core.principal_role` (via `role_id`), `core.entitlement` (via `role_id`), `core.principal_workspace_access` (via `role_id`)

---

### core.principal_role

**Functional Description**

The principal_role table is the assignment junction between principals and roles. Each row grants a specific role to a specific principal within a tenant. Role assignments can carry an optional expiration date, enabling time-limited elevated privileges (e.g., temporary admin access during an incident).

**Technical Details**

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `tenant_id` | `uuid` | NOT NULL | -- | FK to `core.tenant`. |
| `principal_id` | `uuid` | NOT NULL | -- | FK to `core.principal`. |
| `role_id` | `uuid` | NOT NULL | -- | FK to `core.role`. |
| `assigned_at` | `timestamptz` | NOT NULL | `now()` | When the role was assigned. |
| `assigned_by` | `text` | YES | -- | Actor who assigned the role. |
| `expires_at` | `timestamptz` | YES | -- | Optional expiration (NULL = indefinite). |

**Primary Key:** `id`

**Foreign Keys**

| Column | References | On Delete |
|---|---|---|
| `tenant_id` | `core.tenant(id)` | CASCADE |
| `principal_id` | `core.principal(id)` | CASCADE |
| `role_id` | `core.role(id)` | CASCADE |

**Constraints**

| Constraint | Type | Details |
|---|---|---|
| `principal_role_principal_role_uniq` | UNIQUE | `(principal_id, role_id)` -- a principal can hold a role only once. |

**Indexes**

| Index | Columns | Filter |
|---|---|---|
| `idx_principal_role_principal` | `tenant_id, principal_id` | -- |
| `idx_principal_role_role` | `tenant_id, role_id` | -- |
| `idx_principal_role_expires` | `expires_at` | `WHERE expires_at IS NOT NULL` |

**Relationships**

- **References:** `core.tenant`, `core.principal`, `core.role`
- **Referenced by:** None.

---

### core.organizational_unit

**Functional Description**

The organizational_unit table models a hierarchical tree of organizational units (departments, divisions, teams, etc.) within each tenant. The `parent_id` self-reference enables arbitrary nesting depth. Principals are assigned to organizational units through `core.principal_ou`, allowing the platform to enforce OU-scoped data visibility and access policies.

**Technical Details**

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `tenant_id` | `uuid` | NOT NULL | -- | FK to `core.tenant`. |
| `code` | `text` | NOT NULL | -- | Unique OU code within the tenant. |
| `name` | `text` | NOT NULL | -- | Human-readable OU name. |
| `description` | `text` | YES | -- | OU description. |
| `parent_id` | `uuid` | YES | -- | FK to self (parent OU). NULL = root node. |
| `metadata` | `jsonb` | YES | -- | Additional unstructured data. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp. |
| `created_by` | `text` | NOT NULL | -- | Actor who created the row. |
| `updated_at` | `timestamptz` | YES | -- | Last update timestamp. |
| `updated_by` | `text` | YES | -- | Actor who last updated the row. |

**Primary Key:** `id`

**Foreign Keys**

| Column | References | On Delete |
|---|---|---|
| `tenant_id` | `core.tenant(id)` | CASCADE |
| `parent_id` | `core.organizational_unit(id)` | SET NULL |

**Constraints**

| Constraint | Type | Details |
|---|---|---|
| `organizational_unit_tenant_code_uniq` | UNIQUE | `(tenant_id, code)` |

**Indexes**

| Index | Columns | Filter |
|---|---|---|
| `idx_ou_tenant` | `tenant_id` | -- |
| `idx_ou_parent` | `parent_id` | -- |

**Relationships**

- **References:** `core.tenant`, `core.organizational_unit` (self-reference via `parent_id`)
- **Referenced by:** `core.organizational_unit` (self-reference), `core.principal_ou` (via `ou_id`)

---

### core.principal_ou

**Functional Description**

The principal_ou table assigns principals to organizational units. It is a junction table that creates a many-to-many relationship between principals and OUs. A principal can belong to multiple organizational units, and an OU can contain multiple principals. This mapping drives OU-scoped access control and data filtering.

**Technical Details**

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `tenant_id` | `uuid` | NOT NULL | -- | FK to `core.tenant`. |
| `principal_id` | `uuid` | NOT NULL | -- | FK to `core.principal`. |
| `ou_id` | `uuid` | NOT NULL | -- | FK to `core.organizational_unit`. |
| `assigned_at` | `timestamptz` | NOT NULL | `now()` | When the principal was assigned to the OU. |
| `assigned_by` | `text` | YES | -- | Actor who made the assignment. |

**Primary Key:** `id`

**Foreign Keys**

| Column | References | On Delete |
|---|---|---|
| `tenant_id` | `core.tenant(id)` | CASCADE |
| `principal_id` | `core.principal(id)` | CASCADE |
| `ou_id` | `core.organizational_unit(id)` | CASCADE |

**Constraints**

| Constraint | Type | Details |
|---|---|---|
| `principal_ou_principal_ou_uniq` | UNIQUE | `(principal_id, ou_id)` -- a principal can only be assigned to an OU once. |

**Indexes**

| Index | Columns | Filter |
|---|---|---|
| `idx_principal_ou_principal` | `tenant_id, principal_id` | -- |
| `idx_principal_ou_ou` | `tenant_id, ou_id` | -- |

**Relationships**

- **References:** `core.tenant`, `core.principal`, `core.organizational_unit`
- **Referenced by:** None.

---

### core.entitlement

**Functional Description**

The entitlement table records direct capability grants to principals, roles, or groups. Each entitlement grants (or denies) a specific capability, optionally scoped to a resource type and resource ID. Exactly one of `principal_id`, `role_id`, or `group_id` must be set per row (enforced by a CHECK constraint), determining whether the entitlement is a direct user grant, a role-based grant, or a group-based grant. Entitlements can have an expiration date for time-limited access.

**Technical Details**

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `tenant_id` | `uuid` | NOT NULL | -- | FK to `core.tenant`. |
| `principal_id` | `uuid` | YES | -- | FK to `core.principal` (if direct grant). |
| `role_id` | `uuid` | YES | -- | FK to `core.role` (if role-based grant). |
| `group_id` | `uuid` | YES | -- | FK to `core.principal_group` (if group-based grant). |
| `capability` | `text` | NOT NULL | -- | Capability identifier (e.g., `entity.read`, `report.export`). |
| `resource_type` | `text` | YES | -- | Optional resource type scope. |
| `resource_id` | `text` | YES | -- | Optional resource instance scope. |
| `effect` | `text` | NOT NULL | `'allow'` | Grant effect. |
| `granted_at` | `timestamptz` | NOT NULL | `now()` | When the entitlement was granted. |
| `granted_by` | `text` | YES | -- | Actor who granted the entitlement. |
| `expires_at` | `timestamptz` | YES | -- | Optional expiration (NULL = indefinite). |
| `metadata` | `jsonb` | YES | -- | Additional unstructured data. |

**Primary Key:** `id`

**Foreign Keys**

| Column | References | On Delete |
|---|---|---|
| `tenant_id` | `core.tenant(id)` | CASCADE |
| `principal_id` | `core.principal(id)` | CASCADE |
| `role_id` | `core.role(id)` | CASCADE |
| `group_id` | `core.principal_group(id)` | CASCADE |

**Constraints**

| Constraint | Type | Details |
|---|---|---|
| `entitlement_effect_chk` | CHECK | `effect IN ('allow', 'deny')` |
| `entitlement_has_grantee` | CHECK | Exactly one of `principal_id`, `role_id`, `group_id` must be non-null: `(principal_id IS NOT NULL)::int + (role_id IS NOT NULL)::int + (group_id IS NOT NULL)::int = 1` |

**Indexes**

| Index | Columns | Filter |
|---|---|---|
| `idx_entitlement_principal` | `tenant_id, principal_id` | -- |
| `idx_entitlement_role` | `tenant_id, role_id` | -- |
| `idx_entitlement_group` | `tenant_id, group_id` | -- |
| `idx_entitlement_capability` | `tenant_id, capability` | -- |
| `idx_entitlement_expires` | `expires_at` | `WHERE expires_at IS NOT NULL` |

**Relationships**

- **References:** `core.tenant`, `core.principal`, `core.role`, `core.principal_group`
- **Referenced by:** None.

---

## Permissions

### core.operation_category

**Functional Description**

The operation_category table defines system-wide categories that classify atomic operations. Categories such as "entity", "workflow", "utilities", and "reporting" provide a logical grouping for the platform's permission model. This table is not tenant-scoped -- categories are shared across the entire platform and typically seeded at deployment time.

**Technical Details**

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `code` | `text` | NOT NULL | -- | Globally unique category code. |
| `name` | `text` | NOT NULL | -- | Human-readable category name. |
| `description` | `text` | YES | -- | Category description. |
| `sort_order` | `int` | NOT NULL | `0` | Display ordering. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp. |
| `created_by` | `text` | NOT NULL | `'system'` | Actor who created the row. |
| `updated_at` | `timestamptz` | YES | -- | Last update timestamp. |
| `updated_by` | `text` | YES | -- | Actor who last updated the row. |

**Primary Key:** `id`

**Foreign Keys:** None.

**Constraints**

| Constraint | Type | Details |
|---|---|---|
| `code` | UNIQUE | Globally unique category code. |

**Indexes**

| Index | Columns | Filter |
|---|---|---|
| `idx_operation_category_sort` | `sort_order` | -- |

**Relationships**

- **References:** None.
- **Referenced by:** `core.operation` (via `category_id`)

---

### core.operation

**Functional Description**

The operation table defines atomic permission actions within the platform (e.g., `create`, `read`, `update`, `delete`, `export`, `approve`). Each operation belongs to a category and can specify whether it requires an existing record or ownership of that record. Operations are system-wide (not tenant-scoped) and serve as the building blocks of the persona capability model. Operation codes are globally unique across all categories.

**Technical Details**

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `category_id` | `uuid` | NOT NULL | -- | FK to `core.operation_category`. |
| `code` | `text` | NOT NULL | -- | Operation code (unique within category and globally). |
| `name` | `text` | NOT NULL | -- | Human-readable operation name. |
| `description` | `text` | YES | -- | Operation description. |
| `requires_record` | `boolean` | NOT NULL | `false` | Whether this operation acts on an existing record. |
| `requires_ownership` | `boolean` | NOT NULL | `false` | Whether the actor must own the record. |
| `sort_order` | `int` | NOT NULL | `0` | Display ordering within the category. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp. |
| `created_by` | `text` | NOT NULL | `'system'` | Actor who created the row. |
| `updated_at` | `timestamptz` | YES | -- | Last update timestamp. |
| `updated_by` | `text` | YES | -- | Actor who last updated the row. |

**Primary Key:** `id`

**Foreign Keys**

| Column | References | On Delete |
|---|---|---|
| `category_id` | `core.operation_category(id)` | CASCADE |

**Constraints**

| Constraint | Type | Details |
|---|---|---|
| `operation_category_code_uniq` | UNIQUE | `(category_id, code)` -- unique within category. |
| `operation_code_global_uniq` | UNIQUE | `(code)` -- globally unique across all categories. Added via deferred `ALTER TABLE`. |

**Indexes**

| Index | Columns | Filter |
|---|---|---|
| `idx_operation_category` | `category_id` | -- |
| `idx_operation_code` | `code` | -- |

**Relationships**

- **References:** `core.operation_category`
- **Referenced by:** `core.persona_capability` (via `operation_id`). Also referenced by `meta.entity_operation` via text FK on `code`.

---

### core.persona

**Functional Description**

The persona table defines permission bundles that represent user specializations such as "viewer", "agent", "manager", or "admin". Personas group operations into meaningful access profiles and can be scoped to a tenant, organizational unit, or module. They have a priority for conflict resolution when a principal holds multiple personas, and system-defined personas are protected from deletion.

**Technical Details**

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `code` | `text` | NOT NULL | -- | Globally unique persona code. |
| `name` | `text` | NOT NULL | -- | Human-readable persona name. |
| `description` | `text` | YES | -- | Persona description. |
| `scope_mode` | `text` | NOT NULL | `'tenant'` | Scope at which this persona applies. |
| `priority` | `int` | NOT NULL | `0` | Priority for conflict resolution (higher wins). |
| `is_system` | `boolean` | NOT NULL | `false` | Whether this is a system-defined persona. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp. |
| `created_by` | `text` | NOT NULL | `'system'` | Actor who created the row. |
| `updated_at` | `timestamptz` | YES | -- | Last update timestamp. |
| `updated_by` | `text` | YES | -- | Actor who last updated the row. |

**Primary Key:** `id`

**Foreign Keys:** None.

**Constraints**

| Constraint | Type | Details |
|---|---|---|
| `code` | UNIQUE | Globally unique persona code. |
| `persona_scope_mode_chk` | CHECK | `scope_mode IN ('tenant', 'ou', 'module')` |

**Indexes**

| Index | Columns | Filter |
|---|---|---|
| `idx_persona_scope_mode` | `scope_mode` | -- |
| `idx_persona_system` | `is_system` | `WHERE is_system = true` |

**Relationships**

- **References:** None.
- **Referenced by:** `core.persona_capability` (via `persona_id`), `core.principal_workspace_access` (via `persona_id`)

---

### core.persona_capability

**Functional Description**

The persona_capability table maps personas to operations, defining which atomic operations each persona can perform. Each mapping indicates whether the operation is granted and what constraint type applies. This table is the core junction of the permissions model -- it connects the "who" (persona) with the "what" (operation).

**Technical Details**

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `persona_id` | `uuid` | NOT NULL | -- | FK to `core.persona`. |
| `operation_id` | `uuid` | NOT NULL | -- | FK to `core.operation`. |
| `is_granted` | `boolean` | NOT NULL | `true` | Whether the operation is granted (true) or denied (false). |
| `constraint_type` | `text` | NOT NULL | `'none'` | Type of constraint (e.g., `none`, `owner`, `ou`). |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp. |
| `updated_at` | `timestamptz` | YES | -- | Last update timestamp. |

**Primary Key:** `id`

**Foreign Keys**

| Column | References | On Delete |
|---|---|---|
| `persona_id` | `core.persona(id)` | CASCADE |
| `operation_id` | `core.operation(id)` | CASCADE |

**Constraints**

| Constraint | Type | Details |
|---|---|---|
| `persona_capability_persona_op_uniq` | UNIQUE | `(persona_id, operation_id)` -- one mapping per persona-operation pair. |

**Indexes**

| Index | Columns | Filter |
|---|---|---|
| `idx_persona_capability_persona` | `persona_id` | -- |
| `idx_persona_capability_operation` | `operation_id` | -- |

**Relationships**

- **References:** `core.persona`, `core.operation`
- **Referenced by:** None.

---

### core.module

**Functional Description**

The module table defines logical feature and permission modules within the platform (e.g., "billing", "analytics", "supply-chain"). Modules can optionally be associated with a workspace. They are system-wide definitions that tenants subscribe to via `core.tenant_module_subscription`. Modules carry optional configuration payloads for module-specific settings.

**Technical Details**

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `code` | `text` | NOT NULL | -- | Globally unique module code. |
| `name` | `text` | NOT NULL | -- | Human-readable module name. |
| `description` | `text` | YES | -- | Module description. |
| `workspace_id` | `uuid` | YES | -- | FK to `core.workspace` (deferred). |
| `config` | `jsonb` | YES | -- | Module-specific configuration. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp. |
| `created_by` | `text` | NOT NULL | `'system'` | Actor who created the row. |
| `updated_at` | `timestamptz` | YES | -- | Last update timestamp. |
| `updated_by` | `text` | YES | -- | Actor who last updated the row. |

**Primary Key:** `id`

**Foreign Keys**

| Column | References | On Delete | Notes |
|---|---|---|---|
| `workspace_id` | `core.workspace(id)` | SET NULL | Deferred FK (`module_workspace_fk`). |

**Constraints**

| Constraint | Type | Details |
|---|---|---|
| `code` | UNIQUE | Globally unique module code. |

**Indexes**

| Index | Columns | Filter |
|---|---|---|
| `idx_module_code` | `code` | -- |
| `idx_module_workspace` | `workspace_id` | `WHERE workspace_id IS NOT NULL` |

**Relationships**

- **References:** `core.workspace`
- **Referenced by:** `core.tenant_module_subscription` (via `module_id`)

---

### core.tenant_module_subscription

**Functional Description**

The tenant_module_subscription table records which modules each tenant has activated. This is the licensing and feature gating mechanism at the module level -- a tenant must have an active subscription to a module before they can access its functionality. The `is_active` flag allows modules to be provisioned but temporarily disabled without deleting the subscription record.

**Technical Details**

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `tenant_id` | `uuid` | NOT NULL | -- | FK to `core.tenant`. |
| `module_id` | `uuid` | NOT NULL | -- | FK to `core.module`. |
| `is_active` | `boolean` | NOT NULL | `true` | Whether the subscription is currently active. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp. |
| `created_by` | `text` | NOT NULL | `'system'` | Actor who created the row. |
| `updated_at` | `timestamptz` | YES | -- | Last update timestamp. |
| `updated_by` | `text` | YES | -- | Actor who last updated the row. |

**Primary Key:** `id`

**Foreign Keys**

| Column | References | On Delete |
|---|---|---|
| `tenant_id` | `core.tenant(id)` | CASCADE |
| `module_id` | `core.module(id)` | CASCADE |

**Constraints**

| Constraint | Type | Details |
|---|---|---|
| `tenant_module_subscription_uniq` | UNIQUE | `(tenant_id, module_id)` -- one subscription per tenant per module. |

**Indexes**

| Index | Columns | Filter |
|---|---|---|
| `idx_tenant_module_sub_tenant` | `tenant_id` | -- |
| `idx_tenant_module_sub_module` | `module_id` | -- |
| `idx_tenant_module_sub_active` | `tenant_id, is_active` | `WHERE is_active = true` |

**Relationships**

- **References:** `core.tenant`, `core.module`
- **Referenced by:** None.

---

## Deferred Foreign Keys

Several foreign keys in the `core` schema are added via deferred `ALTER TABLE` statements because they reference tables defined later in the same SQL file. These are:

| Constraint Name | Source Table | Column | Target Table | On Delete |
|---|---|---|---|---|
| `pwa_principal_fk` | `core.principal_workspace_access` | `principal_id` | `core.principal(id)` | CASCADE |
| `pwa_role_fk` | `core.principal_workspace_access` | `role_id` | `core.role(id)` | SET NULL |
| `pwa_persona_fk` | `core.principal_workspace_access` | `persona_id` | `core.persona(id)` | SET NULL |
| `plo_principal_fk` | `core.principal_locale_override` | `principal_id` | `core.principal(id)` | CASCADE |
| `module_workspace_fk` | `core.module` | `workspace_id` | `core.workspace(id)` | SET NULL |

---

## Entity-Relationship Summary

```
core.tenant (root)
 +-- core.outbox
 +-- core.job --> core.job_run
 +-- core.address --> core.address_link
 +-- core.contact_point --> core.contact_phone
 +-- core.workspace_feature --> core.workspace (system-wide)
 +-- core.principal_workspace_access --> core.workspace, core.principal, core.role, core.persona
 +-- core.workspace_usage_metric --> core.workspace
 +-- core.tenant_locale_policy
 +-- core.principal_locale_override --> core.principal
 +-- core.entity_tag
 +-- core.system_config
 +-- core.feature_flag
 +-- core.principal
 |    +-- core.idp_identity
 |    +-- core.principal_profile
 |    +-- core.group_member --> core.principal_group
 |    +-- core.principal_role --> core.role
 |    +-- core.principal_ou --> core.organizational_unit (self-referencing hierarchy)
 |    +-- core.entitlement --> core.principal | core.role | core.principal_group
 +-- core.tenant_profile
 +-- core.tenant_module_subscription --> core.module --> core.workspace

core.operation_category (system-wide)
 +-- core.operation
      +-- core.persona_capability --> core.persona (system-wide)
```
