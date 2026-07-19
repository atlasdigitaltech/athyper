# athyper

Multi-tenant enterprise platform: monorepo containing three Next.js product
planes, a shared runtime server, shared packages, and the infrastructure stack.

## Documentation

Canonical docs live under [docs/](docs/). The most-used entry points:

### Infrastructure & deployment — [docs/infrastructure/](docs/infrastructure/README.md)

| Resource | Path |
|----------|------|
| Local development setup (Windows) | [docs/infrastructure/local-dev-setup.md](docs/infrastructure/local-dev-setup.md) |
| Environments matrix (local / staging / production) | [docs/infrastructure/environments.md](docs/infrastructure/environments.md) |
| Staging server installation runbook (Phases 0–26) | [docs/infrastructure/staging-setup.md](docs/infrastructure/staging-setup.md) |
| Staging day-2 operations (CI/CD, ops, security checklist) | [docs/infrastructure/staging-operations.md](docs/infrastructure/staging-operations.md) |
| Architecture overview + v13 permission model | [docs/infrastructure/infrastructure-plan.md](docs/infrastructure/infrastructure-plan.md) |
| Secrets management (inventory, rotation, backends) | [docs/infrastructure/secrets-management.md](docs/infrastructure/secrets-management.md) |
| Weekly DB reset / re-seed / export runbook | [docs/infrastructure/weekly-reset-reseed-export.md](docs/infrastructure/weekly-reset-reseed-export.md) |
| Env variable reference (all vars + config layers) | [docs/infrastructure/env-reference.md](docs/infrastructure/env-reference.md) |
| Stack scripts reference | [docs/infrastructure/scripts-reference.md](docs/infrastructure/scripts-reference.md) |
| Docker services reference | [docs/infrastructure/docker-services.md](docs/infrastructure/docker-services.md) |
| Mesh DB provisioning | [docs/infrastructure/mesh-seed-db.md](docs/infrastructure/mesh-seed-db.md) |

### Compose profiles, IAM, render, monitoring

| Resource | Path |
|----------|------|
| Analytics profile (Metabase, deferred) | [docs/infrastructure/profile-analytics.md](docs/infrastructure/profile-analytics.md) |
| Security profiles (ClamAV, Infisical) | [docs/infrastructure/profile-security.md](docs/infrastructure/profile-security.md) |
| Render profile (Gotenberg, Tika) | [docs/infrastructure/profile-render.md](docs/infrastructure/profile-render.md) |
| Keycloak realm config | [docs/infrastructure/iam-realm-config.md](docs/infrastructure/iam-realm-config.md) |
| Keycloak protocol mappers | [docs/infrastructure/iam-protocol-mappers.md](docs/infrastructure/iam-protocol-mappers.md) |
| Render pipeline tuning + DLQ contract | [docs/infrastructure/render-pipeline-config.md](docs/infrastructure/render-pipeline-config.md) |
| Uptime Kuma (statuswatch) monitors | [docs/infrastructure/monitoring-statuswatch.md](docs/infrastructure/monitoring-statuswatch.md) |

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

# 2. Create local stack env
bash stack/scripts/setup/setup-env.sh local stack

# 3. First-time stack setup
bash stack/scripts/setup/data-dirs-create.sh

# 4. Start infrastructure (Postgres, Redis, Keycloak, MinIO, …)
bash stack/scripts/stack-profile/up.sh core

# 5. Run migrations + seed data
cd server && tsx db/seed/migrate.ts --all && cd ..

# 6. Start dev servers
pnpm dev
```

Neon app: http://localhost:3000 · API: http://localhost:4000

See [docs/infrastructure/local-dev-setup.md](docs/infrastructure/local-dev-setup.md) for the full local walkthrough and [docs/infrastructure/staging-setup.md](docs/infrastructure/staging-setup.md) for the Ubuntu staging runbook.

## Repo structure

```
apps/neon/       Tenant/customer operating plane
apps/mesh/       Partner/supplier collaboration plane
apps/admin/      Internal platform administration plane
packages/        Shared, domain, and product TypeScript packages
server/          Shared Express API + BullMQ workers + DB DDL/seeds
stack/           Docker Compose infrastructure stack
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
