# Platform Guides

Architecture, configuration, and provisioning guides for the athyper platform.

| # | Guide | Coverage |
|---|-------|----------|
| D4 | [Tenant Provisioning Guide](d4-tenant-provisioning.md) | Blueprint seed overview, tenant onboarding sequence, post-provisioning checklist |
| D5 | [Metadata Control Plane Guide](d5-metadata-control-plane.md) | Three-zone model, defining entities in SQL, overlays, compiled descriptor lifecycle |

## Conventions

- **SQL blocks** — run as `athyperadmin` (migrations) or `app_role` (runtime queries) unless noted.
- **API calls** — require a valid Bearer token; replace `<admin-token>`, `<tenant-id>`, and `<principal-id>` placeholders.
- **File paths** — all relative to the monorepo root (`d:/Products/athyper/`).
