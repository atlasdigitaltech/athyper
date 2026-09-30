# Mechanical policy cleanup — 12 September 2026

Scope: inventories, changed-file formatting, dependency alignment, TypeScript configuration, Docker toolchain pins, URL catalogue and mechanical OpenAPI diagnostics.

## Changes

- Dependency policy scans source packages and excludes standalone builds and test fixtures. Versions align with the existing workspace versions; the React Query pin follows the current 5.101.4 manifest. The pnpm lockfile is refreshed.
- Source TypeScript configuration BOMs are removed. Server packages retain their shared `server/tsconfig.json` base, which the policy now recognizes by its exact resolved path. Strictness checks remain active.
- The S3 tools image and infrastructure maintenance workflow use the repository's pinned Node toolchain.
- Formatting preserves retained hash-bound evidence and generator-owned inventories. Inventories and URL documentation are regenerated after source formatting.
- The legacy inventory uses a checked-in snapshot recovered from commit `11ec46a314ad68cc107b27ee3309fc56bda2fa38`, with the original manifest SHA-256 in its provenance. All 1,473 historical identities are retained; an integrity check rejects dropped or modified entries. Routine verification no longer requires the ignored `server-backup` directory. Current deployment inventory scans `deploy/`.
- The static route scanner resolves default helper arguments and both finite conditional path arrays. Unknown branches and partially dynamic arrays remain failures. Finance contract detection tolerates formatting, and the migrated audit status exception is removed.

## Deferred OpenAPI migration

The user chose to keep this pass mechanical. The [separate migration backlog](openapi-contract-migration-backlog-20260912.md) lists all 152 undocumented operations across 19 files, with a suggested migration sequence and exit criteria. OpenAPI remains blocking; its exception baseline was not expanded.

## Validation

All seven mechanical checks passed on their final verification runs:

| Check                            | Result                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------- |
| `inventory:server-rebuild:check` | Passed; 2,370 items, including all 1,473 historical identities               |
| `inventory:authorization:check`  | Passed; 470 objects, 1,429 authorization-bearing files, no open gates        |
| `format:changed:check`           | Passed; 1,275 supported changed files checked                                |
| `policy:versions`                | Passed                                                                       |
| `policy:tsconfig`                | Passed; 255 configurations scanned                                           |
| `policy:docker-toolchain`        | Passed; 18 Dockerfiles inspected                                             |
| `urls:check`                     | Passed                                                                       |
| `openapi:check`                  | Still failing for 152 undocumented operations; migration explicitly deferred |

Additional validation: 26 focused tooling tests passed; frozen-lockfile verification passed; the S3 tools Docker image built successfully, and its three AWS SDK modules imported successfully with networking disabled on Node 24.19.0. The historical baseline was compared directly with the pinned Git manifest and its SHA-256.

Concurrent work added more source and review files during this pass. Those additions were included in the final formatting and authorization-inventory refreshes. Results describe the last completed verification runs; subsequent source changes require regeneration and rechecking. The full 47-check policy profile was not rerun as part of this mechanical pass.
