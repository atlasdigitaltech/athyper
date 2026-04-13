-- 100_finance/200_document/007_journal_entry.sql
-- Purpose: control.entity + entity_version + entity_field for Journal Entry
--          (document.journal_entry)
-- Module: ACC (Finance Core Accounting)
-- Depends on: LookupDomain/document/journal_entry_status.sql,
--             LookupDomain/document/purchase_order.sql (je_status approval extensions)
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
    'journal_entry', 'JE',
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
    ('document_no',   'document_no',   'JE Number',       'text',    'one',         NULL::text,                                 true,  true,  '{"max_length":50}'::jsonb,    10),
    ('status',        'status',        'Status',          'enum',    'one',         'document.journal_entry_status'::text,      true,  true,  NULL::jsonb,                   20),
    ('entry_date',    'entry_date',    'Entry Date',      'date',    'one',         NULL::text,                                 true,  true,  NULL::jsonb,                   30),
    ('fiscal_period', 'fiscal_period', 'Fiscal Period',   'text',    'zero_or_one', NULL::text,                                 false, true,  '{"max_length":10}'::jsonb,    40),
    ('currency_code', 'currency_code', 'Currency',        'text',    'one',         NULL::text,                                 true,  true,  '{"max_length":3}'::jsonb,     50),
    ('total_debit',   'total_debit',   'Total Debit',     'decimal', 'one',         NULL::text,                                 true,  false, '{"min":0}'::jsonb,            60),
    ('total_credit',  'total_credit',  'Total Credit',    'decimal', 'one',         NULL::text,                                 true,  false, '{"min":0}'::jsonb,            70),
    ('source_type',   'source_type',   'Source Type',     'enum',    'zero_or_one', 'document.je_source_doc_type'::text,        false, true,  NULL::jsonb,                   80),
    ('description',   'description',   'Description',     'text',    'zero_or_one', NULL::text,                                 false, false, '{"max_length":500}'::jsonb,   90)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
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
