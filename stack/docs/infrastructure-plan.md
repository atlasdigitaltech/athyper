# Athyper Infrastructure v13 — Empty-Server Installation Runbook

**Document status:** v13 — permission-safe (audit fixes applied)
**Supersedes:** v12 staging installation plan (UID/GID collision incident)
**Target:** Fresh Ubuntu server / Contabo VM
**Primary rule:** Source code and runtime state must stay physically separate.

```text
/opt/products/athyper   = git checkout, compose definitions, templates, scripts
/opt/stack/athyper      = runtime config, secrets, data, logs, backups
```

## v13 Permission Decision

The v12 plan used container numeric IDs directly on host bind mounts (`999:1000`, `1000:1000`,
`1000:1001`). On Ubuntu, `1000` and `1001` are commonly human user IDs/groups — that caused
host/container UID collision and the repeated Redis `dump.rdb Permission denied` issue.

v13 uses named service identities in a reserved range:

| Service family | Linux user | UID | Linux group | GID |
|---|---:|---:|---:|---:|
| Redis cache / jobs | `svc-redis` | `9100` | `svc-redis` | `9100` |
| MinIO | `svc-minio` | `9101` | `svc-minio` | `9101` |
| Grafana | `svc-grafana` | `9102` | `svc-grafana` | `9102` |
| Loki / Tempo | `svc-loki` | `9103` | `svc-loki` | `9103` |
| Prometheus | `svc-prometheus` | `9104` | `svc-prometheus` | `9104` |
| Meilisearch / Metabase / Uptime Kuma | `svc-meili` | `9105` | `svc-meili` | `9105` |

For services that use host bind-mounted writable data, compose must run the service with matching
`user: "<uid>:<gid>"`:

```yaml
memorycache:
  user: "9100:9100"

objectstorage:
  user: "9101:9101"
```

Every such service must pass a container canary (Phase 13) before full stack startup.

---

# Part A — Pre-gates Before Touching the Server

## A.1 Code Pre-gates

**EXECUTE ON:** WORKSTATION
**AS:** developer/operator

| Gate | Required change |
|---|---|
| PG-01 | `compose.sh` resolves `ATHYPER_*_ROOT` variables and exports compose aliases if still needed |
| PG-02 | `setup-config.sh` deploys config into `/opt/stack/athyper/config`, supports `--diff` and `--update`, and writes `MANIFEST` |
| PG-03 | `data-dirs-create.sh` is updated for v13 service users/groups, fails hard if not root, and runs write probes |
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

Create these records before starting gateway/ACME:

| Hostname | Points to |
|---|---|
| `api-stg.athyper.com` | server public IP |
| `neon-stg.athyper.com` | server public IP |
| `iam-stg.athyper.com` | server public IP |
| `gateway-stg.athyper.com` | server public IP |
| `objectstorage-stg.athyper.com` | server public IP |
| `objectstorage.console-stg.athyper.com` | server public IP |

Verify from workstation:

```bash
for host in \
  api-stg.athyper.com \
  neon-stg.athyper.com \
  iam-stg.athyper.com \
  gateway-stg.athyper.com \
  objectstorage-stg.athyper.com \
  objectstorage.console-stg.athyper.com; do
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

# Part B — Empty Server Installation

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

**Gate:**

```text
free -h       shows expected RAM
df -h /       has enough disk
nproc         shows expected CPU count
timedatectl   says System clock synchronized: yes
swapon        shows /swapfile 8G
sysctl        shows vm.swappiness=10 and vm.overcommit_memory=1
```

---

## Phase 1 — Install Base Packages and Docker

**EXECUTE ON:** SERVER
**AS:** root

```bash
set -euo pipefail

apt update
apt upgrade -y
apt install -y \
  curl git jq htop fail2ban postgresql-client unzip \
  ca-certificates gnupg lsb-release openssl sudo nano vim \
  apache2-utils python3

jq --version
psql --version
```

### 1.2 Install Docker Engine from Official Apt Repo

**EXECUTE ON:** SERVER
**AS:** root

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

docker --version
docker compose version
docker run --rm hello-world
```

Do not install Docker from snap.

### 1.3 Install Node.js 24 and pnpm 10

**EXECUTE ON:** SERVER
**AS:** root

```bash
set -euo pipefail

curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs

node --version
npm --version

corepack enable
corepack prepare pnpm@10.33.0 --activate

pnpm --version
```

### 1.4 Configure fail2ban

**EXECUTE ON:** SERVER
**AS:** root

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

### 1.5 Rotate Root Password

**EXECUTE ON:** SERVER
**AS:** root

```bash
passwd root
```

Save the new root password in the vault. Root SSH will be disabled later; root remains for VNC break-glass only.

---

## Phase 2 — Create Groups, Service Identities, and Users

## 2.1 Create Athyper Base Groups

**EXECUTE ON:** SERVER
**AS:** root

```bash
set -euo pipefail

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

```bash
set -euo pipefail

# Pre-check: ensure GIDs 9100–9105 are either free or already claimed by our svc-* users.
# groupadd --force exits 0 silently even on GID conflict — this loop catches hidden collisions.
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

groupadd --force --gid 9100 svc-redis
groupadd --force --gid 9101 svc-minio
groupadd --force --gid 9102 svc-grafana
groupadd --force --gid 9103 svc-loki
groupadd --force --gid 9104 svc-prometheus
groupadd --force --gid 9105 svc-meili

id svc-redis >/dev/null 2>&1 || useradd --uid 9100 --gid 9100 --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin --comment "Athyper Redis service identity" svc-redis
id svc-minio >/dev/null 2>&1 || useradd --uid 9101 --gid 9101 --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin --comment "Athyper MinIO service identity" svc-minio
id svc-grafana >/dev/null 2>&1 || useradd --uid 9102 --gid 9102 --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin --comment "Athyper Grafana service identity" svc-grafana
id svc-loki >/dev/null 2>&1 || useradd --uid 9103 --gid 9103 --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin --comment "Athyper Loki Tempo service identity" svc-loki
id svc-prometheus >/dev/null 2>&1 || useradd --uid 9104 --gid 9104 --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin --comment "Athyper Prometheus service identity" svc-prometheus
id svc-meili >/dev/null 2>&1 || useradd --uid 9105 --gid 9105 --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin --comment "Athyper Meili service identity" svc-meili

id svc-redis
id svc-minio
id svc-grafana
id svc-loki
id svc-prometheus
id svc-meili
```

## 2.3 Create Athyper Service Account

**EXECUTE ON:** SERVER
**AS:** root

```bash
set -euo pipefail

id athyper >/dev/null 2>&1 || \
  useradd --system --uid 9000 --gid 9000 --create-home --home-dir /home/athyper --shell /bin/bash athyper

passwd --lock athyper

# usermod groups are required for interactive sessions (sudo -iu athyper).
# The SupplementaryGroups= in the systemd unit only covers systemctl start athyper-stack;
# it does not apply to manual sudo -iu athyper shells. Both mechanisms are needed.
usermod -aG docker,athyper-config,athyper-data athyper

id athyper
passwd -S athyper
groups athyper
```

Expected:

```text
uid=9000(athyper)
groups include docker, athyper-config, athyper-data
passwd -S shows L
```

## 2.4 Create Human Operator Accounts

**EXECUTE ON:** SERVER
**AS:** root

Create the primary ops account:

```bash
adduser --gecos "Chandravel Natarajan" nchandravel-atlas
usermod -aG sudo,docker,athyper-config nchandravel-atlas
id nchandravel-atlas
```

Optional generic ops account:

```bash
adduser --gecos "ops admin" ops-admin
usermod -aG sudo,docker,athyper-config ops-admin
id ops-admin
```

Create developer inspector account only if needed:

```bash
adduser --gecos "Manoj Rajendran" rmanoj-atlas
usermod -aG athyper-config rmanoj-atlas
id rmanoj-atlas
```

Rules:

```text
ops-admin role: sudo + docker + athyper-config
dev-inspector role: athyper-config only
No human user gets svc-* groups by default.
No human user gets both sudo and docker unless explicitly approved.
```

## 2.5 Install SSH Public Keys for Human Accounts

**EXECUTE ON:** SERVER
**AS:** root

For each user:

```bash
USERNAME="nchandravel-atlas"

mkdir -p "/home/$USERNAME/.ssh"
chmod 0700 "/home/$USERNAME/.ssh"
touch "/home/$USERNAME/.ssh/authorized_keys"
chmod 0600 "/home/$USERNAME/.ssh/authorized_keys"

# Paste the real public key here:
echo "ssh-ed25519 AAAA... chandravel.natarajan@atlasdigitaltech.com" >> "/home/$USERNAME/.ssh/authorized_keys"

chown -R "$USERNAME:$USERNAME" "/home/$USERNAME/.ssh"

ls -la "/home/$USERNAME/.ssh"
cat "/home/$USERNAME/.ssh/authorized_keys"
```

Verify all users:

```bash
for u in nchandravel-atlas ops-admin rmanoj-atlas; do
  echo "=== $u ==="
  id "$u" 2>/dev/null || true
  ls -la "/home/$u/.ssh/" 2>/dev/null || true
done
```

---

## Phase 3 — Create the Two-Root Filesystem Layout

**EXECUTE ON:** SERVER
**AS:** root

```bash
set -euo pipefail

mkdir -p /opt/products/athyper

mkdir -p /opt/stack/athyper/{config,secrets,data,logs,backups}

mkdir -p /opt/stack/athyper/config/{apps,iam/themes,memorycache,render,telemetry}
mkdir -p /opt/stack/athyper/config/gateway/dynamic
mkdir -p /opt/stack/athyper/config/db/local/dbpool
mkdir -p /opt/stack/athyper/config/telemetry/{logging,metrics,tracing,provisioning}
mkdir -p /opt/stack/athyper/config/telemetry/provisioning.env

mkdir -p /opt/stack/athyper/secrets/gateway/certs

mkdir -p /opt/stack/athyper/data/{memorycache,memorycache-jobs,objectstorage,meilisearch,metabase,uptime-kuma}
mkdir -p /opt/stack/athyper/data/telemetry/{logging,metrics,observability,tracing}

chown -R athyper:athyper /opt/products/athyper
chmod 0755 /opt/products/athyper

chown athyper:athyper /opt/stack/athyper
chmod 0755 /opt/stack/athyper

chown -R root:athyper-config /opt/stack/athyper/config
find /opt/stack/athyper/config -type d -exec chmod 0755 {} \;
find /opt/stack/athyper/config -type f -exec chmod 0644 {} \;

chown -R root:athyper /opt/stack/athyper/secrets
chmod 0750 /opt/stack/athyper/secrets
chmod 0750 /opt/stack/athyper/secrets/gateway
chmod 0750 /opt/stack/athyper/secrets/gateway/certs

touch /opt/stack/athyper/secrets/.env
chown athyper:athyper /opt/stack/athyper/secrets/.env
chmod 0600 /opt/stack/athyper/secrets/.env

touch /opt/stack/athyper/secrets/gateway/certs/acme.json
chown root:root /opt/stack/athyper/secrets/gateway/certs/acme.json
chmod 0600 /opt/stack/athyper/secrets/gateway/certs/acme.json

# Data root: no setgid in v13
chown athyper:athyper-data /opt/stack/athyper/data
chmod 0755 /opt/stack/athyper/data
chmod g-s /opt/stack/athyper/data

chown athyper:athyper /opt/stack/athyper/logs /opt/stack/athyper/backups
chmod 0750 /opt/stack/athyper/logs /opt/stack/athyper/backups

stat -c '%A %U:%G %a %n' \
  /opt/products/athyper \
  /opt/stack/athyper \
  /opt/stack/athyper/config \
  /opt/stack/athyper/secrets \
  /opt/stack/athyper/data \
  /opt/stack/athyper/logs \
  /opt/stack/athyper/backups
```

**Important:** do not apply per-service data ownership here. Phase 11 owns that.

---

## Phase 4 — System Hardening

## 4.1 Configure Docker Daemon

**EXECUTE ON:** SERVER
**AS:** root

```bash
set -euo pipefail

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
docker info | grep "Logging Driver"
docker info | grep "Live Restore"
```

## 4.2 Configure journald Limits

**EXECUTE ON:** SERVER
**AS:** root

```bash
mkdir -p /etc/systemd/journald.conf.d

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
> SSH hardening is the **last step before declaring the deployment complete**. It is performed
> in **Phase 26**, after the full stack is up, the reboot drill passes, and key-based login for
> the ops account is confirmed in a live session.
>
> Proceed to Phase 4.4.

## 4.4 Configure Scoped Sudoers for athyper

**EXECUTE ON:** SERVER
**AS:** root

```bash
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

grep -r NOPASSWD:ALL /etc/sudoers* || true
```

`grep -r NOPASSWD:ALL` must return nothing. If it returns a cloud-init user rule, remove or scope it with `visudo`.

Test:

```bash
su -s /bin/bash athyper -c "sudo systemctl status athyper-stack 2>&1 || true"
su -s /bin/bash athyper -c "sudo bash -c 'id' 2>&1 || true"
```

The second command must be denied.

---

## Phase 5 — GitHub Deploy Key for athyper

**EXECUTE ON:** SERVER
**AS:** athyper

From your human ops account:

```bash
sudo -iu athyper
```

Then:

```bash
set -euo pipefail

mkdir -p /home/athyper/.ssh
chmod 0700 /home/athyper/.ssh

ssh-keygen \
  -t ed25519 \
  -C "athyper-staging-deploy-key" \
  -f /home/athyper/.ssh/github_deploy_key \
  -N ""

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

cat /home/athyper/.ssh/github_deploy_key.pub
```

**EXECUTE ON:** WORKSTATION
**AS:** GitHub admin

```text
GitHub repo → Settings → Deploy keys → Add deploy key
Title: athyper-staging-deploy-key
Allow write access: unchecked
```

**EXECUTE ON:** SERVER
**AS:** athyper

```bash
ssh -T git@github.com
```

Expected:

```text
Hi atlasdigitaltech/athyper! You've successfully authenticated, but GitHub does not provide shell access.
```

---

## Phase 6 — Clone Repository

**EXECUTE ON:** SERVER
**AS:** athyper

```bash
set -euo pipefail

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

Patch pnpm pin if not already fixed upstream:

```bash
if grep -q 'pnpm@latest' /opt/products/athyper/server/Dockerfile.prod; then
  sed -i 's/pnpm@latest/pnpm@10.33.0/' /opt/products/athyper/server/Dockerfile.prod
fi

grep 'pnpm@10.33.0' /opt/products/athyper/server/Dockerfile.prod || true
```

---

## Phase 7 — Required Compose/Service-User Code Check

**EXECUTE ON:** SERVER
**AS:** athyper

Before starting anything, verify the compose files contain the v13 service users for bind-mounted
writable services.

```bash
cd /opt/products/athyper

grep -R "user:.*9100:9100" stack/compose || echo "WARN: Redis user mapping not found"
grep -R "user:.*9101:9101" stack/compose || echo "WARN: MinIO user mapping not found"
grep -R "user:.*9105:9105" stack/compose || echo "WARN: Meili/Metabase/Uptime user mapping not found"
```

If mappings are missing, patch the relevant compose files before proceeding.

Expected service mappings:

```yaml
memorycache:
  user: "9100:9100"

memorycache-jobs:
  user: "9100:9100"

objectstorage:
  user: "9101:9101"

meilisearch:
  user: "9105:9105"

metabase:
  user: "9105:9105"

uptime-kuma:
  user: "9105:9105"

telemetry:
  user: "9102:9102"

logging:
  user: "9103:9103"

tracing:
  user: "9103:9103"

metrics:
  user: "9104:9104"
```

---

## Phase 8 — Deploy Config Files

**EXECUTE ON:** SERVER
**AS:** root

```bash
set -euo pipefail

cd /opt/products/athyper

ATHYPER_CONFIG_ROOT=/opt/stack/athyper/config \
ATHYPER_SECRETS_ROOT=/opt/stack/athyper/secrets \
bash stack/scripts/setup/setup-config.sh staging

chown -R root:athyper-config /opt/stack/athyper/config
find /opt/stack/athyper/config -type d -exec chmod 0755 {} \;
find /opt/stack/athyper/config -type f -exec chmod 0644 {} \;

# redis-acl.conf exception: athyper must own it (validate-env.sh writes it), but the file
# contains hashed passwords so restrict read to owner + svc-redis group only (not world-readable).
touch /opt/stack/athyper/config/memorycache/redis-acl.conf
chown athyper:svc-redis /opt/stack/athyper/config/memorycache/redis-acl.conf
chmod 0640 /opt/stack/athyper/config/memorycache/redis-acl.conf

stat -c "%U:%G %a %n" /opt/stack/athyper/config/memorycache/redis-acl.conf
find /opt/stack/athyper/secrets -perm /o+r -ls
```

The secrets check must return no output.

---

## Phase 9 — Create Bootstrap File and Populate Secrets

## 9.1 Create Non-Secret Path Bootstrap File

**EXECUTE ON:** SERVER
**AS:** athyper

```bash
sudo -iu athyper

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

This file is allowed on the server only because it contains paths, not secrets.

## 9.2 Generate Secret Values

**EXECUTE ON:** SERVER
**AS:** athyper

```bash
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

Generate htpasswd value:

```bash
docker run --rm httpd:alpine htpasswd -nbB admin "REPLACE_WITH_STRONG_PASSWORD" \
  | sed 's/\$/\$\$/g'
```

It must look like:

```text
admin:$$2y$$05$$...
```

## 9.3 Populate `/opt/stack/athyper/secrets/.env`

**EXECUTE ON:** SERVER
**AS:** athyper

```bash
nano /opt/stack/athyper/secrets/.env
```

Minimum structural values that must be correct:

```env
ENVIRONMENT=staging
COMPOSE_PROJECT_NAME=athyper

ATHYPER_CONFIG_ROOT=/opt/stack/athyper/config
ATHYPER_SECRETS_ROOT=/opt/stack/athyper/secrets
ATHYPER_DATA_ROOT=/opt/stack/athyper/data
ATHYPER_LOG_ROOT=/opt/stack/athyper/logs
ATHYPER_BACKUP_ROOT=/opt/stack/athyper/backups

DB_HOST=db
DBPOOL_APPS_CONFIG=db/local/dbpool/pgbouncer-apps.ini
DBPOOL_SESSION_CONFIG=db/local/dbpool/pgbouncer-session.ini

ACME_EMAIL=ops@atlasdigitaltech.com
GATEWAY_DASHBOARD_HTPASSWD=admin:$$2y$$05$$...
```

Then restore history:

```bash
set -o history
export HISTFILE=~/.bash_history
```

Verify:

```bash
stat -c "%U:%G %a %n" /opt/stack/athyper/secrets/.env
grep -cE '<fill|__________|from secrets' /opt/stack/athyper/secrets/.env
```

The grep count must be `0`.

---

## Phase 10 — Validate Environment and Render Redis ACL

**EXECUTE ON:** SERVER
**AS:** athyper

```bash
set -euo pipefail

bash /opt/products/athyper/stack/scripts/setup/validate-env.sh \
  /opt/stack/athyper/secrets/.env

grep -E '__(APP|EXPORTER|GLITCHTIP|INFISICAL|ADMIN)_HASH__' \
  /opt/stack/athyper/config/memorycache/redis-acl.conf && {
    echo "Redis ACL still has template tokens — abort"
    exit 1
  } || true

stat -c "%U:%G %a %n" /opt/stack/athyper/config/memorycache/redis-acl.conf
```

If `redis-acl.conf` is not `athyper:svc-redis 640`, fix `validate-env.sh` or run:

```bash
sudo chown athyper:svc-redis /opt/stack/athyper/config/memorycache/redis-acl.conf
sudo chmod 0640 /opt/stack/athyper/config/memorycache/redis-acl.conf
```

---

## Phase 11 — Apply v13 Data Directory Ownership

**EXECUTE ON:** SERVER
**AS:** root

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

chown athyper:athyper-data "$DATA_ROOT"
chmod 0755 "$DATA_ROOT"
chmod g-s "$DATA_ROOT"

chown svc-redis:svc-redis "$DATA_ROOT/memorycache"
chown svc-redis:svc-redis "$DATA_ROOT/memorycache-jobs"
chown svc-minio:svc-minio "$DATA_ROOT/objectstorage"
chown svc-meili:svc-meili "$DATA_ROOT/meilisearch"
chown svc-meili:svc-meili "$DATA_ROOT/metabase"
chown svc-meili:svc-meili "$DATA_ROOT/uptime-kuma"
chown svc-loki:svc-loki "$DATA_ROOT/telemetry/logging"
chown svc-prometheus:svc-prometheus "$DATA_ROOT/telemetry/metrics"
chown svc-grafana:svc-grafana "$DATA_ROOT/telemetry/observability"
chown svc-loki:svc-loki "$DATA_ROOT/telemetry/tracing"

# 0750: owner (svc-*) can read/write; group member can read; world has no access.
# With user: "910x:910x" in compose, the container is the owner, so 0750 is sufficient
# and tighter than 0770 (which would allow any future group member to write).
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
/opt/stack/athyper/data                         athyper:athyper-data 755
memorycache                                     svc-redis:svc-redis 750
memorycache-jobs                                svc-redis:svc-redis 750
objectstorage                                   svc-minio:svc-minio 750
meilisearch                                     svc-meili:svc-meili 750
metabase                                        svc-meili:svc-meili 750
uptime-kuma                                     svc-meili:svc-meili 750
telemetry/logging                               svc-loki:svc-loki 750
telemetry/metrics                               svc-prometheus:svc-prometheus 750
telemetry/observability                         svc-grafana:svc-grafana 750
telemetry/tracing                               svc-loki:svc-loki 750
```

---

## Phase 12 — Mandatory Host Write Probe

**EXECUTE ON:** SERVER
**AS:** root

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

Do not start containers if this fails.

---

## Phase 13 — Mandatory Container Canaries

**EXECUTE ON:** SERVER
**AS:** root

These tests prove the real image can run under the service UID/GID and write to the real mount.

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
    touch canary-write && rm canary-write
    # The timeout + || true below is a config-syntax smoke test only — it is not a pass/fail gate.
    # The real gate is the touch/rm above. A Redis crash here indicates a config problem,
    # not a permission failure.
    timeout 5 redis-server /usr/local/etc/redis/redis.conf || true
  '
```

If it fails on RDB/dump, set Redis cache config to:

```conf
save ""
appendonly no
dir /data
dbfilename dump.rdb
```

Then rerun the canary.

### 13.2 MinIO Canary

The canary exercises `.minio.sys/tmp/...` — the exact path that fails under v12 numeric UIDs.

```bash
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
docker run --rm --user 9102:9102 -v /opt/stack/athyper/data/telemetry/observability:/data alpine:3.20 sh -c 'touch /data/.write-test && rm /data/.write-test && echo grafana-ok'
docker run --rm --user 9103:9103 -v /opt/stack/athyper/data/telemetry/logging:/data alpine:3.20 sh -c 'touch /data/.write-test && rm /data/.write-test && echo loki-ok'
docker run --rm --user 9104:9104 -v /opt/stack/athyper/data/telemetry/metrics:/data alpine:3.20 sh -c 'touch /data/.write-test && rm /data/.write-test && echo prometheus-ok'
docker run --rm --user 9103:9103 -v /opt/stack/athyper/data/telemetry/tracing:/data alpine:3.20 sh -c 'touch /data/.write-test && rm /data/.write-test && echo tempo-ok'
```

---

## Phase 14 — Compose Render Validation

**EXECUTE ON:** SERVER
**AS:** athyper

```bash
sudo -iu athyper
cd /opt/products/athyper

bash stack/scripts/stack-profile/up.sh core 2>&1 | head -40
```

Confirm output shows:

```text
ATHYPER_CONFIG  = /opt/stack/athyper/config
ATHYPER_DATA    = /opt/stack/athyper/data
ENV_FILE        = /opt/stack/athyper/secrets/.env
```

Mandatory: render and validate the full compose config. This catches unresolved variables
and blank bind mount sources — the class of failure that caused silent stack misconfiguration
in v12.

```bash
docker compose \
  --project-directory /opt/products/athyper/stack/compose \
  --env-file /opt/stack/athyper/secrets/.env \
  config > /tmp/athyper-compose.rendered.yml

grep -n '\${' /tmp/athyper-compose.rendered.yml && {
  echo "Unresolved compose variable found — abort"
  exit 1
} || echo "No unresolved variables"

grep -n 'source: ""' /tmp/athyper-compose.rendered.yml && {
  echo "Blank bind mount source found — abort"
  exit 1
} || echo "No blank bind mounts"
```

If raw `docker compose config` misses wrapper file lists, use the stack wrapper's resolved command instead.

---

## Phase 15 — Build Application Images

**EXECUTE ON:** SERVER
**AS:** athyper

```bash
sudo -iu athyper
cd /opt/products/athyper

pnpm install --frozen-lockfile
```

Build app images:

```bash
# Preferred if wrapper supports build
bash stack/scripts/stack-profile/build.sh apps

# Fallback: use the exact docker compose command printed by up.sh and replace "up -d" with:
# build athyper-neon-web athyper-api athyper-worker athyper-scheduler
```

Verify:

```bash
docker images | grep athyper
```

---

## Phase 16 — Start Core Infrastructure Only

**EXECUTE ON:** SERVER
**AS:** athyper

Do not start `all` yet.

```bash
sudo -iu athyper
cd /opt/products/athyper

bash stack/scripts/stack-profile/up.sh core
```

Check:

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'db|dbpool|memorycache|objectstorage|gateway|iam|socket'

docker logs athyper-memorycache-1 --tail 80
docker logs athyper-objectstorage-1 --tail 80
```

Health checks:

```bash
docker exec athyper-db-1 pg_isready || true
docker exec athyper-dbpool-apps-1 pg_isready -h 127.0.0.1 -p 6432 || true
docker exec athyper-dbpool-session-1 pg_isready -h 127.0.0.1 -p 6433 || true
docker exec athyper-memorycache-1 redis-cli ping
docker exec athyper-objectstorage-1 sh -c 'echo objectstorage-running'
```

If Redis fails, do not chown repeatedly. Check:

```bash
docker inspect athyper-memorycache-1 \
  --format '{{range .Mounts}}{{println .Source "->" .Destination "RW=" .RW}}{{end}}'

stat -c '%A %U:%G %a %n' /opt/stack/athyper/data/memorycache
ls -lan /opt/stack/athyper/data/memorycache
```

---

## Phase 17 — Database Seed

**EXECUTE ON:** SERVER
**AS:** athyper

```bash
sudo -iu athyper
cd /opt/products/athyper

docker exec athyper-db-1 psql -U athyperadmin -l
bash /opt/products/athyper/stack/scripts/db/transaction/neon/seed-db.sh
```

After seed, verify no DB host port is left exposed:

```bash
ss -tln | grep 5432 || true
```

---

## Phase 18 — IAM / Keycloak Bootstrap

**EXECUTE ON:** SERVER
**AS:** athyper

```bash
sudo -iu athyper
cd /opt/products/athyper

jq '.authenticatorConfig[].id' /opt/stack/athyper/config/iam/realm-demosetup.json | sort | uniq -d || true

bash /opt/products/athyper/stack/scripts/db/session/iam/reset-iam.sh

curl -sf https://iam-stg.athyper.com/realms/athyper/.well-known/openid-configuration | jq .
```

Open Keycloak admin UI, confirm the client secret, and update `IAM_CLIENT_SECRET` in
`/opt/stack/athyper/secrets/.env` if needed. Then re-run:

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

Check logs:

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'athyper-api|athyper-worker|athyper-scheduler|athyper-neon-web'

docker logs athyper-api-1 --tail 100
docker logs athyper-neon-web-1 --tail 100
```

External smoke:

```bash
curl -sf https://api-stg.athyper.com/livez
curl -sf https://api-stg.athyper.com/readyz
curl -sf https://neon-stg.athyper.com/livez
```

TLS issuer:

```bash
echo | openssl s_client -connect api-stg.athyper.com:443 2>/dev/null | openssl x509 -issuer -noout
```

Expected issuer: Let's Encrypt (not staging) once production ACME is configured.

---

## Phase 20 — Start Secondary Profiles

**EXECUTE ON:** SERVER
**AS:** athyper

Start one profile at a time.

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

Verify no direct Docker socket mount:

```bash
docker inspect athyper-gateway-1 \
  | jq '.[0].HostConfig.Binds | map(select(contains("docker.sock")))'

docker inspect athyper-logshipper-1 \
  | jq '.[0].HostConfig.Binds | map(select(contains("docker.sock")))'
```

Both should be `[]`.

---

## Phase 21 — Full Smoke Test

**EXECUTE ON:** SERVER
**AS:** athyper

```bash
sudo -iu athyper
cd /opt/products/athyper

set -a
. /opt/stack/athyper/secrets/.env
set +a

bash /opt/products/athyper/stack/scripts/smoke-staging.sh
bash /opt/products/athyper/stack/scripts/setup/verify-objectstorage.sh
bash /opt/products/athyper/stack/scripts/setup/verify-port-hardening.sh

docker ps --format 'table {{.Names}}\t{{.Status}}'
```

Browser check from workstation:

```text
https://neon-stg.athyper.com
Login with the configured demo user.
Application loads.
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

systemd-analyze security athyper-stack || true
```

Start via systemd only after manual smoke has passed:

```bash
systemctl start athyper-stack
systemctl status athyper-stack --no-pager
```

Expected: `active (exited)` for a oneshot service, with containers running.

---

## Phase 23 — Backup Setup

**EXECUTE ON:** SERVER
**AS:** athyper for script testing, root for cron file

As `athyper`:

```bash
sudo -iu athyper
cd /opt/products/athyper

mkdir -p /opt/stack/athyper/backups
mkdir -p /opt/stack/athyper/logs

# Verify the backup script is present
ls stack/scripts/db/backup-all.sh
```

Run a manual test to confirm credentials and connectivity:

```bash
bash stack/scripts/db/backup-all.sh --no-upload
```

Expected: dumps written to `/opt/stack/athyper/backups/<timestamp>/` with no errors.

Set offsite credentials before enabling the full run:

```bash
grep BACKUP_REMOTE /opt/stack/athyper/secrets/.env
# BACKUP_REMOTE_S3_ENDPOINT — offsite S3-compatible URL (Wasabi / B2 / remote MinIO)
# BACKUP_REMOTE_S3_ACCESS_KEY
# BACKUP_REMOTE_S3_SECRET_KEY
# BACKUP_REMOTE_S3_BUCKET
```

Backups must push to offsite S3/B2/Wasabi/remote MinIO. Local `/opt/stack/athyper/backups` is
only a staging area.

As `root`, install cron after the backup script is confirmed:

```bash
cat > /etc/cron.d/athyper-backup << 'EOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

0 2 * * * athyper cd /opt/products/athyper && /bin/bash stack/scripts/db/backup-all.sh >> /opt/stack/athyper/logs/backup.log 2>&1
EOF

chmod 0644 /etc/cron.d/athyper-backup
cat /etc/cron.d/athyper-backup
```

Verify at least one backup reaches the offsite bucket.

---

## Phase 24 — Secrets Mirror and Cleanup

**EXECUTE ON:** SERVER / Infisical UI
**AS:** athyper / operator

Import all generated secrets from `~/secrets-staging.txt` into Infisical or your chosen secrets
manager. After confirmed:

```bash
sudo -iu athyper
shred -u ~/secrets-staging.txt
ls ~/secrets-staging.txt || true
```

The on-disk `.env` is a materialized runtime cache; the source of truth should be Infisical.

---

## Phase 25 — Reboot Drill

**EXECUTE ON:** SERVER
**AS:** root or sudo-enabled ops user

```bash
reboot
```

After reconnect:

```bash
ssh nchandravel-atlas@<SERVER_PUBLIC_IP>

docker ps --format 'table {{.Names}}\t{{.Status}}'
systemctl status athyper-stack --no-pager

sudo -iu athyper
cd /opt/products/athyper
set -a
. /opt/stack/athyper/secrets/.env
set +a
bash /opt/products/athyper/stack/scripts/smoke-staging.sh
```

All core containers must be `Up` and smoke test must pass within 10 minutes.

---

## Phase 26 — Final SSH Hardening

**EXECUTE ON:** SERVER
**AS:** root

**Prerequisites:** Phase 25 (Reboot Drill) complete. All containers `Up`. Smoke test passing.
SSH key login for the ops account is working in your **current terminal session**.

> **Keep this terminal open the entire time.**
> Do not close it until you have verified key login from a second terminal (step 2 below).
> If the new config breaks login, you still have a live session to roll back.

### Step 1 — Write and validate the config

```bash
cat > /etc/ssh/sshd_config.d/athyper.conf << 'EOF'
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
AllowGroups sudo athyper-config

Match User athyper
    ForceCommand /usr/sbin/nologin
EOF

chmod 0644 /etc/ssh/sshd_config.d/athyper.conf

# Validate before reloading — any syntax error exits non-zero
sshd -t && echo "sshd config OK"
```

### Step 2 — Reload and verify from a second terminal

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

### Step 3 — Confirm root and athyper are blocked

From the workstation, attempt logins that must be rejected:

```bash
# root SSH must be refused (Permission denied or "not allowed")
ssh root@<SERVER_PUBLIC_IP> 2>&1 | grep -i "denied\|not allowed\|closed" || true

# athyper must connect but immediately be ejected (ForceCommand = nologin)
ssh athyper@<SERVER_PUBLIC_IP> 2>&1 | grep -i "nologin\|not allowed\|closed" || true
```

### Step 4 — VNC break-glass verification

Confirm the VNC console is reachable via the provider panel (do not test from SSH):

```text
VNC: provider console
Login: root  (password in vault)
Verify: id returns root; docker ps is reachable
```

Root via VNC is the only break-glass path. Root SSH no longer works.

### Step 5 — SSH hardening checklist

Do not mark the deployment complete until all five are checked:

```text
[ ] root SSH disabled — ssh root@<SERVER> returns Permission denied
[ ] password SSH disabled — PasswordAuthentication no confirmed in sshd_config.d/athyper.conf
[ ] key login verified — ops account logs in without password prompt in new terminal
[ ] athyper direct SSH blocked — ForceCommand nologin confirmed; connection drops immediately
[ ] VNC / root break-glass verified — root login via VNC console confirmed working
```

---

# Part C — Post-Deploy Verification Checklist

**EXECUTE ON:** SERVER
**AS:** root or athyper as noted

## C.1 Security Checks

**AS:** root

```bash
find /opt/stack/athyper/secrets -perm /o+r -ls
grep -r NOPASSWD:ALL /etc/sudoers* || true
find /opt/stack/athyper/config -perm /022 -ls
```

Expected:

```text
No world-readable secrets
No NOPASSWD:ALL
No world-writable config
```

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
data root: athyper:athyper-data 0755 no setgid
leaf dirs: svc-* owner/group 0750
```

## C.3 Docker Checks

**AS:** athyper

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}'
docker ps --format '{{.Names}}' | grep -v '^athyper-' && echo "Unexpected project name drift" || true

docker inspect athyper-gateway-1 \
  | jq '.[0].HostConfig.Binds | map(select(contains("docker.sock")))'

docker inspect athyper-logshipper-1 \
  | jq '.[0].HostConfig.Binds | map(select(contains("docker.sock")))'
```

Expected socket checks: `[]`.

## C.4 UID Drift Checks

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

Check that effective UID/GID matches the v13 service identity or an approved named-volume exception.

## C.5 Config Drift

**AS:** root

```bash
cd /opt/products/athyper

ATHYPER_CONFIG_ROOT=/opt/stack/athyper/config \
ATHYPER_SECRETS_ROOT=/opt/stack/athyper/secrets \
bash stack/scripts/setup/setup-config.sh staging --diff
```

Expected: no unintended drift.

## C.6 Memory Limits Audit

**AS:** athyper

All services must declare a memory limit. This check catches any that slip through PG-08.

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

Git pull is safe because runtime config, secrets, and data are outside the repo.

## D.5 Edit Secrets

```bash
sudo -iu athyper
nano /opt/stack/athyper/secrets/.env
bash /opt/products/athyper/stack/scripts/setup/validate-env.sh /opt/stack/athyper/secrets/.env
```

## D.6 Edit Config

Config is root-owned:

```bash
sudo nano /opt/stack/athyper/config/<path>
```

Then check drift (C.5).

## D.7 Permission Repair for One Leaf Only

Never `chown -R /opt/stack/athyper/data`.

Example Redis repair in staging:

```bash
sudo -i

docker rm -f athyper-memorycache-1 2>/dev/null || true

find /opt/stack/athyper/data/memorycache -mindepth 1 -delete

chown svc-redis:svc-redis /opt/stack/athyper/data/memorycache
chmod 0750 /opt/stack/athyper/data/memorycache
chmod g-s /opt/stack/athyper/data/memorycache

# Step 1: host write probe
sudo -u svc-redis -g svc-redis sh -c 'touch /opt/stack/athyper/data/memorycache/.write_probe && rm /opt/stack/athyper/data/memorycache/.write_probe'

# Step 2: container canary — confirms the real image can also write under the service UID.
# A host probe passing but a container canary failing indicates a stale Docker mount cache
# or image UID drift, not a host permission problem.
docker run --rm \
  --user 9100:9100 \
  -v /opt/stack/athyper/data/memorycache:/data \
  redis:7.4.8-alpine \
  sh -c 'cd /data && touch t && rm t && echo container-ok'

# Step 3: only start the stack after both probes pass
sudo -iu athyper
cd /opt/products/athyper
bash stack/scripts/stack-profile/up.sh core
```

## D.8 VNC Recovery

Use VNC console only for break-glass:

```text
VNC: provider console
Login: root
Use vault password
Never login as athyper through SSH.
```

---

# Part E — Final Go/No-Go Checklist

Do not declare staging ready until all are true.

**Infrastructure**

```text
[ ] DNS critical records resolve from 1.1.1.1 and 8.8.8.8.
[ ] Root password rotated and stored in vault.
[ ] No NOPASSWD:ALL remains.
[ ] Docker uses journald and live-restore.
[ ] /opt/products/athyper and /opt/stack/athyper are separate.
[ ] /opt/stack/athyper/data is 0755 with no setgid.
[ ] svc-* users/groups exist with UIDs/GIDs 9100–9105.
[ ] No data leaf is owned by a human account such as rmanoj-atlas or ops-admin.
[ ] GID pre-check passed (no GID 9100–9105 taken by non-svc-* group before Phase 2.2).
[ ] Host write probe passes for all bind-mounted data dirs.
[ ] Container canaries pass for Redis, MinIO, Meili, and telemetry directories.
[ ] stack/env/.env exists and contains only path variables.
[ ] /opt/stack/athyper/secrets/.env is 0600 and not world-readable.
[ ] redis-acl.conf is athyper:svc-redis 640 (not world-readable — contains hashed passwords).
[ ] validate-env.sh passes and renders redis-acl.conf.
[ ] docker compose render has no unresolved variables and no blank bind mount sources.
```

**Services**

```text
[ ] memorycache returns PONG.
[ ] objectstorage is healthy.
[ ] DB and PgBouncer are healthy.
[ ] IAM OIDC endpoint returns JSON.
[ ] API livez and readyz return 200.
[ ] Neon web livez returns 200.
[ ] Browser login succeeds.
[ ] No direct docker.sock mount exists on gateway/logshipper.
[ ] Memory limits audit (C.6) prints "OK".
[ ] Backup reaches offsite target.
[ ] Reboot drill passes (Phase 25).
```

**SSH hardening — Phase 26 (last step before go-live)**

```text
[ ] root SSH disabled — ssh root@<SERVER> returns Permission denied.
[ ] password SSH disabled — PasswordAuthentication no in sshd_config.d/athyper.conf.
[ ] key login verified — ops account logs in without password prompt in a new terminal.
[ ] athyper direct SSH blocked — ForceCommand nologin; connection drops immediately.
[ ] VNC / root break-glass verified — root login via provider VNC console confirmed working.
```

> These five items are gated on a working stack. Execute Phase 26 only after the reboot
> drill passes. Keep an active SSH session open while applying the config.

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
15. C.6 memory-limits audit added to post-deploy checklist.
