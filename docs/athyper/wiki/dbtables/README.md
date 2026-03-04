# Athyper Database Tables Wiki

> Comprehensive functional and technical documentation for the Athyper PostgreSQL database schema.

## Quick Navigation

| Schema | Domain | Tables | Description |
|--------|--------|--------|-------------|
| [`core`](core/README.md) | Foundation & IAM | 18 | Tenants, principals, roles, groups, OUs, entitlements, operations, personas, modules |
| [`meta`](meta/README.md) | Entity Metadata Engine | 30+ | Entity registry, versioning, fields, policies, lifecycles, overlays, approvals, permissions, notifications |
| [`ref`](ref/README.md) | Reference Data | 10 | Countries, currencies, languages, locales, timezones, UoM, commodity/industry codes, labels |
| [`ent`](ent/README.md) | Master Data | 7 | Customers, suppliers, employees, products, categories, classifications, relationships |
| [`sec`](sec/README.md) | Security & MFA | 8 | MFA challenges/configs, TOTP, email/SMS OTP, WebAuthn, security events, trusted devices, password history |
| [`wf`](wf/README.md) | Workflow & Approvals | 13 | Lifecycles, workflow instances, transitions, approval definitions/instances/tasks/stages/escalations |
| [`doc`](doc/README.md) | Document Management | 12 | Attachments, documents, templates, letterheads, brand profiles, render outputs, DLQ, ACLs |
| [`collab`](collab/README.md) | Collaboration | 22 | Comments, mentions, reactions, read tracking, drafts, moderation, SLA, analytics, messaging, delegation, sharing |
| [`audit`](audit/README.md) | Audit & Compliance | 7 | Audit logs, permission decisions, field access, workflow events (partitioned), hash anchors, DLQ, integrity reports |
| [`notify`](notify/README.md) | Notifications | 8 | Notifications (partitioned), preferences, delivery pipeline, DLQ, digests, WhatsApp consent, suppression, push subscriptions |
| [`ui`](ui/README.md) | User Interface State | 5 | User preferences, saved views, dashboard widgets, recent activity, search history |
| [`evt`](evt/README.md) | Event Store | 2 | Event log, event snapshots |
| [`fin`](fin/README.md) | Financial Domain | 15+ | Budgets, commitments, postings, tax, assets, inventory, commissions, production, federation |

## Architecture Overview

- [Database Architecture](/_overview/architecture.md) -- Multi-tenant design, schema organization, provisioning
- [Naming Conventions](/_overview/conventions.md) -- Column patterns, constraint naming, index strategy
- [Entity Relationships](/_overview/er-relationships.md) -- Cross-schema FK map, relationship diagrams

## Database Engine

| Property | Value |
|----------|-------|
| **Engine** | PostgreSQL 16+ |
| **Extensions** | `pgcrypto`, `citext` |
| **Provisioning** | Checksum-tracked via `public.schema_provisions` |
| **SQL Files** | `framework/adapters/db/src/sql/` (40+ files, prefix-ordered) |
| **ORM** | Prisma (codegen only, no migrations) |

## Schema Tiers

```
Platform Tier          Service Tier            Enterprise Tier
-----------------      ------------------      -------------------
core (IAM/tenant)      wf (workflows)          fin (finance engines)
meta (entity engine)   collab (collaboration)  evt (event store)
ref  (reference data)  doc (documents)
sec  (security/MFA)    notify (notifications)
audit (compliance)     ui (user state)
ent  (master data)
```

## Multi-Tenancy Model

All business tables carry a `tenant_id UUID NOT NULL` column with a cascading FK to `core.tenant(id)`. Tenant isolation is enforced at:

1. **Application layer** -- Every query includes `WHERE tenant_id = ?`
2. **Row-Level Security** -- Enabled on audit tables via `athyper.current_tenant` session variable
3. **Dedicated DB roles** -- `athyper_app_writer`, `athyper_audit_reader`, `athyper_retention`, `athyper_admin`, `athyper_audit_admin`

## Folder Structure

```
docs/athyper/wiki/dbtables/
  README.md                    -- This file (main index)
  _overview/
    architecture.md            -- Database architecture deep dive
    conventions.md             -- Naming conventions and patterns
    er-relationships.md        -- Cross-schema relationship map
  core/
    README.md                  -- Core schema: all tables documented
  meta/
    README.md                  -- Meta schema: entity metadata engine
  ref/
    README.md                  -- Reference data schema
  ent/
    README.md                  -- Master data entities
  sec/
    README.md                  -- Security & MFA
  wf/
    README.md                  -- Workflow & approvals
  doc/
    README.md                  -- Document management
  collab/
    README.md                  -- Collaboration features
  audit/
    README.md                  -- Audit & compliance
  notify/
    README.md                  -- Notification pipeline
  ui/
    README.md                  -- UI state management
  evt/
    README.md                  -- Event store
  fin/
    README.md                  -- Financial domain
```

### Extension Points

Each schema folder can grow into individual table files as documentation deepens:

```
core/
  README.md                    -- Schema overview + table index
  tables/
    tenant.md                  -- Deep dive: tenant table
    principal.md               -- Deep dive: principal table
    ...
  guides/
    tenant-onboarding.md       -- How-to guides
    rbac-setup.md              -- RBAC configuration
  diagrams/
    iam-er.svg                 -- ER diagrams
```

## Contributing

When adding a new table:
1. Add the DDL to the appropriate `framework/adapters/db/src/sql/` file
2. Update the schema README in this wiki
3. Document both functional purpose and technical details
4. Map foreign key relationships in the ER doc
