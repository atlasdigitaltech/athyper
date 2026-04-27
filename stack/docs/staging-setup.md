# Athyper Staging Setup — Ubuntu Server Runbook

**Document version:** v13 — permission-safe  
**Scope:** Fresh Ubuntu 22.04/24.04 server (Contabo VM) → `ENVIRONMENT=staging`  
**Not for:** Windows local development — see `infrastructure-plan.md` Part G  
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
| Meilisearch / Metabase / Uptime Kuma | `svc-meili` | `9105` | `svc-meili` | `9105` |

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
| PG-07 | `stack/env/.env` contains only path overrides (`ATHYPER_*_ROOT`), never secrets — it is committed to git |
| PG-08 | Every compose service has `mem_limit` or `deploy.resources.limits.memory` |
| PG-09 | `server/Dockerfile.prod` pins `pnpm@10.33.0`, not `pnpm@latest` |
| PG-10 | Redis cache config uses `save ""` and `appendonly no` (no persistence) unless durability is intentional |

---

## A.2 DNS Pre-gates

**EXECUTE ON:** WORKSTATION  
**AS:** DNS admin/operator

Create all DNS records **before** starting the gateway. Traefik's ACME challenge will fail
silently if DNS does not resolve when the gateway first starts.

| Hostname | Points to |
|---|---|
| `api-stg.athyper.com` | server public IP |
| `neon-stg.athyper.com` | server public IP |
| `iam-stg.athyper.com` | server public IP |
| `gateway-stg.athyper.com` | server public IP |
| `objectstorage-stg.athyper.com` | server public IP |
| `objectstorage.console-stg.athyper.com` | server public IP |

Verify from workstation before proceeding:

```bash
for host in \
  api-stg.athyper.com \
  neon-stg.athyper.com \
  iam-stg.athyper.com \
  gateway-stg.athyper.com \
  objectstorage-stg.athyper.com \
  objectstorage.console-stg.athyper.com; do
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

# Confirm hardware meets minimums before installing anything.
echo "=== hardware ==="
free -h
df -h /
nproc

# Sync the clock. Stale timestamps cause TLS cert validation failures and
# jwt expiry mismatches with Keycloak.
echo "=== clock ==="
timedatectl set-ntp true
timedatectl

# 8 GB swap prevents OOM kills when all profiles are running simultaneously.
echo "=== swap ==="
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 8G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
fi

grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
swapon --show

# vm.overcommit_memory=1 prevents Redis from refusing to fork during BGSAVE.
echo "=== kernel tuning ==="
cat > /etc/sysctl.d/99-athyper.conf << 'EOF'
vm.swappiness=10
vm.overcommit_memory=1
EOF

sysctl --system
sysctl vm.swappiness vm.overcommit_memory
```

**Gate — do not proceed until all pass:**

```text
free -h       shows expected RAM
df -h /       shows sufficient disk
nproc         shows expected CPU count
timedatectl   System clock synchronized: yes
swapon        shows /swapfile 8G
sysctl        vm.swappiness=10 and vm.overcommit_memory=1
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
mkdir -p /opt/stack/athyper/data/{memorycache,memorycache-jobs,objectstorage,meilisearch,metabase,uptime-kuma}
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
grep -R "user:.*9105:9105" stack/compose || echo "WARN: Meili/Metabase/Uptime user mapping not found"
```

If any mapping is missing, patch the relevant compose file before proceeding.

Expected service-to-identity mappings:

```yaml
memorycache:       user: "9100:9100"   # svc-redis
memorycache-jobs:  user: "9100:9100"   # svc-redis
objectstorage:     user: "9101:9101"   # svc-minio
meilisearch:       user: "9105:9105"   # svc-meili
metabase:          user: "9105:9105"   # svc-meili
uptime-kuma:       user: "9105:9105"   # svc-meili
telemetry:         user: "9102:9102"   # svc-grafana
logging:           user: "9103:9103"   # svc-loki
tracing:           user: "9103:9103"   # svc-loki
metrics:           user: "9104:9104"   # svc-prometheus
```

---

## Phase 8 — Deploy Config Files

**EXECUTE ON:** SERVER  
**AS:** root

```bash
set -euo pipefail

cd /opt/products/athyper

# Deploy env-specific config from the git source into the runtime config root.
# setup-config.sh reads the ENVIRONMENT var from the .env and copies db/staging/,
# gateway/, iam/, memorycache/, telemetry/ etc.
ATHYPER_CONFIG_ROOT=/opt/stack/athyper/config \
ATHYPER_SECRETS_ROOT=/opt/stack/athyper/secrets \
bash stack/scripts/setup/setup-config.sh staging

# Config root: root-owned, athyper-config group can read, no world-write
chown -R root:athyper-config /opt/stack/athyper/config
find /opt/stack/athyper/config -type d -exec chmod 0755 {} \;
find /opt/stack/athyper/config -type f -exec chmod 0644 {} \;

# redis-acl.conf exception: validate-env.sh (running as athyper) writes this file,
# so athyper must own it. The file contains SHA-256 password hashes — restrict to
# owner + svc-redis group only (mode 0640, not world-readable).
touch /opt/stack/athyper/config/memorycache/redis-acl.conf
chown athyper:svc-redis /opt/stack/athyper/config/memorycache/redis-acl.conf
chmod 0640 /opt/stack/athyper/config/memorycache/redis-acl.conf

# Verify ACL file ownership and that no secrets file is world-readable
stat -c "%U:%G %a %n" /opt/stack/athyper/config/memorycache/redis-acl.conf
find /opt/stack/athyper/secrets -perm /o+r -ls
# Last command must return no output
```

---

## Phase 9 — Bootstrap File and Secrets

## 9.1 Create Non-Secret Path Bootstrap File

**EXECUTE ON:** SERVER  
**AS:** athyper

```bash
sudo -iu athyper

# This file belongs in the git checkout (readable by compose.sh) because it contains
# only filesystem paths — no credentials. It tells compose.sh where to find secrets,
# config, and data roots on this specific server.
cat > /opt/products/athyper/stack/env/.env << 'EOF'
# Bootstrap file — path overrides only. No secrets here.
ATHYPER_SECRETS_ROOT=/opt/stack/athyper/secrets
ATHYPER_CONFIG_ROOT=/opt/stack/athyper/config
ATHYPER_DATA_ROOT=/opt/stack/athyper/data
ATHYPER_LOG_ROOT=/opt/stack/athyper/logs
ATHYPER_BACKUP_ROOT=/opt/stack/athyper/backups
EOF

chmod 0644 /opt/products/athyper/stack/env/.env
cat /opt/products/athyper/stack/env/.env
```

## 9.2 Generate Secret Values

**EXECUTE ON:** SERVER  
**AS:** athyper

```bash
# Prevent secrets from being written to bash history
unset HISTFILE
set +o history

cat > ~/secrets-staging.txt << EOF
DB_PASSWORD=$(openssl rand -base64 32)
DBPOOL_PASSWORD=$(openssl rand -base64 32)
REDIS_PASSWORD=$(openssl rand -base64 32)
MINIO_ROOT_PASSWORD=$(openssl rand -base64 32)
KC_DB_PASSWORD=$(openssl rand -base64 32)
GLITCHTIP_DB_PASSWORD=$(openssl rand -base64 32)
INFISICAL_DB_PASSWORD=$(openssl rand -base64 32)
ANALYTICS_DB_PASSWORD=$(openssl rand -base64 32)
SESSION_SECRET=$(openssl rand -hex 32)
CSRF_SECRET=$(openssl rand -hex 32)
JOBS_SECRET=$(openssl rand -hex 32)
EOF

chmod 0600 ~/secrets-staging.txt
cat ~/secrets-staging.txt
```

Generate the Traefik dashboard htpasswd value (bcrypt):

```bash
# The $$ is required: docker compose treats $ as a variable prefix; $$ becomes literal $.
docker run --rm httpd:alpine htpasswd -nbB admin "REPLACE_WITH_STRONG_PASSWORD" \
  | sed 's/\$/\$\$/g'
```

Expected output format: `admin:$$2y$$05$$...`

## 9.3 Populate `/opt/stack/athyper/secrets/.env`

**EXECUTE ON:** SERVER  
**AS:** athyper

```bash
nano /opt/stack/athyper/secrets/.env
```

Minimum structural values that must be present and correct:

```env
ENVIRONMENT=staging
COMPOSE_PROJECT_NAME=athyper

# Six-root model — must match the bootstrap file exactly
ATHYPER_CONFIG_ROOT=/opt/stack/athyper/config
ATHYPER_SECRETS_ROOT=/opt/stack/athyper/secrets
ATHYPER_DATA_ROOT=/opt/stack/athyper/data
ATHYPER_LOG_ROOT=/opt/stack/athyper/logs
ATHYPER_BACKUP_ROOT=/opt/stack/athyper/backups

# Database — DB_HOST=db resolves to the db container name inside the compose network
DB_HOST=db
DBPOOL_APPS_CONFIG=db/staging/dbpool/apps/pgbouncer-apps.ini
DBPOOL_SESSION_CONFIG=db/staging/dbpool/session/pgbouncer-session.ini

# Gateway TLS (Let's Encrypt)
ACME_EMAIL=ops@atlasdigitaltech.com
GATEWAY_DASHBOARD_HTPASSWD=admin:$$2y$$05$$...
```

Restore shell history after editing:

```bash
set -o history
export HISTFILE=~/.bash_history
```

Verify the file is properly secured and fully populated:

```bash
stat -c "%U:%G %a %n" /opt/stack/athyper/secrets/.env
# Must be: athyper:athyper 600

grep -cE '<fill|__________|from secrets' /opt/stack/athyper/secrets/.env
# Must be: 0
```

---

## Phase 10 — Validate Environment and Render Redis ACL

**EXECUTE ON:** SERVER  
**AS:** athyper

```bash
set -euo pipefail

# validate-env.sh checks every required variable, enforces non-local security
# policies (NODE_ENV=production, TLS, no dev passwords), and renders redis-acl.conf
# from the ACL template by hashing the Redis passwords.
bash /opt/products/athyper/stack/scripts/setup/validate-env.sh \
  /opt/stack/athyper/secrets/.env

# Confirm no template tokens remain in the rendered ACL file.
# Unrendered tokens indicate that sha256sum failed or a Redis password variable is unset.
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
  "$DATA_ROOT/meilisearch" \
  "$DATA_ROOT/metabase" \
  "$DATA_ROOT/uptime-kuma" \
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
chown svc-meili:svc-meili       "$DATA_ROOT/meilisearch"
chown svc-meili:svc-meili       "$DATA_ROOT/metabase"
chown svc-meili:svc-meili       "$DATA_ROOT/uptime-kuma"
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
  "$DATA_ROOT/meilisearch" \
  "$DATA_ROOT/metabase" \
  "$DATA_ROOT/uptime-kuma" \
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
  "$DATA_ROOT/meilisearch" \
  "$DATA_ROOT/metabase" \
  "$DATA_ROOT/uptime-kuma" \
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
  "$DATA_ROOT/meilisearch" \
  "$DATA_ROOT/metabase" \
  "$DATA_ROOT/uptime-kuma" \
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
meilisearch                               svc-meili:svc-meili 750
metabase                                  svc-meili:svc-meili 750
uptime-kuma                               svc-meili:svc-meili 750
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
  "svc-meili:svc-meili:/opt/stack/athyper/data/meilisearch" \
  "svc-meili:svc-meili:/opt/stack/athyper/data/metabase" \
  "svc-meili:svc-meili:/opt/stack/athyper/data/uptime-kuma" \
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
  -v /opt/stack/athyper/data/objectstorage:/data \
  minio/minio:2025-09-07T16-13-09Z \
  sh -c 'mkdir -p /data/.minio.sys/tmp && touch /data/.minio.sys/tmp/probe && rm -r /data/.minio.sys && echo OK'
```

### 13.3 Meilisearch Canary

```bash
docker run --rm \
  --user 9105:9105 \
  -v /opt/stack/athyper/data/meilisearch:/meili_data \
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

# Start dry-run via up.sh to confirm the wrapper resolves paths correctly
bash stack/scripts/stack-profile/up.sh core 2>&1 | head -40
```

Confirm output shows the expected root paths:

```text
ATHYPER_CONFIG  = /opt/stack/athyper/config
ATHYPER_DATA    = /opt/stack/athyper/data
ENV_FILE        = /opt/stack/athyper/secrets/.env
```

Full render validation — abort on any unresolved variable or blank bind mount:

```bash
docker compose \
  --project-directory /opt/products/athyper/stack/compose \
  --env-file /opt/stack/athyper/secrets/.env \
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
# Preferred path (if wrapper supports build):
bash stack/scripts/stack-profile/build.sh apps

# Fallback — get the exact docker compose command from up.sh output and substitute:
# replace "up -d" with: build athyper-neon-web athyper-api athyper-worker athyper-scheduler
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

## Phase 17 — Database Seed

**EXECUTE ON:** SERVER  
**AS:** athyper

```bash
sudo -iu athyper
cd /opt/products/athyper

# Verify the database is visible before seeding
docker exec athyper-db-1 psql -U athyperadmin -l

bash /opt/products/athyper/stack/scripts/db/transaction/neon/seed-db.sh
```

After seed, confirm the Postgres port is not exposed on the host:

```bash
# Port 5432 must NOT appear in the output — it should be accessible only via
# PgBouncer within the compose network, not from outside the server.
ss -tln | grep 5432 || true
```

---

## Phase 18 — IAM / Keycloak Bootstrap

**EXECUTE ON:** SERVER  
**AS:** athyper

```bash
sudo -iu athyper
cd /opt/products/athyper

# Pre-flight: check for duplicate authenticatorConfig UUIDs in the realm JSON.
# Duplicates cause a silent import failure that is hard to diagnose after the fact.
jq '.authenticatorConfig[].id' /opt/stack/athyper/config/iam/realm-demosetup.json | sort | uniq -d || true

bash /opt/products/athyper/stack/scripts/db/session/iam/reset-iam.sh

# Verify the OIDC discovery endpoint is reachable (this is what the API uses to verify JWTs)
curl -sf https://iam-stg.athyper.com/realms/athyper/.well-known/openid-configuration | jq .
```

Open the Keycloak admin UI, confirm the client secret matches `IAM_CLIENT_SECRET` in `.env`.
If it differs, update `.env` and re-run:

```bash
bash /opt/products/athyper/stack/scripts/setup/validate-env.sh /opt/stack/athyper/secrets/.env
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
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'athyper-api|athyper-worker|athyper-scheduler|athyper-neon-web'

docker logs athyper-api-1 --tail 100
docker logs athyper-neon-web-1 --tail 100
```

External smoke check:

```bash
curl -sf https://api-stg.athyper.com/livez
curl -sf https://api-stg.athyper.com/readyz
curl -sf https://neon-stg.athyper.com/livez
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
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'glitchtip|healthchecks|uptime'

bash stack/scripts/stack-profile/up.sh render
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'gotenberg|tika'

bash stack/scripts/stack-profile/up.sh search
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'meilisearch'
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

# Source the env so smoke-staging.sh reads hostnames from the staging .env
set -a
. /opt/stack/athyper/secrets/.env
set +a

# Three verification scripts must all pass
bash /opt/products/athyper/stack/scripts/smoke-staging.sh           # 8 health check groups
bash /opt/products/athyper/stack/scripts/setup/verify-objectstorage.sh  # MinIO buckets + accounts
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
ExecStartPre=/bin/bash /opt/products/athyper/stack/scripts/setup/validate-env.sh /opt/stack/athyper/secrets/.env
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

Import all generated secrets from `~/secrets-staging.txt` into Infisical (or your chosen
secrets manager). The on-disk `.env` is a materialized runtime cache — Infisical is the
source of truth.

After confirming the import:

```bash
sudo -iu athyper

# Securely delete the plaintext staging secrets file (shred overwrites before unlinking)
shred -u ~/secrets-staging.txt
ls ~/secrets-staging.txt || true   # must show: No such file or directory
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
set -a
. /opt/stack/athyper/secrets/.env
set +a
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
  /opt/stack/athyper/data/meilisearch \
  /opt/stack/athyper/data/metabase \
  /opt/stack/athyper/data/uptime-kuma \
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
  athyper-meilisearch-1 \
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
docker compose \
  --project-directory /opt/products/athyper/stack/compose \
  --env-file /opt/stack/athyper/secrets/.env \
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

```bash
sudo -iu athyper
nano /opt/stack/athyper/secrets/.env
bash /opt/products/athyper/stack/scripts/setup/validate-env.sh /opt/stack/athyper/secrets/.env
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
[ ] Container canaries (Phase 13) pass for Redis, MinIO, Meilisearch, and all telemetry directories.
[ ] stack/env/.env contains only path variables — no credentials.
[ ] /opt/stack/athyper/secrets/.env is mode 0600 and not world-readable.
[ ] redis-acl.conf is athyper:svc-redis mode 0640 — not world-readable (contains hashed passwords).
[ ] validate-env.sh passes with exit 0 and renders redis-acl.conf without template tokens.
[ ] docker compose render has no unresolved ${VAR} and no blank bind mount sources.
```

**Services**

```text
[ ] memorycache returns PONG.
[ ] objectstorage /minio/health/live returns HTTP 200.
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
