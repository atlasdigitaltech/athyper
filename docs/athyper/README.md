# Athyper Documentation

Comprehensive documentation for the Athyper monorepo — a multi-tenant enterprise platform built with TypeScript.

---

## Quick Start

- [Deployment Guide](deployment/README.md) — Local Windows setup and Contabo server deployment
- [Infrastructure](infrastructure/README.md) — Docker Compose mesh (`pnpm mesh:up`)
- [Build & Tooling](BUILD-TOOLING.md) — Scripts, testing, linting

---

## Architecture

| Document | Description |
|----------|-------------|
| [System Architecture](architecture/README.md) | Layer diagram, DI container, request flow, multi-tenancy, event system |
| [Service Architecture](SERVICE-ARCHITECTURE.md) | 4-tier module breakdown (314 + 195 + 70 + 239 files) |
| [Monorepo Concepts](MONOREPO.md) | Workspace layout, dependency flow, naming conventions |
| [Folder Structure](FOLDER-STRUCTURE.md) | Complete annotated directory tree |
| [Packages](PACKAGES.md) | 9 shared packages reference |

## Framework

| Document | Description |
|----------|-------------|
| [Framework Internals](framework/README.md) | Core contracts, 5 adapters, runtime kernel, bootstrap sequence |
| [Runtime Configuration](framework/CONFIG.md) | Zod config schema, environment variables, JSON parameter files |
| [Meta-Engine](meta-engine/README.md) | Schema-driven entities, compiler, lifecycle, validation, auto-numbering |
| [Meta-Engine Advanced Features](meta-engine/ADVANCED_FEATURES.md) | Policy conditions, relationship management, RBAC |
| [Compilation Determinism](meta-engine/COMPILATION_DETERMINISM.md) | Compiler diagnostics, deterministic output |

## Platform Services

| Document | Description |
|----------|-------------|
| [Content Management](content-management/README.md) | Upload/download, versioning, ACL, multipart, document rendering |
| [Messaging](messaging/README.md) | In-app messaging, collaboration, comments, reactions, mentions |

## Security & Compliance

| Document | Description |
|----------|-------------|
| [IAM & Authentication](iam/README.md) | PKCE flow, sessions, CSRF, MFA, Keycloak, session invalidation |
| [Security](security/README.md) | Defense-in-depth, rate limiting, field-level security, middleware |
| [Audit & Compliance](compliance/README.md) | Hash chain, encryption, redaction, DLQ, DSAR, storage tiering |

## Operations

| Document | Description |
|----------|-------------|
| [Infrastructure](infrastructure/README.md) | Docker Compose mesh, PostgreSQL, Redis, Keycloak, telemetry |
| [Deployment](deployment/README.md) | Local Windows development, Contabo VPS production |
| [Runbooks](runbooks/README.md) | Auth ops, audit go-live, database ops, incident response |
| [Build & Tooling](BUILD-TOOLING.md) | Turborepo, ESLint, TypeScript, Vitest, codegen pipeline |

---

## Key Numbers

| Metric | Count |
|--------|-------|
| TypeScript files | ~1,214 |
| React components (.tsx) | ~328 |
| Test files | ~97 |
| SQL files | 47 |
| Database schemas | 12 |
| Runtime modules | 12 |
| DI tokens | 150+ |
| API routes (Neon) | 115 |
| Shared packages | 9 |
| Supported locales | 7 |
| Notification channels | 7 |
| Business engines | 14 |
| Business domain modules | 40+ |

---

## Business Process Documentation (`docs/neon/`)

| Document | Description |
|----------|-------------|
| [Entity UI Framework](../neon/ENTITY_UI_FRAMEWORK.md) | Single-page entity rendering specification, descriptor schema |
| [Finance Specification](../neon/finance/FINANCE_FUNCTIONAL_SPECIFICATION.md) | Finance engine v2.1: 13 engines, event sourcing, multi-tenancy |
