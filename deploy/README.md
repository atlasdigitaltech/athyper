# ATHYPER Stack v2 foundation

Stack v2 is additive. The existing `stack/` directory remains Stack v1 until the
restore, DEV parity, QA isolation, and STG rehearsal gates pass.

## Filesystem contract

- Windows physical root: `D:\ATHYPER`
- Ubuntu source: `/home/chandravel_natarajan/src/athyper`
- Ubuntu operator state: `/home/chandravel_natarajan/.athyper`
- Docker-managed state: Docker Linux volumes, with Docker Desktop's VHD on `D:`

Use the developer's normal Linux home. Do not create `/home/athyper`; that would
introduce a second identity and unnecessary ownership/sudo friction.

## Read-only milestone

```sh
athyper doctor
athyper config render dev
athyper plan dev
athyper gates inspect
```

These commands only read configuration, machine state, and Docker metadata. They
do not create or modify containers, images, networks, volumes, secrets, routes,
or host mappings. `plan` exits non-zero when a mandatory preflight is incomplete.

Current DEV domains use `*.dev.athyper.test` because nested `.localhost` names did
not resolve reliably on the qualified Windows host. The future ingress bootstrap
must install the exact mappings printed by `plan`; planning never edits `hosts`.

## Current acceptance boundary

The schemas, 39-service ledger, provider contracts, resource profiles, and
read-only controller are implemented. Deployment remains blocked until:

1. BitLocker and Secure Boot are verified from elevated PowerShell.
2. Docker Desktop's data VHD is moved to `D:\ATHYPER\docker-desktop\data`.
3. Owner-only DEV secret files are created after storage encryption is verified.
4. A fresh Stack v1 export and tested database restore are obtained from the old workstation.

## Phase 6 DEV-core preflight

The non-mutating Phase 6 composition now covers Traefik ingress and its outage
fallback, PostgreSQL and its idempotent database initializer, transaction and
session PgBouncer pools, Redis, MinIO and its bucket initializer, and IAM. It
uses project-scoped networks and volumes, an internal-only data network,
loopback-only host ports, resource limits, health checks, and file-backed
Compose secrets.

Validate without pulling an image or creating a Docker object:

```sh
docker compose \
  -f deploy/compose/instance/compose.yaml \
  config --no-interpolate --quiet
pnpm stack:v2:test
athyper plan dev
```

`athyper plan dev` now treats the machine qualification evidence as a hard
deployment input. Aggregate host qualification and Defender/WSL cold-start
compatibility must both be explicitly complete; a warm-session or provisional
pass cannot authorize deployment. The implementation deliberately provides no
mutating controller command while any host, recovery, or secret gate remains
incomplete.

`athyper gates inspect` validates the cold-start JSON, Stack v1 export-intake
and cleanup-confirmed restore receipts, DEV secret-file policy, candidate image
immutability, and machine phase status. It reports external authorizations
separately and never converts conversational intent into deployment authority.

## Phase 7 image publication foundation

`.github/workflows/stack-v2-images.yml` is a manual-only, explicitly confirmed
publication workflow for the Neon, Mesh, Studio, runtime-server, and IAM images.
Each matrix entry builds locally on the runner, preserves a JSON Trivy report,
blocks fixed HIGH/CRITICAL findings, and only then logs in and writes to GHCR.
Published images receive BuildKit SBOM/provenance plus a GitHub registry-backed
provenance attestation. The final artifact is a schema-compatible `ImageSet`
containing digest references and the exact 40-character source revision.
No moving image tag is published, preventing a partially successful matrix from
advancing only part of an environment. Promotion consumes the complete digest
artifact after all five jobs pass.

All referenced actions and external Docker bases are pinned to immutable commit
or image digests. Publication is not authorized merely by committing the
workflow: an operator must dispatch it with `confirm_publish=true`.

## Phase 8 DEV parity foundation

DEV now selects the `dev-full` preset and adds
`deploy/compose/instance/compose.parity.yaml` to the core model. The overlay
contains the three Next.js planes, API, worker, scheduler, ClamAV, Gotenberg,
Tika, Meilisearch, and development-only Mailpit. The complete envelope is
12,544 MiB and 14.7 CPU against laptop-32 limits of 14,336 MiB and 16 CPU.

Runtime, worker, and PostgreSQL owner identities are separate. PgBouncer knows
all three identities, while the scheduler receives only database and Redis
credentials. MinIO initialization installs a bucket-scoped application policy;
applications never receive the root credential. Compose-mounted secrets and
CPU/memory limits must exactly match the service catalog or policy validation
fails.

This is composition readiness, not functional parity evidence. The functional
smoke matrix remains blocked until host qualification, Stack v1 recovery,
secrets, immutable image publication, database migration, and container health
gates pass.

## Phase 9 QA isolation contract

QA uses the independent `athyper-qa` Compose project, `*.qa.athyper.test`
routes, HTTP port 8080, PostgreSQL port 55432, and QA-only secret and receipt
paths. Its standard preset reuses the Phase 8 parity composition but excludes
DEV Mailpit and Phase 11 observability capabilities.

The controller can describe—but cannot execute—the four lifecycle operations:

```sh
athyper plan qa
athyper lifecycle plan qa reset
athyper lifecycle plan qa seed
athyper lifecycle plan qa test
athyper lifecycle plan qa destroy
```

Every lifecycle document is read-only, carries `executionAuthorized: false`,
targets only `athyper-qa`, requires an ownership receipt for destructive stages,
and brackets future reset/test/destroy work with DEV fingerprint checks. The QA
deployment plan rejects incomplete candidate image sets, all-zero revisions,
and all-zero digests. Runtime qualification remains blocked until the host,
recovery, secret, candidate-image, migration-runner, and test-runner gates pass;
no lifecycle command executes Docker in this phase.

## Phase 10 STG rehearsal contract

STG uses project `athyper-stg`, routes under `*.stg.athyper.test`, HTTP port
8180, PostgreSQL port 56432, and an internal mail capture service whose UI is
not exposed. Outbound integrations are default-deny and production credentials
are prohibited.

The read-only rehearsal command is:

```sh
athyper rehearsal plan stg --from qa
```

It requires all five STG application digests and the source revision to exactly
match QA, with rebuilding prohibited. It also requires schema-valid sanitized
data, pre-migration backup, and disposable restore-drill evidence under
`D:\ATHYPER\qualification\stg`. Non-zero checksums, instance identities,
backup/restore checksum linkage, and backup-before-restore timestamps are
validated. The emitted plan cannot execute any stage and carries
`executionAuthorized: false`.

## Phase 11 optional capability profiles

The optional overlay is never part of a normal instance plan. Operators first
select exactly one profile with a read-only capacity and security check:

```sh
athyper capability plan dev observability
athyper capability plan dev secretstore
athyper capability plan dev analytics
athyper capability plan dev admin-db
athyper capability plan dev admin-queue
```

Profiles expose only their UI on an instance-specific loopback port. Databases,
Redis and telemetry backends remain internal. Secrets are mounted as files and
converted to process variables only inside entrypoint wrappers. Infisical and
Metabase receive dedicated PostgreSQL owners/databases; Pgweb uses the runtime
identity instead of the PostgreSQL superuser. Infisical and analytics also
require recovery evidence before a future start can be authorized.

Full DEV plus observability exceeds laptop-32's approved memory and CPU
envelope, so the planner blocks it. Optional capabilities remain on-demand and
must never be enabled merely because their Compose definitions exist.

## Phase 12 orchestration decision gate

K3s is not an automatic successor to Compose. Assess the gate with:

```sh
athyper orchestrator assess
```

The assessment requires completed runtime DEV parity, two repeatable QA cycles,
the STG backup/migration/restore rehearsal, a schema-valid consolidated Compose
acceptance receipt, and an approved multi-host placement requirement. Laptop
K3s, Docker Desktop Kubernetes, and automatic migration are prohibited.

While any prerequisite is absent, the result is `deferred`, Compose remains the
recommended orchestrator, and no deployable Kubernetes manifests, credentials,
tokens, Helm releases, workloads, or persistent volumes may be produced. Even
after eligibility, the only next step is a separately approved remote K3s
architecture design review.
