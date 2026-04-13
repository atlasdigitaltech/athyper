# seed-data/

One-off data generation scripts used to produce seed SQL from source CSVs.
These are **not part of the regular build** — run them manually when upstream
reference data changes.

## Files

| File | Purpose |
|------|---------|
| `hs-codes.csv` | Harmonized System commodity codes (import/export classification) |
| `unspsc-codes.csv` | UNSPSC product/service classification codes |
| `generate-hs-sql.cjs` | Reads `hs-codes.csv` → writes SQL insert statements |
| `generate-unspsc-sql.cjs` | Reads `unspsc-codes.csv` → writes SQL insert statements |
| `verify-counts.mjs` | Queries the live DB and asserts expected row counts for ref data |

## Usage

```sh
# Regenerate HS codes SQL (output goes to server/db/sql/900_seed_data/)
node server/db/seed-data/generate-hs-sql.cjs

# Regenerate UNSPSC codes SQL
node server/db/seed-data/generate-unspsc-sql.cjs

# Verify reference data counts against live DB (requires DATABASE_URL)
node server/db/seed-data/verify-counts.mjs
```

## Why CJS/MJS?

These are isolated, one-off scripts with no TypeScript dependencies. They stay
as plain Node.js scripts to avoid needing a build step for data maintenance
tasks. They are intentionally excluded from the TypeScript project references.
