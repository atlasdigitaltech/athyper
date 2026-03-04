# Build & Tooling

How the monorepo builds, lints, tests, and enforces architecture boundaries.

## Tool Stack

| Tool                   | Version | Purpose                                   |
| ---------------------- | ------- | ----------------------------------------- |
| **pnpm**               | 10.28   | Package manager with workspaces           |
| **Turborepo**          | 2.8     | Build orchestration (caching, task graph) |
| **TypeScript**         | 5.9     | Type checking                             |
| **Vitest**             | 4.x     | Unit and integration testing              |
| **ESLint**             | 9.x     | Linting (flat config)                     |
| **Prettier**           | 3.8     | Code formatting                           |
| **dependency-cruiser** | 17.x    | Architecture boundary validation          |
| **tsup**               | —       | Library bundling (adapters, i18n)         |
| **Next.js**            | 16      | Product build (Neon web app)              |

## Scripts Reference

### Build & Development

| Script                | Purpose                                                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`            | Start all packages in dev mode. Runs `turbo run dev --parallel --continue` so every workspace starts concurrently and a failure in one does not stop the others. |
| `pnpm build`          | Build all packages ordered by the Turborepo dependency graph. A package is only built after all of its workspace dependencies have finished building.            |
| `pnpm build:all`      | Same as `build` but passes `--continue` so Turbo keeps building other packages even when one fails. Useful for seeing the full set of errors in a single run.    |
| `pnpm clean`          | Remove build artifacts (`.turbo`, `dist`, `.next`) from every workspace via `turbo run clean`, then delete the root `.turbo` cache directory.                    |
| `pnpm clean:deps`     | Delete `node_modules` and `.turbo` at the repo root. Does not touch workspace-level `node_modules` (pnpm hoists by default).                                     |
| `pnpm clean:all`      | Full clean: runs `clean` + `clean:deps` + removes `pnpm-lock.yaml`. Use when you need a completely fresh dependency tree.                                        |
| `pnpm clean:reset`    | Nuclear option: runs `clean:all`, then `pnpm install` and `pnpm build` to get back to a known-good state from scratch.                                           |
| `pnpm clean:deep`     | Runs `clean:all` then executes `tooling/devtools/clean-deep.mjs` to remove stale generated files, leftover caches, and other deep artifacts.                     |
| `pnpm prune:neon-web` | Generate a Docker-optimized pruned monorepo containing only `@neon/web` and its transitive dependencies. Output goes to `out/` for Docker COPY.                  |
| `pnpm doctor`         | Print Node.js, pnpm, and Turbo versions. Quick sanity check that the local toolchain matches expectations.                                                       |

### Quality

| Script                | Purpose                                                                                                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`           | Lint the entire repo with ESLint using `--cache` for incremental runs. Runs ESLint directly from the root (not via Turbo) so all files are checked in one pass.                     |
| `pnpm lint:fix`       | Same as `lint` but with `--fix` to auto-correct all fixable issues (unused imports, import ordering, consistent type imports).                                                      |
| `pnpm lint:errors`    | Lint with `--quiet` to suppress warnings and show only errors. Useful for a quick pass-fail check in scripts.                                                                       |
| `pnpm lint:strict`    | Lint with `--max-warnings=0` so any warning is treated as a failure. Use in CI or before merging to enforce zero-warning hygiene.                                                   |
| `pnpm typecheck`      | Type-check all packages via Turborepo. Turbo respects inter-package type dependencies (`^typecheck`) so a package's types are checked after its dependencies.                       |
| `pnpm typecheck:all`  | Same as `typecheck` but with `--continue` to report type errors across all packages even when one fails early.                                                                      |
| `pnpm test`           | Run all tests via Turborepo. Each workspace runs its own Vitest suite; Turbo handles ordering and caching.                                                                          |
| `pnpm test:all`       | Same as `test` but with `--continue` to run every workspace's test suite even if an earlier one fails.                                                                              |
| `pnpm test:policy`    | Run only the META Engine policy rule tests inside `@athyper/runtime`. Targets the `test:policy` script in the runtime workspace.                                                    |
| `pnpm test:policy:ci` | CI variant of policy tests with stricter output settings and non-interactive mode.                                                                                                  |
| `pnpm format`         | Format every file in the repo with Prettier (writes changes in place). Covers `.ts`, `.tsx`, `.js`, `.json`, `.md`, `.yaml`, and more.                                              |
| `pnpm format:changed` | Format only files matching common source patterns (`**/*.{ts,tsx,js,jsx,md,json,yaml,yml}`). Lighter alternative to `format` when you only changed a few files.                     |
| `pnpm format:check`   | Check formatting without writing changes. Exits non-zero if any file is unformatted. Used in CI to enforce consistent formatting.                                                   |
| `pnpm depcheck`       | Run dependency-cruiser against `framework/`, `packages/`, `products/`, `tooling/`, and `tools/` to validate architecture boundaries. See [Dependency Cruiser](#dependency-cruiser). |
| `pnpm check`          | Full local quality gate: runs `lint` → `typecheck` → `test` → `depcheck` sequentially. If any step fails, subsequent steps are skipped.                                             |
| `pnpm check:ci`       | CI quality gate: runs `format:check` first (catches unformatted files), then the full `check` pipeline. This is the primary CI entrypoint.                                          |

### Database

#### Provisioning (SQL-based, checksum-tracked)

| Script                     | Purpose                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm db:provision`        | Run the full SQL provisioning pipeline (DDL + seed data). Each SQL file is checksummed; only changed files are re-applied. Idempotent on repeated runs. |
| `pnpm db:provision:ddl`    | Run only the DDL (schema) portion of provisioning. Applies table, index, and function definitions without touching seed data.                           |
| `pnpm db:provision:seed`   | Run only the seed data portion. Inserts reference data (currencies, UNSPSC codes, HS codes, etc.) without modifying schema.                             |
| `pnpm db:provision:reset`  | Clear all provisioning checksums and re-run the full pipeline from scratch. Use after manually altering the database outside of provisioning.           |
| `pnpm db:provision:status` | Display which SQL files have been applied and which are pending. Shows checksum mismatches for files that changed since last run.                       |
| `pnpm db:provision:force`  | Force-run provisioning regardless of checksum state. Use when a previous run was interrupted or left in an inconsistent state.                          |

#### Prisma Migrations

| Script            | Purpose                                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm db:migrate` | Create a new Prisma migration from schema changes (dev workflow). Alias: `db:migrate:dev`. Generates a migration file under `prisma/migrations/`. |
| `pnpm db:deploy`  | Apply pending Prisma migrations to the target database without generating new ones. Alias: `db:migrate:deploy`. Used in CI/CD.                    |
| `pnpm db:reset`   | Reset the database: drops all tables, re-applies all migrations, and re-seeds. **Destructive** — only use in development.                         |

#### Schema Introspection & Type Generation

| Script                | Purpose                                                                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm db:generate`    | Run `prisma generate` to regenerate the Prisma client types from the current Prisma schema. Required after changing `schema.prisma`.            |
| `pnpm db:pull`        | Introspect the live database and update `schema.prisma` to match. Use when the database was changed outside of Prisma (e.g., via provisioning). |
| `pnpm db:pull:force`  | Same as `db:pull` but forces overwrite of the schema file even if there are uncommitted changes.                                                |
| `pnpm db:studio`      | Open Prisma Studio, a browser-based GUI for exploring and editing database records. Runs on `http://localhost:5555`.                            |
| `pnpm kysely:codegen` | Generate the Kysely `DB` type interface from the current database schema. Outputs to `framework/adapters/db/src/generated/`.                    |

### Meta-Engine

| Script                     | Purpose                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm meta:migrate:plan`   | Analyze current entity definitions and generate a migration plan showing what DDL changes are needed. Does not apply changes.         |
| `pnpm meta:migrate:dev`    | Apply pending meta-engine migrations in development mode. Creates tables, columns, and indexes for new or changed entity definitions. |
| `pnpm meta:migrate:deploy` | Apply pending meta-engine migrations in production mode. Same SQL as dev but with stricter safety checks and no interactive prompts.  |
| `pnpm meta:migrate:sql`    | Generate raw SQL output from pending meta migrations without applying them. Useful for review or manual execution.                    |

### Code Generation

| Script                       | Purpose                                                                                                                     |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `pnpm athyper:codegen`       | Run the athyper code generator (`tools/codegen`). Produces TypeScript types, module registrations, and dashboard manifests. |
| `pnpm athyper:codegen:watch` | Run code generation in watch mode. Automatically regenerates when source definitions change.                                |
| `pnpm db:publish`            | Publish generated database types to their target workspace packages so downstream code can import them.                     |
| `pnpm db:publish:dry-run`    | Preview what `db:publish` would do without writing any files. Useful for verifying generated output before committing.      |

### Runtime

| Script                     | Purpose                                                                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm runtime:start`       | Start the runtime server in production mode. Boots the kernel, registers all service modules, and listens on the configured HTTP port. |
| `pnpm runtime:start:dev`   | Start the runtime in development mode with debug logging enabled. Equivalent to `NODE_ENV=development` start.                          |
| `pnpm runtime:start:watch` | Start the runtime with file watching (via `tsx --watch` or similar). Automatically restarts on source file changes during development. |

### Infrastructure

| Script           | Purpose                                                                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm mesh:up`   | Start the local development infrastructure stack via Docker Compose (`mesh/compose/compose.yml`). Includes PostgreSQL, Redis, Keycloak, and MinIO. |
| `pnpm mesh:down` | Stop and remove all containers in the infrastructure stack. Volumes are preserved so data survives restarts.                                       |
| `pnpm mesh:logs` | Tail the last 200 lines of logs across all infrastructure containers and follow new output. Press Ctrl+C to stop.                                  |
| `pnpm mesh:ps`   | Show the status of all infrastructure containers (running, stopped, health checks).                                                                |

### Dependency Analysis

| Script               | Purpose                                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `pnpm deps:why`      | Run `pnpm -r why` to show why a specific package is installed. Traces the dependency chain across all workspaces. |
| `pnpm deps:outdated` | Run `pnpm -r outdated` to list packages with newer versions available across all workspaces.                      |

---

## Turborepo Pipeline

Defined in `turbo.json`. Turborepo understands the workspace dependency graph and:

- Runs tasks in correct order (build dependencies before dependents)
- Caches outputs (skips rebuilds when inputs haven't changed)
- Parallelizes independent tasks

Key pipelines:

| Pipeline    | Depends On                        | Outputs                                                      | Cache |
| ----------- | --------------------------------- | ------------------------------------------------------------ | ----- |
| `build`     | `^build` (all dependencies first) | `dist/**`, `.next/**`, `build/**`, `out/**`, `*.tsbuildinfo` | yes   |
| `lint`      | — (parallel)                      | —                                                            | yes   |
| `typecheck` | `^typecheck` (type deps first)    | `*.tsbuildinfo`                                              | yes   |
| `test`      | `^test` (test deps first)         | `coverage/**`                                                | yes   |
| `dev`       | — (parallel, persistent)          | —                                                            | no    |
| `clean`     | —                                 | —                                                            | no    |
| `depcheck`  | —                                 | —                                                            | no    |

The `build` pipeline also reads environment variables (`DATABASE_URL`, `KEYCLOAK_URL`, `REDIS_URL`, etc.) and `.env*` files as inputs, so an env change invalidates the cache.

---

## ESLint Configuration

Single flat config in `eslint.config.js`. Key rules:

### Import Discipline

| Rule                                         | Severity | Effect                                                                                                                                                 |
| -------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `import/order`                               | error    | Enforces import group ordering: builtin > external > internal > parent > sibling > index > type, with blank lines between groups and alphabetical sort |
| `import/no-duplicates`                       | error    | No duplicate import paths                                                                                                                              |
| `import/no-cycle`                            | warn     | Warns on circular imports                                                                                                                              |
| `unused-imports/no-unused-imports`           | error    | Removes dead imports                                                                                                                                   |
| `@typescript-eslint/consistent-type-imports` | error    | Forces `import type` for type-only imports                                                                                                             |

### Architecture Boundaries

| Rule                       | Severity | Effect                                        |
| -------------------------- | -------- | --------------------------------------------- |
| `boundaries/no-unknown`    | error    | All files must belong to a classified element |
| `boundaries/element-types` | error    | Enforces layer dependencies (see below)       |

**Element classification:**

```
core      = framework/core/src/**
adapter   = framework/adapters/*/src/**
runtime   = framework/runtime/src/**
pkg       = packages/*/src/**
product   = products/*/apps/*/**
tooling   = tooling/**
tool      = tools/*/src/**
```

**Allowed dependencies:**

```
core     → core
adapter  → adapter, core
runtime  → runtime, core, adapter
pkg      → pkg
product  → product, pkg
tooling  → everything
tool     → tool, pkg, core
```

### Restricted Imports (Safety Nets)

| Layer                   | Cannot Import                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `core`                  | runtime, adapters, packages, products                                                                            |
| `runtime`               | Deep adapter internals (`adapter-*/src/*`, `adapter-*/dist/*`)                                                   |
| `packages` + `products` | Framework packages (`@athyper/core`, `@athyper/runtime`, `@athyper/adapter-*`), Prisma, deep workspace internals |

---

## TypeScript Configuration

### Base Config (`tooling/tsconfig/`)

Shared presets:

- `base.json` — Strict mode, ESM, path aliases
- `next.json` — Next.js-specific settings (JSX, module resolution)

### Workspace Configs

Each workspace package has its own `tsconfig.json` extending the base:

```json
{
  "extends": "../../tooling/tsconfig/base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

### Type Checking

```bash
# Check a specific package
npx tsc --noEmit --project framework/runtime/tsconfig.json

# Check all packages (via Turbo)
pnpm typecheck
```

---

## Testing

### Vitest Setup

Root `vitest.config.ts` runs all tests. Each test file co-locates with its source:

```
service.ts
service.test.ts
__tests__/
  integration.test.ts
```

### Running Tests

```bash
# All tests
npx vitest run

# Watch mode
npx vitest

# Specific file
npx vitest run framework/runtime/src/kernel/container.test.ts

# With coverage
npx vitest run --coverage

# Policy tests only
pnpm test:policy

# All packages, continue on failure
pnpm test:all
```

### Test Distribution (101 test files)

| Area                        | Test Files | Focus                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `framework/core`            | 7          | Circuit breaker, retry, rate limiter, input sanitizer, input validator, RBAC policy evaluation, health check                                                                                                                                                                                                                                                                                                                                                                                   |
| `framework/adapters`        | 2          | Auth adapter (Keycloak JWKS verification), Redis memory cache adapter                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `framework/runtime/kernel`  | 3          | DI container wiring, container adapter registration, structured logger                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `platform/meta`             | 18         | Schema compiler, integration workflow, generic data API, lifecycle (timer, terminal state, approval bridge, SLA scheduling), approval, approver resolver, numbering engine, entity classification, DDL classification, cascade delete, entity descriptor, effective dating, create pipeline, validation rule engine, performance benchmarks                                                                                                                                                    |
| `platform/audit-governance` | 25         | Hash chain integrity, redaction pipeline, DLQ (dead-letter queue), column encryption, audit integrity verification, immutability guard, event taxonomy, load shedding, rate limiting, metrics collection, query gate, query performance contracts, replay, export, feature flags, storage tiering, timeline cache, outbox drain, partition lifecycle, privileged access separation, workflow audit repository, resilient audit writer, correctness invariants, security hardening, UX features |
| `platform/foundation`       | 10         | HTTP health/readiness/liveness handlers, IAM handlers, persona registry, cross-tenant isolation, CSRF protection, environment guardrails, realm safety, session store                                                                                                                                                                                                                                                                                                                          |
| `platform/policy-rules`     | 7          | Rule evaluator, facts provider, policy simulator, simulator audit replay, evaluator integration, performance benchmarks                                                                                                                                                                                                                                                                                                                                                                        |
| `platform-services/*`       | 7          | Content taxonomy validation, storage key builder, orphaned upload cleanup worker, document HTML composer, PDF renderer, render DLQ manager, output status state machine                                                                                                                                                                                                                                                                                                                        |
| `enterprise-services/*`     | 3          | In-app messaging conversation model, message model, persistence repositories                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `business/*`                | 9          | Finance handler contracts, manual journal entry lifecycle, purchase invoice lifecycle, payment lifecycle, bank reconciliation, GL inquiry, money library, budget engine fund lifecycle, federation engine IC posting                                                                                                                                                                                                                                                                           |
| `packages`                  | 3          | Dashboard layout schema, widget params schema, API client content client                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `products/neon`             | 5          | Entity fields hook, entity forms hook, entity views hook, avatar color utility, sidebar visibility                                                                                                                                                                                                                                                                                                                                                                                             |

---

## Dependency Cruiser

Architecture validation via `.dependency-cruiser.cjs`. Validates:

- No circular dependencies within modules
- Layer boundary compliance (same rules as ESLint boundaries, but at import-graph level)
- No imports from forbidden zones

```bash
# Run dependency check
pnpm depcheck
```

---

## Code Generation Pipeline

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
pnpm db:pull          # Pull schema from DB → Prisma schema
pnpm db:generate      # Generate Prisma client types
pnpm kysely:codegen   # Generate Kysely types
```

---

## Adapter Rebuild Requirements

Some packages produce `.d.ts` files that downstream packages consume. After modifying these, you must rebuild before type-checking dependents:

| Package                 | Rebuild Command                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `@athyper/adapter-auth` | `cd framework/adapters/auth && npx tsup src/index.ts --format esm --dts --sourcemap --outDir dist` |
| `@athyper/i18n`         | `cd packages/i18n && npx tsup src/index.ts --format esm --dts --sourcemap --outDir dist`           |
