# Canonical development baseline and future upgrades

Fresh databases install `../ddl/planes/<plane>/_manifest.txt`. Existing databases
apply only the reviewed forward upgrades listed in `manifests/<plane>.txt` through
the startup runner, which verifies checksums and records receipts. Keep all three
manifests and `runner-transactions.sha256` in Git.
Maintain final tables, constraints, indexes, functions, triggers, RLS, grants and
reference seeds in their owning canonical DDL files. Do not replay foundation DDL
on populated DEV/QA databases or reset their migration receipts.

The current 96-entry inventory records:

| Disposition                     | Count | Purpose                                              |
| ------------------------------- | ----: | ---------------------------------------------------- |
| Canonical retirement            |     8 | Removed copies mapped to canonical sources.          |
| Legacy upgrade                  |    43 | Preserved legacy upgrade/rehearsal SQL.              |
| Operational upgrade             |    11 | Explicit installation; not automatic startup replay. |
| Historical fixture              |     6 | Staged test schemas.                                 |
| Operational repair              |     2 | Explicit reference-permission repairs.               |
| Automatic post-baseline upgrade |    26 | Reviewed entries in applicable plane manifests.      |

Compiled runtime publication source and capability-profile authoring upgrades remain
operational because they are absent from the automatic manifests. Their original
SQL checksums are preserved. Removed callers are recorded as historical callers,
not executable entrypoints. The record-mutation audit contract upgrade has a
three-plane disposable-schema rehearsal via `pnpm qualify:entity-audit-upgrade`;
this proves that specific upgrade, not all historical upgrade combinations.

`inventory.json` maps original filenames/checksums to current locations, original
planes, canonical files and callers. Historical receipts retain their original
paths and hashes. Dynamic installers resolve source locations through
`tooling/scripts/verification/migration-source.mjs`, preserving ledger names.

Experience-foundation and Atlas-learning verification now validate canonical blocks
and foundation manifest coverage. Their `db:generate:*` commands write unapplied
`.candidate.sql` files beneath `~/.athyper/candidates/sql-upgrade-<id>/` (or the
configured `ATHYPER_RUNTIME_ROOT`). They never regenerate archived or active SQL.
Review a candidate's target baseline, behavior and prerequisites before assigning
a new migration name, adding an inventory entry and applicable plane manifests.
Preserve every previously applied SQL checksum.

Run `pnpm --dir server/db db:verify:migration-layout` after organization changes.
This checks file retention, checksums, canonical paths and manifest ownership;
it does not prove database compatibility. Validate fresh foundation plus startup
runner, and test actual upgrades separately with disposable legacy fixtures.

Existing databases needing pre-baseline changes require a reviewed legacy upgrade
plan. A successful automatic upgrade sequence is not proof that an existing database
has every canonical schema capability. The archive is not a standalone alphabetical upgrade sequence.
See [consolidation and recovery](../../../docs/runbooks/sql-ddl-consolidation.md).

The Atlas authenticated-session upgrade changes only the plane-local
`<plane>.ai.agent.use` MFA requirement. It preserves grants, permission identity,
status, login policy, and underlying operation requirements. Fresh databases use
the matching canonical catalogs and compiled authorization seed packs.
