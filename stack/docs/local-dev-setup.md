# Local Developer Setup

Step-by-step guide for running the full athyper stack on a local machine.
Covers Windows (primary) and macOS/Linux where they differ.

---

## Prerequisites

Install everything in this table before running any script:

| Tool | Min version | Install |
|------|-------------|---------|
| Docker Desktop | 4.25+ | <https://docs.docker.com/get-docker/> |
| Node.js | 24 LTS | <https://nodejs.org> (use fnm or nvm for version management) |
| pnpm | 10+ | `npm i -g pnpm` |
| mkcert | any | `winget install FiloSottile.mkcert` / `brew install mkcert` |
| jq | 1.6+ | `winget install jqlang.jq` / `brew install jq` |
| Git | any | <https://git-scm.com> |
| Git Bash (Windows only) | any | Ships with Git for Windows — required to run `.sh` scripts |

> **Windows**: `.bat` scripts run natively in Command Prompt or PowerShell.
> Use Git Bash only if you prefer the `.sh` versions.

---

## Directory Layout — Two-Root Architecture

Athyper uses two separate root directories. **Never mix them.**

```
D:\Products\athyper\       ← Git checkout (source, compose defs, templates)
                              Read-mostly. git pull is safe here.

D:\Stack\athyper\          ← Runtime state (config, secrets, data, logs, backups)
  ├── config\              ← Populated by  setup-config.bat local
  ├── secrets\             ← Populated manually (.env file lives here in server mode)
  ├── data\                ← Populated by  data-dirs-create.bat
  ├── logs\
  └── backups\
```

The `D:\Stack\athyper\` prefix is the default in `.env.example`.
Adjust it in `stack/env/.env` if your layout differs (e.g. `C:\Stack\athyper\`).

> **Why two roots?** `git pull` on the products root can never touch runtime data.
> Docker Compose bind mounts point at `D:\Stack\athyper\` so container data
> survives a repo reset. See [`infrastructure-plan.md`](infrastructure-plan.md)
> for the full rationale.

---

## Step 0 — Hosts File

All local services use the `.athyper.local` domain. Add these entries to your hosts file.

**Windows:** `C:\Windows\System32\drivers\etc\hosts` (open as Administrator)  
**macOS/Linux:** `/etc/hosts`

```
# athyper local development
127.0.0.1  neon.athyper.local
127.0.0.1  api.athyper.local
127.0.0.1  gateway.athyper.local
127.0.0.1  iam.athyper.local
127.0.0.1  objectstorage.athyper.local
127.0.0.1  objectstorageui.athyper.local
127.0.0.1  pgweb.athyper.local
127.0.0.1  meilisearch.athyper.local
127.0.0.1  telemetry.athyper.local
127.0.0.1  metrics.athyper.local
127.0.0.1  traces.athyper.local
127.0.0.1  logs.athyper.local
127.0.0.1  uptime.athyper.local
127.0.0.1  healthchecks.athyper.local
127.0.0.1  errors.athyper.local
127.0.0.1  infisical.athyper.local
127.0.0.1  metabase.athyper.local
```

---

## Step 1 — Clone and Install

```bash
git clone git@github.com:atlasdigitaltech/athyper.git D:/Products/athyper
cd D:/Products/athyper
pnpm install
```

---

## Step 2 — Environment File

Copy the local env template to `stack/env/.env`:

```bat
# Windows
cd stack\scripts\setup
setup-env.bat local all
```

```bash
# macOS / Linux / Git Bash
cd stack/scripts/setup
./setup-env.sh local all
```

This copies **only** `stack/env/.env.example` → `stack/env/.env`.

Server and web env files are **not needed for local dev** — `api-up.bat` /
`api-up.sh` and `web-up.bat` / `web-up.sh` read `stack/env/.env` directly
and apply hostname translations in-process before starting each service.

**After copying, open `stack/env/.env` and review.** The defaults work out of
the box for a clean Windows dev machine at `D:\Stack\athyper\`.

---

## Step 3 — TLS Certificates

Traefik uses a self-signed cert for `*.athyper.local`. Generate and trust it once:

```bat
# Windows
stack\scripts\setup\generate-certs.bat
```

```bash
# macOS / Linux / Git Bash
./stack/scripts/setup/generate-certs.sh
```

This runs `mkcert -install` (adds the local CA to your system trust store) and
generates `athyper.tls.local.crt` / `athyper.tls.local.key` in
`stack/config/gateway/certs/`. After trusting the CA, browsers will show a
green lock on all `*.athyper.local` pages.

---

## Step 4 — Config Templates

Populate `D:\Stack\athyper\config\` from the repo templates:

```bat
stack\scripts\setup\setup-config.bat local
```

```bash
./stack/scripts/setup/setup-config.sh local
```

This copies DB configs, IAM realm JSON, Grafana provisioning, and Redis ACL
into the runtime config directory. Safe to re-run (skips existing files).

---

## Step 5 — Data Directories

Create the Docker volume mount points under `D:\Stack\athyper\data\`:

```bat
stack\scripts\setup\data-dirs-create.bat
```

```bash
./stack/scripts/setup/data-dirs-create.sh
```

---

## Step 6 — Bring Up the Core Stack

```bat
stack\scripts\stack-profile\up.bat core
```

```bash
./stack/scripts/stack-profile/up.sh core
```

The `core` profile starts: Postgres, PgBouncer (apps + session), Redis,
Traefik gateway, Keycloak IAM, Mailhog, MinIO object storage, and ClamAV.

Wait for all containers to show **healthy** before proceeding:

```bat
docker ps --format "table {{.Names}}\t{{.Status}}"
```

Keycloak takes the longest (~60 s on first boot while it initialises the DB).

---

## Step 7 — Seed the Application Database

The seed script runs on the host (not inside Docker) and connects directly to
Postgres on `localhost:5432`. It reads `DATABASE_ADMIN_URL` from `stack/env/.env`.

```bat
stack\scripts\db\transaction\neon\seed-db.bat --all
```

```bash
./stack/scripts/db/transaction/neon/seed-db.sh --all
```

Phases:
1. **DDL** — schemas, tables, indexes, triggers, RLS policies
2. **Platform seed** — enums, permissions, canonical config
3. **Demo data** — demo tenant, users, orgs, sample documents

To seed DDL + platform only (no demo data):

```bash
./stack/scripts/db/transaction/neon/seed-db.sh --no-demo
```

---

## Step 8 — Reset Keycloak IAM

Wipe and reimport the KC database from the committed realm JSON files:

```bash
# Git Bash or macOS/Linux
./stack/scripts/db/session/iam/reset-iam.sh
```

```bat
REM Windows
stack\scripts\db\session\iam\reset-iam.bat
```

This:
1. Regenerates `realm-demosetup.json` from `tools/scripts/update-realm-demosetup.cjs`
2. Drops and recreates the KC schema
3. Starts Keycloak (it bootstraps master realm + imports both realm files)
4. Seeds demo user passwords via `kcadm.sh`

After completion, the demo admin login is: **admin / athyperadmin**
(Keycloak Admin Console: <https://iam.athyper.local>)

---

## Step 9 — Start the Backend Server

In local dev the API runs on the **host**, not in Docker. Traefik proxies
`api.athyper.local` → `host.docker.internal:4000`.

```bat
stack\scripts\app\api-up.bat
```

```bash
./stack/scripts/app/api-up.sh
```

This runs `pnpm --filter @athyper/runtime-server dev` which starts the server
on port **4000**. Leave this terminal open.

---

## Step 10 — Start the Web App

In a second terminal:

```bat
stack\scripts\app\web-up.bat
```

```bash
./stack/scripts/app/web-up.sh
```

This runs `pnpm --filter @athyper/neon-web dev` which starts Next.js on port
**3000**. Traefik proxies `neon.athyper.local` → `host.docker.internal:3000`.

Open <https://neon.athyper.local> in your browser.

---

## Day-to-Day Commands

| Action | Windows | Linux / macOS |
|--------|---------|---------------|
| Start stack | `up.bat core` | `up.sh core` |
| Stop stack | `down.bat` | `down.sh` |
| View logs | `logs.bat gateway` | `logs.sh gateway` |
| Restart a container | `stack-service\restart.bat iam` | `stack-service/restart.sh iam` |
| Start backend | `app\api-up.bat` | `app/api-up.sh` |
| Start web | `app\web-up.bat` | `app/web-up.sh` |
| Seed DB | `seed-db.bat --all` | `seed-db.sh --all` |
| Reset IAM | `reset-iam.bat` | `reset-iam.sh` |
| Validate env | `validate-env.bat` | `validate-env.sh` |

All scripts live under `stack/scripts/`. See [`../scripts/README.md`](../scripts/README.md)
for the full reference.

---

## Common Profiles

The stack uses Docker Compose profiles. Start exactly what you need:

| Profile | What it adds |
|---------|-------------|
| `core` | Postgres, PgBouncer, Redis, Traefik, Keycloak, MinIO, Mailhog, ClamAV |
| `telemetry` | Grafana, Prometheus, Loki, Tempo, Alloy log shipper |
| `monitoring` | Uptime Kuma, Healthchecks.io, GlitchTip error tracker |
| `search` | Meilisearch |
| `analytics` | Metabase (requires governance approval — see compose/analytics/README.md) |
| `admin` | BullBoard (job queue UI), pgweb (DB browser) |
| `security-infisical` | Infisical secret manager (opt-in) |
| `memorycache-jobs` | Isolated Redis for BullMQ (opt-in) |
| `all` | Every profile at once |

```bat
up.bat core,telemetry,search
```

---

## Critical Gotchas

### 1. `RUNTIME_API_URL` must be `http://localhost:4000`

The startup scripts (`api-up.bat` / `web-up.bat`) hard-code
`RUNTIME_API_URL=http://localhost:4000` — do not override this with the
Traefik gateway URL.

The web app's BFF routes (session, stream, relay) call the backend directly from
the Next.js server process (which runs on the host, not inside Docker). Traefik's
`api.athyper.local` entry point routes through the Docker network, which 404s on
host-to-host calls. The direct localhost port bypasses Traefik entirely.

### 2. Next.js Cross-Origin API Calls

Next.js 16+ blocks cross-origin `/api/` calls from non-localhost origins by
default. If your browser is hitting `neon.athyper.local` and calling `/api/`,
add the gateway host to `allowedDevOrigins` in `apps/web/next.config.mjs`:

```js
allowedDevOrigins: ['neon.athyper.local'],
```

Without this, Next.js returns 400 on API routes called from the gateway domain.

### 3. Entity URL Slugs Use Underscores

Entity paths in `/app/[entity]/` use `_` (underscores), not `-` (hyphens).
This matches the database table naming convention — `formatTitle` splits on `_`.

```
/app/purchase_invoice    ✓ correct
/app/purchase-invoice    ✗ breaks entity routing and INLINE_SEARCH_ENTITY_MAP
```

### 4. Session Cookie Name

The backend sets the cookie `neon_sid`. Middleware in `apps/web` reads
`neon_sid`. The `@athyper/auth` package uses a different internal name —
do not rely on it for cookie inspection.

### 5. Self-Signed TLS Certificate

After running `generate-certs.sh`, restart your browser completely to pick up
the new local CA trust. Chrome requires a full quit-and-relaunch, not just a
tab close.

---

## Resetting from Scratch

To start completely fresh (wipe all local data):

```bat
REM 1. Stop everything
stack\scripts\stack-profile\down.bat clean

REM 2. Wipe and recreate data dirs
stack\scripts\setup\data-dirs-reset.bat

REM 3. Bring up stack again
stack\scripts\stack-profile\up.bat core

REM 4. Reseed DB
stack\scripts\db\transaction\neon\seed-db.bat --all

REM 5. Reset IAM
stack\scripts\db\session\iam\reset-iam.bat
```

`down.bat clean` removes named Docker volumes (Postgres data, Redis data, MinIO
objects). The `data-dirs-reset.bat` wipes the bind-mounted paths under
`D:\Stack\athyper\data\`.

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| [`infrastructure-plan.md`](infrastructure-plan.md) | Two-root architecture, permission model, server deployment |
| [`secrets-management.md`](secrets-management.md) | How secrets flow across environments |
| [`staging-deploy-runbook.md`](staging-deploy-runbook.md) | Phase-by-phase staging deployment guide |
| [`../scripts/README.md`](../scripts/README.md) | Full script reference |
