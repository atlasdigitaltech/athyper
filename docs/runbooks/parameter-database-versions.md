# Parameter database versions and configuration revisions

> Local-development baseline update: the 16 scripts listed in [SQL DDL consolidation](sql-ddl-consolidation.md) have been folded into `server/db/ddl/` and removed from the migration manifests. Use the canonical DDL for a fresh local database. Migration commands and migration-path test results below describe the earlier implementation and are historical, not current setup instructions.

Migration `20260913_parameter_versions.sql` is registered for Studio, Neon and Mesh. Fresh-install DDL contains the same columns and triggers.

- `control.tenant_parameter_value.version`: positive integer, initially 1.
- `control.parameter_definition.revision`: positive integer, initially 1.
- The database owns both counters: inserts start at 1 and every successful update advances the applicable counter by one, regardless of a caller-supplied counter value.
- Existing rows receive 1 through the column default without changing their values, dates or audit timestamps.
- Existing identity, creation-evidence, tenant/definition coordinate and terminal `deprecated` guards remain intact. API `expired` continues to map to database `deprecated`.
- The existing active-period exclusion constraint is unchanged. Adjacent half-open periods remain valid.

Every definition update advances its revision, including changes to defaults, bounds, allowed values, override permission, reload mode, TTL, sensitivity, metadata and lifecycle status. Even no-op updates advance the revision; this deliberately favors conservative invalidation over missing a configuration field.

## Optimistic writes

`expectedVersion: 0` is a create command; it is not a stored version. New rows return version 1. Updates and expiration require the existing row ID and its positive version. The repository must use all three coordinates in the write predicate:

```sql
UPDATE control.tenant_parameter_value
SET value = :value
WHERE tenant_id = :verified_tenant_id
  AND id = :id
  AND version = :expected_version
RETURNING *;
```

Do not assign `version = expectedVersion + 1` as a substitute for a predicate: the database trigger advances the counter but cannot infer a client's expected version. For a known tenant-owned row, zero updated rows indicate a stale version and must become HTTP 409. Foreign or missing IDs must not expose another tenant's record; resolve them as not found within the repository transaction. Update an expired row only according to the expiration contract; it cannot become active again.

Concurrent writes using the same expected version are tested: exactly one updates the row and the other affects zero rows. The concrete adapter now maps PostgreSQL serialization and deadlock conflicts to HTTP 409 without retrying. Audit and outbox writes commit in the same transaction as the change.

## Definition-driven cache revisions

`ParameterDefinition` and its HTTP schema now require `revision`. Repository implementations must map the actual persisted column; there is no fallback constant.

Effective parameter responses include an opaque `configurationRevision` token built from:

```text
[definition ID, definition revision, selected override ID or null, selected override version or null]
```

This token changes after a definition update even when the selected override and its value are unchanged. It also changes when an effective override starts or ends, when its version advances, and when resolution returns to the default. It contains no setting values.

Runtime caches must compare a freshly resolved token before reusing dynamic configuration, or consume reliable invalidation with equivalent definition/override coverage. Cached responses must not serve their own stale token as the freshness check. Scheduled boundaries still require boundary-aware reads or expiry. Session/startup-pinned reload modes retain their separate lifecycle semantics.

The concrete adapter and an experience next-request consumer now use these counters. See [adapter and runtime deployment](parameter-adapter-runtime-deployment.md). Durable definition-change notifications and consumers for other reload modes remain outside this binding; fresh database reads cover definition changes and scheduled boundaries for the experience consumer.

## Deployment and verification

Apply this migration after the SQL-validation alignment migration and before deploying repository mappings that read the new columns. The migration uses a five-second lock timeout and a sixty-second statement timeout. No live database was migrated during implementation.

Verification:

- 22 PostgreSQL version cases passed against fresh DDL and another 22 against the migration path: preservation of legacy rows, database-owned counters, immutable identity, stale concurrent updates, expiration, overlap/adjacency, transactional rollback, definition-only updates, and non-owner tenant RLS.
- The 64-case SQL-validation PostgreSQL suite passed again against the updated table definitions.
- 649 control-admin tests passed, including definition/override token changes and HTTP 409 propagation from repository conflicts.
- Control-admin and host TypeScript checks and contract tests passed.

Use an empty disposable database for the canonical-DDL version suite, setting `ATHYPER_PARAMETER_DB_TESTS=true`, `ATHYPER_PARAMETER_TEST_DATABASE_URL`, then run:

```sh
pnpm --filter @athyper/server-platform-control-admin exec vitest run src/parameter-versions.postgres.test.ts
```
