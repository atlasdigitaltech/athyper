-- ============================================================================
-- 044_entity_field_pricing_component.sql
-- Concept: Register every PC column as a control.entity_field row
-- Depends on: 040c_entity_pricing_component.sql (entity + v1 version),
--             041_entity_version.sql, 042_entity_field.sql
-- Spec: docs/specs/purchase_invoice_field_design.md §15
--
-- One INSERT per PC column. is_computed flags set per spec:
--   service-maintained: computed_amount, computed_base_amount,
--                       is_apportioned, is_apportioned_from_id,
--                       superseded_by_id, superseded_at, superseded_by_user,
--                       gl_account_id
--   trigger-maintained: row_version
--   generated: (none on PC)
-- ============================================================================

BEGIN;
SET LOCAL app.bypass_version_lock = 'true';

WITH pc_version AS (
    SELECT ev.id AS version_id
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.table_schema = 'document'
       AND e.table_name   = 'pricing_component'
       AND e.tenant_id IS NULL
       AND ev.version_no  = 1
     LIMIT 1
)
INSERT INTO control.entity_field (
    tenant_id, entity_version_id,
    name, column_name, label,
    data_type, ui_type,
    cardinality, origin,
    is_required, is_read_only, is_computed, is_write_once,
    compute_mode,
    enum_domain_code,
    group_key,
    is_active,
    created_by
)
SELECT NULL, pc_version.version_id,
       v.field_name, v.column_name, v.label,
       v.data_type, v.ui_type,
       'one', CASE WHEN v.origin = 'business' THEN 'standard' ELSE v.origin END,
       v.is_required,
       -- ef_writeonce_readonly_chk: write_once and read_only are mutually exclusive.
       -- Force is_read_only=false when is_write_once=true (write_once already implies
       -- no edits after create; read_only is for engine-maintained values).
       CASE WHEN v.is_write_once THEN false ELSE v.is_read_only END,
       v.is_computed, v.is_write_once,
       v.compute_mode,
       v.enum_domain_code,
       v.group_key,
       true,
       '00000000-0000-0000-0000-000000000000'
  FROM pc_version,
       (VALUES
    -- field_name, column_name, label, data_type, ui_type, origin, required, ro, computed, write_once, compute_mode, enum_domain, group_key

    -- ── Identity ─────────────────────────────────────────────────────────────
    ('id',                   'id',                   'ID',                          'uuid',        'identifier', 'system',   true,  true,  false, true,  NULL,        NULL, 'identity'),
    ('tenant_id',            'tenant_id',            'Tenant',                      'uuid',        'reference',  'system',   true,  true,  false, true,  NULL,        NULL, 'identity'),
    ('company_code_id',      'company_code_id',      'Company Code',                'uuid',        'reference',  'system',   true,  true,  false, true,  NULL,        NULL, 'identity'),

    -- ── Polymorphic source ───────────────────────────────────────────────────
    ('source_doc_type',      'source_doc_type',      'Source Type',                 'text',        'enum',       'system',   true,  true,  false, true,  NULL,        NULL, 'source'),
    ('source_doc_id',        'source_doc_id',        'Source Header',               'uuid',        'reference',  'system',   true,  true,  false, true,  NULL,        NULL, 'source'),
    ('source_line_id',       'source_line_id',       'Source Line',                 'uuid',        'reference',  'system',   false, true,  false, true,  NULL,        NULL, 'source'),

    -- ── Term classification ──────────────────────────────────────────────────
    ('term_type',            'term_type',            'Term Type',                   'text',        'enum',       'business', true,  false, false, false, NULL,        NULL, 'classification'),
    ('condition_type_id',    'condition_type_id',    'Condition Type',              'uuid',        'reference',  'business', true,  false, false, false, NULL,        NULL, 'classification'),
    ('sequence',             'sequence',             'Sequence',                    'integer',     'number',     'business', true,  false, false, false, NULL,        NULL, 'classification'),

    -- ── Basis & values ───────────────────────────────────────────────────────
    ('basis',                'basis',                'Basis',                       'text',        'enum',       'business', true,  false, false, false, NULL,        NULL, 'amounts'),
    ('rate_value',           'rate_value',           'Rate',                        'numeric',     'number',     'business', false, false, false, false, NULL,        NULL, 'amounts'),
    ('amount_value',         'amount_value',         'Amount',                      'numeric',     'money',      'business', false, false, false, false, NULL,        NULL, 'amounts'),
    ('base_for_calculation', 'base_for_calculation', 'Base for Calc',               'numeric',     'money',      'business', false, true,  false, false, NULL,        NULL, 'amounts'),
    ('computed_amount',      'computed_amount',      'Computed Amount',             'numeric',     'money',      'system',   true,  true,  true,  false, 'service',   NULL, 'amounts'),
    ('computed_base_amount', 'computed_base_amount', 'Computed Amount (Base)',      'numeric',     'money',      'system',   true,  true,  true,  false, 'service',   NULL, 'amounts'),

    -- ── Entry & apportionment ────────────────────────────────────────────────
    ('entry_level',          'entry_level',          'Entry Level',                 'text',        'enum',       'business', true,  false, false, false, NULL,        NULL, 'apportionment'),
    ('apportion_basis',      'apportion_basis',      'Apportion Basis',             'text',        'enum',       'business', false, false, false, false, NULL,        NULL, 'apportionment'),
    ('is_apportioned',       'is_apportioned',       'Is Apportioned',              'boolean',     'switch',     'system',   true,  true,  true,  false, 'service',   NULL, 'apportionment'),
    ('is_apportioned_from_id','is_apportioned_from_id','Apportioned From',          'uuid',        'reference',  'system',   false, true,  true,  false, 'service',   NULL, 'apportionment'),

    -- ── Origin / cross-document lineage ──────────────────────────────────────
    ('origin',               'origin',               'Origin',                      'text',        'enum',       'business', true,  false, false, false, NULL,        NULL, 'lineage'),
    ('ref_source_doc_type',  'ref_source_doc_type',  'Ref Source Type',             'text',        'enum',       'business', false, false, false, true,  NULL,        NULL, 'lineage'),
    ('ref_source_doc_id',    'ref_source_doc_id',    'Ref Source Doc',              'uuid',        'reference',  'business', false, false, false, true,  NULL,        NULL, 'lineage'),
    ('ref_source_line_id',   'ref_source_line_id',   'Ref Source Line',             'uuid',        'reference',  'business', false, false, false, true,  NULL,        NULL, 'lineage'),
    ('ref_value',            'ref_value',            'Ref Value',                   'numeric',     'money',      'business', false, false, false, true,  NULL,        NULL, 'lineage'),

    -- ── Tax / withholding ────────────────────────────────────────────────────
    ('tax_group_id',         'tax_group_id',         'Tax Group',                   'uuid',        'reference',  'business', false, false, false, false, NULL,        NULL, 'tax'),
    ('is_inclusive',         'is_inclusive',         'Tax Inclusive',               'boolean',     'switch',     'business', false, false, false, false, NULL,        NULL, 'tax'),
    ('recoverable_pct',      'recoverable_pct',      'Recoverable %',               'numeric',     'percent',    'business', false, false, false, false, NULL,        NULL, 'tax'),
    ('tax_section_code',     'tax_section_code',     'Tax Section',                 'text',        'text',       'business', false, false, false, false, NULL,        NULL, 'tax'),

    -- ── Currency ────────────────────────────────────────────────────────────
    ('currency_code',        'currency_code',        'Currency',                    'text',        'currency',   'business', true,  false, false, true,  NULL,        NULL, 'currency'),
    ('base_currency_code',   'base_currency_code',   'Base Currency',               'text',        'currency',   'business', true,  true,  false, true,  NULL,        NULL, 'currency'),
    ('exchange_rate',        'exchange_rate',        'FX Rate',                     'numeric',     'number',     'business', true,  false, false, true,  NULL,        NULL, 'currency'),

    -- ── GL routing ──────────────────────────────────────────────────────────
    ('business_intent_id',   'business_intent_id',   'Business Intent',             'uuid',        'reference',  'business', false, false, false, false, NULL,        NULL, 'gl_routing'),
    ('posting_role_code',    'posting_role_code',    'Posting Role',                'text',        'text',       'business', false, false, false, false, NULL,        NULL, 'gl_routing'),
    ('gl_account_id',        'gl_account_id',        'GL Account',                  'uuid',        'reference',  'system',   false, true,  true,  false, 'service',   NULL, 'gl_routing'),
    ('account_source',       'account_source',       'Account Strategy',            'text',        'enum',       'business', false, false, false, false, NULL,        NULL, 'gl_routing'),

    -- ── Supersede chain ─────────────────────────────────────────────────────
    ('superseded_by_id',     'superseded_by_id',     'Superseded By',               'uuid',        'reference',  'system',   false, true,  true,  false, 'service',   NULL, 'supersede'),
    ('superseded_at',        'superseded_at',        'Superseded At',               'timestamp',   'datetime',   'system',   false, true,  true,  false, 'service',   NULL, 'supersede'),
    ('superseded_by_user',   'superseded_by_user',   'Superseded By User',          'uuid',        'reference',  'system',   false, true,  true,  false, 'service',   NULL, 'supersede'),

    -- ── Concurrency ─────────────────────────────────────────────────────────
    ('row_version',          'row_version',          'Row Version',                 'integer',     'number',     'system',   true,  true,  true,  false, 'trigger',   NULL, 'system'),

    -- ── Tags & Metadata ─────────────────────────────────────────────────────
    ('tags',                 'tags',                 'Tags',                        'jsonb',       'tags',       'business', false, false, false, false, NULL,        NULL, 'annotation'),
    ('metadata',             'metadata',             'Metadata',                    'jsonb',       'json',       'business', false, false, false, false, NULL,        NULL, 'annotation'),

    -- ── Audit envelope ──────────────────────────────────────────────────────
    ('created_at',           'created_at',           'Created At',                  'timestamp',   'datetime',   'system',   true,  true,  false, true,  NULL,        NULL, 'audit'),
    ('created_by',           'created_by',           'Created By',                  'uuid',        'reference',  'system',   true,  true,  false, true,  NULL,        NULL, 'audit'),
    ('updated_at',           'updated_at',           'Updated At',                  'timestamp',   'datetime',   'system',   false, true,  true,  false, 'trigger',   NULL, 'audit'),
    ('updated_by',           'updated_by',           'Updated By',                  'uuid',        'reference',  'system',   false, true,  false, false, NULL,        NULL, 'audit')

  ) AS v(
    field_name, column_name, label, data_type, ui_type, origin,
    is_required, is_read_only, is_computed, is_write_once, compute_mode,
    enum_domain_code, group_key
  )
ON CONFLICT DO NOTHING;


-- =============================================================================
-- End of 044_entity_field_pricing_component.sql
-- =============================================================================

COMMIT;
