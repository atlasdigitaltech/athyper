# Folder Structure

Complete directory map of the Athyper monorepo with purpose annotations.

## Root Directory

```
athyper-private/
│
│── package.json              Root workspace — scripts, devDependencies
│── pnpm-workspace.yaml       Workspace package globs
│── pnpm-lock.yaml            Lockfile (single, shared)
│── turbo.json                Turborepo pipeline definitions
│── tsconfig.json             Root TypeScript config (path aliases)
│── vitest.config.ts          Root test runner config
│── eslint.config.js          Flat ESLint config (boundaries, import order, unused imports)
│── .dependency-cruiser.cjs   Architecture boundary validation rules
│── .prettierignore           Prettier exclusions
│── .nvmrc                    Node version pin (20.x)
│── .npmrc                    pnpm settings
│── .dockerignore             Docker build exclusions
│
├── framework/                Core platform code
├── packages/                 Shared NPM packages
├── products/                 Deployable applications
├── mesh/                     Docker infrastructure
├── tooling/                  Build config packages
├── tools/                    Developer utilities
├── docs/                     Documentation
└── server/                   Server library placeholder
```

## `framework/` — Core Platform

### `framework/core/src/`

Pure domain contracts. Zero infrastructure dependencies.

```
core/src/
├── index.ts                  Barrel export
├── access/                   RBAC policy types and engine
│   ├── rbac-policy.ts
│   └── types.ts
├── events/                   Domain event bus and event store contracts
│   ├── domainEvent.ts
│   ├── eventBus.ts
│   └── eventStore.ts
├── jobs/                     Background job type definitions
│   └── types.ts
├── lifecycle/                Entity lifecycle contracts
├── meta/                     Meta-engine contracts (entity schemas, descriptors, validation)
│   ├── contracts.ts          Core meta contracts (EntityDefinition, FieldDefinition, etc.)
│   ├── descriptor-types.ts   Page descriptor types
│   ├── tokens.ts             Meta DI tokens
│   ├── types.ts              Shared meta types
│   └── validation-rules.ts   Validation rule definitions
├── model/                    Base domain model types
├── observability/            Health, metrics, tracing, shutdown contracts
│   ├── health.ts
│   ├── metrics.ts
│   ├── shutdown.ts
│   └── tracing.ts
├── registry/                 Tenant and identity provider registries
│   ├── tenantRegistry.ts
│   └── identityProviderRegistry.ts
├── resilience/               Circuit breaker and retry policies
│   ├── circuit-breaker.ts
│   └── retry.ts
└── security/                 Rate limiter, sanitizer, validator
    ├── rate-limiter.ts
    ├── sanitizer.ts
    └── validator.ts
```

### `framework/adapters/`

Five infrastructure adapter packages.

```
adapters/
├── auth/src/                 Keycloak OIDC adapter
│   ├── index.ts
│   └── keycloak/
│       ├── auth-adapter.ts   PKCE Authorization Code flow
│       ├── jwks-manager.ts   Per-realm JWKS cache (jose)
│       └── jwks.ts           JWKS endpoint client
│
├── db/src/                   Database adapter (largest adapter)
│   ├── adapter.ts            DB adapter factory
│   ├── index.ts              Barrel export
│   ├── generated/            Auto-generated types
│   │   ├── kysely/types.ts   Kysely DB interface (from codegen)
│   │   ├── prisma-enums.ts   Prisma enum re-exports
│   │   └── schemas/          Per-schema generated types
│   ├── kysely/               Kysely query layer
│   │   ├── db.ts             DB instance factory
│   │   ├── dialect.ts        PostgreSQL dialect config
│   │   ├── pool.ts           Connection pool management
│   │   ├── query-helpers.ts  Reusable query builder helpers
│   │   └── tx.ts             Transaction wrapper
│   ├── migrations/           Migration infrastructure
│   │   ├── registry.ts       Discovers SQL files from filesystem
│   │   └── runner.ts         Executes migrations with checksum tracking
│   ├── seed/
│   │   └── seed.ts           Seed data runner
│   ├── sql/                  51 SQL files in domain-grouped subdirectories
│   │   ├── 01_foundation/          Bootstrap schemas, core, ref, meta (5 files)
│   │   ├── 02_security/            Security infrastructure (1 file)
│   │   ├── 03_workflow/            Workflow engine (1 file)
│   │   ├── 04_enterprise/          Enterprise entities — ent, doc, collab (4 files)
│   │   ├── 05_content/             Audit, notifications, UI (3 files)
│   │   ├── 06_platform/            Integration, voice, events, spend (6 files)
│   │   ├── 07_finance/             Full finance domain (10 files)
│   │   ├── 10_seed_standard/       Standard seed — ref data, meta registration (9 files)
│   │   └── 11_seed_demo/           Demo data — tenants, finance (12 files, skippable)
│   ├── repos/                Base repository utilities
│   └── types/                Shared DB types
│
├── memorycache/src/          Redis adapter
│   ├── index.ts
│   └── redis.ts              ioredis wrapper with health check
│
├── objectstorage/src/        S3 adapter
│   ├── index.ts
│   ├── types.ts
│   └── s3/
│       ├── client.ts         S3Client factory
│       └── operations.ts     putObject, getObject, presigned URLs
│
└── telemetry/src/            OpenTelemetry adapter
    ├── index.ts
    └── traceContext.ts       Trace context propagation
```

### `framework/runtime/src/`

The runtime orchestrator — 829 files. Composes adapters + core into running services.

```
runtime/src/
├── index.ts                  Barrel export
├── main.ts                   Entry point
│
├── kernel/                   DI container and bootstrap (18 files)
│   ├── tokens.ts             All DI token definitions (TOKENS object)
│   ├── container.ts          Generic DI container implementation
│   ├── container.runtime.ts  Runtime service bindings
│   ├── container.adapters.ts Adapter bindings
│   ├── container.meta.ts     Meta-engine bindings
│   ├── container.defaults.ts Default service bindings
│   ├── bootstrap.ts          Application bootstrap sequence
│   ├── config.schema.ts      Zod config schema
│   ├── config.ts             Config loader
│   ├── httpServer.ts         Express HTTP server
│   ├── lifecycle.ts          Startup/shutdown lifecycle
│   ├── logger.ts             Pino logger factory
│   ├── audit.ts              Audit writer interface
│   ├── scope.ts              Request scope management
│   └── tenantContext.ts      Per-request tenant context
│
├── runtimes/                 Process entry points
│   ├── api/startApiRuntime.ts
│   ├── scheduler/startSchedulerRuntime.ts
│   └── worker/startWorkerRuntime.ts
│
├── adapters/                 Runtime adapter bridges
│   ├── auth/                 Auth adapter bridge (jose verifier)
│   ├── http/                 Express HTTP registration
│   └── telemetry/            Telemetry envelope helpers
│
├── cli/                      CLI commands
│   ├── migrate.ts            Migration CLI
│   └── test-policy.ts        Policy test runner CLI
│
└── services/                 The 4-tier service tree (see SERVICE-ARCHITECTURE.md)
    ├── registry.ts           Module registry (all RuntimeModules)
    ├── types.ts              RuntimeModule type definition
    ├── platform/             Tier 1 — Core platform services (314 files)
    ├── platform-services/    Tier 2 — Shared platform services (195 files)
    ├── enterprise-services/  Tier 3 — Enterprise features (70 files)
    └── business/             Tier 4 — Business domain modules (239 files)
```

## `packages/` — Shared Packages

```
packages/
├── api-client/               HTTP API client library
│   └── src/
│       ├── content/          Content API (upload, download, link, ACL)
│       ├── messaging/        Messaging API (conversations, messages)
│       └── notifications/    Notification API (list, read, unread count)
│
├── auth/                     Auth types and utilities
│   └── src/
│       ├── index.ts, keycloak.ts, session.ts, types.ts
│
├── dashboard/                Dashboard schema and resolution
│   └── src/
│       ├── registry/         Dashboard contribution registry
│       ├── resolution/       Layout + widget resolution engine
│       ├── schemas/          Zod schemas (contribution, layout, widget-params)
│       └── types/            Dashboard type definitions
│
├── i18n/                     Internationalization
│   ├── src/index.ts          i18n setup and helpers
│   └── lang/                 7 locales
│       ├── ar/, de/, en/, fr/, hi/, ms/, ta/
│       └── each: common.json + dashboard/*.json
│
├── theme/                    Design tokens
│   ├── src/index.ts
│   ├── tailwind.preset.ts    Tailwind CSS preset
│   └── tokens/               Design token definitions
│
├── ui/                       Shared React component library
│   └── src/
│       ├── primitives/       17 base components (Button, Card, Dialog, Input, etc.)
│       ├── content/
│       │   └── attachments/  AttachmentCard, FilePicker, EntityDocumentsPanel, etc.
│       ├── messaging/        ChatView, MessageBubble, ConversationList, etc.
│       └── notifications/    NotificationBell, NotificationCard, NotificationList, etc.
│
├── workbench-admin/          Admin workbench module config
├── workbench-partner/        Partner workbench module config
└── workbench-user/           User workbench module config
```

## `products/neon/` — Neon Application

```
products/neon/
├── apps/web/                 Next.js 14 application
│   ├── app/                  App Router
│   │   ├── (shell)/          Authenticated shell (main app)
│   │   │   ├── app/[entity]/ Entity CRUD pages (list, detail, new, edit)
│   │   │   ├── wb/[wb]/      Workbench pages (dashboards, mesh, settings)
│   │   │   ├── mfa/          MFA challenge page
│   │   │   └── messages/     Messaging page
│   │   ├── (auth)/           Login/logout pages
│   │   ├── (public)/         Health check, public pages
│   │   ├── api/              115 API route handlers
│   │   │   ├── admin/mesh/   Meta-studio, policy-studio, jobs, integrations
│   │   │   ├── auth/         BFF auth routes (login, callback, session, refresh, logout)
│   │   │   ├── collab/       Comments, reactions, mentions, approvals
│   │   │   ├── content/      File upload/download/ACL
│   │   │   ├── conversations/ Messaging CRUD
│   │   │   ├── data/[entity]/ Generic entity data API
│   │   │   ├── notifications/ Notification list/read/unread
│   │   │   └── ui/           Dashboard and saved views
│   │   └── actions/          Server actions
│   │
│   ├── components/           160 React components
│   │   ├── mesh/             88 components — list views, schema editor, policy builder, governance
│   │   ├── entity-page/      Entity detail page components
│   │   ├── collab/           Comment, mention, reaction components
│   │   ├── shell/            App shell (header, sidebar, command palette)
│   │   ├── diagnostics/      Health/debug console
│   │   └── ui/               30 shadcn/Radix primitive wrappers
│   │
│   ├── lib/                  95 utility files
│   │   ├── auth/             Auth context, claims, CSRF, workbench config
│   │   ├── collab/           Comment, reaction, mention hooks
│   │   ├── messaging/        Conversation and message hooks
│   │   ├── notifications/    Notification hooks and streaming
│   │   ├── schema-manager/   Entity schema management hooks
│   │   └── entity-page/      Plugin registry and entity page hooks
│   │
│   ├── stores/               State management (nav, preferences, presets, theme)
│   ├── config/               App config, reserved entities, nav config
│   ├── styles/               Global CSS
│   ├── middleware.ts          CSRF + session gate middleware
│   └── next.config.mjs       Next.js configuration
│
├── auth/server/              BFF auth library
│   ├── keycloak.ts           Keycloak client wrapper
│   ├── session.ts            Redis session store
│   ├── audit.ts              Auth audit logging
│   ├── types.ts              Session/token types
│   └── index.ts              Barrel export
│
├── content/server/           BFF content library
│   ├── content.ts            Content service client
│   ├── acl.ts                ACL operations
│   ├── link.ts               Entity-document linking
│   ├── version.ts            Version management
│   ├── permissions.ts        Permission helpers
│   ├── audit.ts              Content audit logging
│   └── index.ts              Barrel export
│
├── shared/                   Shared Tailwind preset
│   ├── index.ts
│   └── tailwind.preset.ts
│
└── themes/                   Theme package (styles)
```

## `mesh/` — Infrastructure

```
mesh/
├── compose/                  Docker Compose files
│   ├── compose.yml           Main entry (includes all service YMLs)
│   ├── apps/                 Application container definition
│   ├── db/                   PostgreSQL + PgBouncer (apps + auth pools)
│   ├── gateway/              Traefik reverse proxy
│   ├── iam/                  Keycloak identity provider
│   ├── memorycache/          Redis
│   ├── objectstorage/        MinIO (S3-compatible)
│   ├── mesh/                 Base + environment overrides (local, staging, production)
│   └── telemetry/            Prometheus, Grafana, Tempo, Loki, Alloy
│
├── config/                   Service configuration
│   ├── db/                   PostgreSQL configs per environment
│   ├── gateway/              TLS certs + Traefik dynamic routing
│   ├── iam/                  Keycloak realm exports (JSON)
│   ├── redis/                Redis configuration
│   └── telemetry/            Prometheus, Tempo, Alloy configs
│
├── data/                     Persistent volume mounts (gitignored)
│   ├── db/, memorycache/, objectstorage/, telemetry/
│
├── env/                      Environment templates
│   ├── local.env.example
│   ├── staging.env.example
│   └── production.env.example
│
└── scripts/                  Infrastructure scripts (.bat + .sh)
    ├── up.sh / up.bat        Start all services
    ├── down.sh / down.bat    Stop all services
    ├── logs.sh / logs.bat    Tail logs
    ├── init-data.*           Initialize data volumes
    ├── export-iam.*          Export Keycloak realm
    └── generate-mesh-certs.* Generate TLS certificates
```

## `tooling/` & `tools/`

```
tooling/
├── devtools/                 clean-deep.mjs (deep clean utility)
├── eslint-config/            Shared ESLint configs (base.json, next.json)
│   └── rules/                Custom ESLint rules
└── tsconfig/                 Shared TypeScript configs (base, Next.js presets)

tools/
├── codegen/                  Code generation (Kysely types from DB schema)
│   └── src/
│       ├── athyper-codegen.mjs
│       ├── lib.ts
│       └── publish.ts
├── devtools/                 Developer utilities
│   └── keycloackgen/         Keycloak config generator
├── migrator/                 DB migration runner (placeholder)
└── seeders/                  DB seed runner (placeholder)
```

## `docs/`

```
docs/
├── README.md                     Documentation index
├── TECHNICAL_SPECIFICATION.md    Full technical spec
├── CONFIG.md                     Configuration reference
├── athyper/                      Monorepo concept docs (this folder)
├── architecture/                 DDD patterns, events, multi-tenancy, IAM/RBAC, audit
├── compliance/                   Audit controls, data flow, explainability, phase reports
├── content-management/           Content module implementation docs
├── deployment/                   Environment setup, quickstart
├── finance/                      Finance module spec, hardening
├── framework/                    Adapter, core, runtime, document service docs
├── iam/                          IAM setup guide, Keycloak config
├── infrastructure/               Jobs, infrastructure overview
├── messaging/                    Messaging module docs
├── meta-engine/                  Meta-engine docs
├── runbooks/                     Operational runbooks (audit go-live, auth ops, Keycloak setup)
└── security/                     Auth architecture, rate limiting
```

## File Count Summary

| Area               | .ts files  | .tsx files | .test.ts | SQL    | JSON configs                   |
| ------------------ | ---------- | ---------- | -------- | ------ | ------------------------------ |
| framework/core     | 43         | —          | 7        | —      | —                              |
| framework/adapters | 37         | —          | 2        | 47     | —                              |
| framework/runtime  | 829        | —          | 80+      | —      | 29 dashboard.contribution.json |
| packages           | 45         | 35         | 5        | —      | 7 locale bundles               |
| products/neon      | 260        | 293        | 3        | —      | —                              |
| **Total**          | **~1,214** | **~328**   | **~97**  | **47** | **36+**                        |
