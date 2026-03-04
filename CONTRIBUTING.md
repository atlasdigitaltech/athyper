# Contributing to Athyper

Guide for new developers joining the project. Covers setup, conventions, architecture rules, and daily workflow.

## First-Time Setup

### 1. Prerequisites

| Tool    | Version       | Install                                                      |
| ------- | ------------- | ------------------------------------------------------------ |
| Node.js | 20.20.0       | `nvm install` (reads `.nvmrc`)                               |
| pnpm    | 10.28.2       | `corepack enable` (reads `packageManager` in `package.json`) |
| Docker  | Latest stable | [docker.com](https://www.docker.com/products/docker-desktop) |
| Git     | >= 2.30       |                                                              |

### 2. Clone and Install

```bash
git clone <repository-url>
cd athyper-private

# Activate correct Node version
nvm install && nvm use

# Enable corepack (ensures correct pnpm version)
corepack enable

# Install dependencies
pnpm install

# Build all packages in dependency order
pnpm build
```

### 3. Configure Local Environment

```bash
# Set up mesh environment (auto-prompted on first mesh:up, or run manually)
# Windows:  mesh\scripts\setup-env.bat local
# Linux/macOS: ./mesh/scripts/setup-env.sh local

# Hosts file (run as admin on Windows, sudo on macOS/Linux)
# Add to C:\Windows\System32\drivers\etc\hosts or /etc/hosts:
#
# 127.0.0.1 gateway.mesh.athyper.local
# 127.0.0.1 iam.mesh.athyper.local
# 127.0.0.1 objectstorage.mesh.athyper.local
# 127.0.0.1 objectstorage.console.mesh.athyper.local
# 127.0.0.1 telemetry.mesh.athyper.local
# 127.0.0.1 metrics.mesh.athyper.local
# 127.0.0.1 traces.mesh.athyper.local
# 127.0.0.1 logs.mesh.athyper.local
# 127.0.0.1 neon.athyper.local
# 127.0.0.1 api.athyper.local
```

### 4. Start the Platform

```bash
# Terminal 1: Infrastructure
pnpm mesh:up
cd mesh/scripts && ./init-data.sh   # First time only

# Terminal 2: Runtime kernel (port 3000)
pnpm runtime:start:watch

# Terminal 3: Neon web app (port 3001)
pnpm --filter @neon/web dev
```

Verify: `curl http://localhost:3000/health` should return `"status": "healthy"`.

See [Deployment Guide](docs/athyper/deployment/README.md) for the full setup guide with troubleshooting.

## Project Structure

```text
athyper-private/
├── framework/                    # Core platform (engine)
│   ├── core/                     # @athyper/core — pure business logic, zero infra deps
│   ├── runtime/                  # @athyper/runtime — kernel, DI, HTTP, middleware
│   └── adapters/                 # Infrastructure adapters (db, auth, cache, storage, telemetry)
├── packages/                     # Shared libraries (UI, auth, api-client, i18n, dashboard, workbenches)
├── products/neon/                # Neon product (Next.js web app, BFF auth, content, themes)
├── tooling/                      # Shared ESLint config, TypeScript config
├── tools/                        # Codegen pipeline, devtools
├── mesh/                         # Docker Compose infrastructure (gateway, DB, Redis, Keycloak, telemetry)
└── docs/
    ├── athyper/                  # Platform documentation
    └── neon/                     # Business process documentation
```

## Architecture Boundaries

The codebase enforces strict dependency boundaries via [dependency-cruiser](.dependency-cruiser.cjs). These are checked by `pnpm depcheck` and enforced in CI.

```text
                    ┌─────────────┐
                    │  products/  │  ← Can use: packages/* only
                    └──────┬──────┘
                           │
                    ┌──────┴──────┐
                    │  packages/  │  ← Framework-independent (no framework/ imports)
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              │   framework/runtime     │  ← Orchestrates via adapters (no direct infra)
              └────────────┬────────────┘
         ┌────────┬────────┼────────┬────────┐
         │ auth   │   db   │ cache  │storage │  ← Adapters: isolated, no cross-talk
         └────┬───┘────┬───┘────┬───┘────┬───┘
              └────────┴────────┴────────┘
                           │
              ┌────────────┴────────────┐
              │    framework/core       │  ← Pure logic, may use packages/contracts only
              └─────────────────────────┘
```

### Rules

| Rule                        | Description                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------- |
| **core-no-infra**           | `framework/core` cannot import runtime, adapters, or infra packages (pg, ioredis, etc.) |
| **runtime-no-direct-infra** | `framework/runtime` cannot import pg, ioredis, etc. directly (use adapters)             |
| **adapter-no-cross-talk**   | Each adapter is isolated — auth cannot import db, db cannot import cache, etc.          |
| **adapters-no-packages**    | Adapters may only use `packages/contracts`, not other shared packages                   |
| **packages-no-framework**   | `packages/*` cannot import anything from `framework/`                                   |
| **products-no-framework**   | `products/*` cannot import anything from `framework/`                                   |
| **no-circular**             | No circular dependencies anywhere in the codebase                                       |

Run `pnpm depcheck` to validate all rules.

## Key Patterns

### DI Container (Token-Based)

Services are registered and resolved via tokens in `framework/runtime/src/kernel/tokens.ts`:

```typescript
// Register
container.register(TOKENS.db, async () => createDbAdapter(config), "singleton");

// Resolve
const db = await container.resolve(TOKENS.db);
```

### RuntimeModule Pattern

Modules follow a two-phase lifecycle: `register()` (DI bindings) then `contribute()` (cross-module wiring):

```typescript
class MyModule implements RuntimeModule {
  register(container: Container) {
    /* bind tokens */
  }
  contribute(container: Container) {
    /* wire cross-module deps */
  }
}
```

### Adapter Protection

All adapters are wrapped with circuit breakers and retry logic via `adapter-protection.ts`.

### Config

- Zod schemas in `config.schema.ts`
- JSON parameter files per environment loaded at boot
- Secrets via `ATHYPER_SUPER__*` environment variables

## Workspace Packages

### Adding a Dependency

```bash
# Add to a specific package
pnpm --filter @athyper/runtime add <package>

# Add a workspace dependency
pnpm --filter @neon/web add @athyper/ui --workspace

# Add a dev dependency to root
pnpm add -Dw <package>
```

### Version Alignment

Keep shared dependencies aligned across workspaces to avoid duplicate copies (pnpm uses `resolution-mode=lowest-direct`). If multiple packages use the same dependency, ensure they use the same version range.

### After Modifying Adapter Packages

If you change `@athyper/adapter-auth` (or any adapter with a `dist/` output), you **must rebuild** before typechecking dependent packages:

```bash
cd framework/adapters/auth
npx tsup src/index.ts --format esm --dts --sourcemap --outDir dist
```

## Development Workflow

### Daily Commands

```bash
# Start everything
pnpm mesh:up                       # Infrastructure
pnpm runtime:start:watch           # Kernel (auto-restart)
pnpm --filter @neon/web dev        # Web app

# Quality checks
pnpm test                          # Run all tests (Vitest)
pnpm lint                          # Lint all packages
pnpm typecheck                     # TypeScript type checking
pnpm depcheck                      # Architecture boundary validation
pnpm check                         # All of the above

# Formatting
pnpm format                        # Format all files
pnpm format:check                  # Check without writing

# Database
pnpm db:migrate                    # Create migration
pnpm db:deploy                     # Apply migrations
pnpm db:studio                     # Open Prisma Studio
pnpm athyper:codegen               # Regenerate Zod + Kysely types

# Cleanup
pnpm clean                         # Clean build artifacts
pnpm clean:reset                   # Nuclear: clean + reinstall + rebuild
```

### Running Tests

```bash
# All tests
pnpm test

# Specific package
pnpm --filter @athyper/core test

# Watch mode
pnpm --filter @athyper/core test -- --watch

# With coverage
pnpm --filter @athyper/core test -- --coverage
```

### Before Pushing

```bash
# Run the full quality gate
pnpm check

# This runs: lint + typecheck + test + depcheck
# CI also runs: format:check + check
```

## Code Conventions

### TypeScript

- Strict mode enabled (`strict: true`)
- ESM only (`"type": "module"` in all packages)
- Prefer `interface` over `type` for object shapes
- Use Zod for runtime validation at system boundaries

### Testing

- **Framework**: Vitest 4 with jsdom for React components
- **Coverage**: V8 provider
- **Pattern**: Co-locate test files with source (`*.test.ts` next to `*.ts`)
- **Pitfall**: Cross-workspace imports fail in vitest — inline test utilities

### Linting & Formatting

- **ESLint 9** with flat config, TypeScript plugin, import plugin, boundaries plugin
- **Prettier 3.8** with Tailwind CSS plugin
- Run `pnpm format` before committing to avoid CI failures

### File Organization

- `src/index.ts` as barrel export for each package
- `dist/` for build output (gitignored)
- `tsconfig.json` per package, extending `@athyper/tsconfig`

## Common Pitfalls

| Issue                                    | Solution                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| Cross-workspace imports fail in vitest   | Inline test utilities instead of importing from other packages            |
| `res.json()` returns `{}` in TypeScript  | Cast: `(await res.json()) as { keys?: unknown[] }`                        |
| Types not updating after adapter changes | Rebuild the adapter: `cd framework/adapters/<name> && npx tsup ...`       |
| `pnpm install` uses wrong pnpm version   | Run `corepack enable` to use the version from `packageManager` field      |
| Shell scripts don't work on Windows      | Use WSL2, Git Bash, or pnpm scripts (`pnpm mesh:up` instead of `./up.sh`) |

## Documentation

All platform docs are in [docs/athyper/](docs/athyper/README.md). Business process docs are in [docs/neon/](docs/neon/).

| Area                | Entry Point                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| Documentation index | [docs/athyper/README.md](docs/athyper/README.md)                                                               |
| Deployment & setup  | [docs/athyper/deployment/README.md](docs/athyper/deployment/README.md)                                         |
| Architecture        | [docs/athyper/architecture/README.md](docs/athyper/architecture/README.md)                                     |
| Auth system         | [docs/athyper/iam/README.md](docs/athyper/iam/README.md)                                                       |
| Framework           | [docs/athyper/framework/README.md](docs/athyper/framework/README.md)                                           |
| Security            | [docs/athyper/security/README.md](docs/athyper/security/README.md)                                             |
| Meta engine         | [docs/athyper/meta-engine/README.md](docs/athyper/meta-engine/README.md)                                       |
| Runbooks            | [docs/athyper/runbooks/README.md](docs/athyper/runbooks/README.md)                                             |
| Finance spec        | [docs/neon/finance/FINANCE_FUNCTIONAL_SPECIFICATION.md](docs/neon/finance/FINANCE_FUNCTIONAL_SPECIFICATION.md) |
