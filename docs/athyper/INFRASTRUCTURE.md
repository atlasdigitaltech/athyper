# Infrastructure

The `mesh/` directory contains the complete Docker Compose infrastructure for running Athyper locally, in staging, or in production. The name "mesh" refers to the interconnected service mesh of infrastructure components.

## Architecture Overview

```
                          ┌──────────────┐
                          │   Traefik    │  Gateway (reverse proxy, TLS, routing)
                          │   :443/:80  │
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
              │          └─────────────┘
              │
       ┌──────▼──────┐   ┌─────────────┐   ┌─────────────┐
       │    Redis    │   │    MinIO     │   │  Telemetry  │
       │   :6379     │   │  (S3 compat) │   │  Stack      │
       └─────────────┘   │   :9000     │   └─────────────┘
                         └─────────────┘
```

## Service Components

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| **PostgreSQL** | postgres:16 | 5432 | Primary database (12 schemas) |
| **PgBouncer (Apps)** | pgbouncer | 6432 | Connection pool for application queries |
| **PgBouncer (Auth)** | pgbouncer | 6433 | Connection pool for Keycloak |
| **Redis** | redis:7 | 6379 | Session store, cache, job queues, rate limiting |
| **Keycloak** | keycloak:25 | 8080 | Identity provider (OIDC/PKCE) |
| **Traefik** | traefik:3 | 80, 443 | Reverse proxy, TLS termination, routing |
| **MinIO** | minio | 9000, 9001 | S3-compatible object storage |
| **Prometheus** | prometheus | 9090 | Metrics collection |
| **Grafana** | grafana | 3001 | Metrics dashboards |
| **Tempo** | grafana/tempo | 3200 | Distributed tracing |
| **Loki** | grafana/loki | 3100 | Log aggregation |
| **Alloy** | grafana/alloy | 12345 | Log shipper |

## Directory Structure

```
mesh/
├── compose/                      Docker Compose definitions
│   ├── compose.yml               Main entry point (includes all service YMLs)
│   ├── apps/
│   │   └── mesh-athyper.yml      Application container (Neon + Runtime)
│   ├── db/
│   │   ├── mesh-db.yml           PostgreSQL
│   │   ├── mesh-dbpool-apps.yml  PgBouncer for app connections
│   │   └── mesh-dbpool-auth.yml  PgBouncer for Keycloak connections
│   ├── gateway/
│   │   └── mesh-gateway.yml      Traefik configuration
│   ├── iam/
│   │   └── mesh-iam.yml          Keycloak configuration
│   ├── memorycache/              Redis (included via compose.yml)
│   ├── objectstorage/            MinIO (included via compose.yml)
│   ├── mesh/
│   │   ├── mesh.base.yml         Base service definitions
│   │   ├── mesh.override.local.yml     Local dev overrides
│   │   ├── mesh.override.staging.yml   Staging overrides
│   │   └── mesh.override.production.yml Production overrides
│   └── telemetry/
│       ├── mesh-logging.yml      Loki log aggregation
│       ├── mesh-logshipper.yml   Alloy log shipper
│       ├── mesh-metrics.yml      Prometheus + Grafana
│       ├── mesh-telemetry.yml    Combined telemetry
│       └── mesh-tracing.yml      Tempo tracing
│
├── config/                       Service configuration files
│   ├── db/
│   │   ├── local/                PostgreSQL config for local dev
│   │   └── stagingenv/           PostgreSQL config for staging
│   ├── gateway/
│   │   ├── certs/                TLS certificates (cert.pem, key.pem)
│   │   └── dynamic/             Traefik dynamic routing rules
│   │       ├── mesh.tls.yml     TLS configuration
│   │       └── mesh.workbench.yml  Workbench routing rules
│   ├── iam/
│   │   ├── realm-demosetup.json  Keycloak demo realm export
│   │   └── realm-export.json     Keycloak full realm export
│   ├── redis/                    Redis configuration
│   └── telemetry/
│       ├── logging/alloy.alloy   Alloy log pipeline config
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
├── env/                          Environment variable templates
│   ├── local.env.example
│   ├── staging.env.example
│   └── production.env.example
│
└── scripts/                      Infrastructure management scripts
    ├── up.sh / up.bat            Start all services
    ├── down.sh / down.bat        Stop all services
    ├── logs.sh / logs.bat        Tail service logs
    ├── init-data.sh / .bat       Initialize data volumes
    ├── initdb-iam.sh / .bat      Initialize Keycloak database
    ├── export-iam.sh / .bat      Export Keycloak realm to JSON
    ├── generate-mesh-certs.sh/.bat Generate self-signed TLS certs
    ├── setup-config.sh / .bat    Copy config templates
    └── setup-env.sh / .bat       Generate .env from templates
```

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

These scripts wrap Docker Compose with the correct file and env references:

```bash
docker compose -f mesh/compose/compose.yml --env-file mesh/env/.env up -d
```

## Environment Configuration

Three environment profiles with different settings:

| Setting | Local | Staging | Production |
|---------|-------|---------|------------|
| TLS | Self-signed certs | Let's Encrypt | Managed certs |
| DB pooling | Minimal | Moderate | Aggressive |
| Log level | debug | info | warn |
| Keycloak | Dev mode | Standard | HA cluster |
| Telemetry | Full stack | Full stack | Metrics + tracing only |
| Realm safety | Accepts localhost | Rejects localhost | Rejects localhost |

## Database Schemas

PostgreSQL hosts 12+ schemas, provisioned by `framework/adapters/db/src/sql/`:

| Schema | Purpose | DDL Files |
|--------|---------|-----------|
| `public` | Schema provisioning tracking (`schema_provisions` table) | 001 |
| `core` | Core configuration, tenants | 010 |
| `meta` | Entity definitions, fields, relations, overlays | 020 |
| `ref` | Reference data (currencies, countries, UOM) | 030 |
| `sec` | Security (field access, rate limits) | 040 |
| `wf` | Workflow definitions, instances, tasks | 050 |
| `ent` | Business entity data (dynamic, from meta-engine) | 060 |
| `doc` | Document templates, outputs, render jobs | 070 |
| `collab` | Comments, reactions, mentions, read tracking | 080 |
| `audit` | Audit events, outbox, DLQ, archive markers | 090 |
| `notify` | Notifications, deliveries, preferences, templates | 100 |
| `ui` | Dashboards, saved views | 110 |

## Keycloak Configuration

Keycloak realm exports in `mesh/config/iam/` define:

- Realm settings (token lifetimes, login settings)
- Client registrations (Neon web app — PKCE Authorization Code)
- Role definitions (admin, user, partner, etc.)
- Group hierarchies
- Identity provider configurations
- Authentication flows

To export current realm state:

```bash
./mesh/scripts/export-iam.sh
```

## Telemetry Stack

| Component | Collects | Dashboard |
|-----------|----------|-----------|
| **Prometheus** | Metrics from all services (HTTP, DB, cache, jobs) | Grafana at `:3001` |
| **Tempo** | Distributed traces (OpenTelemetry) | Grafana Tempo datasource |
| **Loki** | Aggregated logs from all containers | Grafana Loki datasource |
| **Alloy** | Ships container logs to Loki | — |

The telemetry adapter (`framework/adapters/telemetry/`) instruments the runtime with OpenTelemetry, which feeds into this stack.
