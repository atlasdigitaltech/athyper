# Three-plane SQL DDL and seed execution evidence

**Execution date:** 2026-08-30  
**Source branch:** `stack-v2-foundation`  
**Environment class:** disposable local integration  
**Result:** DDL and canonical database seed execution passed; release authorization remains blocked by separately governed inventory qualification.

## Scope and target

The complete desired-state SQL manifests for Studio, NEON and MESH were applied to fresh PostgreSQL 16.13 databases in the disposable container `athyper-bs360-full-sql`. The container was bound to `127.0.0.1:55434` and labelled `athyper.environment=disposable_local` and `athyper.purpose=business-partner-360-integration-baseline`.

No shared development, QA, staging or production database was modified. Database URLs and credentials are deliberately excluded from this record.

The canonical three-plane provisioner then applied every database seed context in manifest version `2.0.2`. Keycloak reconciliation was explicitly skipped because this execution was limited to SQL DDL and database seed state.

## Desired-state DDL execution

| Plane | Database | Ordered SQL files | Manifest SHA-256 | Applied at UTC | Result |
| --- | --- | ---: | --- | --- | --- |
| Studio | `athyper_studio` | 229 | `06ffaae096c1ccead1c3ff80a6e38332c2a747d49d5953fed0e6886afdefe886` | 2026-08-30T06:22:34.582Z | Passed |
| NEON | `athyper_neon` | 216 | `18621e7be4449d1285ab03a069e58ccd55a7b4fb121c7f9d2c47add4accb5745` | 2026-08-30T06:23:20.596Z | Passed |
| MESH | `athyper_mesh` | 205 | `7f5a535a69bc5ec082a0c7fdd8b4296fadada0b08e2995a90a3ee67dca062bac` | 2026-08-30T06:23:59.878Z | Passed |

The three-plane DDL model check passed for all 650 ordered entries. During the clean build, Studio lifecycle coverage for `master.address_event` was completed in the Studio constraint, index, function, trigger, RLS and grant manifests. The environment was then destroyed and rebuilt from the beginning; the results above are from that clean final run.

## Canonical database seed execution

| Plane | Expected contexts | Verified contexts | Verified application projections | Content receipt |
| --- | ---: | ---: | ---: | --- |
| Studio | 28 | 28 | 3 | `831ccfcee7e109053a48bcc53723c9038c0593e434e53b0b254b64c8eecce07b` |
| NEON | 151 | 151 | 3 | `64652229d8e6998d240dbf2173ce34399781daf9e4a08686252bec9fc07c4c3d` |
| MESH | 54 | 54 | 3 | `374afabb7a4676e23a0e8f049d44f7ee342c5673858ac45aea570c07e79601d0` |

The immutable top-level Studio receipt is `b98ad62e-1ebc-45c7-a2f6-ad6b8070d675`. The canonical provision manifest SHA-256 is `1dedeb4c5f5b3e355da81e9da498a91c1e87118c876d5ce6a3c62883e1164d4e`.

All 233 expected contexts and all nine application projections were read back successfully after apply. The authorization seed packs were applied twice by the strict idempotency runner without execution failure.

## Verification retained with this execution

| Check | Result |
| --- | --- |
| Studio RLS | Passed: 232 tenant-scoped table parents have enabled and forced RLS with policies |
| NEON RLS | Passed: 491 tenant-scoped table parents have enabled and forced RLS with policies |
| MESH RLS | Passed: 206 tenant-scoped table parents have enabled and forced RLS with policies |
| Seed contract lint | Passed: 72 files checked; 22 unchanged pre-contract files remain baseline-bound |
| Three-plane DDL model | Passed |
| Workspace tests | Passed: 180 of 180 Turbo tasks |
| Workspace typecheck | Passed: 250 of 250 tasks |

## Explicit exclusions and open gates

This execution proves reproducible SQL DDL and canonical database seed installation. It does not constitute production deployment, Keycloak reconciliation, or release approval.

The strict repository-wide authorization release evaluator remains `ready: false`. Its open scope includes application permission-demand qualification, physical-table authorization inventory review, cross-plane implementation qualification and 18 MESH network permission qualification decisions. Those gates are not bypassed by successful seed replay.

The root repository suite also reports pre-existing policy drift outside this database execution: test-reachability ownership, the shared verification-page contract, experience-cleanup expectations and runtime list-cache rollout expectations. These remain publication-visible follow-up work.
