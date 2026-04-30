-- 100_finance/100_master/003_customer.sql
-- Purpose: control.entity + entity_version + entity_field for Customer (master.customer)
-- Module: CRM (Customer Relationship Management)
-- Depends on: LookupDomain/master/customer_type.sql,
--             party_payment_terms.sql
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT DO NOTHING

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
    (SELECT id FROM shared.module WHERE code = 'CRM'),
    'customer', 'CUS', 'customer',
    'MASTER', 'system', 'ent', 'table',
    'standard', 'business', 'controlled',
    'master', 'customer',
    'Customer', 'Customers', 'users', 'teal',
    true,
    '{"prefix":"CUS","prefix_configurable":true,"separator":"-","segments":[{"type":"sequence","padding":5}]}'::jsonb,
    '{"is_approvable":false,"party_category":"customer","allow_address":true,"allow_contact":true}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
    WHERE table_schema = 'master' AND table_name = 'customer'
      AND tenant_id IS NULL
);

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'master' AND e.table_name = 'customer'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;

-- ── 3. control.entity_field (11 fields) ──────────────────────────────────────
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
    ('code',           'code',           'Customer Code',   'text',    'one',         NULL::text,                        true,  true,  '{"max_length":20}'::jsonb,  10),
    ('name',           'name',           'Customer Name',   'text',    'one',         NULL::text,                        true,  true,  '{"max_length":255}'::jsonb, 20),
    ('legal_name',     'legal_name',     'Legal Name',      'text',    'zero_or_one', NULL::text,                        false, false, '{"max_length":255}'::jsonb, 30),
    ('customer_type',  'customer_type',  'Customer Type',   'enum',    'zero_or_one', 'master.customer_type'::text,      false, true,  NULL::jsonb,                 40),
    ('status',         'status',         'Status',          'lifecycle_state', 'one',  NULL::text,                        true,  true,  NULL::jsonb,                 50),
    ('payment_terms',  'payment_terms',  'Payment Terms',   'enum',    'zero_or_one', 'master.party_payment_terms'::text, false, true, NULL::jsonb,                 60),
    ('currency_code',  'currency_code',  'Currency',        'text',    'zero_or_one', NULL::text,                        false, true,  '{"max_length":3}'::jsonb,   70),
    ('tax_number',     'tax_number',     'Tax Number',      'text',    'zero_or_one', NULL::text,                        false, false, '{"max_length":50}'::jsonb,  80),
    ('credit_limit',   'credit_limit',   'Credit Limit',    'decimal', 'zero_or_one', NULL::text,                        false, false, '{"min":0}'::jsonb,          90),
    ('contact_email',  'contact_email',  'Contact Email',   'text',    'zero_or_one', NULL::text,                        false, false, '{"format":"email"}'::jsonb,100),
    ('contact_phone',  'contact_phone',  'Contact Phone',   'text',    'zero_or_one', NULL::text,                        false, false, '{"max_length":30}'::jsonb, 110)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'master' AND e.table_name = 'customer'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── Fix origin for existing rows (idempotent) ─────────────────────────────────
-- Narrows to application fields only — excludes PK/tenant/audit columns that
-- must stay origin='system' so FieldsRenderer filters them from the view grid.
UPDATE control.entity_field ef
SET origin = 'standard'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'master' AND e.table_name = 'customer'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.origin = 'system'
  AND ef.name NOT IN ('id', 'tenant_id', 'is_active',
                      'created_at', 'created_by', 'updated_at', 'updated_by',
                      'status_changed_at', 'status_changed_by');

-- ── Pin id and tenant_id as system/hidden (never rendered in UI) ──────────────
-- origin='system' → FieldsRenderer excludes field from view grid
-- ui_type='hidden' → edit-mode field renderer registry uses no-op renderer
UPDATE control.entity_field ef
SET origin  = 'system',
    ui_type = 'hidden'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'master' AND e.table_name = 'customer'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN ('id', 'tenant_id')
  AND (ef.origin IS DISTINCT FROM 'system' OR ef.ui_type IS DISTINCT FROM 'hidden');
