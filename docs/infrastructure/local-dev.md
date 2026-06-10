# Local Development Setup

This guide covers setting up the Athyper development environment on a local machine (Windows 11, macOS, or Linux). The local stack uses a "host-for-web, container-for-infra" model (Option B): Next.js apps and the API run on the host for fast HMR, while all infrastructure (database, cache, IAM, etc.) runs in Docker.

---

## Prerequisites

### Required Tools

| Tool | Version | Install |
|---|---|---|
| Node.js | 22.x LTS | https://nodejs.org or `nvm install 22` |
| pnpm | 9.x | `npm install -g pnpm@9` |
| Docker Desktop | 4.x+ | https://www.docker.com/products/docker-desktop |
| Git | 2.x | Pre-installed on most systems |
| PowerShell | 5.1+ (Win) / pwsh 7+ (cross-platform) | Pre-installed on Windows |

### Windows-Specific

- Enable WSL2 backend in Docker Desktop settings.
- Add the following to your `C:\Windows\System32\drivers\etc\hosts` file (run Notepad as Administrator):

```
127.0.0.1  neon.athyper.local
127.0.0.1  mesh.athyper.local
127.0.0.1  admin.athyper.local
127.0.0.1  api.athyper.local
127.0.0.1  iam.athyper.local
127.0.0.1  objectstorage.athyper.local
127.0.0.1  objectstorage.console.athyper.local
127.0.0.1  metrics.athyper.local
127.0.0.1  logs.athyper.local
127.0.0.1  traces.athyper.local
127.0.0.1  errors.athyper.local
127.0.0.1  telemetry.athyper.local
127.0.0.1  mail.athyper.local
```

---

## Repository Setup

```powershell
# Clone the repo
git clone https://github.com/atlasdigitaltech/athyper.git
cd athyper

# Install all workspace dependencies
pnpm install
```

---

## Stack Folder Setup

The Docker stack requires a separate runtime data directory outside the repo. This is a one-time setup.

```powershell
# Create runtime directory (NOT inside the repo)
New-Item -ItemType Directory -Path "D:\Stack\athyper" -Force

# Run the setup config script to provision config files from stack/ → D:\Stack\athyper\
.\stack\scripts\setup\setup-config.ps1

# Verify port hardening config
.\stack\scripts\setup\verify-port-hardening.sh
```

After running `setup-config.ps1`, you will have:
```
D:\Stack\athyper\
├── compose/         # Symlinked / copied compose files
├── config/          # Populated config files (Traefik, PgBouncer, Redis ACL, etc.)
├── data/            # Docker volume mount points (created empty)
└── .env             # Environment file (copy from .env.example and fill in)
```

---

## Environment Variables

Copy the environment template and fill in required values:

```powershell
Copy-Item "stack\.env.example" "D:\Stack\athyper\.env"
# Edit the file:
notepad "D:\Stack\athyper\.env"
```

### Critical Variables

```env
# Database
POSTGRES_PASSWORD=<strong-password>
PGBOUNCER_AUTH_FILE=...

# Keycloak
KC_BOOTSTRAP_ADMIN_PASSWORD=<strong-password>
KC_TAG=25.0.4

# Redis
REDIS_PASSWORD=<strong-password>

# MinIO
MINIO_ROOT_USER=athyper
MINIO_ROOT_PASSWORD=<strong-password>

# Application
NEXTAUTH_SECRET=<random-32-bytes>
RUNTIME_API_URL=http://localhost:4000     # IMPORTANT: use localhost:4000 for host API, NOT https://api.athyper.local

# Session
SESSION_SECRET=<random-32-bytes>
NEON_SESSION_COOKIE=neon_sid
MESH_SESSION_COOKIE=mesh_sid
ADMIN_SESSION_COOKIE=admin_sid

# Keycloak clients (filled after KC setup)
KC_NEON_CLIENT_SECRET=
KC_MESH_CLIENT_SECRET=
KC_ADMIN_CLIENT_SECRET=

# Credential encryption (for notification provider creds in DB)
CREDENTIAL_MASTER_KEY=<random-32-bytes-base64>

# VAPID Web Push — generate once with: pnpm dlx web-push generate-vapid-keys
# All three must be set together, or all three must be absent.
VAPID_SUBJECT=mailto:dev@atlasdigitaltech.com
VAPID_PUBLIC_KEY=<publicKey from output>
VAPID_PRIVATE_KEY=<privateKey from output>
```

**Important:** `RUNTIME_API_URL` must be `http://localhost:4000` when the API runs on the host. Using `https://api.athyper.local` routes through Traefik, which cannot reach the host process, causing 404s on session/stream/relay BFF routes.

---

## Starting the Infrastructure Stack

```powershell
cd "D:\Stack\athyper"

# Minimum viable (database + cache + IAM + gateway + storage)
docker compose up -d

# With observability
docker compose --profile core up -d

# With everything for active development
docker compose `
  --profile core `
  --profile monitoring `
  --profile search `
  --profile render `
  --profile admin `
  up -d

# Check all services are healthy
docker compose ps
```

**First-run notes:**
- ClamAV takes ~2 minutes to start (downloads signature DB ~500MB)
- Keycloak takes ~60 seconds on first start (initialises DB)
- MinIO bucket init runs once and exits; that's normal

---

## Database Initialisation

Run this once after first stack start (or after a full data wipe):

```powershell
# Creates all 7 databases and applies schema
pnpm --filter @athyper/server db:init

# Seeds platform data (entity registry, lifecycles, workflows, policies, etc.)
pnpm --filter @athyper/server db:seed
```

---

## Keycloak Setup

After Keycloak is running and the DB is initialised:

```powershell
# Import realm definitions (athyper + platform-control realms)
pnpm --filter @athyper/server kc:import

# Create initial tenant + admin user (interactive prompt)
pnpm --filter @athyper/server kc:bootstrap
```

Then update `.env` (or `apps/neon/.env.local`) with the client secrets generated during realm import.

**IMPORTANT: KC Reset Procedure**
If Keycloak is in a broken state, do NOT run `kc:import` on a dirty DB. The correct procedure is:
1. Stop Keycloak: `docker compose stop iam`
2. Wipe the IAM database: `docker exec db psql -U postgres -c "DROP DATABASE athyper_iam; CREATE DATABASE athyper_iam;"`
3. Start Keycloak on a clean DB: `docker compose start iam`
4. Wait for KC to fully start (it creates `bootstrap-admin` only on clean DB)
5. Run `pnpm --filter @athyper/server kc:import`

---

## Running the Applications

Open separate terminals for each component:

### Terminal 1 — API Server

```powershell
cd D:\Products\athyper
pnpm --filter @athyper/server dev
# Starts on http://localhost:4000
```

### Terminal 2 — BullMQ Worker

```powershell
cd D:\Products\athyper
pnpm --filter @athyper/server worker
# Processes background jobs
```

### Terminal 3 — Neon Web App

```powershell
cd D:\Products\athyper
pnpm --filter neon dev
# Starts on http://localhost:3101 → accessible at https://neon.athyper.local
```

### Terminal 4 — Mesh Web App (if needed)

```powershell
pnpm --filter mesh dev
# Starts on http://localhost:3102 → https://mesh.athyper.local
```

### Terminal 5 — Admin Web App (if needed)

```powershell
pnpm --filter admin dev
# Starts on http://localhost:3103 → https://admin.athyper.local
```

Or run everything in parallel with Turborepo:

```powershell
pnpm dev
```

---

## Next.js Cross-Origin Dev Note

Next.js 16.x blocks cross-origin `/api/` requests from non-localhost origins by default. The Traefik hostname `neon.athyper.local` is a different origin from `localhost`. Each app's `next.config.mjs` must include:

```javascript
allowedDevOrigins: ["neon.athyper.local"]
```

Without this, all BFF route calls from the browser will be blocked in local dev.

---

## Useful Dev URLs

| URL | Service |
|---|---|
| https://neon.athyper.local | Neon tenant workbench |
| https://iam.athyper.local | Keycloak admin console |
| https://mail.athyper.local | Mailpit (captured emails) |
| https://objectstorage.console.athyper.local | MinIO console |
| https://errors.athyper.local | GlitchTip |
| https://telemetry.athyper.local | Grafana |
| https://metrics.athyper.local | Prometheus |
| http://localhost:4000/docs | OpenAPI spec / Swagger UI |
| http://localhost:3001 | Bull Board (queue console) |

---

## Common Development Commands

```powershell
# Run all tests
pnpm test

# Type check all packages
pnpm typecheck

# Lint
pnpm lint

# Build all packages
pnpm build

# Generate OpenAPI spec
pnpm --filter @athyper/server openapi:generate

# Run database migrations
pnpm --filter @athyper/server db:migrate

# Verify RLS policies
pnpm --filter @athyper/server verify:rls

# Verify field security coverage
pnpm --filter @athyper/server verify:field-security

# Verify SECURITY DEFINER functions
pnpm --filter @athyper/server verify:security-definer
```

---

## Turborepo Caching

Turborepo caches build outputs locally. If you see stale build artefacts:

```powershell
# Clear turbo cache
pnpm turbo run build --force

# Or delete cache directory
Remove-Item -Recurse -Force .turbo
```

---

## Package Workspace Structure

```
athyper/
├── apps/
│   ├── neon/         # Tenant workbench (Next.js)
│   ├── mesh/         # Partner portal (Next.js)
│   └── admin/        # Internal admin (Next.js)
├── server/
│   ├── src/          # Main entrypoint (api.ts, worker.ts, scheduler.ts)
│   ├── packages/
│   │   ├── adapters/      # Email, SMS, S3, search adapters
│   │   ├── foundation/    # OTel, logging, config
│   │   ├── runtime/       # Route registrations
│   │   └── services/      # Business logic
│   └── db/           # DDL, migrations, seeds
├── packages/
│   ├── ui/            # Design system components
│   ├── api-client/    # Typed API client
│   ├── auth-bff/      # BFF session helpers
│   └── ...            # (25+ shared packages)
└── stack/             # Docker compose + config (git source)
```

---

## Troubleshooting

### "Login loop / session not persisting"
Check `RUNTIME_API_URL`. It must be `http://localhost:4000` for host-based API dev. `https://api.athyper.local` routes through Traefik and fails to reach the host process.

### "BFF API calls 403 in browser"
Check `allowedDevOrigins` in `next.config.mjs`. Next.js 16 blocks cross-origin dev requests.

### "KC bootstrap admin not created"
Keycloak only creates the bootstrap admin when starting with a clean (empty) `athyper_iam` database. If the DB already has data, drop and recreate it before starting KC.

### "Redis ACL denied / NOPERM error"
Redis ACL deny rules (`-@dangerous`) must be listed BEFORE allow rules (`+get`, `+set`) in `users.acl`. Also verify the `REDIS_PASSWORD` matches between `.env` and the ACL file.

### "Seed fails with syntax error near BOM"
Seed SQL files must be saved as UTF-8 WITHOUT BOM. Check in VS Code: bottom-right corner shows encoding. Save as "UTF-8" (not "UTF-8 with BOM").

### "ClamAV not ready / scan timeout"
ClamAV takes ~2 minutes on first start (signature DB download). Check `docker compose logs virusscan`. The API retries virus scans with a 3-second backoff for up to 30 seconds.

### "Server config invalid — VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY required"

The API validates VAPID config on startup. If any one of the three `VAPID_*` variables is
present, all three must be set. Generate them with:

```powershell
pnpm dlx web-push generate-vapid-keys
```

Add the output to `server/.env` (or `stack/env/.env` if using the scripts):

```env
VAPID_SUBJECT=mailto:dev@atlasdigitaltech.com
VAPID_PUBLIC_KEY=<publicKey>
VAPID_PRIVATE_KEY=<privateKey>
```

If you don't need push notifications locally, remove all three `VAPID_*` lines entirely.

### "Zod validation errors in records API"
If you see `Expected record<string, ...> but got record(key, value)`, you're hitting the Zod 4 breaking change. Use `z.record(z.string(), valueSchema)` — never `z.record(singleArg)`.
