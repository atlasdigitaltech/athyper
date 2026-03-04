# System Architecture

Athyper is a **multi-tenant enterprise platform** built as a TypeScript monorepo. This document covers the high-level architecture, design principles, and how the system layers compose at runtime.

## Design Principles

1. **Schema-driven**: Business entities are defined as metadata (the meta-engine), not hard-coded models. The platform compiles entity definitions into executable runtime artifacts.
2. **Layered architecture**: A strict 4-tier dependency hierarchy prevents circular coupling.
3. **Adapter isolation**: All infrastructure access (DB, cache, storage, auth, telemetry) is mediated through adapter packages with well-defined contracts.
4. **Two-phase initialization**: Modules first `register()` their services into the DI container, then `contribute()` routes, jobs, and health checks — ensuring all dependencies are available before wiring.
5. **Multi-tenancy by default**: Tenant isolation is enforced at session, data, and configuration layers.

---

## Layer Diagram

```
┌────────────────────────────────────────────────────────────────────┐
│                    products/neon (Next.js 14)                      │
│  App Router, BFF auth, Server Components, 115 API routes           │
├────────────────────────────────────────────────────────────────────┤
│                    packages/ (9 shared packages)                   │
│  ui, api-client, auth, dashboard, i18n, theme, workbenches        │
├════════════════════════════════════════════════════════════════════╡
│                    framework/runtime                               │
│  Kernel (DI, config, HTTP, lifecycle)                              │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Tier 4: Business Domain  (40+ modules, 14 engines)          │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │ Tier 3: Enterprise Services  (collaboration, messaging, ...) │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │ Tier 2: Platform Services  (content, document, notify, ...)  │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │ Tier 1: Core Platform  (meta, audit, workflow, IAM, policy)  │  │
│  └──────────────────────────────────────────────────────────────┘  │
├════════════════════════════════════════════════════════════════════╡
│                    framework/core                                  │
│  Pure contracts: events, access, resilience, observability         │
├────────────────────────────────────────────────────────────────────┤
│                    framework/adapters                               │
│  db (Kysely/Pg), auth (Keycloak), cache (Redis),                  │
│  objectstorage (S3/MinIO), telemetry (OpenTelemetry)              │
└────────────────────────────────────────────────────────────────────┘
```

**Dependency rule**: Each layer may only depend on layers below it. `core` has zero infrastructure dependencies. `adapters` depend on `core`. `runtime` depends on both.

---

## Dependency Injection

The DI container (`framework/runtime/src/kernel/container.ts`) is token-based:

```typescript
// Tokens are string constants grouped in a TOKENS object
export const TOKENS = {
    config: "kernel.config",
    logger: "kernel.logger",
    db:     "adapter.db",
    // ... 150+ tokens organized by domain
};

// Registration
container.register(TOKENS.db, (c) => createDbAdapter(c.resolve(TOKENS.config)));

// Resolution (async, type-safe)
const db = await container.resolve(TOKENS.db);
```

### Cache Modes

| Mode | Lifetime | Use Case |
|------|----------|----------|
| `singleton` | Application lifetime | DB pool, config, logger |
| `scoped` | Per-request | Tenant context, request context |
| `transient` | Every resolve | Stateless utilities |

### Scope Hierarchy

```
Root Container (singletons)
  └─ Request Scope (scoped per HTTP request / job execution)
       └─ Child scopes (if needed)
```

---

## RuntimeModule Contract

Every service module implements the `RuntimeModule` interface:

```typescript
type RuntimeModule = {
    name: string;
    register?: (c: Container) => void | Promise<void>;   // Phase 1: bind services
    contribute?: (c: Container) => void | Promise<void>;  // Phase 2: wire routes/jobs
};
```

The 12 registered modules (loaded in order via `services/registry.ts`):

| # | Module | Tier | Purpose |
|---|--------|------|---------|
| 1 | httpFoundation | 1 | HTTP server, health, readiness, liveness |
| 2 | metaModule | 1 | Meta-engine (entity definitions, lifecycle, validation) |
| 3 | iamModule | 1 | IAM, MFA, principal search |
| 4 | dashboardModule | 1 | Dashboard and saved view services |
| 5 | documentModule | 2 | Document rendering (templates, PDF, brands) |
| 6 | contentModule | 2 | Content management (upload, versioning, ACL) |
| 7 | notificationModule | 2 | Multi-channel notifications (7 adapters) |
| 8 | auditGovernanceModule | 1 | Audit trail, hash chain, DLQ, compliance |
| 9 | collaborationModule | 3 | Comments, reactions, mentions, read tracking |
| 10 | integrationHubModule | 2 | External integrations, webhooks, flows |
| 11 | messagingModule | 3 | In-app direct/group messaging |
| 12 | sharingDelegationModule | 3 | Record sharing, task delegation, temporary access |

Each module load is audit-logged with a `module.loaded` event.

---

## Request Flow

```
Client (Browser)
    │
    ▼
Next.js Middleware (CSRF + session gate)
    │
    ▼
Next.js API Route (BFF)  ──► Redis session lookup
    │                         ──► Keycloak token verification
    ▼
Runtime HTTP Server (Express)
    │
    ├─► Middleware chain (auth, rate-limit, field-security, validation, observability)
    │
    ├─► Route handler (registered by RuntimeModule.contribute)
    │       │
    │       ├─► Domain service (business logic)
    │       │       │
    │       │       ├─► Persistence (Kysely queries via adapter.db)
    │       │       ├─► Cache (Redis via adapter.cache)
    │       │       ├─► Object storage (S3 via adapter.objectStorage)
    │       │       └─► Event bus (domain events)
    │       │
    │       └─► Audit writer (governance.audit)
    │
    └─► Response
```

---

## Multi-Tenancy

### Isolation Points

| Layer | Mechanism |
|-------|-----------|
| **Session** | Redis session keyed by `neon_sid` cookie; tenant ID bound at login |
| **Request** | `tenantContext` scoped in DI container per request |
| **Database** | Row-level isolation via `tenant_id` column on all tenant-scoped tables |
| **Cache** | Redis keys namespaced by tenant ID |
| **Auth** | Per-realm Keycloak configuration; realm safety assertions at boot |
| **Config** | Tenant IAM profiles with per-tenant feature flags |

### Cross-Tenant Protection

- Session store validates tenant ID on every access; mismatches trigger session destruction + audit event
- Boot-time realm safety: production environments reject `localhost` identity providers
- Environment profiles enforce TLS, pool sizes, and log levels per deployment tier

---

## Event System

### Domain Events

Defined in `framework/core/src/events/`:

```typescript
interface DomainEvent {
    type: string;
    aggregateId: string;
    aggregateType: string;
    payload: Record<string, unknown>;
    metadata: {
        tenantId: string;
        userId: string;
        timestamp: string;
        correlationId: string;
    };
}
```

### Event Store Engine

The event store (`services/business/engines/event-store/`) provides:
- **Event publishing** with sequence ordering
- **Event consumption** with checkpoint tracking
- **Projection management** for read models
- **Storage tiering** for cold data archival

---

## Database Architecture

12 PostgreSQL schemas, provisioned by SQL files in `framework/adapters/db/src/sql/`:

| Schema | Tier | Tables | Purpose |
|--------|------|--------|---------|
| `public` | -- | 1 | Provisioning checksum tracking |
| `core` | 1 | ~10 | Tenants, config, bootstrap |
| `meta` | 1 | ~20 | Entity definitions, fields, relations, overlays |
| `ref` | 1 | ~15 | Reference data (currencies, countries, UOM) |
| `sec` | 1 | ~8 | Field access policies, rate limits |
| `wf` | 1 | ~12 | Workflow definitions, instances, tasks |
| `ent` | 4 | Dynamic | Business entity data (generated from meta) |
| `doc` | 2 | ~10 | Document templates, outputs, render jobs |
| `collab` | 3 | ~12 | Comments, reactions, mentions, read tracking |
| `audit` | 1 | ~8 | Audit events, outbox, DLQ, archive markers |
| `notify` | 2 | ~15 | Notifications, deliveries, preferences, templates |
| `ui` | 1 | ~4 | Dashboards, saved views |

Provisioning is checksum-tracked via `public.schema_provisions` — files are re-run only when their content hash changes.

---

## Resilience

### Circuit Breaker

All adapter calls are protected by circuit breakers (`framework/runtime/src/services/platform/foundation/resilience/`):

```
CLOSED ──(failures exceed threshold)──► OPEN ──(cooldown timer)──► HALF_OPEN
   ▲                                                                    │
   └──────────────────(success)────────────────────────────────────────┘
```

### Retry Policies

Defined in `framework/core/src/resilience/retry.ts` — exponential backoff with jitter.

### Rate Limiting

Redis-based rate limiting at multiple levels:
- Per-tenant API rate limits
- Per-user collaboration rate limits
- Per-endpoint integration rate limits

### Graceful Shutdown

The lifecycle manager (`kernel/lifecycle.ts`) ensures:
1. Stop accepting new requests
2. Drain in-flight requests
3. Flush audit outbox
4. Close DB/Redis connections
5. Emit shutdown telemetry

---

## Related Documentation

- [Service Architecture](../SERVICE-ARCHITECTURE.md) — Detailed 4-tier module breakdown
- [Framework Internals](../framework/README.md) — Core, adapters, runtime deep dive
- [Infrastructure](../infrastructure/README.md) — Docker Compose mesh
- [IAM & Authentication](../iam/README.md) — PKCE flow, sessions, MFA
