# Athyper Infrastructure — Master Plan
## Permission Model + Staging Deployment

**Status:** v12 — Audit-incorporated; cleared for Phase 0 execution  
**Audit:** Two independent sign-off reviews completed 2026-04-26; all blockers (B1–B8, M1–M5) resolved in this version; tech-debt items T1–T7 tracked in Phase 23  
**Supersedes:** [staging-deploy-runbook.md](staging-deploy-runbook.md), [infrastructure-perms-superseded.md](infrastructure-perms-superseded.md)  
**Environments covered:** Staging (62.169.31.9) — Production uses identical model, different values  
**Rule:** Nothing on the server is touched until every Pre-Gate below is green

---

## The One Rule That Captures Everything

```
/opt/products/athyper   read-mostly   git pull is safe; git cannot reach runtime state
/opt/stack/athyper      read-write    git cannot reach it; treat data/ and secrets/ as precious
```

These two sentences are the entire architectural intent. Print them. Put them at the top of every
ops runbook. A future operator who understands this rule cannot accidentally break the system by
"tidying up" — they will never symlink these two roots together or `git clean` inside `stack/`.

---

# PART 1 — INFRA STACK PERMISSION MODEL: STRUCTURE POINTS

---

## S1. Account Architecture

### S1.1 Accounts Required

| Account | Type | UID | Purpose | Login method |
|---|---|---|---|---|
| `root` | System | 0 | VNC console recovery only | VNC tty (`5.189.174.159:63128`) |
| `athyper` | System service | **9000** | Runs the entire stack via systemd | No SSH (ForceCommand blocks it); reached via `sudo -iu athyper` from a human account |
| `<ops-admin>` | Human operator | auto | Bootstrap, root-owned file writes, `sudo -iu athyper` access | SSH key + `sudo` group |
| `<dev-inspector>` | Human developer | auto | Config inspection, log tailing, container checks | SSH key only; no `sudo` |

**Human role separation:**

| Role | Groups | Can do | Cannot do |
|---|---|---|---|
| `ops-admin` | `sudo`, `athyper-config`, `docker` (if needed, documented) | Anything root requires; switch to `athyper` via `sudo -iu athyper` | Implicit — full sudo means full responsibility |
| `dev-inspector` | `athyper-config`, `docker` (by approval only) | Read config, tail logs, exec into containers | Write config/secrets, systemctl, sudo |

> **No human account gets both `sudo` and `docker` without explicit justification documented.** `docker` group = root-equivalent.

**UID 9000 is pinned** — it must not collide with any container-internal UID. All known container
UIDs in this stack are: 472, 999, 1000, 1001, 10001, 65534. UID 9000 sits above all of them.

### S1.2 Login Policy by Account

| Account | SSH password | SSH key | Shell | `sudo` access |
|---|---|---|---|---|
| `root` | Never (disabled post-bootstrap) | Never (PermitRootLogin no) | N/A | N/A |
| `athyper` | Never (passwd --lock) | Never (ForceCommand /usr/sbin/nologin) | **/bin/bash** | systemctl athyper-* only |
| `<devname>` | Never (PasswordAuthentication no) | Yes | /bin/bash | None |

**Access path for operators needing an athyper shell:**
```
ssh admin@server → sudo -iu athyper → cd /opt/products/athyper
```
Never SSH directly as athyper. Never give athyper a password after the initial bootstrap password is removed.

---

## S2. Group Architecture

| Group | GID | Members | Purpose |
|---|---|---|---|
| `athyper` | 9000 | athyper (primary) | Service account primary group; also group-owner of `secrets/` |
| `athyper-config` | 9001 | athyper, devnames | Read access to `/opt/stack/athyper/config/` |
| `athyper-data` | 9002 | athyper | Traverse access to `/opt/stack/athyper/data/` parent |
| `docker` | auto | athyper, devnames (selective) | Docker CLI access — treat as root-equivalent |
| `sudo` | auto | human admin accounts only | Full sudo access for human operators |

**Rules:**
- `docker` group = root-equivalent on host. Document this clearly. Never add it casually.
- `athyper-data` group does NOT give write access to data leaf dirs — those are owned by container UIDs.
- `athyper-config` covers operator-readable config only. Secrets are not in config/.
- Developers get `athyper-config` for config inspection; not `athyper-data`, not `athyper` group.
- No human account gets both `sudo` + `docker` without explicit justification documented.

---

## S3. Filesystem Layout (frozen — no deviation)

### S3.1 Two Roots — One Rule

```
/opt/products/          Product source code lives here
/opt/stack/             Running stack state lives here
```

If you host a second product on this server in future:
```
/opt/products/athyper/   /opt/products/other-product/
/opt/stack/athyper/      /opt/stack/other-product/
```

### S3.2 Full Path Layout

```
/home/athyper/                              Service account home
  .ssh/
    authorized_keys                         (nologin — kept for future key-based sudo)
    github_deploy_key                       ed25519 private key for git clone/pull
    github_deploy_key.pub                   registered on GitHub → Settings → Deploy keys
    config                                  SSH client config routing to deploy key

/opt/products/athyper/                      Git checkout — source, templates, compose defs
  server/  apps/  packages/  stack/         (identical to D:\Products\athyper\ locally)
  stack/
    compose/                                Docker Compose service definitions
    config/                                 Config TEMPLATES (git-tracked source of truth)
    env/                                    .env templates only (staging.env.example, etc.)
    scripts/                                Lifecycle scripts
    docs/                                   This file lives here

/opt/stack/athyper/                         Runtime root — git cannot reach any of this
  config/             ← operator config     root:athyper-config  755 dirs / 644 files  (containers need +r/:ro mounts)
    apps/
      kernel.config.parameter.json          Deployed from repo template by setup-config.sh
    gateway/
      dynamic/                              Traefik file-provider dir (bind-mounted :ro)
        athyper.api.yml                     API route config
        athyper.tls.yml                     TLS store — operator-edited
        athyper.workbench.yml               Workbench CIDR — operator-edited
    iam/
      realm-demosetup.json
      realm-platform-control.json
      themes/neon/                          (whole dir)
    db/
      local/
        postgresql.conf
        pg_hba.conf
        init-databases.sh
        dbpool/
          pgbouncer-apps.ini
          pgbouncer-auth.ini
          pgbouncer-session.ini
          userlist.txt
    memorycache/
      cache.conf                            (from environments/cache.staging.conf)
      redis-acl.conf
    telemetry/
      logging/
        config.yml                          Loki
        alloy.alloy                         Grafana Alloy — TCP proxy endpoint (not unix socket)
      metrics/
        config.yml                          Prometheus
        governance-alerts.yml
        redis-alerts.yml
        document-registry-alerts.yml
        document-registry-slo.yml
      tracing/
        config.yml                          Tempo
      provisioning/                         Grafana provisioning (dir-copy)
        dashboards/  datasources/
      provisioning.env/
        dashboards.staging.yml              Active on staging
    render/
      gotenberg.conf                        (from environments/gotenberg.staging.conf)
      tika-config.xml                       (from environments/tika-config.staging.xml)

  secrets/            ← sensitive material  root:athyper  750
    .env                                    All env vars + passwords + keys  athyper:athyper 600
    gateway/
      certs/
        acme.json                           ACME account + cert state  root:root 600
        athyper.tls.local.crt              Dev TLS cert (public)      root:athyper 640
        athyper.tls.local.key              Dev TLS private key        root:root 600

  data/               ← persistent volumes  athyper:athyper-data 751 g+s (parent)
    memorycache/                            owner 999:1000   (Redis)
    memorycache-jobs/                       owner 999:1000   (Redis)
    objectstorage/                          owner 1000:1001  (MinIO)
    meilisearch/                            owner 1000:1000
    metabase/                               owner 1000:1000
    uptime-kuma/                            owner 1000:1000
    telemetry/
      logging/                              owner 10001:10001 (Loki)
      metrics/                              owner 65534:65534 (Prometheus)
      observability/                        owner 472:472     (Grafana)
      tracing/                              owner 10001:10001 (Tempo)

  logs/               ← host-side op logs   athyper:athyper 750
    (cron job output, script logs — container logs go to journald via Docker driver)

  backups/            ← dump-and-ship only  athyper:athyper 750
    (pg_dump writes here; cron pushes to MinIO/S3 immediately after)
    (WARNING: not durable — shares disk with data/; hardware failure kills both)

  MANIFEST            ← runtime marker      athyper:athyper 644
    product_root=/opt/products/athyper
    initialized_at=<ISO8601>
    initialized_from_commit=<sha7>
    last_setup_config_run=<ISO8601>
    schema_version=11

/etc/systemd/system/athyper-stack.service
/etc/docker/daemon.json
/etc/ssh/sshd_config.d/athyper.conf
/etc/sudoers.d/athyper
/etc/systemd/journald.conf.d/athyper.conf
/etc/cron.d/athyper-backup
/swapfile                                   8 GB swap
```

### S3.3 Paths That Must NOT Exist

```
/home/products/         ← v10 legacy; never create
/opt/athyper/           ← prior recommendation; never create
/opt/products/ *used as runtime state*  ← repo only, no runtime writes
stack/config/ *as ATHYPER_CONFIG_ROOT on server*  ← local dev only
stack/data/   *as ATHYPER_DATA_ROOT on server*    ← local dev only
stack/env/.env *on server*                         ← never inside the git tree
```

---

## S4. Six Environment Variables

Scripts stop branching on platform — they resolve these vars and don't care whether the value
is `/opt/stack/athyper/data` or `D:\Stack\athyper\data`.

| Variable | Server value | Local Windows value | compose.sh fallback |
|---|---|---|---|
| `ATHYPER_PRODUCT_ROOT` | `/opt/products/athyper` | `D:\Products\athyper` | repo root (3 levels up from lib/) |
| `ATHYPER_CONFIG_ROOT` | `/opt/stack/athyper/config` | `D:\Stack\athyper\config` | `$STACK_DIR/config` |
| `ATHYPER_SECRETS_ROOT` | `/opt/stack/athyper/secrets` | `D:\Stack\athyper\secrets` | `$STACK_DIR/secrets` |
| `ATHYPER_DATA_ROOT` | `/opt/stack/athyper/data` | `D:\Stack\athyper\data` | `$STACK_DIR/data` |
| `ATHYPER_LOG_ROOT` | `/opt/stack/athyper/logs` | `D:\Stack\athyper\logs` | `$STACK_DIR/logs` |
| `ATHYPER_BACKUP_ROOT` | `/opt/stack/athyper/backups` | `D:\Stack\athyper\backups` | `$STACK_DIR/backups` |

**Backwards-compat aliases** set internally in compose.sh (compose bind mounts use these names unchanged):
```bash
ATHYPER_CONFIG="$ATHYPER_CONFIG_ROOT"       # all 45 :ro config bind mounts
ATHYPER_DATA="$ATHYPER_DATA_ROOT"           # all data bind mounts
ENV_FILE="$ATHYPER_SECRETS_ROOT/.env"       # compose --env-file
```
The compose files themselves do not change their `${ATHYPER_CONFIG}` / `${ATHYPER_DATA}` references.
Only `gateway/certs` moves from `${ATHYPER_CONFIG}` to `${ATHYPER_SECRETS_ROOT}` (one compose file).

---

## S5. Ownership Matrix (complete)

| Path | Owner | Group | Mode | Notes |
|---|---|---|---|---|
| `/home/athyper` | athyper | athyper | 700 | Standard home |
| `/home/athyper/.ssh/` | athyper | athyper | 700 | |
| `/home/athyper/.ssh/*` | athyper | athyper | 600 | All key files |
| `/opt/products/athyper/` | athyper | athyper | 755 | Git checkout root |
| `/opt/stack/athyper/` | athyper | athyper | 755 | Stack runtime root |
| `/opt/stack/athyper/config/` | root | athyper-config | 755 | Config tree root; 755 so container processes can traverse |
| `/opt/stack/athyper/config/**/` (dirs) | root | athyper-config | 755 | Containers need +x to traverse bind-mount paths |
| `/opt/stack/athyper/config/**` (files) | root | athyper-config | 644 | Container-readable (:ro mounts); root-owned so immutable |
| `/opt/stack/athyper/config/memorycache/redis-acl.conf` | **athyper** | athyper-config | 644 | Exception: validate-env.sh (runs as athyper) overwrites this on every stack start to render password hashes |
| `/opt/stack/athyper/secrets/` | root | athyper | 750 | Secrets root |
| `/opt/stack/athyper/secrets/.env` | athyper | athyper | **600** | Secrets file |
| `/opt/stack/athyper/secrets/gateway/certs/acme.json` | root | root | **600** | Traefik writes as container-root |
| `/opt/stack/athyper/secrets/gateway/certs/*.crt` | root | athyper | 640 | Public cert |
| `/opt/stack/athyper/secrets/gateway/certs/*.key` | root | root | **600** | Private key |
| `/opt/stack/athyper/data/` | athyper | athyper-data | 751 g+s | Data root; set-GID |
| `/opt/stack/athyper/data/memorycache/` | 999 | 1000 | 750 | Redis |
| `/opt/stack/athyper/data/memorycache-jobs/` | 999 | 1000 | 750 | Redis |
| `/opt/stack/athyper/data/objectstorage/` | 1000 | 1001 | 750 | MinIO |
| `/opt/stack/athyper/data/telemetry/logging/` | 10001 | 10001 | 750 | Loki |
| `/opt/stack/athyper/data/telemetry/metrics/` | 65534 | 65534 | 750 | Prometheus |
| `/opt/stack/athyper/data/telemetry/tracing/` | 10001 | 10001 | 750 | Tempo |
| `/opt/stack/athyper/data/telemetry/observability/` | 472 | 472 | 750 | Grafana |
| `/opt/stack/athyper/data/meilisearch/` | 1000 | 1000 | 750 | |
| `/opt/stack/athyper/data/uptime-kuma/` | 1000 | 1000 | 750 | |
| `/opt/stack/athyper/data/metabase/` | 1000 | 1000 | 750 | |
| `/opt/stack/athyper/logs/` | athyper | athyper | 750 | Host-side op logs |
| `/opt/stack/athyper/backups/` | athyper | athyper | 750 | Dump-and-ship only |
| `/opt/stack/athyper/MANIFEST` | athyper | athyper | 644 | Runtime manifest |
| `/etc/systemd/system/athyper-stack.service` | root | root | 644 | |
| `/etc/docker/daemon.json` | root | root | 644 | |
| `/etc/sudoers.d/athyper` | root | root | **440** | |

---

## S6. Per-Service Container UID/GID Matrix

Verify with `docker run --rm <image> id` after pulling, before running data-dirs-create.sh.
Re-check on every major image version bump — upstream images can shift internal UIDs.

| Service | Image | Host writes as UID | Host GID | Data dir under ATHYPER_DATA_ROOT |
|---|---|---|---|---|
| memorycache | redis:7.4.8-alpine | **999** | 1000 | memorycache/ |
| memorycache-jobs | redis:7.4.8-alpine | **999** | 1000 | memorycache-jobs/ |
| objectstorage | minio/minio:2025-09-07 | **1000** | 1001 | objectstorage/ |
| logging (Loki) | grafana/loki:3.6.10 | **10001** | 10001 | telemetry/logging/ |
| metrics (Prometheus) | prom/prometheus:v3.11.2 | **65534** | 65534 | telemetry/metrics/ |
| tracing (Tempo) | grafana/tempo:2.10.4 | **10001** | 10001 | telemetry/tracing/ |
| telemetry (Grafana) | grafana/grafana:12.4.3 | **472** | 472 | telemetry/observability/ |
| meilisearch | getmeili/meilisearch:v1.13 | **1000** | 1000 | meilisearch/ |
| uptime-kuma | louislam/uptime-kuma:1 | **1000** | 1000 | uptime-kuma/ |
| metabase | (analytics profile) | **1000** | 1000 | metabase/ |
| db (Postgres) | postgres:16.13-bookworm | 999 (user: set) | 999 | named volume — no bind mount |

**Never run `chown -R` on data/ after containers have started.** Individual leaf dirs only, before first start.

---

## S7. Bind Mount Access Classification

### Read-only config mounts — `${ATHYPER_CONFIG}` = `$ATHYPER_CONFIG_ROOT`

All 45 `:ro` config mounts are unchanged. They resolve via the `ATHYPER_CONFIG` alias.

| Service | Container target | Source in config/ |
|---|---|---|
| athyper-api/worker/scheduler | `/config` (whole dir) | `.` (full config root) |
| gateway | `/etc/traefik/dynamic` | `gateway/dynamic/` |
| db | `/etc/postgresql/postgresql.conf` | `db/local/postgresql.conf` |
| db | `/etc/postgresql/pg_hba.conf` | `db/local/pg_hba.conf` |
| db | `/docker-entrypoint-initdb.d/init-databases.sh` | `db/local/init-databases.sh` |
| dbpool-apps | `/etc/pgbouncer/pgbouncer.ini.tpl` | `db/local/dbpool/pgbouncer-apps.ini` |
| dbpool-session | `/etc/pgbouncer/pgbouncer.ini.tpl` | `db/local/dbpool/pgbouncer-session.ini` |
| iam | `/opt/keycloak/themes/neon` | `iam/themes/neon/` |
| iam | `/opt/keycloak/data/import/realm-demosetup.json` | `iam/realm-demosetup.json` |
| iam | `/opt/keycloak/data/import/realm-platform-control.json` | `iam/realm-platform-control.json` |
| memorycache, memorycache_jobs | `/usr/local/etc/redis/redis.conf` | `memorycache/cache.conf` |
| memorycache, memorycache_jobs | `/usr/local/etc/redis/redis-acl.conf` | `memorycache/redis-acl.conf` |
| logging | `/etc/loki/loki.yml` | `telemetry/logging/config.yml` |
| logshipper | `/etc/alloy/config.alloy` | `telemetry/logging/alloy.alloy` |
| metrics | `/etc/prometheus/prometheus.yml` | `telemetry/metrics/config.yml` |
| metrics | `/etc/prometheus/*-alerts.yml` (×3) | `telemetry/metrics/*` |
| telemetry | `/etc/grafana/provisioning` | `telemetry/provisioning/` |
| telemetry (override) | `/etc/grafana/provisioning/dashboards/dashboards.yml` | `telemetry/provisioning.env/dashboards.staging.yml` |
| tracing | `/etc/tempo.yml` | `telemetry/tracing/config.yml` |
| gotenberg | `/etc/athyper/render/gotenberg.conf` | `render/gotenberg.conf` |
| tika | `/config/tika-config.xml` | `render/tika-config.xml` |

### Read-write secrets mount — `${ATHYPER_SECRETS_ROOT}/gateway/certs`

| Service | Container target | Source in secrets/ | Mode |
|---|---|---|---|
| gateway | `/certs` | `gateway/certs/` | rw — Traefik writes acme.json |

**This is the one compose bind mount that uses `ATHYPER_SECRETS_ROOT` instead of `ATHYPER_CONFIG`.**
Update `stack/compose/gateway/athyper-gateway.yml` volumes entry (part of PG-06).

### Read-write data mounts — `${ATHYPER_DATA}` = `$ATHYPER_DATA_ROOT`

| Service | Container target | Data dir |
|---|---|---|
| memorycache | `/data` | memorycache/ |
| memorycache_jobs | `/data` | memorycache-jobs/ |
| objectstorage | `/data` | objectstorage/ |
| logging | `/loki` | telemetry/logging/ |
| metrics | `/prometheus` | telemetry/metrics/ |
| tracing | `/var/tempo` | telemetry/tracing/ |
| telemetry | `/var/lib/grafana` | telemetry/observability/ |
| meilisearch | `/meili_data` | meilisearch/ |
| metabase | `/metabase-data` | metabase/ |
| uptime-kuma | `/app/data` | uptime-kuma/ |

### Docker socket — after PG-04/PG-05

No service mounts `/var/run/docker.sock` directly. Both proxies mount it `:ro` internally.

| Service | Before | After |
|---|---|---|
| gateway | `docker.sock:ro` direct | `tcp://socket-proxy-gateway:2375` |
| logshipper | `docker.sock:ro` direct | `tcp://socket-proxy-logshipper:2375` |

---

## S8. docker.sock Policy

- No application service mounts `/var/run/docker.sock` directly after change.
- `socket-proxy-gateway`: `CONTAINERS=1, NETWORKS=1, SERVICES=1, TASKS=1` — all mutations = 0.
- `socket-proxy-logshipper`: `CONTAINERS=1` only.
- `athyper` in `docker` group: accepted for operational access. This is documented root-equivalent privilege — not a security control.

---

## S9. Sudoers Policy

**Scope — systemctl lifecycle only. docker compose is NOT here (docker group already covers it).**

```
athyper ALL=(root) NOPASSWD:
    /usr/bin/systemctl {start,stop,restart,status,reload} athyper-*
```

- `docker compose *` wildcard: removed — redundant and uncontrollable.
- `NOPASSWD:ALL`: eliminated at day one, never permitted even temporarily.
- Shell escalation (`bash`, `sh`, `su`): not in scope.

---

## S10. SSH Policy

| Setting | Value |
|---|---|
| `PermitRootLogin` | `no` |
| `PasswordAuthentication` | `no` |
| `PubkeyAuthentication` | `yes` |
| `AllowGroups` | `sudo athyper-config` |
| `Match User athyper` | `ForceCommand /usr/sbin/nologin` |

---

## S11. systemd Unit Hardening Flags

| Flag | Value |
|---|---|
| `User` | `athyper` |
| `Group` | `docker` |
| `WorkingDirectory` | `/opt/products/athyper` |
| `NoNewPrivileges` | `yes` |
| `PrivateTmp` | `yes` |
| `ProtectSystem` | `strict` |
| `ReadOnlyPaths` | `/opt/products/athyper /opt/stack/athyper/config /opt/stack/athyper/secrets` |
| `ReadWritePaths` | `/opt/stack/athyper/data /opt/stack/athyper/logs /opt/stack/athyper/backups /home/athyper` |

`/home/athyper` is in `ReadWritePaths` for the docker CLI cache (`~/.docker/`). Without it,
`ProtectSystem=strict` blocks the write and the service fails on first start.

Six `Environment=` overrides (set before any script runs):

```ini
Environment=HOME=/home/athyper
Environment=ATHYPER_PRODUCT_ROOT=/opt/products/athyper
Environment=ATHYPER_CONFIG_ROOT=/opt/stack/athyper/config
Environment=ATHYPER_SECRETS_ROOT=/opt/stack/athyper/secrets
Environment=ATHYPER_DATA_ROOT=/opt/stack/athyper/data
Environment=ATHYPER_LOG_ROOT=/opt/stack/athyper/logs
Environment=ATHYPER_BACKUP_ROOT=/opt/stack/athyper/backups
```

---

## S12. Docker Daemon Settings

| Setting | Value | Reason |
|---|---|---|
| `log-driver` | `journald` | Container logs tagged by name; Alloy reads from journald |
| `log-opts.tag` | `{{.Name}}` | Per-container tag |
| `live-restore` | `true` | Containers survive daemon restart |
| `default-address-pools` | `10.200.0.0/16 size 24` | Avoids 172.17.0.0/16 VPN collision |
| `userland-proxy` | `false` | Kernel NAT per port |
| `no-new-privileges` | `true` | Daemon-wide flag on all containers |

---

## S13. journald Limits

`SystemMaxUse=2G` · `SystemKeepFree=500M` · `MaxRetentionSec=2week`

---

## S14. Compose Project Name (pinned)

`COMPOSE_PROJECT_NAME=athyper` must be in every `.env` file and in `constants.sh` as the fallback.

Container names, network names, and named volume names all derive from this value.
A missing or drifted project name produces `athyper_db_data` on day one and `repo_db_data`
on day forty after someone runs `docker compose` from a different working directory.

---

## S15. Backups — Staging Area Only

`/opt/stack/athyper/backups/` is NOT a durable backup destination.

- It shares the same disk as `data/`.
- A single hardware failure or `rm -rf /opt/stack/athyper` destroys both.
- Scripts write dumps here, then a cron pushes immediately to a **remote** MinIO / S3 / off-host target.
- A file existing in `backups/` does not mean it is safe.
- **A backup is durable only after it lands in remote S3, remote MinIO, or an off-host target.** Local MinIO on the same server is not durable — it shares the same failure domain as `data/`.

---

## S16. Immutable Rules — Never Break

1. **Never `chown -R` the data tree after containers have run.** Individual leaf dirs only, before first start.
2. **Never put secrets inside the git checkout on the server.** `.env` lives at `ATHYPER_SECRETS_ROOT/.env`.
3. **Never grant `NOPASSWD:ALL` in sudoers** — not even temporarily during initial setup.
4. **Never SSH as root** after bootstrap. VNC tty only.
5. **Never mount docker.sock directly** to gateway or logshipper. socket-proxy only.
6. **Never `git clean -fd`** inside `/opt/products/athyper` without checking `git status` first.
7. **Never auto-update operator-managed config** (`gateway/dynamic/*.yml`, `secrets/.env`, `secrets/gateway/certs/acme.json`).
8. **Never re-use `chown -R` after containers start.** Breaks Grafana (472), Prometheus (65534), Loki/Tempo (10001).
9. **Never treat `backups/` as durable.** Only a file in MinIO/S3 is safe.
10. **Never symlink `/opt/products/athyper` and `/opt/stack/athyper` together.** They exist on different lifecycles by design.
11. **Every application/infra service must have `mem_limit` set in compose.** 24 GB RAM + 25 containers including Loki, Keycloak (JVM), Prometheus (TSDB) — one runaway OOM can take down the host. The 8 GB swap masks unbounded memory growth rather than solving it.

---

# PART 2 — STAGING DEPLOYMENT: DETAILED PLAN

**All Pre-Gates must be green before Phase 0 begins.**

---

## Pre-Gate 0: Code Changes — In Repo, CI Green

| # | File | Change |
|---|---|---|
| PG-01 | `stack/scripts/lib/compose.sh` | Replace 3 hardcoded vars with 6 env-var overrides + backwards-compat aliases |
| PG-02 | `stack/scripts/setup/setup-config.sh` | Full rewrite: FILE_MAP, copy_if_absent, --diff, --update, MANIFEST write, staging env-variant copies |
| PG-03 | `stack/scripts/setup/data-dirs-create.sh` | Add per-service chown block gated on `/opt/*` absolute path |
| PG-04 | `stack/compose/security/athyper-socket-proxy-gateway.yml` | New file — tecnativa/docker-socket-proxy for Traefik |
| PG-05 | `stack/compose/security/athyper-socket-proxy-logshipper.yml` | New file — tecnativa/docker-socket-proxy for Alloy |
| PG-06 | `stack/compose/gateway/athyper-gateway.yml` | Remove `docker.sock` volume; change `DOCKER_HOST=tcp://socket-proxy-gateway:2375`; change certs volume to `${ATHYPER_SECRETS_ROOT}/gateway/certs:/certs` |
| PG-07 | `stack/compose/telemetry/athyper-logshipper.yml` | Remove `docker.sock` volume; add `DOCKER_HOST=tcp://socket-proxy-logshipper:2375` |
| PG-08 | `stack/scripts/lib/compose.sh` `build_compose_file_list()` | Add both socket-proxy compose files before gateway entry |
| PG-09 | `stack/config/telemetry/logging/alloy.alloy` | Change docker socket from `unix:///var/run/docker.sock` to `tcp://socket-proxy-logshipper:2375` |
| PG-10 | `stack/env/staging.env.example` | Add `COMPOSE_PROJECT_NAME=athyper`; add `ATHYPER_*_ROOT` var comments |

### PG-01 detail — compose.sh replacement block

```bash
# Replace lines 35–42:

STACK_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE_DIR="$STACK_DIR/compose"

# Six env vars — server sets via systemd Environment=; local dev falls through to defaults
export ATHYPER_PRODUCT_ROOT="${ATHYPER_PRODUCT_ROOT:-$(cd "$STACK_DIR/.." && pwd)/$(basename "$(cd "$STACK_DIR/.." && pwd)")}"
export ATHYPER_CONFIG_ROOT="${ATHYPER_CONFIG_ROOT:-$STACK_DIR/config}"
export ATHYPER_SECRETS_ROOT="${ATHYPER_SECRETS_ROOT:-$STACK_DIR/secrets}"
export ATHYPER_DATA_ROOT="${ATHYPER_DATA_ROOT:-$STACK_DIR/data}"
export ATHYPER_LOG_ROOT="${ATHYPER_LOG_ROOT:-$STACK_DIR/logs}"
export ATHYPER_BACKUP_ROOT="${ATHYPER_BACKUP_ROOT:-$STACK_DIR/backups}"

# Backwards-compat aliases — compose bind mounts use these unchanged
export ATHYPER_CONFIG="$ATHYPER_CONFIG_ROOT"
export ATHYPER_DATA="$ATHYPER_DATA_ROOT"
ENV_FILE="${ATHYPER_SECRETS_ROOT}/.env"
```

### PG-02 detail — setup-config.sh additions (beyond prior FILE_MAP)

Additional items vs prior version:
- `memorycache/environments/cache.staging.conf` → `memorycache/cache.conf` (staging variant)
- `render/environments/gotenberg.staging.conf` → `render/gotenberg.conf`
- `render/environments/tika-config.staging.xml` → `render/tika-config.xml`
- `db/local/dbpool/pgbouncer-auth.ini` → `db/local/dbpool/pgbouncer-auth.ini`
- `db/local/dbpool/userlist.txt` → `db/local/dbpool/userlist.txt`
- `telemetry/metrics/document-registry-slo.yml` → `telemetry/metrics/document-registry-slo.yml`
- Write `MANIFEST` file after all copies complete

MANIFEST write (append to end of setup-config.sh):
```bash
MANIFEST="$STACK_ROOT/MANIFEST"
COMMIT=$(git -C "$REPO" rev-parse --short HEAD 2>/dev/null || echo "unknown")
cat > "$MANIFEST" << EOF
product_root=$REPO
initialized_at=$(date -Iseconds)
initialized_from_commit=$COMMIT
last_setup_config_run=$(date -Iseconds)
schema_version=11
EOF
chmod 644 "$MANIFEST"
echo "  MANIFEST written: $MANIFEST"
```

---

## Pre-Gate 1: DNS Records

### Critical (block startup if missing — Let's Encrypt rate-limits on failure):

| Hostname | IP | ☑ |
|---|---|---|
| `api-stg.athyper.com` | `62.169.31.9` | ☐ |
| `neon-stg.athyper.com` | `62.169.31.9` | ☐ |
| `iam-stg.athyper.com` | `62.169.31.9` | ☐ |
| `gateway-stg.athyper.com` | `62.169.31.9` | ☐ |
| `objectstorage-stg.athyper.com` | `62.169.31.9` | ☐ |
| `objectstorage.console-stg.athyper.com` | `62.169.31.9` | ☐ |

### Secondary (verify before Phase 17, not blocking Phase 0):

`telemetry-stg` · `metrics-stg` · `traces-stg` · `logs-stg` · `uptime-stg` · `healthchecks-stg` · `errors-stg` · `meilisearch-stg` — all → `62.169.31.9`

---

## Pre-Gate 2: Prerequisites Confirmed

| # | Item | ☑ |
|---|---|---|
| PG2-01 | BACKUP_RUN_CMD tested on dev and recorded | ☐ |
| PG2-02 | `restore-db.sh <db_name> <backup_id>` signature verified | ☐ |
| PG2-03 | `grep -c IAM_CLIENT_SECRET stack/config/iam/realm-demosetup.json` result recorded | ☐ |
| PG2-04 | `CLIENT_WITH_SECRET` confirmed (`athyper-api` or `athyper-api-runtime`) | ☐ |
| PG2-05 | VNC console `5.189.174.159:63128` verified accessible | ☐ |
| PG2-06 | Root password from Contabo panel saved in vault | ☐ |
| PG2-07 | Prepared-by and Reviewed-by sign-off complete | ☐ |
| PG2-08 | All PG-01 through PG-10 merged and CI green | ☐ |
| PG2-09 | All 6 critical DNS A records on both 1.1.1.1 and 8.8.8.8 | ☐ |
| PG2-10 | **Offsite backup target provisioned** — external S3/B2/Wasabi bucket in a separate account/region; credentials added to `.env` (`BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY`, `BACKUP_S3_SECRET_KEY`, `BACKUP_S3_ENDPOINT`) | ☐ |

---

## Phase 0: Server Pre-flight

> **▶ EXECUTE ON:** `SERVER` &nbsp;&nbsp; **AS:** `root`
> Access: initial root SSH provided by Contabo panel, or VNC console `5.189.174.159:63128`

```bash
# ── 0.1 Hardware checks ──────────────────────────────────────────────────────
free -h          # Mem: row — confirm 24 GB+
df -h /          # Avail column — confirm 190 GB+
nproc            # confirm 8 cores

# ── 0.2 Clock sync ───────────────────────────────────────────────────────────
timedatectl set-ntp true
timedatectl      # confirm: NTP service: active
                 #          System clock synchronized: yes

# ── 0.3 Swap (8 GB) ──────────────────────────────────────────────────────────
fallocate -l 8G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
swapon --show    # confirm: /swapfile  file  8G  0B   -2

# Persist swap across reboots
echo '/swapfile none swap sw 0 0' >> /etc/fstab
grep swapfile /etc/fstab   # confirm line is present

# ── 0.4 Kernel tuning ────────────────────────────────────────────────────────
# vm.swappiness     — prefer RAM over swap; defer swap until memory pressure
# vm.overcommit_memory=1 — required by Redis: prevents background save failures
#   under low memory. Without this Redis logs a WARNING on every start.
cat > /etc/sysctl.d/99-athyper.conf << 'EOF'
vm.swappiness=10
vm.overcommit_memory=1
EOF

sysctl --system  # confirm: Applying /etc/sysctl.d/99-athyper.conf ...
                 # confirm: vm.swappiness = 10
                 # confirm: vm.overcommit_memory = 1

# Verify final values
sysctl vm.swappiness vm.overcommit_memory
```

| Step | Gate |
|---|---|
| 0.1 | `free -h` Mem row ≥ 24G; `df -h /` Avail ≥ 190G; `nproc` = 8 |
| 0.2 | `timedatectl` shows `System clock synchronized: yes` |
| 0.3 | `swapon --show` shows `/swapfile file 8G`; `grep swapfile /etc/fstab` returns line |
| 0.4 | `sysctl vm.swappiness vm.overcommit_memory` returns `10` and `1` |

---

## Phase 1: System Packages

> **▶ EXECUTE ON:** `SERVER` &nbsp;&nbsp; **AS:** `root`
> Access: `ssh root@62.169.31.9` (Contabo initial SSH) — or root from VNC if SSH not yet hardened

### 1.1 — System update

```bash
apt update && apt upgrade -y
apt install -y curl git jq htop fail2ban postgresql-client unzip ca-certificates gnupg lsb-release
```

Verify: `jq --version` · `psql --version`

---

### 1.2 — Docker Engine (official apt repo — NOT the snap package)

```bash
# Add Docker's official GPG key and repo
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Enable + start
systemctl enable --now docker
```

Verify:
```bash
docker --version          # Docker 27.x or later
docker compose version    # Docker Compose version v2.x  — note: no hyphen
docker run --rm hello-world
```

> **Why not snap?** Snap Docker runs in a strict confinement that conflicts
> with `/opt/stack/athyper` bind mounts and breaks the journald log driver.

---

### 1.3 — Node.js 24 LTS (via NodeSource)

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs
```

Verify:
```bash
node --version    # v24.x.x
npm --version
```

---

### 1.4 — pnpm 10 (via Corepack — ships with Node 24)

```bash
corepack enable
corepack prepare pnpm@10.33.0 --activate
```

Verify:
```bash
pnpm --version    # 10.33.0
```

> Corepack pins the exact pnpm version so `pnpm install --frozen-lockfile`
> in Phase 11 uses the same binary as the workstation that generated
> `pnpm-lock.yaml`. Avoid `npm install -g pnpm` here — it installs latest
> which may drift from the lockfile format.

---

### 1.5 — fail2ban (SSH brute-force protection)

```bash
# /etc/fail2ban/jail.local
cat > /etc/fail2ban/jail.local << 'EOF'
[sshd]
enabled  = true
maxretry = 5
bantime  = 3600
findtime = 600
EOF

systemctl enable --now fail2ban
```

Verify: `fail2ban-client status sshd`

---

### 1.6 — Rotate bootstrap password

Contabo sends a root password by email. Change it immediately and record the
new value in the team password vault:

```bash
passwd root       # enter and confirm new password
# Then save the value in vault — never leave the Contabo default active
```

---

## Phase 2: Groups and User Account

> **▶ EXECUTE ON:** `SERVER` &nbsp;&nbsp; **AS:** `root`

| Step | Command | Verify |
|---|---|---|
| 2.1 | `groupadd --force --gid 9000 athyper` | `getent group athyper` |
| 2.2 | `groupadd --force --gid 9001 athyper-config` | `getent group athyper-config` |
| 2.3 | `groupadd --force --gid 9002 athyper-data` | `getent group athyper-data` |
| 2.4 | `useradd --system --uid 9000 --gid 9000 --create-home --home-dir /home/athyper --shell /bin/bash athyper` | `id athyper` shows uid=9000 |
| 2.5 | `passwd --lock athyper` | `passwd -S athyper` shows L |
| 2.6 | `usermod -aG docker,athyper-config,athyper-data athyper` | `groups athyper` shows all |
| 2.7a | **ops-admin**: `adduser --gecos "Name" devname` + `usermod -aG sudo,docker,athyper-config devname` | `id devname` shows sudo + docker + athyper-config |
| 2.7b | **dev-inspector**: `adduser --gecos "Name" devname` + `usermod -aG athyper-config devname` | `id devname` shows athyper-config only |
| 2.8 | Install developer SSH public keys (see detail below) | `cat /home/devname/.ssh/authorized_keys` is non-empty |

**Step 2.8 detail — SSH key install (example: `nchandravel-atlas`)**

Run on the **local machine (Windows)** to get the public key:

```powershell
# PowerShell or Git Bash
type $env:USERPROFILE\.ssh\id_ed25519.pub
# or in Git Bash:
cat ~/.ssh/id_ed25519.pub
# prints something like: ssh-ed25519 AAAA... user@host
```

If no key exists yet, generate one first:

```powershell
ssh-keygen -t ed25519 -C "nchandravel@atlasdigitaltech.com"
# accept default path; set a passphrase when prompted
type $env:USERPROFILE\.ssh\id_ed25519.pub
```

Run on the **server as root**:

```bash
# 1. Create .ssh directory with correct permissions
mkdir -p /home/nchandravel-atlas/.ssh
chmod 700 /home/nchandravel-atlas/.ssh

# 2. Create authorized_keys file and install the public key
touch /home/nchandravel-atlas/.ssh/authorized_keys
chmod 600 /home/nchandravel-atlas/.ssh/authorized_keys
echo "ssh-ed25519 AAAA...paste-full-key-here..." >> /home/nchandravel-atlas/.ssh/authorized_keys

# 3. Fix ownership
chown -R nchandravel-atlas:nchandravel-atlas /home/nchandravel-atlas/.ssh
```

Verify on the **server**:

```bash
cat /home/nchandravel-atlas/.ssh/authorized_keys
# must show the full public key on one line

ls -la /home/nchandravel-atlas/.ssh/
# .ssh dir: drwx------ (700)  authorized_keys: -rw------- (600)  owner: nchandravel-atlas
```

Test SSH login from the **local machine** before closing the root session:

```bash
ssh nchandravel-atlas@<server-ip>
# expect shell prompt — not a password prompt
```

> Repeat steps 2.7–2.8 for each additional developer, substituting their username and public key.

---

## Phase 3: Two-Root Directory Tree

> **▶ EXECUTE ON:** `SERVER` &nbsp;&nbsp; **AS:** `root`

```bash
# Product root — git checkout destination
mkdir -p /opt/products/athyper

# Stack runtime root — six sub-trees
mkdir -p /opt/stack/athyper/{config,secrets,data,logs,backups}

# Config subdirs
mkdir -p /opt/stack/athyper/config/{apps,iam/themes,memorycache,render,telemetry}
mkdir -p /opt/stack/athyper/config/gateway/dynamic
mkdir -p /opt/stack/athyper/config/db/local/dbpool
mkdir -p /opt/stack/athyper/config/telemetry/{logging,metrics,tracing,provisioning}
mkdir -p /opt/stack/athyper/config/telemetry/provisioning.env

# Secrets subdirs
mkdir -p /opt/stack/athyper/secrets/gateway/certs

# Data subdirs (leaf dirs get per-service ownership in Phase 10)
mkdir -p /opt/stack/athyper/data/{memorycache,memorycache-jobs,objectstorage,meilisearch,metabase,uptime-kuma}
mkdir -p /opt/stack/athyper/data/telemetry/{logging,metrics,observability,tracing}
```

### Ownership — apply in this exact order

```bash
# Product root
chown -R athyper:athyper /opt/products/athyper
chmod 755 /opt/products/athyper

# Stack root
chown athyper:athyper /opt/stack/athyper
chmod 755 /opt/stack/athyper

# Config tree — root owns; 755/644 so container processes (UID 999 etc.) can traverse
# dirs and read mounted :ro files. Applied automatically by setup-config.sh.
chown -R root:athyper-config /opt/stack/athyper/config
find /opt/stack/athyper/config -type d -exec chmod 755 {} \;
find /opt/stack/athyper/config -type f -exec chmod 644 {} \;

# Secrets tree — root owns, athyper (primary group) traverses
chown -R root:athyper /opt/stack/athyper/secrets
chmod 750 /opt/stack/athyper/secrets
chmod 750 /opt/stack/athyper/secrets/gateway
chmod 750 /opt/stack/athyper/secrets/gateway/certs

# secrets/.env — athyper owns, 600
touch /opt/stack/athyper/secrets/.env
chown athyper:athyper /opt/stack/athyper/secrets/.env
chmod 600 /opt/stack/athyper/secrets/.env

# acme.json — root:root 600 (Traefik as container-root writes it)
touch /opt/stack/athyper/secrets/gateway/certs/acme.json
chown root:root /opt/stack/athyper/secrets/gateway/certs/acme.json
chmod 600 /opt/stack/athyper/secrets/gateway/certs/acme.json

# Data parent — athyper owns, 2751 (set-GID 751): group inherits on new files
chown athyper:athyper-data /opt/stack/athyper/data
chmod 2751 /opt/stack/athyper/data

# Per-service data dirs (DO NOT recurse after containers start)
chown 999:1000   /opt/stack/athyper/data/memorycache
chown 999:1000   /opt/stack/athyper/data/memorycache-jobs
chown 1000:1001  /opt/stack/athyper/data/objectstorage
chown 10001:10001 /opt/stack/athyper/data/telemetry/logging
chown 65534:65534 /opt/stack/athyper/data/telemetry/metrics
chown 10001:10001 /opt/stack/athyper/data/telemetry/tracing
chown 472:472    /opt/stack/athyper/data/telemetry/observability
chown 1000:1000  /opt/stack/athyper/data/meilisearch
chown 1000:1000  /opt/stack/athyper/data/uptime-kuma
chown 1000:1000  /opt/stack/athyper/data/metabase

# chmod leaf dirs to 750 (mindepth 1 avoids touching the data root itself)
find /opt/stack/athyper/data -mindepth 1 -maxdepth 3 -type d -exec chmod 750 {} \;

# Reassert data root after leaf chmod (find above would have reset it to 750)
chmod 2751 /opt/stack/athyper/data

# Logs and backups
chown athyper:athyper /opt/stack/athyper/logs
chown athyper:athyper /opt/stack/athyper/backups
chmod 750 /opt/stack/athyper/logs /opt/stack/athyper/backups

# Verification
# Config dirs are 755 and files are 644 (world-readable by design — containers need
# +r to read :ro bind mounts). Only the secrets tree must have nothing world-readable.
find /opt/stack/athyper/secrets -perm /o+r -ls
# Must return nothing (empty output)

# Confirm config tree modes
find /opt/stack/athyper/config -type d ! -perm 755 -ls
# Must return nothing — all config dirs should be 755
find /opt/stack/athyper/config -type f ! -perm 644 -ls
# Must return nothing at Phase 3 (no files exist yet; setup-config.sh in Phase 7 populates them)
```

---

## Phase 4: System Hardening

> **▶ EXECUTE ON:** `SERVER` &nbsp;&nbsp; **AS:** `root`
> ⚠️ Step 4.6 — **test SSH key login as devname** before disabling password auth. If the key test fails, do NOT proceed — you will lock yourself out.

| Step | Action | Verify |
|---|---|---|
| 4.1 | Write `/etc/docker/daemon.json` (journald, live-restore, address-pools, no userland-proxy) | `docker info \| grep "Logging Driver"` → journald |
| 4.2 | `systemctl restart docker` | `docker ps` works |
| 4.3 | Write `/etc/systemd/journald.conf.d/athyper.conf` (SystemMaxUse=2G, MaxRetentionSec=2week) | `systemctl restart systemd-journald` |
| 4.4 | Write `/etc/ssh/sshd_config.d/athyper.conf` per S10 | `sshd -t` passes |
| 4.5 | `systemctl reload sshd` | |
| 4.6 | **Test SSH key login as devname NOW — before disabling password** | Shell prompt |
| 4.7 | Write `/etc/sudoers.d/athyper` per S9 with `chmod 440` | `visudo -c -f /etc/sudoers.d/athyper` |
| 4.8 | `grep -r NOPASSWD:ALL /etc/sudoers*` | Must return nothing |

---

## Phase 5: SSH Key Infrastructure

> **▶ EXECUTE ON:** `SERVER` &nbsp;&nbsp; **AS:** `athyper`
> Switch: `ssh <devname>@62.169.31.9` → `sudo -iu athyper`
> ⚠️ **Step 5.4 is WORKSTATION only** — register the deploy key on GitHub from your local browser/machine, then return to the server for step 5.5.

| Step | Action | Verify |
|---|---|---|
| 5.1 | `ssh-keygen -t ed25519 -C "athyper-staging-deploy-key" -f /home/athyper/.ssh/github_deploy_key -N ""` | Key pair at `/home/athyper/.ssh/` |
| 5.2 | Write `/home/athyper/.ssh/config` routing github.com to deploy key | `chmod 600` |
| 5.3 | `cat /home/athyper/.ssh/github_deploy_key.pub` | |
| 5.4 | **[WORKSTATION]** GitHub → repo Settings → Deploy keys → Add → Read-only | |
| 5.5 | `ssh -T git@github.com` | "Hi atlasdigitaltech/athyper! You've successfully authenticated…" |

---

## Phase 6: Repository Clone

> **▶ EXECUTE ON:** `SERVER` &nbsp;&nbsp; **AS:** `athyper`
> Switch: `ssh <devname>@62.169.31.9` → `sudo -iu athyper`

| Step | Action | Verify |
|---|---|---|
| 6.1 | `git clone --branch feature/finance-core git@github.com:atlasdigitaltech/athyper.git /opt/products/athyper` | |
| 6.2 | `ls /opt/products/athyper/stack/compose/compose.yml` | Must exist |
| 6.3 | Verify PG-01: `grep "ATHYPER_CONFIG_ROOT:-" /opt/products/athyper/stack/scripts/lib/compose.sh` | Must match |
| 6.4 | Verify PG-06: `grep "ATHYPER_SECRETS_ROOT" /opt/products/athyper/stack/compose/gateway/athyper-gateway.yml` | Must match |
| 6.5 | Verify no direct docker.sock: `grep "docker.sock" /opt/products/athyper/stack/compose/gateway/athyper-gateway.yml` | Must return nothing |
| 6.6 | Record SHA: `git -C /opt/products/athyper rev-parse HEAD` → `~/deploy-record.txt (600)` | |
| 6.7 | Tag: `git -C /opt/products/athyper tag staging-deploy-$(date +%Y%m%d-%H%M)-<sha7>` | |
| 6.8 | Patch Dockerfile.prod pnpm pin (until upstream PR merged): `sed -i 's/pnpm@latest/pnpm@10.33.0/' server/Dockerfile.prod` | `grep "pnpm@10.33.0" server/Dockerfile.prod` |

---

## Phase 7: Config Deploy

> **▶ EXECUTE ON:** `SERVER` &nbsp;&nbsp; **AS:** `root`
> `config/` is owned `root:athyper-config` — only root can write. Run this phase as root.
> `setup-config.sh` applies ownership and permissions automatically at the end of each run — no separate chmod step is needed.

### 7.1 — Verify container UIDs match the S6 table

Run this **before** Phase 10. If any UID differs, update the chown block in `data-dirs-create.sh` first.

```bash
docker run --rm redis:7.4.8-alpine id              # uid=999(redis) gid=1000(redis)
docker run --rm minio/minio id                     # uid=1000(minio) gid=1001(minio)
docker run --rm grafana/loki id                    # uid=10001(loki) gid=10001(loki)
docker run --rm grafana/tempo id                   # uid=10001(tempo) gid=10001(tempo)
docker run --rm prom/prometheus id                 # uid=65534(nobody) gid=65534(nobody)
docker run --rm grafana/grafana id                 # uid=472(grafana) gid=472(grafana)
docker run --rm postgres:16.13-bookworm id         # uid=999(postgres) gid=999(postgres)
```

### 7.2 — Deploy config files

```bash
cd /opt/products/athyper

sudo ATHYPER_CONFIG_ROOT=/opt/stack/athyper/config \
     ATHYPER_SECRETS_ROOT=/opt/stack/athyper/secrets \
  bash stack/scripts/setup/setup-config.sh staging
```

Expected output (last lines):
```
  COPIED  memorycache/redis-acl.conf
  COPIED  memorycache/cache.conf
  ...
Locking config tree permissions...
  owner: root:athyper-config  dirs: 755  files: 644
  owner: athyper:athyper-config  /opt/stack/athyper/config/memorycache/redis-acl.conf  (validate-env.sh write exception)

MANIFEST updated: /opt/stack/athyper/MANIFEST

Done. Run with --diff to check for future drift.
```

> **Why `redis-acl.conf` gets a different owner:** `validate-env.sh` (which runs as `athyper`, not root) overwrites this file before every stack start to render SHA-256 password hashes from the `.env`. Giving `athyper` ownership of this one file lets it do so while everything else stays `root`-owned.

### 7.3 — Verify

```bash
# Staging CIDR patch applied
grep "0.0.0.0/0" /opt/stack/athyper/config/gateway/dynamic/athyper.workbench.yml

# acme.json untouched
stat -c "%U:%G %a" /opt/stack/athyper/secrets/gateway/certs/acme.json
# expect: root:root 600

# Secrets not world-readable
find /opt/stack/athyper/secrets -perm /o+r -ls
# expect: (empty — no output)

# redis-acl.conf has correct owner
stat -c "%U:%G %a" /opt/stack/athyper/config/memorycache/redis-acl.conf
# expect: athyper:athyper-config 644

# MANIFEST written
cat /opt/stack/athyper/MANIFEST
```

---

## Phase 8: Secrets — Populate `.env`

> **▶ EXECUTE ON:** `SERVER` &nbsp;&nbsp; **AS:** `athyper`
> Switch: `ssh <devname>@62.169.31.9` → `sudo -iu athyper`
> ⚠️ Run `unset HISTFILE` (step 8.1) **before** typing any secret values — prevents them landing in bash history.

| Step | Action |
|---|---|
| 8.1 | `unset HISTFILE && set +o history` |
| 8.2 | Generate all secrets to `~/secrets-staging.txt (600)` via `openssl rand` |
| 8.3 | `nano /opt/stack/athyper/secrets/.env` |
| 8.4 | Confirm key values: |
| | `ENVIRONMENT=staging` |
| | `COMPOSE_PROJECT_NAME=athyper` |
| | `ATHYPER_CONFIG_ROOT=/opt/stack/athyper/config` |
| | `ATHYPER_SECRETS_ROOT=/opt/stack/athyper/secrets` |
| | `ATHYPER_DATA_ROOT=/opt/stack/athyper/data` |
| | `ATHYPER_LOG_ROOT=/opt/stack/athyper/logs` |
| | `ATHYPER_BACKUP_ROOT=/opt/stack/athyper/backups` |
| | `DB_HOST=db` (not external hostname) |
| | `DBPOOL_APPS_CONFIG=db/local/dbpool/pgbouncer-apps.ini` |
| | `DBPOOL_SESSION_CONFIG=db/local/dbpool/pgbouncer-session.ini` |
| | `ACME_EMAIL=ops@atlasdigitaltech.com` |
| 8.5 | `set -o history && export HISTFILE=~/.bash_history` |

---

## Phase 9: Environment Validation

> **▶ EXECUTE ON:** `SERVER` &nbsp;&nbsp; **AS:** `athyper`
> Switch: `ssh <devname>@62.169.31.9` → `sudo -iu athyper`

> `validate-env.sh` does more than validate — it also **renders** `redis-acl.conf` in-place by substituting all `__*_HASH__` tokens with SHA-256 hashes computed from the password vars in `.env`. This must run before the stack starts. The rendered file is owned by `athyper` (set in Phase 7) and is set to `644` so the memorycache container can read it via its `:ro` bind mount.

```bash
# 9.1 — Confirm no unfilled placeholders remain in .env
grep -cE '<fill|__________|from secrets' /opt/stack/athyper/secrets/.env
# Must return 0

# 9.2 — Run validation (renders redis-acl.conf as a side-effect)
bash /opt/products/athyper/stack/scripts/setup/validate-env.sh \
  /opt/stack/athyper/secrets/.env
# Must exit 0, final line: RESULT: PASSED — all checks OK

# 9.3 — Confirm redis-acl.conf was rendered (no template tokens remain)
grep -E '__(APP|EXPORTER|GLITCHTIP|INFISICAL|ADMIN)_HASH__' \
  /opt/stack/athyper/config/memorycache/redis-acl.conf
# Must return (empty — no output)

# 9.4 — Confirm redis-acl.conf is readable by containers
stat -c "%U:%G %a" /opt/stack/athyper/config/memorycache/redis-acl.conf
# expect: athyper:athyper-config 644
```

---

## Phase 10: Data Directories — Server-side Ownership

> **▶ EXECUTE ON:** `SERVER` &nbsp;&nbsp; **AS:** `root`
> Exit the athyper shell (`exit` twice) back to root, or open a new root session.

> ⚠️ **Critical:** The script's chown block only executes when **both** conditions are true:
> 1. It is run as `root` (`id -u == 0`)
> 2. `ATHYPER_DATA_ROOT` starts with `/opt/`
>
> If either is missing the script still exits 0 but silently skips ownership — data dirs stay owned by whoever ran the script, and every container that needs to write to a bind-mounted data dir will fail with `permission denied` at startup.

```bash
# Run as root with ATHYPER_DATA_ROOT inline — single command, no export needed
sudo ATHYPER_DATA_ROOT=/opt/stack/athyper/data \
  bash /opt/products/athyper/stack/scripts/setup/data-dirs-create.sh
```

Expected output (confirms chown block ran):
```
Setting per-service data dir ownership (server mode)...
Per-service ownership set. Verify with: ls -lan /opt/stack/athyper/data
Recheck UID matrix before every major image version bump.
```

If you do NOT see "Setting per-service data dir ownership" — you are not running as root. Re-run with `sudo`.

```bash
# ── Full verification ────────────────────────────────────────────────────────
ls -lan /opt/stack/athyper/data/
ls -lan /opt/stack/athyper/data/telemetry/

# Expected ownership per service:
stat -c "%U:%G %a %n" /opt/stack/athyper/data/memorycache
# 999:1000 750

stat -c "%U:%G %a %n" /opt/stack/athyper/data/memorycache-jobs
# 999:1000 750

stat -c "%U:%G %a %n" /opt/stack/athyper/data/objectstorage
# 1000:1001 750

stat -c "%U:%G %a %n" /opt/stack/athyper/data/meilisearch
# 1000:1000 750

stat -c "%U:%G %a %n" /opt/stack/athyper/data/uptime-kuma
# 1000:1000 750

stat -c "%U:%G %a %n" /opt/stack/athyper/data/metabase
# 1000:1000 750

stat -c "%U:%G %a %n" /opt/stack/athyper/data/telemetry/logging
# 10001:10001 750

stat -c "%U:%G %a %n" /opt/stack/athyper/data/telemetry/tracing
# 10001:10001 750

stat -c "%U:%G %a %n" /opt/stack/athyper/data/telemetry/metrics
# 65534:65534 750

stat -c "%U:%G %a %n" /opt/stack/athyper/data/telemetry/observability
# 472:472 750
```

> ⚠️ **Never run `chown -R` on the data tree after containers have started.** Each service writes files inside its data dir as its own UID. A recursive chown would change ownership of those files, breaking the service on next restart. The script only chowns the leaf dirs themselves (not `-R`), which is safe even after first start.

---

## Phase 11: Image Build

> **▶ EXECUTE ON:** `SERVER` &nbsp;&nbsp; **AS:** `athyper`
> Switch: `ssh <devname>@62.169.31.9` → `sudo -iu athyper`

| Step | Action | Verify |
|---|---|---|
| 11.1 | `cd /opt/products/athyper && pnpm install --frozen-lockfile` | Exit 0 |
| 11.2 | Build all 4 app images: `docker compose ... build athyper-neon-web athyper-api athyper-worker athyper-scheduler` | All 4 present in `docker images` |

---

## Phase 12: Infrastructure Tier Startup

> **▶ EXECUTE ON:** `SERVER` &nbsp;&nbsp; **AS:** `athyper`
> Switch: `ssh <devname>@62.169.31.9` → `sudo -iu athyper`

Start in dependency order. Verify health before next group.

> ⚠️ **Before starting:** confirm every service in compose has `mem_limit` set (or `deploy.resources.limits.memory`). Without limits a single runaway container (Loki label cardinality spike, Keycloak JVM leak, Prometheus TSDB growth) can OOM the host. Swap is not a substitute.

| Step | Group | Services | Health gate |
|---|---|---|---|
| 12.1 | proxies | socket-proxy-gateway | `docker ps` shows running |
| 12.2 | db | db, dbpool-apps, dbpool-session | `pg_isready` inside container |
| 12.3 | cache | memorycache, memorycache_jobs | `redis-cli ping` → PONG |
| 12.4 | gateway | gateway | `curl -k https://localhost/ping` |
| 12.5 | storage | objectstorage | `wget -q -O- http://localhost:9000/minio/health/live` |
| 12.6 | iam | iam | `curl https://iam-stg.athyper.com/health/live` |

```bash
# Verify no direct docker.sock mount on gateway
docker inspect athyper-gateway-1 \
  | jq '.[0].HostConfig.Binds | map(select(contains("docker.sock")))'
# Must return []
```

---

## Phase 13: Database Seed

> **▶ EXECUTE ON:** `SERVER` &nbsp;&nbsp; **AS:** `athyper`
> Switch: `ssh <devname>@62.169.31.9` → `sudo -iu athyper`

| Step | Action | Gate |
|---|---|---|
| 13.1 | Expose port temporarily: add `"127.0.0.1:5432:5432"` to db ports in override | For seed only — **staging workaround; see tech-debt note below** |
| 13.2 | `docker exec athyper-db-1 psql -U athyperadmin -l` | 7 databases shown |
| 13.3 | `bash /opt/products/athyper/stack/scripts/db/transaction/neon/seed-db.sh` | `=== Seed complete ===` |
| 13.4 | Remove temp port; force-recreate db | `ss -tln \| grep 5432` → nothing on host |

> ⚠️ **Staging-only workaround.** The host port exposure window is short but carries real risk (forgotten override, 0.0.0.0 typo). The clean solution is a one-shot seed container on the Docker network (`docker compose run --rm seed-runner`) that never touches host networking. Tracked in Phase 23 tech-debt (23.2).

---

## Phase 14: IAM / Keycloak Bootstrap

> **▶ EXECUTE ON:** `SERVER` &nbsp;&nbsp; **AS:** `athyper`
> Switch: `ssh <devname>@62.169.31.9` → `sudo -iu athyper`

| Step | Action | Verify |
|---|---|---|
| 14.1 | Realm JSON sanity: `jq '.authenticatorConfig[].id' ... \| sort \| uniq -d` | Nothing |
| 14.2 | `bash /opt/products/athyper/stack/scripts/db/session/iam/reset-iam.sh` | Exit 0 |
| 14.3 | `curl https://iam-stg.athyper.com/realms/athyper/.well-known/openid-configuration` | JSON response |
| 14.4 | Keycloak admin UI → client per `CLIENT_WITH_SECRET` → copy client secret | Matches `IAM_CLIENT_SECRET` in `.env` |

---

## Phase 15: Application Tier Startup

> **▶ EXECUTE ON:** `SERVER` &nbsp;&nbsp; **AS:** `athyper`
> Switch: `ssh <devname>@62.169.31.9` → `sudo -iu athyper`

| Step | Action | Verify |
|---|---|---|
| 15.1 | `bash stack/scripts/stack-profile/up.sh apps` | All 4 containers start |
| 15.2 | Force-recreate for latest .env: `docker compose ... up -d --force-recreate athyper-api athyper-worker athyper-scheduler athyper-neon-web` | |
| 15.3 | `docker compose ... logs -f athyper-api --tail=100` | No crash loops |
| 15.4 | TLS issuer: `echo \| openssl s_client -connect api-stg.athyper.com:443 2>/dev/null \| openssl x509 -issuer -noout` | "Let's Encrypt" — NOT "STAGING" |

---

## Phase 16: Smoke Test Gate

> **▶ EXECUTE ON:** `SERVER` (curl/docker checks) &nbsp;&nbsp; **AS:** `athyper`
> Switch: `ssh <devname>@62.169.31.9` → `sudo -iu athyper`
> **Login row** → open on your **WORKSTATION browser**: `https://neon-stg.athyper.com`

**Stop here if any check fails.**

| Check | Command | Expected |
|---|---|---|
| API liveness | `curl -sf https://api-stg.athyper.com/livez` | 200 |
| API readiness | `curl -sf https://api-stg.athyper.com/readyz` | 200 |
| Web liveness | `curl -sf https://neon-stg.athyper.com/livez` | 200 |
| IAM OIDC | `curl -sf https://iam-stg.athyper.com/realms/athyper/.well-known/openid-configuration` | JSON |
| PgBouncer | `docker exec athyper-dbpool-apps-1 pg_isready -h 127.0.0.1 -p 6432` | accepting connections |
| Redis | `docker exec athyper-memorycache-1 redis-cli -a $MEMORYCACHE_PASSWORD ping` | PONG |
| MinIO | `docker exec <api-container> wget -q -O /dev/null http://objectstorage:9000/minio/health/live` | Exit 0 |
| Login | Browser: `https://neon-stg.athyper.com` → demo user / `Demo@1234` | Application loads |

---

## Phase 17: Observability, Monitoring, Render, Search

> **▶ EXECUTE ON:** `SERVER` &nbsp;&nbsp; **AS:** `athyper`
> Switch: `ssh <devname>@62.169.31.9` → `sudo -iu athyper`

Verify all 8 secondary DNS records resolve first.

| Step | Profile | Verify |
|---|---|---|
| 17.1 | `up.sh telemetry` (+ socket-proxy-logshipper + **node_exporter**) | Grafana UI accessible; `curl http://localhost:9100/metrics` returns node metrics |
| 17.2 | Add `node_exporter` scrape job to Prometheus config; confirm `up{job="node"}` == 1 in Grafana | Metric visible |
| 17.3 | `up.sh monitoring` | GlitchTip, Healthchecks, Uptime Kuma accessible |
| 17.4 | `up.sh render` | Containers healthy |
| 17.5 | `up.sh search` | `curl https://meilisearch-stg.athyper.com/health` |
| 17.6 | No direct docker.sock on logshipper: `docker inspect athyper-logshipper-1 \| jq '...'` | `[]` |
| 17.7 | GlitchTip migrations, superuser, DSN copy | DSN in `.env`; test error in GlitchTip UI |

> **Why node_exporter here, not in Phase 23:** disk pressure on `/opt/stack/athyper/data` is the most likely staging failure in the first week. Without host metrics the first signal is containers dying, not a Grafana alert.

---

## Phase 18: Full Smoke Test

> **▶ EXECUTE ON:** `SERVER` &nbsp;&nbsp; **AS:** `athyper`
> Switch: `ssh <devname>@62.169.31.9` → `sudo -iu athyper`

```bash
set -a
. /opt/stack/athyper/secrets/.env
set +a
bash /opt/products/athyper/stack/scripts/smoke-staging.sh
bash /opt/products/athyper/stack/scripts/setup/verify-objectstorage.sh
bash /opt/products/athyper/stack/scripts/setup/verify-port-hardening.sh
docker compose --env-file /opt/stack/athyper/secrets/.env ps --format "table {{.Name}}\t{{.Status}}"
# All containers Up — none Exited or Restarting
```

---

## Phase 19: systemd Auto-start

> **▶ EXECUTE ON:** `SERVER` &nbsp;&nbsp; **AS:** `root`
> Write the unit file and run `systemctl` commands as root. The service itself runs **as the `athyper` user** (the `User=` line inside the unit file controls that).

```ini
[Unit]
Description=Athyper Staging Stack
After=docker.service network-online.target
Wants=network-online.target
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
User=athyper
Group=athyper
SupplementaryGroups=docker athyper-config athyper-data
WorkingDirectory=/opt/products/athyper

Environment=HOME=/home/athyper
Environment=ATHYPER_PRODUCT_ROOT=/opt/products/athyper
Environment=ATHYPER_CONFIG_ROOT=/opt/stack/athyper/config
Environment=ATHYPER_SECRETS_ROOT=/opt/stack/athyper/secrets
Environment=ATHYPER_DATA_ROOT=/opt/stack/athyper/data
Environment=ATHYPER_LOG_ROOT=/opt/stack/athyper/logs
Environment=ATHYPER_BACKUP_ROOT=/opt/stack/athyper/backups

NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ReadOnlyPaths=/opt/products/athyper /opt/stack/athyper/config /opt/stack/athyper/secrets
ReadWritePaths=/opt/stack/athyper/data /opt/stack/athyper/logs /opt/stack/athyper/backups /home/athyper

# Render redis-acl.conf from .env hashes before any container starts
ExecStartPre=/bin/bash /opt/products/athyper/stack/scripts/setup/validate-env.sh /opt/stack/athyper/secrets/.env
ExecStartPre=/bin/sleep 15
ExecStart=/bin/bash stack/scripts/stack-profile/up.sh all
ExecStop=/bin/bash stack/scripts/stack-profile/down.sh all
TimeoutStartSec=600

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable athyper-stack
systemd-analyze security athyper-stack    # target ≤ 4.0
```

---

## Phase 20: Backup Setup

> **▶ EXECUTE ON:** `SERVER` — two accounts in this phase
> - Steps 20.1 · 20.2 · 20.4 · 20.5 → **AS:** `athyper` (`ssh <devname>@62.169.31.9` → `sudo -iu athyper`)
> - Step 20.3 (write `/etc/cron.d/athyper-backup`) → **AS:** `root`

| Step | Action |
|---|---|
| 20.1 | Write `stack/scripts/db/backup-all.sh`: pg_dump all 7 DBs to `ATHYPER_BACKUP_ROOT/`; push to **offsite** S3/B2 bucket (using `BACKUP_S3_*` env vars); Meilisearch snapshot; Redis BGSAVE. Log to `ATHYPER_LOG_ROOT/backup.log` |
| 20.2 | Verify offsite push: `mc ls remote-backup/athyper-backup-staging` on the **remote** alias — must show files |
| 20.3 | Write `/etc/cron.d/athyper-backup` (02:00 daily, run as root) |
| 20.4 | Test restore: `bash stack/scripts/db/restore/restore-db.sh athyper_analytics <id>` |
| 20.5 | **Confirm file lands in offsite bucket, not just in `backups/`.** Local `backups/` shares disk with `data/` — not durable. |

---

## Phase 21: Secrets Mirror + Reboot Drill

> **▶ EXECUTE ON:** `SERVER` &nbsp;&nbsp; **AS:** `athyper`
> Switch: `ssh <devname>@62.169.31.9` → `sudo -iu athyper`
> ⚠️ Step 21.4 (`sudo reboot`) — athyper's sudoers only covers `systemctl`. Run reboot as **`root`** or as `devname` (who has full sudo): `sudo reboot`

| Step | Action | Gate |
|---|---|---|
| 21.1 | Import each secret from `~/secrets-staging.txt` into **Infisical** staging project — this becomes the primary source of truth | Confirmed in Infisical UI |
| 21.2 | `shred -u ~/secrets-staging.txt` | `ls ~/secrets-staging.txt` fails |
| 21.3 | **Infisical is the primary.** The on-disk `.env` is a materialized cache rendered at startup via `ExecStartPre`. Do not keep secrets only on disk — Infisical is the record of truth. For highest-sensitivity credentials (DB root password, MinIO root key, Keycloak admin password, IAM client secret) consider Docker secrets so they don't appear in `docker inspect` (visible to anyone in the `docker` group, which is root-equivalent). | |
| 21.4 | `sudo reboot` | |
| 21.5 | Reconnect after 3 min; `docker ps` — all Up | ✓ |
| 21.6 | `systemctl status athyper-stack` → `active (exited)` | ✓ |
| 21.7 | Smoke test exits 0 within 10 min of reboot | ✓ |

---

## Phase 22: Post-Deploy Verification

> **▶ EXECUTE ON:** `SERVER` — mixed accounts
> - Security checks (`find /etc/sudoers*`, `grep`, `systemd-analyze`) → **AS:** `root`
> - Docker/container checks (`docker inspect`, `docker exec`) → **AS:** `athyper`
> - All checks can be run as `devname` (who is in `docker` + `athyper-config` groups)

| Check | Command | Expected |
|---|---|---|
| Config not world-writable | `find /opt/stack/athyper/config -perm /022 -ls` | Nothing (644/755 is intentional — containers need world-read on :ro mounts) |
| No world-readable secrets | `find /opt/stack/athyper/secrets -perm /o+r -ls` | Nothing |
| No secrets in config tree | `grep -RIE '(PASSWORD\|SECRET\|TOKEN\|PRIVATE KEY\|CLIENT_SECRET)' /opt/stack/athyper/config` | Only placeholders or approved non-secret references |
| No NOPASSWD:ALL | `grep -r NOPASSWD:ALL /etc/sudoers*` | Nothing |
| No direct docker.sock | `docker inspect athyper-gateway-1 \| jq '.[0].HostConfig.Binds \| map(select(contains("docker.sock")))'` | `[]` |
| systemd score | `systemd-analyze security athyper-stack` | ≤ 4.0 |
| Config drift | `bash setup-config.sh staging --diff` | All OK |
| Grafana UID | `docker exec athyper-telemetry-1 id` | uid=472 |
| Prometheus UID | `docker exec athyper-metrics-1 id` | uid=65534 |
| MANIFEST | `cat /opt/stack/athyper/MANIFEST` | All fields present |
| COMPOSE_PROJECT_NAME | `docker ps --format "{{.Names}}" \| head -3` | All start with `athyper-` |
| Backup in MinIO | `docker exec athyper-objectstorage-1 mc ls local/athyper-backup-staging` | ≥ 1 file |

---

## Phase 23: Post-Handoff Actions

> **▶ EXECUTE ON:** `WORKSTATION` — create tickets, open PRs, schedule reviews

| # | Action | Deadline | Owner |
|---|---|---|---|
| 23.1 | PR: upstream `server/Dockerfile.prod` pnpm@10.33.0 pin | 1 week | |
| 23.2 | **Replace Phase 13 host-port seed with `docker compose run --rm seed-runner`** — seed container runs on the Docker network, no host port exposure needed. Required before production; strongly recommended for staging v2. | 2 weeks | |
| 23.3 | Write `stack/docs/UID_MATRIX.md` with per-service container UID re-verify instructions | 1 week | |
| 23.4 | Prometheus `node_exporter` disk alert rule (filesystem_avail_bytes threshold on `/opt/stack/athyper/data`) | 1 week | |
| 23.5 | Review Loki and Tempo retention after 7 days of real volume | 1 week | |
| 23.6 | Production: replace `0.0.0.0/0` in workbench routes with VPN CIDRs | Before prod | |
| 23.7 | Stale developer account review | 1 month | |
| 23.8 | Dry-run full runbook on clean VM; produce v13 | 1 month | |
| 23.9 | Container hardening: add `read_only: true` + `tmpfs: [/tmp]` to api/worker/scheduler/neon-web compose definitions | 2 weeks | |
| 23.10 | THP suppression: add systemd-tmpfiles unit or `/etc/rc.local` entry to set `transparent_hugepage=never` (eliminates Redis WARNING on every start) | 1 week | |
| 23.11 | `depends_on` with `condition: service_healthy` on gateway → socket-proxy-gateway, logshipper → socket-proxy-logshipper, and apps → db/cache. Compose file ordering does not enforce startup sequence. | 1 week | |
| 23.12 | CI pipeline: build app images in CI, push to registry, pull on server (Phase 11). Staging build-on-host is acceptable short term; server should not carry Node/pnpm toolchain permanently. | Before prod | |
| 23.13 | PgBouncer auth verification: add `docker exec athyper-dbpool-apps-1 psql -h 127.0.0.1 -p 6432 -U <user> -c 'SHOW USERS'` to Phase 12.2 smoke check. A `userlist.txt` typo currently fails silently at first app login. | 1 week | |
| 23.14 | Externalize `FILE_MAP` in `setup-config.sh` (PG-02) into `stack/scripts/setup/files-manifest.yaml` consumed by both `setup-config.sh` and Phase 22 drift check. Prevents silent divergence between copy logic and verification. | 2 weeks | |

---

## Quick Reference — Day-2 Operations

| Task | Command |
|---|---|
| Shell as athyper | `ssh devname@server → sudo -iu athyper` |
| Start stack | `cd /opt/products/athyper && bash stack/scripts/stack-profile/up.sh all` |
| Stop stack | `bash stack/scripts/stack-profile/down.sh all` |
| Pull latest code | `cd /opt/products/athyper && git pull` — safe; never touches config, secrets, or data |
| Edit secrets | `nano /opt/stack/athyper/secrets/.env` |
| Edit config | `nano /opt/stack/athyper/config/<path>` |
| Check config drift | `export ATHYPER_CONFIG_ROOT=/opt/stack/athyper/config ATHYPER_SECRETS_ROOT=/opt/stack/athyper/secrets && bash stack/scripts/setup/setup-config.sh staging --diff` |
| Apply config updates | Same with `--update` |
| Smoke test | `set -a; . /opt/stack/athyper/secrets/.env; set +a && bash /opt/products/athyper/stack/scripts/smoke-staging.sh` |
| Force-recreate app | `docker compose --env-file /opt/stack/athyper/secrets/.env ... up -d --force-recreate athyper-api` |
| View all containers | `docker compose --env-file /opt/stack/athyper/secrets/.env ... ps` |
| Read MANIFEST | `cat /opt/stack/athyper/MANIFEST` |
| VNC recovery | `5.189.174.159:63128` — login as **root** (or break-glass ops-admin) using vault credential; **never as athyper** |
| Rollback | `git -C /opt/products/athyper tag --list "staging-deploy-*" \| sort \| tail -5` → checkout tag → re-run from Phase 11 |
