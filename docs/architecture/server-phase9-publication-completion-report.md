# Phase 9 Publication status and completion report

Date: 2026-08-10  
Plan reviewed: `docs/architecture/server-phase9-publication-build-plan.md`

## Decision

**Implementation status: complete for local/package qualification.**  
**Phase exit status: not yet complete for deployment.**

The Publication slice has been rebuilt in the current server packages and is isolated from the backup implementation at runtime. The required staging/deployment evidence—live container fault qualification, first vertical fixture, canary rollout, and operator rollback rehearsal—has not yet been captured. It would therefore be accurate to mark the *build* complete, but not the Phase 9 *exit gate* complete.

Foundation's `athyper` runtime-key cutover remains explicitly deferred and was not started as part of this slice.

## Delivered implementation

- Canonical Publication contracts use `studio | neon | mesh`; the temporary Foundation runtime-key translation is limited to host composition.
- Canonical artifact creation, hashing, Ed25519 sign/verify contracts, immutable S3/MinIO object layout, and key resolver boundaries are implemented. Signature verification remains fail-closed.
- Studio authority DDL and Kysely repository are implemented, including the durable immutable `publication.artifact_compilation` authority record so compilation/signing can resume deterministically.
- The target projection repository uses the local `runtime_meta` functions and provides separate, idempotent stage, verify, activate, active-head, and rollback operations.
- The orchestrator reads durable state before each action, uses deterministic BullMQ job identities, classifies permanent/transient/conflict failures, and has crash-boundary characterization coverage.
- Platform host composition includes Publication databases, object store, trust-key/signer boundaries, health checks, routes, permissions, audit recording, BullMQ handlers, recovery scheduling, and process-scoped `PUBLICATION_*` feature flags. API and scheduler composition do not receive signing-key material or the Infisical machine token.
- Publish, retry, and rollback API actions are permission checked and audited. The Studio seed includes release/deployment view, publish, retry, and MFA-gated rollback permissions.
- Runtime composition imports the current contracts, services, and adapters only; `server-backup/packages/services/publication` is behavioral reference only. Its retirement record is maintained separately.

## Increment and gate status

| Plan item | Status | Evidence / qualification state |
| --- | --- | --- |
| A — characterization | Passed | Characterization tests cover stage → verify → activate → acknowledgement, idempotent acknowledgement, and crash recovery behavior. |
| B — contracts | Passed | Contract package tests cover canonical artifact/plane validation and exported ports. |
| C — signing and immutable storage | Passed locally | Contract, signing-adapter, and artifact-store tests passed. Live MinIO immutable-write and key-rotation qualification remains staging work. |
| D — Studio authority repository | Passed locally | Current Studio publication DDL, repository, durable compilation record, immutable acknowledgement function, outbox topics, and grants are covered by DDL/package tests. |
| E — three-plane target projection | Passed | Current DDL was applied to disposable Studio, Neon, and Mesh PostgreSQL databases and the identical repository behavior passed on all three. |
| F — orchestrator | Passed locally | Unit/characterization tests exercise every modeled crash boundary and require no duplicate activation or acknowledgement mutation. A real worker-process crash/restart exercise remains an operational gate. |
| BullMQ, host, routes, permissions, flags, health | Implemented and package-qualified | Host/service tests and typechecks passed; target-environment queue/Redis/MinIO/Infisical interactions still require execution. |
| Observability and audit | Implemented baseline | Route audit events and Publication operation metrics are wired. Dashboard/alert validation, DLQ observation, and end-to-end operational audit evidence remain staging work. |

## Local verification evidence

- Publication service: **42 tests passed**.
- Platform host: **53 tests passed**.
- Publication contracts: **5 tests passed**.
- Publication signing adapter: **5 tests passed**.
- Infisical adapter: **2 tests passed**.
- Typechecks passed for Publication contracts/service, signing/telemetry/Infisical adapters, platform host, and current database package checks.
- Current DDL model verification passed, as did compose configuration validation and whitespace/diff validation in the Publication scope.

## Three-plane projection gate

The current DDL manifests were applied to disposable PostgreSQL databases `athyper_studio`, `athyper_neon`, and `athyper_mesh` in container `athyper-publication-e-gate`. The same repository performed stage, idempotent restage, verify, idempotent reverify, activate, active-head read, failed verification, and head preservation on every plane.

Result:

`PUBLICATION_THREE_PLANE_PROJECTION_OK {"stage":"staged","verify":"verified","activate":"active","activeReleaseNo":1,"activeEntityReleaseNo":1,"rejected":"ARTIFACT_HASH_MISMATCH","headPreserved":true}`

The disposable container was removed after inspection. This is valid qualification evidence, not a deployed-environment canary record.

## Exit gates still required in staging

The following plan requirements intentionally remain **pending**, because no target environment evidence exists yet:

1. Execute the container fault matrix with the real services: MinIO immutability and unavailable-object behavior, Infisical retrieval/rotation, Redis/BullMQ retry and DLQ behavior, PostgreSQL unavailability, corrupt artifact/signature, and actual worker crash/restart.
2. Run the first vertical fixture from a real Studio release through three target artifacts, target activation, acknowledgement, replay, and active-head verification.
3. Run an RLS/role proof showing an ordinary application user cannot stage or activate a release directly.
4. Validate emitted audit events, metrics, logs/traces, DLQ alerts, activation-head age/lag, and acknowledgement latency in the target observability stack.
5. Run the canary and governed rollback rehearsal with explicit process flags and retain the create-only evidence file:

   `pnpm --dir server/db run db:operate:publication:canary`

   The runner requires the target Studio/Neon/Mesh databases, MinIO, Redis, Infisical trust/signing material, and API/worker/scheduler processes. It exercises publish, three-plane activation/acknowledgement verification, durable rollback, head convergence, and evidence capture.
6. Obtain release-owner approval for the canary result and apply the backup-retention decision. The backup package is already isolated from production composition, but physical deletion remains deliberately deferred until these external gates pass.

## Completion recommendation

Record Phase 9 as **“build complete; staging qualification and rollout exit gate pending.”** Do not mark it fully complete until the six staging items above have passed and their immutable evidence is attached. The separate Foundation plane-key cutover should remain a distinct follow-on plan.
