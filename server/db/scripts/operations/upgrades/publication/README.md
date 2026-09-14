# Explicit publication upgrades

These five retained SQL files support explicit baseline, tenant-fork, successor,
and restoration-dependency installers. They are excluded from automatic foundation
and forward-migration manifests.

Their existing callers still enforce their own target and execution rules. SQL
bytes and migration ledger names are unchanged; only source locations moved from
`server/db/migrations/`. In particular, the Mesh fork installer reads the new files
while retaining the original migration names and checksum comparisons in its ledger.
Do not replay a full canonical foundation as a replacement against an existing DB.

See `server/db/migrations/inventory.json` for original paths, SHA-256 checksums,
current paths and callers. Historical receipts retain their original coordinates.
Run `pnpm --dir server/db db:verify:migration-layout` to check retention.
