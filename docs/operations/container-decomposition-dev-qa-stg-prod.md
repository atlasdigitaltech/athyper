---
title: Container decomposition across DEV, QA, STG and Production
---

# Container decomposition across DEV, QA, STG and Production

Analysis of the container surface the shared platform stack declares per
environment, and what a production placement decision must account for. This is
analysis, not an approved design: no instance template, image set or receipt in
this repository establishes a production topology or region. The architecture
overview still records production hosting and region as open.

Sources are the typed configuration that drives deployment, resolved by
`deploy/stackctl`:

- Instances: `deploy/instances/templates/dev.yaml`, `qa.yaml`, `stg.yaml`. There is
  **no production instance template**.
- Service catalogue: `deploy/catalog/applications.yaml`,
  `deploy/catalog/capabilities.yaml`, `deploy/catalog/workload-sets.yaml`.
- Compose sources: `deploy/compose/instance/compose.yaml`,
  `compose.parity.yaml`, `compose.aws-storage.yaml`, `compose.optional.yaml`,
  `deploy/compose/platform/compose.yaml`, `deploy/compose/operations/compose.yaml`.

Counts below were computed by loading the model and selecting services for each
preset, not read from prose.

## 1. Selected services per environment

| Environment | Mode        | Preset                               | Host profile | Selections | Declared memory | Declared vCPU |
| ----------- | ----------- | ------------------------------------ | ------------ | ---------- | --------------- | ------------- |
| DEV         | development | `dev-full`                           | `laptop-32`  | 24         | 15,488 MiB      | 15.95         |
| QA          | qa          | `qa-standard`                        | `laptop-32`  | 25         | 16,000 MiB      | 16.95         |
| STG         | staging     | `stg-standard`                       | `laptop-32`  | 21         | 13,952 MiB      | 14.60         |
| Production  | —           | no `production`/`prod` preset exists | —            | —          | —               | —             |

`validation-full` exists as a preset and adds the observability exporters plus
`metrics`/`tracing`/`telemetry`/`alertmanager`, while the `analytics` and
`secretstore` profiles stay opt-in. Production therefore needs either a new preset
or explicit composition from the existing catalogues.

## 2. Relationship to the harness-hosted instances

The evidence in this repository describes **DEV and QA running as separate local
SeaweedFS instances**, with STG/PROD being the tiers intended to move to AWS S3
(see [storage and image remediation](/operations/storage-and-image-remediation-20260912)
and [object storage v6](/operations/object-storage-v6)). So this table describes
the declared stack, not four currently-running production-grade hosts:

| Tier | What the repository evidences                                                                                                                                                                                                                              | Container placement reality            |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| DEV  | Running locally, `persistent` policy, sandbox integrations                                                                                                                                                                                                 | Single host, loopback bindings         |
| QA   | Running locally, `disposable` policy, mock integrations                                                                                                                                                                                                    | Single host, QA-before-DEV for changes |
| STG  | Template plus local image set only; `dataPolicy: sanitized`, `integrations: allowlisted`, external object storage/mail/push. `deploy/aws/object-storage/README.md` names **Contabo** for staging, using IAM Roles Anywhere because the host is outside AWS | Generic VPS host, not a cloud region   |
| PROD | No template, no image set, no region                                                                                                                                                                                                                       | Not provisioned                        |

## 3. What each layer contributes

### 3.1 Shared platform layer (per deployment)

`deploy/compose/platform/compose.yaml`: `ingress` (Traefik, owner of the one
deliberate cross-project network `athyper-platform-ingress`) and `platform-outage`
(unprivileged Nginx). In DEV the `atlas` overlay adds `atlas-inference` (Ollama),
which is local inference and not part of STG/PROD.

### 3.2 Shared operations layer (host-scoped, singleton)

`deploy/compose/operations/compose.yaml`: `metrics` (Prometheus), `logging`
(Loki), `logshipper` (Alloy), `alertmanager`, `telemetry` (Grafana), `tracing`
(Tempo) and `statuswatch` (Uptime Kuma). `cronwatch` and `errorcollect` are
declared as platform services and recorded as an incomplete mode; the operations
profile pins `laptop-32-ops-lite`.

This layer is a **per-host singleton**, shared by every instance on that host, so
it must be replicated per region or host group rather than per application
instance.

### 3.3 Instance runtime — always on

Base `compose.yaml` plus the parity overlay, present in all three presets:

| Service                               | Image               | Role                                                                  | State                          |
| ------------------------------------- | ------------------- | --------------------------------------------------------------------- | ------------------------------ |
| `gateway`                             | Traefik             | Instance routing                                                      | stateless                      |
| `gateway-outage`                      | Nginx unprivileged  | Maintenance response                                                  | stateless                      |
| `db`                                  | PostgreSQL 16.15    | Application and IAM databases                                         | stateful                       |
| `dbpool-apps`, `dbpool-session`       | PgBouncer           | Transaction and session pooling                                       | stateless                      |
| `memorycache`                         | Valkey 8.1.10       | Cache                                                                 | stateful                       |
| `jobqueue`                            | Valkey 8.1.10       | Queue                                                                 | stateful                       |
| `secretstore-cache`                   | Valkey 8.1.10       | Secret cache                                                          | stateful                       |
| `iam`                                 | Keycloak            | Identity provider                                                     | stateful                       |
| `api`, `worker`, `scheduler`          | runtime-server      | HTTP API, background consumers, scheduled work                        | stateless                      |
| `neon-web`, `mesh-web`, `studio-web`  | plane webs          | Three web applications                                                | stateless                      |
| `virusscan`                           | ClamAV              | Malware scanning, fail-closed when unavailable                        | stateless with signature state |
| `docrender`                           | Gotenberg           | PDF rendering                                                         | stateless                      |
| `docparser`                           | Tika                | Text extraction                                                       | stateless                      |
| `searchcore`                          | Meilisearch         | Search index                                                          | stateful                       |
| `objectstorage`, `objectstorage-init` | SeaweedFS, s3-tools | S3-compatible storage and bucket/policy initialisation                | stateful, one-shot             |
| `mailtrap`                            | Mailpit             | Local mail capture, selected only when `mail` is `internal` or `mock` | stateless                      |

### 3.4 Per-environment deltas

| Difference                                 | DEV | QA  | STG                              |
| ------------------------------------------ | --- | --- | -------------------------------- |
| `db-migration` (empty-database foundation) | yes | no  | no                               |
| `db-migration-baseline`                    | no  | yes | no                               |
| `db-forward-migration`                     | no  | yes | yes                              |
| `mailtrap`                                 | yes | yes | **no** (external mail)           |
| `objectstorage` and `objectstorage-init`   | yes | yes | **no** (external object storage) |
| `atlas-inference`                          | yes | no  | no                               |
| Selection count                            | 24  | 25  | 21                               |

Lifecycle splits matter for sizing: `db-init`, the migration services and
`objectstorage-init` are one-shot jobs that run at deploy or release time and then
exit. The steady-state long-running set is smaller than the selection count.

## 4. Production shape implied by the same catalogue

A production instance would keep the same services and add:

- **Replicas of every stateless service**: `api`, `worker`, `scheduler`,
  `neon-web`, `mesh-web`, `studio-web`, `gateway`, `dbpool-apps`,
  `dbpool-session`, `docrender`, `docparser`, `virusscan`. The catalogue declares
  no replica count; that is a topology decision the deployment plan must supply.
- **Release-time jobs**: `db-migration`/`db-forward-migration` and any seed work,
  run as one-shots under the existing migration profiles.
- **The shared ingress and operations layers**, per host.
- **Stateful services with backup, restore and failover**: `db`, `iam`,
  `memorycache`, `jobqueue`, `secretstore-cache`, `searchcore`, and object storage
  (S3 in STG/PROD).
- **A multi-host topology requirement.** `deploy/instances/schemas/topology-requirement.schema.json`
  requires `multiHostRequired: true`, `minimumNodeCount >= 2` and a recorded
  approver, and no such artefact exists yet.

## 5. Portability: what binds this stack to a provider

Four real couplings, in order of strength:

1. **Object storage is validated as Amazon S3 only for STG/PROD.**
   `server/apps/platform-host/src/config/environment.ts` rejects `S3_ENDPOINT` and
   `S3_PUBLIC_ENDPOINT` outside `local`, requires `S3_REGION` plus three distinct
   buckets, and requires two distinct credential profiles. The S3 adapter itself is
   provider-agnostic: it supports a custom `endpoint`, `forcePathStyle`, a public
   endpoint for presigning and `credential_process` profiles. Shared configuration
   validation is what currently forbids the endpoint override a non-AWS provider
   would need.
2. **Workload identity.** STG/PROD require `APP_S3_PROFILE` and
   `ARTIFACTS_WRITER_S3_PROFILE`, resolved through `AWS_CONFIG_FILE` mounted
   read-only. The supported non-AWS patterns are IAM Roles Anywhere for non-AWS
   hosts, or native AWS principal roles. Another cloud's workload identity has to
   be bridged into that SDK profile model.
3. **Mail and push providers.** `mail: external` with Amazon SES v2 as the
   documented primary transport, plus VAPID web push. SES is regional, so a
   different cloud needs a transport decision.
4. **Ingress and certificates.** Traefik terminates and routes at the instance
   boundary over the platform ingress network, with loopback 80/443 in the
   baseline and TLS material supplied as secrets. A cloud placement needs a load
   balancer or managed ingress plus certificate management in front of it.

Everything else is either portable by configuration (search, scanner, rendering,
queue and cache URLs) or is the application images themselves.

## 6. Managed-services option, and what it buys

The stateful capability services are the containers most worth replacing with
provider-managed equivalents:

| Container(s)                                   | Declared cost         | Managed replacement               | Effect                                                                      |
| ---------------------------------------------- | --------------------- | --------------------------------- | --------------------------------------------------------------------------- |
| `db` and `db-init`                             | 2,176 MiB / 2.25 vCPU | Managed PostgreSQL                | Removes patching, backup and failover work; keeps the three plane schemas   |
| `dbpool-apps`, `dbpool-session`                | 256 MiB / 0.5 vCPU    | Managed pooler or direct endpoint | Two containers removed                                                      |
| `memorycache`, `jobqueue`, `secretstore-cache` | 2,560 MiB / 0.5 vCPU  | Managed Redis/Valkey              | Reproduces the current isolation as separate instances or logical databases |
| `searchcore`                                   | 1,024 MiB / 1 vCPU    | Managed search                    | Meilisearch has no first-party managed offering on the major clouds         |
| `virusscan`                                    | 1,280 MiB / 1 vCPU    | Managed scanning                  | No direct equivalent; ClamAV signature freshness must be preserved          |
| `objectstorage`, `objectstorage-init`          | 1,280 MiB / 1.1 vCPU  | Provider object storage           | Already the STG/PROD design                                                 |

Rough effect: the per-instance container count falls from about 21 to about
12–14, and roughly 5 GiB of declared memory plus two database pools leave the host.
The cost is stronger coupling to one provider and the loss of the local behaviour
that the parity presets exercise in DEV/QA. Every one of these substitutions is a
shared-framework and deployment change, not an entity change.

## 7. Gaps this analysis exposes

These are findings, not authorised work:

1. **No production instance template, image set or region record.** Production
   cannot be planned by `deploy/stackctl` at all today.
2. **`hostProfile` has no server tier.** Every profile is `ci`, a `laptop-*` or
   `workstation-128`. STG currently claims `laptop-32`, so a real staging or
   production host has no profile that describes it.
3. **Documentation drift on object storage.** `server/production.env.example` and
   `server/staging.env.example` still describe object storage as "MinIO / S3" and
   suggest exposing a local MinIO endpoint, which shared configuration now rejects
   for STG/PROD and which the storage remediation retired for DEV/QA. These are
   operator-facing files and will mislead.
4. **The architecture overview's service inventory is incomplete.** Its parity
   table omits `objectstorage`, `mailtrap`, `atlas-inference` and the one-shot
   migration services, and it lists `searchcore-key-init`, which is not in the
   service catalogue.
5. **No multi-host topology requirement is recorded** although the schema demands
   `multiHostRequired: true`, `minimumNodeCount >= 2` and an approver.
6. **A non-AWS placement needs a validation change.** Supporting a non-AWS
   S3-compatible endpoint in STG/PROD means relaxing a deliberate fail-closed check
   in shared configuration, with an equivalent strictness guarantee (distinct
   endpoints, distinct profiles, TLS-only, no static keys). That is shared
   framework work with a real security contract behind it.

## 8. Status summary

| Claim                                                     | Status                                                     |
| --------------------------------------------------------- | ---------------------------------------------------------- |
| Per-environment service selections and declared resources | Computed from the typed catalogues                         |
| DEV/QA run local SeaweedFS; STG/PROD target AWS S3        | Documented in operations reports; STG/PROD not provisioned |
| Production template, preset and region                    | Do not exist                                               |
| Managed-service substitution                              | Analysis only; not designed or approved                    |
| Multi-host production topology                            | Schema exists; no approved artefact                        |
