# ATHYPER Stack v2 foundation

Stack v2 is the only supported runtime architecture. The remaining
`stack/config` and `stack/env` files are shared build, realm, and validation
assets; they do not define or launch a legacy Compose runtime.

## Filesystem contract

- Windows physical root: `D:\ATHYPER`
- Ubuntu source: `/home/chandravel_natarajan/src/athyper`
- Ubuntu operator state: `/home/chandravel_natarajan/.athyper`
- Docker-managed state: Docker Linux volumes, with Docker Desktop's VHD on `D:`

Use the developer's normal Linux home. Do not create `/home/athyper`; that would
introduce a second identity and unnecessary ownership/sudo friction.

## Inspection commands

```sh
athyper doctor
athyper config render dev
athyper plan dev
athyper gates inspect
```

These commands only read configuration, machine state, and Docker metadata. They
do not create or modify containers, images, networks, volumes, secrets, routes,
or host mappings. `plan` exits non-zero when a mandatory preflight is incomplete.

## Controlled execution

The controller now owns the mutating Compose path. Every mutation requires the
instance ID to be repeated explicitly; restore also requires the backup ID to be
repeated:

```sh
athyper up dev --confirm dev
athyper up dev --confirm dev --preserve-database
athyper restart dev --confirm dev
athyper restart dev api --confirm dev
athyper backup dev --confirm dev
athyper restore dev 20260821T123456Z --confirm dev --confirm-restore 20260821T123456Z
athyper down dev --confirm dev
```

`up` evaluates policy, machine/recovery evidence, instance secrets, image policy,
ports, and resource limits before mutation. It renders both Compose projects,
starts `athyper-platform` first, then starts the instance with `--wait`. Existing
platform or instance Docker resources are adopted only when their exact
controller ownership receipt exists. If instance startup fails, the controller
runs instance `down --remove-orphans`; it does not stop the shared platform or
delete volumes. A runtime-root controller lock serializes all mutations across
instances so concurrent platform or migration operations cannot race.

Receipts are written owner-only beneath
`~/.athyper/instances/<id>/receipts/`; platform ownership is recorded beneath
`~/.athyper/platform/receipts/`. `down` never passes `--volumes`. PostgreSQL
backups are owner-only, custom-format dumps for each ATHYPER database plus a
global-role metadata export under `~/.athyper/backups/<id>/<backup-id>/`.
Restore verifies every size and SHA-256, initializes a new isolated Compose
project, restores global roles and memberships before initializing database
credentials, restores the four database dumps, verifies PostgreSQL, removes
temporary dump files, stops the temporary containers, and retains the newly
named volume for inspection or a separately authorized cutover. It never
restores over the active volume.

Application-schema migration remains a separate release readiness boundary. DEV
now has an executable, advisory-locked `db-migration` service that applies the
tracked DDL manifests only to empty databases; it refuses partial or populated
schemas. `up` starts only PostgreSQL/bootstrap, runs that job, and starts the
applications only after success. QA/STG remain blocked because they deliberately
do not select this source-mounted clean-slate runner. Forward-migration
compatibility policy and a candidate-image-contained migration role are still
required before imported, schema-changing, QA, or STG rollout is operational.

For an already initialized DEV database, `--preserve-database` validates the
existing controller migration receipt, runs only idempotent database bootstrap,
skips the clean-slate migration runner, and starts the selected services. The
flag is deliberately unavailable for QA and STG.

Current DEV domains use `*.dev.athyper.test` because nested `.localhost` names did
not resolve reliably on the qualified Windows host. The future ingress bootstrap
must install the exact mappings printed by `plan`; planning never edits `hosts`.

## Current acceptance boundary

The schemas, service ledger, provider contracts, resource profiles, guarded
controller execution, and receipt contracts are implemented. Current machine,
cold-start, clean-slate disposition, and DEV secret gates pass, and `plan dev` is
ready. Global release readiness remains blocked by the placeholder/incomplete QA
candidate image set. A live DEV mutation also requires valid platform TLS files
and a reachable Docker/Compose runtime; implementation tests do not substitute
for that live qualification.

## Phase 6 DEV-core preflight

The non-mutating Phase 6 composition now covers the per-instance Traefik gateway and its outage
fallback, PostgreSQL and its idempotent database initializer, transaction and
session PgBouncer pools, Redis, MinIO and its bucket initializer, and IAM. It
uses project-scoped networks and volumes, an internal-only data network,
loopback-only host ports, resource limits, health checks, and file-backed
Compose secrets.

The shared `athyper-platform` ingress definition lives in
`deploy/compose/platform`. It is the only v2 project that publishes loopback
ports 80 and 443. Instance gateways attach to its deliberately shared network
as `gateway-dev`, `gateway-qa`, or `gateway-stg`; they publish no host HTTP port
and have no Docker socket access.

Validate without pulling an image or creating a Docker object:

```sh
docker compose \
  -f deploy/compose/instance/compose.yaml \
  config --no-interpolate --quiet
pnpm stack:v2:test
pnpm athyper catalog inspect --json
pnpm athyper operations plan lite --json
athyper plan dev
```

The controller owns the lightweight operations lifecycle and its receipts:

```sh
sh deploy/bootstrap/generate-operations-secrets.sh
pnpm athyper operations up lite --confirm lite
pnpm athyper operations down --confirm operations
```

Lite mode publishes Grafana on `127.0.0.1:53902`, Prometheus on
`127.0.0.1:53900`, and Alloy's Loki-compatible receiver on
`127.0.0.1:53901`. A controller-owned host forwarder reads only the selected
Compose project's `docker logs` streams through the local Docker CLI and pushes
normalized labels to Alloy. No workload or telemetry container receives the
Docker socket, and `docker logs` remains available as the fallback authority.
Open Grafana at `http://127.0.0.1:53902`, sign in as `athyper-admin`, and read
the local password with `cat ~/.athyper/operations/secrets/grafana-admin-password`.
In **Explore**, select the Loki data source and start with `{instance="dev"}` or
scope a workload with `{instance="dev", service="api"}`. Loki itself remains
internal and has no host-published port.

The Grafana bootstrap reads the owner-only Compose secret before dropping to
Grafana UID 472. The controller reconciles the same credential through stdin so
retained Grafana volumes remain accessible after restarts; the value is not
placed in controller receipts or host command arguments.

`athyper plan dev` now treats the machine qualification evidence as a hard
deployment input. Aggregate host qualification and Defender/WSL cold-start
compatibility must both be explicitly complete; a warm-session or provisional
pass cannot authorize deployment. Mutating controller commands now exist, but
`up` refuses mutation while any applicable host, recovery, instance, or secret
gate remains incomplete.

`athyper gates inspect` validates the cold-start JSON, Stack v1 export-intake
and cleanup-confirmed restore receipts, DEV secret-file policy, candidate image
immutability, and machine phase status. It reports external authorizations
separately and never converts conversational intent into deployment authority.

## Phase 7 image publication foundation

Build all five local qualification images from the repository root without
publishing them:

```sh
LOCAL_TAG=qualification-local \
SOURCE_REVISION="$(git rev-parse HEAD)-dirty" \
pnpm images:v2:build
```

`docker-bake.hcl` is the local authority for the five targets and mirrors the
workflow matrix. The web and runtime final stages remove package-manager tooling
that is not needed at runtime. The IAM target uses digest-pinned Keycloak 26.7.2,
builds and tests the ATHYPER provider extension, and retains only the PostgreSQL
database driver required by this deployment. Local images from a dirty tree are
qualification artifacts only and must never be pushed as if they represented a
clean Git revision.

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
Tika, Meilisearch, and development-only Mailpit. The complete envelope,
including database initialization and the one-shot clean-slate migration job,
is 13,312 MiB and 15.95 CPU
against laptop-32 limits of 14,336 MiB and 16 CPU.

Runtime, worker, and PostgreSQL owner identities are separate. PgBouncer knows
all three identities, while the scheduler receives only database and Redis
credentials. MinIO initialization installs a bucket-scoped application policy;
applications never receive the root credential. Compose-mounted secrets and
CPU/memory limits must exactly match the service catalog or policy validation
fails.

Communication providers keep safe local defaults but accept orchestrator-owned
production configuration. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, and
`SMTP_FROM`; provide authenticated SMTP credentials through `SMTP_USER_FILE`
and `SMTP_PASS_FILE`. Web Push accepts `VAPID_SUBJECT_FILE`,
`VAPID_PUBLIC_KEY_FILE`, and `VAPID_PRIVATE_KEY_FILE`. Native push accepts
`PUSH_FCM_PROJECT_ID_FILE`, `PUSH_FCM_CLIENT_EMAIL_FILE`, and
`PUSH_FCM_PRIVATE_KEY_FILE`. Each file must be a non-empty, owner-controlled
secret mount. Runtime startup fails closed when a configured file is missing or
empty, and provider values are never written to controller receipts.

Validate a staged credential mount without printing values:

```sh
pnpm verify:notification-providers --target staging --push web
```

The full custody, canary, failure, and production gates are defined in
`docs/runbooks/notification-provider-activation.md`.

Live DEV qualification is read-only and produces owner-only, schema-validated,
checksummed evidence:

```sh
pnpm athyper qualify dev --json
```

Exit code `0` means every recorded acceptance check passed. Exit code `2` means
the receipt was written but one or more checks remain blocked. A healthy
container is not treated as proof of authenticated sessions, exactly-once jobs,
document processing, mail webhooks, or telemetry; those paths require isolated
qualification fixtures.

## Phase 9 QA isolation contract

QA uses the independent `athyper-qa` Compose project, `*.qa.athyper.test`
routes through the shared ingress, PostgreSQL port 55432, and QA-only secret and receipt
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

STG uses project `athyper-stg`, routes under `*.stg.athyper.test` through the
shared ingress, PostgreSQL port 56432, and an internal mail capture service whose UI is
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
