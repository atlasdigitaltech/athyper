# Service Architecture

Athyper's runtime organizes services into a strict **4-tier architecture**. Each tier has clear responsibilities, allowed dependencies, and a consistent internal structure.

## The 4 Tiers

```
┌─────────────────────────────────────────────────────────────────────┐
│  Tier 4: Business Domain Modules                                    │
│  business/supply/buying, business/finance/accounting, ...           │
│  40+ domain modules + 14 cross-cutting engines                      │
├─────────────────────────────────────────────────────────────────────┤
│  Tier 3: Enterprise Services                                        │
│  collaboration, in-app-messaging, sharing-delegation, ...           │
│  Cross-cutting enterprise features shared across domains            │
├─────────────────────────────────────────────────────────────────────┤
│  Tier 2: Platform Services                                          │
│  content, document, notification, integration-hub, voice-channels   │
│  Reusable platform capabilities consumed by all tiers above         │
├─────────────────────────────────────────────────────────────────────┤
│  Tier 1: Core Platform                                              │
│  foundation, meta, audit-governance, workflow-engine, policy-rules  │
│  automation-jobs, identity-access, ui                               │
│  Infrastructure services that everything depends on                 │
└─────────────────────────────────────────────────────────────────────┘
```

**Dependency rule:** Each tier may depend on tiers below it, never above.

## Tier 1 — Core Platform (`services/platform/`)

314 files across 10 modules. These are the foundational services the entire system depends on.

### `foundation/` — HTTP, IAM, Security (78 files)

The skeleton of the running application.

| Subdirectory | Purpose |
|--------------|---------|
| `http/` | Health, liveness, readiness handlers; HTTP module registration |
| `iam/` | IAM module, MFA (TOTP, WebAuthn, backup codes), persona model, principal search, route files for roles/groups/OUs |
| `security/` | Session store, realm safety assertions, env profiles, auth audit, auth telemetry, Redis rate limiter, field-level security (masking, projection, access policies) |
| `middleware/` | Field-level, observability, rate-limit, security-headers, validation middleware |
| `registries/` | Route registry, job registry, service registry — central registries that modules contribute to |
| `resilience/` | Adapter circuit breaker protection |
| `generic-api/` | Query service, query DSL, join planner, meta registry — powers the generic data API |
| `overlay-system/` | Overlay repository, schema composer — per-tenant field overlays |

### `meta/` — Meta-Programming Engine (69 files, 16 tests)

The schema-driven entity system that powers all business modules.

| Subdirectory | Purpose |
|--------------|---------|
| `core/` | Compiler, compiler cache, meta store, registry, event bus, policy gate, audit logger |
| `schema/` | DDL generator, migration runner, publish service, change notifier |
| `data/` | Generic data API service, DB helpers, query validator |
| `lifecycle/` | Lifecycle manager, lifecycle route compiler, lifecycle timer, SLA timer workers |
| `approval/` | Approval service, approval template service, approver resolver |
| `classification/` | Entity classification service |
| `numbering/` | Auto-numbering engine |
| `validation/` | Rule engine service (field validation rules) |
| `capabilities/` | Entity capabilities service (feature flags per entity) |
| `descriptor/` | Entity page descriptor service, action dispatcher |
| `handlers/` | HTTP handlers for all meta operations |

### `audit-governance/` — Audit Trail (63 files, 25 tests)

Comprehensive audit system with compliance features.

| Subdirectory | Purpose |
|--------------|---------|
| `domain/` | Resilient writer, hash chain, redaction pipeline, column encryption, DLQ manager, feature flags, rate limiter, query gate, load shedding, storage tiering, replay, timeline cache, DSAR, explainability |
| `persistence/` | Archive marker repo, DLQ repo, outbox repo, workflow audit repo |
| `jobs/workers/` | Archive, daily backup, key rotation, partition lifecycle, outbox drain |
| `api/handlers/` | DLQ admin, export, integrity verification, UX endpoints |
| `observability/` | Audit-specific metrics |

### `workflow-engine/` — Workflow Orchestration (43 files)

Definition, instance execution, task management, and recovery.

| Subdirectory | Purpose |
|--------------|---------|
| `action/` | Action execution, SLA escalation, step completion, workflow completion |
| `instance/` | Workflow instance lifecycle |
| `task/` | Task service, notification integration |
| `admin/` | Admin actions (cancel, force-complete, reassign) |
| `version/` | Version control for workflow definitions |
| `recovery/` | Error detection, recovery service, retry strategies |
| `audit/` | Audit trail, compliance reporting |

### `policy-rules/` — Policy Engine (~20 files)

Declarative rule evaluation with simulation and testing.

| Subdirectory | Purpose |
|--------------|---------|
| Root | Rule evaluator, policy compiler, policy gate, subject resolver, decision logger, operation catalog |
| `evaluation/` | Core evaluator, facts provider, policy store, observability |
| `testing/` | Policy simulator, golden tests, test runner, testcase repository |

### Other Tier 1 Modules

| Module | Files | Purpose |
|--------|-------|---------|
| `automation-jobs/` | ~15 | Cron scheduler, Redis queue, worker pool, orchestration engine |
| `identity-access/` | 8 | IAM factory, group sync, OU membership, role binding, tenant resolver |
| `ui/` | 6 | Dashboard and saved view services |
| `shared/` | 2 | Condition evaluator (shared logic) |

---

## Tier 2 — Platform Services (`services/platform-services/`)

195 files across 7 modules. Reusable capabilities consumed by enterprise and business tiers.

### `content/` — Content Management (62 files)

| Feature | Components |
|---------|------------|
| Upload/download | Presigned S3 URLs, multipart upload, orphaned upload cleanup |
| Versioning | Version history, restore, compare |
| ACL | Per-document permission grants/revokes |
| Comments | Threaded comments on documents |
| Preview | Preview generation (image thumbnails) |
| Expiry | Document expiration and auto-cleanup |
| Linking | Many-to-many entity-document linking |
| Workers | Cleanup orphaned uploads, cleanup expired files, cleanup stale multipart, generate previews |

### `document/` — Document Rendering (43 files)

| Feature | Components |
|---------|------------|
| Templates | Template CRUD, versioning, publish/retire lifecycle |
| Rendering | HTML composition, Puppeteer PDF rendering, sync/async render |
| Brands | Brand profiles (colors, logos, fonts) |
| Letterheads | Letterhead management |
| Outputs | Output storage, download, delivery tracking, verification |
| DLQ | Dead letter queue for failed renders, retry/replay |
| Workers | Render document, cleanup outputs, recover stuck jobs |

### `notification/` — Multi-Channel Notifications (62 files)

| Feature | Components |
|---------|------------|
| Channels | 7 adapters: SendGrid email, Twilio SMS, WebPush, In-App, Teams, WhatsApp, WhatsApp template sync |
| Orchestration | Plan → deliver pipeline, channel registry |
| Preferences | Per-user and scoped (tenant/org) preferences |
| Rules | Routing rules engine |
| Templates | Template rendering with Handlebars |
| Advanced | Deduplication, digest aggregation, DLQ management, explainability |
| Workers | Plan notification, deliver notification, digest, cleanup expired, process callback |

### `integration-hub/` — External Integrations (~30 files)

| Feature | Components |
|---------|------------|
| Endpoints | CRUD for integration endpoints with health testing |
| Flows | Flow definition and execution with run logs |
| Webhooks | Subscription management, inbound processing, secret rotation |
| Connectors | HTTP connector client with HMAC auth |
| Delivery | Outbox pattern, delivery scheduler, rate limiter |
| Workers | Deliver outbox items, process webhook inbox |

### `voice-channels/` — Telephony & SMS (~20 files)

| Feature | Components |
|---------|------------|
| Calls | Call session management (Twilio CTI adapter) |
| IVR | Interactive voice response service |
| Recording | Call recording and transcription |
| SMS | SMS send/receive (Twilio SMS adapter) |
| CRM | CRM linkage service (associate calls with records) |

---

## Tier 3 — Enterprise Services (`services/enterprise-services/`)

70 files across 8 modules. Cross-cutting features used by business domains.

### `collaboration/` — Comments & Discussion (31 files)

Entity comments, threaded replies, mentions, reactions, read tracking, approval comments, attachment links, comment analytics, moderation, retention policies, SLA tracking, search, drafts.

### `in-app-messaging/` — Conversations (~20 files)

Direct messaging with conversations, messages, delivery tracking, access policies, rate limiting, audit logging.

### `sharing-delegation/` — Access Sharing (~15 files)

Record sharing (internal + cross-tenant), task delegation, temporary access grants, admin reassignment, share policy resolution, enforcement, expiry cleanup.

### Other Enterprise Modules

| Module | Purpose |
|--------|---------|
| `applied-intelligence/` | AI/ML feature integration |
| `insights-analytics/` | Analytics and reporting |
| `regulatory/` | Compliance and regulatory features |
| `content/` | Enterprise content extensions |

---

## Tier 4 — Business Domain (`services/business/`)

239 files. The actual business logic, organized into domain groups and cross-cutting engines.

### 14 Cross-Cutting Engines (106 files)

Shared calculation and processing engines used by domain modules.

| Engine | Purpose | Key Files |
|--------|---------|-----------|
| `asset-engine/` | Asset lifecycle (depreciation, disposal) | asset-service, asset-repo, asset-book-repo |
| `atlas-ai/` | AI orchestration layer | action-service |
| `budget-engine/` | Fund allocation, health scoring, hierarchy validation | fund-lifecycle-service, health-calculator, hierarchy-validator |
| `commission-engine/` | Commission plans, calculations, statements | commission-service, plan-calculator, calculation-repo, statement-repo |
| `commitment-engine/` | Commitments, payment schedules, fulfillment | commitment-service, schedule-generator, lifecycle |
| `decision-grid/` | Composite scoring pipelines | pipeline-orchestrator, composite-scoring |
| `event-store/` | Event sourcing infrastructure | event-publisher, event-consumer, projection-manager |
| `federation-engine/` | Intercompany transactions | ic-transaction-service, ic-transaction-repo |
| `inventory-engine/` | Inventory valuation (FIFO, LIFO, weighted avg) | inventory-service, valuation |
| `ou-intent/` | Org unit + business intent lifecycle | operating-unit-service, business-intent-service, ou-lifecycle |
| `posting-engine/` | Double-entry journal posting, period control | posting-service, chart-of-accounts-repo, period-control |
| `production-engine/` | Work orders, variance analysis | work-order-repo, variance-analysis |
| `tax-engine/` | Tax calculation, jurisdiction handling | tax-calculation-service, tax-calculator |
| `shared/` | Shared engine utilities (money, engine base) | money.ts, engine-base.ts |

### Business Domain Groups (133 files, 29 dashboard contributions)

Each domain module follows the standard shape: `adapters/`, `api/`, `domain/`, `jobs/`, `observability/`, `persistence/`, `index.ts`, `dashboard.contribution.json`.

| Group | Modules |
|-------|---------|
| **Assets** | asset, asset-management, facilities, real-estate |
| **Commercial** | buy, contract, crm, sale, source, srm |
| **Customer** | crm, selling |
| **Finance** | accounting, budget, budget-funds, pay, payments, treasury |
| **ITSM** | service-management |
| **Operations** | maintenance, manufacturing |
| **People** | human-resources, payroll |
| **Projects** | project-costing |
| **Supply** | buying, contracts, demand-planning, inventory, logistics, quality, sourcing, subcontracting, supplier-management, warehouse |
| **Supply Chain** | demand, inventory, logistics, qms, subcon, wms (dashboard stubs) |

---

## Standard Module Structure

Every module (across all tiers) follows this internal layout:

```
module-name/
├── index.ts                  Module composition root (register + contribute)
├── domain/
│   ├── services/             Domain services (business logic)
│   ├── models/               Domain models and value objects
│   └── types.ts              Domain type definitions
├── persistence/
│   └── *.Repository.ts       Kysely-based data access
├── api/
│   └── handlers/             HTTP route handlers
├── jobs/
│   └── workers/              Background job handlers
├── adapters/                 External service adapters
├── observability/
│   ├── metrics.ts            Module-specific metrics
│   └── logger.ts             Module-specific logger
├── __tests__/                Unit and integration tests
└── dashboard.contribution.json  Dashboard widget contributions
```

---

## RuntimeModule Contract

Every module exports a `RuntimeModule` object:

```typescript
import type { RuntimeModule } from "../../types.js";

export const myModule: RuntimeModule = {
  register(container) {
    // Phase 1: Bind services, repos, domain objects into DI container
    container.bind(TOKENS.MyService, () => new MyService(
      container.resolve(TOKENS.Db),
      container.resolve(TOKENS.Logger),
    ));
  },

  contribute(container) {
    // Phase 2: Register routes, jobs, health checks with registries
    const routes = container.resolve(TOKENS.RouteRegistry);
    const jobs = container.resolve(TOKENS.JobRegistry);

    routes.register("POST", "/api/my-resource", MyHandler);
    jobs.register("my-cleanup", createCleanupHandler(container));
  },
};
```

**Two-phase initialization** ensures all services are bound before any contributions reference them.

## DI Container

The container uses a **token-based** resolve pattern:

```typescript
// kernel/tokens.ts — all tokens defined centrally
export const TOKENS = {
  Db:     Symbol("Db"),
  Logger: Symbol("Logger"),
  Config: Symbol("Config"),
  // ... 100+ tokens
};

// Usage
container.bind(TOKENS.MyService, factory);
const svc = container.resolve(TOKENS.MyService);
```

---

## Database Schema Mapping

The 12 database schemas map to service tiers:

| Schema | Tier | Services |
|--------|------|----------|
| `core` | 1 | Foundation (health, config) |
| `meta` | 1 | Meta-engine (entity definitions, fields, relations) |
| `sec` | 1 | Security (field-level access, sessions) |
| `wf` | 1 | Workflow engine (definitions, instances, tasks) |
| `audit` | 1 | Audit governance (events, outbox, DLQ) |
| `ref` | 1 | Reference data |
| `ui` | 1 | UI (dashboards, saved views) |
| `doc` | 2 | Document services (templates, outputs, render jobs) |
| `collab` | 3 | Collaboration (comments, reactions, mentions) |
| `notify` | 2 | Notification (messages, deliveries, preferences) |
| `ent` | 4 | Business entities (dynamic tables from meta-engine) |
| `public` | — | Schema provisioning tracking |
