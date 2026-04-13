-- 100_finance/200_document/004_purchase_order.sql
-- Purpose: control.entity + entity_version + entity_field for Purchase Order
--          (document.purchase_order)
-- Module: BUY (Buying)
-- Depends on: LookupDomain/document/purchase_order.sql
--             (domain: document.purchase_order_status, document.purchase_order_type)
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT DO NOTHING

-- ── 1. control.entity ────────────────────────────────────────────────────────
INSERT INTO control.entity (
    module_id, name, entity_short,
    entity_class, ownership_model, kind, backing_type,
    governance_level, security_tier, mutability,
    table_schema, table_name,
    label_singular, label_plural, icon_key, color_token,
    numbering_active, naming_policy, feature_flags,
    status, created_by)
SELECT
    (SELECT id FROM shared.module WHERE code = 'BUY'),
    'purchase_order', 'PO',
    'DOCUMENT', 'system', 'ent', 'table',
    'full', 'tenant_critical', 'controlled',
    'document', 'purchase_order',
    'Purchase Order', 'Purchase Orders', 'shopping-cart', 'orange',
    true,
    '{"prefix":"PO","prefix_configurable":true,"separator":"-","segments":[{"type":"year","format":"YYYY"},{"type":"sequence","padding":6}]}'::jsonb,
    '{"is_approvable":true,"document_category":"purchasing","allow_on_behalf_of":false,"has_line_items":true,"auto_number":true}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
    WHERE table_schema = 'document' AND table_name = 'purchase_order'
      AND tenant_id IS NULL
);

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'document' AND e.table_name = 'purchase_order'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;

-- ── 3. control.entity_field (13 fields) ──────────────────────────────────────
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
    ('document_no',    'document_no',    'PO Number',         'text',    'one',         NULL::text,                              true,  true,  '{"max_length":50}'::jsonb,    10),
    ('order_type',     'order_type',     'Order Type',        'enum',    'one',         'document.purchase_order_type'::text,    true,  true,  NULL::jsonb,                   20),
    ('status',         'status',         'Status',            'enum',    'one',         'document.purchase_order_status'::text,  true,  true,  NULL::jsonb,                   30),
    ('supplier_id',    'supplier_id',    'Vendor',            'reference', 'one',         NULL::text,                              true,  true,  '{"ref_entity":"supplier"}'::jsonb, 40),
    ('order_date',     'order_date',     'Order Date',        'date',    'one',         NULL::text,                              true,  true,  NULL::jsonb,                   50),
    ('delivery_date',  'delivery_date',  'Expected Delivery', 'date',    'zero_or_one', NULL::text,                              false, true,  NULL::jsonb,                   60),
    ('currency_code',  'currency_code',  'Currency',          'text',    'one',         NULL::text,                              true,  true,  '{"max_length":3}'::jsonb,     70),
    ('total_amount',   'total_amount',   'Total Amount',      'decimal', 'one',         NULL::text,                              true,  false, '{"min":0}'::jsonb,            80),
    ('tax_amount',     'tax_amount',     'Tax Amount',        'decimal', 'zero_or_one', NULL::text,                              false, false, '{"min":0}'::jsonb,            90),
    ('payment_terms',  'payment_terms',  'Payment Terms',     'enum',    'zero_or_one', 'master.party_payment_terms'::text,      false, false, NULL::jsonb,                  100),
    ('delivery_site',  'delivery_site',  'Delivery Site',     'ref',     'zero_or_one', NULL::text,                              false, false, '{"ref_entity":"site"}'::jsonb, 110),
    ('buyer_id',       'buyer_id',       'Buyer',             'reference', 'zero_or_one', NULL::text,                              false, true,  '{"ref_entity":"principal"}'::jsonb, 120),
    ('notes',          'notes',          'Notes',             'text',    'zero_or_one', NULL::text,                              false, false, '{"max_length":1000}'::jsonb, 130)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'document' AND e.table_name = 'purchase_order'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── Fix origin for existing rows (idempotent) ─────────────────────────────────
UPDATE control.entity_field ef
SET origin = 'standard'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'purchase_order'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.origin = 'system';
