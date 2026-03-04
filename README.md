# Athyper Platform

Multi-tenant SaaS platform built with TypeScript, Node.js, PostgreSQL, Redis, and React. Uses hexagonal architecture, DI-based runtime, and Redis-backed BFF auth.

## Documentation

### Platform Documentation (`docs/athyper/`)

- [Documentation Index](docs/athyper/README.md) — Master index for all platform docs
- [Getting Started](docs/athyper/deployment/README.md) — Local Windows setup and Contabo server deployment
- [Architecture](docs/athyper/architecture/README.md) — System design, DI container, request flow, multi-tenancy
- [Framework](docs/athyper/framework/README.md) — Core contracts, adapters, runtime kernel
- [Meta-Engine](docs/athyper/meta-engine/README.md) — Schema-driven entity system, compiler, lifecycle
- [IAM & Auth](docs/athyper/iam/README.md) — PKCE flow, sessions, CSRF, MFA, Keycloak
- [Security](docs/athyper/security/README.md) — Rate limiting, field-level security, middleware
- [Audit & Compliance](docs/athyper/compliance/README.md) — Hash chain, encryption, redaction, DSAR
- [Content Management](docs/athyper/content-management/README.md) — Upload, versioning, ACL, document rendering
- [Messaging](docs/athyper/messaging/README.md) — In-app messaging, collaboration, comments
- [Infrastructure](docs/athyper/infrastructure/README.md) — Docker Compose mesh, telemetry stack
- [Runbooks](docs/athyper/runbooks/README.md) — Auth ops, audit go-live, incident response
- [Build & Tooling](docs/athyper/BUILD-TOOLING.md) — Turborepo, ESLint, Vitest, codegen pipeline

### Business Process Documentation (`docs/neon/`)

- [Entity UI Framework](docs/neon/ENTITY_UI_FRAMEWORK.md) — Entity rendering specification
- [Finance Specification](docs/neon/finance/FINANCE_FUNCTIONAL_SPECIFICATION.md) — Finance engine v2.1

### Developer Onboarding

- [Contributing Guide](CONTRIBUTING.md) — Setup, conventions, architecture rules, daily workflow

## Project Structure

```
athyper-private/
├── framework/                        # Core platform
│   ├── core/                         # @athyper/core — pure contracts, zero infra deps
│   ├── runtime/                      # @athyper/runtime — kernel, DI, HTTP, services
│   └── adapters/
│       ├── auth/                     # @athyper/adapter-auth — Keycloak OIDC, JWKS (jose)
│       ├── db/                       # @athyper/adapter-db — PostgreSQL via Kysely + Prisma
│       ├── memorycache/              # @athyper/adapter-memorycache — Redis (ioredis)
│       ├── objectstorage/            # @athyper/adapter-objectstorage — S3/MinIO (AWS SDK)
│       └── telemetry/                # @athyper/adapter-telemetry — OpenTelemetry + Pino
├── products/neon/                    # Neon product
│   ├── apps/web/                     # @neon/web — Next.js 14 app
│   ├── auth/                         # @neon/auth — BFF session management, audit
│   ├── content/                      # @neon/content — BFF content service
│   └── themes/                       # @neon/theme — Tailwind theme presets
├── packages/                         # Shared libraries
│   ├── ui/                           # @athyper/ui — Radix-based component library
│   ├── api-client/                   # @athyper/api-client — typed API client
│   ├── auth/                         # @athyper/auth — shared auth types
│   ├── dashboard/                    # @athyper/dashboard — dashboard schema & registry
│   ├── i18n/                         # @athyper/i18n — internationalization (7 locales)
│   ├── theme/                        # @athyper/theme — design tokens, Tailwind preset
│   ├── workbench-admin/              # @athyper/workbench-admin
│   ├── workbench-user/               # @athyper/workbench-user
│   └── workbench-partner/            # @athyper/workbench-partner
├── mesh/                             # Docker Compose infrastructure
│   ├── compose/                      # Base + per-environment overrides
│   ├── config/                       # Service configs (Keycloak, Traefik, Redis, etc.)
│   └── scripts/                      # up.sh, down.sh, logs.sh, init-data.sh
├── tools/codegen/                    # Kysely codegen pipeline
├── tooling/                          # ESLint config, shared tsconfig
├── docs/
│   ├── athyper/                      # Platform documentation
│   └── neon/                         # Business process documentation
└── server/                           # Server library placeholder
```

## Quick Start

```bash
pnpm install                          # Install dependencies
pnpm mesh:up                          # Start infrastructure (Docker)
pnpm db:provision                     # Provision database schemas
pnpm build                            # Build all packages
pnpm dev                              # Start all services
```

See [Deployment Guide](docs/athyper/deployment/README.md) for full setup.

## Technology Stack

| Layer         | Technologies                                              |
| ------------- | --------------------------------------------------------- |
| Backend       | Node.js 20, TypeScript 5.9, Express 4, BullMQ             |
| Frontend      | Next.js 14, React 19, Tailwind CSS 4, Radix UI, Zustand 5 |
| Data          | PostgreSQL 16, Kysely, Redis/ioredis, Prisma 6            |
| Auth          | Keycloak, JOSE (JWT), PKCE, Redis sessions                |
| Infra         | Docker, Traefik, PgBouncer, MinIO (S3)                    |
| Observability | OpenTelemetry, Pino, Grafana, Prometheus, Tempo, Loki     |
| Build         | pnpm 10, Turbo 2.8, Vitest 4, tsup, ESLint 9              |

## Commands

| Command               | Description                        |
| --------------------- | ---------------------------------- |
| `pnpm dev`            | Start all services in dev mode     |
| `pnpm build`          | Build all packages                 |
| `pnpm test`           | Run tests (Vitest)                 |
| `pnpm lint`           | Lint all packages                  |
| `pnpm typecheck`      | TypeScript type checking           |
| `pnpm check`          | Lint + typecheck + test + depcheck |
| `pnpm mesh:up`        | Start Docker infrastructure        |
| `pnpm mesh:down`      | Stop Docker infrastructure         |
| `pnpm db:provision`   | Provision database (DDL + seed)    |
| `pnpm db:studio`      | Open Prisma Studio                 |
| `pnpm kysely:codegen` | Generate Kysely types from DB      |
