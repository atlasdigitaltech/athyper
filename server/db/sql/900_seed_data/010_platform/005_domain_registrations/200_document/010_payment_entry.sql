-- 100_finance/200_document/010_payment_entry.sql
-- Purpose: control.entity + entity_version + entity_field for Payment Entry
--          (document.payment_entry)
-- Module: ACC (Finance Core Accounting)
-- Depends on: LookupDomain/document/payment_entry_status.sql
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
    (SELECT id FROM shared.module WHERE code = 'ACC'),
    'payment_entry', 'PAY', 'payment_entry',
    'DOCUMENT', 'system', 'ent', 'table',
    'full', 'tenant_critical', 'controlled',
    'document', 'payment_entry',
    'Payment Entry', 'Payment Entries', 'banknote', 'emerald',
    true,
    '{"prefix":"PAY","prefix_configurable":true,"separator":"-","segments":[{"type":"year","format":"YYYY"},{"type":"sequence","padding":6}]}'::jsonb,
    '{"is_approvable":true,"document_category":"payments","allow_on_behalf_of":false,"has_lines":true,"auto_number":true}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
    WHERE table_schema = 'document' AND table_name = 'payment_entry'
      AND tenant_id IS NULL
);

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'document' AND e.table_name = 'payment_entry'
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
    ('document_no',       'payment_number',   'Payment No.',       'text',      'one',         NULL::text,                                true,  true,  '{"max_length":50}'::jsonb,                10),
    ('status',            'status',           'Status',            'lifecycle_state', 'one',   NULL::text,                                true,  true,  NULL::jsonb,                               20),
    ('payment_type',      'payment_type',     'Payment Type',      'text',      'one',         NULL::text,                                true,  true,  NULL::jsonb,                               30),
    ('payment_direction', 'payment_direction','Direction',         'text',      'one',         NULL::text,                                true,  true,  NULL::jsonb,                               40),
    ('supplier_id',       'supplier_id',      'Vendor',            'reference', 'zero_or_one', NULL::text,                                false, true,  '{"ref_entity":"vendor"}'::jsonb,          50),
    ('document_date',     'document_date',    'Payment Date',      'date',      'one',         NULL::text,                                true,  true,  NULL::jsonb,                               60),
    ('posting_date',      'posting_date',     'Posting Date',      'date',      'one',         NULL::text,                                true,  true,  NULL::jsonb,                               70),
    ('value_date',        'value_date',       'Value Date',        'date',      'one',         NULL::text,                                true,  false, NULL::jsonb,                               80),
    ('currency_code',     'currency_code',    'Currency',          'text',      'one',         NULL::text,                                true,  true,  '{"max_length":3}'::jsonb,                 90),
    ('payment_amount',    'payment_amount',   'Payment Amount',    'decimal',   'one',         NULL::text,                                true,  false, '{"min":0}'::jsonb,                       100),
    ('payment_reference', 'payment_reference','Payment Reference', 'text',      'zero_or_one', NULL::text,                                false, false, '{"max_length":200}'::jsonb,              110),
    ('notes',             'notes',            'Notes',             'text',      'zero_or_one', NULL::text,                                false, false, '{"max_length":1000}'::jsonb,             120)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'document' AND e.table_name = 'payment_entry'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── 4. display_config ─────────────────────────────────────────────────────────
UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'approvable',
    'title_field',        'document_no',
    'subtitle_field',     'supplier_id',
    'list_columns',       '["document_no","status","payment_type","payment_direction","document_date","payment_amount","currency_code"]'::jsonb,
    'default_sort_field', 'document_date',
    'default_sort_order', 'desc',
    'document_header', jsonb_build_object(
        'number_field',   'document_no',
        'status_field',   'status',
        'type_label',     'PAYMENT ENTRY',
        'total_label',    'PAYMENT AMOUNT',
        'date_label',     'PAYMENT DATE',
        'party_id_field', 'supplier_id',
        'amount_field',   'payment_amount',
        'currency_field', 'currency_code',
        'date_field',     'document_date'
    )
)
WHERE table_schema = 'document' AND table_name = 'payment_entry'
  AND tenant_id IS NULL
  AND display_config = '{}'::jsonb;

-- ── 5. Natural key ────────────────────────────────────────────────────────────
UPDATE control.entity
SET natural_key_fields = ARRAY['document_no']
WHERE table_schema = 'document' AND table_name = 'payment_entry'
  AND tenant_id IS NULL
  AND (natural_key_fields IS NULL OR natural_key_fields = '{}');

-- ── 6. Backfill: rename deprecated feature_flag key to canonical name ─────────
UPDATE control.entity
SET feature_flags = (feature_flags - 'has_line_items') || '{"has_lines":true}'::jsonb
WHERE table_schema = 'document' AND table_name = 'payment_entry'
  AND tenant_id IS NULL
  AND feature_flags ? 'has_line_items';
