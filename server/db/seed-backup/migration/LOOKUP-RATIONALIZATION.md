# Wave 3 lookup rationalization

Wave 3 replaces the executable `seed/platform/000_lookups` tree with consumer-owned,
versioned layer-12 lookup packs. The legacy files remain temporarily as audit sources;
`provision.ts` explicitly excludes them, so they cannot be applied alongside the new packs.

## Ownership result

| Plane | Generated packs | Retained values | Ownership rule |
| --- | ---: | ---: | --- |
| Common | 2 | 196 | Shared operational meanings |
| Athyper | 6 | 220 | Platform administration and metadata |
| Neon | 24 | 1,275 | ERP finance, master data, documents, and P2P |
| Mesh | 1 | 19 | Partner-network meanings |

The authoritative per-file decision record is `wave3-lookup-ledger.v1.json`. Its source
hashes and classifications are regenerated with `pnpm db:seed:wave3:build` and checked
with `pnpm db:seed:wave3:check`.

The generated SQL lives under each plane's `control/lookup-packs` directory and is loaded
by that plane's `12_lookup_reference_entrypoint.sql`. Small legacy files are consolidated
by domain family. Large or independently versioned catalogs retain standalone packs.
Lookups already sealed by DDL domains are excluded from generated values.

## Validation and deletion gate

`wave3-lookup-receipt.v1.json` records the fresh Athyper, Neon, and Mesh build receipts.
Run `pnpm db:seed:wave3:verify` to validate coverage, ownership, manifests, sealed-domain
retirement, convergence semantics, and runtime exclusion. Legacy files must not be
deleted unless both the ledger receipt and this verification remain passed.
