# Developer Onboarding Guide

**Audience:** New engineers joining the athyper platform team.  
**Status:** Final — validated Sprint 45, published Sprint 46  
**Last updated:** 2026-04-15  
**Linked from:** `GET /docs` (Swagger UI → Guides → Developer Onboarding)

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Monorepo Structure](#2-monorepo-structure)
3. [Local Environment Setup](#3-local-environment-setup)
4. [How to Add a New Entity](#4-how-to-add-a-new-entity)
5. [How to Add a New BullMQ Worker](#5-how-to-add-a-new-bullmq-worker)
6. [Testing](#6-testing)
7. [PR Workflow](#7-pr-workflow)
8. [Common Pitfalls](#8-common-pitfalls)

---

## 1. Prerequisites

Install the following before cloning the repo.

| Tool | Required version | Install |
|------|-----------------|---------|
| Node.js | ≥ 20 (22 LTS recommended) | [nodejs.org](https://nodejs.org) or `nvm install 22` |
| pnpm | ≥ 9 | `npm install -g pnpm` |
| Docker + Docker Compose | Latest stable | [docker.com](https://www.docker.com) |
| git | ≥ 2.40 | OS package manager |

Verify before proceeding:

```bash
node -v     # v22.x.x
pnpm -v     # 9.x.x
docker info # must succeed (daemon running)
```

### Environment variables

The server reads env vars from `server/.env`. Copy the example and fill in secrets:

```bash
cp server/.env.example server/.env
```

Key variables:

| Variable | Purpose | Default (local mesh) |
|----------|---------|----------------------|
| `DATABASE_URL` | PgBouncer connection string (runtime) | `postgresql://athyperadmin:athyperadmin@127.0.0.1:6432/athyper_dev1` |
| `DATABASE_ADMIN_URL` | Direct Postgres connection (migrations only) | `postgresql://athyperadmin:athyperadmin@127.0.0.1:5432/athyper_dev1` |
| `REDIS_URL` | Redis URL | `redis://app:athyperadmin@127.0.0.1:6379/0` |
| `KEYCLOAK_BASE_URL` | Keycloak instance | `https://iam.mesh.athyper.local` |
| `KEYCLOAK_REALM` | Realm name | `athyper` |
| `KEYCLOAK_CLIENT_ID` | API client ID | `athyper-api-runtime` |
| `KEYCLOAK_CLIENT_SECRET` | API client secret | *(ask team)* |
| `NODE_TLS_REJECT_UNAUTHORIZED` | Disable TLS check for self-signed mesh certs | `0` |

> **Windows note:** Use `127.0.0.1` instead of `localhost` for `DATABASE_URL` and `REDIS_URL` to avoid IPv6/IPv4 binding mismatches.

---

## 2. Monorepo Structure

```
athyper/
├── apps/
│   └── web/                        # Next.js 16 frontend (React 19)
├── packages/
│   ├── shared/
│   │   ├── data/                   # API clients, contracts, auth, query hooks
│   │   ├── foundation/             # Brand, config, core, i18n, icons, theme
│   │   ├── runtime/                # Document, entity, workflow, collab UI
│   │   ├── shell/                  # Navigation, shell layout
│   │   └── ui/                     # Base UI components, domain widgets
│   └── domain/                     # Feature-scoped packages (customer, finance, …)
├── server/
│   ├── src/                        # Application entry points
│   │   ├── app.ts                  # MODE dispatch → api / worker / scheduler
│   │   ├── kernel/                 # Bootstrap: adapter construction, lifecycle
│   │   └── runtimes/               # api.ts, worker.ts, scheduler.ts
│   ├── framework/
│   │   ├── adapters/               # db/ (Kysely/PgBouncer), auth/ (Keycloak),
│   │   │                           #   memorycache/ (Redis), objectstorage/ (MinIO)
│   │   └── runtime/services/       # Service packages: iam, metadata, records,
│   │                               #   finance, jobs, workflow, content, audit, …
│   └── db/
│       ├── sql/                    # Ordered DDL (00_extensions → 12_function_security)
│       │   └── 900_seed_data/      # System, blueprint, and tenant seed data
│       └── seed/
│           └── migrate.ts          # Three-phase provisioner (run directly with tsx)
├── mesh/                           # Docker Compose infrastructure stack
│   ├── compose/                    # Per-service Compose files
│   ├── config/                     # Service configs (Keycloak, Traefik, Redis ACL, …)
│   ├── env/                        # Environment files (local, staging, prod)
│   └── scripts/                    # up.sh, down.sh, logs.sh, init-data.sh
├── perf/k6/                        # k6 load test scripts
├── tooling/tsconfig/               # Shared TypeScript base configs
├── turbo.json                      # Turbo pipeline (build, dev, lint, typecheck, test)
└── pnpm-workspace.yaml             # Workspace package roots
```

### Key package boundaries

| Package name | Path | Purpose |
|---|---|---|
| `@athyper/api-contracts` | `packages/shared/data/contracts` | Shared request/response types; source of truth for API shape |
| `@athyper/api-client` | `packages/shared/data/client` | Typed fetch client (used by web app) |
| `@athyper/entity-runtime` | `packages/shared/runtime/entity` | EntityListPage, EntityDetailPage, EntityRefPicker |
| `@athyper/svc-jobs` | `server/framework/runtime/services/jobs` | BullMQ service wiring, worker framework, DLQ |
| `@athyper/svc-metadata` | `server/framework/runtime/services/metadata` | Entity compiler, descriptors, lookup API |
| `@athyper/svc-records` | `server/framework/runtime/services/records` | Generic CRUD, bulk, import, export, actions |
| `@athyper/svc-iam` | `server/framework/runtime/services/iam` | Auth, session, principals, groups, roles |
| `@athyper/svc-workflow` | `server/framework/runtime/services/workflow` | WorkflowEngine, approver resolver, SLA |

### Runtime modes

The server binary has three modes, selected by the `MODE` env var:

| MODE | What starts | Use |
|------|-------------|-----|
| `api` (default) | Express + all routes + workers | Local dev and production API pods |
| `worker` | BullMQ workers only, no HTTP | Dedicated worker pods in k8s |
| `scheduler` | Repeatable job registration only | Dedicated scheduler pod |

---

## 3. Local Environment Setup

### Step 1 — Start the infrastructure stack

```bash
cd mesh/scripts
bash up.sh        # choose 'local' when prompted
bash init-data.sh # initialise DB schema + Keycloak realm
```

This brings up: PostgreSQL 16, PgBouncer, Redis, Keycloak, MinIO, Traefik, Prometheus, Grafana, Loki.

Access points after `up.sh`:

| Service | URL |
|---------|-----|
| API server (dev) | http://localhost:4000 |
| Web app (dev) | http://localhost:3000 |
| Keycloak admin | https://iam.mesh.athyper.local |
| Bull Board (jobs UI) | http://localhost:4000/admin/jobs |
| Grafana | http://metrics.mesh.athyper.local |

### Step 2 — Install dependencies

```bash
pnpm install
```

### Step 3 — Run migrations

```bash
# Requires DATABASE_ADMIN_URL in server/.env (direct Postgres, not PgBouncer)
cd server
tsx db/seed/migrate.ts --all
```

Migration phases:

| Flag | What it runs |
|------|-------------|
| `--phase=1` | DDL: schemas, tables, constraints, indexes, triggers, views, RLS |
| `--phase=2` | System seed: control data, lookup codes, system principals |
| `--phase=3` | Blueprint + tenant seed: industry blueprints, demo org |
| `--all` | All three phases in sequence |
| `--force` | Re-run even if SQL checksum is unchanged |
| `--status` | Show which files have run and their checksums |
| `--reset` | Drop all schemas — **destructive, local dev only** |

### Step 4 — Start development servers

```bash
# All packages in parallel (via Turbo)
pnpm dev

# Scoped:
pnpm dev --filter @athyper/runtime-server   # API + workers
pnpm dev --filter @athyper/web              # Next.js frontend
```

---

## 4. How to Add a New Entity

An "entity" is a tenant-scoped business object managed by the generic records API. Adding one requires four steps: DDL, seed registration, RLS policy, and optionally a service-specific route.

### Step 1 — Write the DDL

Create or extend a file in `server/db/sql/04_tables/`.

```sql
-- server/db/sql/04_tables/003g_master_my_entity.sql
CREATE TABLE IF NOT EXISTS master.my_entity (
    id           uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id    uuid         NOT NULL,
    code         text         NOT NULL,
    name         text         NOT NULL,
    status       text         NOT NULL DEFAULT 'active',
    is_active    boolean      GENERATED ALWAYS AS (status = 'active') STORED,
    created_at   timestamptz  NOT NULL DEFAULT now(),
    created_by   uuid         NOT NULL,
    updated_at   timestamptz,
    updated_by   uuid,
    CONSTRAINT my_entity_pkey              PRIMARY KEY (id),
    CONSTRAINT my_entity_tenant_code_uq    UNIQUE (tenant_id, code),
    CONSTRAINT my_entity_status_chk        CHECK (status IN ('active', 'deprecated'))
);

COMMENT ON TABLE master.my_entity IS 'Describe what this entity represents.';
```

Naming conventions:
- Schema: `master` (reference/config), `document` (transactional records), `ledger` (finance)
- IDs: always `uuid DEFAULT shared.uuidv7()`
- Every table must have `tenant_id uuid NOT NULL` for RLS isolation
- Status column + `is_active` generated column is the standard lifecycle pattern

### Step 2 — Register in control tables (seed data)

Add a seed file to `server/db/sql/900_seed_data/010_system/`.

```sql
-- Register the entity in the metadata registry
INSERT INTO control.entity (id, code, name, table_name, display_name, primary_key,
                             tenant_scoped, schema_version, created_by)
VALUES (
    shared.uuidv7(),
    'MyEntity',               -- entity_code used in API routes (/records/MyEntity/…)
    'my_entity',              -- snake_case internal name
    'master.my_entity',       -- fully-qualified table name
    'My Entity',              -- human label
    'id',
    true,
    1,
    '<system-principal-uuid>'
);

-- Register fields (add one row per column the UI/API should know about)
INSERT INTO control.entity_field
    (entity_id, name, column_name, data_type, label,
     is_required, is_visible, is_searchable, sort_order, created_by)
VALUES
    ('<entity-uuid>', 'code',   'code',   'text', 'Code',   true, true, true,  1, '<system-principal-uuid>'),
    ('<entity-uuid>', 'name',   'name',   'text', 'Name',   true, true, true,  2, '<system-principal-uuid>'),
    ('<entity-uuid>', 'status', 'status', 'text', 'Status', true, true, false, 3, '<system-principal-uuid>');
```

### Step 3 — Add an RLS policy

Add to the matching file in `server/db/sql/11_rls_policies/`.

```sql
ALTER TABLE master.my_entity ENABLE ROW LEVEL SECURITY;

CREATE POLICY my_entity_tenant_isolation ON master.my_entity
  FOR ALL TO athyperadmin
  USING     (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
```

### Step 4 — Run the migration

```bash
cd server
# DDL only (--force re-runs even if unchanged checksum)
tsx db/seed/migrate.ts --phase=1 --force

# Seed data
tsx db/seed/migrate.ts --phase=2 --force
```

### Step 5 — The descriptor is compiled automatically

The `EntityCompilerService` reads `control.entity` + `control.entity_field` on demand and caches the result in:

- **In-process:** 5-minute TTL (`Map<key, {compiled, fetchedAt}>`)
- **Redis:** `desc:v2:{tenantId}:{entityCode}:ptr` → compiled hash (TTL 300 s)
- **Postgres:** `snapshot.entity_compiled` (warm-start cache across restarts)

The entity is immediately accessible via:

```
GET /api/metadata/entities/MyEntity/compiled
GET /api/records/MyEntity
POST /api/records/MyEntity
```

No code changes are needed in the records service for standard CRUD.

### Step 6 — Verify RLS isolation

```bash
pnpm --filter @athyper/runtime-server rls:verify
```

This script inserts rows for two tenants as superuser, opens restricted sessions, and asserts cross-tenant rows are invisible.

---

## 5. How to Add a New BullMQ Worker

### Worker file

Create a file in `server/framework/runtime/services/jobs/workers/`.

```typescript
// server/framework/runtime/services/jobs/workers/my-feature.worker.ts
import { Worker } from "bullmq";
import type { Job, ConnectionOptions } from "bullmq";
import type { Kysely } from "kysely";
import { insertDlq, DLQ_TABLE } from "../dlq.middleware.js";
import type { JobLogger } from "../jobs.types.js";

export interface MyFeatureJobData {
  tenantId: string;
  entityId: string;
}

export class MyFeatureWorker {
  readonly queueName  = "jobs-my-feature";
  readonly workerName = "my-feature-worker";

  private worker: Worker | null = null;

  constructor(
    private readonly db:         Kysely<Record<string, unknown>>,
    private readonly connection: ConnectionOptions,
    private readonly logger?:    JobLogger,
  ) {}

  async init(): Promise<void> {
    this.worker = new Worker<MyFeatureJobData>(
      this.queueName,
      (job) => this.process(job),
      { connection: this.connection, concurrency: 5 },
    );
    this.worker.on("failed", (job, err) => {
      this.logger?.error("my_feature_job_failed", { jobId: job?.id, err: String(err) });
    });
  }

  private async process(job: Job<MyFeatureJobData>): Promise<void> {
    const { tenantId, entityId } = job.data;
    try {
      // --- your processing logic here ---
    } catch (err) {
      await insertDlq(this.db, DLQ_TABLE.NOTIFICATION, {
        tenantId,
        queueName:       this.queueName,
        jobName:         job.name,
        payload:         job.data,
        errorMessage:    (err as Error).message,
        retryCount:      job.attemptsMade,
        lastAttemptedAt: new Date().toISOString(),
      });
      throw err; // re-throw so BullMQ marks the job as failed and retries
    }
  }

  async shutdown(): Promise<void> {
    await this.worker?.close();
  }
}
```

### DLQ constants

```typescript
export const DLQ_TABLE = {
  AUDIT:        "log.audit_dlq",
  NOTIFICATION: "log.notification_dlq",
  RENDER:       "log.render_dlq",
} as const;
```

Add a new entry if your worker needs its own DLQ table.

### Register in the worker runtime

Open `server/src/runtimes/worker.ts` and instantiate your worker:

```typescript
import { MyFeatureWorker } from "@athyper/svc-my-feature";

const myWorker = new MyFeatureWorker(_db, jobs.connection, logger);
await myWorker.init();
lifecycle.onShutdown(() => myWorker.shutdown());
```

### Optional: schedule with cron

```sql
INSERT INTO control.cron_schedule
    (id, code, name, cron_expression, queue_name, job_name, payload, is_active, created_by)
VALUES (
    'sched:my-feature-daily',
    'my_feature_daily',
    'My Feature Daily Run',
    '0 3 * * *',                     -- 03:00 UTC daily
    'jobs-my-feature',
    'run',
    '{}',
    true,
    '<system-principal-uuid>'
);
```

### Existing workers (reference)

| Worker file | Queue | Schedule | Purpose |
|-------------|-------|----------|---------|
| `domain-outbox.worker.ts` | `jobs-domain-outbox` | Every 30 s | Relay transactional outbox events |
| `notification.worker.ts` | `jobs-notifications` | On-demand | Email + webhook notifications |
| `import.worker.ts` | `jobs-import` | On-demand | Bulk XLSX/CSV import processing |
| `render-document.worker.ts` | `jobs-render` | On-demand | PDF/HTML document rendering |
| `partition-archive.worker.ts` | `jobs-partition-archive` | 1st of month 02:00 UTC | Archive old audit log partitions |
| `webhook-delivery.worker.ts` | `jobs-webhook` | On-demand | HMAC-signed outbound webhook delivery |
| `sla-check.worker.ts` | `jobs-sla-check` | Every 5 min | SLA breach + stuck item detection |
| `kc-sync.worker.ts` | `jobs-iam-kc-sync` | Every 15 min | Sync Keycloak → `master.principal` |

---

## 6. Testing

### Unit tests (Vitest)

```bash
pnpm --filter @athyper/runtime-server test
pnpm --filter @athyper/runtime-server test -- --watch
pnpm --filter @athyper/runtime-server test -- --coverage
```

### RLS integration verification

```bash
pnpm --filter @athyper/runtime-server rls:verify
```

Run after: adding a new table with `ENABLE ROW LEVEL SECURITY`, changing an existing RLS policy, or before submitting a PR that touches DDL.

### Field security verification

```bash
pnpm --filter @athyper/runtime-server field-security:verify
```

### k6 load tests

```bash
k6 run perf/k6/43-03-descriptor-cache.k6.js \
    -e BASE_URL=http://localhost:4000 \
    -e TOKEN_TENANT_A=<token> \
    -e ORG_TENANT_A=<org-id>
```

Scripts available: `43-03` (descriptor cache), `43-04` (outbox drain), `43-05` (workflow engine), `43-06` (partition lifecycle), `43-07` (field security overhead).

---

## 7. PR Workflow

### Branch naming

```
feat/<module>/<short-description>
fix/<module>/<short-description>
refactor/<module>/<description>
chore/<description>
docs/<description>
```

### Before opening a PR

```bash
pnpm lint
pnpm typecheck
pnpm test
```

For PRs touching DDL: `pnpm --filter @athyper/runtime-server rls:verify`

### Commit message format

```
<type>(<scope>): <subject>

# Types: feat, fix, refactor, chore, docs, perf, test
# Scope: records, iam, jobs, metadata, finance, workflow, …
```

### PR description checklist

- [ ] Linked to the relevant sprint task (e.g. `46-01`)
- [ ] Migrations included if DDL changed
- [ ] `rls:verify` passed if tables added/modified
- [ ] `typecheck` and `test` green locally
- [ ] Breaking changes noted in description

### Review + merge

- Minimum one approval required
- Squash-merge to `main`; the merge commit message becomes the changelog entry
- Feature branches deleted after merge

---

## 8. Common Pitfalls

Issues surfaced during Sprint 45 new-dev validation:

### Zod 4 `z.record()` signature change

Zod 4 changed the single-argument form: `z.record(valueSchema)` is now interpreted as **key schema**, not value schema. Always use the two-argument form:

```typescript
// Wrong (Zod 4)
z.record(z.string())          // this is the KEY schema, not value

// Correct
z.record(z.string(), z.string())    // key schema, value schema
```

### `DATABASE_URL` vs `DATABASE_ADMIN_URL`

`DATABASE_URL` points to PgBouncer (port 6432) — used by the API server at runtime. `DATABASE_ADMIN_URL` points directly to Postgres (port 5432) — **required** for `migrate.ts` because DDL statements and prepared statements cannot run over PgBouncer in transaction-pooling mode.

### Windows: `localhost` vs `127.0.0.1`

On Windows, `localhost` resolves to `::1` (IPv6) but the Docker container binds to `0.0.0.0` (IPv4). Use `127.0.0.1` explicitly in all connection strings when running locally on Windows.

### Keycloak TLS on local mesh

The local mesh uses a self-signed certificate for `iam.mesh.athyper.local`. Set `NODE_TLS_REJECT_UNAUTHORIZED=0` in `server/.env` for local development only. Never set this in staging or production.

### Descriptor cache lag

After adding/modifying entity fields in the DB, the compiled descriptor can be stale for up to 5 minutes (in-process TTL). Force a fresh compile with:

```bash
# Flush Redis pointer, then GET /compiled to re-compile
redis-cli DEL "desc:v2:<tenantId>:<entityCode>:ptr"
```

Or just restart the dev server — it compiles on first request.

### BullMQ queue naming

Queue names in `control.cron_schedule.queue_name` must **exactly** match the `queueName` property in the worker class. A mismatch means the scheduled job enqueues to a queue with no active consumer — it will appear in Bull Board as active but never run.
