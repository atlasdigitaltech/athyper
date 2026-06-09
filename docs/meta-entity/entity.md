# Entity Definition — `control.entity`

The entity registry is the single source of truth for every table, view, and virtual relation in Athyper. Every query, lifecycle, operation, policy, and field definition references it by `entity_code` or `id`. Seeded in `server/db/seed/platform/003_control/040_entity.sql`.

---

## Table: `control.entity`

Central registry — one row per physical table, view, partition, or virtual entity.

### Identity Columns

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | `uuid PK` | `shared.uuidv7()` | Stable internal handle; prefer `entity_code` for cross-service references |
| `tenant_id` | `uuid` | `NULL` | `NULL` = platform-global entity; `NOT NULL` = tenant extension |
| `module_id` | `text NOT NULL` | — | Module code (e.g. `ACC`, `IAM`, `BUY`) |
| `name` | `text NOT NULL` | — | Human-readable name, displayed in Metadata Studio |
| `slug` | `text` | — | URL-friendly slug for navigation routes; format `^[a-z][a-z0-9]*(-[a-z0-9]+)*$` |
| `entity_short` | `text` | — | Short uppercase code `^[A-Z][A-Z0-9_]{1,11}$` (e.g. `JE`, `INV`); used in document numbering prefixes |
| `entity_code` | `text NOT NULL` | — | Canonical binding code `^[a-z][a-z0-9_]*$`; mirrors `table_name` for system entities; stable FK target for lifecycle/operation/relation bindings |

**Unique constraints:**
- `(tenant_id, entity_code) NULLS NOT DISTINCT` — one code per tenant scope
- `(table_schema, table_name)` — physical location uniqueness

---

### Classification Columns

| Column | Type | Default | Allowed Values |
|---|---|---|---|
| `entity_class` | `text NOT NULL` | `MASTER` | See [Entity Classes](#entity-classes) |
| `ownership_model` | `text NOT NULL` | `system` | `system` · `tenant` · `package` · `overlay` |
| `kind` | `text NOT NULL` | `ent` | `ent` (regular entity) · `vw` (view) · `mview` (materialized view) |
| `backing_type` | `text NOT NULL` | `table` | `table` · `view` · `materialized_view` |

---

### Governance Columns

| Column | Type | Default | Allowed Values |
|---|---|---|---|
| `governance_level` | `text NOT NULL` | `full` | `full` · `standard` · `standard_lite` · `lite` |
| `security_tier` | `text NOT NULL` | `config` | `platform_critical` · `tenant_critical` · `operational` · `config` |
| `mutability` | `text NOT NULL` | `controlled` | `locked` · `controlled` · `extensible` |
| `mapping_mode` | `text NOT NULL` | `exclusive` | `exclusive` · `shared` · `virtual` · `inherited` |
| `engine_tag` | `text` | `NULL` | Free-text processing engine hint (e.g. `journal_engine`, `procurement_engine`) |

---

### Physical Location Columns

| Column | Type | Default | Notes |
|---|---|---|---|
| `table_schema` | `text NOT NULL` | `master` | PostgreSQL schema (e.g. `document`, `master`, `ledger`) |
| `table_name` | `text NOT NULL` | — | Physical table or view name within the schema |

---

### Label and UI Columns

| Column | Type | Notes |
|---|---|---|
| `label_singular` | `text` | Singular display name (e.g. `Purchase Invoice`) |
| `label_plural` | `text` | Plural display name (e.g. `Purchase Invoices`) |
| `description` | `text` | Admin description shown in Metadata Studio |
| `icon_key` | `text` | Icon from `@athyper/icons`; format `^[a-z][a-z0-9-]*$` |
| `color_token` | `text` | Design system color token for entity badges; format `^[a-z][a-z0-9-]*$` |

---

### JSONB Config Columns

#### `display_config` — Presentation & Layout

Owner: `presentation` · Compile target: `client_stripped` · Allowed keys:

| Key | Type | Purpose |
|---|---|---|
| `is_approvable` | `boolean` | Shows the approval action bar on document detail |
| `has_workflow` | `boolean` | Binds a workflow submission step |
| `has_lines` | `boolean` | Enables line-items sub-surface |
| `has_accounting_distribution` | `boolean` | Enables split accounting panel (for line entities) |
| `document_category` | `string` | E.g. `general_ledger`, `payables`, `purchasing` |
| `allow_on_behalf_of` | `boolean` | Whether the document can be submitted on behalf of another principal |
| `parent_entity` | `string` | entity_code of logical parent (for DOCUMENT_RELATION children) |
| `parent_fk` | `string` | Field on this entity that FK-links to the parent |
| `auto_number` | `boolean` | Auto-generates `document_no` or `code` via `entity_numbering_config` |
| `line_editor` | `boolean` | Enable inline line editor |
| `posting_controlled` | `boolean` | GL posting controls apply to lines |
| `dimension_controlled` | `boolean` | Dimension/cost-centre picker active on lines |
| `polymorphic_parent` | `boolean` | Parent is resolved via type+id columns (for polymorphic children) |
| `parent_source_type_field` | `string` | Column holding the polymorphic parent type |
| `parent_source_id_field` | `string` | Column holding the polymorphic parent id |
| `backing_source` | `string` | For views: name of backing source tables (e.g. `commitment+commitment_procurement`) |
| `write_facade` | `string` | Write-path facade class (for view-backed entities) |
| `duplicate_check` | `object` | Duplicate detection config — see below |
| `extension_modes` | `string[]` | Allowed extension lanes for business partner entities |
| `ownership_lanes` | `object` | Field ownership split (identity/supplier/customer/finance_ap/finance_ar) |

**Duplicate check sub-config:**
```json
{
  "hard_gate": true,
  "block_on_exact": true,
  "exact_fields": ["registration_no", "tax_number"],
  "strong_name_threshold": 0.85,
  "weak_name_threshold": 0.55,
  "redirect_modes": ["edit_existing", "extend_role", "extend_company_code"]
}
```

---

#### `feature_flags` — Runtime Capabilities

Owner: `presentation` · Compile target: `client` · Unknown key policy: `reject`

Governs which capability panels the runtime shells render. Set via Metadata Studio or curated seed.

| Flag | Type | Purpose |
|---|---|---|
| `has_attachments` | `boolean` | Attachment panel visible |
| `has_workflow` | `boolean` | Workflow submission + timeline visible |
| `has_lifecycle` | `boolean` | Lifecycle transitions rendered |
| `is_importable` | `boolean` | Import via XLSX/CSV enabled |
| `is_exportable` | `boolean` | Entity-level export enabled |
| `is_bulk_editable` | `boolean` | Bulk-edit action in list enabled |
| `is_approvable` | `boolean` | Approval action bar shown |
| `is_readonly` | `boolean` | Record is view-only for all principals |
| `records_api_disabled` | `boolean` | Disables generic /api/records/:entity routes |
| `generic_runtime_disabled` | `boolean` | Disables generic runtime canvas for this entity |
| `is_hidden` | `boolean` | Hides from navigation and search |
| `comments_enabled` | `boolean` | Comment thread panel |
| `event_history` | `boolean` | Activity timeline visible |
| `version_control` | `boolean` | Version history tab shown |
| `has_lines` | `boolean` | Line-items sub-surface |
| `has_accounting_distribution` | `boolean` | Accounting distribution panel |
| `has_tasks` | `boolean` | Tasks panel |
| `has_watchers` | `boolean` | Watcher subscriptions |
| `has_rules` | `boolean` | Policy/rule panel |
| `has_integrations` | `boolean` | Integration endpoint panel |
| `print` | `boolean/object` | Printable detail view |
| `sla_target_hours` | `number` | SLA target hours for service entities |
| `has_payment_schedule` | `boolean` | Payment schedule panel |
| `has_budget_impact` | `boolean` | Budget commitment tracking |
| `pii_bearing` | `boolean` | Entity carries PII fields (used in PII inventory) |
| `document_category` | `string` | Document module grouping (`general_ledger`, `payables`, etc.) |

---

#### `identity_config` — Identity & Numbering

Owner: `identity` · Compile target: `client_stripped`

| Key | Type | Purpose |
|---|---|---|
| `primary_key_field` | `string` | Column that is the logical PK (default: `id`) |
| `business_key_fields` | `string[]` | Fields that uniquely identify a business record (e.g. `["document_no"]`) |
| `natural_key_fields` | `string[]` | Natural key subset (e.g. `["code"]`) |
| `numbering` | `object` | Auto-numbering hints — links to `entity_numbering_config` |
| `list_entity_code` | `string` | Alternate entity_code used for the list page (e.g. a view) |
| `parent` | `object` | `{entity_code, fk_field}` — parent entity binding for child records |
| `duplicate_check` | `object` | Duplicate detection configuration (see display_config.duplicate_check) |

---

#### `search_config` — Full-Text Search

Owner: `search` · Compile target: `client` · Unknown key policy: `reject`

| Key | Type | Purpose |
|---|---|---|
| `enabled` | `boolean` | Whether full-text search is active |
| `fields` | `string[]` | Fields indexed in the tsvector column |
| `rank` | `number` | Search result ranking weight |
| `min_query_length` | `number` | Minimum characters before server search fires |
| `operator` | `string` | `AND` / `OR` matching operator |

---

#### `data_policy` — Data Classification

Owner: `governance` · Compile target: `client_stripped`

| Key | Type | Purpose |
|---|---|---|
| `classification` | `string` | `public`, `internal`, `confidential`, `restricted` |
| `pii_fields` | `string[]` | List of PII-bearing field names (informational; masking is in `field_security_policy`) |
| `retention_days` | `number` | Data retention period in days |
| `legal_hold_eligible` | `boolean` | Whether legal hold can be applied |
| `anonymize_on_delete` | `boolean` | Anonymize PII fields rather than hard-delete |

---

#### `composite_indexes`

Replaces `control.index_def`. Array of custom composite index declarations.

```json
[
  {
    "name": "ue_journal_entry_posting_idx",
    "is_unique": false,
    "method": "btree",
    "columns": ["tenant_id", "company_code_id", "posting_date"],
    "where_clause": "status = 'POSTED'"
  }
]
```

Single-field indexes for `is_filterable`, `is_searchable`, `is_unique` fields are auto-derived from `entity_field` at compile time.

---

### Partition Columns

| Column | Type | Notes |
|---|---|---|
| `is_partition_child` | `boolean` | `true` if this entity is a PostgreSQL partition child |
| `partition_parent_id` | `uuid` | FK to parent `control.entity` row |
| `partition_key` | `text` | Partition key column name |
| `partition_config` | `jsonb` | Partition-specific configuration |

---

### Status Columns

| Column | Type | Notes |
|---|---|---|
| `status` | `text` | `DRAFT` · `ACTIVE` · `DEPRECATED` · `SUSPENDED` · `ARCHIVED` |
| `is_active` | `boolean GENERATED` | `true` when `status IN ('ACTIVE', 'DEPRECATED')` |
| `status_changed_at` | `timestamptz` | When status last transitioned |
| `status_changed_by` | `uuid` | Principal who changed the status |

---

### Provisioning Columns (Tenant Entities)

Only populated for `ownership_model = 'tenant'` after `provision_tenant_extensions()` creates the physical table.

| Column | Type | Notes |
|---|---|---|
| `provisioned_at` | `timestamptz` | Timestamp when `CREATE TABLE` executed |
| `provisioned_by` | `uuid` | Principal who triggered provisioning |

Tenant entity tables **must** follow the naming pattern `document.t_<entity_short>_<entity_code>` — enforced by `CHECK (entity_tenant_naming_chk)`.

---

### Audit Columns

| Column | Type | Notes |
|---|---|---|
| `created_at` | `timestamptz NOT NULL` | `DEFAULT now()` |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` | `timestamptz` | |
| `updated_by` | `uuid` | |

---

## Entity Classes

Defined in `control.entity_class_profile`. Determines defaults for governance, mutability, security tier, field flag rules, and compliance profile.

| Class Key | Label | Typical Schema | Use |
|---|---|---|---|
| `REFERENCE` | Reference Data | `master` | Country, currency, UOM — platform-managed, rarely mutated |
| `MASTER` | Master Data | `master` | Supplier, customer, asset — tenant-owned, high governance |
| `CONTROL` | Control / Config | `control` | Lifecycle definitions, workflow templates, policy rules |
| `DOCUMENT` | Transaction Document | `document` | Invoice, PO, journal entry — full lifecycle + workflow |
| `DOCUMENT_RELATION` | Document Relation | `document` | Line items, invoice lines — children of DOCUMENTs |
| `LEDGER` | Ledger Entry | `ledger` | GL postings — append-only after posting |
| `LOG` | Immutable Log | `log` | Audit trail, event log — insert-only |
| `AGGREGATE` | Aggregate / Summary | `aggregate` | Trial balance, aging — computed |
| `DIMENSION` | Analytical Dimension | `master` | Cost center, department, project |
| `RELATION` | Many-to-Many Relation | `master` | Group memberships, tag assignments |
| `*` | Wildcard | — | Catch-all for new types |

### Runtime Routing by Class

```ts
{
  REFERENCE: "/master/",  MASTER:   "/master/",  CONTROL: "/master/",
  DOCUMENT:  "/document/", DOCUMENT_RELATION: "/document/",
  LEDGER:    "/ledger/",  LOG:      "/ledger/",  AGGREGATE: "/ledger/",
  DIMENSION: "/master/",  RELATION: "/master/"
}
```

---

## Ownership Model

| Value | Description |
|---|---|
| `system` | Platform-shipped entity (e.g. `document.invoice`, `master.principal`) |
| `tenant` | Custom entity created by tenant via provisioning (`document.t_<short>_<code>`) |
| `package` | Installed module entity (e.g. from a blueprint pack) |
| `overlay` | Overlay-derived virtual entity — no physical table |

---

## Table: `control.entity_class_profile`

Platform-global governance rules per entity class. Immutable — seeded at install.

| Column | Type | Notes |
|---|---|---|
| `class_key` | `text PK` | One of the 11 class values |
| `label` | `text` | Display name |
| `description` | `text` | Admin description |
| `valid_governance_levels` | `text[]` | Allowed governance_level values for this class |
| `default_governance_level` | `text` | Applied when entity doesn't override |
| `valid_mutability` | `text[]` | Allowed mutability values |
| `default_mutability` | `text` | Default mutability |
| `default_security_tier` | `text` | Default security tier |
| `expected_system_columns` | `text[]` | System columns every entity of this class must have |
| `field_flag_rules` | `jsonb` | Auto-rule array for `trg_field_flag_defaults` on entity_field INSERT |
| `security_tiers` | `jsonb` | Per-tier requirements: `{platform_critical: {min_governance, is_created_by_required, is_audit_on_read, ...}}` |
| `compliance_profile` | `jsonb` | Linting rules, required field patterns, audit disposition per category |
| `sort_order` | `smallint` | UI sort order |

### `field_flag_rules` Structure

Each rule auto-sets field behaviour flags on `entity_field` INSERT, evaluated by `trg_field_flag_defaults`:

```json
[
  {
    "match_mode": "name",
    "pattern": "%_id",
    "priority": 10,
    "is_searchable": false,
    "is_filterable": true,
    "is_sortable": false,
    "cardinality": "one"
  }
]
```

`match_mode` values: `name` (exact or LIKE), `data_type`, `origin`, `format`.

---

## Table: `control.entity_publish_state`

1:1 companion to `control.entity`. Holds compile/publish tracking columns. Separated to avoid update contention during frequent compile cycles.

| Column | Type | Notes |
|---|---|---|
| `entity_id` | `uuid PK` | FK to `control.entity` |
| `tenant_id` | `uuid` | |
| `published_version_id` | `uuid` | FK to `control.entity_version` with `status='EFFECTIVE'` |
| `current_draft_version_id` | `uuid` | FK to the active DRAFT version |
| `latest_version_no` | `integer` | Monotonically increasing |
| `last_compiled_at` | `timestamptz` | When last full compile ran |
| `last_compiled_hash` | `text` | SHA-256+ hash of compiled output |
| `last_schema_change_at` | `timestamptz` | When last DDL change was detected |
| `provenance` | `jsonb` | How this entity came to exist: `{origin: "cloned", source_entity_code: "..."}` |
| `status_summary` | `jsonb` | Compliance score, readiness flags: `{compliance_score: 0.9, missing_labels: 3}` |
| `source_layer` | `text` | `platform`(0) · `blueprint`(1–99) · `overlay`(100) — determines merge precedence |
| `source_ref` | `text` | Contributing layer reference (blueprint code or overlay id) |
| `applied_precedence` | `smallint` | Numeric stacking rank; higher = later-applied = wins on conflict |

**Layer precedence:** `platform(0) < blueprint(1-99, by application order) < overlay(100)`. Higher `applied_precedence` wins on conflict. Admins can query to answer "this entity was last written by blueprint X, overridden by overlay Y."

Auto-created by trigger `trg_fn_ensure_entity_publish_state` on entity INSERT.

---

## Table: `control.entity_version`

Versioned snapshots of entity definitions. Manages `DRAFT → EFFECTIVE` lifecycle for entity schema changes.

`entity_field` rows with a non-null `entity_version_id` belong to a specific version.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid` | |
| `entity_id` | `uuid NOT NULL` | FK to `control.entity` |
| `version_no` | `integer NOT NULL` | Monotonically increasing per entity; starts at 1 |
| `version_hash` | `text` | SHA-256+ hash of the version snapshot |
| `status` | `text` | `DRAFT` · `IN_REVIEW` · `APPROVED` · `EFFECTIVE` · `SUPERSEDED` · `ARCHIVED` · `REJECTED` · `WITHDRAWN` |
| `is_effective` | `boolean GENERATED` | `true` when `status = 'EFFECTIVE'` |
| `label` | `text` | Human-readable version label |
| `change_summary` | `text` | Description of changes in this version |
| `change_type` | `text` | `structural` · `behavioral` · `governance` · `label` · `fix` (required for version_no > 1) |
| `is_working_copy` | `boolean` | `true` = in-progress copy not yet submitted for review |
| `derived_from_version_id` | `uuid` | Lineage pointer to the version this was branched from |
| `supersedes_version_id` | `uuid` | Version this EFFECTIVE version replaces |
| `effective_from` | `timestamptz` | When this version became effective |
| `effective_to` | `timestamptz` | When this version was superseded |
| `lock_version` | `integer` | Optimistic lock counter |
| `lifecycle_instance_id` | `uuid` | FK to the lifecycle instance governing this version's review |
| `behaviors` | `jsonb` | Version-specific overrides of `entity.display_config` |
| `created_at`, `created_by` | standard | |

**Unique:** `(entity_id, version_no)` — no duplicate version numbers per entity.

---

## Table: `control.entity_numbering_config`

Auto-numbering policy per entity + field (e.g. `document_no` on `purchase_invoice`). Tenant rows override the platform default (`tenant_id = NULL`).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid` | `NULL` = platform default |
| `entity_id` | `uuid NOT NULL` | FK to `control.entity` |
| `number_field` | `text NOT NULL` | `entity_field.name` that receives the generated number (e.g. `document_no`) |
| `company_code_id` | `uuid` | `NULL` = all companies |
| `prefix` | `text` | Static prefix (e.g. `INV`) |
| `prefix_configurable` | `boolean` | Whether tenant can override the prefix |
| `separator` | `text` | Separator between segments (default: `-`) |
| `segments` | `jsonb` | Array of segment descriptors (see below) |
| `reset_strategy` | `text` | `never` · `yearly` · `fiscal_yearly` · `monthly` · `quarterly` |
| `uniqueness_scope` | `text` | `tenant` · `company` · `global` |
| `max_length` | `smallint` | Maximum generated string length (1–128) |
| `allowed_chars` | `text` | Named char set: `upper_alnum_dash`, `alnum_dash`, `any`, or a regex |
| `status` | `active_inactive_d` | `active` / `inactive` |

**Segments array** — each element is one of:
`tenant_code`, `company_code`, `branch_code`, `year`, `fiscal_year`, `period`, `quarter`, `sequence`, `static`

### `control.entity_numbering_counter`

Mutable sequence state. One row per resolved `(tenant, company, entity, reset_bucket)`.
Counter auto-increments atomically at document creation.

---

## Runtime Entity Descriptor — `MetaEntityCapabilities`

Produced by `compileMetaEntityRuntimeDescriptor()` and served at `GET /api/metadata/:entity`.

```ts
{
  canRead:         boolean,
  canCreate:       boolean,
  canEdit:         boolean,
  canDelete:       boolean,
  hasLineItems:    boolean,
  hasChildRecords: boolean,
  hasDistributions:boolean,
  hasAttachments:  boolean,
  hasComments:     boolean,
  hasWorkflow:     boolean,
  hasLifecycle:    boolean,
  hasVersions:     boolean,
  hasCompare:      boolean,
  hasActivityLog:  boolean,
  hasAuditTrail:   boolean,
  hasAuditSummary: boolean,
  hasImport:       boolean,
  hasBulk:         boolean,
  isReadOnly:      boolean,
}
```

Capabilities are derived from `feature_flags` + permission resolution for the calling principal.

### Runtime Surfaces

Surfaces define which panels are rendered on the detail page. Placement determines where:

| `kind` | `placement` | Description |
|---|---|---|
| `fields` | `main` | Primary fields panel; references `groupKeys` |
| `line_items` | `main` | Line-item sub-table (entityCode = child entity) |
| `child_records` | `main` / `subroute` | Related entity records |
| `distributions` | `context_panel` | Accounting distribution |
| `summary_cards` | `header` | KPI summary card strip |
| `attachments` | `subroute` | Attachment list |
| `comments` | `subroute` | Comment thread |
| `workflow` | `subroute` | Workflow timeline |
| `lifecycle` | `subroute` | Lifecycle state history |
| `versions` | `subroute` | Version browser |
| `compare` | `subroute` | Version diff view |
| `activity_log` | `subroute` | Activity timeline |
| `audit_trail` | `subroute` | Audit event log |
| `flow` | `subroute` | Flow engine progress |

---

## API Routes

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/metadata/:entity` | Fetch compiled runtime descriptor |
| `GET` | `/api/metadata/:entity/fields` | Field list for the published version |
| `GET` | `/api/records/:entity` | List records with filtering, sorting, pagination |
| `POST` | `/api/records/:entity` | Create a new record |
| `GET` | `/api/records/:entity/:id` | Fetch a single record |
| `PATCH` | `/api/records/:entity/:id` | Update a record |
| `DELETE` | `/api/records/:entity/:id` | Delete a record |
| `GET` | `/api/records/:entity/operations` | Live entity operations for the principal |
| `POST` | `/api/records/:entity/:id/action/:code` | Dispatch an operation |
| `GET` | `/api/records/:entity/export` | Export records (CSV/XLSX) |
| `POST` | `/api/records/:entity/import` | Start an import request |
| `POST` | `/api/records/:entity/bulk` | Bulk status-transition or field-set |

---

## Related Tables

| Table | Relationship |
|---|---|
| `control.entity_field` | Fields belonging to an entity version |
| `control.entity_lifecycle` | Lifecycle bindings for the entity |
| `control.entity_operation` | UI action registrations |
| `control.entity_policy` | Access and audit policy per entity |
| `control.entity_relation` | FK/join relationship declarations |
| `control.entity_publish_state` | Compile/publish tracking (1:1) |
| `control.entity_version` | Versioned entity snapshots |
| `control.entity_numbering_config` | Auto-numbering configuration |
| `control.entity_class_profile` | Governance rules per class |
| `control.field_security_policy` | PII masking policies |
| `control.overlay` | Tenant customisation sets |

---

## Related Docs

- [Overview](./overview.md)
- [Entity Field](./entity-field.md)
- [Lifecycle Engine](./lifecycle.md)
- [Workflow Engine](./workflow.md)
- [Policy Engine](./policy.md)
- [Entity Operations](./entity-operations.md)
