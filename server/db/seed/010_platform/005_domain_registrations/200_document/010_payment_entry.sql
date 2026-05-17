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

UPDATE control.entity
   SET module_id = COALESCE((SELECT id::text FROM shared.module WHERE code = 'ACC'), module_id),
       name = 'payment_entry',
       slug = 'payment-entry',
       entity_short = 'PAY',
       entity_code = 'payment_entry',
       entity_class = 'DOCUMENT',
       ownership_model = 'system',
       kind = 'ent',
       backing_type = 'table',
       governance_level = 'full',
       security_tier = 'tenant_critical',
       mutability = 'controlled',
       label_singular = 'Payment Entry',
       label_plural = 'Payment Entries',
       icon_key = 'banknote',
       color_token = 'emerald',
       numbering_active = true,
       naming_policy = '{"prefix":"PAY","prefix_configurable":true,"separator":"-","segments":[{"type":"year","format":"YYYY"},{"type":"sequence","padding":6}]}'::jsonb,
       feature_flags = '{"is_approvable":true,"document_category":"payments","allow_on_behalf_of":false,"has_lines":true,"auto_number":true}'::jsonb,
       display_config = CASE
           WHEN feature_flags ->> 'metadata_coverage_source' = 'governed_schema_coverage' THEN '{}'::jsonb
           ELSE COALESCE(display_config, '{}'::jsonb)
       END,
       status = 'ACTIVE',
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
 WHERE table_schema = 'document'
   AND table_name = 'payment_entry'
   AND tenant_id IS NULL;

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'document' AND e.table_name = 'payment_entry'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;

-- ── 3. control.entity_field (14 fields) ──────────────────────────────────────
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
    ('company_code_id',   'company_code_id',  'Company Code',      'reference', 'one',         NULL::text,                                true,  true,  '{"ref_entity":"company_code"}'::jsonb,    45),
    ('supplier_id',       'supplier_id',      'Supplier',          'reference', 'zero_or_one', NULL::text,                                false, true,  '{"ref_entity":"supplier"}'::jsonb,        50),
    ('payment_method_id', 'payment_method_id','Payment Method',    'reference', 'one',         NULL::text,                                true,  true,  '{"ref_entity":"payment_method"}'::jsonb, 55),
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
    'detail_renderer',    'document',
    'lines_renderer',     'payment',
    'title_field',        'document_no',
    'subtitle_field',     'supplier_id',
    'list_columns',       '["document_no","status","payment_type","payment_direction","document_date","payment_amount","currency_code"]'::jsonb,
    'default_sort_field', 'document_date',
    'default_sort_order', 'desc',
    'allocation_primary_label', 'Invoice',
    'allocation_primary_field', 'invoice_number',
    'allocation_primary_source', 'data',
    'allocation_primary_fallback_fields', '["item_code","description"]'::jsonb,
    'allocation_empty_primary_label', 'On Account',
    'allocation_display_labels', jsonb_build_array(
        jsonb_build_object('key','invoice_date',      'label','Invoice Date', 'field','invoice_date',             'source','data', 'role','subtitle'),
        jsonb_build_object('key','allocated',         'label','Allocated',    'field','allocated_amount',        'source','data', 'role','amount'),
        jsonb_build_object('key','discount',          'label','Discount',     'field','discount_amount',         'source','data', 'role','deduction', 'hide_when_zero', true),
        jsonb_build_object('key','withholding_tax',   'label','WHT',          'field','withholding_tax_amount',  'source','data', 'role','deduction', 'hide_when_zero', true),
        jsonb_build_object('key','advance_recovery',  'label','Adv. Rec.',    'field','advance_recovery_amount', 'source','data', 'role','deduction', 'hide_when_zero', true),
        jsonb_build_object('key','retention',         'label','Retention',    'field','retention_amount',         'source','data', 'role','deduction', 'hide_when_zero', true),
        jsonb_build_object('key','net_payment',       'label','Net Payment',  'field','net_payment_amount',      'source','data', 'role','net')
    ),
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

-- Ensure existing payment_entry metadata has the payment allocation renderer contract.
UPDATE control.entity
SET display_config = jsonb_build_object(
    'allocation_primary_label', 'Invoice',
    'allocation_primary_field', 'invoice_number',
    'allocation_primary_source', 'data',
    'allocation_primary_fallback_fields', '["item_code","description"]'::jsonb,
    'allocation_empty_primary_label', 'On Account',
    'allocation_display_labels', jsonb_build_array(
        jsonb_build_object('key','invoice_date',      'label','Invoice Date', 'field','invoice_date',             'source','data', 'role','subtitle'),
        jsonb_build_object('key','allocated',         'label','Allocated',    'field','allocated_amount',        'source','data', 'role','amount'),
        jsonb_build_object('key','discount',          'label','Discount',     'field','discount_amount',         'source','data', 'role','deduction', 'hide_when_zero', true),
        jsonb_build_object('key','withholding_tax',   'label','WHT',          'field','withholding_tax_amount',  'source','data', 'role','deduction', 'hide_when_zero', true),
        jsonb_build_object('key','advance_recovery',  'label','Adv. Rec.',    'field','advance_recovery_amount', 'source','data', 'role','deduction', 'hide_when_zero', true),
        jsonb_build_object('key','retention',         'label','Retention',    'field','retention_amount',         'source','data', 'role','deduction', 'hide_when_zero', true),
        jsonb_build_object('key','net_payment',       'label','Net Payment',  'field','net_payment_amount',      'source','data', 'role','net')
    )
) || COALESCE(display_config, '{}'::jsonb)
WHERE table_schema = 'document' AND table_name = 'payment_entry'
  AND tenant_id IS NULL
  AND (
      NOT (COALESCE(display_config, '{}'::jsonb) ? 'allocation_display_labels')
      OR NOT (COALESCE(display_config, '{}'::jsonb) ? 'allocation_primary_label')
      OR NOT (COALESCE(display_config, '{}'::jsonb) ? 'allocation_primary_field')
  );

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

-- ── 7. Fix ref_entity: "supplier" on already-seeded rows (was "vendor") ──────
UPDATE control.entity_field ef
SET validation = '{"ref_entity":"supplier"}'::jsonb
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'payment_entry'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name = 'supplier_id'
  AND ef.validation->>'ref_entity' = 'vendor';
