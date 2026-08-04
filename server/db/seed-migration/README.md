# Seed migration Wave 0 ledger

`wave0-ledger.v1.json` is the authoritative source-file checklist for moving:

- `server/db/seed/blueprints/**/*.sql`
- `server/db/seed/platform/**/*.sql`, excluding `platform/003_control/**`

The ledger is generated from repository content plus reviewed overrides in
`wave0-review.v1.json`. Each entry records the source
SHA-256, logical dataset/version, data classification, target relations and
planes, disposition, dependencies/order, expected row-count capture state,
natural-key candidates, and migration receipt/validation state.

## Commands

```powershell
pnpm --dir server/db run db:seed:migration:wave0
pnpm --dir server/db run db:seed:migration:wave0:check
```

The first command refreshes the ledger. The second fails when source files,
DDL ownership, reviewed overrides, classification rules, or the checked-in
ledger differ. Put human-reviewed counts, keys, target corrections, receipts,
and validation results in `wave0-review.v1.json`; do not hand-edit the generated
ledger.

## Wave 1 contract gap report

`wave1-legacy-lint-report.v1.json` records the contract violations that must be
resolved while each Wave 0 row is moved or rewritten. Refresh it with:

```powershell
pnpm --dir server/db run db:seed:contract:legacy-report
```

The report covers the legacy files still awaiting migration and excludes the
Control Table. Its scope therefore decreases as receipts pass (356 files after
Wave 2). It is diagnostic migration input; enforcement for new or changed seed
packs is owned by `server/db/seed-contract/` and its hash-bound pre-contract
baseline.

## Wave 2 shared reference receipt

`wave2-shared-reference-receipt.v1.json` records the content-preserving move of
the 15 global-reference payloads into the common DDL layer, plus matching row
counts and successful final semantic validation from fresh Athyper, Neon, and
Mesh builds. The builds run in a disposable PostgreSQL container using the
canonical database names, leaving local application databases untouched.

## Safety contract

A legacy file is never deletion-eligible merely because it appears in this
ledger. Before deletion, its entry must have:

1. a committed target receipt;
2. a completed expected-row-count baseline;
3. a reviewed natural key;
4. successful semantic validation against the target; and
5. `deletionEligible` changed through a later reviewed migration wave.

`blocked` is intentional. It identifies unresolved plane ownership, missing or
remodeled DDL targets, and blueprint catalogue/application state that must wait
for the Control Table contract. Pending values must not be replaced by guesses.

## Classification notes

- Layer-common reference data uses the `common` plane marker; its manifest is
  applied independently to Athyper, Neon, and Mesh databases.
- Tenant-selectable blueprint payloads target Neon but remain seed packs rather
  than unconditional DDL-manifest steps.
- Lookup files under `platform/000_lookups/LookupDomain` were migrated in Wave 3
  into DDL layer-12 lookup packs (common/athyper/neon/mesh) and are no longer
  legacy phase-2 seeds.
- `validation_only` entries own no rows. The canonical local Neon authority is
  classified as a test fixture, not production reference data.
