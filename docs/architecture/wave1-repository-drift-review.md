# Wave 1 local review

Status: implemented locally; uncommitted and pending combined candidate qualification. Base HEAD: `8cf6737d63b3e7744a61176fd5f0f3c48a65f2f9`.

See [dependency rationale and operating instructions](../runbooks/wave1-repository-drift.md). The initial changed-file formatting pass covered 228 supported files, preserving source edits already present in the workspace.

## Route review

Initial regeneration incorrectly dropped 20 control-admin routes that still exist in source. The manifest now supplements all current files with AST-extracted contracts, including named factories; raw router paths retain mount resolution. Legacy extraction is unchanged.

The corrected inventory adds **75 identities and removes none**. Historical provenance remains unchanged, with 898 legacy occurrences. The 40 transfer identities are existing internal and public-versioned routes expanded through their prefix helper. Other additions are existing contract factories and current AI, preferences, entity and business-partner declarations. Structural inventory does not establish authorization or OpenAPI response coverage.

| Source                                                                                | Added identities |
| ------------------------------------------------------------------------------------- | ---------------: |
| `server/apps/platform-host/src/composition/atlas-attachment-knowledge.ts`             |                2 |
| `server/packages/planes/neon/src/business-partner-account-bank-linkage-routes.ts`     |                2 |
| `server/packages/planes/studio/meta-entity-authoring/src/learning-routes.ts`          |                7 |
| `server/packages/platform/ai/src/atlas-routes.ts`                                     |                2 |
| `server/packages/platform/control-admin/src/control-service-routes.ts`                |                9 |
| `server/packages/platform/preferences/src/entity-views-routes.ts`                     |                2 |
| `server/packages/services/master-data/src/business-partner-360-route-contracts.ts`    |                1 |
| `server/packages/services/master-data/src/business-partner-governed-import-routes.ts` |                1 |
| `server/packages/services/publication/src/bank-directory-reader.ts`                   |                1 |
| `server/packages/services/publication/src/bank-directory-routes.ts`                   |                7 |
| `server/packages/services/records/src/entity-list-routes.ts`                          |                1 |
| `server/packages/services/records/src/transfer/transfer-routes.ts`                    |               40 |

## Verification

- 11 runner, formatter and dependency-count tests passed, including real subprocess failure, timeout, missing executable, CLI exit propagation and invalid formatting.
- 25 URL/manifest tests passed, including named-factory retention and router mount handling.
- All three focused Wave 1 checks passed: dependency budgets, route manifest and changed-file formatting.
- Workflow entrypoints and test reachability passed.
- Database, build and aggregate-gate YAML job definitions were compared with the pre-Wave-1 snapshot and remain unchanged.

## Full static discovery

All **47 checks executed: 28 passed and 19 failed**. The command returned exit 1. This is local discovery on a dirty tree, not qualification of a committed candidate. Full logs and JSON results are retained locally (originally `artifacts/static-policy/ci/`; now `~/.athyper/instances/dev/artifacts/static-policy/imported/ci/`) and uploaded by CI even on failure.

| Remaining failing check                          | Log                                                  |
| ------------------------------------------------ | ---------------------------------------------------- |
| `policy:versions`                                | `policy-versions.log`                                |
| `policy:tsconfig`                                | `policy-tsconfig.log`                                |
| `policy:temporal-discipline`                     | `policy-temporal-discipline.log`                     |
| `policy:server-boundaries`                       | `policy-server-boundaries.log`                       |
| `policy:server-rebuild-boundaries`               | `policy-server-rebuild-boundaries.log`               |
| `inventory:server-rebuild:check`                 | `inventory-server-rebuild-check.log`                 |
| `inventory:authorization:check`                  | `inventory-authorization-check.log`                  |
| `inventory:authorization-data-disposition:check` | `inventory-authorization-data-disposition-check.log` |
| `policy:business-partner-phase0`                 | `policy-business-partner-phase0.log`                 |
| `policy:foundation-phase1`                       | `policy-foundation-phase1.log`                       |
| `policy:api-client-phase2`                       | `policy-api-client-phase2.log`                       |
| `policy:deployment-profiles`                     | `policy-deployment-profiles.log`                     |
| `policy:plane-boundaries`                        | `policy-plane-boundaries.log`                        |
| `policy:auth-session-phase3`                     | `policy-auth-session-phase3.log`                     |
| `openapi:check`                                  | `openapi-check.log`                                  |
| `ddl:coverage:check`                             | `ddl-coverage-check.log`                             |
| `policy:theme-token-integrity:strict`            | `policy-theme-token-integrity-strict.log`            |
| `policy:design-system`                           | `policy-design-system.log`                           |
| `policy:style-tokens:strict`                     | `policy-style-tokens-strict.log`                     |

These failures remain blocking. Reconcile them before joint Wave 0/Wave 1 closure, then qualify the frozen commit through both required GitHub checks and verify active merge protection.
