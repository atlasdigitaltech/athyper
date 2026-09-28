# DEV publication ownership correction and BP history cleanup

Date: 2026-09-27. Local DEV only; user authorized targeted removal of obsolete history. No QA/STG/production changes.

## Inventory and retention decision

Neon had 24 compiled BP applications under these exact publication keys:

- `metadata.compiled_entity.business_partner`: 21 superseded applications and active release 22 (`28bf5bff-caba-5a16-b971-dfc376b2b501`).
- `metadata.compiled_entity.business_partner.tenant.11111111-1111-4111-8111-111111111111`: one superseded application and active release 2 (`b0515908-244d-40e9-b518-12116ddb7354`).

Mesh and Studio had no applications under either key, so no cleanup was performed there. The two active Neon BP bundles were retained: they remain selected for BP and contain necessary BP/reference artifacts. Their incidental Country reference members no longer override Country's own publication. No replacement BP publication was necessary for this correction.

## Backup and committed deletion

Recovery directory (local, outside the repository):
`/home/chandravel_natarajan/.local/state/athyper/dev-recovery/bp-publications-20260927-35J3jR/`

Contains `recovery.json.gz` (exact row snapshots, complete release inventory, comparison hashes) and `restore.sql.gz` (reverse-dependency insert order). Backup SHA-256:
`2af7efa5032932fbf08ac9b11a9971f2cdb83951e480145e83bfd19675046c2b`.

| Table | Deleted rows |
| --- | ---: |
| runtime_meta.applied_release | 22 |
| runtime_meta.applied_release_payload | 22 |
| runtime_meta.release_activation_event | 24 |
| authz.entity_operation_binding | 13 |
| authz.entity_operation_scope_binding | 13 |

All deleted releases were superseded; all deleted operation bindings were retired. There were no activation heads or entity descriptors referencing the deleted releases. Activation events referencing these releases (including predecessor references) were backed up and removed as disposable history.

The first attempt was rejected by immutable-history triggers and rolled back without deletion. The successful maintenance transaction locked the affected tables, checked backup hashes and dependency guards, suspended only four named history/delete guards, deleted the exact backed-up targets, and re-enabled those guards before commit. Foreign keys, validation and invalidation triggers were not disabled. A subsequent check confirmed all four guards enabled.

Before/after hashes matched for all activation heads, entity contracts, descriptors and the 69 Neon business-partner base records. Current Country releases and business data were not deleted or rewritten. Historical source-authoring/object-storage artifacts were not purged.

Recovery was tested by restoring every archived row, checking row-set hashes, then rolling back that verification transaction. The backup is therefore recoverable; the live cleanup remains committed. Do not blindly restore after subsequent publication activity—first recheck current dependencies and uniqueness constraints.

## Generic resolver correction

`createRuntimeMetaCompiledEntityReleaseSource.findAdmittedRelease` now ranks explicit publication ownership (`coordinates.entityCode`) ahead of tenant specificity. Within the same ownership tier, tenant-specific releases still take precedence. Missing owner coordinates rank below explicit ownership. Embedded members remain available for reference-only compatibility when no direct owner exists. Explicit release/hash pins, active-head filtering and tenant visibility remain enforced. An invalid authoritative runtime contract is not silently skipped in favor of an older reference bundle.

This is source selection, not a permission expansion. Both shell route admission and record APIs use the shared reader. No Country-specific branch, signed payload edit, direct runtime projection insertion or new publication was introduced.

## Verification

- 79 metadata tests passed, including an opt-in PostgreSQL fixture executing the actual repository SQL: global owner versus tenant reference, legitimate tenant owner, cross-tenant exclusion, null owner, exact pins, missing pin, and reference-only compatibility.
- Metadata package source/test typechecks passed.
- Actual repository + pinned reader against live DEV Postgres resolves Country release `934dae8a-0ded-459c-a9ea-349beaccf155` for Athyper and CirrusAtlantic in Neon, Mesh and Studio, and successfully reads its list/read runtime contract.
- Neon BP still resolves the previously active tenant/global bundles for the respective tenants; core artifacts and publication coordinates read successfully.
- API and worker are running healthy after source-watch reload; Neon root returns HTTP 200.
- Structured diagnostic evidence: `dev-publication-ownership-resolution-20260927.json`.

**Acceptance boundary:** the live reader checks use a database-owner diagnostic connection with explicit tenant coordinates; they are not authenticated end-user API/browser tests and do not establish effective permissions or BP end-to-end UI behavior. A user refresh/list/detail/BP check was requested and remains outstanding at this checkpoint.

Maintenance implementation: `tooling/scripts/local-dev/cleanup-superseded-bp-publications.mjs` (DEV-only exact-key plan/apply/verify-recovery). Existing unrelated worktree changes were preserved.
