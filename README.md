# athyper

Multi-tenant enterprise platform — monorepo containing the API server, Next.js web app, shared packages, and infrastructure stack.

## Quick links

| Resource | Path |
|----------|------|
| Developer onboarding guide | [docs/developer-onboarding.md](docs/developer-onboarding.md) |
| Infrastructure (Stack) | [stack/README.md](stack/README.md) |
| Runbooks | [docs/runbooks/README.md](docs/runbooks/README.md) |
| DB migration notes | [server/MIGRATION.md](server/MIGRATION.md) |

## Prerequisites

Node.js ≥ 20, pnpm ≥ 9, Docker with Compose, git ≥ 2.40.

```bash
node -v && pnpm -v && docker info
```

## 5-minute setup

```bash
# 1. Clone and install
git clone <repo-url> athyper && cd athyper
pnpm install

# 2. Copy env files
cp server/.env.example server/.env
# → edit server/.env: set KEYCLOAK_CLIENT_SECRET (ask team)

# 3. First-time stack setup
bash stack/scripts/setup/data-dirs-create.sh
bash stack/scripts/setup/setup-env.sh local

# 4. Start infrastructure (Postgres, Redis, Keycloak, MinIO, …)
bash stack/scripts/stack/up.sh

# 5. Run migrations + seed data
cd server && tsx db/seed/migrate.ts --all && cd ..

# 6. Start dev servers
pnpm dev
```

Web app: http://localhost:3000 · API: http://localhost:4000

See [docs/developer-onboarding.md](docs/developer-onboarding.md) for the full walkthrough, entity registration patterns, worker templates, and PR workflow.

## Repo structure

```
apps/web/        Next.js 16 frontend
packages/        Shared TypeScript packages (data, ui, runtime, shell, domain)
server/          Express API + BullMQ workers + DB migrations
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
pnpm dev --filter @athyper/web              # Next.js only
pnpm dev --filter @athyper/runtime-server   # API + workers only

# DB
cd server
tsx db/seed/migrate.ts --status   # show migration state
tsx db/seed/migrate.ts --all      # run all phases
tsx db/seed/migrate.ts --reset    # drop + re-seed (local dev only)
```
