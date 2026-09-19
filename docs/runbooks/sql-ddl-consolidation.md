# Local-development SQL DDL consolidation

Current outcome: the active migration root contains **zero SQL files**. Canonical
DDL is the development baseline; empty manifests retain the runner contract for
future upgrades. See [final baseline](#final-canonical-baseline) for current behavior
and validation. Earlier sections record the successive cleanup passes.

## Initial consolidation

The following 17 development migrations are consolidated into the canonical DDL. Their SQL files and entries in the Studio, Neon and Mesh forward-migration manifests have been removed. The foundation runner loads the definitions through `server/db/ddl/planes/<plane>/_manifest.txt`.

All paths below are relative to `server/db/ddl/`.

| Retired script                                     | Canonical definitions                                                                                                                                                 |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260907_atlas_local_generation.sql`              | `common/ai/{03_tables,05_constraints,07_functions,08_triggers,10_rls,11_grants}.sql`                                                                                  |
| `20260906_governance_deviation_idempotency.sql`    | `common/governance/03_tables.sql`                                                                                                                                     |
| `20260907_entitlement_repository.sql`              | `common/control/{03_tables,05_constraints,07_functions,08_triggers,10_rls,11_grants}.sql`, each plane's `control/03_tables.sql`, `common/audit/12_reference_seed.sql` |
| `20260907_mesh_api_review.sql`                     | `planes/mesh/mesh/11_grants.sql`                                                                                                                                      |
| `20260908_entitlement_integer_limits.sql`          | `common/control/03_tables.sql`                                                                                                                                        |
| `20260909_entitlement_runtime_snapshots.sql`       | `common/snapshot/{03_tables,05_constraints,08_triggers,10_rls,11_grants}.sql`, `common/control/07_functions.sql`                                                      |
| `20260910_feature_administration.sql`              | `common/control/{03_tables,07_functions,08_triggers,10_rls,11_grants}.sql`, `common/audit/12_reference_seed.sql`                                                      |
| `20260911_feature_cohort_strategy.sql`             | `common/control/{03_tables,07_functions,08_triggers}.sql`, `common/audit/12_reference_seed.sql`                                                                       |
| `20260912_parameter_validation_alignment.sql`      | `common/control/07_functions.sql`                                                                                                                                     |
| `20260913_parameter_versions.sql`                  | `common/control/{03_tables,07_functions,08_triggers}.sql`                                                                                                             |
| `20260914_parameter_runtime.sql`                   | `common/control/{07_functions,11_grants,12_parameter_runtime_seed}.sql`, `common/audit/12_reference_seed.sql`                                                         |
| `20260915_parameter_runtime_validation_grants.sql` | `common/control/11_grants.sql`                                                                                                                                        |
| `20260916_runtime_approval_preview.sql`            | `common/ops/03_tables.sql`                                                                                                                                            |
| `20260917_authorization_management.sql`            | `common/authz/13_management.sql`                                                                                                                                      |
| `20260918_control_repository_integrations.sql`     | `common/control/14_admin_integrations.sql`                                                                                                                            |
| `20260919_address_link_cancellation.sql`           | `common/master/{03_platform_tables,07_functions}.sql`, each plane's `master/{05_constraints,06_indexes}.sql`                                                          |
| `20260920_lookup_domain_reference_guard.sql`       | `common/control/15_lookup_reference_governance.sql`                                                                                                                   |

The two earlier tracked migrations, `20260906_identity_replay_approval.sql` and `20260906_mesh_exchange_readiness.sql`, remain outside this cleanup's scope.

## Fresh local setup

Use the foundation runner against a new disposable PostgreSQL container, once per plane:

```sh
pnpm exec tsx server/db/scripts/provisioning/foundation-runner.ts --plane=neon --container=<disposable-postgres-container>
pnpm exec tsx server/db/scripts/provisioning/foundation-runner.ts --plane=mesh --container=<disposable-postgres-container>
pnpm exec tsx server/db/scripts/provisioning/foundation-runner.ts --plane=studio --container=<disposable-postgres-container>
```

The runner checks that each target database is fresh and records checksums for the DDL files. Do not replay the foundation against populated databases. This repository cleanup does not reset development or QA databases, fill their previously identified schema gaps, or rewrite existing migration receipts. Rebuilding an existing local database is a separate data-reset operation.

PostgreSQL regression suites now load canonical DDL directly. Tests for retired upgrade-only conversions and backfills have been removed; current schema, validation, authorization and repository behavior remain covered. Earlier runbooks retain historical deployment evidence, with a notice that their retired migration commands no longer apply.

## Cleanup verification

Fresh PostgreSQL 16 foundation builds passed for Neon (213 DDL receipts), Mesh (209), and Studio (233). Catalog checks confirmed address cancellation, the lookup reference function and trigger, and both new contact/address audit contracts on every plane.

The affected PostgreSQL suites passed 157 tests: parameter validation (61), parameter versions (22), runtime commands (12), entitlements (37), and master data (25). The isolated governance-deviation and Mesh registration-command regressions also passed. Control-admin and master-data test TypeScript checks passed. No development or QA database was modified.

## Follow-up migration inventory — 14 September 2026

The remaining 64 scripts were reviewed separately from the 17 retired above.
Nine unlisted development patches are now represented by their canonical final
definitions; two reference-permission repairs moved to the operations tree. The
41 manifested upgrades and 12 explicitly invoked upgrades remain byte-for-byte
unchanged. Their callers and checksums are recorded in
[the migration inventory](../../server/db/migrations/inventory.json).

| Retired development patch                        | Canonical SQL, relative to `server/db/ddl/`                 |
| ------------------------------------------------ | ----------------------------------------------------------- |
| `20260911_baseline_forward_sequence.sql`         | `common/runtime_meta/12_baseline_precondition.sql`          |
| `20260911_runtime_restoration_neon.sql`          | `common/runtime_meta/12_baseline_precondition.sql`          |
| `20260911_runtime_restoration_studio.sql`        | `planes/studio/metadata/14_runtime_restoration.sql`         |
| `20260912_business_partner_navigation_label.sql` | `planes/neon/master/12_platform_catalog_reference_seed.sql` |
| `20260914_address_subdivision_capture.sql`       | `planes/neon/master/07_functions.sql`                       |
| `20260914_advanced_address_capture.sql`          | `planes/neon/master/07_functions.sql`                       |
| `20260914_bank_country_capture.sql`              | `common/control/12_banking_reference_seed.sql`              |
| `20260914_malaysia_state_regions.sql`            | `common/shared/reference-data/002_state_region.sql`         |
| `20260914_request_address_subdivision.sql`       | `planes/neon/document/03_tables.sql`                        |

The advanced-address patch is an intermediate definition superseded by the
subdivision-aware materializer. The forward-sequence patch is preserved by the
newer restoration-aware precondition. The request-address patch concerns the
legacy request table; its column and foreign key already appear in that table's
canonical definition. None requires replaying the dated patch for a fresh build.

Studio's manifest now installs its existing
`planes/studio/metadata/14_runtime_restoration.sql` after the baseline import and
before security-definer hardening. This defines the restoration ledger and
functions without creating runtime activations or business data.

Neon's manifest no longer references the three nonexistent internal-bank files
listed as removed in the recorded session reversal:
`16_internal_bank_verification.sql`, `17_draft_bank_proposals.sql`, and
`18_internal_bank_policy_publication.sql`. The two Business Partner column-level
UPDATE grants now omit `display_name` and `legal_name`, which are absent from the
canonical `master.business_partner` table. Other granted columns are unchanged.

### Recovery and existing installations

A checksum-verified private snapshot of all 64 original SQL files and their mapping
is retained at
`~/.athyper/backups/sql-consolidation/20260914T045305Z/`.
Historical evidence paths and hashes remain untouched. The committed inventory
provides portable original-to-current mappings; the snapshot provides local
recovery of the retired development patches.

This is a fresh-development-baseline cleanup, not an upgrade of DEV or QA. Their
business data, existing migration receipts and activation state were not changed.
Retained upgrade SQL stays immutable. A retained pre-baseline installation needing
a retired patch requires a separately reviewed upgrade or an authorized rebuild.

### Follow-up validation

Run `pnpm --dir server/db db:verify:migration-layout` for inventory, manifest and
retained-checksum validation. Fresh-install results and targeted regression results
for this cleanup are recorded below.

- Fresh PostgreSQL 16.15 builds passed: Neon 221 DDL receipts, Studio 241, Mesh 215.
- All three planes contain the five country account-capture profiles and 16
  Malaysia subdivision reference rows. Neon assertions verified address materializer
  fields, the Business Partners label, and restoration/forward-sequence guards.
  Studio assertions verified the restoration ledger, compiler function, enabled RLS,
  and an empty restoration ledger after setup.
- Ten targeted manifest/migration regression tests passed. One optional PostgreSQL
  reference-history test was skipped because its separate target was not supplied;
  it is not counted as a pass.
- Migration inventory/checksums, all-plane foundation planning, updated caller syntax,
  and the absence of executable references to the nine retired paths passed.
- Successful build logs and catalog assertion output are retained under the private
  snapshot's `validation-7a2c5bb2/` directory. The temporary database container was
  removed. No full retained-upgrade replay or production release qualification is
  claimed by this fresh-baseline validation.

## Rehearsal and explicit-upgrade cleanup — second pass

The migration root now contains only the 41 forward upgrades referenced by plane
manifests. All twelve previously unlisted explicit-upgrade files were handled:

- Five publication/baseline installer inputs moved, unchanged, to
  `server/db/scripts/operations/upgrades/publication/`.
- Six company-case, successor and protected-value rehearsal inputs moved,
  unchanged, to `server/db/scripts/tests/integration/fixtures/legacy-upgrades/`.
- `20260911_preserve_binding_retirement.sql` was retired. The binding-recovery
  rehearsal now selects the two current functions from canonical
  `common/authz/07_functions.sql`, retaining its expiry, non-resurrection and
  rollback assertions. New reports identify the canonical source and selected
  function hashes; historical reports are untouched.

The Mesh fork installer preserves original migration ledger names and SQL hashes
while reading relocated files. Other executable callers and inventory paths were
updated. Foundation DDL and all forward-migration manifests/SQL are unchanged by
this second pass. Historical fixture bytes are intentionally frozen rather than
replaced with the latest schema, because their tests construct earlier states.

The updated inventory records 10 canonical retirements, 41 forward upgrades,
5 operational upgrades, 6 historical fixtures and 2 operational repairs. The layout
check also rejects obsolete copies at the original migration paths.

Original inputs and relocation mappings are backed up at
`~/.athyper/backups/sql-rehearsal-cleanup/20260914T051413Z/`.

Validation: the canonical binding-recovery PostgreSQL test passed; the populated
Business Partner provider PostgreSQL test using the relocated company-ownership
fixture passed; ten existing migration/manifest regression tests passed. Both new
PostgreSQL runs used disposable containers and removed them afterward. Updated
callers passed syntax/path checks and retained SQL passed inventory checksum checks.
No full historical candidate deployment or live DEV/QA update was performed.

## Eleven manifested upgrades consolidated — third pass

The eleven September 11–13 migrations shown in the follow-up review have been
removed from all automatic migration manifests. The migration root now contains
30 SQL files. Their final behavior was already maintained in canonical DDL; this
pass makes that DDL the fresh-development baseline instead of replaying the dated
upgrade wrappers.

The exact originals are retained in
`server/db/scripts/operations/upgrades/legacy-baseline-20260914/`, with their former
manifest order and transaction-wrapper checksums. The inventory maps each legacy
file to its canonical definitions and retains its SHA-256 and original planes.
Historical callers now use the legacy bundle; fresh-manifest tests assert canonical
coverage and absence of the retired automatic steps. Historical receipts remain
unchanged. The bundle requires a reviewed upgrade plan for an existing installation;
it is not a standalone sequence to run on a current foundation.

The canonical company approver has newer caller binding and SECURITY DEFINER
behavior than the legacy company-lifecycle SQL. That canonical implementation was
preserved. Other extracted function definitions in these eleven upgrades were
found in the mapped canonical files without needing to copy them again.

The active transaction-wrapper checksum list no longer includes the retired
recent-choice upgrade. The forward-runner test loads the preserved SQL and adds
its checksum to its own temporary manifest, retaining atomic rollback, receipt,
and failed-replay coverage. The database deployment test now uses the reviewed
inventory for plane ownership instead of its outdated hard-coded plane exceptions.

Validation passed:

- Fresh PostgreSQL 16.15 foundations: Neon 221 receipts, Studio 241, Mesh 215.
- `server/db/scripts/tests/integration/canonical-development-baseline.sql` catalog
  assertions passed on all three planes, covering the consolidated definitions.
- Twelve database migration/manifest regression tests and 24 deployment-structure
  tests passed, with no skips.
- The enabled disposable forward-runner PostgreSQL test passed, including atomic
  rollback, checksum retention and failed-replay refusal.
- Migration inventory/checksum and updated executable-path checks passed.

Original files, previous inventory and evidence are backed up under
`~/.athyper/backups/sql-baseline-cleanup/20260914T052147Z/`; successful fresh-build
logs are in `validation-52a99d75/`. No running DEV/QA database, activation or migration
receipt was changed. These results qualify the fresh canonical foundation and the
tested runner behavior, not a replay of every historical upgrade against DEV/QA.

## Final canonical baseline

The remaining 30 automatic migrations have been consolidated into the canonical
baseline and retained, unchanged, in the explicit legacy bundle. All three active
manifests are comment-only and the active transaction-wrapper list is empty.
`server/db/migrations/` now contains only README, inventory and those four manifest
files. Keep this infrastructure for new, reviewed post-baseline upgrades.

The final inventory classifies 64 original files: 43 legacy upgrades, five explicit
publication upgrades, six historical fixtures, two operational repairs and eight
canonical retirements. Two historical reset-installer sources, previously retired,
were recovered from their original checksum-verified snapshot when the dynamic-path
audit found their caller. This restores that caller without replaying old SQL in
fresh startup. Original ledger filenames and SQL checksums are preserved.

Canonical DDL already contained the final schema and newer safeguards. The optional
`athyper_runtime` conversation-helper grants were added to common AI grants to
preserve the former role-conditional compatibility step; existing application role
grants are unchanged. The newer baseline activation/restoration behavior remains
canonical instead of being overwritten by older upgrade functions.

Dynamic Atlas and reset installers now resolve retained files through the migration
inventory. Experience and Atlas-learning checks validate canonical blocks and
foundation manifest coverage. Their generators write new unapplied `.candidate.sql`
files under `~/.athyper/candidates/sql-upgrade-<id>/`; smoke tests confirmed they do
not recreate active or archived migrations. Review and rename candidates before
registering any future upgrade.

Legacy integration tests explicitly load the archived inputs. The missing-constraint
fixture now applies its historical preflight repairs explicitly, since empty current
manifests must not silently repair an older installation. Original ordering remains
available under the bundle's `original-manifests/` and is still tested.

Final verification:

- Fresh PostgreSQL 16.15 foundations passed for Neon (221 receipts), Studio (241),
  and Mesh (215), including the extended canonical catalog assertions.
- The actual forward-migration startup script ran twice against those foundations.
  Schema-only dumps were unchanged, synthetic historical ledger receipts retained
  their hashes/status, and no additional migration receipts appeared. Post-startup
  canonical assertions passed on every plane. These are disposable fixture receipts,
  not live qualification records.
- Thirteen database unit tests and 24 deployment-structure tests passed. The enabled
  PostgreSQL forward-runner atomicity/checksum/failed-replay test passed.
- The database review integration suite passed 17 checkpoints covering fresh/legacy
  catalogs, RLS, grants, compatibility diagnostics, repeated upgrades and concurrent
  suspension/retrieval. Experience-foundation integration passed 18 checkpoints
  across all three planes, including preserved rows and rejected incompatible drift.
- Canonical verification commands, generator smoke tests, migration inventory,
  retained checksums, dynamic paths and 43 registered caller syntax checks passed.

Final originals, inventory snapshots and test logs are backed up at
`~/.athyper/backups/sql-final-baseline/20260914T053345Z/`. Successful combined-startup
logs and results are in `validation-d7af292b/`. Disposable containers were removed.
Running DEV/QA databases, their data, activation state and migration receipts were
not changed. Existing installations still need catalog verification and a separately
reviewed legacy upgrade or authorized rebuild; empty manifests do not certify them.
