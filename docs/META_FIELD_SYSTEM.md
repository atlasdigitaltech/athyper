# Meta.Field System -- Field Dictionary & Frontend Reference

> **Athyper Platform** | Last updated: 2026-03-07
>
> This document covers the `meta.field` table structure, constraint system, frontend rendering pipeline, caching, and observability.
> For entity registry, classification, governance, versioning, lifecycle, policies, overlays, compilation, service contracts, and data API, see [META Engine: Entity System](meta-entity-system.md).

---

## Table of Contents

1. [Field Columns -- Functional Groups](#1-field-columns--functional-groups)
2. [Constraint System](#2-constraint-system)
3. [Runtime Indexes](#3-runtime-indexes)
4. [API Layer](#4-api-layer)
5. [Frontend Rendering Pipeline](#5-frontend-rendering-pipeline)
6. [Caching Strategy](#6-caching-strategy)
7. [Observability & Metrics](#7-observability--metrics)
8. [Appendix: File Location Reference](#8-appendix-file-location-reference)

---

## 1. Field Columns -- Functional Groups

The `meta.field` table is the field dictionary with **60+ columns** organized into functional groups. Fields are stored per entity version via `entity_version_id` FK to `meta.entity_version`.

### A. Basic Identity

| Column | Type | Purpose |
|---|---|---|
| `name` | text | Logical field name (unique within version) |
| `column_name` | text | Physical DB column (snake_case, unique per version) |
| `label`, `description` | text | Display labels |
| `sort_order` | int | Visual ordering |
| `origin` | text | `system` or `business` |
| `is_active` | boolean | Soft deletion |

### B. Type System (Separated Data Type / UI Type)

| Column | Type | Purpose |
|---|---|---|
| `data_type` | text | **Canonical type** -- the source of truth |
| `ui_type` | text | **Deprecated** -- legacy component hint |
| `format` | text | Semantic format: `email`, `phone`, `url`, `money`, `percent`, etc. |
| `unit` | text | Measurement unit (kg, hours, meters) |

**Canonical data types:** `string`, `text`, `integer`, `number`, `decimal`, `boolean`, `date`, `datetime`, `reference`, `enum`, `json`, `uuid`, `rich_text`

**Physical PG types (system-authored):** `bigint`, `smallint`, `jsonb`, `timestamptz`, `text[]`, `varchar`, `numeric`, `bytea`, `inet`, `serial`, etc.

**Parameterized types:** `varchar(255)`, `numeric(10,2)`, `decimal(18,4)`

### C. Cardinality & Collections

| Column | Type | Purpose |
|---|---|---|
| `cardinality` | text | `one` (scalar) or `many` (collection) |
| `child_entity_name` | text | Logical child entity for 1:N |
| `child_fk_field` | text | FK field on child table (e.g., `invoice_id`) |
| `collection_behavior` | JSONB | Collection semantics (see below) |

**`collection_behavior` shape:**
```json
{
  "ownership": "owned",
  "persistenceMode": "inline",
  "deleteMode": "cascade",
  "ordering": true,
  "orderField": "sort_order",
  "editorStyle": "grid",
  "minItems": 1,
  "maxItems": 50,
  "allowDuplicates": false,
  "aggregateStrategy": "live",
  "allowDraftRows": true,
  "rowValidation": "on_change"
}
```

**Ownership semantics:**

| Mode | Lifecycle | Delete | Persistence |
|---|---|---|---|
| `owned` | Coupled to parent | Cascade | Inline (embedded in parent form) |
| `linked` | Independent | Detach/Restrict | Reference-only (FK links) |

### D. Structured Config Columns

**`constraints` JSONB** -- Type-family-validated:
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
  "source": "static",
  "dynamicRef": "core.status",
  "i18nKey": "enum.status"
}
```

**`reference_config` JSONB** -- Structural FK wiring:
```json
{
  "entity": "customer",
  "relationshipKind": "many-to-one",
  "valueField": "id",
  "hydrateStrategy": "eager",
  "joinEntity": "order_customer",
  "joinLeftKey": "order_id",
  "joinRightKey": "customer_id"
}
```

**`money_config` JSONB:**
```json
{
  "currencyMode": "fixed",
  "fixedCurrency": "USD",
  "currencyField": "currency",
  "roundingMode": "HALF_UP",
  "scaleMode": "currency",
  "fixedScale": 2,
  "allowNegative": false
}
```

**`datetime_config` JSONB:**
```json
{
  "timezoneMode": "tenant"
}
```

**`json_config` JSONB:**
```json
{
  "mode": "schema",
  "schemaRef": "core.address"
}
```

### E. Lookup Profile

**`lookup_profile` JSONB** -- Search/display UX for typeahead pickers:
```json
{
  "displayTemplate": "{code} -- {name}",
  "searchFields": [
    { "field": "code", "weight": 100, "matchModes": ["exact", "prefix"] },
    { "field": "name", "weight": 10, "matchModes": ["prefix", "contains"] }
  ],
  "matchMode": "prefix",
  "filters": { "is_active": true },
  "filtersByContext": {
    "create": { "status": "active" }
  },
  "orderBy": "code",
  "minChars": 2,
  "debounceMs": 300,
  "pageSize": 20,
  "cacheMode": "session",
  "securityScope": "tenant"
}
```

### F. Visibility & Editability (Context-Aware)

**`visibility` JSONB:**
```json
{
  "create": "hidden",
  "view": "visible",
  "edit": "visible"
}
```
Restrictiveness ranking: `hidden > internal > visible`

**`editability` JSONB:**
```json
{
  "create": "editable",
  "edit": "read_only"
}
```
Restrictiveness ranking: `computed > system_managed > read_only > editable`

### G. Mutability Flags

| Column | Type | Purpose |
|---|---|---|
| `is_computed` | boolean | Layer 1 -- unconditionally read-only |
| `is_read_only` | boolean | Layer 2 -- read-only in all contexts |
| `write_once` | boolean | Layer 4 -- editable only on creation |
| `is_deprecated` | boolean | Layer 7 -- shown with warning |
| `is_required` | boolean | Required for form submission |
| `is_unique` | boolean | Unique constraint |

**Mutual exclusions enforced:** `is_computed + write_once = INVALID`, `is_read_only + write_once = INVALID`

### H. Computed Fields

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
  "aggregateOp": "sum",
  "expr": "line_total",
  "dependsOn": ["invoice_lines"]
}

// System type
{
  "type": "system",
  "expr": "now"
}
```

**Materialized-only options:**
- `recomputeTrigger`: `on_dependency_change` | `on_save` | `scheduled`
- `stalePolicy`: `serve_stale` | `null_until_recomputed` | `recompute_sync`
- `scheduleInterval`: Cron expression (requires `scheduled` trigger)

### I. List Capabilities

| Column | Type | Purpose |
|---|---|---|
| `is_searchable` | boolean | Participates in search |
| `is_filterable` | boolean | Participates in filtering |
| `is_sortable` | boolean | Participates in sorting |
| `is_groupable` | boolean | Participates in grouping |
| `is_aggregatable` | boolean | Participates in aggregation |

**Constraints:** json/rich_text can't be sortable; json/boolean/rich_text can't be aggregatable.

### J. UI Hint (Layer 8, Advisory Only)

**`ui_hint` JSONB** -- rendering suggestions that **never override domain truth**:
```json
{
  "type": "text",
  "viewType": "formatted-text",
  "editType": "rich-editor",
  "hidden": false,
  "disabled": false,
  "readOnly": false,
  "lockOnEdit": false,
  "placeholder": "Enter name...",
  "helpText": "Customer display name",
  "section": "general",
  "icon": "user",
  "group": "identity",
  "density": "default",
  "layout": {},
  "props": {},
  "listColumnWidth": 200,
  "listColumnAlignment": "left"
}
```

---

## 2. Constraint System (65+ CHECK Constraints)

The database enforces correctness at the schema level across multiple categories:

| Category | Count | Examples |
|---|---|---|
| Type Safety | 8 | `chk_field_data_type`, `chk_field_format`, `chk_field_cardinality` |
| Type-Family Validation | 6 | String fields can't have `minDate`; date fields can't have `minLength` |
| Structural Wiring | 4 | `cardinality=many` requires `child_entity_name + child_fk_field` |
| Reference Config | 8 | Entity required; M:N requires join keys |
| Lookup Profile | 5 | `minChars: 1-10`, `pageSize: 5-100`, `debounceMs: 50-2000` |
| Visibility/Editability | 6 | Valid values per context; computed can't be "editable" |
| Mutability | 4 | `is_computed + write_once = INVALID` |
| Collection Behavior | 14 | `owned + detach = INVALID`; `minItems <= maxItems` |
| Money Config | 7 | `currencyMode` required; `fixedCurrency` required if fixed |
| Computed Expression | 9 | Aggregate requires `aggregateOf + aggregateOp` |
| Column Uniqueness | 3 | snake_case format; unique per version |
| Tenant Integrity | 2+ | Composite FKs prevent cross-tenant leaks |

---

## 3. Runtime Indexes (17+ Partial/Covering)

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

## 4. API Layer

> For the full API reference (Meta Studio admin + entity data endpoints), see [META Engine: Entity System -- API Routes](meta-entity-system.md#schema-manager-web-ui).

### Lookup Search Engine

Server-side relevance ranking with 4 tiers:

| Tier | Match Type | Weight Multiplier |
|---|---|---|
| 1 | Exact match on code field | x1000 |
| 2 | Prefix match on code field | x100 |
| 3 | Prefix match on name field | x10 |
| 4 | Contains match | x1 |

Search field resolution: `field.lookupProfile > entity.identityConfig > heuristic (code, name, title)`

### Dual-Source Field Resolution

The field metadata API resolves fields from two sources with fallback:

```
Priority 1: meta.field table (latest published entity_version)
   | (if empty)
Priority 2: information_schema.columns (auto-detect from PG types)
```

FK detection priority:
1. Explicit `lookupConfig` / `reference_config` (authoritative)
2. DB constraints from `information_schema.table_constraints` (fallback)

### Response Envelope

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

## 5. Frontend Rendering Pipeline

### 5.1 Data Flow Overview

```
EntityPage
  +-- useEntityFields(entityKey)          // Fetch FieldMeta[]
  |
  +-- DetailsTab (view mode)
  |   +-- FieldRenderer
  |       +-- resolveFieldMeta(field, "view")
  |           +-- Type-specific renderer
  |
  +-- EntityForm (create/edit mode)
      +-- FieldRenderer
          +-- resolveFieldMeta(field, "edit"|"create")
              +-- Type-specific renderer
```

### 5.2 resolveFieldMeta() -- The Resolution Engine

Located in `lib/entity-page/resolve-field-meta.ts`. This is the **single authoritative place** for UI type resolution. It's a deterministic pure function.

**Resolution layers (priority order):**

#### Layer 1: Visibility Resolution
```
field.visibility[context] -> overlay (replace/extend) -> "visible" | "hidden" | "internal"
   hidden/internal -> field does not render
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
1. is_computed=true        -> COMPUTED (unconditional)
2. is_read_only=true       -> SYSTEM_MANAGED
3. origin="system"         -> SYSTEM_ORIGIN
4. write_once + edit mode  -> WRITE_ONCE
5. editability + overlay   -> context-evaluated
6. Convention columns      -> LIFECYCLE_MANAGED / SYSTEM_MANAGED
7. is_deprecated=true      -> DEPRECATED
8. ui_hint.readOnly        -> UI_ADVISORY (rendering only!)
```

#### Layer 4: Constraint Resolution
```
field.constraints (structured) -> fallback to field.validation (legacy)
```

#### Layer 5: Config Synthesis
```
Enum: enumConfig -> validation.enumValues
Reference: referenceConfig -> lookupConfig -> FK detection
Money: moneyConfig -> format="money" defaults
Datetime: datetimeConfig -> timezone handling
```

### 5.3 UI Type Auto-Detection

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
| `date` | -- | `datepicker` |
| `datetime` | -- | `datetimepicker` |
| `uuid` | has referenceConfig | `reference-picker` |
| `uuid` | origin=system, not view | `hidden` |
| `uuid` | view mode | `uuid-view` |
| `reference` | cardinality=many | `reference-multi-picker` |
| `reference` | otherwise | `reference-picker` |
| `enum` | cardinality=many | `multi-select` |
| `enum` | otherwise | `select` |
| `json` | -- | `json-editor` |
| `rich_text` | -- | `textarea` |
| collection | childEntityName + childFkField | `collection` |

### 5.4 Field Renderer Dispatch

```
FieldRenderer
  | resolveFieldMeta()
  | Hidden? -> null
  | Collection? -> CollectionFieldRenderer
  | Read-only (forced)? -> ReadOnlyField (label + lock icon + tooltip)
  | View mode? -> renderViewMode (formatted display)
  | Edit/Create? -> switch(resolvedUiType):
      "text"                   -> TextRenderer
      "textarea"               -> TextareaRenderer
      "number"                 -> NumberRenderer
      "money-input"            -> MoneyInputRenderer
      "toggle"                 -> ToggleRenderer
      "tristate-select"        -> TristateSelectRenderer
      "select"                 -> SelectRenderer
      "multi-select"           -> MultiSelectRenderer
      "datepicker"             -> DatePickerRenderer
      "datetimepicker"         -> DateTimePickerRenderer
      "reference-picker"       -> ReferencePickerRenderer -> LookupTypeahead
      "reference-multi-picker" -> ReferenceMultiPickerRenderer
      "json-editor"            -> JsonEditorRenderer
      "uuid-view"              -> UuidViewRenderer
      "collection"             -> CollectionFieldRenderer
      "hidden"                 -> null
```

### 5.5 Reference Picker Flow

```
ReferencePickerRenderer
  +-- If referenceConfig.entity exists
  |   +-- LookupTypeahead (combobox)
  |       +-- useLookupSearch hook
  |           +-- GET /api/lookup/{entity}?q=...&limit=20&profile=...
  |           +-- Debounced (300ms), min 2 chars, abort controller
  |       +-- Results: label + sublabel (from displayTemplate)
  |       +-- On select: onChange(selectedUUID)
  +-- Else: fallback plain UUID text input
```

### 5.6 Collection Field Flow

```
CollectionFieldRenderer
  +-- useCollectionField hook
      +-- Fetch child rows: GET /api/data/{parent}/{id}/children/{field}
      +-- Fetch child fields: separate meta call
      +-- Track: rows[], addRow, removeRow, updateRow, reorderRows
      +-- Save: POST { rows, deleteIds } (diff-based batch)
      +-- Render:
          +-- View mode: read-only table
          +-- Edit mode: inline grid
              +-- Columns from childFields metadata
              +-- Each cell = nested FieldRenderer
              +-- Add button (if canAddMore per maxItems)
              +-- Delete buttons per row
```

### 5.7 useEntityFields Hook

```typescript
// Client-side with module-level cache
const { fields, loading, error } = useEntityFields(entityKey);
```

- Fetches from `GET /api/entity-meta/{entityKey}/fields`
- Module-level Map cache (persists across re-renders)
- In-flight tracking prevents concurrent requests
- No TTL (cached until page refresh)

---

## 6. Caching Strategy

### 6.1 Three-Tier Architecture

```
+---------------------------------------------+
|  L0: Frontend Module Cache (in-process)     |
|      No TTL, persists until page refresh    |
+---------------------------------------------+
|  L1: Backend In-Process Map (10-min TTL)    |
|      Per-worker, per-entity cache           |
+---------------------------------------------+
|  L2: Redis (24-hour TTL)                    |
|      Shared across workers, namespace ver.  |
+---------------------------------------------+
|  Database (PostgreSQL)                      |
|      Source of truth                        |
+---------------------------------------------+
```

### 6.2 Redis Cache Keys

| Key Pattern | TTL | Purpose |
|---|---|---|
| `ep:fields:ns{v}:{tenant}:{entity}:{version}` | 24h | Field metadata |
| `ep:cols:ns{v}:{schema}.{table}` | 24h | Column info |
| `ep:fkmap:ns{v}:{schema}.{table}` | 24h | FK map |
| `ep:dp:ns{v}:{schema}.{table}` | 24h | Display policy |
| `ep:ref:ns{v}:{tenant}:{schema}.{table}:{id}` | 30min | Resolved references |
| `ep:lk:ns{v}:{tenant}:{entity}:{queryHash}` | 1min | Lookup search results |
| `meta:compiled:{entity}:{version}` | 1h | Compiled models |

### 6.3 Namespace Versioning (O(1) Bulk Invalidation)

- Global version counter in Redis: `ep:ns:v1`
- Bump version -> all namespaced keys become instantly stale
- Triggered after schema changes in admin

### 6.4 Payload Guards

- **Warn** at 64KB payload size
- **Skip cache** at 256KB (prevents oversizing Redis)

### 6.5 Stampede Prevention

- **Lock-lite**: Redis `NX` lock prevents cross-worker cache stampede
- **Graceful degradation**: No Redis = L1 only (no errors)

---

## 7. Observability & Metrics

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
- `cache` -- cache lookup duration
- `sql` -- database query duration
- `fk` -- FK resolution duration
- `total` -- end-to-end duration

### Resolution Signals

The `resolveFieldMeta()` function emits `resolutionSignals` for observability:
- Tracks legacy field usage (deprecated paths)
- Records fallback decisions (structured -> legacy)
- Helps identify migration gaps from old format to new

---

## 8. Appendix: File Location Reference

| Layer | Path |
|---|---|
| SQL Migrations | `framework/adapters/db/src/sql/01_foundation/043-071_*.sql` |
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
