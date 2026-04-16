# Schema Map — `server/db/sql/`

Schema-first, 13-layer DDL layout. Each schema directory owns all of its DDL
layers. The runner (`runner.sh`) cross-cuts them in the correct dependency order.

---

## Directory Structure

```
server/db/sql/
├── runner.sh                   ← fail-hard, manifest-driven provisioning script
├── SCHEMA_MAP.md               ← this file
│
├── 00_platform/                ← platform-global (no schema prefix)
│   ├── 000_roles.sql           ← CREATE ROLE declarations
│   ├── 001_extensions.sql      ← CREATE EXTENSION (uuid-ossp, pgcrypto, …)
│   ├── 002_schemas.sql         ← CREATE SCHEMA for all 10 domain schemas
│   ├── 002b_int_schema.sql     ← integration schema (int)
│   └── 003_domains.sql         ← shared.* domain types and enums
│
├── shared/                     ← multi-tenant infrastructure
├── control/                    ← entity engine, workflow, policy, IAM, jobs
├── master/                     ← reference data, org chart, COA, CMS config
├── document/                   ← transactional documents (JE, AP, AR, assets…)
├── ledger/                     ← posted entries, balances, trial balance
├── log/                        ← audit trail, activity log, session log
├── event/                      ← integration events, connectors, orchestration
├── governance/                 ← period-close, compliance, legal hold
├── snapshot/                   ← point-in-time read models, certification
├── aggregate/                  ← materialized rollup tables
│
└── 99_security/
    └── 800_security_hardening.sql  ← REVOKE defaults, search_path locks
```

---

## Layer Legend (within each schema directory)

| File prefix       | DDL layer                    | Runner phase |
|-------------------|------------------------------|-------------|
| `00_bootstrap`    | Bootstrap functions          | Phase 2     |
| `01_tables*`      | CREATE TABLE (+ sub-files)   | Phase 3     |
| `02_pre_constraint` | Pre-constraint functions   | Phase 4     |
| `03_constraints`  | ALTER TABLE ADD CONSTRAINT   | Phase 5     |
| `04_indexes`      | CREATE INDEX                 | Phase 6     |
| `05_functions`    | Domain functions / helpers   | Phase 7     |
| `06_triggers`     | CREATE TRIGGER               | Phase 8     |
| `07_views`        | CREATE VIEW / MATERIALIZED   | Phase 9     |
| `08_rls`          | RLS ENABLE + CREATE POLICY   | Phase 10    |

**Why phases matter**: `shared.uuidv7()` (Phase 2) must exist before any table
that uses `DEFAULT shared.uuidv7()` (Phase 3). All tables must exist before
cross-schema FK constraints (Phase 5). Pre-constraint functions (Phase 4) need
tables but must precede check constraints that call them.

---

## Schema Directory Contents

### `shared/` — Multi-tenant infrastructure
- **00_bootstrap** — `shared.uuidv7()`, `shared.current_tenant_id()` GUC accessor
- **01_tables** — `tenant`, `user_profile`, `org_unit`, `user_session`, `user_delegation`
- **02_pre_constraint** — shared validation helpers
- **03_constraints** — tenant FK, user FK cross-refs
- **04_indexes** — tenant lookup, session indexes
- **05_functions** — tenant resolution, org hierarchy
- **06_triggers** — tenant stamp, updated_at
- **07_views** — tenant summary, active sessions
- **08_rls** — per-tenant isolation policies

### `control/` — Entity engine, workflow, policy, IAM, jobs
- **00_bootstrap** — control schema search_path setup
- **01_tables** — entity, entity_version, entity_lifecycle, entity_operation, entity_relation, entity_field, entity_policy, field_group, field_group_member; workflow, policy, IAM, notification, CMS config, jobs scheduler tables
- **02_pre_constraint** — `control.fn_valid_lookup()` (called by check constraints)
- **03_constraints** — lookup FKs, entity_code uniqueness, entity_policy tenant uniqueness
- **04_indexes** — entity_code lookup, entity_tenant_code composite
- **05_functions** — entity binding validation (`trg_fn_validate_entity_binding`, `trg_fn_validate_target_entity`), workflow engine helpers, policy evaluator
- **06_triggers** — entity_lifecycle/operation/relation binding validation triggers (section D), audit stamp triggers, workflow state machine triggers
- **07_views** — entity registry view, workflow dashboard, policy summary
- **08_rls** — per-tenant control object isolation

### `master/` — Reference data, org chart, chart of accounts, CMS
- **00_bootstrap** — master schema bootstrap
- **01_tables_identity** — business_unit, department, employee, vendor, customer, project
- **01b_tables_finance** — account (COA), cost_center, currency, exchange_rate, tax_code
- **01c_tables_extended** — bank_account, bank_branch, asset_category, inventory_category
- **01d_tables_payment_terms** — payment_term, payment_schedule_template
- **01e_tables_ui_principal** — role, permission, principal_role, principal_permission
- **01f_tables_cms** — content_type, content_template, print_profile
- **02–08** — constraints, indexes, functions, triggers, views, RLS for master schema

### `document/` — Transactional documents
- **00_bootstrap** — document schema bootstrap
- **01_tables_core** — document (base), document_line, document_attachment
- **01b_tables_journal** — journal_entry, journal_line, journal_reversal
- **01c_tables_commitment** — purchase_order, po_line, goods_receipt
- **01d_tables_attachments** — content_object, content_version, content_link, content_acl
- **01e_tables_invoice** — vendor_invoice, invoice_line, ap_payment_request
- **01f_tables_payment** — payment, payment_line, ar_receipt
- **01g_tables_assets** — fixed_asset, asset_depreciation, asset_disposal
- **01h_tables_ic** — intercompany_transaction, ic_settlement
- **01i_tables_inventory** — inventory_transaction, stock_ledger
- **01j_tables_p2p** — requisition, rfq, rfq_response
- **01k_tables_import** — import_request, import_chunk, import_error
- **02–08** — constraints, indexes, functions, triggers, views, RLS

### `ledger/` — Posted entries, balances, trial balance
- **01_tables** — ledger_entry, account_balance, period_balance, ledger_journal_link
- Remaining layers: constraints, indexes, posting functions, balance update triggers, TB views, RLS

### `log/` — Audit trail, activity log, session log
- **01_tables** — audit_event, activity_log, session_log, comment_thread, comment, comment_reaction, comment_mention
- Remaining layers: append-only constraints, activity indexes, audit functions, RLS

### `event/` — Integration events, connectors, orchestration
- **01_tables_core** — integration_event, outbox_item, event_subscription, webhook_delivery
- **01b_tables_orchestration** — workflow_run, workflow_step, workflow_item, inbox_item
- **01c_tables_connector_instance** — connector_instance, connector_credential, connector_sync_log
- Remaining layers: outbox drain triggers, delivery worker functions, RLS

### `governance/` — Period-close, compliance, legal hold, certification
- **01_tables** — period, period_close_run, period_close_task, period_close_signoff, legal_hold, legal_hold_subject, compliance_report
- Remaining layers: period gate triggers, hold guard functions, RLS

### `snapshot/` — Point-in-time read models, certification snapshots
- **01_tables** — snapshot_header, snapshot_line, snapshot_certification
- Remaining layers: immutability triggers (certification), snapshot indexes, RLS

### `aggregate/` — Materialized rollup tables
- **01_tables** — aggregate_balance, aggregate_metric, aggregate_dimension
- **03_constraints** — uniqueness constraints (no FK to other schemas by design)
- **04_indexes** — dimension lookup indexes

### `99_security/` — Platform-wide security hardening
- **800_security_hardening** — REVOKE ALL ON SCHEMA from PUBLIC, search_path locks on SECURITY DEFINER functions, explicit GRANT statements

---

## Quick-Find Index

| What you're looking for          | File                                    |
|----------------------------------|-----------------------------------------|
| uuidv7 generator                 | `shared/00_bootstrap.sql`               |
| Tenant GUC accessor              | `shared/00_bootstrap.sql`               |
| Tenant / user / session tables   | `shared/01_tables.sql`                  |
| RLS isolation policies (shared)  | `shared/08_rls.sql`                     |
| Entity registry DDL              | `control/01_tables.sql`                 |
| entity_code column + constraint  | `control/01_tables.sql`                 |
| entity_policy multi-tenant fix   | `control/01_tables.sql`                 |
| entity binding validation fns    | `control/05_functions.sql`              |
| entity binding triggers          | `control/06_triggers.sql`               |
| fn_valid_lookup()                | `control/02_pre_constraint.sql`         |
| Workflow / inbox tables          | `event/01b_tables_orchestration.sql`    |
| IAM roles / permissions          | `master/01e_tables_ui_principal.sql`    |
| Chart of accounts                | `master/01b_tables_finance.sql`         |
| Journal entry tables             | `document/01b_tables_journal.sql`       |
| AP invoice tables                | `document/01e_tables_invoice.sql`       |
| AR receipt / payment tables      | `document/01f_tables_payment.sql`       |
| Fixed assets                     | `document/01g_tables_assets.sql`        |
| Import request / chunk tables    | `document/01k_tables_import.sql`        |
| Audit event / activity log       | `log/01_tables.sql`                     |
| Period close tables              | `governance/01_tables.sql`              |
| Legal hold tables                | `governance/01_tables.sql`              |
| Outbox / webhook delivery        | `event/01_tables_core.sql`              |
| Connector instance tables        | `event/01c_tables_connector_instance.sql` |
| Materialized rollup tables       | `aggregate/01_tables.sql`               |
| REVOKE / search_path hardening   | `99_security/800_security_hardening.sql` |
| Extension declarations           | `00_platform/001_extensions.sql`        |
| Schema declarations              | `00_platform/002_schemas.sql`           |
| Domain type definitions          | `00_platform/003_domains.sql`           |

---

## Runner Execution Order (summary)

```
Phase  0  — 00_platform (roles → extensions → schemas → domains)
Phase  1  — public/* (all 9 layers, isolated)
Phase  2  — */00_bootstrap (bootstrap fns, all schemas — BEFORE tables)
Phase  3  — */01_tables* (all schemas, all sub-files — cross-schema FKs deferred)
Phase  4  — */02_pre_constraint (pre-constraint fns, after tables, before constraints)
Phase  5  — */03_constraints (after all tables exist)
Phase  6  — */04_indexes
Phase  7  — */05_functions
Phase  8  — */06_triggers
Phase  9  — */07_views
Phase 10  — */08_rls
Phase 11  — 99_security/800_security_hardening.sql
```
