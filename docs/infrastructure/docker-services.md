# Docker Services Reference

Complete reference for all Docker Compose services in the Athyper stack. Source compose files live in `stack/compose/`. Runtime data lives in `D:\Stack\athyper\` (not in the git repo).

---

## Compose File Structure

```
stack/compose/
├── compose.yml                          # Root include file — references all service files
├── athyper.base.yml                     # Network definitions
├── athyper.override.local.yml           # Local dev overrides
├── athyper.override.staging.yml         # Staging overrides
├── athyper.override.production.yml      # Production overrides
├── db/
│   ├── athyper-db.yml
│   ├── athyper-dbpool-apps.yml
│   └── athyper-dbpool-session.yml
├── gateway/
│   └── athyper-gateway.yml
├── iam/
│   └── athyper-iam.yml
├── apps/
│   └── athyper-apps.yml
├── memorycache/
│   ├── athyper-memorycache.yml
│   ├── athyper-memorycache-exporter.yml
│   └── athyper-memorycache-jobs.yml
├── objectstorage/
│   └── athyper-objectstorage.yml
├── telemetry/
│   ├── athyper-metrics.yml
│   ├── athyper-tracing.yml
│   ├── athyper-logging.yml
│   ├── athyper-logshipper.yml
│   ├── athyper-alertmanager.yml
│   └── athyper-telemetry.yml
├── monitoring/
│   ├── athyper-errorcollect.yml
│   ├── athyper-cronwatch.yml
│   └── athyper-statuswatch.yml
├── security/
│   ├── athyper-virusscan.yml
│   ├── athyper-secretstore.yml
│   ├── athyper-socket-proxy-gateway.yml
│   └── athyper-socket-proxy-logshipper.yml
├── search/
│   └── athyper-searchcore.yml
├── render/
│   ├── athyper-docrender.yml
│   └── athyper-docparser.yml
├── mail/
│   └── athyper-mailtrap.yml
├── admin/
│   ├── athyper-queueconsole.yml
│   └── athyper-dbconsole.yml
└── analytics/
    └── athyper-analyticsboard.yml
```

---

## Networks

| Network | Type | Purpose |
|---|---|---|
| `athyper-edge` | bridge | External-facing; Traefik, app frontends, API gateway |
| `athyper-internal` | bridge | Internal-only; databases, cache, workers, background services |

Services that need to be reachable from outside (or from Traefik) attach to `athyper-edge`. All services use `athyper-internal` for service-to-service communication.

---

## Services by Category

### Core Database

#### `db` — PostgreSQL

| Field | Value |
|---|---|
| Image | `postgres:16.13` |
| Port | `5432` (internal only — NOT exposed to host) |
| Networks | `athyper-internal` |
| Volumes | `D:\Stack\athyper\data\db:/var/lib/postgresql/data` |
| Config | `stack/config/db/postgresql.conf`, `pg_hba.conf` |

**Databases created by init-databases.sh:**

| Database | Purpose |
|---|---|
| `athyper_neon` | Primary tenant workbench (all entity data) |
| `athyper_mesh` | Partner/supplier collaboration plane |
| `athyper_iam` | Keycloak identity data |
| `athyper_health` | Endpoint health check results |
| `athyper_errors` | GlitchTip error tracking |
| `athyper_secrets` | Infisical secrets manager |
| `athyper_analytics` | Analytics read replica / aggregations |

**Key PostgreSQL settings:**
- `max_connections = 100` (intentionally low — all access via PgBouncer)
- `shared_buffers = 256MB`
- `wal_level = replica` (for potential future streaming replication)
- Row-level security (RLS) enabled on all tenant-scoped tables
- SECURITY DEFINER functions verified by `server/scripts/verify-security-definer.ts`

---

#### `dbpool-apps` — PgBouncer (Application Pool)

| Field | Value |
|---|---|
| Image | `edoburu/pgbouncer:1.25.1` |
| Port | `6432` (internal only) |
| Mode | Transaction pooling |
| Databases | neon, mesh, health, errors, secrets (5 databases) |
| Max connections to PG | 50 |

All application services (`api`, `worker`, `scheduler`) connect through this pool. Transaction-mode pooling means connections are returned to the pool after each transaction — no persistent connections per request.

**Connection string format:** `postgres://user:pass@dbpool-apps:6432/athyper_neon`

---

#### `dbpool-session` — PgBouncer (Session Pool)

| Field | Value |
|---|---|
| Image | `edoburu/pgbouncer:1.25.1` |
| Port | `6433` (internal only) |
| Mode | Session pooling |
| Databases | iam, analytics |
| Max connections to PG | 30 |

Session-mode pooling is required for Keycloak (IAM) — Keycloak maintains per-session DB state that is incompatible with transaction pooling.

---

### Gateway

#### `gateway` — Traefik

| Field | Value |
|---|---|
| Image | `traefik:3.6.13` |
| Ports | `80` (HTTP), `443` (HTTPS) → host |
| Networks | `athyper-edge`, `athyper-internal` |
| Config | `stack/config/gateway/` |
| Socket | Reads Docker socket via `socket-proxy-gateway` (read-only) |

**Responsibilities:**
- TLS termination (Let's Encrypt via ACME in staging/prod; self-signed in local)
- Routing to all three web apps and the API
- Middleware: rate limiting, CORS, security headers, gzip

**Local dev hostnames** (via `/etc/hosts` or `hosts` file):

| Hostname | Target Service |
|---|---|
| `neon.athyper.local` | neon-web (or host port 3101) |
| `mesh.athyper.local` | mesh-web (or host port 3102) |
| `admin.athyper.local` | admin-web (or host port 3103) |
| `api.athyper.local` | api (port 3000 or host 4000) |
| `iam.athyper.local` | iam (Keycloak port 8080) |
| `objectstorage.athyper.local` | objectstorage (MinIO S3 port 9000) |
| `objectstorage.console.athyper.local` | objectstorage (MinIO Console port 9001) |
| `metrics.athyper.local` | metrics (Prometheus port 9090) |
| `logs.athyper.local` | logging (Loki port 3100) |
| `traces.athyper.local` | tracing (Tempo port 3200) |
| `errors.athyper.local` | errorcollect (GlitchTip port 8000) |
| `telemetry.athyper.local` | telemetry (Grafana port 3000) |
| `mail.athyper.local` | mailtrap (Mailpit UI port 8025) |

#### `gateway-outage` — Nginx Fallback

| Field | Value |
|---|---|
| Image | `nginxinc/nginx-unprivileged:1.27-alpine` |
| Port | `8080` (internal) |

Static HTML fallback page served by Traefik when upstream services are unavailable.

#### `socket-proxy-gateway` / `socket-proxy-logshipper`

| Field | Value |
|---|---|
| Image | Read-only Docker socket proxy |
| Port | `2375` (internal) |

Traefik and Alloy (log shipper) need Docker socket access. These proxies expose a read-only subset of the Docker API, following least-privilege principle.

---

### IAM

#### `iam` — Keycloak

| Field | Value |
|---|---|
| Image | `quay.io/keycloak/keycloak:${KC_TAG}` |
| Port | `8080` (internal + edge via Traefik) |
| Networks | `athyper-edge`, `athyper-internal` |
| DB | `athyper_iam` via `dbpool-session:6433` |
| Config | `stack/config/iam/` |

**Realms:**

| Realm | Purpose | Clients |
|---|---|---|
| `athyper` | App-native realm for all three planes | `neon-web`, `mesh-web`, `admin-web` |
| `platform-control` | Product owner / support staff access | `admin-web` (platform staff client) |
| `master` | Keycloak admin console only | Keycloak internal |

**Session storage:** Keycloak sessions stored in `athyper_iam` DB. Application session cookies (`neon_sid`, `mesh_sid`, `admin_sid`) are stored in Redis and reference KC sessions.

---

### Application Planes

#### `neon-web`, `mesh-web`, `admin-web` — Next.js Apps

| Field | Value |
|---|---|
| Image (staging/prod) | Parameterized `apps/Dockerfile` with per-service `APP_NAME` and `APP_PACKAGE` build arguments |
| Port | `3000` (container) |
| Local dev | Runs on HOST (pnpm dev) at ports 3101, 3102, 3103 |
| Networks | `athyper-edge`, `athyper-internal` |

Each app is an independent Next.js 15+ application with:
- Its own session boundary and cookie name
- Its own Keycloak client configuration
- Its own BFF routes (no shared mutation surfaces between planes)

See [local-dev-setup.md](./local-dev-setup.md) and [staging-setup.md](./staging-setup.md) for setup differences.

---

#### `api` — Server API

| Field | Value |
|---|---|
| Image | `server/Dockerfile` (prod) / `server/Dockerfile.dev` (local) |
| Port | `3000` (container) / `4000` (host, local dev) |
| Mode | `MODE=http` |
| Networks | `athyper-edge`, `athyper-internal` |

Connects to `dbpool-apps:6432`, `memorycache:6379`, `objectstorage:9000`, `searchcore:7700`, `virusscan:3310`.

#### `worker` — BullMQ Worker

| Field | Value |
|---|---|
| Image | Same as api |
| Mode | `MODE=worker` |
| Networks | `athyper-internal` only |

Processes jobs from all BullMQ queues: `jobs-notifications`, `jobs-webhook-delivery`, `jobs-domain-outbox`, `jobs-iam-kc-sync`, `jobs-lifecycle-timers`, `jobs-import`, `jobs-export`.

#### `scheduler` — BullMQ Scheduler

| Field | Value |
|---|---|
| Image | Same as api |
| Mode | `MODE=scheduler` |
| Networks | `athyper-internal` only |

Registers repeatable/delayed jobs in BullMQ. Runs once at startup and exits (or stays alive for dynamic schedule updates).

---

### Cache

#### `memorycache` — Redis

| Field | Value |
|---|---|
| Image | `redis:7.4.8-alpine` |
| Port | `6379` (internal only) |
| Networks | `athyper-internal` |
| Config | `stack/config/memorycache/redis.conf`, `users.acl` |
| Volumes | `D:\Stack\athyper\data\memorycache:/data` |

**Database allocation:**

| DB | Purpose |
|---|---|
| 0 | App cache, BullMQ queues, sessions, rate limiting |
| 1 | GlitchTip (error tracking) |
| 2 | Infisical (secrets manager) |

**ACL users:**

| User | Permissions | Used by |
|---|---|---|
| `athyper-api` | All commands on DB 0 | api, worker, scheduler |
| `glitchtip` | All commands on DB 1 | errorcollect |
| `infisical` | All commands on DB 2 | secretstore |

**Note on ACL format:** Command allow-lists must list `+<cmd>` entries AFTER `-@all`/`-@dangerous` deny rules — order matters in Redis ACL.

#### `memorycache-jobs` — Dedicated BullMQ Redis *(optional)*

| Field | Value |
|---|---|
| Image | `redis:7.4.8-alpine` |
| Profile | `memorycache-jobs` (not started by default) |
| Port | `6380` (internal) |

Activated by setting `COMPOSE_PROFILES=memorycache-jobs`. When active, BullMQ queues use this instance and the main Redis is freed for session/cache only.

#### `memorycache-exporter` — Redis Prometheus Exporter

| Field | Value |
|---|---|
| Image | `prom/redis-exporter` |
| Port | Scrape port (internal) |

Exposes Redis metrics to Prometheus.

---

### Object Storage

#### `objectstorage` — MinIO

| Field | Value |
|---|---|
| Image | `minio/minio:2025-09-07` |
| Ports | `9000` (S3 API, internal + edge), `9001` (Console, edge via Traefik) |
| Networks | `athyper-edge`, `athyper-internal` |
| Volumes | `D:\Stack\athyper\data\objectstorage:/data` |

**Buckets (provisioned by `objectstorage-init`):**

| Bucket | Purpose | ILM Rules |
|---|---|---|
| `athyper-documents` | User-uploaded documents, attachments | 7-day pending expiry; 2-day multipart abort |
| `athyper-exports` | Generated reports, exports | 30-day expiry |
| `athyper-imports` | Upload staging for import jobs | 24-hour expiry |
| `athyper-avatars` | User/tenant profile images | No expiry |
| `athyper-templates` | Print template assets | No expiry |

#### `objectstorage-init` — MinIO MC (one-shot)

Runs `mc` CLI to create buckets and apply ILM rules. Exits after completion. Re-run safe (idempotent).

---

### Telemetry

All telemetry services run under Docker Compose profiles `core` or `telemetry`. In local dev, these are optional.

#### `metrics` — Prometheus

| Field | Value |
|---|---|
| Image | `prom/prometheus:3.11.2` |
| Port | `9090` (internal + edge) |
| Config | `stack/config/telemetry/prometheus/` |

Scrapes: api (`:3000/metrics`), memorycache-exporter, dbpool metrics, Traefik, Loki, Tempo.

Alert rules: `stack/config/telemetry/prometheus/alerts/`

#### `alertmanager` — Prometheus Alertmanager

| Field | Value |
|---|---|
| Image | `prom/alertmanager:v0.27.0` |
| Port | `9093` (internal) |

Routes Prometheus alerts to Slack / email / PagerDuty (configured per environment).

#### `tracing` — Grafana Tempo

| Field | Value |
|---|---|
| Image | `grafana/tempo:2.10.4` |
| Ports | `3200` (HTTP), `4317` (OTLP/gRPC) |
| Config | `stack/config/telemetry/tempo/` |
| Storage | MinIO bucket `athyper-traces` (env-gated via `TEMPO_STORAGE_BACKEND`) |

The server SDK (`@opentelemetry/sdk-node`) sends traces to `tracing:4317` via OTLP/gRPC.

#### `logging` — Grafana Loki

| Field | Value |
|---|---|
| Image | `grafana/loki:3.6.10` |
| Port | `3100` (internal + edge) |
| Storage | MinIO bucket `athyper-logs` |

Log retention: 30 days default (configurable via `stack/config/telemetry/loki/loki.yml`).

#### `logshipper` — Grafana Alloy

| Field | Value |
|---|---|
| Image | `grafana/alloy:v1.0.0` |
| Port | `12345` (admin UI) |
| Socket | Docker socket via `socket-proxy-logshipper` |

Collects container logs via Docker API and forwards to Loki.

#### `telemetry` — Grafana

| Field | Value |
|---|---|
| Image | `grafana/grafana:11.4.0` |
| Port | `3000` (edge via Traefik → `telemetry.athyper.local`) |
| Config | `stack/config/telemetry/grafana/` |
| Provisioning | `stack/config/telemetry/provisioning.env/` |

Pre-provisioned dashboards: API latency, queue depth, DB pool utilisation, error rate, Redis memory.

**Oncall latency dashboard:** `grafana.internal/d/api-latency` — this is the dashboard watched by oncall. Any change to request-path code should be verified against it.

---

### Monitoring

#### `errorcollect` — GlitchTip

| Field | Value |
|---|---|
| Image | `glitchtip/glitchtip:4.1.1` |
| Port | `8000` (edge via Traefik → `errors.athyper.local`) |
| DB | `athyper_errors` |
| Redis | `memorycache` DB 1 |

Sentry-compatible error tracking. The server and Next.js apps use `@sentry/nextjs` / `@opentelemetry` SDKs configured to point to this instance.

#### `statuswatch` — Uptime Kuma *(profile: monitoring)*

Uptime monitoring for all public endpoints. Monitor configuration is managed via JSON-in-git + manual import (rb-07 runbook). No REST API automation until Kuma 2.x.

#### `cronwatch` — Scheduled Job Monitor *(profile: monitoring)*

Monitors scheduled jobs (heartbeat pings from BullMQ workers). Alerts when a job misses its expected execution window.

---

### Security

#### `virusscan` — ClamAV

| Field | Value |
|---|---|
| Image | `clamav/clamav:1.5.2` |
| Port | `3310` (internal only — INSTREAM protocol) |
| Networks | `athyper-internal` |
| Startup | ~120 seconds (signature DB download ~500MB on first start) |

Every file uploaded via the object storage pipeline is scanned before being marked as available. The API calls ClamAV via the INSTREAM TCP protocol.

#### `secretstore` — Infisical *(profile: security-infisical)*

| Field | Value |
|---|---|
| Image | `infisical/infisical:v0.100.0` |
| Port | `8000` (internal) |
| DB | `athyper_secrets` |
| Redis | `memorycache` DB 2 |

Optional secrets manager for production environments. In local dev, secrets are loaded from `.env` files.

---

### Search

#### `searchcore` — Meilisearch *(profile: search)*

| Field | Value |
|---|---|
| Image | `meilisearch/meilisearch:v1.9.2` |
| Port | `7700` (internal) |
| Volumes | `D:\Stack\athyper\data\searchcore:/meili_data` |

Full-text search for all entity types. The search indexer syncs entity data from `athyper_neon` via the `jobs-domain-outbox` drain.

---

### Document Processing

#### `docrender` — Gotenberg *(profile: render)*

| Field | Value |
|---|---|
| Image | `gotenberg:8.9.0` |
| Port | `3000` (internal) |

PDF rendering from HTML templates (invoices, reports, labels). Called by the print service in `svc-doc-services`.

#### `docparser` — Apache Tika *(profile: render)*

| Field | Value |
|---|---|
| Image | `apache/tika:2.9.2-full` |
| Port | `9998` (internal) |
| Note | Has a known DLQ alarm (B.9) — if Tika has no consumer for >5 min, a Sentry alert fires |

Text extraction from uploaded documents (PDF, Word, Excel). Feeds the content search index.

---

### Mail (Local Dev Only)

#### `mailtrap` — Mailpit

| Field | Value |
|---|---|
| Image | `axllent/mailpit:v1.20.4` |
| Ports | `1025` (SMTP, internal), `8025` (Web UI, edge → `mail.athyper.local`) |

Captures all outgoing SMTP in local dev. No emails leave the machine.

---

### Admin Consoles *(profile: admin)*

#### `queueconsole` — Bull Board

| Field | Value |
|---|---|
| Image | `mcinq/bull-board:5.20.5` |
| Port | `3001` (internal) |

BullMQ queue browser. Shows queue depths, job history, failed jobs, DLQ.

#### `dbconsole` — Adminer

| Field | Value |
|---|---|
| Image | `adminer:4.8.1-standalone` |
| Port | `8080` (internal) |

Database explorer. **Local dev only** — never enabled in staging/production.

---

### Analytics *(profile: analytics — OFF by default)*

#### `analyticsboard` — Metabase

| Field | Value |
|---|---|
| Image | `metabase/metabase:v0.50.0` |
| Port | `3000` (internal) |
| DB | `athyper_analytics` (read replica) |

Self-service analytics dashboards. Requires a read replica of `athyper_neon` to avoid impacting production queries.

---

## Compose Profiles Summary

| Profile | Services activated | When to use |
|---|---|---|
| *(default)* | db, dbpool-apps, dbpool-session, gateway, iam, api, worker, scheduler, memorycache, objectstorage | Minimum viable stack |
| `core` | + metrics, tracing, logging, logshipper, alertmanager, telemetry | Full observability |
| `telemetry` | Alias for `core` | |
| `monitoring` | + errorcollect, statuswatch, cronwatch | Error tracking + uptime |
| `search` | + searchcore | Full-text search |
| `render` | + docrender, docparser | Document processing |
| `admin` | + queueconsole, dbconsole | Developer tooling |
| `analytics` | + analyticsboard | Analytics dashboards |
| `security-infisical` | + secretstore | Production secrets management |
| `memorycache-jobs` | + memorycache-jobs | Dedicated BullMQ Redis |

**Start full local stack:**
```powershell
docker compose `
  --profile core `
  --profile monitoring `
  --profile search `
  --profile render `
  --profile admin `
  up -d
```

---

## Port Quick Reference

| Port | Service | Protocol |
|---|---|---|
| 80 | gateway (Traefik HTTP) | HTTP |
| 443 | gateway (Traefik HTTPS) | HTTPS/TLS |
| 4000 | api (host, local dev only) | HTTP |
| 5432 | db (PostgreSQL) | TCP — internal only |
| 6432 | dbpool-apps (PgBouncer) | TCP — internal only |
| 6433 | dbpool-session (PgBouncer) | TCP — internal only |
| 6379 | memorycache (Redis) | TCP — internal only |
| 6380 | memorycache-jobs (Redis, optional) | TCP — internal only |
| 7700 | searchcore (Meilisearch) | HTTP — internal only |
| 8025 | mailtrap (Mailpit UI) | HTTP — via Traefik |
| 8080 | iam (Keycloak) | HTTP — via Traefik |
| 9000 | objectstorage (MinIO S3) | HTTP — via Traefik |
| 9001 | objectstorage (MinIO Console) | HTTP — via Traefik |
| 9090 | metrics (Prometheus) | HTTP — via Traefik |
| 9093 | alertmanager | HTTP — internal |
| 9998 | docparser (Tika) | HTTP — internal |
| 3100 | logging (Loki) | HTTP — via Traefik |
| 3200 | tracing (Tempo) | HTTP — via Traefik |
| 3310 | virusscan (ClamAV) | TCP — internal only |
| 4317 | tracing (Tempo OTLP/gRPC) | gRPC — internal only |
