-- 100_finance/200_document/005_accounting_distribution.sql
-- Purpose: control.entity + entity_version + entity_field + display_config
--          for Account Assignment Split (document.accounting_distribution)
-- Class:   DOCUMENT_RELATION — system-generated pre-GL split rows; no lifecycle,
--          no user-facing operations (created/managed by the posting engine only)
-- Module:  ACC (Finance Core Accounting)
-- Depends on: 004_invoice_line.sql
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT / canonical UPDATEs throughout

-- ── 1. control.entity ────────────────────────────────────────────────────────
INSERT INTO control.entity (
    module_id, name, entity_short, entity_code,
    entity_class, ownership_model, kind, backing_type,
    governance_level, security_tier, mutability,
    table_schema, table_name,
    label_singular, label_plural, icon_key, color_token,
    feature_flags,
    status, created_by)
SELECT
    (SELECT id FROM shared.module WHERE code = 'ACC'),
    'accounting_distribution', 'ACCD', 'accounting_distribution',
    'DOCUMENT_RELATION', 'system', 'ent', 'table',
    'full', 'tenant_critical', 'locked',
    'document', 'accounting_distribution',
    'Account Assignment Split', 'Account Assignment Splits', 'split', 'slate',
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

UPDATE control.entity
   SET module_id = COALESCE((SELECT id::text FROM shared.module WHERE code = 'ACC'), module_id),
       name = 'accounting_distribution',
       slug = 'accounting-distribution',
       entity_short = 'ACCD',
       entity_code = 'accounting_distribution',
       entity_class = 'DOCUMENT_RELATION',
       ownership_model = 'system',
       kind = 'ent',
       backing_type = 'table',
       governance_level = 'full',
       security_tier = 'tenant_critical',
       mutability = 'locked',
       label_singular = 'Account Assignment Split',
       label_plural = 'Account Assignment Splits',
       icon_key = 'split',
       color_token = 'slate',
       feature_flags = jsonb_build_object(
           'polymorphic_parent', true,
           'parent_source_type_field', 'source_doc_type',
           'parent_source_id_field', 'source_doc_id',
           'parent_source_line_field', 'source_line_id',
           'auto_generated', true
       ),
       identity_config = jsonb_set(COALESCE(identity_config, '{}'::jsonb), '{natural_key_fields}', to_jsonb(ARRAY['distribution_no']::text[]), true),
       status = 'ACTIVE',
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
 WHERE table_schema = 'document'
   AND table_name = 'accounting_distribution'
   AND tenant_id IS NULL;

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status,
    label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE',
    'Initial Version', 'structural', now(),
    '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'document' AND e.table_name = 'accounting_distribution'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO UPDATE
SET status = 'EFFECTIVE',
    effective_from = COALESCE(control.entity_version.effective_from, EXCLUDED.effective_from),
    updated_at = now(),
    updated_by = '00000000-0000-0000-0000-000000000000';

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
    ('source_doc_type',     'source_doc_type',     'Source Document Type','text',      'one',         NULL::text,                                   true,  true,  NULL::jsonb,                                    5),
    ('source_line_id',      'source_line_id',      'Commercial Line',     'reference', 'one',         NULL::text,                                   true,  false, '{"polymorphic":true}'::jsonb,                  7),
    ('distribution_no',     'distribution_no',     'Split No.',           'integer',   'one',         NULL::text,                                   true,  false, '{"min":1}'::jsonb,                            10),
    -- ── B: Split Basis & Amounts ──────────────────────────────────────────────
    ('distribution_basis',  'distribution_basis',  'Split Basis',         'enum',      'one',         'document.acct_dist_account_source'::text,    true,  true,  NULL::jsonb,                                   20),
    ('split_pct',           'split_pct',           'Split %',             'decimal',   'zero_or_one', NULL::text,                                   false, false, '{"min":0}'::jsonb,                            25),
    ('split_amount',        'split_amount',        'Split Amount',        'decimal',   'zero_or_one', NULL::text,                                   false, false, '{"min":0}'::jsonb,                            27),
    ('distributed_amount',  'distributed_amount',  'Assigned Amount',     'decimal',   'one',         NULL::text,                                   true,  true,  '{"min":0}'::jsonb,                            30),
    ('currency_code',       'currency_code',       'Currency',            'text',      'one',         NULL::text,                                   true,  false, '{"max_length":3}'::jsonb,                     35),
    -- ── C: Account Resolution ─────────────────────────────────────────────────
    ('account_source',      'account_source',      'Account Derivation',  'enum',      'one',         'document.acct_dist_account_source'::text,    true,  true,  NULL::jsonb,                                   40),
    ('posting_role_code',   'posting_role_code',   'Posting Role',        'text',      'zero_or_one', NULL::text,                                   false, false, NULL::jsonb,                                   45),
    ('gl_account_id',       'gl_account_id',       'Resolved GL Account', 'reference', 'zero_or_one', NULL::text,                                   false, true,  '{"ref_entity":"gl_account"}'::jsonb,          50),
    ('account_code',        'account_code',        'Account Code',        'text',      'zero_or_one', NULL::text,                                   false, false, '{"max_length":50}'::jsonb,                    52),
    ('business_intent_id',  'business_intent_id',  'Business Intent',     'reference', 'zero_or_one', NULL::text,                                   false, false, '{"ref_entity":"business_intent"}'::jsonb,     55),
    ('commodity_category_id',   'commodity_category_id',   'Commodity Category',      'reference', 'zero_or_one', NULL::text,                                   false, true,  '{"ref_entity":"commodity_category"}'::jsonb,      60),
    -- ── D: Dimensions ─────────────────────────────────────────────────────────
    ('cost_center_id',      'cost_center_id',      'Cost Centre',         'reference', 'zero_or_one', NULL::text,                                   false, true,  '{"ref_entity":"cost_center"}'::jsonb,         70),
    ('profit_center_id',    'profit_center_id',    'Profit Centre',       'reference', 'zero_or_one', NULL::text,                                   false, false, '{"ref_entity":"profit_center"}'::jsonb,       75),
    ('project_id',          'project_id',          'Project',             'reference', 'zero_or_one', NULL::text,                                   false, true,  '{"ref_entity":"project"}'::jsonb,             80),
    ('site_id',             'site_id',             'Site',                'reference', 'zero_or_one', NULL::text,                                   false, false, '{"ref_entity":"site"}'::jsonb,                85),
    -- ── E: Flags, Budget & Narrative ──────────────────────────────────────────
    ('is_capex',            'is_capex',            'CapEx',               'boolean',   'one',         NULL::text,                                   false, true,  NULL::jsonb,                                   90),
    ('asset_class_id',      'asset_class_id',      'Asset Class',         'reference', 'zero_or_one', NULL::text,                                   false, false, '{"ref_entity":"asset_class"}'::jsonb,         95),
    ('budget_check_result', 'budget_check_result', 'Budget Check',        'text',      'zero_or_one', NULL::text,                                   false, true,  NULL::jsonb,                                  100),
    ('description',         'description',         'Split Text',          'text',      'zero_or_one', NULL::text,                                   false, false, '{"max_length":500}'::jsonb,                  110)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'document' AND e.table_name = 'accounting_distribution'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- Folded in from retired runtime repair: canonical field metadata for splits.
WITH distribution_fields(
    name, column_name, label, data_type, cardinality, enum_domain_code,
    reference_config, validation, is_required, is_filterable, is_read_only,
    sort_order, group_key
) AS (
    VALUES
    ('source_doc_type', 'source_doc_type', 'Source Document Type', 'text', 'one', NULL::text, NULL::jsonb, NULL::jsonb, true, true, true, 5, 'reference'),
    ('source_line_id', 'source_line_id', 'Commercial Line', 'reference', 'one', NULL::text, NULL::jsonb, '{"polymorphic":true}'::jsonb, true, false, true, 7, 'reference'),
    ('distribution_no', 'distribution_no', 'Split No.', 'integer', 'one', NULL::text, NULL::jsonb, '{"min":1}'::jsonb, true, false, true, 10, 'identity'),
    ('distribution_basis', 'distribution_basis', 'Split Basis', 'enum', 'one', 'document.acct_dist_account_source', NULL::jsonb, NULL::jsonb, true, true, false, 20, 'financial'),
    ('split_pct', 'split_pct', 'Split %', 'decimal', 'zero_or_one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, false, false, false, 25, 'financial'),
    ('split_amount', 'split_amount', 'Split Amount', 'decimal', 'zero_or_one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, false, false, false, 27, 'financial'),
    ('distributed_amount', 'distributed_amount', 'Assigned Amount', 'decimal', 'one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, true, true, false, 30, 'financial'),
    ('currency_code', 'currency_code', 'Currency', 'text', 'one', NULL::text, NULL::jsonb, '{"max_length":3}'::jsonb, true, false, true, 35, 'financial'),
    ('account_source', 'account_source', 'Account Derivation', 'enum', 'one', 'document.acct_dist_account_source', NULL::jsonb, NULL::jsonb, true, true, false, 40, 'matching'),
    ('posting_role_code', 'posting_role_code', 'Posting Role', 'text', 'zero_or_one', NULL::text, NULL::jsonb, NULL::jsonb, false, false, true, 45, 'matching'),
    ('gl_account_id', 'gl_account_id', 'Resolved GL Account', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"gl_account","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb, '{"ref_entity":"gl_account"}'::jsonb, false, true, false, 50, 'matching'),
    ('account_code', 'account_code', 'Account Code', 'text', 'zero_or_one', NULL::text, NULL::jsonb, '{"max_length":50}'::jsonb, false, false, true, 52, 'matching'),
    ('business_intent_id', 'business_intent_id', 'Business Intent', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"business_intent","target_field":"id","display_field":"name"}'::jsonb, '{"ref_entity":"business_intent"}'::jsonb, false, false, false, 55, 'classification'),
    ('commodity_category_id', 'commodity_category_id', 'Commodity Category', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"commodity_category","target_field":"id","display_field":"name"}'::jsonb, '{"ref_entity":"commodity_category"}'::jsonb, false, true, false, 60, 'classification'),
    ('cost_center_id', 'cost_center_id', 'Cost Centre', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"cost_center","target_field":"id","display_field":"name"}'::jsonb, '{"ref_entity":"cost_center"}'::jsonb, false, true, false, 70, 'dimensions'),
    ('profit_center_id', 'profit_center_id', 'Profit Centre', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"profit_center","target_field":"id","display_field":"name"}'::jsonb, '{"ref_entity":"profit_center"}'::jsonb, false, false, false, 75, 'dimensions'),
    ('project_id', 'project_id', 'Project', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"project","target_field":"id","display_field":"name"}'::jsonb, '{"ref_entity":"project"}'::jsonb, false, true, false, 80, 'dimensions'),
    ('site_id', 'site_id', 'Site', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"site","target_field":"id","display_field":"name"}'::jsonb, '{"ref_entity":"site"}'::jsonb, false, false, false, 85, 'dimensions'),
    ('is_capex', 'is_capex', 'CapEx', 'boolean', 'one', NULL::text, NULL::jsonb, NULL::jsonb, false, true, false, 90, 'matching'),
    ('asset_class_id', 'asset_class_id', 'Asset Class', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"asset_class","target_field":"id","display_field":"name"}'::jsonb, '{"ref_entity":"asset_class"}'::jsonb, false, false, false, 95, 'matching'),
    ('budget_check_result', 'budget_check_result', 'Budget Check', 'text', 'zero_or_one', NULL::text, NULL::jsonb, NULL::jsonb, false, true, true, 100, 'matching'),
    ('description', 'description', 'Split Text', 'text', 'zero_or_one', NULL::text, NULL::jsonb, '{"max_length":500}'::jsonb, false, false, false, 110, 'identity')
)
-- Update canonical accounting distribution field metadata.
UPDATE control.entity_field ef
   SET column_name = df.column_name,
       label = df.label,
       data_type = df.data_type,
       ui_type = NULL,
       cardinality = df.cardinality,
       origin = 'standard',
       enum_config = NULL,
       enum_domain_code = df.enum_domain_code,
       reference_config = df.reference_config,
       validation = df.validation,
       is_required = df.is_required,
       is_filterable = df.is_filterable,
       is_read_only = df.is_read_only,
       is_computed = false,
       is_active = true,
       ui_hint = CASE
           WHEN df.group_key IS NULL THEN COALESCE(ef.ui_hint, '{}'::jsonb) - 'group_key'
           ELSE COALESCE(ef.ui_hint, '{}'::jsonb) || jsonb_build_object('group_key', df.group_key)
       END,
       sort_order = df.sort_order,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM distribution_fields df,
       control.entity_version ev,
       control.entity e
 WHERE e.entity_code = 'accounting_distribution'
   AND e.tenant_id IS NULL
   AND e.id = ev.entity_id
   AND ev.version_no = 1
   AND ev.tenant_id IS NULL
   AND ev.id = ef.entity_version_id
   AND ef.tenant_id IS NULL
   AND ef.name = df.name;

-- GL account picker lookup_config: company code -> primary operating COA -> postable GL accounts.
UPDATE control.entity_field ef
   SET lookup_config = '{
         "search_fields": ["code", "name"],
         "filters": {
           "status": "active",
           "posting_allowed": true
         },
         "dependent_filter": {
           "source_field": "company_code_id",
           "target_field": "chart_of_account_id",
           "through_entity": "company_code_chart_assignment",
           "through_source_field": "company_code_id",
           "through_target_field": "chart_of_account_id",
           "through_filters": {
             "status": "active",
             "assignment_type": "operating",
             "is_primary": true
           },
           "empty_behavior": "empty"
         }
       }'::jsonb,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity e
  JOIN control.entity_version ev
    ON ev.entity_id = e.id
 WHERE e.entity_code = 'accounting_distribution'
   AND e.tenant_id IS NULL
   AND ev.version_no = 1
   AND ev.tenant_id IS NULL
   AND ef.entity_version_id = ev.id
   AND ef.tenant_id IS NULL
   AND ef.name = 'gl_account_id'
   AND COALESCE(ef.lookup_config, '{}'::jsonb) IS DISTINCT FROM '{
         "search_fields": ["code", "name"],
         "filters": {
           "status": "active",
           "posting_allowed": true
         },
         "dependent_filter": {
           "source_field": "company_code_id",
           "target_field": "chart_of_account_id",
           "through_entity": "company_code_chart_assignment",
           "through_source_field": "company_code_id",
           "through_target_field": "chart_of_account_id",
           "through_filters": {
             "status": "active",
             "assignment_type": "operating",
             "is_primary": true
           },
           "empty_behavior": "empty"
         }
       }'::jsonb;

-- Natural key: distribution_no is the business key within a source line.
UPDATE control.entity
SET identity_config = jsonb_set(COALESCE(identity_config, '{}'::jsonb), '{natural_key_fields}', to_jsonb(ARRAY['distribution_no']::text[]), true)
WHERE table_schema    = 'document'
  AND table_name      = 'accounting_distribution'
  AND tenant_id       IS NULL
  AND COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(identity_config->'natural_key_fields') = 'array' THEN identity_config->'natural_key_fields' ELSE '[]'::jsonb END), 0) = 0;
-- ── 5. display_config ────────────────────────────────────────────────────────
UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'master',
    'title_field',        'distribution_no',
    'subtitle_field',     'account_source',
    'list_columns',       '["distribution_no","distribution_basis","distributed_amount","account_source","gl_account_id","cost_center_id","commodity_category_id"]'::jsonb,
    'default_sort_field', 'distribution_no',
    'default_sort_order', 'asc'
)
WHERE table_schema = 'document' AND table_name = 'accounting_distribution'
  AND tenant_id IS NULL
  AND display_config = '{}'::jsonb;

-- Folded in from retired runtime repair: normalize the runtime display identity.
UPDATE control.entity
   SET display_config = COALESCE(display_config, '{}'::jsonb)
       || jsonb_build_object(
           'detail_renderer', 'master',
           'title_field', 'distribution_no',
           'subtitle_field', 'account_source',
           'list_columns', '["distribution_no","distribution_basis","distributed_amount","account_source","gl_account_id","cost_center_id","commodity_category_id"]'::jsonb,
           'default_sort_field', 'distribution_no',
           'default_sort_order', 'asc',
           'field_metadata_repair_version', 1
       ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
 WHERE table_schema = 'document'
   AND table_name = 'accounting_distribution'
   AND tenant_id IS NULL;
