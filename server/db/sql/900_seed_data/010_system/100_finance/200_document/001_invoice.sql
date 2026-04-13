-- 100_finance/200_document/001_invoice.sql
-- Purpose: control.entity + entity_version + entity_field for Purchase Invoice
--          (document.purchase_invoice)
-- Module: ACC (Finance Core Accounting)
-- Depends on: LookupDomain/document/p2p_lookup_values.sql
--             (domain: document.purchase_invoice_status, document.purchase_invoice_type)
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
    (SELECT id FROM shared.module WHERE code = 'ACC'),
    'purchase_invoice', 'INV',
    'DOCUMENT', 'system', 'ent', 'table',
    'full', 'tenant_critical', 'controlled',
    'document', 'purchase_invoice',
    'Invoice', 'Invoices', 'file-text', 'violet',
    true,
    '{"prefix":"INV","prefix_configurable":true,"separator":"-","segments":[{"type":"year","format":"YYYY"},{"type":"sequence","padding":6}]}'::jsonb,
    '{"is_approvable":true,"document_category":"payables","allow_on_behalf_of":false,"has_line_items":true,"auto_number":true}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
    WHERE table_schema = 'document' AND table_name = 'purchase_invoice'
      AND tenant_id IS NULL
);

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
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
    ('document_no',       'invoice_number',         'Invoice No.',     'text',    'one',         NULL::text,                              true,  true,  '{"max_length":50}'::jsonb,    10),
    ('invoice_type',      'invoice_type',           'Invoice Type',    'enum',    'one',         'document.purchase_invoice_type'::text,  true,  true,  NULL::jsonb,                   20),
    ('status',            'status',                 'Status',          'enum',    'one',         'document.purchase_invoice_status'::text, true, true,  NULL::jsonb,                   30),
    ('supplier_id',       'supplier_id',            'Vendor',          'reference', 'one',       NULL::text,                              true,  true,  '{"ref_entity":"vendor"}'::jsonb, 40),
    ('invoice_date',      'document_date',          'Invoice Date',    'date',    'one',         NULL::text,                              true,  true,  NULL::jsonb,                   50),
    ('due_date',          'due_date',               'Due Date',        'date',    'zero_or_one', NULL::text,                              false, true,  NULL::jsonb,                   60),
    ('currency_code',     'currency_code',          'Currency',        'text',    'one',         NULL::text,                              true,  true,  '{"max_length":3}'::jsonb,     70),
    ('gross_amount',      'total_amount',           'Gross Amount',    'decimal', 'one',         NULL::text,                              true,  false, '{"min":0}'::jsonb,            80),
    ('tax_amount',        'tax_amount',             'Tax Amount',      'decimal', 'zero_or_one', NULL::text,                              false, false, '{"min":0}'::jsonb,            90),
    ('net_amount',        'subtotal_amount',        'Net Amount',      'decimal', 'one',         NULL::text,                              true,  false, '{"min":0}'::jsonb,           100),
    ('vendor_invoice_ref','supplier_invoice_number','Vendor Ref',      'text',    'zero_or_one', NULL::text,                              false, false, '{"max_length":100}'::jsonb,  120),
    ('description',       'description',            'Description',     'text',    'zero_or_one', NULL::text,                              false, false, '{"max_length":500}'::jsonb,  130)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── Fix ref_entity: "supplier" → "vendor" on already-seeded rows ─────────────
UPDATE control.entity_field ef
SET validation = '{"ref_entity":"vendor"}'::jsonb
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name = 'supplier_id'
  AND ef.validation->>'ref_entity' = 'supplier';

-- ── Fix origin for existing rows (idempotent) ─────────────────────────────────
UPDATE control.entity_field ef
SET origin = 'standard'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.origin = 'system';
