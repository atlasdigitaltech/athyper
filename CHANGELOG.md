# Changelog

All notable changes to **athyper** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned

- Core framework module definitions
- Integration interfaces for neon, mesh, and atlas
- Configuration schema

---

## [0.1.0] - 2026-03-03

### Added

- Base version — athyper Business Operating Framework
- `framework/` — Core engine with adapters (auth, db, cache, storage, telemetry), core contracts, and runtime kernel
- `mesh/` — Docker Compose infrastructure stack (Keycloak, Traefik, Redis, MinIO, PgBouncer, OpenTelemetry)
- `packages/` — Shared libraries: ui, auth, api-client, dashboard, i18n (7 locales), theme, workbench modules
- `products/neon/` — Business Operating Platform (Next.js 14+ web app, auth BFF, content BFF, product UI/themes)
- `tooling/` — Shared ESLint and TypeScript configurations
- `tools/` — Code generation (Kysely codegen), schema migration, database seeders
- `docs/` — athyper and neon documentation
- `.github/` — CI/CD workflows, issue templates, PR template
- MIT License
- CHANGELOG tracking

---

[Unreleased]: https://github.com/atlasdigitaltech/athyper/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/atlasdigitaltech/athyper/releases/tag/v0.1.0
