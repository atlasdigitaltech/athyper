-- Disposable Wave 5 integration fixture. Validation use only; never a production seed.
-- Provides one active tenant/company, two active ledger books, and explicit book assignments.
\set ON_ERROR_STOP on

SET app.database_plane = 'neon';
SET app.seed_tenant_id = 'f5000000-0000-0000-0000-000000000001';
SET app.current_principal_id = 'f5000000-0000-0000-0000-000000000002';
SET app.seed_industry_pack_codes = 'pack_utilities';
SET app.seed_company_code_ids = 'f5000000-0000-0000-0000-000000000004';

INSERT INTO master.tenant (
  id, code, name, display_name, realm_key, metadata, status, created_by
) VALUES (
  'f5000000-0000-0000-0000-000000000001',
  'wave5_validation', 'Wave 5 Validation', 'Wave 5 Validation', 'wave5_validation',
  '{"fixture":"wave5_asset_org","validation_only":true}'::jsonb,
  'active', 'f5000000-0000-0000-0000-000000000002'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO master.principal (
  id, tenant_id, code, name, principal_type, provisioning_source,
  metadata, status, created_by
) VALUES (
  'f5000000-0000-0000-0000-000000000002',
  'f5000000-0000-0000-0000-000000000001',
  'wave5.seed', 'Wave 5 Seed Actor', 'service_account', 'internal',
  '{"fixture":"wave5_asset_org","validation_only":true}'::jsonb,
  'active', 'f5000000-0000-0000-0000-000000000002'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO master.legal_entity (
  id, tenant_id, code, name, display_name, legal_name, entity_type,
  registration_country_code, functional_currency, metadata, status, created_by
) VALUES (
  'f5000000-0000-0000-0000-000000000003',
  'f5000000-0000-0000-0000-000000000001',
  'wave5_legal', 'Wave 5 Legal Entity', 'Wave 5 Legal Entity',
  'Wave 5 Validation Legal Entity', 'company', 'US', 'USD',
  '{"fixture":"wave5_asset_org","validation_only":true}'::jsonb,
  'active', 'f5000000-0000-0000-0000-000000000002'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO master.company_code (
  id, tenant_id, legal_entity_id, code, name, display_name,
  functional_currency, country_code, timezone_code, locale_code,
  metadata, status, created_by
) VALUES (
  'f5000000-0000-0000-0000-000000000004',
  'f5000000-0000-0000-0000-000000000001',
  'f5000000-0000-0000-0000-000000000003',
  'wave5co', 'Wave 5 Company', 'Wave 5 Company', 'USD', 'US',
  'America/New_York', 'en-US',
  '{"fixture":"wave5_asset_org","validation_only":true}'::jsonb,
  'active', 'f5000000-0000-0000-0000-000000000002'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO master.ledger_book (
  id, tenant_id, code, name, category, reporting_standard,
  base_currency_code, is_primary, sort_order, metadata, status, created_by
) VALUES
  ('f5000000-0000-0000-0000-000000000005',
   'f5000000-0000-0000-0000-000000000001',
   'W5STAT', 'Wave 5 Statutory Book', 'statutory', 'US GAAP',
   'USD', true, 10, '{"fixture":"wave5_asset_org","validation_only":true}'::jsonb,
   'active', 'f5000000-0000-0000-0000-000000000002'),
  ('f5000000-0000-0000-0000-000000000006',
   'f5000000-0000-0000-0000-000000000001',
   'W5MGMT', 'Wave 5 Management Book', 'management', NULL,
   'USD', false, 20, '{"fixture":"wave5_asset_org","validation_only":true}'::jsonb,
   'active', 'f5000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

INSERT INTO master.company_code_book_assignment (
  id, tenant_id, company_code_id, book_id, effective_from, priority,
  metadata, status, created_by
) VALUES
  ('f5000000-0000-0000-0000-000000000007',
   'f5000000-0000-0000-0000-000000000001',
   'f5000000-0000-0000-0000-000000000004',
   'f5000000-0000-0000-0000-000000000005', DATE '2025-01-01', 100,
   '{"fixture":"wave5_asset_org","validation_only":true}'::jsonb,
   'active', 'f5000000-0000-0000-0000-000000000002'),
  ('f5000000-0000-0000-0000-000000000008',
   'f5000000-0000-0000-0000-000000000001',
   'f5000000-0000-0000-0000-000000000004',
   'f5000000-0000-0000-0000-000000000006', DATE '2025-01-01', 50,
   '{"fixture":"wave5_asset_org","validation_only":true}'::jsonb,
   'active', 'f5000000-0000-0000-0000-000000000002')
ON CONFLICT (tenant_id, company_code_id, book_id, effective_from) DO NOTHING;

DO $$
BEGIN
  IF (SELECT count(*) FROM master.company_code_book_assignment
      WHERE tenant_id = 'f5000000-0000-0000-0000-000000000001'
        AND company_code_id = 'f5000000-0000-0000-0000-000000000004'
        AND status = 'active') <> 2 THEN
    RAISE EXCEPTION '[wave5 fixture] expected two active company/book assignments';
  END IF;
END $$;
