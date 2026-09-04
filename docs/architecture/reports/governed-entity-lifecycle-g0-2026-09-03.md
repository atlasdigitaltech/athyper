# G0 contract and compatibility freeze — build report

**Status:** In progress  
**Date:** 2026-09-03  
**Authority:** `../decisions/governed-entity-lifecycle.md`

## Landed in this slice

- The compatibility registry at `server/db/ddl/planes/neon/governed-lifecycle-compatibility.v1.json` inventories the Business Partner request family, `master.business_partner.aliases`, flattened decision-scope coordinates, and `document.workforce_iam_projection`. Each entry names an owner, known production-code consumers, an executable read-only usage measure, a compatibility window, and a fail-closed removal gate.
- `document.workforce_iam_projection` is no longer an unexplained migration-only relation. Its explicit disposition is **retain for clean/supported-upgrade parity, then replace** through the governed-case IAM projection after the G1/G5 cutover gates. Canonical table, constraint, RLS, and grant definitions now match the active upgrade migration.
- `db:verify:governed-lifecycle-g0` rejects missing surfaces, owners, consumers, measures, windows, removal gates, missing consumer paths, mutable request schema pins, and a migration-only IAM projection.
- The existing Business Partner request contract continues to require and freeze `payload_schema_code`, `payload_schema_version`, and `payload_schema_hash` after submission. These are the currently executable form-definition pins; they must not be relabelled as Entity contract coordinates.

## Verification

The following local checks are green:

```text
pnpm --dir server/db db:verify:governed-lifecycle-g0
pnpm --dir server/db db:verify:business-partner-ddl-parity
pnpm --dir server/db db:verify:ddl-model
pnpm --dir server/db typecheck
pnpm --dir server/db test
```

The test run passed 223 tests, including the static S4 and S5 certification contracts. Live S4/S5 probes require a configured disposable NEON database and remain mandatory for every migration candidate; this report does not convert an unexecuted live probe into evidence.

## Remaining exit-gate work

G0 is not complete yet. Before its exit gate can close:

1. Capture and retain the registry's usage-query results from each supported environment at the declared cutover evidence checkpoint. There is no fixed minimum duration; source inventory alone is still not operational zero-use evidence.
2. Add genuine request coordinates for the published Entity contract release/id/hash and the applicable released definition bundle (the current form-template analogue), with an upgrade preflight that maps every non-terminal historical request. Rows that cannot be mapped must fail the migration with a bounded remediation report.
3. Make request creation resolve those pins from one active local release in the same transaction, and make submission reject missing, superseded, or hash-mismatched coordinates.
4. Run and retain live S4 and S5 certification evidence against both a clean build and the supported-upgrade path.

Until those four items pass, no compatibility surface in the registry is removal-eligible.
