-- 100_finance/200_document/001_invoice.sql
-- Purpose: control.entity + entity_version + entity_field for Purchase Invoice
--          (document.purchase_invoice)
-- Module: ACC (Finance Core Accounting)
-- Depends on: LookupDomain/document/p2p_lookup_values.sql
--             (domain: document.purchase_invoice_type, document.purchase_invoice_source)
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
    'purchase_invoice', 'INV', 'purchase_invoice',
    'DOCUMENT', 'system', 'ent', 'table',
    'full', 'tenant_critical', 'controlled',
    'document', 'purchase_invoice',
    'Invoice', 'Invoices', 'file-text', 'violet',
    true,
    '{"prefix":"INV","prefix_configurable":true,"separator":"-","segments":[{"type":"year","format":"YYYY"},{"type":"sequence","padding":6}]}'::jsonb,
    '{"is_approvable":true,"document_category":"payables","allow_on_behalf_of":false,"has_lines":true,"auto_number":true}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
    WHERE table_schema = 'document' AND table_name = 'purchase_invoice'
      AND tenant_id IS NULL
);

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;

-- ── 3. control.entity_field (26 fields) ──────────────────────────────────────
-- Group A: Identity / Classification (10-30)
-- Group B: Counterparty & Dates     (40-60)
-- Group C: Currency & Amounts       (70-115)
-- Group D: References & Terms       (120-145)
-- Group E: Matching & Hold          (150-165)
-- Group F: Dimensions & Fiscal      (200-230)
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
    -- ── A: Identity & Classification ──────────────────────────────────────────
    ('document_no',              'invoice_number',          'Invoice No.',        'text',           'one',         NULL::text,                                   true,  true,  '{"max_length":50}'::jsonb,             10),
    ('invoice_type',             'invoice_type',            'Invoice Type',       'enum',           'one',         'document.purchase_invoice_type'::text,       true,  true,  NULL::jsonb,                            20),
    ('status',                   'status',                  'Status',             'lifecycle_state','one',         NULL::text,                                   true,  true,  NULL::jsonb,                            30),
    ('company_code_id',          'company_code_id',         'Company Code',       'reference',      'one',         NULL::text,                                   true,  true,  '{"ref_entity":"company_code","display_field":"name"}'::jsonb, 35),
    -- ── B: Counterparty & Dates ───────────────────────────────────────────────
    ('supplier_id',              'supplier_id',             'Vendor',             'reference',      'one',         NULL::text,                                   true,  true,  '{"ref_entity":"vendor","display_field":"name"}'::jsonb,       40),
    ('supplier_invoice_date',    'supplier_invoice_date',   'Vendor Invoice Date','date',           'one',         NULL::text,                                   true,  true,  NULL::jsonb,                            45),
    ('invoice_date',             'document_date',           'Invoice Date',       'date',           'one',         NULL::text,                                   true,  true,  NULL::jsonb,                            50),
    ('posting_date',             'posting_date',            'Posting Date',       'date',           'one',         NULL::text,                                   true,  true,  NULL::jsonb,                            55),
    ('due_date',                 'due_date',                'Due Date',           'date',           'zero_or_one', NULL::text,                                   false, true,  NULL::jsonb,                            60),
    -- ── C: Currency & Amounts ─────────────────────────────────────────────────
    ('currency_code',            'currency_code',           'Currency',           'text',           'one',         NULL::text,                                   true,  true,  '{"max_length":3}'::jsonb,              70),
    ('gross_amount',             'total_amount',            'Gross Amount',       'decimal',        'one',         NULL::text,                                   true,  false, '{"min":0}'::jsonb,                     80),
    ('tax_amount',               'tax_amount',              'Tax Amount',         'decimal',        'zero_or_one', NULL::text,                                   false, false, '{"min":0}'::jsonb,                     90),
    ('withholding_tax_amount',   'withholding_tax_amount',  'WHT Amount',         'decimal',        'one',         NULL::text,                                   false, false, '{"min":0}'::jsonb,                     95),
    ('net_amount',               'subtotal_amount',         'Net Amount',         'decimal',        'one',         NULL::text,                                   true,  false, '{"min":0}'::jsonb,                    100),
    ('paid_amount',              'paid_amount',             'Paid Amount',        'decimal',        'one',         NULL::text,                                   false, false, '{"min":0}'::jsonb,                    102),
    ('outstanding_amount',       'outstanding_amount',      'Outstanding',        'decimal',        'one',         NULL::text,                                   false, true,  '{"min":0}'::jsonb,                    104),
    -- ── D: Source, References & Terms ────────────────────────────────────────
    ('invoice_source',           'invoice_source',          'Invoice Source',     'enum',           'one',         'document.purchase_invoice_source'::text,     true,  true,  NULL::jsonb,                           110),
    ('vendor_invoice_ref',       'supplier_invoice_number', 'Vendor Invoice No.', 'text',           'zero_or_one', NULL::text,                                   false, false, '{"max_length":100}'::jsonb,            120),
    ('description',              'description',             'Invoice Name',       'text',           'zero_or_one', NULL::text,                                   false, false, '{"max_length":200}'::jsonb,            130),
    ('payment_term_id',          'payment_term_id',         'Payment Terms',      'reference',      'zero_or_one', NULL::text,                                   false, false, '{"ref_entity":"payment_terms"}'::jsonb,140),
    -- ── E: Matching & Hold ────────────────────────────────────────────────────
    ('match_type',               'match_type',              'Match Type',         'enum',           'one',         'document.invoice_match_type'::text,          true,  true,  NULL::jsonb,                           150),
    ('match_status',             'match_status',            'Match Status',       'enum',           'one',         'document.invoice_match_status'::text,        false, true,  NULL::jsonb,                           155),
    ('hold_reason',              'hold_reason',             'Hold Reason',        'text',           'zero_or_one', NULL::text,                                   false, false, '{"max_length":500}'::jsonb,            160),
    -- ── F: Dimensions & Fiscal ───────────────────────────────────────────────
    ('cost_center_id',           'cost_center_id',          'Cost Centre',        'reference',      'zero_or_one', NULL::text,                                   false, true,  '{"ref_entity":"cost_center"}'::jsonb,  200),
    ('project_id',               'project_id',              'Project',            'reference',      'zero_or_one', NULL::text,                                   false, true,  '{"ref_entity":"project"}'::jsonb,      210),
    ('fiscal_year',              'fiscal_year',             'Fiscal Year',        'integer',        'one',         NULL::text,                                   true,  true,  NULL::jsonb,                            220),
    ('period_number',            'period_number',           'Period',             'integer',        'one',         NULL::text,                                   true,  true,  '{"min":1,"max":16}'::jsonb,             225)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── Extended fields missing from v1 registration ──────────────────────────────
-- These columns exist on document.purchase_invoice but were not initially seeded.
INSERT INTO control.entity_field (
    entity_version_id,
    name, column_name, label, data_type,
    cardinality, origin, enum_domain_code,
    is_required, is_filterable,
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
    -- Commitment reference (P2P linkage)
    ('commitment_id',            'commitment_id',            'Commitment/PO',      'reference', 'zero_or_one', NULL::text, false, true,  '{"ref_entity":"purchase_order"}'::jsonb,              43),
    -- Dates not in original registration
    ('received_date',            'received_date',            'Received Date',      'date',      'one',         NULL::text, true,  false, NULL::jsonb,                                          57),
    ('baseline_date',            'baseline_date',            'Baseline Date',      'date',      'zero_or_one', NULL::text, false, false, NULL::jsonb,                                          62),
    -- FX
    ('base_currency_code',       'base_currency_code',       'Base Currency',      'text',      'one',         NULL::text, true,  true,  '{"max_length":3}'::jsonb,                            72),
    ('exchange_rate',            'exchange_rate',            'Exchange Rate',      'decimal',   'zero_or_one', NULL::text, false, false, '{"min":0}'::jsonb,                                   74),
    -- Amount detail breakdown
    ('discount_amount',          'discount_amount',          'Discount',           'decimal',   'one',         NULL::text, false, false, '{"min":0}'::jsonb,                                   83),
    ('freight_amount',           'freight_amount',           'Freight',            'decimal',   'one',         NULL::text, false, false, '{"min":0}'::jsonb,                                   85),
    ('misc_charges_amount',      'misc_charges_amount',      'Misc. Charges',      'decimal',   'one',         NULL::text, false, false, '{"min":0}'::jsonb,                                   87),
    -- Derived totals
    ('payable_amount',           'payable_amount',           'Payable Amount',     'decimal',   'one',         NULL::text, false, true,  '{"min":0}'::jsonb,                                  107),
    ('advance_deduction_amount', 'advance_deduction_amount', 'Advance Deduction',  'decimal',   'one',         NULL::text, false, false, '{"min":0}'::jsonb,                                  109),
    ('retention_amount',         'retention_amount',         'Retention Amount',   'decimal',   'one',         NULL::text, false, false, '{"min":0}'::jsonb,                                  112),
    ('retention_pct',            'retention_pct',            'Retention %',        'decimal',   'zero_or_one', NULL::text, false, false, '{"min":0,"max":100}'::jsonb,                         114),
    -- Payment method
    ('payment_method_id',        'payment_method_id',        'Payment Method',     'reference', 'zero_or_one', NULL::text, false, false, '{"ref_entity":"payment_method"}'::jsonb,             142),
    -- Hold
    ('is_on_hold',               'is_on_hold',               'On Hold',            'boolean',   'one',         NULL::text, false, false, NULL::jsonb,                                         163),
    -- Freeform
    ('notes',                    'notes',                    'Notes',              'text',      'zero_or_one', NULL::text, false, false, '{"max_length":2000}'::jsonb,                         170),
    ('tags',                     'tags',                     'Tags',               'json',      'zero_or_one', NULL::text, false, false, NULL::jsonb,                                         175),
    -- Budget result
    ('budget_check_result',      'budget_check_result',      'Budget Check',       'text',      'zero_or_one', NULL::text, false, false, NULL::jsonb,                                         205),
    -- Additional dimensions
    ('profit_center_id',         'profit_center_id',         'Profit Center',      'reference', 'zero_or_one', NULL::text, false, true,  '{"ref_entity":"profit_center"}'::jsonb,              215),
    ('site_id',                  'site_id',                  'Site',               'reference', 'zero_or_one', NULL::text, false, true,  '{"ref_entity":"site"}'::jsonb,                       222)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── Fix ref_entity: "supplier" → "vendor" on already-seeded rows ─────────────
UPDATE control.entity_field ef
SET validation = '{"ref_entity":"vendor"}'::jsonb
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name = 'supplier_id'
  AND ef.validation->>'ref_entity' = 'supplier';

-- ── Fix origin for existing rows (idempotent) ─────────────────────────────────
UPDATE control.entity_field ef
SET origin = 'standard'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.origin = 'system';

-- ── Mark searchable fields (idempotent) ───────────────────────────────────────
-- document_no (invoice number like INV-A1-0001), vendor_invoice_ref, description
-- are the natural free-text search targets for the invoice list.
UPDATE control.entity_field ef
SET is_searchable = true
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN ('document_no', 'vendor_invoice_ref', 'description');

-- ── 4. display_config — detail renderer + document_header field map ───────────
-- Applied only when the column still holds the default empty object so that
-- any explicit tenant override or later migration is not overwritten.
UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer', 'approvable',
    'title_field',     'document_no',
    'subtitle_field',  'supplier_id',
    'list_columns',    '["document_no","status","supplier_id","invoice_date","due_date","gross_amount","currency_code"]'::jsonb,
    'default_sort_field', 'invoice_date',
    'default_sort_order', 'desc',
    'action_groups', jsonb_build_object(
        'draft',          jsonb_build_object('primary', '["update","submit"]'::jsonb,        'working', '["cancel"]'::jsonb),
        'submitted',      jsonb_build_object('primary', '["approve","deny"]'::jsonb,         'working', '["cancel"]'::jsonb),
        'pending_approval',jsonb_build_object('primary','["approve","deny"]'::jsonb,         'working', '["cancel"]'::jsonb),
        'in_review',      jsonb_build_object('primary', '["approve","deny"]'::jsonb,         'working', '["cancel"]'::jsonb),
        'on_hold',        jsonb_build_object('primary', '["release_hold"]'::jsonb,           'working', '["cancel"]'::jsonb),
        'approved',       jsonb_build_object('primary', '["post"]'::jsonb,                   'working', '["propose_payment","cancel"]'::jsonb, 'output', '["view_je"]'::jsonb),
        'posted',         jsonb_build_object('primary', '["propose_payment"]'::jsonb,        'working', '["allocate_payment"]'::jsonb,         'output', '["view_je"]'::jsonb),
        'partially_paid', jsonb_build_object('primary', '["propose_payment"]'::jsonb,        'working', '["allocate_payment"]'::jsonb,         'output', '["view_je"]'::jsonb),
        'paid',           jsonb_build_object('output',  '["view_je"]'::jsonb),
        'cancelled',      jsonb_build_object(),
        'rejected',       jsonb_build_object('working', '["copy"]'::jsonb)
    ),
    'document_header', jsonb_build_object(
        'number_field',     'document_no',
        'status_field',     'status',
        'type_label',       'INVOICE',
        'total_label',      'INVOICE TOTAL',
        'date_label',       'INVOICE DATE',
        'party_id_field',   'supplier_id',
        'amount_field',     'gross_amount',
        'subtotal_field',   'net_amount',
        'tax_field',        'tax_amount',
        'currency_field',   'currency_code',
        'date_field',       'invoice_date',
        'due_date_field',   'due_date',
        'title_field',      'description'
    )
)
WHERE table_schema = 'document' AND table_name = 'purchase_invoice'
  AND tenant_id IS NULL
  AND display_config = '{}'::jsonb;

-- ── 4b. Patch: add title_field to document_header on already-seeded databases ──
-- The initial UPDATE (above) only fires on a fresh DB (display_config = '{}').
-- This idempotent patch backfills the key on any existing configuration.
UPDATE control.entity
SET display_config = jsonb_set(
    display_config,
    '{document_header,title_field}',
    '"description"'::jsonb,
    true
)
WHERE table_schema = 'document' AND table_name = 'purchase_invoice'
  AND tenant_id IS NULL
  AND (display_config -> 'document_header' ->> 'title_field') IS NULL;

-- ── 4c. Patch: add action_groups to display_config on already-seeded databases ─
UPDATE control.entity
SET display_config = jsonb_set(
    display_config,
    '{action_groups}',
    jsonb_build_object(
        'draft',           jsonb_build_object('primary', '["update","submit"]'::jsonb,        'working', '["cancel"]'::jsonb),
        'submitted',       jsonb_build_object('primary', '["approve","deny"]'::jsonb,         'working', '["cancel"]'::jsonb),
        'pending_approval',jsonb_build_object('primary', '["approve","deny"]'::jsonb,         'working', '["cancel"]'::jsonb),
        'in_review',       jsonb_build_object('primary', '["approve","deny"]'::jsonb,         'working', '["cancel"]'::jsonb),
        'on_hold',         jsonb_build_object('primary', '["release_hold"]'::jsonb,           'working', '["cancel"]'::jsonb),
        'approved',        jsonb_build_object('primary', '["post"]'::jsonb,                   'working', '["propose_payment","cancel"]'::jsonb, 'output', '["view_je"]'::jsonb),
        'posted',          jsonb_build_object('primary', '["propose_payment"]'::jsonb,        'working', '["allocate_payment"]'::jsonb,         'output', '["view_je"]'::jsonb),
        'partially_paid',  jsonb_build_object('primary', '["propose_payment"]'::jsonb,        'working', '["allocate_payment"]'::jsonb,         'output', '["view_je"]'::jsonb),
        'paid',            jsonb_build_object('output',  '["view_je"]'::jsonb),
        'cancelled',       jsonb_build_object(),
        'rejected',        jsonb_build_object('working', '["copy"]'::jsonb)
    ),
    true
)
WHERE table_schema = 'document' AND table_name = 'purchase_invoice'
  AND tenant_id IS NULL
  AND (display_config -> 'action_groups') IS NULL;

-- ── 5. Runtime wiring — module, feature flags, numbering, natural key ─────────
-- All idempotent. Designed to be re-run safely on an already-seeded database.

-- 5a. Module → PROC (Procurement).  Inner-join style: no-op if PROC does not
--     exist yet so an incomplete seed environment stays consistent.
UPDATE control.entity e
SET    module_id = m.id
FROM   shared.module m
WHERE  m.code          = 'PROC'
  AND  e.table_schema  = 'document'
  AND  e.table_name    = 'purchase_invoice'
  AND  e.tenant_id     IS NULL;

-- 5b. Full feature_flags — canonical names only.
--     Replaces the whole object so existing rows are migrated on next seed run.
UPDATE control.entity
SET feature_flags = jsonb_build_object(
    -- Core document flags
    'is_approvable',               true,
    'document_category',           'payables',
    'allow_on_behalf_of',          false,
    'auto_number',                 true,
    -- Lines tab
    'has_lines',                   true,
    -- AI classification panel in LineEditorSheet
    'has_ai_classification',       true,
    -- LineComposerSheet for AI-assisted line intake
    'has_line_composer',           true,
    -- Comments tab
    'comments_enabled',            true,
    -- Activity / events tab
    'event_history',               true,
    -- Attachments tab
    'has_attachments',             true,
    -- Version control
    'version_control',             true,
    -- Accounting distributions tab + accounting health tile
    'has_accounting_distribution', true,
    -- Payment settlement health tile
    'has_payment_schedule',        true
)
WHERE table_schema = 'document' AND table_name = 'purchase_invoice'
  AND tenant_id IS NULL;

-- 5c. Naming policy → PINV-{tenant_code}-{YYYY}-{seq:5}
--     Produces keys like PINV-ACME-2026-00001.
--     The tenant_code segment is resolved at generation time from the session
--     context; the sequence resets yearly per tenant.
UPDATE control.entity
SET naming_policy = jsonb_build_object(
    'prefix',              'PINV',
    'prefix_configurable', true,
    'separator',           '-',
    'segments', jsonb_build_array(
        jsonb_build_object('type', 'tenant_code'),
        jsonb_build_object('type', 'year', 'format', 'YYYY'),
        jsonb_build_object('type', 'sequence', 'padding', 5)
    ),
    'reset_strategy', 'yearly'
)
WHERE table_schema = 'document' AND table_name = 'purchase_invoice'
  AND tenant_id IS NULL;

-- 5d. Natural key field — document_no is the canonical business key used in URLs.
--     Only set when not already configured so tenant overrides are preserved.
UPDATE control.entity
SET natural_key_fields = ARRAY['document_no']
WHERE table_schema    = 'document'
  AND table_name      = 'purchase_invoice'
  AND tenant_id       IS NULL
  AND (natural_key_fields IS NULL OR natural_key_fields = '{}');

-- ── 3b. Full-coverage entity fields — all remaining business columns ───────────
-- Excluded (intentionally): id, tenant_id, code, name (system identity);
-- term_snapshot, dimension_set_id, ap_je_id, workflow_request_id (internal);
-- is_posted, is_active (derived/GENERATED); posted_at/by, approved_at/by,
-- status_changed_at/by, created_at/by, updated_at/by (audit trail);
-- line_count, metadata (system-managed counters/opaque store).
-- budget_check_result requires lookup domain: document.invoice_budget_check_result
--   with values: PASSED, WARNED, OVERRIDE, BLOCKED, EXEMPT
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
    -- ── A: Identity additions (15, 22) ────────────────────────────────────────
    ('fiscal_document_number', 'fiscal_document_number',  'Fiscal Doc. No.',    'text',      'zero_or_one', NULL::text,                                   false, true,  '{"max_length":100}'::jsonb,          15),
    ('is_credit_note',         'is_credit_note',          'Credit Note',        'boolean',   'one',         NULL::text,                                   false, true,  NULL::jsonb,                          22),
    -- ── B: Counterparty & Dates additions (42, 47, 57) ───────────────────────
    ('commitment_id',          'commitment_id',           'PO / Commitment',    'reference', 'zero_or_one', NULL::text,                                   false, true,  '{"ref_entity":"commitment"}'::jsonb, 42),
    ('received_date',          'received_date',           'Received Date',      'date',      'one',         NULL::text,                                   true,  true,  NULL::jsonb,                          47),
    ('baseline_date',          'baseline_date',           'Baseline Date',      'date',      'zero_or_one', NULL::text,                                   false, true,  NULL::jsonb,                          57),
    -- ── C: Currency & Amounts additions (72–109) ─────────────────────────────
    ('base_currency_code',     'base_currency_code',      'Base Currency',      'text',      'one',         NULL::text,                                   true,  true,  '{"max_length":3}'::jsonb,            72),
    ('exchange_rate',          'exchange_rate',           'Exchange Rate',      'decimal',   'zero_or_one', NULL::text,                                   false, false, '{"min":0}'::jsonb,                   74),
    ('discount_amount',        'discount_amount',         'Discount',           'decimal',   'zero_or_one', NULL::text,                                   false, false, '{"min":0}'::jsonb,                   82),
    ('freight_amount',         'freight_amount',          'Freight',            'decimal',   'zero_or_one', NULL::text,                                   false, false, '{"min":0}'::jsonb,                   84),
    ('misc_charges_amount',    'misc_charges_amount',     'Misc. Charges',      'decimal',   'zero_or_one', NULL::text,                                   false, false, '{"min":0}'::jsonb,                   86),
    ('payable_amount',         'payable_amount',          'Payable Amount',     'decimal',   'one',         NULL::text,                                   false, true,  '{"computed":true}'::jsonb,          103),
    ('advance_deduction_amount','advance_deduction_amount','Advance Deduction', 'decimal',   'zero_or_one', NULL::text,                                   false, false, '{"min":0}'::jsonb,                  105),
    ('retention_amount',       'retention_amount',        'Retention Amount',   'decimal',   'zero_or_one', NULL::text,                                   false, false, '{"min":0}'::jsonb,                  107),
    ('retention_pct',          'retention_pct',           'Retention %',        'decimal',   'zero_or_one', NULL::text,                                   false, false, '{"min":0,"max":100}'::jsonb,        109),
    -- ── D: References & Terms additions (142–147) ────────────────────────────
    ('payment_method_id',      'payment_method_id',       'Payment Method',     'reference', 'zero_or_one', NULL::text,                                   false, false, '{"ref_entity":"payment_method"}'::jsonb, 142),
    ('notes',                  'notes',                   'Notes',              'text',      'zero_or_one', NULL::text,                                   false, false, '{"max_length":2000}'::jsonb,        145),
    ('tags',                   'tags',                    'Tags',               'text',      'many',        NULL::text,                                   false, true,  NULL::jsonb,                         147),
    -- ── E: Matching, Hold & Budget additions (162–168) ───────────────────────
    ('is_reversal',            'is_reversal',             'Is Reversal',        'boolean',   'one',         NULL::text,                                   false, true,  NULL::jsonb,                         162),
    ('reversal_of_id',         'reversal_of_id',          'Reversal Of',        'reference', 'zero_or_one', NULL::text,                                   false, false, '{"ref_entity":"purchase_invoice"}'::jsonb, 163),
    ('is_on_hold',             'is_on_hold',              'On Hold',            'boolean',   'one',         NULL::text,                                   false, true,  NULL::jsonb,                         165),
    ('budget_allocation_id',   'budget_allocation_id',    'Budget Allocation',  'reference', 'zero_or_one', NULL::text,                                   false, true,  '{"ref_entity":"budget_allocation"}'::jsonb, 167),
    ('budget_check_result',    'budget_check_result',     'Budget Check',       'enum',      'zero_or_one', 'document.invoice_budget_check_result'::text, false, true,  NULL::jsonb,                         168),
    -- ── F: Dimensions additions (205, 215) ───────────────────────────────────
    ('profit_center_id',       'profit_center_id',        'Profit Centre',      'reference', 'zero_or_one', NULL::text,                                   false, true,  '{"ref_entity":"profit_center"}'::jsonb, 205),
    ('site_id',                'site_id',                 'Site',               'reference', 'zero_or_one', NULL::text,                                   false, true,  '{"ref_entity":"site"}'::jsonb,      215)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── Patch: rename 'Vendor Ref' → 'Vendor Invoice No.' on already-seeded rows ──
UPDATE control.entity_field ef
   SET label = 'Vendor Invoice No.'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
   AND e.tenant_id IS NULL AND ev.version_no = 1
   AND ef.name = 'vendor_invoice_ref'
   AND ef.label = 'Vendor Ref';
