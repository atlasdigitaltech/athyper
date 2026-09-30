# Feature administration API review

> Local-development baseline update: the 16 scripts listed in [SQL DDL consolidation](sql-ddl-consolidation.md) have been folded into `server/db/ddl/` and removed from the migration manifests. Use the canonical DDL for a fresh local database. Migration commands and migration-path test results below describe the earlier implementation and are historical, not current setup instructions.

The four routes under `/api/control-admin/features` now have explicit request and response contracts, a governed database adapter, and matching experience-layer rollout behavior.

## API behavior

- `GET /features` returns a definition array. Definitions include status, effective dates, default enablement, optional percentage, and the catalog flag kind.
- `GET /features/{code}/evaluation` captures one evaluation instant. A retired, not-yet-effective, or ended definition is disabled. Only an active tenant override effective at that instant is selected. The response identifies `catalog` or `tenant_override` and includes the selected evidence.
- Rollout uses the persisted `cohortStrategy`: legacy `tenant_sha256_v1` preserves experience's tenant/feature SHA-256 assignment; `principal_fnv1a_v2` uses the tenant/principal/feature FNV-1a assignment. Both administration and experience use the same versioned helper. Definitions expose `cohortStrategy` and `cohortRevision`; override requests cannot set either. Zero percent enables nobody through the catalog; 100 percent includes every cohort, provided the catalog default is enabled.
- Active release-gate/experiment overrides explicitly enable or disable the feature, overriding the default/cohort result. The existing global kill-switch behavior is preserved: a tenant cannot enable a kill switch that the catalog disables. That API result reports `catalog` as its source.
- `PUT /features/{code}/override` requires a boolean, nonblank reason, valid effective dates, and `expectedVersion`. Zero creates a new row, with an optional caller-supplied UUID. Updates require the existing override `id` and a matching positive version. Reasons are trimmed and limited to 2,000 characters. The tenant and actor come only from verified context.
- `POST /features/overrides/{id}/expire` requires a positive expected version. Expired rows cannot be reactivated; repeating expiration with the current expired version creates no duplicate audit/outbox evidence. Future overrides become inactive without inventing an invalid end before their start.
- Unknown fields, malformed optional fields, invalid dates, and invalid versions are rejected. Authentication, permissions, missing rows, conflicts, and unavailable planes return 401/403/404/409/503 respectively; validation returns 400.

## Persistence and runtime integration

`KyselyFeatureFlagRepository` maps catalog fields and active/deprecated statuses into API definitions and active/expired overrides. The host supplies this adapter for each available Studio, Neon, and Mesh database unless an explicit repository is injected. It never falls back across planes; health checks verify the assigned plane, versioned schema, outbox access, and feature audit contract. Existing route-enable and control-admin integration requirements remain in place.

Writes run in serializable transactions with tenant/principal context, optimistic version predicates, and row locks. The database enforces non-overlapping active periods per tenant and feature; adjacent half-open periods are allowed. Override identity, feature target, tenant, and creation evidence are immutable. Version triggers also advance versions for other database writers. Serialization conflicts and deadlocks surface as 409 for a deliberate client retry.

The same transaction writes before/after evidence through `audit.append_event` and a `control.features` outbox event with actor, plane, audit ID, and feature invalidation keys. Failed audit/outbox writes roll back creation, update, and expiration.

The experience adapter already reads effective feature overrides. It now exposes a revision of effective feature data that bootstrap reads before cache lookup. Remote commits and scheduled start/end boundaries therefore change cache keys without waiting for a worker or TTL. Successful local writes also invalidate the experience flag cache and the injected feature cache after commit. Client-version and module-entitlement constraints in experience remain additional runtime gates.

**Rollout compatibility:** the cohort-strategy migration pins every existing definition to `tenant_sha256_v1`, preserving existing experience assignments. Only subsequent inserts default to `principal_fnv1a_v2`. Legacy API results now match experience. See [the deployment and cutover procedure](feature-cohort-strategy-rollout.md).

## Migration

`server/db/migrations/20260910_feature_administration.sql` is registered in all three plane manifests. It adds the override version, identity/lifecycle/version guard, tenant write policies, grants, and the feature audit event contract. Fresh-install DDL includes the same changes. Existing override values and dates are preserved; existing rows start at version 1.

Apply both `20260910_feature_administration.sql` and `20260911_feature_cohort_strategy.sql` before deploying the default database adapter. The latter is registered for all three planes and adds the persisted cohort strategy, revision, and audited cutover guard. No live database was migrated and no route flags were enabled by this change.

## Verification

- Control-admin: 489 tests passed, including 58 dedicated feature service and HTTP cases with response-schema enforcement.
- Experience: 50 tests passed, including matching principal cohorts and cache refresh without local eviction.
- Contract suite: 2 tests passed. Control-admin, host, and experience-postgres TypeScript checks passed.
- Real PostgreSQL: 30 cases passed for each plane against fresh DDL and migration paths (180 total, including 60 feature cases and 120 entitlement regressions). These use the non-owner application role and production audit functions, table definitions, RLS, exclusion constraints, and version guards. Feature cases verify migration preservation, saving/expiration, API and experience results, scheduled periods, concurrency, overlap, tenant/target/actor isolation, and transactional rollback.

The shared database suite remains `src/kysely-entitlement-repository.postgres.test.ts`. To run it, use a separate empty disposable PostgreSQL 16 database for each invocation and set `ATHYPER_ENTITLEMENT_DB_TESTS=true`, `ATHYPER_ENTITLEMENT_TEST_DATABASE_URL`, `ATHYPER_ENTITLEMENT_TEST_PLANE`, and optionally `ATHYPER_ENTITLEMENT_TEST_MIGRATION=true`.
