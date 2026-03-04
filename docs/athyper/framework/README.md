# Framework Internals

The `framework/` directory contains the three foundational layers of Athyper: **core** (pure contracts), **adapters** (infrastructure bindings), and **runtime** (the orchestrating application).

---

## Core (`framework/core/`)

Pure TypeScript contracts with zero infrastructure dependencies. This package defines the vocabulary shared across the entire system.

### Module Map

| Module | Key Exports | Purpose |
|--------|-------------|---------|
| `access/` | `RbacPolicy`, `Permission`, `Role` | RBAC policy types and evaluation engine |
| `events/` | `DomainEvent`, `EventBus`, `EventStore` | Domain event bus and event store contracts |
| `jobs/` | `JobQueue`, `JobHandler`, `JobDefinition` | Background job type definitions |
| `lifecycle/` | `EntityLifecycle`, `LifecycleTransition` | Entity lifecycle state machine contracts |
| `meta/` | `EntityDefinition`, `FieldDefinition`, `CompiledModel` | Meta-engine contracts |
| `model/` | `BaseEntity`, `AuditableEntity` | Base domain model types |
| `observability/` | `HealthCheck`, `Metrics`, `Tracer`, `GracefulShutdown` | Health, metrics, tracing, shutdown |
| `registry/` | `TenantRegistry`, `IdentityProviderRegistry` | Tenant and IdP registries |
| `resilience/` | `CircuitBreaker`, `RetryPolicy` | Circuit breaker and retry policies |
| `security/` | `RateLimiter`, `Sanitizer`, `Validator` | Rate limiter, input sanitizer, validator |

### Design Rules

- No `import` from `framework/adapters` or `framework/runtime`
- No Node.js built-in imports (no `fs`, `path`, `crypto`, etc.)
- All types are interfaces or type aliases — no classes with behavior
- Barrel-exported via `src/index.ts`

---

## Adapters (`framework/adapters/`)

Five adapter packages that bind infrastructure to the contracts defined in `core`.

### Database Adapter (`@athyper/adapter-db`)

The largest adapter. Provides the Kysely query layer over PostgreSQL.

```
adapters/db/src/
├── adapter.ts            DB adapter factory (creates pool + Kysely instance)
├── kysely/
│   ├── db.ts             Kysely database instance factory
│   ├── dialect.ts        PostgreSQL dialect configuration
│   ├── pool.ts           Connection pool management (pg Pool)
│   ├── query-helpers.ts  Reusable query builder helpers
│   └── tx.ts             Transaction wrapper (begin/commit/rollback)
├── generated/            Auto-generated types
│   ├── kysely/types.ts   Kysely DB interface (from codegen)
│   ├── prisma-enums.ts   Prisma enum re-exports
│   └── schemas/          Per-schema generated types
├── migrations/
│   ├── registry.ts       Discovers SQL files from filesystem
│   └── runner.ts         Executes migrations with checksum tracking
├── seed/
│   └── seed.ts           Seed data runner
├── sql/                  51 SQL files in domain-grouped subdirectories
│   ├── 01_foundation/          Bootstrap schemas, core, ref, meta (5 files)
│   ├── 02_security/            Security infrastructure (1 file)
│   ├── 03_workflow/            Workflow engine (1 file)
│   ├── 04_enterprise/          Enterprise entities — ent, doc, collab (4 files)
│   ├── 05_content/             Audit, notifications, UI (3 files)
│   ├── 06_platform/            Integration, voice, events, spend (6 files)
│   ├── 07_finance/             Full finance domain (10 files)
│   ├── 10_seed_standard/       Standard seed — ref data, meta registration (9 files)
│   └── 11_seed_demo/           Demo data — tenants, finance (12 files, skippable)
├── repos/                Base repository utilities
└── types/                Shared DB types
```

**Key features:**
- Connection pooling via `pg.Pool` with configurable min/max connections
- Transaction support with automatic commit/rollback
- Checksum-tracked provisioning (SQL files re-run only on content hash change)
- Type-safe queries via Kysely codegen from live database schema

### Auth Adapter (`@athyper/adapter-auth`)

OIDC/PKCE adapter for Keycloak.

| File | Purpose |
|------|---------|
| `keycloak/auth-adapter.ts` | PKCE Authorization Code flow implementation |
| `keycloak/jwks-manager.ts` | Per-realm JWKS key cache (jose library) |
| `keycloak/jwks.ts` | JWKS endpoint client |

**Build requirement**: This package produces `.d.ts` files consumed by downstream packages. After changes:

```bash
cd framework/adapters/auth && npx tsup src/index.ts --format esm --dts --sourcemap --outDir dist
```

### Cache Adapter (`@athyper/adapter-memorycache`)

Redis adapter wrapping `ioredis`.

| File | Purpose |
|------|---------|
| `redis.ts` | ioredis client with health check, reconnection, and error handling |
| `index.ts` | Barrel export |

Used for: sessions, cache, job queues, rate limiting, audit outbox.

### Object Storage Adapter (`@athyper/adapter-objectstorage`)

S3-compatible storage adapter (works with MinIO locally, AWS S3 in production).

| File | Purpose |
|------|---------|
| `s3/client.ts` | S3Client factory (configurable endpoint, credentials, region) |
| `s3/operations.ts` | `putObject`, `getObject`, `deleteObject`, presigned URL generation |
| `types.ts` | Storage operation types |

### Telemetry Adapter (`@athyper/adapter-telemetry`)

OpenTelemetry instrumentation adapter.

| File | Purpose |
|------|---------|
| `index.ts` | Telemetry adapter initialization |
| `traceContext.ts` | Trace context propagation (W3C TraceContext format) |

Feeds metrics to Prometheus, traces to Tempo, logs to Loki via the telemetry mesh stack.

---

## Runtime (`framework/runtime/`)

The application orchestrator — 829 source files. Composes adapters and core contracts into a running service.

### Kernel (`runtime/src/kernel/`)

The bootstrap infrastructure.

| File | Purpose |
|------|---------|
| `tokens.ts` | 150+ DI token definitions organized by domain |
| `container.ts` | Generic DI container (singleton/scoped/transient) |
| `container.runtime.ts` | Runtime service bindings |
| `container.adapters.ts` | Adapter bindings |
| `container.meta.ts` | Meta-engine bindings |
| `container.defaults.ts` | Default/fallback bindings |
| `bootstrap.ts` | Application bootstrap sequence |
| `config.schema.ts` | Zod configuration schema |
| `config.ts` | Config loader (JSON parameter files per environment) |
| `httpServer.ts` | Express HTTP server setup |
| `lifecycle.ts` | Startup/shutdown lifecycle manager |
| `logger.ts` | Pino logger factory |
| `audit.ts` | Audit writer interface |
| `scope.ts` | Request scope management |
| `tenantContext.ts` | Per-request tenant context |

### Bootstrap Sequence

```
1. Load config (Zod-validated JSON)
2. Create kernel container
3. Register adapters (DB, cache, storage, auth, telemetry)
4. Register kernel services (logger, lifecycle, config, audit)
5. Load RuntimeModules:
   for each module:
     a. module.register(container)   ← bind services
     b. module.contribute(container) ← wire routes/jobs
     c. emit audit event "module.loaded"
6. Start HTTP server
7. Start scheduler (cron jobs)
8. Start worker pool (background jobs)
9. Register health checks
10. Emit boot telemetry
```

### Runtime Entry Points

Three process entry points in `runtime/src/runtimes/`:

| Entry Point | Purpose |
|-------------|---------|
| `api/startApiRuntime.ts` | HTTP API server (Express) |
| `scheduler/startSchedulerRuntime.ts` | Cron job scheduler |
| `worker/startWorkerRuntime.ts` | Background job worker pool |

### Service Tree

The 4-tier service hierarchy lives under `runtime/src/services/`:

```
services/
├── registry.ts              Module registry (loads all 12 RuntimeModules)
├── types.ts                 RuntimeModule type definition
├── platform/                Tier 1 — Core platform (314 files)
├── platform-services/       Tier 2 — Platform services (195 files)
├── enterprise-services/     Tier 3 — Enterprise services (70 files)
└── business/                Tier 4 — Business domain (239 files)
```

See [Service Architecture](../SERVICE-ARCHITECTURE.md) for the full module breakdown.

---

## Type Generation Pipeline

```
PostgreSQL  ──► prisma db pull  ──► Prisma Schema
                                       │
                                       ▼
                             prisma generate  ──► Generated Types
                                       │
                                       ▼
                             kysely:codegen   ──► Kysely DB Interface
                                       │               (types.ts)
                                       ▼
                          framework/adapters/db/src/generated/
```

After schema changes:

```bash
pnpm db:pull          # Pull schema from DB to Prisma schema
pnpm db:generate      # Generate Prisma client types
pnpm kysely:codegen   # Generate Kysely types
```

---

## Related Documentation

- [Architecture](../architecture/README.md) — System architecture overview
- [Build & Tooling](../BUILD-TOOLING.md) — Build system, ESLint, TypeScript config
- [Service Architecture](../SERVICE-ARCHITECTURE.md) — 4-tier module breakdown
