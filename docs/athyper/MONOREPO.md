# Athyper Monorepo — Concept & Overview

This document explains the monorepo strategy, the reasoning behind it, and how the repository is organized.

## What Is a Monorepo?

A **monorepo** is a single version-controlled repository that contains multiple distinct projects, packages, and applications. Instead of spreading code across many repositories (polyrepo), every piece of the platform — framework, shared libraries, products, infrastructure — lives in one place.

## Why a Monorepo?

| Benefit | How Athyper Uses It |
|---------|---------------------|
| **Atomic changes** | A schema change in `framework/core` and its consumers in `framework/runtime` ship in the same commit — no version drift |
| **Shared tooling** | One ESLint config, one Prettier config, one Vitest setup, one TypeScript base — enforced everywhere |
| **Dependency graph visibility** | `dependency-cruiser` validates layer boundaries at lint time; Turborepo understands the build graph |
| **Code sharing without publish** | `packages/ui`, `packages/i18n`, `packages/dashboard` are consumed via workspace protocol (`workspace:*`) — no npm publish step |
| **Single CI pipeline** | One PR touches framework + product + tests; CI validates the full integration, not just one slice |

## Repository Identity

| Property | Value |
|----------|-------|
| Package manager | **pnpm** (v10) with workspaces |
| Build orchestrator | **Turborepo** (`turbo.json`) |
| Node version | `>=20.11.0 <21` (pinned in `.nvmrc`) |
| Language | TypeScript 5.9+ everywhere |
| Test framework | Vitest 4.x (root `vitest.config.ts`) |
| Linter | ESLint 9 flat config with boundaries plugin |

## Workspace Layout

The monorepo is divided into **six top-level areas**, each with a distinct role:

```
athyper-private/
├── framework/       Core platform — adapters, contracts, runtime
├── packages/        Shared NPM packages (UI, i18n, auth, dashboard, etc.)
├── products/        Deployable applications (Neon)
├── mesh/            Docker Compose infrastructure
├── tooling/         Build configuration packages (eslint, tsconfig)
├── tools/           Developer utilities (codegen, migrator, seeders)
└── docs/            Architecture and runbook documentation
```

### Dependency Flow (strict, enforced by ESLint boundaries)

```
                    ┌──────────┐
                    │   core   │  Pure contracts, no dependencies
                    └────┬─────┘
                         │
                    ┌────▼─────┐
                    │ adapters │  Infrastructure bindings (DB, cache, S3, auth, telemetry)
                    └────┬─────┘
                         │
                    ┌────▼─────┐
                    │ runtime  │  Orchestrates adapters + core into services
                    └────┬─────┘
                         │
           ┌─────────────┼─────────────┐
           │                           │
      ┌────▼─────┐              ┌──────▼─────┐
      │ packages │              │  products   │
      │ (shared) │◄─────────────│  (Neon app) │
      └──────────┘              └─────────────┘
```

**Rules enforced at lint time:**
- `core` imports nothing outside `core`
- `adapters` import only `core`
- `runtime` imports `core` + `adapters` (via package entrypoints, never deep internals)
- `packages` import only other `packages` (no framework)
- `products` import only `packages` (no framework, no adapters)

## Workspace Packages

Every directory with a `package.json` is a workspace package. The workspace is defined in `pnpm-workspace.yaml`:

```yaml
packages:
  - framework/adapters/*
  - framework/core
  - framework/runtime
  - packages/*
  - products/neon/apps/*
  - products/neon/auth
  - products/neon/content
  - products/neon/shared
  - products/neon/themes
  - tooling/*
  - tools/*
  - server/*
```

## Key Conventions

### Package Naming

| Scope | Pattern | Example |
|-------|---------|---------|
| Framework | `@athyper/<name>` | `@athyper/core`, `@athyper/runtime`, `@athyper/adapter-db` |
| Packages | `@athyper/<name>` | `@athyper/ui`, `@athyper/i18n`, `@athyper/dashboard` |
| Product | `@neon/<name>` | `@neon/web`, `@neon/auth`, `@neon/content` |

### Internal Imports

- Framework packages are imported by their **package name** (`@athyper/core`), never by relative file path across workspace boundaries
- Deep imports into adapter/package internals (`@athyper/adapter-db/src/...`) are forbidden
- Type-only imports use `import type { ... }` (enforced by `@typescript-eslint/consistent-type-imports`)

### Module Pattern

Every runtime service module follows the **RuntimeModule** pattern:

```typescript
export const myModule: RuntimeModule = {
  register(container) { /* bind services into DI container */ },
  contribute(container) { /* register routes, jobs, health checks */ },
};
```

## Related Documentation

| Document | Path |
|----------|------|
| Folder Structure | [FOLDER-STRUCTURE.md](./FOLDER-STRUCTURE.md) |
| Service Architecture | [SERVICE-ARCHITECTURE.md](./SERVICE-ARCHITECTURE.md) |
| Shared Packages | [PACKAGES.md](./PACKAGES.md) |
| Infrastructure | [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) |
| Build & Tooling | [BUILD-TOOLING.md](./BUILD-TOOLING.md) |
