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
| 2.5 | `passwd --lock athyper` | `passwd -S athyper` shows `L` |
| 2.6 | `usermod -aG docker,athyper-config,athyper-data athyper` | `groups athyper` shows all three |
| 2.7a | **ops-admin role** — two separate commands per named account (see detail below) | `id <account>` shows sudo + docker + athyper-config |
| 2.7b | **dev-inspector role** — two separate commands per named account (see detail below) | `id <account>` shows athyper-config only — no sudo, no docker |
| 2.8 | Install SSH public key for each account (see detail below) | `cat /home/<account>/.ssh/authorized_keys` non-empty |

> ⚠️ **Common mistake:** steps 2.7a and 2.7b are **two separate commands**, not one. Do not join them with `+` or `&&` on a single line — `adduser` is interactive (prompts for password) and must complete before `usermod` runs.

---

### 2.7a — ops-admin Accounts

ops-admin accounts can do anything root requires: write config, run systemctl, switch to `athyper` via `sudo -iu athyper`. They are in `sudo`, `docker`, and `athyper-config`.

**Accounts created on this server:**

| Username | Full name | UID | Role |
|---|---|---|---|
| `ops-admin` | ops admin | 1000 | Generic ops-admin account |
| `nchandravel-atlas` | Chandravel Natarajan | 1002 | ops-admin (primary operator) |

**Commands — run once per ops-admin account (substitute username and full name):**

```bash
# Step 1: Create the account (interactive — sets password at prompt)
adduser --gecos "Chandravel Natarajan" nchandravel-atlas

# Step 2: Assign groups (run after adduser completes)
usermod -aG sudo,docker,athyper-config nchandravel-atlas
```

```bash
# Repeat for ops-admin generic account
adduser --gecos "ops admin" ops-admin
usermod -aG sudo,docker,athyper-config ops-admin
```

**Verify each account:**
```bash
id nchandravel-atlas
# uid=1002(nchandravel-atlas) gid=1002(nchandravel-atlas)
# groups=...,27(sudo),998(docker),9001(athyper-config),...

id ops-admin
# uid=1000(ops-admin) gid=1000(ops-admin)
# groups=...,27(sudo),998(docker),9001(athyper-config),...
```

> **Note — `ops-admin` group assignment:** If `usermod -aG sudo,docker,athyper-config ops-admin` was not confirmed after the failed combined command attempt, run it now and re-verify with `id ops-admin`.

---

### 2.7b — dev-inspector Accounts

dev-inspector accounts can read config, tail logs, and exec into containers. They get `athyper-config` only — no `sudo`, no `docker`.

**Accounts created on this server:**

| Username | Full name | UID | Role |
|---|---|---|---|
| `dev-inspector` | dev inspector | 1001 | Generic dev-inspector account |
| `rmanoj-atlas` | Manoj Rajendran | 1003 | dev-inspector |

**Commands — run once per dev-inspector account:**

```bash
# Step 1: Create the account
adduser --gecos "Manoj Rajendran" rmanoj-atlas

# Step 2: Assign athyper-config ONLY
usermod -aG athyper-config rmanoj-atlas
```

```bash
# Repeat for dev-inspector generic account
adduser --gecos "dev inspector" dev-inspector
usermod -aG athyper-config dev-inspector
```

**Verify each account:**
```bash
id rmanoj-atlas
# groups must include athyper-config — must NOT include sudo or docker

id dev-inspector
# groups must include athyper-config — must NOT include sudo or docker
```

> ⚠️ **Correction required — `dev-inspector` was given wrong groups.** The `usermod` that ran on the server was:
> ```
> usermod -aG sudo,docker,athyper-config dev-inspector
> ```
> This is wrong. `dev-inspector` must not be in `sudo` or `docker`. Fix immediately:
> ```bash
> # Remove dev-inspector from sudo and docker
> gpasswd -d dev-inspector sudo
> gpasswd -d dev-inspector docker
>
> # Confirm fix
> id dev-inspector
> # groups must NOT include sudo(27) or docker
> ```

---

### 2.8 — Install SSH Public Keys

Each account needs its SSH public key installed before Phase 4 disables password auth. After Phase 4, key login is the only way in.

**Procedure for each account — run as root on the server:**

```bash
# 1. Create .ssh directory
mkdir -p /home/<username>/.ssh
chmod 700 /home/<username>/.ssh

# 2. Create authorized_keys and install the key (one line, no line breaks)
touch /home/<username>/.ssh/authorized_keys
chmod 600 /home/<username>/.ssh/authorized_keys
echo "ssh-ed25519 AAAA...paste-full-key-here..." >> /home/<username>/.ssh/authorized_keys

# 3. Fix ownership — sshd rejects key files not owned by the account
chown -R <username>:<username> /home/<username>/.ssh
```

**How to get the public key from a Windows workstation:**

```powershell
# In PowerShell or Git Bash
cat ~/.ssh/id_ed25519.pub
# Prints: ssh-ed25519 AAAA... email@domain.com
```

If the key does not exist yet, generate it first:
```powershell
ssh-keygen -t ed25519 -C "name@atlasdigitaltech.com"
# Accept default path; set a passphrase
cat ~/.ssh/id_ed25519.pub
```

---

**Current SSH key status per account:**

| Account | Role | SSH key installed | Verified login |
|---|---|---|---|
| `nchandravel-atlas` | ops-admin | ✅ installed (2026-04-27) | ☐ test in step 4.6 |
| `ops-admin` | ops-admin | ☐ pending | ☐ |
| `rmanoj-atlas` | dev-inspector | ☐ pending | ☐ |
| `dev-inspector` | dev-inspector | ☐ pending | ☐ |

**`nchandravel-atlas` — already installed:**
```bash
# Key installed 2026-04-27:
# ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDFHEMSIYbda0bFn9sozpBGriXfUkkA3t2ls5rN8pHAb
# chandravel.natarajan@atlasdigitaltech.com

# Verify
ls -la /home/nchandravel-atlas/.ssh/
# drwx------ .ssh/  (700)  -rw------- authorized_keys (600)
cat /home/nchandravel-atlas/.ssh/authorized_keys
# must show one complete ssh-ed25519 line
```

**`rmanoj-atlas` — pending (Manoj Rajendran must provide public key):**
```bash
# Manoj: run this on your workstation and share the output
cat ~/.ssh/id_ed25519.pub

# Once received, install on server as root:
mkdir -p /home/rmanoj-atlas/.ssh
chmod 700 /home/rmanoj-atlas/.ssh
touch /home/rmanoj-atlas/.ssh/authorized_keys
chmod 600 /home/rmanoj-atlas/.ssh/authorized_keys
echo "ssh-ed25519 AAAA...manoj-key..." >> /home/rmanoj-atlas/.ssh/authorized_keys
chown -R rmanoj-atlas:rmanoj-atlas /home/rmanoj-atlas/.ssh
```

**`ops-admin` — pending (install a shared ops key or skip if not using this account):**
```bash
mkdir -p /home/ops-admin/.ssh
chmod 700 /home/ops-admin/.ssh
touch /home/ops-admin/.ssh/authorized_keys
chmod 600 /home/ops-admin/.ssh/authorized_keys
echo "ssh-ed25519 AAAA...ops-key..." >> /home/ops-admin/.ssh/authorized_keys
chown -R ops-admin:ops-admin /home/ops-admin/.ssh
```

**Verify all accounts before Phase 4:**
```bash
for u in nchandravel-atlas ops-admin rmanoj-atlas dev-inspector; do
  echo "=== $u ==="
  id "$u"
  ls -la "/home/$u/.ssh/" 2>/dev/null || echo "  .ssh/ missing"
  cat "/home/$u/.ssh/authorized_keys" 2>/dev/null || echo "  no authorized_keys"
done
```

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
> You are still in the root SSH session opened in Phase 3. Do not switch accounts.
> ⚠️ **Lockout risk in this phase:** steps 4.4 + 4.5 disable password SSH. Before closing this session, step 4.6 opens a second terminal to prove key login works. If the key test fails and you close this session, re-entry requires VNC console only.

| Step | Action | Verify |
|---|---|---|
| 4.1 | Write `/etc/docker/daemon.json` (journald, live-restore, address-pools, no userland-proxy) | `docker info \| grep "Logging Driver"` → `journald` |
| 4.2 | `systemctl restart docker` | `docker ps` works |
| 4.3 | Write `/etc/systemd/journald.conf.d/athyper.conf` (SystemMaxUse=2G, MaxRetentionSec=2week) | `journalctl --disk-usage` ≤ 2G |
| 4.4 | Write `/etc/ssh/sshd_config.d/athyper.conf` per S10 | `sshd -t` exits 0 |
| 4.5 | `systemctl reload sshd` | prompt returns |
| 4.6 | **Test SSH key login as `devname` from a NEW terminal — keep this session open** | Shell prompt, no password asked |
| 4.7 | Write `/etc/sudoers.d/athyper` per S9, `chmod 440` | `visudo -c -f /etc/sudoers.d/athyper` → `parsed OK` |
| 4.8 | `grep -r NOPASSWD:ALL /etc/sudoers*` | No output |

---

### 4.1 — Docker Daemon Configuration

Docker is installed but running with defaults. `daemon.json` configures how the daemon behaves for logging, networking, and container security — applies to every container on this server.

> Before writing the file, note: `daemon.json` is read only at daemon start. Any syntax error here will prevent Docker from starting in step 4.2. Always validate JSON before restarting.

```bash
cat > /etc/docker/daemon.json << 'EOF'
{
  "log-driver": "journald",
  "log-opts": {
    "tag": "{{.Name}}"
  },
  "live-restore": true,
  "default-address-pools": [
    { "base": "10.200.0.0/16", "size": 24 }
  ],
  "userland-proxy": false,
  "no-new-privileges": true
}
EOF
chmod 644 /etc/docker/daemon.json

# Validate JSON syntax before touching Docker
python3 -c "import json; json.load(open('/etc/docker/daemon.json')); print('JSON valid')"
```

Expected: `JSON valid`

**What each setting does:**

| Setting | Value | Without it |
|---|---|---|
| `log-driver: journald` | All container stdout/stderr goes into systemd-journald, queryable by name (`journalctl CONTAINER_NAME=athyper-api`) | Docker writes per-container JSON files under `/var/lib/docker/` — never cleaned up, fills disk |
| `log-opts.tag: {{.Name}}` | Journal entries are tagged with the container name (e.g. `athyper-api`) not a 12-char ID | Log searches show meaningless container IDs |
| `live-restore: true` | Containers keep running when dockerd is restarted (security patch, config change) | Every daemon restart kills all containers |
| `default-address-pools: 10.200.0.0/16` | Bridge networks get IPs from `10.200.x.0/24` slices | Docker defaults to `172.17.0.0/16` — overlaps most corporate VPNs |
| `userland-proxy: false` | Kernel NAT (iptables) handles port forwarding | A `docker-proxy` Go process spawns per exposed port — unnecessary overhead |
| `no-new-privileges: true` | Daemon-wide: containers cannot gain Linux capabilities after start | Setuid escalation possible inside containers |

---

### 4.2 — Restart Docker Daemon

Apply `daemon.json`. Because `live-restore: true` was just written, any already-running containers (none expected at this point) survive the restart.

```bash
systemctl restart docker

# Verify daemon is up and settings applied
docker ps                             # empty table is correct — no containers yet
docker info | grep "Logging Driver"   # → Logging Driver: journald
docker info | grep "Live Restore"     # → Live Restore Enabled: true
```

**If `docker ps` errors or hangs:**
```bash
journalctl -u docker -n 30 --no-pager
# Most common cause: JSON syntax error in daemon.json
# Fix the file, then: systemctl restart docker
```

---

### 4.3 — Journal Disk Retention Limits

Container logs now flow into journald (step 4.1). Without limits, journald grows until the disk is full. This step writes a **drop-in** under `journald.conf.d/` — it overrides only these specific settings without touching the base `journald.conf`, so OS updates cannot remove our limits.

```bash
mkdir -p /etc/systemd/journald.conf.d

cat > /etc/systemd/journald.conf.d/athyper.conf << 'EOF'
[Journal]
SystemMaxUse=2G
SystemKeepFree=500M
MaxRetentionSec=2week
EOF
chmod 644 /etc/systemd/journald.conf.d/athyper.conf

# journald requires full restart (not reload) to apply conf changes — safe, no entries lost
systemctl restart systemd-journald
```

**Verify:**
```bash
journalctl --disk-usage
# Any number ≤ 2G is correct
```

**What each setting does:**

| Setting | Effect |
|---|---|
| `SystemMaxUse=2G` | Hard cap: oldest entries deleted automatically when journal hits 2 GB |
| `SystemKeepFree=500M` | Always keeps 500 MB free on the journal filesystem — protects against disk-full at log burst |
| `MaxRetentionSec=2week` | Entries older than 2 weeks deleted on next vacuum — prevents old container logs from occupying the cap indefinitely |

---

### 4.4 — SSH Hardening Drop-in

The server arrived from Contabo with password SSH and root login enabled. This step disables both and restricts login to specific groups.

Written as a **drop-in** under `/etc/ssh/sshd_config.d/` — sshd reads the base `sshd_config` first, then alphabetically applies all files in this directory. Our file overrides only what we need; OS updates to the base config do not affect it.

```bash
cat > /etc/ssh/sshd_config.d/athyper.conf << 'EOF'
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
AllowGroups sudo athyper-config

Match User athyper
    ForceCommand /usr/sbin/nologin
EOF
chmod 644 /etc/ssh/sshd_config.d/athyper.conf
```

**What each line does:**

| Line | Effect |
|---|---|
| `PermitRootLogin no` | Direct root SSH blocked. Root is reachable only via VNC (`5.189.174.159:63128`) or `sudo -i` from a human account |
| `PasswordAuthentication no` | Keys only — entire category of password-based attacks (brute force, credential stuffing) eliminated. **This is the lockout risk — keys must work before closing this session** |
| `PubkeyAuthentication yes` | Explicit: some hardened base images disable this by default |
| `AllowGroups sudo athyper-config` | Only ops-admins (`sudo`) and dev-inspectors (`athyper-config`) can SSH in. `athyper` is in neither group by design |
| `Match User athyper` + `ForceCommand /usr/sbin/nologin` | Belt-and-suspenders: even if `athyper` is accidentally added to `AllowGroups` later, SSH immediately exits |

**Validate syntax before proceeding — mandatory:**
```bash
sshd -t
echo "exit $?"
# Must print: exit 0  (no output from sshd -t means no errors)
```

> Never run step 4.5 without `sshd -t` passing clean. A broken sshd config applied to a live daemon blocks all new SSH connections — your current session stays open but no one else can log in.

---

### 4.5 — Apply SSH Configuration

The config file is on disk but sshd has not read it. `reload` sends `SIGHUP` to sshd — it re-reads config and applies the new policy to **new** connections. Your current session is not dropped.

> Do NOT use `restart` here — `restart` terminates all active SSH sessions including yours.

```bash
systemctl reload sshd
# No output on success — prompt returns immediately
```

New SSH connections from this point forward obey the hardened policy. Step 4.6 immediately verifies this.

---

### 4.6 — Verify SSH Key Login (Lockout Prevention Gate)

Password auth is now disabled. If the ops-admin key is missing or mis-permissioned, new connections will be silently rejected — no password fallback. This step proves key login works while the current session is still available as a safety net.

**⚠️ Do not close this terminal until step 5 below succeeds.**

**1.** Keep this root terminal open.

**2.** Open a **new terminal window** on your workstation.

**3.** Connect as the ops-admin account (created in Phase 2):
```bash
ssh nchandravel-atlas@62.169.31.9
# Expected: shell prompt with no password prompt
# nchandravel-atlas@vmi2836875:~$
```

**4.** Confirm groups from inside the new session:
```bash
id
# Must show: groups include sudo (27) or athyper-config
```

**5.** Key login confirmed. You may now close the root terminal.

---

**If the connection is refused or immediately closed — debug from the root terminal:**

```bash
# 1. Is the account in AllowGroups?
id nchandravel-atlas
# groups must include sudo or athyper-config
# Fix: usermod -aG sudo,athyper-config nchandravel-atlas

# 2. Are .ssh permissions correct?
ls -la /home/nchandravel-atlas/.ssh/
# .ssh/             must be 700  (drwx------)
# authorized_keys   must be 600  (-rw-------)
# Fix:
chmod 700 /home/nchandravel-atlas/.ssh
chmod 600 /home/nchandravel-atlas/.ssh/authorized_keys

# 3. Is the key content valid — one unbroken line?
cat /home/nchandravel-atlas/.ssh/authorized_keys
# Must be: ssh-ed25519 AAAA...  (single line, no wrapping)

# 4. What did sshd actually reject?
journalctl -u sshd -n 30 --no-pager
# Look for: Authentication refused / not in AllowGroups / bad key format
```

Retry key login after each fix. Do not proceed to 4.7 until login succeeds.

---

### 4.7 — Scoped sudoers for `athyper`

The `athyper` service account runs the stack via systemd (Phase 19). When the stack's management scripts call `systemctl restart athyper-stack`, `athyper` needs to run that command as root — `systemctl` lifecycle commands require root. This step grants exactly that, nothing more.

```bash
cat > /etc/sudoers.d/athyper << 'EOF'
athyper ALL=(root) NOPASSWD: \
    /usr/bin/systemctl start athyper-*, \
    /usr/bin/systemctl stop athyper-*, \
    /usr/bin/systemctl restart athyper-*, \
    /usr/bin/systemctl status athyper-*, \
    /usr/bin/systemctl reload athyper-*
EOF
chmod 440 /etc/sudoers.d/athyper
```

**Reading the sudoers syntax:**
```
athyper  ALL=(root)  NOPASSWD:  /usr/bin/systemctl start athyper-*
│        │    │       │          │                   │     │
account  host runas   no-pwd     full binary path    verb  service pattern
```
The wildcard `athyper-*` matches `athyper-stack`, `athyper-api`, etc. It does not match `bash`, `sh`, `docker`, or any other command — unlisted commands are denied.

> **Why `chmod 440` is mandatory:** `sudo` refuses to read any sudoers file writable by group or world. If permissions are wrong, sudo silently ignores the file — the grant disappears with no error message. `440` = root:root, read-only for both.

**Validate syntax:**
```bash
visudo -c -f /etc/sudoers.d/athyper
# Expected: /etc/sudoers.d/athyper: parsed OK
```

**Test the grant works and is scoped correctly:**
```bash
# Grants work (unit not found is fine — it's not installed yet)
su -s /bin/bash athyper -c "sudo systemctl status athyper-stack 2>&1 || true"
# Expected: Unit athyper-stack.service could not be found.  ← NOT "permission denied"

# Cannot escalate beyond the grant
su -s /bin/bash athyper -c "sudo bash -c 'id' 2>&1 || true"
# Expected: Sorry, user athyper is not allowed to execute '/usr/bin/bash...' as root
```

---

### 4.8 — Audit: No NOPASSWD:ALL in Sudoers

`NOPASSWD:ALL` means any command as root with no password — unrestricted root-equivalent. It must not exist anywhere on the system.

```bash
grep -r NOPASSWD:ALL /etc/sudoers*
# Must return nothing (silent = pass)
```

This scans `/etc/sudoers` and every file in `/etc/sudoers.d/`. The `athyper` rule from 4.7 uses `NOPASSWD:` (command-scoped) — it will not appear in this grep.

**Why this audit matters:** Contabo's Ubuntu base image ships with:
```
ubuntu ALL=(ALL:ALL) NOPASSWD:ALL
```
This is a provisioning convenience left in by the provider. If the `ubuntu` account exists and has an SSH key, it is a full privilege escalation path. This grep catches it.

**If output is returned:**
```bash
# Identify the file and account
cat /etc/sudoers.d/90-cloud-init-users    # common offender

# Option A — account no longer needed: delete the file
rm /etc/sudoers.d/90-cloud-init-users

# Option B — account needed with restricted access: open for editing
visudo -f /etc/sudoers.d/90-cloud-init-users
# Replace NOPASSWD:ALL with a scoped rule, or remove the account's line

# Confirm clean
grep -r NOPASSWD:ALL /etc/sudoers*    # must return nothing
```

Do not proceed to Phase 5 until this grep is silent.

---

## Phase 5: SSH Key Infrastructure

> **▶ EXECUTE ON:** `SERVER` &nbsp;&nbsp; **AS:** `athyper`
> **Switch accounts:** `ssh nchandravel-atlas@62.169.31.9` → `sudo -iu athyper`
> ⚠️ Step 5.4 is **WORKSTATION only** — you register the deploy key in GitHub from your browser. Return to the server terminal for step 5.5.

This phase gives the `athyper` service account read-only access to the GitHub repo via a dedicated SSH deploy key. The deploy key is scoped to one repository — if the server is ever compromised, the blast radius is limited to read access on this repo only. A personal SSH key would give access to everything in the GitHub account.

| Step | Action | Verify |
|---|---|---|
| 5.1 | Generate deploy key pair | Key files exist at `/home/athyper/.ssh/` |
| 5.2 | Write SSH config routing `github.com` to deploy key | `chmod 600` on config |
| 5.3 | Print public key for copy-paste into GitHub | key displayed |
| 5.4 | **[WORKSTATION]** Register public key in GitHub as read-only deploy key | Key appears in repo settings |
| 5.5 | Test GitHub auth from server | Success message |

---

### 5.1 — Generate the Deploy Key Pair

```bash
ssh-keygen \
  -t ed25519 \
  -C "athyper-staging-deploy-key" \
  -f /home/athyper/.ssh/github_deploy_key \
  -N ""
```

| Flag | Meaning |
|---|---|
| `-t ed25519` | Ed25519 algorithm — smaller key, faster, more secure than RSA-4096 |
| `-C "athyper-staging-deploy-key"` | Comment embedded in the public key — identifies this key in GitHub's deploy key list |
| `-f /home/athyper/.ssh/github_deploy_key` | Key saved with a specific name, not the default `id_ed25519` — avoids colliding with any personal key |
| `-N ""` | Empty passphrase — required because this key is used by automated scripts that cannot type a passphrase |

**Verify both files were created:**
```bash
ls -la /home/athyper/.ssh/github_deploy_key*
# -rw------- github_deploy_key       (private — 600)
# -rw-r--r-- github_deploy_key.pub   (public  — 644)
```

---

### 5.2 — Write SSH Config to Route github.com via Deploy Key

Without this config file, `git clone git@github.com:...` uses whatever key SSH finds first (usually `~/.ssh/id_ed25519`). The config explicitly routes all `github.com` connections through the deploy key.

```bash
cat > /home/athyper/.ssh/config << 'EOF'
Host github.com
    HostName github.com
    User git
    IdentityFile /home/athyper/.ssh/github_deploy_key
    IdentitiesOnly yes
EOF
chmod 600 /home/athyper/.ssh/config
```

`IdentitiesOnly yes` tells SSH to use only the key listed and not offer any other keys from the agent or default paths. Without this, SSH may try multiple keys and confuse the handshake.

---

### 5.3 — Print the Public Key

```bash
cat /home/athyper/.ssh/github_deploy_key.pub
```

Output looks like:
```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... athyper-staging-deploy-key
```

Copy this entire line — you need it for step 5.4. The key is one line; if it wraps in the terminal, copy all of it.

---

### 5.4 — [WORKSTATION] Register Deploy Key on GitHub

Do this in your browser, not the server terminal.

1. Go to: `https://github.com/atlasdigitaltech/athyper/settings/keys`
2. Click **Add deploy key**
3. **Title:** `athyper-staging-deploy-key`
4. **Key:** paste the full `ssh-ed25519 AAAA...` line from step 5.3
5. **Allow write access:** leave **unchecked** — read-only is sufficient for `git clone` and `git pull`
6. Click **Add key**

The key appears in the deploy keys list. Return to the server terminal.

---

### 5.5 — Test GitHub Authentication from the Server

```bash
ssh -T git@github.com
```

**Expected output:**
```
Hi atlasdigitaltech/athyper! You've successfully authenticated, but GitHub does not provide shell access.
```

This confirms:
- The deploy key is registered and matches
- The SSH config (step 5.2) is routing the connection correctly
- The `athyper` account can pull the repo in Phase 6

**If you get `Permission denied (publickey)`:**
```bash
# Test with verbose output to see which keys are being tried
ssh -vT git@github.com 2>&1 | grep -E "Trying|Offering|identity|Authenticated"
# Should show: Offering public key: /home/athyper/.ssh/github_deploy_key

# If the deploy key is not being offered, check the SSH config
cat /home/athyper/.ssh/config
# IdentityFile must point to /home/athyper/.ssh/github_deploy_key
# IdentitiesOnly yes must be present

# If the key is offered but rejected, the public key in GitHub may not match
# Re-print and re-paste:
cat /home/athyper/.ssh/github_deploy_key.pub
```

---

## Phase 6: Repository Clone

> **▶ EXECUTE ON:** `SERVER` &nbsp;&nbsp; **AS:** `athyper`
> Still in the `athyper` shell from Phase 5. If you left: `ssh nchandravel-atlas@62.169.31.9` → `sudo -iu athyper`

This phase clones the codebase into `/opt/products/athyper` — the git-managed source root. After cloning, five verification checks confirm the repo was deployed in the correct state before any image build happens.

| Step | Action | Verify |
|---|---|---|
| 6.1 | Clone the repo to the product root | directory populated |
| 6.2 | Confirm key compose file exists | `ls` shows file |
| 6.3 | Pre-gate PG-01: compose.sh uses `ATHYPER_CONFIG_ROOT:-` default | grep returns line |
| 6.4 | Pre-gate PG-06: gateway compose uses `ATHYPER_SECRETS_ROOT` variable | grep returns line |
| 6.5 | Security gate: gateway compose has no direct `docker.sock` mount | grep returns nothing |
| 6.6 | Record deploy SHA | file written |
| 6.7 | Tag the deployed commit | tag created |
| 6.8 | Patch pnpm version pin in Dockerfile.prod | grep confirms pin |

---

### 6.1 — Clone the Repository

```bash
git clone \
  --branch feature/finance-core \
  git@github.com:atlasdigitaltech/athyper.git \
  /opt/products/athyper
```

This clones the `feature/finance-core` branch into the product root created in Phase 3. The directory is already owned by `athyper` (Phase 3) — no permission issues.

**Verify the clone succeeded:**
```bash
ls /opt/products/athyper/stack/compose/compose.yml
# Must output the file path — not "No such file or directory"
```

**If clone fails with `Permission denied (publickey)`:** the deploy key is not set up correctly — return to Phase 5.

---

### 6.2 — Confirm Key Compose File Exists

A quick sanity check that the expected directory structure is present. If this file is missing, the wrong branch was cloned or the repo is incomplete.

```bash
ls /opt/products/athyper/stack/compose/compose.yml
```

Expected: the path is printed. Any error here means stop — the clone is wrong.

---

### 6.3 — Pre-Gate PG-01: Config Root Variable

Confirms that `compose.sh` uses the correct environment variable name with a `:-` default syntax. This is a pre-gate condition that must be true before the stack can resolve config paths.

```bash
grep "ATHYPER_CONFIG_ROOT:-" /opt/products/athyper/stack/scripts/lib/compose.sh
```

Expected: a line containing `ATHYPER_CONFIG_ROOT:-` is returned. If nothing is returned — the script is using a different variable name and the config deployment in Phase 7 will fail silently.

---

### 6.4 — Pre-Gate PG-06: Secrets Root in Gateway Compose

Confirms the gateway compose file references `ATHYPER_SECRETS_ROOT` for its TLS cert mounts. If it has a hardcoded path, the cert bind mounts will be wrong.

```bash
grep "ATHYPER_SECRETS_ROOT" \
  /opt/products/athyper/stack/compose/gateway/athyper-gateway.yml
```

Expected: one or more matching lines returned.

---

### 6.5 — Security Gate: No Direct docker.sock Mount on Gateway

The gateway (Traefik) must not mount the Docker socket directly. It must use the socket proxy service instead. A direct mount gives Traefik full Docker API access — if Traefik is compromised, the attacker controls every container.

```bash
grep "docker.sock" \
  /opt/products/athyper/stack/compose/gateway/athyper-gateway.yml
```

**Expected: no output.** If this returns anything, stop — the socket proxy wiring is not in place and this would be a security regression from the intended architecture (S8).

---

### 6.6 — Record the Deployed Commit SHA

Write the exact git SHA to a file so there is an unambiguous record of what is running on this server. If something breaks and a rollback is needed, this file is the reference point.

```bash
git -C /opt/products/athyper rev-parse HEAD > ~/deploy-record.txt
chmod 600 ~/deploy-record.txt

cat ~/deploy-record.txt
# e.g.: 82cc4d2f3a1b...  (full 40-char SHA)
```

---

### 6.7 — Tag the Deployed Commit

Create a lightweight git tag on the deployed commit so it can be found easily in git history and used for rollback.

```bash
# Replace <sha7> with the first 7 characters from deploy-record.txt
SHA7=$(git -C /opt/products/athyper rev-parse --short HEAD)
git -C /opt/products/athyper tag "staging-deploy-$(date +%Y%m%d-%H%M)-${SHA7}"

# Confirm the tag was created
git -C /opt/products/athyper tag --list "staging-deploy-*" | tail -3
```

To roll back to this exact state later: `git -C /opt/products/athyper checkout <tag-name>`.

---

### 6.8 — Patch pnpm Version Pin in Dockerfile.prod

The `server/Dockerfile.prod` references `pnpm@latest` which resolves to whatever pnpm version is current at build time. The monorepo's `pnpm-lock.yaml` was generated with pnpm `10.33.0`. A version mismatch causes `pnpm install --frozen-lockfile` to fail during image build (Phase 11) because the lockfile format differs.

This is a temporary patch until the upstream PR is merged and the repo is updated.

```bash
sed -i 's/pnpm@latest/pnpm@10.33.0/' \
  /opt/products/athyper/server/Dockerfile.prod

# Confirm the substitution
grep "pnpm@10.33.0" /opt/products/athyper/server/Dockerfile.prod
# Must return the patched line
```

> Track this as Phase 23 tech-debt (23.1): open a PR to pin `pnpm@10.33.0` in the repo so this manual patch is not needed on future deploys.

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
| **8.0** | **Create the bootstrap file** `stack/env/.env` — see 8.0 detail below |
| 8.1 | `unset HISTFILE && set +o history` |
| 8.2 | Generate all secrets to `~/secrets-staging.txt` (600) via `openssl rand` — see generation commands below |
| 8.3 | `nano /opt/stack/athyper/secrets/.env` |
| 8.4 | Populate all values — see sections below for format rules and gotchas |
| 8.5 | `set -o history && export HISTFILE=~/.bash_history` |
| 8.6 | Confirm key structural values are correct (see checklist below) |

---

### 8.0 — Create the Bootstrap File (Critical — Do This First)

> ⚠️ **Missing this step causes 100+ "variable is not set" WARN lines on every `up.sh` / `down.sh` / `logs.sh` run — and silently starts all containers with blank credentials.**

#### What the bootstrap file is

`stack/env/.env` (inside the git checkout, gitignored) is **not** the secrets file. It contains only the five root path variables that tell `compose.sh` where to find the real secrets. No passwords, no tokens.

#### Why it is needed

`compose.sh` resolves the env file location in two ways:

| How the stack is started | How `ATHYPER_SECRETS_ROOT` reaches `compose.sh` |
|---|---|
| Via **systemd** (`athyper-stack.service`) | `Environment=ATHYPER_SECRETS_ROOT=...` in the unit file — already in the process environment |
| Via **manual shell** (`sudo -iu athyper && up.sh core`) | systemd env vars are **not** inherited — `compose.sh` must read them from `stack/env/.env` |

When running `up.sh` manually (Phase 11, 12, every ad-hoc command), the shell does not have the systemd environment. Without `stack/env/.env`, `ATHYPER_SECRETS_ROOT` is empty, `compose.sh` falls back to using `stack/env/.env` itself as the secrets file — which is just the gitignored template with no values — and Docker Compose gets 60+ blank variables.

#### Create it now (run as `athyper`)

```bash
cat > /opt/products/athyper/stack/env/.env << 'EOF'
# Bootstrap file — path overrides only. No secrets here.
# Tells compose.sh where to find the real secrets/.env on this server.
# This file is gitignored and must be created manually on every server.
ATHYPER_SECRETS_ROOT=/opt/stack/athyper/secrets
ATHYPER_CONFIG_ROOT=/opt/stack/athyper/config
ATHYPER_DATA_ROOT=/opt/stack/athyper/data
ATHYPER_LOG_ROOT=/opt/stack/athyper/logs
ATHYPER_BACKUP_ROOT=/opt/stack/athyper/backups
EOF
chmod 644 /opt/products/athyper/stack/env/.env
```

#### Verify it works

```bash
# Should print the path to the secrets file, not the bootstrap file
grep -m1 "^ATHYPER_SECRETS_ROOT" /opt/products/athyper/stack/env/.env
# expect: ATHYPER_SECRETS_ROOT=/opt/stack/athyper/secrets

# Dry-run: confirm compose picks up the right env file
# Look for: --env-file /opt/stack/athyper/secrets/.env  (NOT stack/env/.env)
bash /opt/products/athyper/stack/scripts/stack-profile/up.sh core 2>&1 | head -5
```

If `--env-file` still shows `stack/env/.env` — the bootstrap file was not written to the correct path. Double-check:
```bash
cat /opt/products/athyper/stack/env/.env
```

---

### 8.A — Secret Generation Commands

Run these **before** opening `.env`. Output goes to `~/secrets-staging.txt` — keep it until Infisical import (Phase 21) then shred it.

```bash
unset HISTFILE && set +o history

# Random secrets
echo "DB_PASSWORD=$(openssl rand -base64 32)"
echo "DBPOOL_PASSWORD=$(openssl rand -base64 32)"
echo "REDIS_PASSWORD=$(openssl rand -base64 32)"
echo "MINIO_ROOT_PASSWORD=$(openssl rand -base64 32)"
echo "KC_DB_PASSWORD=$(openssl rand -base64 32)"
echo "GLITCHTIP_DB_PASSWORD=$(openssl rand -base64 32)"
echo "INFISICAL_DB_PASSWORD=$(openssl rand -base64 32)"
echo "ANALYTICS_DB_PASSWORD=$(openssl rand -base64 32)"
echo "SESSION_SECRET=$(openssl rand -hex 32)"
echo "CSRF_SECRET=$(openssl rand -hex 32)"
echo "JOBS_SECRET=$(openssl rand -hex 32)"
```

Save output to `~/secrets-staging.txt`:
```bash
chmod 600 ~/secrets-staging.txt
```

---

### 8.B — GATEWAY_DASHBOARD_HTPASSWD (Critical — Read Carefully)

> ⚠️ **This variable caused a deployment failure during staging bringup. The root cause and correct format are documented here in full.**

#### Root cause of the failure

The Traefik dashboard uses HTTP Basic Auth via the `basicAuth` middleware. This middleware expects credentials in **Apache htpasswd format**:

```
username:bcrypt_hash
```

The `.env` entry was initially set to **just the bcrypt hash** without the `username:` prefix:

```bash
# ❌ BROKEN — hash only, no username prefix
GATEWAY_DASHBOARD_HTPASSWD=$$2y$$05$$d81hAtQQ8Il.Dd9lRiPQfuaKsk3ZCrsh9YJEINQnzdSHsKexqC1ce
```

Traefik received this value, tried to parse it as `user:hash`, found no `:` separator, and rejected every login attempt silently. The dashboard loaded but no credentials were accepted.

#### The fix

Prepend `username:` to the bcrypt hash:

```bash
# ✅ CORRECT — username:hash format
GATEWAY_DASHBOARD_HTPASSWD=admin:$$2y$$05$$d81hAtQQ8Il.Dd9lRiPQfuaKsk3ZCrsh9YJEINQnzdSHsKexqC1ce
```

#### Why `$$` instead of `$`

Docker Compose performs variable interpolation when it reads the `.env` file and substitutes values into the compose YAML. A bare `$` in a value is treated as the start of a `${VARIABLE}` reference. A bcrypt hash contains multiple literal `$` signs (e.g. `$2y$05$...`), so each must be escaped as `$$` so Compose passes a literal `$` to Traefik.

| In `.env` file | What Traefik receives |
|---|---|
| `$$2y$$05$$abc` | `$2y$05$abc` ✅ |
| `$2y$05$abc` | Compose interpolation error or empty string ❌ |

#### How to generate a new htpasswd value

On any machine with `htpasswd` (Apache utils) or `docker`:

```bash
# Option A — htpasswd utility (install: apt install apache2-utils)
htpasswd -nbB admin "your-secure-password"
# Output: admin:$2y$05$...

# Option B — docker (no install needed)
docker run --rm httpd:alpine htpasswd -nbB admin "your-secure-password"
# Output: admin:$2y$05$...
```

The output is already in `username:hash` format. Before putting it in `.env`, **escape every `$` as `$$`**:

```bash
# One-liner: generate and escape in a single step
docker run --rm httpd:alpine htpasswd -nbB admin "your-secure-password" \
  | sed 's/\$/\$\$/g'
# Output ready to paste directly into .env
```

#### Current staging value (2026-04-27)

```
GATEWAY_DASHBOARD_HTPASSWD=admin:$$2y$$05$$d81hAtQQ8Il.Dd9lRiPQfuaKsk3ZCrsh9YJEINQnzdSHsKexqC1ce
```

- **Username:** `admin`
- **Password:** stored in `~/secrets-staging.txt` and Infisical
- **Generated:** 2026-04-27 during staging bringup

#### Verification after stack start

```bash
# Traefik dashboard should prompt for credentials
curl -u admin:"your-password" https://traefik-stg.athyper.com/dashboard/
# HTTP 200 = working
# HTTP 401 = wrong password or wrong format in .env
# No prompt at all = basicAuth middleware not applied
```

---

### 8.C — Structural Values Checklist

Confirm these values are exactly correct in `.env` — wrong values here cause silent failures that are hard to trace:

| Variable | Correct value | Common mistake |
|---|---|---|
| `ENVIRONMENT` | `staging` | `production` left from template |
| `COMPOSE_PROJECT_NAME` | `athyper` | Affects all container names — do not change mid-run |
| `ATHYPER_CONFIG_ROOT` | `/opt/stack/athyper/config` | Relative path — bind mounts silently fail |
| `ATHYPER_SECRETS_ROOT` | `/opt/stack/athyper/secrets` | Same |
| `ATHYPER_DATA_ROOT` | `/opt/stack/athyper/data` | Same |
| `ATHYPER_LOG_ROOT` | `/opt/stack/athyper/logs` | Same |
| `ATHYPER_BACKUP_ROOT` | `/opt/stack/athyper/backups` | Same |
| `DB_HOST` | `db` | External hostname — app cannot reach DB |
| `DBPOOL_APPS_CONFIG` | `db/local/dbpool/pgbouncer-apps.ini` | Wrong path = PgBouncer fails to start |
| `DBPOOL_SESSION_CONFIG` | `db/local/dbpool/pgbouncer-session.ini` | Same |
| `ACME_EMAIL` | `ops@atlasdigitaltech.com` | Empty = Let's Encrypt rejects cert request |
| `GATEWAY_DASHBOARD_HTPASSWD` | `username:$$2y$$...` | Missing `username:` prefix; unescaped `$` |

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
