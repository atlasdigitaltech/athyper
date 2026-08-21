# Phase 9 — Publication Build Plan

## 1. Objective

Recover Publication as a governed Studio authority that compiles, signs, stores and dispatches immutable release artifacts. Studio, Neon and Mesh independently stage, verify and activate those artifacts in their local `runtime_meta` schema. A target plane must continue serving its previous active release whenever Studio, MinIO/S3, Redis, BullMQ or the signing service is unavailable.

This slice covers Entity contract and runtime descriptor publication first. Policy, workflow, content and integration releases may reuse the generic publication envelope later, but are not part of the first vertical.

## 2. Non-negotiable boundaries

1. Studio `publication.*` is the only release/deployment authority.
2. `runtime_meta.*` is plane-local projection state, not a replica of Studio authority tables.
3. Publication depends only on contracts for object storage, jobs, events, audit, authorization and signing.
4. Concrete S3/MinIO, Redis/BullMQ, PostgreSQL and secret-store adapters are injected only by the host.
5. Runtime reads never call Studio. They read `runtime_meta.release_activation_head` and the pinned active descriptor locally.
6. Failure before activation leaves the existing activation head unchanged.
7. Hash and signature verification fail closed.
8. Release artifacts and deployment events are immutable evidence.
9. Rollback activates an already verified local release or publishes a new signed rollback release. It never edits an old artifact.
10. Do not combine the Foundation `athyper` → `studio` runtime-key migration with this slice.

## 3. Plane naming rule for this slice

Publication wire contracts use the canonical physical plane values:

```ts
type PublicationPlane = "studio" | "neon" | "mesh";
```

The host temporarily owns this mapping:

| Publication plane | Existing server adapter/runtime key | Database |
|---|---|---|
| `studio` | `athyperDatabase` / Foundation `athyper` | `athyper_studio` |
| `neon` | `neonDatabase` / Foundation `neon` | `athyper_neon` |
| `mesh` | `meshDatabase` / Foundation `mesh` | `athyper_mesh` |

No Publication contract may expose `athyper` as a plane value. Add a single host-local mapping function with exhaustive tests. The later Foundation cutover removes that translation.

## 4. Canonical package layout

```text
server/packages/
  contracts/publication/
    src/
      artifact.ts
      authority.ts
      deployment.ts
      projection.ts
      signing.ts
      errors.ts
      index.ts

  services/publication/
    src/
      publication-orchestrator.ts
      artifact-compiler.ts
      artifact-loader.ts
      kysely-authority-repository.ts
      kysely-local-projection-repository.ts
      publication-jobs.ts
      publication-routes.ts
      index.ts

  contracts/secrets/                 # create only if no canonical secret port exists
  adapters/secretstore-infisical/    # opaque secret lookup only
  adapters/publication-signing/      # canonical JSON + hash + detached signature

server/apps/platform-host/
  src/composition/
    register-adapters.ts
    register-services.ts
```

Package names:

- `@athyper/server-contract-publication`
- `@athyper/server-service-publication`
- `@athyper/server-contract-secrets` only if required
- `@athyper/server-adapter-secretstore-infisical` only if required
- `@athyper/server-adapter-publication-signing`

Do not reuse the empty client-side `@athyper/contract-athyper-publication` package as the server contract owner.

## 5. Contract design

### 5.1 Artifact envelope

Define a versioned envelope with no database-specific row names:

```ts
interface PublicationArtifactEnvelopeV1 {
  schema: "athyper.publication-artifact.v1";
  publicationKey: string;
  releaseId: string;
  releaseNo: number;
  releaseKind: "publish" | "rollback";
  targetPlane: PublicationPlane;
  artifactKind: "entity_runtime";
  generatedAt: string;
  minimumRuntimeVersion?: string;
  compatibilityLevel: "breaking" | "backward_compatible" |
    "forward_compatible" | "fully_compatible";
  payload: {
    entityContract: EntityContractProjection;
    entityDescriptor: EntityDescriptorProjection;
  };
}
```

The signed manifest records:

- artifact schema and media type;
- publication/release coordinates;
- target plane and artifact kind;
- canonical payload SHA-256;
- compiler name/version;
- contract and descriptor schema versions;
- minimum runtime version;
- signature algorithm and signing key ID;
- creation timestamp and safe non-secret evidence.

### 5.2 Canonical bytes

Use RFC 8785 JSON Canonicalization Scheme or a tested equivalent. Never sign ordinary `JSON.stringify` output. Define one function that returns canonical UTF-8 bytes. All hashing, signing and verification must call that function.

Recommended first algorithm: Ed25519 with a detached signature. Keep the contract algorithm-agile. The stored signature covers the canonical unsigned envelope/manifest bytes; it must not cover a field containing its own signature.

### 5.3 Ports

Required narrow ports:

```ts
interface PublicationArtifactStore {
  putImmutable(input: { key: string; bytes: Uint8Array; contentType: string;
    sha256: string; metadata: Record<string, string> }): Promise<void>;
  get(input: { uri: string; expectedSha256: string }): Promise<Uint8Array>;
}

interface PublicationSigner {
  sign(input: { keyId: string; algorithm: string; bytes: Uint8Array }):
    Promise<{ signature: string }>;
}

interface PublicationVerifier {
  verify(input: { keyId: string; algorithm: string; bytes: Uint8Array;
    signature: string }): Promise<boolean>;
}
```

`PublicationSigner` is available only in Studio composition. Target planes receive only `PublicationVerifier`.

The secret adapter returns opaque key material or a signing handle. It never returns secrets through routes, logs, audit metadata, job payloads or PostgreSQL.

## 6. Artifact storage layout

Use immutable object keys:

```text
publication/
  v1/
    {publicationKey}/
      releases/{releaseNo}-{releaseId}/
        {targetPlane}/entity-runtime-{contentHash}.json
```

Rules:

- `putImmutable` succeeds when the same key already contains the same checksum.
- It rejects an existing key with different bytes.
- PostgreSQL stores an `s3://bucket/key`-style URI and checksum, never a presigned URL.
- Presigned URLs are not placed in BullMQ jobs because they may expire while delayed or retried.
- Object version ID may be retained as evidence when the backend supports versioning.
- Bucket policy denies target-plane workers write access to authoritative artifacts.

## 7. Database work

### 7.1 Studio authority

Characterize and retain:

- `publication.release`
- `publication.entity_release_link`
- `publication.artifact`
- `publication.deployment`
- append-only `publication.deployment_event`
- `publication.deployment_acknowledgement`
- `publication.fn_transition_deployment`
- `publication.fn_acknowledge_activation`

Add or correct:

1. Add an immutable release lifecycle function for prepare → approved → published/withdrawn.
2. Ensure artifact status follows compiled → validated → signed; reject signing before validation.
3. Add unique deployment command/idempotency coordinates where missing.
4. Keep `deployment` as the mutable status head and `deployment_event` as immutable history.
5. Change acknowledgement handling from mutable upsert to idempotent immutable insertion:
   - same deployment, instance, active hash and local applied ID returns the existing row;
   - any coordinate mismatch raises `ACKNOWLEDGEMENT_CONFLICT`;
   - update/delete remains forbidden.
6. Add outbox events in the same Studio transaction:
   - `publication.release.published`
   - `publication.deployment.requested`
   - `publication.deployment.failed`
   - `publication.deployment.acknowledged`
7. Validate that `artifact.plane_code` and `deployment.target_plane` use `studio|neon|mesh`.
8. Review grants so only a dedicated publication authority role can transition or acknowledge deployments.

### 7.2 Target-plane projections

Characterize and retain in common `runtime_meta`:

- `applied_release`
- `release_activation_head`
- append-only `release_activation_event`
- immutable `entity_contract`
- immutable `entity_descriptor`
- stage, verify, activate, active-read and rollback functions.

Add or correct:

1. Dedicated NOLOGIN role `athyper_projection_applier` and LOGIN membership documentation.
2. Stage idempotency by `(publication_key, source_release_id)` and deployment ID.
3. Verification must compare the loaded artifact hash, contract hash, descriptor source hash, target plane, schema versions and signature evidence.
4. Activation must lock `release_activation_head` and reject release-number regression except an explicit governed rollback function.
5. Runtime activation and descriptor status changes occur in one local transaction.
6. A failed verification records rejection evidence without changing the active head.
7. RLS/role tests must prove ordinary tenant application sessions cannot stage or activate projections.

## 8. Service implementation sequence

### Increment A — Characterization

1. Copy only the backup orchestrator tests into a characterization area.
2. Replace old imports with temporary local test interfaces.
3. Record current state transitions, idempotency behavior and rollback behavior.
4. Add tests for gaps not covered by backup:
   - immutable acknowledgement conflict;
   - signature failure;
   - wrong target plane;
   - corrupted object bytes;
   - activation-head preservation after failure;
   - retry after worker crash between each state transition.

Gate: characterization tests describe intended behavior before production code is moved.

### Increment B — Contracts

1. Create `@athyper/server-contract-publication`.
2. Move wire types and ports only; exclude Kysely, S3 clients, BullMQ and framework types.
3. Add API compile tests and serialized fixture tests.
4. Freeze artifact schema v1 fixtures and canonical byte/hash vectors.
5. Reject unknown major schema versions; tolerate explicitly documented optional fields within v1.

Gate: contract package typechecks/tests and has no implementation dependencies.

### Increment C — Signing and immutable object storage

1. Implement canonical JSON bytes and SHA-256.
2. Implement signing/verifying adapter with Ed25519 test keys.
3. Implement secret-store key resolver with TTL caching and key-rotation overlap.
4. Add a Publication-specific wrapper over the existing object-storage contract for immutable writes and checksum-verified reads.
5. Add health checks that test key resolution and public-key availability without signing production data.

Gate: known signing vectors pass; tampering, wrong key, wrong algorithm and checksum mismatch fail closed.

### Increment D — Studio authority repository

1. Rebuild the backup `PostgresPublicationAuthorityRepository` using Kysely/raw SQL only inside the service package.
2. Use database functions for transitions and acknowledgement.
3. Add creation/publish operations that write outbox events in the same transaction.
4. Add repository integration tests against `athyper_studio`.
5. Never return raw signatures/private-key material in logs or route errors.

Gate: release, artifact, deployment and acknowledgement state machines pass concurrency and idempotency tests.

### Increment E — Target-plane projection repository

1. Rebuild the local repository against `runtime_meta` functions.
2. Execute stage → verify → activate in separate resumable steps.
3. Map `studio` to the existing host Studio adapter only at composition.
4. Test the same repository against Studio, Neon and Mesh.
5. Prove active reads use only local activation heads.

Gate: identical artifact behavior passes on all three databases.

### Increment F — Orchestrator

1. Rebuild the backup orchestrator around the new contracts.
2. Make every step re-entrant by reading current durable state before acting.
3. Persist state before enqueueing the next step through an outbox or deterministic BullMQ job ID.
4. Classify failures:
   - permanent: invalid signature/schema/hash/plane/runtime compatibility;
   - transient: Redis, MinIO, database, secret-store or network unavailable;
   - conflict: activation regression or acknowledgement mismatch.
5. Sanitize failure evidence.

Gate: crash/restart at every transition resumes without duplicate activation or acknowledgement mutation.

## 9. BullMQ topology

Define jobs in `@athyper/server-contract-jobs`; implementations remain in Publication:

| Queue | Job | Owner | Purpose |
|---|---|---|---|
| `publication.authority` | `publication.compile-artifact` | Studio worker | Compile target-plane Entity artifact |
| `publication.authority` | `publication.sign-artifact` | Studio worker | Hash, sign and store immutable artifact |
| `publication.authority` | `publication.dispatch` | Studio worker | Transition deployment and enqueue plane application |
| `publication.apply` | `publication.apply-release` | Plane worker | Load, verify, stage and activate locally |
| `publication.authority` | `publication.acknowledge` | Studio worker | Persist target-plane acknowledgement |
| `publication.maintenance` | `publication.recover-stalled` | Governed scheduler | Recover stale non-terminal deployments |

Job requirements:

- deterministic IDs include deployment ID and attempt number;
- job payloads contain IDs, plane and safe coordinates only;
- no artifact bytes, secrets or presigned URLs in Redis;
- use the recovered Jobs lifecycle store, retries, cancellation and DLQ administration;
- permanent verification failures go directly to failed/DLQ state without automatic retry;
- transient retry uses bounded exponential backoff with jitter;
- recovery scans are DDL-scheduled and plane/authority scoped.

## 10. Host composition

1. Register object storage once and inject `PublicationArtifactStore` wrapper.
2. Register signer only when Studio authority mode is enabled.
3. Register verifier in every plane worker.
4. Register Studio authority repository only against `athyper_studio`.
5. Register local projection repositories against the selected physical plane transaction coordinator.
6. Register Publication jobs only in worker mode and recovery schedule only in scheduler mode.
7. Register HTTP routes only in API mode.
8. Add health entries for object store, trust-key availability and publication database access.
9. Close secret-store/signing resources through host lifecycle.

## 11. API surface and authorization

Initial administrative routes:

```text
POST /api/publication/releases/:releaseId/publish
GET  /api/publication/releases/:releaseId
GET  /api/publication/deployments/:deploymentId
POST /api/publication/deployments/:deploymentId/retry
POST /api/publication/publication-keys/:key/rollback
```

Recommended permissions:

- `publication.release.view`
- `publication.release.publish` — critical, MFA required
- `publication.deployment.view`
- `publication.deployment.retry` — high risk
- `publication.release.rollback` — critical, MFA required

Rules:

- tenant/plane/actor context comes only from verified request context;
- publication target plane is validated against the artifact, not trusted from request body;
- publish and rollback require authorization and immutable audit evidence;
- no route accepts a storage URI, hash, signature or key ID supplied by an untrusted client;
- add permission seeds without editing expected-count legacy packs blindly—create a dedicated Publication permission seed overlay.

## 12. Observability and audit

Metrics:

- deployments by status/plane;
- compile, sign, dispatch, verification and activation duration;
- retry/DLQ count;
- signature/hash/schema failures;
- activation-head age and source release lag;
- acknowledgement latency.

Logs contain deployment/release IDs, target plane, attempt and safe error code. They must not contain artifact bodies, signatures, secret references or presigned URLs.

Audit events:

- release approved/published/withdrawn;
- artifact signed;
- deployment requested/retried/failed;
- release activated/rolled back;
- acknowledgement accepted/conflicted.

## 13. Test matrix

### Package tests

- contract API and serialization compatibility;
- canonical JSON/hash golden vectors;
- signature success and tamper failures;
- orchestrator progression and resume;
- error classification and redaction;
- plane mapping exhaustiveness.

### Database integration tests

- Studio release/artifact/deployment transitions;
- append-only event and acknowledgement guards;
- concurrent duplicate publish/dispatch/acknowledge;
- local stage/verify/activate on all three databases;
- rollback and release-number regression protection;
- projection-applier role versus ordinary tenant role.

### Container integration tests

- MinIO immutable write/read/checksum behavior;
- secret-store key retrieval and rotation overlap;
- Redis/BullMQ dispatch, retry and DLQ;
- PostgreSQL outage recovery;
- worker crash after stage, verify and activate;
- object corruption and unavailable object store;
- prior active release remains readable during every failure.

### First vertical fixture

Publish one Entity release from Studio for each target plane:

1. compile three descriptors from the same source contract;
2. create and sign three target-specific artifacts;
3. dispatch three deployments;
4. activate locally in Studio, Neon and Mesh;
5. read the active descriptor from each local database;
6. compare contract hash, compiled hash, release ID/no and activation evidence;
7. verify three immutable acknowledgements in Studio;
8. rerun the same jobs and prove no duplicate activation/evidence mutation.

## 14. Rollout sequence

1. Ship contracts and signing vectors with no runtime registration.
2. Apply DDL corrections to disposable databases and run integration tests.
3. Enable compile/sign in Studio shadow mode; do not dispatch.
4. Compare generated artifacts with current Entity Meta projection fixtures.
5. Enable one internal Entity release to Studio target only.
6. Enable Neon internal tenant/canary.
7. Enable Mesh internal account/canary.
8. Enable automatic acknowledgement and recovery sweeps.
9. Enable production publishing only after rollback rehearsal succeeds.
10. Retire the backup Publication package with a parity/retirement record.

Feature flags:

- `PUBLICATION_COMPILE_ENABLED`
- `PUBLICATION_DISPATCH_ENABLED`
- `PUBLICATION_APPLY_ENABLED`
- `PUBLICATION_TARGET_PLANES`
- `PUBLICATION_REQUIRE_SIGNATURE=true` (must remain true outside isolated tests)

## 15. Exit gate

Publication is complete only when:

- contract and service packages have no circular or concrete-adapter dependencies;
- Studio authority and all three local projection repositories pass integration tests;
- canonical hash/signature fixtures are stable;
- target workers reject tampered, wrong-plane, unknown-key and incompatible artifacts;
- activation is atomic and prior active releases survive failures;
- retry/replay is idempotent and acknowledgements remain immutable;
- BullMQ jobs use governed Jobs lifecycle/DLQ administration;
- permissions, RLS, audit, metrics and health checks pass;
- one Entity release activates and is read locally on Studio, Neon and Mesh;
- the backup package is classified as migrated or explicitly retired;
- no Publication code imports host composition or concrete S3, Redis, database or secret-store implementations.

## 16. Explicitly deferred

- Foundation-wide `PlaneKey` rename from `athyper` to `studio`;
- policy/workflow/content/integration artifact kinds;
- multi-region replication;
- external customer artifact distribution;
- universal KMS/HSM provider abstraction beyond the initial signing port;
- Apache Camel or other integration runtimes;
- cross-plane synchronous database calls.

## 17. Separate Foundation plane-key cutover

After Publication is stable, execute a dedicated migration:

1. inventory every `athyper` plane discriminator in Foundation, contracts, IAM claims, headers, jobs, caches, telemetry and tests;
2. introduce `studio` as canonical and a temporary input-only compatibility alias;
3. emit only `studio` in new tokens/events/jobs;
4. migrate Redis keys and durable pending jobs or provide dual-read compatibility;
5. update host adapter/container names without changing the database name `athyper_studio`;
6. remove the alias after all three apps and workers are upgraded;
7. repository-search gate: no active logical plane comparisons against `athyper` remain.

## 18. New-thread kickoff prompt

Use this prompt in the execution thread:

> Implement the Publication slice using `docs/architecture/server-phase9-publication-build-plan.md`. Start with Increment A characterization and Increment B contracts. Preserve the dirty worktree and existing user changes. Use Studio as the canonical Publication plane while keeping the Foundation `athyper` runtime-key translation isolated in host composition. Do not begin the Foundation plane-key cutover. Rebuild from the current DDL and use `server-backup/packages/services/publication` only as behavioral reference. Pass each increment gate before continuing.
