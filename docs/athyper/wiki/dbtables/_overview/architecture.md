# Database Architecture

## Overview

Athyper uses a single PostgreSQL 16+ database with schema-based logical separation. The database serves a multi-tenant SaaS platform with enterprise-grade features including RBAC, workflow automation, audit compliance, and financial processing.

## Schema Organization

SQL files are organized in domain-grouped subdirectories under `framework/adapters/db/src/sql/`.

### `01_foundation/` — Bootstrap + Platform Schemas (001-042)

| File                            | Schema | Purpose                                                                                           |
| ------------------------------- | ------ | ------------------------------------------------------------------------------------------------- |
| `001_schemas.sql`               | all    | Schema creation + pgcrypto extension                                                              |
| `010_core.sql`                  | `core` | Tenant registry, IAM (principals, roles, groups, OUs), operations, personas, modules              |
| `030_ref.sql`                   | `ref`  | ISO reference data (countries, currencies, languages, timezones, commodity/industry codes)        |
| `040_meta.sql`                  | `meta` | Entity metadata engine: registry, versioning, fields, policies, lifecycles, overlays, permissions |
| `042_meta_entity_operation.sql` | `meta` | Entity operation capabilities (two-tier resolution)                                               |

### `02_security/` — Security (050)

| File          | Schema | Purpose                                                                |
| ------------- | ------ | ---------------------------------------------------------------------- |
| `050_sec.sql` | `sec`  | MFA infrastructure, security events, trusted devices, password history |

### `03_workflow/` — Workflow (060)

| File         | Schema | Purpose                                                                        |
| ------------ | ------ | ------------------------------------------------------------------------------ |
| `060_wf.sql` | `wf`   | Workflow state machines, approval definitions/instances/tasks, timer schedules |

### `04_enterprise/` — Enterprise Entities (070-090)

| File                         | Schema   | Purpose                                                         |
| ---------------------------- | -------- | --------------------------------------------------------------- |
| `070_ent.sql`                | `ent`    | Master data entities (customer, supplier, employee, product)    |
| `071_ent_classification.sql` | `ent`    | Entity classification taxonomies                                |
| `080_doc.sql`                | `doc`    | Document management, templates, brand profiles, render pipeline |
| `090_collab.sql`             | `collab` | Comments, mentions, reactions, messaging, delegation, sharing   |

### `05_content/` — Content & Audit (100-120)

| File             | Schema   | Purpose                                                                    |
| ---------------- | -------- | -------------------------------------------------------------------------- |
| `100_audit.sql`  | `audit`  | Audit logs, workflow events (partitioned), hash anchors, integrity reports |
| `110_notify.sql` | `notify` | Notification pipeline (partitioned), preferences, delivery, suppression    |
| `120_ui.sql`     | `ui`     | User preferences, saved views, dashboard widgets, activity tracking        |

### `06_platform/` — Platform Services (130-160)

| File                     | Schema   | Purpose                                           |
| ------------------------ | -------- | ------------------------------------------------- |
| `130_integration.sql`    | `wf`     | Integration webhooks and external system adapters |
| `140_voice.sql`          | `collab` | Voice/call integration tables                     |
| `150_event_store.sql`    | `evt`    | Event sourcing backbone                           |
| `155_ou_intent.sql`      | `core`   | OU procurement intent declarations                |
| `157_spend_category.sql` | `fin`    | Spend categorization trees                        |
| `160_decision_grid.sql`  | `fin`    | Decision grids for approval routing               |

### `07_finance/` — Finance Domain (161-195)

| File                 | Schema | Purpose                                              |
| -------------------- | ------ | ---------------------------------------------------- |
| `161_asset.sql`      | `fin`  | Fixed asset management                               |
| `162_inventory.sql`  | `fin`  | Inventory management                                 |
| `163_commission.sql` | `fin`  | Commission calculations                              |
| `164_federation.sql` | `fin`  | Multi-entity financial consolidation                 |
| `165_production.sql` | `fin`  | Production/manufacturing                             |
| `166_atlas_ai.sql`   | `fin`  | AI-powered analytics                                 |
| `170_budget.sql`     | `fin`  | Budget engine (headers, lines, periods, allocations) |
| `180_commitment.sql` | `fin`  | Commitment engine (POs, contracts, encumbrances)     |
| `190_posting.sql`    | `fin`  | Posting engine (journal entries, GL)                 |
| `195_tax.sql`        | `fin`  | Tax engine (tax codes, rates, determinations)        |

### `10_seed_standard/` — Standard Seed (200-320)

| File                               | Purpose                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| `200_seed_standard.sql`            | Reference data (ISO countries, currencies, languages), operations, personas, modules, workspaces |
| `201_seed_unspsc.sql`              | UNSPSC commodity codes                                                                           |
| `202_seed_hs.sql`                  | Harmonized System codes                                                                          |
| `300_meta_entity_registration.sql` | Entity metadata registration                                                                     |
| `302_seed_entity_config.sql`       | Entity short codes + operation capabilities                                                      |
| `305_meta_entity_fields.sql`       | Entity field definitions                                                                         |
| `310_meta_entity_policies.sql`     | Entity policies                                                                                  |
| `315_meta_entity_lifecycles.sql`   | Entity lifecycles                                                                                |
| `320_meta_field_security.sql`      | Field-level security                                                                             |

### `11_seed_demo/` — Demo Seed (280-301, `*_demo_*` convention)

| File                               | Purpose                                                  |
| ---------------------------------- | -------------------------------------------------------- |
| `280_seed_demo_tenants.sql`        | 9 demo tenants, users, addresses                         |
| `290-299_seed_demo_*.sql`          | Finance demo data (CoA, fiscal periods, tax codes, etc.) |
| `301_seed_demo_classification.sql` | Classification engine demo config                        |

### IAM Database (separate)

IAM seeding uses JSON realm imports via `mesh/scripts/initdb-iam.sh`:

- `mesh/config/iam/realm-demosetup.json` — athyper realm (clients, users, orgs, roles)
- `mesh/config/iam/realm-platform-control.json` — Platform administration realm

## Multi-Tenancy Architecture

```
                    ┌─────────────────────┐
                    │    core.tenant       │
                    │  (tenant registry)   │
                    └─────────┬───────────┘
                              │ tenant_id FK
              ┌───────────────┼───────────────┐
              │               │               │
     ┌────────▼──────┐  ┌────▼─────┐  ┌──────▼──────┐
     │  Business      │  │  IAM     │  │  Config     │
     │  Entities      │  │  Tables  │  │  Tables     │
     │  (ent, doc,    │  │  (roles, │  │  (meta,     │
     │   wf, fin)     │  │  groups) │  │   ui)       │
     └────────────────┘  └──────────┘  └─────────────┘
```

Every business table includes:

- `tenant_id UUID NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE`
- Composite indexes prefixed with `tenant_id` for query performance

### Tenant Isolation Enforcement

| Layer                | Mechanism                                                        |
| -------------------- | ---------------------------------------------------------------- |
| **Application**      | All queries scoped by `tenant_id` parameter                      |
| **Database (audit)** | Row-Level Security via `athyper.current_tenant` session variable |
| **Database (roles)** | Dedicated roles with INSERT-only / SELECT-only grants            |

## Partitioning Strategy

Three tables use range partitioning by month on timestamp columns:

| Table                      | Partition Key     | Auto-Create                |
| -------------------------- | ----------------- | -------------------------- |
| `audit.workflow_event_log` | `event_timestamp` | `pg_cron` on 25th of month |
| `notify.notification`      | `created_at`      | DDL block at deploy time   |
| `notify.delivery`          | `created_at`      | DDL block at deploy time   |

Partitions follow the naming convention: `{table}_{YYYY}_{MM}`

## Provisioning System

SQL files are applied via a checksum-tracked provisioning system:

1. **Table**: `public.schema_provisions` tracks which files have been applied
2. **CLI**: `src/seed/seed.ts` computes SHA-256 of each SQL file
3. **Idempotency**: All DDL uses `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`
4. **Ordering**: File numeric prefixes ensure dependency order

## Security Architecture

### Database Roles

| Role                   | Permissions                          | Purpose                     |
| ---------------------- | ------------------------------------ | --------------------------- |
| `athyper_app_writer`   | INSERT on audit tables               | Application event ingestion |
| `athyper_audit_reader` | SELECT on audit tables (with RLS)    | Query services              |
| `athyper_retention`    | DELETE on audit tables               | Retention job cleanup       |
| `athyper_admin`        | UPDATE encryption columns            | Key rotation                |
| `athyper_audit_admin`  | SELECT + INSERT on audit + integrity | Verification and export     |

### Immutability Controls

Audit tables have triggers (`audit.prevent_audit_mutation()`) that prevent UPDATE/DELETE unless:

- DELETE: Caller has `athyper_retention` role + session variable `athyper.audit_retention_bypass = 'true'`
- UPDATE: Caller has `athyper_admin` role + only modifying encryption-related columns

### RLS Policies

Enabled on: `audit.workflow_event_log`, `audit.hash_anchor`, `audit.dlq`, `audit.integrity_report`

Policy: `tenant_id = current_setting('athyper.current_tenant', true)::uuid`
