# Versioned feature cohorts

> Local-development baseline update: the 16 scripts listed in [SQL DDL consolidation](sql-ddl-consolidation.md) have been folded into `server/db/ddl/` and removed from the migration manifests. Use the canonical DDL for a fresh local database. Migration commands and migration-path test results below describe the earlier implementation and are historical, not current setup instructions.

The migration `20260911_feature_cohort_strategy.sql` preserves every existing feature definition's experience assignment. It first adds `cohort_strategy` with the legacy default, then separately changes the default for future inserts. It does not rewrite existing rollout percentages, overrides, dates, or audit timestamps. Fresh installations default new definitions to v2.

| Stored strategy | Bucket calculation | Assignment unit |
| --- | --- | --- |
| `tenant_sha256_v1` | First eight hex characters of SHA-256(`tenantId:featureCode`), parsed as an integer, modulo 100 | Tenant |
| `principal_fnv1a_v2` | FNV-1a over `tenantId:principalId:featureCode`, unsigned 32-bit result modulo 100 | Principal within tenant |

Both implementations use the original string formats, encodings and arithmetic. The percentage comparison is `bucket < rolloutPct`. Feature codes and IDs cannot be updated because changing a code also changes cohort assignment. Create a new feature when a different identity is needed. Do not change a versioned algorithm in place.

Both the control API and experience read the persisted strategy; requests cannot choose it. Catalog definitions also expose `cohortRevision`, starting at 1. The experience repository includes the strategy and revision in its pre-cache fingerprint, so a committed change invalidates effective results across hosts on their next read. Experience's module and client-version gates remain in force. Active ordinary overrides bypass the cohort while effective; tenant overrides cannot turn on a catalog-disabled kill switch.

## Deployment

1. Pause feature catalog creation and strategy/percentage changes during the deployment window. Existing evaluation can continue. This pause matters because the database default changes before all application instances understand v2.
2. Apply prerequisite migrations and `20260911_feature_cohort_strategy.sql` on each supported plane. Confirm pre-existing rows have `tenant_sha256_v1` and revision 1. A failed migration rolls back atomically.
3. Deploy both API and experience with the strategy-aware evaluator to every instance. Keep existing features pinned. Do not deploy the earlier unconditional FNV experience change as an intermediate step.
4. Verify repository health and compare API/experience decisions for representative identities. Once every instance supports both versions, resume feature publication; new features default to v2. A catalog publisher can explicitly select v1 at creation for tenant-wide collaboration features.
5. Review a comparison before changing any existing feature. Record the reviewed cohort revision and retain the report with the change ticket. Do not replay a stale approval against a newer revision.

Rolling back to pre-strategy application code is unsafe once v2 features exist: the old experience evaluator ignores the stored strategy. Keep the dual evaluator during rollback, or explicitly review the impact of every affected feature first.

## Read-only impact comparison

From the repository root, with `DATABASE_URL` supplied through the operator's environment:

```sh
pnpm exec tsx server/packages/platform/control-admin/scripts/compare-feature-cohorts.ts 2026-09-07T00:00:00Z > cohort-impact.json
```

The tool opens a repeatable-read, read-only transaction with a fixed evaluation instant. It compares v1 with v2 for every active partial-rollout definition and active tenant/principal visible to the database reader, holding effective definitions and tenant overrides constant. It reports retained enabled/disabled and gained/lost counts per tenant and feature; it does not print principal identifiers or credentials. It reads the pre-migration schema as well as the current schema.

Use an authorized administrative reader with complete catalog, tenant, principal and override visibility. `row_security=off` makes RLS-filtered access fail rather than silently omitting evidence. The report measures rollout eligibility, including override and kill-switch rules; it does not claim to simulate client-version, module-entitlement, membership or identity-binding gates. Its scope is stated in the output. For a final workflow impact review, correlate the report with those additional gates at the same instant.

Read-only inspection of the local development databases on 2026-09-07 found Studio: 0 definitions, Neon: 1 definition, Mesh: 0 definitions, and **no partial-rollout definitions in any plane**. There was no real development cohort to compare. This is not evidence about production populations. The comparison tool was exercised against disposable PostgreSQL fixtures.

## Intentional cutover

Catalog UPDATE privileges remain restricted to existing catalog administrators; tenant override writers gain no catalog privileges or strategy endpoint. The database guard requires the operator's tenant/principal context, a nonblank reason of at most 2,000 characters, and the matching cohort revision. The audit belongs to the operator's tenant; its affected scope and outbox invalidation scope are the entire plane.

Use transaction-local settings with an authorized catalog database connection. This psql example uses operator-supplied variables; it does not provide default identities or bypass authorization:

```sql
\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('app.database_plane', :'plane', true),
       set_config('app.current_tenant_id', :'operator_tenant_id', true),
       set_config('app.current_principal_id', :'operator_principal_id', true),
       set_config('app.current_actor_type', 'user', true),
       set_config('app.feature_cohort_change_reason', :'reason', true),
       set_config('app.feature_cohort_expected_revision', :'reviewed_revision', true);
UPDATE control.feature_flag_catalog
SET cohort_strategy = :'target_strategy'
WHERE code = :'feature_code'
RETURNING code, cohort_strategy, cohort_revision;
-- Verify exactly one intended row before committing; otherwise ROLLBACK.
COMMIT;
```

The trigger advances `cohort_revision`, records the actor and reason with before/after values through `audit.append_event`, and inserts `control.feature_cohort.changed` into the `control.features` outbox in the same transaction. A stale revision or failed audit/outbox write rolls everything back. A same-strategy request with the current revision emits no duplicate evidence. Concurrent requests based on the same revision cannot both change the assignment.

The outbox payload declares `cacheInvalidation.scope = "plane"`; consumers must not treat it as a tenant-only override event. Runtime freshness also relies on the persisted revision read before cache lookup, so it does not wait for outbox consumption.

Pinning is sufficient for preserving existing assignments. This change does not implement sticky principal assignments. If an existing feature must move to v2 while retaining every previous assignment, add an explicit sticky-assignment model before its cutover, or keep it on v1.

## Verification

- Fixed ASCII, UUID-shaped and Unicode vectors preserve both hash calculations.
- Both API and experience evaluate persisted strategies; percentage increases retain existing eligibility within a strategy.
- Scheduled overrides, kill switches and rejection of caller-supplied cohort fields are covered.
- PostgreSQL suite: 30 cases on fresh and migrated schemas for each of Studio, Neon and Mesh (180 passed), including legacy backfill, new-row defaults, audited cutovers, concurrency, stale revisions, identity protection, cache revisions and rollback.
- The broader control-admin, experience and foundation suites and relevant TypeScript checks are run alongside these cases.

No live schema or feature assignment was changed while implementing this fix.
