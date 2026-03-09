# Meta-Engine

The meta-engine is Athyper's schema-driven entity system. It enables dynamic entity definition, policy-driven access control, and runtime schema management without code deploys.

---

## Documentation Index

| Document | Scope |
|----------|-------|
| [META Engine: Entity System](../../meta-entity-system.md) | **Canonical reference** -- entity registry, identity model, classification, governance, versioning, lifecycle, policies, overlays, compilation, data API, service contracts, type reference |
| [Meta.Field System](../../META_FIELD_SYSTEM.md) | Field dictionary (60+ columns), constraint system, frontend rendering pipeline, caching strategy, observability |

---

## Quick Reference

### Package Structure

| Package | Path | Role |
|---------|------|------|
| `@athyper/core/meta` | `framework/core/src/meta/` | Pure types, interfaces, DI tokens (zero implementation) |
| Runtime Services | `framework/runtime/src/services/platform/meta/` | Service implementations (Kysely/PostgreSQL) |
| DB Adapter | `framework/adapters/db/src/sql/` | PostgreSQL DDL (tables, indexes, constraints) |
| Schema Manager | `products/neon/apps/web/lib/schema-manager/` | React hooks and utilities for the admin UI |

### Module Structure

Location: `framework/runtime/src/services/platform/meta/`

| Subdirectory | Purpose |
|--------------|---------|
| `core/` | Compiler, compiler cache, meta store, registry, event bus, policy gate, audit logger |
| `schema/` | DDL generator, migration runner, publish service, change notifier |
| `data/` | Generic data API service, DB helpers, query validator |
| `lifecycle/` | Lifecycle manager, route compiler, timer, SLA workers |
| `approval/` | Approval service, template service, approver resolver |
| `classification/` | Entity classification service |
| `numbering/` | Auto-numbering engine |
| `validation/` | Rule engine service (field validation) |
| `capabilities/` | Entity capabilities (feature flags per entity) |
| `descriptor/` | Page descriptor service, action dispatcher |
| `handlers/` | HTTP handlers for all meta operations |

### Key Services (DI Tokens)

```typescript
import { META_TOKENS } from "@athyper/core/meta";

META_TOKENS.registry            // MetaRegistry -- entity + version CRUD
META_TOKENS.compiler            // MetaCompiler -- schema compilation
META_TOKENS.policyGate          // PolicyGate -- authorization
META_TOKENS.dataApi             // GenericDataAPI -- universal CRUD
META_TOKENS.store               // MetaStore -- registry + compiler facade
META_TOKENS.lifecycleManager    // LifecycleManager -- state machine
META_TOKENS.approvalService     // ApprovalService -- multi-stage approvals
META_TOKENS.numberingEngine     // NumberingEngine -- document numbering
META_TOKENS.versionedDocument   // VersionedDocumentService -- governed versioning
META_TOKENS.classificationService // EntityClassificationService
META_TOKENS.pageDescriptor      // EntityPageDescriptorService
META_TOKENS.eventBus            // MetaEventBus -- domain events
```

### Test Coverage

| Test | Coverage |
|------|----------|
| `compiler.test.ts` | Compilation pipeline |
| `create-pipeline.test.ts` | Record creation pipeline |
| `descriptor.test.ts` | Page descriptor generation |
| `lifecycle-approval-bridge.test.ts` | Lifecycle + approval integration |
| `lifecycle-timer.test.ts` | SLA timer behavior |
| `terminal-state.test.ts` | Terminal state handling |
| `approval.test.ts` | Approval workflow |
| `approver-resolver.test.ts` | Approver resolution |
| `numbering.test.ts` | Auto-numbering |
| `classification.test.ts` | Entity classification |
| `ddl-classification.test.ts` | DDL from classification |
| `rule-engine.test.ts` | Validation rules |
| `effective-dating.test.ts` | Effective-dated records |
| `generic-data-api.test.ts` | Generic CRUD API |
| `cascade-delete.test.ts` | Cascade delete behavior |
| `sla-scheduling.test.ts` | SLA scheduling |
| `governed-versioning.test.ts` | Governed version lifecycle |

---

## Related Documentation

- [Architecture](../architecture/README.md) -- System architecture
- [Service Architecture](../SERVICE-ARCHITECTURE.md) -- 4-tier module breakdown
- [Framework](../framework/README.md) -- Framework internals
