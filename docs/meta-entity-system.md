# META Engine: Entity System Documentation

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Core Concepts](#core-concepts)
4. [Database Schema](#database-schema)
5. [Type System](#type-system)
6. [Service Contracts](#service-contracts)
7. [Compilation Pipeline](#compilation-pipeline)
8. [Policy & Access Control](#policy--access-control)
9. [Lifecycle Management](#lifecycle-management)
10. [Governed Versioning](#governed-versioning)
11. [Overlay System](#overlay-system)
12. [Validation Engine](#validation-engine)
13. [Lookup System](#lookup-system)
14. [Schema Manager (Web UI)](#schema-manager-web-ui)
15. [Generic Data API](#generic-data-api)
16. [Entity Registration & Seeding](#entity-registration--seeding)
17. [Appendix: Type Reference](#appendix-type-reference)

---

## Overview

The META Engine is the dynamic entity modeling framework at the heart of Athyper. It provides:

- **Runtime schema management** -- define, version, and evolve entity schemas without code deploys
- **Compiled model IR** -- schemas are compiled into optimized intermediate representations for fast runtime queries
- **Policy-driven access control** -- fine-grained RBAC and ABAC policies evaluated at runtime
- **Lifecycle state machines** -- configurable state flows with gates, approvals, and timers
- **Governed versioning** -- enterprise-grade version governance with draft/review/approve/effective flow
- **Schema overlays** -- extend base schemas with deterministic overlay composition
- **Audit trail** -- every metadata change and policy decision is logged
- **Multi-tenant isolation** -- all operations are scoped to a tenant

### Package Structure

| Package | Path | Role |
|---------|------|------|
| `@athyper/core/meta` | `framework/core/src/meta/` | Pure types, interfaces, DI tokens (zero implementation) |
| Runtime Services | `framework/runtime/src/services/platform/meta/` | Service implementations (Kysely/PostgreSQL) |
| DB Adapter | `framework/adapters/db/src/sql/` | PostgreSQL DDL (tables, indexes, constraints) |
| Schema Manager | `products/neon/apps/web/lib/schema-manager/` | React hooks and utilities for the admin UI |

---

## Architecture

```
                    +---------------------+
                    |   Schema Manager UI |  (React / Next.js)
                    |  (hooks, diff, etc) |
                    +----------+----------+
                               |
                    REST API: /api/admin/mesh/meta-studio/:entityName
                               |
                    +----------v----------+
                    |   Meta Store        |  (combines Registry + Compiler)
                    +----+------+---------+
                         |      |
              +----------+      +----------+
              |                            |
     +--------v--------+       +----------v---------+
     |  MetaRegistry    |       |   MetaCompiler     |
     |  (entity CRUD)   |       |   (schema -> IR)   |
     +--------+---------+       +----------+---------+
              |                            |
              +------------+---------------+
                           |
                +----------v----------+
                |  PostgreSQL (meta.* tables)  |
                +-------------------------+
```

### Data Flow

1. **Admin defines entity** via Schema Manager UI
2. **MetaRegistry** persists entity + version + fields + relations in `meta.*` tables
3. **MetaCompiler** compiles the schema into a `CompiledModel` IR
4. **CompiledModel** is cached and used at runtime by:
   - **GenericDataAPI** -- generates SQL queries from compiled fields
   - **PolicyGate** -- evaluates access policies
   - **LifecycleManager** -- resolves state transitions
   - **Entity Page Descriptor** -- orchestrates UI rendering

### Service Dependency Graph

```
MetaStore
 ├── MetaRegistry
 │    └── PostgreSQL (meta.entity, meta.entity_version, meta.field, meta.relation, meta.index_def)
 ├── MetaCompiler
 │    ├── CompilerCacheService (Redis)
 │    └── MetaRegistry (reads schema for compilation)
 └── EntityClassificationService

LifecycleManagerService
 ├── LifecycleRouteCompiler (route resolution + caching)
 ├── PolicyGate (authorization)
 ├── ApprovalService (approval workflow bridge)
 ├── LifecycleTimerService (auto-transitions via BullMQ)
 ├── VersionedDocumentService (hook execution)
 └── MetaEventBus (domain events)

GenericDataAPIService
 ├── MetaCompiler (compiled model for query generation)
 ├── PolicyGate (access control)
 ├── LifecycleManager (auto-create instances)
 └── NumberingEngine (auto-assign document numbers)
```

---

## Core Concepts

### Entity

An entity represents a business object type (e.g., `Customer`, `PurchaseInvoice`, `ChartOfAccounts`). Each entity has:

| Property | Description |
|----------|-------------|
| `entity_code` | Immutable machine-safe identity key (snake_case, e.g., `chart_of_accounts`). Never changes once set. |
| `name` | Logical display name / developer-facing label (PascalCase, e.g., `ChartOfAccounts`) |
| `slug` | Persisted URL routing key (kebab-case, e.g., `chart-of-accounts`). Unique per tenant. |
| `entity_short` | Short mnemonic / TCODE alias (uppercase, e.g., `COA`, `INV`, `JE`) |
| `kind` | Classification: `ref`, `ent`, `doc`, `fin`, `cfg`, `int` |
| `module_id` | Owning module code. FK to `core.module(code)`. Values: `ACC`, `CRM`, `HR`, `DOC`, etc. |
| `table_schema` | Physical DB schema (e.g., `ent`, `ref`, `fin`, `wf`) |
| `table_name` | Physical DB table (e.g., `purchase_invoice`) |
| `mapping_mode` | Physical table mapping: `exclusive` (1:1), `shared` (multi-entity), `virtual` (no table) |
| `governance_level` | `full`, `light`, or `audit_only` |
| `engine_tag` | Owning engine identifier. FK to `meta.engine(code)`. Values: `posting-engine`, `budget-engine`, etc. NULL for non-engine entities. |
| `feature_flags` | JSONB of infrastructure behavior flags (CHECK-constrained) |
| `naming_policy` | JSONB numbering rule for document numbers (CHECK-constrained) |
| `display_config` | JSONB of UI/presentation configuration (CHECK-constrained) |
| `identity_config` | JSONB of entity lookup identity (CHECK-constrained). **Separate column**, NOT inside `feature_flags`. |
| `data_policy` | JSONB of data-layer behavioral policy (soft_delete, append_only, temporal, immutable_after_state) |
| `provenance` | JSONB deployment metadata (source_package, source_version, introduced/deprecated_in_release) |
| `label_singular` | Human-readable singular label (e.g., "Purchase Invoice"). Falls back to `name`. |
| `label_plural` | Human-readable plural label (e.g., "Purchase Invoices"). Falls back to heuristic. |
| `description` | Brief entity description for admin tooltips, import/export, low-code descriptors. |
| `icon_key` | Icon library key (e.g., `file-text`, `users`). Format: `^[a-z][a-z0-9-]*$`. |
| `color_token` | Design-system color token (e.g., `blue-500`). Format: `^[a-z][a-z0-9-]*$`. |
| ~~`published_version_id`~~ | **Deprecated** — moved to `entity_publish_state` satellite. Legacy column, no longer trigger-maintained. |
| ~~`last_compiled_at`~~ | **Deprecated** — moved to `entity_publish_state` satellite. |
| ~~`last_compiled_hash`~~ | **Deprecated** — moved to `entity_publish_state` satellite. |
| ~~`last_schema_change_at`~~ | **Deprecated** — moved to `entity_publish_state` satellite. |

### Identity Model

Each entity has four distinct identity facets, each serving a different purpose:

| Identity | Format | Purpose | Mutable? |
|----------|--------|---------|----------|
| `entity_code` | `snake_case` | **Canonical runtime identity** — immutable, machine-safe, stable across renames | No |
| `name` | `PascalCase` | Developer-facing logical label, used in code and meta APIs | Rename-safe |
| `slug` | `kebab-case` | URL routing, persisted to avoid derivation drift | Derived from name |
| `entity_short` | `UPPERCASE` | Command palette / TCODE shortcut (2-12 chars) | Yes |

Example for a single entity:

```
entity_code:  chart_of_accounts     (immutable, machine identity — USE THIS for runtime)
name:         ChartOfAccounts        (display/logical name)
slug:         chart-of-accounts      (URL routing)
entity_short: COA                    (command palette alias)
```

**Regex constraints (DB-enforced):**
- `entity_code`: `^[a-z][a-z0-9_]{1,79}$`
- `slug`: `^[a-z][a-z0-9]+(-[a-z0-9]+)*$`
- `entity_short`: `^[A-Z][A-Z0-9_]{1,11}$`

#### Canonical Runtime Identity (`entity_code`)

`entity_code` is the **preferred identity for all runtime references**. Unlike `name` (which can be renamed), `entity_code` is immutable after the first effective version and is safe to use in:

- Lifecycle bindings (`meta.entity_lifecycle`)
- Cache keys (Redis, in-memory)
- Runtime state tables (`core.entity_lifecycle_instance`, `core.entity_lifecycle_event`)
- Approval instances (`wf.approval_instance`)
- Numbering sequences (`meta.numbering_sequence`)
- Audit logs (`audit.permission_decision_log`)
- Policy references and compiled models

**Resolution priority:** When services accept an entity identifier, they resolve in order:
1. `entity_code` (preferred — immutable)
2. `entity_id` (UUID — stable but opaque)
3. `entity_name` (legacy — rename-sensitive)

**TypeScript helper type:**

```typescript
type EntityIdentityRef = {
  entityId?: string;      // UUID primary key
  entityCode?: string;    // Immutable snake_case key (preferred)
  entityName?: string;    // PascalCase display name (legacy)
};
```

**Service contracts:** `MetaRegistry.getEntityByCode(entityCode)` and `MetaRegistry.resolveEntity(ref: EntityIdentityRef)` provide canonical entity resolution. All service interfaces use `EntityNameOrCode` (a branded string alias) for parameters that accept either entity_code or entity name.

#### Slug Lifecycle

The `slug` column provides URL-safe routing keys for entities (e.g., `chart-of-accounts`).

**Initial derivation:**

Slugs are derived from the entity `name` using PascalCase→kebab-case conversion:
- Application: `entityNameToSlug()` in `entity-meta-utils.ts`
- SQL seed: `303_seed_entity_identity.sql` uses `regexp_replace()` for the same conversion
- Example: `ChartOfAccounts` → `chart-of-accounts`

**Persistence:**

Slugs are **persisted** on `meta.entity.slug` (not derived at query time). This avoids:
- Derivation drift between SQL regex and TypeScript implementation
- Performance cost of runtime conversion on hot paths
- Ambiguity when multiple derivation algorithms exist

**Constraints:**

- Format: `^[a-z][a-z0-9]+(-[a-z0-9]+)*$` (DB CHECK constraint)
- Uniqueness: `UNIQUE(tenant_id, slug) WHERE slug IS NOT NULL`
- Nullable: slug can be NULL for entities not yet assigned one

**Mutability:**

Slugs are **mutable by design** — they can be changed even after the first effective version (unlike `entity_code`, `table_schema`, `table_name`). However, **no admin rename flow is currently implemented**. In practice, slugs are effectively immutable because no UI or API endpoint supports changing them post-creation. The `slug` column has no immutability trigger, so direct DB updates are possible but unsupported by the application layer.

**URL resolution:**

`resolveEntityMeta()` in `entity-meta.ts` accepts slug, name, or entity_code and resolves via:
```sql
WHERE (name = $input OR entity_code = $input OR slug = $input) AND tenant_id = $tenantId
```

**Redirects:**

No automatic redirect mechanism currently exists. When a slug changes, old URLs will 404. If redirect support is needed, a `slug_history` table tracking previous slugs per entity would enable HTTP 301 redirects from old slugs to the current one. This is not yet implemented.

**Rename flow:**

When `name` changes, `slug` should be re-derived to maintain consistency. This is the admin's responsibility via the Schema Manager UI — no automatic trigger re-derives slug from name on UPDATE.

#### `meta_entity_id` FK Column (Stable Lifecycle Binding)

All lifecycle, approval, timer, numbering, and audit tables now carry a `meta_entity_id` UUID column that is a FK to `meta.entity(id)`. This provides rename-safe entity type identity alongside the legacy `entity_name` text column.

| Table | Column | FK Target | On Delete |
|---|---|---|---|
| `meta.entity_lifecycle` | `meta_entity_id` | `meta.entity(id)` | CASCADE |
| `meta.entity_lifecycle_route_compiled` | `meta_entity_id` | `meta.entity(id)` | CASCADE |
| `core.entity_lifecycle_instance` | `meta_entity_id` | `meta.entity(id)` | CASCADE |
| `core.entity_lifecycle_event` | `meta_entity_id` | `meta.entity(id)` | SET NULL |
| `wf.approval_instance` | `meta_entity_id` | `meta.entity(id)` | SET NULL |
| `wf.lifecycle_timer_schedule` | `meta_entity_id` | `meta.entity(id)` | SET NULL |
| `meta.numbering_sequence` | `meta_entity_id` | `meta.entity(id)` | CASCADE |
| `audit.permission_decision_log` | `meta_entity_id` | `meta.entity(id)` | SET NULL |

**Auto-resolution trigger:** A `BEFORE INSERT OR UPDATE` trigger (`meta.trg_resolve_meta_entity_id`) automatically resolves `meta_entity_id` from `entity_name` when not explicitly provided. This ensures backward compatibility — existing code that only passes `entity_name` will still get proper FK binding.

**Migration:** `070_entity_identity_hardening.sql` adds the columns, backfills from existing data, and creates the auto-resolution trigger.

### Physical Mapping Modes

| Mode | Description | Example |
|------|-------------|---------|
| `exclusive` | 1:1 mapping — entity exclusively owns its table. Uniqueness enforced on `(tenant_id, table_schema, table_name)`. | Most entities |
| `shared` | Multiple logical entities on one physical table. No table uniqueness enforced. | `ManualJournalEntry` + `JournalEntry` → `fin.journal_entry` |
| `virtual` | No physical table backing. For computed/view entities. | (reserved) |
| `derived` | Physical store derived from other entities' data (views, materialized views). | Report models, compiled read models |

#### Shared Mapping Rules

When `mapping_mode = 'shared'`, multiple logical entities share one physical table. This requires special handling:

**Table uniqueness:** The `UNIQUE(tenant_id, table_schema, table_name)` constraint is **not enforced** for shared entities. Only `exclusive` entities participate in the uniqueness index.

**Discrimination:** Shared entities are identified by a **discriminator column** on `meta.entity`:

| Column | Type | Purpose |
|---|---|---|
| `discriminator_column` | `text` | Physical column name used to distinguish rows (e.g., `entry_type`) |
| `discriminator_value` | `text` | Value in that column identifying this entity's rows (e.g., `manual`) |

Both must be set (or both NULL). When `mapping_mode = 'shared'`, discriminator is **required** (enforced by CHECK constraint). When `mapping_mode != 'shared'`, discriminator must be NULL.

`GenericDataAPI` injects the discriminator as a `WHERE` clause filter on every operation, ensuring each logical entity sees only its own rows from the shared physical table.

**Current shared mappings:**

| Logical Entity | Physical Table | Entity Class | Governance | Discriminator Column | Discriminator Value |
|---|---|---|---|---|---|
| `ManualJournalEntry` | `fin.journal_entry` | `DOCUMENT` | `full` | `entry_type` | `manual` |
| `JournalEntry` | `fin.journal_entry` | `LEDGER` | `audit_only` | `entry_type` | `auto` |

`ManualJournalEntry` is the lifecycle-managed "primary" entity (DOCUMENT class with full governance). `JournalEntry` is the immutable ledger view (LEDGER class with audit_only) — it sees the same rows but with read-only semantics enforced by its entity class.

**DDL implications:** When `mapping_mode = 'shared'`, the DDL generator skips `CREATE TABLE` for secondary entities (the table already exists). Field definitions may overlap — the compiled model resolves which fields belong to which entity.

**Runtime rules for shared entities:**
- All entities sharing a table MUST have the same `table_schema` and `table_name`
- Lifecycle instances are per-entity (not per-table), so `ManualJournalEntry` records have their own lifecycle independent of `JournalEntry` reads
- `data_policy` is per-entity: `JournalEntry` can be `append_only` while `ManualJournalEntry` is mutable (until it reaches a terminal state)

### Backing Types

`backing_type` declares what kind of physical object backs the entity, orthogonal to `mapping_mode`:

| Type | Description | Allowed Operations |
|------|-------------|-----------------|
| `table` | Standard PostgreSQL table (default) | create, read, update, delete, list, count |
| `view` | SQL view (read-only or updatable) | read, list, count |
| `materialized_view` | Materialized view (refresh-based) | read, list, count |
| `virtual` | No physical backing, computed at runtime | *(none — determined by implementation)* |
| `external` | Backed by external system (API federation) | read, list, count |
| `event_stream` | Event log/stream backing (reserved) | create, read, list, count |

**Runtime enforcement:** The `BACKING_TYPE_CAPABILITIES` constant (`@athyper/core/meta`) maps each `EntityBackingType` to a `ReadonlySet<DataOperation>`. `GenericDataAPIService.enforceBackingType()` checks this set **before** policy checks on every CRUD operation — attempting a disallowed operation (e.g. `delete` on a `view`) throws immediately with a descriptive error including the entity name, backing type, and allowed operations.

```typescript
type DataOperation = "create" | "read" | "update" | "delete" | "list" | "count";

const BACKING_TYPE_CAPABILITIES: ReadonlyMap<EntityBackingType, ReadonlySet<DataOperation>>;
```

#### Runtime Rules by Backing Type

**`view` entities:**
- Read-only by default. Updatable views (PostgreSQL `WITH CHECK OPTION`) are possible but not yet modeled — the capability set restricts to read/list/count.
- DDL generator emits `CREATE VIEW` instead of `CREATE TABLE`.
- No lifecycle instances, numbering, or approval — these require write capability.
- Compiled model's `fromFragment` references the view name directly.

**`materialized_view` entities:**
- Read-only with periodic refresh. Not automatically refreshed — requires external scheduling (e.g., cron, BullMQ job).
- DDL generator emits `CREATE MATERIALIZED VIEW`.
- `entity_publish_state.last_compiled_at` tracks the last materialization time.
- Cache TTL should match the materialization schedule.

**`virtual` entities:**
- No physical backing — all data is computed at runtime by custom service implementations.
- `BACKING_TYPE_CAPABILITIES` returns an empty set (no operations allowed via GenericDataAPI).
- Custom APIs must be registered separately to serve virtual entity data.
- Useful for computed aggregates, cross-entity projections, or API-assembled entities.

**`external` entities:**
- Data lives in an external system, accessed via API federation.
- Read-only: read, list, count. Mutations are proxied to the external system outside GenericDataAPI.
- The compiled model's `fromFragment` may reference a foreign table (`CREATE FOREIGN TABLE`) or be overridden by a federation adapter.
- Latency-sensitive — compiled model should enable aggressive caching.

**`event_stream` entities:**
- Append-only: create (insert), read, list, count. No update or delete.
- Suitable for audit logs, event sourcing, CDC streams.
- `data_policy.append_only` should be `true` to enforce immutability at the application level.
- May support TTL-based expiration (future: `data_policy.ttl_days`).

### Ownership & Mutability

Two columns control who can modify an entity definition and how:

**ownership_model** — who owns the entity definition:

| Value | Meaning | Example |
|-------|---------|---------|
| `system` | Seeded by platform migrations, replicated to all tenants | Currency, Customer, JournalEntry |
| `tenant` | Created by tenant admin via Schema Manager | Custom entities |
| `package` | Provided by an installable module/package | (future) |
| `overlay` | Exists only as overlay extension of a base entity | (future) |

**mutability** — what schema changes are allowed:

| Value | Allowed Mutations | Typical Use |
|-------|------------------|-------------|
| `locked` | None — read-only definition | REFERENCE, LEDGER, LOG class system entities |
| `controlled` | Overlay-only extension, base schema immutable | MASTER, CONTROL, DOCUMENT system entities |
| `extensible` | Add fields/relations/indexes freely, base fields protected | Tenant entities, extensible packages |
| `forkable` | Can be fully forked into a tenant-owned copy | Package entities designed for customization |

**Enforcement:** Application-level (checked in `MetaRegistry` and Schema Manager BFF). Use `isMutationAllowed(mutability, mutationKind)` in `entity-meta-utils.ts`.

### Schema Evolution Guard

Once an entity has at least one **effective** (or legacy `published`) version, certain columns become immutable. This prevents breaking compiled models, cached queries, FK references, and runtime SQL generation.

#### Immutable After First Effective Version

| Column | Reason |
|--------|--------|
| `tenant_id` | Identity anchor, FK cascade root |
| `entity_code` | Stable machine identity, used in code paths |
| `table_schema` | Physical binding, used in SQL generation |
| `table_name` | Physical binding, used in SQL generation |
| `kind` | Domain classification, affects schema routing |
| `entity_class` | Behavioral archetype, drives capability derivation |
| `mapping_mode` | Physical layout, affects uniqueness constraints |
| `backing_type` | Storage type, affects data operations |

#### Always Mutable

| Column | Notes |
|--------|-------|
| `name`, `slug`, `entity_short` | Display/routing, rename-safe |
| `module_id`, `engine_tag` | Organizational ownership |
| `feature_flags`, `naming_policy` | Infrastructure config |
| `display_config` | UI/presentation config |
| `identity_config` | Entity lookup identity *(planned, not yet implemented)* |
| `data_policy`, `provenance` | Data-layer policy and deployment metadata |
| `governance_level` | Meta feature depth (can be tightened/loosened) |
| `ownership_model`, `mutability` | Schema governance rules |
| `status`, `status_changed_*` | Lifecycle state |
| `label_singular`, `label_plural`, `description` | Display metadata |
| `icon_key`, `color_token` | Visual identity |
| ~~`published_version_id`~~, ~~`last_compiled_*`~~, ~~`last_schema_change_at`~~ | Operational — **moved to `entity_publish_state`** satellite table |

#### Enforcement Layers

1. **Application layer** (fast, good error messages): `checkEvolutionGuard()` in `entity-meta-utils.ts`. Called by `updateEntityDirect()` in Meta Studio BFF before any DB write.
2. **Database layer** (defense-in-depth): `BEFORE UPDATE` trigger `entity_evolution_guard` on `meta.entity` (`061_entity_evolution_guard.sql`). Raises `EVOLUTION_GUARD: {column} is immutable after publish` with `integrity_constraint_violation` SQLSTATE.

**Pre-publish entities** (draft-only): All columns are freely mutable. The guard only activates once `meta.entity_version` contains at least one row with `status IN ('effective', 'published')` for the entity.

### Cross-Entity Consistency Checks

Invariants that span `meta.entity`, `meta.entity_version`, and related tables. Enforced partly at DB level (constraints/triggers) and partly at publish-time (application-layer validation).

#### Database-Level Enforcement (`062_cross_entity_consistency.sql`)

| Invariant | Mechanism | Error |
|---|---|---|
| At most one effective version per entity | Partial unique index on `(tenant_id, entity_id) WHERE is_effective = true` | Unique constraint violation |
| Effective/published versions must have `published_at` and `published_by` | CHECK constraint `chk_version_published_metadata` | Check constraint violation |
| DOCUMENT + `numbering_enabled=true` → `naming_policy` required | BEFORE INSERT/UPDATE trigger on `meta.entity` | `CONSISTENCY_CHECK: DOCUMENT entity "..." has numbering_enabled=true but naming_policy is NULL` |

#### Publish-Time Validation (`validatePublishReadiness()` in `entity-meta-utils.ts`)

These checks run in the Meta Studio BFF publish route before the version transitions to `effective`. They require cross-table lookups that aren't practical as DB constraints.

| Check | Severity | Condition |
|---|---|---|
| Compiled artifact required | **error** | `compiledModel` capability enabled but no `meta.entity_compiled` row for this version |
| DOCUMENT + numbering → naming_policy | **error** | Redundant with DB trigger but provides better error UX |
| Lifecycle binding missing | **warning** | `lifecycle` capability enabled but no `meta.entity_lifecycle` row for this entity |
| Overlay conflict mode missing | **warning** | Active overlays exist but some are missing `conflict_mode` |

**Integration**: The publish route (`POST /api/admin/mesh/meta-studio/:entity/publish`) calls `fetchPublishValidationData()` → `validatePublishReadiness()` after compilation but before the runtime publish call. Errors block publish; warnings are returned in the response body.

### JSONB Column Validation

All three JSONB columns on `meta.entity` have PostgreSQL CHECK constraints enforcing structure, allowed keys, and value types.

#### `naming_policy` — Document Numbering Rule

```typescript
type NumberingRule = {
  code?: string;           // e.g. "INV"
  pattern: string;         // REQUIRED — e.g. "INV-{YYYY}-{SEQ:6}"
  reset_policy?: "none" | "yearly" | "monthly" | "daily";
  seq_start?: number;      // default 1
  seq_increment?: number;  // default 1
  is_active?: boolean;     // default true
};
```

Supported pattern tokens: `{YYYY}`, `{YY}`, `{MM}`, `{DD}`, `{SEQ:N}`, `{SEQ}`.

#### `feature_flags` — Infrastructure Behavior Flags

```typescript
type EntityFeatureFlags = {
  approval_required?: boolean;
  numbering_enabled?: boolean;
  effective_dating_enabled?: boolean;
  versioning_mode?: "none" | "sequential" | "major_minor";
  // Capability engine overrides (boolean):
  // fields, relations, indexes, compiledModel, permissionPolicies,
  // fieldSecurity, lifecycle, overlays, numbering, approvals,
  // effectiveDating, audit
};
```

**Note:** `entity_class` was removed from `feature_flags` — it's a first-class column since Phase 2. UI/presentation config was moved to `display_config`.

#### `identity_config` — Entity-Level Lookup Identity *(not yet implemented)*

> **Status:** `identity_config` is a **planned but not yet implemented** feature. No `identity_config` column exists in the SQL schema, Prisma model, or generated Kysely types. No `EntityIdentityConfig` type is defined. No service code reads or writes this column. It was previously documented as if it existed — that documentation was ahead of the codebase.
>
> When identity-based lookup resolution is needed, it should be implemented with:
> 1. A defined `EntityIdentityConfig` type in `@athyper/core/meta/types.ts`
> 2. A real column + migration on `meta.entity` (or `meta.entity_runtime_profile`)
> 3. CHECK constraints and JSONB key allowlisting
> 4. Service code in the Classification or Registry service to read/write it
> 5. Integration with lookup resolution
>
> Until then, entity identity for lookup resolution uses existing heuristics (entity_code, name, slug).

#### `display_config` — UI/Presentation Configuration

```typescript
type EntityDisplayConfig = {
  treeView?: {
    parentField: string;     // REQUIRED when treeView present
    levelField?: string;
    isGroupField?: string;
  };
  displayFields?: string[];           // reference label columns
  displayTemplate?: string;           // e.g. "{{code}} - {{name}}"
  sectionOverrides?: Record<string, string>;  // field → section
  sectionLabels?: Record<string, string>;     // section → label
  descriptorOverride?: object;        // full page descriptor override
  groupableFields?: string[];         // opt-in for list group-by
  cacheRefLabels?: boolean;           // cache FK labels in Redis
};
```

**Resolution order for display labels:** `displayTemplate` → `displayFields` → heuristic (`code`, `name`, `title`, `label`) → primary key.

**Resolution order for form sections:** field-level `validation.ui.section` → `display_config.sectionOverrides` → convention-based rules.

#### `data_policy` — Data-Layer Behavioral Policy

```typescript
type EntityDataPolicy = {
  soft_delete?: boolean;          // entity rows use is_deleted flag
  append_only?: boolean;          // rows cannot be updated after insert
  temporal?: boolean;             // effective_from/effective_to dating
  immutable_after_state?: string; // e.g. "POSTED" — rows lock when lifecycle reaches this state
};
```

Critical for `fin`, `doc`, and audit-heavy entities. Drives runtime insert/update/delete guards. Examples:
- `JournalEntry`: `{ "append_only": true }` (immutable financial records)
- `PurchaseInvoice`: `{ "soft_delete": true, "immutable_after_state": "POSTED" }`
- `Employee`: `{ "soft_delete": true, "temporal": true }`

#### `provenance` — Deployment/Package Metadata

```typescript
type EntityProvenance = {
  source_package?: string;          // e.g. "athyper-finance-core"
  source_version?: string;          // e.g. "2.1.0"
  introduced_in_release?: string;   // e.g. "2024.3"
  deprecated_in_release?: string;   // e.g. "2025.1"
};
```

Only relevant for `system`/`package` entities (NULL for tenant-created). Used for deployment diagnostics, release tracking, and tenant drift analysis.

### Operational Metadata

> **Architecture note:** Operational metadata is stored exclusively in the `meta.entity_publish_state` satellite table. Legacy columns (`published_version_id`, `last_compiled_at`, `last_compiled_hash`, `last_schema_change_at`) on `meta.entity` are **stale and deprecated** — they are no longer maintained by triggers after `070_entity_identity_hardening.sql`. All reads must go through the satellite table.

The `meta.entity_publish_state` table is the **sole authoritative source** for deployment/compilation state:

| Column | Type | Description |
|---|---|---|
| `entity_id` | `uuid PK/FK → meta.entity` | One-to-one with entity registry |
| `published_version_id` | `uuid FK → entity_version` | Currently effective version pointer |
| `current_draft_version_id` | `uuid FK → entity_version` | Active draft (NULL = no draft) |
| `latest_version_no` | `int` | Highest version_no ever created (monotonically increasing) |
| `status_summary` | `text` | Human-readable: "v3 effective, v4 draft" |
| `last_compiled_at` | `timestamptz` | Most recent successful compilation timestamp |
| `last_compiled_hash` | `text` | Hash of most recent compiled snapshot |
| `last_schema_change_at` | `timestamptz` | Most recent field/relation/index change |
| `provenance` | `jsonb` | Deployment provenance (EntityProvenance) |

**`published_version_id` maintenance**: An `AFTER INSERT OR UPDATE OF status` trigger on `meta.entity_version` writes **only** to `meta.entity_publish_state` when versions transition to/from `effective`. The legacy `meta.trg_sync_published_version_id` dual-write trigger was replaced by `070_entity_identity_hardening.sql` to eliminate the dual-write pattern.

**Why satellite, not inline?** Separating operational metadata from admin-edited columns on `meta.entity` prevents contention — compilation/publish cycles update frequently while entity registry columns change rarely. Different write patterns belong in different tables.

### Display Metadata

Canonical presentation layer anchored at the entity registry level. First-class columns (not JSONB) because they're queried directly in list APIs, nav rendering, and command palette — all hot paths.

| Column | Type | Purpose |
|---|---|---|
| `label_singular` | `text` | Page titles, breadcrumbs, command palette. E.g. "Purchase Invoice". Falls back to `name` if NULL. |
| `label_plural` | `text` | List pages, menus, count badges. E.g. "Purchase Invoices". Falls back to `label_singular` + "s" heuristic. |
| `description` | `text` | Admin tooltips, import/export bundles, low-code descriptors, AI-assisted schema exploration. |
| `icon_key` | `text` | Icon library key. E.g. "file-text", "users". Format: `^[a-z][a-z0-9-]*$`. |
| `color_token` | `text` | Design-system color token. E.g. "blue-500", "emerald-600". Format: `^[a-z][a-z0-9-]*$`. |

**Why not `display_config`?** `display_config` holds structural UI hints (tree views, section grouping, form layout). Display metadata here is the entity's canonical identity — its name, icon, and color in every surface. Keeping them separate avoids overloading either concern.

### Module & Engine Referential Governance

`module_id` and `engine_tag` are enforced via foreign keys to controlled reference tables, preventing invalid values.

#### `module_id` → `core.module.code`

Every entity's `module_id` references a registered module in `core.module`. The FK uses `ON UPDATE CASCADE ON DELETE RESTRICT` — module codes can be renamed but not deleted while entities reference them.

Standard modules (40+) are seeded in `200_seed_standard.sql`. Examples: `ACC`, `FND`, `CRM`, `HR`, `SRM`, `BUDGET`, `INVENTORY`, `ASSET`, `TREASURY`, `MFG`, `BUY`, `DOC`.

#### `engine_tag` → `meta.engine.code`

Finance and processing entities reference a registered engine via `engine_tag`. The `meta.engine` table is a lightweight reference registry:

```sql
meta.engine (
    code        text PRIMARY KEY,    -- e.g. 'posting-engine'
    name        text NOT NULL,       -- e.g. 'Posting Engine'
    description text,
    created_at  timestamptz,
    created_by  text
)
```

The FK uses `ON UPDATE CASCADE ON DELETE RESTRICT`. `engine_tag` is nullable — non-finance entities (ref, ent, doc, int) have no engine.

**Registered engines (12):**

| Code | Name | Scope |
|------|------|-------|
| `posting-engine` | Posting Engine | GL posting, journal entries, GL balances |
| `decision-grid` | Decision Grid | OU structure, business intents, smart defaults, policy evaluation |
| `budget-engine` | Budget Engine | Funding profiles, budget transactions, transfers |
| `inventory-engine` | Inventory Engine | Warehouses, items, balances, movements, valuation |
| `asset-engine` | Asset Engine | Fixed assets, depreciation, asset books |
| `commission-engine` | Commission Engine | Commission plans, calculations, statements |
| `federation-engine` | Federation Engine | Multi-entity, intercompany, consolidation, FX, netting |
| `tax-engine` | Tax Engine | Tax jurisdictions, rates, calculations |
| `production-engine` | Production Engine | BOM, routing, work orders, production variance |
| `atlas-ai` | Atlas AI | AI model registry, predictions, actions, drift monitoring |
| `bank-reconciliation` | Bank Reconciliation | Bank statements, line matching, reconciliation |
| `commitment-engine` | Commitment Engine | Purchase commitments, schedules, fulfillment |

**Migration:** `060_module_engine_fk.sql` (table + FKs), `307_seed_engines.sql` (seed data).

### Entity Kinds

| Kind | Description | Examples |
|------|-------------|----------|
| `ref` | Reference/lookup data (ISO standards, codes) | Country, Currency, UOM |
| `ent` | Master data entities (full governance) | Customer, Supplier, Employee |
| `doc` | Document entities | Attachment, Template, Document |
| `fin` | Finance entities (master, config, and transaction) | ChartOfAccounts, JournalEntry |
| `cfg` | Configuration entities | (reserved) |
| `int` | Integration entities | IntegrationEndpoint, WebhookSubscription |

### Governance Levels

| Level | Features | Use Case |
|-------|----------|----------|
| `full` | Field dictionary, field security, permission policies, lifecycle, overlays, compiled model | Core business entities |
| `light` | Field dictionary, permission policies, audit policy (no overlays/lifecycle) | Config/rule tables |
| `audit_only` | Audit policy only | Immutable transaction tables (ledger entries) |

### Entity Classification (EntityClass)

`entity_class` is the **behavioral archetype** — it defines *how* an entity behaves,
orthogonal to `kind` (domain origin) and `governance_level` (meta feature depth).

| Class | Behavior | Examples |
|-------------|---------------------------------------------------------------|------------------------------------------|
| `REFERENCE` | Immutable lookup / ISO data, no lifecycle | Currency, Country, UnitOfMeasure |
| `MASTER` | Core business entities, optionally lifecycle-managed | Customer, Product, ChartOfAccounts |
| `CONTROL` | Configuration / setup / rules, versioned, no approval flow | TaxRate, SmartDefaultRule, FxRate |
| `DOCUMENT` | Lifecycle-managed transactional docs, numbering + approvals | PurchaseInvoice, ManualJournalEntry |
| `LEDGER` | Immutable append-only financial records, balancing invariants | JournalEntry, GLBalance, PaymentAllocation|
| `LOG` | Operational event streams, TTL-eligible, sampleable | PolicyEvaluationLog, DeliveryLog, JobLog |

**Three orthogonal classification axes:**

- `kind` — *where* it lives (domain/storage schema: `ref`, `ent`, `fin`, `doc`, `int`)
- `entity_class` — *how* it behaves (behavioral archetype, this column)
- `governance_level` — *how much* meta infra it gets (`full`, `light`, `audit_only`)

### Feature Capabilities (Derived Capability Snapshot)

A pure function `deriveEntityFeatureCapabilities(entity_class, governance_level, feature_flags)`
computes infrastructure-level feature enablement. **Not stored in DB** — computed at resolution
time from the three classification axes above. Gives runtime and Schema Manager a single
authoritative source of truth instead of scattered condition trees.

**Derivation matrix** (full governance):

| Capability | REFERENCE | MASTER | CONTROL | DOCUMENT | LEDGER | LOG |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `fields` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `relations` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `indexes` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `compiledModel` | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| `permissionPolicies` | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| `fieldSecurity` | ✗ | ✓ | ✗ | ✓ | ✓ | ✗ |
| `lifecycle` | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ |
| `overlays` | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ |
| `numbering` | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ |
| `approvals` | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ |
| `effectiveDating` | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ |
| `audit` | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |

**governance_level acts as a ceiling:**

- `full` — all capabilities for the class (matrix above)
- `light` — only: fields, relations, indexes, compiledModel, audit
- `audit_only` — only: fields, relations, indexes, audit

**feature_flags overrides:** Any boolean key in `feature_flags` JSONB matching a capability
name flips that capability. Example: `{ "lifecycle": true }` enables lifecycle on a MASTER entity.
Overrides are subject to guardrail validation (see below).

#### Capability Override Guardrails

Not all overrides are safe. The engine enforces two tiers of guardrails:

**Forbidden overrides** — structurally incompatible, silently blocked at derivation time:

| Entity Class | Forbidden Capabilities |
|---|---|
| `REFERENCE` | `lifecycle`, `approvals`, `numbering` |
| `LEDGER` | `lifecycle`, `overlays` |
| `LOG` | `lifecycle`, `approvals`, `numbering`, `overlays`, `fieldSecurity`, `effectiveDating` |

**Warning overrides** — allowed but unusual, surfaced as diagnostics:

| Entity Class | Warning Capabilities |
|---|---|
| `REFERENCE` | `fieldSecurity`, `effectiveDating`, `overlays` |
| `CONTROL` | `approvals`, `numbering` |
| `MASTER` | `numbering` |

**Class × Governance combinations** — not all governance levels are valid for every class:

| Entity Class | Allowed Governance Levels |
|---|---|
| `REFERENCE` | `full`, `light`, `audit_only` |
| `MASTER` | `full`, `light` |
| `CONTROL` | `full`, `light` |
| `DOCUMENT` | `full` |
| `LEDGER` | `full` |
| `LOG` | `full`, `light`, `audit_only` |

Invalid combinations produce `error`-severity diagnostics. Use `EntityClassificationService.getFeatureCapabilitiesWithDiagnostics()` for Schema Manager / publish validation to surface all guardrail violations.

**Constants:** `FORBIDDEN_CAPABILITY_OVERRIDES`, `WARNING_CAPABILITY_OVERRIDES`, `VALID_CLASS_GOVERNANCE_COMBINATIONS` (all exported from `@athyper/core/meta`).

#### Structured Diagnostics

All guardrail violations are reported as `CapabilityOverrideDiagnostic` objects (exported from `@athyper/core/meta`):

```typescript
type CapabilityOverrideDiagnostic = {
  code: "FORBIDDEN_OVERRIDE" | "WARNING_OVERRIDE" | "INVALID_CLASS_GOVERNANCE" | "GOVERNANCE_CEILING_APPLIED";
  severity: "error" | "warning";
  capability: keyof EntityFeatureCapabilities;
  entityClass: string;
  governanceLevel: string;
  requestedOverride: unknown;
  resolutionTaken: "blocked" | "allowed_with_warning" | "ceiling_applied";
  message: string;
};
```

#### Enforcement Layers

1. **Derive-time** (runtime): `deriveCapabilities()` silently blocks forbidden overrides, collects diagnostics.
2. **Write-path** (application): `createEntityDirect()` and `updateEntityDirect()` in Meta Studio BFF validate class×governance and forbidden overrides before DB write. Uses `validateClassGovernanceCombination()` and `validateFeatureFlagOverrides()` from `entity-meta-utils.ts`.
3. **DB trigger** (defense-in-depth): `meta.trg_class_governance_guard` on `meta.entity` and `meta.trg_class_governance_guard_runtime` on `meta.entity_runtime_profile` reject invalid combinations on INSERT/UPDATE. Migration: `071_class_governance_guard.sql`.

**Implementations:**

- Client-safe: `deriveEntityFeatureCapabilities()` in `entity-meta-utils.ts`
- Server-side: `EntityClassificationService.getFeatureCapabilities()` in framework runtime
- With diagnostics: `EntityClassificationService.getFeatureCapabilitiesWithDiagnostics()` — returns `{ capabilities, diagnostics[] }`
- Resolution: `EntityTableMeta.capabilities` computed automatically in `resolveEntityMeta()`

### Entity Registry Lifecycle (Status Model)

The entity registry itself has a 5-state lifecycle, replacing the old boolean `is_active` flag:

| Status | Meaning | Data Operations | Visible in UI |
|---|---|---|---|
| `draft` | Definition in progress | No | Schema Manager only |
| `active` | Live and operational | Full CRUD | Yes |
| `deprecated` | Flagged for phase-out | Read + limited write | Yes (with warning) |
| `suspended` | Temporarily disabled | Read-only | Yes (with warning) |
| `retired` | Permanently decommissioned | None | Hidden by default |

**Backward compatibility:** `is_active` is a `GENERATED ALWAYS AS (status IN ('active', 'deprecated', 'suspended')) STORED` column. All existing `WHERE is_active = true` queries continue to work without modification.

**Allowed transitions:**

```
draft      --> active
active     --> deprecated, suspended, retired
deprecated --> active, retired
suspended  --> active, retired
retired    --> (terminal, no transitions out)
```

**Audit columns:** `status_changed_at`, `status_changed_by`, `status_reason` track the most recent status transition.

**Transition enforcement:** Application-level (not DB triggers). Use `isValidStatusTransition(from, to)` in `entity-meta-utils.ts`.

---

## Database Schema

### Entity Registry Tables

#### `meta.entity` (Core Registry)

The central table holding all entity definitions. Primary columns:

| Column | Type | Description |
|---|---|---|
| `id` | `uuid PK` | Entity ID |
| `tenant_id` | `uuid FK → core.tenant` | Tenant isolation |
| `module_id` | `text FK → core.module` | Module assignment |
| `name` | `text` | PascalCase logical name |
| `kind` | `text CHECK` | Domain kind (ref/ent/doc/fin/cfg/int) |
| `entity_code` | `text UNIQUE` | Immutable snake_case identity |
| `slug` | `text UNIQUE` | Kebab-case URL routing key |
| `entity_short` | `text` | Uppercase mnemonic alias |
| `entity_class` | `text CHECK` | REFERENCE/MASTER/CONTROL/DOCUMENT/LEDGER/LOG |
| `table_schema` | `text` | Physical DB schema |
| `table_name` | `text` | Physical DB table |
| `mapping_mode` | `text CHECK` | exclusive/shared/virtual/derived |
| `backing_type` | `text CHECK` | table/view/materialized_view/virtual/external/event_stream |
| `governance_level` | `text` | full/light/audit_only |
| `engine_tag` | `text FK → meta.engine` | Engine assignment (nullable) |
| `ownership_model` | `text CHECK` | system/tenant/package/overlay |
| `mutability` | `text CHECK` | locked/controlled/extensible/forkable |
| `status` | `text CHECK` | draft/active/deprecated/suspended/retired |
| `is_active` | `boolean GENERATED` | Computed from status |
| `feature_flags` | `jsonb` | Infrastructure behavior flags |
| `naming_policy` | `jsonb` | Numbering rule configuration |
| `display_config` | `jsonb` | UI/presentation configuration |
| `identity_config` | `jsonb` | Entity lookup identity *(planned, not yet implemented — no column exists)* |
| `data_policy` | `jsonb` | Data-layer behavioral policy |
| `provenance` | `jsonb` | Deployment metadata |
| `label_singular` | `text` | Human singular label |
| `label_plural` | `text` | Human plural label |
| `description` | `text` | Admin description |
| `icon_key` | `text` | Icon library key |
| `color_token` | `text` | Design-system color token |
| `status_changed_at` | `timestamptz` | Last status change timestamp |
| `status_changed_by` | `text` | Last status change actor |
| `status_reason` | `text` | Reason for last status change |
| `discriminator_column` | `text` | For shared-mapping: physical column name used to filter rows (NULL for exclusive) |
| `discriminator_value` | `text` | For shared-mapping: value identifying this entity's rows (NULL for exclusive) |

#### `meta.entity_publish_state` (Satellite Table)

Separates operational/deployment metadata from admin-edited registry columns:

| Column | Type | Description |
|---|---|---|
| `entity_id` | `uuid PK/FK` | References meta.entity |
| `published_version_id` | `uuid FK` | Currently effective version |
| `current_draft_version_id` | `uuid FK` | Active draft (NULL = no draft) |
| `latest_version_no` | `int` | Highest version_no ever created (monotonically increasing) |
| `status_summary` | `text` | Human-readable: "v3 effective, v4 draft" |
| `last_compiled_at` | `timestamptz` | Last compilation timestamp |
| `last_compiled_hash` | `text` | Hash of last compiled snapshot |
| `last_schema_change_at` | `timestamptz` | Last schema change timestamp |
| `provenance` | `jsonb` | Deployment provenance |

### Version Tables

#### `meta.entity_version`

Each entity has versions containing the full schema definition:

| Column | Type | Description |
|---|---|---|
| `id` | `uuid PK` | Version ID |
| `tenant_id` | `uuid FK` | Tenant isolation |
| `entity_id` | `uuid FK` | Parent entity |
| `version_no` | `int` | Sequential version number |
| `status` | `text CHECK` | 9-value lifecycle (see below) |
| `label` | `text` | Human label: "v3 (draft)" |
| `behaviors` | `jsonb` | Full schema definition |
| `published_at` | `timestamptz` | Publication timestamp |
| `published_by` | `text` | Publication actor |
| `derived_from_version_id` | `uuid FK → entity_version` | Source version for lineage |
| `supersedes_version_id` | `uuid FK → entity_version` | Version this replaces |
| `is_effective` | `boolean` | True = currently live version |
| `effective_from` | `timestamptz` | When this version became effective |
| `effective_to` | `timestamptz` | When superseded (NULL = still effective) |
| `approved_at` | `timestamptz` | Approval timestamp |
| `approved_by` | `text` | Approving principal |
| `change_summary` | `text` | Free-text change description |
| `change_type` | `text CHECK` | minor/major/breaking/editorial |
| `is_working_copy` | `boolean` | True = current working draft |
| `lock_version` | `int` | Optimistic locking counter |
| `lifecycle_instance_id` | `uuid FK` | Version-level workflow tracking |
| `version_hash` | `text` | SHA-256 content hash |

**Version status values (CHECK constraint):**

| Status | Meaning | Editable? |
|---|---|---|
| `draft` | Editable working copy | Yes |
| `in_review` | Submitted for approval, locked | No |
| `approved` | Approval complete, not yet effective | No |
| `effective` | Live/active version | No |
| `superseded` | Replaced by newer effective version | No |
| `archived` | Historical, no longer relevant | No |
| `rejected` | Review/approval failed | No |
| `withdrawn` | Submitter canceled before approval | No |
| `published` | **Deprecated** — backward compat only. New inserts blocked by `meta.trg_forbid_published_status`. | No |

**Unique partial indexes (invariants):**
- `idx_ev_one_effective_per_entity`: At most one effective version per entity (`WHERE is_effective = true`)
- `idx_ev_one_active_draft_per_entity`: At most one draft/in_review per entity (`WHERE status IN ('draft', 'in_review')`)

**Compatibility view:** `meta.entity_version_effective` transparently maps `published` → `effective` in the `status` column, so queries expecting the old `published` status continue to work during migration.

### Field Tables

#### `meta.field`

Field definitions stored per entity version:

| Column | Type | Description |
|---|---|---|
| `id` | `uuid PK` | Field ID |
| `tenant_id` | `uuid FK` | Tenant isolation |
| `entity_version_id` | `uuid FK` | Parent version |
| `name` | `text` | camelCase field name |
| `column_name` | `text` | snake_case DB column |
| `data_type` | `text` | FieldType value |
| `cardinality` | `text` | one/many |
| `origin` | `text` | system/business |
| `required` | `boolean` | Non-nullable constraint |
| `is_unique` | `boolean` | Uniqueness constraint |
| `is_indexed` | `boolean` | DB index flag |
| `sort_order` | `int` | Display ordering |
| `label` | `text` | Human-readable label |
| `description` | `text` | Field description |
| `format` | `text CHECK` | Core semantic format (email, phone, url, etc.) |
| `unit` | `text` | Measurement unit |
| `default_value` | `text` | JSON-serialized default |
| `constraints` | `jsonb` | Validated constraint object |
| `enumConfig` | `jsonb` | Enum values/source configuration |
| `referenceConfig` | `jsonb` | FK/relationship configuration |
| `jsonConfig` | `jsonb` | JSON field mode/schema |
| `moneyConfig` | `jsonb` | Currency/rounding configuration |
| `datetimeConfig` | `jsonb` | Timezone handling |
| `ui_hint` | `jsonb` | UI presentation overrides |
| `visibility` | `jsonb` | Per-context visibility (create/view/edit) |
| `editability` | `jsonb` | Per-context editability (create/edit) |
| `is_read_only` | `boolean` | Domain read-only flag |
| `is_deprecated` | `boolean` | Deprecation flag |
| `is_computed` | `boolean` | Computed/derived field flag |
| `write_once` | `boolean` | Editable only on create |
| `lookup_profile` | `jsonb` | Lookup search UX configuration |
| `compute_mode` | `text` | virtual/materialized |
| `compute_expr` | `jsonb` | Compute expression definition |
| `child_entity_name` | `text` | For collections: child entity |
| `child_fk_field` | `text` | For collections: parent FK on child |
| `collection_behavior` | `jsonb` | Collection ownership/cascade rules |

#### `meta.relation`

Relationship definitions between entities per version.

#### `meta.index_def`

Custom index definitions per entity version.

### Compiled Snapshot Tables

Compilation output is persisted for fast runtime reads and hash-based cache validation.

#### `meta.entity_compiled` (Base Snapshot)

Stores the compiled model for a specific entity version **without** overlays applied:

| Column | Type | Description |
|---|---|---|
| `id` | `uuid PK` | Snapshot ID |
| `tenant_id` | `uuid FK → core.tenant` | Tenant isolation |
| `entity_version_id` | `uuid FK → meta.entity_version` | Source version |
| `compiled_json` | `jsonb NOT NULL` | Full `CompiledSnapshot` serialized as JSON |
| `compiled_hash` | `text NOT NULL` | SHA-256 content hash of compiled output |
| `generated_at` | `timestamptz` | When compilation ran |
| `created_at` | `timestamptz` | Row creation timestamp |
| `created_by` | `text` | Actor who triggered compilation |

**Unique constraint:** `(tenant_id, entity_version_id, compiled_hash)` — prevents storing duplicate snapshots for the same version+hash.

**Relationship to Redis cache:** The Redis cache (`meta:compiled:{entityName}:{version}`) holds the hot copy for runtime reads. `meta.entity_compiled` is the persistent backup — used for cache warming on startup (`precompileAll()`) and hash comparison to detect staleness.

#### `meta.entity_compiled_overlay` (Overlay Snapshot)

Stores the compiled model **with** overlays applied (deterministic overlay composition):

| Column | Type | Description |
|---|---|---|
| `id` | `uuid PK` | Snapshot ID |
| `tenant_id` | `uuid FK → core.tenant` | Tenant isolation |
| `entity_version_id` | `uuid FK → meta.entity_version` | Source version |
| `overlay_set` | `jsonb NOT NULL` | Which overlays were applied (deterministic key) |
| `compiled_json` | `jsonb NOT NULL` | Full `CompiledSnapshot` with overlays merged |
| `compiled_hash` | `text NOT NULL` | SHA-256 content hash |
| `generated_at` | `timestamptz` | When compilation ran |
| `created_at` | `timestamptz` | Row creation timestamp |
| `created_by` | `text` | Actor who triggered compilation |

**Index:** `(tenant_id, entity_version_id, compiled_hash)` for fast lookup by version and hash.

**When overlays change:** The overlay snapshot must be recompiled. The `overlay_set` JSONB key identifies which combination of overlays produced this snapshot, enabling deterministic cache invalidation.

### Lifecycle Tables

#### Definition Tables (meta schema)

| Table | Purpose |
|---|---|
| `meta.lifecycle` | Lifecycle definition (code, name, version, definition_hash) |
| `meta.lifecycle_state` | States within a lifecycle (code, name, is_terminal, sort_order) |
| `meta.lifecycle_transition` | Valid state-to-state transitions (from_state, to_state, operation_code) |
| `meta.lifecycle_transition_gate` | Pre-conditions for transitions (required_operations, approval_template, conditions, thresholds) |
| `meta.lifecycle_transition_hook` | Post-transition actions (timing, action, config, sort_order) |
| `meta.entity_lifecycle` | Entity-to-lifecycle routing (entity_name → lifecycle_id, conditions, priority). Includes `meta_entity_id` FK. |
| `meta.entity_lifecycle_route_compiled` | Compiled/indexed route resolution. Includes `meta_entity_id` FK. |

#### Runtime Tables (core schema)

| Table | Purpose |
|---|---|
| `core.entity_lifecycle_instance` | Current lifecycle state per entity record. Unique on (tenant_id, entity_name, entity_id). Includes `meta_entity_id` FK. |
| `core.entity_lifecycle_event` | Audit trail of all state transitions (from_state, to_state, operation_code, actor, payload, correlation_id). Includes `meta_entity_id` FK. |

> **`meta_entity_id` on lifecycle/runtime tables:** All tables above carry a `meta_entity_id uuid` FK to `meta.entity(id)` for rename-safe entity binding. See [Identity Model → meta_entity_id FK Column](#meta_entity_id-fk-column-stable-lifecycle-binding) for the full table and auto-resolution trigger details.

### Approval Tables

#### Definition Tables (meta schema)

Multi-stage approval templates are defined in the `meta` schema. These are referenced by lifecycle transition gates (`approval_template_id` on `meta.lifecycle_transition_gate`, FK to `meta.approval_template(id)`, ON DELETE RESTRICT).

| Table | Purpose |
|---|---|
| `meta.approval_template` | Approval template definitions (code, name, version, compiled_json) |
| `meta.approval_template_stage` | Stages within a template (stage_no, name, mode: serial/parallel) |
| `meta.approval_template_rule` | Routing rules: conditions → approver assignment (priority-ordered) |

#### Workflow Definition Table (wf schema)

The `wf` schema also has a workflow-level definition table with a different naming convention:

| Table | Purpose |
|---|---|
| `wf.approval_definition` | Workflow-level approval rules (entity_type scoping, conditions) |

> **Naming note:** `meta.approval_template` (lifecycle gate templates) and `wf.approval_definition` (workflow execution rules) serve related but distinct roles. The `meta` table defines the *template structure* (stages, rules, routing). The `wf` table defines the *workflow execution configuration* (entity_type binding, conditions).

#### Runtime Tables (wf schema)

All runtime approval instances and tasks live in the `wf` schema (NOT `core`):

| Table | Purpose |
|---|---|
| `wf.approval_instance` | Active approval workflows (entity_type, entity_id, status, decision) |
| `wf.approval_stage` | Per-stage status tracking (stage_no, mode, quorum, status) |
| `wf.approval_task` | Individual approval tasks assigned to approvers (status, decision) |
| `wf.approval_comment` | Discussion/comment trail per approval instance/task |
| `wf.approval_event` | Append-only audit log of approval lifecycle events |
| `wf.approval_escalation` | Escalation events (from_approver, to_approver, reason) |
| `wf.approval_assignment_snapshot` | Point-in-time snapshot of task assignments |

> **Schema clarification:** Approval runtime tables are in the `wf` (workflow) schema, not `core`. The `core` schema holds lifecycle instances and events. The TypeScript service contracts (`ApprovalService`) abstract over both schemas.

#### Entity Identity Column Naming (Cross-Schema)

The column that identifies the entity type is named differently across schemas:

| Schema | Table(s) | Column | Type |
|---|---|---|---|
| `meta.*` | `entity_lifecycle`, `entity_lifecycle_route_compiled` | `entity_name` | text |
| `core.*` | `entity_lifecycle_instance`, `entity_lifecycle_event` | `entity_name` | text |
| `wf.*` | `approval_definition`, `approval_instance` | `entity_type` | text |

Both `entity_name` and `entity_type` hold the same PascalCase entity name value. The naming divergence is historical — `wf` tables were designed as a generic workflow engine, while `meta`/`core` tables are META-specific. All tables that support `meta_entity_id` (070 migration) should prefer the UUID FK for runtime joins.

#### TypeScript ↔ DB Concordance

| TypeScript Type | DB Table | Notes |
|---|---|---|
| `ApprovalTemplate` | `meta.approval_template` | Template definition |
| `ApprovalTemplateStage` | `meta.approval_template_stage` | Template stages |
| `ApprovalTemplateRule` | `meta.approval_template_rule` | Template routing rules |
| `ApprovalInstance` | `wf.approval_instance` | Runtime instance |
| `ApprovalTask` | `wf.approval_task` | Individual approver task |
| `ApprovalEvent` | `wf.approval_event` | Audit event log |
| `ApprovalEscalation` | `wf.approval_escalation` | Escalation events |
| `ApprovalAssignmentSnapshot` | `wf.approval_assignment_snapshot` | Point-in-time snapshot |

#### Approval FK Naming Convention

The canonical FK column name for referencing an approval template is `approval_template_id`. Contextual prefixes are used when a table has multiple template references or a specific semantic:

| Table | Column | Semantics |
|---|---|---|
| `meta.lifecycle_transition_gate` | `approval_template_id` | Gate-bound template (FK, ON DELETE RESTRICT) |
| `fin.operating_unit` | `default_approval_template_id` | Org-unit default template |
| `fin.ou_intent_mapping` | `override_approval_template_id` | Intent-specific override |
| `fin.payment_entry` | `approval_instance_id` | FK to `wf.approval_instance` (runtime) |
| `fin.purchase_invoice` | `approval_instance_id` | FK to `wf.approval_instance` (runtime) |

**`approval_route` column:** `fin.payment_entry.approval_route` and `fin.purchase_invoice.approval_route` store the approval routing decision (e.g., `"auto"`, `"manual"`, `"exempt"`). This is a VARCHAR(20) status field, NOT a FK — it records which routing path was selected, not which template was used.

#### Approval Feature Flags vs Capabilities

Two related but distinct concepts:

| Name | Location | Layer | Meaning |
|---|---|---|---|
| `approval_required` | `EntityFeatureFlags` | Admin input | "Records of this entity require approval workflow at runtime" |
| `approvals` | `EntityFeatureCapabilities` | Derived output | "This entity's infrastructure supports approval workflows" |

`approvals` (capability) is derived from `entity_class + governance_level + feature_flags`. A DOCUMENT entity has `approvals: true` by default. Setting `approval_required: true` in feature_flags activates the requirement. REFERENCE and LOG entities have `approvals` forbidden (cannot be overridden to `true`).

### Engine Table

```sql
meta.engine (
    code        text PRIMARY KEY,
    name        text NOT NULL,
    description text,
    created_at  timestamptz,
    created_by  text
)
```

### SQL Migration File Index

**Foundation migrations** (`01_foundation/`):

| File | Purpose |
|---|---|
| `040_meta.sql` | Core meta registry tables |
| `050_entity_identity_strengthening.sql` | entity_code, slug, mapping_mode, entity_class columns |
| `057_entity_registry_lifecycle.sql` | 5-state status model on meta.entity |
| `058_entity_ownership_backing.sql` | ownership_model, mutability, backing_type columns |
| `059_jsonb_validation.sql` | JSONB key allowlisting trigger for display_config |
| `060_module_engine_fk.sql` | Module/engine FK enforcement + meta.engine table |
| `061_entity_evolution_guard.sql` | Immutability trigger for published entities |
| `062_cross_entity_consistency.sql` | Cross-table invariant enforcement |
| `063_operational_display_datapolicy.sql` | data_policy, provenance, labels, operational columns |
| `064_entity_publish_state.sql` | Satellite table for deployment metadata |
| `065_entity_ui_profile.sql` | UI profile enhancements |
| `066_entity_numbering_policy.sql` | Numbering policy enhancements |
| `067_entity_runtime_profile.sql` | Runtime profile columns |
| `068_governed_versioning.sql` | 8-state version governance, lifecycle hooks, effectivity |
| `069_lifecycle_hardening.sql` | Definition hash, version hash, revision reason enforcement |
| `070_entity_identity_hardening.sql` | meta_entity_id FK on 8 tables, auto-resolve trigger, publish-state sole authority, forbid 'published' status |
| `071_class_governance_guard.sql` | DB-level class×governance combination enforcement trigger on meta.entity and meta.entity_runtime_profile |

**Seed migrations** (`10_seed_standard/`):

| File | Purpose |
|---|---|
| `300_meta_entity_registration.sql` | Seeds all business entities by domain |
| `303_seed_entity_identity.sql` | entity_code, slug, entity_short values |
| `304_seed_entity_lifecycle.sql` | Entity lifecycle status values |
| `305_seed_entity_ownership.sql` | ownership_model, mutability assignments |
| `306_seed_display_config.sql` | Display configuration per entity |
| `307_seed_engines.sql` | Engine registry seed data (12 engines) |
| `316_seed_governed_lifecycle.sql` | Governed lifecycle seed data |

---

## Type System

### Field Types

The META Engine supports 13 canonical data types:

| Type | Storage | Validation | Example |
|---|---|---|---|
| `string` | `text` | minLength, maxLength, pattern | Name, code |
| `text` | `text` | minLength, maxLength, pattern | Description, notes |
| `integer` | `int` | min, max | Quantity, count |
| `number` | `float8` | min, max, precision, scale | Legacy numeric |
| `decimal` | `numeric(p,s)` | min, max, precision, scale | Amount, rate |
| `boolean` | `boolean` | — | is_active, is_default |
| `date` | `date` | minDate, maxDate | birth_date |
| `datetime` | `timestamptz` | minDate, maxDate | created_at |
| `reference` | `uuid` | FK enforcement | customer_id |
| `enum` | `text` | allowedValues | status, type |
| `json` | `jsonb` | JSON Schema (optional) | config, metadata |
| `uuid` | `uuid` | — | External reference IDs |
| `rich_text` | `text` | minLength, maxLength | Formatted content |

### Semantic Formats

Core semantic formats (DB CHECK constrained on `meta.field.format`):

| Format | Data Type | UI Specialization |
|---|---|---|
| `email` | string | Email input with validation |
| `phone` | string | Phone input with masking |
| `url` | string | URL input with link preview |
| `money` | decimal | Currency display with formatting |
| `percent` | decimal | Percentage display |
| `password` | string | Masked input |
| `color` | string | Color picker |
| `country` | string | Country code autocomplete |
| `timezone` | string | Timezone selector |
| `markdown` | text | Markdown editor/preview |
| `html` | text | Rich text editor |
| `ip_address` | string | IP input with validation |
| `slug` | string | Slug input with auto-generation |

For tenant-extensible semantic tags (e.g., `tax_id`, `bank_account`, `iban`, `bic_swift`, `attachment`, `image`), use `ui_hint.props.semanticTag` (unconstrained JSONB).

### Field Constraints

```typescript
type FieldConstraints = {
  // Base (all types)
  nullable?: boolean;
  required?: boolean;
  // String family (string, text, rich_text)
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  // Numeric family (integer, number, decimal)
  min?: number;
  max?: number;
  precision?: number;
  scale?: number;
  // Date family (date, datetime)
  minDate?: string;
  maxDate?: string;
  // Enum family
  allowedValues?: string[];
};
```

**Constraint validation by type family** (`CONSTRAINT_KEYS_BY_FAMILY`):

| Data Type Family | Valid Keys (beyond base) |
|---|---|
| string, text, rich_text | minLength, maxLength, pattern |
| integer, number, decimal | min, max, precision, scale |
| date, datetime | minDate, maxDate |
| enum | allowedValues |
| boolean, uuid, reference, json | base only (required, nullable) |

Invalid combinations are rejected at both Zod validation and DB CHECK constraint layers.

### Field UI Hint System

```typescript
type FieldUiHint = {
  // Renderer (which component to use)
  type?: string;           // Generic UI type override
  viewType?: string;       // Read-mode component
  editType?: string;       // Form edit component
  props?: Record<string, unknown>;  // Component props

  // Form behavior
  hidden?: boolean;        // Hide field entirely
  disabled?: boolean;      // Disable editing (Layer 8 advisory)
  placeholder?: string;    // Input placeholder
  helpText?: string;       // Help text near field
  readOnly?: boolean;      // Layer 8 advisory, never overrides domain truth
  lockOnEdit?: boolean;    // Layer 8 advisory

  // Layout
  section?: string;        // Section assignment
  group?: string;          // Group name
  layout?: "full" | "half" | "third";  // Form grid width
  density?: "compact" | "normal" | "comfortable";
  icon?: string;

  // List view
  listColumnWidth?: number | "auto";
  listColumnAlignment?: "left" | "center" | "right";
};
```

**Resolved into typed sub-groups** (`ResolvedFieldUiMeta`):

| Sub-group | Type | Contents |
|---|---|---|
| `renderer` | `UiRendererConfig` | type, viewType, editType, props |
| `form` | `UiFormConfig` | placeholder, helpText, hidden, disabled |
| `layout` | `UiLayoutConfig` | section, group, layout, density, icon |
| `list` | `UiListConfig` | columnWidth, columnAlignment |

Components should consume `ResolvedFieldUiMeta`, never raw `FieldUiHint`.

### Context-Aware Visibility & Editability

Per-context control over field visibility and editability:

```typescript
type FieldVisibilityValue = "visible" | "hidden" | "internal";
type FieldVisibility = {
  create?: FieldVisibilityValue;
  view?: FieldVisibilityValue;
  edit?: FieldVisibilityValue;
};

type FieldEditabilityValue = "editable" | "read_only" | "system_managed" | "computed";
type FieldEditability = {
  create?: FieldEditabilityValue;
  edit?: FieldEditabilityValue;
};
```

**Overlay modes:**
- `replace`: Full override of the visibility/editability value
- `extend`: Can only *restrict* (increase restrictiveness), never relax

**Restrictiveness rankings** (overlay `extend` mode enforces these):
- Visibility: `visible` < `hidden` < `internal`
- Editability: `editable` < `read_only` < `system_managed` < `computed`

### Mutability Precedence Chain (Layer Model)

The 8-layer precedence chain determines field editability at runtime. Higher layers override lower:

| Layer | Source | Effect |
|---|---|---|
| 1 | `is_computed=true` | Always read-only (hardcoded) |
| 2 | `is_read_only=true` | Read-only all contexts (domain flag) |
| 3 | `origin="system"` | Read-only in business forms (domain rule) |
| 4 | `write_once=true` | Editable only on create (domain flag) |
| 5 | `editability{ctx}` + overlay | Per-context control (replaceable by overlay) |
| 6 | Convention columns | lifecycle_managed, derived_hierarchy, PK |
| 7 | `is_deprecated=true` | Read-only (safety) |
| 8 | `ui_hint.readOnly/lockOnEdit` | Advisory only (never overrides above) |

### Structured Configuration Types

#### EnumConfig

```typescript
type EnumConfig = {
  values: Array<{
    value: string;
    label?: string;
    description?: string;
    color?: string;
    icon?: string;
    sortOrder?: number;
    group?: string;          // For large enum sets
  }>;
  source?: "static" | "dynamic";
  dynamicRef?: string;       // Entity reference when source=dynamic
  i18nKey?: string;          // Localization key prefix
};
```

#### ReferenceConfig

```typescript
type ReferenceConfig = {
  // Structural (authoritative)
  entity: string;                    // Target entity name
  relationshipKind?: "many-to-one" | "one-to-one" | "one-to-many" | "many-to-many";
  joinEntity?: string;               // Junction entity for M:N
  joinLeftKey?: string;              // FK to this entity in junction
  joinRightKey?: string;             // FK to target entity in junction
  valueField?: string;               // Target key field (default "id")
  hydrateStrategy?: "byIds" | "embedded";
  allowCreateInline?: boolean;
};
```

#### MoneyConfig

```typescript
type MoneyConfig = {
  currencyField?: string;            // Field holding currency code
  defaultCurrency?: string;          // Default currency if none specified
  roundingMode?: "half_up" | "half_even" | "floor" | "ceil";
  displayPrecision?: number;         // Decimal places for display
};
```

#### DatetimeConfig

```typescript
type DatetimeConfig = {
  timezone?: string;                 // Default timezone
  storeAsUtc?: boolean;              // Store as UTC, display in local
  includeTime?: boolean;             // Date-only vs datetime
};
```

#### JsonFieldConfig

```typescript
type JsonFieldConfig = {
  mode?: "freeform" | "structured";  // Validation mode
  schema?: Record<string, unknown>;  // JSON Schema when structured
};
```

### Computed Fields

```typescript
type ComputeMode = "virtual" | "materialized";

type ComputeExpression = {
  kind: "formula" | "aggregate" | "system";
  // Formula: "{{subtotal}} * {{tax_rate}}"
  formula?: string;
  // Aggregate: SUM, COUNT, AVG over child collection
  aggregateFunction?: string;
  aggregateField?: string;
  aggregateFilter?: Record<string, unknown>;
  // System: built-in functions
  systemFunction?: SystemComputeFunction;
  // Recomputation policy
  recomputeTrigger?: RecomputeTrigger;
  stalePolicy?: StalePolicy;
};

type SystemComputeFunction =
  | "now"
  | "current_user"
  | "current_tenant"
  | "row_version"
  | "gen_random_uuid";

type RecomputeTrigger = "on_dependency_change" | "on_save" | "scheduled";
type StalePolicy = "serve_stale" | "null_until_recomputed" | "recompute_sync";
```

**Formula expressions** follow the pattern `{{field_name}}` for field references. Validated by `FORMULA_EXPR_PATTERN` and dependencies extracted via `extractFormulaFieldRefs()`.

### Collection Behavior

```typescript
type CollectionBehavior = {
  ownership: CollectionOwnership;
  persistenceMode?: CollectionPersistenceMode;
  deleteMode?: CollectionDeleteMode;
  aggregateStrategy?: CollectionAggregateStrategy;
  rowValidation?: CollectionRowValidation;
  orderBy?: string;
  editorStyle?: "inline_table" | "modal" | "accordion" | "tabs";
  maxRows?: number;
};

type CollectionOwnership = "owned" | "linked";
type CollectionPersistenceMode = "inline" | "reference_only";
type CollectionDeleteMode = "cascade" | "restrict" | "detach";
type CollectionAggregateStrategy = "live" | "on_save" | "manual";
type CollectionRowValidation = "on_change" | "on_save" | "on_submit";
```

---

## Service Contracts

All META Engine services are defined as pure TypeScript interfaces in `@athyper/core/meta`. Implementations are wired via DI tokens (`META_TOKENS`).

### MetaRegistry

Entity and version CRUD operations.

```typescript
interface MetaRegistry {
  // Entity management
  createEntity(name, description, ctx, options?): Promise<Entity>;
  getEntity(name): Promise<Entity | undefined>;
  getEntityByCode(entityCode: string): Promise<Entity | undefined>;
  resolveEntity(ref: EntityIdentityRef): Promise<Entity | undefined>;
  listEntities(options?): Promise<PaginatedResponse<Entity>>;
  updateEntity(name, updates, ctx): Promise<Entity>;
  deleteEntity(name, ctx): Promise<void>;

  // Version management
  createVersion(entityName, version, schema, ctx): Promise<EntityVersion>;
  getVersion(entityName, version): Promise<EntityVersion | undefined>;
  getActiveVersion(entityName): Promise<EntityVersion | undefined>;
  listVersions(entityName, options?): Promise<PaginatedResponse<EntityVersion>>;
  activateVersion(entityName, version, ctx): Promise<EntityVersion>;
  deactivateVersion(entityName, version, ctx): Promise<EntityVersion>;
  updateVersion(entityName, version, schema, ctx): Promise<EntityVersion>;
  deleteVersion(entityName, version, ctx): Promise<void>;
}
```

**Entity resolution:** `getEntityByCode()` resolves by immutable `entity_code`. `resolveEntity()` accepts an `EntityIdentityRef` and tries `entityCode` → `entityId` → `entityName` in priority order. See [Identity Model](#canonical-runtime-identity-entity_code) for resolution semantics.

### MetaCompiler

Schema compilation with caching and validation. The `entityVersion` parameter is the **entity schema version label** (e.g., `"v1"`), not a compiler version. When omitted, the compiler resolves the effective version from `entity.activeVersion` via the registry. See [Compilation Pipeline → Version Parameter Semantics](#version-parameter-semantics).

```typescript
interface MetaCompiler {
  compile(entity: EntityNameOrCode, entityVersion?: string): Promise<CompiledModel>;
  recompile(entity: EntityNameOrCode, entityVersion?: string): Promise<CompiledModel>;
  validate(schema: EntitySchema): Promise<ValidationResult>;
  invalidateCache(entity: EntityNameOrCode, entityVersion?: string): Promise<void>;
  getCached(entity: EntityNameOrCode, entityVersion?: string): Promise<CompiledModel | undefined>;
  precompileAll(): Promise<CompiledModel[]>;
  healthCheck(): Promise<HealthCheckResult>;
}
```

**Caching**: Redis-backed with configurable TTL (default 1 hour). Cache key pattern: `meta:compiled:{entity}:{entityVersion}`. Persistent backup in `meta.entity_compiled`.

### PolicyGate

Policy evaluation and authorization.

```typescript
interface PolicyGate {
  // Legacy
  can(action, resource, ctx): Promise<boolean>;

  // Explainable decision
  authorize(action, resource, ctx, record?): Promise<PolicyDecision>;

  // Throws on deny
  enforce(action, resource, ctx, record?): Promise<void>;

  // Policy queries
  getPolicies(resource): Promise<PolicyDefinition[]>;
  evaluatePolicy(policy, ctx, record?): Promise<boolean>;

  // Field-level security
  getAllowedFields(action, resource, ctx): Promise<string[]>;

  // Batch authorization
  authorizeMany(requests: Array<{action, resource, record?}>, ctx): Promise<PolicyDecision[]>;

  // Cache management
  invalidatePolicyCache(resource): Promise<void>;
}
```

**Decision logging**: Every `authorize()` call logs to `audit.permission_decision_log` for compliance audit.

### AuditLogger

```typescript
interface AuditLogger {
  log(event: AuditEvent): Promise<void>;
  query(filters: AuditQueryFilters): Promise<PaginatedResponse<AuditEvent>>;
  getEvent(eventId): Promise<AuditEvent | undefined>;
  getRecent(limit?): Promise<AuditEvent[]>;
  getResourceAudit(resourceType, resourceId): Promise<AuditEvent[]>;
  getUserAudit(userId): Promise<AuditEvent[]>;
  getTenantAudit(tenantId): Promise<AuditEvent[]>;
}
```

### GenericDataAPI

Generic CRUD operations for all META-defined entities. All methods accept `entity_code` (preferred) or entity name via the `EntityNameOrCode` type.

```typescript
interface GenericDataAPI {
  // CRUD
  list(entity: EntityNameOrCode, ctx, options?): Promise<PaginatedResponse<T>>;
  get(entity: EntityNameOrCode, id, ctx): Promise<T | undefined>;
  count(entity: EntityNameOrCode, ctx, filters?): Promise<number>;
  create(entity: EntityNameOrCode, data, ctx): Promise<T>;
  update(entity: EntityNameOrCode, id, data, ctx): Promise<T>;
  delete(entity: EntityNameOrCode, id, ctx): Promise<void>;

  // Soft delete
  restore(entity: EntityNameOrCode, id, ctx): Promise<void>;
  permanentDelete(entity: EntityNameOrCode, id, ctx): Promise<void>;

  // Bulk operations
  bulkCreate(entity: EntityNameOrCode, data, ctx): Promise<BulkOperationResult>;
  bulkUpdate(entity: EntityNameOrCode, updates: Array<{id, data}>, ctx): Promise<BulkOperationResult>;
  bulkDelete(entity: EntityNameOrCode, ids, ctx): Promise<BulkOperationResult>;
}
```

**Features:**
- Automatic tenant isolation
- Policy enforcement via PolicyGate
- Field-level security filtering
- Soft delete/restore support
- Optimistic locking via `_version` field
- Auto lifecycle instance creation (for lifecycle-managed entities)
- Auto document numbering (for DOCUMENT entities with numbering_enabled)

### MetaStore

High-level service combining Registry + Compiler:

```typescript
interface MetaStore {
  getCompiledModel(entityName): Promise<CompiledModel>;
  getEntityWithCompiledModel(entityName): Promise<{entity, compiledModel}>;
  createEntityWithVersion(name, schema, ctx): Promise<{entity, version}>;
  publishVersion(entityName, version, ctx): Promise<void>;
  getSchema(entityName): Promise<EntitySchema>;
}
```

### LifecycleManager

State machine management for entity records.

```typescript
interface LifecycleManager {
  // Instance management
  createInstance(entityName, entityId, ctx): Promise<EntityLifecycleInstance>;
  getInstance(entityName, entityId, tenantId): Promise<EntityLifecycleInstance | undefined>;
  getInstanceOrFail(entityName, entityId, tenantId): Promise<EntityLifecycleInstance>;

  // Transitions
  transition(request: LifecycleTransitionRequest): Promise<LifecycleTransitionResult>;
  canTransition(entityName, entityId, operationCode, ctx): Promise<boolean>;
  getAvailableTransitions(entityName, entityId, ctx): Promise<AvailableTransition[]>;

  // Gate validation
  validateGates(transitionId, ctx, payload?, entityContext?): Promise<GateDecision>;
  requiresApproval(transitionId, tenantId): Promise<boolean>;

  // State queries
  getCurrentState(entityName, entityId, tenantId): Promise<LifecycleState>;
  isTerminalState(stateId, tenantId): Promise<boolean>;
  enforceTerminalState(entityName, entityId, tenantId): Promise<void>;

  // History
  getHistory(entityName, entityId, tenantId, options?): Promise<PaginatedResponse<EntityLifecycleEvent>>;

  // Cache invalidation
  invalidateLifecycle(lifecycleId, tenantId): Promise<void>;
}
```

### LifecycleTimerService

Auto-transitions and reminders via scheduled jobs.

```typescript
interface LifecycleTimerService {
  scheduleTimer(schedule: LifecycleTimerSchedule): Promise<string>;
  cancelTimers(entityName, entityId, tenantId): Promise<void>;
  cancelTimersByType(entityName, entityId, timerType, tenantId): Promise<void>;
  processTimer(jobData): Promise<void>;
  processReminder(jobData): Promise<void>;
  rehydrateTimers(tenantId): Promise<void>;
  getActiveTimers(entityName, entityId, tenantId): Promise<LifecycleTimerSchedule[]>;
}
```

**Timer types:** `auto_close`, `auto_cancel`, `reminder`, `auto_transition`

**Delay calculation modes:**
- Absolute: fire at a specific datetime
- Field-relative: e.g., "30 days from approval_date"

**Guard checks on timer execution:**
- Entity still exists
- Timer hasn't already fired
- Entity is still in expected state
- Conditions still met

### ApprovalService

Multi-stage approval workflows.

```typescript
interface ApprovalService {
  // Instance management
  createApprovalInstance(request: ApprovalCreationRequest): Promise<ApprovalCreationResult>;
  getInstance(instanceId): Promise<ApprovalInstance>;
  getInstanceForEntity(entityName, entityId, tenantId): Promise<ApprovalInstance | undefined>;

  // Task management
  getTask(taskId): Promise<ApprovalTask>;
  getTasksForInstance(instanceId): Promise<ApprovalTask[]>;
  getTasksForUser(userId, tenantId): Promise<ApprovalTask[]>;
  getAssignmentSnapshot(instanceId): Promise<ApprovalAssignmentSnapshot>;

  // Decision processing
  makeDecision(request: ApprovalDecisionRequest): Promise<ApprovalDecisionResult>;
  isInstanceComplete(instanceId): Promise<boolean>;
  isStageComplete(stageId): Promise<boolean>;

  // Timer management
  scheduleReminder(instanceId, delay): Promise<void>;
  scheduleEscalation(instanceId, delay): Promise<void>;
  processReminder(jobData): Promise<void>;
  processEscalation(jobData): Promise<void>;
  cancelTimers(instanceId): Promise<void>;

  // Audit
  getEvents(instanceId): Promise<ApprovalEvent[]>;
  getEscalations(instanceId): Promise<ApprovalEscalation[]>;
}
```

### VersionedDocumentService

Governed version lifecycle management.

```typescript
interface VersionedDocumentService {
  reviseVersion(request: ReviseVersionRequest): Promise<ReviseVersionResult>;
  freezeVersion(versionId, reason, ctx): Promise<void>;
  markApproved(versionId, ctx): Promise<void>;
  promoteToEffective(versionId, ctx, effectiveFrom?): Promise<PromoteVersionResult>;
  archivePreviousEffective(entityId, newEffectiveVersionId, ctx): Promise<string | undefined>;
  updateVersionStatus(versionId, targetStatus, ctx): Promise<void>;
  isFrozen(versionId, tenantId): Promise<boolean>;
  getEffectiveVersion(entityId, tenantId): Promise<EntityVersion | undefined>;
  getCurrentDraft(entityId, tenantId): Promise<EntityVersion | undefined>;
  computeVersionHash(versionId, tenantId): Promise<string>;
}
```

### EntityClassificationService

Entity classification, feature flags, and capability derivation.

```typescript
interface EntityClassificationService {
  resolveClass(entityName, tenantId): Promise<EntityClass | undefined>;
  resolveFeatureFlags(entityName, tenantId): Promise<EntityFeatureFlags>;
  getClassification(entityName, tenantId): Promise<{
    entityClass: EntityClass | undefined;
    featureFlags: EntityFeatureFlags;
  }>;
  getFeatureCapabilities(entityName, tenantId): Promise<EntityFeatureCapabilities | null>;
  getFeatureCapabilitiesWithDiagnostics(entityName, tenantId): Promise<{
    capabilities: EntityFeatureCapabilities;
    diagnostics: CapabilityOverrideDiagnostic[];
  } | null>;
}
```

**`getFeatureCapabilitiesWithDiagnostics()`** returns both the derived capabilities and any guardrail violation diagnostics (forbidden overrides, invalid class×governance combos). Use in Schema Manager publish validation to surface warnings/errors before commit.

### NumberingEngine

Sequential document numbering.

```typescript
interface NumberingEngine {
  generate(entityName, ctx): Promise<string>;
  getSequence(entityName, tenantId): Promise<NumberingSequence>;
  resetSequence(entityName, tenantId): Promise<void>;
}
```

### DdlGenerator

DDL generation from compiled models.

```typescript
interface DdlGenerator {
  generate(compiledModel, options?: DdlGenerationOptions): Promise<DdlGenerationResult>;
}

type DdlGenerationOptions = {
  schemaName?: string;
  ifNotExists?: boolean;
  includeIndexes?: boolean;
  includeComments?: boolean;
};
```

### EntityPageDescriptorService

Entity page layout orchestration.

```typescript
interface EntityPageDescriptorService {
  getStaticDescriptor(entityName, viewMode, ctx): Promise<EntityPageStaticDescriptor>;
  getDynamicDescriptor(entityName, recordId, viewMode, ctx): Promise<EntityPageDynamicDescriptor>;
}
```

### MetaEventBus

Cross-cutting domain event publishing.

```typescript
interface MetaEventBus {
  emit(event: MetaEvent): void;
  on(eventType: MetaEventType, handler: MetaEventHandler): void;
  off(eventType: MetaEventType, handler: MetaEventHandler): void;
}
```

**Event types:** `lifecycle.definition_changed`, `version_published`, `schema_changed`, `cache_invalidated`, etc.

---

## Compilation Pipeline

### Overview

The compilation pipeline transforms raw entity schemas (fields, relations, indexes, policies) into optimized runtime structures.

```
EntitySchema (raw definition)
  ↓ validate()
ValidationResult
  ↓ compile(entity, entityVersion)
CompiledModel (runtime IR)
  ↓ cache (Redis, TTL=1hr)
  ↓ persist to meta.entity_compiled
CompiledSnapshot (persistent, hash-verified)
```

### Version Parameter Semantics

**IMPORTANT:** The `entityVersion` parameter in `MetaCompiler.compile()` is the **entity schema version label** (e.g., `"v1"`, `"v2"`), corresponding to `meta.entity_version.label` or the version string passed to `MetaRegistry.createVersion()`. It is NOT a compiler version.

| Parameter | Meaning | Example |
|---|---|---|
| `entity` | Entity code (preferred) or entity name | `"chart_of_accounts"`, `"ChartOfAccounts"` |
| `entityVersion` | Entity schema version label | `"v1"`, `"v2"` |

**Cache key pattern:** `meta:compiled:{entity}:{entityVersion}` — e.g., `meta:compiled:ChartOfAccounts:v1`

**Version resolution:** When `entityVersion` is omitted, the compiler resolves it from `entity.activeVersion` via the registry. This applies to all callers — `MetaStore`, `PolicyGate`, `GenericDataAPI`, `ValidationEngine`, and `EntityPageDescriptor` all omit the version parameter and rely on automatic resolution. Falls back to `"v1"` if the entity has no `activeVersion` (backward compatibility).

### Persistence

Compiled output is stored in two locations:

| Location | Purpose | TTL |
|---|---|---|
| Redis cache | Hot runtime reads | 1 hour (configurable) |
| `meta.entity_compiled` table | Persistent backup, cache warming, hash comparison | Permanent |
| `meta.entity_compiled_overlay` table | With overlays applied | Permanent |

On server startup, `precompileAll()` reads from `meta.entity_compiled` to warm the Redis cache.

### CompiledField

Optimized field definition for runtime use:

```typescript
type CompiledField = {
  name: string;              // camelCase API name
  columnName: string;        // snake_case DB column
  type: FieldType;
  required: boolean;
  selectAs: string;          // SQL fragment: "column_name as fieldName"
  validator?: (value) => boolean;
  transformer?: (dbValue) => unknown;
  indexed?: boolean;
  unique?: boolean;
  // All constraint/reference/enum/money/datetime configs resolved
};
```

### CompiledModel

Full entity runtime representation:

```typescript
type CompiledModel = {
  entityName: string;
  version: string;
  tableName: string;
  fields: CompiledField[];
  policies: CompiledPolicy[];
  // Pre-built SQL fragments
  selectFragment: string;
  fromFragment: string;
  tenantFilterFragment: string;
  indexes: string[];
  compiledAt: Date;
  compiledHash: string;
};
```

### CompiledSnapshot

Persistent, hash-verified snapshot for storage:

```typescript
type CompiledSnapshot = {
  entityName: string;
  version: string;
  tableName: string;
  tableSchema: string;
  resolvedFields: ResolvedFieldMeta[];    // All defaults filled, overlays applied
  compiledFields: CompiledField[];         // SQL-optimized
  policies: CompiledPolicy[];
  queryFragments: { selectFragment, fromFragment, tenantFilterFragment };
  entityClass?: EntityClass;
  compiledAt: Date;
  compiledHash: string;
};
```

### Cache Strategy

- **Storage**: Redis (CompilerCacheService)
- **TTL**: 1 hour (configurable)
- **Key pattern**: `meta:compiled:{entityName}:{version}`
- **Invalidation**: On schema changes via MetaEventBus
- **Staleness detection**: Hash-based comparison (`last_compiled_hash` vs computed hash)
- **Warm-up**: `precompileAll()` on server start

---

## Policy & Access Control

### Policy Model

Policies define access control rules for entities:

```typescript
type PolicyDefinition = {
  name: string;               // Unique within entity
  effect: "allow" | "deny";
  action: "create" | "read" | "update" | "delete" | "*";
  resource: string;           // Entity name
  conditions?: PolicyCondition[];   // AND logic
  fields?: string[];          // Field-level scope (["*"] = all)
  description?: string;
  priority?: number;          // Higher = evaluated first
};

type PolicyCondition = {
  field: string;              // "user.role", "record.userId"
  operator: PolicyOperator;   // eq, ne, in, gt, contains, etc.
  value: unknown;
};
```

### Policy Operators

| Operator | Description |
|---|---|
| `eq` | Equal |
| `ne` | Not equal |
| `in` | In array |
| `not_in` | Not in array |
| `gt` / `gte` | Greater than (or equal) |
| `lt` / `lte` | Less than (or equal) |
| `contains` | String contains |
| `starts_with` | String starts with |
| `ends_with` | String ends with |

### Phase 11: Indexed Policy Engine

Enhanced policy system with indexed structures for fast evaluation:

```typescript
type PolicyRuleDefinition = {
  scopeType: PolicyRuleScopeType;      // "global" | "entity" | "field"
  subjectType: PolicyRuleSubjectType;  // "role" | "user" | "group" | "ou"
  conditions: PolicyConditionDefinition[];
  conditionType: PolicyConditionType;  // "all" | "any"
};

type PolicyDecision = {
  allowed: boolean;
  effect: PolicyEffect;
  matchedRule?: string;
  reason?: string;
  evaluatedPolicies: number;
  evaluationTime: number;
};
```

### Authorization Flow

1. **PolicyGate.authorize()** receives action, resource, context, optional record
2. Loads compiled policies for the entity (cached)
3. Evaluates conditions against request context and record data
4. Returns `PolicyDecision` with explainable reason
5. Logs decision to `audit.permission_decision_log`

---

## Lifecycle Management

### Lifecycle Definition

A lifecycle is a state machine with states, transitions, gates, and hooks.

```
┌──────────┐  SUBMIT   ┌─────────────┐  APPROVE  ┌──────────┐
│  DRAFT   │──────────>│ PENDING_     │─────────>│ APPROVED │
│          │           │ APPROVAL     │          │          │
└──────────┘           └──────┬───────┘          └────┬─────┘
                              │                       │
                              │ REJECT                │ POST
                              ▼                       ▼
                       ┌──────────┐            ┌──────────┐
                       │ REJECTED │            │  POSTED  │ (terminal)
                       └──────────┘            └──────────┘
```

### State Definition

```typescript
type LifecycleState = {
  id: string;
  tenantId: string;
  lifecycleId: string;
  code: string;          // e.g. "DRAFT", "PENDING_APPROVAL"
  name: string;          // Human label
  isTerminal: boolean;   // No outbound transitions
  sortOrder: number;
};
```

### Transition Definition

```typescript
type LifecycleTransition = {
  id: string;
  tenantId: string;
  lifecycleId: string;
  fromStateId: string;
  toStateId: string;
  operationCode: string;  // e.g. "SUBMIT", "APPROVE", "REJECT"
  isActive: boolean;
};
```

### Transition Gates

Pre-conditions that must be satisfied before a transition executes:

```typescript
type LifecycleTransitionGate = {
  id: string;
  tenantId: string;
  transitionId: string;
  requiredOperations?: Record<string, unknown>;  // Policy checks
  approvalTemplateId?: string;                   // Approval requirement
  conditions?: ConditionGroup;                   // Dynamic conditions
  thresholdRules?: ThresholdRule[];             // Numeric thresholds
};
```

### Transition Hooks

Configurable post-transition actions:

| Hook Action | Description |
|---|---|
| `freeze_version` | Mark version as immutable (`is_working_copy = false`) |
| `mark_version_approved` | Set `approved_at`/`approved_by` on version |
| `promote_to_effective` | Mark version as effective, supersede previous |
| `archive_previous_effective` | Supersede old effective version |
| `spawn_next_draft` | Clone approved version → new draft |
| `update_version_status` | Set `version.status` to `config.target_status` |
| `emit_event` | Emit a MetaEvent |
| `notify` | Trigger notification |
| `cancel_approval` | Cancel pending approval instance |
| `schedule_activation` | Schedule future effective date |

**Hook timing:**

| Timing | When |
|---|---|
| `on_enter` | When entering the target state |
| `on_exit` | When leaving the source state |
| `on_success` | After successful transition (default) |
| `on_failure` | If transition is blocked by gate |

### Lifecycle Route Resolution

Multiple lifecycles can be defined. The system resolves which lifecycle applies based on entity binding rules:

1. `meta.entity_lifecycle` table maps entity names → lifecycle IDs with conditions and priority
2. `LifecycleRouteCompiler` compiles these into indexed lookup structures
3. Route resolution evaluates conditions against the request context
4. Compiled routes are cached with hash-based staleness detection

### Transition Execution Flow

```
1. Get current lifecycle instance
2. Check: current state is NOT terminal
3. Find transition: (current_state, operation_code)
4. Validate gates:
   a. Policy gate: check requiredOperations via PolicyGate
   b. Approval gate: check approvalTemplateId → ApprovalService
   c. Condition gate: evaluate dynamic conditions
   d. Threshold gate: check numeric thresholds
5. If gates pass:
   a. Update instance state_id to target state
   b. Log lifecycle event (from_state → to_state)
   c. Execute hooks (sorted by sort_order)
   d. Schedule timers (if configured for target state)
   e. Emit domain events
6. Return LifecycleTransitionResult
```

### Lifecycle Cache Invalidation

When lifecycle definitions change (states, transitions, hooks):

1. Local definition hash cache cleared
2. SHA-256 hash recomputed from current DB state
3. Hash stored in `meta.lifecycle.definition_hash`
4. Route compiler cache invalidated for all bound entities
5. Domain event emitted: `lifecycle.definition_changed`

DB triggers automatically set `definition_hash = NULL` on `meta.lifecycle` when child tables change:
- `trg_lifecycle_state_changed` on `meta.lifecycle_state`
- `trg_lifecycle_transition_changed` on `meta.lifecycle_transition`
- `trg_lifecycle_hook_changed` on `meta.lifecycle_transition_hook`

---

## Governed Versioning

### Overview

Governed versioning provides enterprise-grade version control for entity schemas. It replaces the simple `draft → published → archived` flow with a full governance pipeline. The canonical active status is now `effective` — `published` is retained only for backward compatibility and new inserts with `status='published'` are blocked by trigger (`meta.trg_forbid_published_status`).

### Versioning Policy

Stored in `meta.entity.feature_flags.versioning_policy`:

```typescript
type VersioningPolicy = {
  mode: "none" | "simple" | "governed";
  editAfterApproval?: "clone_new_draft" | "reopen_as_draft";
  maxConcurrentDrafts?: number;   // default 1
  requireChangeType?: boolean;
  requireChangeSummary?: boolean;
  minChangeSummaryLength?: number; // default 20
};
```

**Defaults** (`DEFAULT_VERSIONING_POLICY`):
```typescript
{
  mode: "simple",
  editAfterApproval: "clone_new_draft",
  maxConcurrentDrafts: 1,
}
```

### Version Lifecycle (Governed)

```
                        ┌────────────┐
                        │   DRAFT    │◄── reviseVersion()
                        │ (editable) │
                        └─────┬──────┘
                              │ SUBMIT
                              ▼
                        ┌────────────┐
                   ┌───>│  IN_REVIEW │
                   │    │  (frozen)  │
                   │    └─────┬──────┘
                   │          │
              WITHDRAWN   ┌───┴───┐
                   │      │       │
                   │  APPROVE   REJECT
                   │      │       │
                   │      ▼       ▼
                   │ ┌─────────┐ ┌──────────┐
                   │ │APPROVED │ │ REJECTED │
                   │ └────┬────┘ └──────────┘
                   │      │
                   │      │ ACTIVATE
                   │      ▼
                   │ ┌──────────┐
                   │ │EFFECTIVE │──── (live version)
                   │ └────┬─────┘
                   │      │ (new version promoted)
                   │      ▼
                   │ ┌───────────┐
                   └─│SUPERSEDED│
                     └───────────┘
                          │
                          ▼
                     ┌──────────┐
                     │ ARCHIVED │
                     └──────────┘
```

### Version Change Types

| Type | Description | Impact |
|---|---|---|
| `minor` | Cosmetic, label changes | Non-breaking |
| `major` | New fields, changed relations | Migration required |
| `breaking` | Removed fields, type changes | Breaking change |
| `editorial` | Documentation/description only | Non-breaking |

### ReviseVersion Flow

The `reviseVersion()` operation creates a new draft from an existing approved/effective version:

1. **Load source version** — must be in `approved`, `effective`, or `published` (legacy) status
2. **Enforce revision reason** — for governed entities: `changeType` required, `changeSummary` required (min 20 chars)
3. **Check draft slot** — no existing `draft` or `in_review` version allowed (enforced by DB unique partial index)
4. **Get next version number** — monotonically increasing from `entity_publish_state.latest_version_no`
5. **Create new draft** — with `derived_from_version_id` pointing to source (lineage)
6. **Clone fields** — deep copy of all field definitions with new IDs
7. **Clone relations** — deep copy of all relation definitions
8. **Clone indexes** — deep copy of all index definitions
9. **Update publish state** — set `current_draft_version_id`, increment `latest_version_no`

### PromoteToEffective Flow

1. **Load version** to promote
2. **Archive previous effective** — set `is_effective=false`, `status='superseded'`, `effective_to=now()`
3. **Promote version** — set `is_effective=true`, `effective_from`, `supersedes_version_id`
4. **Update publish state** — set `published_version_id`, clear `current_draft_version_id`

### Version Content Hash

SHA-256 hash computed from fields + relations + indexes + behaviors (volatile fields like id, timestamps stripped). Used for:
- Change detection
- Quick equality comparison
- Cache validation

Stored in `meta.entity_version.version_hash`. Computed by `VersionedDocumentServiceImpl.computeVersionHash()`.

### Invariant Enforcement

| Invariant | Mechanism |
|---|---|
| One effective version per entity | Unique partial index: `idx_ev_one_effective_per_entity` |
| One active draft per entity | Unique partial index: `idx_ev_one_active_draft_per_entity` |
| Revision reasons for governed entities | DB CHECK `chk_ev_revision_reason` + service-layer validation |
| Change type values | DB CHECK `chk_ev_change_type` (minor/major/breaking/editorial) |

---

## Overlay System

### Overview

Overlays allow extending base entity schemas without modifying the original definition. They support deterministic composition for multi-tenant customization.

#### Overlay Scope & Precedence

Overlays are scoped to a source layer. When multiple overlays apply to the same entity, they compose in strict precedence order:

| Scope | Precedence | Description |
|---|:---:|---|
| `system` | 0 (lowest) | Platform-provided defaults |
| `package` | 1 | Module/package customization |
| `tenant` | 2 (highest) | Tenant-specific overrides — always wins |

Higher precedence wins for `replace` merge strategy; for `narrowable` properties, the most restrictive value wins regardless of scope.

```typescript
type OverlayScope = "system" | "package" | "tenant";
const OVERLAY_PRECEDENCE: ReadonlyMap<OverlayScope, number>; // exported from @athyper/core/meta
```

### Overlay Definition

```typescript
type Overlay = {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  status: "draft" | "published" | "archived";
  changes?: OverlayChange[];
  createdAt: Date;
};

type OverlayChange = {
  kind: OverlayChangeKind;      // "add_field" | "modify_field" | "add_relation" | etc.
  target: string;               // field name or relation name
  value: unknown;               // the change payload
};

type OverlayConflictMode = "last_wins" | "first_wins" | "manual";
```

### Overlay Safety Policy

Three safety levels control what overlay operations can do:

| Level | Properties | Description |
|---|---|---|
| **Replaceable** | label, description, placeholder, helpText, section, group, layout, density, icon, listColumnWidth, listColumnAlignment | UX concerns — overlays can freely change |
| **Narrowable** | visibility, editability, isFilterable, isSearchable, isSortable, isGroupable, isAggregatable | Can only restrict (increase restrictiveness), never relax |
| **Immutable** | dataType, cardinality, columnName, origin, isComputed, isReadOnly, writeOnce, computeMode, referenceConfig, constraints, moneyConfig, datetimeConfig, enumConfig, collectionBehavior | Domain/security truth — overlays cannot change |

Defined in `FIELD_OVERLAY_SAFETY` constant.

### Merge Semantics

When multiple layers contribute values, merge strategies determine the result:

| Strategy | Behavior | Used For |
|---|---|---|
| `replace` | Higher layer wins outright | Scalars, labels |
| `union` | Arrays concatenated, deduplicated by key | searchFields |
| `deep_merge` | Objects merged, higher layer keys win | filters, filtersByContext |
| `fill` | Lower layer kept, higher layer fills gaps | Fallback hints |

Formal merge rules defined in: `LOOKUP_PROFILE_MERGE`, `IDENTITY_CONFIG_MERGE`, `UI_HINT_MERGE`.

---

## Validation Engine

### Validation Rules

Dynamic rule engine supporting phase-based validation:

```typescript
type ValidationPhase = "on_load" | "on_change" | "on_save" | "on_submit";
type ValidationTrigger = "field_change" | "form_submit" | "api_call" | "lifecycle_transition";
type ValidationRuleSeverity = "error" | "warning" | "info";

type ValidationRuleKind =
  | "required" | "min_max" | "length" | "regex" | "enum_constraint"
  | "cross_field" | "conditional" | "date_range"
  | "referential_integrity" | "unique";
```

### Rule Types

| Kind | Description | Example |
|---|---|---|
| `required` | Field must have a value | Name is required |
| `min_max` | Numeric range check | Amount between 0 and 1,000,000 |
| `length` | String length check | Code 2-20 characters |
| `regex` | Pattern match | Email format |
| `enum_constraint` | Value in allowed set | Status in [DRAFT, ACTIVE] |
| `cross_field` | Multi-field validation | end_date > start_date |
| `conditional` | Rule applies when condition met | If type=INTERNATIONAL then iban required |
| `date_range` | Date range validation | Not before 2020-01-01 |
| `referential_integrity` | FK exists | customer_id references active customer |
| `unique` | Uniqueness check | Code unique per tenant |

### Change Impact Classification

When fields change between versions, impacts are classified:

| Impact | Properties | Description |
|---|---|---|
| `non_breaking` | label, description, ui, placeholder, helpText, visibility, editability, isSortable, isGroupable, isAggregatable, lookupProfile, sortOrder | Safe to deploy without migration |
| `migration_required` | isSearchable, isFilterable, isReadOnly, writeOnce, defaultValue, constraints, isDeprecated | Requires data migration or index rebuild |
| `breaking` | dataType, cardinality, columnName, referenceConfig, computeMode, computeExpr, collectionBehavior, childEntityName, childFkField, moneyConfig, datetimeConfig, enumConfig | Breaking change, may cause data loss |
| `publish_blocking` | New required field without default, removed field from published version | Cannot publish without resolution |

**Publish-blocking rules** (`PUBLISH_BLOCKING_RULES`): New required field without a default value blocks publication.

### Version Diff Engine

Exports from `@athyper/core/meta`:
- `diffField(previous, current)` — compares two field snapshots
- `computeEntityVersionDiff(fromVersion, toVersion)` — full version diff
- `checkEnumStability(previousValues, currentValues)` — enum value safety check

```typescript
type FieldVersionDiff = {
  fieldName: string;
  property: string;
  previousValue: unknown;
  newValue: unknown;
  impact: ChangeImpact;
  reason: string;
};

type EntityVersionDiff = {
  entityName: string;
  fromVersion: string;
  toVersion: string;
  changes: FieldVersionDiff[];
  maxImpact: ChangeImpact;
  summary: string;
};
```

---

## Lookup System

### Architecture

The lookup system has three layers with clear ownership boundaries:

| Layer | Type | Owns | Stored In |
|---|---|---|---|
| **IdentityConfig** | Entity-level | Self-description: "I am Supplier, my code is 'code', my name is 'name'" | *Planned — not yet implemented. Will be a separate JSONB column on `meta.entity`.* |
| **LookupProfile** | Field-level | Search UX: "When picking Supplier, search code first (weight 10)" | `meta.field.lookup_profile` |
| **ReferenceConfig** | Field-level | Structural: "This FK joins to Supplier via supplier_id" | `meta.field.referenceConfig` |

### IdentityConfig

Entity-level self-description for lookup targets:

```typescript
type IdentityConfig = {
  primaryLabelField: string;       // "name"
  primaryCodeField?: string;       // "code", "supplier_code"
  alternateKeys?: string[];        // ["tax_id", "duns_number"]
  searchAliases?: string[];        // ["vendor", "provider"]
  displayTemplate?: string;        // "{{code}} — {{name}}"
};
```

### LookupProfile

Per-field search UX configuration:

```typescript
type LookupProfile = {
  displayTemplate?: string;        // "{{code}} — {{name}}"
  searchFields?: LookupSearchField[];
  matchMode?: "exact" | "prefix" | "contains" | "token";
  filters?: Record<string, unknown>;
  filtersByContext?: Record<string, Record<string, unknown>>;
  orderBy?: string;
  minChars?: number;               // default 2
  debounceMs?: number;             // default 300
  pageSize?: number;               // default 20
  cacheMode?: "none" | "session" | "global";
  securityScope?: string;
};

type LookupSearchField = {
  field: string;
  weight?: number;                 // Higher = higher ranking
  matchModes?: Array<"exact" | "prefix" | "contains" | "token">;
};
```

### Resolution Chain

When resolving lookup behavior (highest → lowest priority):

1. `field.lookupProfile` — explicit per-field override
2. `referenceConfig` hints — deprecated fallback (displayField, searchFields)
3. Target entity `IdentityConfig` — server-side merge in lookup API
4. Heuristic defaults — auto-detect from column naming patterns

---

## Schema Manager (Web UI)

### Overview

The Schema Manager is the admin UI for managing entity schemas. Located in `products/neon/apps/web/lib/schema-manager/`.

### Key Types

```typescript
type EntitySummary = {
  id: string;
  name: string;
  kind: string;
  moduleId: string;
  tableSchema: string;
  tableName: string;
  isActive: boolean;
  governanceLevel: string;
  engineTag?: string;
  entityClass?: string;
  currentVersion?: VersionSummary;
  fieldCount: number;
  relationCount: number;
  updatedAt: Date;
  displayMetadata?: { labelSingular, labelPlural, description, iconKey, colorToken };
  dataPolicy?: EntityDataPolicy;
  publishedVersionId?: string;
  lastCompiledAt?: Date;
};

type VersionSummary = {
  id: string;
  versionNo: number;
  status: string;
  label?: string;
  publishedAt?: Date;
  publishedBy?: string;
  createdAt: Date;
};
```

### Entity Resolution

`entity-meta.ts` provides server-side entity metadata resolution:

```typescript
resolveEntityMeta(slugOrName: string): Promise<EntityTableMeta>
```

- Accepts slug (kebab-case), name (PascalCase), or entity_code (snake_case)
- 60-second TTL cache using **canonical identity pattern**: one cache entry per entity (keyed by UUID), with alias→canonical indirection for name/code/slug/table lookups
- Returns: EntityTableMeta with all registry columns + computed capabilities
- Handles PascalCase ↔ kebab-case normalization
- `invalidateEntityMetaCache(tenantId?, entityId?)` supports targeted invalidation by entity

### Client-Safe Utilities (`entity-meta-utils.ts`)

| Function | Purpose |
|---|---|
| `slugToEntityName(slug)` | "chart-of-accounts" → "ChartOfAccounts" |
| `entityNameToSlug(name)` | "ChartOfAccounts" → "chart-of-accounts" |
| `entityNameToDisplayName(name)` | "ChartOfAccounts" → "Chart Of Accounts" |
| `isValidEntitySlug(slug)` | Validate slug format |
| `isValidEntityCode(code)` | Validate entity_code format |
| `isValidEntityStatus(status)` | Validate status value |
| `isOperationalStatus(status)` | Check if status allows data operations |
| `isValidStatusTransition(from, to)` | Check allowed transitions |
| `isMutationAllowed(mutability, kind)` | Check if mutation is allowed |
| `deriveEntityFeatureCapabilities(...)` | Compute feature capabilities |
| `checkEvolutionGuard(entity, updates)` | Check immutability constraints |
| `validatePublishReadiness(data)` | Pre-publish validation |
| `validateEntityClass(value)` | Validate entity_class enum value |
| `validateClassGovernanceCombination(class, gov)` | Validate class×governance combination |
| `validateFeatureFlagOverrides(class, flags)` | Check for forbidden capability overrides |
| `validateBackingType(value)` | Validate backing_type enum value |
| `validateMappingMode(value)` | Validate mapping_mode enum value |
| `validateBackingTypeOperation(backingType, op)` | Check if operation is allowed for backing type |

### API Routes

#### Meta Studio

| Route | Method | Purpose |
|---|---|---|
| `/api/admin/mesh/meta-studio/:entity/publish` | `POST` | Publish entity version |
| `/api/admin/mesh/meta-studio/db` | Various | Admin database queries |

#### Entity Meta API

Routes under `/api/entity-meta/[entityKey]` for:
- Lookup resolution with search
- Typeahead for reference fields
- Identity config-driven label resolution

---

## Generic Data API

### Overview

The GenericDataAPI provides universal CRUD operations for all META-defined entities. It consumes the compiled model to generate type-safe SQL queries.

### Query Flow

```
1. Resolve entity → CompiledModel
2. PolicyGate.enforce() → authorization check
3. Build SQL from compiled fragments:
   - SELECT: compiledModel.selectFragment
   - FROM: compiledModel.fromFragment
   - WHERE: compiledModel.tenantFilterFragment + user filters
4. Execute query via Kysely
5. Transform results (DB → API format via field transformers)
6. Apply field-level security filtering (getAllowedFields)
7. Return response
```

### Features

| Feature | Description |
|---|---|
| Tenant isolation | All queries scoped to `ctx.tenantId` |
| Policy enforcement | Every operation checked via PolicyGate |
| Field-level security | Responses filtered to allowed fields |
| Soft delete | `data_policy.soft_delete` controls delete behavior |
| Optimistic locking | `_version` field for concurrent update detection |
| Auto lifecycle | Lifecycle instance auto-created on entity create (if enabled) |
| Auto numbering | Document number auto-generated on create (if enabled) |
| Bulk operations | Atomic batch create/update/delete |

---

## Entity Registration & Seeding

### Standard Entities

Entities are seeded in `300_meta_entity_registration.sql` organized by domain:

| Domain | Kind | Examples |
|---|---|---|
| Reference (`ref`) | `ref` | Country, Currency, UnitOfMeasure, Language, Industry, PaymentTerm |
| Master (`ent`) | `ent` | Customer, Supplier, Employee, Product, Warehouse |
| Document (`doc`) | `doc` | Attachment, Template, Document |
| Finance (`fin`) | `fin` | ChartOfAccounts, CostCenter, JournalEntry, GLBalance, PurchaseInvoice |
| Integration (`int`) | `int` | IntegrationEndpoint, WebhookSubscription, DataSyncJob |

### Seed Migration Pipeline

1. `300_meta_entity_registration.sql` — Core entity definitions (name, kind, module, table, governance)
2. `303_seed_entity_identity.sql` — Identity columns (entity_code, slug, entity_short)
3. `304_seed_entity_lifecycle.sql` — Status values (all seeded as `active`)
4. `305_seed_entity_ownership.sql` — Ownership model and mutability per entity
5. `306_seed_display_config.sql` — Display configuration (treeView, displayFields, etc.)
6. `307_seed_engines.sql` — Engine registry (12 engines)
7. `316_seed_governed_lifecycle.sql` — Governed lifecycle definitions and hooks

---

## Appendix: Type Reference

### DI Tokens

All services are resolved via `META_TOKENS`:

```typescript
import { META_TOKENS } from "@athyper/core/meta";

// Token names:
META_TOKENS.registry        // MetaRegistry
META_TOKENS.compiler        // MetaCompiler
META_TOKENS.policyGate      // PolicyGate
META_TOKENS.auditLogger     // AuditLogger
META_TOKENS.dataApi         // GenericDataAPI
META_TOKENS.store           // MetaStore
META_TOKENS.lifecycleManager    // LifecycleManager
META_TOKENS.lifecycleCompiler   // LifecycleRouteCompiler
META_TOKENS.timerService        // LifecycleTimerService
META_TOKENS.approvalService     // ApprovalService
META_TOKENS.classificationService // EntityClassificationService
META_TOKENS.numberingEngine     // NumberingEngine
META_TOKENS.ddlGenerator        // DdlGenerator
META_TOKENS.pageDescriptor      // EntityPageDescriptorService
META_TOKENS.actionDispatcher    // ActionDispatcher
META_TOKENS.eventBus            // MetaEventBus
META_TOKENS.versionedDocument   // VersionedDocumentService
```

### Export Summary

The `@athyper/core/meta` package exports:

| Category | Exports |
|---|---|
| Field types | FieldType, FieldDefinition, SemanticFormat, FieldOrigin, FieldConstraints, FieldUiHint, EnumConfig, ReferenceConfig, JsonFieldConfig, MoneyConfig, DatetimeConfig |
| UI resolution | UiRendererConfig, UiFormConfig, UiLayoutConfig, UiListConfig, ResolvedFieldUiMeta |
| Visibility/editability | FieldVisibility, FieldEditability, OverlayMode, FieldVisibilityOverlay, FieldEditabilityOverlay |
| Computed fields | ComputeMode, ComputeExpression, SystemComputeFunction, RecomputeTrigger, StalePolicy |
| Lookup system | IdentityConfig, LookupSearchField, LookupProfile, MergeStrategy, MergeRule |
| Collections | CollectionBehavior, CollectionOwnership, CollectionPersistenceMode, CollectionDeleteMode |
| Version diff | ChangeImpact, FieldVersionDiff, EntityVersionDiff, diffField, computeEntityVersionDiff |
| Overlay system | Overlay, OverlaySet, OverlayChange, CompiledModelWithOverlays, OverlaySafetyLevel |
| Policy engine | PolicyDefinition, PolicyDecision, PolicyRuleDefinition, IndexedPolicy, PermissionDecisionLog |
| Lifecycle | Lifecycle, LifecycleState, LifecycleTransition, LifecycleTransitionGate, LifecycleTransitionHook |
| Approval | ApprovalTemplate, ApprovalInstance, ApprovalTask, ApprovalEvent, ApprovalDecisionRequest |
| Governed versioning | VersionStatus, VersionChangeType, VersioningPolicy, ReviseVersionRequest, PromoteVersionResult |
| Compiled model | CompiledField, CompiledModel, CompiledSnapshot, CompiledPolicy |
| Schema | EntitySchema, Entity, EntityVersion, EntityClass, EntityFeatureFlags |
| Validation rules | ValidationRule, ValidationRuleSet, ValidationPhase, ValidationTrigger |
| Descriptor | EntityPageStaticDescriptor, EntityPageDynamicDescriptor, ActionDescriptor, ViewMode |
| Service contracts | MetaRegistry, MetaCompiler, PolicyGate, AuditLogger, GenericDataAPI, MetaStore, LifecycleManager, ApprovalService, etc. |
| Constants | CONSTRAINT_KEYS_BY_FAMILY, FIELD_OVERLAY_SAFETY, FIELD_CHANGE_IMPACT, PUBLISH_BLOCKING_RULES, CAPABILITY_DEFAULTS, CORE_SEMANTIC_FORMATS |
| Functions | resolveVisibilityWithOverlay, resolveEditabilityWithOverlay, applyMergeRule, mergeWithSemantics, extractFormulaFieldRefs |
| DI tokens | META_TOKENS |

### Legacy Exports (Deprecated)

| Type | Replacement |
|---|---|
| `FieldMetadata` | `FieldDefinition` |
| `EntityMetadata` | `EntitySchema` |
| `MetadataRegistry` (class) | `MetaRegistry` (interface + DI) |
