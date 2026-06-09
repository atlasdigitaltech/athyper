# Mesh Database Provisioning

These scripts target the standalone `athyper_mesh` database only.

They run a deliberately bounded file set:

- `server/db/ddl/mesh/00_bootstrap.sql`
- `server/db/ddl/mesh_log/00_bootstrap.sql`
- `server/db/ddl/mesh_control/00_bootstrap.sql`
- `server/db/ddl/000_bootstrap/003_domains.sql`
- `server/db/ddl/shared/00_bootstrap.sql`
- `server/db/ddl/shared/01_tables.sql`
- `server/db/ddl/shared/04_indexes.sql`
- `server/db/ddl/shared/05_functions.sql`
- `server/db/ddl/shared/08_rls.sql`
- `server/db/ddl/mesh/_shared/*.sql` for Mesh-safe shared constraints, role indexes, triggers, and RLS additions
- `server/db/ddl/mesh/01_tables.sql`
- `server/db/ddl/mesh/01a_foundation_tables.sql`
- `server/db/ddl/mesh/01b_participant_profile_tables.sql`
- `server/db/ddl/mesh/01c_content_collaboration_tables.sql`
- `server/db/ddl/mesh/01d_utility_tables.sql`
- `server/db/ddl/mesh/01e_commerce_tables.sql`
- `server/db/ddl/mesh_log/01_tables.sql`
- `server/db/ddl/mesh_control/01_tables.sql`
- `server/db/ddl/mesh/03_constraints.sql`
- `server/db/ddl/mesh/04_indexes.sql`
- `server/db/ddl/mesh_log/04_indexes.sql`
- `server/db/ddl/mesh_control/04_indexes.sql`
- `server/db/ddl/mesh/05_functions.sql`
- `server/db/ddl/mesh_log/05_functions.sql`
- `server/db/ddl/mesh_control/05_functions.sql`
- `server/db/ddl/mesh/06_triggers.sql`
- `server/db/ddl/mesh_log/06_triggers.sql`
- `server/db/ddl/mesh_control/06_triggers.sql`
- `server/db/ddl/mesh/08_rls.sql`
- `server/db/ddl/mesh_log/08_rls.sql`
- `server/db/ddl/mesh_control/08_rls.sql`
- `server/db/seed/platform/001_global_reference/*.sql` for country, currency, UOM, commodity, industry, locale, timezone, and crosswalk data
- `server/db/seed/tenants/mesh/000_exchange/*.sql`

The shared entitlement/RBAC tables are created as DDL only in Mesh:
`module`, `permission`, `permission_category`, `persona`, `persona_permission`,
`enterprise_feature`, `plan_feature_access`, `plan_module_access`,
`plan_permission_access`, `role`, `subscription_plan`,
`subscription_plan_version`, and `workspace`.

The Mesh participant profile slice is also DDL only. It adds Mesh-owned
equivalents for selected BP-adjacent master patterns: address/link, contact
channels, named contacts, tax profile, bank party/account/link, certification,
and participant external reference. It intentionally does not copy tenant,
auth-group, dashboard, notification delivery, or other NEON operational tables.

The Mesh content/collaboration slice is DDL only and account-scoped. It adds
attachment metadata/ACL/folders/comments, generic comments/drafts/mentions/
reactions/read cursors, lightweight content items/links/access grants, and
conversation/participant rosters. Binary object bytes remain external storage
and are addressed by storage keys or URIs.

The Mesh utility slice is DDL only. It adds multipart upload tracking, platform
or account-scoped holiday calendars, principal UI/notification preferences, and
saved views. It intentionally does not add `fx_rate`; finance rate authority and
ledger valuation remain NEON/Admin concerns.

The Mesh commerce slice is DDL only. It promotes the existing participant profile
root with authority/verification metadata and adds supplier service coverage,
commodity capability, explicit bank-account disclosure, supplier catalogs, item
classification/UOM/price/availability, carriers, logistics zones, and logistics
rate cards. It intentionally does not create duplicate `supplier_profile` or
`mesh_ref` schemas.

The Mesh log slice is DDL only and lives in the separate `mesh_log` schema. It
adds immutable audit/security/access/delivery/job/hash-anchor logs plus a
mutable DLQ for retry bookkeeping. It intentionally does not copy NEON finance,
AI, KPI, password-history, or platform-audit logs.

The Mesh control slice is DDL only and lives in the separate `mesh_control`
schema. It adds feature flags, reference sync state,
routing/delivery/retention/quota policies, connector catalog/instances,
optional notification controls, cron schedules, policy rules/version history,
and change requests. It intentionally does not copy NEON lifecycle/workflow/
entity metadata, accounting/tax/planning/bank, AI, MFA, or ERP control-plane
tables.

Partner fixtures under `server/db/seed/tenants/mesh/010_nimubus` and
`server/db/seed/tenants/mesh/020_stratus` are not executed here because they
write to Neon `master.*` tables — they run via provision.ts against the Neon DB.

## Windows

```bat
stack\scripts\db\transaction\mesh\seed-db.bat --status
stack\scripts\db\transaction\mesh\seed-db.bat --all
stack\scripts\db\transaction\mesh\seed-db.bat --reset
```

## Bash

```bash
bash stack/scripts/db/transaction/mesh/seed-db.sh --status
bash stack/scripts/db/transaction/mesh/seed-db.sh --all
bash stack/scripts/db/transaction/mesh/seed-db.sh --reset
```

Use `--docker` with the Bash script on environments where direct Postgres port
`5432` is not exposed to the host.
