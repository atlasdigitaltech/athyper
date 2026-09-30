# Consistent lookup read snapshots

> Local-development baseline update: the 16 scripts listed in [SQL DDL consolidation](sql-ddl-consolidation.md) have been folded into `server/db/ddl/` and removed from the migration manifests. Use the canonical DDL for a fresh local database. Migration commands and migration-path test results below describe the earlier implementation and are historical, not current setup instructions.

`KyselyLookupRepository.listDomains` and `getDomain` now execute through a
read-only REPEATABLE READ transaction. The domain row, global values and tenant values
are all read from the same PostgreSQL snapshot. Explicit historical reads use the same
boundary for global and tenant revision records.

A publication or tenant-value retirement that commits after the read begins is visible
to the next request, rather than being combined with an earlier domain version.
The transaction retains the verified plane check and tenant-local RLS context.

The shared database helper provides a dedicated `readSnapshot` method. Write operations
remain READ COMMITTED, preserving their fresh reads after advisory-lock acquisition.
Reference-use checks and transactional publication/retirement behavior are unchanged.

## Verification

Four deterministic PostgreSQL regressions cover both list and single-domain reads during
publication and tenant retirement. A Kysely result hook pauses the reader after the domain
query, commits the competing write through another connection, then resumes value reads.
Each response equals the complete pre-change view and agrees with its historical version;
a later request sees the newer revision.

All four tests fail under the former READ COMMITTED behavior and pass with the fix.
The complete repository suite passed 21 PostgreSQL checks (one plane-inapplicable case
skipped) on a disposable Neon database restored with the required schema. All 766
control-admin unit tests passed. Control-admin source/test and host typechecks passed.

No live data or deployment was changed. This fix adds no schema migration; deployment of
the current branch still requires the separately prepared lookup-reference guard migration
`20260920_lookup_domain_reference_guard.sql`.
