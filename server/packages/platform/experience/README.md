# Platform experience projection

`@athyper/server-platform-experience` is the authenticated, sanitized bootstrap projection for Studio, Neon, and Mesh. It consumes `VerifiedRequestContext` and its already-resolved permission snapshot; it never authenticates a caller or computes grants independently.

## Boundary

- `ExperiencePlaneRepository` is the server package's exact-plane read port.
- `@athyper/server-adapter-experience-postgres` implements that port with Kysely queries against the current `master`, `authz`, and `control` DDL.
- `platform-host` creates one repository per configured physical database and selects it with `createExactPlaneRepositoryProvider`. Missing planes return `EXPERIENCE_EXACT_PLANE_REPOSITORY_UNAVAILABLE`; there is no Studio fallback.
- `GET /api/platform/experience/bootstrap` is authenticated and returns `experienceBootstrapSchema`. It never returns provider identifiers, identity claims, token material, grant internals, feature metadata, or database coordinates.

## Resolution order

The service validates snapshot/context binding, active tenant and principal, realm binding, auth epoch, and effective plane membership before reading presentation state. A missing or inactive plan produces `context_not_ready` with empty access. Active plan modules are intersected with active workspace/module catalog rows. The verified permission allow-list is then intersected with active, entitled catalog permissions.

Feature windows and tenant overrides are selected in SQL. Resolution applies module entitlement, minimum/maximum client-version constraints, a SHA-256 tenant cohort, explicit tenant override, and fail-closed kill-switch precedence. A feature read failure exposes no flags. A profile read failure uses platform-safe defaults only after identity and membership admission succeeded.

The response revision is a stable SHA-256 fingerprint of identity, profile, plan, catalog, feature, and authorization revisions. Invalidation hooks cover profile, catalog, plan, flag, membership, and authorization changes.

## Qualification

Unit/contract tests cover admission failures, provisioning without a plan, profile inheritance and fallback, catalog ordering, plan/permission intersection, feature overrides, version constraints, stable cohorts, cache invalidation, exact-plane selection, and the JSON response schema.

`@athyper/server-adapter-experience-postgres` owns `experience.postgres.test.ts`. Under `ATHYPER_SERVICE_DB_TESTS=true`, it runs for all three physical databases, verifies the declared physical plane, executes the Kysely projection against current DDL under the application role, checks catalog ordering and feature uniqueness, and proves cross-tenant reads are hidden by RLS. Use the repository's `test:service-postgres` qualification command; the explicit local-skip path does not satisfy the Phase 5 DDL exit gate.
