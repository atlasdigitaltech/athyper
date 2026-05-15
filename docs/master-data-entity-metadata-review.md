# Master Data Entity Metadata Review And Workplan

Date: 2026-05-16

## Scope

This review covers the master-data entity metadata contract across:

- Physical master relations in `server/db/ddl/master`.
- Platform entity registrations in `server/db/seed/010_platform/004_entity_engine`.
- Business-partner and supplier/customer domain registrations in `server/db/seed/010_platform/005_domain_registrations/100_master`.
- Runtime contract shape in `packages/shared/data/api-contracts/src/schemas/metadata.ts`.
- Compiled metadata read path in `server/framework/runtime/services/metadata/routes/compiled-entity.route.ts`.

The review is static because the local `athyper_dev1` database was not available. The command `pnpm run db:setup:status` from `server/db` failed with `database "athyper_dev1" does not exist`. The workplan below starts with a DB-backed audit so the final backlog is based on actual post-seed rows, including update/delete patches such as `035_version_fields/099_fix_entity_field_column_mappings.sql`.

## Current Architecture

`control.entity` is the entity registry. For master data, each row should define the runtime entity boundary:

- `module_id`, `name`, `entity_code`, `entity_short`.
- `entity_class`, `ownership_model`, `kind`, `backing_type`.
- `table_schema`, `table_name`.
- labels, icon, color, display config, feature flags.
- governance/security/mutability settings.
- natural keys, numbering policy, status.

`control.entity_version` holds the effective metadata version. The runtime compiler reads active fields by `entity_version_id`; canonical dictionary rows are not merged at runtime.

`control.entity_field` is therefore the authoritative field catalog for every rendered, searchable, importable, editable, copied, and exported field. Each field needs complete properties for:

- logical identity: `name`, `column_name`, `label`, `description`.
- type: `data_type`, `ui_type`, `format`, `unit`, `cardinality`, `origin`.
- behavior: `is_required`, `is_unique`, `is_searchable`, `is_filterable`, `is_sortable`, `is_groupable`, `is_aggregatable`, `is_read_only`, `is_computed`, `is_write_once`, `is_active`.
- type-specific config: `enum_domain_code` or `enum_config`, `reference_config`, `validation`, `default_value`, `money_config`, `datetime_config`, `json_config`.
- UI behavior: `ui_hint`, `visibility`, `editability`, `lookup_config`, `lookup_profile`, `sort_order`, group metadata.

## Static Findings

These are preliminary findings from source inspection. Exact counts must be confirmed against a clean seeded database.

### 1. Entity/table coverage is incomplete

There are master DDL relations without obvious `control.entity` coverage, especially risk, hardening, intercompany, collaboration extension, and parameter tables. Examples:

- `master.party_risk_assessment`
- `master.party_risk_dimension_score`
- `master.party_risk_driver`
- `master.party_risk_mitigation`
- `master.party_risk_review_event`
- `master.risk_dimension`
- `master.risk_model`
- `master.tenant_risk_source_config`
- `master.intercompany_trading_pair`
- `master.business_partner_relation`
- `master.business_partner_network_capability`
- `master.network_provider`
- `master.tenant_parameter_definition`
- `master.tenant_parameter_value`
- `master.record_bookmark`
- `master.filter_preset`
- `master.trusted_device`

Decision required for each relation: register as a runtime entity, register as a read-only/internal entity, or explicitly exclude it from entity runtime audits.

### 2. View and projection entities need first-class backing rules

Several entities are intentionally view/projection backed:

- `v_business_partner_address`
- `v_business_partner_app_index`
- `v_business_partner_bank_account`
- `v_business_partner_role_summary`
- `supplier_app_index`
- `customer_app_index`

The registry needs to consistently mark these as `backing_type = 'view'` or `AGGREGATE`/read-only table projections, with clear behavior:

- no direct create/update/delete unless routed to a base entity.
- all fields must match the projection column list.
- list-only fields should not pollute editable base entity field sets unless explicitly marked computed/read-only and excluded from writes.

### 3. Invalid or non-contract data types are present in seed sources

The runtime API contract supports `datetime` and `timestamptz`, but broad master field seeds use `timestamp` for audit fields:

- `created_at`
- `updated_at`
- several identity and notification timestamp fields.

The seed lookup for `entity_field.data_type` also does not include `timestamp`, and the TypeScript contract does not accept it. Standardize these fields to `timestamptz` where the SQL column is `timestamptz`, or `datetime` only for timestamp without time zone.

There are also `enum[]` rows in domain registration files. The current contract supports `text_array`, `uuid_array`, `int_array`, and `jsonb_array`, not `enum[]`. Choose one canonical representation:

- preferred: `data_type = 'text_array'`, `cardinality = 'many'`, plus `enum_domain_code`.
- alternative: add a formal `enum_array` type to lookup values, DB checks, API schema, and renderers.

### 4. Column mapping drift still exists or needs DB proof

There is already a repair seed, `035_version_fields/099_fix_entity_field_column_mappings.sql`, which updates/removes many stale field mappings. That is good, but it means source-level `INSERT` review is not enough. The clean DB result must be audited after all patches.

High-risk classes to verify:

- fields whose `column_name` does not exist on the registered table/view.
- physical columns with no active `entity_field`.
- fields mapped to renamed columns, such as `currency_id -> currency_code` patterns.
- projection fields on base entities, such as BP list summary fields.

### 5. Reference fields need explicit target metadata

Many `*_id` fields are `uuid` plus `ui_type = 'reference'`, but target resolution is inconsistent. Some use `validation.ref_entity`, some use `reference_config`, some are patched later, and some are inferred only by name.

Standard should be:

- `data_type = 'reference'` or `uuid` plus `ui_type = 'reference'`, consistently chosen.
- `reference_config.target_entity` populated.
- `target_field`, `display_field`, and picker config populated for user-facing fields.
- `fk_target_entity_id` and `fk_target_field` populated where runtime needs FK-aware behavior.

### 6. Enum fields need explicit domains

Some broad seeds use empty `enum_config = '{}'` as a placeholder. That satisfies the table check but does not give the UI a stable domain. For master data, prefer:

- `data_type = 'enum'`
- `enum_domain_code = 'master.<domain>'`
- `ui_type = 'select'` or `status` as appropriate
- no empty `enum_config` unless the values are truly inline and complete.

### 7. Required/editable flags need a field-by-field pass

The static scan found many cases that require review:

- SQL `NOT NULL` but metadata `is_required = false`.
- metadata `is_required = true` but SQL nullable.
- generated columns marked required in ways that can leak into forms.
- audit fields not consistently `read_only`.
- list/read-model fields not consistently `read_only` and non-editable.

This must be decided by domain semantics, not only DDL nullability. For example, a nullable DB column can still be business-required in an intake flow; a NOT NULL defaulted system column should not be shown as user-required.

## Field-By-Field Review Checklist

Apply this checklist to every active `control.entity_field` row for master entities:

| Property | Required review |
| --- | --- |
| `name` | Stable logical field name, no duplicate semantic aliases unless intentional. |
| `column_name` | Exists on backing table/view, or field is explicitly computed/projection-only. |
| `label` | Human-readable and domain-specific. |
| `description` | Present for non-obvious governance, finance, tax, risk, and integration fields. |
| `data_type` | One of the lookup/API contract values. No `timestamp` or ad hoc `enum[]`. |
| `ui_type` | Matches renderer: `text`, `textarea`, `select`, `date`, `datetime`, `reference`, `money`, `checkbox`, `hidden`, `status`, `json`. |
| `cardinality` | `one`, `zero_or_one`, or `many` aligned with SQL nullability and collection semantics. |
| `origin` | `system` for engine/audit/FK infrastructure, `standard` for shipped business fields, `business` only for tenant custom fields. |
| `is_required` | Business/form requirement, not blindly SQL `NOT NULL`. Generated/defaulted system fields should not become form blockers. |
| `is_unique` and `unique_scope` | Matches unique constraints and natural keys. |
| `is_searchable` | Only text/code/name/search-vector fields useful for global search. |
| `is_filterable` | Only fields that should appear in list facets/filter bars. |
| `is_sortable` | Backed by sortable column/index and useful in list views. |
| `is_read_only` | True for generated, audit, projection, status-derived, trigger-maintained, and write-protected fields. |
| `is_computed` and `compute_mode` | True for fields not persisted on the registered relation. |
| `enum_domain_code` | Required for domain enum fields unless inline `enum_config` is complete and intentional. |
| `reference_config` | Required for visible references: target entity, display field, picker behavior. |
| `validation` | Numeric ranges, max lengths, ref hints, date windows, country/currency formats. |
| `default_value` | Matches DB default where the runtime needs to prefill forms. |
| `ui_hint` | Group key, display section, badges, field visibility hints. |
| `visibility` and `editability` | Matches lifecycle state, surface, and role behavior. |
| `lookup_config` | Present for dependent pickers and filtered references. |
| `sort_order` | Stable, grouped, no collisions that confuse forms/lists. |

## Update Workplan

### Phase 0: Build the authoritative audit

Create a DB-backed verification script, preferably `server/db/scripts/verify-master-entity-metadata.ts`, and run it only after a clean DDL plus platform seed.

Required audit queries:

1. Entity coverage:
   - physical `master` tables/views/partitions with no `control.entity`.
   - `control.entity` rows whose `table_schema/table_name` cannot be found.
2. Field/column coverage:
   - active fields whose `column_name` is missing from the backing table/view.
   - physical columns without active fields, excluding explicitly ignored internal columns.
3. Type alignment:
   - SQL type normalized to contract type vs `entity_field.data_type`.
   - invalid `data_type` values not present in `entity_field.data_type` lookup.
4. Enum/reference completeness:
   - enum fields without domain/config.
   - reference fields without target config.
5. UI/display config integrity:
   - `display_config.list_columns`, `search_fields`, `filter_bar`, `title_field`, `subtitle_field`, and `default_sort_field` all resolve to fields.
6. Editability safety:
   - generated/audit/projection fields are read-only.
   - writable fields exist on writable backing entities.

### Phase 1: Normalize global field contracts

- Replace all `timestamp` metadata data types with `timestamptz` or `datetime`.
- Replace `enum[]` with the chosen canonical array representation.
- Add lookup values only if the API contract and renderers are updated at the same time.
- Make common audit fields consistent:
  - `id`, `tenant_id`, `created_at`, `created_by`, `updated_at`, `updated_by`, `status_changed_at`, `status_changed_by`.
  - hidden or read-only as appropriate.
  - correct `data_type`, `ui_type`, and `sort_order`.

### Phase 2: Align entity registry coverage

For every master relation:

- Register as runtime entity if users or platform APIs should browse, reference, import, export, or manage it.
- Register as read-only/internal entity if it is required by references but not directly editable.
- Explicitly exclude if it is a pure technical table and should never be runtime-visible.

Focus first on:

- BP hardening and relation tables.
- party risk tables.
- intercompany trading pair.
- tenant parameters.
- collaboration extensions.
- app/read-model views.

### Phase 3: Fix field mappings table by table

Work in deterministic batches:

1. Core identity and security.
2. Finance/org/COA/project.
3. BP/customer/supplier/company-code profiles.
4. Banking/payment terms.
5. Product/tax/fx/budget/assets/dimensions.
6. People.
7. Risk/intercompany/parameters/collaboration extensions.

For each table:

- compare DB columns to fields.
- decide system vs standard vs projection.
- fix `column_name`, `data_type`, `ui_type`, required/read-only flags.
- add missing fields for important columns.
- remove stale fields or mark computed when intentional.
- update `display_config` and reference picker config.

### Phase 4: Harden runtime validation

Add CI checks that fail on:

- invalid `entity_field.data_type`.
- `column_name` missing from backing table/view for non-computed fields.
- display config references to unknown fields.
- enum fields without domain/config.
- reference fields without target entity metadata.
- writable fields on read-only projection entities.

### Phase 5: Verification

Run:

- clean DB seed status/setup against a local test database.
- Prisma validation/generation.
- metadata compiler smoke for every active master entity.
- records list/detail smoke for every active writable master entity.
- reference picker smoke for all visible reference fields.

## Suggested DB Audit SQL

Use these as the first implementation target for the verification script.

```sql
-- Entity rows with missing backing relation.
WITH rels AS (
  SELECT table_schema, table_name, 'table' AS rel_kind
  FROM information_schema.tables
  WHERE table_schema = 'master'
  UNION ALL
  SELECT table_schema, table_name, 'view' AS rel_kind
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
SELECT e.entity_code, e.backing_type, e.table_name, ef.name, ef.column_name, ef.data_type
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
-- Data types outside the shipped lookup/API contract.
SELECT e.entity_code, ef.name, ef.column_name, ef.data_type
FROM control.entity e
JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.status = 'EFFECTIVE'
JOIN control.entity_field ef ON ef.entity_version_id = ev.id AND ef.is_active = true
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
JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.status = 'EFFECTIVE'
JOIN control.entity_field ef ON ef.entity_version_id = ev.id AND ef.is_active = true
WHERE e.table_schema = 'master'
  AND e.tenant_id IS NULL
  AND (
    (ef.data_type = 'enum' AND ef.enum_domain_code IS NULL AND ef.enum_config IS NULL)
    OR
    ((ef.column_name LIKE '%\_id' ESCAPE '\' OR ef.ui_type = 'reference')
      AND ef.reference_config IS NULL
      AND NOT (ef.validation ? 'ref_entity'))
  )
ORDER BY e.entity_code, ef.name;
```

## Recommended Definition Standard

Going forward, no master table should be considered complete until it has:

- one `control.entity` row with correct class, backing type, governance, display config, and feature flags.
- one effective `control.entity_version`.
- active `control.entity_field` rows for all runtime-relevant columns.
- explicit exclusions for technical columns not exposed to runtime.
- valid type values from the shared lookup/API contract.
- explicit enum/reference configuration.
- list/detail display config that points only to valid fields.
- smoke coverage through compiled metadata and record list/detail routes.

