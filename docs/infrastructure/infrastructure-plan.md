# Athyper Infrastructure v13 — Architecture Overview

**Document status:** v13 — permission-safe (audit fixes applied)
**Supersedes:** v12 staging installation plan (UID/GID collision incident)
**Primary rule:** Source code and runtime state must stay physically separate.

```text
/opt/products/athyper   = git checkout, compose definitions, templates, scripts
/opt/stack/athyper      = runtime config, secrets, data, logs, backups
```

## Runbooks

| Guide | Scope |
|---|---|
| [environments.md](environments.md) | Cross-env comparison — local vs staging vs production matrix, script behavior, profile defaults |
| [staging-setup.md](staging-setup.md) | Ubuntu 22.04/24.04 server — full 26-phase installation runbook (covers staging and production) |
| [local-dev-setup.md](local-dev-setup.md) | Windows workstation — Docker Desktop local development |
| [secrets-management.md](secrets-management.md) | Secrets rotation, backup credentials, key management |
| [weekly-reset-reseed-export.md](weekly-reset-reseed-export.md) | Weekly DB reset, re-seed, export, and restore validation until base completion |

---

## v13 Permission Model

v12 used container numeric IDs directly on host bind mounts (`999:1000`, `1000:1000`,
`1000:1001`). On Ubuntu, `1000` and `1001` are commonly human user IDs — that caused
host/container UID collision and the repeated Redis `dump.rdb Permission denied` incident.

v13 uses named service identities in a reserved range (9100–9105):

| Service family | Linux user | UID | Linux group | GID |
|---|---:|---:|---:|---:|
| Redis cache / jobs | `svc-redis` | `9100` | `svc-redis` | `9100` |
| MinIO | `svc-minio` | `9101` | `svc-minio` | `9101` |
| Grafana | `svc-grafana` | `9102` | `svc-grafana` | `9102` |
| Loki / Tempo | `svc-loki` | `9103` | `svc-loki` | `9103` |
| Prometheus | `svc-prometheus` | `9104` | `svc-prometheus` | `9104` |
| searchcore / analyticsboard / statuswatch | `svc-meili` | `9105` | `svc-meili` | `9105` |

Every service with a host bind-mounted writable data directory must declare a matching
`user: "<uid>:<gid>"` in compose and pass a container canary before first startup.

---

# Part A — Pre-gates Before Touching the Server

## A.1 Code Pre-gates

**EXECUTE ON:** WORKSTATION
**AS:** developer/operator

> **Windows local development:** see [local-dev-setup.md](local-dev-setup.md).
> The phases below are Ubuntu-server-only. Windows developers use `.bat` equivalents
> (same folder as each `.sh`).

| Gate | Required change |
|---|---|
| PG-01 | `compose.sh` resolves `ATHYPER_*_ROOT` variables and exports compose aliases if still needed |
| PG-02 | `setup-config.sh` / `setup-config.bat` deploys config into the runtime config root, supports `--diff` and `--update`, and writes `MANIFEST` |
| PG-03 | `data-dirs-create.sh` is updated for v13 service users/groups, fails hard if not root, and runs write probes (Windows: `data-dirs-create.bat` creates folders only — no chown) |
| PG-04 | Compose files add `user: "910x:910x"` for writable bind-mounted services, or use named volumes for ephemeral services |
| PG-05 | Gateway and logshipper use socket-proxy, not direct `/var/run/docker.sock` |
| PG-06 | Gateway certs mount uses `${ATHYPER_SECRETS_ROOT}/gateway/certs:/certs` |
| PG-07 | `stack/env/.env` is allowed as a non-secret bootstrap file only |
| PG-08 | Every service has `mem_limit` or `deploy.resources.limits.memory` |
| PG-09 | `server/Dockerfile.prod` pins `pnpm@10.33.0`, not `pnpm@latest` |
| PG-10 | Redis cache persistence policy is explicit: cache should use `save ""` and `appendonly no` unless you intentionally want persistence |

## A.2 DNS Pre-gates

**EXECUTE ON:** WORKSTATION
**AS:** DNS admin/operator

Create these records before starting gateway/ACME. Core and app-plane hosts are
required for the first deploy; secondary-profile hosts are required before those
profiles are started in the staging runbook.

| Hostname | Points to |
|---|---|
| `api-stg.athyper.com` | server public IP |
| `neon-stg.athyper.com` | server public IP |
| `mesh-stg.athyper.com` | server public IP |
| `admin-stg.athyper.com` | server public IP |
| `iam-stg.athyper.com` | server public IP |
| `gateway-stg.athyper.com` | server public IP |
| `objectstorage-stg.athyper.com` | server public IP |
| `objectstorage.console-stg.athyper.com` | server public IP |
| `telemetry-stg.athyper.com` | server public IP |
| `metrics-stg.athyper.com` | server public IP |
| `alerts-stg.athyper.com` | server public IP |
| `traces-stg.athyper.com` | server public IP |
| `logs-stg.athyper.com` | server public IP |
| `uptime-stg.athyper.com` | server public IP |
| `healthchecks-stg.athyper.com` | server public IP |
| `errors-stg.athyper.com` | server public IP |
| `meilisearch-stg.athyper.com` | server public IP |
| `metabase-stg.athyper.com` | server public IP, only if `analytics` will be enabled |
| `infisical-stg.athyper.com` | server public IP, only if `security-infisical` will be enabled |

Verify from workstation:

```bash
for host in \
  api-stg.athyper.com \
  neon-stg.athyper.com \
  mesh-stg.athyper.com \
  admin-stg.athyper.com \
  iam-stg.athyper.com \
  gateway-stg.athyper.com \
  objectstorage-stg.athyper.com \
  objectstorage.console-stg.athyper.com \
  telemetry-stg.athyper.com \
  metrics-stg.athyper.com \
  alerts-stg.athyper.com \
  traces-stg.athyper.com \
  logs-stg.athyper.com \
  uptime-stg.athyper.com \
  healthchecks-stg.athyper.com \
  errors-stg.athyper.com \
  meilisearch-stg.athyper.com; do
  echo "=== $host ==="
  dig +short "$host" @1.1.1.1
  dig +short "$host" @8.8.8.8
done
```

All must return the server public IP.

## A.3 Offsite Backup Pre-gate

**EXECUTE ON:** WORKSTATION / cloud console
**AS:** operator

Provision an off-host bucket (S3, B2, Wasabi, or a remote MinIO in a different account/region).

Prepare these values for `.env`:

```text
BACKUP_S3_BUCKET=
BACKUP_S3_ACCESS_KEY=
BACKUP_S3_SECRET_KEY=
BACKUP_S3_ENDPOINT=
BACKUP_S3_REGION=
```

Do not treat `/opt/stack/athyper/backups` or local MinIO on the same server as durable backup.

---

# Part F — Summary of v12 → v13 Changes

1. Status: v12 → v13 permission-safe.
2. Replace all `999:1000`, `1000:1000`, `1000:1001` host ownership with named `svc-*` users/groups.
3. Remove `2751` / setgid from `/opt/stack/athyper/data`; use `0755`.
4. Phase 3 creates directories only — per-service ownership belongs to Phase 11.
5. Phase 11/`data-dirs-create.sh` is the single authority on service data permissions.
6. Add GID pre-check before Phase 2.2 (`groupadd --force` is silent on GID conflict).
7. Data leaf dirs changed from `0770` to `0750` — with `user: "910x:910x"` in compose, the container is the owner; group-write is unnecessary and exposes future group members.
8. Host write probe (Phase 12) and container canary (Phase 13) are mandatory gates before any `up.sh`.
9. MinIO canary exercises `.minio.sys/tmp/...` — the actual code path that failed under v12.
10. Phase 14 compose-render validation is mandatory, not conditional.
11. systemd `sleep 15` replaced with a `until docker info` poll — faster on healthy hosts, more reliable on slow ones.
12. D.7 repair flow includes container canary between host probe and `up.sh`.
13. `redis-acl.conf` mode changed from `0644` to `0640` with group `svc-redis` — contains password hashes, no world-read needed.
14. Phase 2.3 documents why both `usermod` and `SupplementaryGroups=` are required.
