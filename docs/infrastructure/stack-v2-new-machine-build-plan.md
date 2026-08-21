# ATHYPER Stack v2 — Detailed New-Machine Container Build Plan

**Status:** Implementation in progress; DEV runtime qualification is evidence-backed and blocked
**Prepared:** 2026-08-20  
**Scope:** New Windows 11 development workstation, repeatable DEV/QA/STG-rehearsal instances, GitHub image lifecycle, and a controlled path to multi-server K3s/Kubernetes  
**Source baseline:** Current ATHYPER repository, current Compose model, current GitHub workflows, and the live Docker inventory on the existing workstation

Current new-machine position (2026-08-21): Ubuntu 24.04 and source are on `D:`,
the laptop-32 WSL envelope is active, Node 24.19.0/pnpm 10.33.0 are
normalized, machine-phase and clean-slate disposition evidence exist, and the
Stack v2 controller/Compose suite passes 35/35. The elevated cold-start evidence
passes with Defender platform `4.18.25080.5`, Docker Engine `29.7.2`, BitLocker,
Secure Boot, Ubuntu, and Docker-distribution checks all valid. The previous
unmanaged `athyper-dev` resources were checksummed into an owner-only quarantine
archive before removal. Controller-owned platform and DEV core deployment,
fresh-database migration, active ownership receipts, logical PostgreSQL backup,
and isolated new-volume restore have all completed successfully.
All five ATHYPER application images are published at immutable GHCR digests for
source revision `d3a77f476c1c9639f21fb0ddb7a31316beea1591`. The publication
matrix passed structure, smoke, Trivy, SBOM, and provenance gates and emitted a
complete candidate image-set manifest.

The operational boundary has moved forward: DEV core is live, but release
completion remains blocked on the full DEV functional/resource matrix, two
isolated QA runs, and STG promotion
plus recovery rehearsal. Cutover and K3s remain deferred.

### 0.1 Completion checkpoint and required order

The first milestone, safe deterministic `athyper plan dev`, is structurally
complete. `plan` and `up` now consume the same machine, cold-start, Stack v1
disposition/export/restore, static-policy, secret, collision, capacity, and
migration-selection gates. Tests use injected evidence fixtures rather than
mutable workstation artifacts.

Continue in this order:

1. **Complete:** Docker Desktop integration is available in `Ubuntu-24.04`.
2. **Complete:** Defender recovery and valid elevated cold-start evidence.
3. **Complete in implementation:** make `plan` consume the mandatory admission gates used by `up`.
4. **Complete in implementation:** deterministic controller/Compose suite passes 35/35.
5. **Complete:** `athyper up dev --confirm dev` produced active and migration receipts.
6. **Complete:** live backup `20260821T081919Z` restored successfully into isolated volume `athyper-dev-restore-20260821t081919z_db-data`.
7. **Complete:** five immutable application digests and the candidate image-set were published from revision `d3a77f476c1c9639f21fb0ddb7a31316beea1591`.
8. **In progress:** `athyper qualify dev` records owner-only checksummed evidence. The current run passes 10/20 checks and is blocked by deployment source drift, an API restart, API readiness, and seven fixture-dependent functional paths.
9. **Pending:** execute QA twice and retain isolation proof.
10. **Pending:** perform STG promotion and recovery rehearsal.
11. **Deferred:** consider cutover or K3s only after every prior gate passes.

---

## 1. Executive decision

Build **Stack v2 alongside the current Stack v1**. Do not migrate the existing Docker Desktop virtual disk or refactor the working installation in place.

The recommended model is:

1. **One GitHub monorepo** remains the source of truth for product code, deployment definitions, tests, and release metadata.
2. Publish **one GHCR package per independently deployable ATHYPER artifact**, not one package per product feature.
3. Use **Docker Compose for one-machine development and rehearsal**.
4. Use a unique Compose project for every instance: `athyper-dev`, `athyper-qa`, `athyper-stg`, and temporary instances such as `athyper-pr-482`.
5. Use **one shared outer ingress** and one internal gateway per instance. Only the outer ingress publishes host ports 80 and 443.
6. Keep every instance's database, cache, object storage, IAM state, networks, secrets, and configuration isolated.
7. Store source and bind-mounted development files in the Ubuntu/WSL ext4 filesystem. Store service databases in Docker-managed Linux volumes.
8. Treat Meilisearch, Infisical, rendering, observability, mail, scanners, and admin tools as **capabilities** that can be supplied internally, externally, or disabled.
9. Promote an **immutable image-set manifest** through QA, staging rehearsal, remote staging, and production. Never rebuild the release between environments.
10. Add Kubernetes/K3s deployment definitions only after Compose parity and isolation are proven. Kubernetes, not cross-host Compose, becomes the multi-server scheduler.

This separates five concepts that are currently mixed together:

| Concept | Meaning | Example |
|---|---|---|
| Application artifact | Code built and deployed independently | `athyper-neon-web` |
| Runtime role | A command run from an artifact | API, worker, scheduler, migration |
| Capability | A service contract an application consumes | search, secrets, object storage |
| Instance | An isolated installation of ATHYPER | dev, qa, stg |
| Topology | Where capability providers run | laptop Compose or search server in K3s |

---

## 2. Goals and non-goals

### 2.1 Goals

- Rebuild the stack predictably on a clean machine.
- Run DEV and QA together without shared state or port collisions.
- Run STG-rehearsal when resources permit.
- Make optional services selectable without editing Compose files.
- Build ATHYPER images once and promote the exact digests.
- Make a future move of Meilisearch, Infisical, PostgreSQL, Redis, or MinIO to another server a topology/configuration change rather than an application rewrite.
- Provide backup, restore, reset, and disaster-recovery procedures from the first implementation phase.
- Remove Windows path, fixed container name, fixed network name, and fixed volume name dependencies.
- Keep secrets out of Git, image layers, build arguments, and general-purpose `.env` files.
- Keep local Compose and future Kubernetes contracts aligned without forcing Kubernetes onto every developer.

### 2.2 Non-goals for the first implementation

- Do not create separate repositories for Neon, Mesh, Studio, or the server runtime.
- Do not create a container image for every source package or feature flag.
- Do not deploy a laptop Kubernetes cluster for ordinary development.
- Do not make every upstream service highly available on one laptop.
- Do not migrate production credentials or unsanitized production data to the workstation.
- Do not copy the existing Docker Desktop VHD as the normal migration method.
- Do not delete Stack v1 until Stack v2 passes the complete acceptance matrix and rollback period.

---

## 3. Evidence from the existing workstation and repository

### 3.1 Live Docker baseline

The live audit on 2026-08-20 found:

| Measure | Current value |
|---|---:|
| Retained containers | 39 |
| Running containers | 19 |
| Stopped containers | 20 |
| Compose services with all profiles resolved | 39 |
| Images | 40 / 20.92 GB |
| Container writable layers | 828.7 MB |
| Local volumes | 28 / 14.04 GB |
| Reclaimable volume data | 12.1 GB |
| Build cache | 2.37 GB |
| Approximate live container memory | 2.1 GB |

The 19 running containers are gateway, two PgBouncer pools, PostgreSQL, Redis, Mailpit, Keycloak, Alloy, Grafana, Loki, Tempo, Prometheus, MinIO, Redis exporter, Alertmanager, outage page, two Docker socket proxies, and ClamAV.

Important current defects:

- ClamAV is using about **595 MiB of a 600 MiB limit**. The new minimum must be 1 GiB, with 1.25–1.5 GiB preferred for full profiles.
- The gateway is using about **112 MiB of a 128 MiB limit**. Use at least 256 MiB.
- The outage container has no effective explicit cap.
- The current full retained Compose service set has materially larger configured limits than the currently running core; capacity must be evaluated by preset, not from idle use.
- Stopped application containers include Neon, Mesh, API, worker, and scheduler. The repository now also defines `studio-web`, so Studio belongs in the v2 catalog even though the retained running inventory predates it.

### 3.2 Repository blockers that v2 must remove

| Current coupling | Location/example | v2 requirement |
|---|---|---|
| Fixed Compose project | `name: athyper-stack` | Project supplied by instance controller |
| Global network names | `athyper-edge`, `athyper-internal` | Project-scoped instance networks |
| Global volume names | `athyper-stack-db-data` and other explicit names | Project-scoped volumes unless intentionally external |
| Generated container name dependency | `athyper-db-1` | Compose service DNS `db` |
| One global env file | `stack/env/.env` | Per-instance rendered configuration |
| Windows runtime root | `D:/Stack/athyper/...` | Linux-native runtime home and Docker volumes |
| Fixed host ports | DB/cache/object storage debug bindings | Only outer ingress by default; opt-in debug ports |
| Windows launcher authority | `up.bat` | Cross-platform `athyper`/`stackctl` controller |
| Two broad networks | edge/internal | edge/app/data/ops segmentation |
| Toolchain drift | CI Node 20.20, Docker Node 24, root `>=22` | One exact Node 24 patch contract everywhere |

### 3.3 Preserve useful Stack v1 changes

Stack v2 should carry forward these good existing controls:

- Pinned upstream service versions.
- PostgreSQL through separate transaction and session PgBouncer pools.
- Docker socket access through proxies rather than direct socket mounts.
- Per-service health checks.
- Environment-specific overrides.
- Memory/CPU resource declarations.
- Distinct optional profiles for monitoring, search, render, analytics, and secrets.
- Existing port-hardening and configuration validation scripts.
- Existing database provisioning, reset, seed, export, and restore work.
- Existing UID/GID collision lessons from the Ubuntu v13 infrastructure plan.

---

## 4. Target architecture

```text
Windows 11 host
├── BitLocker-protected OS and data drives
├── WSL 2 utility VM with explicit CPU/memory/swap limits
├── Ubuntu 24.04 WSL distribution stored on D:
│   ├── ~/src/athyper                         Git checkout, ext4
│   └── ~/.athyper
│       ├── instances/dev                    Rendered local runtime files
│       ├── instances/qa
│       ├── instances/stg
│       ├── backups                          Export staging only
│       └── cache                            Non-authoritative downloads
└── Docker Desktop WSL backend
    ├── Docker data VHD stored on D:
    ├── athyper-platform                     Shared outer ingress project
    │   └── ingress                          Owns 127.0.0.1:80/443
    ├── athyper-dev                          Isolated Compose project
    │   ├── gateway-dev
    │   ├── edge/app/data/ops networks
    │   └── dev-scoped volumes
    ├── athyper-qa                           Isolated Compose project
    │   ├── gateway-qa
    │   ├── edge/app/data/ops networks
    │   └── qa-scoped volumes
    └── athyper-stg                          Isolated Compose project
        ├── gateway-stg
        ├── edge/app/data/ops networks
        └── stg-scoped volumes
```

### 4.1 Why two ingress tiers

The outer ingress is stable and is the only component that owns 80/443. It routes by hostname to an instance gateway:

```text
neon.dev.athyper.test   -> gateway-dev -> neon-web
api.dev.athyper.test    -> gateway-dev -> api
neon.qa.athyper.test    -> gateway-qa  -> neon-web
api.stg.athyper.test    -> gateway-stg -> api
```

Recommended implementation:

- Outer and instance gateways use generated Traefik file-provider configuration.
- Do not give either gateway the Docker socket in the final model.
- Only instance gateways join the shared `athyper-platform-ingress` network.
- Each instance gateway also joins only its own edge network.
- Generate unique shared-network aliases such as `gateway-dev`, `gateway-qa`, and `gateway-stg`.
- If Docker provider discovery is retained during transition, require `athyper.instance=<id>` labels and provider constraints; remove it after file-provider parity.

This gives one port owner, predictable routing, and a small cross-instance trust surface.

---

## 5. Host and workstation standard

### 5.1 Hardware tiers

Do not encode the ROG model into Compose. Select a host resource profile from detected capacity.

| Host profile | Host RAM | Suggested WSL cap | Intended concurrent use |
|---|---:|---:|---|
| `laptop-16` | 16 GB | 8–10 GB | DEV-lite only |
| `laptop-32` | 32 GB | 20–22 GB | DEV-full or DEV-lite + QA |
| `laptop-64` | 64 GB | 42–46 GB | DEV-full + QA; STG on demand |
| `workstation-128` | 128 GB+ | 80–96 GB | DEV + QA + STG and controlled load work |
| `ci` | Runner-defined | Job-defined | Ephemeral validation only |

For this 31.6 GB ROG laptop, use the `laptop-32` profile:

```ini
[wsl2]
memory=20GB
processors=24
swap=8GB
swapFile=D:\\ATHYPER\\wsl\\swap\\wsl-swap.vhdx
localhostForwarding=true

[experimental]
autoMemoryReclaim=gradual
```

This leaves roughly 12 GB for Windows and uses 24 of 32 logical processors. Experimental sparse-VHD mode is intentionally disabled because this WSL build warned that it is disabled due to potential data corruption. Apply changes with `wsl --shutdown`.

### 5.2 Disk layout

Recommended physical allocation:

| Path | Purpose | Required headroom |
|---|---|---:|
| `C:` | Windows, applications | At least 80 GB free after setup |
| `D:\ATHYPER\wsl\Ubuntu-24.04` | Ubuntu distribution VHD | 100 GB initial headroom |
| `D:\ATHYPER\docker-desktop\data` | Docker data VHD | 250 GB initial headroom |
| `D:\ATHYPER\wsl\swap` | WSL swap | 8 GB |
| `D:\ATHYPER\migration\stack-v1` | v1 inventories and approved exports | Retention-based |
| `D:\ATHYPER\qualification` | Machine, performance, and restore evidence | 20 GB working headroom |
| External/off-device target | Encrypted backups | Capacity based on retention |

Use SSD/NVMe. Do not place live PostgreSQL, Redis, MinIO, Loki, Tempo, or Meilisearch data on `/mnt/c` or `/mnt/d` bind mounts. Their live data belongs in Linux-native Docker volumes.

### 5.3 New-machine bootstrap sequence

Run these gates in order and record the output in a machine qualification report.

#### WM-01 — Firmware and Windows

- Update BIOS/firmware from the manufacturer.
- Enable CPU virtualization in firmware.
- Fully update Windows 11.
- Enable BitLocker/device encryption on C: and D: and escrow the recovery key outside the laptop.
- Configure a non-admin daily account and a separate local administrator account.
- Confirm date, time zone, Secure Boot, TPM, and power profile.

#### WM-02 — Install and locate WSL

In elevated PowerShell:

```powershell
wsl --update
wsl --set-default-version 2
wsl --list --online
wsl --install -d Ubuntu-24.04 --location D:\ATHYPER\wsl\Ubuntu-24.04
```

Use the exact distribution name returned by `wsl --list --online`. Then:

```powershell
wsl --version
wsl --status
wsl --list --verbose
```

Acceptance:

- Store-delivered/current WSL.
- Ubuntu reports WSL version 2.
- Its VHD is on D:.
- Default Linux user is non-root.
- `systemd` is enabled only if required by workstation services.

#### WM-03 — Configure WSL resources

- Put `.wslconfig` in `%UserProfile%` using the selected host profile.
- Put swap on D:.
- Run `wsl --shutdown`, restart Ubuntu, and verify memory/CPU inside Linux.
- Keep at least 16 GB for Windows on a 64 GB host.

#### WM-04 — Install Docker Desktop

- Use the WSL 2 backend.
- Enable integration only for the ATHYPER Ubuntu distribution.
- Move Docker Desktop's disk image to `D:\ATHYPER\docker-desktop\data` through Docker Desktop settings before importing or building images.
- Start with 250 GB maximum disk capacity and monitor actual use.
- Enable automatic start only if the operator wants the platform always available.
- Do not enable Kubernetes in Docker Desktop for Stack v2 Compose development.
- Configure registry login only after GitHub package permissions are ready.

Verify:

```powershell
docker version
docker compose version
docker info
docker run --rm hello-world
```

#### WM-05 — Linux developer toolchain

Inside Ubuntu:

```bash
sudo apt update
sudo apt install -y git ca-certificates curl jq make openssl unzip age
mkdir -p ~/src ~/.athyper/instances ~/.athyper/backups ~/.athyper/cache
```

Install the repository-selected exact Node 24 patch and activate the exact `pnpm@10.33.0` from `packageManager`. The implementation must add a single version authority such as `.node-version`; CI and Dockerfiles must consume or be verified against it.

Use `/home/chandravel_natarajan` and its `~/src` / `~/.athyper` roots. Do not create `/home/athyper`; a second Linux identity would add ownership and sudo friction without improving isolation.

#### WM-06 — Clone and qualify source

```bash
cd ~/src
git clone <canonical-athyper-repository-url> athyper
cd athyper
corepack enable
pnpm install --frozen-lockfile
pnpm policy:docker-toolchain
pnpm typecheck
```

Do not clone under `/mnt/d`. Linux source placement is required for bind-mount performance and file-change notifications.

#### WM-07 — Local TLS

- Use a workstation-local development CA, preferably through `mkcert` or an equivalent approved tool.
- Trust the CA in Windows and the relevant browsers.
- Issue a wildcard/SAN certificate covering the selected `*.dev.athyper.test`, `*.qa.athyper.test`, and `*.stg.athyper.test` names.
- Keep the CA private key outside Git under the instance secret root with restrictive permissions.
- Never reuse the local CA for staging or production.

---

## 6. Runtime filesystem and state policy

### 6.1 Repository versus runtime

```text
~/src/athyper/                         tracked source and templates
~/.athyper/                            untracked operator state
├── machine.yaml                       selected host profile and machine ID
├── instances/
│   ├── dev/
│   │   ├── instance.yaml
│   │   ├── rendered/
│   │   ├── config/
│   │   ├── secrets/
│   │   ├── imports/
│   │   ├── exports/
│   │   └── receipts/
│   ├── qa/
│   └── stg/
├── backups/
│   └── <instance>/<timestamp>/
└── cache/
```

Rules:

- `rendered/` is disposable and must be regenerable.
- `receipts/` records image-set digest, schema level, seed level, command, timestamp, and result.
- `secrets/` is mode 0700 and secret files are mode 0600 in Linux.
- Runtime paths never appear as literal values in committed Compose files.
- Live state is in Docker volumes; `backups/` contains exports, not mounted live database directories.

### 6.2 Volume naming and lifecycle

Remove explicit `name:` from normal volumes. Compose creates names such as:

```text
athyper-dev_db-data
athyper-dev_memorycache-data
athyper-dev_objectstorage-data
athyper-dev_iam-data             if IAM needs separate state
athyper-dev_search-data          when internal search is selected
```

Policies:

| Instance | Data policy | Reset behavior |
|---|---|---|
| DEV | Persistent developer-owned synthetic data | Explicit confirmation |
| QA | Repeatable seeded synthetic data | Reset is routine |
| STG rehearsal | Sanitized, production-shaped data | Change-controlled reset |
| PR/feature | Disposable synthetic data | Destroy on expiry |

An external volume is allowed only when its shared/external lifecycle is deliberate and documented. Its name must include environment and purpose.

---

## 7. Instance, feature, provider, and resource contracts

### 7.1 Instance manifest

Tracked templates belong in Git; rendered operator copies belong under `~/.athyper`.

```yaml
apiVersion: athyper.io/v1alpha1
kind: Instance
metadata:
  id: dev
spec:
  mode: development
  composeProject: athyper-dev
  domainSuffix: dev.athyper.test
  preset: dev-lite
  hostProfile: laptop-32
  imageSet: image-sets/dev.yaml
  dataPolicy: persistent
  integrations: sandbox
  debugPorts:
    postgres: 127.0.0.1:5432
  providers:
    search: internal
    secrets: file
    objectStorage: internal
    mail: internal
```

Validation rules:

- `id`, Compose project, domain suffix, and debug ports are unique.
- IDs match `^[a-z0-9][a-z0-9-]{1,30}$`.
- QA/STG use immutable image digests only.
- QA/STG cannot use production integration credentials.
- STG has no debug ports unless explicitly approved.
- Requested preset fits the selected host profile.

### 7.2 Capability provider contract

Applications depend on logical capabilities, not machine names:

```yaml
search:
  mode: external
  endpoint: https://search.dev.internal.example
  tlsSecretRef: search-client-ca
  credentialRef: search-api-key
  healthPath: /health
  timeoutMs: 10000
```

Every capability must define:

- provider mode: `internal`, `external`, `mock`, or `disabled`;
- stable endpoint;
- authentication method and secret reference;
- TLS requirements;
- health and readiness contract;
- timeout/retry/circuit-breaker policy;
- data ownership and backup owner;
- migration and version compatibility policy;
- observability labels and service-level objective.

The application-facing variables remain stable, for example `SEARCHCORE_URL`, `INFISICAL_URL`, `S3_ENDPOINT`, and `DOCRENDER_BASE_URL`. Only the rendered provider mapping changes.

### 7.3 Presets

| Preset | Services | Expected container memory budget |
|---|---|---:|
| `dev-lite` | DB, pools, Redis, MinIO, IAM, gateway dependencies; apps on host | 5–8 GB |
| `dev-full` | Full apps + scanner + mail + selected debug tools | 10–14 GB |
| `qa-standard` | Immutable apps + scanner + mock mail + synthetic data | 10–14 GB |
| `stg-standard` | Production-shaped immutable stack, no debug tools | 10–14 GB |
| `validation-full` | DEV + QA + STG together | 30–40 GB plus builds |

These are initial policy envelopes, not promises. Record peak memory during qualification and tune from evidence.

### 7.4 Feature profiles

Keep core services unprofiled or in a controller-owned core set. Optional capabilities use profiles:

```text
apps
mail
scanner
observability
monitoring
search
render
secretstore
admin-db
admin-queue
analytics
jobs-cache
```

Avoid ambiguous names such as `security` for unrelated services. `scanner` and `secretstore` are distinct capabilities and have different lifecycle/security requirements.

---

## 8. Network and port model

### 8.1 Per-instance networks

| Network | `internal` | Members | Purpose |
|---|---:|---|---|
| `edge` | No | instance gateway, web apps, API | Ingress-facing application traffic |
| `app` | No | API, web BFFs, workers, scheduler, adapters | Application-to-service orchestration |
| `data` | Yes | DB, pools, Redis, MinIO, data consumers | Stateful service traffic |
| `ops` | Yes | metrics, logs, traces, exporters | Observability traffic |

Rules:

- DB, Redis, PgBouncer, and internal MinIO never join `edge`.
- Worker and scheduler never join `edge`.
- The outer ingress joins only `athyper-platform-ingress`.
- The instance gateway joins `athyper-platform-ingress` and its own `edge`.
- Admin consoles are off by default and route only in DEV/QA with authentication.
- No service refers to a container-generated name.
- Network aliases that cross the platform ingress are unique per instance.

### 8.2 Port policy

| Port category | Default |
|---|---|
| HTTP/HTTPS | Outer ingress owns `127.0.0.1:80` and `127.0.0.1:443` locally |
| PostgreSQL | No host port; DEV opt-in `127.0.0.1:5432` |
| PgBouncer | No host port; use container exec or explicit DEV debug mapping |
| Redis | No host port; DEV opt-in only when a host tool requires it |
| MinIO | No direct host port; route console/API through authenticated ingress |
| Metrics/logs/traces | No direct host port; route selected UIs through ingress |
| Mailpit | SMTP internal; UI through DEV ingress |

The controller owns a debug-port registry so a second instance cannot silently reuse a port.

### 8.3 Local domain policy

Use:

```text
neon.dev.athyper.test
mesh.dev.athyper.test
studio.dev.athyper.test
api.dev.athyper.test
iam.dev.athyper.test

neon.qa.athyper.test
api.qa.athyper.test

neon.stg.athyper.test
api.stg.athyper.test
```

Nested `.localhost` names did not resolve reliably on this Windows host, so Stack v2 uses `.athyper.test`. The controller prints the exact loopback mappings; only an explicit bootstrap/apply command may edit the hosts file. HTTPS still requires a locally trusted development certificate.

---

## 9. Current service classification and v2 disposition

### 9.1 ATHYPER-built artifacts

| Compose role | GHCR package | Instance scope | Notes |
|---|---|---:|---|
| `neon-web` | `ghcr.io/<org>/athyper-neon-web` | Per instance | Independent Next.js artifact |
| `mesh-web` | `ghcr.io/<org>/athyper-mesh-web` | Per instance | Independent Next.js artifact |
| `studio-web` | `ghcr.io/<org>/athyper-studio-web` | Per instance | Correct current name; replaces old admin/Athena draft naming |
| `api` | `ghcr.io/<org>/athyper-runtime-server` | Per instance | Same digest as worker/scheduler |
| `worker` | `ghcr.io/<org>/athyper-runtime-server` | Per instance | Different command/mode only |
| `scheduler` | `ghcr.io/<org>/athyper-runtime-server` | Per instance | Different command/mode only |
| DB migration job | `ghcr.io/<org>/athyper-runtime-server` initially | Per deployment | Explicit one-shot command; split later only if justified |
| `iam` customization | `ghcr.io/<org>/athyper-keycloak` | Per instance | Publish because current stack has ATHYPER theme/config customization |

Do not publish separate API, worker, and scheduler image packages while they are the same binary and dependency graph. That creates false independence and triples lifecycle work.

### 9.2 Upstream capability services

| Current service(s) | Capability | Local default | Future external option | Stateful | Backup requirement |
|---|---|---|---|---:|---|
| `db` | PostgreSQL | Per instance | Dedicated/managed DB | Yes | Native logical + tested restore; optional physical/WAL later |
| `dbpool-apps` | Transaction pool | Per instance | Near application or DB | No | Configuration only |
| `dbpool-session` | Session pool | Per instance | Near IAM/DB | No | Configuration only |
| `memorycache` | Cache/session/queue Redis | Per instance | Dedicated Redis | Policy-dependent | RDB/AOF only for durable uses; sessions may be disposable by policy |
| `memorycache-jobs` | BullMQ Redis | Optional per instance | Dedicated jobs Redis | Yes for job durability | RDB/AOF + queue recovery test |
| `objectstorage` | S3-compatible storage | Per instance | Dedicated MinIO/cloud S3 | Yes | Versioning/replication or object-level backup |
| init jobs | Bucket/bootstrap | One-shot per instance | Same endpoint | No | Idempotent receipts |
| `iam` database + Keycloak | Identity | Per instance | Dedicated IAM service | Yes | DB + realm/config export + signing key policy |
| `searchcore` | Search | Optional internal | Dedicated search server | Yes | Meilisearch snapshots and pre-upgrade dumps |
| `secretstore` | Secrets manager | File provider first | Dedicated Infisical | Yes | Infisical DB/Redis + root key custody |
| `virusscan` | Malware scanning | Full profiles | Dedicated scanner pool | Signature cache only | No business data; rebuildable signatures |
| `docrender` | Rendering | Optional | Dedicated render workers | No | Configuration only |
| `docparser` | Document parsing | Optional | Dedicated parser workers | No | Configuration only |
| `mailtrap` | Development mail | DEV only | Sandbox SMTP | Optional | Normally disposable |
| `analyticsboard` | Analytics UI | Deferred | Dedicated governed analytics | Yes/config | Application DB/config and governance approval |
| `dbconsole`, `queueconsole` | Emergency/admin | DEV/QA only | Bastion/admin tool | No | Configuration only |

### 9.3 Observability and platform services

| Current service(s) | Recommendation |
|---|---|
| Outer gateway | One shared workstation project; no business state |
| Instance gateway/outage page | One per instance; generated routes; explicit 256/64 MiB starting caps |
| socket proxies | Transitional only; retire when gateway/Alloy file/API discovery no longer needs Docker socket |
| Prometheus, Loki, Tempo, Grafana, Alloy, Alertmanager | Initially per QA/STG preset for isolation; later a shared observability platform with mandatory instance labels |
| Redis exporter | Per Redis provider or near the Redis service |
| Uptime Kuma, Healthchecks, GlitchTip | Optional monitoring capability; can move to shared platform after isolation and tenancy controls are proven |
| one-shot logging/tracing bucket jobs | Idempotent jobs with completion receipts, not long-running service failures |

Every service must have image digest, health check, restart policy, graceful stop, resource request/limit, log policy, network list, volume list, secret list, and backup owner documented in a machine-readable catalog.

### 9.4 Complete resolved Compose service ledger

This ledger accounts for every one of the 39 services currently returned by Compose with all profiles enabled:

| Service | Class | Lifecycle | v2 scope/disposition |
|---|---|---|---|
| `gateway` | Ingress | Long-running | Per instance inner gateway |
| `gateway-outage` | Ingress fallback | Long-running | Per instance, capped at 64 MiB |
| `socket-proxy-gateway` | Docker discovery | Long-running | Transitional; retire with file-provider routing |
| `db` | PostgreSQL | Stateful | Per instance or external provider |
| `dbpool-apps` | PgBouncer transaction pool | Long-running | Per instance, app/data networks |
| `dbpool-session` | PgBouncer session pool | Long-running | Per instance, IAM/data networks |
| `memorycache` | Redis cache/session/queue | Stateful by policy | Per instance or external provider |
| `memorycache-jobs` | Redis job coordination | Optional stateful | Per instance or external provider |
| `memorycache-exporter` | Redis metrics | Long-running | Beside each Redis provider |
| `objectstorage` | MinIO/S3 | Stateful | Per instance or external provider |
| `objectstorage-init` | Bucket bootstrap | One-shot | Per instance, idempotent with receipt |
| `iam` | Keycloak | Stateful through DB | Per instance or external IAM provider |
| `neon-web` | ATHYPER web app | Long-running | Per instance GHCR artifact |
| `mesh-web` | ATHYPER web app | Long-running | Per instance GHCR artifact |
| `studio-web` | ATHYPER web app | Long-running | Per instance GHCR artifact |
| `api` | ATHYPER runtime role | Long-running | Per instance; runtime-server digest |
| `worker` | ATHYPER runtime role | Long-running | Per instance; runtime-server digest |
| `scheduler` | ATHYPER runtime role | Long-running | Per instance; runtime-server digest |
| `virusscan` | ClamAV scanner | Long-running optional/full | Per instance initially; external pool later |
| `docrender` | Gotenberg render | Long-running optional | Per instance or external provider |
| `docparser` | Tika parser | Long-running optional | Per instance or external provider |
| `searchcore` | Meilisearch | Stateful optional | Per instance or dedicated search node |
| `secretstore` | Infisical | Stateful optional | External authority preferred after bootstrap design |
| `mailtrap` | Mailpit | Long-running DEV only | Per DEV instance or external sandbox SMTP |
| `metrics` | Prometheus | Stateful by retention | Per QA/STG initially; shared ops later |
| `logging` | Loki | Stateful by retention | Per QA/STG initially; shared ops later |
| `logging-bucket-init` | Loki bucket bootstrap | One-shot | Idempotent with receipt |
| `tracing` | Tempo | Stateful by retention | Per QA/STG initially; shared ops later |
| `tracing-bucket-init` | Tempo bucket bootstrap | One-shot | Idempotent with receipt |
| `telemetry` | Grafana | Stateful/configured | Provision from Git; shared ops later |
| `logshipper` | Grafana Alloy | Long-running | Per instance/host collector |
| `socket-proxy-logshipper` | Docker log discovery | Long-running | Transitional; minimize or retire |
| `alertmanager` | Alert routing | Stateful configuration | Per instance initially; shared ops later |
| `statuswatch` | Uptime Kuma | Stateful optional | Shared platform candidate |
| `cronwatch` | Healthchecks | Stateful optional | Shared platform candidate |
| `errorcollect` | GlitchTip | Stateful optional | Shared platform candidate with tenancy policy |
| `dbconsole` | Pgweb admin | On-demand | DEV/QA only, authenticated |
| `queueconsole` | Bull Board admin | On-demand/emergency | DEV/QA only, authenticated |
| `analyticsboard` | Metabase | Stateful optional/deferred | Separate governed capability |

The retained `athyper-authz-qualification` PostgreSQL container is not part of the resolved Compose application. Model it as an ephemeral test fixture owned by the authorization qualification workflow, with automatic cleanup and no workstation-wide persistent name.

---

## 10. Proposed repository layout

Keep the existing `stack/` available during migration and add v2 without renaming v1 immediately:

```text
deploy/
├── catalog/
│   ├── applications.yaml
│   ├── capabilities.yaml
│   └── upstream-images.yaml
├── compose/
│   ├── platform/
│   │   ├── compose.yaml
│   │   └── ingress/
│   ├── instance/
│   │   ├── compose.yaml
│   │   ├── services/
│   │   └── profiles/
│   └── tests/
├── instances/
│   ├── templates/
│   │   ├── dev.yaml
│   │   ├── qa.yaml
│   │   └── stg.yaml
│   └── schemas/
├── resources/
│   ├── laptop-16.yaml
│   ├── laptop-32.yaml
│   ├── laptop-64.yaml
│   ├── workstation-128.yaml
│   └── ci.yaml
├── image-sets/
│   ├── dev.yaml
│   ├── candidates/
│   └── releases/
├── kubernetes/
│   ├── charts/
│   ├── environments/
│   └── policies/
└── stackctl/
    ├── src/
    ├── schemas/
    └── tests/

.github/workflows/
├── ci.yml
├── build-images.yml
├── scan-images.yml
├── create-image-set.yml
├── promote-image-set.yml
├── deploy-compose.yml
├── deploy-kubernetes.yml
└── reusable-deploy.yml
```

Migration rule: `stack/compose` remains Stack v1 until v2 parity. Only after acceptance should v2 become the default and v1 move to a clearly archived compatibility folder.

---

## 11. Compose implementation standard

### 11.1 Compose rules

- Use the Compose Specification; do not add an obsolete top-level `version`.
- Do not hard-code top-level `name:`. The controller passes `-p athyper-<id>`.
- Do not set `container_name`.
- Do not explicitly name normal networks or volumes.
- Use service names for DNS: `db`, `dbpool-apps`, `memorycache`, `objectstorage`.
- Put environment-neutral service definitions in one base model.
- Apply environment/preset differences through generated override files.
- Use `docker compose config` as a blocking render check before every `up`.
- Use long-form ports and bind debug ports to `127.0.0.1`.
- Pin upstream images to digest in QA/STG/release image sets.
- Add `init: true` or correct signal handling for Node processes.
- Add `stop_grace_period` based on worker/API shutdown behavior.
- Use `read_only: true`, `tmpfs`, non-root users, dropped capabilities, and `no-new-privileges` where compatible.
- Give each service a health check that tests its actual responsibility.
- Express dependency readiness through health/completion conditions, while keeping applications resilient to dependency restarts.

### 11.2 Standard labels

```yaml
labels:
  athyper.instance: ${INSTANCE_ID}
  athyper.mode: ${INSTANCE_MODE}
  athyper.service: api
  athyper.component: runtime-server
  athyper.version: ${IMAGE_SET_ID}
  org.opencontainers.image.revision: ${SOURCE_REVISION}
```

Never place secrets or customer identifiers in labels.

### 11.3 Resource policy

Set both memory and CPU policy for every long-running service. Starting corrections:

| Service | Current concern | v2 starting limit |
|---|---|---:|
| ClamAV | 595/600 MiB live | 1.25 GiB DEV, 1.5 GiB QA/STG |
| Gateway | 112/128 MiB live | 256 MiB |
| Outage page | No practical cap | 64 MiB |
| Keycloak | ~518/768 MiB | 1 GiB standard, tune heap explicitly |
| Alloy | ~197/256 MiB | 384 MiB |
| Grafana | ~172/256 MiB | 384 MiB |

Record peak and 95th percentile memory during a 30-minute qualification workload. Alert at 80%; fail qualification on OOM or sustained greater than 90%.

---

## 12. `stackctl` controller contract

Provide one cross-platform entry point, implemented in Node/TypeScript or Go. Node/TypeScript is initially pragmatic because the repository already requires Node and can share schemas.

### 12.1 Commands

```text
athyper doctor
athyper instance create dev --template dev
athyper config render dev
athyper plan dev
athyper up dev
athyper status dev
athyper logs dev [service]
athyper down dev
athyper restart dev [service]
athyper reset qa
athyper destroy pr-482 --confirm pr-482
athyper backup dev
athyper restore dev <backup-id>
athyper promote <image-set> qa
athyper verify dev
athyper topology show dev
```

### 12.2 Mandatory preflight

`athyper plan/up` must fail before mutation when:

- Docker/Compose versions are outside the supported range.
- Instance ID, project, domain, or ports collide.
- a required secret file is absent, empty, world-readable, or a placeholder;
- a release environment references a mutable tag;
- the image set is incomplete or its signature/attestation policy fails;
- disk headroom is below policy;
- requested preset exceeds host memory/CPU policy;
- resolved Compose contains a fixed container name/global data volume;
- resolved Compose exposes a forbidden backend port;
- production credentials are detected in DEV/QA/STG rehearsal;
- a database reset/restore target cannot be proven exactly;
- a schema migration is incompatible with the requested application image set.

### 12.3 Plan and receipt behavior

Before `up`, print:

- exact Compose files and profiles;
- project name;
- images and digests;
- networks and volumes to be created;
- ports and domains;
- estimated resource envelope;
- migrations/init jobs to run;
- destructive actions, if any.

After success, write a receipt. Never print secret values.

Implementation update (2026-08-21): guarded `up`, `down`, `restart`, `backup`,
and new-volume `restore` execution is implemented in `deploy/stackctl`. Mutating
commands require exact repeated identifiers. The controller validates both
Compose models before startup, starts the shared platform before an instance,
requires ownership receipts before adopting existing projects, retains volumes
on shutdown/rollback, and writes schema-validated owner-only operation receipts.
PostgreSQL backup emits custom-format dumps for all four application databases
plus global-role metadata; restore verifies all hashes and sizes and targets a
new project/volume. Live Docker qualification completed on 2026-08-21: DEV and
the shared platform are controller-owned and healthy, backup `20260821T081919Z`
was restored into a retained isolated volume, and receipt
`20260821T082343Z-restore` records success. Restore applies archived roles and
memberships before database ownership and ACLs, then refreshes runtime login
credentials through `db-init`. DEV selects a fresh-database-only,
advisory-locked DDL runner and starts
applications only after it succeeds. The runner refuses populated schemas.
Forward migration, QA, and STG remain blocked until the candidate runtime image
contains the migration role and supplies compatibility policy plus its own
receipt; controlled DEV execution does not waive that Phase 15 release gate.

---

## 13. Configuration and secrets design

### 13.1 Configuration layers

Resolve configuration in this order, with higher layers overriding lower layers:

1. service defaults in source;
2. tracked environment policy;
3. tracked instance template;
4. untracked machine/instance values;
5. secret provider material;
6. explicit one-command operator override.

The rendered output records sources without recording secret values.

### 13.2 Secret providers

Use one logical secret interface with providers:

| Environment | Initial provider | Future provider |
|---|---|---|
| Local DEV | Restricted files under `~/.athyper` | Infisical machine identity if useful |
| Local QA/STG rehearsal | Restricted files, separate per instance | Dedicated Infisical |
| CI build | No runtime secrets | GitHub token only for package publication |
| Remote deployment | OIDC/GitOps identity | Infisical/KMS/external secrets operator |

Rules:

- Compose grants individual secret files only to services that require them.
- Runtime secrets do not enter Docker build context.
- `NEXT_PUBLIC_*` values are treated as public, never secret.
- Rotate per environment and per service identity.
- Secret scanning and push protection are mandatory repository controls.
- Infisical's own `ENCRYPTION_KEY` and `AUTH_SECRET` cannot be stored only inside Infisical. Keep bootstrap/root material in an external password vault, KMS/HSM, or encrypted offline recovery bundle with dual custody.

---

## 14. GitHub and GHCR lifecycle

### 14.1 Package model

Create these GHCR packages first:

```text
ghcr.io/<org>/athyper-neon-web
ghcr.io/<org>/athyper-mesh-web
ghcr.io/<org>/athyper-studio-web
ghcr.io/<org>/athyper-runtime-server
ghcr.io/<org>/athyper-keycloak
```

Do not repackage PostgreSQL, Redis, Traefik, MinIO, Meilisearch, Infisical, Grafana, Loki, Tempo, Prometheus, ClamAV, Tika, Gotenberg, Mailpit, or PgBouncer unless ATHYPER owns a custom binary/plugin/patch. Reference upstream images by digest in the image set.

### 14.2 Tag and digest policy

Publish useful tags:

```text
sha-<12-character-git-sha>
pr-<number>-<sha>             optional ephemeral validation
v<semver>                     approved release only
```

Deploy QA, staging, and production by digest:

```text
ghcr.io/<org>/athyper-runtime-server@sha256:<digest>
```

`latest` is forbidden outside disposable local experimentation.

### 14.3 Image build standard

- Use BuildKit and a checked-in `docker-bake.hcl` (or equivalent declarative build matrix) with one target for each of the five ATHYPER images.
- Build `linux/amd64` first because the audited workstation and planned laptop are x86-64. Add `linux/arm64` only after native/emulated CI and runtime qualification pass.
- Pin every base image with a readable version tag plus digest, for example `node:<exact>-alpine@sha256:...`.
- Use multi-stage builds and copy only the pruned production runtime graph into the final stage.
- Maintain a root `.dockerignore` that excludes `.git`, local env/secrets, runtime data, backups, test output, caches, and unrelated build artifacts.
- Never pass credentials through `ARG`, `ENV`, copied files, or image labels. Use BuildKit secret/SSH mounts only when a build genuinely requires private dependency access.
- Run final images as a numeric non-root user, set a read-only root filesystem where compatible, and provide explicit writable `tmpfs`/volume paths.
- Add OCI title, source, revision, version, license, created-time, and documentation labels without embedding sensitive values.
- Make health checks lightweight and ensure PID 1 receives and handles `SIGTERM`.
- Export/import build cache through a controlled GitHub Actions cache or registry cache; cache is an optimization, never a release artifact.
- Run container-structure/smoke tests against the exact local digest before push: user, entrypoint, ports, health path, absence of prohibited files, and startup with a minimal secret fixture.
- Push by digest once. Tags are references to that digest and must not trigger another build.
- Record Dockerfile, base-image, lockfile, and source revision inputs in provenance.

### 14.4 Image-set manifest

```yaml
apiVersion: athyper.io/v1alpha1
kind: ImageSet
metadata:
  id: 2026.08.20-sha-a837d6
  sourceRevision: a837d6...
spec:
  applications:
    neonWeb: ghcr.io/acme/athyper-neon-web@sha256:...
    meshWeb: ghcr.io/acme/athyper-mesh-web@sha256:...
    studioWeb: ghcr.io/acme/athyper-studio-web@sha256:...
    runtimeServer: ghcr.io/acme/athyper-runtime-server@sha256:...
    keycloak: ghcr.io/acme/athyper-keycloak@sha256:...
  upstream:
    postgres: postgres@sha256:...
    redis: redis@sha256:...
    traefik: traefik@sha256:...
    meilisearch: getmeili/meilisearch@sha256:...
  database:
    contractVersion: <version>
    migrationRevision: <revision>
  provenance:
    workflowRun: <url-or-id>
```

If only Mesh changes, the next image set may reuse the prior digests for every unchanged component. Initially build all five ATHYPER images on every merge because the monorepo has shared packages. Optimize affected-image detection only after its dependency-graph tests are trustworthy.

### 14.5 Workflow lifecycle

```text
Pull request
  -> existing CI quality gates
  -> Compose render/schema/policy tests
  -> Docker build without push
  -> container smoke tests
  -> dependency and secret scan

Merge to protected main/develop policy
  -> build all release images once
  -> push GHCR by SHA
  -> vulnerability scan
  -> SBOM
  -> GitHub artifact attestation/provenance
  -> create immutable image-set candidate

Candidate promotion
  -> deploy fresh QA
  -> reset/seed/migrate
  -> contract/integration/E2E/security/restore tests
  -> approve GitHub `quality` environment
  -> deploy same digests to STG rehearsal
  -> approve GitHub `staging` environment
  -> deploy same digests to remote staging
  -> release approval and production deployment
```

Required workflow responsibilities:

| Workflow | Responsibility |
|---|---|
| `ci.yml` | Code quality, tests, repository policies |
| `build-images.yml` | Build and push ATHYPER images; output digests |
| `scan-images.yml` | Vulnerability, malware, license, SBOM policy |
| `create-image-set.yml` | Validate and commit/upload atomic candidate manifest |
| `promote-image-set.yml` | Move an existing image set between environment pointers |
| `deploy-compose.yml` | Controlled laptop/single-host deployment, normally manual |
| `deploy-kubernetes.yml` | Update GitOps desired state; avoid direct long-lived server credentials |
| `reusable-deploy.yml` | One hardened deployment contract reused by environments |

### 14.6 GitHub controls

- Protect the release branch; require CI and review.
- Use CODEOWNERS for `deploy/`, Dockerfiles, workflows, database migrations, and secret policies.
- Pin third-party GitHub Actions to full commit SHA, with automated update PRs.
- Grant minimum workflow permissions; `contents: read` by default and `packages: write`, `attestations: write`, `id-token: write` only to build/publish jobs.
- Use GitHub Environments as deployment gates, not as package boundaries.
- Prevent self-approval for staging/production where the GitHub plan supports it.
- Use OIDC for cloud identities. Do not store long-lived cloud access keys in repository secrets.
- Treat self-hosted runners as privileged infrastructure; use dedicated ephemeral runners for deployment if introduced.
- For on-prem Kubernetes, prefer GitOps pull reconciliation (Argo CD or Flux) so GitHub Actions changes desired state rather than receiving cluster-admin credentials.

### 14.7 Toolchain normalization gate

Before trusting container releases:

1. Select an exact Node 24 patch version.
2. Add it to one repository authority.
3. Update all Actions workflows from Node 20.20 to that version.
4. Pin Docker base images by digest while retaining a readable Node tag.
5. Keep `pnpm@10.33.0` synchronized with `packageManager`.
6. Extend `policy:docker-toolchain` to compare local, CI, and Docker contracts.

---

## 15. Database and initialization lifecycle

### 15.1 Deployment order

1. Create networks and volumes.
2. Start PostgreSQL.
3. Wait for database health.
4. Run database/bootstrap role creation idempotently.
5. Start PgBouncer pools.
6. Run schema migration as a one-shot job using the candidate runtime image.
7. Run seed/import only when the instance policy requests it.
8. Start Redis, MinIO, and required internal capabilities.
9. Run MinIO/IAM/capability initialization jobs and record receipts.
10. Start IAM and wait for readiness.
11. Start API/worker/scheduler and web applications.
12. Enable instance gateway routes only after readiness.
13. Run smoke tests.

Do not rely on `depends_on` alone for business readiness. Initialization must be idempotent and safe to retry.

### 15.2 Migration safety

- Every image set declares schema/migration compatibility.
- Take a verified backup before destructive/irreversible migration.
- Prefer expand/migrate/contract changes so old and new application versions overlap safely.
- A failed migration blocks application rollout.
- Migration jobs have a unique advisory lock to prevent parallel execution.
- Store migration receipt and checksum.
- Rollback means application rollback only when schema compatibility permits; otherwise restore to a new volume and switch after verification.

---

## 16. Backup and disaster recovery

### 16.1 Backup matrix

| State | Method | Initial frequency | Restore test |
|---|---|---:|---:|
| PostgreSQL | Custom-format `pg_dump` per DB + roles/global metadata | Daily DEV/STG, per QA run as needed | Monthly and before migration milestone |
| MinIO | Versioned/off-host object copy or replication | Daily/incremental | Quarterly sample + full manifest check |
| Meilisearch | Scheduled snapshot; dump before version upgrade | Daily snapshot | Quarterly; every upgrade |
| Keycloak | Database backup + realm/config export + key custody | Daily with DB | Monthly login-flow test |
| Infisical | PostgreSQL/Redis backup plus separately escrowed root material | Daily when enabled | Quarterly isolated recovery |
| Grafana/config | Provisioning files in Git; DB only if UI changes are allowed | On change | Quarterly |
| Loki/Tempo/Prometheus | Retention-policy dependent; object storage if durable | Policy-defined | Sample query after recovery |
| Instance manifest/receipt | Git + encrypted/off-host copy | Every change | Every rebuild |

### 16.2 Backup rules

- A backup on the same laptop or the same MinIO is not disaster recovery.
- Encrypt backups before leaving the host.
- Maintain checksum, image set, schema version, start/end time, size, and result in a manifest.
- Use retention such as 7 daily, 4 weekly, and 6 monthly for important rehearsal data, adjusted to business need.
- Never restore over the only copy of a live volume. Restore into a new project/volume, verify, then switch.
- Docker Desktop VHD backup is an emergency machine snapshot, not the primary application backup.

### 16.3 Recovery objectives to establish

During implementation, record approved RPO/RTO for each environment. Initial workstation targets can be:

- DEV: RPO 24 hours, RTO 4 hours.
- QA: reconstruct from Git/images/seeds, RTO 2 hours.
- STG rehearsal: RPO 24 hours, RTO 4 hours.

Remote staging/production objectives require business approval and a separate HA design.

---

## 17. Multi-server evolution

### 17.1 Boundary

Docker Compose manages one Docker engine and is the correct local/single-server implementation. It is not the future cross-server scheduler. When a service must run on another machine, deploy the environment to K3s/Kubernetes or treat that service as an explicitly external provider.

### 17.2 K3s target

```text
Load balancer / ingress
        |
K3s server nodes (3 for HA control plane when required)
        |
├── app nodes       Neon/Mesh/Studio/API
├── worker nodes    worker/scheduler/render/parser/scanner
├── data nodes      PostgreSQL/Redis/MinIO or external managed services
├── search nodes    Meilisearch
├── security nodes  Infisical
└── ops nodes       metrics/logs/traces
```

Use node labels and, for dedicated sensitive/stateful roles, taints/tolerations:

```text
athyper.io/workload=apps
athyper.io/workload=workers
athyper.io/workload=search
athyper.io/workload=secrets
athyper.io/workload=data
athyper.io/storage=nvme
```

Use `nodeSelector` for simple required placement and node affinity for preferred/complex placement. Use persistent-volume topology, disruption budgets, anti-affinity, and topology spread when redundancy is real.

### 17.3 Meilisearch on a separate server

The application still uses `SEARCHCORE_URL`; the provider topology changes:

```yaml
search:
  mode: external
  endpoint: https://meili.search.svc.athyper.internal
```

Requirements:

- Stable DNS/service name; never a hard-coded machine IP in the application.
- TLS and scoped API keys.
- Fast persistent disk and explicit capacity alerts.
- Network policy/firewall allowing only required application identities.
- Daily snapshots stored off the search node.
- A portable dump before each Meilisearch version upgrade.
- Tested re-index from the authoritative application database/events so search is not the only system of record.
- Initially one well-protected stateful instance unless a supported, validated HA design is selected.

### 17.4 Infisical on a separate server

Treat "Infisical server" as a service set, not one container:

- Infisical application;
- PostgreSQL;
- Redis;
- ingress/TLS;
- root encryption/auth key custody;
- backups, audit logs, monitoring, and recovery procedure.

Requirements:

- ATHYPER uses a machine/workload identity, not a shared human token.
- Root bootstrap keys are held outside Infisical.
- Production uses HA/external PostgreSQL and Redis according to the approved architecture.
- Kubernetes secrets are encrypted at rest and RBAC is least privilege if Kubernetes is used.
- Infisical failure behavior is explicit: cached lease, startup failure, and secret rotation handling are tested.
- Moving Infisical changes `INFISICAL_URL` and identity configuration, not application code.

### 17.5 GitOps repository split trigger

Keep deployment definitions in the monorepo initially. Create a separate private `athyper-fleet` repository only when one or more are true:

- infrastructure operators differ from application developers;
- production topology visibility must be more restricted;
- multiple clusters require independent reconciliation history;
- deployment changes need a separate approval/compliance boundary;
- monorepo workflow permissions become too broad.

The application repository would then publish image sets; the fleet repository would promote references to those immutable image sets.

---

## 18. Implementation phases

Each phase is independently reviewable. Do not begin the next phase until its exit gate passes.

### Phase 0 — Freeze and recover Stack v1

Deliverables:

- Export resolved Compose for every active profile combination.
- Record container/image/digest, network, volume, port, resource, and health inventories.
- Back up all PostgreSQL databases and globals.
- Export MinIO data/config using supported APIs.
- Export Keycloak realm/config needed for rebuild.
- Record current runtime roots and secret inventory without secret values.
- Take an emergency Docker VHD snapshot only after Docker Desktop is fully stopped.
- Perform at least one database restore into a disposable qualification container.

Exit gate: current workstation can be rebuilt from source/images/config/backups without relying on container writable layers.

Rollback: Stack v1 remains untouched and is the operational fallback.

### Phase 1 — Add v2 schemas and policy tests

Deliverables:

- `deploy/catalog`, instance schema, image-set schema, provider schema, and resource profiles.
- Static policies rejecting fixed project/network/volume/container names.
- Policy rejecting mutable release image references and forbidden host ports.
- Toolchain authority normalized to exact Node 24 and pnpm 10.33.0.
- CI runs schema and policy tests.

Exit gate: sample DEV/QA/STG manifests validate; deliberately invalid fixtures fail.

Rollback: v2 files are additive and do not affect v1.

### Phase 2 — Build `stackctl` foundation

Deliverables:

- `doctor`, `config render`, `plan`, `up`, `down`, `status`, and `logs`.
- Collision, capacity, disk, secret, image-set, and Compose-render preflights.
- Redacted logging and operation receipts.
- Unit tests and golden rendered-config tests on Windows and Linux runners where practical.

Exit gate: the controller can render two instances with no global resource collision and makes no mutation in `plan` mode.

### Phase 3 — Platform ingress and DEV infrastructure

Deliverables:

- Shared outer ingress project.
- Instance gateway with generated file-provider routing.
- DEV DB, PgBouncer, Redis, MinIO, IAM, mail, and initialization jobs.
- Project-scoped networks and volumes.
- Local TLS and domain routing.

Exit gate: infrastructure smoke tests pass; only outer ingress publishes 80/443; data services are unreachable from unrelated networks.

### Phase 4 — ATHYPER application images

Current implementation status (2026-08-21): the five-target Bake matrix has
published Neon, Mesh, Studio, runtime-server, and customized Keycloak 26.7.2 at
immutable GHCR digests from clean source revision
`d3a77f476c1c9639f21fb0ddb7a31316beea1591`. Structure/smoke checks and Trivy
0.70.0 passed with zero fixed HIGH/CRITICAL findings. The successful candidate
workflow emitted the complete schema-compatible image-set after all image jobs
passed.

Deliverables:

- Production Dockerfiles for Neon, Mesh, Studio, runtime server, and customized Keycloak.
- One runtime-server image used by API/worker/scheduler/migration roles.
- Non-root, read-only-compatible runtime stages where possible.
- GHCR build workflow, SBOM, scan, and attestation.
- Image-set generation.

Exit gate: a clean machine pulls and runs images without source mounts or local builds.

### Phase 5 — DEV parity

Current implementation status (2026-08-21): `athyper qualify dev` now evaluates
controller ownership, deployed source, catalog topology, health/restarts, seven
public endpoints, the laptop-32 envelope, and the functional acceptance paths.
Its evidence is schema-validated, SHA-256 checksummed, and written with owner-only
permissions under `~/.athyper/qualification/dev/`. The latest live run passes
10/20 checks. Catalog topology, container health, Neon/Mesh/Studio, API
liveness, IAM discovery, Mailpit, and the declared 12,544 MiB/14.6 CPU envelope
pass. Qualification remains blocked because the deployment predates the current
revision, API restarted once after a Docker/WSL clock discontinuity, API
readiness returns 503, and isolated fixtures for authentication, worker,
scheduler, document pipeline, mail webhook, and telemetry have not been proven.

Deliverables:

- Bring up all capabilities used by the current working stack.
- Import only supported/sanitized state.
- Verify Neon, Mesh, Studio, API, worker, scheduler, IAM, object storage, scanning, mail, and telemetry paths.
- Measure resource peaks and update `laptop-32` limits.

Exit gate: all Stack v1 functional smoke tests pass in `athyper-dev`; no hard-coded Windows/container resource names remain in v2.

### Phase 6 — QA isolation and repeatability

Current implementation status: the static isolation and read-only lifecycle
contract is complete. Runtime qualification remains gated and is not claimed.

Deliverables:

- `qa-standard` preset using immutable images.
- QA reset, migration, synthetic seed, test, and destroy lifecycle.
- Separate `athyper-qa` resources, `*.qa.athyper.test` routes through the shared ingress, PostgreSQL debug port 55432,
  QA secret paths, and an ownership receipt boundary.
- Candidate image injection for all five published ATHYPER images; incomplete or
  all-zero candidate metadata is rejected before any future operation.
- Cross-instance DNS/network/data isolation tests.
- Concurrent DEV + QA capacity qualification.

Exit gate: resetting or destroying QA changes no DEV volume, secret, route, or data; QA recreates identically twice.

### Phase 7 — STG rehearsal and promotion

Current implementation status: the schema-backed, read-only rehearsal contract
is complete. Runtime migration and restore qualification remain gated and are
not claimed.

Deliverables:

- `stg-standard` preset with sanitized data and no debug/admin access by default.
- Image-set promotion from QA to STG without rebuild.
- Integration allowlist and production-credential denial policy.
- Backup-before-migration and restore qualification.
- Default-deny outbound integrations, internal unexposed mail capture, and
  explicit denial of production credentials.
- Schema-valid sanitization, backup, and restore receipts with non-zero
  checksums and backup-to-restore linkage.

Exit gate: exact application digests used in QA run in STG; rollback/restore drill passes.

### Phase 8 — Optional capabilities and heavy profiles

Current implementation status: the static on-demand composition and read-only
capacity/security planner are complete. Runtime qualification is gated and no
optional profile has been started.

Deliverables:

- Search, render, scanner, secretstore, monitoring, analytics, and admin profiles.
- Capability provider tests for internal/external/disabled modes.
- ClamAV right-sizing and failure-mode test.
- Meilisearch snapshot/dump/restore test.
- Infisical bootstrap/recovery design before enabling it as an authority.
- Dedicated loopback allocations per instance and no public/backend ports.
- Dedicated PostgreSQL identities for Infisical and analytics; file-backed
  secret injection for Infisical, Metabase, Pgweb, and Bull Board.
- A hard capacity rejection when a profile plus its instance exceeds the host
  resource envelope.

Exit gate: disabling an optional capability gives the documented degraded/blocked behavior and never silently bypasses security policy.

### Phase 9 — Remote K3s proof of architecture

Current implementation status: the read-only eligibility/decision gate is
complete and returns `deferred`. No K3s installation or deployable Kubernetes
artifact is authorized or implemented.

Deliverables:

- Before any manifest work, schema-valid Compose acceptance and an approved
  multi-host topology requirement must pass `athyper orchestrator assess`.

- Kubernetes charts/manifests derived from the same catalog contracts.
- Namespace per environment, network policies, workload identity, resource requests/limits, probes, and persistent storage classes.
- Dedicated search-node placement proof.
- Dedicated secret-service placement proof.
- GitOps image-set promotion.

Exit gate: moving search and secrets to designated nodes changes topology manifests only; application images remain unchanged.

### Phase 10 — Cutover and retire v1

Deliverables:

- Signed-off acceptance report.
- Final fresh backups and restore proof.
- Operator training and runbooks.
- Defined rollback observation window.
- v1 archived as read-only compatibility material after approval.

Exit gate: stakeholders explicitly approve v2 as default. Do not delete v1 state as part of the same change.

---

## 19. Acceptance and qualification matrix

### 19.1 Machine

- WSL and Docker data reside on D:.
- Source is under Ubuntu ext4, not `/mnt/d`.
- WSL memory/CPU/swap limits match machine profile.
- Windows retains sufficient interactive memory under full DEV load.
- Disk alert thresholds are configured at 20% free warning and 10% critical.

### 19.2 Build and supply chain

- CI, local tools, and Docker use the same Node/pnpm contract.
- Each ATHYPER artifact has one GHCR package and immutable digest.
- Images contain OCI source/revision metadata.
- SBOM, vulnerability results, and provenance attestation exist.
- Critical/high vulnerability exception requires expiry, owner, and approval.
- QA/STG pull by digest and never build locally.

### 19.3 Isolation

- DEV cannot resolve/connect to QA or STG data services.
- QA cannot resolve/connect to DEV or STG data services.
- Destroying `athyper-qa` leaves DEV resources byte-for-byte/logically unchanged.
- Secrets are unique and not readable by unrelated services.
- Only the expected gateway route crosses the shared platform network.

### 19.4 Functional

- Neon, Mesh, and Studio login/logout/session flows.
- API live/readiness and authenticated request.
- Worker consumes a job exactly once according to its contract.
- Scheduler creates expected repeatable work without duplication.
- Database transaction/session pools behave correctly.
- Upload, scan, store, download, render, parse, index, and search flows.
- Mail sandbox and webhook behavior.
- Telemetry contains instance, service, and version dimensions.

### 19.5 Failure and recovery

- Restart DB, Redis, IAM, MinIO, gateway, API, worker, and scanner individually.
- Simulate capability unavailable/timeout/bad credential.
- Prove ClamAV fail-closed behavior where required.
- Restore PostgreSQL to a new volume and run application verification.
- Restore MinIO sample corpus and checksum it.
- Restore Meilisearch snapshot and rebuild from source data.
- Recover Infisical only when bootstrap keys and database backup are both available.
- Reboot Windows and verify controlled recovery/no corrupt state.

### 19.6 Promotion

- One image set passes QA and STG rehearsal unchanged.
- GitHub Environment approvals protect staging/production.
- Deployment receipt identifies actor, source revision, image digests, schema, result, and rollback reference.
- Previous compatible image set can be selected and redeployed.

---

## 20. Operational runbooks required before completion

Create and test these runbooks:

1. New workstation bootstrap.
2. Create/start/stop/reset/destroy an instance.
3. Add or rotate an instance secret.
4. Promote an image set.
5. PostgreSQL backup and new-volume restore.
6. MinIO backup and restore.
7. Keycloak export/recovery and signing-key handling.
8. Meilisearch snapshot, dump, upgrade, restore, and re-index.
9. Infisical bootstrap, key custody, backup, and recovery.
10. Disk pressure and Docker VHD compaction.
11. OOM/resource-pressure response.
12. Expired local TLS certificate replacement.
13. Vulnerable upstream image update.
14. Failed database migration.
15. Lost laptop response and credential revocation.
16. K3s node loss and stateful workload recovery when multi-server begins.

---

## 21. Decision log

| Decision | Choice | Reason |
|---|---|---|
| Local orchestrator | Docker Compose | Lowest developer complexity; correct single-host scope |
| Multi-server orchestrator | K3s/Kubernetes | Scheduling, service discovery, placement, policy, and recovery across hosts |
| Repository model | One monorepo initially | Shared packages and atomic product changes |
| Package granularity | One GHCR image per deployable ATHYPER artifact | Independent lifecycle without package explosion |
| API/worker/scheduler | One runtime image, multiple roles | Same binary/dependency graph |
| Optional service model | Capability provider | Internal/external/disabled without code rewrite |
| Instance boundary | Compose project + networks + volumes + secrets | Predictable isolation and cleanup |
| Ingress | Shared outer + per-instance inner gateway | One host port owner and clean instance routes |
| Data storage | Docker volumes | Linux-native correctness/performance |
| Source storage | Ubuntu ext4 | Bind-mount and file-watch performance |
| Release unit | Atomic image-set manifest | Promotes a tested system, not unrelated latest tags |
| Secrets bootstrap | File/offline/KMS root, Infisical optional provider | Avoids secret-manager bootstrap paradox |
| Current stack migration | Side-by-side v1/v2 | Preserves rollback and working state |

---

## 22. Immediate build backlog

Begin with one infrastructure pull request containing only additive v2 foundations:

1. Add `deploy/catalog` service definitions for all 39 resolved Compose services, marking one-shot jobs explicitly; register the standalone authorization qualification database separately as an ephemeral test fixture.
2. Add JSON schemas for instance, provider, resource profile, and image-set manifests.
3. Add `dev`, `qa`, and `stg` template manifests.
4. Add static policy tests for fixed names, host ports, secrets, mutable images, and toolchain drift.
5. Normalize Node 24 and pnpm versions.
6. Add `stackctl doctor`, `config render`, and `plan`; do not implement destructive commands yet.
7. Add a minimal shared outer ingress and one DEV instance gateway.
8. Render DB + PgBouncer + Redis + MinIO first and prove scoped names/volumes/networks.
9. Add backup/restore qualification before importing current state.
10. Only then add IAM, applications, scanner, observability, and optional capabilities.

The first technical milestone is structurally complete: this command is
read-only, deterministic under fixture evidence, and reports live workstation
admission failures without mutation:

```text
athyper plan dev
```

When the host gates pass, it must show a fully resolved, collision-free,
resource-bounded deployment without creating a container, network, volume, or
secret. Until then, a blocked plan is the required safe result, not a deployment
readiness claim.

---

## 23. Authoritative references

- [Docker Compose application model and project isolation](https://docs.docker.com/compose/intro/compose-application-model/)
- [Docker Compose profiles](https://docs.docker.com/compose/how-tos/profiles/)
- [Docker Compose secrets](https://docs.docker.com/reference/compose-file/secrets/)
- [Docker Desktop WSL 2 best practices](https://docs.docker.com/desktop/features/wsl/best-practices/)
- [Docker Desktop backup and restore](https://docs.docker.com/desktop/settings-and-maintenance/backup-and-restore/)
- [Microsoft WSL commands](https://learn.microsoft.com/en-us/windows/wsl/basic-commands)
- [Microsoft WSL configuration](https://learn.microsoft.com/en-us/windows/wsl/wsl-config)
- [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [GitHub publishing Docker images](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images)
- [GitHub artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations)
- [GitHub deployment environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
- [GitHub OIDC with reusable workflows](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-with-reusable-workflows)
- [Kubernetes pod-to-node placement](https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/)
- [K3s architecture](https://docs.k3s.io/architecture)
- [Meilisearch backup methods](https://www.meilisearch.com/docs/resources/self_hosting/data_backup/overview)
- [Infisical self-hosting](https://infisical.com/docs/self-hosting/overview)
- [Infisical configuration requirements](https://infisical.com/docs/self-hosting/configuration/envars)
- [Infisical Kubernetes HA reference](https://infisical.com/docs/self-hosting/reference-architectures/on-prem-k8s-ha)
