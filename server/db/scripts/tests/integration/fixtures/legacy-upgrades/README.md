# Legacy upgrade inputs

These six SQL fixtures preserve the intermediate schema changes used by company
ownership/draft, successor sequencing, protected-value audit, company approver,
and bank-suffix rehearsals. They moved from `server/db/migrations/` without changing
SQL bytes. They are not an automatic fresh-install or deployment sequence.

Use current canonical DDL for new databases. Do not regenerate these fixtures from
the latest DDL: their callers deliberately construct earlier schema states or use
specific isolated candidate snapshots. Keep the associated behavioral tests when
retiring a fixture. The SQL comment referencing the former company-pilot migration
name is historical provenance; executable callers use these new locations.

Binding recovery no longer needs a legacy fixture. Its rehearsal selects the two
current functions from `ddl/common/authz/07_functions.sql` and exercises them on an
isolated rollback-only table. Run its disposable PostgreSQL test with
`pnpm --dir server/db test:integration:binding-recovery`.

Original names, checksums and callers are recorded in
`server/db/migrations/inventory.json`. Historical evidence paths remain unchanged.
