# athyper

Multi-tenant enterprise platform: monorepo containing three Next.js product
planes, a shared runtime server, shared packages, and the infrastructure stack.

## Documentation

Canonical docs live under [docs/](docs/). The most-used entry points:

### Infrastructure & deployment — [docs/infrastructure/](docs/infrastructure/README.md)

| Resource | Path |
|----------|------|
| Stack v2 controller and runtime | [deploy/README.md](deploy/README.md) |
| Stack v2 machine build plan | [docs/infrastructure/stack-v2-new-machine-build-plan.md](docs/infrastructure/stack-v2-new-machine-build-plan.md) |
| Workload placement | [docs/infrastructure/stack-v2-workload-placement.md](docs/infrastructure/stack-v2-workload-placement.md) |
| Architecture overview + v13 permission model | [docs/infrastructure/infrastructure-plan.md](docs/infrastructure/infrastructure-plan.md) |

### IAM and platform configuration

| Resource | Path |
|----------|------|
| Keycloak realm config | [docs/infrastructure/iam-realm-config.md](docs/infrastructure/iam-realm-config.md) |
| Keycloak protocol mappers | [docs/infrastructure/iam-protocol-mappers.md](docs/infrastructure/iam-protocol-mappers.md) |

### Architecture, meta-entity, specs

| Resource | Path |
|----------|------|
| Local docs index (ADRs, architecture, audits) | [docs/local/README.md](docs/local/README.md) |
| Folder boundary map | [docs/local/architecture/folder-boundary-map.md](docs/local/architecture/folder-boundary-map.md) |
| Meta-entity model docs | [docs/meta-entity/](docs/meta-entity/) |
| Integration specs | [docs/integrations/](docs/integrations/) |
| Specs | [docs/specs/](docs/specs/) |

## Prerequisites

Node.js >= 22, pnpm 10.33.0 via Corepack, Docker with Compose, git >= 2.40.

```bash
node -v && pnpm -v && docker info
```

## 5-minute setup

```bash
# 1. Clone and install
git clone <repo-url> athyper && cd athyper
pnpm install

# 2. Inspect the Stack v2 plan
pnpm athyper plan dev

# 3a. Start a new empty DEV database
pnpm athyper up dev --confirm dev

# 3b. Or start an already initialized DEV database
pnpm athyper up dev --confirm dev --preserve-database

# 4. Start lightweight shared telemetry
pnpm athyper operations up lite --confirm lite
```

Neon: https://neon.dev.athyper.test · Studio: https://studio.dev.athyper.test · Mesh: https://mesh.dev.athyper.test

See [deploy/README.md](deploy/README.md) for the controller, operations, backup, and environment lifecycle.

## Repo structure

```
apps/neon/       Tenant/customer operating plane
apps/mesh/       Partner/supplier collaboration plane
apps/admin/      Internal platform administration plane
packages/        Shared, domain, and product TypeScript packages
server/          Shared Express API + BullMQ workers + DB DDL/seeds
deploy/          Stack v2 Compose, controller, catalogs, and instance definitions
stack/config/    Shared IAM, branding, and validation assets used by Stack v2 builds
perf/k6/         Load test scripts
tooling/         Shared tsconfig bases
```

## Common commands

```bash
pnpm dev                  # start all packages in watch mode
pnpm lint                 # ESLint across workspace
pnpm typecheck            # TypeScript strict check
pnpm test                 # Vitest unit tests

# Scoped
pnpm dev --filter @athyper/neon             # Neon app only
pnpm dev --filter @athyper/mesh             # Mesh app only
pnpm dev --filter @athyper/admin            # Admin app only
pnpm dev --filter @athyper/runtime-server   # API + workers only

# DB
cd server
tsx db/seed/migrate.ts --status   # show migration state
tsx db/seed/migrate.ts --all      # run all phases
tsx db/seed/migrate.ts --reset    # drop + re-seed (local dev only)
```
