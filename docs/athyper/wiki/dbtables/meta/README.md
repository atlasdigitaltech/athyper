# Meta Schema -- Entity Metadata Engine

> The `meta` schema is the central metadata engine of Athyper. It defines the structure, behavior, security, lifecycle, and presentation of every entity (DocType) in the system. All entity definitions are tenant-scoped, versioned, and compiled into runtime-optimized snapshots.

**SQL Source Files:**
- `framework/adapters/db/src/sql/040_meta.sql` -- Core meta tables
- `framework/adapters/db/src/sql/042_meta_entity_operation.sql` -- Entity operation capabilities

**Total Tables:** 35 (+ 1 view)

---

## Table of Contents

- [Entity Registry](#entity-registry)
  - [meta.entity](#metaentity)
  - [meta.entity_version](#metaentity_version)
  - [meta.field](#metafield)
  - [meta.relation](#metarelation)
  - [meta.index_def](#metaindex_def)
- [Entity Policies](#entity-policies)
  - [meta.entity_policy](#metaentity_policy)
  - [meta.entity_compiled](#metaentity_compiled)
  - [meta.field_security_policy](#metafield_security_policy)
  - [meta.entity_operation](#metaentity_operation)
  - [meta.entity_operation_resolved (view)](#metaentity_operation_resolved-view)
- [Permission System](#permission-system)
  - [meta.permission_policy](#metapermission_policy)
  - [meta.permission_policy_version](#metapermission_policy_version)
  - [meta.permission_rule](#metapermission_rule)
  - [meta.permission_rule_operation](#metapermission_rule_operation)
  - [meta.permission_policy_compiled](#metapermission_policy_compiled)
- [Lifecycle Engine](#lifecycle-engine)
  - [meta.lifecycle](#metalifecycle)
  - [meta.lifecycle_state](#metalifecycle_state)
  - [meta.lifecycle_transition](#metalifecycle_transition)
  - [meta.lifecycle_transition_gate](#metalifecycle_transition_gate)
  - [meta.entity_lifecycle](#metaentity_lifecycle)
  - [meta.entity_lifecycle_route_compiled](#metaentity_lifecycle_route_compiled)
  - [meta.lifecycle_timer_policy](#metalifecycle_timer_policy)
- [Approval Framework](#approval-framework)
  - [meta.approval_template](#metaapproval_template)
  - [meta.approval_template_stage](#metaapproval_template_stage)
  - [meta.approval_template_rule](#metaapproval_template_rule)
  - [meta.approval_sla_policy](#metaapproval_sla_policy)
- [Schema Overlays](#schema-overlays)
  - [meta.overlay](#metaoverlay)
  - [meta.overlay_change](#metaoverlay_change)
  - [meta.entity_compiled_overlay](#metaentity_compiled_overlay)
- [Notification Configuration](#notification-configuration)
  - [meta.notification_channel](#metanotification_channel)
  - [meta.notification_provider](#metanotification_provider)
  - [meta.notification_template](#metanotification_template)
  - [meta.notification_rule](#metanotification_rule)
  - [meta.audit_policy](#metaaudit_policy)
- [Operations and Artifacts](#operations-and-artifacts)
  - [meta.migration_history](#metamigration_history)
  - [meta.publish_artifact](#metapublish_artifact)

---

## Entity Registry

The Entity Registry group defines the core DocType catalog. Every business entity (Purchase Order, Invoice, Journal Entry, etc.) is registered here with its versioned field dictionary, relationships to other entities, and index definitions. This is the foundation that all other meta subsystems reference.

---

### meta.entity

The master registry of all entity types (DocTypes) in the system. Each row represents a distinct business entity such as a Purchase Order, Invoice, or Employee record. The entity definition controls which database schema and table the entity's data lives in, what governance level applies, and which module owns it.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NO | -- | Owning tenant; FK to `core.tenant` |
| `module_id` | `text` | NO | -- | Logical module that owns this entity (e.g., `procurement`, `finance`) |
| `name` | `text` | NO | -- | Unique logical entity name within the tenant (e.g., `purchase_order`) |
| `kind` | `text` | NO | `'ent'` | Entity classification: `ref`, `ent`, `doc`, `fin`, `cfg`, `int` |
| `table_schema` | `text` | NO | `'ent'` | PostgreSQL schema where entity data is stored |
| `table_name` | `text` | NO | -- | Physical table name in the target schema |
| `naming_policy` | `jsonb` | YES | -- | Auto-naming rules (prefix, sequence, pattern) |
| `feature_flags` | `jsonb` | YES | -- | Per-entity feature toggles |
| `is_active` | `boolean` | NO | `true` | Soft-delete / deactivation flag |
| `governance_level` | `text` | NO | `'full'` | Controls which meta features apply: `full`, `light`, `audit_only` |
| `engine_tag` | `text` | YES | -- | Owning engine identifier for dashboard grouping (e.g., `posting-engine`) |
| `entity_short` | `text` | YES | -- | Short mnemonic code (PO, INV, JE) for command palette aliases and TCODE generation |
| `created_at` | `timestamptz` | NO | `now()` | Row creation timestamp |
| `created_by` | `text` | NO | -- | Creator principal identifier |
| `updated_at` | `timestamptz` | YES | -- | Last update timestamp |
| `updated_by` | `text` | YES | -- | Last updater principal identifier |

#### Primary Key

`id` (uuid)

#### Foreign Keys

| Column | References | On Delete |
|--------|-----------|-----------|
| `tenant_id` | `core.tenant(id)` | CASCADE |

#### Constraints

| Constraint | Type | Details |
|-----------|------|---------|
| `entity_kind_chk` | CHECK | `kind IN ('ref','ent','doc','fin','cfg','int')` |
| `entity_governance_level_chk` | CHECK | `governance_level IN ('full','light','audit_only')` |
| `entity_name_uniq` | UNIQUE | `(tenant_id, name)` |

**Kind values explained:**
- `ref` -- Reference/lookup data (countries, currencies)
- `ent` -- Master data entities (customers, products)
- `doc` -- Document types (invoices, purchase orders)
- `fin` -- Financial transaction entities (journal entries, postings)
- `cfg` -- Configuration entities
- `int` -- Internal/system entities

**Governance levels explained:**
- `full` -- Field dictionary, field security, permission policies, lifecycle, overlays, compiled snapshots
- `light` -- Field dictionary, permission policies, audit policy (no overlays or lifecycle)
- `audit_only` -- Audit policy only (for immutable transaction tables)

#### Indexes

| Index | Columns | Filter |
|-------|---------|--------|
| `idx_entity_module` | `(tenant_id, module_id)` | -- |
| `idx_entity_kind` | `(tenant_id, kind)` | -- |
| `idx_entity_engine_tag` | `(tenant_id, engine_tag)` | `WHERE engine_tag IS NOT NULL` |
| `idx_entity_short_uniq` | `(tenant_id, entity_short)` | `WHERE entity_short IS NOT NULL` (UNIQUE) |

#### Relationships

**Referenced by:**
- `meta.entity_version.entity_id`
- `meta.entity_policy.entity_id`
- `meta.field_security_policy.entity_id`
- `meta.overlay.base_entity_id`

---

### meta.entity_version

Implements version control for entity definitions. Each entity can have multiple versions progressing through a draft-publish-archive lifecycle. Only the `published` version is active at runtime. This enables safe schema evolution -- changes are drafted and validated before going live.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NO | -- | Owning tenant; FK to `core.tenant` |
| `entity_id` | `uuid` | NO | -- | Parent entity; FK to `meta.entity` |
| `version_no` | `int` | NO | `1` | Monotonically increasing version number |
| `status` | `text` | NO | `'draft'` | Version lifecycle status |
| `label` | `text` | YES | -- | Human-readable version label |
| `behaviors` | `jsonb` | YES | -- | Version-specific behavior configuration |
| `published_at` | `timestamptz` | YES | -- | Timestamp when version was published |
| `published_by` | `text` | YES | -- | Principal who published this version |
| `created_at` | `timestamptz` | NO | `now()` | Row creation timestamp |
| `created_by` | `text` | NO | -- | Creator principal identifier |
| `updated_at` | `timestamptz` | YES | -- | Last update timestamp |
| `updated_by` | `text` | YES | -- | Last updater principal identifier |

#### Primary Key

`id` (uuid)

#### Foreign Keys

| Column | References | On Delete |
|--------|-----------|-----------|
| `tenant_id` | `core.tenant(id)` | CASCADE |
| `entity_id` | `meta.entity(id)` | CASCADE |

#### Constraints

| Constraint | Type | Details |
|-----------|------|---------|
| `entity_version_status_chk` | CHECK | `status IN ('draft','published','archived')` |
| `entity_version_uniq` | UNIQUE | `(tenant_id, entity_id, version_no)` |

#### Indexes

| Index | Columns | Filter |
|-------|---------|--------|
| `idx_entity_version_entity_status` | `(tenant_id, entity_id, status)` | -- |

#### Relationships

**References:**
- `meta.entity(id)` via `entity_id`

**Referenced by:**
- `meta.field.entity_version_id`
- `meta.relation.entity_version_id`
- `meta.index_def.entity_version_id`
- `meta.entity_policy.entity_version_id`
- `meta.entity_compiled.entity_version_id`
- `meta.overlay.base_version_id`
- `meta.entity_compiled_overlay.entity_version_id`

---

### meta.field

The field dictionary for each entity version. Every column/attribute of an entity is registered here with its data type, UI type, validation rules, default values, and lookup configuration. Fields are scoped to a specific entity version, allowing schema evolution without breaking the published definition.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NO | -- | Owning tenant; FK to `core.tenant` |
| `entity_version_id` | `uuid` | NO | -- | Parent entity version; FK to `meta.entity_version` |
| `name` | `text` | NO | -- | Logical field name (used in API/UI) |
| `column_name` | `text` | YES | -- | Physical database column name (may differ from `name`) |
| `data_type` | `text` | NO | -- | Storage data type (e.g., `text`, `integer`, `jsonb`, `uuid`) |
| `ui_type` | `text` | YES | -- | UI rendering hint (e.g., `text-input`, `dropdown`, `date-picker`) |
| `is_required` | `boolean` | NO | `false` | Whether the field is mandatory |
| `is_unique` | `boolean` | NO | `false` | Whether a unique constraint applies |
| `is_searchable` | `boolean` | NO | `false` | Whether the field participates in full-text search |
| `is_filterable` | `boolean` | NO | `false` | Whether the field appears in filter panels |
| `default_value` | `jsonb` | YES | -- | Default value expression (static or dynamic) |
| `validation` | `jsonb` | YES | -- | Validation rules (min/max, regex, custom) |
| `lookup_config` | `jsonb` | YES | -- | Foreign lookup configuration (source entity, display field, filters) |
| `sort_order` | `int` | NO | `0` | Display ordering within the entity |
| `is_active` | `boolean` | NO | `true` | Soft-delete / deactivation flag |
| `created_at` | `timestamptz` | NO | `now()` | Row creation timestamp |
| `created_by` | `text` | NO | -- | Creator principal identifier |
| `updated_at` | `timestamptz` | YES | -- | Last update timestamp |
| `updated_by` | `text` | YES | -- | Last updater principal identifier |

#### Primary Key

`id` (uuid)

#### Foreign Keys

| Column | References | On Delete |
|--------|-----------|-----------|
| `tenant_id` | `core.tenant(id)` | CASCADE |
| `entity_version_id` | `meta.entity_version(id)` | CASCADE |

#### Constraints

| Constraint | Type | Details |
|-----------|------|---------|
| `field_name_uniq` | UNIQUE | `(tenant_id, entity_version_id, name)` |

#### Indexes

| Index | Columns | Filter |
|-------|---------|--------|
| `idx_field_entity_version` | `(tenant_id, entity_version_id)` | -- |

#### Relationships

**References:**
- `meta.entity_version(id)` via `entity_version_id`

---

### meta.relation

Defines relationships between entities at the metadata level. Each relation declares a foreign key link (belongs_to), a one-to-many link (has_many), or a many-to-many junction (m2m) between the owning entity version and a target entity. This drives automatic UI picker rendering, cascading delete behavior, and referential integrity validation.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NO | -- | Owning tenant; FK to `core.tenant` |
| `entity_version_id` | `uuid` | NO | -- | Parent entity version; FK to `meta.entity_version` |
| `name` | `text` | NO | -- | Logical relation name (e.g., `supplier`, `line_items`) |
| `relation_kind` | `text` | NO | -- | Type of relationship |
| `target_entity` | `text` | NO | -- | Target entity name (logical reference) |
| `fk_field` | `text` | YES | -- | Foreign key field name on the owning side |
| `target_key` | `text` | YES | -- | Target entity key field (defaults to `id`) |
| `on_delete` | `text` | NO | `'restrict'` | Delete behavior when target is removed |
| `ui_behavior` | `jsonb` | YES | -- | UI rendering configuration (picker type, display template) |
| `created_at` | `timestamptz` | NO | `now()` | Row creation timestamp |
| `created_by` | `text` | NO | -- | Creator principal identifier |

#### Primary Key

`id` (uuid)

#### Foreign Keys

| Column | References | On Delete |
|--------|-----------|-----------|
| `tenant_id` | `core.tenant(id)` | CASCADE |
| `entity_version_id` | `meta.entity_version(id)` | CASCADE |

#### Constraints

| Constraint | Type | Details |
|-----------|------|---------|
| `relation_kind_chk` | CHECK | `relation_kind IN ('belongs_to','has_many','m2m')` |
| `relation_on_delete_chk` | CHECK | `on_delete IN ('restrict','cascade','set_null')` |
| `relation_name_uniq` | UNIQUE | `(tenant_id, entity_version_id, name)` |

#### Indexes

None beyond the unique constraint index.

#### Relationships

**References:**
- `meta.entity_version(id)` via `entity_version_id`

---

### meta.index_def

Declarative index definitions for each entity version. Rather than writing raw DDL, administrators define indexes here and the migration engine generates the corresponding `CREATE INDEX` statements. This supports btree, GIN, GiST, and hash index methods, with optional partial index WHERE clauses.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NO | -- | Owning tenant; FK to `core.tenant` |
| `entity_version_id` | `uuid` | NO | -- | Parent entity version; FK to `meta.entity_version` |
| `name` | `text` | NO | -- | Logical index name |
| `is_unique` | `boolean` | NO | `false` | Whether this is a unique index |
| `method` | `text` | NO | `'btree'` | Index access method |
| `columns` | `jsonb` | NO | -- | Ordered list of column names (and optional sort direction) |
| `where_clause` | `text` | YES | -- | Optional partial index predicate |
| `created_at` | `timestamptz` | NO | `now()` | Row creation timestamp |
| `created_by` | `text` | NO | -- | Creator principal identifier |

#### Primary Key

`id` (uuid)

#### Foreign Keys

| Column | References | On Delete |
|--------|-----------|-----------|
| `tenant_id` | `core.tenant(id)` | CASCADE |
| `entity_version_id` | `meta.entity_version(id)` | CASCADE |

#### Constraints

| Constraint | Type | Details |
|-----------|------|---------|
| `index_method_chk` | CHECK | `method IN ('btree','gin','gist','hash')` |
| `index_def_name_uniq` | UNIQUE | `(tenant_id, entity_version_id, name)` |

#### Indexes

None beyond the unique constraint index.

#### Relationships

**References:**
- `meta.entity_version(id)` via `entity_version_id`

---

## Entity Policies

Entity Policies control runtime behavior for each entity: access mode, organizational unit scoping, audit logging, caching, field-level security, and operation capabilities. Policies can be bound to either an entity (global across versions) or a specific entity version.

---

### meta.entity_policy

Defines default behavioral policies for an entity or a specific entity version. This controls the access model (default deny vs. allow), organizational unit scoping mode, whether audit logging is enabled, data retention rules, default query filters, and caching behavior. Each policy targets either an entity or an entity version, but not both.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NO | -- | Owning tenant; FK to `core.tenant` |
| `entity_id` | `uuid` | YES | -- | Target entity (mutually exclusive with `entity_version_id`) |
| `entity_version_id` | `uuid` | YES | -- | Target entity version (mutually exclusive with `entity_id`) |
| `access_mode` | `text` | NO | `'default_deny'` | Base access control mode |
| `ou_scope_mode` | `text` | NO | `'none'` | Organizational unit filtering mode |
| `audit_mode` | `text` | NO | `'enabled'` | Whether audit logging is active |
| `retention_policy` | `jsonb` | YES | -- | Data retention rules (TTL, archive policy) |
| `default_filters` | `jsonb` | YES | -- | Default query filters applied to all reads |
| `cache_flags` | `jsonb` | YES | -- | Caching behavior (TTL, invalidation strategy) |
| `created_at` | `timestamptz` | NO | `now()` | Row creation timestamp |
| `created_by` | `text` | NO | -- | Creator principal identifier |
| `updated_at` | `timestamptz` | YES | -- | Last update timestamp |
| `updated_by` | `text` | YES | -- | Last updater principal identifier |

#### Primary Key

`id` (uuid)

#### Foreign Keys

| Column | References | On Delete |
|--------|-----------|-----------|
| `tenant_id` | `core.tenant(id)` | CASCADE |
| `entity_id` | `meta.entity(id)` | CASCADE |
| `entity_version_id` | `meta.entity_version(id)` | CASCADE |

#### Constraints

| Constraint | Type | Details |
|-----------|------|---------|
| `entity_policy_access_chk` | CHECK | `access_mode IN ('default_deny','default_allow','inherit')` |
| `entity_policy_ou_chk` | CHECK | `ou_scope_mode IN ('none','single','subtree','multi')` |
| `entity_policy_audit_chk` | CHECK | `audit_mode IN ('enabled','disabled')` |
| `entity_policy_target_chk` | CHECK | Exactly one of `entity_id` or `entity_version_id` must be non-null |

#### Indexes

| Index | Columns | Filter |
|-------|---------|--------|
| `idx_entity_policy_entity` | `(tenant_id, entity_id)` | `WHERE entity_id IS NOT NULL` |
| `idx_entity_policy_version` | `(tenant_id, entity_version_id)` | `WHERE entity_version_id IS NOT NULL` |

#### Relationships

**References:**
- `meta.entity(id)` via `entity_id`
- `meta.entity_version(id)` via `entity_version_id`

---

### meta.entity_compiled

Stores precompiled, flattened snapshots of entity metadata for fast runtime reads. When an entity version is published, the compiler gathers all fields, relations, indexes, and policies into a single JSON document and stores it here with a content hash. The runtime reads from this table to avoid joining across the full meta graph on every request.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NO | -- | Owning tenant; FK to `core.tenant` |
| `entity_version_id` | `uuid` | NO | -- | Source entity version; FK to `meta.entity_version` |
| `compiled_json` | `jsonb` | NO | -- | Complete flattened entity metadata snapshot |
| `compiled_hash` | `text` | NO | -- | Content hash for cache invalidation and deduplication |
| `generated_at` | `timestamptz` | NO | `now()` | When the compilation occurred |
| `created_at` | `timestamptz` | NO | `now()` | Row creation timestamp |
| `created_by` | `text` | NO | -- | Creator principal identifier |

#### Primary Key

`id` (uuid)

#### Foreign Keys

| Column | References | On Delete |
|--------|-----------|-----------|
| `tenant_id` | `core.tenant(id)` | CASCADE |
| `entity_version_id` | `meta.entity_version(id)` | CASCADE |

#### Constraints

| Constraint | Type | Details |
|-----------|------|---------|
| `entity_compiled_hash_uniq` | UNIQUE | `(tenant_id, entity_version_id, compiled_hash)` |

#### Indexes

None beyond the unique constraint index.

#### Relationships

**References:**
- `meta.entity_version(id)` via `entity_version_id`

---

### meta.field_security_policy

Defines fine-grained, field-level access control policies. Each row specifies read, write, or both access restrictions on a specific field path within an entity. Policies can be scoped globally, to a module, entity, entity version, or individual record. They support role-based and ABAC (attribute-based) conditions, with configurable data masking strategies for unauthorized access (redact, hash, partial mask, null, or remove).

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NO | -- | Owning tenant; FK to `core.tenant` |
| `entity_id` | `uuid` | NO | -- | Target entity; FK to `meta.entity` |
| `field_path` | `text` | NO | -- | Dot-notation path to the field (supports nested fields) |
| `policy_type` | `text` | NO | -- | Access control direction |
| `role_list` | `text[]` | YES | -- | Array of role codes that this policy applies to |
| `abac_condition` | `jsonb` | YES | -- | ABAC condition expression for attribute-based evaluation |
| `mask_strategy` | `text` | YES | -- | How to mask data when access is denied |
| `mask_config` | `jsonb` | YES | -- | Additional masking configuration (partial mask pattern, etc.) |
| `scope` | `text` | NO | `'entity'` | Hierarchical scope of the policy |
| `scope_ref` | `uuid` | YES | -- | Reference ID for module/version/record scoping |
| `priority` | `integer` | NO | `100` | Evaluation priority (lower = higher priority) |
| `is_active` | `boolean` | NO | `true` | Whether the policy is currently enforced |
| `metadata` | `jsonb` | YES | -- | Additional policy metadata |
| `created_at` | `timestamptz` | NO | `now()` | Row creation timestamp |
| `created_by` | `text` | NO | -- | Creator principal identifier |
| `updated_at` | `timestamptz` | YES | -- | Last update timestamp |
| `updated_by` | `text` | YES | -- | Last updater principal identifier |
| `version` | `integer` | NO | `1` | Optimistic locking version |

#### Primary Key

`id` (uuid)

#### Foreign Keys

| Column | References | On Delete |
|--------|-----------|-----------|
| `tenant_id` | `core.tenant(id)` | CASCADE |
| `entity_id` | `meta.entity(id)` | CASCADE |

#### Constraints

| Constraint | Type | Details |
|-----------|------|---------|
| `field_security_policy_type_chk` | CHECK | `policy_type IN ('read', 'write', 'both')` |
| `field_security_mask_strategy_chk` | CHECK | `mask_strategy IN ('null', 'redact', 'hash', 'partial', 'remove')` |
| `field_security_scope_chk` | CHECK | `scope IN ('global', 'module', 'entity', 'entity_version', 'record')` |
| `field_security_policy_uniq` | UNIQUE | `(tenant_id, entity_id, field_path, policy_type, scope, scope_ref)` |

#### Indexes

| Index | Columns | Filter |
|-------|---------|--------|
| `idx_field_security_entity` | `(tenant_id, entity_id)` | -- |
| `idx_field_security_field` | `(field_path)` | -- |
| `idx_field_security_type` | `(policy_type)` | -- |
| `idx_field_security_active` | `(is_active)` | `WHERE is_active = true` |
| `idx_field_security_scope` | `(scope, scope_ref)` | -- |
| `idx_field_security_priority` | `(entity_id, priority)` | -- |
| `idx_field_security_lookup` | `(tenant_id, entity_id, field_path, policy_type, is_active)` | -- |

#### Relationships

**References:**
- `meta.entity(id)` via `entity_id`

---

### meta.entity_operation

Declares which operations (create, read, update, delete, approve, post, etc.) are available for each entity type and how they appear in the UI. This follows a two-tier resolution model: system defaults (where `tenant_id IS NULL`) provide baseline capabilities, and tenant-specific rows override those defaults. Each operation is configured with its UI surface (list page, detail page, both, palette-only, or hidden), placement (primary button, toolbar, overflow menu, context menu, command palette), and execution handler (navigate, API call, modal, inline component).

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | YES | -- | Owning tenant (NULL = system default); FK to `core.tenant` |
| `entity_name` | `text` | NO | -- | Logical entity key (matches `meta.entity.name`) |
| `operation_code` | `text` | NO | -- | Operation code; FK to `core.operation(code)` |
| `surface` | `text` | NO | `'BOTH'` | UI surface where the operation appears |
| `placement` | `text` | NO | `'TOOLBAR'` | How the operation is rendered on its surface |
| `handler_type` | `text` | NO | `'API'` | Execution dispatch method |
| `handler_target` | `text` | YES | -- | Route template, endpoint key, modal key, or component key |
| `requires_record` | `boolean` | NO | `false` | Whether a selected record is required to execute |
| `sort_order` | `int` | NO | `0` | Display ordering among operations |
| `label_override` | `text` | YES | -- | Custom label (NULL inherits from `core.operation.name`) |
| `icon_override` | `text` | YES | -- | Custom icon (NULL inherits category default) |
| `tcode_alias` | `text` | YES | -- | SAP-style transaction code alias (e.g., PO01) |
| `is_enabled` | `boolean` | NO | `true` | Whether the operation is active (tenant can suppress defaults) |
| `created_at` | `timestamptz` | NO | `now()` | Row creation timestamp |
| `created_by` | `text` | NO | `'system'` | Creator principal identifier |
| `updated_at` | `timestamptz` | YES | -- | Last update timestamp |
| `updated_by` | `text` | YES | -- | Last updater principal identifier |

#### Primary Key

`id` (uuid)

#### Foreign Keys

| Column | References | On Delete |
|--------|-----------|-----------|
| `tenant_id` | `core.tenant(id)` | CASCADE |
| `operation_code` | `core.operation(code)` | RESTRICT |

#### Constraints

| Constraint | Type | Details |
|-----------|------|---------|
| `entity_operation_surface_chk` | CHECK | `surface IN ('LIST', 'DETAIL', 'BOTH', 'PALETTE_ONLY', 'HIDDEN')` |
| `entity_operation_placement_chk` | CHECK | `placement IN ('PRIMARY', 'TOOLBAR', 'OVERFLOW', 'CONTEXT', 'COMMAND')` |
| `entity_operation_handler_chk` | CHECK | `handler_type IN ('NAVIGATE', 'API', 'MODAL', 'INLINE')` |
| `entity_operation_surface_placement_chk` | CHECK | Prevents nonsensical combos: HIDDEN+PRIMARY, PALETTE_ONLY+PRIMARY/TOOLBAR |
| `entity_operation_uniq` | UNIQUE | `(tenant_id, entity_name, operation_code)` |

**Surface values explained:**
- `LIST` -- Appears on list pages only
- `DETAIL` -- Appears on detail/form pages only
- `BOTH` -- Appears on both list and detail pages
- `PALETTE_ONLY` -- Only accessible via command palette (no visible button)
- `HIDDEN` -- Disabled from all UI surfaces (still in the operation catalog)

**Placement values explained:**
- `PRIMARY` -- Prominent call-to-action button
- `TOOLBAR` -- Standard toolbar button row
- `OVERFLOW` -- Hidden in "more" / overflow menu
- `CONTEXT` -- Right-click / context menu
- `COMMAND` -- Command palette only (keyboard shortcut driven)

**Handler types explained:**
- `NAVIGATE` -- Client-side `router.push(handlerTarget)`
- `API` -- POST to entity action endpoint
- `MODAL` -- Opens a modal dialog by key
- `INLINE` -- Renders an inline component

#### Indexes

| Index | Columns | Filter |
|-------|---------|--------|
| `idx_entity_operation_system_uniq` | `(entity_name, operation_code)` | `WHERE tenant_id IS NULL` (UNIQUE) |
| `idx_entity_operation_entity` | `(entity_name)` | -- |
| `idx_entity_operation_tenant` | `(tenant_id, entity_name)` | `WHERE tenant_id IS NOT NULL` |
| `idx_entity_operation_system` | `(entity_name)` | `WHERE tenant_id IS NULL` |

#### Relationships

**References:**
- `core.tenant(id)` via `tenant_id`
- `core.operation(code)` via `operation_code`

**Referenced by:**
- `meta.entity_operation_resolved` (view)

---

### meta.entity_operation_resolved (view)

A read-only view that materializes the two-tier overlay resolution of entity operations. For each system default row, if a tenant override exists for the same `(entity_name, operation_code)`, the tenant values take precedence. Otherwise, the system defaults are used. The `is_tenant_override` flag indicates which rows have been customized by the tenant.

**Usage:** `SELECT * FROM meta.entity_operation_resolved WHERE tenant_id = '<uuid>';`

#### Columns

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` | Resolved row ID (tenant override ID if present, otherwise system default ID) |
| `tenant_id` | `uuid` | Tenant ID (from the tenant override join) |
| `entity_name` | `text` | Logical entity key |
| `operation_code` | `text` | Operation code |
| `surface` | `text` | Resolved UI surface |
| `placement` | `text` | Resolved placement |
| `handler_type` | `text` | Resolved handler type |
| `handler_target` | `text` | Resolved handler target |
| `requires_record` | `boolean` | Whether a selected record is required |
| `sort_order` | `int` | Display ordering |
| `label_override` | `text` | Custom label |
| `icon_override` | `text` | Custom icon |
| `tcode_alias` | `text` | Transaction code alias |
| `is_enabled` | `boolean` | Whether the operation is enabled |
| `is_tenant_override` | `boolean` | `true` if a tenant-specific override exists |

#### Resolution Logic

```sql
FROM meta.entity_operation s                     -- system defaults (tenant_id IS NULL)
LEFT JOIN meta.entity_operation t                 -- tenant overrides
  ON  t.entity_name = s.entity_name
  AND t.operation_code = s.operation_code
  AND t.tenant_id IS NOT NULL
WHERE s.tenant_id IS NULL
```

Each column uses `COALESCE(t.column, s.column)` to prefer the tenant override when present.

---

## Permission System

The Permission System provides a versioned, compilable authorization framework. Permissions are organized into policies (containers), which have versioned snapshots of rules. Each rule specifies a subject (role, group, user, or service), a scope, an effect (allow/deny), and conditions. Rules are linked to specific operations via a junction table. The compiled form flattens the rule graph for fast runtime evaluation.

---

### meta.permission_policy

Top-level container for a group of permission rules. Policies are tenant-scoped and named, with a scope type that determines what level of the system they govern (global, module, entity, or entity version). Policies can originate from the system or be user-defined.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NO | -- | Owning tenant; FK to `core.tenant` |
| `name` | `text` | NO | -- | Unique policy name within the tenant |
| `description` | `text` | YES | -- | Human-readable description |
| `scope_type` | `text` | NO | -- | Governance scope level |
| `scope_key` | `text` | YES | -- | Specific scope identifier (module name, entity name, etc.) |
| `source_type` | `text` | NO | `'system'` | Origin of the policy (system-defined or user-created) |
| `source_ref` | `text` | YES | -- | External reference identifier |
| `is_active` | `boolean` | NO | `true` | Whether the policy is currently active |
| `created_at` | `timestamptz` | NO | `now()` | Row creation timestamp |
| `created_by` | `text` | NO | -- | Creator principal identifier |
| `updated_at` | `timestamptz` | YES | -- | Last update timestamp |
| `updated_by` | `text` | YES | -- | Last updater principal identifier |

#### Primary Key

`id` (uuid)

#### Foreign Keys

| Column | References | On Delete |
|--------|-----------|-----------|
| `tenant_id` | `core.tenant(id)` | CASCADE |

#### Constraints

| Constraint | Type | Details |
|-----------|------|---------|
| `permission_policy_scope_chk` | CHECK | `scope_type IN ('global','module','entity','entity_version')` |
| `permission_policy_name_uniq` | UNIQUE | `(tenant_id, name)` |

#### Indexes

None beyond the unique constraint index.

#### Relationships

**Referenced by:**
- `meta.permission_policy_version.permission_policy_id`

---

### meta.permission_policy_version

Implements version control for permission policies. Each policy can have multiple versions progressing through draft, published, and archived states. Once published, a version is immutable -- any changes require creating a new version. This ensures audit traceability and safe rollback of permission changes.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NO | -- | Owning tenant; FK to `core.tenant` |
| `permission_policy_id` | `uuid` | NO | -- | Parent policy; FK to `meta.permission_policy` |
| `version_no` | `int` | NO | `1` | Monotonically increasing version number |
| `status` | `text` | NO | `'draft'` | Version lifecycle status |
| `published_at` | `timestamptz` | YES | -- | Timestamp when version was published |
| `published_by` | `text` | YES | -- | Principal who published this version |
| `created_at` | `timestamptz` | NO | `now()` | Row creation timestamp |
| `created_by` | `text` | NO | -- | Creator principal identifier |

#### Primary Key

`id` (uuid)

#### Foreign Keys

| Column | References | On Delete |
|--------|-----------|-----------|
| `tenant_id` | `core.tenant(id)` | CASCADE |
| `permission_policy_id` | `meta.permission_policy(id)` | CASCADE |

#### Constraints

| Constraint | Type | Details |
|-----------|------|---------|
| `policy_version_status_chk` | CHECK | `status IN ('draft','published','archived')` |
| `policy_version_uniq` | UNIQUE | `(tenant_id, permission_policy_id, version_no)` |

#### Indexes

None beyond the unique constraint index.

#### Relationships

**References:**
- `meta.permission_policy(id)` via `permission_policy_id`

**Referenced by:**
- `meta.permission_rule.policy_version_id`
- `meta.permission_policy_compiled.policy_version_id`

---

### meta.permission_rule

The core rule logic for the permission system. Each rule is bound to a specific policy version and specifies: who (subject), where (scope), what effect (allow/deny), under what conditions, and at what priority. Rules are immutable once their parent policy version is published. Multiple rules can exist per policy version, evaluated in priority order with deny-wins semantics.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NO | -- | Owning tenant; FK to `core.tenant` |
| `policy_version_id` | `uuid` | NO | -- | Parent policy version; FK to `meta.permission_policy_version` |
| `scope_type` | `text` | NO | -- | Scope level the rule applies to |
| `scope_key` | `text` | YES | -- | Specific scope identifier |
| `subject_type` | `text` | NO | -- | Type of security principal |
| `subject_key` | `text` | NO | -- | Identifier of the specific principal |
| `effect` | `text` | NO | -- | Whether the rule allows or denies access |
| `conditions` | `jsonb` | YES | -- | Additional evaluation conditions (ABAC expressions) |
| `priority` | `int` | NO | `100` | Evaluation priority (lower = evaluated first) |
| `is_active` | `boolean` | NO | `true` | Whether the rule is currently active |
| `comment` | `text` | YES | -- | Administrative note explaining the rule's purpose |
| `created_at` | `timestamptz` | NO | `now()` | Row creation timestamp |
| `created_by` | `text` | NO | -- | Creator principal identifier |

#### Primary Key

`id` (uuid)

#### Foreign Keys

| Column | References | On Delete |
|--------|-----------|-----------|
| `tenant_id` | `core.tenant(id)` | CASCADE |
| `policy_version_id` | `meta.permission_policy_version(id)` | CASCADE |

#### Constraints

| Constraint | Type | Details |
|-----------|------|---------|
| `rule_scope_chk` | CHECK | `scope_type IN ('global','module','entity','entity_version','record')` |
| `rule_subject_chk` | CHECK | `subject_type IN ('kc_role','kc_group','user','service')` |
| `rule_effect_chk` | CHECK | `effect IN ('allow','deny')` |

#### Indexes

| Index | Columns | Filter |
|-------|---------|--------|
| `idx_permission_rule_lookup` | `(tenant_id, policy_version_id, scope_type, scope_key, subject_type, subject_key, priority)` | -- |

#### Relationships

**References:**
- `meta.permission_policy_version(id)` via `policy_version_id`

**Referenced by:**
- `meta.permission_rule_operation.permission_rule_id`

---

### meta.permission_rule_operation

Junction table linking permission rules to the specific operations they govern. A single rule can apply to multiple operations, and each link can carry additional per-operation constraints. This decouples the rule logic (who/where/effect) from the specific actions it covers (create, read, update, delete, approve, etc.).

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NO | -- | Owning tenant; FK to `core.tenant` |
| `permission_rule_id` | `uuid` | NO | -- | Parent rule; FK to `meta.permission_rule` |
| `operation_id` | `uuid` | NO | -- | Target operation; FK to `core.operation` |
| `operation_constraints` | `jsonb` | YES | -- | Per-operation constraint overrides |
| `created_at` | `timestamptz` | NO | `now()` | Row creation timestamp |
| `created_by` | `text` | NO | -- | Creator principal identifier |

#### Primary Key

`id` (uuid)

#### Foreign Keys

| Column | References | On Delete |
|--------|-----------|-----------|
| `tenant_id` | `core.tenant(id)` | CASCADE |
| `permission_rule_id` | `meta.permission_rule(id)` | CASCADE |
| `operation_id` | `core.operation(id)` | RESTRICT |

#### Constraints

| Constraint | Type | Details |
|-----------|------|---------|
| `rule_operation_uniq` | UNIQUE | `(tenant_id, permission_rule_id, operation_id)` |

#### Indexes

| Index | Columns | Filter |
|-------|---------|--------|
| `idx_rule_operation_op` | `(tenant_id, operation_id)` | -- |

#### Relationships

**References:**
- `meta.permission_rule(id)` via `permission_rule_id`
- `core.operation(id)` via `operation_id`

---

### meta.permission_policy_compiled

Stores pre-resolved permission rule graphs for fast runtime authorization evaluation. When a policy version is published, all its rules and operation links are flattened into a single JSON document with a content hash. The authorization engine reads from this table rather than traversing the full rule graph on every access check.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NO | -- | Owning tenant; FK to `core.tenant` |
| `policy_version_id` | `uuid` | NO | -- | Source policy version; FK to `meta.permission_policy_version` |
| `compiled_json` | `jsonb` | NO | -- | Flattened rule graph for runtime evaluation |
| `compiled_hash` | `text` | NO | -- | Content hash for cache invalidation and deduplication |
| `generated_at` | `timestamptz` | NO | `now()` | When the compilation occurred |
| `created_at` | `timestamptz` | NO | `now()` | Row creation timestamp |
| `created_by` | `text` | NO | -- | Creator principal identifier |

#### Primary Key

`id` (uuid)

#### Foreign Keys

| Column | References | On Delete |
|--------|-----------|-----------|
| `tenant_id` | `core.tenant(id)` | CASCADE |
| `policy_version_id` | `meta.permission_policy_version(id)` | CASCADE |

#### Constraints

| Constraint | Type | Details |
|-----------|------|---------|
| `policy_compiled_hash_uniq` | UNIQUE | `(tenant_id, policy_version_id, compiled_hash)` |

#### Indexes

None beyond the unique constraint index.

#### Relationships

**References:**
- `meta.permission_policy_version(id)` via `policy_version_id`

---

## Lifecycle Engine

The Lifecycle Engine implements configurable state machines for entity types. Each lifecycle definition contains an ordered set of states and allowed transitions between them. Transitions can be gated by permission checks, approval workflows, conditions, and threshold rules. Lifecycles are bound to entity types with priority-based resolution, and the full routing graph is compiled for fast runtime lookups.

---

### meta.lifecycle

Defines a reusable lifecycle (state machine) with versioning. A lifecycle represents a business process flow such as "Document Approval" or "Procurement Cycle." Multiple entity types can share the same lifecycle definition. Each lifecycle can be versioned independently, allowing process evolution without disrupting active instances.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NO | -- | Owning tenant; FK to `core.tenant` |
| `code` | `text` | NO | -- | Unique lifecycle code within the tenant+version |
| `name` | `text` | NO | -- | Human-readable lifecycle name |
| `description` | `text` | YES | -- | Detailed description of the lifecycle's purpose |
| `version_no` | `int` | NO | `1` | Version number for lifecycle evolution |
| `is_active` | `boolean` | NO | `true` | Whether this lifecycle version is active |
| `config` | `jsonb` | YES | -- | Additional lifecycle configuration |
| `created_at` | `timestamptz` | NO | `now()` | Row creation timestamp |
| `created_by` | `text` | NO | -- | Creator principal identifier |

#### Primary Key

`id` (uuid)

#### Foreign Keys

| Column | References | On Delete |
|--------|-----------|-----------|
| `tenant_id` | `core.tenant(id)` | CASCADE |

#### Constraints

| Constraint | Type | Details |
|-----------|------|---------|
| `lifecycle_code_uniq` | UNIQUE | `(tenant_id, code, version_no)` |

#### Indexes

None beyond the unique constraint index.

#### Relationships

**Referenced by:**
- `meta.lifecycle_state.lifecycle_id`
- `meta.lifecycle_transition.lifecycle_id`
- `meta.entity_lifecycle.lifecycle_id`

---

### meta.lifecycle_state

Defines the individual states within a lifecycle. Each state has a unique code within its lifecycle, a display name, a terminal flag (indicating whether the state is a final/end state), and a sort order for UI rendering. Examples include DRAFT, PENDING_APPROVAL, APPROVED, REJECTED, CANCELLED, and CLOSED.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NO | -- | Owning tenant; FK to `core.tenant` |
| `lifecycle_id` | `uuid` | NO | -- | Parent lifecycle; FK to `meta.lifecycle` |
| `code` | `text` | NO | -- | Unique state code within the lifecycle |
| `name` | `text` | NO | -- | Human-readable state name |
| `is_terminal` | `boolean` | NO | `false` | Whether this is an end state (no outgoing transitions) |
| `sort_order` | `int` | NO | `0` | Display ordering within the lifecycle |
| `config` | `jsonb` | YES | -- | State-specific configuration (colors, icons, behaviors) |
| `created_at` | `timestamptz` | NO | `now()` | Row creation timestamp |
| `created_by` | `text` | NO | -- | Creator principal identifier |

#### Primary Key

`id` (uuid)

#### Foreign Keys

| Column | References | On Delete |
|--------|-----------|-----------|
| `tenant_id` | `core.tenant(id)` | CASCADE |
| `lifecycle_id` | `meta.lifecycle(id)` | CASCADE |

#### Constraints

| Constraint | Type | Details |
|-----------|------|---------|
| `lifecycle_state_code_uniq` | UNIQUE | `(tenant_id, lifecycle_id, code)` |

#### Indexes

None beyond the unique constraint index.

#### Relationships

**References:**
- `meta.lifecycle(id)` via `lifecycle_id`

**Referenced by:**
- `meta.lifecycle_transition.from_state_id`
- `meta.lifecycle_transition.to_state_id`

---

### meta.lifecycle_transition

Defines the allowed transitions between lifecycle states. Each transition specifies a source state, a destination state, and the operation code that triggers the transition. Transitions can be individually activated or deactivated and carry additional configuration for UI rendering and behavior customization.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NO | -- | Owning tenant; FK to `core.tenant` |
| `lifecycle_id` | `uuid` | NO | -- | Parent lifecycle; FK to `meta.lifecycle` |
| `from_state_id` | `uuid` | NO | -- | Source state; FK to `meta.lifecycle_state` |
| `to_state_id` | `uuid` | NO | -- | Destination state; FK to `meta.lifecycle_state` |
| `operation_code` | `text` | NO | -- | Operation that triggers this transition (e.g., `submit`, `approve`, `reject`) |
| `is_active` | `boolean` | NO | `true` | Whether this transition is currently allowed |
| `config` | `jsonb` | YES | -- | Additional transition configuration |
| `created_at` | `timestamptz` | NO | `now()` | Row creation timestamp |
| `created_by` | `text` | NO | -- | Creator principal identifier |

#### Primary Key

`id` (uuid)

#### Foreign Keys

| Column | References | On Delete |
|--------|-----------|-----------|
| `tenant_id` | `core.tenant(id)` | CASCADE |
| `lifecycle_id` | `meta.lifecycle(id)` | CASCADE |
| `from_state_id` | `meta.lifecycle_state(id)` | CASCADE |
| `to_state_id` | `meta.lifecycle_state(id)` | CASCADE |

#### Constraints

None beyond foreign key constraints.

#### Indexes

| Index | Columns | Filter |
|-------|---------|--------|
| `idx_transition_lookup` | `(tenant_id, lifecycle_id, from_state_id, operation_code)` | -- |

#### Relationships

**References:**
- `meta.lifecycle(id)` via `lifecycle_id`
- `meta.lifecycle_state(id)` via `from_state_id`
- `meta.lifecycle_state(id)` via `to_state_id`

**Referenced by:**
- `meta.lifecycle_transition_gate.transition_id`

---

### meta.lifecycle_transition_gate

Attaches prerequisite conditions to lifecycle transitions. A gate can require specific permission operations to be satisfied, link to an approval template that must complete, evaluate dynamic conditions, and enforce threshold rules (e.g., amount limits). Multiple gates can be attached to a single transition, all of which must pass for the transition to proceed.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NO | -- | Owning tenant; FK to `core.tenant` |
| `transition_id` | `uuid` | NO | -- | Parent transition; FK to `meta.lifecycle_transition` |
| `required_operations` | `jsonb` | YES | -- | List of operation codes that must be permitted |
| `approval_template_id` | `uuid` | YES | -- | Approval template that must complete (logical reference) |
| `conditions` | `jsonb` | YES | -- | Dynamic condition expressions |
| `threshold_rules` | `jsonb` | YES | -- | Threshold-based rules (e.g., amount > X requires approval) |
| `created_at` | `timestamptz` | NO | `now()` | Row creation timestamp |
| `created_by` | `text` | NO | -- | Creator principal identifier |

#### Primary Key

`id` (uuid)

#### Foreign Keys

| Column | References | On Delete |
|--------|-----------|-----------|
| `tenant_id` | `core.tenant(id)` | CASCADE |
| `transition_id` | `meta.lifecycle_transition(id)` | CASCADE |

#### Constraints

None beyond foreign key constraints.

#### Indexes

None.

#### Relationships

**References:**
- `meta.lifecycle_transition(id)` via `transition_id`

---

### meta.entity_lifecycle

Binds entity types to lifecycle definitions. A single entity type can be bound to multiple lifecycle definitions with priority-based resolution -- the highest-priority (lowest number) matching lifecycle is selected at runtime. Conditions can further refine which lifecycle applies based on entity attributes (e.g., a Purchase Order above a threshold amount uses a stricter approval lifecycle).

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NO | -- | Owning tenant; FK to `core.tenant` |
| `entity_name` | `text` | NO | -- | Logical entity name (matches `meta.entity.name`) |
| `lifecycle_id` | `uuid` | NO | -- | Target lifecycle; FK to `meta.lifecycle` |
| `conditions` | `jsonb` | YES | -- | Conditional binding rules (attribute-based selection) |
| `priority` | `int` | NO | `100` | Resolution priority (lower = higher priority) |
| `created_at` | `timestamptz` | NO | `now()` | Row creation timestamp |
| `created_by` | `text` | NO | -- | Creator principal identifier |

#### Primary Key

`id` (uuid)

#### Foreign Keys

| Column | References | On Delete |
|--------|-----------|-----------|
| `tenant_id` | `core.tenant(id)` | CASCADE |
| `lifecycle_id` | `meta.lifecycle(id)` | CASCADE |

#### Constraints

None beyond foreign key constraints.

#### Indexes

| Index | Columns | Filter |
|-------|---------|--------|
| `idx_entity_lifecycle_resolution` | `(tenant_id, entity_name, priority)` | -- |

#### Relationships

**References:**
- `meta.lifecycle(id)` via `lifecycle_id`

---

### meta.entity_lifecycle_route_compiled

Stores precompiled lifecycle routing information for each entity type. The compiled JSON contains the full state machine graph (states, transitions, gates, approval templates) flattened for a specific entity, enabling fast runtime resolution without traversing the full lifecycle meta graph. Content-addressed via `compiled_hash` for cache invalidation.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NO | -- | Owning tenant; FK to `core.tenant` |
| `entity_name` | `text` | NO | -- | Logical entity name |
| `compiled_json` | `jsonb` | NO | -- | Flattened lifecycle routing graph |
| `compiled_hash` | `text` | NO | -- | Content hash for deduplication and cache invalidation |
| `generated_at` | `timestamptz` | NO | `now()` | When the compilation occurred |
| `created_at` | `timestamptz` | NO | `now()` | Row creation timestamp |
| `created_by` | `text` | NO | -- | Creator principal identifier |

#### Primary Key

`id` (uuid)

#### Foreign Keys

| Column | References | On Delete |
|--------|-----------|-----------|
| `tenant_id` | `core.tenant(id)` | CASCADE |

#### Constraints

| Constraint | Type | Details |
|-----------|------|---------|
| `route_compiled_hash_uniq` | UNIQUE | `(tenant_id, entity_name, compiled_hash)` |

#### Indexes

None beyond the unique constraint index.

#### Relationships

No direct foreign key references to other meta tables (uses `entity_name` text reference).

---

### meta.lifecycle_timer_policy

Defines timer-based automation policies for lifecycle states. These policies drive scheduled actions such as auto-close (close inactive items after N days), auto-cancel (cancel stale drafts), and reminders (notify approvers of pending items). Each policy contains a set of rules encoded in JSON that specify the timer conditions and actions.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NO | -- | Owning tenant; FK to `core.tenant` |
| `code` | `text` | NO | -- | Unique policy code within the tenant |
| `name` | `text` | NO | -- | Human-readable policy name |
| `rules` | `jsonb` | NO | -- | Timer rule definitions (triggers, conditions, actions) |
| `created_at` | `timestamptz` | NO | `now()` | Row creation timestamp |
| `created_by` | `text` | NO | -- | Creator principal identifier |

#### Primary Key

`id` (uuid)

#### Foreign Keys

| Column | References | On Delete |
|--------|-----------|-----------|
| `tenant_id` | `core.tenant(id)` | CASCADE |

#### Constraints

| Constraint | Type | Details |
|-----------|------|---------|
| `lifecycle_timer_policy_code_uniq` | UNIQUE | `(tenant_id, code)` |

#### Indexes

None beyond the unique constraint index.

#### Relationships

No direct foreign key references to or from other tables.

---

## Approval Framework

The Approval Framework provides configurable multi-stage approval workflows. Templates define the stages (serial or parallel), routing rules determine who receives approval tasks based on conditions (amount thresholds, organizational unit, etc.), and SLA policies enforce response time expectations with escalation chains.

---

### meta.approval_template

Defines reusable multi-stage approval workflow templates. Each template has a unique code, configurable behaviors (e.g., skip rules, delegation), and an escalation style. Templates are versioned and can be compiled into optimized snapshots. They are referenced by lifecycle transition gates to require approvals before state changes.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NO | -- | Owning tenant; FK to `core.tenant` |
| `code` | `text` | NO | -- | Unique template code within the tenant+version |
| `name` | `text` | NO | -- | Human-readable template name |
| `behaviors` | `jsonb` | YES | -- | Behavior configuration (skip rules, delegation, etc.) |
| `escalation_style` | `text` | YES | -- | Escalation behavior type |
| `version_no` | `int` | NO | `1` | Version number for template evolution |
| `is_active` | `boolean` | NO | `true` | Whether this template version is active |
| `compiled_json` | `jsonb` | YES | -- | Pre-compiled template snapshot |
| `compiled_hash` | `text` | YES | -- | Content hash of the compiled snapshot |
| `created_at` | `timestamptz` | NO | `now()` | Row creation timestamp |
| `created_by` | `text` | NO | -- | Creator principal identifier |
| `updated_at` | `timestamptz` | YES | -- | Last update timestamp |
| `updated_by` | `text` | YES | -- | Last updater principal identifier |

#### Primary Key

`id` (uuid)

#### Foreign Keys

| Column | References | On Delete |
|--------|-----------|-----------|
| `tenant_id` | `core.tenant(id)` | CASCADE |

#### Constraints

| Constraint | Type | Details |
|-----------|------|---------|
| `approval_template_code_version_uniq` | UNIQUE | `(tenant_id, code, version_no)` |

#### Indexes

| Index | Columns | Filter |
|-------|---------|--------|
| `idx_approval_template_active` | `(tenant_id, code, is_active)` | `WHERE is_active = true` |

#### Relationships

**Referenced by:**
- `meta.approval_template_stage.approval_template_id`
- `meta.approval_template_rule.approval_template_id`

---

### meta.approval_template_stage

Defines individual stages within an approval template. Stages are numbered sequentially and can execute in serial (one after another) or parallel (all at once) mode. A quorum configuration specifies how many approvals are needed to pass the stage (e.g., all, majority, any one).

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NO | -- | Owning tenant; FK to `core.tenant` |
| `approval_template_id` | `uuid` | NO | -- | Parent template; FK to `meta.approval_template` |
| `stage_no` | `int` | NO | -- | Sequential stage number |
| `name` | `text` | YES | -- | Human-readable stage name |
| `mode` | `text` | NO | `'serial'` | Execution mode for this stage |
| `quorum` | `jsonb` | YES | -- | Quorum rules (e.g., `{"type": "all"}`, `{"type": "majority"}`, `{"type": "count", "value": 2}`) |
| `created_at` | `timestamptz` | NO | `now()` | Row creation timestamp |
| `created_by` | `text` | NO | -- | Creator principal identifier |

#### Primary Key

`id` (uuid)

#### Foreign Keys

| Column | References | On Delete |
|--------|-----------|-----------|
| `tenant_id` | `core.tenant(id)` | CASCADE |
| `approval_template_id` | `meta.approval_template(id)` | CASCADE |

#### Constraints

| Constraint | Type | Details |
|-----------|------|---------|
| `stage_mode_chk` | CHECK | `mode IN ('serial','parallel')` |
| `template_stage_uniq` | UNIQUE | `(tenant_id, approval_template_id, stage_no)` |

#### Indexes

None beyond the unique constraint index.

#### Relationships

**References:**
- `meta.approval_template(id)` via `approval_template_id`

---

### meta.approval_template_rule

Defines routing rules that determine who receives approval tasks. Rules are evaluated in priority order against the approval context (amount, organizational unit, document type, etc.). The `conditions` JSONB defines the matching criteria, and `assign_to` specifies the approver assignment (specific user, role, manager chain, OU head, etc.).

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NO | -- | Owning tenant; FK to `core.tenant` |
| `approval_template_id` | `uuid` | NO | -- | Parent template; FK to `meta.approval_template` |
| `priority` | `int` | NO | `100` | Evaluation priority (lower = evaluated first) |
| `conditions` | `jsonb` | NO | -- | Matching criteria (OU, amount threshold, category, etc.) |
| `assign_to` | `jsonb` | NO | -- | Approver assignment configuration |
| `created_at` | `timestamptz` | NO | `now()` | Row creation timestamp |
| `created_by` | `text` | NO | -- | Creator principal identifier |

#### Primary Key

`id` (uuid)

#### Foreign Keys

| Column | References | On Delete |
|--------|-----------|-----------|
| `tenant_id` | `core.tenant(id)` | CASCADE |
| `approval_template_id` | `meta.approval_template(id)` | CASCADE |

#### Constraints

None beyond foreign key constraints.

#### Indexes

| Index | Columns | Filter |
|-------|---------|--------|
| `idx_approval_template_rule` | `(tenant_id, approval_template_id, priority)` | -- |

#### Relationships

**References:**
- `meta.approval_template(id)` via `approval_template_id`

---

### meta.approval_sla_policy

Defines Service Level Agreement policies for approval workflows. Each policy contains timer configurations for reminders and escalation chains that activate when approval tasks are not completed within the expected timeframe. Policies are referenced by approval templates to enforce response time expectations.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NO | -- | Owning tenant; FK to `core.tenant` |
| `code` | `text` | NO | -- | Unique SLA policy code within the tenant |
| `name` | `text` | NO | -- | Human-readable policy name |
| `timers` | `jsonb` | NO | -- | Timer configurations (reminder after X hours, escalate after Y hours) |
| `escalation_chain` | `jsonb` | YES | -- | Escalation path (next approver, skip level, etc.) |
| `created_at` | `timestamptz` | NO | `now()` | Row creation timestamp |
| `created_by` | `text` | NO | -- | Creator principal identifier |

#### Primary Key

`id` (uuid)

#### Foreign Keys

| Column | References | On Delete |
|--------|-----------|-----------|
| `tenant_id` | `core.tenant(id)` | CASCADE |

#### Constraints

| Constraint | Type | Details |
|-----------|------|---------|
| `approval_sla_code_uniq` | UNIQUE | `(tenant_id, code)` |

#### Indexes

None beyond the unique constraint index.

#### Relationships

No direct foreign key references to or from other tables.

---

## Schema Overlays

Schema Overlays enable tenant-specific or module-specific customization of base entity schemas. An overlay can add fields, remove fields, modify field properties, tweak policies, override validations, adjust UI behavior, and modify indexes and relations -- all without forking the base entity definition. Overlays are applied in priority order with configurable conflict resolution (fail, overwrite, or merge). The final result is compiled into a snapshot for runtime consumption.

---

### meta.overlay

Defines an overlay container that extends or modifies a base entity schema. Each overlay targets a specific entity (and optionally a specific version), has a priority that determines application order, and a conflict resolution mode. Overlays support optimistic locking via the `version` column to prevent concurrent modification conflicts.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NO | -- | Owning tenant; FK to `core.tenant` |
| `overlay_key` | `text` | NO | -- | Unique overlay identifier within the tenant |
| `description` | `text` | YES | -- | Human-readable description of the overlay's purpose |
| `base_entity_id` | `uuid` | NO | -- | Target entity; FK to `meta.entity` |
| `base_version_id` | `uuid` | YES | -- | Specific entity version (optional); FK to `meta.entity_version` |
| `priority` | `int` | NO | `100` | Application order (lower = applied first) |
| `conflict_mode` | `text` | NO | `'fail'` | How to handle conflicts with other overlays |
| `is_active` | `boolean` | NO | `true` | Whether the overlay is currently active |
| `version` | `integer` | NO | `1` | Optimistic locking version for concurrent edit protection |
| `created_at` | `timestamptz` | NO | `now()` | Row creation timestamp |
| `created_by` | `text` | NO | -- | Creator principal identifier |
| `updated_at` | `timestamptz` | YES | -- | Last update timestamp |
| `updated_by` | `text` | YES | -- | Last updater principal identifier |

#### Primary Key

`id` (uuid)

#### Foreign Keys

| Column | References | On Delete |
|--------|-----------|-----------|
| `tenant_id` | `core.tenant(id)` | CASCADE |
| `base_entity_id` | `meta.entity(id)` | CASCADE |
| `base_version_id` | `meta.entity_version(id)` | SET NULL |

#### Constraints

| Constraint | Type | Details |
|-----------|------|---------|
| `overlay_conflict_mode_chk` | CHECK | `conflict_mode IN ('fail','overwrite','merge')` |
| `overlay_key_uniq` | UNIQUE | `(tenant_id, overlay_key)` |

#### Indexes

| Index | Columns | Filter |
|-------|---------|--------|
| `idx_overlay_base_entity` | `(tenant_id, base_entity_id)` | -- |
| `idx_overlay_priority` | `(base_entity_id, priority)` | -- |
| `idx_overlay_active` | `(is_active)` | `WHERE is_active = true` |

#### Relationships

**References:**
- `meta.entity(id)` via `base_entity_id`
- `meta.entity_version(id)` via `base_version_id`

**Referenced by:**
- `meta.overlay_change.overlay_id`

---

### meta.overlay_change

Stores individual change deltas within an overlay. Changes are applied in `change_order` sequence to deterministically transform the base entity schema. Each change targets a specific path (field name, index name, etc.) with a value payload. The kind determines the type of transformation.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NO | -- | Owning tenant; FK to `core.tenant` |
| `overlay_id` | `uuid` | NO | -- | Parent overlay; FK to `meta.overlay` |
| `change_order` | `int` | NO | -- | Sequential application order within the overlay |
| `kind` | `text` | NO | -- | Type of schema change |
| `path` | `text` | NO | -- | Target path (field name, index name, relation name, etc.) |
| `value` | `jsonb` | YES | -- | Change payload (new field definition, modified properties, etc.) |
| `created_at` | `timestamptz` | NO | `now()` | Row creation timestamp |
| `created_by` | `text` | NO | -- | Creator principal identifier |

#### Primary Key

`id` (uuid)

#### Foreign Keys

| Column | References | On Delete |
|--------|-----------|-----------|
| `tenant_id` | `core.tenant(id)` | CASCADE |
| `overlay_id` | `meta.overlay(id)` | CASCADE |

#### Constraints

| Constraint | Type | Details |
|-----------|------|---------|
| `overlay_change_kind_chk` | CHECK | `kind IN ('addField','removeField','modifyField','tweakPolicy','overrideValidation','overrideUi','addIndex','removeIndex','tweakRelation')` |
| `overlay_change_order_uniq` | UNIQUE | `(overlay_id, change_order)` |

**Change kind values explained:**
- `addField` -- Add a new field to the entity schema
- `removeField` -- Remove an existing field
- `modifyField` -- Modify properties of an existing field (data type, validation, etc.)
- `tweakPolicy` -- Adjust entity policy settings
- `overrideValidation` -- Override field validation rules
- `overrideUi` -- Override UI rendering configuration
- `addIndex` -- Add a new index definition
- `removeIndex` -- Remove an existing index
- `tweakRelation` -- Modify relationship properties

#### Indexes

| Index | Columns | Filter |
|-------|---------|--------|
| `idx_overlay_change_overlay` | `(overlay_id)` | -- |

#### Relationships

**References:**
- `meta.overlay(id)` via `overlay_id`

---

### meta.entity_compiled_overlay

Stores the final compiled snapshot after all applicable overlays have been applied to a base entity version. This is the definitive runtime representation -- the entity schema as it actually exists for a given tenant after all customizations. The `overlay_set` JSONB records which overlays were applied (and in what order) to produce this snapshot.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NO | -- | Owning tenant; FK to `core.tenant` |
| `entity_version_id` | `uuid` | NO | -- | Source entity version; FK to `meta.entity_version` |
| `overlay_set` | `jsonb` | NO | -- | Record of which overlays were applied and in what order |
| `compiled_json` | `jsonb` | NO | -- | Final compiled entity schema with all overlays applied |
| `compiled_hash` | `text` | NO | -- | Content hash for deduplication and cache invalidation |
| `generated_at` | `timestamptz` | NO | `now()` | When the compilation occurred |
| `created_at` | `timestamptz` | NO | `now()` | Row creation timestamp |
| `created_by` | `text` | NO | -- | Creator principal identifier |

#### Primary Key

`id` (uuid)

#### Foreign Keys

| Column | References | On Delete |
|--------|-----------|-----------|
| `tenant_id` | `core.tenant(id)` | CASCADE |
| `entity_version_id` | `meta.entity_version(id)` | CASCADE |

#### Constraints

None explicitly defined (no named CHECK or UNIQUE constraints).

#### Indexes

| Index | Columns | Filter |
|-------|---------|--------|
| `idx_entity_compiled_overlay_lookup` | `(tenant_id, entity_version_id, compiled_hash)` | -- |

#### Relationships

**References:**
- `meta.entity_version(id)` via `entity_version_id`

---

## Notification Configuration

The Notification Configuration group defines the multi-channel notification infrastructure. Channels represent delivery mechanisms (email, Teams, WhatsApp, in-app), providers are the concrete adapters for each channel (SendGrid, SES, Graph API), templates define the message content with localization and versioning, and rules map domain events to notification plans with deduplication and SLA enforcement.

---

### meta.notification_channel

Reference table for available notification delivery channels. Each channel represents a communication medium (EMAIL, TEAMS, WHATSAPP, IN_APP, SMS, etc.) with an enable/disable toggle. Channels are system-wide (not tenant-scoped) and serve as the top-level grouping for providers and template targeting.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `code` | `text` | NO | -- | Unique channel code (e.g., `EMAIL`, `TEAMS`, `WHATSAPP`) |
| `name` | `text` | NO | -- | Human-readable channel name |
| `is_enabled` | `boolean` | NO | `true` | Whether the channel is globally enabled |
| `config` | `jsonb` | YES | -- | Channel-level configuration |
| `sort_order` | `integer` | NO | `0` | Display ordering |
| `created_at` | `timestamptz(6)` | NO | `now()` | Row creation timestamp |
| `created_by` | `text` | NO | -- | Creator principal identifier |

#### Primary Key

`id` (uuid)

#### Foreign Keys

None.

#### Constraints

| Constraint | Type | Details |
|-----------|------|---------|
| `notification_channel_code_uniq` | UNIQUE | `(code)` |

#### Indexes

None beyond the unique constraint index.

#### Relationships

**Referenced by:**
- `meta.notification_provider.channel_id`

---

### meta.notification_provider

Registers concrete provider instances for each notification channel. For example, the EMAIL channel might have SendGrid and SES providers. Each provider has a priority (for failover), health status tracking, rate limiting configuration, and an adapter key that maps to the runtime adapter implementation. The system selects the highest-priority healthy provider at send time.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `channel_id` | `uuid` | NO | -- | Parent channel; FK to `meta.notification_channel` |
| `code` | `text` | NO | -- | Unique provider code |
| `name` | `text` | NO | -- | Human-readable provider name |
| `adapter_key` | `text` | NO | -- | Runtime adapter identifier (e.g., `sendgrid`, `ses`, `graph-api`) |
| `priority` | `integer` | NO | `1` | Selection priority (lower = preferred) |
| `is_enabled` | `boolean` | NO | `true` | Whether the provider is enabled |
| `config` | `jsonb` | NO | `'{}'` | Provider-specific configuration (API keys, endpoints, etc.) |
| `rate_limit` | `jsonb` | YES | -- | Rate limiting rules (requests per minute, burst limits) |
| `health` | `text` | NO | `'healthy'` | Current health status |
| `created_at` | `timestamptz(6)` | NO | `now()` | Row creation timestamp |
| `created_by` | `text` | NO | -- | Creator principal identifier |
| `updated_at` | `timestamptz(6)` | YES | -- | Last update timestamp |
| `updated_by` | `text` | YES | -- | Last updater principal identifier |

#### Primary Key

`id` (uuid)

#### Foreign Keys

| Column | References | On Delete |
|--------|-----------|-----------|
| `channel_id` | `meta.notification_channel(id)` | CASCADE |

#### Constraints

| Constraint | Type | Details |
|-----------|------|---------|
| `notification_provider_code_uniq` | UNIQUE | `(code)` |
| `notification_provider_health_chk` | CHECK | `health IN ('healthy','degraded','down')` |

#### Indexes

| Index | Columns | Filter |
|-------|---------|--------|
| `idx_notification_provider_channel` | `(channel_id, priority)` | -- |

#### Relationships

**References:**
- `meta.notification_channel(id)` via `channel_id`

---

### meta.notification_template

Stores versioned, localized notification message templates for each channel. Templates define the subject line, body (text, HTML, and/or structured JSON), and a variables schema that declares the expected template variables. Templates progress through a draft-active-retired lifecycle. The combination of `(tenant_id, template_key, channel, locale, version)` is unique, allowing multiple translations and versions of the same logical template.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | YES | -- | Owning tenant (NULL = system-wide template); FK to `core.tenant` |
| `template_key` | `text` | NO | -- | Logical template identifier (e.g., `approval_request`, `order_confirmed`) |
| `channel` | `text` | NO | -- | Target delivery channel (e.g., `EMAIL`, `TEAMS`) |
| `locale` | `text` | NO | `'en'` | Locale code for localization |
| `version` | `integer` | NO | `1` | Template version number |
| `status` | `text` | NO | `'draft'` | Template lifecycle status |
| `subject` | `text` | YES | -- | Message subject line (for email/push) |
| `body_text` | `text` | YES | -- | Plain text body |
| `body_html` | `text` | YES | -- | HTML body (for email) |
| `body_json` | `jsonb` | YES | -- | Structured body (for Teams adaptive cards, WhatsApp templates, etc.) |
| `variables_schema` | `jsonb` | YES | -- | JSON Schema defining expected template variables |
| `metadata` | `jsonb` | YES | -- | Additional template metadata |
| `created_at` | `timestamptz(6)` | NO | `now()` | Row creation timestamp |
| `created_by` | `text` | NO | -- | Creator principal identifier |
| `updated_at` | `timestamptz(6)` | YES | -- | Last update timestamp |
| `updated_by` | `text` | YES | -- | Last updater principal identifier |

#### Primary Key

`id` (uuid)

#### Foreign Keys

| Column | References | On Delete |
|--------|-----------|-----------|
| `tenant_id` | `core.tenant(id)` | CASCADE |

#### Constraints

| Constraint | Type | Details |
|-----------|------|---------|
| `notification_template_status_chk` | CHECK | `status IN ('draft','active','retired')` |
| `notification_template_key_channel_locale_version_uniq` | UNIQUE | `(tenant_id, template_key, channel, locale, version)` |

#### Indexes

| Index | Columns | Filter |
|-------|---------|--------|
| `idx_notification_template_lookup` | `(template_key, channel, locale, status)` | -- |

#### Relationships

**References:**
- `core.tenant(id)` via `tenant_id`

---

### meta.notification_rule

Maps domain events to notification delivery plans. When a specific event occurs (e.g., `approval_requested`, `order_shipped`, `lifecycle_transition`), matching rules determine which template to use, which channels to deliver on, who the recipients are, and what priority level applies. Rules support deduplication windows to prevent notification storms and SLA tracking for delivery guarantees.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | YES | -- | Owning tenant (NULL = system-wide); FK to `core.tenant` |
| `code` | `text` | NO | -- | Unique rule code within the tenant |
| `name` | `text` | NO | -- | Human-readable rule name |
| `description` | `text` | YES | -- | Detailed description of the rule's purpose |
| `event_type` | `text` | NO | -- | Domain event that triggers this rule |
| `entity_type` | `text` | YES | -- | Optional entity type filter |
| `lifecycle_state` | `text` | YES | -- | Optional lifecycle state filter |
| `condition_expr` | `jsonb` | YES | -- | Additional condition expression for fine-grained matching |
| `template_key` | `text` | NO | -- | Template to use for rendering the notification |
| `channels` | `text[]` | NO | -- | Array of channels to deliver on (e.g., `{EMAIL,TEAMS}`) |
| `priority` | `text` | NO | `'normal'` | Notification priority level |
| `recipient_rules` | `jsonb` | NO | -- | Rules for determining notification recipients |
| `sla_minutes` | `integer` | YES | -- | Expected delivery SLA in minutes |
| `dedup_window_ms` | `integer` | YES | `300000` | Deduplication window in milliseconds (default 5 minutes) |
| `is_enabled` | `boolean` | NO | `true` | Whether the rule is active |
| `sort_order` | `integer` | NO | `0` | Evaluation ordering |
| `created_at` | `timestamptz(6)` | NO | `now()` | Row creation timestamp |
| `created_by` | `text` | NO | -- | Creator principal identifier |
| `updated_at` | `timestamptz(6)` | YES | -- | Last update timestamp |
| `updated_by` | `text` | YES | -- | Last updater principal identifier |

#### Primary Key

`id` (uuid)

#### Foreign Keys

| Column | References | On Delete |
|--------|-----------|-----------|
| `tenant_id` | `core.tenant(id)` | CASCADE |

#### Constraints

| Constraint | Type | Details |
|-----------|------|---------|
| `notification_rule_priority_chk` | CHECK | `priority IN ('low','normal','high','critical')` |
| `notification_rule_tenant_code_uniq` | UNIQUE | `(tenant_id, code)` |

#### Indexes

| Index | Columns | Filter |
|-------|---------|--------|
| `idx_notification_rule_event` | `(event_type, is_enabled)` | -- |

#### Relationships

**References:**
- `core.tenant(id)` via `tenant_id`

---

### meta.audit_policy

Defines per-tenant audit load shedding policies. These control whether specific categories of audit events are always recorded, sampled at a configurable rate, or disabled entirely. A row with `tenant_id IS NULL` serves as the global default. This allows high-volume tenants to reduce audit overhead on low-value event categories while maintaining full compliance for critical events.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | YES | -- | Owning tenant (NULL = global default); FK to `core.tenant` |
| `event_category` | `text` | NO | -- | Audit event category (e.g., `auth`, `data_access`, `lifecycle_transition`) |
| `disposition` | `text` | NO | `'required'` | How events in this category are handled |
| `sample_rate` | `numeric(4,3)` | NO | `1.000` | Sampling rate when disposition is `sampled` (0.000 to 1.000) |
| `enabled` | `boolean` | NO | `true` | Master enable/disable toggle |
| `created_at` | `timestamptz` | NO | `now()` | Row creation timestamp |
| `updated_at` | `timestamptz` | NO | `now()` | Last update timestamp |

#### Primary Key

`id` (uuid)

#### Foreign Keys

| Column | References | On Delete |
|--------|-----------|-----------|
| `tenant_id` | `core.tenant(id)` | CASCADE |

#### Constraints

| Constraint | Type | Details |
|-----------|------|---------|
| `audit_policy_disposition_chk` | CHECK | `disposition IN ('required', 'sampled', 'disabled')` |
| `audit_policy_sample_rate_chk` | CHECK | `sample_rate >= 0 AND sample_rate <= 1` |
| `audit_policy_uniq` | UNIQUE | `(tenant_id, event_category)` |

#### Indexes

| Index | Columns | Filter |
|-------|---------|--------|
| `idx_audit_policy_tenant` | `(tenant_id, event_category)` | -- |

#### Relationships

No direct foreign key references to or from other meta tables.

---

## Operations and Artifacts

The Operations and Artifacts group tracks DDL migration history and immutable publish artifacts. These tables provide a complete audit trail of every schema change applied to entity tables and every entity version publication event, enabling rollback diagnostics and compliance reporting.

---

### meta.migration_history

Tracks every DDL migration applied to entity tables in the `ent` schema. Each record captures the entity name, version, action type (create or alter), the exact SQL executed, a hash of the DDL for verification, and the execution status. Failed migrations are recorded with their error message for diagnostic purposes.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NO | -- | Owning tenant; FK to `core.tenant` |
| `entity_name` | `text` | NO | -- | Logical entity name that was migrated |
| `version` | `text` | NO | -- | Entity version that triggered the migration |
| `action` | `text` | NO | -- | Type of DDL action |
| `ddl_sql` | `text` | NO | -- | Exact SQL statement that was executed |
| `ddl_hash` | `text` | NO | -- | SHA hash of the DDL for integrity verification |
| `status` | `text` | NO | `'applied'` | Execution result |
| `error_message` | `text` | YES | -- | Error details if the migration failed |
| `applied_at` | `timestamptz` | NO | `now()` | When the migration was executed |
| `applied_by` | `text` | NO | -- | Principal who applied the migration |

#### Primary Key

`id` (uuid)

#### Foreign Keys

| Column | References | On Delete |
|--------|-----------|-----------|
| `tenant_id` | `core.tenant(id)` | CASCADE |

#### Constraints

| Constraint | Type | Details |
|-----------|------|---------|
| `migration_history_action_chk` | CHECK | `action IN ('create','alter')` |
| `migration_history_status_chk` | CHECK | `status IN ('applied','failed','rolled_back')` |

#### Indexes

| Index | Columns | Filter |
|-------|---------|--------|
| `idx_migration_history_entity` | `(tenant_id, entity_name)` | -- |
| `idx_migration_history_applied` | `(applied_at)` | -- |

#### Relationships

No direct foreign key references to or from other meta tables (uses `entity_name` text reference).

---

### meta.publish_artifact

Creates an immutable record each time an entity version is published. The artifact captures the compiled hash at the time of publication, a diagnostics summary (validation warnings, compilation stats), the set of overlays that were applied, and the generated migration plan (SQL). This provides a complete forensic record for compliance and rollback purposes.

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NO | -- | Owning tenant; FK to `core.tenant` |
| `entity_name` | `text` | NO | -- | Logical entity name that was published |
| `version` | `text` | NO | -- | Entity version string |
| `compiled_hash` | `text` | NO | -- | Hash of the compiled snapshot at publish time |
| `diagnostics_summary` | `jsonb` | YES | -- | Compilation diagnostics (warnings, validation results) |
| `applied_overlay_set` | `jsonb` | YES | -- | Record of which overlays were included |
| `migration_plan_hash` | `text` | YES | -- | Hash of the generated migration plan |
| `migration_plan_sql` | `text` | YES | -- | Generated DDL SQL for the migration |
| `published_at` | `timestamptz` | NO | `now()` | When the publication occurred |
| `published_by` | `text` | NO | -- | Principal who published |

#### Primary Key

`id` (uuid)

#### Foreign Keys

| Column | References | On Delete |
|--------|-----------|-----------|
| `tenant_id` | `core.tenant(id)` | CASCADE |

#### Constraints

| Constraint | Type | Details |
|-----------|------|---------|
| `publish_artifact_version_uniq` | UNIQUE | `(tenant_id, entity_name, version)` |

#### Indexes

| Index | Columns | Filter |
|-------|---------|--------|
| `idx_publish_artifact_entity` | `(tenant_id, entity_name)` | -- |
| `idx_publish_artifact_published` | `(published_at)` | -- |

#### Relationships

No direct foreign key references to or from other meta tables (uses `entity_name` text reference).

---

## Cross-Schema Dependencies

The `meta` schema has the following dependencies on other schemas:

| External Table | Referenced By | Relationship |
|---------------|--------------|--------------|
| `core.tenant(id)` | Nearly all meta tables via `tenant_id` | CASCADE delete -- tenant removal purges all metadata |
| `core.operation(id)` | `meta.permission_rule_operation.operation_id` | RESTRICT delete -- cannot remove operations with active permission rules |
| `core.operation(code)` | `meta.entity_operation.operation_code` | RESTRICT delete -- cannot remove operations with active entity capabilities |

---

## Design Patterns

### Compilation Pattern
Several subsystems follow a "define then compile" pattern:
1. **Definition tables** store the normalized, editable metadata (fields, rules, overlays)
2. **Compiled tables** store flattened, denormalized JSON snapshots for runtime performance
3. A `compiled_hash` column enables content-addressed deduplication and cache invalidation

Tables using this pattern: `entity_compiled`, `entity_compiled_overlay`, `permission_policy_compiled`, `entity_lifecycle_route_compiled`, `approval_template` (via `compiled_json`/`compiled_hash` columns)

### Versioning Pattern
Multiple subsystems use a version lifecycle (`draft` -> `published` -> `archived`):
- `meta.entity_version` -- Entity schema versions
- `meta.permission_policy_version` -- Permission policy versions
- `meta.approval_template` -- Approval template versions (via `version_no`)

Published versions are immutable. Changes require creating a new version.

### Two-Tier Resolution Pattern
`meta.entity_operation` uses a system-default + tenant-override model:
- Rows with `tenant_id IS NULL` are system defaults
- Rows with a specific `tenant_id` override the defaults
- The `entity_operation_resolved` view materializes the overlay

### Text-Based Entity References
Some tables use `entity_name` (text) instead of `entity_id` (uuid) for entity references. This allows system defaults (`tenant_id IS NULL`) to reference entities across all tenants by their stable logical name. Tables using this pattern: `entity_lifecycle`, `entity_lifecycle_route_compiled`, `migration_history`, `publish_artifact`, `entity_operation`.
