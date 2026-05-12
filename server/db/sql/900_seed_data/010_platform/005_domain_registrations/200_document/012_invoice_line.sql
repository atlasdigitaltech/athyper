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
    ('unspsc_code',         'metadata',             'UNSPSC Code',         'text',      'zero_or_one', NULL::text,                                 false, false, '{"max_length":32}'::jsonb,                    46),
    ('hs_code',             'metadata',             'HS / Trade Code',     'text',      'zero_or_one', NULL::text,                                 false, false, '{"max_length":32}'::jsonb,                    47),
    -- ── C: Quantity & Pricing ─────────────────────────────────────────────────
    ('uom_code',            'uom_code',            'UoM',                 'text',      'one',         NULL::text,                                 true,  false, '{"max_length":20}'::jsonb,                   50),
    ('quantity',            'quantity',            'Quantity',            'decimal',   'one',         NULL::text,                                 true,  false, '{"nonzero":true}'::jsonb,                    60),
    ('unit_price',          'unit_price',          'Unit Price',          'decimal',   'one',         NULL::text,                                 true,  false, '{"min":0}'::jsonb,                           70),
    ('price_unit',          'price_unit',          'Price Per',           'decimal',   'one',         NULL::text,                                 false, false, '{"min":0}'::jsonb,                           72),
    ('discount_pct',        'discount_pct',        'Discount %',          'decimal',   'zero_or_one', NULL::text,                                 false, false, '{"min":0,"max":100}'::jsonb,                 75),
    ('net_amount',          'net_amount',          'Net Amount',          'decimal',   'one',         NULL::text,                                 false, false, '{"min":0}'::jsonb,                           80),
    ('discount_amount',     'discount_amount',     'Discount Amount',     'decimal',   'zero_or_one', NULL::text,                                 false, false, '{"min":0}'::jsonb,                           82),
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
    'list_columns',       '["line_no","item_description","quantity","unit_price","gross_amount"]'::jsonb,
    'default_sort_field', 'line_no',
    'default_sort_order', 'asc',
    'line_grid', jsonb_build_object(
      'virtual_columns', jsonb_build_array(
        jsonb_build_object('key','allocated_to',    'label','Allocated to', 'order',80),
        jsonb_build_object('key','classification',  'label','C',            'order',90),
        jsonb_build_object('key','match_indicator', 'label','M',            'order',100)
      ),
      'organizer', jsonb_build_object(
        'toolbar_label',    'Organize',
        'all_lines_label',  'All lines',
        'default_sort',     'line_no',
        'default_group',    'none',
        'default_density',  'comfortable',
        'filters', jsonb_build_array(
          jsonb_build_object('key','blocked',                'label','Blocked',       'kind','classification_status', 'value','blocked',      'tone','danger',  'order',10),
          jsonb_build_object('key','needs_review',           'label','Review',        'kind','classification_status', 'value','needs_review', 'tone','warning', 'order',20),
          jsonb_build_object('key','unallocated',            'label','Unallocated',   'kind','allocation_status',     'value','unallocated',  'tone','warning', 'order',30),
          jsonb_build_object('key','missing_classification', 'label','Missing class', 'kind','missing_classification',                         'tone','danger',  'order',40),
          jsonb_build_object('key','high_amount',            'label','High amount',   'kind','high_amount',                                    'tone','info',    'order',50),
          jsonb_build_object('key','capex',                  'label','CAPEX',         'kind','capex',                                          'tone','neutral', 'order',60),
          jsonb_build_object('key','split',                  'label','Split',         'kind','distribution_count',    'op','gt', 'value',1,    'tone','info',    'order',70),
          jsonb_build_object('key','unmatched',              'label','Unmatched',     'kind','match_status',          'value','unmatched',    'tone','warning', 'order',80),
          jsonb_build_object('key','exception',              'label','Exception',     'kind','match_status',          'value','exception',    'tone','danger',  'order',90)
        ),
        'sorts', jsonb_build_array(
          jsonb_build_object('key','line_no',     'label','Line number',        'field','line_no',          'path','line_number', 'direction','asc',  'order',10),
          jsonb_build_object('key','amount_desc', 'label','Amount high to low', 'field','gross_amount',     'kind','amount',      'direction','desc', 'absolute',true, 'order',20),
          jsonb_build_object('key','amount_asc',  'label','Amount low to high', 'field','gross_amount',     'kind','amount',      'direction','asc',  'absolute',true, 'order',30),
          jsonb_build_object('key','description', 'label','Description',        'field','item_description', 'path','description', 'direction','asc',  'order',40)
        ),
        'groups', jsonb_build_array(
          jsonb_build_object('key','none',           'label','No grouping',    'order',10),
          jsonb_build_object('key','classification', 'label','Classification', 'kind','classification_rank', 'order',20),
          jsonb_build_object('key','allocation',     'label','Allocation',     'kind','allocation_rank',     'order',30)
        ),
        'densities', jsonb_build_array(
          jsonb_build_object('key','compact',     'label','Compact',     'order',10),
          jsonb_build_object('key','comfortable', 'label','Comfortable', 'order',20),
          jsonb_build_object('key','spacious',    'label','Spacious',    'order',30)
        )
      )
    )
)
WHERE table_schema = 'document' AND table_name = 'purchase_invoice_line'
  AND tenant_id IS NULL
  AND display_config = '{}'::jsonb;

-- Keep already-seeded line list columns aligned with the procure grid surface.
UPDATE control.entity
SET display_config = jsonb_set(
      COALESCE(display_config, '{}'::jsonb),
      '{list_columns}',
      '["line_no","item_description","quantity","unit_price","gross_amount"]'::jsonb,
      true
    )
WHERE table_schema = 'document'
  AND table_name = 'purchase_invoice_line'
  AND tenant_id IS NULL;

-- Backfill line-grid organizer metadata on already-seeded databases.
WITH line_grid_cfg AS (
  SELECT jsonb_build_object(
    'virtual_columns', jsonb_build_array(
      jsonb_build_object('key','allocated_to',    'label','Allocated to', 'order',80),
      jsonb_build_object('key','classification',  'label','C',            'order',90),
      jsonb_build_object('key','match_indicator', 'label','M',            'order',100)
    ),
    'organizer', jsonb_build_object(
      'toolbar_label',    'Organize',
      'all_lines_label',  'All lines',
      'default_sort',     'line_no',
      'default_group',    'none',
      'default_density',  'comfortable',
      'filters', jsonb_build_array(
        jsonb_build_object('key','blocked',                'label','Blocked',       'kind','classification_status', 'value','blocked',      'tone','danger',  'order',10),
        jsonb_build_object('key','needs_review',           'label','Review',        'kind','classification_status', 'value','needs_review', 'tone','warning', 'order',20),
        jsonb_build_object('key','unallocated',            'label','Unallocated',   'kind','allocation_status',     'value','unallocated',  'tone','warning', 'order',30),
        jsonb_build_object('key','missing_classification', 'label','Missing class', 'kind','missing_classification',                         'tone','danger',  'order',40),
        jsonb_build_object('key','high_amount',            'label','High amount',   'kind','high_amount',                                    'tone','info',    'order',50),
        jsonb_build_object('key','capex',                  'label','CAPEX',         'kind','capex',                                          'tone','neutral', 'order',60),
        jsonb_build_object('key','split',                  'label','Split',         'kind','distribution_count',    'op','gt', 'value',1,    'tone','info',    'order',70),
        jsonb_build_object('key','unmatched',              'label','Unmatched',     'kind','match_status',          'value','unmatched',    'tone','warning', 'order',80),
        jsonb_build_object('key','exception',              'label','Exception',     'kind','match_status',          'value','exception',    'tone','danger',  'order',90)
      ),
      'sorts', jsonb_build_array(
        jsonb_build_object('key','line_no',     'label','Line number',        'field','line_no',          'path','line_number', 'direction','asc',  'order',10),
        jsonb_build_object('key','amount_desc', 'label','Amount high to low', 'field','gross_amount',     'kind','amount',      'direction','desc', 'absolute',true, 'order',20),
        jsonb_build_object('key','amount_asc',  'label','Amount low to high', 'field','gross_amount',     'kind','amount',      'direction','asc',  'absolute',true, 'order',30),
        jsonb_build_object('key','description', 'label','Description',        'field','item_description', 'path','description', 'direction','asc',  'order',40)
      ),
      'groups', jsonb_build_array(
        jsonb_build_object('key','none',           'label','No grouping',    'order',10),
        jsonb_build_object('key','classification', 'label','Classification', 'kind','classification_rank', 'order',20),
        jsonb_build_object('key','allocation',     'label','Allocation',     'kind','allocation_rank',     'order',30)
      ),
      'densities', jsonb_build_array(
        jsonb_build_object('key','compact',     'label','Compact',     'order',10),
        jsonb_build_object('key','comfortable', 'label','Comfortable', 'order',20),
        jsonb_build_object('key','spacious',    'label','Spacious',    'order',30)
      )
    )
  ) AS value
)
UPDATE control.entity e
SET display_config = jsonb_set(COALESCE(e.display_config, '{}'::jsonb), '{line_grid}', cfg.value, true)
FROM line_grid_cfg cfg
WHERE e.table_schema = 'document'
  AND e.table_name = 'purchase_invoice_line'
  AND e.tenant_id IS NULL
  AND (e.display_config -> 'line_grid') IS NULL;

-- Field-level line grid hints: column order/labels remain owned by the line entity.
WITH field_grid AS (
  SELECT *
  FROM (VALUES
    ('line_no',          '#'::text,            'line_number',      10,  '42px',              true),
    ('item_id',          'Item',               'item_code',        20,  '86px',              false),
    ('item_description', 'Description',        'description',      30,  'minmax(18rem,1fr)', true),
    ('quantity',         'Qty',                'quantity',         40,  '64px',              true),
    ('uom_code',         'UOM',                'unit_code',        50,  '54px',              true),
    ('unit_price',       'Unit',               'unit_price',       60,  '84px',              true),
    ('net_amount',       'Net Amount',         'net_amount',       70,  '112px',             true),
    ('discount_amount',  'Discount Amount',    'discount_amount',  80,  '132px',             true),
    ('tax_amount',       'Tax Amount',         'tax_amount',       90,  '112px',             true),
    ('gross_amount',     'Gross Amount',       'gross_amount',     100, '120px',             true)
  ) AS v(field_name, label, runtime_path, order_no, width_hint, is_default_visible)
)
UPDATE control.entity_field ef
SET ui_hint = COALESCE(ef.ui_hint, '{}'::jsonb) || jsonb_build_object(
      'line_grid',
      jsonb_build_object(
        'visible', fg.is_default_visible,
        'label', fg.label,
        'path', fg.runtime_path,
        'order', fg.order_no,
        'width', fg.width_hint
      )
    ),
    label = CASE WHEN ef.name = 'discount_amount' AND ef.label = 'Discount Amt' THEN 'Discount Amount' ELSE ef.label END,
    is_sortable = CASE WHEN ef.name IN ('line_no','item_description','quantity','unit_price','net_amount','discount_amount','tax_amount','gross_amount') THEN true ELSE ef.is_sortable END,
    is_aggregatable = CASE WHEN ef.name IN ('net_amount','discount_amount','tax_amount','gross_amount') THEN true ELSE ef.is_aggregatable END,
    is_groupable = CASE WHEN ef.name IN ('procurement_type','match_status','is_asset') THEN true ELSE ef.is_groupable END
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
JOIN field_grid fg ON true
WHERE ef.entity_version_id = ev.id
  AND fg.field_name = ef.name
  AND e.table_schema = 'document'
  AND e.table_name = 'purchase_invoice_line'
  AND e.tenant_id IS NULL
  AND ev.version_no = 1;

-- ── 5. Natural key — line_no is the business key within a parent invoice ─────
UPDATE control.entity
SET natural_key_fields = ARRAY['line_no']
WHERE table_schema    = 'document'
  AND table_name      = 'purchase_invoice_line'
  AND tenant_id       IS NULL
  AND (natural_key_fields IS NULL OR natural_key_fields = '{}');

-- ── 6. Module → PROC (Procurement) ───────────────────────────────────────────
-- Inner-join style: no-op if PROC does not exist yet.
UPDATE control.entity e
SET    module_id = m.id
FROM   shared.module m
WHERE  m.code         = 'PROC'
  AND  e.table_schema = 'document'
  AND  e.table_name   = 'purchase_invoice_line'
  AND  e.tenant_id    IS NULL;

-- ── 7. Field group registry ───────────────────────────────────────────────────
-- New procurement-specific groups; extend applies_to_classes on existing ones.

INSERT INTO control.field_group (group_key, label, description, applies_to_classes, sort_order)
VALUES
    ('item',       'Item',       'Item identification, quantity and unit pricing fields.',      ARRAY['DOCUMENT_RELATION'], 155),
    ('tax',        'Tax',        'Tax and withholding tax amount fields.',                      ARRAY['DOCUMENT','DOCUMENT_RELATION'], 610),
    ('discount',   'Discount',   'Discount percentage and amount fields.',                      ARRAY['DOCUMENT','DOCUMENT_RELATION'], 630),
    ('retention',  'Retention',  'Retention percentage and retention amount fields.',           ARRAY['DOCUMENT','DOCUMENT_RELATION'], 650),
    ('dimensions', 'Dimensions', 'Cost centre, profit centre, project and site dimensions.',   ARRAY['DOCUMENT','DOCUMENT_RELATION'], 670),
    ('matching',   'Matching',   'Source document references: PO line, GR line, SES line.',    ARRAY['DOCUMENT_RELATION'], 690)
ON CONFLICT (group_key) DO UPDATE
    SET label              = EXCLUDED.label,
        description        = EXCLUDED.description,
        applies_to_classes = EXCLUDED.applies_to_classes,
        sort_order         = EXCLUDED.sort_order;

-- Extend 'financial' and 'classification' groups to cover DOCUMENT_RELATION class.
UPDATE control.field_group
SET applies_to_classes = applies_to_classes || ARRAY['DOCUMENT_RELATION']
WHERE group_key IN ('financial', 'classification')
  AND NOT ('DOCUMENT_RELATION' = ANY(applies_to_classes));

-- ── 8. Group-key patches on existing 27 fields ───────────────────────────────
-- Merges group_key into ui_hint without touching line_grid hints set in §4.
UPDATE control.entity_field ef
SET ui_hint = COALESCE(ef.ui_hint, '{}'::jsonb)
              || jsonb_build_object('group_key',
                   CASE ef.name
                     WHEN 'item_description'       THEN 'item'
                     WHEN 'procurement_type'        THEN 'item'
                     WHEN 'item_id'                 THEN 'item'
                     WHEN 'uom_code'                THEN 'item'
                     WHEN 'quantity'                THEN 'item'
                     WHEN 'unit_price'              THEN 'item'
                     WHEN 'price_unit'              THEN 'item'
                     WHEN 'net_amount'              THEN 'financial'
                     WHEN 'gross_amount'            THEN 'financial'
                     WHEN 'spend_category_id'       THEN 'classification'
                     WHEN 'business_intent_id'      THEN 'classification'
                     WHEN 'unspsc_code'             THEN 'classification'
                     WHEN 'hs_code'                 THEN 'classification'
                     WHEN 'tax_amount'              THEN 'tax'
                     WHEN 'withholding_tax_amount'  THEN 'tax'
                     WHEN 'discount_pct'            THEN 'discount'
                     WHEN 'discount_amount'         THEN 'discount'
                     WHEN 'retention_pct'           THEN 'retention'
                     WHEN 'retention_amount'        THEN 'retention'
                     WHEN 'cost_center_id'          THEN 'dimensions'
                     WHEN 'profit_center_id'        THEN 'dimensions'
                     WHEN 'project_id'              THEN 'dimensions'
                     WHEN 'site_id'                 THEN 'dimensions'
                     WHEN 'match_status'            THEN 'matching'
                     WHEN 'matched_quantity'        THEN 'matching'
                     WHEN 'is_asset'                THEN 'matching'
                     WHEN 'asset_category_id'       THEN 'matching'
                   END
                 )
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'purchase_invoice_line'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN (
    'item_description', 'procurement_type', 'item_id', 'uom_code',
    'quantity', 'unit_price', 'price_unit',
    'net_amount', 'gross_amount',
    'spend_category_id', 'business_intent_id', 'unspsc_code', 'hs_code',
    'tax_amount', 'withholding_tax_amount',
    'discount_pct', 'discount_amount',
    'retention_pct', 'retention_amount',
    'cost_center_id', 'profit_center_id', 'project_id', 'site_id',
    'match_status', 'matched_quantity', 'is_asset', 'asset_category_id'
  );

-- ── 9. FK reference link fields (matching group) ─────────────────────────────
UPDATE control.entity_field ef
SET ui_hint = COALESCE(ef.ui_hint, '{}'::jsonb)
              || jsonb_build_object('taxonomy_domain',
                   CASE ef.name
                     WHEN 'unspsc_code' THEN 'unspsc'
                     WHEN 'hs_code'     THEN 'hs'
                   END
                 )
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'purchase_invoice_line'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN ('unspsc_code', 'hs_code');

-- Three read-only reference fields surfaced in the Reference tab.
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, is_required, is_filterable,
    reference_config, validation, ui_hint, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, 'reference',
       'zero_or_one', 'standard', false, false,
       f.reference_config, f.validation, f.ui_hint, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('commitment_line_id',
     'commitment_line_id',
     'PO Line',
     '{"target_entity":"commitment_line","target_field":"id","display_field":"line_no"}'::jsonb,
     '{"ref_entity":"commitment_line"}'::jsonb,
     '{"group_key":"matching","read_only":true}'::jsonb,
     150),
    ('goods_receipt_line_id',
     'goods_receipt_line_id',
     'GR Line',
     '{"target_entity":"goods_receipt_line","target_field":"id","display_field":"line_no"}'::jsonb,
     '{"ref_entity":"goods_receipt_line"}'::jsonb,
     '{"group_key":"matching","read_only":true}'::jsonb,
     155),
    ('ses_line_id',
     'ses_line_id',
     'SES Line',
     '{"target_entity":"service_entry_sheet_line","target_field":"id","display_field":"line_no"}'::jsonb,
     '{"ref_entity":"service_entry_sheet_line"}'::jsonb,
     '{"group_key":"matching","read_only":true}'::jsonb,
     160)
) AS f(name, column_name, label, reference_config, validation, ui_hint, sort_order)
WHERE e.table_schema = 'document' AND e.table_name = 'purchase_invoice_line'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── 10. display_config — procure_line block + line_ui_variant ─────────────────
-- Idempotent: only applies when 'line_ui_variant' key is absent.
UPDATE control.entity
SET display_config = display_config
    || jsonb_build_object('line_ui_variant', 'procure')
    || jsonb_build_object('procure_line', jsonb_build_object(

        'amount_field', 'gross_amount',

        'composer_sections', jsonb_build_array(
            jsonb_build_object(
                'key',         'item',
                'label',       'WHAT',
                'groups',      '["item"]'::jsonb,
                'default_open', true
            ),
            jsonb_build_object(
                'key',          'financial',
                'label',        'HOW MUCH',
                'groups',       '["financial"]'::jsonb,
                'default_open', false
            ),
            jsonb_build_object(
                'key',          'dimensions',
                'label',        'WHERE IT COSTS',
                'groups',       '["dimensions"]'::jsonb,
                'fields',       '["cost_center_id","project_id","profit_center_id","site_id"]'::jsonb,
                'default_open', false
            ),
            jsonb_build_object(
                'key',          'classification',
                'label',        'CLASSIFICATION',
                'groups',       '["classification"]'::jsonb,
                'default_open', false,
                'type',         'classification'
            ),
            jsonb_build_object(
                'key',          'other_cost',
                'label',        'Other Cost',
                'groups',       '[]'::jsonb,
                'fields',       '["tax_amount","withholding_tax_amount","discount_pct","discount_amount","retention_pct","retention_amount"]'::jsonb,
                'default_open', false
            )
        ),

        'editor_tabs', jsonb_build_array(
            jsonb_build_object(
                'key',    'item',
                'label',  'Item',
                'groups', '["item","financial"]'::jsonb
            ),
            jsonb_build_object(
                'key',    'classify',
                'label',  'Classify',
                'groups', '["classification"]'::jsonb,
                'type',   'classification'
            ),
            jsonb_build_object(
                'key',    'accounting',
                'label',  'Accounting',
                'groups', '["dimensions"]'::jsonb,
                'type',   'distributions'
            ),
            jsonb_build_object(
                'key',    'tax',
                'label',  'Tax',
                'groups', '["tax"]'::jsonb
            ),
            jsonb_build_object(
                'key',    'discount',
                'label',  'Discount',
                'groups', '["discount"]'::jsonb
            ),
            jsonb_build_object(
                'key',    'retention',
                'label',  'Retention',
                'groups', '["retention"]'::jsonb
            ),
            jsonb_build_object(
                'key',    'matching',
                'label',  'Reference',
                'groups', '["matching"]'::jsonb,
                'type',   'reference_links'
            )
        ),

        'reference_tab', jsonb_build_object(
            'match_status_field', 'match_status',
            'has_exceptions',     true,
            'links', jsonb_build_array(
                jsonb_build_object(
                    'id_field', 'commitment_line_id',
                    'label',    'PO Line',
                    'entity',   'commitment_line'
                ),
                jsonb_build_object(
                    'id_field', 'goods_receipt_line_id',
                    'label',    'GR Line',
                    'entity',   'goods_receipt_line'
                ),
                jsonb_build_object(
                    'id_field', 'ses_line_id',
                    'label',    'SES Line',
                    'entity',   'service_entry_sheet_line'
                )
            )
        )
    ))
WHERE table_schema = 'document'
  AND table_name   = 'purchase_invoice_line'
  AND tenant_id    IS NULL
  AND NOT (display_config ? 'line_ui_variant');

-- Keep composer sections current for installs that already had the procure config.
UPDATE control.entity
SET display_config = jsonb_set(
    display_config,
    '{procure_line,composer_sections}',
    jsonb_build_array(
        jsonb_build_object('key', 'item',           'label', 'WHAT',           'groups', '["item"]'::jsonb,           'default_open', true),
        jsonb_build_object('key', 'financial',      'label', 'HOW MUCH',       'groups', '["financial"]'::jsonb,      'default_open', false),
        jsonb_build_object('key', 'dimensions',     'label', 'WHERE IT COSTS', 'groups', '["dimensions"]'::jsonb,     'fields', '["cost_center_id","project_id","profit_center_id","site_id"]'::jsonb, 'default_open', false),
        jsonb_build_object('key', 'classification', 'label', 'CLASSIFICATION', 'groups', '["classification"]'::jsonb, 'default_open', false, 'type', 'classification'),
        jsonb_build_object('key', 'other_cost',     'label', 'Other Cost',     'groups', '[]'::jsonb,                 'fields', '["tax_amount","withholding_tax_amount","discount_pct","discount_amount","retention_pct","retention_amount"]'::jsonb, 'default_open', false)
    )
)
WHERE table_schema = 'document'
  AND table_name   = 'purchase_invoice_line'
  AND tenant_id    IS NULL
  AND (display_config ? 'line_ui_variant');

-- ── 11. Add "charges" editor tab between discount and retention ───────────────
-- Idempotent: only runs when the charges tab key is absent.
UPDATE control.entity
SET display_config = jsonb_set(
    display_config,
    '{procure_line,editor_tabs}',
    jsonb_build_array(
        jsonb_build_object('key', 'item',       'label', 'Item',      'groups', '["item","financial"]'::jsonb),
        jsonb_build_object('key', 'classify',   'label', 'Classify',  'groups', '["classification"]'::jsonb,   'type', 'classification'),
        jsonb_build_object('key', 'accounting', 'label', 'Accounting','groups', '["dimensions"]'::jsonb,        'type', 'distributions'),
        jsonb_build_object('key', 'tax',        'label', 'Tax',       'groups', '["tax"]'::jsonb),
        jsonb_build_object('key', 'discount',   'label', 'Discount',  'groups', '["discount"]'::jsonb),
        jsonb_build_object('key', 'charges',    'label', 'Charges',   'groups', '[]'::jsonb,                   'type', 'charges'),
        jsonb_build_object('key', 'retention',  'label', 'Retention', 'groups', '["retention"]'::jsonb),
        jsonb_build_object('key', 'matching',   'label', 'Reference', 'groups', '["matching"]'::jsonb,         'type', 'reference_links')
    )
)
WHERE table_schema = 'document'
  AND table_name   = 'purchase_invoice_line'
  AND tenant_id    IS NULL
  AND (display_config ? 'line_ui_variant')
  AND NOT (display_config->'procure_line'->'editor_tabs' @> '[{"key":"charges"}]'::jsonb);

-- ── 12. Explicit sub-tab layout configs (item / tax / discount / retention) ────
-- Idempotent: only applies when item_tab key is absent.
UPDATE control.entity
SET display_config = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          display_config,
          '{procure_line,item_tab}',
          jsonb_build_object(
            'primary_fields', '["item_description","item_id"]'::jsonb,
            'quantity_row',   '["quantity","uom_code","unit_price"]'::jsonb
          )
        ),
        '{procure_line,tax_tab}',
        jsonb_build_object(
          'sections', jsonb_build_array(
            jsonb_build_object('label', 'OUTPUT TAX',      'fields', '["tax_amount"]'::jsonb),
            jsonb_build_object('label', 'WITHHOLDING TAX', 'fields', '["withholding_tax_amount"]'::jsonb)
          )
        )
      ),
      '{procure_line,discount_tab}',
      jsonb_build_object(
        'label',        'TRADE DISCOUNT',
        'pct_field',    'discount_pct',
        'amount_field', 'discount_amount'
      )
    ),
    '{procure_line,retention_tab}',
    jsonb_build_object(
      'label',        'RETENTION',
      'pct_field',    'retention_pct',
      'amount_field', 'retention_amount',
      'other_label',  'RELEASE CONDITIONS'
    )
)
WHERE table_schema = 'document'
  AND table_name   = 'purchase_invoice_line'
  AND tenant_id    IS NULL
  AND (display_config ? 'line_ui_variant')
  AND NOT (display_config->'procure_line' ? 'item_tab');
