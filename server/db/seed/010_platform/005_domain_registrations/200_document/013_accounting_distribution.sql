-- 100_finance/200_document/005_accounting_distribution.sql
-- Purpose: control.entity + entity_version + entity_field + display_config
--          for Accounting Distribution (document.accounting_distribution)
-- Class:   DOCUMENT_RELATION — system-generated pre-GL split rows; no lifecycle,
--          no user-facing operations (created/managed by the posting engine only)
-- Module:  ACC (Finance Core Accounting)
-- Depends on: 004_invoice_line.sql
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
    'accounting_distribution', 'ACCD', 'accounting_distribution',
    'DOCUMENT_RELATION', 'system', 'ent', 'table',
    'full', 'tenant_critical', 'locked',
    'document', 'accounting_distribution',
    'Accounting Distribution', 'Accounting Distributions', 'split', 'slate',
    false,
    '{
        "polymorphic_parent":        true,
        "parent_source_type_field":  "source_doc_type",
        "parent_source_id_field":    "source_doc_id",
        "parent_source_line_field":  "source_line_id",
        "auto_generated":            true
    }'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
    WHERE table_schema = 'document' AND table_name = 'accounting_distribution'
      AND tenant_id IS NULL
);

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'document' AND e.table_name = 'accounting_distribution'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;

-- ── 3. control.entity_field (22 fields) ──────────────────────────────────────
-- Group A: Source document (polymorphic)   (5-10)
-- Group B: Split basis & amounts           (20-35)
-- Group C: Account resolution inputs       (40-60)
-- Group D: Dimensions                      (70-85)
-- Group E: Flags, budget & narrative       (90-110)
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
    -- ── A: Source Document ────────────────────────────────────────────────────
    ('source_doc_type',     'source_doc_type',     'Source Type',         'text',      'one',         NULL::text,                                   true,  true,  NULL::jsonb,                                    5),
    ('source_line_id',      'source_line_id',      'Source Line',         'reference', 'one',         NULL::text,                                   true,  false, '{"polymorphic":true}'::jsonb,                  7),
    ('distribution_no',     'distribution_no',     'Dist. No.',           'integer',   'one',         NULL::text,                                   true,  false, '{"min":1}'::jsonb,                            10),
    -- ── B: Split Basis & Amounts ──────────────────────────────────────────────
    ('distribution_basis',  'distribution_basis',  'Split Basis',         'enum',      'one',         'document.acct_dist_account_source'::text,    true,  true,  NULL::jsonb,                                   20),
    ('split_pct',           'split_pct',           'Split %',             'decimal',   'zero_or_one', NULL::text,                                   false, false, '{"min":0}'::jsonb,                            25),
    ('split_amount',        'split_amount',        'Split Amount',        'decimal',   'zero_or_one', NULL::text,                                   false, false, '{"min":0}'::jsonb,                            27),
    ('distributed_amount',  'distributed_amount',  'Distributed Amt',     'decimal',   'one',         NULL::text,                                   true,  true,  '{"min":0}'::jsonb,                            30),
    ('currency_code',       'currency_code',       'Currency',            'text',      'one',         NULL::text,                                   true,  false, '{"max_length":3}'::jsonb,                     35),
    -- ── C: Account Resolution ─────────────────────────────────────────────────
    ('account_source',      'account_source',      'Account Source',      'enum',      'one',         'document.acct_dist_account_source'::text,    true,  true,  NULL::jsonb,                                   40),
    ('posting_role_code',   'posting_role_code',   'Posting Role',        'text',      'zero_or_one', NULL::text,                                   false, false, NULL::jsonb,                                   45),
    ('gl_account_id',       'gl_account_id',       'GL Account',          'reference', 'zero_or_one', NULL::text,                                   false, true,  '{"ref_entity":"gl_account"}'::jsonb,          50),
    ('account_code',        'account_code',        'Account Code',        'text',      'zero_or_one', NULL::text,                                   false, false, '{"max_length":50}'::jsonb,                    52),
    ('business_intent_id',  'business_intent_id',  'Business Intent',     'reference', 'zero_or_one', NULL::text,                                   false, false, '{"ref_entity":"business_intent"}'::jsonb,     55),
    ('spend_category_id',   'spend_category_id',   'Spend Category',      'reference', 'zero_or_one', NULL::text,                                   false, true,  '{"ref_entity":"spend_category"}'::jsonb,      60),
    -- ── D: Dimensions ─────────────────────────────────────────────────────────
    ('cost_center_id',      'cost_center_id',      'Cost Centre',         'reference', 'zero_or_one', NULL::text,                                   false, true,  '{"ref_entity":"cost_center"}'::jsonb,         70),
    ('profit_center_id',    'profit_center_id',    'Profit Centre',       'reference', 'zero_or_one', NULL::text,                                   false, false, '{"ref_entity":"profit_center"}'::jsonb,       75),
    ('project_id',          'project_id',          'Project',             'reference', 'zero_or_one', NULL::text,                                   false, true,  '{"ref_entity":"project"}'::jsonb,             80),
    ('site_id',             'site_id',             'Site',                'reference', 'zero_or_one', NULL::text,                                   false, false, '{"ref_entity":"site"}'::jsonb,                85),
    -- ── E: Flags, Budget & Narrative ──────────────────────────────────────────
    ('is_capex',            'is_capex',            'CapEx',               'boolean',   'one',         NULL::text,                                   false, true,  NULL::jsonb,                                   90),
    ('asset_class_id',      'asset_class_id',      'Asset Class',         'reference', 'zero_or_one', NULL::text,                                   false, false, '{"ref_entity":"asset_class"}'::jsonb,         95),
    ('budget_check_result', 'budget_check_result', 'Budget Check',        'text',      'zero_or_one', NULL::text,                                   false, true,  NULL::jsonb,                                  100),
    ('description',         'description',         'Description',         'text',      'zero_or_one', NULL::text,                                   false, false, '{"max_length":500}'::jsonb,                  110)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'document' AND e.table_name = 'accounting_distribution'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── 4. Natural key — distribution_no is the business key within a source line ─
UPDATE control.entity
SET natural_key_fields = ARRAY['distribution_no']
WHERE table_schema    = 'document'
  AND table_name      = 'accounting_distribution'
  AND tenant_id       IS NULL
  AND (natural_key_fields IS NULL OR natural_key_fields = '{}');

-- ── 5. display_config ────────────────────────────────────────────────────────
UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'master',
    'title_field',        'distribution_no',
    'subtitle_field',     'account_source',
    'list_columns',       '["distribution_no","distribution_basis","distributed_amount","account_source","gl_account_id","cost_center_id","spend_category_id"]'::jsonb,
    'default_sort_field', 'distribution_no',
    'default_sort_order', 'asc'
)
WHERE table_schema = 'document' AND table_name = 'accounting_distribution'
  AND tenant_id IS NULL
  AND display_config = '{}'::jsonb;
