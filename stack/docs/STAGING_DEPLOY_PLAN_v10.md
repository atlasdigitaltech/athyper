# Athyper Staging Deployment Plan — v10 (Final · Execution Ready · Pending Prerequisites)

**Server:** `athyper-staging` · Contabo Cloud VPS 30 NVMe
**IPv4:** `62.169.31.9`
**IPv6:** `2a02:c207:2283:6875::1` _(not used in initial bring-up)_
**Resources:** 8 cores · 24 GB RAM · 200 GB NVMe · 600 Mbit/s
**OS:** Ubuntu 24.04
**Current state:**
- Access: `athyper@62.169.31.9` / initial password `Atlas1144` — **rotated in Phase 1.1**
- Host runtime: Node 24.15.0, pnpm 10.33.0 — **not pre-installed on a fresh Contabo VPS; installed in Phase 1.2**
- Docker: not yet installed (installed in Phase 2)

**Console recovery:** VNC `5.189.174.159:63128`
**Source:** `feature/finance-core` from `github.com/atlasdigitaltech/athyper`, pinned in Phase 4.

---

## Annotation Key

Every step is labelled with who runs it and where:

| Label | Meaning |
|---|---|
| `[WORKSTATION]` | Run on your local machine before or during the deployment |
| `[SERVER]` | Run in your SSH session as `athyper` user; `sudo` is prefixed where root access is needed |

There is no root login to the server at any point. All server operations are as `athyper` using `sudo` for system-level commands.

---

## ⚠ Before Execution — Three Standing Recommendations

### 1. Do not start until the Runbook Prerequisites are complete.

`BACKUP_RUN_CMD` must be filled, the restore-script signature must be confirmed, and the realm-JSON client discovery must be recorded. Until those blanks are closed, the runbook depends on tribal knowledge.

### 2. Treat the host-side seed as a temporary workaround, not a pattern.

Phase 11 exposes `127.0.0.1:5432` briefly, runs `seed-db.sh` on the host, then closes the port immediately. Acceptable for this run. The long-term target is a dedicated seed/admin image (Phase 20.3 follow-up).

### 3. Keep the observability phase where it is.

Apps first, minimal smoke first, then telemetry/monitoring/render/search. Resist starting observability in parallel — fault isolation is worth the extra 15 minutes.

---

## Runbook Prerequisites — **Must Be Completed Before Execution**

### Prereq 1. Backup on-demand command

```bash
# Find the backup command in the repo:
find stack/ -name "*.sh" | xargs grep -l "backup" 2>/dev/null
grep -r "backup-now\|run-now\|pg_dump" stack/scripts/ 2>/dev/null | head -20
```

Test against a dev instance before handoff.

```
BACKUP_RUN_CMD = __________________________________________________
```

### Prereq 2. Restore script signature confirmed

```bash
bash stack/scripts/db/restore/restore-db.sh --help 2>/dev/null || \
  head -30 stack/scripts/db/restore/restore-db.sh
```

Verified present, signature matches `restore-db.sh <db_name> <backup_id>`: **☐ Yes  ☐ No**

### Prereq 3. Realm JSON — client secret discovery

```bash
# 3a — does the template reference the env var at import time?
grep -c 'IAM_CLIENT_SECRET' stack/config/iam/realm-demosetup.json
```

Result: `____` (≥ 1 = secret injected at import; `0` = must copy KC secret manually in Phase 12.3)

```bash
# 3b — which clientId carries the secret field used for backend auth?
jq '.clients[]? | select(.clientId == "athyper-api" or .clientId == "athyper-api-runtime") \
  | {clientId, clientAuthenticatorType, hasSecret: (has("secret"))}' \
  stack/config/iam/realm-demosetup.json
```

```
CLIENT_WITH_SECRET = _______________  (athyper-api  OR  athyper-api-runtime)
```

Phase 12.3 navigates to this exact client in the KC admin UI.

### Sign-off

```
Prepared by:   _______________________    Date: __________
Reviewed by:   _______________________    Date: __________
```

---

## Directory Structure Reference

### Server filesystem layout

```
/home/athyper/
├── .ssh/
│   └── authorized_keys          ← Phase 1.3
├── deploy-record.txt             ← Phase 4.2, 4.3  (chmod 600)
└── secrets-staging.txt           ← Phase 5.3  (chmod 600, shred Phase 18.3)

/opt/athyper/                     ← Phase 3  (sudo mkdir + chown athyper)
└── app/                          ← Phase 4.1  (git clone target)
    ├── server/
    │   ├── Dockerfile.prod       ← Phase 4.3  (sed patch: pnpm@latest → 10.33.0)
    │   └── db/seed/migrate.ts    ← called by seed-db.sh
    ├── apps/web/Dockerfile        ← node:20-alpine, unchanged
    └── stack/
        ├── compose/
        │   ├── compose.yml                          ← base compose
        │   ├── athyper.override.staging.yml         ← Phase 6.4  (edited)
        │   └── apps/athyper-apps.yml                ← service definitions
        ├── config/
        │   ├── apps/
        │   │   ├── kernel.config.staging.parameter.json   ← source template
        │   │   └── kernel.config.parameter.json           ← Phase 6.5 creates this
        │   ├── db/
        │   │   ├── local/dbpool/
        │   │   │   ├── pgbouncer-apps.ini     ← used (listen_addr=0.0.0.0)
        │   │   │   └── pgbouncer-session.ini  ← used
        │   │   └── staging/dbpool/            ← NOT used (listen_addr=127.0.0.1, TLS)
        │   ├── gateway/
        │   │   ├── certs/
        │   │   │   ├── athyper.tls.local.crt  ← pre-existing dev cert (do not delete)
        │   │   │   ├── athyper.tls.local.key  ← pre-existing dev cert (do not delete)
        │   │   │   └── acme.json              ← Phase 6.4d creates  (chmod 600)
        │   │   ├── dynamic/                   ← Traefik watches this directory
        │   │   │   ├── athyper.workbench.yml  ← Phase 6.2 copies here
        │   │   │   └── athyper.tls.yml        ← Phase 6.3 copies here
        │   │   └── environments/              ← source templates (do not edit directly)
        │   │       ├── neon-workbench-routes.staging.yml
        │   │       └── athyper.tls.staging.yml
        │   └── iam/
        │       └── realm-demosetup.json       ← Phase 12.1 / 12.2
        ├── data/                              ← Phase 7 creates all subdirectories
        │   ├── db/
        │   ├── meilisearch/
        │   ├── memorycache/
        │   ├── memorycache-jobs/
        │   ├── metabase/
        │   ├── objectstorage/
        │   ├── telemetry/
        │   │   ├── logging/
        │   │   ├── metrics/
        │   │   ├── observability/
        │   │   └── tracing/
        │   └── uptime-kuma/
        ├── env/
        │   ├── staging.env.example            ← template source
        │   └── .env                           ← Phase 5.2 creates, 5.4 populates
        └── scripts/
            ├── lib/
            │   ├── compose.sh                 ← exports ATHYPER_CONFIG + ATHYPER_DATA
            │   └── constants.sh
            ├── setup/
            │   ├── setup-env.sh               ← Phase 5.2
            │   ├── setup-config.sh            ← Phase 6.5
            │   ├── data-dirs-create.sh        ← Phase 7
            │   ├── validate-env.sh            ← Phase 8.3
            │   ├── verify-objectstorage.sh    ← Phase 16
            │   └── verify-port-hardening.sh   ← Phase 16
            ├── stack-profile/
            │   ├── up.sh                      ← Phase 10, 13, 15, 17, 19
            │   └── down.sh                    ← Phase 17 (stop unit)
            └── db/
                ├── transaction/neon/seed-db.sh  ← Phase 11.3
                └── session/iam/reset-iam.sh     ← Phase 12.2

/swapfile                                      ← Phase 0.5  (sudo)
/usr/local/bin/disk-alert.sh                   ← Phase 0.5  (sudo, removed Phase 15.5)
/etc/cron.d/disk-alert                         ← Phase 0.5  (sudo, removed Phase 15.5)
/etc/systemd/system/athyper-stack.service      ← Phase 17   (sudo)
/etc/docker/daemon.json                        ← Phase 2.2  (sudo)
/etc/fail2ban/jail.local                       ← Phase 1.5  (sudo)
/etc/ssh/sshd_config                           ← Phase 1.6  (sudo)
```

### `athyper.override.staging.yml` — exact final state after Phase 6.4

The file currently has 7 service blocks. Phase 6.4 makes two changes: adds `environment:` to the existing `iam:` block, and appends a new `gateway:` block at the end.

```yaml
# ======= EXISTING — do not touch =======
volumes:
  athyper_db_data:
    driver: local

services:
  telemetry:
    volumes:
      - ${ATHYPER_CONFIG}/telemetry/provisioning.env/dashboards.staging.yml:/etc/grafana/provisioning/dashboards/dashboards.yml:ro

  # ======= EDIT — add environment: alongside existing command: (single iam: block) =======
  iam:
    command: ["start", "--import-realm"]
    environment:
      KC_SMTP_USERNAME: ${KC_SMTP_USERNAME}
      KC_SMTP_PASSWORD: ${KC_SMTP_PASSWORD}

  # ======= EXISTING — do not touch =======
  athyper-api:
    build:
      dockerfile: server/Dockerfile.prod
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: "0.75"
          memory: "${APPS_ATHYPER_MEMORY_LIMIT}"
        reservations:
          cpus: "0.15"
          memory: 256M

  athyper-worker:
    build:
      dockerfile: server/Dockerfile.prod
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: "0.75"
          memory: "${APPS_ATHYPER_MEMORY_LIMIT}"
        reservations:
          cpus: "0.15"
          memory: 256M

  athyper-scheduler:
    build:
      dockerfile: server/Dockerfile.prod

  db:
    volumes:
      - athyper_db_data:/var/lib/postgresql/data
    deploy:
      resources:
        limits:
          memory: "${DB_MEMORY_LIMIT}"
        reservations:
          memory: 512M

  memorycache:
    deploy:
      resources:
        limits:
          memory: "${MEMORYCACHE_MEMORY_LIMIT}"
        reservations:
          memory: 128M

  # ======= APPEND — new block at end of file =======
  gateway:
    command:
      - --accesslog=${GATEWAY_ACCESSLOG:-true}
      - --api.dashboard=true
      - --api.insecure=false
      - --entrypoints.web.address=:80
      - --entrypoints.web.http.redirections.entrypoint.scheme=https
      - --entrypoints.web.http.redirections.entrypoint.to=websecure
      - --entrypoints.websecure.address=:443
      - --entrypoints.websecure.forwardedHeaders.insecure=false
      - --entrypoints.websecure.http.encodeQuerySemicolons=true
      - --entrypoints.websecure.http.tls=true
      - --global.checknewversion=false
      - --global.sendanonymoususage=false
      - --log.format=json
      - --log.level=${GATEWAY_LOG_LEVEL:-INFO}
      - --ping=true
      - --providers.docker.exposedbydefault=false
      - --providers.docker.network=athyper-edge
      - --providers.docker=true
      - --providers.file.directory=/etc/traefik/dynamic
      - --providers.file.watch=true
      - --serversTransport.forwardingTimeouts.dialTimeout=30s
      - --serversTransport.insecureSkipVerify=false
      - --certificatesResolvers.letsencrypt-staging.acme.email=${ACME_EMAIL}
      - --certificatesResolvers.letsencrypt-staging.acme.storage=/certs/acme.json
      - --certificatesResolvers.letsencrypt-staging.acme.httpChallenge.entryPoint=web
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ${ATHYPER_CONFIG}/gateway/dynamic:/etc/traefik/dynamic:ro
      - ${ATHYPER_CONFIG}/gateway/certs:/certs
```

> **Why the gateway command list is a full replacement**: Docker Compose `command:` is scalar — an override replaces the entire list. The override replicates all base flags from `athyper-gateway.yml` plus adds the three ACME lines. The `volumes:` list is merged by Compose (deduplicating by target path); the override's `/certs` (writable) wins over the base's `/certs:ro`, which ACME requires to write `acme.json`.

---

## Server Account Reference

### Account responsibilities

| Account | Used for | Sudo | Login method |
|---|---|---|---|
| `root` | VNC console recovery only — never for day-to-day work | — (is root) | VNC tty (`5.189.174.159:63128`) |
| `athyper` | All deployment steps in this runbook; runs the systemd service; owns `/opt/athyper/` and `stack/data/` | Yes (via `sudo`) | SSH key (after Phase 1.6); VNC tty as fallback |

**Rule**: never SSH as `root`. The sshd config (Phase 1.6) enforces `PermitRootLogin no`. All `root`-level operations in this runbook are prefixed with `sudo` and run as `athyper`.

### Initial credentials

| Account | Initial password | Rotated in |
|---|---|---|
| `root` | Set by Contabo at VPS provisioning — retrieve from the Contabo control panel | Not changed in this runbook (SSH root login is disabled) |
| `athyper` | `Atlas1144` | Phase 1.1 (mandatory — rotate before any other step) |

> **Security note**: `Atlas1144` is the Contabo-provisioned default. It is valid on the local VNC tty even after SSH password auth is disabled. Store the rotated password in your vault; never write it to any file on the server.

### Creating the `athyper` account (run once from root if the account does not yet exist)

A fresh Contabo VPS ships with only the `root` account. Run the following from the VNC console or an initial root SSH session to create `athyper` before this runbook starts.

```bash
# [SERVER — as root via VNC or initial root SSH]

# Create the user with home directory:
adduser --gecos "Athyper Deploy" athyper
# You will be prompted for a password — enter: Atlas1144
# All other GECOS fields (Full Name, Room, etc.) can be left blank (press Enter)

# Grant sudo access:
usermod -aG sudo athyper

# Verify membership:
id athyper
# Expected: uid=1000(athyper) gid=1000(athyper) groups=1000(athyper),27(sudo)

# Confirm SSH password auth is still enabled (Contabo default) so Phase 0.4 can connect:
grep -E '^PasswordAuthentication' /etc/ssh/sshd_config
# If the line says "no", temporarily re-enable it: sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config && systemctl restart sshd
# Phase 1.6 will disable it again after the SSH key is installed.
```

After this, continue with Phase 0 using `ssh athyper@62.169.31.9` (password `Atlas1144`).

---

## Phase 0 — DNS and Pre-flight

### 0.1 Critical DNS `[WORKSTATION]`

All 6 A records must resolve to `62.169.31.9` before any stack work begins. Traefik issues ACME certificates at first startup — if DNS is not live, Let's Encrypt will fail and rate-limit the domain.

```bash
for host in api-stg neon-stg iam-stg gateway-stg objectstorage-stg \
            objectstorage.console-stg; do
  ip1=$(dig @1.1.1.1 +short "${host}.athyper.com" | tail -1)
  ip2=$(dig @8.8.8.8 +short "${host}.athyper.com" | tail -1)
  printf "%-40s 1.1.1.1=%-15s 8.8.8.8=%-15s\n" "${host}" "${ip1}" "${ip2}"
done
# Every line must show 62.169.31.9 on both resolvers.
# Do not proceed if any line differs.
```

### 0.2 Secondary DNS `[WORKSTATION]`

Verified before Phase 15 only (not blocking Phases 0–14):

```
telemetry-stg.athyper.com    metrics-stg.athyper.com
traces-stg.athyper.com       logs-stg.athyper.com
uptime-stg.athyper.com       healthchecks-stg.athyper.com
errors-stg.athyper.com       meilisearch-stg.athyper.com
```

### 0.3 Capture OPERATOR_IP — **from your workstation, before connecting to server** `[WORKSTATION]`

This IP is used in Phase 6.2 to whitelist `/admin` and `/ops` Traefik routes. If you run `curl` on the server it returns the server's own IP (`62.169.31.9`) which would block all real browser access.

```bash
# On YOUR local machine — not the server:
curl -s ifconfig.me
# Note this value as OPERATOR_IP (e.g. 203.0.113.42)
```

### 0.4 Capacity + NTP verification `[SERVER]`

```bash
ssh athyper@62.169.31.9      # password: Atlas1144 (rotated in Phase 1.1)

free -h                       # ✓ ~24 GB
df -h /                       # ✓ ~190 GB free
nproc                         # ✓ 8
# node and pnpm are NOT pre-installed on a fresh Contabo VPS — installed in Phase 1.2

sudo timedatectl set-ntp true
timedatectl status | grep -i 'System clock synchronized'    # yes
```

---

## Phase 0.5 — Server Prep `[SERVER]`

```bash
# — Swap (sudo required; idempotent — safe to run even if swap already exists) —
if ! swapon --show | grep -q '/swapfile'; then
  sudo fallocate -l 8G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo "✓ swapfile created and activated"
else
  echo "✓ swapfile already active — skipping creation"
fi

# Add to fstab only if not already present:
grep -q '/swapfile' /etc/fstab \
  && echo "✓ /etc/fstab already has swapfile entry — skipping" \
  || { echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab; echo "✓ added to fstab"; }

# Add swappiness only if not already present:
grep -q 'vm.swappiness' /etc/sysctl.conf \
  && echo "✓ vm.swappiness already in sysctl.conf — skipping" \
  || { echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf; }
sudo sysctl -p

# Verify swap is active:
free -h    # Swap row must show 8.0G total

# — Journald log caps (sudo required) —
sudo sed -i \
  's/^#SystemMaxUse=.*/SystemMaxUse=1G/; s/^#SystemMaxFileSize=.*/SystemMaxFileSize=100M/' \
  /etc/systemd/journald.conf
sudo systemctl restart systemd-journald
sudo journalctl --vacuum-size=500M

# — Interim disk alert (sudo required; replaced by Prometheus in Phase 15.5) —
sudo tee /usr/local/bin/disk-alert.sh > /dev/null << 'EOF'
#!/bin/bash
USAGE=$(df / | awk 'NR==2 {print $5}' | tr -d '%')
if [ "$USAGE" -gt 85 ]; then
  echo "[$(date -Iseconds)] DISK ALERT: / at ${USAGE}%" >> /var/log/disk-alert.log
fi
EOF
sudo chmod +x /usr/local/bin/disk-alert.sh
echo "*/15 * * * * root /usr/local/bin/disk-alert.sh" | sudo tee /etc/cron.d/disk-alert
```

---

## Phase 1 — Rotate Password, User Setup, SSH Hardening

### 1.1 Rotate the `athyper` password immediately `[SERVER]`

`Atlas1144` remains valid on the local tty and VNC console even after SSH password auth is disabled. Change it before any other hardening.

```bash
passwd
# Interactive — enter a strong generated password (≥ 20 chars, mixed)
# Store in your password vault (1Password, Bitwarden) NOW
# Do NOT write it to deploy-record.txt or any server-side file
```

> **VNC recovery uses this rotated password**: `5.189.174.159:63128` — see Appendix B.

### 1.2 Verify user state and install base tools `[SERVER]`

```bash
# Confirm sudo group membership (docker group checked in Phase 2.3 after install):
id athyper | grep -q sudo && echo "✓ sudo group" || echo "✗ MISSING sudo group"

# Install all base packages (sudo required):
sudo apt update && sudo apt upgrade -y
sudo apt install -y \
  curl wget git unzip ca-certificates gnupg lsb-release \
  apache2-utils jq htop ufw fail2ban \
  postgresql-client

# Verify critical tools:
psql --version        # required for Phase 11.2 connectivity test
jq --version          # required for Phase 12.1, 12.3, Prereq 3

sudo timedatectl set-timezone UTC
```

### 1.2a Install Node.js 24.x and pnpm 10.33.0 `[SERVER]`

> A fresh Contabo VPS does not include Node.js or pnpm. Both are required on the host: pnpm for `pnpm install --frozen-lockfile` (Phase 7) and `tsx` for the database seed script (Phase 11).

```bash
# — Node.js 24.x via NodeSource —
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs

# — pnpm 10.33.0 via corepack (ships with Node) —
sudo corepack enable
corepack prepare pnpm@10.33.0 --activate

# Verify — both must match exactly:
node --version    # v24.x.x  (any 24.x is fine; plan targets v24.15.0)
pnpm --version    # 10.33.0
```

> If `corepack prepare` fails with a network error, fall back to: `sudo npm install -g pnpm@10.33.0`

### 1.3 Install SSH public key `[WORKSTATION → SERVER]`

**Get your public key** `[WORKSTATION]`:

```bash
cat ~/.ssh/id_ed25519.pub    # or id_rsa.pub
# Copy the entire output line
```

**Install on server** `[SERVER]`:

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys
# Paste the public key — one line, no extra whitespace
# Save: Ctrl+O, Enter, Ctrl+X
chmod 600 ~/.ssh/authorized_keys
cat ~/.ssh/authorized_keys    # verify one line present
```

### 1.4 Firewall — three explicit rules `[SERVER — sudo required]`

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status verbose
# Confirm: ports 22, 80, 443 listed as ALLOW IN
```

### 1.5 fail2ban `[SERVER — sudo required]`

```bash
sudo tee /etc/fail2ban/jail.local > /dev/null << 'EOF'
[sshd]
enabled = true
port = ssh
maxretry = 5
bantime = 3600
findtime = 600
EOF
sudo systemctl enable fail2ban
sudo systemctl restart fail2ban
sudo fail2ban-client status sshd    # verify jail is active
```

### 1.6 SSH hardening — two independent gates, then lockdown

> **Critical**: Keep your existing server session open throughout this entire phase. Never close it until Step C confirms all three tests pass.

#### Step A1 — Verify SSH key auth works `[WORKSTATION — new terminal]`

```bash
# Open a NEW terminal on your workstation. Keep the existing server session open.
ssh -i ~/.ssh/your_key athyper@62.169.31.9 "whoami"
# Must print exactly: athyper
# If it fails: the key install in 1.3 didn't take — fix authorized_keys before continuing
```

#### Step A2 — Verify sudo works in the current server session `[SERVER]`

In your **existing** server session:

```bash
sudo -v                # refreshes sudo credential; prompts password if needed
sudo whoami            # must print: root
```

A password prompt is normal and fine — passwordless sudo is not required.

> **Optional — to avoid repeated sudo prompts for the rest of the runbook:**
> ```bash
> sudo visudo
> # Add at the end:
> athyper ALL=(ALL) NOPASSWD:ALL
> ```
> Re-test: `sudo -n whoami` must print `root` without a prompt.

**DO NOT proceed to Step B until both A1 and A2 succeed.**

#### Step B — Disable password and root SSH `[SERVER — sudo required]`

```bash
sudo sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config

# Validate config before reloading (catches syntax errors):
sudo sshd -t && echo "✓ sshd config valid" || echo "✗ sshd config error — do NOT reload"

sudo systemctl restart sshd
```

#### Step C — Confirm lockdown `[WORKSTATION]`

```bash
ssh root@62.169.31.9 2>&1 | head -3                   # must be refused
ssh athyper@62.169.31.9 "whoami"                      # must print: athyper
ssh -o PubkeyAuthentication=no athyper@62.169.31.9    # must be refused
```

If the third command unexpectedly succeeds, password auth was not fully disabled. Use VNC to recover and re-run Step B.

---

## Phase 2 — Docker Installation

### 2.1 Install Docker `[SERVER — sudo required]`

```bash
sudo apt remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y \
  docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin

# Add athyper to docker group (takes effect on next login):
sudo usermod -aG docker athyper
```

### 2.2 Docker log rotation `[SERVER — sudo required]`

```bash
sudo tee /etc/docker/daemon.json > /dev/null << 'EOF'
{ "log-driver": "json-file", "log-opts": { "max-size": "50m", "max-file": "5" } }
EOF
sudo systemctl restart docker
sudo systemctl enable docker
```

### 2.3 Verify Docker access — **reconnect first** `[WORKSTATION → SERVER]`

Docker group membership only applies to new sessions.

```bash
exit    # close current server session
```

```bash
# From workstation:
ssh athyper@62.169.31.9    # key auth — no password prompt
```

```bash
# [SERVER] — verify all tools in one block:
id athyper | grep -q docker && echo "✓ docker group" || echo "✗ MISSING docker group"
docker ps                                      # must succeed without sudo
docker version | grep -E 'Version|API version'
docker compose version                         # must be v2.x

# Host runtime — installed in Phase 1.2 / 1.2a:
node --version      # v24.x.x  (installed from NodeSource in Phase 1.2a)
pnpm --version      # 10.33.0  (installed via corepack in Phase 1.2a)
psql --version      # PostgreSQL client ≥ 16
jq --version        # jq-1.x
```

---

## Phase 3 — Working Directory `[SERVER — sudo required]`

```bash
sudo mkdir -p /opt/athyper
sudo chown athyper:athyper /opt/athyper
ls -la /opt/athyper    # must show: drwxr-xr-x athyper athyper
```

---

## Phase 4 — Clone Repository and Pin Deployment SHA

### 4.1 Clone `[SERVER]`

**Public repository:**

```bash
cd /opt/athyper
git clone --branch feature/finance-core \
  https://github.com/atlasdigitaltech/athyper.git app
```

**Private repository (one-shot PAT — credentials never stored in shell history):**

```bash
unset HISTFILE
set +o history
read -s -p "GitHub PAT: " GH_PAT; echo
cd /opt/athyper
git -c credential.helper='!f() { echo "username=x-access-token"; echo "password=${GH_PAT}"; }; f' \
  clone --branch feature/finance-core \
  https://github.com/atlasdigitaltech/athyper.git app
unset GH_PAT
set -o history
```

Verify:

```bash
ls /opt/athyper/app/stack/compose/compose.yml    # must exist
ls /opt/athyper/app/server/Dockerfile.prod       # must exist
```

### 4.2 Pin deployment SHA and create tag `[SERVER]`

```bash
cd /opt/athyper/app
DEPLOY_SHA=$(git rev-parse HEAD)
DEPLOY_TAG="staging-deploy-$(date +%Y%m%d-%H%M)-${DEPLOY_SHA:0:7}"

cat > ~/deploy-record.txt << EOF
Deployment: Athyper staging
Server:     athyper-staging / 62.169.31.9
Date:       $(date -Iseconds)
Branch:     feature/finance-core
Commit SHA: ${DEPLOY_SHA}
Tag:        ${DEPLOY_TAG}
Host Node:  $(node --version)
Host pnpm:  $(pnpm --version)
Operator:   $(whoami)
EOF
chmod 600 ~/deploy-record.txt
cat ~/deploy-record.txt

git tag "${DEPLOY_TAG}"
git checkout "${DEPLOY_SHA}"
git log --oneline -1
```

### 4.3 Patch `server/Dockerfile.prod` — **temporary, upstream in Phase 20.1** `[SERVER]`

> `server/Dockerfile.prod` contains `pnpm@latest`. The repo root `package.json` pins `"packageManager": "pnpm@10.33.0+sha512..."`. Using `pnpm@latest` inside the container risks lockfile format incompatibility and build failures. This patch aligns the container with the pinned version.
>
> **This is a server-side source mutation** — it creates drift between the server and the repo. The next clean clone will not have this patch. Phase 20.1 requires an upstream PR to commit the fix permanently.

```bash
cd /opt/athyper/app
sed -i 's/corepack prepare pnpm@latest/corepack prepare pnpm@10.33.0/' \
  server/Dockerfile.prod

# Verify the patch:
grep "corepack prepare" server/Dockerfile.prod
# Expected: RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# Record the mutation:
echo "Dockerfile.prod patched on server: $(date -Iseconds) — pnpm@latest → pnpm@10.33.0" \
  >> ~/deploy-record.txt
```

---

## Phase 5 — Environment Setup

### 5.1 Disable shell history `[SERVER]`

Secrets must not be saved to `.bash_history`. Disable for the duration of Phase 5.

```bash
unset HISTFILE
set +o history
```

### 5.2 Copy staging env template `[SERVER]`

```bash
cd /opt/athyper/app
bash stack/scripts/setup/setup-env.sh staging all
# Creates stack/env/.env from staging.env.example
ls -la stack/env/.env    # must exist
```

### 5.3 Generate all secrets to a temporary file `[SERVER]`

```bash
umask 077
cat > ~/secrets-staging.txt << EOF
# Generated $(date -Iseconds) for ${DEPLOY_TAG}
# Transfer to Infisical in Phase 18.3, then shred this file.
CREDENTIAL_MASTER_KEY=$(openssl rand -base64 48)
DB_ADMIN_PASSWORD=$(openssl rand -base64 18)
IAM_ADMIN_PASSWORD=$(openssl rand -base64 18)
IAM_CLIENT_SECRET=$(openssl rand -hex 32)
MEMORYCACHE_PASSWORD=$(openssl rand -base64 18)
REDIS_EXPORTER_PASSWORD=$(openssl rand -base64 18)
REDIS_GLITCHTIP_PASSWORD=$(openssl rand -base64 18)
REDIS_INFISICAL_PASSWORD=$(openssl rand -base64 18)
REDIS_ADMIN_PASSWORD=$(openssl rand -base64 18)
S3_ACCESS_KEY=athyper-stg-$(openssl rand -hex 4)
S3_SECRET_KEY=$(openssl rand -base64 32)
APP_S3_ACCESS_KEY=athyper-app-$(openssl rand -hex 4)
APP_S3_SECRET_KEY=$(openssl rand -base64 32)
BACKUP_S3_ACCESS_KEY=athyper-bak-$(openssl rand -hex 4)
BACKUP_S3_SECRET_KEY=$(openssl rand -base64 32)
TEMPO_S3_ACCESS_KEY=athyper-tempo-$(openssl rand -hex 4)
TEMPO_S3_SECRET_KEY=$(openssl rand -base64 32)
LOKI_S3_ACCESS_KEY=athyper-loki-$(openssl rand -hex 4)
LOKI_S3_SECRET_KEY=$(openssl rand -base64 32)
RENDERER_INTERNAL_TOKEN=$(openssl rand -hex 32)
INFISICAL_ENCRYPTION_KEY=$(openssl rand -hex 16)
INFISICAL_AUTH_SECRET=$(openssl rand -base64 32)
HEALTHCHECKS_SECRET_KEY=$(openssl rand -hex 32)
GLITCHTIP_SECRET_KEY=$(openssl rand -hex 32)
MEILI_MASTER_KEY=$(openssl rand -hex 24)
TELEMETRY_ADMIN_PASSWORD=$(openssl rand -base64 18)
EOF

# Gateway dashboard password — prompted interactively, never logged:
read -s -p "Gateway dashboard admin password: " PW; echo
echo "GATEWAY_DASHBOARD_HTPASSWD=$(htpasswd -nbB admin "${PW}" | sed 's/\$/\$\$/g')" \
  >> ~/secrets-staging.txt
unset PW

chmod 600 ~/secrets-staging.txt
wc -l ~/secrets-staging.txt    # ~30 lines expected
```

### 5.4 Edit `stack/env/.env` `[SERVER]`

```bash
nano /opt/athyper/app/stack/env/.env
```

Use `~/secrets-staging.txt` in a split terminal as reference. Fill every `<...>` placeholder. Variables marked **NOT IN TEMPLATE** must be added as new lines — Phase 8.2 will verify their presence.

```bash
SERVICE_VERSION=1.0.0-stg

# ── Database ──────────────────────────────────────────────────────────────────
# CHANGE: staging.env.example has DB_HOST=db-stg.athyper.com
#         Self-hosted Docker: use the compose service name "db" instead
DB_HOST=db
DB_PORT=5432
DB_ADMIN_PASSWORD=<from secrets: DB_ADMIN_PASSWORD>

# Application connection through PgBouncer (transaction pool, port 6432):
DATABASE_URL=postgresql://athyperadmin:<DB_ADMIN_PASSWORD>@dbpool-apps:6432/athyper_neon

# Admin connection is direct — bypasses PgBouncer (seed, migrations):
DATABASE_ADMIN_URL=postgresql://athyperadmin:<DB_ADMIN_PASSWORD>@db:5432/athyper_neon

DBPOOL_APPS_USER=athyperadmin
DBPOOL_APPS_PASSWORD=<same as DB_ADMIN_PASSWORD>
DBPOOL_SESSION_USER=athyperadmin
DBPOOL_SESSION_PASSWORD=<same as DB_ADMIN_PASSWORD>

# ── Cache / Redis ──────────────────────────────────────────────────────────────
MEMORYCACHE_PASSWORD=<from secrets>
REDIS_URL=redis://app:<MEMORYCACHE_PASSWORD>@memorycache:6379/0
REDIS_EXPORTER_PASSWORD=<from secrets>
REDIS_GLITCHTIP_PASSWORD=<from secrets>
REDIS_INFISICAL_PASSWORD=<from secrets>
REDIS_ADMIN_PASSWORD=<from secrets>
REDIS_BULLMQ_URL=

# ── Object Storage (MinIO) ────────────────────────────────────────────────────
S3_ENDPOINT=http://objectstorage:9000
S3_ACCESS_KEY=<from secrets>
S3_SECRET_KEY=<from secrets>
S3_REGION=us-east-1
S3_BUCKET=athyper-staging
APP_S3_ACCESS_KEY=<from secrets>
APP_S3_SECRET_KEY=<from secrets>
BACKUP_S3_BUCKET=athyper-backup-staging
BACKUP_S3_ACCESS_KEY=<from secrets>
BACKUP_S3_SECRET_KEY=<from secrets>
TEMPO_S3_ACCESS_KEY=<from secrets>
TEMPO_S3_SECRET_KEY=<from secrets>
LOKI_S3_ACCESS_KEY=<from secrets>
LOKI_S3_SECRET_KEY=<from secrets>

# ── IAM / Keycloak ────────────────────────────────────────────────────────────
IAM_ADMIN=athyperadmin
IAM_ADMIN_PASSWORD=<from secrets>
IAM_DB_USERNAME=athyperadmin
IAM_DB_PASSWORD=<same as DB_ADMIN_PASSWORD>
IAM_ISSUER_URL=https://iam-stg.athyper.com/realms/athyper
IAM_CLIENT_ID=athyper-api
IAM_CLIENT_SECRET=<from secrets>
KEYCLOAK_ADMIN_USERNAME=athyperadmin
KEYCLOAK_ADMIN_PASSWORD=<same as IAM_ADMIN_PASSWORD>
PLATFORM_IAM_ISSUER_URL=https://iam-stg.athyper.com/realms/platform-control
ATHYPER_SUPER__IAM_SECRET__IAM_ATHYPER_CLIENT_SECRET=<same as IAM_CLIENT_SECRET>

# ── SMTP (in template — fill the placeholders) ───────────────────────────────
KC_SMTP_HOST=smtp.yourmailprovider.com
KC_SMTP_PORT=587
KC_SMTP_FROM=noreply@athyper.com
KC_SMTP_AUTH=true
KC_SMTP_USERNAME=<your smtp username>
KC_SMTP_PASSWORD=<your smtp password>

# ── OAuth (blank initially — configure after login confirmed) ─────────────────
GITHUB_OAUTH_CLIENT_ID=
GITHUB_OAUTH_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# ── Security ──────────────────────────────────────────────────────────────────
CREDENTIAL_MASTER_KEY=<from secrets>
RENDERER_INTERNAL_TOKEN=<from secrets>
INFISICAL_ENCRYPTION_KEY=<from secrets>
INFISICAL_AUTH_SECRET=<from secrets>

# ── Gateway (in template — fill the placeholders) ────────────────────────────
GATEWAY_DASHBOARD_HTPASSWD=<from secrets>
ACME_EMAIL=ops@atlasdigitaltech.com

# ── Telemetry ─────────────────────────────────────────────────────────────────
OTLP_ENDPOINT=http://logshipper:4318
TELEMETRY_ADMIN_USER=admin
TELEMETRY_ADMIN_PASSWORD=<from secrets>

# ── Monitoring / Error tracking ───────────────────────────────────────────────
# DSN values left blank — populated in Phase 15.3 with the same value
HEALTHCHECKS_SECRET_KEY=<from secrets>
GLITCHTIP_SECRET_KEY=<from secrets>
GLITCHTIP_DSN=
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_ORG=athyper
SENTRY_PROJECT=athyper-runtime
SENTRY_URL=https://errors-stg.athyper.com
SENTRY_AUTH_TOKEN=

# ── Search ────────────────────────────────────────────────────────────────────
MEILI_MASTER_KEY=<from secrets>
```

```bash
chmod 600 /opt/athyper/app/stack/env/.env
```

### 5.5 Re-enable shell history `[SERVER]`

```bash
set -o history
export HISTFILE=~/.bash_history
```

---

## Phase 6 — Critical Pre-Deploy Config Fixes

### 6.1 PgBouncer — switch to local configs `[SERVER]`

> `staging.env.example` points to `db/staging/dbpool/` configs which have `listen_addr = 127.0.0.1` (Docker containers cannot connect) and require TLS/mTLS to an external managed PostgreSQL. The `db/local/dbpool/` configs have `listen_addr = 0.0.0.0` and no TLS requirement — correct for self-hosted Docker.

```bash
nano /opt/athyper/app/stack/env/.env
```

Change these two lines:

```bash
# FROM (staging template defaults — incompatible with self-hosted Docker):
#   DBPOOL_APPS_CONFIG=db/staging/dbpool/apps/pgbouncer-apps.ini
#   DBPOOL_SESSION_CONFIG=db/staging/dbpool/session/pgbouncer-session.ini

# TO (Docker-compatible local configs):
DBPOOL_APPS_CONFIG=db/local/dbpool/pgbouncer-apps.ini
DBPOOL_SESSION_CONFIG=db/local/dbpool/pgbouncer-session.ini
```

### 6.2 Workbench routes — whitelist OPERATOR_IP `[SERVER]`

> The source template contains `"198.51.100.0/24"` (RFC 5737 TEST-NET, intentional fail-safe). `validate-env.sh` blocks startup if this CIDR is still present in the dynamic config. Replace it with the IP captured in Phase 0.3.

```bash
cd /opt/athyper/app

# Copy template to the live dynamic directory:
cp stack/config/gateway/environments/neon-workbench-routes.staging.yml \
   stack/config/gateway/dynamic/athyper.workbench.yml

# Paste the IP from Phase 0.3 — from YOUR workstation, not the server:
OPERATOR_IP="203.0.113.42"   # ← REPLACE with Phase 0.3 value

# Safety guard — catches accidental use of the server's own IP:
if [ "${OPERATOR_IP}" = "62.169.31.9" ]; then
  echo "✗ OPERATOR_IP is the server's own IP — use your workstation IP"; exit 1
fi

# Replace the fail-safe CIDR:
sed -i "s|\"198.51.100.0/24\".*|\"${OPERATOR_IP}/32\"  # operator workstation / VPN|" \
  stack/config/gateway/dynamic/athyper.workbench.yml

# Verify:
grep -A1 "sourceRange" stack/config/gateway/dynamic/athyper.workbench.yml
# Must show: - "${OPERATOR_IP}/32"
# Must NOT show: 198.51.100.0/24, 0.0.0.0/0, or 62.169.31.9
```

### 6.3 TLS config `[SERVER]`

```bash
cp stack/config/gateway/environments/athyper.tls.staging.yml \
   stack/config/gateway/dynamic/athyper.tls.yml
```

### 6.4 Edit `athyper.override.staging.yml` — ACME + SMTP `[SERVER]`

```bash
cd /opt/athyper/app
nano stack/compose/athyper.override.staging.yml
```

**Edit 1 — extend the existing `iam:` block.**

Find the current block:

```yaml
  iam:
    command: ["start", "--import-realm"]
```

Add `environment:` immediately after `command:`:

```yaml
  iam:
    command: ["start", "--import-realm"]
    environment:
      KC_SMTP_USERNAME: ${KC_SMTP_USERNAME}
      KC_SMTP_PASSWORD: ${KC_SMTP_PASSWORD}
```

> There must be exactly **one** `iam:` key in the file. Do not create a second one.

**Edit 2 — append the `gateway:` block at the very end of the file** (after the `memorycache:` block):

```yaml
  gateway:
    command:
      - --accesslog=${GATEWAY_ACCESSLOG:-true}
      - --api.dashboard=true
      - --api.insecure=false
      - --entrypoints.web.address=:80
      - --entrypoints.web.http.redirections.entrypoint.scheme=https
      - --entrypoints.web.http.redirections.entrypoint.to=websecure
      - --entrypoints.websecure.address=:443
      - --entrypoints.websecure.forwardedHeaders.insecure=false
      - --entrypoints.websecure.http.encodeQuerySemicolons=true
      - --entrypoints.websecure.http.tls=true
      - --global.checknewversion=false
      - --global.sendanonymoususage=false
      - --log.format=json
      - --log.level=${GATEWAY_LOG_LEVEL:-INFO}
      - --ping=true
      - --providers.docker.exposedbydefault=false
      - --providers.docker.network=athyper-edge
      - --providers.docker=true
      - --providers.file.directory=/etc/traefik/dynamic
      - --providers.file.watch=true
      - --serversTransport.forwardingTimeouts.dialTimeout=30s
      - --serversTransport.insecureSkipVerify=false
      - --certificatesResolvers.letsencrypt-staging.acme.email=${ACME_EMAIL}
      - --certificatesResolvers.letsencrypt-staging.acme.storage=/certs/acme.json
      - --certificatesResolvers.letsencrypt-staging.acme.httpChallenge.entryPoint=web
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ${ATHYPER_CONFIG}/gateway/dynamic:/etc/traefik/dynamic:ro
      - ${ATHYPER_CONFIG}/gateway/certs:/certs
```

Save and exit the editor.

**Validate the merged compose** — covers YAML parse, key deduplication, and variable expansion:

```bash
cd /opt/athyper/app

docker compose \
  --project-directory stack/compose \
  --env-file stack/env/.env \
  -f stack/compose/compose.yml \
  -f stack/compose/athyper.override.staging.yml \
  config > /tmp/merged-compose.yml 2>&1
# If this exits non-zero, fix before continuing.

# Verify iam: has exactly ONE block with BOTH command and environment:
awk '/^  iam:/,/^  [a-z]/ {print}' /tmp/merged-compose.yml | head -20
# Must show command: ... start ... --import-realm
# Must show KC_SMTP_USERNAME and KC_SMTP_PASSWORD in environment section

# Verify variable expansion (not literal ${...}):
grep -E 'KC_SMTP_USERNAME|ACME_EMAIL' /tmp/merged-compose.yml | head -5
# Must show actual values, not literal variable names

# If "conflicting service keys" error → two iam: blocks exist — remove one and retry
```

### 6.4d — Create ACME storage file `[SERVER]`

Traefik requires `acme.json` to exist at startup. Pre-creating it with mode 600 prevents Traefik from creating it world-readable.

```bash
touch /opt/athyper/app/stack/config/gateway/certs/acme.json
chmod 600 /opt/athyper/app/stack/config/gateway/certs/acme.json
ls -la /opt/athyper/app/stack/config/gateway/certs/
# acme.json must show: -rw------- athyper athyper 0 ...
```

### 6.5 Kernel config `[SERVER]`

Copies `kernel.config.staging.parameter.json` to the runtime-loaded `kernel.config.parameter.json`. Backs up any existing config automatically.

```bash
bash /opt/athyper/app/stack/scripts/setup/setup-config.sh staging
# Output confirms: Environment: staging, Target: .../kernel.config.parameter.json
```

---

## Phase 7 — Data Directories and Host Dependencies `[SERVER]`

```bash
cd /opt/athyper/app

# Create all Docker volume bind-mount directories (idempotent):
bash stack/scripts/setup/data-dirs-create.sh
# Creates stack/data/ with 11 subdirectories:
#   db, meilisearch, memorycache, memorycache-jobs, metabase,
#   objectstorage, telemetry/logging, telemetry/metrics,
#   telemetry/observability, telemetry/tracing, uptime-kuma

ls -la stack/data/    # verify all 11 dirs created

# Install monorepo dependencies on the host.
# Required because seed-db.sh (Phase 11) calls 'npx tsx' on the host.
# The production Docker image has tsx pruned out with 'pnpm prune --prod'.
pnpm install --frozen-lockfile
# node_modules ~1.5 GB — allow 3–5 min on first install
```

---

## Phase 8 — Validate Environment `[SERVER]`

Three gates must all pass before building images.

### 8.1 Placeholder gate — catches unfilled `=${VAR}` patterns

```bash
cd /opt/athyper/app

if grep -nE '=\$\{[A-Z_]+\}' stack/env/.env; then
  echo "✗ UNFILLED PLACEHOLDERS — fix above before continuing"
  exit 1
else
  echo "✓ No unfilled placeholders"
fi
```

### 8.2 Explicit presence gate — catches entirely-absent keys

`ACME_EMAIL` is not in `staging.env.example`. The placeholder grep cannot catch a missing line — only a blank one. An empty `ACME_EMAIL` causes Traefik ACME email to be blank, which causes Let's Encrypt to refuse registration.

`KC_SMTP_USERNAME`, `KC_SMTP_PASSWORD`, and `GATEWAY_DASHBOARD_HTPASSWD` are in the template but are self-referential `${VAR}` placeholders — Phase 8.1 catches those if unfilled. This gate only checks for vars entirely absent from the file.

```bash
cd /opt/athyper/app

missing=0
for required in ACME_EMAIL SENTRY_DSN; do
  if grep -q "^${required}=" stack/env/.env; then
    val=$(grep "^${required}=" stack/env/.env | cut -d= -f2-)
    if [ -z "${val}" ]; then
      echo "✗ ${required} is present but EMPTY"
      missing=1
    else
      echo "✓ ${required}"
    fi
  else
    echo "✗ ${required} is ENTIRELY MISSING from .env"
    missing=1
  fi
done

[ "${missing}" -eq 0 ] || { echo "Fix the above before continuing."; exit 1; }
```

### 8.3 Standard validator

```bash
bash stack/scripts/setup/validate-env.sh stack/env/.env
# Must exit 0
# Checks: required-var presence, no dev passwords in non-local env,
#         TEST-NET CIDR absent from gateway dynamic config, format checks
```

---

## Phase 9 — Build All Four Application Images `[SERVER]`

```bash
cd /opt/athyper/app

# Build all four images explicitly so any error surfaces now, not in Phase 13:
docker compose \
  --project-directory stack/compose \
  --env-file stack/env/.env \
  -f stack/compose/compose.yml \
  -f stack/compose/athyper.override.staging.yml \
  build athyper-neon-web athyper-api athyper-worker athyper-scheduler

# Verify all four images:
docker images | grep athyper
```

> Build takes 8–15 min on first run (pnpm install inside containers). Subsequent builds are faster due to Docker layer cache.

---

## Phase 10 — Start Core Profile `[SERVER]`

```bash
cd /opt/athyper/app

# Starts: db, dbpool-apps, dbpool-session, gateway, iam,
#         memorycache, objectstorage, objectstorage-init, clamav
bash stack/scripts/stack-profile/up.sh core

# Watch logs until all services are ready:
docker compose \
  --project-directory stack/compose \
  --env-file stack/env/.env \
  logs -f db dbpool-apps iam objectstorage gateway --tail=80
```

| Service | Ready signal |
|---|---|
| `db` | `database system is ready to accept connections` |
| `dbpool-apps` | healthcheck passes |
| `iam` | `Keycloak ... started` |
| `objectstorage-init` | exits 0 (bucket creation complete) |
| `gateway` | ping healthcheck passes; `acme.json` size > 0 |

Press `Ctrl+C` when all five are confirmed.

### TLS verification `[SERVER]`

Wait ~2 minutes after gateway starts for ACME HTTP challenge to complete.

```bash
echo | openssl s_client -servername gateway-stg.athyper.com \
        -connect gateway-stg.athyper.com:443 2>/dev/null \
     | openssl x509 -noout -issuer -subject
# Issuer MUST contain: "Let's Encrypt"
# Issuer MUST NOT contain: "STAGING" — that means the wrong CA is configured
```

---

## Phase 11 — Database Seed (host-side)

> **Why host-side**: `seed-db.sh` calls `npx tsx db/seed/migrate.ts` on the host. The production API image (`node:22-alpine`) has `pnpm prune --prod` run during build, removing `tsx` and all dev dependencies. The image also does not contain the `stack/` directory. Running seed from inside a container is not possible — hence the temporary host port exposure.

### 11.1 Verify 7 databases exist `[SERVER]`

```bash
docker exec athyper-stack-staging-db-1 \
  psql -U athyperadmin -c "\l"
# Expected: athyper_neon, athyper_mesh, athyper_iam, athyper_health,
#           athyper_errors, athyper_secrets, athyper_analytics
```

### 11.2 Temporarily expose PostgreSQL port `[SERVER]`

```bash
nano /opt/athyper/app/stack/compose/athyper.override.staging.yml
```

Add `ports:` under the existing `db:` block (as a sibling of `volumes:` and `deploy:`):

```yaml
  db:
    ports:
      - "127.0.0.1:5432:5432"    # TEMP — removed in 11.5
    volumes:
      - athyper_db_data:/var/lib/postgresql/data
    deploy:
      resources:
        limits:
          memory: "${DB_MEMORY_LIMIT}"
        reservations:
          memory: 512M
```

Validate and apply:

```bash
cd /opt/athyper/app

# Confirm port binding appears in merged config:
docker compose \
  --project-directory stack/compose \
  --env-file stack/env/.env \
  -f stack/compose/compose.yml \
  -f stack/compose/athyper.override.staging.yml \
  config | grep -A15 '^  db:' | head -20
# Must show: 127.0.0.1:5432 -> 5432

# Recreate db container with port binding:
docker compose \
  --project-directory stack/compose \
  --env-file stack/env/.env \
  -f stack/compose/compose.yml \
  -f stack/compose/athyper.override.staging.yml \
  up -d db

# Verify host connectivity:
set -a; . stack/env/.env; set +a
psql "postgresql://athyperadmin:${DB_ADMIN_PASSWORD}@localhost:5432/athyper_neon" \
  -c "SELECT 1 AS connected"
# Must print: connected = 1
```

### 11.3 Run seed from host `[SERVER]`

```bash
cd /opt/athyper/app
set -a; . stack/env/.env; set +a

# seed-db.sh auto-rewrites "@db:" → "@localhost:" in the URL.
# With 127.0.0.1:5432 exposed, localhost:5432 resolves to the db container.
export DATABASE_ADMIN_URL="postgresql://athyperadmin:${DB_ADMIN_PASSWORD}@db:5432/athyper_neon"

bash stack/scripts/db/transaction/neon/seed-db.sh --all
# --all runs: Phase 1 (DDL), Phase 2 (platform seed), Phase 3 (blueprints + tenants)
# DO NOT pass --reset unless intentionally wiping all data
# Expected final line: === Seed complete ===
# Allow 10–20 min on first run
```

### 11.4 Verify seed `[SERVER]`

```bash
docker exec athyper-stack-staging-db-1 \
  psql -U athyperadmin -d athyper_neon \
  -c "SELECT count(*) AS tenant_count FROM master.tenant;
      SELECT count(*) AS principal_count FROM master.principal;"
# Both counts must be non-zero
```

### 11.5 Remove temporary port exposure `[SERVER]`

```bash
nano /opt/athyper/app/stack/compose/athyper.override.staging.yml
# Remove the entire ports: block from under db:
# The db: block should go back to only volumes: and deploy:
```

Validate removal and re-apply:

```bash
cd /opt/athyper/app

# Confirm no port binding in merged config:
docker compose \
  --project-directory stack/compose \
  --env-file stack/env/.env \
  -f stack/compose/compose.yml \
  -f stack/compose/athyper.override.staging.yml \
  config | grep -A15 '^  db:' | head -20
# Must NOT contain any "5432" or "ports:" line

# Recreate db container without port:
docker compose \
  --project-directory stack/compose \
  --env-file stack/env/.env \
  -f stack/compose/compose.yml \
  -f stack/compose/athyper.override.staging.yml \
  up -d db

# Final host-level confirmation:
ss -tln | grep ':5432' && echo "✗ 5432 still bound on host!" || echo "✓ 5432 not exposed"
```

---

## Phase 12 — Keycloak IAM

### 12.1 Realm JSON sanity checks `[SERVER]`

Three known Keycloak import-breakers — all must return `[]` before running reset:

```bash
cd /opt/athyper/app

# 1. Duplicate authenticatorConfig UUIDs:
jq '[.authenticatorConfig[]?.id] | group_by(.) | map(select(length>1))' \
  stack/config/iam/realm-demosetup.json
# Expected: []

# 2. User IDs longer than 36 characters:
jq '[.users[]? | select(.id | length > 36) | .id]' \
  stack/config/iam/realm-demosetup.json
# Expected: []

# 3. IdP linked to multiple organizations:
jq '[.organizations[]?.identityProviders[]?] | group_by(.) | map(select(length>1))' \
  stack/config/iam/realm-demosetup.json
# Expected: []
```

If any return non-empty: fix the realm JSON before continuing. Do not run `reset-iam.sh` with a broken realm file.

### 12.2 Reset and seed Keycloak `[SERVER]`

```bash
bash stack/scripts/db/session/iam/reset-iam.sh
# 10-second abort window — let it proceed
# Drops and recreates athyper_iam database, then imports the realm JSON

# Verify issuer endpoint responds:
curl -s https://iam-stg.athyper.com/realms/athyper/.well-known/openid-configuration \
  | jq '.issuer'
# Must print: "https://iam-stg.athyper.com/realms/athyper"
```

### 12.3 Client secret wiring `[SERVER + WORKSTATION BROWSER]`

`IAM_CLIENT_SECRET` must match the Keycloak client used for backend authentication. Use `CLIENT_WITH_SECRET` from Runbook Prerequisite 3b.

```bash
cd /opt/athyper/app

# Rediscover after reset (in case reset-iam.sh regenerated the realm):
jq '.clients[]? | select(.clientId == "athyper-api" or .clientId == "athyper-api-runtime") \
  | {clientId, clientAuthenticatorType, hasSecret: (has("secret"))}' \
  stack/config/iam/realm-demosetup.json
# The client where hasSecret=true AND clientAuthenticatorType="client-secret"
# is the one whose KC Credentials tab secret must match .env IAM_CLIENT_SECRET
```

In your browser:

1. Open `https://iam-stg.athyper.com/admin`
2. Log in: `athyperadmin` / `<IAM_ADMIN_PASSWORD from .env>`
3. Select realm: `athyper`
4. Left nav: **Clients** → click the client identified by the `jq` result
5. **Credentials** tab → note the Client Secret

**If the displayed secret matches `.env` `IAM_CLIENT_SECRET`:** continue.

**If different** (KC regenerated on import):

```bash
nano /opt/athyper/app/stack/env/.env
# IAM_CLIENT_SECRET=<copied from KC admin>
# ATHYPER_SUPER__IAM_SECRET__IAM_ATHYPER_CLIENT_SECRET=<same value>
```

---

## Phase 13 — Start Application Services `[SERVER]`

```bash
cd /opt/athyper/app

bash stack/scripts/stack-profile/up.sh apps

# Force-recreate to pick up latest .env values (including any IAM secret update):
docker compose \
  --project-directory stack/compose \
  --env-file stack/env/.env \
  up -d --force-recreate \
    athyper-api athyper-worker athyper-scheduler athyper-neon-web

# Watch logs for startup errors:
docker compose \
  --project-directory stack/compose \
  --env-file stack/env/.env \
  logs -f athyper-neon-web athyper-api athyper-worker athyper-scheduler --tail=100
# Ctrl+C when startup looks clean
```

---

## Phase 14 — Minimal Smoke Test `[SERVER]`

Stop and diagnose any failure before starting observability.

```bash
set -a; . /opt/athyper/app/stack/env/.env; set +a

echo "── App endpoints ──────────────────────────────"
curl -sf https://api-stg.athyper.com/livez      && echo "✓ api /livez"   || echo "✗ api /livez"
curl -sf https://api-stg.athyper.com/readyz     && echo "✓ api /readyz"  || echo "✗ api /readyz"
curl -sf https://neon-stg.athyper.com/livez     && echo "✓ web /livez"   || echo "✗ web /livez"
curl -sf https://neon-stg.athyper.com/readyz    && echo "✓ web /readyz"  || echo "✗ web /readyz"
curl -sf https://iam-stg.athyper.com/realms/athyper/.well-known/openid-configuration \
  > /dev/null && echo "✓ iam OIDC" || echo "✗ iam OIDC"

echo "── Internal dependencies ──────────────────────"
docker exec athyper-stack-staging-dbpool-apps-1 pg_isready -h 127.0.0.1 -p 6432 \
  && echo "✓ pgbouncer-apps" || echo "✗ pgbouncer-apps"

docker exec athyper-stack-staging-memorycache-1 \
  redis-cli -a "${MEMORYCACHE_PASSWORD}" ping | grep -q PONG \
  && echo "✓ redis auth" || echo "✗ redis auth"

# API image is node:22-alpine — BusyBox wget present, curl is not installed:
API_CONTAINER=$(docker ps --filter name=athyper-stack-staging-athyper-api \
  --format '{{.Names}}' | head -1)
docker exec "${API_CONTAINER}" \
  wget -q -O /dev/null http://objectstorage:9000/minio/health/live \
  && echo "✓ minio (app-reachable)" || echo "✗ minio (app-reachable)"
```

**End-to-end login test** `[WORKSTATION BROWSER]`:

1. Open `https://neon-stg.athyper.com`
2. Log in: demo user / `Demo@1234`
3. Confirm the application loads and the main dashboard is visible

**Do not start Phase 15 if any check above fails.**

---

## Phase 15 — Observability, Monitoring, Render, Search

### 15.1 Verify secondary DNS `[WORKSTATION]`

```bash
for host in telemetry-stg metrics-stg traces-stg logs-stg \
            uptime-stg healthchecks-stg errors-stg meilisearch-stg; do
  ip=$(dig @1.1.1.1 +short "${host}.athyper.com" | tail -1)
  printf "%-30s %s\n" "${host}.athyper.com" "${ip:-MISSING}"
done
# All 8 must show 62.169.31.9
```

### 15.2 Start secondary profiles `[SERVER]`

```bash
cd /opt/athyper/app
bash stack/scripts/stack-profile/up.sh telemetry    # loki, promtail, prometheus, tempo, grafana
bash stack/scripts/stack-profile/up.sh monitoring   # glitchtip, healthchecks, uptime-kuma
bash stack/scripts/stack-profile/up.sh render       # gotenberg, tika
bash stack/scripts/stack-profile/up.sh search       # meilisearch
```

### 15.3 GlitchTip init and DSN population `[SERVER + WORKSTATION BROWSER]`

```bash
# Run database migrations:
docker exec athyper-stack-staging-glitchtip-1 \
  python manage.py migrate --no-input

# Create superuser (interactive):
docker exec -it athyper-stack-staging-glitchtip-1 \
  python manage.py createsuperuser
```

In browser:

1. Open `https://errors-stg.athyper.com`
2. Log in with the superuser credentials
3. Create organization → project named `athyper-runtime` → copy the DSN

```bash
nano /opt/athyper/app/stack/env/.env
# All three vars get the SAME DSN value (GlitchTip is Sentry-compatible):
GLITCHTIP_DSN=https://<key>@errors-stg.athyper.com/1
SENTRY_DSN=https://<key>@errors-stg.athyper.com/1
NEXT_PUBLIC_SENTRY_DSN=https://<key>@errors-stg.athyper.com/1
```

### 15.4 Recreate apps and verify error reporting `[SERVER]`

```bash
docker compose \
  --project-directory stack/compose \
  --env-file stack/env/.env \
  up -d --force-recreate \
    athyper-api athyper-worker athyper-scheduler athyper-neon-web
```

Trigger a test error from the application. Confirm it appears in GlitchTip within 30 seconds. Verify now — silent DSN misconfiguration is only discovered weeks later when errors aren't reported.

### 15.5 Retire interim disk alert `[SERVER — sudo required]`

```bash
sudo rm /etc/cron.d/disk-alert
# Prometheus node_exporter rule takes over (Phase 20.4 follow-up)
```

---

## Phase 16 — Full Smoke Test `[SERVER]`

```bash
# Write the smoke script:
cat > /opt/athyper/app/stack/scripts/smoke-staging.sh << 'SMOKE'
#!/usr/bin/env bash
set -u
fail=0
pass() { printf "  ✓ %s\n" "$1"; }
fail() { printf "  ✗ %s\n" "$1"; fail=$((fail+1)); }
check() { local name="$1"; shift; if "$@" >/dev/null 2>&1; then pass "${name}"; else fail "${name}"; fi; }

echo "── Public endpoints ─────────────────────────────"
check "api /livez"       curl -sf https://api-stg.athyper.com/livez
check "api /readyz"      curl -sf https://api-stg.athyper.com/readyz
check "web /livez"       curl -sf https://neon-stg.athyper.com/livez
check "web /readyz"      curl -sf https://neon-stg.athyper.com/readyz
check "iam OIDC"         curl -sf https://iam-stg.athyper.com/realms/athyper/.well-known/openid-configuration
check "meilisearch"      curl -sf https://meilisearch-stg.athyper.com/health
check "glitchtip"        curl -sf -o /dev/null https://errors-stg.athyper.com
check "healthchecks"     curl -sf -o /dev/null https://healthchecks-stg.athyper.com
check "grafana"          curl -sf -o /dev/null https://telemetry-stg.athyper.com

echo "── TLS issuer ───────────────────────────────────"
if echo | openssl s_client -servername neon-stg.athyper.com \
     -connect neon-stg.athyper.com:443 2>/dev/null \
   | openssl x509 -noout -issuer 2>/dev/null | grep -qi "STAGING"; then
  fail "TLS issuer is LE STAGING (wrong CA)"
else
  pass "TLS issuer is LE production"
fi

echo "── Internal services ────────────────────────────"
check "pgbouncer apps"    docker exec athyper-stack-staging-dbpool-apps-1 \
                            pg_isready -h 127.0.0.1 -p 6432
check "redis auth"        bash -c "docker exec athyper-stack-staging-memorycache-1 \
                            redis-cli -a \"\$MEMORYCACHE_PASSWORD\" ping | grep -q PONG"
API_CONTAINER=$(docker ps --filter name=athyper-stack-staging-athyper-api \
  --format '{{.Names}}' | head -1)
check "minio (app-reach)" docker exec "${API_CONTAINER}" \
                            wget -q -O /dev/null http://objectstorage:9000/minio/health/live

echo "── Summary ──────────────────────────────────────"
if [ "$fail" -eq 0 ]; then
  echo "✓ All smoke checks passed"; exit 0
else
  echo "✗ ${fail} check(s) failed"; exit 1
fi
SMOKE
chmod +x /opt/athyper/app/stack/scripts/smoke-staging.sh

# Run smoke test:
set -a; . /opt/athyper/app/stack/env/.env; set +a
/opt/athyper/app/stack/scripts/smoke-staging.sh

# Additional verification:
bash /opt/athyper/app/stack/scripts/setup/verify-objectstorage.sh
bash /opt/athyper/app/stack/scripts/setup/verify-port-hardening.sh

# All containers healthy:
docker compose \
  --project-directory stack/compose \
  --env-file stack/env/.env \
  ps --format "table {{.Name}}\t{{.Status}}"
```

---

## Phase 17 — systemd Auto-start `[SERVER — sudo required]`

```bash
sudo tee /etc/systemd/system/athyper-stack.service > /dev/null << 'EOF'
[Unit]
Description=Athyper Staging Stack
After=docker.service network-online.target
Wants=network-online.target
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/athyper/app
ExecStartPre=/bin/sleep 15
ExecStart=/bin/bash stack/scripts/stack-profile/up.sh all
ExecStop=/bin/bash stack/scripts/stack-profile/down.sh all
TimeoutStartSec=600
User=athyper
Group=athyper
Environment=HOME=/home/athyper

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable athyper-stack
sudo systemctl status athyper-stack    # enabled; inactive (not running yet — correct)
```

---

## Phase 18 — Backups, Secrets Store, Heartbeat

### 18.1 Run first backup `[SERVER]`

Substitute `<BACKUP_RUN_CMD>` with the value from Runbook Prerequisite 1:

```bash
<BACKUP_RUN_CMD>

# Verify backup is in object storage:
docker exec athyper-stack-staging-objectstorage-1 \
  mc ls local/athyper-backup-staging
# Must show at least one file
```

### 18.2 Test restore `[SERVER]`

```bash
bash stack/scripts/db/restore/restore-db.sh athyper_analytics <backup-file-id>

docker exec athyper-stack-staging-db-1 \
  psql -U athyperadmin -d athyper_analytics -c "\dt" | head -20
# Verify tables are present
```

### 18.3 Mirror secrets to Infisical, then shred `[SERVER + WORKSTATION BROWSER]`

```bash
cat ~/secrets-staging.txt    # reference while importing to Infisical UI
```

In the Infisical UI: import each secret into the `staging` project. Once confirmed:

```bash
shred -u ~/secrets-staging.txt
ls ~/secrets-staging.txt 2>/dev/null && echo "✗ file still exists" || echo "✓ shredded"
```

### 18.4 External heartbeat `[WORKSTATION — configure monitoring tool]`

Configure an external monitor (Uptime Robot, Pingdom, or similar) to hit every 5 minutes:

```
https://api-stg.athyper.com/livez
https://neon-stg.athyper.com/livez
```

Send a test alert to confirm the alert channel (Slack `#ops-staging` or email) actually fires.

---

## Phase 19 — Reboot Drill `[SERVER then WORKSTATION]`

```bash
sudo reboot
```

Wait 3 minutes, then reconnect from workstation:

```bash
ssh athyper@62.169.31.9

# Check all containers restarted:
docker ps --format "table {{.Names}}\t{{.Status}}"
# All must show "Up X minutes" — none showing "Exited" or "Restarting"

# Run smoke test:
set -a; . /opt/athyper/app/stack/env/.env; set +a
/opt/athyper/app/stack/scripts/smoke-staging.sh
# Must exit 0 within 10 minutes of reboot
```

---

## Phase 20 — Post-Deployment Actions

Assign owners and deadlines before handoff. These are not optional.

### 20.1 Upstream the `Dockerfile.prod` pnpm patch — **1 week**

Open a PR against `feature/finance-core`:

```diff
- RUN corepack enable && corepack prepare pnpm@latest --activate
+ RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
```

Once merged, Phase 4.3 can be removed from future runbooks.

```
Upstream PR: ______________________________    Merged: __________
```

### 20.2 ~~Add missing vars to `staging.env.example`~~ — **Done (merged)**

`ACME_EMAIL`, `SENTRY_DSN`, `KC_SMTP_USERNAME`, `KC_SMTP_PASSWORD`, and `GATEWAY_DASHBOARD_HTPASSWD` are all now present in `staging.env.example`. No further action required.

```
Env-template PR: __________________________    Merged: __________
```

### 20.3 Document host-side seed as tech debt — **1 week**

File a ticket: target is a dedicated seed/admin image containing `stack/` and `tsx`, running as a compose service, so Phase 11 no longer needs host DB exposure.

### 20.4 Capacity cleanups — **2 weeks**

- Add Prometheus `node_exporter` filesystem alert rule (replaces the removed cron disk alert)
- Confirm the Phase 18.4 external heartbeat has fired a live test page
- Review Loki and Tempo retention after 7 days of actual log volume

### 20.5 Dry-run from scratch — **1 month**

After 20.1 and 20.2 merge, run the full runbook against a clean VM to confirm Phases 4.3 and 8.2 can be deleted. Produce v11 with those phases removed and the document status updated to "No Outstanding Drift".

---

## Quick Reference

| Task | User | Command |
|---|---|---|
| Start full stack | `[SERVER]` | `cd /opt/athyper/app && bash stack/scripts/stack-profile/up.sh all` |
| Stop stack | `[SERVER]` | `bash stack/scripts/stack-profile/down.sh all` |
| Smoke test | `[SERVER]` | `set -a; . stack/env/.env; set +a && /opt/athyper/app/stack/scripts/smoke-staging.sh` |
| Validate compose merge | `[SERVER]` | `docker compose --project-directory stack/compose --env-file stack/env/.env -f stack/compose/compose.yml -f stack/compose/athyper.override.staging.yml config` |
| Validate env | `[SERVER]` | `bash stack/scripts/setup/validate-env.sh stack/env/.env` |
| Force-recreate apps | `[SERVER]` | `docker compose --project-directory stack/compose --env-file stack/env/.env up -d --force-recreate athyper-api athyper-worker athyper-scheduler athyper-neon-web` |
| View all container status | `[SERVER]` | `docker compose --project-directory stack/compose --env-file stack/env/.env ps` |
| Follow app logs | `[SERVER]` | `docker compose --project-directory stack/compose --env-file stack/env/.env logs -f athyper-api athyper-neon-web --tail=100` |

---

## Pre-Handoff Checklist

### Prerequisites (before any server work)

- [ ] Runbook Prereq 1: `BACKUP_RUN_CMD` filled and tested on dev
- [ ] Runbook Prereq 2: Restore script signature verified
- [ ] Runbook Prereq 3a: Realm JSON `IAM_CLIENT_SECRET` grep result recorded
- [ ] Runbook Prereq 3b: `CLIENT_WITH_SECRET` recorded from realm JSON
- [ ] Sign-off block signed by both preparer and reviewer

### Phase 0

- [ ] All 6 critical DNS A records → `62.169.31.9` from both resolvers (1.1.1.1 and 8.8.8.8)
- [ ] `OPERATOR_IP` captured from workstation; confirmed ≠ `62.169.31.9`

### Phase 1

- [ ] `athyper` password rotated; new value in password vault (not on server filesystem)
- [ ] `postgresql-client` and `jq` installed and verified
- [ ] SSH key installed; Phase 1.6 Step A1 (key auth) passed
- [ ] Phase 1.6 Step A2 (sudo) passed in current session
- [ ] Root SSH refused; password auth refused globally (Step C confirmed from workstation)

### Phase 2

- [ ] Docker installed; `athyper` in docker group; `docker ps` works without sudo after reconnect

### Phase 3–4

- [ ] `/opt/athyper` owned by `athyper:athyper`
- [ ] Deployment SHA recorded and tagged in `~/deploy-record.txt`
- [ ] `server/Dockerfile.prod` patched: `pnpm@latest` → `pnpm@10.33.0` (verify with grep)

### Phase 5–6

- [ ] `.env` has `ACME_EMAIL`, `KC_SMTP_USERNAME`, `KC_SMTP_PASSWORD` (not in template)
- [ ] `DB_HOST=db` (not `db-stg.athyper.com`)
- [ ] `DBPOOL_APPS_CONFIG=db/local/dbpool/pgbouncer-apps.ini`
- [ ] `DBPOOL_SESSION_CONFIG=db/local/dbpool/pgbouncer-session.ini`
- [ ] Workbench allow-list is `OPERATOR_IP/32` (verified with grep — not `198.51.100.0/24`)
- [ ] `acme.json` created with `chmod 600`
- [ ] `docker compose config` confirms single `iam:` block with both `command:` and `environment: KC_SMTP_USERNAME/PASSWORD`
- [ ] `gateway:` ACME block present in merged config; `ACME_EMAIL` value expanded (not literal)

### Phase 7–8

- [ ] `stack/data/` has all 11 subdirectories
- [ ] `pnpm install --frozen-lockfile` completed before Phase 9
- [ ] Phase 8.1 placeholder gate: `✓ No unfilled placeholders`
- [ ] Phase 8.2 presence gate: all three vars present and non-empty
- [ ] Phase 8.3 `validate-env.sh` exits 0

### Phase 9–10

- [ ] All four app images built explicitly (web, api, worker, scheduler)
- [ ] TLS issuer verified: "Let's Encrypt" present, "STAGING" absent

### Phase 11

- [ ] 7 databases confirmed before seed
- [ ] Seed completed with `=== Seed complete ===`
- [ ] Temp port 5432 removed; `ss -tln` confirms not exposed on host

### Phase 12

- [ ] Realm JSON passed all 3 sanity checks (empty arrays)
- [ ] `reset-iam.sh` succeeded; OIDC issuer endpoint responds correctly
- [ ] Phase 12.3 verified the **correct** client (per `CLIENT_WITH_SECRET`); secrets match `.env`

### Phase 13–14

- [ ] All four app containers running
- [ ] Phase 14: all endpoint checks green
- [ ] Phase 14: MinIO check via `wget` (not curl) passed
- [ ] Demo user login confirmed in browser

### Phase 15–16

- [ ] All 8 secondary DNS records resolve before Phase 15
- [ ] All three DSN vars filled with same GlitchTip value; apps force-recreated
- [ ] Test error confirmed visible in GlitchTip (not just "configured")
- [ ] Phase 16 `smoke-staging.sh` exits 0

### Phase 17–19

- [ ] `stack/env/.env` permissions `600`
- [ ] `secrets-staging.txt` mirrored to Infisical and shredded from server
- [ ] First backup present in MinIO; test restore on `athyper_analytics` succeeded
- [ ] External heartbeat live and test-paged to alert channel
- [ ] `athyper-stack.service` enabled
- [ ] Reboot drill passed — all containers healthy, smoke green within 10 minutes

### Phase 20 (post-handoff — track with owners and deadlines)

- [ ] Phase 20.1 PR opened: `Dockerfile.prod` pnpm pin
- [ ] Phase 20.2 PR opened: `staging.env.example` missing vars
- [ ] Tech-debt ticket filed: host-side seed workaround
- [ ] All Phase 20 items have named owners and due dates in deploy record

---

## Appendix A — IPv6

Not used in initial bring-up. Dual-stack is a dedicated change once the stack is proven stable.

## Appendix B — VNC Recovery

If SSH becomes unreachable:

- Host: `5.189.174.159` · Port: `63128`
- Login: `athyper` with the **rotated** password from Phase 1.1 (not `Atlas1144`)
- No SSH key required on local tty
- From VNC: run `sudo systemctl status athyper-stack` to check stack state

## Appendix C — Rollback

```bash
# [SERVER]
cd /opt/athyper/app
git tag --list 'staging-deploy-*' | sort | tail -5

bash stack/scripts/stack-profile/down.sh all
git checkout <previous-staging-deploy-tag>
# Re-apply Phase 4.3 patch — git checkout replaces Dockerfile.prod:
sed -i 's/corepack prepare pnpm@latest/corepack prepare pnpm@10.33.0/' server/Dockerfile.prod
docker image prune -af

# Re-run from Phase 9
```

For database-only issues: prefer restore (Phase 18.2) over code rollback.

## Appendix D — Known Environment Gaps

| Variable | Status | Resolution |
|---|---|---|
| `GOTENBERG_BASE_URL` | Not in shared env fragment | Default `http://gotenberg:3000` works — compose service name matches |
| `TIKA_URL` | Not in shared env fragment | Default `http://tika:9998` works |
| `CLAMD_ON_UNAVAILABLE` | Not in shared env fragment | Built-in fallback active |
| `ACME_EMAIL` | Now in `staging.env.example` | Phase 8.2 gate catches if left empty |
| `SENTRY_DSN` | Now in `staging.env.example` | Phase 8.2 gate catches if left empty; same value as `GLITCHTIP_DSN` |
| `KC_SMTP_USERNAME` | In `staging.env.example` as `${VAR}` placeholder | Phase 8.1 gate catches if unfilled |
| `KC_SMTP_PASSWORD` | In `staging.env.example` as `${VAR}` placeholder | Phase 8.1 gate catches if unfilled |

## Appendix E — Runtime Version and Image Base Notes

**Host:** Node 24.15.0 · pnpm 10.33.0 · PostgreSQL client ≥ 16 · jq

**Container images:**

| Image | Base | Notes |
|---|---|---|
| api / worker / scheduler | `node:22-alpine` | BusyBox `wget` present; `curl` not installed — use `wget` for health checks |
| web (athyper-neon-web) | `node:20-alpine` | Node 20 intentional for Next.js compatibility |

**Host–container interaction:**

- Host Node only runs `tsx` for `seed-db.sh` (Phase 11). Node ≥ 18 sufficient; Node 24.15.0 confirmed working.
- Host pnpm `10.33.0` matches repo `packageManager` pin — `--frozen-lockfile` is always honored.
- Phase 4.3 (temporary) pins **container** pnpm to `10.33.0`; Phase 20.1 commits this upstream.
- Note: rolling back with `git checkout` restores `Dockerfile.prod` to `pnpm@latest` — Phase 4.3 must be re-applied after any rollback.
- Smoke checks in Phases 14 and 16 use `wget` inside the API container, not `curl`.

**If the team later adds `curl` to the Alpine image** (`apk add --no-cache curl` in `server/Dockerfile.prod`): update the wget lines in Phases 14 and 16, update this appendix, and remove the `[BusyBox wget, NOT curl]` comments.
