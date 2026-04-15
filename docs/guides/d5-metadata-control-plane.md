# D5 — Metadata Control Plane Guide

**Audience:** Platform engineers, schema authors, and integration developers who need to define, extend, or troubleshoot entity metadata.  
**Last updated:** 2026-04-15  
**Task:** 45-07

---

## Table of Contents

1. [Three-Zone Model](#1-three-zone-model)
2. [How to Define a New Entity in SQL](#2-how-to-define-a-new-entity-in-sql)
3. [How Overlays Work](#3-how-overlays-work)
4. [Compiled Descriptor Lifecycle](#4-compiled-descriptor-lifecycle)
5. [Admin UI Reference](#5-admin-ui-reference)

---

## 1. Three-Zone Model

The metadata system is split into three conceptually distinct zones. Keeping them separate prevents accidental mutations of live descriptors and makes the compile step explicit.

```
┌─────────────────────────────────────────────────────────────────┐
│  Zone 1 — STRUCTURAL                                            │
│  DDL in server/db/sql/04_tables/                                │
│  Source of truth for schemas, tables, constraints.              │
│  Changed only by database migrations (never at runtime).        │
└────────────────────────────┬────────────────────────────────────┘
                             │  Populates
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Zone 2 — OPERATIONAL                                           │
│  control.entity / control.entity_field / control.overlay        │
│  Admin UI at /setup/metadata/                                   │
│  Mutable at runtime — define fields, bind lifecycles, author    │
│  overlays, set display config and feature flags.                │
└────────────────────────────┬────────────────────────────────────┘
                             │  Compile trigger / EntityCompilerService
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Zone 3 — COMPILED                                              │
│  snapshot.entity_compiled (append-only, immutable)             │
│  Redis cache (300 s TTL, content-addressed)                     │
│  Read-only — served by GET /api/metadata/entities/:e/compiled   │
│  Clients MUST NOT write to this zone.                           │
└─────────────────────────────────────────────────────────────────┘
```

### Zone 1 — Structural

All table DDL lives under `server/db/sql/04_tables/`. The directory is numbered to enforce migration order:

| Directory prefix | Content |
|-----------------|---------|
| `002_control.sql` | All `control.*` schema tables (entity, entity_version, entity_field, overlay, lifecycle, …) |
| `009_snapshot.sql` | All `snapshot.*` schema tables (entity_compiled, entity_compiled_overlay, lifecycle_version, status_route) |
| `003a_master_identity.sql` | `master.tenant`, `master.principal`, `master.tenant_module_subscription`, … |

These files are applied exactly once via the migration runner (`server/db/seed/migrate.ts`) during environment setup. They are never executed at runtime.

### Zone 2 — Operational

Zone 2 is the authoring surface. Rows here are the mutable inputs to compilation.

**Core tables:**

| Table | Role |
|-------|------|
| `control.entity` | Registry of every logical entity (one row per "thing" the platform models) |
| `control.entity_version` | Versioned snapshots of an entity definition (DRAFT → EFFECTIVE lifecycle) |
| `control.entity_field` | All fields for a given entity version; also stores custom (`origin='business'`) fields |
| `control.entity_publish_state` | 1:1 companion to `control.entity`; tracks `published_version_id`, `current_draft_version_id`, and `last_compiled_at` |
| `control.entity_lifecycle` | Binds a lifecycle state machine to an entity |
| `control.overlay` | Named overlay set that applies tenant customisations on top of a base version |
| `control.overlay_change` | Individual operations within an overlay (addField, modifyField, tweakPolicy, …) |
| `control.field_group` | UI section groupings for canonical fields |
| `control.field_group_member` | Assigns canonical entity_field rows to field groups |

Zone 2 is managed via:
- Direct SQL (for bulk migrations or initial seeding)
- The Metadata Studio at `/admin/metadata-studio`
- The admin sub-pages at `/setup/metadata/`

### Zone 3 — Compiled

Zone 3 is read-only from every perspective except the compiler.

**Core tables:**

| Table | Mutability | Purpose |
|-------|-----------|---------|
| `snapshot.entity_compiled` | Append-only (UPDATE/DELETE blocked by trigger) | Pre-compiled entity descriptor JSON, one row per entity version hash |
| `snapshot.entity_compiled_overlay` | Append-only | Compiled overlay delta for a specific version + overlay set |
| `snapshot.lifecycle_version` | Append-only | Frozen compiled lifecycle definition |
| `snapshot.status_route` | Mutable (UPSERT) | O(1) status transition map used by DB-level guard functions |

The immutability of `entity_compiled` is enforced by a trigger:

```sql
-- server/db/sql/09_triggers/009_snapshot.sql
CREATE TRIGGER trg_ec_immutable
  BEFORE UPDATE OR DELETE ON snapshot.entity_compiled
  FOR EACH ROW EXECUTE FUNCTION snapshot.trg_compiled_immutable();
```

`snapshot.trg_compiled_immutable()` raises `object_not_in_prerequisite_state` on any attempt to update or delete a compiled snapshot row. New compilations INSERT new rows; they never mutate existing ones.

---

## 2. How to Define a New Entity in SQL

Use this workflow when adding a new platform-level entity (one owned by a module, not a tenant custom entity). For tenant custom entities use the Metadata Studio UI.

### Step 1 — Create the Physical Table

Add the `CREATE TABLE` DDL to the appropriate numbered file under `server/db/sql/04_tables/`. Follow the existing naming convention: `{schema}.{entity_slug}`.

Example (a hypothetical `master.cost_object` table):

```sql
-- server/db/sql/04_tables/003g_master_cost_object.sql
CREATE TABLE IF NOT EXISTS master.cost_object (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    code            text        NOT NULL,
    name            text        NOT NULL,
    cost_object_type text       NOT NULL CHECK (cost_object_type IN ('COST_CENTRE','PROFIT_CENTRE','PROJECT')),
    status          text        NOT NULL DEFAULT 'active',
    metadata        jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,
    CONSTRAINT co_pkey          PRIMARY KEY (id),
    CONSTRAINT co_tenant_code   UNIQUE (tenant_id, code),
    CONSTRAINT co_code_fmt      CHECK (code ~ '^[A-Z0-9_-]{2,32}$'),
    CONSTRAINT co_name_ne       CHECK (btrim(name) <> '')
);
```

Apply RLS in `10_rls_policies/` following the pattern established by other master tables.

### Step 2 — Insert the `control.entity` Row

```sql
INSERT INTO control.entity (
    id,
    tenant_id,       -- NULL for platform-owned entities
    module_id,       -- FK to master.module.id
    name,            -- camelCase or snake_case identifier used in code
    slug,            -- URL-safe slug used in API paths
    entity_class,    -- REFERENCE | MASTER | DOCUMENT | CONTROL | JOURNAL
    ownership_model, -- platform | tenant | shared
    table_schema,
    table_name,
    entity_short,    -- 3-4 char abbreviation used in prefixes
    label_singular,
    label_plural,
    description,
    display_config,  -- jsonb: default sort, list columns, card layout
    feature_flags,   -- jsonb: capabilities this entity supports
    status,
    created_by
) VALUES (
    shared.uuidv7(),
    NULL,            -- platform-owned
    (SELECT id FROM master.module WHERE code = 'FIN'),
    'cost_object',
    'cost-objects',
    'MASTER',
    'platform',
    'master',
    'cost_object',
    'CO',
    'Cost Object',
    'Cost Objects',
    'Tracks cost centres, profit centres, and projects for cost accounting.',
    '{"defaultSort": "code", "listColumns": ["code", "name", "cost_object_type", "status"]}',
    '{"searchable": true, "exportable": true, "bulkEditable": false}',
    'DRAFT',
    '00000000-0000-0000-0000-000000000000'
);
```

### Step 3 — Insert `control.entity_field` Rows

One row per column that the platform metadata layer should know about. Fields with `entity_version_id IS NULL` are canonical (platform-level, not version-specific).

```sql
-- Canonical fields (entity_version_id = NULL)
INSERT INTO control.entity_field
    (id, tenant_id, entity_version_id, name, column_name, data_type, label,
     cardinality, origin, is_required, is_searchable, is_filterable, is_sortable)
VALUES
    (shared.uuidv7(), NULL, NULL, 'code',             'code',             'text',   'Code',        'one', 'system', true,  true,  true,  true),
    (shared.uuidv7(), NULL, NULL, 'name',             'name',             'text',   'Name',        'one', 'system', true,  true,  true,  true),
    (shared.uuidv7(), NULL, NULL, 'costObjectType',   'cost_object_type', 'text',   'Type',        'one', 'system', true,  false, true,  false),
    (shared.uuidv7(), NULL, NULL, 'status',           'status',           'text',   'Status',      'one', 'system', true,  false, true,  false),
    (shared.uuidv7(), NULL, NULL, 'createdAt',        'created_at',       'timestamptz', 'Created', 'one', 'system', true, false, true,  true);
```

**Key column meanings:**

| Column | Values | Notes |
|--------|--------|-------|
| `origin` | `system` \| `standard` \| `business` | `business` = tenant custom; column must be prefixed `cus_` |
| `cardinality` | `one` \| `many` | `many` for array/JSONB collection fields |
| `is_computed` | bool | Computed columns — not writable |
| `is_write_once` | bool | Can be set on INSERT but not updated |
| `entity_version_id` | uuid \| NULL | NULL = canonical field; uuid = version-specific field |

### Step 4 — Bind a Lifecycle (optional)

If the entity participates in a workflow state machine, bind it:

```sql
INSERT INTO control.entity_lifecycle
    (id, tenant_id, entity_name, lifecycle_id, priority, created_by)
VALUES (
    shared.uuidv7(),
    NULL,                              -- platform-level binding
    'cost_object',
    (SELECT id FROM control.lifecycle WHERE code = 'SIMPLE_APPROVAL'),
    10,                                -- lower number = higher priority when multiple bindings match
    '00000000-0000-0000-0000-000000000000'
);
```

### Step 5 — Compile

Compilation reads Zones 1+2 and writes Zone 3.

**Via TypeScript service (preferred for programmatic use):**

```typescript
import { EntityCompilerService } from '@athyper/metadata';

const compiler = new EntityCompilerService(db, cache);
const compiled = await compiler.compile('cost_object', tenantId);
// compiled is now in snapshot.entity_compiled and in the in-process cache
```

**Via SQL function (for manual/migration use):**

```sql
-- Compiles the effective entity_version for the given entity code.
-- Returns the new snapshot.entity_compiled.id.
SELECT snapshot.compile_entity('cost_object', '00000000-0000-0000-0000-000000000000');
```

**Verify:**

```sql
SELECT entity_code, version_no, compiled_hash, created_at
FROM snapshot.entity_compiled
WHERE entity_code = 'cost_object'
ORDER BY created_at DESC
LIMIT 5;
```

---

## 3. How Overlays Work

Overlays allow tenants to extend or modify a platform entity's definition **without altering the platform version**. They are applied at serve time, on top of the base compiled snapshot.

### 3.1 Data Model

```
control.overlay
 └── control.overlay_change  (1:N — ordered list of operations)
      └── snapshot.entity_compiled_overlay  (compiled result — append-only)
```

**`control.overlay`** — the overlay header:

| Column | Notes |
|--------|-------|
| `overlay_key` | Human-readable identifier (unique per tenant) |
| `base_entity_id` | The entity this overlay targets |
| `base_version_id` | Specific entity version this overlay applies to |
| `priority` | Lower = applied first when multiple overlays stack |
| `conflict_mode` | `fail` \| `overwrite` \| `merge` — what to do when two overlays change the same path |
| `is_active` | Inactive overlays are skipped during compilation |

**`control.overlay_change`** — individual operations within an overlay, applied in `change_order` order:

| `kind` value | Effect |
|--------------|--------|
| `addField` | Adds a new field (usually `origin='business'`, column `cus_*`) |
| `removeField` | Hides a field from the compiled descriptor |
| `modifyField` | Changes field attributes (label, is_required, display hints) |
| `tweakPolicy` | Overrides an entity-level policy rule |
| `overrideValidation` | Replaces or extends a field-level validation expression |
| `overrideUi` | Replaces a UI hint (widget type, placeholder, visibility condition) |
| `addIndex` | Declares an additional index hint (advisory — actual DDL still requires a migration) |
| `removeIndex` | Removes an index hint from the descriptor |
| `tweakRelation` | Modifies a relation declaration (e.g., changes cardinality label) |

### 3.2 Example — Add a Custom Field via Overlay

```sql
-- 1. Create the overlay
INSERT INTO control.overlay
    (id, tenant_id, overlay_key, base_entity_id, base_version_id, priority, conflict_mode, is_active, created_by)
VALUES (
    shared.uuidv7(),
    '<tenant-id>',
    'acme_cost_object_v1',
    (SELECT id FROM control.entity WHERE name = 'cost_object'),
    (SELECT id FROM control.entity_version WHERE entity_id = (SELECT id FROM control.entity WHERE name = 'cost_object') AND status = 'EFFECTIVE'),
    100,
    'overwrite',
    true,
    '<principal-id>'
);

-- 2. Add a custom field change
INSERT INTO control.overlay_change
    (id, tenant_id, overlay_id, change_order, kind, path, value, created_by)
VALUES (
    shared.uuidv7(),
    '<tenant-id>',
    (SELECT id FROM control.overlay WHERE overlay_key = 'acme_cost_object_v1' AND tenant_id = '<tenant-id>'),
    1,
    'addField',
    'fields.cus_profit_sharing_pct',
    '{"name": "cus_profit_sharing_pct", "column_name": "cus_profit_sharing_pct", "data_type": "numeric", "label": "Profit Sharing %", "origin": "business", "is_required": false}',
    '<principal-id>'
);

-- 3. Compile the overlay
SELECT snapshot.compile_entity_overlay('<tenant-id>', 'acme_cost_object_v1');
```

> **Note:** Custom fields added via overlay must have a corresponding physical column (`cus_profit_sharing_pct`) on the target table, added via a migration. The overlay only updates the metadata descriptor — it does not alter the physical schema.

### 3.3 Overlay Application at Serve Time

When the API serves a compiled descriptor, it:

1. Loads `snapshot.entity_compiled` for the requested entity version.
2. Identifies all active overlays for the tenant+entity combination.
3. Checks `snapshot.entity_compiled_overlay` for a cached compiled overlay result matching the current overlay set hash.
4. If a cache hit: merges the overlay delta onto the base descriptor in memory.
5. If a cache miss: compiles the overlay set, writes to `snapshot.entity_compiled_overlay`, then merges.

The merge uses `priority` and `conflict_mode` to resolve conflicts between overlays that touch the same path.

---

## 4. Compiled Descriptor Lifecycle

### 4.1 End-to-End Flow

```
Zone 2 (control.entity_version EFFECTIVE)
        │
        │  EntityCompilerService.compile()
        │  or snapshot.compile_entity() SQL function
        ▼
Zone 3: snapshot.entity_compiled  (new row, append-only)
        │
        │  async write-through
        ▼
Redis   desc:v2:{tenantId}:{entityCode}:{versionHash}  (payload, 300 s TTL)
        desc:v2:{tenantId}:{entityCode}:ptr             (pointer key, 300 s TTL)
        │
        │  GET /api/metadata/entities/:entity/compiled
        ▼
Client  ETag: "ced-{compiledHash}"
        X-Cache: HIT | MISS
        (304 Not Modified if ETag matches)
```

### 4.2 Compilation Service

**File:** `server/src/foundation/metadata/entity-compiler.service.ts`

```typescript
class EntityCompilerService {
  async compile(entityCode: string, tenantId?: string): Promise<CompiledEntity | null>
}
```

Compilation steps (in order):

1. **In-process cache check** — if a fresh result (< 5 min) is held in memory, return it immediately.
2. **Snapshot warm-start** — query `snapshot.entity_compiled` for the entity's effective version. If found and `compiled_hash` matches the current `entity_publish_state.last_compiled_hash`, return and cache.
3. **Full compile** — query `control.entity`, `control.entity_version` (status = `EFFECTIVE`), `control.entity_field`, and `control.entity_class_profile`. Build `CompiledEntity` struct.
4. **Write snapshot** — UPSERT into `snapshot.entity_compiled` keyed by `(tenant_id, entity_code)`. The trigger blocks UPDATE — new hashes insert new rows; unchanged hashes are a no-op.
5. **Update Redis** — write pointer key and payload key asynchronously (best-effort; a failure does not fail the compile).

### 4.3 Redis Cache Keys

| Key pattern | TTL | Purpose |
|-------------|-----|---------|
| `desc:v2:{tenantId}:{entityCode}:ptr` | 300 s | Points to current `compiledHash`. Delete this to invalidate without knowing the hash. |
| `desc:v2:{tenantId}:{entityCode}:{versionHash}` | 300 s | Full compiled descriptor JSON payload. |

**Content-addressed design:** each `versionHash` produces a distinct cache key. Old entries expire on their own TTL without needing explicit DEL — reducing cache stampede risk.

**Fail-open:** the cache adapter wraps all Redis calls in try/catch. A Redis outage causes cache misses (extra DB reads) but not API errors. See `server/framework/adapters/memorycache/src/redis.ts`.

### 4.4 Cache Invalidation

To force a recompile and cache refresh for an entity:

```bash
# 1. Delete the pointer key in Redis
redis-cli DEL "desc:v2:<tenantId>:<entityCode>:ptr"

# 2. Trigger a recompile via the admin API (if exposed) or directly:
curl -X POST "$BASE_URL/api/metadata/entities/cost_object/compile" \
  -H "Authorization: Bearer <admin-token>" \
  -H "X-Org: acme" -H "X-Realm: athyper"
```

Or from the Descriptor Inspector UI at `/setup/metadata/descriptor` — click **Refresh** to force recompile and purge the Redis pointer.

### 4.5 ETag and Conditional Requests

The compiled descriptor endpoint supports HTTP conditional requests:

```
GET /api/metadata/entities/cost_object/compiled
If-None-Match: "ced-abc123..."

→ 304 Not Modified  (if hash unchanged)
→ 200 OK + new body (if hash changed)
```

- ETag format: `"ced-{compiledHash}"`
- Clients should cache the ETag and send `If-None-Match` on repeat requests to avoid downloading unchanged descriptors.

### 4.6 Compiled Descriptor Shape

```typescript
interface CompiledDescriptor {
  entity_id:        string;         // UUID
  entity_code:      string;         // e.g., "cost_object"
  entity_name:      string;         // human label
  entity_class:     string;         // REFERENCE | MASTER | DOCUMENT | CONTROL | JOURNAL
  table_schema:     string;         // "master"
  table_name:       string;         // "cost_object"
  version_no:       number;         // from control.entity_version
  version_hash:     string;         // SHA-256 of entity version definition
  compiled_hash:    string;         // SHA-256 of compiled output
  compiled_at:      string;         // ISO-8601
  governance_level: string;
  security_tier:    string;
  fields:           EntityField[];
  field_groups:     FieldGroup[];
  display_config:   Record<string, unknown>;
  feature_flags:    FeatureFlags;
}
```

Fields include all columns (system, standard, and business/custom) plus computed flags (`is_required`, `is_searchable`, `is_filterable`, `is_sortable`, `is_aggregatable`, `is_read_only`, `is_write_once`).

---

## 5. Admin UI Reference

The metadata admin UI is split across several pages under `/setup/metadata/`.

| Page | Path | Purpose |
|------|------|---------|
| Entity Browser | `/setup/metadata` | Read-only catalogue of all registered entities; filter by class or module |
| Descriptor Inspector | `/setup/metadata/descriptor` | Inspect compiled descriptor for any entity; shows fields, field groups, feature flags, raw JSON; includes Refresh button |
| Lookups | `/setup/metadata/lookups` | Manage lookup domains and their values |
| Field Groups | `/setup/metadata/field-groups` | Create/update/delete UI section groupings |
| Entity Policies | `/setup/metadata/entity-policies` | Manage entity-level policy rules (distinct from Governance policies) |
| Lifecycle Bindings | `/setup/metadata/lifecycle` | Bind/unbind lifecycle state machines to entities |
| Entity Operations | `/setup/metadata/operations` | Define allowable operations per entity (used by ActionBar) |
| ERD | `/setup/metadata/erd` | Auto-generated entity relationship diagram (read-only, sourced from `/api/metadata/admin/erd`) |
| Module Browser | `/setup/metadata/modules` | List registered modules with subscription status |

The **Metadata Studio** at `/admin/metadata-studio` provides a richer field authoring experience (field browser, custom field creation, overlay authoring). It is the recommended entry point for non-DDL metadata changes.

---

## Reference

| Resource | Location |
|----------|----------|
| Control schema DDL | `server/db/sql/04_tables/002_control.sql` |
| Snapshot schema DDL | `server/db/sql/04_tables/009_snapshot.sql` |
| Snapshot immutability trigger | `server/db/sql/09_triggers/009_snapshot.sql` |
| Snapshot guard function | `server/db/sql/08_functions/009_snapshot.sql` |
| Lifecycle + status-route compilation | `server/db/sql/08_functions/002_control.sql` |
| Entity compiler service | `server/src/foundation/metadata/entity-compiler.service.ts` |
| Compiled entity route (cache logic) | `server/framework/runtime/services/metadata/routes/compiled-entity.route.ts` |
| Metadata admin routes | `server/framework/runtime/services/metadata/routes/metadata-admin.route.ts` |
| Redis cache adapter | `server/framework/adapters/memorycache/src/redis.ts` |
| Descriptor Inspector UI | `apps/web/app/(shell)/(admin)/setup/metadata/descriptor/page.tsx` |
| Runbook: descriptor cache flush | `docs/runbooks/rb-06-descriptor-cache.md` |
