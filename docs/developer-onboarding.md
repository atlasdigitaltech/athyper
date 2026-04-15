# Developer Onboarding Guide

**Audience:** New engineers joining the athyper platform team.  
**Last updated:** 2026-04-15

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Monorepo Structure](#2-monorepo-structure)
3. [Local Environment Setup](#3-local-environment-setup)
4. [How to Add a New Entity](#4-how-to-add-a-new-entity)
5. [How to Add a New BullMQ Worker](#5-how-to-add-a-new-bullmq-worker)
6. [Testing](#6-testing)
7. [PR Workflow](#7-pr-workflow)

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
| `DATABASE_ADMIN_URL` | Direct Postgres connection (migrations only — port 5432, not pooler) | `postgresql://athyperadmin:athyperadmin@127.0.0.1:5432/athyper_dev1` |
| `REDIS_URL` | Redis URL | `redis://app:athyperadmin@127.0.0.1:6379/0` |
| `KEYCLOAK_BASE_URL` | Keycloak instance | `https://iam.mesh.athyper.local` |
| `KEYCLOAK_REALM` | Realm name | `athyper` |
| `KEYCLOAK_CLIENT_ID` | API client ID | `athyper-api-runtime` |
| `KEYCLOAK_CLIENT_SECRET` | API client secret | *(ask team)* |
| `NODE_TLS_REJECT_UNAUTHORIZED` | Disable TLS check for self-signed mesh certs | `0` |

> **Windows note:** Use `127.0.0.1` instead of `localhost` for `DATABASE_URL`, `DATABASE_ADMIN_URL`, and `REDIS_URL` to avoid IPv6/IPv4 binding mismatches.

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
│   └── scripts/
│       ├── setup/                  # First-time setup: create-data-dirs, setup-env, …
│       ├── stack/                  # Daily use: up.sh, down.sh, logs.sh
│       └── db/                     # DB ops: seed-db.sh, import-iam.sh, export-iam.sh
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

> **Step order matters.** Install dependencies first — `tsx` (used for migrations) is a
> workspace devDependency installed by `pnpm install`.

### Step 1 — Install dependencies

```bash
pnpm install
```

### Step 2 — Copy environment files

```bash
cp server/.env.example server/.env
# Edit server/.env: at minimum set KEYCLOAK_CLIENT_SECRET (ask team)
```

### Step 3 — First-time mesh setup (run once)

```bash
# 1. Create the data directories Docker volume-mounts expect
bash mesh/scripts/setup/create-data-dirs.sh

# 2. Copy the local env template into mesh/env/.env
bash mesh/scripts/setup/setup-env.sh local
```

### Step 4 — Start the infrastructure stack

```bash
bash mesh/scripts/stack/up.sh
# When prompted for a profile, press Enter to accept the default (mesh)
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

> **Local hostnames:** For `.athyper.local` hostnames to resolve, add them to your hosts file
> (`C:\Windows\System32\drivers\etc\hosts` on Windows, `/etc/hosts` on Linux/macOS).
> See `mesh/README.md` for the full list.

### Step 5 — Run migrations

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

### Step 6 — Start development servers

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

Create or extend a file in [server/db/sql/04_tables/](server/db/sql/04_tables/).

```sql
-- server/db/sql/04_tables/003g_master_my_entity.sql
CREATE TABLE IF NOT EXISTS master.my_entity (
    id           uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id    uuid         NOT NULL,
    code         text         NOT NULL,
    name         text         NOT NULL,
    status       text         NOT NULL DEFAULT 'ACTIVE',
    is_active    boolean      GENERATED ALWAYS AS (status = 'ACTIVE') STORED,
    created_at   timestamptz  NOT NULL DEFAULT now(),
    created_by   uuid         NOT NULL,
    updated_at   timestamptz,
    updated_by   uuid,
    CONSTRAINT my_entity_pkey              PRIMARY KEY (id),
    CONSTRAINT my_entity_tenant_code_uq    UNIQUE (tenant_id, code),
    CONSTRAINT my_entity_status_chk        CHECK (status IN ('ACTIVE', 'DEPRECATED'))
);

COMMENT ON TABLE master.my_entity IS 'Describe what this entity represents.';
```

Naming conventions:
- Schema: `master` (reference/config), `document` (transactional records), `ledger` (finance)
- IDs: always `uuid DEFAULT shared.uuidv7()`
- Every table must have `tenant_id uuid NOT NULL` for RLS isolation
- Status column + `is_active` generated column is the standard lifecycle pattern

### Step 2 — Register in control tables (seed data)

Add a seed file to [server/db/sql/900_seed_data/010_system/002_control/](server/db/sql/900_seed_data/010_system/002_control/).

**Model your file on an existing example** — see
`server/db/sql/900_seed_data/010_system/002_control/007_upupr_entity_registration.sql`
for the canonical pattern used throughout the codebase.

> **System principal UUID:** The `created_by` field in all system seed data uses
> `'00000000-0000-0000-0000-000000000000'` — the platform bootstrap principal. Never
> substitute a real user UUID in seed files.

Minimal skeleton (adapt columns to your entity's actual schema):

```sql
-- server/db/sql/900_seed_data/010_system/002_control/XXX_my_entity_registration.sql
-- Idempotent: WHERE NOT EXISTS guard on every insert.

-- 1. Register the entity in the metadata registry
INSERT INTO control.entity (
    module_id, name, entity_short,
    entity_class, ownership_model, kind, backing_type,
    governance_level, security_tier, mutability,
    table_schema, table_name,
    label_singular, label_plural, icon_key, color_token,
    numbering_active, naming_policy, feature_flags,
    status, created_by)
SELECT
    (SELECT id FROM shared.module WHERE code = 'CORE'),  -- replace with your module code
    'my_entity', 'MYENT',
    'MASTER', 'tenant', 'ent', 'table',
    'standard', 'operational', 'controlled',
    'master', 'my_entity',
    'My Entity', 'My Entities', 'box', 'slate',
    true, '{}'::jsonb, '{}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
    WHERE table_schema = 'master' AND table_name = 'my_entity'
);

-- 2. Register an entity_version (required before adding fields)
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'master' AND e.table_name = 'my_entity'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;

-- 3. Register fields (one row per column the API/UI should know about)
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, is_required, is_filterable,
    sort_order, created_by)
SELECT ev.id,
    'code', 'code', 'Code', 'text',
    'one', 'business', true, true, 1,
    '00000000-0000-0000-0000-000000000000'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  e.table_schema = 'master' AND e.table_name = 'my_entity'
  AND  ev.version_no = 1
ON CONFLICT DO NOTHING;
-- Repeat the INSERT above for each additional field (name, status, …)
```

### Step 3 — Add an RLS policy

Add to the matching file in [server/db/sql/11_rls_policies/](server/db/sql/11_rls_policies/).

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

Create a file in [server/framework/runtime/services/jobs/workers/](server/framework/runtime/services/jobs/workers/).

```typescript
// server/framework/runtime/services/jobs/workers/my-feature.worker.ts
import { Worker } from "bullmq";
import type { Job, ConnectionOptions } from "bullmq";
import type { Kysely } from "kysely";
import { insertDlq, DLQ_TABLE } from "../dlq.middleware.js";
import type { JobLogger } from "../jobs.types.js";

// ─── Job data shape ────────────────────────────────────────────────────────────

export interface MyFeatureJobData {
  tenantId: string;
  entityId: string;
}

// ─── Worker ───────────────────────────────────────────────────────────────────

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
      // Persist to DLQ so ops can inspect and replay
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

Available DLQ table constants (from [server/framework/runtime/services/jobs/dlq.middleware.ts](server/framework/runtime/services/jobs/dlq.middleware.ts)):

```typescript
export const DLQ_TABLE = {
  AUDIT:        "log.audit_dlq",
  NOTIFICATION: "log.notification_dlq",
  RENDER:       "log.render_dlq",
} as const;
```

Add a new entry if your worker needs its own DLQ table, and add the corresponding `CREATE TABLE` in the DDL.

### Register in the worker runtime

Open [server/src/runtimes/worker.ts](server/src/runtimes/worker.ts) and instantiate your worker:

```typescript
import { MyFeatureWorker } from "@athyper/svc-my-feature";

const myWorker = new MyFeatureWorker(_db, jobs.connection, logger);
await myWorker.init();
lifecycle.onShutdown(() => myWorker.shutdown());
```

### Optional: schedule with cron

If the worker runs on a recurring schedule (not triggered by API calls), add a row to `control.cron_schedule` in the seed data:

```sql
INSERT INTO control.cron_schedule
    (id, code, name, cron_expression, queue_name, job_name, payload, is_active, created_by)
VALUES (
    'sched:my-feature-daily',        -- stable ID; used by scheduler to register the repeatable
    'my_feature_daily',
    'My Feature Daily Run',
    '0 3 * * *',                     -- 03:00 UTC daily
    'jobs-my-feature',
    'run',
    '{}',
    true,
    '00000000-0000-0000-0000-000000000000'
);
```

### Existing workers (reference)

| Worker file | Queue | Schedule | Purpose |
|-------------|-------|----------|---------|
| `domain-outbox.worker.ts` | `jobs-domain-outbox` | Every 30 s | Relay transactional outbox events (fin/wf/audit) |
| `notification.worker.ts` | `jobs-notifications` | On-demand | Email + webhook notifications |
| `import.worker.ts` | `jobs-import` | On-demand | Bulk XLSX/CSV import processing |
| `render-document.worker.ts` | `jobs-render` | On-demand | PDF/HTML document rendering |
| `partition-archive.worker.ts` | `jobs-partition-archive` | 1st of month 02:00 UTC | Archive old audit log partitions |
| `webhook-delivery.worker.ts` | `jobs-webhook` | On-demand | HMAC-signed outbound webhook delivery |
| `sla-check.worker.ts` | `jobs:sla-check` | Every 5 min | SLA breach detection + auto-actions + stuck item detection |
| `kc-sync.worker.ts` | `jobs-iam-kc-sync` | Every 15 min | Sync Keycloak user state → `master.principal` |
| `cms-preview.worker.ts` | `jobs-cms-preview` | On-demand | CMS content preview generation |
| `lifecycle-timer.worker.ts` | `jobs:lifecycle-timers` | On-demand | Fire entity lifecycle timer events |

---

## 6. Testing

### Unit tests (Vitest)

Tests live in `__tests__/` subdirectories next to the source they test.

```bash
# Run all server tests
pnpm --filter @athyper/runtime-server test

# Watch mode
pnpm --filter @athyper/runtime-server test -- --watch

# Coverage report
pnpm --filter @athyper/runtime-server test -- --coverage

# Single file
pnpm --filter @athyper/runtime-server test -- bootstrap.test.ts
```

Vitest configuration: [server/vitest.config.ts](server/vitest.config.ts). Globals are enabled (`describe`, `it`, `expect`, `vi` available without imports).

**Test doubles:** Prefer `vi.fn()` mocks over real database connections in unit tests. Integration tests that need a DB hit a dedicated test database (set `DATABASE_URL` in your test environment).

### RLS integration verification

Verifies that every table's Row Level Security policy correctly isolates tenant data:

```bash
pnpm --filter @athyper/runtime-server rls:verify
```

Run this after:
- Adding a new table with `ENABLE ROW LEVEL SECURITY`
- Changing an existing RLS policy
- Before submitting a PR that touches DDL

### Field security verification

Verifies that field-level read/write permission policies are enforced:

```bash
pnpm --filter @athyper/runtime-server field-security:verify
```

### k6 load tests

Load test scripts live in [perf/k6/](perf/k6/). Require [k6](https://k6.io/docs/getting-started/installation/) installed locally.

```bash
# Descriptor cache performance
k6 run perf/k6/43-03-descriptor-cache.k6.js \
    -e BASE_URL=http://localhost:4000 \
    -e TOKEN_TENANT_A=<token> \
    -e ORG_TENANT_A=<org-id>

# Outbox drain throughput
k6 run perf/k6/43-04-outbox-drain.k6.js -e BASE_URL=http://localhost:4000 ...

# Workflow engine concurrency
k6 run perf/k6/43-05-workflow-engine.k6.js ...

# Partition archive lifecycle
k6 run perf/k6/43-06-partition-lifecycle.k6.js ...

# Field security overhead
k6 run perf/k6/43-07-field-security.k6.js ...
```

Each script documents its required env vars in the header comment.

---

## 7. PR Workflow

### Branch naming

```
feat/<module>/<short-description>    # new feature
fix/<module>/<short-description>     # bug fix
refactor/<module>/<description>      # refactoring, no behaviour change
chore/<description>                  # tooling, config, deps
docs/<description>                   # documentation only
```

### Before opening a PR

Run the full gate locally:

```bash
pnpm lint       # ESLint across all packages
pnpm typecheck  # TypeScript strict check
pnpm test       # Vitest unit tests
```

All three must pass. The CI pipeline runs the same commands and will block the PR on failure.

For PRs touching DDL:

```bash
pnpm --filter @athyper/runtime-server rls:verify
```

### Commit message format

```
<type>(<scope>): <subject>

# Types: feat, fix, refactor, chore, docs, perf, test
# Scope: module number or area — e.g. records, iam, jobs, metadata, finance
```

Examples:
```
feat(records): add bulk-delete endpoint with tenant guard
fix(workflow): release orphaned work_item lock on pod restart
chore(deps): upgrade bullmq to 5.4
```

### PR description checklist

- [ ] Linked to the relevant sprint task (e.g. `44-10`)
- [ ] Migrations included if DDL changed
- [ ] `rls:verify` passed if tables added/modified
- [ ] `typecheck` and `test` green locally
- [ ] Breaking changes noted in description

### Review + merge

- Minimum one approval required
- Squash-merge to `main`; the merge commit message becomes the changelog entry
- Feature branches are deleted after merge
