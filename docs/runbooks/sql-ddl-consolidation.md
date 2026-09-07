# Local-development SQL DDL consolidation

The following 16 development migrations are consolidated into the canonical DDL. Their SQL files and entries in the Studio, Neon and Mesh forward-migration manifests have been removed. The foundation runner loads the definitions through `server/db/ddl/planes/<plane>/_manifest.txt`.

All paths below are relative to `server/db/ddl/`.

| Retired script | Canonical definitions |
| --- | --- |
| `20260906_governance_deviation_idempotency.sql` | `common/governance/03_tables.sql` |
| `20260907_entitlement_repository.sql` | `common/control/{03_tables,05_constraints,07_functions,08_triggers,10_rls,11_grants}.sql`, each plane's `control/03_tables.sql`, `common/audit/12_reference_seed.sql` |
| `20260907_mesh_api_review.sql` | `planes/mesh/mesh/11_grants.sql` |
| `20260908_entitlement_integer_limits.sql` | `common/control/03_tables.sql` |
| `20260909_entitlement_runtime_snapshots.sql` | `common/snapshot/{03_tables,05_constraints,08_triggers,10_rls,11_grants}.sql`, `common/control/07_functions.sql` |
| `20260910_feature_administration.sql` | `common/control/{03_tables,07_functions,08_triggers,10_rls,11_grants}.sql`, `common/audit/12_reference_seed.sql` |
| `20260911_feature_cohort_strategy.sql` | `common/control/{03_tables,07_functions,08_triggers}.sql`, `common/audit/12_reference_seed.sql` |
| `20260912_parameter_validation_alignment.sql` | `common/control/07_functions.sql` |
| `20260913_parameter_versions.sql` | `common/control/{03_tables,07_functions,08_triggers}.sql` |
| `20260914_parameter_runtime.sql` | `common/control/{07_functions,11_grants,12_parameter_runtime_seed}.sql`, `common/audit/12_reference_seed.sql` |
| `20260915_parameter_runtime_validation_grants.sql` | `common/control/11_grants.sql` |
| `20260916_runtime_approval_preview.sql` | `common/ops/03_tables.sql` |
| `20260917_authorization_management.sql` | `common/authz/13_management.sql` |
| `20260918_control_repository_integrations.sql` | `common/control/14_admin_integrations.sql` |
| `20260919_address_link_cancellation.sql` | `common/master/{03_platform_tables,07_functions}.sql`, each plane's `master/{05_constraints,06_indexes}.sql` |
| `20260920_lookup_domain_reference_guard.sql` | `common/control/15_lookup_reference_governance.sql` |

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
