# Legacy upgrades consolidated into the development baseline

These 43 SQL files are preserved byte-for-byte from the former automatic
migration root. Fresh databases use canonical DDL; these files are not part of
normal development startup or a second foundation pass.

`server/db/migrations/inventory.json` records each file's original checksum,
canonical definitions, prior planes (`legacyPlanes`), current location and callers.
The original pre-consolidation manifests and transaction checksums are in
`original-manifests/`. Their names and SQL hashes are historical ledger identities.

This directory is not a self-contained upgrade sequence: the original manifests
interleave these SQL files with other upgrades still in `server/db/migrations/`.
Existing installations need a reviewed plan using their actual schema and receipts,
with both sets of required files and the original order/checksums. Do not run these
files alphabetically, replay them blindly, or reset migration receipts. Existing
explicit candidate/rehearsal callers now read this directory and retain their own
target validation. No new automatic execution path was added.

The canonical company-approver function includes newer caller binding and its
reviewed SECURITY DEFINER behavior. The historical company lifecycle file retains
the older implementation for historical upgrade/rehearsal use; it must not overwrite
canonical functions on a current installation.

The unwrapped recent-choice migration still exercises the forward runner's atomic
rollback and checksum checks in a disposable fixture. Its checksum is added only
to that test's temporary manifest, not to the active development manifest.

The final pass moved the remaining 30 automatic upgrades here. Two reset-only
installer inputs were also recovered byte-for-byte from the original private
snapshot when dynamic callers were discovered. Their original ledger identities
and checksums remain unchanged. The original manifests cover 41 formerly automatic
files; the two reset-only inputs were explicitly invoked and are not in those lists.
The active migration manifests are now empty. Generators produce separate new
candidates and never rewrite this bundle.
