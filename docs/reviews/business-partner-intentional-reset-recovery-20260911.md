# BP intentional reset recovery — 11 September 2026

Status: runtime boot recovered; fresh publication and qualification required.

The user confirmed the DEV reset was intentional. The previous release-18 shared activation claim is no longer current. Historical release-20 signatures, reviews and isolated execution evidence remain intact and do not qualify this reset environment.

## Root cause and completed recovery

API and worker still loaded an obsolete BP shadow deployment referencing a release-19 artifact in the previous object-storage bucket. The storage-v6 artifact loader rejected its URI during startup. With no BP activation heads present, this stale shadow deployment caused both processes to restart.

The recovery verified the old deployment was **shadow**, saved a new private compose configuration, pinned the existing image, and recreated only API and worker with the obsolete BP shadow overlay disabled. Ordinary authorization remains enabled: an unauthenticated record API request returns `401 AUTH_TOKEN_REQUIRED`. Both processes are healthy. No grants, activation rows, permission definitions or stored business records were restored.

Current compose configuration: `~/.athyper/instances/dev/qualification/storage-v6/bp-reset-shadow-retirement.private.json`. The original `rollout.private.json` is retained as historical configuration; reusing it would reintroduce the obsolete shadow deployment. Future deployment authoring must use the recovered configuration or a compatible successor. Do not print either private file into qualification reports.

Evidence: `governance/policy/reports/business-partner-reset-runtime-recovery.dev.json`.

## Fresh baseline

The read-only capture checks NEON, Studio, named principals, healthy containers, the unauthenticated API boundary and unchanged authority fingerprints during capture. Studio authority is fingerprinted separately from the existing shared/clone NEON fingerprint.

| Item                                      | NEON |         Studio |
| ----------------------------------------- | ---: | -------------: |
| Permission definitions                    |  105 |             56 |
| Roles                                     |    0 |              0 |
| BP target definitions                     |    0 |              0 |
| BP activation heads                       |    0 |              0 |
| BP runtime contracts                      |    0 |              0 |
| Six required Studio authoring definitions |    0 |              0 |
| BP records                                |    0 | Not applicable |
| Cases                                     |    0 |              0 |

Both named accounts still exist and are active in each plane; account existence does not provide authoring or BP authority.

Capture: `node tooling/scripts/verification/capture-business-partner-reset-baseline.mjs`.
Report: `governance/policy/reports/business-partner-intentional-reset-baseline.dev.json`.

## Required restoration sequence

1. Prepare a successor catalog installation for missing Studio permissions and the reviewed BP catalog. The two source constraints remain an explicit policy-review dependency. Definitions must not silently receive grants.
2. Prepare fresh named author/reviewer and isolated qualification assignments against that catalog and current validity windows. Prior revoked or expired assignments cannot be replayed. The earlier temporary Studio grant proposal is insufficient because its prerequisite definitions are now absent.
3. Author and independently review the BP successor through native APIs, including the source-constraint correction and the company-owned pilot. Do not create an activation-head row directly or manufacture publication receipts.
4. Sign and load compatible runtime artifacts using current storage configuration; qualify isolated API and worker execution against the same artifact and image.
5. Complete populated ownership/field and command/Atlas journeys, then exercise compatible recovery while preserving current revocations and expiry.
6. Reconcile all 66 historical dispositions with fresh evidence. Fix defects and obtain explicit acceptance for intentional differences. Historical acceptance cannot be copied to the successor.

The existing development BP provisioning script is not a recovery mechanism for this phase: it creates local fixture publication evidence and can reactivate role assignments. It was inspected but not executed.

This recovery closes the restart-loop incident only. It does not close ownership qualification, signed-release recovery, renewed disposition acceptance, or enforcement activation.
