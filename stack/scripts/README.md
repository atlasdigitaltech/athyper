# Athyper Stack Scripts

Scripts for managing the Athyper local/staging/production Docker Compose stack.

---

## Prerequisites

Install these before running any script:

| Tool | Min version | Purpose | Install |
|------|------------|---------|---------|
| Docker Desktop | 4.25+ | Container runtime | https://docs.docker.com/get-docker/ |
| Node.js + Corepack | 22+ | Database seeding and local dev servers | https://nodejs.org |
| pnpm | 10.33.0 | Workspace package manager | `corepack prepare pnpm@10.33.0 --activate` |
| mkcert | any | Local TLS certs (`generate-certs`) | `brew install mkcert` / `winget install FiloSottile.mkcert` |
| jq | 1.6+ | JSON validation in IAM scripts (optional but recommended) | `brew install jq` / `winget install jqlang.jq` |
| Git Bash or WSL | — | Required on Windows for `.sh` scripts | https://git-scm.com |

> **Windows users**: `.bat` scripts run natively in Command Prompt or PowerShell — no Git Bash needed.
> Git Bash is only required if you prefer the `.sh` versions or are on WSL. Use the `.sh`
> scripts for Ubuntu staging/production operations because they implement the two-file
> bootstrap + secrets env model.

---

## Directory Layout

```
stack/scripts/
├── lib/                              # Shared helpers — sourced by other scripts, never run directly
│   ├── constants.sh                  # Container names, DB names, colour codes (single source of truth)
│   ├── compose.sh                    # Docker Compose file list builder + docker_preflight()
│   └── resolve-iam-credentials.sh   # IAM DB credential cascade (container → env → .env → fail)
│
├── setup/                            # One-time environment preparation (run before first `up`)
│   ├── setup-env.sh / .bat           # Copy an env template to stack/env/.env
│   ├── setup-config.sh / .bat        # Copy a kernel config template to stack/config/apps/
│   ├── validate-env.sh / .bat        # Pre-flight: verify all required vars, security checks
│   ├── data-dirs-create.sh / .bat    # Create stack/data/ volume mount folders (idempotent)
│   ├── data-dirs-reset.sh / .bat     # DESTRUCTIVE: wipe and recreate stack/data/ folders
│   ├── generate-certs.sh / .bat      # Generate local TLS certs via mkcert (local env only)
│   ├── verify-objectstorage.sh / .bat  # Post-startup: verify MinIO health, buckets, scoped accounts
│   └── verify-port-hardening.sh / .bat  # CI guard: ensure no service bypasses the Traefik ingress
│
├── stack-profile/                    # Profile-aware stack lifecycle
│   ├── up.sh / .bat                  # Bring the stack up (profile-aware, auto-bootstraps .env)
│   ├── down.sh / .bat                # Bring the stack down (profile-aware)
│   ├── restart.sh / .bat             # Restart running services (all or named)
│   └── logs.sh / .bat                # Stream container logs
│
├── stack-service/                    # Individual container control (by alias or raw name)
│   ├── start.sh / .bat               # Start one or more containers
│   ├── stop.sh / .bat                # Stop one or more containers
│   └── restart.sh / .bat             # Restart one or more containers
│
├── docker/                           # Docker engine lifecycle
│   ├── start.sh / .bat               # Start Docker Desktop (macOS) or systemctl (Linux)
│   ├── stop.sh / .bat                # Stop Docker Desktop / systemctl
│   └── restart.sh / .bat             # Stop then start the Docker engine
│
├── app/                              # Application service scripts (environment-aware)
│   ├── api-up.sh / .bat              # local → pnpm dev; staging/prod → compose up athyper-api
│   ├── api-down.sh / .bat            # local → guidance; staging/prod → compose stop athyper-api
│   ├── api-restart.sh / .bat         # Restart the backend API service
│   ├── web-up.sh / .bat              # local → pnpm dev; staging/prod → compose up athyper-neon-web
│   ├── web-down.sh / .bat            # local → guidance; staging/prod → compose stop athyper-neon-web
│   └── web-restart.sh / .bat         # Restart the web frontend service
│
└── db/                               # Database and IAM operations, organised by PgBouncer pool
    ├── session/                      # Databases on dbpool-session (port 6433 — session mode)
    │   ├── analytics/                # Analytics DB placeholder (reserved, scripts TBD)
    │   └── iam/                      # Keycloak / IAM database operations
    │       ├── seed-iam-credentials.sh / .bat  # Set demo user passwords in Keycloak (idempotent)
    │       ├── reset-iam.sh / .bat             # Full reset: wipe IAM DB, reimport JSON, seed passwords
    │       ├── import-iam.sh / .bat            # Import realm JSON into a running Keycloak
    │       └── export-iam.sh / .bat            # Export Keycloak realms to stack/config/iam/
    └── transaction/                  # Databases on dbpool-apps (port 6432 — transaction mode)
        ├── neon/                     # Main application database (athyper_dev1 / athyper_staging / …)
        │   └── seed-db.sh / .bat     # Seed/migrate the application database
        ├── errors/                   # Error-tracking DB placeholder (reserved)
        ├── health/                   # Health-checks DB placeholder (reserved)
        ├── mesh/                     # Mesh/infra DB placeholder (reserved)
        └── secrets/                  # Secrets DB placeholder (reserved)
```

### PgBouncer pool topology

| Pool | Port | Mode | Databases served |
|------|------|------|-----------------|
| `dbpool-session` | 6433 | session | `athyper_iam`, `athyper_analytics` |
| `dbpool-apps` | 6432 | transaction | `athyper_neon` (app), errors, health, mesh, secrets |

The `db/session/` and `db/transaction/` layout mirrors this split so scripts live next to the databases they target.

---

## First-Run Onboarding (new machine or new environment)

Run these steps **in order**. All paths are relative to the repo root.

### Step 0 — Start Docker

```bash
# Git Bash / WSL
bash stack/scripts/docker/start.sh
```
```bat
:: Command Prompt / PowerShell
stack\scripts\docker\start.bat
```

Waits until the Docker daemon is ready before returning. Safe to run when Docker is already running.

### Step 1 — Environment file

```bash
# Git Bash / WSL
bash stack/scripts/setup/setup-env.sh local            # local env, all targets (stack + server + apps/web)
bash stack/scripts/setup/setup-env.sh staging stack    # staging, stack only (split-server: stack machine)
bash stack/scripts/setup/setup-env.sh staging runtime  # staging, server + apps (split-server: app machine)
```
```bat
:: Command Prompt / PowerShell
stack\scripts\setup\setup-env.bat local
stack\scripts\setup\setup-env.bat staging stack
stack\scripts\setup\setup-env.bat staging runtime
```

Open `stack/env/.env` and fill in any `# TODO` placeholders for your environment.
The `target` argument controls which component `.env` files are written:

| Target | Files written | Use for |
|--------|--------------|---------|
| `all` (default) | `stack/env/.env` + `server/.env` + `apps/web/.env.local` | Single-machine / local dev |
| `stack` | `stack/env/.env` only | Split-server: stack/Docker machine |
| `runtime` | `server/.env` + `apps/web/.env.local` | Split-server: app machine |
| `server` | `server/.env` only | Server tier only |
| `apps` | `apps/web/.env.local` only | Web tier only |

### Step 2 — Kernel config

```bash
# Git Bash / WSL
bash stack/scripts/setup/setup-config.sh local
```
```bat
:: Command Prompt / PowerShell
stack\scripts\setup\setup-config.bat local
```

Copies `stack/config/apps/kernel.config.{env}.parameter.json` → `kernel.config.parameter.json`. Backs up any existing file.

### Step 3 — Validate the environment

```bash
# Git Bash / WSL
bash stack/scripts/setup/validate-env.sh
bash stack/scripts/setup/validate-env.sh /path/to/custom.env  # explicit env file

# Staging / production two-file merge: bootstrap first, secrets second
bash stack/scripts/setup/validate-env.sh \
  /opt/products/athyper/stack/env/.env \
  /opt/stack/athyper/secrets/.env
```
```bat
:: Command Prompt / PowerShell
stack\scripts\setup\validate-env.bat
stack\scripts\setup\validate-env.bat C:\path\to\.env
```

Exit code 0 = pass. Exit code 1 = fix errors before proceeding. Exit code 2 = warnings only (non-blocking).

Validation covers six sections:
1. Core identity — ENVIRONMENT, COMPOSE_PROJECT_NAME set and non-empty
2. Required variables — all mandatory vars present and non-empty
3. Non-local secrets — production/staging specific: CREDENTIAL_MASTER_KEY format, NODE_TLS_REJECT_UNAUTHORIZED, NODE_ENV, auth debug flags, default passwords, upstream URLs, storage backend
4. Kernel config hostname parity — PUBLIC_BASE_URL in .env matches the kernel config JSON
5. Security checks — port hardening, Traefik ingress bypass detection
6. Recommendations — informational warnings that don't fail the build

### Step 4 — Data directories

**Local dev** (default: `stack/data/` inside the repo):

```bash
# Git Bash / WSL — safe, idempotent
bash stack/scripts/setup/data-dirs-create.sh
```
```bat
:: Command Prompt / PowerShell
stack\scripts\setup\data-dirs-create.bat
```

**Server (staging / production)** — must run as **root** with `ATHYPER_DATA_ROOT` exported first.
The script aborts if it detects a server path (`/opt/…`) without this variable set, to prevent
data dirs being created inside the git checkout by mistake:

```bash
export ATHYPER_DATA_ROOT=/opt/stack/athyper/data
sudo bash /opt/products/athyper/stack/scripts/setup/data-dirs-create.sh
```

Creates the directory tree under `ATHYPER_DATA` (default: `stack/data/`):
`db`, `meilisearch`, `memorycache`, `memorycache-jobs`, `metabase`, `objectstorage`,
`telemetry/logging`, `telemetry/metrics`, `telemetry/observability`, `telemetry/tracing`, `uptime-kuma`

On server runs (root + `/opt/…` path), the script also sets per-container ownership on each leaf dir
(Redis 999, MinIO 1000, Loki/Tempo 10001, Prometheus 65534, Grafana 472). See `infrastructure-plan.md`
S6 for the full UID matrix.

### Step 5 — Local TLS certificates (local environment only)

```bash
# Git Bash / WSL — requires mkcert
bash stack/scripts/setup/generate-certs.sh
```
```bat
:: Command Prompt / PowerShell
stack\scripts\setup\generate-certs.bat
```

Generates a single cert covering all local SANs:
`*.athyper.local`, `neon.athyper.local`, `gateway.athyper.local`, `api.athyper.local`,
`iam.athyper.local`, `objectstorage.athyper.local`

Output: `stack/config/gateway/certs/athyper.tls.local.crt` + `.key`

Add the generated cert to your browser/OS trust store via `mkcert -install` (done automatically by the script).

### Step 6 — Bring the stack up

```bash
# Git Bash / WSL
bash stack/scripts/stack-profile/up.sh               # default: core profile
bash stack/scripts/stack-profile/up.sh core
bash stack/scripts/stack-profile/up.sh telemetry     # adds Grafana / Loki / Tempo / Prometheus
bash stack/scripts/stack-profile/up.sh all
```
```bat
:: Command Prompt / PowerShell
stack\scripts\stack-profile\up.bat
stack\scripts\stack-profile\up.bat core
stack\scripts\stack-profile\up.bat telemetry
stack\scripts\stack-profile\up.bat all
```

> `up.sh` / `up.bat` will auto-bootstrap a `.env` from the template if none exists, then run `validate-env` before starting.

Monitor startup:

```bash
bash stack/scripts/stack-profile/logs.sh -f
```
```bat
stack\scripts\stack-profile\logs.bat -f
```

### Step 6b — Verify object storage

After the stack is healthy, confirm MinIO is reachable and all buckets are provisioned:

```bash
# Git Bash / WSL
bash stack/scripts/setup/verify-objectstorage.sh

# Staging / production:
bash stack/scripts/setup/verify-objectstorage.sh \
  /opt/products/athyper/stack/env/.env \
  /opt/stack/athyper/secrets/.env
```
```bat
:: Command Prompt / PowerShell
stack\scripts\setup\verify-objectstorage.bat
```

Exit code 0 = pass. Exit code 1 = MinIO not reachable or a bucket/user is missing.

The `objectstorage-init` sidecar provisions all buckets automatically on stack start (it runs as a one-shot container after MinIO is healthy). If verify-objectstorage fails:

1. Check init logs: `docker logs $(docker ps -aqf name=objectstorage-init)`
2. Re-run the sidecar through the profile wrapper: `bash stack/scripts/stack-profile/up.sh objectstorage`
3. Re-run verify with the same env-file mode used for the environment.

> **Local dev**: if `S3_ENDPOINT` is not set in `stack/env/.env`, the API server disables object storage
> (file attachments return 503). Set `S3_ENDPOINT=http://objectstorage:9000` or the server `.env`
> override `S3_ENDPOINT=http://127.0.0.1:9000` if running the API server outside Docker.

### Step 7 — Seed the application database

```bash
# Git Bash / WSL
bash stack/scripts/db/transaction/neon/seed-db.sh              # Full seed (DDL + platform + blueprint + tenant)
bash stack/scripts/db/transaction/neon/seed-db.sh --all        # Same as above (explicit alias)
bash stack/scripts/db/transaction/neon/seed-db.sh --no-demo    # Production-like (DDL + platform only)
bash stack/scripts/db/transaction/neon/seed-db.sh --demo-only  # All phases, alias for default
bash stack/scripts/db/transaction/neon/seed-db.sh --status     # Show provision status, no changes
bash stack/scripts/db/transaction/neon/seed-db.sh --tenant-id=<UUID>  # Provision for a specific tenant UUID
```
```bat
:: Command Prompt / PowerShell
stack\scripts\db\transaction\neon\seed-db.bat
stack\scripts\db\transaction\neon\seed-db.bat --all
stack\scripts\db\transaction\neon\seed-db.bat --no-demo
stack\scripts\db\transaction\neon\seed-db.bat --demo-only
stack\scripts\db\transaction\neon\seed-db.bat --status
stack\scripts\db\transaction\neon\seed-db.bat --tenant-id=<UUID>
```

Requires: Node.js 18+, running Postgres container.

### Step 8 — Initialize Keycloak IAM

Choose **one** of the following:

**Option A — Full reset (recommended for a brand-new environment):**

```bash
bash stack/scripts/db/session/iam/reset-iam.sh
```
```bat
stack\scripts\db\session\iam\reset-iam.bat
```

This wipes the IAM database, reimports realm JSON files, and seeds demo user passwords. Safe to re-run at any time when you want a clean IAM state.

**Option B — Import existing realm JSON:**

```bash
bash stack/scripts/db/session/iam/import-iam.sh
```
```bat
stack\scripts\db\session\iam\import-iam.bat
```

Use this when you already have up-to-date `stack/config/iam/realm-demosetup.json` and want to import into an already-running Keycloak without wiping it.

**Seed passwords (after Option B or standalone):**

```bash
bash stack/scripts/db/session/iam/seed-iam-credentials.sh
```
```bat
stack\scripts\db\session\iam\seed-iam-credentials.bat
```

Demo user passwords are controlled by `IAM_DEMO_USER_PASSWORD` in `stack/env/.env`.
Default (if unset): `Demo@1234` for athyper realm, `admin` for platform-control realm.

---

## New Tenant Onboarding

When a new tenant is registered in the system, no additional object storage steps are required. Storage is automatically scoped per tenant at the application layer.

### Object storage — how it works

All tenants share the same MinIO bucket (`S3_BUCKET`, e.g. `athyper-prod`). Tenant isolation is enforced by key prefixes that the API server writes:

```
tenant/<tenantId>/master/comment/<attachmentId>/v1/<filename>
tenant/<tenantId>/master/attachment/<attachmentId>/v1/<filename>
```

The server checks `tenant_id` on every `master.attachment` row before issuing presigned URLs — a tenant can never read or write another tenant's objects even though the keys live in the same bucket.

### What happens automatically on first upload

When a user from a new tenant uploads their first file:

1. The API server generates a UUID for the attachment and constructs the tenant-prefixed key.
2. A presigned PUT URL is issued to the browser (15-minute TTL).
3. The browser uploads directly to MinIO; the server never proxies binary data.
4. After the upload, the server links the attachment to the document via `master.entity_document_link`.

No bucket creation, IAM provisioning, or configuration change is needed per tenant.

### Tenant offboarding (data cleanup)

When a tenant is deprovisioned, their objects must be purged from the shared bucket. Use the MinIO client targeting the tenant's prefix:

```bash
# Remove all objects for a specific tenant (irreversible)
docker run --rm --network athyper-edge \
  -e MC_CONFIG_DIR=/tmp/.mc \
  minio/mc:RELEASE.2025-08-13T08-35-41Z \
  alias set storage http://objectstorage:9000 <root_key> <root_secret>

docker run --rm --network athyper-edge \
  -e MC_CONFIG_DIR=/tmp/.mc \
  minio/mc:RELEASE.2025-08-13T08-35-41Z \
  rm --recursive --force "storage/<S3_BUCKET>/tenant/<tenantId>/"
```

Also run the application-level cleanup (removes DB rows from `master.attachment` and `master.entity_document_link`) as part of the tenant deprovisioning flow in the admin API.

---

## Day-to-day Commands

```bash
# Git Bash / WSL
bash stack/scripts/stack-profile/up.sh [profile]
bash stack/scripts/stack-profile/down.sh [profile]
bash stack/scripts/stack-profile/down.sh clean        # Stop + remove all volumes (full wipe)
bash stack/scripts/stack-profile/restart.sh           # Restart all running services
bash stack/scripts/stack-profile/restart.sh gateway   # Restart a specific service
bash stack/scripts/stack-profile/logs.sh -f
bash stack/scripts/stack-profile/logs.sh gateway -f --tail 100
bash stack/scripts/db/transaction/neon/seed-db.sh --all    # Explicit alias for full provision
bash stack/scripts/db/transaction/neon/seed-db.sh --reset  # Re-run DB seed (e.g. after schema change)
bash stack/scripts/db/transaction/neon/seed-db.sh --tenant-id=<UUID>  # Provision Phase 3 for a specific tenant

# Application services (local: runs pnpm dev; staging/prod: compose up/stop)
bash stack/scripts/app/api-up.sh                      # Start backend API (default mode)
bash stack/scripts/app/api-up.sh worker               # Start backend in BullMQ worker mode
bash stack/scripts/app/api-up.sh scheduler            # Start backend in scheduler mode
bash stack/scripts/app/web-up.sh                      # Start web frontend

# Individual container control (by alias)
bash stack/scripts/stack-service/start.sh iam db redis   # Start named containers
bash stack/scripts/stack-service/stop.sh gateway          # Stop a container
bash stack/scripts/stack-service/restart.sh api           # Restart a container
```

```bat
:: Command Prompt / PowerShell
stack\scripts\stack-profile\up.bat [profile]
stack\scripts\stack-profile\down.bat [profile]
stack\scripts\stack-profile\down.bat clean
stack\scripts\stack-profile\restart.bat
stack\scripts\stack-profile\restart.bat gateway
stack\scripts\stack-profile\logs.bat -f
stack\scripts\stack-profile\logs.bat gateway -f --tail 100
stack\scripts\db\transaction\neon\seed-db.bat --all
stack\scripts\db\transaction\neon\seed-db.bat --reset
stack\scripts\db\transaction\neon\seed-db.bat --tenant-id=<UUID>

stack\scripts\app\api-up.bat
stack\scripts\app\api-up.bat worker
stack\scripts\app\api-up.bat scheduler
stack\scripts\app\web-up.bat

stack\scripts\stack-service\start.bat iam db redis
stack\scripts\stack-service\stop.bat gateway
stack\scripts\stack-service\restart.bat api
```

---

## Profiles

The `STACK_PROFILE` env var (also settable as a CLI arg to `stack-profile/up`) controls which Docker Compose services are started.

| Profile | Services included | Typical use |
|---------|-------------------|-------------|
| `core` | db, dbpool-apps, dbpool-session, gateway, IAM, Redis, MinIO, Mailhog | Daily dev |
| `telemetry` | core + Grafana, Loki, Tempo, Prometheus, Promtail | Observability work |
| `search` | core + Meilisearch | Full-text search development |
| `analytics` | core + Metabase | Analytics / BI (requires governance gate — see validate-env) |
| `monitoring` | core + GlitchTip, Healthchecks, Uptime Kuma | Error tracking + uptime monitoring |
| `render` | core + Gotenberg + Tika | Document rendering / extraction |
| `security-infisical` | core + Infisical | Secrets management |
| `memorycache` | standalone Redis container | Add Redis independently of `core` |
| `memorycache-jobs` | dedicated Redis for BullMQ | High-isolation job queue |
| `objectstorage` | standalone MinIO container | Add MinIO independently of `core` |
| `admin` | core + BullBoard + pgweb | Admin UIs for queues and database |
| `apps` | core + athyper-api + athyper-neon-web (containerised) | Staging / production full-stack |
| `db` | standalone Postgres + PgBouncer containers | Add DB tier independently of `core` |
| `iam` | standalone Keycloak container | Add IAM independently of `core` |
| `gateway` | standalone Traefik container | Add ingress independently of `core` |
| `dev` | development-specific helper services | Local developer tooling |
| `emergency` | break-glass emergency services | Incident response (see RBAC posture) |
| `all` | every profile above | Integration testing, CI |

Set the default in `stack/env/.env`:
```
STACK_PROFILE=core
```

Override for one run:
```bash
bash stack/scripts/stack-profile/up.sh telemetry
```
```bat
stack\scripts\stack-profile\up.bat telemetry
```

---

## Container Aliases (stack-service)

`stack-service/start`, `stop`, and `restart` resolve short aliases to full container names:

| Alias | Container | Notes |
|-------|-----------|-------|
| `iam` | `athyper-stack-iam-1` | Keycloak |
| `db` | `athyper-stack-db-1` | Postgres |
| `dbpool-session` | `athyper-stack-dbpool-session-1` | PgBouncer session pool |
| `dbpool-apps` | `athyper-stack-dbpool-apps-1` | PgBouncer apps pool |
| `gateway` / `traefik` | `athyper-stack-gateway-1` | Traefik ingress |
| `redis` / `cache` / `memorycache` | `athyper-stack-memorycache-1` | Redis |
| `minio` / `storage` | `athyper-stack-objectstorage-1` | MinIO |
| `mail` / `mailhog` | `athyper-stack-mailhog-1` | Mailhog |
| `web` / `frontend` | `athyper-stack-athyper-neon-web-1` | Next.js (staging/prod only) |
| `api` / `backend` | `athyper-stack-athyper-api-1` | Backend API (staging/prod only) |
| `search` / `meilisearch` | `athyper-stack-meilisearch-1` | Meilisearch |

Raw container names are passed through unchanged, so `stack-service/start.sh athyper-stack-iam-1` also works.

---

## Application Service Modes (app/)

`app/api-up` and `app/web-up` auto-detect the environment from `stack/env/.env`:

| Environment | `api-up` behaviour | `web-up` behaviour |
|-------------|-------------------|-------------------|
| `local` | `pnpm --filter @athyper/runtime-server dev` (foreground) | `pnpm --filter @athyper/web dev` (foreground, HMR) |
| `staging` | `docker compose up -d --no-deps athyper-api` | `docker compose up -d --no-deps athyper-neon-web` |
| `production` | `docker compose up -d --no-deps athyper-api` | `docker compose up -d --no-deps athyper-neon-web` |

API modes (local only):

| Argument | pnpm script | Purpose |
|----------|------------|---------|
| _(none)_ | `dev` | Standard API server |
| `worker` | `dev:worker` | BullMQ worker process |
| `scheduler` | `dev:scheduler` | Job scheduler process |

---

## Script Parameters Reference

### setup/setup-env

```
setup-env.sh [environment] [target]
setup-env.bat [environment] [target]
```

Both arguments are interactive if omitted.

| Parameter | Values | Default | Description |
|-----------|--------|---------|-------------|
| `environment` | `local` \| `staging` \| `production` | prompted | Selects the env template |
| `target` | `all` \| `stack` \| `runtime` \| `server` \| `apps` | `all` (prompted) | Which component `.env` to write |

Template resolution:

| Target | Source template | Destination |
|--------|----------------|-------------|
| `stack` | `stack/env/{env}.env.example` (falls back to `.env.example` for `local`) | `stack/env/.env` |
| `server` | `server/{env}.env.example` (falls back to `.env.example`) | `server/.env` |
| `apps` | `apps/web/{env}.env.example` (falls back to `.env.example`) | `apps/web/.env.local` |

### setup/setup-config

```
setup-config.sh [environment]
setup-config.bat [environment]
```

| Parameter | Values | Default | Description |
|-----------|--------|---------|-------------|
| `environment` | `local` \| `staging` \| `production` | prompted | Selects env-variant config templates |

Copies all config templates from `stack/config/` into the live config root. Backs up existing files in `--update` mode.

**Server requirement:** `config/` is owned `root:athyper-config` — run as `root` with `ATHYPER_CONFIG_ROOT` and `ATHYPER_SECRETS_ROOT` exported. The script aborts with a clear message if the live config dir is not writable.

Permissions are applied automatically at the end of every write run (dirs `755`, files `644`, owner `root:athyper-config`). The `755`/`644` model is intentional: config files are root-owned and mounted `:ro`, so world-readable is safe; container processes (UID 999 etc.) need directory `+x` to traverse mount paths and file `+r` to read them.

```bash
sudo ATHYPER_CONFIG_ROOT=/opt/stack/athyper/config \
     ATHYPER_SECRETS_ROOT=/opt/stack/athyper/secrets \
  bash stack/scripts/setup/setup-config.sh staging
# Permissions locked automatically — no separate chmod step needed.
```

### setup/validate-env

```
validate-env.sh [env-file-path] [second-env-file-path]
validate-env.bat [env-file-path]
```

| Parameter | Description |
|-----------|-------------|
| `env-file-path` | Explicit path to the first `.env` file. Auto-detects `stack/env/.env` if omitted. |
| `second-env-file-path` | Optional secrets file. Used on staging/production so validation mirrors Docker Compose merge order. |

Exit codes: `0` = all checks pass, `1` = fatal errors (fix before running `up`), `2` = warnings only.

### setup/data-dirs-create

```
data-dirs-create.sh
data-dirs-create.bat
```

No parameters. Reads `ATHYPER_DATA_ROOT` (server) or `ATHYPER_DATA` (legacy), falls back to `stack/data/` for local dev. Safe to re-run (idempotent).

**Server requirement:** export `ATHYPER_DATA_ROOT` before running, and run as `root`. The script aborts if it detects an `/opt/…` path without `ATHYPER_DATA_ROOT` set. When both conditions are met (root + `ATHYPER_DATA_ROOT=/opt/…`), the per-service ownership block runs automatically to set the correct UID on each data directory leaf.

### setup/data-dirs-reset

```
data-dirs-reset.sh
data-dirs-reset.bat
```

No parameters. Reads `ENVIRONMENT` from `.env`. Requires typing `YES` at the confirmation prompt. **Destructive** — deletes all contents of the data directory tree.

### setup/generate-certs

```
generate-certs.sh
generate-certs.bat
```

No parameters. Requires `mkcert` in `PATH`. Outputs to `stack/config/gateway/certs/`. SANs covered:
`*.athyper.local`, `neon.athyper.local`, `gateway.athyper.local`, `api.athyper.local`, `iam.athyper.local`, `objectstorage.athyper.local`

### setup/verify-port-hardening

```
verify-port-hardening.sh
verify-port-hardening.bat
```

No parameters. Scans all Compose YAML files for services that have both Traefik labels and a `ports:` block (which would bypass the ingress). Allowlisted service: `gateway`. Exit code `0` = pass, `1` = violations found.

### stack-profile/up

```
up.sh [profile]
up.bat [profile]
```

| Parameter | Values | Default | Description |
|-----------|--------|---------|-------------|
| `profile` | any profile name \| `all` | `STACK_PROFILE` from `.env`, else `core` | Docker Compose profile to activate |

Behaviour:
- Auto-bootstraps `stack/env/.env` from a template (interactive) if the file does not exist
- Runs `validate-env` before starting (skippable via `SKIP_ENV_VALIDATION=1`)
- `all` activates every profile in the `ALL_COMPOSE_PROFILES` list

### stack-profile/down

```
down.sh [profile | all | clean]
down.bat [profile | all | clean]
```

| Argument | Behaviour (identical on `.sh` and `.bat`) |
|----------|-----------------------------------------|
| _(none)_ | **Stops ALL services** — no profile filter (same as `all`) |
| `all` | Stops ALL services — no profile filter |
| `clean` | Stops ALL services + removes all Docker volumes |
| profile name | Stops only services in that profile (e.g. `core`, `telemetry`) |

### stack-profile/logs

```
logs.sh [-f | --follow] [--tail N | -n N] [service-name] [extra-args...]
logs.bat [-f | --follow] [--tail N | -n N] [service-name] [extra-args...]
```

| Flag | Description |
|------|-------------|
| `-f` / `--follow` | Stream logs in follow mode (tail -f style) |
| `--tail N` / `-n N` | Show only the last N lines |
| `service-name` | Limit output to a single service (e.g. `gateway`, `iam`) |

All profiles are active for logs so every running container is reachable by service name regardless of which profile was used to start it.

### stack-profile/restart

```
restart.sh [--timeout N | -t N] [service-name...] | all
restart.bat [--timeout N | -t N] [service-name...] | all
```

| Flag / Argument | Description |
|----------------|-------------|
| `--timeout N` / `-t N` | Stop timeout in seconds before forceful kill (default: 10) |
| `service-name` | One or more service names to restart (omit to restart all) |
| `all` | Explicit: restart all running services |

All profiles are active so every running service is reachable.

### stack-service/start

```
start.sh <alias|container-name> [alias|container-name...]
start.bat <alias|container-name> [alias|container-name...]
```

At least one alias or raw container name is required. Multiple targets are started in sequence. See the [Container Aliases](#container-aliases-stack-service) table above.

### stack-service/stop

```
stop.sh [--time N | -t N] <alias|container-name> [alias|container-name...]
stop.bat [--time N | -t N] <alias|container-name> [alias|container-name...]
```

| Flag | Description |
|------|-------------|
| `--time N` / `-t N` | Graceful stop timeout in seconds (must appear before container names) |

### stack-service/restart

```
restart.sh [--time N | -t N] <alias|container-name> [alias|container-name...]
restart.bat [--time N | -t N] <alias|container-name> [alias|container-name...]
```

Same flags as `stack-service/stop`. Multiple containers are restarted in sequence.

### docker/start

```
docker/start.sh
docker\start.bat
```

No parameters.
- **macOS**: opens Docker Desktop via `open -a Docker`; polls `docker version` for up to 120 seconds
- **Linux**: runs `systemctl start docker`
- **Windows**: starts `Docker Desktop.exe`; polls 120 seconds. Checks the system-wide install path first (`C:\Program Files\Docker\Docker\`), then falls back to the user-scoped path (`%LOCALAPPDATA%\Programs\Docker\Docker\`) if not found there

### docker/stop

```
docker/stop.sh
docker\stop.bat
```

No parameters.
- **macOS**: `osascript -e 'quit app "Docker"'`
- **Linux**: `systemctl stop docker`
- **Windows**: `DockerCli.exe -Shutdown`; falls back to `taskkill /IM "Docker Desktop.exe" /T`. Checks the system-wide install path first, then the user-scoped path (same two-location logic as `start.bat`)

### docker/restart

```
docker/restart.sh
docker\restart.bat
```

No parameters. Stops Docker, waits for it to fully exit, then starts it again.

- **macOS**: stop via `osascript`; polls exit at 2s intervals (30×2s = 60s max); start via `open -a Docker`; polls ready at 3s intervals (40×3s = 120s max)
- **Linux**: single `sudo systemctl restart docker` (no separate polling)
- **Windows**: stop via `DockerCli.exe -Shutdown` (fallback: `taskkill`); polls exit at 2s intervals (30×2s = 60s max); start `Docker Desktop.exe`; polls ready at 3s intervals (40×3s = 120s max). Checks the system-wide install path first (`C:\Program Files\Docker\Docker\`), then the user-scoped path (`%LOCALAPPDATA%\Programs\Docker\Docker\`)

### app/api-up

```
api-up.sh [mode]
api-up.bat [mode]
```

| Argument | local (pnpm) | staging / production |
|----------|-------------|---------------------|
| _(none)_ | `pnpm dev` — standard API server | `docker compose up -d --no-deps athyper-api` |
| `worker` | `pnpm dev:worker` — BullMQ worker | same compose up |
| `scheduler` | `pnpm dev:scheduler` — job scheduler | same compose up |

### app/api-down

```
api-down.sh
api-down.bat
```

No parameters.
- **local**: prints guidance (tsx watch handles hot-reload; use Ctrl+C in the terminal running `api-up`)
- **staging/production**: `docker compose stop athyper-api`

### app/api-restart

```
api-restart.sh
api-restart.bat
```

No parameters.
- **local**: prints guidance (tsx watch restarts on file changes automatically)
- **staging/production**: restarts `athyper-api` through the shared compose/env-file chain; prints `docker compose ps` after

### app/web-up

```
web-up.sh
web-up.bat
```

No parameters.
- **local**: `pnpm --filter @athyper/web dev` — Next.js dev server with HMR
- **staging/production**: `docker compose up -d --no-deps athyper-neon-web`

### app/web-down

```
web-down.sh
web-down.bat
```

No parameters.
- **local**: prints guidance
- **staging/production**: `docker compose stop athyper-neon-web`

### app/web-restart

```
web-restart.sh
web-restart.bat
```

No parameters.
- **local**: prints guidance (HMR handles hot reload automatically)
- **staging/production**: restarts `athyper-neon-web` through the shared compose/env-file chain

### db/transaction/neon/seed-db

```
seed-db.sh [flags...]
seed-db.bat [flags...]
```

| Flag | Description |
|------|-------------|
| _(none)_ or `--all` | Full provision: DDL + platform seed + blueprint/tenant data (same result) |
| `--ddl-only` | Phase/Stage 1 only — DDL migrations; no seed data |
| `--system-only` | Phases/Stages 1+2 — DDL plus platform seed (`010_platform/`) |
| `--no-demo` | Phase/Stage 1+2 only — DDL + platform seed; skips blueprint/tenant phases |
| `--demo-only` | All phases with checksum tracking; explicit alias for the default |
| `--reset` | **Destructive**: drop all schemas + re-provision all phases from scratch |
| `--reset --ddl-only` | **Destructive**: drop all schemas + DDL only (no seed data) |
| `--reset --no-demo` | **Destructive**: drop all schemas + Phase 1+2 only |
| `--drop-only` | **Destructive**: drop all schemas only (no re-seed) |
| `--status` | Read-only report — shows OK / PENDING / CHANGED per file, no DB changes |
| `--force` | Re-run all phases even if checksum unchanged |
| `--phase=N` (`.sh`) / `--stage=N` (`.bat`) | Run only phase N (1 = DDL, 2 = platform seed, 3 = blueprint/tenant) |
| `--industry-pack=pack_transport` | Opt in a `030_industry/100_industry_packs` seed; repeatable, numeric prefix optional, invalid names fail fast |
| `--tenant-id=UUID` | Set `app.seed_tenant_id` for Phase 3; overrides `SEED_TENANT_ID` env var. Required when seeding a new client tenant; omit to use the baked-in UUID (demo tenant). |

Seed phases:
1. **DDL** — all dirs under `server/db/sql/` except `900_seed_data/`
2. **Platform data** — `server/db/sql/900_seed_data/010_platform/`
3. **Blueprint + Tenant data**:
   - `900_seed_data/020_universal/` — TIER 1 foundation + TIER 2a COA
   - `900_seed_data/030_industry/` — TIER 2b industry packs + TIER 3 modules
   - `900_seed_data/040_tenants/{client}/` — per-client tenant instance files

Requires `DATABASE_ADMIN_URL` (direct Postgres; **not** PgBouncer) set in `stack/env/.env` or `server/.env`. Docker-internal hostnames (`@db:`, `@dbpool-apps:`, `@dbpool-session:`) are rewritten to `localhost` automatically.

### db/session/iam/seed-iam-credentials

```
seed-iam-credentials.sh
seed-iam-credentials.bat
```

No parameters. Reads:
- `IAM_DEMO_USER_PASSWORD` — password for all 17 athyper realm users (default: `Demo@1234`)
- `IAM_PLATFORM_CONTROL_USER_PASSWORD` / `IAM_ADMIN_PASSWORD` — password for 3 platform-control users (default: `admin`)

Idempotent: safe to re-run at any time. Uses `kcadm.sh` inside the running IAM container.

### db/session/iam/reset-iam

```
reset-iam.sh
reset-iam.bat
```

No parameters. **Destructive** — 10-second countdown before execution.

Steps `[0/5]`–`[5/5]`:

| Step | Action |
|------|--------|
| `[0/5]` | Regenerates `realm-demosetup.json` via `update-realm-demosetup.cjs` |
| `[1/5]` | Stops the Keycloak container |
| `[2/5]` | Wipes the IAM database (`DROP SCHEMA public CASCADE; CREATE SCHEMA public`) |
| `[3/5]` | Starts Keycloak fresh — initializes schema, creates master realm + bootstrap admin, auto-imports realm files from `/opt/keycloak/data/import/`; polls healthy status (up to ~105 seconds) |
| `[4/5]` | Seeds demo user passwords via `seed-iam-credentials` (skipped if KC not yet healthy) |
| `[5/5]` | Done — prints verify command and Keycloak Admin Console URL |

Requires: running `db` and `dbpool-session` containers; `DOCKER_CONTAINER_IAM` set or `COMPOSE_PROJECT_NAME` in `.env`.

### db/session/iam/import-iam

```
import-iam.sh
import-iam.bat
```

No parameters. Imports `stack/config/iam/realm-demosetup.json` (and `realm-platform-control.json` if present) into Keycloak via `kc import --override true`.

Steps `.sh` [1/5]–[5/5] / `.bat` [1/6]–[6/6]:

| `.sh` step | `.bat` step | Action |
|-----------|------------|--------|
| — | `[1/6]` | Copy realm file(s) to temp directory (`%TEMP%\keycloak-import-*`) — Windows CMD requires a host-side copy for docker volume mounts; `.sh` mounts the file directly |
| `[1/5]` | `[2/6]` | Check database connection |
| `[2/5]` | `[3/6]` | Import athyper realm (5-second countdown to cancel) |
| `[2b/5]` | `[3b/6]` | Import platform-control realm (if `realm-platform-control.json` exists; `.bat` uses a separate temp dir) |
| `[3/5]` | `[4/6]` | Clean up (`.sh`: import complete marker; `.bat`: remove temp directory) |
| `[4/5]` | `[5/6]` | Restart Keycloak container; wait for healthy status (`.sh`: 30 attempts × 2s = 60s max; `.bat`: 60 attempts × 3s = 180s max — Docker Desktop on Windows restarts containers more slowly than the Linux/macOS daemon) |
| `[5/5]` | `[6/6]` | Run `provision-keycloak-users.mjs` to seed passwords |

Requires: running `dbpool-session` container; `KEYCLOAK_IMAGE_TAG` in `.env`.

### db/session/iam/export-iam

```
export-iam.sh
export-iam.bat
```

No parameters. Exports both realms via a temporary `docker run` container connected to the IAM database.

Steps `.sh` [1/4]–[4/4] / `.bat` [1/5]–[5/5]:

| Step | `.sh` | `.bat` |
|------|-------|--------|
| 1 | Create temp export dir (`stack/.tmp/`) | Create temp export dir (`%TEMP%`) |
| 2 | Export athyper realm | Export athyper realm |
| 3 | Export platform-control realm | Export platform-control realm |
| 4 | Move exports → `stack/config/iam/`; cleanup | Move exports → `stack\config\iam\` |
| 5 | _(merged into step 4)_ | Cleanup temp dir |

Platform-control export produces a warning (not an error) if the realm is not yet provisioned.

Requires: running IAM container; `KEYCLOAK_IMAGE_TAG` in `.env`.

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `ENVIRONMENT` | Yes | `local` / `staging` / `production` |
| `COMPOSE_PROJECT_NAME` | Yes | Docker project name prefix (e.g. `athyper-stack`) |
| `STACK_PROFILE` | No | Default compose profile (default: `core`) |
| `DATABASE_URL` | Yes | App DB connection string (Docker-internal hostname) |
| `DATABASE_ADMIN_URL` | No | Admin DB URL for seeding (falls back to `DB_ADMIN_*` vars) |
| `REDIS_URL` | Yes | Redis connection string |
| `PUBLIC_BASE_URL` | Yes | External base URL (e.g. `https://api.athyper.local`) |
| `PUBLIC_WEB_URL` | Yes | External web URL (e.g. `https://neon.athyper.local`) |
| `IAM_ISSUER_URL` | Yes | Keycloak issuer URL |
| `IAM_ADMIN` | Yes | Keycloak bootstrap admin username |
| `IAM_ADMIN_PASSWORD` | Yes | Keycloak bootstrap admin password |
| `IAM_DEMO_USER_PASSWORD` | No | Demo user password for athyper realm (default: `Demo@1234`) |
| `IAM_PLATFORM_CONTROL_USER_PASSWORD` | No | Demo user password for platform-control realm (default: `admin`) |
| `KEYCLOAK_IMAGE_TAG` | Yes | Keycloak Docker image tag (used by import/export scripts) |
| `ATHYPER_DATA` | Yes | Absolute path to data volume root (e.g. `/path/to/stack/data`) |
| `ATHYPER_KERNEL_CONFIG_PATH` | Yes | Relative path to kernel config JSON under `stack/config/` |
| `SEED_TENANT_ID` | No | UUID of target tenant for Phase 3 provisioning (overridden by `--tenant-id=UUID`) |
| `CREDENTIAL_MASTER_KEY` | Prod | Encryption key (≥32 chars, base64) for credential storage |
| `SKIP_ENV_VALIDATION` | No | Set to `1` to bypass validate-env in `up` (not recommended) |

See the env templates in `stack/env/` for the full list with defaults:
- `.env.example` — local development
- `staging.env.example` — staging
- `production.env.example` — production

---

## Customising Container Names

All scripts read container and database names from environment variables before using defaults. Override them if your `COMPOSE_PROJECT_NAME` differs from `athyper-stack`:

| Variable | Default |
|----------|---------|
| `DOCKER_CONTAINER_IAM` | `athyper-stack-iam-1` |
| `DOCKER_CONTAINER_DB` | `athyper-stack-db-1` |
| `DOCKER_CONTAINER_DBPOOL_SESSION` | `athyper-stack-dbpool-session-1` |
| `DOCKER_CONTAINER_DBPOOL_APPS` | `athyper-stack-dbpool-apps-1` |
| `DOCKER_CONTAINER_GATEWAY` | `athyper-stack-gateway-1` |
| `DOCKER_CONTAINER_REDIS` | `athyper-stack-memorycache-1` |
| `DOCKER_CONTAINER_MINIO` | `athyper-stack-objectstorage-1` |
| `DOCKER_CONTAINER_MAIL` | `athyper-stack-mailhog-1` |
| `DOCKER_CONTAINER_WEB` | `athyper-stack-athyper-neon-web-1` |
| `DOCKER_CONTAINER_API` | `athyper-stack-athyper-api-1` |
| `DOCKER_CONTAINER_SEARCH` | `athyper-stack-meilisearch-1` |
| `DB_NAME_AUTH` | `athyper_iam` |
| `DB_NAME_APPS` | `athyper_dev1` |
| `DOCKER_NETWORK` | `athyper-internal` |

These are centralised in `lib/constants.sh` (Bash) and replicated at the top of each `.bat` file.

---

## Resetting to a Clean Slate

To completely wipe local state and start fresh:

```bash
# Git Bash / WSL
bash stack/scripts/stack-profile/down.sh clean
bash stack/scripts/setup/data-dirs-reset.sh
bash stack/scripts/setup/data-dirs-create.sh
bash stack/scripts/stack-profile/up.sh
bash stack/scripts/db/transaction/neon/seed-db.sh
bash stack/scripts/db/session/iam/reset-iam.sh
```

```bat
:: Command Prompt / PowerShell
stack\scripts\stack-profile\down.bat clean
stack\scripts\setup\data-dirs-reset.bat
stack\scripts\setup\data-dirs-create.bat
stack\scripts\stack-profile\up.bat
stack\scripts\db\transaction\neon\seed-db.bat
stack\scripts\db\session\iam\reset-iam.bat
```

---

## Troubleshooting

### validate-env reports errors

Fix every `FAIL` line in the output before running `up`. Common causes:

- Empty `TODO` placeholders in `.env` that were not filled in
- `athyperadmin` password still present in a non-local `.env`
- Hostname mismatch between `.env` and the kernel config JSON

### Keycloak not healthy after reset-iam

```bash
docker logs athyper-stack-iam-1 --tail=50
```

Common causes: port 8080 already in use, DB not reachable, or import JSON has invalid syntax. Validate with `jq empty stack/config/iam/realm-demosetup.json`.

**KC reset approach**: always wipe the DB then `docker start` KC. Never run `kc import` first — the bootstrap admin is only created when KC starts against a clean DB.

### seed-db fails with "npx not found"

Install Node.js 18+ from https://nodejs.org. The script calls `npx tsx db/seed/migrate.ts` inside the `server/` package.

### Docker Compose "file not found" errors

Run `validate-env` first — a missing `ENVIRONMENT` or wrong `ATHYPER_CONFIG` / `ATHYPER_DATA` path causes compose file list construction to fail silently.

### Docker engine not starting (docker/)

- **macOS**: `docker/start.sh` opens Docker Desktop and polls up to 120 seconds. If it times out, open Docker Desktop manually and check for disk-space or license prompts.
- **Linux**: requires `sudo`; confirm `docker` group membership or run with appropriate privileges.
- **Windows**: use `docker/start.bat` — it checks both the system-wide (`C:\Program Files\Docker\Docker\`) and user-scoped (`%LOCALAPPDATA%\Programs\Docker\Docker\`) install paths, then polls `docker version` for up to 120 seconds. If it times out, open Docker Desktop manually and check for disk-space or license prompts.

### Windows: bash script permission denied

In Git Bash, run `chmod +x stack/scripts/**/*.sh` once after cloning. Or use the `.bat` equivalents instead — they require no special permissions.

### MSYS path mangling in Docker volume mounts

All `.sh` scripts that pass paths to `docker run`/`docker exec` already export `MSYS_NO_PATHCONV=1`. If you hit mangled paths running scripts directly, prefix with:
```bash
MSYS_NO_PATHCONV=1 bash stack/scripts/db/session/iam/reset-iam.sh
```
The `.bat` scripts are not affected by MSYS path mangling.

---

## Script Quick Reference

| Script (`.sh` / `.bat`) | Parameters / Flags | What it does | Destructive? |
|-------------------------|--------------------|-------------|:---:|
| `setup/setup-env` | `[env] [target]` — env: local\|staging\|prod; target: all\|stack\|runtime\|server\|apps | Copy env template → component `.env` files (backs up existing) | No |
| `setup/setup-config` | `[env]` — local\|staging\|production | Copy kernel config template → `stack/config/apps/` (backs up existing) | No |
| `setup/validate-env` | `[env-file-path]` | Pre-flight validation of `.env`; exit 0=pass, 1=fatal, 2=warn | No |
| `setup/data-dirs-create` | _(none)_ | Create volume folders under `ATHYPER_DATA` (idempotent) | No |
| `setup/data-dirs-reset` | _(none)_ — requires `YES` confirmation | Delete and recreate `ATHYPER_DATA` tree | **Yes** |
| `setup/generate-certs` | _(none)_ — requires `mkcert` | Generate local TLS certs for all `*.athyper.local` SANs | No |
| `setup/verify-port-hardening` | _(none)_ | Assert no service bypasses Traefik ingress (CI); exit 0=pass, 1=violation | No |
| `stack-profile/up` | `[profile]` | Start Docker Compose stack (profile-aware, validates .env, auto-bootstraps .env) | No |
| `stack-profile/down` | `[profile \| all \| clean]` — no-arg = ALL services (both platforms) | Stop Docker Compose stack | No |
| `stack-profile/down clean` | `clean` | Stop + delete all Docker volumes | **Yes** |
| `stack-profile/restart` | `[--timeout N] [service-name...] \| all` | Restart all (or named) running services (all profiles active) | No |
| `stack-profile/logs` | `[-f] [--tail N] [service-name]` | Stream container logs (all profiles active) | No |
| `stack-service/start` | `<alias\|name> [...]` | Start one or more containers by alias | No |
| `stack-service/stop` | `[--time N] <alias\|name> [...]` | Stop one or more containers by alias | No |
| `stack-service/restart` | `[--time N] <alias\|name> [...]` | Restart one or more containers by alias | No |
| `docker/start` | _(none)_ | Start the Docker engine / Desktop; polls 120s | No |
| `docker/stop` | _(none)_ | Stop the Docker engine / Desktop | No |
| `docker/restart` | _(none)_ | Restart the Docker engine / Desktop | No |
| `app/api-up` | `[mode]` — blank\|worker\|scheduler | Start backend API (local: pnpm dev; staging/prod: compose up) | No |
| `app/api-down` | _(none)_ | Stop backend API | No |
| `app/api-restart` | _(none)_ | Restart backend API | No |
| `app/web-up` | _(none)_ | Start web frontend (local: pnpm dev; staging/prod: compose up) | No |
| `app/web-down` | _(none)_ | Stop web frontend | No |
| `app/web-restart` | _(none)_ | Restart web frontend | No |
| `db/transaction/neon/seed-db` | `[--all\|--ddl-only\|--system-only\|--no-demo\|--demo-only\|--reset\|--drop-only\|--status\|--force\|--phase=N (.sh) / --stage=N (.bat)\|--tenant-id=UUID]` | Run database provisioner (DDL + seed data) | Additive |
| `db/transaction/neon/seed-db --reset` | `--reset [--ddl-only\|--no-demo\|--force]` | Drop and re-provision all schemas | **Yes** |
| `db/transaction/neon/seed-db --drop-only` | `--drop-only` | Drop all schemas without re-seeding | **Yes** |
| `db/session/iam/seed-iam-credentials` | _(none)_ | Set demo user passwords in Keycloak (idempotent) | No |
| `db/session/iam/reset-iam` | _(none)_ — 10s countdown | Wipe IAM DB + reimport realm JSON + seed passwords [0/5]–[5/5] | **Yes** |
| `db/session/iam/import-iam` | _(none)_ | Import realm JSON into existing Keycloak (.sh: [1/5]–[5/5]; .bat: [1/6]–[6/6]) | Overwrites realms |
| `db/session/iam/export-iam` | _(none)_ | Export Keycloak realms to `stack/config/iam/` (.sh: [1/4]–[4/4]; .bat: [1/5]–[5/5]) | No |
