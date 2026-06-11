# Athyper Staging Setup — Ubuntu Server Runbook

**Document version:** v13 — permission-safe  
**Scope:** Fresh Ubuntu 22.04/24.04 server (Contabo VM) → `ENVIRONMENT=staging`  
**Also applies to:** production servers, with the three deltas described in [`environments.md`](environments.md#production--same-shape-as-staging-three-deltas).  
**Not for:** Windows local development — see [`local-dev-setup.md`](local-dev-setup.md) and [`environments.md`](environments.md) for the cross-env comparison.  
**Two-root rule:** Source code and runtime state must live on separate filesystem paths.

```text
/opt/products/athyper   ← git checkout  (read-only: compose definitions, scripts, templates)
/opt/stack/athyper      ← runtime state (read-write: config, secrets, data, logs, backups)
```

> This separation means `git pull` is always safe — it never touches secrets, data, or
> generated config files.

---

## Contents

1. [v13 Permission Model](#v13-permission-model)
2. [Part A — Prerequisites](#part-a--prerequisites-execute-on-workstation)
   - A.1 Code Pre-gates
   - A.2 DNS Pre-gates
   - A.3 Offsite Backup Pre-gate
3. [Part B — Server Installation](#part-b--server-installation)
   - Phase 0 — Server Pre-flight
   - Phase 1 — Base Packages and Docker
   - Phase 2 — Groups, Service Identities, Service Account
   - Phase 3 — Two-Root Filesystem Layout
   - Phase 4 — System Hardening
   - Phase 5 — GitHub Deploy Key
   - Phase 6 — Clone Repository
   - Phase 7 — Compose / Service-User Code Check
   - Phase 8 — Deploy Config Files
   - Phase 9 — Bootstrap File and Secrets
   - Phase 10 — Validate Environment and Render Redis ACL
   - Phase 11 — Apply v13 Data Directory Ownership
   - Phase 12 — Mandatory Host Write Probe
   - Phase 13 — Mandatory Container Canaries
   - Phase 14 — Compose Render Validation
   - Phase 15 — Build Application Images
   - Phase 16 — Start Core Infrastructure
   - Phase 17 — Database Seed
   - Phase 18 — IAM / Keycloak Bootstrap
   - Phase 19 — Start Application Tier
   - Phase 20 — Start Secondary Profiles
   - Phase 21 — Full Smoke Test
   - Phase 22 — systemd Service
   - Phase 23 — Backup Setup
   - Phase 24 — Secrets Mirror and Cleanup
   - Phase 25 — Reboot Drill
   - Phase 26 — Final SSH Hardening *(last step — do not skip)*
4. [Part C — Post-Deploy Verification](#part-c--post-deploy-verification)
5. [Part D — Day-2 Operations](#part-d--day-2-operations)
   - D.5 Edit Secrets
   - D.6 Edit Config
   - D.7 Permission Repair for One Leaf
   - D.8 VNC Recovery
   - D.9 Seed fails — `permission denied for schema control`
6. [Part E — Go/No-Go Checklist](#part-e--gono-go-checklist)

---

## v13 Permission Model

**Why v13 exists:** The v12 plan mapped container processes directly to host UIDs `999`, `1000`,
`1001`. On Ubuntu, `1000` and `1001` are ordinary human user IDs — this caused host/container
UID collisions and the repeated `dump.rdb Permission denied` failure on Redis.

v13 uses a **reserved UID range (9100–9105)** with named service identities that cannot
collide with any human account:

| Service family | Linux user | UID | Linux group | GID |
|---|---:|---:|---:|---:|
| Redis cache / jobs | `svc-redis` | `9100` | `svc-redis` | `9100` |
| MinIO | `svc-minio` | `9101` | `svc-minio` | `9101` |
| Grafana | `svc-grafana` | `9102` | `svc-grafana` | `9102` |
| Loki / Tempo | `svc-loki` | `9103` | `svc-loki` | `9103` |
| Prometheus | `svc-prometheus` | `9104` | `svc-prometheus` | `9104` |
| searchcore / analyticsboard / statuswatch | `svc-meili` | `9105` | `svc-meili` | `9105` |

Any service that binds a **host directory** (not a named Docker volume) must declare the
matching identity in compose:

```yaml
# Correct: matches host ownership from Phase 11
memorycache:
  user: "9100:9100"

objectstorage:
  user: "9101:9101"
```

Every such service must pass a **container canary** (Phase 13) before the full stack starts.
Postgres uses a named volume, not a bind mount, so it keeps `user: "999:999"` and does not
need a service identity.

---

# Part A — Prerequisites *(execute on workstation)*

---

## A.1 Code Pre-gates

**EXECUTE ON:** WORKSTATION  
**AS:** developer/operator

Verify all of the following before touching the server. Deploying without these gates leads
to the same class of silent misconfiguration that caused the v12 incident.

| Gate | What to check |
|---|---|
| PG-01 | `compose.sh` reads `ATHYPER_*_ROOT` from `.env` and exports `ATHYPER_CONFIG` / `ATHYPER_DATA` aliases required by older compose bind mounts |
| PG-02 | `setup-config.sh` deploys config into `ATHYPER_CONFIG_ROOT`, accepts `--diff` to preview changes without applying, and writes a `MANIFEST` file |
| PG-03 | `data-dirs-create.sh` fails hard if not run as root, creates service-specific directories, and runs host write probes after `chown` |
| PG-04 | All compose files declare `user: "910x:910x"` for writable bind-mounted services; ephemeral services use named volumes instead |
| PG-05 | Gateway and logshipper mount `docker.sock` through socket-proxy containers — no direct `/var/run/docker.sock` mount on either |
| PG-06 | Gateway TLS cert mount reads from `${ATHYPER_SECRETS_ROOT}/gateway/certs:/certs` |
| PG-07 | `stack/env/.env` contains only non-secret bootstrap config (paths, hostnames, image tags, limits), never credentials |
| PG-08 | Every compose service has `mem_limit` or `deploy.resources.limits.memory` |
| PG-09 | `server/Dockerfile.prod` pins `pnpm@10.33.0`, not `pnpm@latest` |
| PG-10 | Redis cache config uses `save ""` and `appendonly no` (no persistence) unless durability is intentional |

---

## A.2 DNS Pre-gates

**EXECUTE ON:** WORKSTATION  
**AS:** DNS admin/operator

Create DNS records **before** starting the gateway or the profile that owns the route.
Traefik's ACME challenge will fail silently if DNS does not resolve when the router starts.

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

Verify from workstation before proceeding:

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
  dig +short "$host" @1.1.1.1   # Cloudflare resolver
  dig +short "$host" @8.8.8.8   # Google resolver
done
```

All must return the server public IP from both resolvers.

---

## A.3 Offsite Backup Pre-gate

**EXECUTE ON:** WORKSTATION / cloud console  
**AS:** operator

Provision an off-host bucket before setting up the server. The local MinIO on the same server
is not durable backup — disk failure would lose both the stack data and the backup.

Supported targets: S3, Backblaze B2, Wasabi, or a remote MinIO in a different region/account.

Prepare these values for the staging `.env`:

```text
BACKUP_S3_BUCKET=             # e.g. athyper-stg-backups
BACKUP_S3_ACCESS_KEY=
BACKUP_S3_SECRET_KEY=
BACKUP_S3_ENDPOINT=           # e.g. https://s3.us-east-1.wasabisys.com
BACKUP_S3_REGION=             # e.g. us-east-1
```

---

# Part B — Server Installation

---

## Phase 0 — Server Pre-flight

**EXECUTE ON:** SERVER  
**AS:** root  
**Access:** initial Contabo root SSH or VNC console

```bash
set -euo pipefail

echo "=== hardware ==="
free -h
df -h /
nproc

echo "=== clock ==="
timedatectl set-ntp true
timedatectl

echo "=== swap ==="
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 8G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
fi

grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
swapon --show

echo "=== kernel tuning ==="
cat > /etc/sysctl.d/99-athyper.conf << 'EOF'
vm.swappiness=10
vm.overcommit_memory=1
EOF

sysctl --system
sysctl vm.swappiness vm.overcommit_memory
```

**Gate verification — run each command and check against expected value:**

```bash
free -h                            # Mem total ≥ your VM's RAM
df -h /                            # at least 50 GB free on /
nproc                              # ≥ 4
timedatectl | grep "synchronized"  # System clock synchronized: yes
swapon --show                      # /swapfile  8G
sysctl vm.swappiness               # vm.swappiness = 10
sysctl vm.overcommit_memory        # vm.overcommit_memory = 1
```

---

## Phase 1 — Base Packages and Docker

**EXECUTE ON:** SERVER  
**AS:** root

### 1.1 Install Base Packages

```bash
set -euo pipefail

apt update
apt upgrade -y
apt install -y \
  curl git jq htop fail2ban postgresql-client unzip \
  ca-certificates gnupg lsb-release openssl sudo nano vim \
  apache2-utils python3

# Verify key tools are on PATH
jq --version
psql --version
```

### 1.2 Install Docker Engine from Official Apt Repo

> **Do not install Docker from snap.** The snap package does not support `live-restore` and
> uses a different socket path that breaks the compose wrapper scripts.

```bash
set -euo pipefail

install -m 0755 -d /etc/apt/keyrings

curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg

chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" \
  > /etc/apt/sources.list.d/docker.list

apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable --now docker

# Verify
docker --version
docker compose version
docker run --rm hello-world
```

### 1.3 Install Node.js 24 and pnpm 10

```bash
set -euo pipefail

curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs

node --version
npm --version

# corepack pins pnpm to the exact version used in package.json.
# Do not use pnpm@latest — the version must match the workspace lockfile.
corepack enable
corepack prepare pnpm@10.33.0 --activate

pnpm --version
```

### 1.4 Configure fail2ban

fail2ban bans IPs that repeatedly fail SSH authentication. Default: 5 failures in 10 min → 1 hour ban.

```bash
cat > /etc/fail2ban/jail.local << 'EOF'
[sshd]
enabled  = true
maxretry = 5
bantime  = 3600
findtime = 600
EOF

systemctl enable --now fail2ban
fail2ban-client status sshd
```

---

## Phase 2 — Create Groups, Service Identities, and Service Account

---

## 2.1 Create Athyper Base Groups

**EXECUTE ON:** SERVER  
**AS:** root

```bash
set -euo pipefail

# Three groups control access to the two-root layout:
#   athyper       — service account's primary group
#   athyper-config — read-only config access for ops accounts and the stack service
#   athyper-data  — group ownership of the data root (no setgid in v13)
groupadd --force --gid 9000 athyper
groupadd --force --gid 9001 athyper-config
groupadd --force --gid 9002 athyper-data

getent group athyper
getent group athyper-config
getent group athyper-data
```

## 2.2 Create v13 Service Users and Groups

**EXECUTE ON:** SERVER  
**AS:** root

> **Why the pre-check matters:** `groupadd --force` exits 0 silently even when the GID is
> already taken by another group. Without this check, a pre-existing group on the server
> could silently claim a reserved GID, causing containers to start under the wrong identity.

```bash
set -euo pipefail

# Pre-check: confirm GIDs 9100–9105 are either free or already claimed by our svc-* groups.
for gid in 9100 9101 9102 9103 9104 9105; do
  if existing=$(getent group "$gid" 2>/dev/null); then
    name=${existing%%:*}
    case "$name" in svc-*) ;;
      *)
        echo "FAIL: GID $gid is already taken by group '$name' — resolve conflict before proceeding"
        exit 1
      ;;
    esac
  fi
done

# Create groups
groupadd --force --gid 9100 svc-redis
groupadd --force --gid 9101 svc-minio
groupadd --force --gid 9102 svc-grafana
groupadd --force --gid 9103 svc-loki
groupadd --force --gid 9104 svc-prometheus
groupadd --force --gid 9105 svc-meili

# Create users — nologin shell prevents interactive login; /nonexistent home prevents
# accidental home directory creation or cron email delivery.
id svc-redis     >/dev/null 2>&1 || useradd --uid 9100 --gid 9100 --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin --comment "Athyper Redis service identity"     svc-redis
id svc-minio     >/dev/null 2>&1 || useradd --uid 9101 --gid 9101 --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin --comment "Athyper MinIO service identity"     svc-minio
id svc-grafana   >/dev/null 2>&1 || useradd --uid 9102 --gid 9102 --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin --comment "Athyper Grafana service identity"   svc-grafana
id svc-loki      >/dev/null 2>&1 || useradd --uid 9103 --gid 9103 --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin --comment "Athyper Loki Tempo service identity" svc-loki
id svc-prometheus >/dev/null 2>&1 || useradd --uid 9104 --gid 9104 --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin --comment "Athyper Prometheus service identity" svc-prometheus
id svc-meili     >/dev/null 2>&1 || useradd --uid 9105 --gid 9105 --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin --comment "Athyper Meili service identity"     svc-meili

# Verify all six identities
id svc-redis && id svc-minio && id svc-grafana && id svc-loki && id svc-prometheus && id svc-meili
```

## 2.3 Create Athyper Service Account

**EXECUTE ON:** SERVER  
**AS:** root

```bash
set -euo pipefail

# System account that owns the stack process. UID/GID 9000 keeps it in the reserved range.
# Locked password prevents direct login; all access is via "sudo -iu athyper" from ops accounts.
id athyper >/dev/null 2>&1 || \
  useradd --system --uid 9000 --gid 9000 --create-home --home-dir /home/athyper --shell /bin/bash athyper

passwd --lock athyper

# usermod groups: required for both interactive "sudo -iu athyper" shells and the
# systemd unit. The systemd SupplementaryGroups= only covers "systemctl start" — it
# does not apply to manual sudo shells. Both are needed.
usermod -aG docker,athyper-config,athyper-data athyper

id athyper
passwd -S athyper   # must show 'L'
groups athyper      # must include docker, athyper-config, athyper-data
```

---

## Phase 3 — Create the Two-Root Filesystem Layout

**EXECUTE ON:** SERVER  
**AS:** root

> **Important:** do not apply per-service data directory ownership here. Phase 11
> (`data-dirs-create.sh`) is the single authority on service-level permissions. Phase 3
> sets only root-level ownership (athyper user, athyper-data group).

```bash
set -euo pipefail

# Product root: git checkout lives here (read-only; runtime processes have no write access)
mkdir -p /opt/products/athyper

# Runtime root: all mutable state — config, secrets, data, logs, backups
mkdir -p /opt/stack/athyper/{config,secrets,data,logs,backups}

# Config subdirs — mirror what setup-config.sh expects on the destination side
mkdir -p /opt/stack/athyper/config/{apps,iam/themes,memorycache,render,telemetry}
mkdir -p /opt/stack/athyper/config/gateway/dynamic
mkdir -p /opt/stack/athyper/config/db/local/dbpool
mkdir -p /opt/stack/athyper/config/telemetry/{logging,metrics,tracing,provisioning}
mkdir -p /opt/stack/athyper/config/telemetry/provisioning.env

# Secrets dir: TLS cert dir is created here; acme.json must be 0600 before gateway starts
mkdir -p /opt/stack/athyper/secrets/gateway/certs

# Data subdirs — leaf ownership is set by Phase 11, not here
mkdir -p /opt/stack/athyper/data/{memorycache,memorycache-jobs,objectstorage,searchcore,analyticsboard,statuswatch}
mkdir -p /opt/stack/athyper/data/telemetry/{logging,metrics,observability,tracing}

# --- Product root permissions ---
chown -R athyper:athyper /opt/products/athyper
chmod 0755 /opt/products/athyper

# --- Stack root permissions ---
chown athyper:athyper /opt/stack/athyper
chmod 0755 /opt/stack/athyper

# Config: root-owned, athyper-config group can read (ops accounts + athyper service account)
chown -R root:athyper-config /opt/stack/athyper/config
find /opt/stack/athyper/config -type d -exec chmod 0755 {} \;
find /opt/stack/athyper/config -type f -exec chmod 0644 {} \;

# Secrets: restricted — only athyper (service account) and root can traverse
chown -R root:athyper /opt/stack/athyper/secrets
chmod 0750 /opt/stack/athyper/secrets
chmod 0750 /opt/stack/athyper/secrets/gateway
chmod 0750 /opt/stack/athyper/secrets/gateway/certs

# .env: only the athyper account can read it (contains all secrets)
touch /opt/stack/athyper/secrets/.env
chown athyper:athyper /opt/stack/athyper/secrets/.env
chmod 0600 /opt/stack/athyper/secrets/.env

# acme.json: Traefik requires mode 0600 or it refuses to write TLS certs
touch /opt/stack/athyper/secrets/gateway/certs/acme.json
chown root:root /opt/stack/athyper/secrets/gateway/certs/acme.json
chmod 0600 /opt/stack/athyper/secrets/gateway/certs/acme.json

# Data root: 0755 — no setgid in v13 (setgid caused incorrect group inheritance under v12)
chown athyper:athyper-data /opt/stack/athyper/data
chmod 0755 /opt/stack/athyper/data
chmod g-s /opt/stack/athyper/data

# Logs and backups: athyper-owned, no group write
chown athyper:athyper /opt/stack/athyper/logs /opt/stack/athyper/backups
chmod 0750 /opt/stack/athyper/logs /opt/stack/athyper/backups

# Verify top-level layout
stat -c '%A %U:%G %a %n' \
  /opt/products/athyper \
  /opt/stack/athyper \
  /opt/stack/athyper/config \
  /opt/stack/athyper/secrets \
  /opt/stack/athyper/data \
  /opt/stack/athyper/logs \
  /opt/stack/athyper/backups
```

---

## Phase 4 — System Hardening

## 4.1 Configure Docker Daemon

**EXECUTE ON:** SERVER  
**AS:** root

```bash
set -euo pipefail

# journald: routes container logs into journald (queryable with journalctl -t <container>).
# live-restore: keeps containers running across Docker daemon restarts (e.g. apt upgrade of docker-ce).
# default-address-pools: avoids bridge IP collisions with existing VPN or cloud subnets.
# no-new-privileges: prevents container processes from gaining capabilities via setuid.
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

chmod 0644 /etc/docker/daemon.json
python3 -c "import json; json.load(open('/etc/docker/daemon.json')); print('JSON valid')"

systemctl restart docker

docker ps
docker info | grep "Logging Driver"   # must show: journald
docker info | grep "Live Restore"     # must show: Enabled
```

## 4.2 Configure journald Limits

**EXECUTE ON:** SERVER  
**AS:** root

```bash
mkdir -p /etc/systemd/journald.conf.d

# Bound journal to 2 GB; rotate anything older than 2 weeks.
# Without this, a verbose service can fill the disk before logshipper drains it.
cat > /etc/systemd/journald.conf.d/athyper.conf << 'EOF'
[Journal]
SystemMaxUse=2G
SystemKeepFree=500M
MaxRetentionSec=2week
EOF

chmod 0644 /etc/systemd/journald.conf.d/athyper.conf
systemctl restart systemd-journald
journalctl --disk-usage
```

## 4.3 SSH Hardening — DEFERRED TO PHASE 26

> **⚠ Do NOT harden SSH here.**
>
> Locking out root login and disabling password auth at Phase 4 means any misconfiguration
> during Phases 5–25 leaves the server unreachable by SSH with no recovery path except VNC.
>
> SSH hardening is the **last step** before declaring the deployment complete. It is performed
> in **Phase 26**, after human accounts are created and their SSH keys are verified, the full
> stack is up, and the reboot drill passes.
>
> Proceed to Phase 4.4.

## 4.4 Configure Scoped Sudoers for athyper

**EXECUTE ON:** SERVER  
**AS:** root

```bash
# Scope sudoers to only systemctl commands for athyper-* services.
# This allows the athyper account to start/stop the stack via systemd without
# granting it unrestricted root shell access.
cat > /etc/sudoers.d/athyper << 'EOF'
athyper ALL=(root) NOPASSWD: \
    /usr/bin/systemctl start athyper-*, \
    /usr/bin/systemctl stop athyper-*, \
    /usr/bin/systemctl restart athyper-*, \
    /usr/bin/systemctl status athyper-*, \
    /usr/bin/systemctl reload athyper-*
EOF

chmod 0440 /etc/sudoers.d/athyper
visudo -c -f /etc/sudoers.d/athyper

# NOPASSWD:ALL must not appear anywhere — cloud-init sometimes adds a rule for the default user
grep -r NOPASSWD:ALL /etc/sudoers* || true
```

The `grep` must return empty. If a cloud-init user rule appears, remove or scope it with `visudo`.

Test — second command must be denied:

```bash
su -s /bin/bash athyper -c "sudo systemctl status athyper-stack 2>&1 || true"
su -s /bin/bash athyper -c "sudo bash -c 'id' 2>&1 || true"
```

---

## Phase 5 — GitHub Deploy Key for athyper

**EXECUTE ON:** SERVER  
**AS:** athyper

```bash
sudo -iu athyper
```

Generate the key:

```bash
set -euo pipefail

mkdir -p /home/athyper/.ssh
chmod 0700 /home/athyper/.ssh

ssh-keygen \
  -t ed25519 \
  -C "athyper-staging-deploy-key" \
  -f /home/athyper/.ssh/github_deploy_key \
  -N ""

# Route github.com connections through this specific key so the athyper account
# does not use any default identity that might be present in ~/.ssh.
cat > /home/athyper/.ssh/config << 'EOF'
Host github.com
    HostName github.com
    User git
    IdentityFile /home/athyper/.ssh/github_deploy_key
    IdentitiesOnly yes
EOF

chmod 0600 /home/athyper/.ssh/config
chmod 0600 /home/athyper/.ssh/github_deploy_key
chmod 0644 /home/athyper/.ssh/github_deploy_key.pub

# Print the public key for pasting into GitHub
cat /home/athyper/.ssh/github_deploy_key.pub
```

**EXECUTE ON:** WORKSTATION — GitHub admin:

```text
GitHub repo → Settings → Deploy keys → Add deploy key
Title: athyper-staging-deploy-key
Allow write access: unchecked (read-only is sufficient for deployment)
```

**EXECUTE ON:** SERVER — verify:

```bash
ssh -T git@github.com
# Expected: Hi atlasdigitaltech/athyper! You've successfully authenticated...
```

---

## Phase 6 — Clone Repository

**EXECUTE ON:** SERVER  
**AS:** athyper

```bash
sudo -iu athyper
```

```bash
set -euo pipefail

# Clone into the product root (read-only side of the two-root layout).
# Runtime config, secrets, and data are never inside this directory.
if [ -d /opt/products/athyper/.git ]; then
  echo "Repository already cloned"
else
  git clone \
    --branch feature/finance-core \
    git@github.com:atlasdigitaltech/athyper.git \
    /opt/products/athyper
fi

cd /opt/products/athyper
git status
git rev-parse HEAD > ~/deploy-record.txt
chmod 0600 ~/deploy-record.txt
cat ~/deploy-record.txt

ls /opt/products/athyper/stack/compose
```

Patch pnpm pin if not already merged upstream:

```bash
if grep -q 'pnpm@latest' /opt/products/athyper/server/Dockerfile.prod; then
  sed -i 's/pnpm@latest/pnpm@10.33.0/' /opt/products/athyper/server/Dockerfile.prod
fi
grep 'pnpm@10.33.0' /opt/products/athyper/server/Dockerfile.prod || true
```

---

## Phase 7 — Compose / Service-User Code Check

**EXECUTE ON:** SERVER  
**AS:** athyper

> **Why this check comes before any `docker compose up`:** If compose files are missing the
> v13 service user mappings, containers will start as root (UID 0) on bind-mounted directories
> owned by `svc-*`. The host write probe and canaries in Phases 12–13 will catch this, but the
> damage (stray root-owned files inside data dirs) is harder to clean up than catching it here.

```bash
cd /opt/products/athyper

grep -R "user:.*9100:9100" stack/compose || echo "WARN: Redis user mapping not found"
grep -R "user:.*9101:9101" stack/compose || echo "WARN: MinIO user mapping not found"
grep -R "user:.*9102:9102" stack/compose || echo "WARN: Grafana user mapping not found"
grep -R "user:.*9103:9103" stack/compose || echo "WARN: Loki/Tempo user mapping not found"
grep -R "user:.*9104:9104" stack/compose || echo "WARN: Prometheus user mapping not found"
grep -R "user:.*9105:9105" stack/compose || echo "WARN: searchcore/analyticsboard/statuswatch user mapping not found"
```

All 6 lines must produce matches. If any mapping is missing, patch the relevant compose file before proceeding.

Expected service-to-identity mappings:

```yaml
memorycache:       user: "9100:9100"   # svc-redis
memorycache-jobs:  user: "9100:9100"   # svc-redis
objectstorage:     user: "9101:9101"   # svc-minio
searchcore:        user: "9105:9105"   # svc-meili
analyticsboard:    user: "9105:9105"   # svc-meili
statuswatch:       user: "9105:9105"   # svc-meili
telemetry:         user: "9102:9102"   # svc-grafana
logging:           user: "9103:9103"   # svc-loki
tracing:           user: "9103:9103"   # svc-loki
metrics:           user: "9104:9104"   # svc-prometheus
```

> **Before Phase 8:** exit the athyper shell to return to root —
> Phase 6 switched you to `athyper`; Phase 8 requires root to write the config tree.

```bash
exit
```

---

## Phase 8 — Deploy Config Files

**EXECUTE ON:** SERVER  
**AS:** root

```bash
set -euo pipefail

cd /opt/products/athyper

# Deploy env-specific config from the git source into the runtime config root.
# setup-config.sh copies db/staging/, gateway/, iam/, memorycache/, render/, telemetry/
# and sets ownership (root:athyper-config 755/644) automatically.
# redis-acl.conf exception: set to athyper:svc-redis 0640 by setup-config.sh so
# validate-env.sh (athyper) can write it and the Redis container (svc-redis) can read it.
ATHYPER_CONFIG_ROOT=/opt/stack/athyper/config \
  bash stack/scripts/setup/setup-config.sh staging

# Gate: verify ACL file ownership before continuing
stat -c "%U:%G %a %n" /opt/stack/athyper/config/memorycache/redis-acl.conf
# Must be: athyper:svc-redis 640

# Gate: no file in the secrets tree must be world-readable
find /opt/stack/athyper/secrets -perm /o+r -ls
# Must return no output
```

---

## Phase 9 — Bootstrap File and Secrets

## 9.1 Create Non-Secret Bootstrap File

**EXECUTE ON:** SERVER  
**AS:** root

> `stack/env/.env` is the non-secret half of the environment (memory limits, image tags,
> hostnames, SMTP config, etc.). `up.sh` passes it as the **first** `--env-file` to Docker
> Compose so staging config is available; the secrets `.env` is passed second and overrides
> any duplicates.

```bash
# Copy all staging non-secret config from the template.
# staging.env.example contains only real values — no ${PLACEHOLDER} lines.
# All secrets come exclusively from the secrets .env (Phase 9.2).
cp /opt/products/athyper/stack/env/staging.env.example \
   /opt/products/athyper/stack/env/.env

# Append only the secrets root. It is intentionally not in staging.env.example:
# this keeps a copied template from accidentally activating two-file mode on
# machines that do not have /opt/stack/athyper/secrets.
cat >> /opt/products/athyper/stack/env/.env << 'EOF'

# Server secrets root (activates bootstrap + secrets env-file mode)
ATHYPER_SECRETS_ROOT=/opt/stack/athyper/secrets
EOF

chmod 0644 /opt/products/athyper/stack/env/.env

# Gate: confirm SERVICE_VERSION is set (not a placeholder)
grep "^SERVICE_VERSION=" /opt/products/athyper/stack/env/.env
# Expected: SERVICE_VERSION=1.0.0
```

## 9.2 + 9.3 Generate Secrets and Write `.env`

**EXECUTE ON:** SERVER  
**AS:** root

> One script does everything: generates the current staging secret inventory, builds the htpasswd,
> saves a backup to `~/secrets-staging-values.txt`, writes the secrets-only
> `/opt/stack/athyper/secrets/.env`, and restores ownership. No manual
> copy-paste required.

**Step 1 — Set your ACME email (the only value you provide):**

```bash
export ACME_EMAIL="ops@atlasdigitaltech.com"   # ← replace with your actual email
```

**Step 2 — Run the script:**

```bash
bash /opt/products/athyper/stack/scripts/setup/write-env-staging.sh
```

Expected output:
```
=== Athyper Staging — Secret Generation + .env Write ===

Step 1/4  Generating 24 secrets...
Step 2/4  Generating gateway htpasswd (pulling httpd:alpine if needed)...
Step 3/4  Writing secrets backup to /home/athyper/secrets-staging-values.txt...
Step 4/4  Writing /opt/stack/athyper/secrets/.env...

=== Done ===

  Secrets backup : /home/athyper/secrets-staging-values.txt  (0600)
  Env file       : /opt/stack/athyper/secrets/.env  (athyper:athyper 600)
```

**Step 3 — Verify:**

```bash
stat -c "%U:%G %a %n" /opt/stack/athyper/secrets/.env
# Must be: athyper:athyper 600

wc -l /opt/stack/athyper/secrets/.env
# Must be non-empty; the exact line count changes as the secrets inventory evolves.
```

> **Re-running:** If you re-run the script it will prompt before overwriting.
> All secrets rotate — re-apply them to every downstream service.
>
> **Secrets backup:** `~/secrets-staging-values.txt` is `0600` and contains all raw
> secret values. Copy it to a password manager, then delete it from the server once
> the stack is confirmed healthy.

> **`CREDENTIAL_MASTER_KEY` — do not duplicate, do not rotate carelessly.**
> This key is used by `CredentialEncryptionService` to AES-encrypt tenant credential
> rows in the database (webhook signing keys, endpoint auth tokens). Two rules:
>
> 1. **One copy only.** If you ever append a second value manually (e.g.
>    `echo CREDENTIAL_MASTER_KEY=... >> secrets/.env`) the containers will start
>    with the wrong key and fail to decrypt existing rows. If this happens, run the
>    deduplication script — it keeps the first (originally provisioned) value:
>    ```bash
>    sudo bash /opt/products/athyper/stack/scripts/setup/patch-missing-secrets.sh
>    ```
>
> 2. **Rotation requires a re-encryption migration (B3.4, not yet implemented).**
>    Do not change the value without coordinating with the team.
>    See `docs/secrets-management.md §6` for the full rotation runbook.

## 9.3 Patching Missing Secrets After an Upgrade

When a new secret variable is added to `write-env-staging.sh` in a later commit, an
already-provisioned server will not have it in its `secrets/.env`. **Do not re-run
`write-env-staging.sh`** — that rotates the full secret inventory and breaks every downstream
service that uses them.

Instead, run the targeted patch script. It adds only the missing variables and
deduplicates any accidental double entries, leaving all existing values untouched:

```bash
sudo bash /opt/products/athyper/stack/scripts/setup/patch-missing-secrets.sh
```

Then restart the affected app tier services as directed by the script output.

---

## Phase 10 — Validate Environment and Render Redis ACL

**EXECUTE ON:** SERVER  
**AS:** athyper

```bash
sudo -iu athyper
```

```bash
set -euo pipefail

# validate-env.sh checks every required variable, enforces non-local security
# policies (NODE_ENV=production, TLS, no dev passwords), and renders redis-acl.conf
# from the ACL template by hashing the Redis passwords.
bash /opt/products/athyper/stack/scripts/setup/validate-env.sh \
  /opt/products/athyper/stack/env/.env \
  /opt/stack/athyper/secrets/.env

# Confirm no template tokens remain in the rendered ACL file.
# Unrendered tokens indicate that sha256sum failed or a Redis password variable is unset.
# GLITCHTIP / INFISICAL are legacy Redis ACL token names; the services are errorcollect / secretstore.
grep -E '__(APP|EXPORTER|GLITCHTIP|INFISICAL|ADMIN)_HASH__' \
  /opt/stack/athyper/config/memorycache/redis-acl.conf && {
    echo "Redis ACL still has template tokens — abort"
    exit 1
  } || true

stat -c "%U:%G %a %n" /opt/stack/athyper/config/memorycache/redis-acl.conf
# Must be: athyper:svc-redis 640
```

If ownership or mode is wrong, fix it:

```bash
sudo chown athyper:svc-redis /opt/stack/athyper/config/memorycache/redis-acl.conf
sudo chmod 0640 /opt/stack/athyper/config/memorycache/redis-acl.conf
```

---

## Phase 11 — Apply v13 Data Directory Ownership

**EXECUTE ON:** SERVER  
**AS:** root

> **This phase is the single authority for service data directory permissions.**
> Do not apply service-level `chown`/`chmod` anywhere else (not in Phase 3, not in cron,
> not in repair scripts unless explicitly instructed). The only repair exception is D.7
> (single-leaf repair without `chown -R`).

```bash
set -euo pipefail

DATA_ROOT=/opt/stack/athyper/data

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: must run as root"
  exit 20
fi

if [ "$DATA_ROOT" != "/opt/stack/athyper/data" ]; then
  echo "ERROR: unexpected DATA_ROOT=$DATA_ROOT"
  exit 21
fi

# Ensure all leaf directories exist before chown (data-dirs-create.sh may have run earlier
# but is idempotent; this recreates any missing dirs defensively).
mkdir -p \
  "$DATA_ROOT/memorycache" \
  "$DATA_ROOT/memorycache-jobs" \
  "$DATA_ROOT/objectstorage" \
  "$DATA_ROOT/searchcore" \
  "$DATA_ROOT/analyticsboard" \
  "$DATA_ROOT/statuswatch" \
  "$DATA_ROOT/telemetry/logging" \
  "$DATA_ROOT/telemetry/metrics" \
  "$DATA_ROOT/telemetry/observability" \
  "$DATA_ROOT/telemetry/tracing"

# Data root: athyper user, athyper-data group, 0755, no setgid
chown athyper:athyper-data "$DATA_ROOT"
chmod 0755 "$DATA_ROOT"
chmod g-s "$DATA_ROOT"   # remove setgid if it was ever set

# Assign each leaf directory to its service identity
chown svc-redis:svc-redis       "$DATA_ROOT/memorycache"
chown svc-redis:svc-redis       "$DATA_ROOT/memorycache-jobs"
chown svc-minio:svc-minio       "$DATA_ROOT/objectstorage"
chown svc-meili:svc-meili       "$DATA_ROOT/searchcore"
chown svc-meili:svc-meili       "$DATA_ROOT/analyticsboard"
chown svc-meili:svc-meili       "$DATA_ROOT/statuswatch"
# telemetry/ parent — intermediate dir; all four svc-* identities need +x to traverse
chown athyper:athyper           "$DATA_ROOT/telemetry"
chmod 0755                      "$DATA_ROOT/telemetry"

chown svc-loki:svc-loki         "$DATA_ROOT/telemetry/logging"
chown svc-prometheus:svc-prometheus "$DATA_ROOT/telemetry/metrics"
chown svc-grafana:svc-grafana   "$DATA_ROOT/telemetry/observability"
chown svc-loki:svc-loki         "$DATA_ROOT/telemetry/tracing"

# 0750: owner (svc-*) can read/write; group member can read; world has no access.
# 0750 is tighter than 0770 — group-write is unnecessary because the container runs
# as the owner (user: "910x:910x" in compose), and extra write access would expose
# future group members.
chmod 0750 \
  "$DATA_ROOT/memorycache" \
  "$DATA_ROOT/memorycache-jobs" \
  "$DATA_ROOT/objectstorage" \
  "$DATA_ROOT/searchcore" \
  "$DATA_ROOT/analyticsboard" \
  "$DATA_ROOT/statuswatch" \
  "$DATA_ROOT/telemetry/logging" \
  "$DATA_ROOT/telemetry/metrics" \
  "$DATA_ROOT/telemetry/observability" \
  "$DATA_ROOT/telemetry/tracing"

# Remove setgid from all leaves (belt-and-suspenders; setgid on leaf dirs has no benefit
# with the owner-based 0750 model and can silently change file group on creation).
chmod g-s \
  "$DATA_ROOT/memorycache" \
  "$DATA_ROOT/memorycache-jobs" \
  "$DATA_ROOT/objectstorage" \
  "$DATA_ROOT/searchcore" \
  "$DATA_ROOT/analyticsboard" \
  "$DATA_ROOT/statuswatch" \
  "$DATA_ROOT/telemetry/logging" \
  "$DATA_ROOT/telemetry/metrics" \
  "$DATA_ROOT/telemetry/observability" \
  "$DATA_ROOT/telemetry/tracing"

# Verify final state
stat -c '%A %U:%G %a %n' \
  "$DATA_ROOT" \
  "$DATA_ROOT/memorycache" \
  "$DATA_ROOT/memorycache-jobs" \
  "$DATA_ROOT/objectstorage" \
  "$DATA_ROOT/searchcore" \
  "$DATA_ROOT/analyticsboard" \
  "$DATA_ROOT/statuswatch" \
  "$DATA_ROOT/telemetry/logging" \
  "$DATA_ROOT/telemetry/metrics" \
  "$DATA_ROOT/telemetry/observability" \
  "$DATA_ROOT/telemetry/tracing"
```

Expected:

```text
/opt/stack/athyper/data                   athyper:athyper-data 755
memorycache                               svc-redis:svc-redis 750
memorycache-jobs                          svc-redis:svc-redis 750
objectstorage                             svc-minio:svc-minio 750
searchcore                                svc-meili:svc-meili 750
analyticsboard                            svc-meili:svc-meili 750
statuswatch                               svc-meili:svc-meili 750
telemetry/logging                         svc-loki:svc-loki 750
telemetry/metrics                         svc-prometheus:svc-prometheus 750
telemetry/observability                   svc-grafana:svc-grafana 750
telemetry/tracing                         svc-loki:svc-loki 750
```

---

## Phase 12 — Mandatory Host Write Probe

**EXECUTE ON:** SERVER  
**AS:** root

> **Do not start any containers if this probe fails.** A passing host probe and a failing
> container canary (Phase 13) indicates a stale Docker mount cache or image UID drift.
> A failing host probe here indicates a real ownership problem — fix Phase 11 first.

```bash
set -euo pipefail

for spec in \
  "svc-redis:svc-redis:/opt/stack/athyper/data/memorycache" \
  "svc-redis:svc-redis:/opt/stack/athyper/data/memorycache-jobs" \
  "svc-minio:svc-minio:/opt/stack/athyper/data/objectstorage" \
  "svc-meili:svc-meili:/opt/stack/athyper/data/searchcore" \
  "svc-meili:svc-meili:/opt/stack/athyper/data/analyticsboard" \
  "svc-meili:svc-meili:/opt/stack/athyper/data/statuswatch" \
  "svc-loki:svc-loki:/opt/stack/athyper/data/telemetry/logging" \
  "svc-prometheus:svc-prometheus:/opt/stack/athyper/data/telemetry/metrics" \
  "svc-grafana:svc-grafana:/opt/stack/athyper/data/telemetry/observability" \
  "svc-loki:svc-loki:/opt/stack/athyper/data/telemetry/tracing"
do
  IFS=: read -r user group path <<< "$spec"
  sudo -u "$user" -g "$group" sh -c "touch '$path/.write_probe' && rm '$path/.write_probe'" \
    && echo "OK $user:$group $path" \
    || { echo "FAIL $user:$group $path"; exit 1; }
done
```

---

## Phase 13 — Mandatory Container Canaries

**EXECUTE ON:** SERVER  
**AS:** root

> **Why canaries are separate from the host probe:** A host probe runs as a Linux user; a
> container canary runs the real image under the real UID inside a real Docker mount. They
> catch different failure modes. A host probe passing but a canary failing indicates a stale
> Docker mount cache or image UID drift — not a host permission problem.

### 13.1 Redis Canary

```bash
docker run --rm \
  --name athyper-canary-redis \
  --user 9100:9100 \
  -v /opt/stack/athyper/data/memorycache:/data \
  -v /opt/stack/athyper/config/memorycache/cache.conf:/usr/local/etc/redis/redis.conf:ro \
  -v /opt/stack/athyper/config/memorycache/redis-acl.conf:/usr/local/etc/redis/redis-acl.conf:ro \
  redis:7.4.8-alpine \
  sh -c '
    id
    cd /data
    # Step 1: file write test — this is the actual permission gate
    touch canary-write && rm canary-write

    # Step 2: config syntax smoke test (timeout + || true so a crash here does not block the gate)
    # A crash here indicates a config problem, not a permission failure.
    timeout 5 redis-server /usr/local/etc/redis/redis.conf || true
  '
```

If the write test fails on RDB/dump, ensure the Redis cache config contains:

```conf
save ""
appendonly no
dir /data
dbfilename dump.rdb
```

### 13.2 MinIO Canary

```bash
# This exercises .minio.sys/tmp/... — the exact path that failed under v12 numeric UIDs.
# MinIO creates this internal directory tree on first write; if the service UID cannot
# create it, MinIO starts but silently fails to store objects.
docker run --rm \
  --name athyper-canary-minio \
  --user 9101:9101 \
  --entrypoint sh \
  -v /opt/stack/athyper/data/objectstorage:/data \
  minio/minio:RELEASE.2025-09-07T16-13-09Z \
  -c 'mkdir -p /data/.minio.sys/tmp && touch /data/.minio.sys/tmp/probe && rm -r /data/.minio.sys && echo OK'
```

### 13.3 searchcore Canary

```bash
docker run --rm \
  --user 9105:9105 \
  -v /opt/stack/athyper/data/searchcore:/meili_data \
  alpine:3.20 sh -c 'touch /meili_data/.write-test && rm /meili_data/.write-test && echo OK'
```

### 13.4 Telemetry Canaries

```bash
# Run all four telemetry canaries and check each prints its label
docker run --rm --user 9102:9102 -v /opt/stack/athyper/data/telemetry/observability:/data \
  alpine:3.20 sh -c 'touch /data/.write-test && rm /data/.write-test && echo grafana-ok'

docker run --rm --user 9103:9103 -v /opt/stack/athyper/data/telemetry/logging:/data \
  alpine:3.20 sh -c 'touch /data/.write-test && rm /data/.write-test && echo loki-ok'

docker run --rm --user 9104:9104 -v /opt/stack/athyper/data/telemetry/metrics:/data \
  alpine:3.20 sh -c 'touch /data/.write-test && rm /data/.write-test && echo prometheus-ok'

docker run --rm --user 9103:9103 -v /opt/stack/athyper/data/telemetry/tracing:/data \
  alpine:3.20 sh -c 'touch /data/.write-test && rm /data/.write-test && echo tempo-ok'
```

---

## Phase 14 — Compose Render Validation

**EXECUTE ON:** SERVER  
**AS:** athyper

> **Why render validation is mandatory:** The class of failure that caused silent stack
> misconfiguration in v12 was unresolved compose variables (`${VAR}` unexpanded → blank
> bind mount source → service silently writes to `/`). This check catches that class before
> any container starts.

```bash
sudo -iu athyper
cd /opt/products/athyper

# Resolve the wrapper environment without starting containers.
SCRIPT_DIR=/opt/products/athyper/stack/scripts/stack-profile
source "$SCRIPT_DIR/../lib/compose.sh"
init_compose_env
resolve_compose_override
build_compose_file_list

printf 'ATHYPER_CONFIG = %s\n' "$ATHYPER_CONFIG"
printf 'ATHYPER_DATA   = %s\n' "$ATHYPER_DATA"
printf 'ENV_FILE       = %s\n' "$ENV_FILE"
```

Full render validation — abort on any unresolved variable or blank bind mount:

```bash
ALL_COMPOSE_PROFILES="admin,analytics,apps,core,db,dev,emergency,gateway,iam,memorycache,memorycache-jobs,monitoring,objectstorage,render,search,security-infisical,telemetry"
COMPOSE_PROFILES="$ALL_COMPOSE_PROFILES" docker compose \
  --project-directory "$COMPOSE_DIR" \
  "${ENV_FILE_ARGS[@]}" \
  "${COMPOSE_FILE_ARGS[@]}" \
  config > /tmp/athyper-compose.rendered.yml

# Unresolved ${VAR} in a compose config is always a bug — the variable is missing from .env
grep -n '\${' /tmp/athyper-compose.rendered.yml && {
  echo "Unresolved compose variable found — abort"
  exit 1
} || echo "No unresolved variables"

# Blank bind mount source means a path variable evaluated to empty — container would bind /
grep -n 'source: ""' /tmp/athyper-compose.rendered.yml && {
  echo "Blank bind mount source found — abort"
  exit 1
} || echo "No blank bind mounts"
```

---

## Phase 15 — Build Application Images

**EXECUTE ON:** SERVER  
**AS:** athyper

```bash
sudo -iu athyper
cd /opt/products/athyper

# Install workspace dependencies (node_modules for the build step)
pnpm install --frozen-lockfile
```

Build the app images:

```bash
# Build with the same compose/env resolution used by up.sh.
SCRIPT_DIR=/opt/products/athyper/stack/scripts/stack-profile
source "$SCRIPT_DIR/../lib/compose.sh"
init_compose_env
resolve_compose_override
build_compose_file_list

COMPOSE_PROFILES=core,apps docker compose \
  --project-directory "$COMPOSE_DIR" \
  "${ENV_FILE_ARGS[@]}" \
  "${COMPOSE_FILE_ARGS[@]}" \
  build neon-web mesh-web admin-web api worker scheduler
```

Verify images were produced:

```bash
docker images | grep athyper
```

---

## Phase 16 — Start Core Infrastructure Only

**EXECUTE ON:** SERVER  
**AS:** athyper

> Start the `core` profile only at this stage — do not start `all` yet. Core brings up the
> minimum set needed to seed the database and validate connectivity before launching the
> application tier.

```bash
sudo -iu athyper
cd /opt/products/athyper

bash stack/scripts/stack-profile/up.sh core
```

Check core containers are running:

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'db|dbpool|memorycache|objectstorage|gateway|iam|socket'
docker logs athyper-memorycache-1 --tail 80
docker logs athyper-objectstorage-1 --tail 80
```

Verify core service health:

```bash
docker exec athyper-db-1 pg_isready || true
docker exec athyper-dbpool-apps-1 pg_isready -h 127.0.0.1 -p 6432 || true
docker exec athyper-dbpool-session-1 pg_isready -h 127.0.0.1 -p 6433 || true
docker exec athyper-memorycache-1 redis-cli ping   # must return PONG
docker exec athyper-objectstorage-1 sh -c 'echo objectstorage-running'
```

If Redis fails with a permissions error:

```bash
# Inspect the actual mount sources — confirms compose resolved paths correctly
docker inspect athyper-memorycache-1 \
  --format '{{range .Mounts}}{{println .Source "->" .Destination "RW=" .RW}}{{end}}'

stat -c '%A %U:%G %a %n' /opt/stack/athyper/data/memorycache
ls -lan /opt/stack/athyper/data/memorycache
# Ownership must be svc-redis:svc-redis (9100:9100), mode 0750
```

---

## Phase 16.1 — Object Storage Bucket Initialisation

**EXECUTE ON:** SERVER  
**AS:** athyper

> **This step is automatic on a clean start — but requires explicit verification.**
>
> `objectstorage-init` is a one-shot sidecar that runs immediately after MinIO becomes
> healthy. It creates all four required buckets, configures scoped IAM service accounts
> (staging/production only), and applies object lifecycle (ILM) rules. It has
> `restart: "no"` — if it exits with an error it will **not** retry automatically.
> You must verify it succeeded and re-run it manually if it did not.

### Required Buckets

| Variable | Bucket Name | Used by |
|---|---|---|
| `S3_BUCKET` | `athyper-staging` (or as set in secrets/.env) | API — attachments, content, imports |
| `BACKUP_S3_BUCKET` | `athyper-backups` | Database backup worker |
| `TEMPO_S3_BUCKET` | `athyper-tempo-traces` | Grafana Tempo distributed traces |
| `LOKI_S3_BUCKET` | `athyper-loki-logs` | Grafana Loki log storage |

### Step 1 — Confirm the init container ran and exited 0

```bash
# Check exit status — must be "Exited (0)"
docker ps -a --filter name=objectstorage-init --format 'table {{.Names}}\t{{.Status}}'

# Tail the init log for the four bucket creation lines
docker logs athyper-objectstorage-init-1 2>&1 | tail -20
```

Expected output includes lines like:

```text
[objectstorage-init] connecting to MinIO (http://objectstorage:9000) for staging...
[objectstorage-init] buckets ready: athyper-staging, athyper-backups, athyper-tempo-traces, athyper-loki-logs
[objectstorage-init] policies created
[objectstorage-init] users ready
[objectstorage-init] policies attached
[objectstorage-init] ILM lifecycle rules configured
[objectstorage-init] provisioning complete
```

### Step 2 — Run the verification script

```bash
bash /opt/products/athyper/stack/scripts/setup/verify-objectstorage.sh \
  /opt/products/athyper/stack/env/.env \
  /opt/stack/athyper/secrets/.env
```

All four `[2/4] Buckets` lines must show `OK`. All four `[4/4] Scoped service accounts`
lines must show `OK` for staging/production.

### Recovery — if init failed or buckets are missing

The init container is idempotent — safe to force-recreate at any time.

```bash
# Identify which compose files are active (copy from the up.sh --env-file invocation)
cd /opt/products/athyper

# Force-recreate only the init container (MinIO must already be healthy)
bash stack/scripts/stack-profile/up.sh objectstorage
```

> `up.sh objectstorage` targets the `objectstorage` compose profile, which includes both
> `objectstorage` and `objectstorage-init`. Docker Compose will recreate the init container
> if it previously exited (even with exit 0).

If `up.sh` is not available or the init container still fails, create the buckets and
service accounts manually:

```bash
# Run mc directly — MinIO must be healthy on the edge network
SECRETS=/opt/stack/athyper/secrets/.env
S3_KEY=$(grep ^S3_ACCESS_KEY "$SECRETS" | cut -d= -f2)
S3_SEC=$(grep ^S3_SECRET_KEY "$SECRETS" | cut -d= -f2)
S3_BKT=$(grep ^S3_BUCKET     "$SECRETS" | cut -d= -f2)

docker run --rm \
  -e MC_CONFIG_DIR=/tmp/.mc \
  --network athyper-edge \
  --entrypoint /bin/sh \
  minio/mc:RELEASE.2025-08-13T08-35-41Z \
  -c "
    mc alias set storage http://objectstorage:9000 \"$S3_KEY\" \"$S3_SEC\"
    mc mb --ignore-existing storage/$S3_BKT
    mc mb --ignore-existing storage/athyper-backups
    mc mb --ignore-existing storage/athyper-tempo-traces
    mc mb --ignore-existing storage/athyper-loki-logs
    mc ls storage
  "
```

> **Scoped service accounts** (APP, BACKUP, TEMPO, LOKI IAM policies + users) are only
> created by `objectstorage-init` — they cannot be recreated by the manual `mc mb` command
> above. If accounts are missing, force-recreate the init container via `up.sh objectstorage`.

Re-run `verify-objectstorage.sh` after recovery to confirm all checks pass.

---

## Phase 17 — Database Seed

**EXECUTE ON:** SERVER  
**AS:** athyper (all steps)

> **Prerequisites for this phase:**
> - Phase 1.3 installed Node.js 24 — `node` and `npx` are on PATH ✓
> - Phase 16 started core infrastructure — `athyper-db-1` is healthy ✓
>
> **`server/` uses npm, not pnpm.**  
> The root `pnpm install` (Phase 15) installs the `apps/` frontend workspace only.
> `server/` is an independent npm package with its own `package-lock.json`.
> Its dependencies (`pg`, `tsx`, etc.) must be installed separately before seeding.
>
> **Why DATABASE_ADMIN_URL must use the container IP:**
> Postgres is on the `athyper-internal` Docker network (`internal: true`). There is no
> `localhost:5432` port publishing — the database is intentionally unreachable from the
> internet. The seed script runs on the host; to reach postgres it must connect to the
> container's IP on the Docker bridge. The host's bridge interface (`10.200.0.1`) can reach
> container IPs directly, and `pg_hba.conf` permits `10.0.0.0/8` with scram-sha-256.

### 17.1 Install workspace dependencies

`server/` is a **pnpm workspace member** (listed in `pnpm-workspace.yaml`). Its
dependencies use the `workspace:*` protocol which only pnpm understands — running
`npm install` inside `server/` will fail with `EUNSUPPORTEDPROTOCOL`.

Run `pnpm install` from the **repo root** to install all workspace packages,
including `server/node_modules`:

```bash
sudo -iu athyper
cd /opt/products/athyper

# Installs all workspace packages: apps/, packages/, server/, server/packages/...
# This is the same command Phase 15 runs for the image build; if Phase 15 already
# ran successfully, node_modules will be up to date and this will be a no-op.
pnpm install --frozen-lockfile

# Verify pg is present in the server workspace
node -e "require('/opt/products/athyper/server/node_modules/pg'); console.log('pg ok')"
```

Expected:

```
Packages: N added (...)
pg ok
```

> **Re-runs:** `pnpm install --frozen-lockfile` is idempotent. Safe to run again
> after a `git pull` that changes dependencies.

### 17.2 Run the seed

```bash
sudo -iu athyper
cd /opt/products/athyper

# Verify the database is accessible (unix-socket peer auth — must succeed before seeding)
docker exec athyper-db-1 psql -U postgres -l
# Expected: 7 databases listed (athyper_neon, athyper_mesh, athyper_iam, ...)
# If this fails check: docker logs athyper-db-1 --tail 50

# Get the DB container's IP on the internal Docker bridge
DB_IP=$(docker inspect athyper-db-1 \
  --format '{{(index .NetworkSettings.Networks "athyper-internal").IPAddress}}')
echo "DB container IP: ${DB_IP}"

# Extract the admin password from secrets and percent-encode it for URL safety.
# Base64 passwords contain '+' and '/' which are reserved URL characters — embedding
# them verbatim in a postgresql:// URL causes "TypeError: Invalid URL" in Node.js.
DB_PASS=$(grep '^DB_ADMIN_PASSWORD=' /opt/stack/athyper/secrets/.env | cut -d= -f2-)
DB_PASS_ENC=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$DB_PASS")

# Pre-export DATABASE_ADMIN_URL with the container IP so the seed script uses it directly.
# IMPORTANT: postgres superuser is "postgres", NOT "athyperadmin".
# "athyperadmin" is the local dbconsole HTTP login — it is not a staging database user.
export DATABASE_ADMIN_URL="postgresql://postgres:${DB_PASS_ENC}@${DB_IP}:5432/athyper_neon"
echo "Seed target: ${DB_IP}:5432/athyper_neon"

# Run all phases: DDL + platform seed + blueprints + tenant data
bash /opt/products/athyper/stack/scripts/db/transaction/neon/seed-db.sh --all
```

Expected output (abridged):

```
=== Athyper Database Seed ===
Database : <container-ip>:5432/athyper_neon
Server   : /opt/products/athyper/server
Tenant ID: (not set — Phase 3 files use baked-in UUIDs)
Arguments: --all
...
=== Seed complete ===
```

If the seed fails partway through, it is safe to re-run — `migrate.ts` tracks applied files
by checksum and skips any file that has not changed since the last run.

After seed, confirm postgres port is not exposed on the host:

```bash
# Port 5432 must NOT appear — database is reachable only from within the Docker network.
ss -tln | grep 5432 || true
# Expected: no output
```

---

## Phase 18 — IAM / Keycloak Bootstrap

**EXECUTE ON:** SERVER  
**AS:** athyper

```bash
sudo -iu athyper
cd /opt/products/athyper

# Pre-flight: validate all importable realms and fail on duplicate authenticatorConfig UUIDs.
DUPES=$(
  for file in /opt/stack/athyper/config/iam/realm-athyper.json \
              /opt/stack/athyper/config/iam/realm-platform-control.json; do
  jq empty "$file"
  jq -r '.authenticatorConfig[]?.id // empty' "$file"
  done | sort | uniq -d
)
test -z "$DUPES" || { echo "Duplicate authenticatorConfig IDs:"; echo "$DUPES"; exit 1; }

bash /opt/products/athyper/stack/scripts/db/session/iam/reset-iam.sh

# Verify current realm discovery endpoints are reachable.
for realm in neon mesh admin platform-control; do
  curl -sf "https://iam-stg.athyper.com/realms/${realm}/.well-known/openid-configuration" | jq .issuer
done
```

Open the Keycloak admin UI, confirm the `athyper-api-runtime` client secret in the Neon
realm matches `IAM_CLIENT_SECRET` in `.env`.
If it differs, update `.env` and re-run:

```bash
bash /opt/products/athyper/stack/scripts/setup/validate-env.sh \
  /opt/products/athyper/stack/env/.env \
  /opt/stack/athyper/secrets/.env
```

---

## Phase 19 — Start Application Tier

**EXECUTE ON:** SERVER  
**AS:** athyper

```bash
sudo -iu athyper
cd /opt/products/athyper

bash stack/scripts/stack-profile/up.sh apps
```

Verify containers and logs:

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'athyper-(api|worker|scheduler|neon-web|mesh-web|admin-web)'

docker logs athyper-api-1 --tail 100
docker logs athyper-neon-web-1 --tail 100
docker logs athyper-mesh-web-1 --tail 100
docker logs athyper-admin-web-1 --tail 100
```

External smoke check:

```bash
curl -sf https://api-stg.athyper.com/livez
curl -sf https://api-stg.athyper.com/readyz
curl -sf https://neon-stg.athyper.com/livez
curl -sf https://mesh-stg.athyper.com/livez
curl -sf https://admin-stg.athyper.com/livez
```

TLS issuer check:

```bash
echo | openssl s_client -connect api-stg.athyper.com:443 2>/dev/null | openssl x509 -issuer -noout
# Expected: issuer=CN=R11,O=Let's Encrypt,C=US (not the ACME staging CA)
```

---

## Phase 20 — Start Secondary Profiles

**EXECUTE ON:** SERVER  
**AS:** athyper

Start one profile at a time — checking logs after each before proceeding:

```bash
sudo -iu athyper
cd /opt/products/athyper

bash stack/scripts/stack-profile/up.sh telemetry
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'telemetry|logging|metrics|tracing|logshipper'

bash stack/scripts/stack-profile/up.sh monitoring
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'errorcollect|cronwatch|statuswatch'

bash stack/scripts/stack-profile/up.sh render
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'docrender|docparser'

bash stack/scripts/stack-profile/up.sh search
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'searchcore'
```

Verify neither gateway nor logshipper has a direct Docker socket mount:

```bash
docker inspect athyper-gateway-1 \
  | jq '.[0].HostConfig.Binds | map(select(contains("docker.sock")))'

docker inspect athyper-logshipper-1 \
  | jq '.[0].HostConfig.Binds | map(select(contains("docker.sock")))'
# Both outputs must be: []
```

---

## Phase 21 — Full Smoke Test

**EXECUTE ON:** SERVER  
**AS:** athyper

```bash
sudo -iu athyper
cd /opt/products/athyper

# Three verification scripts must all pass
bash /opt/products/athyper/stack/scripts/smoke-staging.sh                # 8 health check groups
bash /opt/products/athyper/stack/scripts/setup/verify-objectstorage.sh \
  /opt/products/athyper/stack/env/.env \
  /opt/stack/athyper/secrets/.env        # [2/4] all 4 buckets OK + [4/4] all 4 scoped accounts OK
                                         # On failure → see Phase 16.1 Recovery
bash /opt/products/athyper/stack/scripts/setup/verify-port-hardening.sh # no exposed DB/Redis ports

docker ps --format 'table {{.Names}}\t{{.Status}}'
```

Browser check from workstation:

```text
Open https://neon-stg.athyper.com
Login with the configured demo user
Confirm the application loads without errors
```

---

## Phase 22 — Install systemd Service

**EXECUTE ON:** SERVER  
**AS:** root

```bash
cat > /etc/systemd/system/athyper-stack.service << 'EOF'
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

# Six-root paths injected here so the systemd unit does not depend on the bootstrap .env.
# This is the production-safe pattern: paths in the unit, secrets on disk.
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

# ExecStartPre validates the .env before attempting to start containers.
# If validation fails, the stack never starts and systemd marks the unit failed.
ExecStartPre=/bin/bash /opt/products/athyper/stack/scripts/setup/validate-env.sh /opt/products/athyper/stack/env/.env /opt/stack/athyper/secrets/.env
ExecStartPre=/bin/bash -c 'until docker info >/dev/null 2>&1; do sleep 1; done'
ExecStart=/bin/bash stack/scripts/stack-profile/up.sh all
ExecStop=/bin/bash stack/scripts/stack-profile/down.sh all
TimeoutStartSec=900

[Install]
WantedBy=multi-user.target
EOF

chmod 0644 /etc/systemd/system/athyper-stack.service

systemctl daemon-reload
systemctl enable athyper-stack

# Review systemd security score (informational)
systemd-analyze security athyper-stack || true
```

Start via systemd **only after** Phase 21 smoke test has passed:

```bash
systemctl start athyper-stack
systemctl status athyper-stack --no-pager
# Expected: active (exited) — oneshot service; containers are running
```

---

## Phase 23 — Backup Setup

**EXECUTE ON:** SERVER  
**AS:** athyper for script test, root for cron file

### Step 1 — Manual test before enabling cron

```bash
sudo -iu athyper
cd /opt/products/athyper

mkdir -p /opt/stack/athyper/backups
mkdir -p /opt/stack/athyper/logs

ls stack/scripts/db/backup-all.sh

# --no-upload: dump to /opt/stack/athyper/backups/<timestamp>/ without pushing to S3.
# Run this first to confirm pg_dump credentials and connectivity are working.
bash stack/scripts/db/backup-all.sh --no-upload
```

Expected: dumps written to `/opt/stack/athyper/backups/<timestamp>/` with no errors.

### Step 2 — Configure offsite credentials

```bash
grep BACKUP_REMOTE /opt/stack/athyper/secrets/.env
# BACKUP_REMOTE_S3_ENDPOINT  — offsite S3-compatible URL (Wasabi / B2 / remote MinIO)
# BACKUP_REMOTE_S3_ACCESS_KEY
# BACKUP_REMOTE_S3_SECRET_KEY
# BACKUP_REMOTE_S3_BUCKET
```

The local `/opt/stack/athyper/backups` is a staging area only — disk failure on this server
would destroy both the data and the local backup. Offsite push is mandatory.

### Step 3 — Install cron (after manual test confirms success)

```bash
# As root:
cat > /etc/cron.d/athyper-backup << 'EOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# Daily at 02:00 UTC — runs as athyper
0 2 * * * athyper cd /opt/products/athyper && /bin/bash stack/scripts/db/backup-all.sh >> /opt/stack/athyper/logs/backup.log 2>&1
EOF

chmod 0644 /etc/cron.d/athyper-backup
cat /etc/cron.d/athyper-backup
```

Verify at least one backup reaches the offsite bucket before declaring this phase complete.

---

## Phase 24 — Secrets Mirror and Cleanup

**EXECUTE ON:** SERVER / Infisical UI  
**AS:** athyper / operator

Import all generated secrets from `~/secrets-staging-values.txt` into secretstore / Infisical
(or your chosen secrets manager). The on-disk `.env` is a materialized runtime cache — the secret manager is the
source of truth.

After confirming the import:

```bash
sudo -iu athyper

# Securely delete the plaintext staging secrets file (shred overwrites before unlinking)
shred -u ~/secrets-staging-values.txt
ls ~/secrets-staging-values.txt || true   # must show: No such file or directory
```

---

## Phase 25 — Reboot Drill

**EXECUTE ON:** SERVER  
**AS:** root or athyper

```bash
reboot
```

After reconnect (target: within 10 minutes):

```bash
ssh root@<SERVER_PUBLIC_IP>

# Confirm systemd brought the stack up automatically
docker ps --format 'table {{.Names}}\t{{.Status}}'
systemctl status athyper-stack --no-pager

# Full smoke test — all 8 groups must pass
sudo -iu athyper
cd /opt/products/athyper
bash /opt/products/athyper/stack/scripts/smoke-staging.sh
```

All core containers must be `Up` and smoke test must pass. Only then proceed to Phase 26.

---

## Phase 26 — Final SSH Hardening

**EXECUTE ON:** SERVER  
**AS:** root

> This is the last phase. It rotates the root password, creates human operator accounts,
> installs their SSH keys, and then locks down SSH. Order matters: verify key-based login
> **before** disabling password auth.

**Prerequisites:** Phase 25 (Reboot Drill) complete. All containers `Up`. Smoke test passing.

> **Keep your current root session open the entire time.**  
> Do not close it until you have verified key login from a second terminal (Step D).  
> If the new config breaks login, the open session is your rollback path.

### Step A — Rotate Root Password

```bash
passwd root
```

Store the new root password in the vault **immediately**. After Step E (SSH config reload),
root SSH is disabled — VNC console is the only break-glass path from that point on.

### Step B — Create Human Operator Accounts

```bash
# Primary ops account — full sudo + docker + config read access
adduser --gecos "Chandravel Natarajan" nchandravel-atlas
usermod -aG sudo,docker,athyper-config nchandravel-atlas
id nchandravel-atlas

# Optional generic ops account
adduser --gecos "ops admin" ops-admin
usermod -aG sudo,docker,athyper-config ops-admin
id ops-admin

# Developer read-only inspector (config read only — no sudo, no docker)
adduser --gecos "Manoj Rajendran" rmanoj-atlas
usermod -aG athyper-config rmanoj-atlas
id rmanoj-atlas
```

**Role matrix:**

```text
ops-admin role:       sudo + docker + athyper-config
dev-inspector role:   athyper-config only
No human user gets svc-* groups.
No human user gets both sudo and docker unless explicitly approved.
```

### Step C — Install SSH Public Keys

```bash
USERNAME="nchandravel-atlas"

mkdir -p "/home/$USERNAME/.ssh"
chmod 0700 "/home/$USERNAME/.ssh"
touch "/home/$USERNAME/.ssh/authorized_keys"
chmod 0600 "/home/$USERNAME/.ssh/authorized_keys"

# Paste the real ed25519 public key:
echo "ssh-ed25519 AAAA... chandravel.natarajan@atlasdigitaltech.com" >> "/home/$USERNAME/.ssh/authorized_keys"

chown -R "$USERNAME:$USERNAME" "/home/$USERNAME/.ssh"

# Verify
ls -la "/home/$USERNAME/.ssh"
cat "/home/$USERNAME/.ssh/authorized_keys"
```

Repeat for each ops account, then verify all:

```bash
for u in nchandravel-atlas ops-admin rmanoj-atlas; do
  echo "=== $u ==="
  id "$u" 2>/dev/null || true
  ls -la "/home/$u/.ssh/" 2>/dev/null || true
done
```

### Step D — Write and validate the SSH config

```bash
cat > /etc/ssh/sshd_config.d/athyper.conf << 'EOF'
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
AllowGroups sudo athyper-config

# athyper account must never be reachable interactively via SSH
Match User athyper
    ForceCommand /usr/sbin/nologin
EOF

chmod 0644 /etc/ssh/sshd_config.d/athyper.conf

# Validate before applying — any syntax error exits non-zero and stops the script
sshd -t && echo "sshd config OK"
```

### Step E — Reload and verify from a second terminal

```bash
systemctl reload sshd
```

**EXECUTE ON:** WORKSTATION — open a **new terminal** (do not close the existing one):

```bash
ssh nchandravel-atlas@<SERVER_PUBLIC_IP>
id
# Expected: uid matches ops account; groups include sudo or athyper-config
```

Login must succeed with the key, no password prompt.

### Step F — Confirm root and athyper are blocked

```bash
# root SSH must be refused
ssh root@<SERVER_PUBLIC_IP> 2>&1 | grep -i "denied\|not allowed\|closed" || true

# athyper must connect but immediately be ejected (ForceCommand = nologin)
ssh athyper@<SERVER_PUBLIC_IP> 2>&1 | grep -i "nologin\|not allowed\|closed" || true
```

### Step G — VNC break-glass verification

```text
VNC: provider console
Login: root  (use the vault password set in Step A of this phase)
Verify: id returns root; docker ps shows running containers
```

Root via VNC is the only break-glass path after this phase. Root SSH no longer works.

### Step H — SSH hardening checklist

```text
[ ] root SSH disabled — ssh root@<SERVER> returns Permission denied
[ ] password SSH disabled — PasswordAuthentication no in sshd_config.d/athyper.conf
[ ] key login verified — ops account logs in without password prompt in new terminal
[ ] athyper direct SSH blocked — ForceCommand nologin; connection drops immediately
[ ] VNC / root break-glass verified — root login via VNC console confirmed working
```

---

# Part C — Post-Deploy Verification

**EXECUTE ON:** SERVER  
**AS:** root or athyper as noted

---

## C.1 Security Checks

**AS:** root

```bash
# No world-readable files in the secrets directory
find /opt/stack/athyper/secrets -perm /o+r -ls

# No unrestricted sudo — NOPASSWD:ALL must not appear anywhere
grep -r NOPASSWD:ALL /etc/sudoers* || true

# No world-writable files in config
find /opt/stack/athyper/config -perm /022 -ls
```

All three commands must return no output.

## C.2 Data Ownership Checks

**AS:** root

```bash
stat -c '%A %U:%G %a %n' \
  /opt/stack/athyper/data \
  /opt/stack/athyper/data/memorycache \
  /opt/stack/athyper/data/memorycache-jobs \
  /opt/stack/athyper/data/objectstorage \
  /opt/stack/athyper/data/searchcore \
  /opt/stack/athyper/data/analyticsboard \
  /opt/stack/athyper/data/statuswatch \
  /opt/stack/athyper/data/telemetry/logging \
  /opt/stack/athyper/data/telemetry/metrics \
  /opt/stack/athyper/data/telemetry/observability \
  /opt/stack/athyper/data/telemetry/tracing
```

Expected:

```text
data root:  athyper:athyper-data 755 (no setgid)
leaf dirs:  svc-* owner/group, mode 750
```

## C.3 Docker Checks

**AS:** athyper

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}'
docker ps --format '{{.Names}}' | grep -v '^athyper-' && echo "Unexpected project name drift" || true

# Both must return [] — no direct docker.sock mount on gateway or logshipper
docker inspect athyper-gateway-1 \
  | jq '.[0].HostConfig.Binds | map(select(contains("docker.sock")))'

docker inspect athyper-logshipper-1 \
  | jq '.[0].HostConfig.Binds | map(select(contains("docker.sock")))'
```

## C.4 UID Drift Check

**AS:** athyper

```bash
for c in \
  athyper-memorycache-1 \
  athyper-objectstorage-1 \
  athyper-searchcore-1 \
  athyper-telemetry-1 \
  athyper-logging-1 \
  athyper-metrics-1 \
  athyper-tracing-1
do
  echo "=== $c ==="
  docker exec "$c" id || true
done
```

Each container must report the expected UID from the v13 table. Any container showing UID 0
(root) or a human UID is a regression — stop and investigate.

## C.5 Config Drift

**AS:** root

```bash
cd /opt/products/athyper

ATHYPER_CONFIG_ROOT=/opt/stack/athyper/config \
ATHYPER_SECRETS_ROOT=/opt/stack/athyper/secrets \
bash stack/scripts/setup/setup-config.sh staging --diff
```

Expected: no diff output. Any diff indicates manual edits to config files that have not
been committed back to the repository templates.

## C.6 Memory Limits Audit

**AS:** athyper

Every compose service must declare a memory limit. Services without one can consume all
available RAM and trigger OOM kills on neighboring services.

```bash
SCRIPT_DIR=/opt/products/athyper/stack/scripts/stack-profile
source "$SCRIPT_DIR/../lib/compose.sh"
init_compose_env
resolve_compose_override
build_compose_file_list

ALL_COMPOSE_PROFILES="admin,analytics,apps,core,db,dev,emergency,gateway,iam,memorycache,memorycache-jobs,monitoring,objectstorage,render,search,security-infisical,telemetry"
COMPOSE_PROFILES="$ALL_COMPOSE_PROFILES" docker compose \
  --project-directory "$COMPOSE_DIR" \
  "${ENV_FILE_ARGS[@]}" \
  "${COMPOSE_FILE_ARGS[@]}" \
  config | python3 -c "
import sys, yaml
cfg = yaml.safe_load(sys.stdin)
missing = [
  name for name, svc in cfg.get('services', {}).items()
  if not svc.get('mem_limit') and not (svc.get('deploy', {}) or {}).get('resources', {}).get('limits', {}).get('memory')
]
if missing:
  print('FAIL — missing mem_limit:', missing)
  sys.exit(1)
print('OK — all services have memory limits')
"
```

---

# Part D — Day-2 Operations

---

## D.1 Normal Shell Access

```bash
ssh nchandravel-atlas@<SERVER_PUBLIC_IP>
sudo -iu athyper
cd /opt/products/athyper
```

## D.2 Start Stack

```bash
sudo -iu athyper
cd /opt/products/athyper
bash stack/scripts/stack-profile/up.sh all
```

## D.3 Stop Stack

```bash
sudo -iu athyper
cd /opt/products/athyper
bash stack/scripts/stack-profile/down.sh all
```

## D.4 Pull Latest Code

```bash
sudo -iu athyper
cd /opt/products/athyper
git status
git pull
```

`git pull` is safe because runtime config, secrets, and data are outside the repo in
`/opt/stack/athyper/`. Nothing in the git checkout is mutable state.

## D.5 Edit Secrets

The `secrets/` directory is `root:athyper 750` — the athyper account can read the
`.env` file (owned `athyper:athyper 600`) but **cannot create files inside `secrets/`**.
This means `sed -i` fails as athyper (it creates a temp file in the same directory).
Always edit secrets as **root**.

```bash
# Edit as root (secrets/ dir is root:athyper 750 — sed -i and nano need directory write access)
sudo nano /opt/stack/athyper/secrets/.env
sudo chown athyper:athyper /opt/stack/athyper/secrets/.env
sudo chmod 600 /opt/stack/athyper/secrets/.env

# Validate as athyper after saving
sudo -u athyper bash /opt/products/athyper/stack/scripts/setup/validate-env.sh \
  /opt/products/athyper/stack/env/.env \
  /opt/stack/athyper/secrets/.env
```

If you need to patch a single value non-interactively (e.g. align a password), run as root:

```bash
sudo bash -c "sed -i 's|^IAM_DB_PASSWORD=.*|IAM_DB_PASSWORD=newvalue|' /opt/stack/athyper/secrets/.env"
```

## D.6 Edit Config

Config files are root-owned:

```bash
sudo nano /opt/stack/athyper/config/<path>
```

After editing, check for drift (C.5) to confirm the change matches the repository template
or is an intentional override that should be committed upstream.

## D.7 Permission Repair for One Leaf

> **Never run `chown -R /opt/stack/athyper/data`** — that would reassign ownership of all
> service directories in one command, masking the specific directory that has the problem
> and potentially cascading across unaffected services.

Use this pattern for a single-leaf repair (Redis shown as an example):

```bash
sudo -i

# 1. Stop the affected container cleanly
docker rm -f athyper-memorycache-1 2>/dev/null || true

# 2. Clear any stale data files that may be owned by a wrong UID
find /opt/stack/athyper/data/memorycache -mindepth 1 -delete

# 3. Reset ownership on just this leaf
chown svc-redis:svc-redis /opt/stack/athyper/data/memorycache
chmod 0750 /opt/stack/athyper/data/memorycache
chmod g-s  /opt/stack/athyper/data/memorycache

# 4. Host write probe — confirms the OS-level fix is correct
sudo -u svc-redis -g svc-redis sh -c \
  'touch /opt/stack/athyper/data/memorycache/.write_probe && rm /opt/stack/athyper/data/memorycache/.write_probe'

# 5. Container canary — confirms the image can write under svc-redis inside a real mount.
#    A passing host probe but a failing canary here indicates a stale Docker mount cache
#    or image UID drift — investigate before starting the stack.
docker run --rm \
  --user 9100:9100 \
  -v /opt/stack/athyper/data/memorycache:/data \
  redis:7.4.8-alpine \
  sh -c 'cd /data && touch t && rm t && echo container-ok'

# 6. Start the stack only after both probes pass
sudo -iu athyper
cd /opt/products/athyper
bash stack/scripts/stack-profile/up.sh core
```

## D.8 VNC Recovery

Use VNC console only for break-glass. Root SSH is disabled after Phase 28.

```text
VNC: provider console
Login: root  (vault password)
Note: never use "sudo -iu athyper" through VNC for routine tasks — always SSH as ops account
```

## D.9 Seed fails — `permission denied for schema control`

**Symptom:**

```
{"msg":"migrate_executing","phase":2,"file":"...003_control/011_notification_routing_collab",...}
{"msg":"migrate_failed","phase":2,"file":"...003_control/011_notification_routing_collab",
 "error":"error: permission denied for schema control"}
```

Phase 1 DDL succeeds. Phase 2 seed files 001–010 succeed. File 011 (or any file that
inserts into a table with lookup-validation triggers) fails.

**Root cause:**

`control.fn_valid_lookup` and `control.fn_valid_lookup_nullable` are `SECURITY DEFINER`
functions owned by `athyperadmin`. When a BEFORE INSERT trigger on
`control.notification_routing_rule` fires and calls these functions, PostgreSQL executes
them as `athyperadmin`. Because `athyperadmin` was never granted `USAGE` on the `control`
schema, the functions raise `permission denied for schema control` even though the
calling session is the `postgres` superuser.

This was a gap in `99_security/800_security_hardening.sql`: only `athyperapp` received
schema USAGE and table-level grants. The fix landed in that file — the updated DDL grants
`athyperadmin` USAGE on all schemas and full DML on all tables so SECURITY DEFINER
functions can execute correctly.

**Recovery (on a server where Phase 1 already ran without the fix):**

```bash
sudo -iu athyper
cd /opt/products/athyper

# 1. Pull the fix
git pull

# 2. Re-run Phase 1 DDL only — the changed checksum in 800_security_hardening.sql
#    causes migrate.ts to re-apply it (which grants athyperadmin the missing privileges).
DB_IP=$(docker inspect athyper-db-1 \
  --format '{{(index .NetworkSettings.Networks "athyper-internal").IPAddress}}')
DB_PASS=$(grep '^DB_ADMIN_PASSWORD=' /opt/stack/athyper/secrets/.env | cut -d= -f2-)
DB_PASS_ENC=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$DB_PASS")
export DATABASE_ADMIN_URL="postgresql://postgres:${DB_PASS_ENC}@${DB_IP}:5432/athyper_neon"

bash /opt/products/athyper/stack/scripts/db/transaction/neon/seed-db.sh --ddl-only

# 3. Now run the full seed — Phase 2 will continue from where it left off
#    (migrate.ts skips already-applied files by checksum)
bash /opt/products/athyper/stack/scripts/db/transaction/neon/seed-db.sh --all
```

**Prevention:**

New deployments using the updated `800_security_hardening.sql` are not affected — the
missing grants are now part of Phase 1 DDL from the initial run.

---

# Part E — Go/No-Go Checklist

Do not declare staging ready until every item below is checked.

**Infrastructure**

```text
[ ] DNS critical records resolve from 1.1.1.1 and 8.8.8.8.
[ ] Root password rotated and stored in vault.
[ ] No NOPASSWD:ALL remains in any sudoers file.
[ ] Docker daemon uses journald driver and live-restore.
[ ] /opt/products/athyper and /opt/stack/athyper are physically separate directories.
[ ] /opt/stack/athyper/data is mode 0755 with no setgid bit.
[ ] svc-* users and groups exist with UIDs/GIDs 9100–9105.
[ ] No data leaf directory is owned by a human account (e.g. rmanoj-atlas, ops-admin).
[ ] GID pre-check passed — GIDs 9100–9105 were not claimed by a non-svc-* group.
[ ] Host write probe (Phase 12) passes for all bind-mounted data directories.
[ ] Container canaries (Phase 13) pass for Redis, MinIO, searchcore, and all telemetry directories.
[ ] stack/env/.env contains only non-secret bootstrap variables — no credentials.
[ ] /opt/stack/athyper/secrets/.env is mode 0600 and not world-readable.
[ ] redis-acl.conf is athyper:svc-redis mode 0640 — not world-readable (contains hashed passwords).
[ ] validate-env.sh passes with exit 0 and renders redis-acl.conf without template tokens.
[ ] docker compose render has no unresolved ${VAR} and no blank bind mount sources.
```

**Services**

```text
[ ] memorycache returns PONG.
[ ] objectstorage /minio/health/live returns HTTP 200.
[ ] objectstorage-init exited 0 — all 4 buckets created and all 4 scoped accounts provisioned (Phase 16.1).
[ ] verify-objectstorage.sh passes — [2/4] buckets OK and [4/4] scoped accounts OK.
[ ] DB and both PgBouncer pools (6432, 6433) are pg_isready.
[ ] IAM OIDC endpoint returns valid JSON.
[ ] API /livez and /readyz return HTTP 200.
[ ] Neon web /livez returns HTTP 200.
[ ] Browser login succeeds end-to-end.
[ ] No direct docker.sock mount on gateway or logshipper.
[ ] Memory limits audit (C.6) prints "OK — all services have memory limits".
[ ] Manual backup test (--no-upload) produced dumps with no errors.
[ ] At least one full backup has been confirmed in the offsite bucket.
[ ] Reboot drill (Phase 25) passed — stack auto-recovered within 10 minutes.
```

**SSH hardening — Phase 26 (last step before go-live)**

```text
[ ] Root password rotated and stored in vault (Step A).
[ ] Human operator accounts created — nchandravel-atlas, ops-admin, rmanoj-atlas (Step B).
[ ] SSH public keys installed and verified from a workstation terminal (Step C).
[ ] root SSH disabled — ssh root@<SERVER> returns Permission denied.
[ ] password SSH disabled — PasswordAuthentication no in sshd_config.d/athyper.conf.
[ ] key login verified — ops account logs in without password prompt in a new terminal (Step E).
[ ] athyper direct SSH blocked — ForceCommand nologin; connection drops immediately.
[ ] VNC / root break-glass verified — root login via provider VNC console confirmed working (Step G).
```

> Phase 26 items are gated on a fully running, reboot-verified stack.
> Execute Phase 26 only after the reboot drill passes. Keep an active root session open
> while applying the config — do not close it until Step E key-login verification succeeds.

---

## Related Documentation

| Document | Purpose |
|---|---|
| [`environments.md`](environments.md) | Cross-env comparison — local vs staging vs production matrix, script behavior, profile defaults, production deltas |
| [`local-dev-setup.md`](local-dev-setup.md) | Windows local development — host-mode apps, infra-in-Docker, Options A/B/C |
| [`infrastructure-plan.md`](infrastructure-plan.md) | Architecture overview, v13 permission decision, pre-deployment code gates |
| [`secrets-management.md`](secrets-management.md) | Secret inventory, generation, rotation, per-environment injection model |
| [`weekly-reset-reseed-export.md`](weekly-reset-reseed-export.md) | Weekly DB reset, re-seed, export, restore validation |

