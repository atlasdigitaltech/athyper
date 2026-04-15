# Metadata Control Plane

**Audience:** Platform engineers and product developers working on entity configuration, field definitions, and metadata-driven features.  
**Status:** Final — dev team review confirmed three-zone model accuracy, published Sprint 46  
**Last updated:** 2026-04-15  
**Linked from:** `GET /docs` (Swagger UI → Guides → Metadata Control Plane)

---

## Table of Contents

1. [Overview](#1-overview)
2. [The Three-Zone Model](#2-the-three-zone-model)
3. [Zone 1 — Design](#3-zone-1--design)
4. [Zone 2 — Compile](#4-zone-2--compile)
5. [Zone 3 — Runtime](#5-zone-3--runtime)
6. [Key Concepts](#6-key-concepts)
7. [Metadata Admin API Reference](#7-metadata-admin-api-reference)
8. [Common Operations](#8-common-operations)
9. [Blueprint Overlays](#9-blueprint-overlays)

---

## 1. Overview

The athyper Metadata Control Plane is the subsystem that defines the shape of every business entity in the system — fields, types, cardinality, validation, grouping, security, and relations. The records API, forms, list pages, bulk import, field security enforcement, and the ERD viewer all derive their behaviour at runtime from these definitions.

The control plane separates concerns into three discrete zones:

```
┌─────────────────────────────────────────────────────────────────┐
│  ZONE 1 — DESIGN                                                │
│  control.entity, entity_version, entity_field, field_group,    │
│  entity_relation, entity_policy                                 │
│  Edited via: Metadata Studio UI or direct seed SQL              │
└───────────────────────┬─────────────────────────────────────────┘
                        │ compile trigger / on-demand
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  ZONE 2 — COMPILE                                               │
│  EntityCompilerService → CompiledEntity JSON                    │
│  Stored in: Redis (desc:v2:{tenantId}:{code}:*) +               │
│             snapshot.entity_compiled (Postgres)                 │
└───────────────────────┬─────────────────────────────────────────┘
                        │ GET /api/metadata/entities/:code/compiled
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  ZONE 3 — RUNTIME                                               │
│  Records API, FieldSecurityService, Lookup API,                 │
│  EntityListPage, EntityDetailPage, ERD viewer                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. The Three-Zone Model

### Why three zones?

**Separation of concerns.** Field definitions are data (Zone 1), not code. Changing a field label, adding a validation rule, or marking a field as filterable requires no code deployment — only a DB change followed by a cache invalidation.

**Performance isolation.** The compile step is expensive (joins 4–6 tables). Zone 2 caches the compiled result so that Zone 3 routes never hit the design tables directly.

**Compile-time validation.** The compile step validates referential integrity: it checks that `reference_config.target_entity` codes resolve, enum domains exist, and field groups are self-consistent. Bad configuration fails at compile, not at runtime.

### Zone transitions

| Transition | Mechanism |
|-----------|---------|
| Design → Compile | `GET /api/metadata/entities/:code/compiled` (on-demand) or DB trigger `trg_template_child_changed` (future: auto-recompile on DDL change) |
| Compile → Runtime | All Route handlers call `GET /compiled` internally; result is passed into the records/fields pipeline |

---

## 3. Zone 1 — Design

Zone 1 lives entirely in the `control` schema in PostgreSQL.

### Core tables

| Table | Purpose |
|-------|---------|
| `control.entity` | Entity registry: one row per entity type. Contains code, display name, table name, class, governance level. |
| `control.entity_version` | Versioned snapshot of an entity's definition. Status: `DRAFT` → `EFFECTIVE` → `DEPRECATED`. Only one version can be `EFFECTIVE` at a time. |
| `control.entity_field` | Field definitions (linked to an entity_version). Columns: name, data_type, ui_type, cardinality, is_required, is_searchable, validation, enum_domain_code, reference_config, sort_order, ui_hint. |
| `control.field_group` | Named layout groups (tabs, sections, panels). Key is `{entity_code}.{group_key}`. |
| `control.field_group_member` | Maps entity_field rows to field_group rows with a position. |
| `control.entity_relation` | Directed relation between two entities: relation_kind (`belongs_to`, `has_many`, `m2m`). Drives the ERD viewer. |
| `control.entity_policy` | Per-entity access, audit, and company scope configuration. Stored as inline mode columns + JSONB (`retention_policy`, `default_filters`, `cache_flags`). |
| `control.field_security_policy` | Per-field read/write permission rules: `pii_classification`, `masking_type`, `required_roles`. |

### Entity classes

`control.entity.entity_class` categorises entities for UI treatment and governance:

| Class | Examples |
|-------|---------|
| `MASTER` | Customer, Supplier, Product, Asset |
| `TRANSACTION` | Journal Entry, Invoice, Receipt |
| `CONFIGURATION` | Tax Rate, Payment Term, Cost Centre |
| `REFERENCE` | Country, Currency, Unit of Measure |

### Field data types

| `data_type` | DB type | Notes |
|------------|---------|-------|
| `text` | `text` | Default string type |
| `integer` | `int4` | Whole numbers |
| `numeric` | `numeric(18,6)` | Financial amounts |
| `boolean` | `bool` | |
| `date` | `date` | |
| `timestamp` | `timestamptz` | Always stored in UTC |
| `uuid` | `uuid` | Primary keys, foreign keys |
| `json` | `jsonb` | Structured JSONB |
| `enum` | `text` | Constrained via `enum_domain_code` |
| `ref` | `uuid` | FK to another entity; requires `reference_config` |

### Field cardinality

| `cardinality` | Meaning |
|--------------|---------|
| `one` | Scalar value (default) |
| `many` | Array / multi-value (stored as JSONB array) |

### Governance levels

`control.entity.governance_level` controls audit depth:

| Level | Audit behaviour |
|-------|---------------|
| `STANDARD` | Row-level audit on INSERT/UPDATE/DELETE |
| `SENSITIVE` | Row-level + field-level change tracking |
| `COMPLIANCE` | All SENSITIVE behaviour + immutable audit seals |

---

## 4. Zone 2 — Compile

### What the compiler does

`EntityCompilerService` (in `compiled-entity.route.ts`) reads all Zone 1 tables for a given `(tenantId, entityCode)` pair and produces a `CompiledEntity` JSON object with:

- Entity identity and display configuration
- Effective entity version hash
- All fields mapped to a normalised `EntityField` shape (name, data_type, ui_type, cardinality, validation rules, reference config, group membership)
- Field group layout

### Cache architecture

The compiled descriptor is cached at two levels:

```
Redis
  desc:v2:{tenantId}:{entityCode}:ptr        → compiledHash (TTL 300 s)
  desc:v2:{tenantId}:{entityCode}:{hash}     → JSON payload (TTL 300 s)
                                                   ↑
Postgres (warm-start)                              |
  snapshot.entity_compiled                         |
  (entityCode, tenantId, compiled_json, compiled_hash, compiled_at)
```

**Cache hit path:**
1. `GET /compiled` reads the pointer key → gets compiledHash
2. Fetches payload key using compiledHash
3. Returns JSON, sets `ETag: "ced-{hash}"`, `X-Cache: HIT`
4. Supports `If-None-Match` → `304 Not Modified`

**Cache miss path:**
1. Pointer key absent or stale
2. Compile from DB (4-table join)
3. Write payload key + pointer key to Redis (TTL 300 s)
4. Upsert `snapshot.entity_compiled` for warm-start on next restart
5. Returns JSON, `X-Cache: MISS`

### Cache key design

The payload key is **content-addressed**: `desc:v2:{tenantId}:{entityCode}:{compiledHash}`. If the entity changes, the hash changes, the old payload key is naturally not requested, and it expires on its own TTL. Only the pointer key needs explicit deletion to force recompilation.

### Force-recompile (bypass cache)

```bash
# Delete the pointer key; next GET /compiled will recompile from DB
redis-cli DEL "desc:v2:{tenantId}:{entityCode}:ptr"

# Or flush all descriptors for a tenant
redis-cli KEYS "desc:v2:{tenantId}:*:ptr" | xargs redis-cli DEL
```

See [Runbook RB-06](../runbooks/rb-06-descriptor-cache.md) for full procedures.

### snapshot.entity_compiled

The Postgres snapshot table is a warm-start cache: when the API server restarts, the first `GET /compiled` request repopulates Redis from the Postgres snapshot rather than doing a full recompile join. This reduces cold-start latency when Redis is empty (e.g., after a Redis flush).

Inspect the snapshot:

```sql
SELECT entity_code, compiled_at, field_count, compiled_hash
FROM   snapshot.entity_compiled
WHERE  tenant_id = '<tenant-uuid>'
ORDER  BY compiled_at DESC;
```

---

## 5. Zone 3 — Runtime

Zone 3 services consume the compiled descriptor from Zone 2 and drive all metadata-dependent behaviour.

### Records API

`GET /api/records/:entity` — uses the compiled descriptor to:
- Determine which columns to SELECT (only `is_visible = true` fields)
- Apply `is_searchable` fields to the `?q=` full-text search
- Validate `?filters=` parameter against known field names and types
- Drive the sort column whitelist (only `is_sortable = true` fields)

`POST /api/records/:entity` — uses the descriptor to:
- Validate required fields (`is_required = true`)
- Validate enum domain constraints
- Resolve reference fields (validate FK existence)

### Field Security Middleware

`FieldSecurityService` reads `control.field_security_policy` for the entity and applies:

| PII classification | Default masking |
|-------------------|----------------|
| `pii` | Last 4 chars visible: `****1234` |
| `spii` | Fully redacted: `[REDACTED]` |
| `sensitive` | Role-checked; unmasked only if caller has required role |

The PII inventory endpoint (`GET /api/entity/pii-inventory`) aggregates all `pii`/`spii`/`sensitive` fields across entities into a tenant-scoped manifest (5-minute cache, `X-Cache: HIT/MISS` header).

### Lookup API

`GET /api/records/:entity/lookup/:domain` resolves enum domain codes to label/value pairs. The lookup API uses the `control.lookup_domain` + `control.lookup_value` tables, not the entity descriptor. The compiled descriptor carries `enum_domain_code` to indicate which lookup domain to use for a field.

### EntityListPage + EntityDetailPage

The frontend packages `@athyper/entity-runtime` call `GET /api/metadata/entities/:code/compiled` at mount time and drive column configuration, filter UI, and form field rendering from the compiled descriptor. No frontend code needs to change when fields are added or renamed in the admin.

### ERD Viewer

`GET /api/metadata/admin/erd?module=:id` queries `control.entity` (nodes) and `control.entity_relation` (edges), scoped to a module. The frontend renders this as a `@xyflow/react` graph at `/setup/metadata/erd`. Module filter is a dropdown from distinct modules in the entity registry.

---

## 6. Key Concepts

### Entity lifecycle

```
control.entity created
        │
        ▼
entity_version (status: DRAFT)
        │   admin "compile" action
        ▼
entity_version (status: EFFECTIVE)  ← only one EFFECTIVE per entity
        │   superseded by new version
        ▼
entity_version (status: DEPRECATED)
```

Only the `EFFECTIVE` version's fields are included in the compiled descriptor. `DRAFT` versions are editable; `DEPRECATED` versions are read-only.

### Field groups

Field groups (`control.field_group`) define how fields are laid out in UI forms. A field with no group membership appears in the default "General" section. Group members are ordered by `position` in `control.field_group_member`.

```sql
-- List field groups for an entity
SELECT fg.key, fg.label, fg.display_order,
       COUNT(fgm.id) AS member_count
FROM   control.field_group fg
JOIN   control.field_group_member fgm ON fgm.field_group_id = fg.id
WHERE  fg.entity_code = 'invoice'
  AND  fg.tenant_id = '<tenant-uuid>'
GROUP  BY fg.key, fg.label, fg.display_order
ORDER  BY fg.display_order;
```

### Entity policies

`control.entity_policy` is a one-to-one extension of an entity that carries access and audit configuration:

| Column | Type | Purpose |
|--------|------|---------|
| `access_mode` | text | `'open'`, `'restricted'`, `'need-to-know'` |
| `audit_mode` | text | `'standard'`, `'sensitive'`, `'compliance'` |
| `company_scope_mode` | text | `'single'`, `'multi'`, `'all'` |
| `retention_policy` | jsonb | `{ retainDays, archiveAfterDays }` |
| `default_filters` | jsonb | Pre-applied filters for all list queries |
| `cache_flags` | jsonb | Caching hints (TTL overrides, etc.) |

### Blueprint overlays

Blueprint overlays extend a base entity's field set with industry-specific fields (e.g., a healthcare blueprint adds `icd_code` to the encounter entity). See [§9 Blueprint Overlays](#9-blueprint-overlays).

---

## 7. Metadata Admin API Reference

All admin routes require `Authorization: Bearer <token>` and `X-Org: <org-slug>` headers. Responses follow `{ ok: boolean, data: ... }`.

### Entity management

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/metadata/admin/entities` | List entities with pagination; filter by `?entity_class=`, `?module_id=` |
| `POST` | `/api/metadata/admin/entities` | Create entity (code, name, table_name, entity_class, display_name required) |
| `PATCH` | `/api/metadata/admin/entities/:id` | Update entity metadata |
| `DELETE` | `/api/metadata/admin/entities/:id` | Soft-delete (sets is_active = false) |

### Entity versions

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/metadata/admin/entities/:id/versions` | List all versions for an entity |
| `POST` | `/api/metadata/admin/entities/:id/versions` | Create new DRAFT version |
| `POST` | `/api/metadata/admin/entity-versions/:versionId/compile` | Promote DRAFT → EFFECTIVE (validates + compiles) |

### Field definitions

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/metadata/admin/entities/:id/fields` | List all fields for entity's effective version |
| `POST` | `/api/metadata/admin/entities/:id/fields` | Add field to the effective version |
| `PATCH` | `/api/metadata/admin/fields/:fieldId` | Update field properties |
| `DELETE` | `/api/metadata/admin/fields/:fieldId` | Remove field |

### Field groups

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/metadata/admin/field-groups?entity_code=` | List field groups |
| `POST` | `/api/metadata/admin/field-groups` | Create field group |
| `PATCH` | `/api/metadata/admin/field-groups/:key` | Update label or display_order |
| `DELETE` | `/api/metadata/admin/field-groups/:key` | Delete (guard: blocked if member_count > 0) |

### Entity policies

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/metadata/admin/entity-policies?entity_id=` | List policies |
| `POST` | `/api/metadata/admin/entity-policies` | Create policy for an entity |
| `PATCH` | `/api/metadata/admin/entity-policies/:id` | Update policy (partial update) |
| `DELETE` | `/api/metadata/admin/entity-policies/:id` | Remove policy |

### Compiled descriptor

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/metadata/entities/:entityCode/compiled` | Get compiled descriptor (with cache) |
| `GET` | `/api/metadata/admin/erd?module=:id` | ERD graph data (nodes + edges for @xyflow/react) |

### Lookups

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/metadata/lookups/:domain` | Get lookup values for a domain code |
| `GET` | `/api/metadata/lookups/:domain/merge-order` | Merge-ordered lookup (blueprint → tenant overrides) |
| `PATCH` | `/api/metadata/lookups/:domain/values/:code` | Override a lookup value (tenant-level) |

---

## 8. Common Operations

### Force-recompile a single entity

```bash
# 1. Delete the Redis pointer key
redis-cli DEL "desc:v2:<tenant-id>:<entity-code>:ptr"

# 2. Trigger a fresh compile (any authenticated request)
curl -s -H "Authorization: Bearer <token>" \
        -H "X-Org: <org-slug>" \
        "http://localhost:4000/api/metadata/entities/<entity-code>/compiled" \
  | jq '.compiledAt'
```

The response should show a `compiledAt` matching the current time and `X-Cache: MISS`.

### Flush all descriptors for a tenant

```bash
redis-cli KEYS "desc:v2:<tenant-id>:*:ptr" | xargs redis-cli DEL
```

Next request per entity will recompile. The Postgres `snapshot.entity_compiled` rows are not deleted — they serve as warm-start data on the next server restart.

### Add a field to an existing entity (admin API)

```bash
# 1. Get entity ID
curl -s -H "Authorization: Bearer <token>" -H "X-Org: <org>" \
     "/api/metadata/admin/entities?code=my_entity" | jq '.data.items[0].id'

# 2. Add the field
curl -s -X POST -H "Authorization: Bearer <token>" -H "X-Org: <org>" \
     -H "Content-Type: application/json" \
     "/api/metadata/admin/entities/<entity-id>/fields" \
     -d '{
       "name": "reference_number",
       "column_name": "reference_number",
       "data_type": "text",
       "label": "Reference Number",
       "is_required": false,
       "is_searchable": true,
       "sort_order": 10
     }'

# 3. Invalidate the cached descriptor
redis-cli DEL "desc:v2:<tenant-id>:my_entity:ptr"
```

### Verify field security enforcement

```bash
pnpm --filter @athyper/runtime-server field-security:verify
```

This script checks that `FieldSecurityService` correctly masks/blocks access to `pii`/`spii`/`sensitive` fields when called without the required roles.

### View the schema ERD

Navigate to `/setup/metadata/erd` in the web app. Use the module filter dropdown to scope the graph to a specific domain. The SVG export button (top-right toolbar) generates a downloadable diagram.

---

## 9. Blueprint Overlays

Blueprint overlays allow industry-specific field extensions without modifying base entity definitions. A blueprint overlay:

1. Creates new `control.entity_field` rows linked to the tenant's entity version
2. Sets `origin = 'blueprint'` on the field row (distinguishes blueprint fields from base fields)
3. Is applied during Phase 3 seed execution (see [tenant-setup guide](../tenant-setup/README.md))

### Overlay precedence

When the compiler runs, fields are sorted by `sort_order`. Blueprint fields co-exist with base fields:

```
Base fields (origin = 'base')      → sort_order 1–99
Blueprint fields (origin = 'blueprint') → sort_order 100–199
Tenant fields (origin = 'tenant')  → sort_order 200+
```

Tenant fields (added via Metadata Studio after provisioning) are appended after blueprint fields.

### Identifying overlay fields

```sql
SELECT ef.name, ef.label, ef.origin, ef.sort_order
FROM   control.entity_field ef
JOIN   control.entity_version ev ON ev.id = ef.entity_version_id
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  e.code = 'my_entity'
  AND  ev.status = 'EFFECTIVE'
  AND  ef.origin IN ('blueprint', 'tenant')
ORDER  BY ef.sort_order;
```

### Removing an overlay

Blueprint fields can be deactivated (set `is_visible = false`) but not deleted via the admin API — they may be referenced by existing records. Contact Platform Engineering to hard-delete a blueprint field.
