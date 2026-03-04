# Infrastructure

Athyper's infrastructure is orchestrated via Docker Compose under the `mesh/` directory. The name "mesh" refers to the interconnected service mesh of infrastructure components.

---

## Architecture

```
                          ┌──────────────┐
                          │   Traefik    │  Reverse proxy, TLS, routing
                          │  :443 / :80 │
                          └──────┬───────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
       ┌──────▼──────┐   ┌──────▼──────┐   ┌──────▼──────┐
       │  Neon Web   │   │  Keycloak   │   │  Runtime    │
       │  (Next.js)  │   │   (IAM)     │   │  (API)      │
       │   :3000     │   │   :8080     │   │  :4000      │
       └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
              │                  │                  │
              │          ┌──────▼──────┐           │
              │          │ PostgreSQL  │◄──────────┘
              ├─────────►│   :5432     │
              │          └──────┬──────┘
              │                  │
              │          ┌──────▼──────┐
              │          │  PgBouncer  │  Connection pooling
              │          │ :6432/:6433 │  (apps + auth pools)
              │          └─────────────┘
              │
       ┌──────▼──────┐   ┌─────────────┐   ┌─────────────┐
       │    Redis    │   │    MinIO     │   │  Telemetry  │
       │   :6379     │   │  (S3 compat) │   │  Stack      │
       └─────────────┘   │  :9000/:9001│   └─────────────┘
                         └─────────────┘
```

---

## Service Components

| Service              | Image           | Port(s)    | Purpose                                    |
| -------------------- | --------------- | ---------- | ------------------------------------------ |
| **PostgreSQL**       | `postgres:16`   | 5432       | Primary database (12 schemas)              |
| **PgBouncer (Apps)** | `pgbouncer`     | 6432       | Connection pool for application queries    |
| **PgBouncer (Auth)** | `pgbouncer`     | 6433       | Connection pool for Keycloak               |
| **Redis**            | `redis:7`       | 6379       | Sessions, cache, job queues, rate limiting |
| **Keycloak**         | `keycloak:25`   | 8080       | Identity provider (OIDC/PKCE)              |
| **Traefik**          | `traefik:3`     | 80, 443    | Reverse proxy, TLS termination, routing    |
| **MinIO**            | `minio`         | 9000, 9001 | S3-compatible object storage               |
| **Prometheus**       | `prometheus`    | 9090       | Metrics collection                         |
| **Grafana**          | `grafana`       | 3001       | Metrics dashboards                         |
| **Tempo**            | `grafana/tempo` | 3200       | Distributed tracing                        |
| **Loki**             | `grafana/loki`  | 3100       | Log aggregation                            |
| **Alloy**            | `grafana/alloy` | 12345      | Log shipper (replaces Promtail)            |

---

## Directory Structure

```
mesh/
├── compose/                      Docker Compose definitions
│   ├── compose.yml               Main entry point (includes all service YMLs)
│   ├── mesh.base.yml             Network and project name
│   ├── apps/
│   │   └── mesh-athyper.yml      Application containers
│   ├── db/
│   │   ├── mesh-db.yml           PostgreSQL
│   │   ├── mesh-dbpool-apps.yml  PgBouncer (app pool)
│   │   └── mesh-dbpool-auth.yml  PgBouncer (auth pool)
│   ├── gateway/
│   │   └── mesh-gateway.yml      Traefik
│   ├── iam/
│   │   └── mesh-iam.yml          Keycloak
│   ├── memorycache/
│   │   ├── mesh-memorycache.yml          Redis
│   │   └── mesh-memorycache-exporter.yml Redis metrics exporter
│   ├── objectstorage/
│   │   └── mesh-objectstorage.yml        MinIO
│   └── telemetry/
│       ├── mesh-logging.yml      Loki
│       ├── mesh-logshipper.yml   Alloy
│       ├── mesh-metrics.yml      Prometheus + Grafana
│       ├── mesh-tracing.yml      Tempo
│       └── mesh-telemetry.yml    Combined telemetry entry
│
├── config/                       Service configurations
│   ├── db/
│   │   ├── local/                PostgreSQL local dev config
│   │   └── stagingenv/           PostgreSQL staging config
│   ├── gateway/
│   │   ├── certs/                TLS certificates
│   │   │   ├── cert.pem
│   │   │   └── key.pem
│   │   └── dynamic/             Traefik dynamic routing
│   │       ├── mesh.tls.yml     TLS configuration
│   │       └── mesh.workbench.yml  App routing rules
│   ├── iam/
│   │   ├── realm-export.json     Full Keycloak realm export
│   │   └── realm-demosetup.json  Demo realm with sample users
│   ├── redis/                    Redis configuration
│   └── telemetry/
│       ├── logging/alloy.alloy   Alloy log pipeline
│       ├── metrics/config.yml    Prometheus scrape config
│       ├── tracing/config.yml    Tempo storage config
│       └── provisioning/         Grafana datasource provisioning
│
├── data/                         Persistent volumes (gitignored)
│   ├── db/                       PostgreSQL data
│   ├── memorycache/              Redis data
│   ├── objectstorage/            MinIO data
│   └── telemetry/                Prometheus/Tempo/Loki data
│
├── env/                          Environment templates
│   ├── local.env.example
│   ├── staging.env.example
│   └── production.env.example
│
└── scripts/                      Management scripts (.sh + .bat)
    ├── up.sh / up.bat            Start all services
    ├── down.sh / down.bat        Stop all services
    ├── logs.sh / logs.bat        Tail service logs
    ├── init-data.sh / .bat       Initialize data volumes
    ├── initdb-iam.sh / .bat      Initialize Keycloak database
    ├── export-iam.sh / .bat      Export Keycloak realm
    ├── generate-mesh-certs.sh/.bat  Generate self-signed TLS certs
    ├── setup-config.sh / .bat    Copy config templates
    └── setup-env.sh / .bat       Generate .env from templates
```

---

## Quick Start

```bash
# From repository root:

# 1. Start infrastructure
pnpm mesh:up

# 2. Check status
pnpm mesh:ps

# 3. View logs
pnpm mesh:logs

# 4. Stop infrastructure
pnpm mesh:down
```

These scripts wrap Docker Compose:

```bash
docker compose -f mesh/compose/compose.yml --env-file mesh/env/.env up -d
```

---

## Database

### PostgreSQL 16

- **Port**: 5432
- **Schemas**: 12 (core, meta, ref, sec, wf, ent, doc, collab, audit, notify, ui, public)
- **Provisioning**: Checksum-tracked via `public.schema_provisions`
- **Config**: `mesh/config/db/{local,stagingenv}/`

### Connection Pooling (PgBouncer)

Two pools for workload isolation:

| Pool     | Port | Purpose              | Max Connections      |
| -------- | ---- | -------------------- | -------------------- |
| **Apps** | 6432 | Application queries  | Configurable per env |
| **Auth** | 6433 | Keycloak connections | Configurable per env |

### Schema Provisioning

SQL files in `framework/adapters/db/src/sql/` are numbered by execution order:

| Range   | Purpose                                                      |
| ------- | ------------------------------------------------------------ |
| 001     | Schema creation (12 schemas)                                 |
| 010     | Core bootstrap tables                                        |
| 020–090 | Feature tables (meta, ref, sec, wf, ent, doc, collab, audit) |
| 100–120 | Service tables (notify, ui, content)                         |
| 200     | Master seed data                                             |
| 2xx     | Individual seed files                                        |
| 300+    | IAM + meta entity seeds                                      |

```bash
pnpm db:provision        # Run all DDL + seed
pnpm db:provision:status # Check provisioning status
pnpm db:provision:reset  # Reset checksums and re-run
```

---

## Redis

- **Image**: `redis:7`
- **Port**: 6379
- **Used for**: Sessions, cache, job queues, rate limiting, audit outbox
- **Config**: `mesh/config/redis/`
- **Persistence**: RDB snapshots + AOF (configurable)

Key namespaces:

| Pattern               | Purpose               |
| --------------------- | --------------------- |
| `session:{sid}`       | User sessions         |
| `cache:{tenant}:*`    | Tenant-scoped cache   |
| `queue:*`             | Job queues (BullMQ)   |
| `ratelimit:*`         | Rate limiter counters |
| `audit:auth:{tenant}` | BFF auth audit events |

---

## Keycloak

- **Image**: `keycloak:25`
- **Port**: 8080
- **Database**: PostgreSQL (via PgBouncer auth pool at :6433)
- **Realm config**: `mesh/config/iam/realm-export.json`

See [IAM Documentation](../iam/README.md) for full Keycloak configuration.

### Export Realm

```bash
./mesh/scripts/export-iam.sh    # Linux/macOS
./mesh/scripts/export-iam.bat   # Windows
```

---

## Traefik (Gateway)

- **Image**: `traefik:3`
- **Ports**: 80 (HTTP), 443 (HTTPS)
- **TLS**: Self-signed certs for local dev (generated via `generate-mesh-certs.sh`)
- **Routing**: Dynamic rules in `mesh/config/gateway/dynamic/`

### Routing Rules

| Rule                       | Target               |
| -------------------------- | -------------------- |
| `Host(athyper.local)`      | Neon web app (:3000) |
| `Host(auth.athyper.local)` | Keycloak (:8080)     |
| `PathPrefix(/api/runtime)` | Runtime API (:4000)  |

---

## MinIO (Object Storage)

- **Image**: `minio`
- **Ports**: 9000 (API), 9001 (Console)
- **Protocol**: S3-compatible
- **Used for**: Content uploads, document outputs, audit archives
- **Data**: `mesh/data/objectstorage/`

---

## Telemetry Stack

### Prometheus (Metrics)

- Scrapes all services on `/metrics` endpoints
- Config: `mesh/config/telemetry/metrics/config.yml`
- Dashboard: Grafana at `:3001`

### Tempo (Tracing)

- Receives OpenTelemetry spans
- Config: `mesh/config/telemetry/tracing/config.yml`
- Dashboard: Grafana Tempo datasource

### Loki (Logging)

- Aggregates container logs
- Dashboard: Grafana Loki datasource

### Alloy (Log Shipper)

- Ships Docker container logs to Loki
- Config: `mesh/config/telemetry/logging/alloy.alloy`
- Replaces Promtail in newer Grafana stack

### Grafana

- **Port**: 3001
- **Datasources**: Auto-provisioned via `mesh/config/telemetry/provisioning/`
- **Pre-configured**: Prometheus, Tempo, Loki datasources

---

## Environment Profiles

| Setting          | Local             | Staging           | Production             |
| ---------------- | ----------------- | ----------------- | ---------------------- |
| **TLS**          | Self-signed certs | Let's Encrypt     | Managed certs          |
| **DB Pooling**   | Minimal (5-10)    | Moderate (20-50)  | Aggressive (50-200)    |
| **Log Level**    | debug             | info              | warn                   |
| **Keycloak**     | Dev mode          | Standard          | HA cluster             |
| **Telemetry**    | Full stack        | Full stack        | Metrics + tracing only |
| **Realm Safety** | Accepts localhost | Rejects localhost | Rejects localhost      |

Environment files:

- `mesh/env/local.env.example` — Local development
- `mesh/env/staging.env.example` — Staging environment
- `mesh/env/production.env.example` — Production environment

---

## Network

All services are connected to a shared Docker network (`mesh-net`):

```yaml
networks:
  mesh-net:
    driver: bridge
```

Services communicate by container name (e.g., `mesh-db:5432`, `mesh-redis:6379`).

---

## Related Documentation

- [Deployment](../deployment/README.md) — Local and server deployment guides
- [Architecture](../architecture/README.md) — System architecture overview
- [Runbooks](../runbooks/README.md) — Operational procedures
