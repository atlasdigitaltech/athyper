# Staging Environment

This document covers the staging environment topology, deployment process, and key differences from local development.

---

## Overview

Staging mirrors production architecture: all three Next.js apps are containerised and deployed as Docker services. The staging environment runs on a dedicated VM/VPS with Docker Compose. Traefik handles TLS termination via Let's Encrypt.

**Key differences from local dev:**

| Aspect | Local Dev | Staging |
|---|---|---|
| Web apps | Run on HOST (pnpm dev) | Containerised (Docker services) |
| API | Runs on HOST (port 4000) | Containerised (Docker service) |
| TLS | Self-signed (local hostnames) | Let's Encrypt (real domain) |
| Email | Mailpit (captured) | Real SMTP provider |
| Secrets | `.env` files | Infisical or env secrets in compose |
| DNS | `/etc/hosts` overrides | Real DNS records |
| Traefik routing | File provider (local config) | File provider (staging config) |
| Next.js `allowedDevOrigins` | Required | Not needed (same-origin in prod build) |

---

## Staging Hostnames

| Hostname | Service |
|---|---|
| `neon.staging.athyper.com` | Neon tenant workbench |
| `mesh.staging.athyper.com` | Mesh partner portal |
| `admin.staging.athyper.com` | Admin plane |
| `api.staging.athyper.com` | API server |
| `iam.staging.athyper.com` | Keycloak |
| `objectstorage.staging.athyper.com` | MinIO S3 API |
| `objectstorage.console.staging.athyper.com` | MinIO console |
| `errors.staging.athyper.com` | GlitchTip |
| `telemetry.staging.athyper.com` | Grafana |
| `metrics.staging.athyper.com` | Prometheus |

---

## VM / VPS Requirements

| Resource | Minimum | Recommended |
|---|---|---|
| CPU | 4 vCPU | 8 vCPU |
| RAM | 8 GB | 16 GB |
| Disk | 80 GB SSD | 200 GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| Docker | 24.x+ | Latest stable |

**Open ports on firewall:**
- `80` (HTTP — for Let's Encrypt ACME challenge + redirect to HTTPS)
- `443` (HTTPS)
- `22` (SSH — restricted to known IPs)

All other ports (PostgreSQL, Redis, Keycloak internal) must be firewall-blocked at the host level. They are also only on `athyper-internal` Docker network and not published to the host.

---

## Deployment Architecture

```
Internet
    │
    ▼  port 443 (HTTPS, Let's Encrypt)
Traefik (gateway)
    │
    ├── neon.staging.athyper.com → neon-web:3000
    ├── mesh.staging.athyper.com → mesh-web:3000
    ├── admin.staging.athyper.com → admin-web:3000
    ├── api.staging.athyper.com → api:3000
    └── iam.staging.athyper.com → iam:8080
```

All three web apps (`neon-web`, `mesh-web`, `admin-web`) run from the parameterized `apps/Dockerfile`; Compose supplies the validated app name and package pair for each service.

The `athyper.override.staging.yml` file:
- Sets `restart: unless-stopped` on all services
- Enables Let's Encrypt ACME on Traefik
- Configures real SMTP provider (not Mailpit)
- Disables `dbconsole` (Adminer) — never run in staging
- Sets `NODE_ENV=production` on all app containers

---

## Initial Staging Setup

### 1. Provision the VM

On the staging VM:

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
usermod -aG docker $USER
newgrp docker

# Install Docker Compose plugin
apt install docker-compose-plugin

# Create stack directory
mkdir -p /opt/athyper/stack
mkdir -p /opt/athyper/data
```

### 2. Clone and Configure

```bash
# Clone the repo
git clone https://github.com/atlasdigitaltech/athyper.git /opt/athyper/src
cd /opt/athyper/src

# Run stack setup script targeting the staging data directory
STACK_DIR=/opt/athyper/stack ./stack/scripts/setup/setup-config.sh

# Copy staging env template and fill values
cp stack/.env.staging.example /opt/athyper/stack/.env
nano /opt/athyper/stack/.env
```

### 3. Staging Environment Variables

```env
# Domain
ATHYPER_DOMAIN=staging.athyper.com
TRAEFIK_ACME_EMAIL=ops@atlasdigitaltech.com

# Database
POSTGRES_PASSWORD=<strong-unique-password>

# Keycloak
KC_TAG=25.0.4
KC_BOOTSTRAP_ADMIN_PASSWORD=<strong-password>
KC_HOSTNAME=iam.staging.athyper.com

# Keycloak clients (generated after realm import)
KC_NEON_CLIENT_SECRET=
KC_MESH_CLIENT_SECRET=
KC_ADMIN_CLIENT_SECRET=

# Redis
REDIS_PASSWORD=<strong-password>

# MinIO
MINIO_ROOT_USER=athyper
MINIO_ROOT_PASSWORD=<strong-password>

# Application secrets
NEXTAUTH_SECRET=<random-64-hex>
SESSION_SECRET=<random-64-hex>
CREDENTIAL_MASTER_KEY=<random-32-bytes-base64>

# RUNTIME_API_URL — must point to the containerised API service
RUNTIME_API_URL=https://api.staging.athyper.com

# Email — real SMTP in staging
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=<sendgrid-api-key>
SMTP_FROM=no-reply@athyper.com

# Sentry / GlitchTip
NEXT_PUBLIC_SENTRY_DSN=https://...@errors.staging.athyper.com/1
SENTRY_DSN=https://...@errors.staging.athyper.com/1

# OpenTelemetry
OTEL_EXPORTER_OTLP_ENDPOINT=http://tracing:4317
OTEL_SERVICE_NAME=athyper-api-staging
```

### 4. Build and Start

```bash
cd /opt/athyper/stack

# Build app images (first deploy or after code changes)
docker compose \
  -f compose.yml \
  -f athyper.override.staging.yml \
  build neon-web mesh-web admin-web api worker scheduler

# Start all services
docker compose \
  -f compose.yml \
  -f athyper.override.staging.yml \
  --profile core \
  --profile monitoring \
  --profile search \
  --profile render \
  up -d

# Verify all healthy
docker compose ps
```

### 5. Database Initialisation (first deploy only)

```bash
# Run inside the api container
docker compose exec api pnpm db:init
docker compose exec api pnpm db:seed
```

### 6. Keycloak Realm Import (first deploy only)

```bash
docker compose exec api pnpm kc:import
# Copy generated client secrets to .env, then restart affected services
docker compose restart neon-web mesh-web admin-web api
```

---

## CI/CD Deployment

Deployments are triggered by GitHub Actions on push to the `main` branch.

**Workflow file:** `.github/workflows/ci.yml`

### Pipeline Steps

```
1. Lint + type-check
2. Run tests
3. Build Docker images (neon-web, mesh-web, admin-web, api)
4. Push images to container registry
5. SSH to staging VM
6. Pull new images
7. docker compose up -d --no-build (rolling restart)
8. Run db:migrate (non-destructive migrations only)
9. Health check: GET /health on api + all three web apps
```

### Rolling Restart (zero-downtime)

```bash
# On the staging VM (executed by CI)
docker compose pull
docker compose \
  -f compose.yml \
  -f athyper.override.staging.yml \
  up -d --no-build --remove-orphans
```

Traefik detects container restart and briefly serves 503 during the window (~5s per container). For true zero-downtime, a blue-green or canary setup would be required (not currently implemented).

---

## Traefik Staging Configuration

Traefik in staging uses the **file provider** to define routes (not Docker labels). This avoids exposing the Docker socket to the gateway in production.

**Route definitions:**
- `stack/config/gateway/environments/neon-workbench-routes.staging.yml`
- `stack/config/gateway/environments/neon-workbench-routes.prod.yml`

**Let's Encrypt ACME configuration:**
```yaml
# In athyper.override.staging.yml — Traefik section
command:
  - --certificatesresolvers.letsencrypt.acme.email=${TRAEFIK_ACME_EMAIL}
  - --certificatesresolvers.letsencrypt.acme.storage=/acme/acme.json
  - --certificatesresolvers.letsencrypt.acme.tlschallenge=true
```

Certificates are stored at `/opt/athyper/data/traefik/acme/acme.json` (volume-mounted). Do not delete this file — it contains the issued certificates.

---

## PgBouncer Sizing in Staging

**Problem fixed (April 2026):** The default PgBouncer `max_client_conn` was over-subscribed for a single-node staging VM where `max_connections = 100`.

**Current settings:**

| Pool | `max_client_conn` | `default_pool_size` | Uses PG connections |
|---|---|---|---|
| `dbpool-apps` (port 6432) | 200 | 10 | ~50 |
| `dbpool-session` (port 6433) | 100 | 6 | ~30 |

Total PG connections: 50 + 30 = 80, leaving 20 for direct connections (migrations, admin).

---

## Database Backups

Staging database backups run daily via a cron job on the VM:

```bash
# /etc/cron.d/athyper-backup
0 3 * * * root docker exec db pg_dumpall -U postgres | gzip > /opt/athyper/backups/pg_$(date +%Y%m%d).sql.gz
```

Backups are retained for 14 days. For production, backups should be pushed to off-site object storage (S3 or similar).

---

## Health Checks

All services expose health endpoints consumed by Uptime Kuma (statuswatch) and Traefik's health check recreation rule:

| Service | Health URL |
|---|---|
| `api` | `GET /health` → `{"status": "ok"}` |
| `neon-web` | `GET /api/health` |
| `mesh-web` | `GET /api/health` |
| `admin-web` | `GET /api/health` |
| `iam` | `GET /health/live` (Keycloak built-in) |
| `objectstorage` | `GET /minio/health/live` |

**Traefik health check recreation rule:** If a container restarts, Traefik requires a `/health` endpoint to return 200 before re-adding it to the load balancer pool. This prevents traffic being sent to an unhealthy container during startup.

---

## Log Access

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f api

# Filter by log level (using jq for structured logs)
docker compose logs api 2>&1 | jq 'select(.level == "error")'

# Access Grafana/Loki for historical log search
# → https://telemetry.staging.athyper.com
```

---

## Monitoring & Alerts

- **Grafana:** https://telemetry.staging.athyper.com — pre-provisioned dashboards for API latency, error rate, queue depth, DB connections.
- **GlitchTip:** https://errors.staging.athyper.com — error tracking for all three apps + API.
- **Alertmanager:** Configured to send alerts to `#athyper-ops` Slack channel. Alert rules: `stack/config/telemetry/prometheus/alerts/`.
- **Uptime Kuma:** External uptime monitoring for all public endpoints.

---

## Secrets Management

In staging, secrets can be managed either via:

**Option A — Environment file (simpler):**
Edit `/opt/athyper/stack/.env` directly on the VM. Restart affected services after changes.

**Option B — Infisical (more secure, recommended for production):**
Enable the `security-infisical` Docker Compose profile. Configure the Infisical service with `athyper_secrets` DB. The API and app containers connect to Infisical on startup to pull environment variables.

```bash
docker compose \
  -f compose.yml \
  -f athyper.override.staging.yml \
  --profile security-infisical \
  up -d secretstore
```

---

## Common Staging Operations

```bash
# Force re-deploy a single service
docker compose pull api && docker compose up -d api

# Run a one-off DB migration
docker compose exec api pnpm db:migrate

# Apply new seed data
docker compose exec api pnpm db:seed:delta

# Tail error logs
docker compose logs -f api | grep '"level":"error"'

# Check queue depths (BullMQ)
# → http://localhost:3001 (not exposed externally — use SSH tunnel)
ssh -L 3001:localhost:3001 staging-vm

# SSH into running container for debugging
docker compose exec api sh

# Restart Keycloak cleanly (preserves DB)
docker compose restart iam
```

---

## Security Checklist Before Staging Deploy

- [ ] All `.env` values are unique to staging (not copied from local dev)
- [ ] `dbconsole` (Adminer) is disabled in `athyper.override.staging.yml`
- [ ] Firewall blocks all ports except 80, 443, 22
- [ ] Redis is on `athyper-internal` network only (not published to host)
- [ ] PostgreSQL is on `athyper-internal` network only (not published to host)
- [ ] ClamAV virus scanning is enabled (not skipped)
- [ ] `CREDENTIAL_MASTER_KEY` is unique and stored securely
- [ ] ACME certificate file (`acme.json`) has permissions `chmod 600`
- [ ] Port hardening script passes: `./stack/scripts/setup/verify-port-hardening.sh`
- [ ] SECURITY DEFINER functions verified: `docker compose exec api pnpm verify:security-definer`
