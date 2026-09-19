# Final database review fixes — 2026-09-10

All three findings in `server-db-final-review-20260910.md` are addressed.

1. **Foundation resume receipts:** the runner validates the complete skipped prefix before executing the resume file. Plane, manifest checksum, ordinal, filename, and file checksum must match existing receipts, with no extra receipts. It records only files executed in the current invocation. Before ledger creation, it buffers receipts for the bootstrap files actually executed; failed pre-ledger builds must restart on a fresh database. `--no-receipts` cannot bypass resume checks, and an explicit resume at the first file still checks freshness. Connections close on failures as well as successful completion.
2. **View and security drift:** shared catalog queries now capture view/materialized-view definitions, relation options, relation/function ownership and ACLs, and column ACLs. ACL comparison expands default privileges and sorts entries using role names, avoiding OID and grant-order differences across databases.
3. **SQL literal drift:** catalog definitions are compared verbatim. Whitespace inside strings, dollar-quoted bodies, quoted identifiers, and comments is retained. Formatting-only SQL edits can now appear as drift; this is preferable to silently concealing behavior changes.

The catalog queries and comparison functions live in `server/db/scripts/lib/database-catalog.ts`, shared by the report CLI and regression tests. No DDL or historical migration content was changed for these fixes.

Validation:

- `pnpm --dir server/db test`: 151 tests passed.
- `pnpm --dir server/db run test:integration:database-tooling`: passed on disposable PostgreSQL 16.13. It exercises missing/mismatched prefix receipts, pre-ledger/no-receipts bypass attempts, explicit-first-file freshness, a real partial-build failure followed by successful resume, view filters and both security options, materialized-view queries, relation/function owners, PUBLIC and named-role grants, column grants, SQL literals, and ACL ordering.
- `pnpm --dir server/db run test:integration:db-review`: passed. All three fresh foundations, forward migrations and repeat execution, tenant isolation, mesh/bank/Studio command checks, catalog parity, and concurrency checks passed.
- `pnpm --dir server/db typecheck`: still fails on existing cross-package `rootDir` errors and unrelated integration-test typing errors. No diagnostics name the changed TypeScript files.

The integration test provisions a container with networking disabled and tmpfs storage, then removes it. It does not access development or QA databases. Cluster role membership and external authorization remain outside the catalog report's scope.
