# Master Schema Entity Metadata Assessment Report

Date: 2026-05-16

## Scope

This report assesses the Entity and Entity Field setup for the PostgreSQL
`master` schema. It reviews the current source-level metadata coverage,
identifies missing entity registrations, calls out quality risks in existing
field metadata, and proposes improvements plus the new entities that should be
added.

Reviewed sources:

- `server/db/ddl/**/*.sql` for physical `master.*` tables and views.
- `server/framework/adapters/db/src/prisma/schema.prisma` for generated Prisma
  model coverage.
- `server/db/seed/010_platform/004_entity_engine` for platform entity,
  version, field, lifecycle, operation, relation, and display metadata.
- `server/db/seed/010_platform/005_domain_registrations/100_master` for
  business partner, supplier, customer, legal entity, and projection metadata.
- `server/db/seed/010_platform/005_domain_registrations/990_reference_picker_config.sql`
  for reference picker normalization.
- `packages/shared/data/api-contracts/src/schemas/metadata.ts` for the runtime
  metadata contract.
- `server/framework/runtime/services/metadata/routes/compiled-entity.route.ts`
  for compiled descriptor behavior.

## Assessment Limitation

This assessment is static. A post-seed database audit could not be run because
the local database is not present:

```text
pnpm.cmd run db:setup:status
DATABASE_ADMIN_URL not set - using local default: postgresql://athyperadmin:athyperadmin@localhost:5432/athyper_dev1
error: database "athyper_dev1" does not exist
```

The findings below are therefore based on source inventory. Before implementing
the final backlog, rerun the audit against a clean database after DDL and all
platform seed phases have completed.

## Implementation Update

The missing master-schema coverage has now been added as guarded, idempotent
seed metadata:

- `server/db/seed/010_platform/004_entity_engine/020_entities/018_master_schema_coverage.sql`
  registers the missing table/view entities when the physical relation exists
  and upserts version 1 as `EFFECTIVE` for incremental seed runs.
- `server/db/seed/010_platform/004_entity_engine/035_version_fields/017_fields_master_schema_coverage.sql`
  ensures version 1 exists, derives version-bound field metadata from
  `information_schema.columns`, removes common-field rows that do not map to
  real columns, and refreshes display/natural-key metadata for these
  coverage-owned entities.
- `server/db/seed/010_platform/004_entity_engine/051_master_schema_coverage_lifecycles.sql`
  binds a generic lifecycle to coverage tables with a physical `status` column.
- `server/db/seed/010_platform/004_entity_engine/060_entity_operations/008_ops_master_schema_coverage.sql`
  adds export operations for all coverage entities and create/update/delete only
  for non-read-only, non-locked, table-backed entities.

The seeds are intentionally marked with
`feature_flags.metadata_coverage_source = master_schema_coverage` so future
reruns can update these generated coverage rows without overwriting
hand-authored domain metadata.

Validation performed after the implementation:

- Static source check confirms every previously missing physical relation is
  listed in the coverage seed.
- `pnpm.cmd --filter @athyper/adapter-db exec prisma validate` passes with only
  pre-existing Prisma referential-action warnings.
- Database execution could not be completed locally because
  `DATABASE_ADMIN_URL` falls back to `postgresql://athyperadmin:athyperadmin@localhost:5432/athyper_dev1`
  and database `athyper_dev1` does not exist.

## Executive Summary

The entity engine is structurally sound: `control.entity` defines runtime
boundaries, `control.entity_version` selects the effective version, and
`control.entity_field` is the authoritative field catalog consumed by the
compiled metadata route. The source also already includes useful repair and
normalization passes, especially:

- `035_version_fields/099_fix_entity_field_column_mappings.sql`
- `005_domain_registrations/990_reference_picker_config.sql`
- dynamic People Phase 1 metadata seeding from `information_schema.columns`

The main risks are coverage and consistency:

- 196 physical `master` relations were found in DDL: 182 tables and 14 views.
- 159 of those physical relations have an obvious platform/domain entity
  registration in the reviewed seed sources.
- 37 physical `master` relations need a decision: register as runtime/read-only
  entities, or explicitly exclude from entity runtime coverage.
- Prisma has 182 `@@schema("master")` models. One Prisma master model,
  `accounting_profile`, has no matching `CREATE TABLE master.accounting_profile`
  in the reviewed DDL. This is a high-priority DDL/Prisma drift item.
- Several source field seeds still use non-contract metadata values such as
  `timestamp` and `enum[]`.
- Some field metadata is projection/list-only data inserted into base entities;
  these should be marked read-only/computed or moved to projection entities.

## Current Metadata Architecture

`control.entity` is the registry. For every runtime-managed `master` relation it
should define:

- physical backing: `table_schema`, `table_name`, `backing_type`
- runtime identity: `name`, `entity_code`, `entity_short`, labels, icon, color
- class and behavior: `entity_class`, `ownership_model`, `kind`, `mutability`
- governance: `governance_level`, `security_tier`, `data_policy`
- UX and operations: `display_config`, `feature_flags`, `natural_key_fields`

`control.entity_version` selects the effective metadata version. The compiled
metadata route only reads fields bound to the effective version.

`control.entity_field` is the runtime field catalog. Canonical dictionary rows
are not merged automatically at runtime. Every runtime-relevant field therefore
needs a version-bound row with:

- stable `name` and valid `column_name`
- valid `data_type`, `ui_type`, `cardinality`, `origin`
- correct required/search/filter/sort/read-only/computed flags
- enum domain or inline enum config
- reference target and picker config for visible references
- validation, default, money/date/json config where applicable
- group, visibility, editability, and sort order metadata

## Source Inventory

| Area | Count | Notes |
| --- | ---: | --- |
| DDL `master` tables | 182 | Counted across all `server/db/ddl` folders, not only `ddl/master`. |
| DDL `master` views | 14 | Mostly resolved/projection views. |
| Physical `master` relations | 196 | Tables + views. |
| Prisma `@@schema("master")` models | 182 | Tables only; views are mostly absent. |
| Physical relations with entity seed registrations | 159 | Static source match, not post-seed DB proof. |
| Physical relations missing entity registration | 37 | Listed below. |

DDL/Prisma drift:

| Drift | Impact | Recommendation |
| --- | --- | --- |
| `master.accounting_profile` exists in Prisma but no reviewed DDL creates it. | FKs and metadata references point to a table that may not exist in clean DDL. | Add/restore DDL or correct Prisma/schema source before metadata work. |
| Views and partition child `notification_default` are physical but mostly not Prisma models. | Expected for views/partition children, but should be explicitly classified. | Add read-only entity rows for user-facing views, or add an exclusion registry. |

## Missing Entity Registration Candidates

The following physical `master` relations do not have an obvious
`control.entity` registration in the reviewed seed sources.

| Relation | Kind | Priority | Recommended setup |
| --- | --- | ---: | --- |
| `network_provider` | BP/network reference | P1 | Add `REFERENCE` or `CONTROL`, table-backed, read mostly, code/name/status fields. |
| `business_partner_network_capability` | BP/network capability | P1 | Add `RELATION` child of `business_partner`/`network_provider`; include provider, capability code, status, metadata. |
| `business_partner_relation` | BP relationship graph | P1 | Add `RELATION`; expose source BP, target BP, relation type, effective dates, status; strong reference config. |
| `legal_entity_business_partner_link` | Legal entity/BP link | P1 | Add `RELATION`; child of legal entity and BP; read/write controlled. |
| `legal_entity_identity_binding` | Legal entity identity binding | P1 | Add `CONTROL`; likely admin-only; expose provider/subject/binding status read-only. |
| `intercompany_trading_pair` | Intercompany setup | P1 | Add `MASTER` or `CONTROL`; company code references, relationship type, posting controls. |
| `tenant_parameter_definition` | Parameter catalog | P1 | Add `CONTROL`; admin-only, searchable by code/name/module/scope. |
| `tenant_parameter_value` | Parameter values | P1 | Add `CONTROL`; child of parameter definition; strict read/write and audit controls. | Add `CONTROL`; tenant/company scoped, admin setup surface; route create/edit through setup flow. |
| `risk_dimension` | Risk reference | P1 | Add `REFERENCE`; code/name/domain/status. |
| `risk_source` | Risk source reference | P1 | Add `REFERENCE`; source code/name/source type/status. |
| `risk_driver_registry` | Risk driver reference | P1 | Add `REFERENCE`; risk driver code/name/category/status. |
| `risk_model` | Risk model header | P1 | Add `CONTROL` or `MASTER`; model code/name/version/status. |
| `risk_model_dimension` | Risk model dimensions | P1 | Add `RELATION`; child of risk model; dimension weighting and thresholds. |
| `tenant_risk_source_config` | Tenant risk source config | P1 | Add `CONTROL`; tenant admin surface; source references and activation flags. |
| `party_risk_assessment` | Party risk assessment | P1 | Add `MASTER` or `DOCUMENT` depending on lifecycle; child of business partner/party. |
| `party_risk_dimension_score` | Risk scoring detail | P1 | Add `RELATION`; child of assessment; dimension, score, evidence references. |
| `party_risk_driver` | Risk driver detail | P1 | Add `RELATION`; child of assessment; driver registry reference, score/impact. |
| `party_risk_evidence` | Risk evidence | P1 | Add `RELATION`; child of party/assessment; attachment/source references. |
| `party_risk_mitigation` | Risk mitigation | P1 | Add `RELATION`; child of assessment; owner, due date, mitigation status. |
| `party_risk_review_event` | Risk review event | P1 | Add `LOG` or `DOCUMENT`; child of assessment; reviewer, outcome, timestamps. |
| `certification_type` | Certification reference | P2 | Add `REFERENCE`; code/name/category/validity/default behavior. |
| `party_contact_role` | Contact-role relation | P2 | Add `RELATION`; child of party/contact; role, effective dates, primary flag. |
| `attachment_folder` | Content organization | P2 | Add `MASTER` or `CONTROL`; read/write if folders are user-managed. |
| `record_bookmark` | User preference | P2 | Add `CONTROL`; user-scoped internal entity; maybe hidden from generic runtime. |
| `filter_preset` | User preference | P2 | Add `CONTROL`; user/team scoped saved filters. |
| `trusted_device` | IAM security | P2 | Add `CONTROL`; admin/security read-only, sensitive fields hidden. |
| `v_business_partner_governance_summary` | Projection view | P2 | Add read-only `AGGREGATE`/view entity if used in BP governance UI. |
| `v_tenant_risk_source_config` | Projection view | P2 | Add read-only view entity if used in setup UI. |
| `v_bank_account_resolved` | Projection view | P3 | Add read-only view entity only if used by pickers/list pages. |
| `v_bank_account_link_resolved` | Projection view | P3 | Add read-only view entity only if used by pickers/list pages. |
| `v_contact_summary` | Projection view | P3 | Add read-only view entity if contact summary appears in runtime tabs. |
| `v_employee` | Projection view | P3 | Add read-only view entity or explicitly exclude if replaced by People entities. |
| `v_entity_commodity` | Projection view | P3 | Add read-only view entity if commodity pickers depend on it. |
| `v_resolved_address` | Projection view | P3 | Add read-only view entity if address tabs/pickers depend on resolved address. |
| `v_supplier_bank_account` | Projection view | P3 | Add read-only view entity if AP/supplier pickers depend on it. |
| `notification_default` | Partition child | Exclude | Do not register independently; parent `notification` should own metadata. |

Priority definitions:

- P1: should be registered or explicitly excluded before relying on full master
  schema runtime coverage.
- P2: useful runtime/admin coverage but not necessarily blocker for core flows.
- P3: projection/view coverage; add only when UI, picker, search, or reporting
  needs a first-class descriptor.
- Exclude: should be recorded in an explicit metadata audit exclusion list.

## Existing Setup Strengths

The current setup already has several good foundations:

- Most core master areas have entity registrations: identity, finance org, COA,
  projects, dimensions, assets, banking, payment terms, products, UI/content,
  supplier/customer/BP, and People Phase 1.
- `025_entity_versions.sql` gives a version-1 effective metadata layer for
  entity rows.
- `000_common_fields.sql` stamps common runtime fields such as `id`, `tenant_id`,
  `code`, `name`, `status`, and audit fields.
- `099_fix_entity_field_column_mappings.sql` repairs known column drift, deletes
  stale fields, and patches reference hints for many high-value master entities.
- `990_reference_picker_config.sql` upgrades older `validation.ref_entity`
  hints into richer `reference_config` picker metadata.
- People Phase 1 derives metadata from `information_schema.columns`, which is
  the right pattern for reducing source drift.

## Quality Findings In Existing Entity Fields

### 1. Non-contract `data_type` values still exist

The runtime contract and lookup values support:

```text
string, text, integer, bigint, decimal, numeric, boolean, uuid, date,
datetime, timestamptz, json, jsonb, enum, reference, money, tsvector,
text_array, uuid_array, int_array, jsonb_array, lifecycle_state
```

Source seeds still use `timestamp` in common and version-bound field seeds. The
contract supports `datetime` and `timestamptz`, not `timestamp`.

Source seeds also use `enum[]` for `business_types` in supplier, customer, and
legal entity extension metadata. The contract supports array types such as
`text_array`, not `enum[]`.

Recommendation:

- Replace `timestamp` with `timestamptz` for timestamp-with-time-zone columns.
- Use `datetime` only for timestamp-without-time-zone columns.
- Replace `enum[]` with `text_array` + `cardinality = 'many'` +
  `enum_domain_code`.
- Add an automated check that blocks `entity_field.data_type` values outside
  `FieldDataTypeSchema` and the `entity_field.data_type` lookup.

### 2. Common audit fields are stamped too broadly

`000_common_fields.sql` guards `code`, `name`, and `description` with
`information_schema.columns`, but `created_at`, `created_by`, `updated_at`, and
`updated_by` are stamped more broadly. That can create metadata fields for
relations that do not physically expose the column.

Recommendation:

- Add `EXISTS information_schema.columns` guards for every common field pass.
- Keep `id` guarded too when registering views, because not every view exposes a
  plain `id`.
- Treat partition children and views separately.

### 3. Projection fields are mixed into base entities

`business_partner` receives list/search projection fields such as
`role_summary`, `role_count`, `supplier_code`, `customer_code`, and
`company_scope_count` that are sourced from `v_business_partner_app_index`.

This can be valid for list display, but it needs explicit runtime semantics:

- fields are read-only
- fields are computed/projection-only
- writes never include them
- detail and edit forms do not treat them as base-table columns

Recommendation:

- Prefer first-class read-only projection entities such as
  `business_partner_app_index` for list pages.
- Where projection fields remain on base entities, set `is_read_only = true`,
  `is_computed = true`, and add `compute_mode = 'projection'` or a clear
  `ui_hint.surface = 'list'`.

### 4. References are partially normalized after the fact

Many reference fields are seeded as `data_type = 'uuid'`,
`ui_type = 'reference'`, plus `validation.ref_entity`. A later pass builds
`reference_config`.

Recommendation:

- Keep the normalization pass, but make source rows explicit going forward:
  `reference_config.target_entity`, `target_field`, `display_field`, and picker
  metadata for user-facing references.
- Populate `fk_target_entity_id` and `fk_target_field` where FK-aware runtime
  behavior needs database-level target awareness.
- Add an audit for references where the target entity has no active descriptor.

### 5. Enum metadata still uses placeholder configs

Some version field files set `enum_config = '{}'::jsonb` when
`data_type = 'enum'`. Empty enum config gives the renderer no stable option
domain unless `enum_domain_code` is also present.

Recommendation:

- For lookup-backed master fields, prefer `enum_domain_code = 'master.<domain>'`.
- Use inline `enum_config` only when the full option list is intentionally
  stored inline.
- Audit all active enum fields with neither `enum_domain_code` nor a non-empty
  `enum_config`.

### 6. Required and read-only flags need semantic review

The seeds sometimes use SQL nullability as a proxy for `is_required`. That is
not always the correct runtime rule.

Examples:

- DB `NOT NULL` fields with defaults should often be hidden/read-only rather
  than form-required.
- Nullable fields may still be business-required in guided flows.
- Lifecycle and audit fields should usually be read-only.
- View/projection fields must be read-only and normally computed.

Recommendation:

- Review `is_required`, `is_read_only`, `is_write_once`, and `editability` by
  entity and field purpose, not only by nullability.
- Add tests around create/update payload generation to ensure read-only fields
  are not sent to write endpoints.

### 7. Display config needs referential validation

`display_config` drives list columns, search fields, filters, title/subtitle,
sort defaults, view modes, detail renderers, and master tabs. There is no
guarantee in static SQL that every field referenced there exists after all
patches.

Recommendation:

- Add a validation script that checks `display_config` field references against
  active `entity_field.name`.
- Validate projection list configs against their actual backing view/table.
- Fail CI when `default_sort_field`, `title_field`, `list_columns`,
  `search_fields`, or tab `display_fields` reference missing fields.

## Recommended Metadata Standard

Every runtime-managed `master` relation should have:

1. One active platform `control.entity` row.
2. One effective `control.entity_version`.
3. Active version-bound `control.entity_field` rows for all runtime-relevant
   physical columns.
4. Explicit exclusions for columns that are intentionally not exposed.
5. Valid field data types from both lookup values and TypeScript contract.
6. Correct enum and reference configuration.
7. Valid `display_config` that points only to active fields.
8. Correct read/write posture for table, view, projection, aggregate, and
   partition-backed entities.
9. Lifecycle and operation bindings where the entity is user-manageable.
10. Field security policy for PII, sensitive IAM, risk, tax, banking, and HR
    fields.

## Proposed Addition Pattern For Missing Entities

Use this sequence for every missing relation that is not explicitly excluded:

1. Add `control.entity` row.
2. Add version 1 `control.entity_version`.
3. Add base/common fields with `information_schema` guards.
4. Add domain fields in a table-specific seed file.
5. Add enum domains and reference configs.
6. Add display config.
7. Add lifecycle binding only where status is lifecycle-managed.
8. Add operations only for entities that should be creatable/editable in generic
   runtime.
9. Add field security policies for sensitive fields.
10. Add audit coverage to prevent regression.

Recommended seed file grouping:

| Area | Suggested seed file |
| --- | --- |
| Network provider/capability/relation | `004_entity_engine/020_entities/018_master_bp_network.sql` and matching `035_version_fields/017_fields_bp_network.sql` |
| Party risk | `004_entity_engine/020_entities/019_master_party_risk.sql` and `035_version_fields/018_fields_party_risk.sql` |
| Tenant parameters | `004_entity_engine/020_entities/020_master_parameters.sql` and `035_version_fields/019_fields_parameters.sql` |
| Intercompany | `004_entity_engine/020_entities/021_master_intercompany.sql` and matching fields file |
| Numbering series | `004_entity_engine/020_entities/022_master_numbering.sql` and matching fields file |
| Projection views | `005_domain_registrations/100_master/027_master_projection_views.sql` |

## Suggested DB Audit SQL

Run these after clean DDL plus all platform seeds.

```sql
-- Physical master relations without an entity row.
WITH rels AS (
  SELECT table_schema, table_name, 'table' AS rel_kind
  FROM information_schema.tables
  WHERE table_schema = 'master'
  UNION ALL
  SELECT table_schema, table_name, 'view' AS rel_kind
  FROM information_schema.views
  WHERE table_schema = 'master'
)
SELECT r.rel_kind, r.table_name
FROM rels r
LEFT JOIN control.entity e
  ON e.table_schema = r.table_schema
 AND e.table_name = r.table_name
 AND e.tenant_id IS NULL
WHERE e.id IS NULL
ORDER BY r.rel_kind, r.table_name;
```

```sql
-- Entity rows whose physical backing relation is missing.
WITH rels AS (
  SELECT table_schema, table_name
  FROM information_schema.tables
  WHERE table_schema = 'master'
  UNION
  SELECT table_schema, table_name
  FROM information_schema.views
  WHERE table_schema = 'master'
)
SELECT e.entity_code, e.backing_type, e.table_schema, e.table_name
FROM control.entity e
LEFT JOIN rels r
  ON r.table_schema = e.table_schema
 AND r.table_name = e.table_name
WHERE e.table_schema = 'master'
  AND e.tenant_id IS NULL
  AND r.table_name IS NULL
ORDER BY e.entity_code;
```

```sql
-- Active fields whose column is missing from the backing relation.
WITH cols AS (
  SELECT table_schema, table_name, column_name
  FROM information_schema.columns
  WHERE table_schema = 'master'
)
SELECT e.entity_code, e.backing_type, e.table_name,
       ef.name, ef.column_name, ef.data_type, ef.is_computed
FROM control.entity e
JOIN control.entity_version ev
  ON ev.entity_id = e.id
 AND ev.status = 'EFFECTIVE'
JOIN control.entity_field ef
  ON ef.entity_version_id = ev.id
 AND ef.is_active = true
LEFT JOIN cols c
  ON c.table_schema = e.table_schema
 AND c.table_name = e.table_name
 AND c.column_name = ef.column_name
WHERE e.table_schema = 'master'
  AND e.tenant_id IS NULL
  AND COALESCE(ef.column_name, '') <> ''
  AND COALESCE(ef.is_computed, false) = false
  AND c.column_name IS NULL
ORDER BY e.entity_code, ef.sort_order, ef.name;
```

```sql
-- Invalid field data types.
SELECT e.entity_code, ef.name, ef.column_name, ef.data_type
FROM control.entity e
JOIN control.entity_version ev
  ON ev.entity_id = e.id
 AND ev.status = 'EFFECTIVE'
JOIN control.entity_field ef
  ON ef.entity_version_id = ev.id
 AND ef.is_active = true
LEFT JOIN control.lookup_value lv
  ON lv.domain_code = 'entity_field.data_type'
 AND lv.code = ef.data_type
 AND lv.tenant_id IS NULL
WHERE e.table_schema = 'master'
  AND e.tenant_id IS NULL
  AND lv.code IS NULL
ORDER BY e.entity_code, ef.name;
```

```sql
-- Enum and reference completeness.
SELECT e.entity_code, ef.name, ef.column_name, ef.data_type, ef.ui_type,
       ef.enum_domain_code, ef.enum_config, ef.reference_config, ef.validation
FROM control.entity e
JOIN control.entity_version ev
  ON ev.entity_id = e.id
 AND ev.status = 'EFFECTIVE'
JOIN control.entity_field ef
  ON ef.entity_version_id = ev.id
 AND ef.is_active = true
WHERE e.table_schema = 'master'
  AND e.tenant_id IS NULL
  AND (
    (ef.data_type = 'enum'
      AND ef.enum_domain_code IS NULL
      AND COALESCE(ef.enum_config, '{}'::jsonb) = '{}'::jsonb)
    OR
    ((ef.ui_type = 'reference' OR ef.data_type = 'reference')
      AND COALESCE(ef.reference_config->>'target_entity',
                   ef.validation->>'ref_entity') IS NULL)
  )
ORDER BY e.entity_code, ef.name;
```

## Implementation Workplan

### Phase 0 - Build repeatable audit

Create `server/db/scripts/verify-master-entity-metadata.ts` and run it after a
clean DDL plus platform seed.

The script should report:

- physical relation coverage
- entity rows with missing backing relation
- field rows with missing columns
- physical columns missing active fields
- invalid data types
- enum/reference completeness
- display config references to missing fields
- writable fields on read-only/view entities

### Phase 1 - Fix contract-level field issues

- Replace `timestamp` metadata values.
- Replace `enum[]` metadata values.
- Guard common fields with `information_schema.columns`.
- Normalize audit and lifecycle field flags.

### Phase 2 - Add missing P1 entities

Add entity and field metadata for:

- BP network and relation tables
- legal entity identity/link tables
- intercompany trading pair
- tenant parameters
- numbering series
- party risk model and assessment tables

### Phase 3 - Add P2 entities or exclusions

Add or explicitly exclude:

- attachment folder
- bookmarks/filter presets
- trusted devices
- certification and party contact role references
- governance/risk projection views

### Phase 4 - Projection/view posture

For each view:

- mark `backing_type = 'view'`
- mark entity or fields read-only
- set `feature_flags.is_readonly = true`
- only expose if the UI/search/picker needs a descriptor
- otherwise add to metadata audit exclusions

### Phase 5 - CI enforcement

Fail CI on:

- missing entity coverage without an explicit exclusion
- invalid field data types
- missing field columns
- display config references to unknown fields
- enum fields without domain/config
- reference fields without target entity
- writable fields on read-only/view entities

## Recommended Next Action

The best next implementation step is not to hand-code all 37 additions at once.
First add the DB-backed audit script and run it on a clean database. Then apply
metadata additions in P1 batches, starting with party risk, tenant parameters,
intercompany, numbering, and BP network/relation entities.
