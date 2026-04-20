-- 100_finance/100_master/001_vendor.sql
-- Purpose: control.entity + entity_version + entity_field for Vendor (master.supplier)
-- Module: BUY (Buying)
-- Depends on: LookupDomain/master/supplier_type.sql,
--             party_payment_terms.sql, supplier_payment_method.sql
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT DO NOTHING

-- ── 0. Idempotency fix: rename if previously inserted as 'supplier' ──────────
UPDATE control.entity
SET name = 'vendor'
WHERE table_schema = 'master' AND table_name = 'supplier'
  AND tenant_id IS NULL AND name = 'supplier';

-- ── 0b. Fix entity_code if it was auto-filled as 'supplier' by old trigger ──
UPDATE control.entity
SET entity_code = 'vendor'
WHERE table_schema = 'master' AND table_name = 'supplier'
  AND tenant_id IS NULL AND entity_code = 'supplier';

-- ── 1. control.entity ────────────────────────────────────────────────────────
INSERT INTO control.entity (
    module_id, name, entity_short, entity_code,
    entity_class, ownership_model, kind, backing_type,
    governance_level, security_tier, mutability,
    table_schema, table_name,
    label_singular, label_plural, icon_key, color_token,
    numbering_active, naming_policy, feature_flags,
    status, created_by)
SELECT
    (SELECT id FROM shared.module WHERE code = 'BUY'),
    'vendor', 'VND', 'vendor',
    'MASTER', 'system', 'ent', 'table',
    'standard', 'business', 'controlled',
    'master', 'supplier',
    'Vendor', 'Vendors', 'building-2', 'blue',
    true,
    '{"prefix":"VND","prefix_configurable":true,"separator":"-","segments":[{"type":"sequence","padding":5}]}'::jsonb,
    '{"is_approvable":false,"party_category":"supplier","allow_address":true,"allow_contact":true}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
    WHERE table_schema = 'master' AND table_name = 'supplier'
      AND tenant_id IS NULL
);

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'master' AND e.table_name = 'supplier'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;

-- ── 3. control.entity_field (12 fields) ──────────────────────────────────────
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('code',        'code',          'Vendor Code',  'text', 'one',         NULL::text,                             true,  true,  '{"max_length":20}'::jsonb,  10),
    ('name',        'name',          'Vendor Name',  'text', 'one',         NULL::text,                             true,  true,  '{"max_length":255}'::jsonb, 20),
    ('legal_name',  'legal_name',    'Legal Name',   'text', 'zero_or_one', NULL::text,                             false, false, '{"max_length":255}'::jsonb, 30),
    ('vendor_type', 'supplier_type', 'Vendor Type',  'enum', 'zero_or_one', 'master.supplier_type'::text,           false, true,  NULL::jsonb,                 40),
    ('status',      'status',        'Status',       'lifecycle_state', 'one', NULL::text,                             true,  true,  NULL::jsonb,                 50),
    ('tax_number',  'tax_id',        'Tax Number',   'text', 'zero_or_one', NULL::text,                             false, false, '{"max_length":50}'::jsonb,  60),
    ('description', 'description',   'Description',  'text', 'zero_or_one', NULL::text,                             false, false, '{"max_length":500}'::jsonb, 70)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'master' AND e.table_name = 'supplier'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── 4. Fix origin for existing rows (idempotent) ─────────────────────────────
UPDATE control.entity_field ef
SET origin = 'standard'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'master' AND e.table_name = 'supplier'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.origin = 'system';

-- ── 5. Fix column_name mismatches and deactivate non-existent columns ─────────
-- vendor_type → supplier_type (actual column name in master.supplier)
UPDATE control.entity_field ef
SET column_name = 'supplier_type'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'master' AND e.table_name = 'supplier'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name = 'vendor_type' AND ef.column_name = 'vendor_type';

-- tax_number → tax_id (actual column name in master.supplier)
UPDATE control.entity_field ef
SET column_name = 'tax_id'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'master' AND e.table_name = 'supplier'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name = 'tax_number' AND ef.column_name = 'tax_number';

-- Deactivate fields whose column_names do not exist in master.supplier
UPDATE control.entity_field ef
SET is_active = false
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'master' AND e.table_name = 'supplier'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN ('payment_terms', 'payment_method', 'currency_code',
                  'credit_limit', 'contact_email', 'contact_phone');
