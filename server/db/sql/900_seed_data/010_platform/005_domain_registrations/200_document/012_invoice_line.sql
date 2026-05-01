-- 100_finance/200_document/004_invoice_line.sql
-- Purpose: control.entity + entity_version + entity_field + display_config
--          for Purchase Invoice Line (document.purchase_invoice_line)
-- Class:   DOCUMENT_RELATION — line table belonging to purchase_invoice
-- Module:  PROC (Procurement)
-- Depends on: 001_invoice.sql, p2p_lookup_values.sql
--             (domains: document.procurement_type, document.invoice_match_status)
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT DO NOTHING throughout

-- ── 1. control.entity ────────────────────────────────────────────────────────
INSERT INTO control.entity (
    module_id, name, entity_short, entity_code,
    entity_class, ownership_model, kind, backing_type,
    governance_level, security_tier, mutability,
    table_schema, table_name,
    label_singular, label_plural, icon_key, color_token,
    numbering_active, feature_flags,
    status, created_by)
SELECT
    (SELECT id FROM shared.module WHERE code = 'ACC'),
    'purchase_invoice_line', 'PINV_L', 'purchase_invoice_line',
    'DOCUMENT_RELATION', 'system', 'ent', 'table',
    'full', 'tenant_critical', 'controlled',
    'document', 'purchase_invoice_line',
    'Invoice Line', 'Invoice Lines', 'list', 'violet',
    false,
    '{
        "parent_entity":              "purchase_invoice",
        "has_accounting_distribution": true,
        "has_matching":               true
    }'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
    WHERE table_schema = 'document' AND table_name = 'purchase_invoice_line'
      AND tenant_id IS NULL
);

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'document' AND e.table_name = 'purchase_invoice_line'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;

-- ── 3. control.entity_field (27 fields) ──────────────────────────────────────
-- Group A: Identity & Parent          (5-10)
-- Group B: Item classification        (20-45)
-- Group C: Quantity & Pricing         (50-82)
-- Group D: Tax & Gross                (90-100)
-- Group E: Dimensions                 (110-125)
-- Group F: Matching & Asset           (130-145)
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
    -- ── A: Identity & Parent ──────────────────────────────────────────────────
    ('purchase_invoice_id', 'purchase_invoice_id', 'Invoice',             'reference', 'one',         NULL::text,                                 true,  false, '{"ref_entity":"purchase_invoice"}'::jsonb,    5),
    ('line_no',             'line_no',             'Line No.',            'integer',   'one',         NULL::text,                                 true,  false, '{"min":1}'::jsonb,                           10),
    -- ── B: Item Classification ────────────────────────────────────────────────
    ('item_description',    'item_description',    'Description',         'text',      'one',         NULL::text,                                 true,  false, '{"max_length":500}'::jsonb,                  20),
    ('procurement_type',    'procurement_type',    'Type',                'enum',      'one',         'document.procurement_type'::text,          true,  true,  NULL::jsonb,                                  30),
    ('item_id',             'item_id',             'Item',                'reference', 'zero_or_one', NULL::text,                                 false, false, '{"ref_entity":"item"}'::jsonb,               35),
    ('spend_category_id',   'spend_category_id',   'Spend Category',      'reference', 'zero_or_one', NULL::text,                                 false, true,  '{"ref_entity":"spend_category"}'::jsonb,     40),
    ('business_intent_id',  'business_intent_id',  'Business Intent',     'reference', 'zero_or_one', NULL::text,                                 false, false, '{"ref_entity":"business_intent"}'::jsonb,    45),
    -- ── C: Quantity & Pricing ─────────────────────────────────────────────────
    ('uom_code',            'uom_code',            'UoM',                 'text',      'one',         NULL::text,                                 true,  false, '{"max_length":20}'::jsonb,                   50),
    ('quantity',            'quantity',            'Quantity',            'decimal',   'one',         NULL::text,                                 true,  false, '{"nonzero":true}'::jsonb,                    60),
    ('unit_price',          'unit_price',          'Unit Price',          'decimal',   'one',         NULL::text,                                 true,  false, '{"min":0}'::jsonb,                           70),
    ('price_unit',          'price_unit',          'Price Per',           'decimal',   'one',         NULL::text,                                 false, false, '{"min":0}'::jsonb,                           72),
    ('discount_pct',        'discount_pct',        'Discount %',          'decimal',   'zero_or_one', NULL::text,                                 false, false, '{"min":0,"max":100}'::jsonb,                 75),
    ('net_amount',          'net_amount',          'Net Amount',          'decimal',   'one',         NULL::text,                                 false, false, '{"min":0}'::jsonb,                           80),
    ('discount_amount',     'discount_amount',     'Discount Amt',        'decimal',   'zero_or_one', NULL::text,                                 false, false, '{"min":0}'::jsonb,                           82),
    -- ── D: Tax, Gross & Retention ──────────────────────────────────────────────
    ('tax_amount',          'tax_amount',          'Tax Amount',          'decimal',   'one',         NULL::text,                                 false, false, '{"min":0}'::jsonb,                           90),
    ('withholding_tax_amount','withholding_tax_amount','WHT Amount',       'decimal',   'one',         NULL::text,                                 false, false, '{"min":0}'::jsonb,                           95),
    ('gross_amount',        'gross_amount',        'Gross Amount',        'decimal',   'one',         NULL::text,                                 true,  false, '{"min":0}'::jsonb,                          100),
    ('retention_pct',       'retention_pct',       'Retention %',         'decimal',   'zero_or_one', NULL::text,                                 false, false, '{"min":0,"max":100}'::jsonb,                 102),
    ('retention_amount',    'retention_amount',    'Retention Amt',       'decimal',   'zero_or_one', NULL::text,                                 false, false, '{"min":0}'::jsonb,                          104),
    -- ── E: Dimensions ─────────────────────────────────────────────────────────
    ('cost_center_id',      'cost_center_id',      'Cost Centre',         'reference', 'zero_or_one', NULL::text,                                 false, true,  '{"ref_entity":"cost_center"}'::jsonb,       110),
    ('profit_center_id',    'profit_center_id',    'Profit Centre',       'reference', 'zero_or_one', NULL::text,                                 false, false, '{"ref_entity":"profit_center"}'::jsonb,     115),
    ('project_id',          'project_id',          'Project',             'reference', 'zero_or_one', NULL::text,                                 false, true,  '{"ref_entity":"project"}'::jsonb,           120),
    ('site_id',             'site_id',             'Site',                'reference', 'zero_or_one', NULL::text,                                 false, false, '{"ref_entity":"site"}'::jsonb,              125),
    -- ── F: Matching & Asset ───────────────────────────────────────────────────
    ('match_status',        'match_status',        'Match Status',        'enum',      'one',         'document.invoice_match_status'::text,      false, true,  NULL::jsonb,                                 130),
    ('matched_quantity',    'matched_quantity',    'Matched Qty',         'decimal',   'zero_or_one', NULL::text,                                 false, false, '{"min":0}'::jsonb,                          135),
    ('is_asset',            'is_asset',            'Is Asset',            'boolean',   'one',         NULL::text,                                 false, true,  NULL::jsonb,                                 140),
    ('asset_category_id',   'asset_category_id',   'Asset Category',      'reference', 'zero_or_one', NULL::text,                                 false, false, '{"ref_entity":"asset_class"}'::jsonb,       145)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'document' AND e.table_name = 'purchase_invoice_line'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── 4. display_config ────────────────────────────────────────────────────────
UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'master',
    'title_field',        'item_description',
    'subtitle_field',     'procurement_type',
    'list_columns',       '["line_no","item_description","procurement_type","quantity","unit_price","gross_amount","match_status"]'::jsonb,
    'default_sort_field', 'line_no',
    'default_sort_order', 'asc'
)
WHERE table_schema = 'document' AND table_name = 'purchase_invoice_line'
  AND tenant_id IS NULL
  AND display_config = '{}'::jsonb;

-- ── 5. Module → PROC (Procurement) ───────────────────────────────────────────
-- Inner-join style: no-op if PROC does not exist yet.
UPDATE control.entity e
SET    module_id = m.id
FROM   shared.module m
WHERE  m.code         = 'PROC'
  AND  e.table_schema = 'document'
  AND  e.table_name   = 'purchase_invoice_line'
  AND  e.tenant_id    IS NULL;
