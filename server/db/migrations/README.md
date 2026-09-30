# Canonical development baseline and future upgrades

The development baseline has no automatic SQL migrations. Fresh databases install
`../ddl/planes/<plane>/_manifest.txt`; the three upgrade manifests are intentionally
comment-only and `runner-transactions.sha256` is empty. Keep these files in Git:
the startup runner requires them and safely handles an empty sequence.

Maintain final tables, constraints, indexes, functions, triggers, RLS, grants and
reference seeds in their owning canonical DDL files. Do not replay foundation DDL
on populated DEV/QA databases or reset their migration receipts.

The reviewed 64-file inventory now records:

| Disposition                     | Count | Location / purpose                                                                                                          |
| ------------------------------- | ----: | --------------------------------------------------------------------------------------------------------------------------- |
| Canonical retirement            |     8 | Redundant copies retired; canonical mappings retained.                                                                      |
| Legacy upgrade                  |    43 | `../scripts/operations/upgrades/legacy-baseline-20260914/`; exact SQL retained for reviewed legacy upgrade/rehearsal paths. |
| Operational upgrade             |     5 | `../scripts/operations/upgrades/publication/`; explicit installers.                                                         |
| Historical fixture              |     6 | `../scripts/tests/integration/fixtures/legacy-upgrades/`; staged test schemas.                                              |
| Operational repair              |     2 | `../scripts/operations/repair/reference-permissions/`.                                                                      |
| Automatic post-baseline upgrade |     0 | Add only new, reviewed changes here.                                                                                        |

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
plan. An empty automatic manifest is not proof that an existing database has the
canonical schema. The archive is not a standalone alphabetical upgrade sequence.
See [consolidation and recovery](../../../docs/runbooks/sql-ddl-consolidation.md).
