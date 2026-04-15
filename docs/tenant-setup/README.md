# Tenant Provisioning Guide

**Audience:** Platform engineers, DevOps, and solution architects responsible for provisioning new tenants on the athyper platform.  
**Status:** Final — validated against `migrate.ts` execution, published Sprint 46  
**Last updated:** 2026-04-15  
**Linked from:** `GET /docs` (Swagger UI → Guides → Tenant Provisioning)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Prerequisites](#2-prerequisites)
3. [Quick Start](#3-quick-start)
4. [Phase 1 — DDL](#4-phase-1--ddl)
5. [Phase 2 — System Seed](#5-phase-2--system-seed)
6. [Phase 3 — Blueprint + Tenant Seed](#6-phase-3--blueprint--tenant-seed)
7. [migrate.ts CLI Reference](#7-migratets-cli-reference)
8. [Adding a New Tenant](#8-adding-a-new-tenant)
9. [Blueprint Industry Packs](#9-blueprint-industry-packs)
10. [Idempotency + Re-run Safety](#10-idempotency--re-run-safety)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Overview

The athyper provisioner uses a **three-phase seed system** to build a fully initialised tenant database from a clean PostgreSQL instance. All provisioning is driven by a single script:

```
server/db/seed/migrate.ts
```

The three phases are strictly ordered and each is idempotent:

| Phase | Label | Directories | When to run |
|-------|-------|-------------|-------------|
| 1 | DDL | `server/db/sql/00_extensions/` → `12_function_security/` | First deploy, schema upgrades |
| 2 | System Seed | `server/db/sql/900_seed_data/010_system/` | First deploy, adding new lookup codes |
| 3 | Blueprint + Tenant Seed | `900_seed_data/020_blueprint/` + `030_tenant/` | Tenant provisioning, blueprint updates |

**Key properties:**
- All seed files use `ON CONFLICT DO UPDATE` (or `DO NOTHING`) — safe to re-run
- File execution is tracked in a `migrations.executed` table by SHA-256 checksum
- Files are collected and executed in **lexicographic sort order** within each phase directory

---

## 2. Prerequisites

| Requirement | Notes |
|-------------|-------|
| `DATABASE_ADMIN_URL` env var | **Direct** Postgres connection (not PgBouncer). Port 5432. Required for DDL. |
| `tsx` | Installed globally or via `pnpm exec tsx`. Part of the dev dependency set. |
| Postgres superuser | The database user in `DATABASE_ADMIN_URL` must be superuser or have `CREATE SCHEMA` privilege. |
| PostgreSQL ≥ 16 | Required for JSON_TABLE, generated columns, and partition pruning features. |

Verify:

```bash
psql "$DATABASE_ADMIN_URL" -c "SELECT version();"
tsx --version
```

---

## 3. Quick Start

To provision a brand-new tenant database from scratch:

```bash
cd server

# 1. Run all three phases sequentially
tsx db/seed/migrate.ts --all

# 2. Verify status
tsx db/seed/migrate.ts --status
```

The `--status` output shows each SQL file, its phase, checksum, and last-run timestamp.

---

## 4. Phase 1 — DDL

Phase 1 creates the full database structure: schemas, tables, constraints, indexes, triggers, views, and Row Level Security policies. Files are executed in this order:

| Directory | Purpose |
|-----------|---------|
| `00_extensions/` | `uuid-ossp`, `pgcrypto`, `pg_trgm`, `pg_stat_statements` |
| `01_schemas/` | Schema declarations: `shared`, `master`, `control`, `document`, `ledger`, `log`, `snapshot`, `event`, `governance` |
| `02_types_domains/` | Custom domains and enum types |
| `03_bootstrap_functions/` | `shared.uuidv7()`, audit helpers, trigger utilities |
| `04_tables/` | All table definitions (~160 tables across 9 schemas) |
| `05_pre_constraint_functions/` | Functions needed before constraint creation |
| `06_constraints/` | Foreign keys and deferred constraints |
| `07_indexes/` | GIN indexes (FTS), BRIN (time-series), B-tree composites |
| `08_functions/` | Business logic functions, PL/pgSQL helpers |
| `09_triggers/` | Audit triggers, compile triggers, validation gates |
| `10_views/` | Reporting views, materialized views |
| `11_rls_policies/` | Row Level Security policies for every tenant-scoped table |
| `12_function_security/` | SECURITY DEFINER grants and search path hardening |

Run Phase 1 only:

```bash
tsx db/seed/migrate.ts --phase=1
```

> **Important:** Phase 1 must complete successfully before running Phases 2 or 3. Phase 1 is the only phase that requires a superuser connection; Phases 2 and 3 can run with a role that has `INSERT`/`UPDATE` on the seed tables.

### Schema layout

| Schema | Contents |
|--------|---------|
| `shared` | UUIDv7 generator, cross-schema utilities |
| `master` | Reference and configuration data (entities, principals, org structure) |
| `control` | Platform control plane (entity metadata, policies, workflow templates, cron schedules) |
| `document` | Transactional records (journals, invoices, payables, content items) |
| `ledger` | Financial ledger (GL entries, account balances, trial balance views) |
| `log` | Audit logs, DLQ tables, workflow event log |
| `snapshot` | Compiled descriptor cache (`entity_compiled`) |
| `event` | Outbox, work items, activity log |
| `governance` | Legal holds, certification cycles, moderation queue |

---

## 5. Phase 2 — System Seed

Phase 2 loads platform-wide reference data that applies to all tenants. This includes:

- **Lookup domains** — all enumerated value sets consumed by `GET /api/records/:entity/lookup/:domain` (e.g., `entity_class`, `field_data_type`, `bank_format_rule_direction`, `notification_channel`)
- **System principals** — the bootstrap `system` principal (UUID fixed at provisioning time)
- **Module registry** — the 12 product modules and their metadata
- **Connector type definitions** — base connector type records

Run Phase 2 only:

```bash
tsx db/seed/migrate.ts --phase=2
```

Phase 2 is safe to re-run after adding new lookup codes — existing codes are untouched (`ON CONFLICT DO NOTHING`).

---

## 6. Phase 3 — Blueprint + Tenant Seed

Phase 3 is split into two sub-phases that run together:

### 6.1 Blueprint seed (`020_blueprint/`)

Blueprints are industry-specific configurations applied at tenant provisioning time. The directory structure:

```
020_blueprint/
├── 000_registry/          # Blueprint registry record
├── 000_tenant/            # ATHYPER Group blueprint tenant (base config)
├── 010_base/              # Base platform configuration
├── 100_industry_packs/    # 16 industry pack SQL files (see §9)
├── 200_coa_frameworks/    # Chart of accounts (IFRS, local GAAP variants)
└── 300_defaults/          # Bank format rules, payment network defaults
```

Blueprint files execute first (lexicographically before `030_tenant/`). They insert records that the tenant seed data may reference.

### 6.2 Tenant seed (`030_tenant/`)

Tenant seed files set up the specific legal structure, financial configuration, and operating data for the provisioned tenant:

```
030_tenant/
├── 000_tenant/            # Tenant record + tenant profile
├── 100_org_structure/
│   ├── 199_gl_preseed.sql         # GL account pre-population
│   ├── 200_demo_legal_entities.sql
│   ├── 201_athyper_subsidiaries.sql
│   ├── 300_operating_units.sql
│   ├── 301_cost_centers.sql
│   ├── 302_profit_centers.sql
│   ├── 303_sites.sql
│   ├── 304_warehouses.sql
│   ├── 310_fiscal_periods.sql     # FY2024–FY2026 periods
│   └── 311_ledger_books.sql       # GL ledger books per legal entity
├── 200_finance/           # Company chart assignments, validation assertions
├── 300_tax/               # Tax jurisdictions, types, rate schedules, FX rates
├── 400_payments/          # Holiday calendars, payment terms
├── 500_asset/             # Asset classes
├── 800_subscriptions/     # Module subscriptions (which modules the tenant has licensed)
├── 900_principals/        # Demo principals, personas, delegation grants
└── 950_rbac/              # Role bindings for demo principals
```

Run Phase 3 only:

```bash
tsx db/seed/migrate.ts --phase=3
```

---

## 7. `migrate.ts` CLI Reference

The provisioner is run directly with `tsx` from the `server/` directory:

```bash
cd server
tsx db/seed/migrate.ts [options]
```

| Option | Description |
|--------|-------------|
| `--all` | Run all three phases sequentially (1 → 2 → 3) |
| `--phase=1` | DDL only |
| `--phase=2` | System seed only |
| `--phase=3` | Blueprint + Tenant seed only |
| `--status` | Print execution status of every SQL file (key, phase, checksum, last-run timestamp) |
| `--force` | Re-execute all files in the selected phase even if checksum is unchanged |
| `--reset` | **DESTRUCTIVE** — drops all schemas and truncates the `migrations.executed` table. Local dev only. |
| `--phase=1 --force` | Force-re-run DDL only |

### Environment variables

| Variable | Required | Description |
|----------|---------|-------------|
| `DATABASE_ADMIN_URL` | Yes | Direct Postgres connection. Must not be PgBouncer. |

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success — all files executed or already up-to-date |
| 1 | One or more SQL files failed |
| 2 | Missing `DATABASE_ADMIN_URL` |

---

## 8. Adding a New Tenant

To provision a second tenant on the same database cluster (multi-tenant deployment), create tenant-specific seed files and run Phase 3 with `--force`:

### Step 1 — Create the tenant record

Create a new SQL file in `server/db/sql/900_seed_data/030_tenant/000_tenant/`:

```sql
-- 030_tenant/000_tenant/001_acme_tenant.sql
INSERT INTO master.tenant (id, code, name, plan, status, created_by)
VALUES (
    'your-tenant-uuid-here',   -- fixed UUID, must be stable across re-runs
    'ACME',
    'Acme Corporation',
    'enterprise',
    'active',
    '<system-principal-uuid>'
)
ON CONFLICT (id) DO UPDATE SET
    name   = EXCLUDED.name,
    status = EXCLUDED.status;
```

### Step 2 — Seed the org structure

Add files for legal entities, operating units, fiscal periods, and ledger books in `030_tenant/100_org_structure/`, scoped to the new tenant UUID.

### Step 3 — Select an industry blueprint

In `030_tenant/000_tenant/`, add a blueprint assignment:

```sql
-- Assign the ACME tenant to the "trading" industry blueprint
INSERT INTO master.tenant_blueprint (tenant_id, blueprint_code, applied_at)
VALUES ('your-tenant-uuid-here', 'trading', NOW())
ON CONFLICT (tenant_id, blueprint_code) DO NOTHING;
```

Available blueprint codes: see [§9 Industry Packs](#9-blueprint-industry-packs).

### Step 4 — Run Phase 3

```bash
cd server
tsx db/seed/migrate.ts --phase=3 --force
```

The `--force` flag re-runs all Phase 3 files, which applies the new tenant's seed data. Existing tenants are unaffected because all tenant seed files are scoped by `tenant_id`.

### Step 5 — Verify

```bash
psql "$DATABASE_ADMIN_URL" -c "
SELECT t.code, t.name, t.plan, t.status,
       COUNT(DISTINCT le.id) AS legal_entities,
       COUNT(DISTINCT fp.id) AS fiscal_periods
FROM   master.tenant t
LEFT JOIN master.legal_entity le ON le.tenant_id = t.id
LEFT JOIN master.fiscal_period fp ON fp.tenant_id = t.id
WHERE  t.code = 'ACME'
GROUP  BY t.code, t.name, t.plan, t.status;
"
```

---

## 9. Blueprint Industry Packs

The `020_blueprint/100_industry_packs/` directory contains 16 industry-specific COA and configuration packs:

| File | Blueprint code | Industry |
|------|---------------|---------|
| `100_pack_utilities.sql` | `utilities` | Utilities & Energy |
| `101_pack_construction.sql` | `construction` | Construction & Infrastructure |
| `102_pack_real_estate.sql` | `real_estate` | Real Estate & Property |
| `103_pack_transport.sql` | `transport` | Transport & Logistics |
| `104_pack_trading.sql` | `trading` | Trading & Distribution |
| `105_pack_hospitality.sql` | `hospitality` | Hospitality & F&B |
| `106_pack_infocomm.sql` | `infocomm` | Information & Communications Technology |
| `107_pack_financial.sql` | `financial` | Financial Services |
| `108_pack_mfg_textile.sql` | `mfg_textile` | Manufacturing — Textile & Apparel |
| `109_pack_mfg_food_bev.sql` | `mfg_food_bev` | Manufacturing — Food & Beverage |
| `110_pack_mfg_pharma.sql` | `mfg_pharma` | Manufacturing — Pharmaceutical |
| `111_pack_mfg_electronics.sql` | `mfg_electronics` | Manufacturing — Electronics |
| `112_pack_mining_petroleum.sql` | `mining_petroleum` | Mining & Petroleum |
| `113_pack_agriculture.sql` | `agriculture` | Agriculture & Agro-processing |
| `114_pack_education.sql` | `education` | Education & Training |
| `115_pack_healthcare.sql` | `healthcare` | Healthcare & Life Sciences |

Each pack inserts: industry-specific COA accounts, segment codes, default dimension configurations, and posting rule templates. Packs are additive — a tenant can be assigned multiple packs if they span industries.

---

## 10. Idempotency + Re-run Safety

All seed files are written to be safe for re-execution:

- **INSERT … ON CONFLICT DO UPDATE** — updates the row to match the seed if it exists
- **INSERT … ON CONFLICT DO NOTHING** — preserves manually modified rows
- **CREATE TABLE IF NOT EXISTS** and **CREATE INDEX IF NOT EXISTS** in DDL files
- The `migrations.executed` tracking table stores `(key, checksum, executed_at)`. A file is skipped if its checksum matches the last execution. Use `--force` to override.

**Re-run rules:**

| Scenario | Command |
|----------|---------|
| New SQL files added to Phase 1 | `--phase=1` (new files run; existing skipped by checksum) |
| Existing DDL file modified | `--phase=1 --force` (all Phase 1 re-runs) |
| New lookup codes added to Phase 2 | `--phase=2` |
| New tenant seed files added | `--phase=3` |
| Full reprovisioning of a fresh DB | `--all` |
| Debug: inspect what would run | `--status` |

---

## 11. Troubleshooting

### `ERROR: database "athyper_dev1" does not exist`

The database has not been created yet. Run `init-data.sh` from `mesh/scripts/` first, or create it manually:

```sql
CREATE DATABASE athyper_dev1;
```

### `ERROR: permission denied to create schema`

The `DATABASE_ADMIN_URL` user does not have `CREATE SCHEMA` privilege. Grant it:

```sql
GRANT ALL ON DATABASE athyper_dev1 TO athyperadmin;
ALTER USER athyperadmin CREATEDB;
```

### `ERROR: column "x" does not exist` during Phase 2 or 3

Phase 1 did not complete, or a new column was added to a table but Phase 1 wasn't re-run. Fix:

```bash
tsx db/seed/migrate.ts --phase=1 --force
tsx db/seed/migrate.ts --phase=2 --force
tsx db/seed/migrate.ts --phase=3 --force
```

### Phase 3 fails with `ON CONFLICT` key violation

A UUID collision: two seed files are inserting the same `id` for different rows. Check the conflicting seed files and assign distinct UUIDs. All IDs in seed files should be fixed (not `shared.uuidv7()`) so they are stable across re-runs.

### `PgBouncer: prepared statement does not exist`

`DATABASE_ADMIN_URL` is pointing to PgBouncer (port 6432) instead of direct Postgres (port 5432). PgBouncer's transaction-pooling mode does not support prepared statements used by the Postgres client library. Use port **5432**.

### Checking which files ran

```bash
tsx db/seed/migrate.ts --status 2>&1 | grep -E '"phase":(2|3)' | head -30
```

Or query directly:

```sql
SELECT key, checksum, executed_at
FROM   migrations.executed
WHERE  key LIKE '900_seed_data/030_tenant/%'
ORDER  BY executed_at DESC
LIMIT  20;
```
