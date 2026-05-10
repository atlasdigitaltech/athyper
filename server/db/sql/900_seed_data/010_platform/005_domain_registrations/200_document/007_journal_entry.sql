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
    '{"prefix":"JE","prefix_configurable":true,"separator":"-","segments":[{"type":"year","format":"YYYY"},{"type":"sequence","padding":6}],"auto_name_rule":{"strategy":"description_or_fallback","fallback_template":"{prefix} – {date}","date_format":"DD Mon YYYY"}}'::jsonb,
    '{"is_approvable":true,"document_category":"general_ledger","allow_on_behalf_of":false,"has_lines":true,"auto_number":true}'::jsonb,
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
    ('description',   'description',           'Description',     'text',    'one',         NULL::text,                                 true,  false, true,  '{"max_length":500}'::jsonb,   90)
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
    'detail_renderer',    'document',
    'lines_renderer',     'journal',
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
        'date_field',     'entry_date',
        'created_at_field', 'created_at',
        'created_by_field', 'created_by',
        'updated_at_field', 'updated_at',
        'updated_by_field', 'updated_by',
        'status_changed_at_field', 'status_changed_at',
        'status_changed_by_field', 'status_changed_by'
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

-- ── 6. Backfill: rename deprecated feature_flag key to canonical name ─────────
UPDATE control.entity
SET feature_flags = (feature_flags - 'has_line_items') || '{"has_lines":true}'::jsonb
WHERE table_schema = 'document' AND table_name = 'journal_entry'
  AND tenant_id IS NULL
  AND feature_flags ? 'has_line_items';

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


-- ============================================================================
-- Journal Entry metadata hardening
-- ============================================================================
-- Comprehensive header/line field definitions. These rows are intentionally
-- metadata-level controls: DB still owns accounting invariants.

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

UPDATE control.entity
   SET feature_flags = jsonb_build_object(
       'is_approvable', true,
       'document_category', 'general_ledger',
       'allow_on_behalf_of', false,
       'has_lines', true,
       'auto_number', true,
       'has_attachments', true,
       'comments_enabled', true,
       'event_history', true,
       'version_control', true,
       'posting_trace', true,
       'line_references', false
   ),
   display_config = jsonb_build_object(
       'detail_renderer', 'document',
       'lines_renderer',  'journal',
       'title_field', 'document_no',
       'subtitle_field', 'description',
       'list_columns', '["document_no","status","posting_date","period_number","transaction_currency","total_debit","total_credit"]'::jsonb,
       'default_sort_field', 'posting_date',
       'default_sort_order', 'desc',
       'action_groups', jsonb_build_object(
           'draft',            jsonb_build_object('primary','["edit","submit"]'::jsonb),
           'created',          jsonb_build_object('primary','["edit","submit"]'::jsonb),
           'pending_approval', jsonb_build_object('primary','["approve","deny"]'::jsonb),
           'approved',         jsonb_build_object('primary','["post"]'::jsonb),
           'posted',           jsonb_build_object('primary','["reverse"]'::jsonb, 'output','["posting_trace"]'::jsonb),
           'rejected',         jsonb_build_object('primary','["amend"]'::jsonb),
           'reversed',         jsonb_build_object('output','["posting_trace"]'::jsonb)
       ),
       'document_header', jsonb_build_object(
           'number_field', 'document_no',
           'name_field', 'name',
           'status_field', 'status',
           'type_label', 'JOURNAL ENTRY',
           'total_label', 'TOTAL',
           'amount_field', 'total_debit',
           'currency_field', 'transaction_currency',
           'date_field', 'posting_date',
           'title_field', 'description',
           'created_at_field', 'created_at',
           'created_by_field', 'created_by',
           'updated_at_field', 'updated_at',
           'updated_by_field', 'updated_by',
           'status_changed_at_field', 'status_changed_at',
           'status_changed_by_field', 'status_changed_by',
           'lifecycle_stages', jsonb_build_array(
               jsonb_build_object('key','draft',            'label','Draft'),
               jsonb_build_object('key','created',          'label','Ready'),
               jsonb_build_object('key','pending_approval', 'label','Submitted'),
               jsonb_build_object('key','approved',         'label','Approved'),
               jsonb_build_object('key','posted',           'label','Posted'),
               jsonb_build_object('key','reversed',         'label','Reversed')
           )
       ),
       'journal_editor', jsonb_build_object(
           'mode', 'draft_workspace',
           'line_entity', 'journal_line',
           'line_reference_strategy', 'none',
           'submit_requires_min_lines', 2,
           'submit_requires_balance', true
       )
   ),
   natural_key_fields = ARRAY['document_no']
 WHERE table_schema = 'document'
   AND table_name = 'journal_entry'
   AND tenant_id IS NULL;

-- Patch naming_policy to add auto_name_rule (idempotent — merges into existing JSON)
UPDATE control.entity
   SET naming_policy = naming_policy || jsonb_build_object(
       'auto_name_rule', jsonb_build_object(
           'strategy',          'description_or_fallback',
           'fallback_template', '{prefix} – {date}',
           'date_format',       'DD Mon YYYY'
       )
   )
 WHERE table_schema = 'document'
   AND table_name = 'journal_entry'
   AND tenant_id IS NULL
   AND NOT (naming_policy ? 'auto_name_rule');

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
    'journal_line', 'JL', 'journal_line',
    'DOCUMENT_RELATION', 'system', 'ent', 'table',
    'full', 'tenant_critical', 'controlled',
    'document', 'journal_line',
    'Journal Line', 'Journal Lines', 'list', 'slate',
    false,
    '{"parent_entity":"journal_entry","parent_fk":"journal_entry_id","line_editor":true,"posting_controlled":true,"dimension_controlled":true}'::jsonb,
    'ACTIVE', v_su
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
     WHERE table_schema = 'document' AND table_name = 'journal_line'
       AND tenant_id IS NULL
);

INSERT INTO control.entity_version (entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(), v_su
FROM control.entity e
WHERE e.table_schema = 'document' AND e.table_name = 'journal_line'
  AND e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;

WITH defs AS (
    SELECT * FROM (VALUES
      ('code','code','Code','Auto-numbered document code (mirrors je_number).','text','text','one',NULL::text,NULL::jsonb,true,true,true,true,false,false,true,false,false,'{"max_length":50}'::jsonb,'{"source":"numbering_policy"}'::jsonb,'{"group_key":"identity","badge":true}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,NULL::jsonb,5),
      ('name','name','Name','Auto-named title derived from description or naming policy fallback.','text','text','one',NULL::text,NULL::jsonb,true,false,true,true,false,false,false,false,false,'{"max_length":500}'::jsonb,'{"source":"auto_name_rule"}'::jsonb,'{"group_key":"identity"}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"]}'::jsonb,NULL::jsonb,6),
      ('document_no','je_number','JE Number','Number assigned by the JE numbering policy.','text','text','one',NULL::text,NULL::jsonb,true,true,true,true,false,false,true,false,false,'{"max_length":50}'::jsonb,'{"source":"numbering_policy"}'::jsonb,'{"group_key":"identity","badge":true}'::jsonb,NULL::jsonb,'{"editable_in":["draft"]}'::jsonb,NULL::jsonb,10),
      ('status','status','Status','Lifecycle state of the journal entry.','lifecycle_state','status','one',NULL::text,NULL::jsonb,true,true,false,true,true,false,true,false,false,NULL::jsonb,NULL::jsonb,'{"group_key":"identity"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,NULL::jsonb,20),
      ('company_code_id','company_code_id','Company Code','Company whose ledger is affected.','reference','entity_chooser','one',NULL::text,'{"target_entity":"company_code","target_field":"id","display_field":"name","picker":{"label_field":"name","code_field":"code","label_template":"{name} - {code}","show_code":false}}'::jsonb,true,true,false,true,true,false,false,false,false,'{"ref_entity":"company_code"}'::jsonb,NULL::jsonb,'{"group_key":"posting","chooser":"inline_search"}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"]}'::jsonb,'{"search_fields":["code","name"],"filters":{"status":"active"}}'::jsonb,30),
      ('book_id','book_id','Ledger Book','Ledger book used for posting.','reference','entity_chooser','one',NULL::text,'{"target_entity":"ledger_book","target_field":"id","display_field":"name","picker":{"label_field":"name","code_field":"code","show_code":false}}'::jsonb,true,true,false,true,true,false,false,false,false,'{"ref_entity":"ledger_book"}'::jsonb,NULL::jsonb,'{"group_key":"posting","chooser":"inline_search"}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"],"derive":"company_code.default_manual_ledger_book"}'::jsonb,'{"search_fields":["code","name"],"filters":{"status":"active","is_manual_je_allowed":true},"dependent_filter":{"source_field":"company_code_id","target_field":"id","through_entity":"company_code_book_assignment","through_source_field":"company_code_id","through_target_field":"book_id","through_filters":{"status":"active"},"sort_field":"priority","sort_direction":"asc","empty_behavior":"empty"}}'::jsonb,40),
      ('document_date','document_date','Document Date','Business document date.','date','date','one',NULL::text,NULL::jsonb,true,true,false,true,false,false,false,false,false,'{"rules":[{"code":"journal_entry.document_date.after_posting_date","kind":"cross_field","left_field":"document_date","operator":"<=","right_field":"posting_date","anchor_field":"document_date","highlight_fields":["document_date","posting_date"],"message_key":"journal_entry.document_date.after_posting_date","default_message":"Document date must be on or before posting date.","db_constraint":"je_doc_date_chk"}]}'::jsonb,NULL::jsonb,'{"group_key":"dates"}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"]}'::jsonb,NULL::jsonb,50),
      ('posting_date','posting_date','Posting Date','GL posting date that drives fiscal period and FX.','date','date','one',NULL::text,NULL::jsonb,true,true,false,true,false,false,false,false,false,NULL::jsonb,'{"source":"today"}'::jsonb,'{"group_key":"dates"}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"]}'::jsonb,NULL::jsonb,60),
      ('fiscal_period_id','fiscal_period_id','Fiscal Period','Fiscal period resolved from posting date.','reference','entity_chooser','one',NULL::text,'{"target_entity":"fiscal_period","target_field":"id","display_field":"period_number"}'::jsonb,true,true,false,true,true,false,true,true,false,'{"ref_entity":"fiscal_period"}'::jsonb,NULL::jsonb,'{"group_key":"posting","chooser":"inline_search"}'::jsonb,NULL::jsonb,'{"editable_in":[],"derive":"fiscal.period_from_posting_date"}'::jsonb,'{"search_fields":["fiscal_year","period_number"],"filters":{"status":["open","soft_close"]}}'::jsonb,70),
      ('fiscal_year','fiscal_year','Fiscal Year','Resolved fiscal year.','integer','number','one',NULL::text,NULL::jsonb,true,true,false,true,true,false,true,true,false,NULL::jsonb,NULL::jsonb,'{"group_key":"posting","summary":true}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,NULL::jsonb,80),
      ('period_number','period_number','Period','Resolved fiscal period number.','integer','number','one',NULL::text,NULL::jsonb,true,true,false,true,true,false,true,true,false,'{"min":1,"max":16}'::jsonb,NULL::jsonb,'{"group_key":"posting","summary":true}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,NULL::jsonb,90),
      ('source_type','source_doc_type','Source Type','Source document category.','enum','select','one','document.je_source_doc_type',NULL::jsonb,true,true,false,true,true,false,false,false,false,NULL::jsonb,'"manual"'::jsonb,'{"group_key":"source"}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"],"default_locked":true}'::jsonb,NULL::jsonb,100),
      ('source_doc_id','source_doc_id','Source Document','Source document id for system-generated JEs.','uuid','hidden','zero_or_one',NULL::text,NULL::jsonb,false,false,false,false,false,false,true,false,false,NULL::jsonb,NULL::jsonb,'{"group_key":"source"}'::jsonb,'{"!=":[{"var":"source_type"},"manual"]}'::jsonb,'{"editable_in":[]}'::jsonb,NULL::jsonb,110),
      ('transaction_currency','transaction_currency','Transaction Currency','Currency used on JE lines.','text','currency','one',NULL::text,NULL::jsonb,true,true,false,true,true,false,false,false,false,'{"max_length":3}'::jsonb,NULL::jsonb,'{"group_key":"currency","chooser":"currency"}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"],"derive":"company_code.base_currency"}'::jsonb,'{"endpoint":"/api/platform/ref/currencies","search_fields":["code","name"]}'::jsonb,120),
      ('base_currency','base_currency','Base Currency','Company functional currency; derived from company code.','text','currency','one',NULL::text,NULL::jsonb,true,true,false,true,true,false,true,true,false,'{"max_length":3}'::jsonb,NULL::jsonb,'{"group_key":"currency","chooser":"currency"}'::jsonb,NULL::jsonb,'{"editable_in":[],"derive":"company_code.base_currency"}'::jsonb,'{"endpoint":"/api/platform/ref/currencies","search_fields":["code","name"]}'::jsonb,130),
      ('total_debit','total_debit','Total Debit','Cached total from lines.','decimal','money','one',NULL::text,NULL::jsonb,true,false,false,true,false,true,true,true,false,'{"min":0}'::jsonb,NULL::jsonb,'{"group_key":"amounts","summary_role":"total"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,NULL::jsonb,140),
      ('total_credit','total_credit','Total Credit','Cached total from lines.','decimal','money','one',NULL::text,NULL::jsonb,true,false,false,true,false,true,true,true,false,'{"min":0}'::jsonb,NULL::jsonb,'{"group_key":"amounts","summary_role":"total"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,NULL::jsonb,150),
      ('line_count','line_count','Line Count','Number of JE lines.','integer','number','one',NULL::text,NULL::jsonb,true,false,false,true,false,true,true,true,false,'{"min":0}'::jsonb,NULL::jsonb,'{"group_key":"amounts","summary_role":"meta"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,NULL::jsonb,160),
      ('description','description','Description','Header narration.','text','textarea','one',NULL::text,NULL::jsonb,true,false,true,false,false,false,false,false,false,'{"max_length":500}'::jsonb,NULL::jsonb,'{"group_key":"narrative","span":3,"required":true}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"]}'::jsonb,NULL::jsonb,170),
      ('is_auto_reverse','is_auto_reverse','Auto Reverse','Create a scheduled reversal after posting.','boolean','checkbox','one',NULL::text,NULL::jsonb,false,true,false,false,true,false,false,false,false,NULL::jsonb,'false'::jsonb,'{"group_key":"reversal"}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"]}'::jsonb,NULL::jsonb,180),
      ('auto_reverse_date','auto_reverse_date','Auto Reverse Date','Posting date for the scheduled reversal.','date','date','zero_or_one',NULL::text,NULL::jsonb,false,true,false,true,false,false,false,false,false,NULL::jsonb,NULL::jsonb,'{"group_key":"reversal"}'::jsonb,'{"==":[{"var":"is_auto_reverse"},true]}'::jsonb,'{"editable_in":["draft","created"]}'::jsonb,NULL::jsonb,190),
      ('is_prior_period','prior_period_flag','Prior Period','Marks a prior-period adjustment.','boolean','checkbox','one',NULL::text,NULL::jsonb,false,true,false,false,true,false,false,false,false,NULL::jsonb,'false'::jsonb,'{"group_key":"controls"}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"]}'::jsonb,NULL::jsonb,200),
      ('original_period_year','original_period_year','Original Year','Original fiscal year for prior-period adjustments.','integer','number','zero_or_one',NULL::text,NULL::jsonb,false,true,false,true,false,false,false,false,false,NULL::jsonb,NULL::jsonb,'{"group_key":"controls"}'::jsonb,'{"==":[{"var":"is_prior_period"},true]}'::jsonb,'{"editable_in":["draft","created"]}'::jsonb,NULL::jsonb,210),
      ('original_period_number','original_period_number','Original Period','Original period for prior-period adjustments.','integer','number','zero_or_one',NULL::text,NULL::jsonb,false,true,false,true,false,false,false,false,false,'{"min":1,"max":16}'::jsonb,NULL::jsonb,'{"group_key":"controls"}'::jsonb,'{"==":[{"var":"is_prior_period"},true]}'::jsonb,'{"editable_in":["draft","created"]}'::jsonb,NULL::jsonb,220),
      ('close_override_id','close_override_id','Close Override','Approval/override allowing a closed-period adjustment.','reference','entity_chooser','zero_or_one',NULL::text,'{"target_entity":"close_override","target_field":"id","display_field":"code"}'::jsonb,false,false,false,false,false,false,false,false,false,'{"ref_entity":"close_override"}'::jsonb,NULL::jsonb,'{"group_key":"controls","chooser":"inline_search"}'::jsonb,'{"==":[{"var":"is_prior_period"},true]}'::jsonb,'{"editable_in":["draft","created"]}'::jsonb,NULL::jsonb,230),
      ('reversal_of_id','reversal_of_id','Reversal Of','Original JE reversed by this entry.','reference','entity_chooser','zero_or_one',NULL::text,'{"target_entity":"journal_entry","target_field":"id","display_field":"je_number"}'::jsonb,false,true,false,true,false,false,true,false,false,'{"ref_entity":"journal_entry"}'::jsonb,NULL::jsonb,'{"group_key":"reversal","chooser":"inline_search"}'::jsonb,'{"==":[{"var":"is_reversal"},true]}'::jsonb,'{"editable_in":[]}'::jsonb,NULL::jsonb,240),
      ('reversed_by_id','reversed_by_id','Reversed By','Reversal JE linked to this posted entry.','reference','entity_chooser','zero_or_one',NULL::text,'{"target_entity":"journal_entry","target_field":"id","display_field":"je_number"}'::jsonb,false,true,false,true,false,false,true,false,false,'{"ref_entity":"journal_entry"}'::jsonb,NULL::jsonb,'{"group_key":"reversal","chooser":"inline_search"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,NULL::jsonb,250),
      ('posted_at','posted_at','Posted At','Timestamp when the JE was posted.','timestamptz','datetime','zero_or_one',NULL::text,NULL::jsonb,false,true,false,true,false,false,true,true,false,NULL::jsonb,NULL::jsonb,'{"group_key":"audit"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,NULL::jsonb,260),
      ('posted_by','posted_by','Posted By','Principal who posted the JE.','reference','entity_chooser','zero_or_one',NULL::text,'{"target_entity":"principal","target_field":"id","display_field":"display_name"}'::jsonb,false,true,false,false,false,false,true,true,false,'{"ref_entity":"principal"}'::jsonb,NULL::jsonb,'{"group_key":"audit","chooser":"inline_search"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,NULL::jsonb,270),
      ('tags','tags','Tags','Classification tags.','jsonb','tags','zero_or_one',NULL::text,NULL::jsonb,false,true,true,false,true,false,false,false,false,NULL::jsonb,'[]'::jsonb,'{"group_key":"narrative"}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"]}'::jsonb,NULL::jsonb,280),
      ('metadata','metadata','Metadata','System and integration metadata.','jsonb','json','zero_or_one',NULL::text,NULL::jsonb,false,false,false,false,false,false,true,false,false,NULL::jsonb,'{}'::jsonb,'{"group_key":"system"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,NULL::jsonb,290)
    ) AS x(name,column_name,label,description,data_type,ui_type,cardinality,enum_domain_code,reference_config,is_required,is_filterable,is_searchable,is_sortable,is_groupable,is_aggregatable,is_read_only,is_computed,is_write_once,validation,default_value,ui_hint,visibility,editability,lookup_config,sort_order)
)
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, description, data_type, ui_type,
    cardinality, origin, enum_domain_code, reference_config,
    is_required, is_filterable, is_searchable, is_sortable, is_groupable,
    is_aggregatable, is_read_only, is_computed, is_write_once, compute_mode, compute_expr,
    validation, default_value, ui_hint, visibility, editability, lookup_config,
    sort_order, created_by)
SELECT ev.id, d.name, d.column_name, d.label, d.description, d.data_type, d.ui_type,
       d.cardinality, 'standard', d.enum_domain_code, d.reference_config,
       d.is_required, d.is_filterable, d.is_searchable, d.is_sortable, d.is_groupable,
       d.is_aggregatable, d.is_read_only, d.is_computed, d.is_write_once,
       CASE WHEN d.is_computed THEN 'database' ELSE NULL END,
       CASE WHEN d.is_computed THEN jsonb_build_object('source', 'db_trigger') ELSE NULL END,
       d.validation, d.default_value, d.ui_hint, d.visibility, d.editability, d.lookup_config,
       d.sort_order, v_su
FROM defs d
JOIN control.entity e ON e.entity_code = 'journal_entry' AND e.tenant_id IS NULL
JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1 AND ev.tenant_id IS NULL
ON CONFLICT DO NOTHING;

WITH defs AS (
    SELECT * FROM (VALUES
      ('code','code','Code','Auto-numbered document code (mirrors je_number).','text','text','one',NULL::text,NULL::jsonb,true,true,true,true,false,false,true,false,false,'{"max_length":50}'::jsonb,'{"source":"numbering_policy"}'::jsonb,'{"group_key":"identity","badge":true}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,NULL::jsonb,5),
      ('name','name','Name','Auto-named title derived from description or naming policy fallback.','text','text','one',NULL::text,NULL::jsonb,true,false,true,true,false,false,false,false,false,'{"max_length":500}'::jsonb,'{"source":"auto_name_rule"}'::jsonb,'{"group_key":"identity"}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"]}'::jsonb,NULL::jsonb,6),
      ('document_no','je_number','JE Number','Number assigned by the JE numbering policy.','text','text','one',NULL::text,NULL::jsonb,true,true,true,true,false,false,true,false,false,'{"max_length":50}'::jsonb,'{"source":"numbering_policy"}'::jsonb,'{"group_key":"identity","badge":true}'::jsonb,NULL::jsonb,'{"editable_in":["draft"]}'::jsonb,NULL::jsonb,10),
      ('status','status','Status','Lifecycle state of the journal entry.','lifecycle_state','status','one',NULL::text,NULL::jsonb,true,true,false,true,true,false,true,false,false,NULL::jsonb,NULL::jsonb,'{"group_key":"identity"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,NULL::jsonb,20),
      ('company_code_id','company_code_id','Company Code','Company whose ledger is affected.','reference','entity_chooser','one',NULL::text,'{"target_entity":"company_code","target_field":"id","display_field":"name","picker":{"label_field":"name","code_field":"code","label_template":"{name} - {code}","show_code":false}}'::jsonb,true,true,false,true,true,false,false,false,false,'{"ref_entity":"company_code"}'::jsonb,NULL::jsonb,'{"group_key":"posting","chooser":"inline_search"}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"]}'::jsonb,'{"search_fields":["code","name"],"filters":{"status":"active"}}'::jsonb,30),
      ('book_id','book_id','Ledger Book','Ledger book used for posting.','reference','entity_chooser','one',NULL::text,'{"target_entity":"ledger_book","target_field":"id","display_field":"name","picker":{"label_field":"name","code_field":"code","show_code":false}}'::jsonb,true,true,false,true,true,false,false,false,false,'{"ref_entity":"ledger_book"}'::jsonb,NULL::jsonb,'{"group_key":"posting","chooser":"inline_search"}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"],"derive":"company_code.default_manual_ledger_book"}'::jsonb,'{"search_fields":["code","name"],"filters":{"status":"active","is_manual_je_allowed":true},"dependent_filter":{"source_field":"company_code_id","target_field":"id","through_entity":"company_code_book_assignment","through_source_field":"company_code_id","through_target_field":"book_id","through_filters":{"status":"active"},"sort_field":"priority","sort_direction":"asc","empty_behavior":"empty"}}'::jsonb,40),
      ('document_date','document_date','Document Date','Business document date.','date','date','one',NULL::text,NULL::jsonb,true,true,false,true,false,false,false,false,false,'{"rules":[{"code":"journal_entry.document_date.after_posting_date","kind":"cross_field","left_field":"document_date","operator":"<=","right_field":"posting_date","anchor_field":"document_date","highlight_fields":["document_date","posting_date"],"message_key":"journal_entry.document_date.after_posting_date","default_message":"Document date must be on or before posting date.","db_constraint":"je_doc_date_chk"}]}'::jsonb,NULL::jsonb,'{"group_key":"dates"}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"]}'::jsonb,NULL::jsonb,50),
      ('posting_date','posting_date','Posting Date','GL posting date that drives fiscal period and FX.','date','date','one',NULL::text,NULL::jsonb,true,true,false,true,false,false,false,false,false,NULL::jsonb,'{"source":"today"}'::jsonb,'{"group_key":"dates"}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"]}'::jsonb,NULL::jsonb,60),
      ('fiscal_period_id','fiscal_period_id','Fiscal Period','Fiscal period resolved from posting date.','reference','entity_chooser','one',NULL::text,'{"target_entity":"fiscal_period","target_field":"id","display_field":"period_number"}'::jsonb,true,true,false,true,true,false,true,true,false,'{"ref_entity":"fiscal_period"}'::jsonb,NULL::jsonb,'{"group_key":"posting","chooser":"inline_search"}'::jsonb,NULL::jsonb,'{"editable_in":[],"derive":"fiscal.period_from_posting_date"}'::jsonb,'{"search_fields":["fiscal_year","period_number"],"filters":{"status":["open","soft_close"]}}'::jsonb,70),
      ('fiscal_year','fiscal_year','Fiscal Year','Resolved fiscal year.','integer','number','one',NULL::text,NULL::jsonb,true,true,false,true,true,false,true,true,false,NULL::jsonb,NULL::jsonb,'{"group_key":"posting","summary":true}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,NULL::jsonb,80),
      ('period_number','period_number','Period','Resolved fiscal period number.','integer','number','one',NULL::text,NULL::jsonb,true,true,false,true,true,false,true,true,false,'{"min":1,"max":16}'::jsonb,NULL::jsonb,'{"group_key":"posting","summary":true}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,NULL::jsonb,90),
      ('source_type','source_doc_type','Source Type','Source document category.','enum','select','one','document.je_source_doc_type',NULL::jsonb,true,true,false,true,true,false,false,false,false,NULL::jsonb,'"manual"'::jsonb,'{"group_key":"source"}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"],"default_locked":true}'::jsonb,NULL::jsonb,100),
      ('transaction_currency','transaction_currency','Transaction Currency','Currency used on JE lines.','text','currency','one',NULL::text,NULL::jsonb,true,true,false,true,true,false,false,false,false,'{"max_length":3}'::jsonb,NULL::jsonb,'{"group_key":"currency","chooser":"currency"}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"],"derive":"company_code.base_currency"}'::jsonb,'{"endpoint":"/api/platform/ref/currencies","search_fields":["code","name"]}'::jsonb,120),
      ('base_currency','base_currency','Base Currency','Company functional currency; derived from company code.','text','currency','one',NULL::text,NULL::jsonb,true,true,false,true,true,false,true,true,false,'{"max_length":3}'::jsonb,NULL::jsonb,'{"group_key":"currency","chooser":"currency"}'::jsonb,NULL::jsonb,'{"editable_in":[],"derive":"company_code.base_currency"}'::jsonb,'{"endpoint":"/api/platform/ref/currencies","search_fields":["code","name"]}'::jsonb,130),
      ('total_debit','total_debit','Total Debit','Cached total from lines.','decimal','money','one',NULL::text,NULL::jsonb,true,false,false,true,false,true,true,true,false,'{"min":0}'::jsonb,NULL::jsonb,'{"group_key":"amounts","summary_role":"total"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,NULL::jsonb,140),
      ('total_credit','total_credit','Total Credit','Cached total from lines.','decimal','money','one',NULL::text,NULL::jsonb,true,false,false,true,false,true,true,true,false,'{"min":0}'::jsonb,NULL::jsonb,'{"group_key":"amounts","summary_role":"total"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,NULL::jsonb,150),
      ('description','description','Description','Header narration.','text','textarea','one',NULL::text,NULL::jsonb,true,false,true,false,false,false,false,false,false,'{"max_length":500}'::jsonb,NULL::jsonb,'{"group_key":"narrative","span":3,"required":true}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"]}'::jsonb,NULL::jsonb,170)
    ) AS x(name,column_name,label,description,data_type,ui_type,cardinality,enum_domain_code,reference_config,is_required,is_filterable,is_searchable,is_sortable,is_groupable,is_aggregatable,is_read_only,is_computed,is_write_once,validation,default_value,ui_hint,visibility,editability,lookup_config,sort_order)
)
UPDATE control.entity_field ef
   SET column_name = d.column_name,
       label = d.label,
       description = d.description,
       data_type = d.data_type,
       ui_type = d.ui_type,
       cardinality = d.cardinality,
       origin = 'standard',
       enum_domain_code = d.enum_domain_code,
       reference_config = d.reference_config,
       is_required = d.is_required,
       is_filterable = d.is_filterable,
       is_searchable = d.is_searchable,
       is_sortable = d.is_sortable,
       is_groupable = d.is_groupable,
       is_aggregatable = d.is_aggregatable,
       is_read_only = d.is_read_only,
       is_computed = d.is_computed,
       is_write_once = d.is_write_once,
       compute_mode = CASE WHEN d.is_computed THEN 'database' ELSE NULL END,
       compute_expr = CASE WHEN d.is_computed THEN jsonb_build_object('source', 'db_trigger') ELSE NULL END,
       validation = d.validation,
       default_value = d.default_value,
       ui_hint = d.ui_hint,
       visibility = d.visibility,
       editability = d.editability,
       lookup_config = d.lookup_config,
       sort_order = d.sort_order,
       updated_at = now(),
       updated_by = v_su
FROM defs d
JOIN control.entity e ON e.entity_code = 'journal_entry' AND e.tenant_id IS NULL
JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1 AND ev.tenant_id IS NULL
WHERE ef.entity_version_id = ev.id
  AND ef.name = d.name;

UPDATE control.entity_field ef
   SET is_active = false,
       is_deprecated = true,
       is_required = false,
       is_filterable = false,
       is_searchable = false,
       is_sortable = false,
       visibility = jsonb_build_object('deprecated_alias_for',
           CASE ef.name
             WHEN 'entry_date' THEN 'posting_date'
             WHEN 'fiscal_period' THEN 'period_number'
             WHEN 'currency_code' THEN 'transaction_currency'
           END),
       editability = '{"editable_in":[]}'::jsonb,
       updated_at = now(),
       updated_by = v_su
FROM control.entity e
JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1 AND ev.tenant_id IS NULL
WHERE ef.entity_version_id = ev.id
  AND e.entity_code = 'journal_entry'
  AND e.tenant_id IS NULL
  AND ef.name IN ('entry_date', 'fiscal_period', 'currency_code');

-- Compact Journal Entry detail/edit overview.
-- The document detail page groups by entity_field.ui_hint.group_key and hides
-- fields with ui_type='hidden'. Keep the business header in one group, while
-- removing duplicate totals and technical controls from the primary card stack.
INSERT INTO control.field_group (group_key, label, description, applies_to_classes, sort_order)
VALUES (
    'header',
    'Header',
    'Primary business header fields shown on document detail/edit pages.',
    ARRAY['DOCUMENT'],
    20
)
ON CONFLICT (group_key) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    applies_to_classes = EXCLUDED.applies_to_classes,
    sort_order = EXCLUDED.sort_order;

WITH layout AS (
    SELECT * FROM (VALUES
      ('company_code_id',      NULL::text, '{"group_key":"header","detail_visibility":"primary"}'::jsonb),
      ('book_id',              NULL::text, '{"group_key":"header","detail_visibility":"primary"}'::jsonb),
      ('document_date',        NULL::text, '{"group_key":"header","detail_visibility":"primary"}'::jsonb),
      ('posting_date',         NULL::text, '{"group_key":"header","detail_visibility":"primary"}'::jsonb),
      ('fiscal_period_id',     NULL::text, '{"group_key":"header","detail_visibility":"primary"}'::jsonb),
      ('fiscal_year',          NULL::text, '{"group_key":"header","detail_visibility":"primary"}'::jsonb),
      ('period_number',        NULL::text, '{"group_key":"header","detail_visibility":"primary"}'::jsonb),
      ('transaction_currency', NULL::text, '{"group_key":"header","detail_visibility":"primary"}'::jsonb),
      ('base_currency',        NULL::text, '{"group_key":"header","detail_visibility":"primary"}'::jsonb),
      ('description',          NULL::text, '{"group_key":"header","detail_visibility":"primary","span":3,"required":true}'::jsonb),

      ('source_type',          'hidden',   '{"detail_visibility":"hidden"}'::jsonb),
      ('source_doc_id',        'hidden',   '{"detail_visibility":"hidden"}'::jsonb),
      ('total_debit',          'hidden',   '{"detail_visibility":"hidden","reason":"shown_in_amount_summary"}'::jsonb),
      ('total_credit',         'hidden',   '{"detail_visibility":"hidden","reason":"shown_in_amount_summary"}'::jsonb),
      ('line_count',           'hidden',   '{"detail_visibility":"hidden","reason":"shown_in_amount_summary"}'::jsonb),
      ('tags',                 'hidden',   '{"detail_visibility":"hidden"}'::jsonb),
      ('is_auto_reverse',      'hidden',   '{"detail_visibility":"hidden"}'::jsonb),
      ('auto_reverse_date',    'hidden',   '{"detail_visibility":"hidden"}'::jsonb),
      ('reversal_of_id',       'hidden',   '{"detail_visibility":"hidden"}'::jsonb),
      ('reversed_by_id',       'hidden',   '{"detail_visibility":"hidden"}'::jsonb),
      ('is_prior_period',      'hidden',   '{"detail_visibility":"hidden"}'::jsonb),
      ('original_period_year', 'hidden',   '{"detail_visibility":"hidden"}'::jsonb),
      ('original_period_number','hidden',  '{"detail_visibility":"hidden"}'::jsonb),
      ('close_override_id',    'hidden',   '{"detail_visibility":"hidden"}'::jsonb),
      ('posted_at',            'hidden',   '{"detail_visibility":"hidden"}'::jsonb),
      ('posted_by',            'hidden',   '{"detail_visibility":"hidden"}'::jsonb),
      ('metadata',             'hidden',   '{"detail_visibility":"hidden"}'::jsonb)
    ) AS x(field_name, ui_type, ui_hint_patch)
)
UPDATE control.entity_field ef
   SET ui_type = COALESCE(layout.ui_type, ef.ui_type),
       ui_hint = COALESCE(ef.ui_hint, '{}'::jsonb) || layout.ui_hint_patch,
       updated_at = now(),
       updated_by = v_su
FROM layout
JOIN control.entity e ON e.entity_code = 'journal_entry' AND e.tenant_id IS NULL
JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1 AND ev.tenant_id IS NULL
WHERE ef.entity_version_id = ev.id
  AND ef.name = layout.field_name;

WITH defs AS (
    SELECT * FROM (VALUES
      ('journal_entry_id','journal_entry_id','Journal Entry','Parent journal entry.','reference','hidden','one',NULL::text,'{"target_entity":"journal_entry","target_field":"id","display_field":"je_number"}'::jsonb,true,false,false,true,false,false,true,false,false,'{"ref_entity":"journal_entry"}'::jsonb,NULL::jsonb,'{"group_key":"identity"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,NULL::jsonb,5),
      ('line_no','line_no','Line No.','Sequential line number within the JE.','integer','number','one',NULL::text,NULL::jsonb,true,false,false,true,false,false,false,false,false,'{"min":1}'::jsonb,NULL::jsonb,'{"group_key":"identity","width":"xs"}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"]}'::jsonb,NULL::jsonb,10),
      ('gl_account_id','gl_account_id','GL Account','Account to debit or credit.','reference','entity_chooser','one',NULL::text,'{"target_entity":"gl_account","target_field":"id","display_field":"name","picker":{"label_field":"name","code_field":"code","show_code":true}}'::jsonb,true,true,true,true,true,false,false,false,false,'{"ref_entity":"gl_account"}'::jsonb,NULL::jsonb,'{"group_key":"account","chooser":"inline_search"}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"]}'::jsonb,'{"search_fields":["code","name"],"filters":{"status":"active","posting_allowed":true},"dependent_filter":{"source_field":"chart_of_account_id","target_field":"chart_of_account_id","empty_behavior":"all"}}'::jsonb,20),
      ('transaction_currency','transaction_currency','Currency','Line transaction currency.','text','currency','one',NULL::text,NULL::jsonb,true,true,false,true,true,false,false,false,false,'{"max_length":3}'::jsonb,NULL::jsonb,'{"group_key":"amounts","chooser":"currency"}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"],"default":"header.transaction_currency"}'::jsonb,NULL::jsonb,30),
      ('transaction_debit','transaction_debit','Debit','Debit amount in transaction currency.','decimal','money','one',NULL::text,NULL::jsonb,false,false,false,true,false,true,false,false,false,'{"min":0,"exclusive_with":"transaction_credit"}'::jsonb,'0'::jsonb,'{"group_key":"amounts","summary_role":"addition"}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"]}'::jsonb,NULL::jsonb,40),
      ('transaction_credit','transaction_credit','Credit','Credit amount in transaction currency.','decimal','money','one',NULL::text,NULL::jsonb,false,false,false,true,false,true,false,false,false,'{"min":0,"exclusive_with":"transaction_debit"}'::jsonb,'0'::jsonb,'{"group_key":"amounts","summary_role":"deduction"}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"]}'::jsonb,NULL::jsonb,50),
      ('base_currency','base_currency','Base Currency','Company functional currency.','text','currency','one',NULL::text,NULL::jsonb,true,true,false,true,true,false,true,true,false,'{"max_length":3}'::jsonb,NULL::jsonb,'{"group_key":"base_amounts"}'::jsonb,NULL::jsonb,'{"editable_in":[],"default":"header.base_currency"}'::jsonb,NULL::jsonb,60),
      ('base_debit','base_debit','Base Debit','Debit amount in base currency.','decimal','money','one',NULL::text,NULL::jsonb,false,false,false,true,false,true,false,false,false,'{"min":0}'::jsonb,'0'::jsonb,'{"group_key":"base_amounts"}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"],"derive":"transaction_debit * exchange_rate"}'::jsonb,NULL::jsonb,70),
      ('base_credit','base_credit','Base Credit','Credit amount in base currency.','decimal','money','one',NULL::text,NULL::jsonb,false,false,false,true,false,true,false,false,false,'{"min":0}'::jsonb,'0'::jsonb,'{"group_key":"base_amounts"}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"],"derive":"transaction_credit * exchange_rate"}'::jsonb,NULL::jsonb,80),
      ('exchange_rate','exchange_rate','Exchange Rate','FX rate from transaction to base currency.','decimal','number','zero_or_one',NULL::text,NULL::jsonb,false,false,false,false,false,false,false,false,false,'{"min":0,"required_when":{"!=":[{"var":"transaction_currency"},{"var":"base_currency"}]}}'::jsonb,NULL::jsonb,'{"group_key":"base_amounts"}'::jsonb,'{"!=":[{"var":"transaction_currency"},{"var":"base_currency"}]}'::jsonb,'{"editable_in":["draft","created"]}'::jsonb,NULL::jsonb,90),
      ('cost_center_id','cost_center_id','Cost Center','Cost center dimension.','reference','entity_chooser','zero_or_one',NULL::text,'{"target_entity":"cost_center","target_field":"id","display_field":"code"}'::jsonb,false,true,false,true,true,false,false,false,false,'{"ref_entity":"cost_center"}'::jsonb,NULL::jsonb,'{"group_key":"dimensions","chooser":"inline_search"}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"]}'::jsonb,'{"search_fields":["code","name"],"filters":{"status":"active"}}'::jsonb,100),
      ('profit_center_id','profit_center_id','Profit Center','Profit center dimension.','reference','entity_chooser','zero_or_one',NULL::text,'{"target_entity":"profit_center","target_field":"id","display_field":"code"}'::jsonb,false,true,false,true,true,false,false,false,false,'{"ref_entity":"profit_center"}'::jsonb,NULL::jsonb,'{"group_key":"dimensions","chooser":"inline_search"}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"]}'::jsonb,'{"search_fields":["code","name"],"filters":{"status":"active"}}'::jsonb,110),
      ('project_id','project_id','Project','Project dimension.','reference','entity_chooser','zero_or_one',NULL::text,'{"target_entity":"project","target_field":"id","display_field":"code"}'::jsonb,false,true,false,true,true,false,false,false,false,'{"ref_entity":"project"}'::jsonb,NULL::jsonb,'{"group_key":"dimensions","chooser":"inline_search"}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"]}'::jsonb,'{"search_fields":["code","name"],"filters":{"status":"active"}}'::jsonb,120),
      ('site_id','site_id','Site','Site dimension.','reference','entity_chooser','zero_or_one',NULL::text,'{"target_entity":"site","target_field":"id","display_field":"code"}'::jsonb,false,true,false,true,true,false,false,false,false,'{"ref_entity":"site"}'::jsonb,NULL::jsonb,'{"group_key":"dimensions","chooser":"inline_search"}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"]}'::jsonb,'{"search_fields":["code","name"],"filters":{"status":"active"}}'::jsonb,130),
      ('party_type','party_type','Party Type','Counterparty type.','enum','select','zero_or_one','document.jl_party_type',NULL::jsonb,false,true,false,false,true,false,false,false,false,NULL::jsonb,NULL::jsonb,'{"group_key":"party"}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"]}'::jsonb,NULL::jsonb,140),
      ('party_id','party_id','Party','Counterparty reference; target depends on party type.','reference','entity_chooser','zero_or_one',NULL::text,'{"target_entity":"polymorphic_party","target_field":"id","display_field":"name"}'::jsonb,false,true,true,false,true,false,false,false,false,'{"ref_entity":"polymorphic_party"}'::jsonb,NULL::jsonb,'{"group_key":"party","chooser":"inline_search"}'::jsonb,'{"var":"party_type"}'::jsonb,'{"editable_in":["draft","created"]}'::jsonb,'{"polymorphic_by":"party_type","targets":{"customer":"customer","supplier":"supplier","employee":"employee","company_code":"company_code","principal":"principal"}}'::jsonb,150),
      ('subledger_type','subledger_type','Subledger','Subledger classification.','enum','select','zero_or_one','document.jl_subledger_type',NULL::jsonb,false,true,false,false,true,false,false,false,false,NULL::jsonb,NULL::jsonb,'{"group_key":"party"}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"]}'::jsonb,NULL::jsonb,160),
      ('description','description','Line Text','Line-level narration.','text','textarea','zero_or_one',NULL::text,NULL::jsonb,false,false,true,false,false,false,false,false,false,'{"max_length":500}'::jsonb,NULL::jsonb,'{"group_key":"narrative","span":3}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"]}'::jsonb,NULL::jsonb,170),
      ('source_doc_line_id','source_doc_line_id','Source Line','Source document line id for generated entries.','uuid','hidden','zero_or_one',NULL::text,NULL::jsonb,false,false,false,false,false,false,true,false,false,NULL::jsonb,NULL::jsonb,'{"group_key":"source"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,NULL::jsonb,180),
      ('tags','tags','Tags','Line tags.','jsonb','tags','zero_or_one',NULL::text,NULL::jsonb,false,true,true,false,true,false,false,false,false,NULL::jsonb,'[]'::jsonb,'{"group_key":"narrative"}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"]}'::jsonb,NULL::jsonb,190),
      ('metadata','metadata','Metadata','System metadata.','jsonb','json','zero_or_one',NULL::text,NULL::jsonb,false,false,false,false,false,false,true,false,false,NULL::jsonb,'{}'::jsonb,'{"group_key":"system"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,NULL::jsonb,200)
    ) AS x(name,column_name,label,description,data_type,ui_type,cardinality,enum_domain_code,reference_config,is_required,is_filterable,is_searchable,is_sortable,is_groupable,is_aggregatable,is_read_only,is_computed,is_write_once,validation,default_value,ui_hint,visibility,editability,lookup_config,sort_order)
)
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, description, data_type, ui_type,
    cardinality, origin, enum_domain_code, reference_config,
    is_required, is_filterable, is_searchable, is_sortable, is_groupable,
    is_aggregatable, is_read_only, is_computed, is_write_once, compute_mode, compute_expr,
    validation, default_value, ui_hint, visibility, editability, lookup_config,
    sort_order, created_by)
SELECT ev.id, d.name, d.column_name, d.label, d.description, d.data_type, d.ui_type,
       d.cardinality, 'standard', d.enum_domain_code, d.reference_config,
       d.is_required, d.is_filterable, d.is_searchable, d.is_sortable, d.is_groupable,
       d.is_aggregatable, d.is_read_only, d.is_computed, d.is_write_once,
       CASE WHEN d.is_computed THEN 'database' ELSE NULL END,
       CASE WHEN d.is_computed THEN jsonb_build_object('source', 'db_trigger') ELSE NULL END,
       d.validation, d.default_value, d.ui_hint, d.visibility, d.editability, d.lookup_config,
       d.sort_order, v_su
FROM defs d
JOIN control.entity e ON e.entity_code = 'journal_line' AND e.tenant_id IS NULL
JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1 AND ev.tenant_id IS NULL
ON CONFLICT DO NOTHING;

UPDATE control.entity
   SET display_config = jsonb_build_object(
       'detail_renderer', 'line',
       'title_field', 'line_no',
       'subtitle_field', 'description',
       'list_columns', '["line_no","gl_account_id","description","transaction_debit","transaction_credit","cost_center_id","party_id"]'::jsonb,
       'default_sort_field', 'line_no',
       'default_sort_order', 'asc',
       'reference_model', NULL
   ),
   natural_key_fields = ARRAY['line_no']
 WHERE table_schema = 'document'
   AND table_name = 'journal_line'
   AND tenant_id IS NULL;

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
    'journal_line_reference', 'JLR', 'journal_line_reference',
    'DOCUMENT_RELATION', 'system', 'ent', 'table',
    'full', 'tenant_critical', 'controlled',
    'document', 'journal_line_reference',
    'Journal Line Reference', 'Journal Line References', 'link', 'slate',
    false,
    '{"parent_entity":"journal_line","parent_fk":"journal_line_id","append_only_after_submission":true,"reference_picker":true}'::jsonb,
    'ACTIVE', v_su
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
     WHERE table_schema = 'document' AND table_name = 'journal_line_reference'
       AND tenant_id IS NULL
);

INSERT INTO control.entity_version (entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(), v_su
FROM control.entity e
WHERE e.table_schema = 'document' AND e.table_name = 'journal_line_reference'
  AND e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;

WITH defs AS (
    SELECT * FROM (VALUES
      ('journal_line_id','journal_line_id','Journal Line','Parent journal line.','reference','hidden','one',NULL::text,'{"target_entity":"journal_line","target_field":"id","display_field":"line_no"}'::jsonb,true,false,false,true,false,false,true,false,false,'{"ref_entity":"journal_line"}'::jsonb,NULL::jsonb,'{"group_key":"identity"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,NULL::jsonb,10),
      ('ref_type','ref_type','Reference Type','Business reason for the reference.','enum','select','one','document.jlr_ref_type',NULL::jsonb,true,true,false,true,true,false,false,false,false,NULL::jsonb,NULL::jsonb,'{"group_key":"reference","required":true}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"]}'::jsonb,NULL::jsonb,20),
      ('ref_doc_type','ref_doc_type','Document Type','Referenced document category.','enum','select','one','document.jlr_ref_doc_type',NULL::jsonb,true,true,false,true,true,false,false,false,false,NULL::jsonb,NULL::jsonb,'{"group_key":"reference","required":true}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"]}'::jsonb,NULL::jsonb,30),
      ('ref_doc_id','ref_doc_id','Document','Referenced document id.','uuid','entity_chooser','one',NULL::text,'{"polymorphic_by":"ref_doc_type","target_field":"id"}'::jsonb,true,true,false,true,true,false,false,false,false,NULL::jsonb,NULL::jsonb,'{"group_key":"reference","chooser":"inline_search"}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"]}'::jsonb,'{"polymorphic_by":"ref_doc_type","targets":{"purchase_invoice":"purchase_invoice","payment_entry":"payment_entry","journal_entry":"journal_entry"}}'::jsonb,40),
      ('ref_doc_line_id','ref_doc_line_id','Document Line','Optional referenced source line.','uuid','entity_chooser','zero_or_one',NULL::text,'{"polymorphic_line_by":"ref_doc_type","target_field":"id"}'::jsonb,false,true,false,true,true,false,false,false,false,NULL::jsonb,NULL::jsonb,'{"group_key":"reference","chooser":"inline_search"}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"]}'::jsonb,NULL::jsonb,50),
      ('ref_doc_number','ref_doc_number','Document Number','Display number cached at selection time.','text','text','zero_or_one',NULL::text,NULL::jsonb,false,true,true,true,false,false,false,false,false,'{"max_length":120}'::jsonb,NULL::jsonb,'{"group_key":"reference","badge":true}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"]}'::jsonb,NULL::jsonb,60),
      ('allocated_amount','allocated_amount','Allocated Amount','Amount connected to the referenced document.','decimal','money','one',NULL::text,NULL::jsonb,true,false,false,true,false,true,false,false,false,'{"min":0,"exclusive_min":true}'::jsonb,NULL::jsonb,'{"group_key":"amounts"}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"],"derive":"abs(journal_line.base_amount)"}'::jsonb,NULL::jsonb,70),
      ('currency_code','currency_code','Currency','Reference currency.','text','currency','one',NULL::text,NULL::jsonb,true,true,false,true,true,false,false,false,false,'{"max_length":3}'::jsonb,NULL::jsonb,'{"group_key":"amounts"}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"],"default":"header.transaction_currency"}'::jsonb,NULL::jsonb,80),
      ('base_amount','base_amount','Base Amount','Base currency amount.','decimal','money','zero_or_one',NULL::text,NULL::jsonb,false,false,false,true,false,true,false,false,false,'{"min":0}'::jsonb,NULL::jsonb,'{"group_key":"amounts"}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"],"derive":"allocated_amount * exchange_rate"}'::jsonb,NULL::jsonb,90),
      ('is_full_settlement','is_full_settlement','Full Settlement','Marks whether the reference fully settles the source.','boolean','checkbox','one',NULL::text,NULL::jsonb,false,true,false,true,true,false,false,false,false,NULL::jsonb,'false'::jsonb,'{"group_key":"settlement"}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"]}'::jsonb,NULL::jsonb,100),
      ('settlement_date','settlement_date','Settlement Date','Date of settlement/application.','date','date','zero_or_one',NULL::text,NULL::jsonb,false,true,false,true,false,false,false,false,false,NULL::jsonb,NULL::jsonb,'{"group_key":"settlement"}'::jsonb,'{"==":[{"var":"is_full_settlement"},true]}'::jsonb,'{"editable_in":["draft","created"]}'::jsonb,NULL::jsonb,110),
      ('description','description','Description','Reference narration.','text','textarea','zero_or_one',NULL::text,NULL::jsonb,false,false,true,false,false,false,false,false,false,'{"max_length":500}'::jsonb,NULL::jsonb,'{"group_key":"narrative","span":3}'::jsonb,NULL::jsonb,'{"editable_in":["draft","created"]}'::jsonb,NULL::jsonb,120),
      ('metadata','metadata','Metadata','Cached labels and integration metadata.','jsonb','json','zero_or_one',NULL::text,NULL::jsonb,false,false,false,false,false,false,true,false,false,NULL::jsonb,'{}'::jsonb,'{"group_key":"system"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,NULL::jsonb,130)
    ) AS x(name,column_name,label,description,data_type,ui_type,cardinality,enum_domain_code,reference_config,is_required,is_filterable,is_searchable,is_sortable,is_groupable,is_aggregatable,is_read_only,is_computed,is_write_once,validation,default_value,ui_hint,visibility,editability,lookup_config,sort_order)
)
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, description, data_type, ui_type,
    cardinality, origin, enum_domain_code, reference_config,
    is_required, is_filterable, is_searchable, is_sortable, is_groupable,
    is_aggregatable, is_read_only, is_computed, is_write_once, compute_mode, compute_expr,
    validation, default_value, ui_hint, visibility, editability, lookup_config,
    sort_order, created_by)
SELECT ev.id, d.name, d.column_name, d.label, d.description, d.data_type, d.ui_type,
       d.cardinality, 'standard', d.enum_domain_code, d.reference_config,
       d.is_required, d.is_filterable, d.is_searchable, d.is_sortable, d.is_groupable,
       d.is_aggregatable, d.is_read_only, d.is_computed, d.is_write_once,
       CASE WHEN d.is_computed THEN 'database' ELSE NULL END,
       CASE WHEN d.is_computed THEN jsonb_build_object('source', 'db_trigger') ELSE NULL END,
       d.validation, d.default_value, d.ui_hint, d.visibility, d.editability, d.lookup_config,
       d.sort_order, v_su
FROM defs d
JOIN control.entity e ON e.entity_code = 'journal_line_reference' AND e.tenant_id IS NULL
JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1 AND ev.tenant_id IS NULL
ON CONFLICT DO NOTHING;

-- DDL completeness guard: keep compiled metadata aware of physical system,
-- audit, generated, and denormalized columns used by the journal tables.
WITH defs AS (
    SELECT * FROM (VALUES
      ('journal_entry','id','id','ID','Primary key (UUIDv7).','uuid','hidden','one','system',NULL::text,NULL::jsonb,true,false,false,false,false,false,true,false,false,'{"group_key":"system"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,1),
      ('journal_entry','tenant_id','tenant_id','Tenant','Owning tenant id.','uuid','hidden','one','system',NULL::text,NULL::jsonb,true,true,false,false,true,false,true,false,false,'{"group_key":"system"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,2),
      ('journal_entry','is_reversal','is_reversal','Is Reversal','Marks a journal entry generated as a reversal.','boolean','hidden','one','system',NULL::text,NULL::jsonb,false,true,false,false,true,false,true,false,false,'{"group_key":"reversal"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,235),
      ('journal_entry','derived_from_je_id','derived_from_je_id','Derived From JE','Source journal entry for cross-book derivation.','reference','hidden','zero_or_one','system',NULL::text,'{"target_entity":"journal_entry","target_field":"id","display_field":"je_number"}'::jsonb,false,true,false,false,false,false,true,false,false,'{"group_key":"source"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,255),
      ('journal_entry','posting_rule_id','posting_rule_id','Posting Rule','Posting rule used to derive the journal entry.','reference','hidden','zero_or_one','system',NULL::text,'{"target_entity":"book_posting_rule","target_field":"id","display_field":"code"}'::jsonb,false,false,false,false,false,false,true,false,false,'{"group_key":"source"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,256),
      ('journal_entry','book_idempotency_key','book_idempotency_key','Book Idempotency Key','Idempotency key for cross-book derived entries.','text','hidden','zero_or_one','system',NULL::text,NULL::jsonb,false,false,false,false,false,false,true,false,false,'{"group_key":"source"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,257),
      ('journal_entry','is_active','is_active','Active','Generated active-state flag.','boolean','hidden','one','system',NULL::text,NULL::jsonb,true,true,false,false,true,false,true,true,false,'{"group_key":"system"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,900),
      ('journal_entry','status_changed_at','status_changed_at','Status Changed At','Timestamp of the last status change.','timestamptz','datetime','zero_or_one','system',NULL::text,NULL::jsonb,false,true,false,true,false,false,true,false,false,'{"group_key":"audit"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,910),
      ('journal_entry','status_changed_by','status_changed_by','Status Changed By','Principal who last changed status.','reference','hidden','zero_or_one','system',NULL::text,'{"target_entity":"principal","target_field":"id","display_field":"display_name"}'::jsonb,false,true,false,false,false,false,true,false,false,'{"group_key":"audit"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,920),
      ('journal_entry','created_at','created_at','Created At','Row creation timestamp.','timestamptz','datetime','one','system',NULL::text,NULL::jsonb,true,true,false,true,false,false,true,false,false,'{"group_key":"audit"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,950),
      ('journal_entry','created_by','created_by','Created By','Principal who created the row.','reference','hidden','one','system',NULL::text,'{"target_entity":"principal","target_field":"id","display_field":"display_name"}'::jsonb,true,true,false,false,false,false,true,false,false,'{"group_key":"audit"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,960),
      ('journal_entry','updated_at','updated_at','Updated At','Timestamp of the last row update.','timestamptz','datetime','zero_or_one','system',NULL::text,NULL::jsonb,false,true,false,true,false,false,true,false,false,'{"group_key":"audit"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,970),
      ('journal_entry','updated_by','updated_by','Updated By','Principal who last updated the row.','reference','hidden','zero_or_one','system',NULL::text,'{"target_entity":"principal","target_field":"id","display_field":"display_name"}'::jsonb,false,true,false,false,false,false,true,false,false,'{"group_key":"audit"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,980),

      ('journal_line','id','id','ID','Primary key (UUIDv7).','uuid','hidden','one','system',NULL::text,NULL::jsonb,true,false,false,false,false,false,true,false,false,'{"group_key":"system"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,1),
      ('journal_line','tenant_id','tenant_id','Tenant','Owning tenant id.','uuid','hidden','one','system',NULL::text,NULL::jsonb,true,true,false,false,true,false,true,false,false,'{"group_key":"system"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,2),
      ('journal_line','company_code_id','company_code_id','Company Code','Denormalized from the journal entry header.','reference','hidden','one','system',NULL::text,'{"target_entity":"company_code","target_field":"id","display_field":"name"}'::jsonb,true,true,false,true,true,false,true,false,false,'{"group_key":"posting"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,210),
      ('journal_line','book_id','book_id','Ledger Book','Denormalized from the journal entry header.','reference','hidden','one','system',NULL::text,'{"target_entity":"ledger_book","target_field":"id","display_field":"name"}'::jsonb,true,true,false,true,true,false,true,false,false,'{"group_key":"posting"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,220),
      ('journal_line','fiscal_period_id','fiscal_period_id','Fiscal Period','Denormalized from the journal entry header.','reference','hidden','one','system',NULL::text,'{"target_entity":"fiscal_period","target_field":"id","display_field":"period_number"}'::jsonb,true,true,false,true,true,false,true,false,false,'{"group_key":"posting"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,230),
      ('journal_line','fiscal_year','fiscal_year','Fiscal Year','Denormalized fiscal year.','integer','hidden','one','system',NULL::text,NULL::jsonb,true,true,false,true,true,false,true,false,false,'{"group_key":"posting"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,240),
      ('journal_line','period_number','period_number','Period','Denormalized fiscal period number.','integer','hidden','one','system',NULL::text,NULL::jsonb,true,true,false,true,true,false,true,false,false,'{"group_key":"posting"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,250),
      ('journal_line','posting_date','posting_date','Posting Date','Denormalized posting date.','date','hidden','one','system',NULL::text,NULL::jsonb,true,true,false,true,false,false,true,false,false,'{"group_key":"posting"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,260),
      ('journal_line','dimension_set_id','dimension_set_id','Dimension Set','Composite dimension set id.','reference','hidden','zero_or_one','system',NULL::text,'{"target_entity":"dimension_set","target_field":"id","display_field":"code"}'::jsonb,false,true,false,false,false,false,true,false,false,'{"group_key":"dimensions"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,270),
      ('journal_line','posted_at','posted_at','Posted At','Timestamp when the line was posted.','timestamptz','hidden','zero_or_one','system',NULL::text,NULL::jsonb,false,true,false,true,false,false,true,false,false,'{"group_key":"audit"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,930),
      ('journal_line','posted_by','posted_by','Posted By','Principal who posted the line.','reference','hidden','zero_or_one','system',NULL::text,'{"target_entity":"principal","target_field":"id","display_field":"display_name"}'::jsonb,false,true,false,false,false,false,true,false,false,'{"group_key":"audit"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,940),
      ('journal_line','created_at','created_at','Created At','Row creation timestamp.','timestamptz','datetime','one','system',NULL::text,NULL::jsonb,true,true,false,true,false,false,true,false,false,'{"group_key":"audit"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,950),
      ('journal_line','created_by','created_by','Created By','Principal who created the row.','reference','hidden','one','system',NULL::text,'{"target_entity":"principal","target_field":"id","display_field":"display_name"}'::jsonb,true,true,false,false,false,false,true,false,false,'{"group_key":"audit"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,960),
      ('journal_line','updated_at','updated_at','Updated At','Timestamp of the last row update.','timestamptz','datetime','zero_or_one','system',NULL::text,NULL::jsonb,false,true,false,true,false,false,true,false,false,'{"group_key":"audit"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,970),
      ('journal_line','updated_by','updated_by','Updated By','Principal who last updated the row.','reference','hidden','zero_or_one','system',NULL::text,'{"target_entity":"principal","target_field":"id","display_field":"display_name"}'::jsonb,false,true,false,false,false,false,true,false,false,'{"group_key":"audit"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,980),

      ('journal_line_reference','id','id','ID','Primary key (UUIDv7).','uuid','hidden','one','system',NULL::text,NULL::jsonb,true,false,false,false,false,false,true,false,false,'{"group_key":"system"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,1),
      ('journal_line_reference','tenant_id','tenant_id','Tenant','Owning tenant id.','uuid','hidden','one','system',NULL::text,NULL::jsonb,true,true,false,false,true,false,true,false,false,'{"group_key":"system"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,2),
      ('journal_line_reference','created_at','created_at','Created At','Append-only creation timestamp.','timestamptz','datetime','one','system',NULL::text,NULL::jsonb,true,true,false,true,false,false,true,false,false,'{"group_key":"audit"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,950),
      ('journal_line_reference','created_by','created_by','Created By','Principal who created the reference.','reference','hidden','one','system',NULL::text,'{"target_entity":"principal","target_field":"id","display_field":"display_name"}'::jsonb,true,true,false,false,false,false,true,false,false,'{"group_key":"audit"}'::jsonb,NULL::jsonb,'{"editable_in":[]}'::jsonb,960)
    ) AS x(entity_code,name,column_name,label,description,data_type,ui_type,cardinality,origin,enum_domain_code,reference_config,is_required,is_filterable,is_searchable,is_sortable,is_groupable,is_aggregatable,is_read_only,is_computed,is_write_once,ui_hint,visibility,editability,sort_order)
)
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, description, data_type, ui_type,
    cardinality, origin, enum_domain_code, reference_config,
    is_required, is_filterable, is_searchable, is_sortable, is_groupable,
    is_aggregatable, is_read_only, is_computed, is_write_once, compute_mode, compute_expr,
    ui_hint, visibility, editability, sort_order, created_by)
SELECT ev.id, d.name, d.column_name, d.label, d.description, d.data_type, d.ui_type,
       d.cardinality, d.origin, d.enum_domain_code, d.reference_config,
       d.is_required, d.is_filterable, d.is_searchable, d.is_sortable, d.is_groupable,
       d.is_aggregatable, d.is_read_only, d.is_computed, d.is_write_once,
       CASE WHEN d.is_computed THEN 'database' ELSE NULL END,
       CASE WHEN d.is_computed THEN jsonb_build_object('source', 'db') ELSE NULL END,
       d.ui_hint, d.visibility, d.editability, d.sort_order, v_su
FROM defs d
JOIN control.entity e ON e.entity_code = d.entity_code AND e.tenant_id IS NULL
JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1 AND ev.tenant_id IS NULL
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
   SET column_name      = EXCLUDED.column_name,
       label            = EXCLUDED.label,
       description      = EXCLUDED.description,
       data_type        = EXCLUDED.data_type,
       ui_type          = EXCLUDED.ui_type,
       cardinality      = EXCLUDED.cardinality,
       origin           = EXCLUDED.origin,
       enum_domain_code = EXCLUDED.enum_domain_code,
       reference_config = EXCLUDED.reference_config,
       is_required      = EXCLUDED.is_required,
       is_filterable    = EXCLUDED.is_filterable,
       is_searchable    = EXCLUDED.is_searchable,
       is_sortable      = EXCLUDED.is_sortable,
       is_groupable     = EXCLUDED.is_groupable,
       is_aggregatable  = EXCLUDED.is_aggregatable,
       is_read_only     = EXCLUDED.is_read_only,
       is_computed      = EXCLUDED.is_computed,
       is_write_once    = EXCLUDED.is_write_once,
       compute_mode     = EXCLUDED.compute_mode,
       compute_expr     = EXCLUDED.compute_expr,
       ui_hint          = EXCLUDED.ui_hint,
       visibility       = EXCLUDED.visibility,
       editability      = EXCLUDED.editability,
       sort_order       = EXCLUDED.sort_order,
       is_active        = true,
       is_deprecated    = false,
       updated_at       = now(),
       updated_by       = v_su;

UPDATE control.entity
   SET display_config = jsonb_build_object(
       'detail_renderer', 'line_reference',
       'title_field', 'ref_doc_number',
       'subtitle_field', 'description',
       'list_columns', '["ref_type","ref_doc_type","ref_doc_number","allocated_amount","currency_code"]'::jsonb,
       'default_sort_field', 'created_at',
       'default_sort_order', 'asc'
   ),
   natural_key_fields = ARRAY['journal_line_id','ref_doc_type','ref_doc_id']
 WHERE table_schema = 'document'
   AND table_name = 'journal_line_reference'
   AND tenant_id IS NULL;

INSERT INTO control.entity_relation
    (entity_version_id, name, relation_kind, target_entity, fk_field, on_delete, ui_behavior, created_by)
SELECT ev.id, r.name, r.kind, r.target_entity, r.fk_field, r.on_delete, r.ui_behavior, v_su
FROM (VALUES
    ('journal_entry','lines','has_many','journal_line','journal_entry_id','cascade','{"surface":"lines_tab","min_rows":2,"line_editor":true}'::jsonb),
    ('journal_entry','company_code','belongs_to','company_code','company_code_id','restrict','{"chooser":"inline_search"}'::jsonb),
    ('journal_entry','ledger_book','belongs_to','ledger_book','book_id','restrict','{"chooser":"inline_search"}'::jsonb),
    ('journal_entry','fiscal_period','belongs_to','fiscal_period','fiscal_period_id','restrict','{"chooser":"inline_search"}'::jsonb),
    ('journal_entry','reversal_of','belongs_to','journal_entry','reversal_of_id','set_null','{"readonly":true}'::jsonb),
    ('journal_line','journal_entry','belongs_to','journal_entry','journal_entry_id','cascade','{"parent":true}'::jsonb),
    ('journal_line','references','has_many','journal_line_reference','journal_line_id','cascade','{"surface":"line_reference","optional":true,"editor":"reference_picker"}'::jsonb),
    ('journal_line','gl_account','belongs_to','gl_account','gl_account_id','restrict','{"chooser":"inline_search"}'::jsonb),
    ('journal_line','cost_center','belongs_to','cost_center','cost_center_id','set_null','{"chooser":"inline_search"}'::jsonb),
    ('journal_line','profit_center','belongs_to','profit_center','profit_center_id','set_null','{"chooser":"inline_search"}'::jsonb),
    ('journal_line','project','belongs_to','project','project_id','set_null','{"chooser":"inline_search"}'::jsonb),
    ('journal_line','site','belongs_to','site','site_id','set_null','{"chooser":"inline_search"}'::jsonb),
    ('journal_line_reference','journal_line','belongs_to','journal_line','journal_line_id','cascade','{"parent":true,"append_only_after_submission":true}'::jsonb)
) AS r(entity_code, name, kind, target_entity, fk_field, on_delete, ui_behavior)
JOIN control.entity e ON e.entity_code = r.entity_code AND e.tenant_id IS NULL
JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1 AND ev.tenant_id IS NULL
ON CONFLICT (entity_version_id, name) DO NOTHING;

END $$;

-- Copy behavior for Journal Entry is intentionally metadata-owned:
-- entity.display_config enables copy, entity_relation decides which children
-- copy, and entity_field.ui_hint.copy_policy decides per-column treatment.
DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
    UPDATE control.entity
       SET display_config = COALESCE(display_config, '{}'::jsonb)
           || jsonb_build_object(
                'copy', jsonb_build_object(
                    'enabled', true,
                    'target_status', 'created',
                    'child_relations', jsonb_build_array('lines'),
                    'numbering_source', 'entity_naming_policy',
                    'sequence_padding', 5
                )
              ),
           updated_at = now(),
           updated_by = v_su
     WHERE entity_code = 'journal_entry'
       AND tenant_id IS NULL;

    UPDATE control.entity_relation er
       SET ui_behavior = COALESCE(er.ui_behavior, '{}'::jsonb)
           || jsonb_build_object('copy', true, 'copy_strategy', 'clone_children'),
           updated_at = now(),
           updated_by = v_su
      FROM control.entity e
      JOIN control.entity_version ev ON ev.entity_id = e.id
     WHERE e.entity_code = 'journal_entry'
       AND e.tenant_id IS NULL
       AND ev.version_no = 1
       AND ev.tenant_id IS NULL
       AND er.entity_version_id = ev.id
       AND er.name = 'lines';

    WITH policies(entity_code, field_name, policy) AS (
        VALUES
        -- Header identity/lifecycle/audit
        ('journal_entry','id','reset'),
        ('journal_entry','tenant_id','reset'),
        ('journal_entry','code','regenerate'),
        ('journal_entry','name','derive'),
        ('journal_entry','document_no','regenerate'),
        ('journal_entry','status','target_status'),
        ('journal_entry','is_active','derive'),
        ('journal_entry','created_at','reset'),
        ('journal_entry','created_by','reset'),
        ('journal_entry','updated_at','reset'),
        ('journal_entry','updated_by','reset'),
        ('journal_entry','status_changed_at','reset'),
        ('journal_entry','status_changed_by','reset'),

        -- Header business fields
        ('journal_entry','company_code_id','preserve'),
        ('journal_entry','book_id','preserve'),
        ('journal_entry','fiscal_period_id','preserve'),
        ('journal_entry','fiscal_year','derive'),
        ('journal_entry','period_number','derive'),
        ('journal_entry','document_date','preserve'),
        ('journal_entry','posting_date','preserve'),
        ('journal_entry','source_type','default'),
        ('journal_entry','source_doc_id','exclude'),
        ('journal_entry','transaction_currency','preserve'),
        ('journal_entry','base_currency','derive'),
        ('journal_entry','total_debit','reset'),
        ('journal_entry','total_credit','reset'),
        ('journal_entry','line_count','reset'),
        ('journal_entry','description','preserve'),
        ('journal_entry','is_reversal','default'),
        ('journal_entry','reversal_of_id','exclude'),
        ('journal_entry','reversed_by_id','exclude'),
        ('journal_entry','is_auto_reverse','preserve'),
        ('journal_entry','auto_reverse_date','preserve'),
        ('journal_entry','derived_from_je_id','exclude'),
        ('journal_entry','posting_rule_id','exclude'),
        ('journal_entry','book_idempotency_key','exclude'),
        ('journal_entry','is_prior_period','preserve'),
        ('journal_entry','original_period_year','preserve'),
        ('journal_entry','original_period_number','preserve'),
        ('journal_entry','close_override_id','preserve'),
        ('journal_entry','posted_at','reset'),
        ('journal_entry','posted_by','reset'),
        ('journal_entry','tags','preserve'),
        ('journal_entry','metadata','default'),

        -- Line identity/parent/audit
        ('journal_line','id','reset'),
        ('journal_line','tenant_id','reset'),
        ('journal_line','journal_entry_id','reparent'),
        ('journal_line','created_at','reset'),
        ('journal_line','created_by','reset'),
        ('journal_line','updated_at','reset'),
        ('journal_line','updated_by','reset'),

        -- Line header-denormalized/system fields
        ('journal_line','company_code_id','derive'),
        ('journal_line','book_id','derive'),
        ('journal_line','fiscal_period_id','derive'),
        ('journal_line','fiscal_year','derive'),
        ('journal_line','period_number','derive'),
        ('journal_line','posting_date','derive'),
        ('journal_line','base_currency','derive'),
        ('journal_line','dimension_set_id','derive'),
        ('journal_line','source_doc_line_id','exclude'),
        ('journal_line','posted_at','reset'),
        ('journal_line','posted_by','reset'),
        ('journal_line','metadata','default'),

        -- Line business fields
        ('journal_line','line_no','preserve'),
        ('journal_line','gl_account_id','preserve'),
        ('journal_line','transaction_currency','preserve'),
        ('journal_line','transaction_debit','preserve'),
        ('journal_line','transaction_credit','preserve'),
        ('journal_line','base_debit','preserve'),
        ('journal_line','base_credit','preserve'),
        ('journal_line','exchange_rate','preserve'),
        ('journal_line','cost_center_id','preserve'),
        ('journal_line','profit_center_id','preserve'),
        ('journal_line','project_id','preserve'),
        ('journal_line','site_id','preserve'),
        ('journal_line','party_type','preserve'),
        ('journal_line','party_id','preserve'),
        ('journal_line','subledger_type','preserve'),
        ('journal_line','description','preserve'),
        ('journal_line','tags','preserve')
    )
    UPDATE control.entity_field ef
       SET ui_hint = COALESCE(ef.ui_hint, '{}'::jsonb)
           || jsonb_build_object('copy_policy', p.policy),
           updated_at = now(),
           updated_by = v_su
      FROM policies p
      JOIN control.entity e ON e.entity_code = p.entity_code
                            AND e.tenant_id IS NULL
      JOIN control.entity_version ev ON ev.entity_id = e.id
                                    AND ev.version_no = 1
                                    AND ev.tenant_id IS NULL
     WHERE ef.entity_version_id = ev.id
       AND ef.name = p.field_name;
END $$;
