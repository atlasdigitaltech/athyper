# Build & Tooling

How the monorepo builds, lints, tests, and enforces architecture boundaries.

## Tool Stack

| Tool | Version | Purpose |
|------|---------|---------|
| **pnpm** | 10.28 | Package manager with workspaces |
| **Turborepo** | 2.8 | Build orchestration (caching, task graph) |
| **TypeScript** | 5.9 | Type checking |
| **Vitest** | 4.x | Unit and integration testing |
| **ESLint** | 9.x | Linting (flat config) |
| **Prettier** | 3.8 | Code formatting |
| **dependency-cruiser** | 17.x | Architecture boundary validation |
| **tsup** | — | Library bundling (adapters, i18n) |
| **Next.js** | 14 | Product build (Neon web app) |

## Scripts Reference

### Build & Development

| Script | Purpose |
|--------|---------|
| `pnpm dev` | Start all packages in dev mode (parallel, via Turbo) |
| `pnpm build` | Build all packages (ordered by dependency graph) |
| `pnpm build:all` | Build all packages, continue on error |
| `pnpm clean` | Remove build artifacts (.turbo, dist, .next) |
| `pnpm clean:deps` | Remove node_modules |
| `pnpm clean:all` | Full clean (artifacts + deps + lockfile) |
| `pnpm clean:reset` | Full clean + reinstall + rebuild |
| `pnpm doctor` | Print Node, pnpm, Turbo versions |

### Quality

| Script | Purpose |
|--------|---------|
| `pnpm lint` | Lint all packages (via Turbo) |
| `pnpm lint:root` | Lint from root (direct ESLint, --max-warnings=0) |
| `pnpm lint:fix` | Auto-fix all lint issues |
| `pnpm typecheck` | Type-check all packages (via Turbo) |
| `pnpm test` | Run all tests (via Turbo) |
| `pnpm format` | Format all files with Prettier |
| `pnpm format:check` | Check formatting (CI mode) |
| `pnpm depcheck` | Validate architecture boundaries (dependency-cruiser) |
| `pnpm check` | Full check: lint + typecheck + test + depcheck |
| `pnpm check:ci` | CI check: format:check + check |

### Database

| Script | Purpose |
|--------|---------|
| `pnpm db:provision` | Run SQL provisioning (DDL + seed, checksum-tracked) |
| `pnpm db:provision:ddl` | Run DDL only |
| `pnpm db:provision:seed` | Run seed only |
| `pnpm db:provision:reset` | Reset provisioning checksums and re-run |
| `pnpm db:provision:status` | Show provisioning status |
| `pnpm db:generate` | Run Prisma generate (types) |
| `pnpm db:pull` | Pull schema from live database |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm kysely:codegen` | Generate Kysely types from DB |

### Meta-Engine

| Script | Purpose |
|--------|---------|
| `pnpm meta:migrate:plan` | Plan meta-engine migration |
| `pnpm meta:migrate:dev` | Run meta migrations (dev) |
| `pnpm meta:migrate:deploy` | Deploy meta migrations |
| `pnpm meta:migrate:sql` | Generate SQL from meta migrations |

### Code Generation

| Script | Purpose |
|--------|---------|
| `pnpm athyper:codegen` | Run code generation |
| `pnpm athyper:codegen:watch` | Watch mode code generation |
| `pnpm db:publish` | Publish generated types |

### Runtime

| Script | Purpose |
|--------|---------|
| `pnpm runtime:start` | Start runtime server |
| `pnpm runtime:start:dev` | Start runtime in dev mode |
| `pnpm runtime:start:watch` | Start runtime with file watching |

### Infrastructure

| Script | Purpose |
|--------|---------|
| `pnpm mesh:up` | Start Docker Compose infrastructure |
| `pnpm mesh:down` | Stop Docker Compose infrastructure |
| `pnpm mesh:logs` | Tail infrastructure logs |
| `pnpm mesh:ps` | Show infrastructure container status |

---

## Turborepo Pipeline

Defined in `turbo.json`. Turborepo understands the workspace dependency graph and:

- Runs tasks in correct order (build dependencies before dependents)
- Caches outputs (skips rebuilds when inputs haven't changed)
- Parallelizes independent tasks

Key pipelines:

| Pipeline | Depends On | Outputs |
|----------|-----------|---------|
| `build` | `^build` (all dependencies first) | `dist/**`, `.next/**` |
| `lint` | — (parallel) | — |
| `typecheck` | `^build` | — |
| `test` | `^build` | `coverage/**` |
| `dev` | — | — |

---

## ESLint Configuration

Single flat config in `eslint.config.js`. Key rules:

### Import Discipline

| Rule | Severity | Effect |
|------|----------|--------|
| `import/order` | error | Enforces import group ordering: builtin > external > internal > parent > sibling > index > type, with blank lines between groups and alphabetical sort |
| `import/no-duplicates` | error | No duplicate import paths |
| `import/no-cycle` | warn | Warns on circular imports |
| `unused-imports/no-unused-imports` | error | Removes dead imports |
| `@typescript-eslint/consistent-type-imports` | error | Forces `import type` for type-only imports |

### Architecture Boundaries

| Rule | Severity | Effect |
|------|----------|--------|
| `boundaries/no-unknown` | error | All files must belong to a classified element |
| `boundaries/element-types` | error | Enforces layer dependencies (see below) |

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

| Layer | Cannot Import |
|-------|---------------|
| `core` | runtime, adapters, packages, products |
| `runtime` | Deep adapter internals (`adapter-*/src/*`, `adapter-*/dist/*`) |
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

# Policy tests
pnpm test:policy
```

### Test Distribution

| Area | Test Files | Focus |
|------|-----------|-------|
| `framework/core` | 7 | Circuit breaker, retry, rate limiter, sanitizer, validator, RBAC, health |
| `framework/runtime/kernel` | 3 | DI container, logger |
| `platform/meta` | 16 | Compiler, lifecycle, approval, numbering, classification, rules |
| `platform/audit-governance` | 25 | Hash chain, redaction, DLQ, encryption, integrity, load shedding |
| `platform/foundation` | 5 | Health, readiness, liveness handlers |
| `platform/policy-rules` | 5 | Rule evaluator, facts provider, simulator |
| `platform-services/*` | 8 | Content taxonomy, storage keys, orphaned uploads, document rendering |
| `enterprise-services/*` | 4 | Conversation model, message model, repositories |
| `packages/dashboard` | 3 | Layout schema, widget params |
| `products/neon` | 3 | Entity fields, entity forms, entity views hooks |

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

| Package | Rebuild Command |
|---------|----------------|
| `@athyper/adapter-auth` | `cd framework/adapters/auth && npx tsup src/index.ts --format esm --dts --sourcemap --outDir dist` |
| `@athyper/i18n` | `cd packages/i18n && npx tsup src/index.ts --format esm --dts --sourcemap --outDir dist` |
