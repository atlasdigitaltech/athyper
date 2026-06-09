# athyper

Multi-tenant enterprise platform: monorepo containing three Next.js product
planes, a shared runtime server, shared packages, and the infrastructure stack.

## Quick links

| Resource | Path |
|----------|------|
| Local development setup | [stack/docs/local-dev-setup.md](stack/docs/local-dev-setup.md) |
| Folder boundary map | [docs/architecture/folder-boundary-map.md](docs/architecture/folder-boundary-map.md) |
| Staging deployment runbook | [stack/docs/staging-setup.md](stack/docs/staging-setup.md) |
| Env file contract | [stack/env/README.md](stack/env/README.md) |
| Secrets management | [stack/docs/secrets-management.md](stack/docs/secrets-management.md) |
| Stack scripts | [stack/scripts/README.md](stack/scripts/README.md) |

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

See [stack/docs/local-dev-setup.md](stack/docs/local-dev-setup.md) for the full local walkthrough and [stack/docs/staging-setup.md](stack/docs/staging-setup.md) for the Ubuntu staging runbook.

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
