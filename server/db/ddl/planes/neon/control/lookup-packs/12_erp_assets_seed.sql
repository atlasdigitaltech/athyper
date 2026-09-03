-- seed-contract-version: 1
-- seed-pack: neon.control.lookup.erp_assets
-- seed-pack-version: 1.0.0
-- seed-dataset: neon.control.lookup.erp_assets
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Wave 3 legacy lookup rationalization","publisher":"Athyper","source_version":"wave3-lookup-ledger.v1","retrieved_at":"2026-08-03","license":"internal"}
-- seed-plane: neon
-- seed-tenant-scope: none
-- seed-natural-key: control.lookup_domain(code);control.lookup_value(domain_code,code)
-- seed-cross-file-ids: false
-- seed-id-strategy: database-generated
-- seed-expected-row-count: exact:32
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- source-files: server/db/seed/platform/000_lookups/LookupDomain/control/depreciation_start_rule.sql,server/db/seed/platform/000_lookups/LookupDomain/document/asset_txn_type.sql,server/db/seed/platform/000_lookups/LookupDomain/master/asset_book_type.sql,server/db/seed/platform/000_lookups/LookupDomain/master/asset_component_component_type.sql,server/db/seed/platform/000_lookups/LookupDomain/master/asset_life_override_policy.sql,server/db/seed/platform/000_lookups/LookupDomain/master/asset_reserve_type.sql

DO $guard$ BEGIN
  IF current_setting('app.database_plane', true) <> 'neon' THEN
    RAISE EXCEPTION 'neon.control.lookup.erp_assets: invalid database plane';
  END IF;
END $guard$;

INSERT INTO control.lookup_domain
  (code, name, description, source_schema, is_extensible, metadata, status, created_by)
VALUES
  ('control.depreciation_start_rule', 'Depreciation start rule', 'When depreciation begins for an asset (in_service_date, capitalization_date, next_period). is_extensible=false — accounting standard governed.', 'control', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document.asset_txn_type', 'Asset transaction type', 'Lifecycle event types for asset transactions (capitalize, depreciate, etc.). is_extensible=true.', 'document', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.asset_book_type', 'Asset book type', 'Book types for multi-book asset accounting (statutory, tax, management). is_extensible=true — tenants may add custom book types.', 'master', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.asset_component.component_type', 'Asset Component Type', 'IAS 16 componentization role for an asset component (major, replacement, inspection). Platform-governed.', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.asset_life_override_policy', 'Useful life override policy', 'Whether useful life can be overridden at the asset level (allow, require, forbid). is_extensible=false — platform-defined.', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.asset_reserve_type', 'Asset reserve type', 'Revaluation/impairment reserve movement types. is_extensible=false — reserve types are accounting-governed.', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (code) DO UPDATE SET
  name = excluded.name, description = excluded.description,
  source_schema = excluded.source_schema, is_extensible = excluded.is_extensible,
  metadata = excluded.metadata, status = excluded.status,
  updated_at = now(), updated_by = excluded.created_by
WHERE (control.lookup_domain.name, control.lookup_domain.description,
       control.lookup_domain.source_schema, control.lookup_domain.is_extensible,
       control.lookup_domain.metadata, control.lookup_domain.status)
  IS DISTINCT FROM
      (excluded.name, excluded.description, excluded.source_schema,
       excluded.is_extensible, excluded.metadata, excluded.status);

INSERT INTO control.lookup_value
  (code, name, domain_code, description, category, sort_order, is_system, metadata, status, created_by)
VALUES
  ('in_service_date', 'In-Service Date', 'control.depreciation_start_rule', 'Depreciation begins when asset is placed in service', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('capitalization_date', 'Capitalization Date', 'control.depreciation_start_rule', 'Depreciation begins on capitalization (e.g. software)', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('next_period', 'Next Period', 'control.depreciation_start_rule', 'Depreciation begins at start of next fiscal period', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('capitalize', 'Capitalize', 'document.asset_txn_type', 'Capitalize asset from WIP or direct', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('depreciate', 'Depreciate', 'document.asset_txn_type', 'Periodic depreciation charge', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('revalue_up', 'Revalue Up', 'document.asset_txn_type', 'Upward revaluation', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('revalue_down', 'Revalue Down', 'document.asset_txn_type', 'Downward revaluation', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('impair', 'Impairment', 'document.asset_txn_type', 'Impairment loss recognition', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('impair_reverse', 'Impairment Reversal', 'document.asset_txn_type', 'Reversal of prior impairment', NULL, 55, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('transfer', 'Transfer', 'document.asset_txn_type', 'Transfer between entities/locations', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('retire', 'Retire', 'document.asset_txn_type', 'Retire from service', NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('dispose', 'Dispose', 'document.asset_txn_type', 'Dispose / sell asset', NULL, 80, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('adjust_cost', 'Cost Adjustment', 'document.asset_txn_type', 'Adjust acquisition cost', NULL, 90, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('adjust_life', 'Useful Life Adjustment', 'document.asset_txn_type', 'Adjust remaining useful life', NULL, 100, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('split', 'Asset Split', 'document.asset_txn_type', 'Split asset into multiple assets', NULL, 110, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('merge', 'Asset Merge', 'document.asset_txn_type', 'Merge multiple assets into one', NULL, 120, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('statutory', 'Statutory Book', 'master.asset_book_type', 'IFRS/GAAP statutory reporting book', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('tax', 'Tax Book', 'master.asset_book_type', 'Tax depreciation book', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('management', 'Management Book', 'master.asset_book_type', 'Internal management reporting book', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('insurance', 'Insurance Book', 'master.asset_book_type', 'Insurance valuation book', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('major_component', 'Major Component', 'master.asset_component.component_type', 'Material component tracked separately for depreciation.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('replacement_component', 'Replacement Component', 'master.asset_component.component_type', 'Replacement component linked to a parent asset.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('inspection_component', 'Inspection Component', 'master.asset_component.component_type', 'Inspection or overhaul component capitalized separately.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('other', 'Other', 'master.asset_component.component_type', 'Other asset component type.', NULL, 90, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('allow', 'Allow', 'master.asset_life_override_policy', 'Useful life may be overridden at asset level', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('require', 'Require', 'master.asset_life_override_policy', 'Useful life must be specified per-asset', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('forbid', 'Forbid', 'master.asset_life_override_policy', 'Class useful life cannot be changed at asset level', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('revalue_up', 'Revaluation Surplus', 'master.asset_reserve_type', 'Upward revaluation surplus', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('revalue_down', 'Revaluation Deficit', 'master.asset_reserve_type', 'Downward revaluation deficit', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('impairment', 'Impairment Loss', 'master.asset_reserve_type', 'Impairment loss recognized', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('impairment_reversal', 'Impairment Reversal', 'master.asset_reserve_type', 'Reversal of prior impairment', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('transfer_to_retained', 'Transfer to Retained', 'master.asset_reserve_type', 'Transfer surplus to retained earnings', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (domain_code, code) WHERE tenant_id IS NULL DO UPDATE SET
  name = excluded.name, description = excluded.description, category = excluded.category,
  sort_order = excluded.sort_order, is_system = excluded.is_system,
  metadata = excluded.metadata, status = excluded.status,
  updated_at = now(), updated_by = excluded.created_by
WHERE (control.lookup_value.name, control.lookup_value.description,
       control.lookup_value.category, control.lookup_value.sort_order,
       control.lookup_value.is_system, control.lookup_value.metadata,
       control.lookup_value.status)
  IS DISTINCT FROM
      (excluded.name, excluded.description, excluded.category, excluded.sort_order,
       excluded.is_system, excluded.metadata, excluded.status);

-- seed-assertion: expected-count
-- seed-assertion: orphan
-- seed-assertion: uniqueness
-- seed-assertion: semantic
DO $assertions$ BEGIN
  IF (SELECT count(*) FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['control.depreciation_start_rule', 'document.asset_txn_type', 'master.asset_book_type', 'master.asset_component.component_type', 'master.asset_life_override_policy', 'master.asset_reserve_type'])) <> 32 THEN
    RAISE EXCEPTION 'neon.control.lookup.erp_assets: expected-count assertion failed';
  END IF;
  IF EXISTS (SELECT 1 FROM control.lookup_value v LEFT JOIN control.lookup_domain d ON d.code=v.domain_code WHERE v.tenant_id IS NULL AND v.domain_code = ANY(ARRAY['control.depreciation_start_rule', 'document.asset_txn_type', 'master.asset_book_type', 'master.asset_component.component_type', 'master.asset_life_override_policy', 'master.asset_reserve_type']) AND d.id IS NULL) THEN
    RAISE EXCEPTION 'neon.control.lookup.erp_assets: orphan assertion failed';
  END IF;
  IF EXISTS (SELECT domain_code, code FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['control.depreciation_start_rule', 'document.asset_txn_type', 'master.asset_book_type', 'master.asset_component.component_type', 'master.asset_life_override_policy', 'master.asset_reserve_type']) GROUP BY domain_code, code HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'neon.control.lookup.erp_assets: uniqueness assertion failed';
  END IF;
  IF EXISTS (SELECT 1 FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['control.depreciation_start_rule', 'document.asset_txn_type', 'master.asset_book_type', 'master.asset_component.component_type', 'master.asset_life_override_policy', 'master.asset_reserve_type']) AND (code <> lower(btrim(code)) OR btrim(name) = '' OR status NOT IN ('active','inactive','deprecated'))) THEN
    RAISE EXCEPTION 'neon.control.lookup.erp_assets: semantic assertion failed';
  END IF;
END $assertions$;
