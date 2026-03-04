# Meta-Engine

The meta-engine is Athyper's schema-driven entity system. It allows business entities to be defined as metadata — not hard-coded models — enabling runtime configuration, validation, lifecycle management, and UI generation without code changes.

---

## Overview

```
Entity Definition (JSON/YAML)
        │
        ▼
  Meta Compiler
        │
        ▼
  CompiledModel (IR)  ──► Redis Cache
        │
        ├──► DDL Generator → PostgreSQL tables (ent schema)
        ├──► Generic Data API → CRUD endpoints
        ├──► Lifecycle Manager → State machine
        ├──► Validation Rules → Field validators
        ├──► Page Descriptor → UI rendering hints
        └──► Auto-Numbering → Sequence generation
```

---

## Core Concepts

### Entity Definition

An entity is defined with fields, relations, lifecycle, validation, and UI layout:

```typescript
interface EntityDefinition {
  name: string; // e.g., "purchase_order"
  label: string; // e.g., "Purchase Order"
  schema: string; // DB schema (usually "ent")
  fields: FieldDefinition[];
  relations: RelationDefinition[];
  lifecycle?: LifecycleDefinition;
  validation?: ValidationRule[];
  numbering?: NumberingConfig;
  classification?: ClassificationConfig;
  capabilities?: EntityCapabilities;
}
```

Contracts: `framework/core/src/meta/contracts.ts`

### Field Definition

```typescript
interface FieldDefinition {
  name: string;
  label: string;
  type: FieldType; // text, number, date, boolean, enum, relation, ...
  required: boolean;
  unique: boolean;
  indexed: boolean;
  defaultValue?: unknown;
  validation?: FieldValidation;
  overlay?: OverlayConfig; // Per-tenant customization
}
```

### Compiled Model

The compiler transforms an `EntityDefinition` into a `CompiledModel` — an intermediate representation optimized for runtime use:

```typescript
interface CompiledModel {
  entity: EntityDefinition;
  columns: ColumnSpec[]; // SQL column definitions
  indexes: IndexSpec[]; // SQL index definitions
  routes: RouteSpec[]; // HTTP route definitions
  lifecycle: CompiledLifecycle;
  validation: CompiledValidation;
  descriptor: PageDescriptor; // UI rendering hints
}
```

---

## Module Structure

Location: `framework/runtime/src/services/platform/meta/`

| Subdirectory      | Files | Purpose                                                                              |
| ----------------- | ----- | ------------------------------------------------------------------------------------ |
| `core/`           | ~10   | Compiler, compiler cache, meta store, registry, event bus, policy gate, audit logger |
| `schema/`         | ~5    | DDL generator, migration runner, publish service, change notifier                    |
| `data/`           | ~4    | Generic data API service, DB helpers, query validator                                |
| `lifecycle/`      | ~6    | Lifecycle manager, route compiler, timer, SLA workers                                |
| `approval/`       | ~4    | Approval service, template service, approver resolver                                |
| `classification/` | ~2    | Entity classification service                                                        |
| `numbering/`      | ~3    | Auto-numbering engine                                                                |
| `validation/`     | ~3    | Rule engine service (field validation)                                               |
| `capabilities/`   | ~2    | Entity capabilities (feature flags per entity)                                       |
| `descriptor/`     | ~3    | Page descriptor service, action dispatcher                                           |
| `handlers/`       | ~8    | HTTP handlers for all meta operations                                                |

---

## Compiler

File: `meta/core/` (compiler, compiler-cache)

### Compilation Pipeline

```
EntityDefinition
    │
    ├─ Validate schema integrity
    ├─ Resolve field types to SQL types
    ├─ Generate column specifications
    ├─ Generate index specifications
    ├─ Compile lifecycle state machine
    ├─ Compile validation rules
    ├─ Generate page descriptor
    ├─ Resolve auto-numbering config
    │
    ▼
CompiledModel ──► Redis cache (hot path)
              ──► DB persistence (durable)
```

### Compiler Cache

Compiled models are cached in Redis for fast access. Cache invalidation occurs on:

- Entity definition changes
- Field additions/modifications
- Relation changes
- Overlay updates

---

## Generic Data API

File: `meta/data/generic-data-api.service.ts`

Provides CRUD endpoints for any meta-defined entity without custom code:

| Operation | Endpoint                         | Description                            |
| --------- | -------------------------------- | -------------------------------------- |
| Create    | `POST /api/data/{entity}`        | Create new record                      |
| Read      | `GET /api/data/{entity}/{id}`    | Get record by ID                       |
| List      | `GET /api/data/{entity}`         | List with filters, sorting, pagination |
| Update    | `PUT /api/data/{entity}/{id}`    | Update record                          |
| Delete    | `DELETE /api/data/{entity}/{id}` | Soft-delete record                     |
| Bulk      | `POST /api/data/{entity}/bulk`   | Bulk create/update                     |

### Query DSL

The generic data API supports a query DSL for filtering:

```json
{
  "filters": [
    { "field": "status", "op": "eq", "value": "active" },
    { "field": "amount", "op": "gte", "value": 1000 },
    {
      "field": "created_at",
      "op": "between",
      "value": ["2026-01-01", "2026-12-31"]
    }
  ],
  "sort": [{ "field": "created_at", "dir": "desc" }],
  "page": { "offset": 0, "limit": 25 }
}
```

DB helpers: `meta/data/db-helpers.ts`

---

## Lifecycle Management

File: `meta/lifecycle/lifecycle-manager.service.ts`

Each entity can have a lifecycle state machine:

```typescript
interface LifecycleDefinition {
  states: StateDefinition[];
  transitions: TransitionDefinition[];
  initialState: string;
  terminalStates: string[];
}

interface TransitionDefinition {
  from: string;
  to: string;
  action: string;
  guards?: TransitionGuard[];
  sideEffects?: SideEffect[];
  approval?: ApprovalRequirement;
}
```

### Example: Purchase Order Lifecycle

```
  Draft ──(submit)──► Pending Approval ──(approve)──► Approved ──(fulfill)──► Fulfilled
    │                       │                            │
    └──(discard)──► Cancelled  └──(reject)──► Rejected   └──(cancel)──► Cancelled
```

### Lifecycle Timer

File: `meta/lifecycle/lifecycle-timer.service.ts`

SLA timers on lifecycle states:

- Escalation after N hours in a state
- Auto-transition after timeout
- Notification on SLA breach

Tests: `meta/lifecycle/__tests__/lifecycle-timer.test.ts`, `terminal-state.test.ts`

---

## Approval System

File: `meta/approval/approval.service.ts`, `approval-template.service.ts`

Lifecycle transitions can require approval:

```typescript
interface ApprovalRequirement {
  template: string; // Approval template reference
  approvers: ApproverRule[]; // Who can approve
  minApprovals: number; // Required approval count
  escalation?: EscalationConfig;
}
```

### Approver Resolution

File: `meta/approval/approver-resolver.ts` (tested in `approver-resolver.test.ts`)

Resolvers determine who can approve:

- **Role-based**: Users with specific role
- **Hierarchy-based**: Manager of the requestor
- **Dynamic**: Resolved at runtime based on record data

---

## Validation (Rule Engine)

File: `meta/validation/rule-engine.service.ts`

Field-level validation rules:

| Rule Type                 | Example                           |
| ------------------------- | --------------------------------- |
| `required`                | Field must have a value           |
| `min` / `max`             | Numeric range                     |
| `minLength` / `maxLength` | String length                     |
| `pattern`                 | Regex match                       |
| `enum`                    | Must be one of allowed values     |
| `unique`                  | Must be unique across records     |
| `custom`                  | Custom validation function        |
| `cross-field`             | Validation across multiple fields |

Tests: `meta/__tests__/rule-engine.test.ts`

---

## Auto-Numbering

File: `meta/numbering/numbering-engine.service.ts`

Generates sequential document numbers:

```typescript
interface NumberingConfig {
  prefix: string; // e.g., "PO"
  separator: string; // e.g., "-"
  padding: number; // e.g., 6 → "PO-000001"
  resetPeriod?: "yearly" | "monthly" | "never";
  scope?: "tenant" | "entity" | "global";
}
```

Output: `PO-2026-000042`

Tests: `meta/__tests__/numbering.test.ts`

---

## Entity Classification

File: `meta/classification/entity-classification.service.ts`

Entities can be classified into categories:

- Business type (transactional, master, reference)
- Module affiliation
- Compliance level
- Sensitivity classification

Tests: `meta/__tests__/classification.test.ts`, `ddl-classification.test.ts`

---

## Entity Capabilities

File: `meta/capabilities/entity-capabilities.service.ts`

Per-entity feature flags:

| Capability       | Purpose                      |
| ---------------- | ---------------------------- |
| `hasLifecycle`   | Entity has a state machine   |
| `hasApproval`    | Transitions require approval |
| `hasNumbering`   | Auto-numbering enabled       |
| `hasAudit`       | Full audit trail             |
| `hasComments`    | Collaboration comments       |
| `hasAttachments` | File attachments             |
| `hasVersioning`  | Record versioning            |

---

## Page Descriptors

File: `meta/descriptor/entity-page-descriptor.service.ts`

Generates UI rendering hints from the entity definition:

```typescript
interface PageDescriptor {
  listView: {
    columns: ColumnDescriptor[];
    defaultSort: SortConfig;
    filters: FilterDescriptor[];
  };
  detailView: {
    sections: SectionDescriptor[];
    tabs: TabDescriptor[];
  };
  createForm: {
    fields: FormFieldDescriptor[];
    layout: LayoutConfig;
  };
}
```

Tests: `meta/__tests__/descriptor.test.ts`

---

## Overlay System

Per-tenant field customization without modifying the base entity definition:

```typescript
interface FieldOverlay {
  entityType: string;
  tenantId: string;
  fieldName: string;
  label?: string; // Override label
  required?: boolean; // Override required
  visible?: boolean; // Show/hide
  defaultValue?: unknown; // Override default
  customValidation?: ValidationRule[];
}
```

Handler: `meta/handlers/overlay.handler.ts`

---

## DDL Generation

File: `meta/schema/`

The DDL generator creates PostgreSQL tables from compiled models:

```sql
-- Generated from meta definition for "purchase_order"
CREATE TABLE ent.purchase_order (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    doc_number VARCHAR(20),
    status VARCHAR(50) DEFAULT 'draft',
    supplier_id UUID REFERENCES ent.supplier(id),
    total_amount NUMERIC(18,4),
    currency VARCHAR(3),
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ  -- Soft delete
);
```

---

## API Handlers

HTTP handlers in `meta/handlers/`:

| Handler                 | Endpoint Pattern                                | Operations                          |
| ----------------------- | ----------------------------------------------- | ----------------------------------- |
| `descriptor.handler.ts` | `/api/admin/mesh/meta-studio/{entity}`          | Entity CRUD, compile, publish, diff |
| `overlay.handler.ts`    | `/api/admin/mesh/meta-studio/{entity}/overlays` | Overlay CRUD                        |

Neon web app routes: `products/neon/apps/web/app/api/admin/mesh/meta-studio/`

---

## Test Coverage (16 tests)

| Test                                | Coverage                         |
| ----------------------------------- | -------------------------------- |
| `compiler.test.ts`                  | Compilation pipeline             |
| `create-pipeline.test.ts`           | Record creation pipeline         |
| `descriptor.test.ts`                | Page descriptor generation       |
| `lifecycle-approval-bridge.test.ts` | Lifecycle + approval integration |
| `lifecycle-timer.test.ts`           | SLA timer behavior               |
| `terminal-state.test.ts`            | Terminal state handling          |
| `approval.test.ts`                  | Approval workflow                |
| `approver-resolver.test.ts`         | Approver resolution              |
| `numbering.test.ts`                 | Auto-numbering                   |
| `classification.test.ts`            | Entity classification            |
| `ddl-classification.test.ts`        | DDL from classification          |
| `rule-engine.test.ts`               | Validation rules                 |
| `effective-dating.test.ts`          | Effective-dated records          |
| `generic-data-api.test.ts`          | Generic CRUD API                 |
| `cascade-delete.test.ts`            | Cascade delete behavior          |
| `sla-scheduling.test.ts`            | SLA scheduling                   |

---

## Related Documentation

- [Architecture](../architecture/README.md) — System architecture
- [Service Architecture](../SERVICE-ARCHITECTURE.md) — 4-tier module breakdown
- [Framework](../framework/README.md) — Framework internals
