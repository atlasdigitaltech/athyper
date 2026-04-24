# Athyper Staging Deployment — Workstation & WS-Server Binding

**Server:** `athyper-staging` · Contabo Cloud VPS 30 NVMe
**IPv4:** `62.169.31.9`
**IPv6:** `2a02:c207:2283:6875::1` _(not used in initial bring-up)_
**Resources:** 8 cores · 24 GB RAM · 200 GB NVMe · 600 Mbit/s
**OS:** Ubuntu 24.04
**VNC recovery:** `5.189.174.159:63128`

> **Scope of this document**: everything done from your local machine before or during server bring-up — DNS checks, runbook prerequisites, SSH key generation and lockdown. After Phase 2.7 passes, all remaining work is in **`STAGING_DEPLOY_PLAN_v10_SERVER.md`**, starting at Phase 0.5.

---

## Annotation Key

| Label | Meaning |
|---|---|
| `[WORKSTATION]` | Run on your local machine |
| `[SERVER]` | Run in your SSH session as `athyper`; `sudo` prefixed where root access is needed |

---

## ⚠ Before Execution — Three Standing Recommendations

### 1. Do not start until the Runbook Prerequisites below are complete.

`BACKUP_RUN_CMD` must be filled, the restore-script signature must be confirmed, and the realm-JSON client discovery must be recorded. Until those blanks are closed, the runbook depends on tribal knowledge.

### 2. Treat the host-side seed as a temporary workaround, not a pattern.

Phase 12 (SERVER doc) exposes `127.0.0.1:5432` briefly, runs `seed-db.sh` on the host, then closes the port immediately. Acceptable for this run. The long-term target is a dedicated seed/admin image (Phase 21.3 follow-up).

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

Result: `____` (≥ 1 = secret injected at import; `0` = must copy KC secret manually in Phase 14.3 of SERVER doc)

```bash
# 3b — which clientId carries the secret field used for backend auth?
jq '.clients[]? | select(.clientId == "athyper-api" or .clientId == "athyper-api-runtime") \
  | {clientId, clientAuthenticatorType, hasSecret: (has("secret"))}' \
  stack/config/iam/realm-demosetup.json
```

```
CLIENT_WITH_SECRET = _______________  (athyper-api  OR  athyper-api-runtime)
```

Phase 13.3 (SERVER doc) navigates to this exact client in the KC admin UI.

### Sign-off

```
Prepared by:   _______________________    Date: __________
Reviewed by:   _______________________    Date: __________
```

---

## Server Account Reference

### Account responsibilities

| Account | Used for | Sudo | Login method |
|---|---|---|---|
| `root` | VNC console recovery only — never for day-to-day work | — (is root) | VNC tty (`5.189.174.159:63128`) |
| `athyper` | All deployment steps in this runbook; runs the systemd service; owns `/opt/products/athyper/` and `stack/data/` | Yes (via `sudo`) | SSH key (after Phase 2.6); VNC tty as fallback |

**Rule**: never SSH as `root`. The sshd config (Phase 2.6) enforces `PermitRootLogin no`. All `root`-level operations in this runbook are prefixed with `sudo` and run as `athyper`.

### Initial credentials

| Account | Initial password | Rotated in |
|---|---|---|
| `root` | Set by Contabo at VPS provisioning — retrieve from the Contabo control panel | Not changed in this runbook (SSH root login is disabled) |
| `athyper` | `Atlas1144` | Phase 1.1 of SERVER doc (mandatory — rotate before any other step) |

> **Security note**: `Atlas1144` is the Contabo-provisioned default. It is valid on the local VNC tty even after SSH password auth is disabled. Store the rotated password in your vault; never write it to any file on the server.

> **If the `athyper` account does not yet exist** on the server (fresh VPS with only `root`): follow the "Creating the `athyper` account" section in `STAGING_DEPLOY_PLAN_v10_SERVER.md` before continuing here.

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

Verified before Phase 16 only (not blocking Phases 0–14):

```
telemetry-stg.athyper.com    metrics-stg.athyper.com
traces-stg.athyper.com       logs-stg.athyper.com
uptime-stg.athyper.com       healthchecks-stg.athyper.com
errors-stg.athyper.com       meilisearch-stg.athyper.com
```

### 0.3 Capture OPERATOR_IP — **from your workstation, before connecting to server** `[WORKSTATION]`

This IP is used in Phase 8.2 (SERVER doc) to whitelist `/admin` and `/ops` Traefik routes. If you run `curl` on the server it returns the server's own IP (`62.169.31.9`) which would block all real browser access.

```bash
# On YOUR local machine — not the server:
curl -s ifconfig.me
# Note this value as OPERATOR_IP (e.g. 203.0.113.42)
```

```
OPERATOR_IP = _______________
```

### 0.4 Capacity + NTP verification `[SERVER]`

```bash
ssh athyper@62.169.31.9      # password: Atlas1144 (rotated in Phase 1.1 of SERVER doc)

free -h                       # ✓ ~24 GB
df -h /                       # ✓ ~190 GB free
nproc                         # ✓ 8
# node and pnpm are NOT pre-installed on a fresh Contabo VPS — installed in Phase 1.3 of SERVER doc

sudo timedatectl set-ntp true
timedatectl status | grep -i 'System clock synchronized'    # yes
```

---

## Phase 2 — SSH Key Installation and Access Lockdown

> **This phase requires two terminals open simultaneously**: your existing Phase 1 server session (`[SERVER]`) and a terminal on your workstation (`[WORKSTATION]`). Do not close either until Step 2.7 passes. The lockdown in Step 2.6 is irreversible from outside — if key auth fails and you lock yourself out, VNC is the only recovery path.

> **Timing**: Run this phase after completing Phase 1 (SERVER doc). Keep the Phase 1 server session open.

### 2.1 Check for or generate SSH key `[WORKSTATION]`

Open a terminal on your workstation (keep the server session open).

```bash
ls ~/.ssh/id_ed25519.pub 2>/dev/null \
  && echo "✓ key exists — skip keygen" \
  || ssh-keygen -t ed25519 -C "athyper-staging-deploy" -f ~/.ssh/id_ed25519
# Passphrase is optional; if set, ssh-agent must be running for non-interactive use
```

### 2.2 Print the public key `[WORKSTATION]`

```bash
cat ~/.ssh/id_ed25519.pub
# Copy the entire output line (starts with ssh-ed25519 ...)
```

### 2.3 Install the public key `[SERVER]`

In your existing server session:

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys
# Paste the public key — one line, no leading/trailing whitespace
# Save: Ctrl+O, Enter, Ctrl+X
chmod 600 ~/.ssh/authorized_keys
cat ~/.ssh/authorized_keys    # verify exactly one line is present
```

### 2.4 Test key auth — before any lockdown `[WORKSTATION — new terminal]`

Open a **third** terminal on your workstation. Keep both the server session and the workstation terminal from 2.1–2.2 open.

```bash
ssh -i ~/.ssh/id_ed25519 athyper@62.169.31.9 "whoami"
# Must print exactly: athyper
# If it prints anything else or hangs: fix authorized_keys (Step 2.3) before continuing
# Do NOT proceed to 2.5 until this succeeds
```

### 2.5 Verify sudo works `[SERVER]`

In your existing server session:

```bash
sudo -v          # refreshes sudo credential; password prompt is normal
sudo whoami      # must print: root
```

> **Optional — avoid repeated sudo prompts for the rest of the runbook:**
> ```bash
> sudo visudo
> # Add at the very end of the file:
> athyper ALL=(ALL) NOPASSWD:ALL
> ```
> Re-test: `sudo -n whoami` must print `root` without a prompt. Only grant this if you accept the reduced privilege-separation; it can be removed after deployment.

**DO NOT proceed to 2.6 until both 2.4 (key auth from workstation) and 2.5 (sudo on server) succeed.**

### 2.6 Disable password and root SSH `[SERVER — sudo required]`

```bash
sudo sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config

# Validate config before reloading — catches syntax errors:
sudo sshd -t && echo "✓ sshd config valid" || echo "✗ sshd config error — do NOT reload"

sudo systemctl restart sshd
```

### 2.7 Confirm lockdown `[WORKSTATION]`

```bash
ssh root@62.169.31.9 2>&1 | head -3                    # must be refused
ssh -i ~/.ssh/id_ed25519 athyper@62.169.31.9 "whoami"  # must print: athyper
ssh -o PubkeyAuthentication=no athyper@62.169.31.9     # must be refused (password auth gone)
```

If the third command unexpectedly succeeds, password auth was not fully disabled. Use VNC (`5.189.174.159:63128`) to log in and re-run Step 2.6.

---

## ➡ Continue in SERVER doc

Phase 2.7 passed. All future work is in **`STAGING_DEPLOY_PLAN_v10_SERVER.md`**, starting at **Phase 0.5**.

All future SSH connections use key auth:

```bash
ssh -i ~/.ssh/id_ed25519 athyper@62.169.31.9
```

---

## Workstation Pre-Handoff Checklist

### Prerequisites (before any server work)

- [ ] Runbook Prereq 1: `BACKUP_RUN_CMD` filled and tested on dev
- [ ] Runbook Prereq 2: Restore script signature verified
- [ ] Runbook Prereq 3a: Realm JSON `IAM_CLIENT_SECRET` grep result recorded
- [ ] Runbook Prereq 3b: `CLIENT_WITH_SECRET` recorded from realm JSON
- [ ] Sign-off block signed by both preparer and reviewer

### Phase 0

- [ ] All 6 critical DNS A records → `62.169.31.9` from both resolvers (1.1.1.1 and 8.8.8.8)
- [ ] `OPERATOR_IP` captured from workstation; confirmed ≠ `62.169.31.9`
- [ ] Phase 0.4 server capacity check: 24 GB RAM, ~190 GB free disk, 8 cores, NTP synchronized

### Phase 2

- [ ] Phase 2.4 key auth test passed (`ssh -i id_ed25519 athyper@62.169.31.9 "whoami"` prints `athyper`)
- [ ] Phase 2.7 lockdown confirmed: root SSH refused, password SSH refused, key SSH accepted
