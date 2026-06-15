# Athyper Local Development Setup — Windows

**Scope:** Windows workstation with Docker Desktop → `ENVIRONMENT=local`
**Not for:** Ubuntu staging/production server — see [`staging-setup.md`](staging-setup.md)
**Cross-env comparison:** see [`environments.md`](environments.md) for the local / staging / production matrix.
**Two-root rule:** Source code and runtime state live on separate paths, mirroring the server layout.

```text
D:\Products\athyper   ← git checkout  (read-only: compose files, scripts, source code)
D:\Stack\athyper      ← runtime state (read-write: config, data, logs, backups)
```

> `git pull`, branch switches, and repo resets are always safe — they never touch container
> data volumes, generated credentials, or deployed config files.

---

## Quick Start (returning developer)

Already set up? These are the only commands you need after a reboot or pulling new code.

```cmd
:: After reboot — restart infrastructure
stack\scripts\stack-profile\up.bat core

:: After git pull — reinstall packages if lockfile changed, re-deploy config if templates changed
git pull
pnpm install --frozen-lockfile
stack\scripts\setup\setup-config.bat local --diff    :: preview template changes
stack\scripts\setup\setup-config.bat local --update  :: apply if diff shows changes

:: Start the application — one command (recommended)
:: Stops stale app containers, brings up core infra, opens api + 3 web windows.
:: Add --with-jobs if you also need worker + scheduler windows.
stack\scripts\dev-local.bat

:: Or the explicit three-terminal form:
:: Terminal 1
stack\scripts\stack-profile\up.bat core
:: Terminal 2
stack\scripts\app\api-up.bat
:: Terminal 3
stack\scripts\app\local-ui-up.bat
```

> **Why dev-local.bat?** Local app code only runs on the host. If a stale
> `athyper-api-1` / `athyper-neon-web-1` / etc. container is left over from a
> previous `stack-profile/up.bat apps` run, it silently shadows your host dev
> servers — source edits then appear to "work" but actually hit an old bundle.
> `dev-local.bat` pre-stops those containers every time, so the failure mode
> can't recur. The shadow-detection guard in `api-up.bat` / `web-up.bat` is the
> second line of defence.

---

## Contents

1. [Prerequisites](#1-prerequisites)
2. [Directory Layout](#2-directory-layout)
3. [Initial Setup](#3-initial-setup-one-time) *(one-time, ~30 minutes)*
   - Step 0 — Hosts file
   - Step 1 — Clone and install workspace
   - Step 2 — Set up environment file
   - Step 3 — Validate environment
   - Step 4 — Create data directories
   - Step 5 — Generate local TLS certificates
   - Step 6 — Deploy config files
   - Step 7 — Start core stack
   - Step 8 — Verify object storage
   - Step 9 — Seed database
   - Step 10 — Reset Keycloak IAM
   - Step 11 — Smoke test
4. [Running the Application](#4-running-the-application)
   - Option A: Full stack in Docker
   - Option B: API on host, plane apps in Docker
   - Option C: API and plane apps on host *(recommended)*
   - Running specific server modes (worker / scheduler)
   - VS Code integration (debugger, extensions)
5. [Day-2 Operations](#5-day-2-operations)
6. [Stack Profiles](#6-stack-profiles)
7. [Resetting the Stack](#7-resetting-the-stack)
8. [Critical Gotchas](#8-critical-gotchas)
9. [Troubleshooting](#9-troubleshooting)
10. [Environment Variables Reference](#10-environment-variables-reference)

---

## 1. Prerequisites

Install everything in this table before running any script. Estimated install time: 10–15
minutes on a clean machine.

| Tool | Version | Install | Why needed |
|---|---|---|---|
| Docker Desktop | ≥ 4.x | `winget install Docker.DockerDesktop` | Runs all infrastructure containers via WSL 2 |
| Git for Windows | latest | `winget install Git.Git` | Includes Git Bash — needed to run `.sh` scripts |
| Node.js | 24 LTS | `winget install OpenJS.NodeJS.LTS` or via `fnm` | Runs API and plane apps on the host |
| pnpm | 10.33.0 | `corepack enable && corepack prepare pnpm@10.33.0 --activate` | Workspace package manager |
| mkcert | latest | `winget install FiloSottile.mkcert` | Generates trusted TLS certs for `*.athyper.local` |
| jq | 1.6+ | `winget install jqlang.jq` | Useful for inspecting API JSON responses |

Install tools in one pass:

```powershell
winget install Docker.DockerDesktop Git.Git OpenJS.NodeJS.LTS FiloSottile.mkcert jqlang.jq
```

Install pnpm after Node.js is on PATH:

```cmd
corepack enable
corepack prepare pnpm@10.33.0 --activate
```

### Node.js via fnm (alternative — recommended for multi-version workflows)

`fnm` (Fast Node Manager) lets you pin exact versions per project without admin rights:

```powershell
winget install Schniz.fnm -e --source winget
:: Restart PowerShell, then:
fnm install 24
fnm default 24
fnm use 24
node --version    :: must print v24.x.x
```

Add to `$PROFILE` so fnm activates on every new terminal:

```powershell
fnm env --use-on-cd --shell power-shell | Out-String | Invoke-Expression
```

### Docker Desktop settings

Open Docker Desktop → Settings and configure:

```text
General → Use the WSL 2 based engine:   ✅ enabled
Resources → Memory:                     ≥ 8 GB  (full stack with telemetry)
Resources → CPUs:                       ≥ 4
Resources → Disk image size:            ≥ 20 GB
```

Linux containers mode is the default — do not switch to Windows containers.

Verify everything before continuing:

```cmd
docker --version
docker compose version
node --version
pnpm --version
mkcert --version
```

---

## 2. Directory Layout

The two-root layout on Windows mirrors the Ubuntu server layout exactly.
`D:\Products` corresponds to `/opt/products`; `D:\Stack` corresponds to `/opt/stack`.

```text
D:\Products\athyper\               ← git checkout — never write here at runtime
  stack\
    compose\                       ← Docker Compose files
    config\                        ← config templates (source of truth)
    env\.env.example               ← env template (committed)
    env\.env                       ← local env file (git-ignored — your secrets)
    scripts\                       ← all setup and lifecycle scripts

D:\Stack\athyper\                  ← runtime state — survives git pull and branch switches
  config\                          ← deployed by setup-config.bat
  data\                            ← Docker volume bind mounts
    db\
    memorycache\
    objectstorage\
    searchcore\
    telemetry\{logging,metrics,observability,tracing}
    ...
  logs\
  backups\
```

> **Why `.env` lives in the checkout on local dev:** On the server, secrets go in
> `/opt/stack/athyper/secrets/.env` (outside git). On Windows, `stack/env/.env` plays
> that role — it is git-ignored and contains all local credentials. Never commit it.

> **Path format:** Use **forward slashes** in `.env` for `ATHYPER_*_ROOT` values.
> Docker Desktop (WSL 2) requires POSIX-style paths for volume bind mounts:
> `D:/Stack/athyper/data`, not `D:\Stack\athyper\data`. Backslash paths cause Docker
> Compose to render a blank `source:` for bind mounts, silently mounting `/` instead.

---

## 3. Initial Setup *(one-time)*

Run all commands from `D:\Products\athyper` unless stated otherwise.
Estimated time: 25–35 minutes (dominated by Docker image pulls and Keycloak first-boot).

---

### Step 0 — Hosts File

All local services use the `.athyper.local` domain. Traefik (gateway) routes requests to
the correct container based on the `Host:` header, so these entries must exist and resolve
to `127.0.0.1` before the gateway starts — otherwise Traefik serves 404 for all requests.

Open `C:\Windows\System32\drivers\etc\hosts` as **Administrator** and append:

```text
# athyper local development
127.0.0.1  api.athyper.local
127.0.0.1  neon.athyper.local
127.0.0.1  mesh.athyper.local
127.0.0.1  admin.athyper.local
127.0.0.1  iam.athyper.local
127.0.0.1  gateway.athyper.local
127.0.0.1  objectstorage.athyper.local
127.0.0.1  objectstorageui.athyper.local
127.0.0.1  mailtrap.athyper.local
127.0.0.1  dbconsole.athyper.local
127.0.0.1  meilisearch.athyper.local
127.0.0.1  telemetry.athyper.local
127.0.0.1  metrics.athyper.local
127.0.0.1  alerts.athyper.local
127.0.0.1  traces.athyper.local
127.0.0.1  logs.athyper.local
127.0.0.1  uptime.athyper.local
127.0.0.1  healthchecks.athyper.local
127.0.0.1  errors.athyper.local
127.0.0.1  infisical.athyper.local
```

Verify the entries resolve:

```cmd
ping -n 1 api.athyper.local
ping -n 1 neon.athyper.local
ping -n 1 mesh.athyper.local
ping -n 1 admin.athyper.local
```

Both must reply from `127.0.0.1`. If not, the file was saved from a non-elevated Notepad —
open Notepad with "Run as administrator" and re-save.

---

### Step 1 — Clone and Install Workspace

```cmd
git clone git@github.com:atlasdigitaltech/athyper.git D:\Products\athyper
cd D:\Products\athyper
pnpm install
```

`pnpm install` installs all workspace packages (`server/`, `apps/neon/`, `apps/mesh/`,
`apps/admin/`, and shared packages).
It must complete without errors before any script will run. If it fails with an
engine warning, check that Node.js satisfies `package.json#engines` and that
Corepack has activated the pinned pnpm version.

---

### Step 2 — Set Up Environment File

```cmd
stack\scripts\setup\setup-env.bat local all
```

This copies `stack/env/.env.example` to `stack/env/.env`, copies
`server/.env.example` to `server/.env`, and sets `ENVIRONMENT=local`. For local
development, `server/.env` is only for direct IDE / `pnpm dev` runs; the wrapper
scripts derive the values they need from `stack/env/.env`.

> **Why three env files?** The stack `.env` is the source of truth for the Docker Compose
> services. `server/.env` and app `.env.local` files are loaded by manual `pnpm dev` in each
> package — `pnpm` spawns a new shell per command and does not inherit environment
> variables set in the calling `.bat` script. The `api-up.bat`, `web-up.bat`, and `planes-up.bat` scripts
> translate Docker hostnames to `127.0.0.1` equivalents and inject them into the child
> process, so `server/.env` must use host-reachable addresses like `127.0.0.1`, never
> Docker-only names like `memorycache`.

Open `stack\env\.env` and set the local roots using **forward slashes**. Keep
`ATHYPER_SECRETS_ROOT` empty so local Compose stays in single-file mode:

```env
ATHYPER_SECRETS_ROOT=
ATHYPER_CONFIG_ROOT=D:/Stack/athyper/config
ATHYPER_DATA_ROOT=D:/Stack/athyper/data
ATHYPER_LOG_ROOT=D:/Stack/athyper/logs
ATHYPER_BACKUP_ROOT=D:/Stack/athyper/backups
```

The `.env.example` defaults already use `D:/Stack/athyper/...`. Change the drive letter
if your checkout is on a different drive.

**Local dev credentials** — all set to `athyperadmin` in `.env.example`. These are
intentionally weak and are blocked by `validate-env.bat` in staging/production:

```env
DB_ADMIN_PASSWORD=athyperadmin
MEMORYCACHE_PASSWORD=athyperadmin
S3_ACCESS_KEY=athyperadmin
S3_SECRET_KEY=athyperadmin
IAM_ADMIN_PASSWORD=athyperadmin
```

**VAPID Web Push keys** — required for the API to start. Generate once and add to `.env`:

```cmd
pnpm dlx web-push generate-vapid-keys
```

Copy the three output values into `stack\env\.env`:

```env
VAPID_SUBJECT=mailto:dev@atlasdigitaltech.com
VAPID_PUBLIC_KEY=<publicKey from output>
VAPID_PRIVATE_KEY=<privateKey from output>
```

> **All three values must be present together.** The config validator only activates the
> VAPID check when any one of the three is set — setting `VAPID_SUBJECT` alone (or any
> partial combination) causes an immediate startup error:
> `Server config invalid — VAPID_PUBLIC_KEY is required when VAPID Web Push is configured`.
> If you do not need push notifications locally, omit all three. Never leave a partial set.

---

### Step 3 — Validate Environment

```cmd
stack\scripts\setup\validate-env.bat
```

This checks that all required variables are set, evaluates format rules (key length,
no dev defaults in non-local envs), and verifies kernel config hostname parity.

All checks must pass before continuing. Common first-run failures:

| Failure | Fix |
|---|---|
| `ATHYPER_CONFIG_ROOT is not set` | Add the four `ATHYPER_*_ROOT` lines to `.env` (forward slashes) |
| `ATHYPER_KERNEL_CONFIG_PATH not set` | Set to the relative path of your kernel config JSON |
| `PUBLIC_BASE_URL is not set` | Add `PUBLIC_BASE_URL=https://api.athyper.local` |
| `NODE_TLS_REJECT_UNAUTHORIZED` missing | Add `NODE_TLS_REJECT_UNAUTHORIZED=0` for local dev |

Re-run until the result is:

```text
RESULT: PASSED
```

---

### Step 4 — Create Data Directories

```cmd
stack\scripts\setup\data-dirs-create.bat
```

Creates the folder structure under `ATHYPER_DATA_ROOT` that Docker volume bind mounts expect:

```text
D:\Stack\athyper\data\
  db\
  memorycache\        ← Redis cache + session store
  memorycache-jobs\   ← Redis BullMQ isolation (opt-in profile)
  objectstorage\      ← MinIO data
  searchcore\
  analyticsboard\
  statuswatch\
  telemetry\
    logging\          ← Loki
    metrics\          ← Prometheus
    observability\    ← Grafana
    tracing\          ← Tempo
```

> **Why no `chown` on Windows:** On the Ubuntu server, these directories are owned by
> named service identities (`svc-redis`, `svc-minio`, etc.) with mode `0750` — see the
> v13 permission model in [`staging-setup.md`](staging-setup.md#v13-permission-model).
> Docker Desktop runs containers inside a WSL 2 VM whose virtual filesystem does not
> enforce Unix ownership on Windows host paths, so containers get write access without
> `chown`. The Windows `data-dirs-create.bat` creates the structure only.

Safe to re-run at any time — existing directories are left unchanged.

---

### Step 5 — Generate Local TLS Certificates

Traefik serves all `*.athyper.local` endpoints over HTTPS using a certificate generated
by `mkcert`. Install mkcert's local CA into the system trust store **first**:

```cmd
mkcert -install
```

> **Why `-install` must come before generating the cert:** `mkcert -install` creates the
> local CA and adds it to Windows Certificate Store and Firefox's NSS database. If you
> generate the cert before installing the CA, browsers will not recognise the issuer and
> will show a TLS warning — even if the cert file itself is valid.

Then generate the certificate:

```cmd
stack\scripts\setup\generate-certs.bat
```

Output:

```text
D:\Stack\athyper\config\gateway\certs\athyper.tls.local.crt
D:\Stack\athyper\config\gateway\certs\athyper.tls.local.key
```

Traefik reads these via a bind mount. After this step, your browser will show a green
lock on all `*.athyper.local` pages without a certificate warning.

> **After running `mkcert -install`, restart your browser completely** (full quit, not just
> closing the tab) to pick up the new CA. Chrome and Edge require a full quit-and-relaunch.

If `generate-certs.bat` fails with "mkcert not found":

```powershell
winget install FiloSottile.mkcert
```

---

### Step 6 — Deploy Config Files

```cmd
stack\scripts\setup\setup-config.bat local
```

Copies template config files from the git checkout into `D:\Stack\athyper\config\`:

| Destination | Contents |
|---|---|
| `config\gateway\dynamic\` | Traefik routing rules for all local services |
| `config\db\local\` | `postgresql.conf`, `pg_hba.conf`, `init-databases.sh` |
| `config\db\local\dbpool\` | PgBouncer config for apps pool (`:6432`) and session pool (`:6433`) |
| `config\memorycache\cache.conf` | Redis config — cache mode, no persistence (`save ""`) |
| `config\memorycache\redis-acl.conf` | Redis ACL template (rendered with password hashes by `validate-env`) |
| `config\iam\` | Keycloak themes and realm JSON |
| `config\telemetry\` | Prometheus, Loki, Tempo, Grafana provisioning configs |

**Modes:**

```cmd
:: First-deploy (default): copies only files that don't exist yet
setup-config.bat local

:: Preview: show what would change without writing
setup-config.bat local --diff

:: Update: apply template changes, create .bak files for overwritten files
setup-config.bat local --update
```

> **Operator-managed files** are never auto-updated even with `--update`:
> `gateway\dynamic\athyper.tls.yml`, `athyper.workbench.yml`, `athyper.api.yml`.
> These contain environment-specific overrides that differ intentionally from the repo template.

---

### Step 7 — Start Core Stack

```cmd
stack\scripts\stack-profile\up.bat core
```

The `core` profile starts the minimum services required to run the application:

| Container | Service | Local port |
|---|---|---|
| `athyper-db-1` | PostgreSQL 16 | `5432` (localhost) |
| `athyper-dbpool-apps-1` | PgBouncer — transaction mode | `6432` (localhost) |
| `athyper-dbpool-session-1` | PgBouncer — session mode | `6433` (localhost) |
| `athyper-memorycache-1` | Redis 7 | `6379` (localhost) |
| `athyper-objectstorage-1` | MinIO | `9000` / `9001` (localhost) |
| `athyper-gateway-1` | Traefik | `80` / `443` |
| `athyper-iam-1` | Keycloak | via gateway: `iam.athyper.local` |
| `athyper-mailtrap-1` | Mailtrap (local SMTP capture) | `8025` (UI) |
| `athyper-socket-proxy-*` | Docker socket proxies | internal |

Wait for all containers to show `Up` or `healthy`:

```cmd
docker ps --format "table {{.Names}}\t{{.Status}}"
```

> **Keycloak takes the longest (~60 s on first boot)** while it initialises its database
> schema. Wait for `athyper-iam-1` to show `healthy` before proceeding to Step 10.

Watch startup in real time:

```cmd
stack\scripts\stack-profile\logs.bat -f
```

Verify core service health:

```cmd
:: Postgres
docker exec athyper-db-1 pg_isready

:: PgBouncer pools
docker exec athyper-dbpool-apps-1    pg_isready -h 127.0.0.1 -p 6432
docker exec athyper-dbpool-session-1 pg_isready -h 127.0.0.1 -p 6433

:: Redis — must return PONG
docker exec athyper-memorycache-1 redis-cli -a athyperadmin ping

:: MinIO — must return HTTP 200
curl -s -o nul -w "%%{http_code}" http://127.0.0.1:9000/minio/health/live
```

> **If Redis fails with `Permission denied` or `dump.rdb` errors on first start:**
> Docker Desktop sometimes sets incorrect permissions on first volume mount. Run
> `data-dirs-reset.bat` (prompts for YES), then restart the stack. Do not attempt
> `chown` — it is not applicable on Windows.

---

### Step 8 — Verify Object Storage

```cmd
stack\scripts\setup\verify-objectstorage.bat
```

Confirms MinIO is healthy, all required buckets exist, and application credentials can
read/write to the main bucket:

```text
[1/4] MinIO health    — /minio/health/live → HTTP 200
[2/4] Buckets         — athyper-local, athyper-backups, athyper-tempo-traces, athyper-loki-logs
[3/4] APP r/w test    — write + read + delete a test object with APP_S3 credentials
[4/4] Scoped accounts — SKIP (ENVIRONMENT=local uses root credentials; scoped accounts not provisioned)
```

All checks must pass before seeding the database.

---

### Step 9 — Seed Database

```cmd
stack\scripts\db\transaction\neon\seed-db.bat
```

Default run (`--all`) executes all four stages in order:

| Stage | What it does |
|---|---|
| **DDL** | Creates all schemas, tables, indexes, triggers, RLS policies |
| **Platform seed** | Inserts core data: entity registry, permission codes, system config |
| **Blueprints** | Loads industry-specific entity configurations |
| **Tenant / demo data** | Creates the demo organisation, users, and sample records |

Partial seeds for faster iteration:

```cmd
:: Schema only — use when testing DDL changes
seed-db.bat --ddl-only

:: Schema + platform seed, no demo data — clean integration test base
seed-db.bat --no-demo

:: Drop all app schemas and re-seed from scratch
seed-db.bat --reset
```

> **`--reset` is destructive.** It drops all application schemas (not the IAM or analytics
> databases) and rebuilds from scratch. Use it when DDL migrations have diverged and
> incremental apply is broken.

---

### Step 10 — Reset Keycloak IAM

```cmd
stack\scripts\db\session\iam\reset-iam.bat
```

This wipes the Keycloak database and re-imports the committed realm JSON:

1. Validates the checked-in realm files (`realm-athyper.json`, `realm-platform-control.json`)
2. Drops and recreates the Keycloak schema
3. Restarts Keycloak — it bootstraps the master realm on a clean DB
4. Auto-imports the plane realms and applies the `*-demosetup.json` fixtures
5. Seeds demo user credentials via `kcadm.sh`

After completion:

```text
Keycloak admin console: https://iam.athyper.local
Admin login:            admin / athyperadmin
Demo user login:        <see seed output>
```

> **Reset order is critical:** Always wipe the database before importing the realm.
> Keycloak creates its bootstrap admin only when it starts on a clean DB. Running
> `import-iam.bat` against an existing realm fails silently — there is no realm to
> import into yet because Keycloak's own realm creation didn't run.

---

### Step 11 — Smoke Test

```cmd
stack\scripts\smoke-staging.bat
```

Runs 8 health check groups. Groups 6 and 7 require the API and plane apps to be running
(see Section 4), so run this test after starting the application.

```text
[1/8] Docker container status     — all expected containers Up
[2/8] Postgres direct readiness   — pg_isready inside db container
[3/8] PgBouncer pools             — apps :6432 and session :6433
[4/8] Redis ping                  — PONG from memorycache
[5/8] MinIO HTTP health           — /minio/health/live → 200
[6/8] API liveness + readiness    — /livez and /readyz
[7/8] Web liveness                — /livez
[8/8] IAM OIDC discovery          — /.well-known/openid-configuration → 200
```

---

## 4. Running the Application

Three modes are available. Choose based on what you are actively working on.

---

### Option A — Full Stack in Docker

All services including API and plane apps run inside Docker containers. Useful for:
- Smoke testing a production-like configuration
- Running all profiles (telemetry, monitoring, search) simultaneously
- Verifying a Docker image build before pushing

The local `.env` defaults to Option C host-dev upstreams. For a true local full-Docker
smoke test, temporarily point the `APPS_ATHYPER_*_UPSTREAM_URL` values back to Docker
service names (`neon-web:3000`, `mesh-web:3000`, `admin-web:3000`, `api:3000`) before
starting the `apps` profile.

```cmd
stack\scripts\stack-profile\up.bat all
```

| URL | Service |
|---|---|
| `https://neon.athyper.local` | Neon tenant user plane |
| `https://mesh.athyper.local` | Mesh partner plane |
| `https://admin.athyper.local` | Admin internal plane |
| `https://api.athyper.local` | API |
| `https://iam.athyper.local` | Keycloak |
| `https://objectstorageui.athyper.local` | MinIO console |
| `https://gateway.athyper.local` | Traefik dashboard |
| `http://127.0.0.1:8025` | mailtrap (email capture) |

> **Not ideal for active code development.** Rebuilding the Docker image for every code
> change is slow. Use Option C for routine feature work.

---

### Option B — API on Host, Plane Apps in Docker

The API runs as a local `pnpm dev` process; the Next.js plane apps run inside Docker.
Useful when you are working only on the API and do not need to change the frontends.

This option also needs Docker service upstreams for the plane apps. Keep Option C as the
default when working on login pages, shared UI, or any TypeScript in `apps/neon`,
`apps/mesh`, `apps/admin`, or `packages/product`.

**Terminal 1 — Core + plane apps in Docker:**

```cmd
stack\scripts\stack-profile\up.bat core
stack\scripts\app\web-up.bat all
```

**Terminal 2 — API on the host:**

```cmd
stack\scripts\app\api-up.bat
```

`api-up.bat` translates Docker container hostnames to `127.0.0.1:PORT` equivalents so the
host Node.js process can reach the containerised services:

| Docker hostname | Becomes | Why |
|---|---|---|
| `dbpool-apps` | `127.0.0.1:6432` | PgBouncer apps pool — published to localhost |
| `db` | `127.0.0.1:5432` | Direct Postgres — published to localhost |
| `memorycache` | `127.0.0.1:6379` | Redis — published to localhost |
| `objectstorage` | `127.0.0.1:9000` | MinIO — published to localhost |
| `searchcore` | `127.0.0.1:7700` | Meilisearch — published to localhost |
| `tracing` | `127.0.0.1:4317` | OTLP/gRPC endpoint (Tempo) |

It also sets `PORT=4000` so the API listens on localhost:4000, which is where Traefik
(`api.athyper.local`) proxies inbound requests.

---

### Option C — API and Plane Apps on Host *(recommended for full-stack development)*

Both the API and the Next.js plane apps run as local `pnpm dev` processes. Docker runs only
the infrastructure services (Postgres, Redis, MinIO, Keycloak, Traefik).

`stack\env\.env` is configured for this local mode by default:

| Route | Local upstream |
|---|---|
| `https://neon.athyper.local` | `http://host.docker.internal:3101` |
| `https://mesh.athyper.local` | `http://host.docker.internal:3102` |
| `https://admin.athyper.local` | `http://host.docker.internal:3103` |
| `https://api.athyper.local` | `http://host.docker.internal:4000` |

After changing any `APPS_ATHYPER_*_UPSTREAM_URL` value, restart the gateway once so
Traefik receives the new environment:

```cmd
docker restart athyper-gateway-1
```

This gives you:
- Instant hot reload for both API and plane-app changes
- Full debugger access (attach VS Code to port 9229 for the API)
- No image rebuilds needed for code changes

**Terminal 1 — Core infrastructure only:**

```cmd
stack\scripts\stack-profile\up.bat core
```

**Terminal 2 — API (hot reload on port 4000):**

```cmd
stack\scripts\app\api-up.bat
```

**Terminal 3 - Plane apps (Next.js dev servers on ports 3101-3103):**

```cmd
stack\scripts\app\local-ui-up.bat
```

| URL | Notes |
|---|---|
| `http://localhost:3101` | Direct to Neon dev server (bypasses Traefik) |
| `http://localhost:3102` | Direct to Mesh dev server (bypasses Traefik) |
| `http://localhost:3103` | Direct to Admin dev server (bypasses Traefik) |
| `https://neon.athyper.local` | Via Traefik to localhost:3101 |
| `https://mesh.athyper.local` | Via Traefik to localhost:3102 |
| `https://admin.athyper.local` | Via Traefik to localhost:3103 |
| `http://localhost:4000` | Direct to API (bypasses Traefik) |
| `https://api.athyper.local` | Via Traefik to localhost:4000 |
| `https://iam.athyper.local` | Keycloak in Docker |
| `http://127.0.0.1:8025` | mailtrap (email capture) |

> **`ALLOW_DIRECT_ACCESS=true`** - `planes-up.bat` sets this flag, which bypasses the
> host-guard middleware for direct localhost access. Branded hostnames still enter through
> Traefik and land on their matching plane process.

> **`RUNTIME_API_URL=http://localhost:4000`** - `planes-up.bat` sets this for the Next.js
> BFF layer (server-side fetch). It must be `localhost:4000`, not `https://api.athyper.local`.
> See [Critical Gotchas §1](#1-runtime_api_url-must-be-httplocalhost4000) for details.

Staging and production do not use this host-dev routing. Their templates keep
`APPS_ATHYPER_*_UPSTREAM_URL` on Docker service names such as `neon-web:3000`,
`mesh-web:3000`, `admin-web:3000`, and `api:3000`.

---

### Running Specific Server Modes

`api-up.bat` defaults to `MODE=api` (the HTTP server). Run the worker and scheduler in
separate terminals for a complete local environment:

```cmd
:: Terminal A — HTTP API server
stack\scripts\app\api-up.bat

:: Terminal B — BullMQ background worker (processes queued jobs)
stack\scripts\app\api-up.bat worker

:: Terminal C — Job scheduler (enqueues recurring jobs)
stack\scripts\app\api-up.bat scheduler
```

The worker and scheduler read from the same `.env` and connect to the same Redis and
Postgres instances as the API server.

---

### VS Code Integration

#### Recommended extensions

Install the workspace-suggested extensions when prompted on first open, or install manually:

```text
dbaeumer.vscode-eslint          — ESLint inline feedback
esbenp.prettier-vscode          — Prettier formatting
bradlc.vscode-tailwindcss       — Tailwind CSS IntelliSense
prisma.prisma                   — (if Prisma is used)
ms-vscode.vscode-typescript-next — Latest TypeScript language server
```

#### API debugger (attach mode)

`api-up.bat` starts the API with `--inspect=9229`. Attach VS Code by creating
`.vscode/launch.json` in the repo root if it doesn't exist:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Attach to API",
      "type": "node",
      "request": "attach",
      "port": 9229,
      "restart": true,
      "sourceMaps": true,
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

Press `F5` (or Run → Start Debugging → "Attach to API") after `api-up.bat` is running.
Breakpoints in `server/src/**/*.ts` will resolve via source maps automatically.

#### Type-check without running

Run TypeScript checking across the whole workspace without starting the dev servers:

```cmd
pnpm -r tsc --noEmit
```

Or scope to a single package:

```cmd
cd server && pnpm tsc --noEmit
cd apps/neon && pnpm tsc --noEmit
cd apps/mesh && pnpm tsc --noEmit
cd apps/admin && pnpm tsc --noEmit
```

Type errors here surface the same issues the CI build catches — run this before pushing.

---

## 5. Day-2 Operations

---

### Start and Stop

```cmd
:: Start core services
stack\scripts\stack-profile\up.bat core

:: Start all profiles at once
stack\scripts\stack-profile\up.bat all

:: Stop all services (preserves volumes and data)
stack\scripts\stack-profile\down.bat

:: Stop a specific profile
stack\scripts\stack-profile\down.bat core
```

### Restart a Single Container

```cmd
docker restart athyper-memorycache-1
docker restart athyper-iam-1

:: Or use the app helpers for API and web:
stack\scripts\app\api-restart.bat
stack\scripts\app\web-restart.bat
```

### View Logs

```cmd
:: All services, follow
stack\scripts\stack-profile\logs.bat -f

:: Single service, follow
stack\scripts\stack-profile\logs.bat gateway -f

:: Single service, last 100 lines, no follow
stack\scripts\stack-profile\logs.bat iam -n 100

:: Direct docker logs (useful for quick checks)
docker logs athyper-iam-1 --tail 80
docker logs athyper-api-1 --tail 100
```

### Pull Latest Code

```cmd
cd D:\Products\athyper
git pull
pnpm install --frozen-lockfile
```

`git pull` is safe — runtime config and data are in `D:\Stack\athyper\`, outside the
checkout. Nothing in the git checkout is mutable state.

After pulling, check if config templates changed and apply updates:

```cmd
:: Preview changes
stack\scripts\setup\setup-config.bat local --diff

:: Apply changes (creates .bak files before overwriting)
stack\scripts\setup\setup-config.bat local --update
```

### Edit Environment Variables

```cmd
notepad stack\env\.env
```

After editing, validate before restarting:

```cmd
stack\scripts\setup\validate-env.bat
```

Most `.env` changes require a full stack restart to take effect:

```cmd
stack\scripts\stack-profile\down.bat
stack\scripts\stack-profile\up.bat core
```

### Database Operations

```cmd
:: Re-seed after schema changes (drops and rebuilds all app schemas)
stack\scripts\db\transaction\neon\seed-db.bat --reset

:: Apply DDL only (no data wipe)
stack\scripts\db\transaction\neon\seed-db.bat --ddl-only

:: Reset Keycloak realm only
stack\scripts\db\session\iam\reset-iam.bat

:: Export current IAM realm to JSON (before making changes)
stack\scripts\db\session\iam\export-iam.bat
```

### Check for TypeScript errors after large changes

```cmd
pnpm -r tsc --noEmit
```

This catches import errors, type regressions, and unused exports that `pnpm dev` (via
`ts-node` with `--transpile-only`) would not catch at runtime.

---

## 6. Stack Profiles

`up.bat` accepts a profile name that controls which services start. Start multiple profiles
by running `up.bat <profile>` more than once — they accumulate without restarting already-
running services.

| Profile | Services started | When to use |
|---|---|---|
| `core` | DB, PgBouncer, Redis, MinIO, Traefik, Keycloak, mailtrap, socket-proxies | Always — minimum required to run the app |
| `apps` | API, worker, scheduler, web (all in Docker) | Full Docker run (Option A) |
| `telemetry` | Loki, Prometheus, Tempo, Grafana, logshipper | Working on observability, tracing, or metrics |
| `monitoring` | errorcollect (error tracking), cronwatch, statuswatch | Testing error capture or uptime workflows |
| `render` | docrender (PDF generation), docparser (document parsing) | Testing document generation or import pipelines |
| `search` | searchcore (Meilisearch) | Testing full-text search |
| `admin` | dbconsole (DB browser) | Browsing the database in local dev |
| `emergency` | queueconsole (job queue UI) | Break-glass queue inspection when the API board is unavailable |
| `analytics` | analyticsboard (Metabase) | Analytics dashboards — requires governance approval in `.env` |
| `memorycache-jobs` | Dedicated Redis for BullMQ | Testing queue isolation or Redis HA patterns |
| `security-infisical` | Infisical secret manager | Testing secrets management integration |
| `all` | Everything above | Full environment smoke test |

> **Telemetry is off by default** for faster startup on routine development. Enable it only
> when actively working on observability features or tracing a performance problem.

---

## 7. Resetting the Stack

### Soft Reset — Wipe Data, Keep Config

Preserves generated config files in `D:\Stack\athyper\config\`.

```cmd
:: 1. Stop all containers and remove named Docker volumes
stack\scripts\stack-profile\down.bat clean

:: 2. Wipe and recreate bind-mount data directories (prompts for YES)
stack\scripts\setup\data-dirs-reset.bat

:: 3. Start fresh
stack\scripts\stack-profile\up.bat core

:: 4. Re-seed
stack\scripts\db\transaction\neon\seed-db.bat
stack\scripts\db\session\iam\reset-iam.bat
```

### Hard Reset — Wipe Everything

```cmd
:: 1. Stop all and remove volumes
stack\scripts\stack-profile\down.bat clean

:: 2. Wipe data directories (prompts for YES)
stack\scripts\setup\data-dirs-reset.bat

:: 3. Re-generate TLS cert (only if cert files were deleted)
stack\scripts\setup\generate-certs.bat

:: 4. Re-deploy config templates
stack\scripts\setup\setup-config.bat local --update

:: 5. Start fresh and re-seed
stack\scripts\stack-profile\up.bat core
stack\scripts\db\transaction\neon\seed-db.bat --reset
stack\scripts\db\session\iam\reset-iam.bat
```

`down.bat clean` removes named Docker volumes (Postgres data files, Redis RDB, MinIO
internal metadata). `data-dirs-reset.bat` wipes the bind-mounted paths in
`D:\Stack\athyper\data\`.

---

## 8. Critical Gotchas

These are non-obvious behaviours that cause confusing failures if you hit them without
prior knowledge.

### 1. `RUNTIME_API_URL` must be `http://localhost:4000`

The Next.js BFF (server-side fetch in Route Handlers and Server Components) runs on the
host, not inside Docker. The BFF calls `RUNTIME_API_URL` to reach the API server.

```text
✅  RUNTIME_API_URL=http://localhost:4000     (direct to host API process)
❌  RUNTIME_API_URL=https://api.athyper.local (routes through Traefik → breaks SSE and sessions)
```

Routing through Traefik breaks SSE (Server-Sent Events) and session cookie forwarding
because the gateway rewrites headers. `web-up.bat` and `planes-up.bat` set `http://localhost:4000`
automatically. If you start a plane app with a manual `pnpm dev` without setting this
variable, all BFF routes that call the API will return connection errors.

### 2. Next.js 16 blocks cross-origin `/api/` calls

Next.js 16.x blocks all cross-origin dev API calls from non-localhost origins by default.
When the browser accesses `https://neon.athyper.local` and makes a call to `/api/...`,
Next.js treats it as cross-origin and returns 403.

Fix — add the relevant host to the active plane app's `next.config.mjs`:

```js
allowedDevOrigins: ['neon.athyper.local'],
```

Without this, all BFF routes (`/api/session`, `/api/relay/*`, `/api/stream/*`) return 403
when accessed through the Traefik gateway domain.

### 3. Entity URL slugs use underscores, not hyphens

Entity paths in `/app/[entity]/` match database table names — they use `_` (underscores):

```text
✅  /app/purchase_invoice
❌  /app/purchase-invoice    — breaks routing, INLINE_SEARCH_ENTITY_MAP, and formatTitle
```

`formatTitle` splits on `_` to generate display names. A hyphenated slug produces an
incorrect title and may silently fail entity lookups.

### 4. Session cookie name is `neon_sid`

The API sets the cookie `neon_sid`. Middleware in `apps/neon` reads `neon_sid`.
Plane-specific cookie names are owned by `@athyper/session-plane`; do not add a
parallel auth package or hardcoded cookie helper for manual testing.

If you see a permanent login redirect loop after a code change, check that nothing
changed the cookie name in either the API or the middleware.

### 5. Forward slashes in `ATHYPER_*_ROOT` paths

Docker Desktop's WSL 2 backend requires POSIX-style paths in compose volume mounts.
The six root variables in `.env` must use forward slashes:

```env
✅  ATHYPER_DATA_ROOT=D:/Stack/athyper/data
❌  ATHYPER_DATA_ROOT=D:\Stack\athyper\data   — causes blank bind mount source in compose
```

A backslash path causes `docker compose config` to render a blank `source:` for bind
mounts, which silently mounts `/` instead of the intended directory.

### 6. Keycloak realm import must follow a clean DB wipe

Never run `import-iam.bat` against a running Keycloak instance without wiping the DB
first. Keycloak will reject realm re-imports if the realm already exists, and the error
messages are difficult to diagnose. Always use `reset-iam.bat`, which wipes, restarts,
and imports in the correct order.

---

## 9. Troubleshooting

### Docker Desktop not running

```text
error during connect: this error may indicate that the Docker daemon is not running
```

Launch Docker Desktop from the Start menu or system tray and wait for the whale icon
to stop animating before retrying.

### Container exits immediately after starting

Check the logs first:

```cmd
stack\scripts\stack-profile\logs.bat <service> --tail 80
```

| Log message | Cause | Fix |
|---|---|---|
| `Permission denied on /data/...` | Data directory missing or inaccessible | Run `data-dirs-create.bat` |
| `invalid config file` | Config file syntax error or wrong path | Run `setup-config.bat local --diff` |
| `Required env variable not set` | Missing required var | Run `validate-env.bat` |
| `dump.rdb Permission denied` (Redis) | Stale mount permissions | Run `data-dirs-reset.bat` then restart |
| `Unable to read MinIO config` | Missing objectstorage data dir | Run `data-dirs-create.bat` |

### Local hostnames don't resolve

```text
curl: Could not resolve host: api.athyper.local
```

Verify the hosts file contains the entries:

```cmd
findstr "athyper.local" C:\Windows\System32\drivers\etc\hosts
```

If empty, the file was saved from a non-elevated Notepad — re-open as Administrator.
Flush the DNS cache after editing:

```cmd
ipconfig /flushdns
```

### Browser shows "Your connection is not private" (TLS error)

mkcert's local CA is not trusted. Run:

```cmd
mkcert -install
```

Then **fully restart** the browser (quit and relaunch — not just close the tab). If the
cert was generated before `mkcert -install`, regenerate it:

```cmd
stack\scripts\setup\generate-certs.bat
docker restart athyper-gateway-1
```

### API calls fail with 404 or "connection refused"

```cmd
:: Is the API process running on port 4000?
netstat -ano | findstr :4000

:: Test directly
curl -s http://localhost:4000/livez
curl -sk https://api.athyper.local/livez
```

If the direct call works but the Traefik call fails, check the gateway logs:

```cmd
docker logs athyper-gateway-1 --tail 50
```

Traefik logs `level=error` entries for backend connection failures — the error message
will name the service that is unreachable.

### BFF routes return 403 when accessed from a plane hostname

This is the Next.js 16 cross-origin restriction. Add the host to the active plane
app's `next.config.mjs`:

```js
allowedDevOrigins: ['neon.athyper.local'],
```

Restart the plane app process after the change.

### Keycloak login loop / "Invalid token"

Most common cause: the session cookie `neon_sid` is not being set or is being ignored.

1. Confirm `COOKIE_NAME=neon_sid` in `stack/env/.env`
2. Open browser DevTools → Application → Cookies → `neon.athyper.local` and verify
   `neon_sid` is present after login
3. If missing or being rejected, reset Keycloak: `reset-iam.bat`

### Port already in use

```text
Bind for 0.0.0.0:5432 failed: port is already allocated
```

A local PostgreSQL installation is using the same port. Options:

```cmd
:: Temporarily stop the local Postgres service
net stop postgresql-x64-16

:: Or change the compose publish port in athyper.override.local.yml:
:: ports: ["15432:5432"]  -- then use 127.0.0.1:15432 for direct connections
```

### "Server config invalid — VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY required"

```text
Error: Server config invalid — check env vars:
  push.vapidPublicKey: VAPID_PUBLIC_KEY is required when VAPID Web Push is configured
  push.vapidPrivateKey: VAPID_PRIVATE_KEY is required when VAPID Web Push is configured
```

The config validator triggers as soon as any one of the three VAPID variables is present.
The most common cause on a fresh clone is `VAPID_SUBJECT` being set in `.env` without the
matching keys — or the keys being missing entirely after copying `.env.example`.

Fix — generate the keys and add all three to `stack\env\.env`:

```cmd
pnpm dlx web-push generate-vapid-keys
```

```env
VAPID_SUBJECT=mailto:dev@atlasdigitaltech.com
VAPID_PUBLIC_KEY=<publicKey from output>
VAPID_PRIVATE_KEY=<privateKey from output>
```

If you don't need Web Push locally, comment out or remove all three `VAPID_*` lines.

---

### `validate-env.bat` warns about `publicBaseUrl` mismatch

Open the kernel config JSON at the path in `ATHYPER_KERNEL_CONFIG_PATH` and verify the
`publicBaseUrl` field matches `PUBLIC_BASE_URL` in `.env`. The full JSON parse only
happens in `validate-env.sh` on Linux — the `.bat` version does a partial `findstr` check
and can produce false warnings if the value appears on a non-standard line.

### TypeScript errors after `git pull`

If `pnpm dev` starts but logs type errors or crashes on startup:

```cmd
pnpm install --frozen-lockfile    :: pick up any new/changed package versions
pnpm -r tsc --noEmit              :: see all type errors across the workspace
```

A common cause is a new package added to `package.json` that wasn't installed because
`pnpm install` was not run after the pull.

---

## 10. Environment Variables Reference

Key variables in `stack/env/.env` for local development. Full list with descriptions is in
`stack/env/.env.example`.

| Variable | Local dev value | Why / Notes |
|---|---|---|
| `ENVIRONMENT` | `local` | Disables production security checks; enables dev-only features |
| `COMPOSE_PROJECT_NAME` | `athyper` | Prefix for all container names (`athyper-db-1`, etc.) |
| `ATHYPER_SECRETS_ROOT` | empty | Keeps local dev in single-file env mode |
| `ATHYPER_CONFIG_ROOT` | `D:/Stack/athyper/config` | Forward slashes — required for Docker Desktop bind mounts |
| `ATHYPER_DATA_ROOT` | `D:/Stack/athyper/data` | Forward slashes |
| `ATHYPER_LOG_ROOT` | `D:/Stack/athyper/logs` | Forward slashes |
| `ATHYPER_BACKUP_ROOT` | `D:/Stack/athyper/backups` | Forward slashes |
| `NODE_ENV` | `development` | Enables source maps and verbose error output |
| `NODE_TLS_REJECT_UNAUTHORIZED` | `0` | Accepts the mkcert-issued local TLS cert in Node processes |
| `RUNTIME_API_URL` | `http://localhost:4000` | Used by the Next.js BFF layer — must be localhost, not Traefik |
| `PUBLIC_BASE_URL` | `https://api.athyper.local` | Public-facing API URL (used in emails, CORS, deep links) |
| `PUBLIC_WEB_URL` | `https://neon.athyper.local` | Public-facing web URL |
| `IAM_HOST` | `iam.athyper.local` | Keycloak hostname — no scheme prefix |
| `IAM_ISSUER_URL` | `https://iam.athyper.local/realms/athyper` | JWT issuer — must match exactly what Keycloak reports |
| `LOG_LEVEL` | `debug` | Set to `info` to reduce log noise during frontend-focused work |
| `AUTH_DEBUG_EXPOSE_TOKENS` | `true` | Logs raw JWT tokens (local only — blocked in staging/production) |
| `FRESHCLAM_NO_DAEMON` | `true` | Disables ClamAV daily definition updates (saves bandwidth in local dev) |
| `STACK_PROFILE` | `core` | Default profile used when `up.bat` is called without arguments |
| `MEMORYCACHE_PASSWORD` | `athyperadmin` | Redis password — `api-up.bat` injects this into the host process |
| `S3_ACCESS_KEY` | `athyperadmin` | MinIO root access key |
| `VAPID_SUBJECT` | `mailto:dev@...` | VAPID sender identity — generate with `pnpm dlx web-push generate-vapid-keys` |
| `VAPID_PUBLIC_KEY` | *(generated)* | VAPID public key — must be set together with `VAPID_SUBJECT` and `VAPID_PRIVATE_KEY` |
| `VAPID_PRIVATE_KEY` | *(generated)* | VAPID private key — all three VAPID vars must be present or all absent |

---

## Related Documentation

| Document | Purpose |
|---|---|
| [`environments.md`](environments.md) | Cross-env comparison — local vs staging vs production matrix, script behavior, profile defaults |
| [`staging-setup.md`](staging-setup.md) | Ubuntu server installation, v13 permission model, full Phase 0–26 runbook |
| [`infrastructure-plan.md`](infrastructure-plan.md) | Architecture overview, v13 permission decision, pre-deployment code gates |
| [`secrets-management.md`](secrets-management.md) | Secret inventory, generation commands, rotation runbook |
| [`weekly-reset-reseed-export.md`](weekly-reset-reseed-export.md) | Weekly DB reset, re-seed, export, and restore validation until base completion |
