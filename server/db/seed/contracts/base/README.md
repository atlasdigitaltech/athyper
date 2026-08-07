# Athyper seed contract v1

This contract applies to every new SQL reference seed and tenant-selectable
seed-pack payload. It also becomes mandatory for an existing layer-12 seed as
soon as that file changes.

## Required header

Every SQL file starts with these single-line fields:

```sql
-- seed-contract-version: 1
-- seed-pack: common.shared.country
-- seed-pack-version: 1.0.0
-- seed-dataset: shared.country
-- seed-data-class: production_reference
-- seed-provenance: {"source":"ISO 3166","publisher":"ISO","source_version":"2026","retrieved_at":"2026-08-03","license":"internal-review-copy"}
-- seed-plane: common
-- seed-tenant-scope: none
-- seed-natural-key: shared.country(code)
-- seed-cross-file-ids: false
-- seed-id-strategy: natural-key-only
-- seed-expected-row-count: exact:249
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
```

Pack versions use semantic versioning. Provenance must identify the source,
publisher, source edition/version, retrieval date, and license or internal data
classification. Changing seed-owned meaning or membership requires a new pack
version; correcting only spelling or descriptions may converge within the same
version when the change is documented in provenance.

## Identity and ownership

- Declare every target's immutable natural key in `seed-natural-key`.
- Use `natural-key-only` when no other seed stores the generated UUID.
- Use `deterministic-uuid:<immutable-namespace>` when another file or pack must
  refer to the row before resolving its natural key. The supported SQL form is
  `md5('<namespace>:' || <canonical-natural-key>)::uuid`; the namespace and key
  serialization become permanent API contracts.
- `database-generated` is permitted only when `seed-cross-file-ids: false` and
  all relationships resolve through natural keys in the same transaction.
- Never use position, row order, display name, or mutable description as an ID
  input.

## Convergence rules

- Every insert must have an explicit conflict target and `DO UPDATE` behavior.
- Update seed-owned descriptive and status/effectivity columns when they drift.
- Never update `created_at` or `created_by` on conflict.
- Set `updated_at`/`updated_by` only on a `WHERE (...) IS DISTINCT FROM (...)`
  branch so an identical second run performs no write.
- Do not use `DO NOTHING` for a production reference row.
- Retire removed values using status and, where supported, `effective_to` or
  `valid_until`. `DELETE` and `TRUNCATE` are prohibited in seed packs.

## Structural and data boundaries

- Seed SQL contains data only. Tables, domains, functions, policies, triggers,
  indexes, grants, RLS and other permanent structure belong in DDL layers 02-11.
- Production reference packs cannot contain demo principals, example tenants,
  transactions, or customer-specific fixtures.
- `seed-plane` must be asserted using `app.database_plane` before data changes.
- Tenant packs must resolve `app.seed_tenant_id`, reject a missing value, and
  verify that the tenant exists on the asserted plane. Hard-coded tenant UUIDs
  and runner-side `SET app.seed_tenant_id = '<uuid>'` are prohibited.
- Relation names in SQL must be schema-qualified. CTE names are the only
  permitted unqualified relational references.

## Required assertions

Each pack contains a failing assertion block after convergence. Mark the four
checks with these exact comments so static lint can verify coverage:

```sql
-- seed-assertion: expected-count
-- seed-assertion: orphan
-- seed-assertion: uniqueness
-- seed-assertion: semantic
```

The block must raise an exception on failure. Expected count is the owned
natural-key population, not total rows in a tenant-extensible table. Orphan
checks cover every seeded relationship. Uniqueness checks use the declared
natural key. Semantic checks cover domain-specific invariants such as hierarchy
validity, weight totals, date ranges, code format, or crosswalk endpoints.

## Enforcement

`pnpm --dir server/db run db:seed:contract:lint` scans SQL under
`server/db/seed-packs/` and all new DDL layer-12 seed files. The checked-in
baseline is bound to exact SHA-256 values of pre-contract files. A changed or
new file must pass v1; updating the baseline requires explicit review.

Use `db:seed:contract:legacy-report` to measure the Wave 0 legacy backlog. It is
report-only and never makes a legacy file deletion-eligible.
