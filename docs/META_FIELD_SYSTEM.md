# Meta.Field System — Complete Reference

> **Athyper Platform** | Last updated: 2026-03-06

---

## Table of Contents

1. [Overview & Architecture](#1-overview--architecture)
2. [Database Schema Layer](#2-database-schema-layer)
3. [Core Type System (TypeScript)](#3-core-type-system-typescript)
4. [Compiler Service & Runtime](#4-compiler-service--runtime)
5. [Overlay System](#5-overlay-system)
6. [Version Diffing & Publication](#6-version-diffing--publication)
7. [API Layer](#7-api-layer)
8. [Frontend Rendering Pipeline](#8-frontend-rendering-pipeline)
9. [Caching Strategy](#9-caching-strategy)
10. [Observability & Metrics](#10-observability--metrics)

---

## 1. Overview & Architecture

The **Meta.Field** system is Athyper's metadata-driven entity modeling engine. It enables dynamic entity definition, policy-driven access control, and runtime schema management — all without requiring application redeployment.

### Architecture Layers

```
┌──────────────────────────────────────────────────────────┐
│  Entity Page UI (React Components)                       │
│  FieldRenderer → type-specific renderers                 │
├──────────────────────────────────────────────────────────┤
│  resolveFieldMeta() — Single source of truth for UI      │
│  Deterministic pure function: FieldMeta → ResolvedField  │
├──────────────────────────────────────────────────────────┤
│  API Layer (Next.js Routes)                              │
│  /api/entity-meta, /api/lookup, /api/data, meta-studio   │
├──────────────────────────────────────────────────────────┤
│  META Compiler Service (Publish-time)                    │
│  EntitySchema → CompiledModel → ResolvedFieldMeta        │
├──────────────────────────────────────────────────────────┤
│  Overlay Engine                                          │
│  Base schema + tenant overlays → merged compiled output  │
├──────────────────────────────────────────────────────────┤
│  Database (PostgreSQL)                                   │
│  meta.entity → meta.entity_version → meta.field          │
│  meta.overlay → meta.overlay_change                      │
│  65+ CHECK constraints, 17+ partial indexes              │
└──────────────────────────────────────────────────────────┘
```

### Key Design Principles

| Principle | Description |
|---|---|
| **Compilation Contract** | `EntitySchema → CompiledModel (IR) → ResolvedFieldMeta (contract)` |
| **Two-Stage Resolution** | Compile-time (validation, field resolution) + Runtime (policy eval, overlay merge) |
| **Immutable Compilation** | Compiled models cached in Redis for deterministic execution |
| **Safety by Default** | Overlay safety policy enforces narrowing-only constraints |
| **Multi-Tenancy** | Tenant isolation via composite FKs, overlays, and policy conditions |
| **Context-Aware** | Same field definition renders differently in create/view/edit contexts |

---

## 2. Database Schema Layer

### 2.1 Core Tables

#### `meta.entity` — Entity Registry

Central registry for all logical entities/doctypes.

| Column | Type | Purpose |
|---|---|---|
| `id` | UUID | Primary key |
| `tenant_id` | UUID FK | Multi-tenant isolation |
| `module_id` | text | Module ownership |
| `name` | text | Logical entity name (unique per tenant) |
| `kind` | text | Entity type: `ref`, `ent`, `doc`, `fin`, `cfg`, `int` |
| `table_schema`, `table_name` | text | Physical DB mapping |
| `governance_level` | text | `full` / `light` / `audit_only` |
| `engine_tag` | text | Owning business engine |
| `entity_short` | text | SAP-style mnemonic (PO, INV, JE) |
| `identity_config` | JSONB | Self-identification for lookups |
| `naming_policy`, `feature_flags` | JSONB | Configuration |
| `is_active` | boolean | Soft deletion flag |

**`identity_config` shape:**
```json
{
  "primaryLabelField": "name",       // required
  "primaryCodeField": "code",
  "alternateKeys": ["sku", "barcode"],
  "searchAliases": ["product_name"],
  "displayTemplate": "{code} — {name}"
}
```

#### `meta.entity_version` — Versioned Entity Definition

Immutable snapshots of entity definitions.

| Column | Type | Purpose |
|---|---|---|
| `entity_id` | UUID FK | Parent entity |
| `version_no` | int | Version sequence |
| `status` | text | `draft` / `published` / `archived` |
| `label`, `behaviors` | JSONB | Version metadata |
| `published_at/by` | timestamp/text | Publication audit |

#### `meta.field` — Field Dictionary (THE CORE)

Complete field definition with **60+ columns** organized into functional groups.

---

### 2.2 Field Columns — Functional Groups

#### A. Basic Identity

| Column | Type | Purpose |
|---|---|---|
| `name` | text | Logical field name (unique within version) |
| `column_name` | text | Physical DB column (snake_case, unique per version) |
| `label`, `description` | text | Display labels |
| `sort_order` | int | Visual ordering |
| `origin` | text | `system` or `business` |
| `is_active` | boolean | Soft deletion |

#### B. Type System (Separated Data Type / UI Type)

| Column | Type | Purpose |
|---|---|---|
| `data_type` | text | **Canonical type** — the source of truth |
| `ui_type` | text | **Deprecated** — legacy component hint |
| `format` | text | Semantic format: `email`, `phone`, `url`, `money`, `percent`, etc. |
| `unit` | text | Measurement unit (kg, hours, meters) |

**Canonical data types:** `string`, `text`, `integer`, `number`, `decimal`, `boolean`, `date`, `datetime`, `reference`, `enum`, `json`, `uuid`, `rich_text`

**Physical PG types (system-authored):** `bigint`, `smallint`, `jsonb`, `timestamptz`, `text[]`, `varchar`, `numeric`, `bytea`, `inet`, `serial`, etc.

**Parameterized types:** `varchar(255)`, `numeric(10,2)`, `decimal(18,4)`

#### C. Cardinality & Collections (FR-3)

| Column | Type | Purpose |
|---|---|---|
| `cardinality` | text | `one` (scalar) or `many` (collection) |
| `child_entity_name` | text | Logical child entity for 1:N |
| `child_fk_field` | text | FK field on child table (e.g., `invoice_id`) |
| `collection_behavior` | JSONB | Collection semantics (see below) |

**`collection_behavior` shape:**
```json
{
  "ownership": "owned",              // "owned" | "linked"
  "persistenceMode": "inline",       // "inline" | "reference_only"
  "deleteMode": "cascade",           // "cascade" | "restrict" | "detach"
  "ordering": true,
  "orderField": "sort_order",
  "editorStyle": "grid",             // "grid" | "subform" | "tags"
  "minItems": 1,
  "maxItems": 50,
  "allowDuplicates": false,
  "aggregateStrategy": "live",       // "live" | "on_save" | "manual"
  "allowDraftRows": true,
  "rowValidation": "on_change"       // "on_change" | "on_save" | "on_submit"
}
```

**Ownership semantics:**

| Mode | Lifecycle | Delete | Persistence |
|---|---|---|---|
| `owned` | Coupled to parent | Cascade | Inline (embedded in parent form) |
| `linked` | Independent | Detach/Restrict | Reference-only (FK links) |

#### D. Structured Config Columns (replacing legacy `validation`/`lookup_config`)

**`constraints` JSONB** — Type-family-validated:
```json
// All types
{ "required": true, "nullable": false }
// + String family
{ "minLength": 1, "maxLength": 255, "pattern": "^[A-Z]" }
// + Numeric family
{ "min": 0, "max": 999999, "precision": 10, "scale": 2 }
// + Date family
{ "minDate": "2020-01-01", "maxDate": "2030-12-31" }
// + Enum family
{ "allowedValues": ["active", "inactive"] }
```

**`enum_config` JSONB:**
```json
{
  "values": [
    { "value": "active", "label": "Active", "color": "#22c55e", "icon": "check" },
    { "value": "inactive", "label": "Inactive", "color": "#ef4444" }
  ],
  "source": "static",           // "static" | "dynamic"
  "dynamicRef": "core.status",  // required if dynamic
  "i18nKey": "enum.status"
}
```

**`reference_config` JSONB** — Structural FK wiring:
```json
{
  "entity": "customer",                    // required
  "relationshipKind": "many-to-one",       // "many-to-one" | "one-to-one" | "one-to-many" | "many-to-many"
  "valueField": "id",
  "hydrateStrategy": "eager",
  // M:N only:
  "joinEntity": "order_customer",
  "joinLeftKey": "order_id",
  "joinRightKey": "customer_id"
}
```

**`money_config` JSONB:**
```json
{
  "currencyMode": "fixed",        // "fixed" | "rowField" | "tenantDefault"
  "fixedCurrency": "USD",         // required if fixed (3-char ISO)
  "currencyField": "currency",    // required if rowField
  "roundingMode": "HALF_UP",      // "HALF_UP" | "HALF_EVEN" | "DOWN" | "UP"
  "scaleMode": "currency",        // "currency" | "fixed"
  "fixedScale": 2,
  "allowNegative": false
}
```

**`datetime_config` JSONB:**
```json
{
  "timezoneMode": "tenant"        // "tenant" | "user" | "utc"
}
```

**`json_config` JSONB:**
```json
{
  "mode": "schema",               // "free" | "schema"
  "schemaRef": "core.address"     // required if schema mode
}
```

#### E. Lookup Profile (FR-1)

**`lookup_profile` JSONB** — Search/display UX for typeahead pickers:
```json
{
  "displayTemplate": "{code} — {name}",
  "searchFields": [
    { "field": "code", "weight": 100, "matchModes": ["exact", "prefix"] },
    { "field": "name", "weight": 10, "matchModes": ["prefix", "contains"] }
  ],
  "matchMode": "prefix",           // "exact" | "prefix" | "contains" | "token"
  "filters": { "is_active": true },
  "filtersByContext": {
    "create": { "status": "active" }
  },
  "orderBy": "code",
  "minChars": 2,                   // 1–10
  "debounceMs": 300,               // 50–2000
  "pageSize": 20,                  // 5–100
  "cacheMode": "session",          // "none" | "session" | "global"
  "securityScope": "tenant"
}
```

#### F. Visibility & Editability (FR-4, Context-Aware)

**`visibility` JSONB:**
```json
{
  "create": "hidden",     // "visible" | "hidden" | "internal"
  "view": "visible",
  "edit": "visible"
}
```
Restrictiveness ranking: `hidden > internal > visible`

**`editability` JSONB:**
```json
{
  "create": "editable",   // "editable" | "read_only" | "system_managed" | "computed"
  "edit": "read_only"
}
```
Restrictiveness ranking: `computed > system_managed > read_only > editable`

#### G. Mutability Flags

| Column | Type | Purpose |
|---|---|---|
| `is_computed` | boolean | Layer 1 — unconditionally read-only |
| `is_read_only` | boolean | Layer 2 — read-only in all contexts |
| `write_once` | boolean | Layer 4 — editable only on creation |
| `is_deprecated` | boolean | Layer 7 — shown with warning |
| `is_required` | boolean | Required for form submission |
| `is_unique` | boolean | Unique constraint |

**Mutual exclusions enforced:** `is_computed + write_once = INVALID`, `is_read_only + write_once = INVALID`

#### H. Computed Fields (FR-9)

| Column | Type | Purpose |
|---|---|---|
| `is_computed` | boolean | Marks field as computed |
| `compute_mode` | text | `virtual` (read-time) or `materialized` (stored) |
| `compute_expr` | JSONB | Computation specification |

**`compute_expr` shape:**
```json
// Formula type
{
  "type": "formula",
  "expr": "quantity * unit_price",
  "dependsOn": ["quantity", "unit_price"]
}

// Aggregate type
{
  "type": "aggregate",
  "aggregateOf": "invoice_lines",
  "aggregateOp": "sum",           // "count" | "sum" | "avg" | "min" | "max"
  "expr": "line_total",
  "dependsOn": ["invoice_lines"]
}

// System type
{
  "type": "system",
  "expr": "now"                   // Allowlist: now, current_user, current_tenant, row_version, uuid_generate
}
```

**Materialized-only options:**
- `recomputeTrigger`: `on_dependency_change` | `on_save` | `scheduled`
- `stalePolicy`: `serve_stale` | `null_until_recomputed` | `recompute_sync`
- `scheduleInterval`: Cron expression (requires `scheduled` trigger)

#### I. List Capabilities (FR-8)

| Column | Type | Purpose |
|---|---|---|
| `is_searchable` | boolean | Participates in search |
| `is_filterable` | boolean | Participates in filtering |
| `is_sortable` | boolean | Participates in sorting |
| `is_groupable` | boolean | Participates in grouping |
| `is_aggregatable` | boolean | Participates in aggregation |

**Constraints:** json/rich_text can't be sortable; json/boolean/rich_text can't be aggregatable.

#### J. UI Hint (Layer 8, Advisory Only)

**`ui_hint` JSONB** — rendering suggestions that **never override domain truth**:
```json
{
  "type": "text",                  // Generic UI type
  "viewType": "formatted-text",   // Mode-specific override
  "editType": "rich-editor",
  "hidden": false,
  "disabled": false,
  "readOnly": false,               // Advisory only!
  "lockOnEdit": false,             // Advisory only!
  "placeholder": "Enter name...",
  "helpText": "Customer display name",
  "section": "general",
  "icon": "user",
  "group": "identity",
  "density": "default",            // "compact" | "default" | "comfortable"
  "layout": {},
  "props": {},
  "listColumnWidth": 200,
  "listColumnAlignment": "left"
}
```

---

### 2.3 Constraint System (65+ CHECK constraints)

The database enforces correctness at the schema level across multiple categories:

| Category | Count | Examples |
|---|---|---|
| Type Safety | 8 | `chk_field_data_type`, `chk_field_format`, `chk_field_cardinality` |
| Type-Family Validation | 6 | String fields can't have `minDate`; date fields can't have `minLength` |
| Structural Wiring | 4 | `cardinality=many` requires `child_entity_name + child_fk_field` |
| Reference Config | 8 | Entity required; M:N requires join keys |
| Lookup Profile | 5 | `minChars: 1–10`, `pageSize: 5–100`, `debounceMs: 50–2000` |
| Visibility/Editability | 6 | Valid values per context; computed can't be "editable" |
| Mutability | 4 | `is_computed + write_once = INVALID` |
| Collection Behavior | 14 | `owned + detach = INVALID`; `minItems ≤ maxItems` |
| Money Config | 7 | `currencyMode` required; `fixedCurrency` required if fixed |
| Computed Expression | 9 | Aggregate requires `aggregateOf + aggregateOp` |
| Column Uniqueness | 3 | snake_case format; unique per version |
| Tenant Integrity | 2+ | Composite FKs prevent cross-tenant leaks |

### 2.4 Runtime Indexes (17+ partial/covering)

| Index | Purpose |
|---|---|
| `idx_field_active_ordered` | Hot path: `(tenant_id, entity_version_id, sort_order, name) WHERE is_active` |
| `idx_entity_active_name` | Primary entity resolution: `(tenant_id, name) WHERE is_active` |
| `idx_entity_version_published_latest` | Latest version: `(tenant_id, entity_id, version_no DESC) WHERE status='published'` |
| `idx_field_computed` | Dependency graph: `WHERE is_computed = true` |
| `idx_field_collection` | Collection resolution: `WHERE cardinality = 'many'` |
| `idx_field_reference` | FK resolution: `WHERE reference_config IS NOT NULL` |
| `idx_field_lookup` | Lookup profiles: `WHERE lookup_profile IS NOT NULL` |

---

## 3. Core Type System (TypeScript)

Located in `framework/core/src/meta/types.ts`

### 3.1 FieldDefinition — Complete Field Schema

```typescript
interface FieldDefinition {
  // Identity
  name: string;
  type: FieldType;
  label?: string;
  description?: string;

  // Constraints
  required?: boolean;
  unique?: boolean;
  indexed?: boolean;
  isReadOnly?: boolean;
  writeOnce?: boolean;

  // Validation
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  constraints?: Record<string, unknown>;

  // UI Configuration
  ui?: FieldUiHint;
  format?: string;
  unit?: string;

  // Cardinality
  cardinality?: 'one' | 'many';

  // Reference/Enum/Lookup
  referenceConfig?: ReferenceConfig;
  enumConfig?: EnumConfig;
  lookupProfile?: LookupProfile;

  // Computed
  isComputed?: boolean;
  computeMode?: 'virtual' | 'materialized';
  computeExpr?: ComputeExpression;

  // Collections
  childEntityName?: string;
  childFkField?: string;
  collectionBehavior?: CollectionBehavior;

  // Metadata
  origin?: 'system' | 'user';
  isDeprecated?: boolean;
  sortOrder?: number;
}
```

### 3.2 Visibility & Editability Types

```typescript
interface FieldVisibility {
  create?: 'visible' | 'hidden' | 'internal';
  view?:   'visible' | 'hidden' | 'internal';
  edit?:   'visible' | 'hidden' | 'internal';
}

interface FieldEditability {
  create?: 'editable' | 'read_only' | 'system_managed' | 'computed';
  edit?:   'editable' | 'read_only' | 'system_managed' | 'computed';
}

interface FieldVisibilityOverlay {
  mode: 'replace' | 'extend';
  rules: Partial<FieldVisibility>;
}
```

### 3.3 Policy System

```typescript
interface PolicyDefinition {
  name: string;
  effect: 'allow' | 'deny';
  action: 'create' | 'read' | 'update' | 'delete' | '*';
  resource: string;
  conditions?: PolicyCondition[];
  fields?: string[];      // Field-level access control
  priority?: number;       // Higher = evaluated first
}

interface PolicyCondition {
  field: string;           // e.g., "ctx.roles", "record.userId"
  operator: 'eq' | 'ne' | 'in' | 'not_in' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'starts_with' | 'ends_with';
  value: unknown;
}
```

### 3.4 EntitySchema

```typescript
interface EntitySchema {
  fields: FieldDefinition[];
  policies?: PolicyDefinition[];
  metadata?: {
    label?: string;
    description?: string;
    icon?: string;
    color?: string;
    tags?: string[];
  };
}
```

---

## 4. Compiler Service & Runtime

Located in `framework/runtime/src/services/platform/meta/core/compiler.service.ts`

### 4.1 Compilation Pipeline

```
EntitySchema
  ↓
  Schema Validation (system fields, type checks, enum/reference validation)
  ↓
  Field Compilation (camelCase → snake_case, label resolution, constraint merge)
  ↓
  UI Type Auto-Detection (dataType + format → uiType)
  ↓
  Visibility/Editability Defaults (system/computed field rules)
  ↓
  Policy Compilation (conditions → evaluator functions)
  ↓
  Hash Computation (input + output stability hashes)
  ↓
  CompiledModel (cached in Redis, TTL: 3600s)
```

### 4.2 CompiledModel (Intermediate Representation)

```typescript
interface CompiledModel {
  entityName: string;
  version: number;
  tableName: string;
  fields: CompiledField[];
  policies: CompiledPolicy[];

  // Pre-built query fragments
  selectFragment: string;
  fromFragment: string;
  tenantFilterFragment: string;

  // Diagnostics
  diagnostics: Diagnostic[];    // ERROR / WARN / INFO
  inputHash: string;            // Source stability
  outputHash: string;           // Artifact stability
  compiledAt: Date;
  compiledBy: string;
}
```

### 4.3 ResolvedFieldMeta (Publish-time Contract)

The final, fully-resolved field representation consumed by both runtime and UI:

```typescript
interface ResolvedFieldMeta {
  // Identity
  name: string;
  columnName: string | null;     // null for virtual computed
  label: string;
  description?: string;

  // Data layer
  dataType: string;
  format?: string;
  unit?: string;
  cardinality: 'one' | 'many';

  // Resolved renderer
  uiType: string;                // Auto-detected
  viewType?: string;
  editType?: string;
  uiConfig?: Record<string, unknown>;

  // Effective constraints (merged)
  constraints: MergedConstraints;

  // Context-aware visibility/editability
  visibility: { create: string; view: string; edit: string };
  editability: { create: string; edit: string };

  // Configs
  lookupConfig?: object;
  lookupProfile?: object;
  enumConfig?: object;
  referenceConfig?: object;
  moneyConfig?: object;
  datetimeConfig?: object;

  // Computed
  isComputed?: boolean;
  computeMode?: string;
  computeExpr?: object;

  // Collections
  childEntityName?: string;
  childFkField?: string;
  collectionBehavior?: object;

  // Capabilities
  isSearchable: boolean;
  isFilterable: boolean;
  isSortable: boolean;
  isGroupable: boolean;
  isAggregatable: boolean;

  // Behavior
  isRequired: boolean;
  isUnique: boolean;
  isReadOnly: boolean;
  isDeprecated: boolean;
  writeOnce: boolean;
  sortOrder: number;
}
```

### 4.4 System Field Invariants

These fields are **always present** and cannot be removed/modified:

| Field | Type | Purpose |
|---|---|---|
| `id` | uuid | Primary key |
| `tenant_id` | uuid | Multi-tenant isolation |
| `realm_id` | string/uuid | Realm isolation |
| `created_at` | datetime | Audit: creation time |
| `created_by` | string | Audit: creator |
| `updated_at` | datetime | Audit: last modification |
| `updated_by` | string | Audit: last modifier |
| `deleted_at` | datetime | Soft delete marker |
| `deleted_by` | string | Soft delete actor |
| `version` | number | Optimistic locking |

---

## 5. Overlay System

Located in `framework/runtime/src/services/platform/meta/handlers/overlay.handler.ts`

### 5.1 What Overlays Do

Overlays allow **tenant-specific customizations** to be layered on top of base entity schemas without modifying the original. They support:

- Adding new fields
- Modifying field properties (with safety constraints)
- Removing fields
- Tweaking policies, relations, indexes

### 5.2 Overlay Structure

```
meta.overlay (container)
  ├── overlay_key: unique per tenant
  ├── base_entity_id / base_version_id
  ├── priority: application order
  ├── conflict_mode: fail | overwrite | merge
  └── meta.overlay_change[] (ordered deltas)
        ├── kind: addField | modifyField | removeField | tweakPolicy | ...
        ├── path: target field/property
        └── value: new value
```

### 5.3 Safety Policy (FIELD_OVERLAY_SAFETY)

| Category | Behavior |
|---|---|
| **Immutable** — cannot change | `column_name`, `data_type`, `cardinality` |
| **Narrowable** — can only restrict | `isFilterable`, `isSearchable`, `isSortable`, visibility, editability |
| **Replaceable** — can change freely | `ui_hint`, `label`, `description`, `displayTemplate`, `searchFields` |

### 5.4 Visibility/Editability Overlay Modes

**`replace`** — completely override base value:
```json
{ "mode": "replace", "rules": { "edit": "hidden" } }
```

**`extend`** — only add restrictions (most restrictive wins):
```json
{ "mode": "extend", "rules": { "edit": "read_only" } }
```

### 5.5 Three-Layer Resolution Model

```
Layer 1: Base Standard   — visibility/editability on meta.field
Layer 2: Customer Overlay — overlay_change with replace/extend
Layer 3: Runtime Resolve  — Computed by resolution engine merging all layers
```

---

## 6. Version Diffing & Publication

Located in `framework/core/src/meta/version-diff.ts`

### 6.1 Change Impact Classification

| Impact | Meaning | Example |
|---|---|---|
| `non_breaking` | Safe to deploy | Label change, description update |
| `migration_required` | Data changes needed | Default value change |
| `breaking` | Backwards-incompatible | Data type change, field removal |
| `publish_blocking` | **Prevents publication** | New required field without default |

**Impact severity ordering:** `non_breaking (0) < migration_required (1) < breaking (2) < publish_blocking (3)`

### 6.2 Publish-Blocking Rules

- New required field **without** default value → `publish_blocking`
- Removed field → `breaking`
- Removed enum value → `breaking`
- Added enum value → `non_breaking`
- New optional field → `non_breaking`

---

## 7. API Layer

### 7.1 Public Data APIs

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/entity-meta/[entityKey]/fields` | Fetch field metadata for entity |
| GET | `/api/data/[entity]` | List paginated records with FK resolution |
| POST | `/api/data/[entity]` | Create entity record |
| GET | `/api/data/[entity]/[id]` | Fetch single record |
| PATCH | `/api/data/[entity]/[id]` | Update record |
| DELETE | `/api/data/[entity]/[id]` | Soft-delete record |
| GET | `/api/data/[entity]/[id]/children/[field]` | Fetch child records for collection |
| POST | `/api/lookup/resolve` | Batch-resolve FK UUIDs → labels |
| GET | `/api/lookup/[entity]?q=...` | Typeahead search for reference fields |

### 7.2 Meta Studio Admin APIs

| Method | Endpoint | Purpose |
|---|---|---|
| GET/POST | `/api/admin/mesh/meta-studio` | List/create entities |
| GET/PUT/DELETE | `/api/admin/mesh/meta-studio/[entity]` | CRUD entity |
| GET/POST/DELETE | `/api/admin/mesh/meta-studio/[entity]/fields` | Manage fields (create/update/reorder/delete) |
| GET | `.../[entity]/relations` | Relations management |
| GET | `.../[entity]/indexes` | Index management |
| GET | `.../[entity]/policies` | Security policies |
| GET | `.../[entity]/overlays` | Overlay management |
| GET | `.../[entity]/versions` | Version history |
| GET | `.../[entity]/compiled` | Compiled schema output |
| POST | `.../[entity]/compile` | Trigger compilation |
| POST | `.../[entity]/publish` | Publish version |
| POST | `.../[entity]/validate` | Validate metadata |

### 7.3 Dual-Source Field Resolution

The field metadata API resolves fields from two sources with fallback:

```
Priority 1: meta.field table (latest published entity_version)
   ↓ (if empty)
Priority 2: information_schema.columns (auto-detect from PG types)
```

FK detection priority:
1. Explicit `lookupConfig` / `reference_config` (authoritative)
2. DB constraints from `information_schema.table_constraints` (fallback)

### 7.4 Lookup Search Engine

Server-side relevance ranking with 4 tiers:

| Tier | Match Type | Weight Multiplier |
|---|---|---|
| 1 | Exact match on code field | ×1000 |
| 2 | Prefix match on code field | ×100 |
| 3 | Prefix match on name field | ×10 |
| 4 | Contains match | ×1 |

Search field resolution: `field.lookupProfile > entity.identityConfig > heuristic (code, name, title)`

### 7.5 Validation Schemas (Zod)

**Reserved field names** (cannot be used for custom fields):
`id`, `tenant_id`, `realm_id`, `created_at`, `created_by`, `updated_at`, `updated_by`, `deleted_at`, `deleted_by`, `version`

**Entity validation:**
- `name`: snake_case, 1–128 chars, must start with letter
- `kind`: enum `[ref, ent, doc, fin, cfg, int]`
- `governanceLevel`: enum `[full, light, audit_only]`

**Field validation:**
- `name`: non-reserved snake_case, 1–128 chars
- `dataType`: closed enum of 12 canonical types
- Body discrimination: `{ fieldIds }` → reorder, `{ fieldId }` → update, `{ name }` → create

### 7.6 Response Envelope

```typescript
{
  success: boolean;
  data: T;
  meta?: { pagination, cacheStatus };
  refs?: { "schema.table": { "uuid": { id, label } } };
  error?: { code, message, fieldErrors };
  _debug?: { error };              // dev only
}
```

---

## 8. Frontend Rendering Pipeline

### 8.1 Data Flow Overview

```
EntityPage
  ├── useEntityFields(entityKey)          // Fetch FieldMeta[]
  │
  ├── DetailsTab (view mode)
  │   └── FieldRenderer
  │       └── resolveFieldMeta(field, "view")
  │           └── Type-specific renderer
  │
  └── EntityForm (create/edit mode)
      └── FieldRenderer
          └── resolveFieldMeta(field, "edit"|"create")
              └── Type-specific renderer
```

### 8.2 resolveFieldMeta() — The Resolution Engine

Located in `lib/entity-page/resolve-field-meta.ts`. This is the **single authoritative place** for UI type resolution. It's a deterministic pure function.

**Resolution layers (priority order):**

#### Layer 1: Visibility Resolution
```
field.visibility[context] → overlay (replace/extend) → "visible" | "hidden" | "internal"
   hidden/internal → field does not render
```

#### Layer 2: UI Type Resolution (5-tier priority)
```
1. Mode-specific override: uiHint.viewType / uiHint.editType
2. Generic UI type: uiHint.type
3. Legacy column: field.uiType (backward compat)
4. Auto-detect from dataType + format + constraints
```

#### Layer 3: Read-Only Resolution (8-layer precedence, early-return)
```
1. is_computed=true        → COMPUTED (unconditional)
2. is_read_only=true       → SYSTEM_MANAGED
3. origin="system"         → SYSTEM_ORIGIN
4. write_once + edit mode  → WRITE_ONCE
5. editability + overlay   → context-evaluated
6. Convention columns      → LIFECYCLE_MANAGED / SYSTEM_MANAGED
7. is_deprecated=true      → DEPRECATED
8. ui_hint.readOnly        → UI_ADVISORY (rendering only!)
```

#### Layer 4: Constraint Resolution
```
field.constraints (structured) → fallback to field.validation (legacy)
```

#### Layer 5: Config Synthesis
```
Enum: enumConfig → validation.enumValues
Reference: referenceConfig → lookupConfig → FK detection
Money: moneyConfig → format="money" defaults
Datetime: datetimeConfig → timezone handling
```

### 8.3 UI Type Auto-Detection

| Data Type | Condition | Resolved UI Type |
|---|---|---|
| `string` | maxLength > 120 | `textarea` |
| `string` | otherwise | `text` |
| `integer` | has enumConfig | `select` |
| `integer` | otherwise | `number` |
| `decimal` | format=money, view mode | `money-view` |
| `decimal` | format=money, edit mode | `money-input` |
| `decimal` | otherwise | `number` |
| `boolean` | nullable & not required | `tristate-select` |
| `boolean` | otherwise | `toggle` |
| `date` | — | `datepicker` |
| `datetime` | — | `datetimepicker` |
| `uuid` | has referenceConfig | `reference-picker` |
| `uuid` | origin=system, not view | `hidden` |
| `uuid` | view mode | `uuid-view` |
| `reference` | cardinality=many | `reference-multi-picker` |
| `reference` | otherwise | `reference-picker` |
| `enum` | cardinality=many | `multi-select` |
| `enum` | otherwise | `select` |
| `json` | — | `json-editor` |
| `rich_text` | — | `textarea` |
| collection | childEntityName + childFkField | `collection` |

### 8.4 Field Renderer Dispatch

```
FieldRenderer
  ↓ resolveFieldMeta()
  ↓ Hidden? → null
  ↓ Collection? → CollectionFieldRenderer
  ↓ Read-only (forced)? → ReadOnlyField (label + lock icon + tooltip)
  ↓ View mode? → renderViewMode (formatted display)
  ↓ Edit/Create? → switch(resolvedUiType):
      "text"                   → TextRenderer
      "textarea"               → TextareaRenderer
      "number"                 → NumberRenderer
      "money-input"            → MoneyInputRenderer
      "toggle"                 → ToggleRenderer
      "tristate-select"        → TristateSelectRenderer
      "select"                 → SelectRenderer
      "multi-select"           → MultiSelectRenderer
      "datepicker"             → DatePickerRenderer
      "datetimepicker"         → DateTimePickerRenderer
      "reference-picker"       → ReferencePickerRenderer → LookupTypeahead
      "reference-multi-picker" → ReferenceMultiPickerRenderer
      "json-editor"            → JsonEditorRenderer
      "uuid-view"              → UuidViewRenderer
      "collection"             → CollectionFieldRenderer
      "hidden"                 → null
```

### 8.5 Reference Picker Flow

```
ReferencePickerRenderer
  ├── If referenceConfig.entity exists
  │   └── LookupTypeahead (combobox)
  │       └── useLookupSearch hook
  │           └── GET /api/lookup/{entity}?q=...&limit=20&profile=...
  │           └── Debounced (300ms), min 2 chars, abort controller
  │       └── Results: label + sublabel (from displayTemplate)
  │       └── On select: onChange(selectedUUID)
  └── Else: fallback plain UUID text input
```

### 8.6 Collection Field Flow

```
CollectionFieldRenderer
  └── useCollectionField hook
      ├── Fetch child rows: GET /api/data/{parent}/{id}/children/{field}
      ├── Fetch child fields: separate meta call
      ├── Track: rows[], addRow, removeRow, updateRow, reorderRows
      ├── Save: POST { rows, deleteIds } (diff-based batch)
      └── Render:
          ├── View mode: read-only table
          └── Edit mode: inline grid
              ├── Columns from childFields metadata
              ├── Each cell = nested FieldRenderer
              ├── Add button (if canAddMore per maxItems)
              └── Delete buttons per row
```

### 8.7 useEntityFields Hook

```typescript
// Client-side with module-level cache
const { fields, loading, error } = useEntityFields(entityKey);
```

- Fetches from `GET /api/entity-meta/{entityKey}/fields`
- Module-level Map cache (persists across re-renders)
- In-flight tracking prevents concurrent requests
- No TTL (cached until page refresh)

---

## 9. Caching Strategy

### 9.1 Three-Tier Architecture

```
┌─────────────────────────────────────────────┐
│  L0: Frontend Module Cache (in-process)     │
│      No TTL, persists until page refresh    │
├─────────────────────────────────────────────┤
│  L1: Backend In-Process Map (10-min TTL)    │
│      Per-worker, per-entity cache           │
├─────────────────────────────────────────────┤
│  L2: Redis (24-hour TTL)                    │
│      Shared across workers, namespace ver.  │
├─────────────────────────────────────────────┤
│  Database (PostgreSQL)                      │
│      Source of truth                        │
└─────────────────────────────────────────────┘
```

### 9.2 Redis Cache Keys

| Key Pattern | TTL | Purpose |
|---|---|---|
| `ep:fields:ns{v}:{tenant}:{entity}:{version}` | 24h | Field metadata |
| `ep:cols:ns{v}:{schema}.{table}` | 24h | Column info |
| `ep:fkmap:ns{v}:{schema}.{table}` | 24h | FK map |
| `ep:dp:ns{v}:{schema}.{table}` | 24h | Display policy |
| `ep:ref:ns{v}:{tenant}:{schema}.{table}:{id}` | 30min | Resolved references |
| `ep:lk:ns{v}:{tenant}:{entity}:{queryHash}` | 1min | Lookup search results |
| `meta:compiled:{entity}:{version}` | 1h | Compiled models |

### 9.3 Namespace Versioning (O(1) Bulk Invalidation)

- Global version counter in Redis: `ep:ns:v1`
- Bump version → all namespaced keys become instantly stale
- Triggered after schema changes in admin

### 9.4 Payload Guards

- **Warn** at 64KB payload size
- **Skip cache** at 256KB (prevents oversizing Redis)

### 9.5 Stampede Prevention

- **Lock-lite**: Redis `NX` lock prevents cross-worker cache stampede
- **Graceful degradation**: No Redis = L1 only (no errors)

---

## 10. Observability & Metrics

Located in `framework/runtime/src/services/platform/meta/observability/metrics.ts`

### Metric Categories

| Category | Metrics |
|---|---|
| **Compilation** | `meta_compilation_latency_ms` (histogram), `meta_compilation_total` (counter), cache hit ratio (gauge) |
| **Validation** | `meta_rule_execution_time_ms`, `meta_validation_total`, `meta_validation_failures_total` (by rule_kind, severity) |
| **Policy** | `meta_policy_eval_latency_ms`, `meta_policy_eval_total`, `meta_policy_denied_total` |
| **Lifecycle** | `meta_transition_latency_ms`, `meta_transition_total`, `meta_transition_failed_total` |
| **Data API** | `meta_data_op_latency_ms` (by operation), `meta_data_op_total` |
| **Overlay** | `meta_overlay_conflicts_total` (by conflict_mode) |
| **Cascade Delete** | `meta_cascade_delete_depth` (histogram), `meta_cascade_delete_total` |
| **Lookup** | `meta_lookup_latency_ms` (by context), `meta_lookup_total`, `meta_lookup_zero_results_total` |

### Server-Timing Headers

All data API responses include `Server-Timing` headers tracking:
- `cache` — cache lookup duration
- `sql` — database query duration
- `fk` — FK resolution duration
- `total` — end-to-end duration

### Resolution Signals

The `resolveFieldMeta()` function emits `resolutionSignals` for observability:
- Tracks legacy field usage (deprecated paths)
- Records fallback decisions (structured → legacy)
- Helps identify migration gaps from old format to new

---

## Appendix: File Location Reference

| Layer | Path |
|---|---|
| SQL Migrations | `framework/adapters/db/src/sql/01_foundation/043–056_*.sql` |
| Prisma Schema | `framework/adapters/db/src/prisma/schema.prisma` |
| Kysely Types | `framework/adapters/db/src/generated/kysely/types.ts` |
| Core Types | `framework/core/src/meta/types.ts` |
| Core Exports | `framework/core/src/meta/index.ts` |
| Version Diff | `framework/core/src/meta/version-diff.ts` |
| Compiler Service | `framework/runtime/src/services/platform/meta/core/compiler.service.ts` |
| Entity Sub Handlers | `framework/runtime/src/services/platform/meta/handlers/entity-sub.handler.ts` |
| Overlay Handlers | `framework/runtime/src/services/platform/meta/handlers/overlay.handler.ts` |
| Metrics | `framework/runtime/src/services/platform/meta/observability/metrics.ts` |
| Entity Meta API | `products/neon/apps/web/app/api/entity-meta/[entityKey]/` |
| Lookup API | `products/neon/apps/web/app/api/lookup/[entity]/` |
| Meta Studio Admin | `products/neon/apps/web/app/api/admin/mesh/meta-studio/` |
| Field Meta Lib | `products/neon/apps/web/lib/entity-meta-fields.ts` |
| Field Resolution | `products/neon/apps/web/lib/entity-page/resolve-field-meta.ts` |
| useEntityFields | `products/neon/apps/web/lib/use-entity-fields.ts` |
| useCollectionField | `products/neon/apps/web/lib/use-collection-field.ts` |
| useLookupSearch | `products/neon/apps/web/lib/use-lookup-search.ts` |
| FieldRenderer | `products/neon/apps/web/components/entity-page/fields/FieldRenderer.tsx` |
| Renderers | `products/neon/apps/web/components/entity-page/fields/renderers/` |
| Redis Cache | `products/neon/apps/web/lib/redis-cache.ts` |
| Schema Manager | `products/neon/apps/web/lib/schema-manager/` |
