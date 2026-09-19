# Parameter SQL/API validation alignment

> Local-development baseline update: the 16 scripts listed in [SQL DDL consolidation](sql-ddl-consolidation.md) have been folded into `server/db/ddl/` and removed from the migration manifests. Use the canonical DDL for a fresh local database. Migration commands and migration-path test results below describe the earlier implementation and are historical, not current setup instructions.

`20260912_parameter_validation_alignment.sql` is registered in the Studio, Neon and Mesh migration manifests. The same validator and JSON-compatibility helper are included in fresh-install `common/control/07_functions.sql`.

The SQL validator now:

- Accepts string, number and boolean enums only when the value is a member of a supplied nonempty allowed-values array.
- Accepts the API's nonnegative day/hour/minute/second duration-string subset; rejects numeric durations, arbitrary strings, empty `P`/`PT`, trailing `T`, and calendar months/years.
- Requires mathematical integers within `[-9007199254740991, 9007199254740991]`. Integral JSON numeric spellings such as `1.0` and `1e2` are accepted.
- Compares allowed values using complete JSONB equality, preserving scalar types, array order and duplicate elements. Object-key order does not matter. Partial object containment no longer counts as membership.
- Requires numeric bounds to be numeric, finite, ordered and applicable to a numeric parameter type. SQL NULL means no bound; JSON null is invalid as a bound.
- Rejects SQL NULL values, unknown types, malformed allowed-value collections, numbers outside finite double-precision representation, and JSON nesting beyond the API's 64-level limit. JSON null remains valid for a JSON parameter.

The existing definition and tenant-value validation triggers call the updated function. No row values, timestamps or lifecycle statuses are rewritten.

## Preflight

Use an authorized database reader with complete visibility of both tables; tenant-scoped RLS access is not sufficient for an all-tenant report. Run against each deployment database before scheduling the migration:

```sh
psql -X -v ON_ERROR_STOP=1 -f server/db/scripts/tests/integration/parameter-validation-preflight.sql
```

Supply connection configuration through the operator's normal environment or connection service. The preflight creates candidate functions only in the session's temporary schema, reads a repeatable snapshot and rolls back. It does not replace live validation functions or change persistent rows.

Output identifies incompatible definitions and overrides by kind, ID, tenant ID and parameter code. It deliberately omits values, which may be sensitive. Review the listed rows through an appropriately authorized interface. A failed command or incomplete RLS visibility is not a clean report.

## Migration behavior

The migration locks both tables in `SHARE ROW EXCLUSIVE` mode before replacing the functions and auditing all rows. Ordinary reads remain available; concurrent writers cannot introduce incompatible values between the audit and commit. Lock acquisition times out after five seconds; the statement timeout is 120 seconds.

The audit includes inactive definitions and inactive/historical overrides. An override is checked against its current definition, matching the available current-state schema; this migration does not invent historical definitions. Incompatible historical data therefore also blocks migration and requires an explicit remediation decision.

For each incompatible row, the migration emits a warning with its identity. It then raises a check-violation error with the incompatible-row count. The transaction must be rolled back by the migration runner; the old validator remains in place and no rows are converted. With psql, use `ON_ERROR_STOP=1`; closing a failed session rolls back its transaction. Keep warning output in deployment evidence.

Correct incompatible data through a separately reviewed change, then repeat preflight and migration. Do not add casts, rounding, silent retirement or automatic deletion to make the audit pass.

Local development preflight on 2026-09-07 reported:

| Plane | Definitions | Overrides | Incompatible rows |
| --- | ---: | ---: | ---: |
| Studio | 0 | 0 | 0 |
| Neon | 0 | 0 | 0 |
| Mesh | 0 | 0 | 0 |

This empty development result says nothing about production compatibility. No live migration was applied.

## Verification

64 real PostgreSQL 16 cases passed using the fresh-install validator, actual table definitions and validation triggers, and the migration applied over a preserved legacy validator. Coverage includes SQL/API parity, malformed bounds/allowed values, integer limits, structural JSON equality, nested JSON limits, trigger enforcement, compatible-row preservation, incompatible-row reporting, validator rollback, preflight isolation, and concurrent-write blocking.

The 647-test control-admin regression suite and control-admin source/test TypeScript checks passed. Run the opt-in SQL suite only against a new empty disposable database:

```sh
ATHYPER_PARAMETER_DB_TESTS=true \
ATHYPER_PARAMETER_TEST_DATABASE_URL="$DISPOSABLE_PARAMETER_DATABASE_URL" \
pnpm --filter @athyper/server-platform-control-admin exec vitest run src/parameter-validation.postgres.test.ts
```

The subsequent [adapter and runtime integration](parameter-adapter-runtime-deployment.md) implements repository versioning and the first runtime consumer. This document covers SQL validation alignment and the compatibility audit mechanism.
