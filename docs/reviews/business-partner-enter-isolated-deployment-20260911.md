# BP isolated execution deployment

Status: **isolated deployment and descriptor execution qualification complete**. This does not close authenticated business-journey qualification or authorize shared enforcement.

## Exact execution coordinates

- Release: `c2cc6900-26c1-47ca-8dfc-1d488000950c`
- Signed artifact SHA-256: `45ddc85ece1f453e84b1eccc0cea9ca141fe9847c68ab7d2500e7d347d7b75fc`
- API/worker image: `sha256:671d0d5abecbfc16790e2d8e643222171eed8d1b5ab485b3b4048b466439fc47`
- API: `athyper-bp-enter-api`
- Worker: `athyper-bp-enter-worker`
- Internal network: `athyper-bp-enter-isolated`

Created dedicated PostgreSQL, Redis and MinIO containers. PostgreSQL is a fresh copy of current Studio/NEON/Mesh state, not an old test-grant snapshot. Runtime connections point only to the dedicated services. No host ports are published and containers have no shared DEV network attachment. Publication writers and outbound email are disabled. Credentials are generated for this instance; no signing private key is mounted.

The signed artifact was exported through native verification, then verified and staged/activated through the native local projection repository inside the clone. API and worker use an operator-only mounted qualification harness on the exact image. The harness binds request headers and job payloads to the artifact, uses production service registrations and the target policy adapter, and verifies the active descriptor. Its isolated enforcement selection is not shared DEV enforcement approval.

Updated the isolation harness for storage-v6's documents/artifacts/transfers buckets and readiness sentinel. Earlier startup attempts stopped on missing key/configuration/readiness prerequisites before serving requests. After initialization both processes became ready. The temporary staging environment was removed. The operator credential was rotated during verification; it is not included in evidence.

## Verified results

- API descriptor execution: HTTP **200**, exact release/artifact headers and descriptor body.
- Queue submission: HTTP **202**; worker emitted a completed descriptor execution receipt for the same artifact and release.
- Wrong artifact header: HTTP **409**.
- Missing operator authentication: HTTP **401**.
- Both runtime containers use the pinned image; all five containers use only the dedicated internal network and expose no host ports.
- Fourteen authorization-table fingerprints plus activation heads matched before/after in each of the three shared DEV planes.

Receipt: `governance/policy/reports/business-partner-enter-isolated-execution.dev.json`.
Baseline: `governance/policy/reports/business-partner-enter-isolated-shared-before.dev.json`.
Artifact export verification: `governance/policy/reports/business-partner-enter-runtime-export.dev.json`.
Reproducible tooling and harness: `tooling/scripts/verification/isolated-enter/`.

## Remaining qualification scope

The probes use a dedicated operator token, not catl.admin/catl.owner business sessions. They establish deployed artifact execution and isolation. Current IAM trust/session preparation, explicitly reviewed temporary business permissions where needed, real user reads/commands/import/export/AI journeys, ownership/field qualification, compatible recovery and policy-evidence acceptance remain pending. No temporary business grants were added during this deployment. Shared DEV's held deployment intent was not dispatched or activated.
