# DEV and QA database rebuild — 24 September 2026

## Outcome

Completed the user-authorized clean rebuild of the six application databases.
Both environments now run the rebuilt production application images. Existing
IAM databases, realms, users, passwords and MFA credentials were preserved.

| Plane | DEV | QA | Foundation receipts per database |
| --- | --- | --- | ---: |
| Studio | Rebuilt, seeded, verified | Rebuilt, seeded, verified | 245 |
| Neon | Rebuilt, seeded, verified | Rebuilt, seeded, verified | 257 |
| Mesh | Rebuilt, seeded, verified | Rebuilt, seeded, verified | 218 |
| IAM | Preserved, healthy | Preserved, healthy | Keycloak 26.7.3; 210 matching changelog entries |

DEV uses `athyper-dev-db-1`; QA uses
`athyper-qa-candidate-1789163256545-db-1`. DEV's source and compiled-container
configurations point to the same DEV infrastructure. The active DEV application
mode is now **container / devfull**, with all three frontends running.

## Validation performed

- Restored all eight pre-rebuild PostgreSQL backups successfully on isolated
  containers using the original PostgreSQL images. Removed those test containers.
- Built fresh canonical foundations and seeded the repository's standard
  Athyper, Technostat and CirrusAtlantic tenant/access packs.
- Verified 28 Studio, 151 Neon and 54 Mesh access contexts in staging. All 233
  identity bindings in each deployed environment match that environment's
  retained IAM subjects; no IAM credentials were copied between environments.
- Passed the three-plane non-admin authorization RLS test in staging.
- Passed the real PostgreSQL CA02 collaboration test: revisions, atomicity,
  canonical reporting, immutable scanned bytes, folder-cycle guards and
  application-role tenant/private-comment isolation. Its fixture rolled back.
- Passed canonical baseline catalog assertions on all six deployed databases.
- Compared all application schemas against the staged desired state: zero
  missing, changed or extra objects across the repository comparator's 13
  categories, including columns, constraints, indexes, functions, views,
  triggers, relation/function ACLs, RLS flags and policies.
- Verified checksums/status for all registered forward migration entries. The
  fresh foundation was baselined using the repository's baseline runner; this
  is not a claim that historical upgrade wrappers were replayed.
- All 12 application containers report healthy. Both APIs return HTTP 200 from
  `/livez` and `/readyz`; all six frontend root URLs return HTTP 200. IAM remains
  healthy in both environments.

The catalog comparison does not certify every reference-data row, default
privilege or cluster role membership. Health checks are not a full browser
acceptance test or production release qualification.

## Corrections made during preparation

- Fixed September 23 migration manifest paths, registered the five existing SQL
  files with their unchanged checksums, and added the collection configuration
  migration to Studio. Migration layout verification passes.
- Added production compilation/deployment for shared rich-text, party,
  collection and activity contracts. The runtime image's module-load smoke test
  caught TypeScript exports under `node_modules`; rebuilt images pass that gate.
  Party's production bundle preserves its browser-compatible source exports.
- Corrected a baseline assertion to reject a direct legacy runtime ACL while
  permitting access inherited through the standard `athyperapp` role.
- Reconciled canonical role-dependent task-policy/interaction grants and
  policies after creating stage service roles. DEV API startup initially caught
  a missing publication-writer grant; this was corrected from the exact canonical
  blocks, validated, and incorporated into QA's installation before cutover.

## Reset effects and preserved data

Application databases now contain a fresh baseline and standard tenant/access
seeds. Previous business records, drafts, published metadata and custom grants
were **not restored** into the active databases. Publishing application metadata
and adding business fixtures are separate subsequent tasks; HTTP readiness does
not imply that previous customized business screens remain populated.

DEV and QA application memory-cache and job-queue database 0 were snapshotted and
cleared to prevent stale sessions/authorization and old jobs from operating on
the reset databases. Users must sign in again. IAM, Infisical, object storage and
search storage were not reset. Old search documents/objects were not certified
as consistent with the new application data and require a separate cleanup or
reindex decision; no broad storage deletion was performed.

The former application databases remain in their original PostgreSQL clusters:

- `athyper_studio_pre_rebuild_20260924`
- `athyper_neon_pre_rebuild_20260924`
- `athyper_mesh_pre_rebuild_20260924`

Connections to these six recovery databases are disabled. Do not remove them
until the new environment is accepted. They preserve the actual cutover state;
the earlier online logical backups are per-database snapshots, not a single
cross-database atomic snapshot.

## Evidence, operation and recovery

Private backups, verified dumps, Redis RDB snapshots, restore/install logs,
prior/new Compose configurations, image IDs and the final receipt are under:

`/home/chandravel_natarajan/.athyper/backups/dev-qa-pre-rebuild-20260924-hg6ZwJ/`

Key handover files in its `rebuild/` directory:

- `receipt.json`: deployed image/container IDs and successful checks.
- `catalog-verification.json`: complete final catalog comparison.
- `dev-next.compose.json`, `qa-next.compose.json`: exact deployed applications.
- `dev-previous.compose.json`, `qa-previous.compose.json`: prior configurations.
- `dev-state.json`, `qa-state.json`: retained database names and completed phases.
- `dev-memorycache.rdb`, `dev-jobqueue.rdb`, `qa-memorycache.rdb`,
  `qa-jobqueue.rdb`: pre-reset cache/queue snapshots.

DEV's compiled configuration is also saved as
`~/.athyper/instances/dev/workspace/container.rebuild-20260924.compose.json`.
Use the exact new Compose files for this rollout. Historical Stack release
receipts/image sets were not rewritten as if this working-tree build were a
promoted release. The old `pnpm env:dev` legacy-image switch still requires its
own baseline adoption because its six legacy application containers no longer
exist; do not bypass that safety gate. Existing source-mode configuration remains
available and points to the same rebuilt DEV databases, but mode switching was
not acceptance-tested during this rebuild.

Images use tag `rebuild-20260924-2e1eb41f` and source label
`working-tree-2e1eb41fc82e0042c60cbbe206341a1aa83c20f77834aa564ead50729696c368`.
The baseline SQL assertion and this report were updated afterward; runtime
source did not change after that build. No Git commit or release promotion was
performed.

Recovery requires a maintenance window: stop the matching application services,
retain the rebuilt databases, restore/rename the old databases and their
connection settings, reconcile or restore queue state, then start the matching
previous images and verify readiness. Do not mix old database contents with
new workers or blindly replay queued jobs. The remaining staging container is
removed after final verification; recovery databases and backup artifacts remain.
