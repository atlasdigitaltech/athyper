-- 100_finance/200_document/007_journal_entry.sql
-- Purpose: control.entity + entity_version + entity_field for Journal Entry
--          (document.journal_entry)
-- Module: ACC (Finance Core Accounting)
-- Depends on: LookupDomain/document/journal_entry_status.sql,
--             LookupDomain/document/purchase_order.sql (je_status approval extensions)
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
    'journal_entry', 'JE', 'journal_entry',
    'DOCUMENT', 'system', 'ent', 'table',
    'full', 'tenant_critical', 'controlled',
    'document', 'journal_entry',
    'Journal Entry', 'Journal Entries', 'book-open', 'slate',
    true,
    '{"prefix":"JE","prefix_configurable":true,"separator":"-","segments":[{"type":"year","format":"YYYY"},{"type":"sequence","padding":6}]}'::jsonb,
    '{"is_approvable":true,"document_category":"general_ledger","allow_on_behalf_of":false,"has_line_items":true,"auto_number":true}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
    WHERE table_schema = 'document' AND table_name = 'journal_entry'
      AND tenant_id IS NULL
);

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'document' AND e.table_name = 'journal_entry'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;

-- ── 3. control.entity_field (9 fields) ───────────────────────────────────────
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable, is_searchable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable, f.is_searchable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('document_no',   'je_number',             'JE Number',       'text',    'one',         NULL::text,                                 true,  true,  true,  '{"max_length":50}'::jsonb,    10),
    ('status',        'status',                'Status',          'lifecycle_state', 'one',  NULL::text,                                 true,  true,  false, NULL::jsonb,                   20),
    ('entry_date',    'posting_date',          'Entry Date',      'date',    'one',         NULL::text,                                 true,  true,  false, NULL::jsonb,                   30),
    ('fiscal_period', 'period_number',         'Fiscal Period',   'integer', 'zero_or_one', NULL::text,                                 false, true,  false, NULL::jsonb,                   40),
    ('currency_code', 'transaction_currency',  'Currency',        'text',    'one',         NULL::text,                                 true,  true,  false, '{"max_length":3}'::jsonb,     50),
    ('total_debit',   'total_debit',           'Total Debit',     'decimal', 'one',         NULL::text,                                 true,  false, false, '{"min":0}'::jsonb,            60),
    ('total_credit',  'total_credit',          'Total Credit',    'decimal', 'one',         NULL::text,                                 true,  false, false, '{"min":0}'::jsonb,            70),
    ('source_type',   'source_doc_type',       'Source Type',     'enum',    'zero_or_one', 'document.je_source_doc_type'::text,        false, true,  false, NULL::jsonb,                   80),
    ('description',   'description',           'Description',     'text',    'zero_or_one', NULL::text,                                 false, false, true,  '{"max_length":500}'::jsonb,   90)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, is_searchable, validation, sort_order)
WHERE e.table_schema = 'document' AND e.table_name = 'journal_entry'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── Fix origin for existing rows (idempotent) ─────────────────────────────────
UPDATE control.entity_field ef
SET origin = 'standard'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'journal_entry'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.origin = 'system';

-- ── Enable full-text search on key text fields (idempotent) ──────────────────
-- document_no (JE Number) and description are the natural free-text search
-- targets. Without is_searchable = true the records API ?q= param is silently
-- ignored because the ILIKE guard never fires.
UPDATE control.entity_field ef
SET is_searchable = true
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'journal_entry'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN ('document_no', 'description');

-- ── 4. display_config ─────────────────────────────────────────────────────────
UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'approvable',
    'title_field',        'document_no',
    'list_columns',       '["document_no","status","entry_date","fiscal_period","currency_code","total_debit","total_credit"]'::jsonb,
    'default_sort_field', 'entry_date',
    'default_sort_order', 'desc',
    'document_header', jsonb_build_object(
        'number_field',   'document_no',
        'status_field',   'status',
        'type_label',     'JOURNAL ENTRY',
        'total_label',    'TOTAL DEBIT',
        'date_label',     'ENTRY DATE',
        'amount_field',   'total_debit',
        'currency_field', 'currency_code',
        'date_field',     'entry_date'
    )
)
WHERE table_schema = 'document' AND table_name = 'journal_entry'
  AND tenant_id IS NULL
  AND display_config = '{}'::jsonb;

-- ── 5. Natural key ────────────────────────────────────────────────────────────
UPDATE control.entity
SET natural_key_fields = ARRAY['document_no']
WHERE table_schema = 'document' AND table_name = 'journal_entry'
  AND tenant_id IS NULL
  AND (natural_key_fields IS NULL OR natural_key_fields = '{}');

-- ── Fix column_name mismatches for existing rows (idempotent) ─────────────────
-- The INSERT above used wrong column names that don't exist in document.journal_entry.
-- This UPDATE corrects them so the records route can SELECT the actual table columns.
UPDATE control.entity_field ef
SET column_name = CASE ef.name
    WHEN 'document_no'   THEN 'je_number'
    WHEN 'entry_date'    THEN 'posting_date'
    WHEN 'fiscal_period' THEN 'period_number'
    WHEN 'currency_code' THEN 'transaction_currency'
    WHEN 'source_type'   THEN 'source_doc_type'
    ELSE ef.column_name
END,
    data_type = CASE ef.name
    WHEN 'fiscal_period' THEN 'integer'
    ELSE ef.data_type
END
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'journal_entry'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN ('document_no', 'entry_date', 'fiscal_period', 'currency_code', 'source_type');
