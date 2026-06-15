-- Table-owned seed for control.entity_flow
-- Consolidated from platform control/entity-engine/domain-registration sources.
-- Lookup domain/value seeds remain under 000_lookups by design.


-- ============================================================
-- SOURCE: server/db/seed/platform/004_entity_engine/065_entity_flows.sql
-- ============================================================

-- Entity Flow Registry
-- Canonical home for control.entity_flow, entity_flow_field,
-- entity_flow_section, entity_flow_step across all domain registrations.

-- ============================================================
-- DOCUMENT FLOWS
-- ============================================================
-- === SOURCE: 005_document_flows.sql ===
-- Full content incorporated below (moved from domain registration file).
-- See original source comments within each procedural block for field-by-field details.


-- === SOURCE: 014_journal_entry_override_permissions.sql ===
-- =============================================================================
-- 900_seed_data/platform/005_domain_registrations/200_document/014_journal_entry_override_permissions.sql
-- JE override permission codes used by the manual Journal Entry create flow.
-- Idempotent: ON CONFLICT (code) DO NOTHING
-- =============================================================================

INSERT INTO shared.permission (code, name, category_id, scope_type, risk_level, sort_order, created_by)
SELECT v.code, v.name, pc.id, 'record', 'medium', v.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('je.override_company_code',  'Override JE Company Code',  760),
    ('je.override_book',          'Override JE Ledger Book',   770),
    ('je.override_document_date', 'Override JE Document Date', 780),
    ('je.override_currency',      'Override JE Currency',      790)
) AS v(code, name, sort_order)
JOIN shared.permission_category pc ON pc.code = 'finance'
ON CONFLICT (code) DO NOTHING;


-- === SOURCE: 015_ap_override_permissions.sql ===
-- =============================================================================
-- 900_seed_data/platform/005_domain_registrations/200_document/015_ap_override_permissions.sql
-- AP override permission codes — one per overrideable derivation in the PI create flow.
-- Medium risk: overriding any of these is a governance event worth logging.
-- Depends on: 001_permission_model seed (shared.permission_category finance exists)
-- Idempotent: ON CONFLICT (code) DO NOTHING
-- =============================================================================

INSERT INTO shared.permission (code, name, category_id, scope_type, risk_level, sort_order, created_by)
SELECT v.code, v.name, pc.id, 'record', 'medium', v.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('ap.override_payment_method',     'Override AP Payment Method',     610),
    ('ap.override_cost_center',        'Override AP Cost Center',        620),
    ('ap.override_profit_center',      'Override AP Profit Center',      630),
    ('ap.override_company_code',       'Override AP Company Code',       640),
    ('ap.override_currency',           'Override AP Currency',           650),
    ('ap.override_fx_rate',            'Override AP FX Rate',            660),
    ('ap.override_tax_amount',         'Override AP Tax Amount',         670),
    ('ap.override_wht_amount',         'Override AP WHT Amount',         680),
    ('ap.override_total',              'Override AP Total',              690),
    ('ap.override_payment_term',       'Override AP Payment Term',       700),
    ('ap.override_baseline_date',      'Override AP Baseline Date',      710),
    ('ap.override_due_date',           'Override AP Due Date',           720),
    ('ap.override_posting_date',       'Override AP Posting Date',       730),
    ('ap.override_advance_deduction',  'Override AP Advance Deduction',  740),
    ('ap.override_retention',          'Override AP Retention',          750)
) AS v(code, name, sort_order)
JOIN shared.permission_category pc ON pc.code = 'finance'
ON CONFLICT (code) DO NOTHING;


-- === SOURCE: 016_purchase_invoice_flow.sql ===
-- =============================================================================
-- platform/005_domain_registrations/200_document/016_purchase_invoice_flow.sql
-- Standard 'create' flow for document.purchase_invoice (3-step wizard).
-- VERSION 2 — redesigned Step 2 (source-aware, 4 sections, tax_mode, §stage2).
-- Changes from v1:
--   - Field names fixed: total_amount (was gross_amount), supplier_invoice_number
--   - Step 2 restructured with entity_flow_section groupings
--   - tax_mode binding added (Step 2, amount_basis section)
--   - payment_method_id relocated from Step 2 → Step 3
--   - JSONLogic predicates: lowercase values throughout
-- Depends on: 001_invoice.sql, 015_ap_override_permissions.sql,
--             020_ap_flow_permissions.sql, control/01g_tables_flow_engine_ext.sql
-- Idempotent: WHERE NOT EXISTS for flow+steps, ON CONFLICT for sections,
--             DELETE+INSERT for field bindings (platform-level only, tenant_id IS NULL)
-- =============================================================================

DO $$
DECLARE
  v_su      constant uuid := '00000000-0000-0000-0000-000000000000';
  v_nil     constant uuid := '00000000-0000-0000-0000-000000000000';
  v_ev_id   uuid;
  v_flow_id uuid;
  v_step_1  uuid;
  v_step_2  uuid;
  v_step_3  uuid;
BEGIN
  -- ── Resolve entity version ─────────────────────────────────────────────────
  SELECT ev.id INTO v_ev_id
    FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
   WHERE e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
     AND e.tenant_id IS NULL AND ev.version_no = 1;

  IF v_ev_id IS NULL THEN
    RAISE NOTICE 'purchase_invoice v1 not found — flow seed skipped';
    RETURN;
  END IF;

  -- ── 1. Flow header ─────────────────────────────────────────────────────────
  INSERT INTO control.entity_flow (
    tenant_id, entity_version_id, flow_code, label, description, icon_key,
    trigger_context, is_default, config, version_no, status, effective_from, created_by)
  SELECT
    NULL, v_ev_id, 'create',
    'Create Invoice',
    'Standard 3-step AP invoice intake: Identify (source + supplier), Commercial (amounts + tax mode), Review (policy outcomes + dimensions).',
    'file-plus',
    'new', true,
    jsonb_build_object(
      'summary', jsonb_build_object(
        'fields', jsonb_build_array('total_amount','tax_amount','withholding_tax_amount',
                                    'advance_deduction_amount','retention_amount','payable_amount'),
        'line_collection', 'lines',
        'collapse_zero_adjustments', true,
        'running_totals', jsonb_build_array('gross','tax','wht','deductions','payable')),
      'input_modes', jsonb_build_array('form','scan','from_commitment','import'),
      'dedup', jsonb_build_object(
        'index', 'pi_supplier_invoice_dedup_idx',
        'trigger_fields', jsonb_build_array('supplier_id','supplier_invoice_number','supplier_invoice_date')),
      'assist', jsonb_build_object(
        'budget_precheck', true, 'ocr_prefill', true,
        'supplier_enrichment', true, 'po_prefill', true),
      'layout', 'wizard_with_summary'),
    1, 'active', now(), v_su
  WHERE NOT EXISTS (
    SELECT 1 FROM control.entity_flow
     WHERE entity_version_id = v_ev_id
       AND flow_code = 'create' AND tenant_id IS NULL AND version_no = 1);

  -- Update config on existing row (picks up config changes on re-run)
  UPDATE control.entity_flow
     SET config = jsonb_build_object(
       'summary', jsonb_build_object(
         'fields', jsonb_build_array('total_amount','tax_amount','withholding_tax_amount',
                                     'advance_deduction_amount','retention_amount','payable_amount'),
         'line_collection', 'lines',
         'collapse_zero_adjustments', true,
         'running_totals', jsonb_build_array('gross','tax','wht','deductions','payable')),
       'input_modes', jsonb_build_array('form','scan','from_commitment','import'),
       'dedup', jsonb_build_object(
         'index', 'pi_supplier_invoice_dedup_idx',
         'trigger_fields', jsonb_build_array('supplier_id','supplier_invoice_number','supplier_invoice_date')),
       'assist', jsonb_build_object(
         'budget_precheck', true, 'ocr_prefill', true,
         'supplier_enrichment', true, 'po_prefill', true),
       'layout', 'wizard_with_summary')
   WHERE entity_version_id = v_ev_id
     AND flow_code = 'create' AND tenant_id IS NULL AND version_no = 1;

  SELECT id INTO v_flow_id FROM control.entity_flow
   WHERE entity_version_id = v_ev_id
     AND flow_code = 'create' AND tenant_id IS NULL AND version_no = 1;

  -- ── 2. Steps ───────────────────────────────────────────────────────────────
  INSERT INTO control.entity_flow_step
    (tenant_id, flow_id, step_key, label, icon_key, sort_order, advance_rule, layout_hint, created_by)
  VALUES
  (NULL, v_flow_id, 'identify',   'Identify',   'id-card',      10,
   '{"required_fields":["company_code_id","invoice_type","invoice_source","supplier_id","supplier_invoice_number","supplier_invoice_date","posting_date","received_date"]}'::jsonb,
   'summary_side', v_su),
  (NULL, v_flow_id, 'commercial', 'Commercial', 'receipt',      20,
   '{"required_fields":["tax_mode"],"required_sections":["lines"],"min_rows":{"lines":1}}'::jsonb,
   'line_editor', v_su),
  (NULL, v_flow_id, 'review',     'Review',     'check-circle', 30,
   '{"required_fields":[]}'::jsonb,
   'summary_side', v_su)
  ON CONFLICT (flow_id, step_key) DO NOTHING;

  -- Always update advance_rules to current spec
  UPDATE control.entity_flow_step
     SET advance_rule = '{"required_fields":["company_code_id","invoice_type","invoice_source","supplier_id","supplier_invoice_number","supplier_invoice_date","posting_date","received_date"]}'::jsonb
   WHERE flow_id = v_flow_id AND step_key = 'identify';
  UPDATE control.entity_flow_step
     SET advance_rule = '{"required_fields":["tax_mode"],"required_sections":["lines"],"min_rows":{"lines":1}}'::jsonb,
         layout_hint = 'line_editor'
   WHERE flow_id = v_flow_id AND step_key = 'commercial';
  UPDATE control.entity_flow_step
     SET advance_rule = '{"required_fields":[]}'::jsonb
   WHERE flow_id = v_flow_id AND step_key = 'review';

  SELECT id INTO v_step_1 FROM control.entity_flow_step WHERE flow_id = v_flow_id AND step_key = 'identify';
  SELECT id INTO v_step_2 FROM control.entity_flow_step WHERE flow_id = v_flow_id AND step_key = 'commercial';
  SELECT id INTO v_step_3 FROM control.entity_flow_step WHERE flow_id = v_flow_id AND step_key = 'review';

  -- ── 3. Wipe and reseed platform-level field bindings ───────────────────────
  -- tenant_id IS NULL guard ensures tenant overrides are never touched.
  DELETE FROM control.entity_flow_field
   WHERE flow_step_id IN (v_step_1, v_step_2, v_step_3) AND tenant_id IS NULL;

  -- ── 4. Step 2 sections (must exist before field bindings reference them) ───
  -- The trg_flow_field_validate_section trigger enforces this ordering.
  INSERT INTO control.entity_flow_section
    (tenant_id, flow_step_id, section_key, label, description, sort_order,
     collapse_default, visible_when, reveal_behavior,
     section_type, entity_code, payload_key, field_codes, min_rows, default_row,
     created_by)
  VALUES
  (NULL, v_step_2, 'lines',           'Invoice Lines',
   'Goods, services, freight, and miscellaneous invoice lines.',
   5, false, NULL, 'auto_expand',
   'repeater', 'purchase_invoice_line', 'lines',
   '["item_description","procurement_type","uom_code","quantity","unit_price","gross_amount","tax_amount","withholding_tax_amount","commodity_category_id","business_intent_id","cost_center_id","profit_center_id","project_id","site_id"]'::jsonb,
   1,
   '{"procurement_type":"goods","uom_code":"EA","quantity":1}'::jsonb,
   v_su),
  (NULL, v_step_2, 'amount_basis',    'Amount Basis',
   'Invoice Total, tax interpretation, and derived amounts.',
   10, false, NULL, 'honor_default',
   'fields', NULL, NULL, NULL, NULL, NULL, v_su),
  (NULL, v_step_2, 'settlement_terms','Settlement Terms',
   'Payment terms, baseline date, and computed due date.',
   20, false, NULL, 'honor_default',
   'fields', NULL, NULL, NULL, NULL, NULL, v_su),
  (NULL, v_step_2, 'adjustments',     'Adjustments',
   'Discounts, additional charges, withholding tax, advance recovery, and retention.',
   30, true, NULL, 'honor_default',
   'fields', NULL, NULL, NULL, NULL, NULL, v_su),
  (NULL, v_step_2, 'fx',              'Foreign Exchange',
   NULL,
   40, true,
   '{"!=":[{"var":"currency_code"},{"var":"base_currency_code"}]}'::jsonb,
   'auto_expand',
   'fields', NULL, NULL, NULL, NULL, NULL, v_su)
  ON CONFLICT (flow_step_id, section_key) DO UPDATE SET
    label          = EXCLUDED.label,
    description    = EXCLUDED.description,
    sort_order     = EXCLUDED.sort_order,
    collapse_default = EXCLUDED.collapse_default,
    visible_when   = EXCLUDED.visible_when,
    reveal_behavior = EXCLUDED.reveal_behavior,
    section_type    = EXCLUDED.section_type,
    entity_code     = EXCLUDED.entity_code,
    payload_key     = EXCLUDED.payload_key,
    field_codes     = EXCLUDED.field_codes,
    min_rows        = EXCLUDED.min_rows,
    default_row     = EXCLUDED.default_row;

  -- ── 5. Step 1: Identify ────────────────────────────────────────────────────
  -- 15 field bindings; no sections on this step.
  INSERT INTO control.entity_flow_field (
    tenant_id, flow_step_id, entity_field_id,
    mode, derivation_mode, visible_when, required_when,
    default_source, derive_expression, override_permission,
    summary_role, ui_variant, span, help_text, sort_order, created_by)
  SELECT NULL, v_step_1, ef.id,
         v.mode, v.derivation_mode,
         v.visible_when::jsonb, v.required_when::jsonb,
         v.default_source, v.derive_expression, v.override_permission,
         v.summary_role, v.ui_variant, v.span, v.help_text, v.sort_order, v_su
  FROM control.entity_field ef
  JOIN (VALUES
    ('company_code_id',       'required',  'derived_overrideable',
      NULL::text, NULL::text, NULL, 'ctx.user.default_company_code',
      'ap.override_company_code', NULL, 'inline_search', 1,
      'Company posting the invoice.', 20),
    ('invoice_type',          'required',  'manual',
      NULL, NULL, 'lookup.document.purchase_invoice_type.standard', NULL, NULL,
      NULL, 'radio_cards', 2,
      'Classifies the commercial purpose of this invoice (Standard, Credit Note, Debit Note, Advance, Retention Release, Final, or Self-Billed).', 20),
    ('invoice_source',        'required',  'manual',
      NULL, NULL, 'lookup.document.purchase_invoice_source.po_based', NULL, NULL,
      NULL, 'segmented', 2,
      'Determines PO/commitment requirement and three-way/two-way match type.', 30),
    ('supplier_id',           'required',  'manual',
      NULL, NULL, NULL, NULL, NULL, NULL, 'inline_search', 1, NULL, 10),
    ('commitment_id',         'editable',  'manual',
      '{"in":[{"var":"invoice_source"},["po_based","contract_based"]]}',
      '{"in":[{"var":"invoice_source"},["po_based","contract_based"]]}',
      NULL, NULL, NULL, NULL, 'inline_search', 2,
      'Required for PO-based and contract-based invoices.', 50),
    ('supplier_invoice_number', 'required', 'manual',
      NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1,
      'Number printed on the supplier''s invoice. Triggers duplicate detection.', 60),
    ('supplier_invoice_date', 'required',  'manual',
      NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1,
      'Date printed on the supplier''s invoice.', 70),
    ('posting_date',          'required',  'derived_overrideable',
      NULL, NULL, NULL, 'today()',
      'ap.override_posting_date', NULL, NULL, 1,
      'GL posting date. Drives fiscal year, period, and FX rate lookup.', 80),
    ('received_date',         'required',  'manual',
      NULL, NULL, 'today()', NULL, NULL, NULL, NULL, 1, NULL, 90),
    ('description',           'editable',  'manual',
      NULL, NULL, NULL, NULL, NULL, NULL, NULL, 3, 'Short name for this invoice — makes it easy to find and reference later. You can also edit it directly from the invoice header.', 100),
    ('currency_code',         'chip',      'derived_overrideable',
      NULL, NULL, NULL,
      'supplier.default_currency(supplier_id)', 'ap.override_currency',
      'meta', 'chip', 1, 'Derived from supplier profile. Override requires permission.', 200),
    ('match_type',            'chip',      'derived_locked',
      NULL, NULL, NULL,
      'matching.match_type_from_source(invoice_source)', NULL,
      'meta', 'chip', 1, 'Determined by invoice source.', 210),
    ('payment_term_id',       'chip',      'derived_overrideable',
      NULL, NULL, NULL,
      'supplier.default_payment_term(supplier_id, company_code_id)', 'ap.override_payment_term',
      'meta', 'chip', 1, NULL, 220),
    ('fiscal_year',           'chip',      'derived_locked',
      NULL, NULL, NULL,
      'fiscal.year_from(posting_date, company_code_id)', NULL,
      'meta', 'chip', 1, NULL, 230),
    ('period_number',         'chip',      'derived_locked',
      NULL, NULL, NULL,
      'fiscal.period_from(posting_date, company_code_id)', NULL,
      'meta', 'chip', 1, NULL, 240)
  ) AS v(field_name, mode, derivation_mode, visible_when, required_when,
         default_source, derive_expression, override_permission,
         summary_role, ui_variant, span, help_text, sort_order)
     ON ef.name = v.field_name AND ef.entity_version_id = v_ev_id;

  -- ── 6. Step 2: Commercial (4 sections, 17 field bindings) ─────────────────
  -- Sections: amount_basis | settlement_terms | adjustments | fx
  -- Sections seeded above (step 4) before this INSERT runs.
  INSERT INTO control.entity_flow_field (
    tenant_id, flow_step_id, entity_field_id,
    mode, derivation_mode, visible_when, required_when,
    default_source, derive_expression, override_permission,
    summary_role, ui_variant, span, display_size, section_key,
    help_text, sort_order, created_by)
  SELECT NULL, v_step_2, ef.id,
         v.mode, v.derivation_mode,
         v.visible_when::jsonb, v.required_when::jsonb,
         v.default_source, v.derive_expression, v.override_permission,
         v.summary_role, v.ui_variant, v.span, v.display_size, v.section_key,
         v.help_text, v.sort_order, v_su
  FROM control.entity_field ef
  JOIN (VALUES
    -- ── amount_basis ──────────────────────────────────────────────────────────
    ('currency_code',           'chip',         'derived_overrideable',
      NULL::text, NULL::text,
      NULL, 'supplier.default_currency(supplier_id)', 'ap.override_currency',
      NULL, 'chip', 1, 'standard', 'amount_basis', NULL, 5),

    ('total_amount',            'summary_only', 'derived_locked',
      NULL, NULL,
      NULL, 'lines.sum(gross_amount)', NULL,
      'total', 'money_big', 2, 'prominent', 'amount_basis',
      'Invoice Total — what the supplier''s document shows. For PO/contract sources, derived from commitment lines (override with permission). For Non-PO/One-Time, enter directly.',
      10),

    ('tax_mode',                'required',     'derived_overrideable',
      NULL, NULL,
      NULL, 'tax.infer_mode(supplier_id, tax_group_id, company_code_id)', 'ap.override_tax_mode',
      'meta', 'radio_cards', 2, 'standard', 'amount_basis',
      'How tax_amount relates to Invoice Total. Inclusive = tax within total; Exclusive = tax added on top; No Tax = exempt or zero-rated.',
      20),

    ('tax_amount',              'summary_only', 'derived_locked',
      NULL, NULL,
      NULL, 'lines.sum(tax_amount)', NULL,
      'addition', 'money_big', 1, 'standard', 'amount_basis',
      'Computed by the tax engine. Locked to 0 when Tax Mode is No Tax.',
      30),

    ('net_amount',              'summary_only', 'derived_locked',
      NULL, NULL,
      NULL, 'lines.sum(line_amount)', NULL,
      'subtotal', 'money_big', 1, 'compact', 'amount_basis',
      'Pre-tax net amount. Inclusive: Total ÷ (1+rate); Exclusive: Total.',
      35),

    -- ── settlement_terms ──────────────────────────────────────────────────────
    ('payment_term_id',         'editable',     'derived_overrideable',
      NULL, NULL,
      NULL, 'supplier.default_payment_term(supplier_id, company_code_id)', 'ap.override_payment_term',
      NULL, 'inline_search', 1, 'standard', 'settlement_terms', NULL, 110),

    ('baseline_date',           'editable',     'derived_overrideable',
      NULL, NULL,
      'field.received_date',
      'payment_term.baseline_event(payment_term_id, received_date, posting_date)',
      'ap.override_baseline_date',
      NULL, NULL, 1, 'standard', 'settlement_terms', NULL, 120),

    ('due_date',                'editable',     'derived_overrideable',
      NULL, NULL,
      NULL, 'payment_term.compute_due_date(payment_term_id, baseline_date)', 'ap.override_due_date',
      NULL, NULL, 1, 'standard', 'settlement_terms', NULL, 130),

    -- ── adjustments (collapse_default=true in entity_flow_section) ────────────
    ('discount_amount',         'editable',     'manual',
      NULL, NULL,
      'const:0', NULL, NULL,
      'deduction', NULL, 1, 'standard', 'adjustments', NULL, 210),

    ('freight_amount',          'editable',     'manual',
      NULL, NULL,
      'const:0', NULL, NULL,
      'addition', NULL, 1, 'standard', 'adjustments',
      'Freight and delivery charges added by supplier.', 220),

    ('misc_charges_amount',     'editable',     'manual',
      NULL, NULL,
      'const:0', NULL, NULL,
      'addition', NULL, 1, 'standard', 'adjustments',
      'Miscellaneous additional charges.', 230),

    ('withholding_tax_amount',  'editable',     'derived_overrideable',
      NULL, NULL,
      'const:0',
      'wht.compute(lines, supplier_id)', 'ap.override_wht_amount',
      'deduction', NULL, 1, 'standard', 'adjustments', NULL, 240),

    ('advance_deduction_amount','editable',     'derived_overrideable',
      '{"and":[{"in":[{"var":"invoice_source"},["po_based","contract_based"]]},{"in":[{"var":"invoice_type"},["standard","final"]]}]}',
      NULL,
      'const:0',
      'payment_term_clause.advance_recovery(commitment_id, total_amount)',
      'ap.override_advance_deduction',
      'deduction', NULL, 1, 'standard', 'adjustments',
      'Visible for PO/contract-based Standard or Final invoices where prior advances were paid.', 250),

    ('retention_amount',        'editable',     'derived_overrideable',
      '{"!=":[{"var":"invoice_type"},"retention_release"]}',
      NULL,
      'const:0',
      'payment_term_clause.retention(commitment_id, total_amount)',
      'ap.override_retention',
      'deduction', NULL, 1, 'standard', 'adjustments', NULL, 260),

    -- ── fx (visible_when set on section; auto-expands on currency mismatch) ────
    ('base_currency_code',      'readonly',     'derived_locked',
      NULL, NULL,
      NULL, 'company_code.functional_currency(company_code_id)', NULL,
      NULL, 'chip', 1, 'standard', 'fx', NULL, 310),

    ('exchange_rate',           'editable',     'derived_overrideable',
      NULL, NULL,
      NULL, 'fx.resolve(currency_code, base_currency_code, posting_date)', 'ap.override_fx_rate',
      NULL, NULL, 1, 'standard', 'fx',
      'Exchange rate at posting date. Auto-populated from FX rate table.', 320),

    -- ── summary-only (sticky summary panel; no section) ────────────────────────
    ('payable_amount',          'summary_only', 'derived_locked',
      NULL, NULL,
      NULL, 'total_amount - withholding_tax_amount', NULL,
      'total', 'money_big', 1, 'prominent', NULL,
      'Generated column — total minus withholding tax. Shown in summary panel, never editable.',
      400)
  ) AS v(field_name, mode, derivation_mode, visible_when, required_when,
         default_source, derive_expression, override_permission,
         summary_role, ui_variant, span, display_size, section_key,
         help_text, sort_order)
     ON ef.name = v.field_name AND ef.entity_version_id = v_ev_id;

  -- ── 7. Step 3: Review (12 field bindings) ─────────────────────────────────
  -- payment_method_id relocated here from Step 2.
  INSERT INTO control.entity_flow_field (
    tenant_id, flow_step_id, entity_field_id,
    mode, derivation_mode, visible_when, required_when,
    default_source, derive_expression, override_permission,
    summary_role, ui_variant, span, help_text, sort_order, created_by)
  SELECT NULL, v_step_3, ef.id,
         v.mode, v.derivation_mode,
         v.visible_when::jsonb, v.required_when::jsonb,
         v.default_source, v.derive_expression, v.override_permission,
         v.summary_role, v.ui_variant, v.span, v.help_text, v.sort_order, v_su
  FROM control.entity_field ef
  JOIN (VALUES
    ('budget_check_result',  'readonly',  'derived_locked',
      NULL::text, NULL::text, NULL,
      'budget.precheck(commitment_id, total_amount, cost_center_id)', NULL,
      NULL, 'chip', 1,
      'Evaluated at submit. WARN or BLOCK when budget is exceeded.', 10),
    ('match_status',         'readonly',  'derived_locked',
      NULL, NULL, NULL, 'matching.status(lines)', NULL,
      NULL, 'chip', 1,
      'Evaluated after line validation. Pending until lines are confirmed.', 20),
    ('fiscal_year',          'readonly',  'derived_locked',
      NULL, NULL, NULL, 'fiscal.year_from(posting_date, company_code_id)', NULL,
      NULL, 'chip', 1, NULL, 30),
    ('period_number',        'readonly',  'derived_locked',
      NULL, NULL, NULL, 'fiscal.period_from(posting_date, company_code_id)', NULL,
      NULL, 'chip', 1, NULL, 40),
    ('payment_method_id',    'editable',  'derived_overrideable',
      NULL, NULL, NULL,
      'supplier.default_payment_method(supplier_id)', 'ap.override_payment_method',
      NULL, 'inline_search', 1, NULL, 80),
    ('hold_reason',          'editable',  'manual',
      '{"==":[{"var":"status"},"on_hold"]}',
      '{"==":[{"var":"status"},"on_hold"]}',
      NULL, NULL, NULL, NULL, NULL, 3,
      'Required when the invoice is placed on hold.', 110),
    ('notes',                'editable',  'manual',
      NULL, NULL, NULL, NULL, NULL, NULL, NULL, 3, NULL, 120),
    ('tags',                 'editable',  'manual',
      NULL, NULL, NULL, NULL, NULL, NULL, NULL, 3, NULL, 130),
    ('cost_center_id',       'editable',  'derived_overrideable',
      NULL, NULL, NULL,
      'ctx.user.default_cost_center', 'ap.override_cost_center',
      NULL, 'inline_search', 1,
      'Applied as default to all lines unless overridden per line.', 200),
    ('profit_center_id',     'editable',  'derived_overrideable',
      NULL, NULL, NULL,
      'cost_center.default_profit_center(cost_center_id)', 'ap.override_profit_center',
      NULL, 'inline_search', 1, NULL, 210),
    ('project_id',           'editable',  'manual',
      NULL, NULL, NULL, NULL, NULL, NULL, 'inline_search', 1, NULL, 220),
    ('site_id',              'editable',  'manual',
      NULL, NULL, NULL, NULL, NULL, NULL, 'inline_search', 1, NULL, 230)
  ) AS v(field_name, mode, derivation_mode, visible_when, required_when,
         default_source, derive_expression, override_permission,
         summary_role, ui_variant, span, help_text, sort_order)
     ON ef.name = v.field_name AND ef.entity_version_id = v_ev_id;

  RAISE NOTICE 'purchase_invoice create flow v2 seeded (r2 — hash bump to re-seed supplier_invoice_number binding): steps=%, bindings=%',
    (SELECT count(*) FROM control.entity_flow_step WHERE flow_id = v_flow_id),
    (SELECT count(*) FROM control.entity_flow_field
      WHERE flow_step_id IN (v_step_1, v_step_2, v_step_3) AND tenant_id IS NULL);
END $$;


-- === SOURCE: 017_purchase_invoice_proforma.sql ===
-- =============================================================================
-- platform/005_domain_registrations/200_document/017_purchase_invoice_proforma.sql
-- Adds the proforma lifecycle state and its transitions to purchase_invoice.
-- §P1: proforma lifecycle state (sort_order=5, pre-draft, posting suppressed)
-- §P2: proforma → draft transition (op=promote_proforma)
-- §P3: proforma → cancelled transition (op=cancel)
-- Idempotent: ON CONFLICT DO NOTHING throughout.
-- Depends on: 002_invoice_lifecycle.sql (lifecycle + states must exist)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- §G0  Defensive: drop any unexpected triggers on control.lifecycle_transition
--      (guards against rogue triggers from prior migration attempts that
--       reference non-existent columns such as permission_code)
-- ---------------------------------------------------------------------------
DO $guard$ DECLARE t text; BEGIN
  FOR t IN
    SELECT tgname FROM pg_trigger
     WHERE tgrelid = 'control.lifecycle_transition'::regclass
       AND NOT tgisinternal
       AND tgname NOT IN ('trg_lt_updated_at', 'trg_lt_cross_lifecycle_guard')
  LOOP
    EXECUTE 'DROP TRIGGER IF EXISTS ' || quote_ident(t) || ' ON control.lifecycle_transition';
    RAISE NOTICE '017_purchase_invoice_proforma §G0: dropped unexpected trigger % from lifecycle_transition', t;
  END LOOP;
END $guard$;


-- === SOURCE: 018_create_proforma_flow.sql ===
-- =============================================================================
-- platform/005_domain_registrations/200_document/018_create_proforma_flow.sql
-- Optional 2-step intake flow for proforma (preview/indicative) invoices.
-- flow_code='create_proforma', trigger_context='new', is_default=false
-- Step 1: Identify (source, supplier — no posting_date/received_date)
-- Step 2: Commercial Indicative (amounts, tax mode — indicative derivation variants)
-- Dedup disabled. Budget precheck advisory. Creates with status='proforma'.
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT, DELETE+INSERT for field bindings.
-- Depends on: 001_invoice.sql, 015_ap_override_permissions.sql,
--             020_ap_flow_permissions.sql, 016_purchase_invoice_flow.sql
-- =============================================================================

DO $$
DECLARE
  v_su      constant uuid := '00000000-0000-0000-0000-000000000000';
  v_ev_id   uuid;
  v_flow_id uuid;
  v_step_1  uuid;
  v_step_2  uuid;
BEGIN
  SELECT ev.id INTO v_ev_id
    FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
   WHERE e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
     AND e.tenant_id IS NULL AND ev.version_no = 1;

  IF v_ev_id IS NULL THEN
    RAISE NOTICE '018_create_proforma_flow: purchase_invoice v1 not found — skipped';
    RETURN;
  END IF;

  -- ── Flow header ────────────────────────────────────────────────────────────
  INSERT INTO control.entity_flow (
    tenant_id, entity_version_id, flow_code, label, description, icon_key,
    trigger_context, is_default, config, version_no, status, effective_from, created_by)
  SELECT
    NULL, v_ev_id, 'create_proforma',
    'Create Proforma Invoice',
    '2-step intake for proforma (preview/indicative) invoices. '
    'Dedup disabled; budget precheck advisory; indicative totals. Promotes to draft via promote_proforma.',
    'file-dashed',
    'new', false,
    jsonb_build_object(
      'creates_with_status', 'proforma',
      'summary', jsonb_build_object(
        'fields', jsonb_build_array('total_amount','tax_amount','payable_amount'),
        'indicative_disclaimer', true),
      'input_modes', jsonb_build_array('form','scan','from_commitment'),
      'dedup', jsonb_build_object('enabled', false),
      'assist', jsonb_build_object(
        'budget_precheck', 'advisory', 'ocr_prefill', true,
        'supplier_enrichment', true, 'po_prefill', true),
      'layout', 'wizard_with_summary'),
    1, 'active', now(), v_su
  WHERE NOT EXISTS (
    SELECT 1 FROM control.entity_flow
     WHERE entity_version_id = v_ev_id
       AND flow_code = 'create_proforma' AND tenant_id IS NULL AND version_no = 1);

  SELECT id INTO v_flow_id FROM control.entity_flow
   WHERE entity_version_id = v_ev_id
     AND flow_code = 'create_proforma' AND tenant_id IS NULL AND version_no = 1;

  -- ── Steps ──────────────────────────────────────────────────────────────────
  INSERT INTO control.entity_flow_step
    (tenant_id, flow_id, step_key, label, icon_key, sort_order, advance_rule, layout_hint, created_by)
  VALUES
  (NULL, v_flow_id, 'identify',
   'Identify', 'id-card', 10,
   '{"required_fields":["company_code_id","invoice_source","supplier_id"]}'::jsonb,
   'summary_side', v_su),
  (NULL, v_flow_id, 'commercial_indicative',
   'Commercial (Indicative)', 'receipt', 20,
   '{"required_fields":[]}'::jsonb,
   'summary_side', v_su)
  ON CONFLICT (flow_id, step_key) DO NOTHING;

  -- Always update advance_rules
  UPDATE control.entity_flow_step
     SET advance_rule = '{"required_fields":["company_code_id","invoice_source","supplier_id"]}'::jsonb
   WHERE flow_id = v_flow_id AND step_key = 'identify';
  UPDATE control.entity_flow_step
     SET advance_rule = '{"required_fields":[]}'::jsonb
   WHERE flow_id = v_flow_id AND step_key = 'commercial_indicative';

  SELECT id INTO v_step_1 FROM control.entity_flow_step WHERE flow_id = v_flow_id AND step_key = 'identify';
  SELECT id INTO v_step_2 FROM control.entity_flow_step WHERE flow_id = v_flow_id AND step_key = 'commercial_indicative';

  DELETE FROM control.entity_flow_field
   WHERE flow_step_id IN (v_step_1, v_step_2) AND tenant_id IS NULL;

  -- ── Step 1: Identify (proforma-specific differences) ──────────────────────
  -- Differences from standard create flow Step 1:
  --   invoice_type: hidden (always standard; promotion may reclassify)
  --   supplier_invoice_number: editable, not required (placeholder acceptable)
  --   supplier_invoice_date: editable, not required (can be added at promotion)
  --   commitment_id: editable for po/contract sources, not required
  --   posting_date: hidden (no GL posting during proforma)
  --   received_date: hidden (nothing received until promotion)
  --   match_type, fiscal_year, period_number chips: hidden (posting-time concepts)
  INSERT INTO control.entity_flow_field (
    tenant_id, flow_step_id, entity_field_id,
    mode, derivation_mode, visible_when, required_when,
    default_source, derive_expression, override_permission,
    summary_role, ui_variant, span, help_text, sort_order, created_by)
  SELECT NULL, v_step_1, ef.id,
         v.mode, v.derivation_mode,
         v.visible_when::jsonb, v.required_when::jsonb,
         v.default_source, v.derive_expression, v.override_permission,
         v.summary_role, v.ui_variant, v.span, v.help_text, v.sort_order, v_su
  FROM control.entity_field ef
  JOIN (VALUES
    ('company_code_id',        'required', 'derived_overrideable',
      NULL::text, NULL::text, NULL, 'ctx.user.default_company_code',
      'ap.override_company_code', NULL, 'inline_search', 1,
      'Company that will post this invoice when promoted.', 20),
    ('invoice_type',           'hidden',   'derived_locked',
      NULL, NULL, NULL, 'const:standard', NULL, NULL, NULL, 1,
      'Always standard for proforma; reclassify at promotion if needed.', 15),
    ('invoice_source',         'required', 'manual',
      NULL, NULL, 'lookup.document.purchase_invoice_source.po_based', NULL, NULL,
      NULL, 'segmented', 2, NULL, 30),
    ('supplier_id',            'required', 'manual',
      NULL, NULL, NULL, NULL, NULL, NULL, 'inline_search', 1, NULL, 10),
    ('commitment_id',          'editable', 'manual',
      '{"in":[{"var":"invoice_source"},["po_based","contract_based"]]}',
      NULL,
      NULL, NULL, NULL, NULL, 'inline_search', 2,
      'Optional for proforma — link to PO/contract for prefill purposes.', 50),
    ('supplier_invoice_number','editable', 'manual',
      NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1,
      'Preliminary reference (e.g., "TBD"). Real number required at promotion.', 60),
    ('supplier_invoice_date',  'editable', 'manual',
      NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1,
      'Estimated invoice date. Real date required at promotion.', 70),
    ('description',            'editable', 'manual',
      NULL, NULL, NULL, NULL, NULL, NULL, NULL, 3, NULL, 100),
    ('currency_code',          'chip',     'derived_overrideable',
      NULL, NULL, NULL,
      'supplier.default_currency(supplier_id)', 'ap.override_currency',
      'meta', 'chip', 1, NULL, 200),
    ('payment_term_id',        'chip',     'derived_overrideable',
      NULL, NULL, NULL,
      'supplier.default_payment_term(supplier_id, company_code_id)', 'ap.override_payment_term',
      'meta', 'chip', 1, NULL, 220)
    -- posting_date, received_date, match_type, fiscal_year, period_number: hidden — omitted
  ) AS v(field_name, mode, derivation_mode, visible_when, required_when,
         default_source, derive_expression, override_permission,
         summary_role, ui_variant, span, help_text, sort_order)
     ON ef.name = v.field_name AND ef.entity_version_id = v_ev_id;

  -- ── Step 2: Commercial Indicative ─────────────────────────────────────────
  -- Uses _indicative derivation variants that don't write FX snapshots.
  -- No advance_deduction or retention — posting-time concepts.
  -- No payment_method_id — relevant only once status=draft.
  INSERT INTO control.entity_flow_field (
    tenant_id, flow_step_id, entity_field_id,
    mode, derivation_mode, visible_when, required_when,
    default_source, derive_expression, override_permission,
    summary_role, ui_variant, span, display_size,
    help_text, sort_order, created_by)
  SELECT NULL, v_step_2, ef.id,
         v.mode, v.derivation_mode,
         v.visible_when::jsonb, v.required_when::jsonb,
         v.default_source, v.derive_expression, v.override_permission,
         v.summary_role, v.ui_variant, v.span, v.display_size,
         v.help_text, v.sort_order, v_su
  FROM control.entity_field ef
  JOIN (VALUES
    ('currency_code',       'chip',         'derived_overrideable',
      NULL::text, NULL::text,
      NULL, 'supplier.default_currency(supplier_id)', 'ap.override_currency',
      NULL, 'chip', 1, 'standard', NULL, 5),
    ('total_amount',        'required',     'derived_overrideable',
      NULL, NULL,
      NULL, 'line_summary.total_from_commitment_indicative(commitment_id)', 'ap.override_total',
      'total', 'money_big', 2, 'prominent',
      'Indicative Invoice Total — enter the expected amount. Not posted until promotion.', 10),
    ('tax_mode',            'required',     'derived_overrideable',
      NULL, NULL,
      NULL, 'tax.infer_mode_indicative(supplier_id, tax_group_id, company_code_id)', 'ap.override_tax_mode',
      'meta', 'radio_cards', 2, 'standard',
      'Indicative tax interpretation. Confirmed at promotion.', 20),
    ('tax_amount',          'editable',     'derived_overrideable',
      NULL, NULL,
      'const:0', 'tax.compute(total_amount, tax_mode, tax_group_id, lines)', 'ap.override_tax_amount',
      'addition', 'money_big', 1, 'standard',
      'Indicative tax amount. Locked to 0 when No Tax.', 30),
    ('net_amount',          'summary_only', 'derived_locked',
      NULL, NULL,
      NULL, 'compute.net_from_total_and_tax(total_amount, tax_mode, tax_amount)', NULL,
      'subtotal', 'money_big', 1, 'compact', NULL, 35),
    ('payable_amount',      'summary_only', 'derived_locked',
      NULL, NULL,
      NULL, 'total_amount - withholding_tax_amount', NULL,
      'total', 'money_big', 1, 'prominent',
      'Indicative payable. Shown in summary panel; locked at promotion.', 400),
    ('base_currency_code',  'readonly',     'derived_locked',
      NULL, NULL,
      NULL, 'company_code.functional_currency(company_code_id)', NULL,
      NULL, 'chip', 1, 'standard', NULL, 310),
    ('exchange_rate',       'editable',     'derived_overrideable',
      '{"!=":[{"var":"currency_code"},{"var":"base_currency_code"}]}',
      NULL,
      NULL, 'fx.resolve_indicative(currency_code, base_currency_code)', 'ap.override_fx_rate',
      NULL, NULL, 1, 'standard',
      'Indicative rate. Final rate locked at posting date on promotion.', 320)
  ) AS v(field_name, mode, derivation_mode, visible_when, required_when,
         default_source, derive_expression, override_permission,
         summary_role, ui_variant, span, display_size, help_text, sort_order)
     ON ef.name = v.field_name AND ef.entity_version_id = v_ev_id;

  RAISE NOTICE '018_create_proforma_flow: % field bindings seeded',
    (SELECT count(*) FROM control.entity_flow_field
      WHERE flow_step_id IN (v_step_1, v_step_2) AND tenant_id IS NULL);
END $$;


-- === SOURCE: 019_promote_proforma_operation.sql ===
-- =============================================================================
-- platform/005_domain_registrations/200_document/019_promote_proforma_operation.sql
-- §O1: entity_operation binding for promote_proforma (DETAIL view, PRIMARY button)
-- §O2: promote_proforma modal flow — 1-step form to bind real invoice identity.
-- The server handler runs: dedup probe → FX lock → fiscal period → state transition.
-- Idempotent: WHERE NOT EXISTS for operation and flow; DELETE+INSERT for field bindings.
-- Depends on: 001_invoice.sql, 020_ap_flow_permissions.sql
-- =============================================================================

DO $$
DECLARE
  v_su      constant uuid := '00000000-0000-0000-0000-000000000000';
  v_ev_id   uuid;
  v_flow_id uuid;
  v_step_1  uuid;
BEGIN
  SELECT ev.id INTO v_ev_id
    FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
   WHERE e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
     AND e.tenant_id IS NULL AND ev.version_no = 1;

  IF v_ev_id IS NULL THEN
    RAISE NOTICE '019_promote_proforma_operation: purchase_invoice v1 not found — skipped';
    RETURN;
  END IF;

  -- §O1 — entity_operation: promote_proforma
  -- entity_operation inserts moved to 060_entity_operations/002_ops_finance_org.sql

  -- §O2 — promote_proforma modal flow (1 step)
  INSERT INTO control.entity_flow (
    tenant_id, entity_version_id, flow_code, label, description, icon_key,
    trigger_context, is_default, config, version_no, status, effective_from, created_by)
  SELECT
    NULL, v_ev_id, 'promote_proforma',
    'Promote Proforma Invoice',
    'Single-step modal to bind real invoice identity and transition from proforma to draft. '
    'Server handler: (1) validate from_state=proforma, (2) dedup probe, (3) update deferred fields, '
    '(4) lock FX + fiscal period, (5) advance lifecycle state to draft.',
    'file-check',
    'edit', false,
    jsonb_build_object(
      'layout', 'modal',
      'creates_with_status', 'draft',
      'dedup', jsonb_build_object(
        'enabled', true,
        'index',   'pi_supplier_invoice_dedup_idx'),
      'from_state_guard', 'proforma'),
    1, 'active', now(), v_su
  WHERE NOT EXISTS (
    SELECT 1 FROM control.entity_flow
     WHERE entity_version_id = v_ev_id
       AND flow_code = 'promote_proforma' AND tenant_id IS NULL AND version_no = 1);

  SELECT id INTO v_flow_id FROM control.entity_flow
   WHERE entity_version_id = v_ev_id
     AND flow_code = 'promote_proforma' AND tenant_id IS NULL AND version_no = 1;

  -- Step: bind_real_invoice
  INSERT INTO control.entity_flow_step
    (tenant_id, flow_id, step_key, label, icon_key, sort_order,
     advance_rule, layout_hint, created_by)
  VALUES
  (NULL, v_flow_id, 'bind_real_invoice',
   'Invoice Details', 'file-text', 10,
   '{"required_fields":["supplier_invoice_number","supplier_invoice_date","posting_date","received_date"]}'::jsonb,
   'single_column', v_su)
  ON CONFLICT (flow_id, step_key) DO NOTHING;

  UPDATE control.entity_flow_step
     SET advance_rule =
       '{"required_fields":["supplier_invoice_number","supplier_invoice_date","posting_date","received_date"]}'::jsonb
   WHERE flow_id = v_flow_id AND step_key = 'bind_real_invoice';

  SELECT id INTO v_step_1 FROM control.entity_flow_step
   WHERE flow_id = v_flow_id AND step_key = 'bind_real_invoice';

  DELETE FROM control.entity_flow_field
   WHERE flow_step_id = v_step_1 AND tenant_id IS NULL;

  -- Field bindings: the 4 required fields + conditional commitment_id
  -- posting_date and received_date drive FX lock and fiscal period determination.
  INSERT INTO control.entity_flow_field (
    tenant_id, flow_step_id, entity_field_id,
    mode, derivation_mode, visible_when, required_when,
    default_source, derive_expression, override_permission,
    summary_role, ui_variant, span, help_text, sort_order, created_by)
  SELECT NULL, v_step_1, ef.id,
         v.mode, v.derivation_mode,
         v.visible_when::jsonb, v.required_when::jsonb,
         v.default_source, v.derive_expression, v.override_permission,
         v.summary_role, v.ui_variant, v.span, v.help_text, v.sort_order, v_su
  FROM control.entity_field ef
  JOIN (VALUES
    ('supplier_invoice_number','required', 'manual',
      NULL::text, NULL::text, NULL, NULL, NULL,
      NULL, NULL, 2,
      'Real invoice number from the supplier''s document. Triggers duplicate detection.', 10),
    ('supplier_invoice_date', 'required',  'manual',
      NULL, NULL, NULL, NULL, NULL,
      NULL, NULL, 1,
      'Real date on the supplier''s invoice.', 20),
    ('commitment_id',         'editable',  'manual',
      '{"in":[{"var":"invoice_source"},["po_based","contract_based"]]}',
      '{"in":[{"var":"invoice_source"},["po_based","contract_based"]]}',
      NULL, NULL, NULL,
      NULL, 'inline_search', 2,
      'Required for PO-based and contract-based invoices.', 30),
    ('posting_date',          'required',  'derived_overrideable',
      NULL, NULL, NULL, 'today()', 'ap.override_posting_date',
      NULL, NULL, 1,
      'GL posting date — drives fiscal year, period, and FX rate. Defaults to today.', 40),
    ('received_date',         'required',  'manual',
      NULL, NULL, 'today()', NULL, NULL,
      NULL, NULL, 1,
      'Date goods or services were received. Defaults to today.', 50)
  ) AS v(field_name, mode, derivation_mode, visible_when, required_when,
         default_source, derive_expression, override_permission,
         summary_role, ui_variant, span, help_text, sort_order)
     ON ef.name = v.field_name AND ef.entity_version_id = v_ev_id;

  RAISE NOTICE '019_promote_proforma_operation: operation and modal flow seeded, % field bindings',
    (SELECT count(*) FROM control.entity_flow_field WHERE flow_step_id = v_step_1 AND tenant_id IS NULL);
END $$;


-- === SOURCE: 022_submit_for_approval_flow.sql ===
-- =============================================================================
-- platform/005_domain_registrations/200_document/022_submit_for_approval_flow.sql
-- Submit-for-Approval flow bundle + self-approval workflow template.
--
-- Provides:
--   1. entity_flow 'submit_for_approval' for purchase_invoice — one-step modal
--      that captures the submitter's notes before submitting for approval.
--   2. workflow_template 'inv_self_approval' — single stage where the submitter
--      is both requester and approver. handler detects allow_self_approval=true
--      + sole approver === requester and auto-transitions to 'approved'.
--   3. Updates control.workflow_definition rules so that the self-approval
--      template becomes the catch-all for purchase_invoice (replacing the
--      inv_std_approval fallback that requires supervisor resolution).
--
-- Depends on: 001_invoice.sql (entity_version), 016_purchase_invoice_flow.sql
--             (entity_field bindings already present), 003_invoice_workflow.sql
--             (workflow_definition seeded with nil-UUID placeholder tenant_id).
-- Idempotent: WHERE NOT EXISTS for flow+step, ON CONFLICT DO NOTHING for template,
--             UPDATE for workflow_definition catch-all rule.
-- =============================================================================

DO $$
DECLARE
  v_su       constant uuid := '00000000-0000-0000-0000-000000000000';
  v_ev_id    uuid;
  v_flow_id  uuid;
  v_step_id  uuid;
  v_tpl_id   uuid;
BEGIN

  -- ── Resolve entity version ──────────────────────────────────────────────────
  SELECT ev.id INTO v_ev_id
    FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
   WHERE e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
     AND e.tenant_id IS NULL AND ev.version_no = 1;

  IF v_ev_id IS NULL THEN
    RAISE NOTICE 'purchase_invoice v1 not found — submit_for_approval flow seed skipped';
    RETURN;
  END IF;

  -- ── 1. Flow header ──────────────────────────────────────────────────────────
  -- trigger_context: 'approve' is the closest semantic match for an action-triggered
  -- flow. The entity-flow route skips this filter when flow_code is explicit
  -- (fixed in entity-flow.route.ts), so the value is not used at query time.
  INSERT INTO control.entity_flow (
    tenant_id, entity_version_id, flow_code, label, description, icon_key,
    trigger_context, is_default, config, version_no, status, effective_from, created_by)
  SELECT
    NULL, v_ev_id, 'submit_for_approval',
    'Submit for Approval',
    'Capture submission notes and route purchase invoice into the approval workflow.',
    'send',
    'approve', false,
    jsonb_build_object('layout', 'single_step'),
    1, 'active', now(), v_su
  WHERE NOT EXISTS (
    SELECT 1 FROM control.entity_flow
     WHERE entity_version_id = v_ev_id
       AND flow_code = 'submit_for_approval' AND tenant_id IS NULL);

  SELECT id INTO v_flow_id FROM control.entity_flow
   WHERE entity_version_id = v_ev_id
     AND flow_code = 'submit_for_approval' AND tenant_id IS NULL;

  -- ── 2. Single step ──────────────────────────────────────────────────────────
  INSERT INTO control.entity_flow_step
    (tenant_id, flow_id, step_key, label, icon_key, sort_order, advance_rule, layout_hint, created_by)
  VALUES
    (NULL, v_flow_id, 'submit', 'Submit for Approval', 'send', 10,
     '{"required_fields":[]}'::jsonb,
     'two_column', v_su)
  ON CONFLICT (flow_id, step_key) DO NOTHING;

  SELECT id INTO v_step_id FROM control.entity_flow_step
   WHERE flow_id = v_flow_id AND step_key = 'submit';

  -- ── 3. Field bindings — notes only (maps to body.notes in the handler) ──────
  -- Wipe and reseed platform-level bindings so re-runs pick up changes.
  DELETE FROM control.entity_flow_field
   WHERE flow_step_id = v_step_id AND tenant_id IS NULL;

  INSERT INTO control.entity_flow_field (
    tenant_id, flow_step_id, entity_field_id,
    mode, derivation_mode, visible_when, required_when,
    default_source, derive_expression, override_permission,
    summary_role, ui_variant, span, help_text, sort_order, created_by)
  SELECT NULL, v_step_id, ef.id,
         v.mode, v.dm,
         v.vw::jsonb, v.rw::jsonb,
         v.ds, v.dx, v.op,
         v.sr, v.uv, v.sp, v.ht, v.so, v_su
  FROM control.entity_field ef
  JOIN (VALUES
    ('notes', 'editable', 'manual',
     NULL::text, NULL::text,
     NULL, NULL, NULL,
     NULL, NULL, 3,
     'Optional — describe the purpose of this invoice or any context for the approver.',
     10)
  ) AS v(fn, mode, dm, vw, rw, ds, dx, op, sr, uv, sp, ht, so)
     ON ef.name = v.fn AND ef.entity_version_id = v_ev_id;

  RAISE NOTICE 'submit_for_approval flow seeded: flow_id=%, step_id=%', v_flow_id, v_step_id;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- §2  Self-Approval Workflow Template (platform-global, tenant_id IS NULL)
  -- ═══════════════════════════════════════════════════════════════════════════
  -- allow_self_approval=true: handler detects that the sole stage-1 approver
  -- is the requester and auto-transitions the invoice directly to 'approved'.

  INSERT INTO control.workflow_template
    (tenant_id, code, name, description, version_no, is_active, behaviors, created_by)
  VALUES
    (NULL, 'inv_self_approval',
     'Invoice — Self Approval',
     'Single-stage self-approval: the submitter is the sole approver. Handler auto-approves immediately.',
     1, true,
     '{"allow_self_approval":true,"require_all_stages":true,"allow_reassignment":false,"capture_entity_snapshot":true,"require_reason_on_reject":false,"notify_requester":false}'::jsonb,
     v_su)
  ON CONFLICT (tenant_id, code) DO NOTHING;

  SELECT id INTO v_tpl_id FROM control.workflow_template
   WHERE code = 'inv_self_approval' AND tenant_id IS NULL;

  -- Stage 1: single serial stage
  INSERT INTO control.workflow_template_stage
    (workflow_template_id, stage_no, name, mode, quorum, created_by)
  VALUES
    (v_tpl_id, 1, 'Self Approval', 'serial',
     '{"strategy":"unanimous"}'::jsonb, v_su)
  ON CONFLICT (workflow_template_id, stage_no) DO NOTHING;

  -- Rule: assign to the requester (the person who submitted)
  INSERT INTO control.workflow_template_rule
    (workflow_template_id, stage_no, priority, conditions, assign_to, created_by)
  VALUES
    (v_tpl_id, 1, 10, NULL,
     '{"type":"requester"}'::jsonb, v_su)
  ON CONFLICT (workflow_template_id, stage_no, priority) DO NOTHING;

  RAISE NOTICE 'inv_self_approval workflow template seeded: tpl_id=%', v_tpl_id;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- §3  Update workflow_definition catch-all to use inv_self_approval
  -- ═══════════════════════════════════════════════════════════════════════════
  -- Replace the inv_std_approval fallback rule (which requires supervisor
  -- resolution — unavailable in demo) with inv_self_approval as the catch-all.
  -- High-value routing (inv_hv_approval for net_amount >= 50000) is preserved.

  UPDATE control.workflow_definition
     SET rules = '[
       {"condition":{"field":"net_amount","operator":"gte","value":50000},"template_code":"inv_hv_approval","workflow_type":"approval","priority":10},
       {"condition":null,"template_code":"inv_self_approval","workflow_type":"approval","priority":20}
     ]'::jsonb
   WHERE code        = 'purchase_invoice_approval'
     AND entity_type = 'purchase_invoice'
     AND tenant_id   = '00000000-0000-0000-0000-000000000000'::uuid;

  IF NOT FOUND THEN
    -- Definition was never seeded — insert it now for the nil-UUID platform default
    INSERT INTO control.workflow_definition
      (tenant_id, code, name, entity_type, rules, effective_from, is_active, created_by)
    VALUES
      ('00000000-0000-0000-0000-000000000000'::uuid,
       'purchase_invoice_approval',
       'Purchase Invoice Approval',
       'purchase_invoice',
       '[
         {"condition":{"field":"net_amount","operator":"gte","value":50000},"template_code":"inv_hv_approval","workflow_type":"approval","priority":10},
         {"condition":null,"template_code":"inv_self_approval","workflow_type":"approval","priority":20}
       ]'::jsonb,
       now(), true, v_su)
    ON CONFLICT (tenant_id, code) DO NOTHING;
  END IF;

  RAISE NOTICE 'workflow_definition purchase_invoice_approval updated: catch-all → inv_self_approval';

END $$;


-- === SOURCE: 024_post_invoice_flow.sql ===
-- =============================================================================
-- platform/005_domain_registrations/200_document/024_post_invoice_flow.sql
-- Post-Invoice confirmation flow for purchase_invoice.
--
-- Provides:
--   entity_flow 'post_invoice' for purchase_invoice — single-step modal that
--   lets the user confirm (and optionally override) the posting date before
--   the GL posting action is dispatched.
--
-- trigger_context='approve' is used as the closest available value in the
-- CHECK constraint; the entity-flow route ignores trigger_context when a
-- flow_code is supplied explicitly in the query string.
--
-- Depends on: 001_invoice.sql (entity_version),
--             016_purchase_invoice_flow.sql (entity_field seeds present)
-- Idempotent: WHERE NOT EXISTS for flow, ON CONFLICT DO NOTHING for step,
--             DELETE+INSERT for field bindings.
-- =============================================================================

DO $$
DECLARE
  v_su       constant uuid := '00000000-0000-0000-0000-000000000000';
  v_ev_id    uuid;
  v_flow_id  uuid;
  v_step_id  uuid;
BEGIN

  -- ── Resolve entity version ──────────────────────────────────────────────────
  SELECT ev.id INTO v_ev_id
    FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
   WHERE e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
     AND e.tenant_id IS NULL AND ev.version_no = 1;

  IF v_ev_id IS NULL THEN
    RAISE NOTICE 'purchase_invoice v1 not found — post_invoice flow seed skipped';
    RETURN;
  END IF;

  -- ── 1. Flow header ──────────────────────────────────────────────────────────
  INSERT INTO control.entity_flow (
    tenant_id, entity_version_id, flow_code, label, description, icon_key,
    trigger_context, is_default, config, version_no, status, effective_from, created_by)
  SELECT
    NULL, v_ev_id, 'post_invoice',
    'Post Invoice',
    'Confirm GL posting of this purchase invoice. Optionally override the posting date before dispatching.',
    'check-circle',
    'approve', false,
    jsonb_build_object('layout', 'single_step'),
    1, 'active', now(), v_su
  WHERE NOT EXISTS (
    SELECT 1 FROM control.entity_flow
     WHERE entity_version_id = v_ev_id
       AND flow_code = 'post_invoice' AND tenant_id IS NULL);

  SELECT id INTO v_flow_id FROM control.entity_flow
   WHERE entity_version_id = v_ev_id
     AND flow_code = 'post_invoice' AND tenant_id IS NULL;

  -- ── 2. Single confirmation step ─────────────────────────────────────────────
  INSERT INTO control.entity_flow_step
    (tenant_id, flow_id, step_key, label, icon_key, sort_order, advance_rule, layout_hint, created_by)
  VALUES
    (NULL, v_flow_id, 'confirm', 'Confirm Posting', 'check-circle', 10,
     '{"required_fields":["posting_date"]}'::jsonb,
     'two_column', v_su)
  ON CONFLICT (flow_id, step_key) DO NOTHING;

  SELECT id INTO v_step_id FROM control.entity_flow_step
   WHERE flow_id = v_flow_id AND step_key = 'confirm';

  -- ── 3. Field bindings ───────────────────────────────────────────────────────
  DELETE FROM control.entity_flow_field
   WHERE flow_step_id = v_step_id AND tenant_id IS NULL;

  INSERT INTO control.entity_flow_field (
    tenant_id, flow_step_id, entity_field_id,
    mode, derivation_mode, visible_when, required_when,
    default_source, derive_expression, override_permission,
    summary_role, ui_variant, span, help_text, sort_order, created_by)
  SELECT NULL, v_step_id, ef.id,
         v.mode, v.dm,
         v.vw::jsonb, v.rw::jsonb,
         v.ds, v.dx, v.op,
         v.sr, v.uv, v.sp, v.ht, v.so, v_su
  FROM control.entity_field ef
  JOIN (VALUES
    ('posting_date', 'editable', 'manual',
     NULL::text, NULL::text,
     NULL, NULL, NULL,
     NULL, NULL, 1,
     'Posting date for the GL entries. Defaults to the invoice date.',
     10),
    ('notes', 'editable', 'manual',
     NULL::text, NULL::text,
     NULL, NULL, NULL,
     NULL, NULL, 3,
     'Optional — remarks to attach to the posting journal.',
     20)
  ) AS v(fn, mode, dm, vw, rw, ds, dx, op, sr, uv, sp, ht, so)
     ON ef.name = v.fn AND ef.entity_version_id = v_ev_id;

  RAISE NOTICE 'post_invoice flow seeded: flow_id=%, step_id=%', v_flow_id, v_step_id;

END $$;


-- === SOURCE: 025_reverse_invoice_flow.sql ===
-- =============================================================================
-- platform/005_domain_registrations/200_document/025_reverse_invoice_flow.sql
-- Reverse-Invoice confirmation flow for purchase_invoice.
--
-- Provides:
--   entity_flow 'reverse_invoice' for purchase_invoice — single-step modal
--   that captures the reversal reason (notes) before the reversal action is
--   dispatched to the server.
--
-- trigger_context='approve' is used as the closest available value in the
-- CHECK constraint; the entity-flow route ignores trigger_context when a
-- flow_code is supplied explicitly in the query string.
--
-- Depends on: 001_invoice.sql (entity_version),
--             016_purchase_invoice_flow.sql (entity_field seeds present)
-- Idempotent: WHERE NOT EXISTS for flow, ON CONFLICT DO NOTHING for step,
--             DELETE+INSERT for field bindings.
-- =============================================================================

DO $$
DECLARE
  v_su       constant uuid := '00000000-0000-0000-0000-000000000000';
  v_ev_id    uuid;
  v_flow_id  uuid;
  v_step_id  uuid;
BEGIN

  -- ── Resolve entity version ──────────────────────────────────────────────────
  SELECT ev.id INTO v_ev_id
    FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
   WHERE e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
     AND e.tenant_id IS NULL AND ev.version_no = 1;

  IF v_ev_id IS NULL THEN
    RAISE NOTICE 'purchase_invoice v1 not found — reverse_invoice flow seed skipped';
    RETURN;
  END IF;

  -- ── 1. Flow header ──────────────────────────────────────────────────────────
  INSERT INTO control.entity_flow (
    tenant_id, entity_version_id, flow_code, label, description, icon_key,
    trigger_context, is_default, config, version_no, status, effective_from, created_by)
  SELECT
    NULL, v_ev_id, 'reverse_invoice',
    'Reverse Invoice',
    'Create a reversing journal entry for this posted invoice. A reason is required.',
    'rotate-ccw',
    'approve', false,
    jsonb_build_object('layout', 'single_step'),
    1, 'active', now(), v_su
  WHERE NOT EXISTS (
    SELECT 1 FROM control.entity_flow
     WHERE entity_version_id = v_ev_id
       AND flow_code = 'reverse_invoice' AND tenant_id IS NULL);

  SELECT id INTO v_flow_id FROM control.entity_flow
   WHERE entity_version_id = v_ev_id
     AND flow_code = 'reverse_invoice' AND tenant_id IS NULL;

  -- ── 2. Single confirmation step ─────────────────────────────────────────────
  INSERT INTO control.entity_flow_step
    (tenant_id, flow_id, step_key, label, icon_key, sort_order, advance_rule, layout_hint, created_by)
  VALUES
    (NULL, v_flow_id, 'confirm', 'Confirm Reversal', 'rotate-ccw', 10,
     '{"required_fields":["notes"]}'::jsonb,
     'two_column', v_su)
  ON CONFLICT (flow_id, step_key) DO NOTHING;

  SELECT id INTO v_step_id FROM control.entity_flow_step
   WHERE flow_id = v_flow_id AND step_key = 'confirm';

  -- ── 3. Field bindings ───────────────────────────────────────────────────────
  DELETE FROM control.entity_flow_field
   WHERE flow_step_id = v_step_id AND tenant_id IS NULL;

  INSERT INTO control.entity_flow_field (
    tenant_id, flow_step_id, entity_field_id,
    mode, derivation_mode, visible_when, required_when,
    default_source, derive_expression, override_permission,
    summary_role, ui_variant, span, help_text, sort_order, created_by)
  SELECT NULL, v_step_id, ef.id,
         v.mode, v.dm,
         v.vw::jsonb, v.rw::jsonb,
         v.ds, v.dx, v.op,
         v.sr, v.uv, v.sp, v.ht, v.so, v_su
  FROM control.entity_field ef
  JOIN (VALUES
    ('notes', 'editable', 'manual',
     NULL::text, NULL::text,
     NULL, NULL, NULL,
     NULL, NULL, 3,
     'Required — state the reason for reversing this invoice.',
     10)
  ) AS v(fn, mode, dm, vw, rw, ds, dx, op, sr, uv, sp, ht, so)
     ON ef.name = v.fn AND ef.entity_version_id = v_ev_id;

  RAISE NOTICE 'reverse_invoice flow seeded: flow_id=%, step_id=%', v_flow_id, v_step_id;

END $$;


-- === SOURCE: 026_payment_entry_new_flow.sql ===
-- =============================================================================
-- platform/005_domain_registrations/200_document/026_payment_entry_new_flow.sql
-- Create-Payment flow for payment_entry — single-step wizard.
--
-- Field ui_variant map:
--   payment_type      -> radio_cards   (standard / partial / advance / final / netting)
--   supplier_id       → inline_search (EntityRefPicker backed by /records/supplier)
--   payment_method_id -> inline_search (EntityRefPicker backed by /records/payment_method)
--   document_date     → date          (DatePicker, defaults to today)
--   posting_date      → date          (DatePicker, defaults to today)
--   currency_code     → readonly chip (derived from supplier profile; user can override)
--   payment_amount    → money_big     (large numeric input)
--   payment_reference → text
--   notes             → textarea
--   payment_direction → hidden const  (OUTBOUND for AP)
--
-- Depends on: 010_payment_entry.sql
-- Idempotent: WHERE NOT EXISTS for flow, ON CONFLICT DO NOTHING for step,
--             DELETE+INSERT for field bindings.
-- =============================================================================

DO $$
DECLARE
  v_su       constant uuid := '00000000-0000-0000-0000-000000000000';
  v_ev_id    uuid;
  v_flow_id  uuid;
  v_step_id  uuid;
BEGIN

  -- ── Resolve entity version ──────────────────────────────────────────────────
  SELECT ev.id INTO v_ev_id
    FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
   WHERE e.table_schema = 'document' AND e.table_name = 'payment_entry'
     AND e.tenant_id IS NULL AND ev.version_no = 1;

  IF v_ev_id IS NULL THEN
    RAISE NOTICE 'payment_entry v1 not found — create_payment flow seed skipped';
    RETURN;
  END IF;

  -- ── 1. Flow header ──────────────────────────────────────────────────────────
  INSERT INTO control.entity_flow (
    tenant_id, entity_version_id, flow_code, label, description, icon_key,
    trigger_context, is_default, config, version_no, status, effective_from, created_by)
  SELECT
    NULL, v_ev_id, 'create_payment',
    'Create Payment',
    'Record an outbound payment against an AP invoice or on account.',
    'banknote',
    'new', true,
    jsonb_build_object('layout', 'single_step'),
    1, 'active', now(), v_su
  WHERE NOT EXISTS (
    SELECT 1 FROM control.entity_flow
     WHERE entity_version_id = v_ev_id
       AND flow_code = 'create_payment' AND tenant_id IS NULL);

  SELECT id INTO v_flow_id FROM control.entity_flow
   WHERE entity_version_id = v_ev_id
     AND flow_code = 'create_payment' AND tenant_id IS NULL;

  -- ── 2. Single step ──────────────────────────────────────────────────────────
  INSERT INTO control.entity_flow_step
    (tenant_id, flow_id, step_key, label, icon_key, sort_order, advance_rule, layout_hint, created_by)
  VALUES
    (NULL, v_flow_id, 'details', 'Payment Details', 'banknote', 10,
     '{"required_fields":["payment_type","company_code_id","supplier_id","payment_method_id","document_date","posting_date","currency_code","payment_amount"]}'::jsonb,
     'two_column', v_su)
  ON CONFLICT (flow_id, step_key) DO UPDATE SET
    advance_rule = EXCLUDED.advance_rule;

  SELECT id INTO v_step_id FROM control.entity_flow_step
   WHERE flow_id = v_flow_id AND step_key = 'details';

  -- ── 3. Field bindings — delete and re-insert to pick up ui_variant changes ──
  DELETE FROM control.entity_flow_field
   WHERE flow_step_id = v_step_id AND tenant_id IS NULL;

  -- Columns: field_name, mode, derivation_mode, ui_variant, span,
  --          default_source, derive_expression, help_text, sort_order
  INSERT INTO control.entity_flow_field (
    tenant_id, flow_step_id, entity_field_id,
    mode, derivation_mode, ui_variant,
    visible_when, required_when,
    default_source, derive_expression, override_permission,
    summary_role, span, help_text, sort_order, created_by)
  SELECT NULL, v_step_id, ef.id,
         v.mode, v.dm::text, v.uv::text,
         NULL::jsonb, NULL::jsonb,
         v.ds, v.dx, v.op,
         v.sr, v.sp, v.ht, v.so, v_su
  FROM control.entity_field ef
  JOIN (VALUES
    ('company_code_id',   'required',  'derived_overrideable', 'inline_search', 1, NULL::text, 'ctx.user.default_company_code', 'ap.override_company_code', NULL, 'Company code paying this entry.', 15),
    -- payment_type is the settlement/business classification, not the bank instrument.
    ('payment_type',      'required',  'manual', 'radio_cards',   2, 'const:standard', NULL::text, NULL, NULL, 'Payment classification for accounting, allocation, and approval rules.', 10),
    -- supplier_id: inline_search → EntityRefPicker backed by /records/supplier
    ('supplier_id',       'required',  'manual', 'inline_search', 1, NULL::text,     NULL::text, NULL, NULL, 'Supplier being paid.', 20),
    -- payment_method_id: inline_search -> EntityRefPicker backed by /records/payment_method
    ('payment_method_id', 'required',  'derived_overrideable', 'inline_search', 1, NULL::text, 'supplier.default_payment_method(supplier_id)', NULL, NULL, 'Payment method/instrument used to transmit this payment.', 25),
    -- currency_code: derived from supplier profile; override allowed
    ('currency_code',     'chip',      'derived_overrideable', NULL, 1, NULL::text,  'supplier.default_currency(supplier_id)', NULL, NULL, 'Payment currency — derived from supplier profile.', 30),
    -- document_date: DatePicker, defaults to today
    ('document_date',     'required',  'manual', NULL, 1, 'today()',     NULL::text, NULL, NULL, 'Payment date on the payment instrument.', 40),
    -- posting_date: DatePicker, defaults to today
    ('posting_date',      'required',  'manual', NULL, 1, 'today()',     NULL::text, NULL, NULL, 'Date to post this payment to the GL.', 50),
    -- payment_amount: money_big input
    ('payment_amount',    'required',  'manual', 'money_big',     1, NULL::text,     NULL::text, NULL, NULL, 'Total payment amount.', 60),
    -- payment_reference: plain text
    ('payment_reference', 'editable',  'manual', NULL, 2, NULL::text,   NULL::text, NULL, NULL, 'Cheque number, transfer reference, or payment ID from the bank.', 70),
    -- notes: textarea (handled by field_name=notes fallthrough in FlowFieldBinding)
    ('notes',             'editable',  'manual', NULL, 2, NULL::text,   NULL::text, NULL, NULL, 'Optional notes for this payment.', 80),
    -- payment_direction: hidden const — always OUTBOUND for AP payments
    ('payment_direction', 'hidden',    'manual', NULL, 1, 'const:OUTBOUND', NULL::text, NULL, NULL, NULL, 90)
  ) AS v(fn, mode, dm, uv, sp, ds, dx, op, sr, ht, so)
     ON ef.name = v.fn AND ef.entity_version_id = v_ev_id;

  RAISE NOTICE 'create_payment flow seeded: flow_id=%, step_id=%', v_flow_id, v_step_id;

END $$;


-- === SOURCE: 027_payment_entry_bank_field.sql ===
-- =============================================================================
-- platform/005_domain_registrations/200_document/027_payment_entry_bank_field.sql
-- Add bank_account_id field to payment_entry entity and create_payment flow.
--
-- Fixes: GL posting "NO_BANK_ACCOUNT" error — the intake form was missing the
-- paying-from bank account picker. Users now explicitly select a company bank
-- account; the posting service uses it to resolve the correct cash GL account.
--
-- Changes:
--   1. Register bank_account_id in control.entity_field for payment_entry v1
--   2. Add bank_account_id field binding to the create_payment flow step
--   3. Scope bank account choices to the selected company_code_id
--
-- Depends on: 010_payment_entry.sql, 026_payment_entry_new_flow.sql
-- Idempotent: ON CONFLICT DO NOTHING / DELETE+INSERT for field bindings
-- =============================================================================

DO $$
DECLARE
  v_su       constant uuid := '00000000-0000-0000-0000-000000000000';
  v_ev_id    uuid;
  v_flow_id  uuid;
  v_step_id  uuid;
  v_bank_account_lookup constant jsonb := '{
    "search_fields": ["code", "name", "account_holder_name", "account_id_value", "account_last4"],
    "filters": {
      "status": "active"
    },
    "dependent_filter": {
      "source_field": "company_code_id",
      "target_field": "id",
      "through_entity": "bank_account_link",
      "through_source_field": "owner_id",
      "through_target_field": "bank_account_id",
      "through_filters": {
        "owner_type": "company_code",
        "purpose": ["default", "disbursement"]
      },
      "sort_field": "is_primary",
      "sort_direction": "desc",
      "empty_behavior": "none"
    }
  }'::jsonb;
BEGIN

  -- ── Resolve entity version ──────────────────────────────────────────────────
  SELECT ev.id INTO v_ev_id
    FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
   WHERE e.table_schema = 'document' AND e.table_name = 'payment_entry'
     AND e.tenant_id IS NULL AND ev.version_no = 1;

  IF v_ev_id IS NULL THEN
    RAISE NOTICE 'payment_entry v1 not found — bank_account_id field seed skipped';
    RETURN;
  END IF;

  -- ── 1. Register entity_field bank_account_id ────────────────────────────────
  INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, lookup_config, sort_order, created_by)
  VALUES (
    v_ev_id,
    'bank_account_id', 'bank_account_id', 'Paying From (Bank Account)',
    'reference', 'zero_or_one', 'standard', NULL,
    false, true,
    '{"ref_entity":"bank_account"}'::jsonb,
    v_bank_account_lookup,
    55,   -- between payment_method_id area and document_date (sort_order 60)
    v_su)
  ON CONFLICT DO NOTHING;

  UPDATE control.entity_field
     SET validation = '{"ref_entity":"bank_account"}'::jsonb,
         lookup_config = v_bank_account_lookup,
         updated_at = now(),
         updated_by = v_su
   WHERE entity_version_id = v_ev_id
     AND name = 'bank_account_id'
     AND (
       validation IS DISTINCT FROM '{"ref_entity":"bank_account"}'::jsonb
       OR COALESCE(lookup_config, '{}'::jsonb) IS DISTINCT FROM v_bank_account_lookup
     );

  -- ── 2. Add to create_payment flow step ─────────────────────────────────────
  SELECT f.id INTO v_flow_id
    FROM control.entity_flow f
   WHERE f.entity_version_id = v_ev_id
     AND f.flow_code = 'create_payment'
     AND f.tenant_id IS NULL;

  IF v_flow_id IS NULL THEN
    RAISE NOTICE 'create_payment flow not found — bank_account_id flow binding skipped';
    RETURN;
  END IF;

  SELECT s.id INTO v_step_id
    FROM control.entity_flow_step s
   WHERE s.flow_id = v_flow_id AND s.step_key = 'details';

  IF v_step_id IS NULL THEN
    RAISE NOTICE 'create_payment details step not found — bank_account_id flow binding skipped';
    RETURN;
  END IF;

  UPDATE control.entity_flow_step
     SET advance_rule = COALESCE(advance_rule, '{}'::jsonb)
         || jsonb_build_object(
              'required_fields',
              jsonb_build_array(
                'payment_type',
                'company_code_id',
                'supplier_id',
                'payment_method_id',
                'document_date',
                'posting_date',
                'currency_code',
                'payment_amount',
                'bank_account_id'
              )
            ),
         updated_at = now(),
         updated_by = v_su
   WHERE id = v_step_id
     AND tenant_id IS NULL;

  -- Delete existing binding if any, then re-insert
  DELETE FROM control.entity_flow_field
   WHERE flow_step_id = v_step_id
     AND tenant_id IS NULL
     AND entity_field_id = (
       SELECT id FROM control.entity_field
        WHERE entity_version_id = v_ev_id AND name = 'bank_account_id'
     );

  INSERT INTO control.entity_flow_field (
    tenant_id, flow_step_id, entity_field_id,
    mode, derivation_mode, ui_variant,
    visible_when, required_when,
    default_source, derive_expression, override_permission,
    summary_role, span, help_text, sort_order, created_by)
  SELECT
    NULL, v_step_id, ef.id,
    'required', 'manual', 'inline_search',
    NULL::jsonb, NULL::jsonb,
    NULL, NULL, NULL,
    NULL, 2,
    'Company bank account the payment will be sent from. Used to determine the GL cash account for posting.',
    68,   -- between payment_amount (60) and payment_reference (70)
    v_su
  FROM control.entity_field ef
  WHERE ef.entity_version_id = v_ev_id
    AND ef.name = 'bank_account_id';

  RAISE NOTICE 'bank_account_id field + flow binding seeded for payment_entry';

END $$;


-- === SOURCE: 028_wire_proforma_alternate_flow.sql ===
-- =============================================================================
-- platform/005_domain_registrations/200_document/028_wire_proforma_alternate_flow.sql
-- Wire create_proforma into the purchase_invoice intake flow picker.
--
-- The create_proforma flow (018_create_proforma_flow.sql) is fully seeded but
-- invisible to users because display_config.alternate_flows is empty. This
-- patch:
--   §A  Adds "create_proforma" to alternate_flows so the intent screen appears
--       at /app/purchase_invoice/new (two-card pre-wizard picker).
--   §B  Updates the label + description for both flows to user-facing copy
--       shown on the intent screen cards.
--
-- Depends on: 001_invoice.sql, 018_create_proforma_flow.sql
-- Idempotent: all updates use WHERE guards; safe to re-run
-- =============================================================================

DO $$
DECLARE
  v_su      constant uuid := '00000000-0000-0000-0000-000000000000';
  v_ent_id  uuid;
  v_ev_id   uuid;
  v_cur     jsonb;
BEGIN

  -- ── Resolve platform-level purchase_invoice entity + version ───────────────
  SELECT e.id, e.display_config, ev.id
    INTO v_ent_id, v_cur, v_ev_id
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id
   WHERE e.table_schema = 'document'
     AND e.table_name   = 'purchase_invoice'
     AND e.tenant_id    IS NULL
     AND ev.version_no  = 1;

  IF v_ent_id IS NULL THEN
    RAISE NOTICE '028_wire_proforma_alternate_flow: purchase_invoice entity not found — skipped';
    RETURN;
  END IF;

  -- ── §A  Wire create_proforma into alternate_flows ─────────────────────────
  IF NOT (COALESCE(v_cur, '{}'::jsonb)->'alternate_flows' @> '"create_proforma"') THEN
    UPDATE control.entity
       SET display_config = jsonb_set(
             COALESCE(display_config, '{}'::jsonb),
             '{alternate_flows}',
             COALESCE(display_config->'alternate_flows', '[]'::jsonb) || '"create_proforma"'::jsonb
           )
     WHERE id = v_ent_id;

    RAISE NOTICE '028: create_proforma added to alternate_flows';
  ELSE
    RAISE NOTICE '028: create_proforma already in alternate_flows — no-op';
  END IF;

  -- ── §B  User-facing labels + descriptions for the intent screen cards ──────
  -- Standard flow (flow_code = 'create', is_default = true)
  UPDATE control.entity_flow
     SET label       = 'Standard Invoice',
         description = 'Bookable Supplier invoice on 3 Steps'
   WHERE entity_version_id = v_ev_id
     AND flow_code          = 'create'
     AND tenant_id          IS NULL;

  -- Proforma flow (flow_code = 'create_proforma', is_default = false)
  UPDATE control.entity_flow
     SET label       = 'Proforma Invoice',
         description = 'Indicative totals only. No GL posting, dedup off. Promote to invoice when supplier confirms.'
   WHERE entity_version_id = v_ev_id
     AND flow_code          = 'create_proforma'
     AND tenant_id          IS NULL;

  RAISE NOTICE '028: flow labels + descriptions updated for purchase_invoice';

END $$;


-- === SOURCE: 029_run_matching_operation.sql ===
-- =============================================================================
-- platform/005_domain_registrations/200_document/029_run_matching_operation.sql
--
-- Registers the 'run_matching' operation for purchase_invoice:
--   - shared.permission:      ap.run_matching
--   - control.entity_operation: DETAIL surface, API handler → flow:run_matching
--
-- Non-PO invoices: matching is auto-triggered during submit (match_status → 'unmatched').
-- PO-based invoices: matching runs at post time; this operation allows manual re-runs
-- from the detail view (e.g. after updating line links or resolving exceptions).
--
-- Idempotent: WHERE NOT EXISTS guards on both permission and entity_operation.
-- Depends on: 001_invoice.sql, 020_ap_flow_permissions.sql
-- =============================================================================

DO $$
DECLARE
  v_su  CONSTANT uuid := '00000000-0000-0000-0000-000000000000';
  v_fin uuid;
BEGIN
  -- ── 1. Permission ───────────────────────────────────────────────────────────
  SELECT id INTO v_fin
    FROM shared.permission_category
   WHERE code = 'finance';

  IF v_fin IS NULL THEN
    RAISE NOTICE '029_run_matching_operation: finance category not found — skipping';
    RETURN;
  END IF;

  INSERT INTO shared.permission
         (code, name, category_id, scope_type, risk_level,
          sort_order, metadata, status, created_by)
  SELECT 'ap.run_matching',
         'Run Invoice Matching',
         v_fin,
         'record',
         'low',
         780,
         jsonb_build_object(
           'module',      'finance',
           'area',        'ap',
           'description', 'Manually trigger three-way / two-way / no-match matching on an AP invoice. Auto-runs during post for PO-based and during submit for non-PO invoices.'
         ),
         'active',
         v_su
  WHERE NOT EXISTS (
      SELECT 1 FROM shared.permission WHERE code = 'ap.run_matching');

  -- ── 2. entity_operation ─────────────────────────────────────────────────────
  -- entity_operation inserts moved to 060_entity_operations/002_ops_finance_org.sql

  RAISE NOTICE '029_run_matching_operation: permission and entity_operation seeded';
END $$;


-- === SOURCE: 030_journal_entry_flow.sql ===
-- 100_finance/200_document/030_journal_entry_flow.sql
-- Purpose: default create flow for manual Journal Entry with line repeater.
-- Header controls live in entity_flow_field; journal lines are described as a
-- composite repeater section backed by the journal_line child entity.

DO $$
DECLARE
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_ev_id   uuid;
    v_flow_id uuid;
    v_step_1  uuid;
    v_step_2  uuid;
BEGIN
    SELECT ev.id INTO v_ev_id
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id
    WHERE e.entity_code = 'journal_entry'
      AND e.tenant_id IS NULL
      AND ev.tenant_id IS NULL
      AND ev.version_no = 1;

    IF v_ev_id IS NULL THEN
        RAISE NOTICE 'journal_entry create flow skipped: entity version not found';
        RETURN;
    END IF;

    INSERT INTO control.entity_flow (
        tenant_id, entity_version_id, flow_code, label, description, icon_key,
        trigger_context, is_default, config, version_no, status, effective_from, created_by)
    SELECT
        NULL, v_ev_id, 'create',
        'Create Journal Entry',
        'Manual journal entry create flow with posting header and balanced lines.',
        'book-plus',
        'new', true,
        jsonb_build_object(
            'layout', 'wizard_with_summary',
            'intake_variant', 'minimal_header_then_lines',
            'input_modes', jsonb_build_array('manual','source_adjustment','import'),
            'line_reference_strategy', 'none',
            'summary', jsonb_build_object(
                'fields', jsonb_build_array('company_code_id','posting_date','transaction_currency','exchange_rate','total_debit','total_credit','line_count'),
                'line_collection', 'journal_line',
                'balance_rule', 'debit_equals_credit'
            ),
            'controls', jsonb_build_object(
                'submit_requires_balance', true,
                'submit_requires_min_lines', 2,
                'post_requires_approval', true
            )
        ),
        1, 'active', now(), v_su
    WHERE NOT EXISTS (
        SELECT 1 FROM control.entity_flow
        WHERE entity_version_id = v_ev_id
          AND flow_code = 'create'
          AND tenant_id IS NULL
          AND version_no = 1
    );

    UPDATE control.entity_flow
       SET config = jsonb_build_object(
           'layout', 'wizard_with_summary',
           'intake_variant', 'minimal_header_then_lines',
           'input_modes', jsonb_build_array('manual','source_adjustment','import'),
           'line_reference_strategy', 'none',
           'summary', jsonb_build_object(
               'fields', jsonb_build_array('company_code_id','posting_date','transaction_currency','exchange_rate','total_debit','total_credit','line_count'),
               'line_collection', 'journal_line',
               'balance_rule', 'debit_equals_credit'
           ),
           'controls', jsonb_build_object(
               'submit_requires_balance', true,
               'submit_requires_min_lines', 2,
               'post_requires_approval', true
           )
       )
     WHERE entity_version_id = v_ev_id
       AND flow_code = 'create'
       AND tenant_id IS NULL
       AND version_no = 1;

    SELECT id INTO v_flow_id
    FROM control.entity_flow
    WHERE entity_version_id = v_ev_id
      AND flow_code = 'create'
      AND tenant_id IS NULL
      AND version_no = 1;

    INSERT INTO control.entity_flow_step
        (tenant_id, flow_id, step_key, label, icon_key, sort_order, advance_rule, layout_hint, created_by)
    VALUES
        (NULL, v_flow_id, 'posting_header', 'Posting Header', 'landmark', 10,
         '{"required_fields":["company_code_id","posting_date","document_date","transaction_currency","description"]}'::jsonb,
         'summary_side', v_su),
        (NULL, v_flow_id, 'journal_lines', 'Journal Lines', 'list-plus', 20,
         '{"required_sections":["lines"],"min_rows":{"lines":2},"balance_rule":"debit_equals_credit","pre_submit_checks":["line_count_min_2","debits_equal_credits","period_open","posting_controls"]}'::jsonb,
         'line_editor', v_su)
    ON CONFLICT (flow_id, step_key) DO UPDATE SET
        label = EXCLUDED.label,
        icon_key = EXCLUDED.icon_key,
        sort_order = EXCLUDED.sort_order,
        advance_rule = EXCLUDED.advance_rule,
        layout_hint = EXCLUDED.layout_hint;

    SELECT id INTO v_step_1 FROM control.entity_flow_step WHERE flow_id = v_flow_id AND step_key = 'posting_header';
    SELECT id INTO v_step_2 FROM control.entity_flow_step WHERE flow_id = v_flow_id AND step_key = 'journal_lines';

    DELETE FROM control.entity_flow_field
    WHERE flow_step_id IN (v_step_1, v_step_2)
      AND tenant_id IS NULL;

    INSERT INTO control.entity_flow_section (
        tenant_id, flow_step_id, section_key, label, description, sort_order,
        collapse_default, visible_when, reveal_behavior,
        section_type, entity_code, payload_key, field_codes, min_rows, default_row,
        created_by)
    VALUES
        (NULL, v_step_1, 'identity', 'Identity', NULL, 10,
         false, NULL, 'honor_default',
         'fields', NULL, NULL, NULL, NULL, NULL, v_su),
        (NULL, v_step_1, 'posting', 'Posting', NULL, 20,
         false, NULL, 'honor_default',
         'fields', NULL, NULL, NULL, NULL, NULL, v_su),
        (NULL, v_step_1, 'source', 'Source', NULL, 30,
         true, NULL, 'honor_default',
         'fields', NULL, NULL, NULL, NULL, NULL, v_su),
        (NULL, v_step_2, 'lines', 'Lines',
         'Debit and credit lines. The DB validates polarity, balance, dimensions, posting controls, and budget.',
         10, false, NULL, 'auto_expand',
         'repeater', 'journal_line', 'lines',
         '["line_no","gl_account_id","description","transaction_debit","transaction_credit","exchange_rate","cost_center_id","profit_center_id","project_id","party_type","party_id"]'::jsonb,
         2,
         '{"transaction_debit":0,"transaction_credit":0}'::jsonb,
         v_su),
        (NULL, v_step_2, 'summary', 'Summary', NULL, 20,
         false, NULL, 'honor_default',
         'summary', NULL, NULL, NULL, NULL, NULL, v_su)
    ON CONFLICT (flow_step_id, section_key) DO UPDATE SET
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        sort_order = EXCLUDED.sort_order,
        collapse_default = EXCLUDED.collapse_default,
        visible_when = EXCLUDED.visible_when,
        reveal_behavior = EXCLUDED.reveal_behavior,
        section_type = EXCLUDED.section_type,
        entity_code = EXCLUDED.entity_code,
        payload_key = EXCLUDED.payload_key,
        field_codes = EXCLUDED.field_codes,
        min_rows = EXCLUDED.min_rows,
        default_row = EXCLUDED.default_row;

    INSERT INTO control.entity_flow_field (
        tenant_id, flow_step_id, entity_field_id,
        section_key, mode, derivation_mode, visible_when, required_when,
        default_source, derive_expression, override_permission,
        summary_role, ui_variant, span, display_size,
        help_text, sort_order, created_by)
    SELECT NULL, v_step_1, ef.id,
           v.section_key, v.mode, v.derivation_mode,
           v.visible_when::jsonb, v.required_when::jsonb,
           v.default_source, v.derive_expression, v.override_permission,
           v.summary_role, v.ui_variant, v.span, v.display_size,
           v.help_text, COALESCE(v.sort_order, ef.sort_order), v_su
    FROM control.entity_field ef
    JOIN (VALUES
        ('status',               'identity', 'chip',     'derived_locked', NULL, NULL, NULL, 'const:draft', NULL, 'meta', 'chip', 1, 'compact', NULL, NULL::smallint),
        ('company_code_id',      'posting',  'required', 'derived_overrideable', NULL, NULL, NULL, 'ctx.user.default_company_code', 'je.override_company_code', NULL, 'inline_search', 1, 'standard', NULL, NULL::smallint),
        ('book_id',              'posting',  'required', 'derived_overrideable', NULL, NULL, NULL, 'company_code.default_manual_ledger_book(company_code_id)', 'je.override_book', NULL, 'inline_search', 1, 'standard', NULL, NULL::smallint),
        ('posting_date',         'posting',  'required', 'manual', NULL, NULL, 'today()', NULL, NULL, NULL, NULL, 1, 'standard', NULL, NULL::smallint),
        ('document_date',        'posting',  'required', 'derived_overrideable', NULL, NULL, 'field.posting_date', 'field.posting_date', 'je.override_document_date', NULL, NULL, 1, 'standard', NULL, NULL::smallint),
        ('transaction_currency', 'posting',  'required', 'derived_overrideable', NULL, NULL, NULL, 'company_code.base_currency(company_code_id)', 'je.override_currency', NULL, 'currency', 1, 'standard', NULL, NULL::smallint),
        ('base_currency',        'posting',  'readonly', 'derived_locked', NULL, NULL, NULL, 'company_code.base_currency(company_code_id)', NULL, 'meta', 'currency', 1, 'compact', NULL, NULL::smallint),
        ('source_type',          'source',   'chip',     'derived_locked', NULL, NULL, NULL, 'const:manual', NULL, 'meta', 'chip', 1, 'compact', NULL, NULL::smallint),
        ('description',          'source',   'required', 'manual', NULL, NULL, NULL, NULL, NULL, NULL, 'textarea', 3, 'standard', NULL, NULL::smallint)
    ) AS v(field_name, section_key, mode, derivation_mode, visible_when, required_when,
           default_source, derive_expression, override_permission,
           summary_role, ui_variant, span, display_size, help_text, sort_order)
      ON ef.name = v.field_name
    WHERE ef.entity_version_id = v_ev_id;

    INSERT INTO control.entity_flow_field (
        tenant_id, flow_step_id, entity_field_id,
        section_key, mode, derivation_mode, visible_when, required_when,
        default_source, derive_expression, override_permission,
        summary_role, ui_variant, span, display_size,
        help_text, sort_order, created_by)
    SELECT NULL, v_step_2, ef.id,
           v.section_key, v.mode, v.derivation_mode,
           v.visible_when::jsonb, v.required_when::jsonb,
           v.default_source, v.derive_expression, v.override_permission,
           v.summary_role, v.ui_variant, v.span, v.display_size,
           v.help_text, v.sort_order, v_su
    FROM control.entity_field ef
    JOIN (VALUES
        ('total_debit',            'summary',  'summary_only', 'derived_locked', NULL::text, NULL::text, NULL, 'lines.sum(base_debit)', NULL, 'total', 'money_big', 1, 'prominent', NULL, 10),
        ('total_credit',           'summary',  'summary_only', 'derived_locked', NULL, NULL, NULL, 'lines.sum(base_credit)', NULL, 'total', 'money_big', 1, 'prominent', NULL, 20),
        ('line_count',             'summary',  'summary_only', 'derived_locked', NULL, NULL, NULL, 'lines.count()', NULL, 'meta', 'chip', 1, 'compact', NULL, 30),
        ('fiscal_year',            'summary',  'summary_only', 'derived_locked', NULL, NULL, NULL, 'fiscal.year_from(posting_date, company_code_id)', NULL, 'meta', 'chip', 1, 'compact', NULL, 40),
        ('period_number',          'summary',  'summary_only', 'derived_locked', NULL, NULL, NULL, 'fiscal.period_from(posting_date, company_code_id)', NULL, 'meta', 'chip', 1, 'compact', NULL, 50)
    ) AS v(field_name, section_key, mode, derivation_mode, visible_when, required_when,
           default_source, derive_expression, override_permission,
           summary_role, ui_variant, span, display_size, help_text, sort_order)
      ON ef.name = v.field_name
    WHERE ef.entity_version_id = v_ev_id;

    RAISE NOTICE 'journal_entry create flow seeded: flow=%, steps=%',
        v_flow_id,
        (SELECT count(*) FROM control.entity_flow_step WHERE flow_id = v_flow_id);
END $$;


-- ============================================================
-- MASTER FLOWS
-- ============================================================
-- === SOURCE: 003_supplier_children.sql ===
-- Business Partner Identifier new-record flow

-- === SOURCE: 015_partner_policies_and_flows.sql ===
-- Note: Supplier intake flow (018_supplier_intake_flow) and customer extension
-- flows (024_business_partner_customer_extension_flows) remain in
-- 005_domain_registrations/100_master/015_partner_policies_and_flows.sql
-- because their DO blocks contain mixed entity/entity_field/entity_flow inserts
-- that share PL/pgSQL variables and cannot be cleanly split.


-- ============================================================
-- SOURCE: server/db/seed/platform/005_domain_registrations/100_master/003_supplier_children.sql
-- ============================================================



-- === SOURCE: 004_supplier_service_coverage_retire.sql ===
-- 100_master/004_retire_business_partner_service_coverage.sql
-- Purpose: retire BP service coverage metadata. Geographic/service coverage
-- belongs to Business Network capability, not the BP master profile.

DO $$
BEGIN
  DELETE FROM control.entity_flow_section
   WHERE payload_key = 'service_coverage'
      OR entity_code = 'business_partner_service_coverage'
      OR section_key = 'service_coverage';

  -- Do not delete control.entity/control.entity_version rows here.
  -- They may already be referenced by immutable snapshot.entity_compiled rows
  -- through ec_version_fk. Archive the metadata instead so runtime lists stop
  -- surfacing coverage while historical compiled snapshots remain valid.
  UPDATE control.entity_version ev
     SET status = 'ARCHIVED',
         change_summary = COALESCE(change_summary, 'Retired: BP service coverage moved to Business Network capability.')
    FROM control.entity e
   WHERE ev.entity_id = e.id
     AND e.tenant_id IS NULL
     AND e.entity_code IN (
       'business_partner_service_coverage',
       'supplier_service_coverage',
       'vendor_service_coverage'
     )
     AND ev.status IS DISTINCT FROM 'ARCHIVED';

  UPDATE control.entity
     SET status = 'ARCHIVED',
         feature_flags = COALESCE(feature_flags, '{}'::jsonb)
           || jsonb_build_object(
                'retired', true,
                'retired_reason', 'BP service coverage moved to Business Network capability.'
              )
   WHERE tenant_id IS NULL
     AND entity_code IN (
       'business_partner_service_coverage',
       'supplier_service_coverage',
       'vendor_service_coverage'
     )
     AND status IS DISTINCT FROM 'ARCHIVED';
END $$;


-- ============================================================
-- SOURCE: server/db/seed/platform/005_domain_registrations/100_master/015_partner_policies_and_flows.sql
-- ============================================================


-- === SOURCE: 018_supplier_intake_flow.sql ===
-- =============================================================================
-- 100_master/018_supplier_intake_flow.sql
-- Composite 5-step supplier request intake flow.
--
-- Architecture:
--   - persistence_mode: composite_supplier_intake
--   - 5 steps: identify → relationships → tax → classify → review
--   - Type=fields sections use entity_flow_field rows for flat BP/supplier fields
--   - Type=repeater sections reference child entity_code for field resolution
--   - Driver fields: is_payment_ready (shows banking) + anticipated_risk_tier (shows governance)
--
-- Also seeds:
--   - entity_field rows for is_payment_ready + anticipated_risk_tier on supplier
--
-- Depends on:
--   001_supplier.sql, control/01g_tables_flow_engine_ext.sql,
--   control/01h_tables_composite_intake.sql, 017_supplier_permissions.sql
--
-- Idempotent:
--   WHERE NOT EXISTS for flow/steps, ON CONFLICT DO NOTHING for fields,
--   ON CONFLICT (flow_step_id, section_key) DO UPDATE for sections,
--   DELETE+INSERT for entity_flow_field bindings.
-- =============================================================================

DO $$
DECLARE
  v_su        constant uuid := '00000000-0000-0000-0000-000000000000';
  v_ev_id     uuid;
  v_flow_id   uuid;
  v_step_1    uuid;  -- Identify
  v_step_2    uuid;  -- Governance & Trust
  v_step_3    uuid;  -- Tax & Identifiers
  v_step_4    uuid;  -- Contacts & Addresses
  v_step_5    uuid;  -- Review & Submit
BEGIN

  -- ── Resolve supplier entity version ────────────────────────────────────────
  SELECT ev.id INTO v_ev_id
    FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
   WHERE e.entity_code = 'supplier'
     AND e.tenant_id IS NULL AND ev.version_no = 1;

  IF v_ev_id IS NULL THEN
    RAISE NOTICE 'supplier entity v1 not found — intake flow seed skipped';
    RETURN;
  END IF;

  -- ── 0. Driver fields — add if not already present ─────────────────────────
  -- is_payment_ready: UI-only boolean toggle — shows/hides banking section.
  -- anticipated_risk_tier: text enum — shows/hides governance section.
  -- Both are stripped by PROTECTED_SUPPLIER_FIELDS before the DB insert.
  -- Boolean fields must start with is_/has_/can_/allow_/enable_ (ef_bool_naming_chk).

  INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label,
    data_type, ui_type, cardinality, origin,
    is_required, is_filterable, is_sortable, is_searchable,
    sort_order, created_by)
  VALUES
    (v_ev_id, 'is_payment_ready', 'is_payment_ready',
     'Payment Ready', 'boolean', 'toggle', 'zero_or_one', 'standard',
     false, false, false, false, 500, v_su),
    (v_ev_id, 'anticipated_risk_tier', 'anticipated_risk_tier',
     'Anticipated Risk Tier', 'text', 'select', 'zero_or_one', 'standard',
     false, false, false, false, 510, v_su)
  ON CONFLICT DO NOTHING;

  -- Header-only signals: available to the header builder/intake flow, but not
  -- shown as editable Profile fields in the supplier detail page.
  UPDATE control.entity_field
     SET origin = 'system'
   WHERE entity_version_id = v_ev_id
     AND name IN ('is_payment_ready', 'anticipated_risk_tier')
     AND origin IS DISTINCT FROM 'system';

  -- ── 1. Flow header ──────────────────────────────────────────────────────────
  -- Supplier codes are seeded per-tenant by the onboarding process. The intake
  -- route falls back to SUP-{timestamp} when no series row exists.
  INSERT INTO control.entity_flow (
    tenant_id, entity_version_id, flow_code, label, description, icon_key,
    trigger_context, is_default, config, version_no, status, effective_from, created_by)
  SELECT
    NULL, v_ev_id,
    'supplier_intake',
    'Create Business Partner as Supplier',
    'Five-step BP-first onboarding wizard: profile and role, contacts, tax identifiers, governance and trust, review.',
    'building-store',
    'new', false,
    jsonb_build_object(
      'persistence_mode', 'composite_supplier_intake',
      'layout',           'wizard_with_summary',
      'submit_label',     'Submit Supplier Request',
      'success_redirect', '/app/business_partner/{business_partner_id}'
    ),
    1, 'active', now(), v_su
  WHERE NOT EXISTS (
    SELECT 1 FROM control.entity_flow
     WHERE entity_version_id = v_ev_id
       AND flow_code = 'supplier_intake' AND tenant_id IS NULL);

  SELECT id INTO v_flow_id
    FROM control.entity_flow
   WHERE entity_version_id = v_ev_id
     AND flow_code = 'supplier_intake' AND tenant_id IS NULL;

  UPDATE control.entity_flow
     SET label = 'Create Business Partner as Supplier',
         description = 'Five-step BP-first onboarding wizard: profile and role, contacts, tax identifiers, governance and trust, review.',
         config = COALESCE(config, '{}'::jsonb) || jsonb_build_object(
           'persistence_mode', 'composite_supplier_intake',
           'layout',           'wizard_with_summary',
           'submit_label',     'Submit Supplier Request',
           'success_redirect', '/app/business_partner/{business_partner_id}'
         )
   WHERE id = v_flow_id;

  -- ── 3. Steps ────────────────────────────────────────────────────────────────

  -- Re-sequencing existing steps can otherwise collide with
  -- efs_flow_order_uq (flow_id, sort_order), e.g. moving relationships from
  -- 40 to 20 while classify still owns 20. Park all existing steps first, then
  -- upsert the target order below.
  WITH parked AS (
    SELECT id,
           (-30000 + row_number() OVER (ORDER BY sort_order, step_key))::smallint AS parked_sort
      FROM control.entity_flow_step
     WHERE flow_id = v_flow_id
  )
  UPDATE control.entity_flow_step s
     SET sort_order = parked.parked_sort
    FROM parked
   WHERE s.id = parked.id;

  INSERT INTO control.entity_flow_step
    (tenant_id, flow_id, step_key, label, icon_key, sort_order, advance_rule, layout_hint, created_by)
  VALUES
    (NULL, v_flow_id, 'identify',      'Profile & Role',     'id-badge',      10,
     '{"required_fields":["name"]}'::jsonb, 'two_column', v_su),
    (NULL, v_flow_id, 'relationships', 'Contacts & Addresses', 'users',       20,
     '{}'::jsonb, 'two_column', v_su),
    (NULL, v_flow_id, 'tax',           'Tax & Identifiers',  'receipt-tax',   30,
     '{}'::jsonb, 'two_column', v_su),
    (NULL, v_flow_id, 'classify',      'Governance & Trust', 'shield-check',  40,
     '{}'::jsonb, 'two_column', v_su),
    (NULL, v_flow_id, 'review',        'Review & Submit',    'check-circle',  50,
     '{}'::jsonb, 'two_column', v_su)
  ON CONFLICT (flow_id, step_key) DO UPDATE SET
    label = EXCLUDED.label,
    icon_key = EXCLUDED.icon_key,
    sort_order = EXCLUDED.sort_order,
    advance_rule = EXCLUDED.advance_rule,
    layout_hint = EXCLUDED.layout_hint;

  SELECT id INTO v_step_1 FROM control.entity_flow_step WHERE flow_id = v_flow_id AND step_key = 'identify';
  SELECT id INTO v_step_2 FROM control.entity_flow_step WHERE flow_id = v_flow_id AND step_key = 'classify';
  SELECT id INTO v_step_3 FROM control.entity_flow_step WHERE flow_id = v_flow_id AND step_key = 'tax';
  SELECT id INTO v_step_4 FROM control.entity_flow_step WHERE flow_id = v_flow_id AND step_key = 'relationships';
  SELECT id INTO v_step_5 FROM control.entity_flow_step WHERE flow_id = v_flow_id AND step_key = 'review';

  -- ── 4. Sections ─────────────────────────────────────────────────────────────
  -- Clean moved/retired sections before re-inserting. ON CONFLICT is scoped
  -- to (flow_step_id, section_key), so moved section keys must be removed from
  -- their old step.
  DELETE FROM control.entity_flow_section
   WHERE flow_step_id IN (v_step_2, v_step_4)
     AND section_key IN ('service_coverage','certifications','contacts','addresses','bank_accounts','governance');

  -- STEP 1: Identify
  --   identify_core  (type=fields)  — business_partner identity fields
  --   intake_flags   (type=fields)  — driver fields (is_payment_ready, anticipated_risk_tier)

  INSERT INTO control.entity_flow_section
    (tenant_id, flow_step_id, section_key, label, sort_order,
     section_type, entity_code, payload_key, field_codes,
     min_rows, max_rows, default_row, permission_code, restricted_view_only,
     collapse_default, created_by)
  VALUES
    (NULL, v_step_1, 'identify_core', 'Business Partner Profile', 10,
     'fields', 'business_partner', NULL, NULL,
     NULL, NULL, NULL, NULL, false, false, v_su),
    (NULL, v_step_1, 'intake_flags', 'Supplier Role Setup', 20,
     'fields', 'supplier', NULL, NULL,
     NULL, NULL, NULL, NULL, false, false, v_su)
  ON CONFLICT (flow_step_id, section_key) DO UPDATE SET
    label = EXCLUDED.label, sort_order = EXCLUDED.sort_order,
    section_type = EXCLUDED.section_type,
    entity_code = EXCLUDED.entity_code;

  -- STEP 4: Governance & Trust
  INSERT INTO control.entity_flow_section
    (tenant_id, flow_step_id, section_key, label, sort_order,
     section_type, entity_code, payload_key, field_codes,
     min_rows, max_rows, default_row, permission_code, restricted_view_only,
     visible_when, collapse_default, created_by)
  VALUES
    (NULL, v_step_2, 'certifications', 'Certifications', 10,
     'repeater', 'certification', 'certifications',
     '["certification_type_id","custom_name","certificate_number","certified_by","certified_location","effective_from","effective_until","additional_info","document_attachment_id"]'::jsonb,
     0, NULL, NULL, NULL, false,
     NULL, false, v_su),

    (NULL, v_step_2, 'bank_accounts', 'Payment Bank Accounts', 20,
     'repeater', 'v_business_partner_bank_account', 'bank_accounts',
     '["bank_name","account_number","currency_code","account_holder_name","account_id_type","is_primary"]'::jsonb,
     0, NULL, '{"is_primary": false}'::jsonb, 'supplier.banking.submit', false,
     '{"==":[{"var":"is_payment_ready"},true]}'::jsonb, false, v_su),

    (NULL, v_step_2, 'governance', 'Governance Disclosures', 30,
     'repeater', 'party_governance_relation', 'governance',
     '["relation_type","member_name","member_type","company_name","member_country_code","business_title","ownership_pct","voting_pct","beneficial_ownership_pct","directness","control_nature","share_class","authority_scope","authority_limit_amount","authority_limit_currency_code","appointed_date","end_of_term","notes"]'::jsonb,
     0, NULL, NULL, 'supplier.governance.write', false,
     NULL, false, v_su)
  ON CONFLICT (flow_step_id, section_key) DO UPDATE SET
    label           = EXCLUDED.label,
    sort_order      = EXCLUDED.sort_order,
    section_type    = EXCLUDED.section_type,
    entity_code     = EXCLUDED.entity_code,
    payload_key     = EXCLUDED.payload_key,
    field_codes     = EXCLUDED.field_codes,
    permission_code = EXCLUDED.permission_code,
    visible_when    = EXCLUDED.visible_when,
    default_row     = EXCLUDED.default_row;

  -- STEP 3: Tax & Identifiers
  INSERT INTO control.entity_flow_section
    (tenant_id, flow_step_id, section_key, label, sort_order,
     section_type, entity_code, payload_key, field_codes,
     min_rows, max_rows, default_row, permission_code, restricted_view_only,
     collapse_default, created_by)
  VALUES
    (NULL, v_step_3, 'tax_profiles', 'Tax Profiles', 10,
     'repeater', 'party_tax_profile', 'tax_profiles',
     '["country_code","tax_classification","taxation_type","tax_number","state_tax_number","sales_tax_number","service_tax_number","regional_tax_number","vat_number","is_vat_registered","has_tax_clearance","tax_clearance_number","tax_clearance_expiry_date","global_location_number","penalty_information","discount_information"]'::jsonb,
     0, NULL, '{"is_vat_registered": false, "has_tax_clearance": false}'::jsonb, 'supplier.tax.submit', false, false, v_su),
    (NULL, v_step_3, 'identifiers', 'Identifiers', 20,
     'repeater', 'party_identifier', 'identifiers',
     '["scheme","value","issuing_authority","issued_at","valid_until","is_primary","is_verified"]'::jsonb,
     0, NULL, '{"is_primary": false, "is_verified": false}'::jsonb, NULL, false, false, v_su)
  ON CONFLICT (flow_step_id, section_key) DO UPDATE SET
    label = EXCLUDED.label, sort_order = EXCLUDED.sort_order,
    section_type = EXCLUDED.section_type, entity_code = EXCLUDED.entity_code,
    payload_key = EXCLUDED.payload_key, permission_code = EXCLUDED.permission_code;

  -- STEP 2: Contacts & Addresses

  INSERT INTO control.entity_flow_section
    (tenant_id, flow_step_id, section_key, label, sort_order,
     section_type, entity_code, payload_key, field_codes,
     min_rows, max_rows, default_row, permission_code, restricted_view_only,
     visible_when, collapse_default, created_by)
  VALUES
    (NULL, v_step_4, 'contacts', 'Contact Persons', 10,
     'repeater', 'party_contact_person', 'contacts',
     '["contact_name","business_title","contact_role","is_primary","contact_email","contact_phone","contact_fax"]'::jsonb,
     0, NULL, '{"is_primary": false}'::jsonb, NULL, false,
     NULL, false, v_su),

    (NULL, v_step_4, 'addresses', 'Addresses', 20,
     'repeater', 'address', 'addresses',
     '["address_type","line1","line2","city","region","postal_code","country_code","address_email","address_phone","address_fax"]'::jsonb,
     0, NULL, NULL, NULL, false,
     NULL, false, v_su)
  ON CONFLICT (flow_step_id, section_key) DO UPDATE SET
    label           = EXCLUDED.label,
    sort_order      = EXCLUDED.sort_order,
    section_type    = EXCLUDED.section_type,
    entity_code     = EXCLUDED.entity_code,
    payload_key     = EXCLUDED.payload_key,
    field_codes     = EXCLUDED.field_codes,
    permission_code = EXCLUDED.permission_code,
    visible_when    = EXCLUDED.visible_when,
    default_row     = EXCLUDED.default_row;

  -- STEP 5: Review & Submit
  INSERT INTO control.entity_flow_section
    (tenant_id, flow_step_id, section_key, label, sort_order,
     section_type, entity_code, payload_key, field_codes,
     min_rows, max_rows, default_row, permission_code, restricted_view_only,
     collapse_default, created_by)
  VALUES
    (NULL, v_step_5, 'review_summary', 'Review & Submit', 10,
     'summary', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, false, false, v_su)
  ON CONFLICT (flow_step_id, section_key) DO UPDATE SET
    label = EXCLUDED.label, section_type = EXCLUDED.section_type;

  -- ── 5. Flat field bindings (Step 1 type=fields sections) ────────────────────
  DELETE FROM control.entity_flow_field
   WHERE flow_step_id = v_step_1 AND tenant_id IS NULL;

  INSERT INTO control.entity_flow_field (
    tenant_id, flow_step_id, entity_field_id,
    section_key, mode, derivation_mode, ui_variant,
    visible_when, required_when, default_source,
    summary_role, span, help_text, sort_order, created_by)
  SELECT NULL, v_step_1, ef.id,
         v.sk, v.mode::text, 'manual', v.uv::text,
         NULL::jsonb, NULL::jsonb, NULL::text,
         NULL::text, v.sp::smallint, v.ht::text, v.so::smallint, v_su
  FROM control.entity_field ef
  JOIN control.entity_version ev ON ev.id = ef.entity_version_id
  JOIN control.entity e ON e.id = ev.entity_id
  JOIN (VALUES
    ('business_partner', 'identify_core', 'name',                      'required', NULL,      1, 'Trading name as known to your organisation.',           10),
    ('business_partner', 'identify_core', 'display_name',              'editable', NULL,      1, 'Short display name used in lists and dropdowns.',        20),
    ('business_partner', 'identify_core', 'legal_name',                'editable', NULL,      1, 'Full registered legal name for contracts.',              30),
    ('business_partner', 'identify_core', 'legal_form',                'editable', 'select',  1, NULL,                                                     40),
    ('business_partner', 'identify_core', 'registration_no',           'editable', NULL,      1, 'Company registration or business number.',               50),
    ('business_partner', 'identify_core', 'registration_country_code', 'editable', 'country', 1, 'Country of company registration.',                      60),
    ('business_partner', 'identify_core', 'website_url',               'editable', NULL,      1, NULL,                                                     70),
    ('business_partner', 'identify_core', 'description',               'editable', NULL,      2, NULL,                                                     80),
    ('business_partner', 'identify_core', 'external_ref',              'editable', NULL,      1, 'Optional reference ID from an external system.',         90),
    ('supplier',         'intake_flags',  'supplier_type',             'editable', 'select',  1, NULL,                                                    100),
    ('supplier',         'intake_flags',  'is_payment_ready',          'editable', 'toggle',  1, 'Enable if the supplier should be set up for payment.',  110),
    ('supplier',         'intake_flags',  'anticipated_risk_tier',     'editable', 'select',  1, 'Suggested risk classification for compliance review.', 120)
  ) AS v(entity_code, sk, fn, mode, uv, sp, ht, so) ON ef.name = v.fn
  WHERE e.entity_code = v.entity_code
    AND e.tenant_id IS NULL
    AND ev.version_no = 1;

END $$;



-- entity_lifecycle binding moved to 004_entity_engine/050_lifecycle_and_field_bindings.sql

-- === SOURCE: 024_business_partner_customer_extension_flows.sql ===
-- =============================================================================
-- 100_master/024_business_partner_customer_extension_flows.sql
-- Metadata flows for BP-first customer intake and BP extension.
--
-- These flows are rendered by the generic EntityModeFlow controller.
-- Persistence is selected by entity_flow.config.persistence_mode and handled by
-- /api/records/business_partner/intake or /api/records/business_partner/extend.
-- =============================================================================

DO $$
DECLARE
  v_su uuid := '00000000-0000-0000-0000-000000000000';
  v_bp_ev uuid;
  v_customer_ev uuid;
  v_customer_flow uuid;
  v_extension_flow uuid;
  v_customer_step_identity uuid;
  v_customer_step_tax uuid;
  v_customer_step_review uuid;
  v_extension_step_select uuid;
  v_extension_step_company uuid;
  v_extension_step_review uuid;
BEGIN
  SELECT ev.id INTO v_bp_ev
    FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
   WHERE e.entity_code = 'business_partner'
     AND e.tenant_id IS NULL
     AND ev.version_no = 1;

  SELECT ev.id INTO v_customer_ev
    FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
   WHERE e.entity_code = 'customer'
     AND e.tenant_id IS NULL
     AND ev.version_no = 1;

  IF v_bp_ev IS NULL OR v_customer_ev IS NULL THEN
    RAISE NOTICE 'business_partner/customer entity v1 not found -- BP customer/extension flow seed skipped';
    RETURN;
  END IF;

  -- UI-only selector used by the extension flow. It is intentionally marked
  -- system-origin so normal BP detail/list rendering remains governed by
  -- display_config while Meta Studio can still manage the flow binding.
  INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    is_computed, compute_mode, validation, sort_order, created_by)
  VALUES (
    v_bp_ev, 'extension_type', 'extension_type', 'Extension Type', 'enum', 'select',
    'one', 'system', 'master.business_partner_extension_type', false, false,
    true, 'flow', NULL::jsonb, 530, v_su)
  ON CONFLICT DO NOTHING;

  UPDATE control.entity_field
     SET data_type = 'enum',
         ui_type = 'select',
         enum_domain_code = 'master.business_partner_extension_type',
         origin = 'system',
         is_filterable = false,
         is_searchable = false,
         is_sortable = false,
         is_groupable = false,
         is_aggregatable = false,
         is_computed = true,
         compute_mode = 'flow'
   WHERE entity_version_id = v_bp_ev
     AND name = 'extension_type';

  -- Customer intake flow
  INSERT INTO control.entity_flow (
    tenant_id, entity_version_id, flow_code, label, description, icon_key,
    trigger_context, is_default, config, version_no, status, effective_from, created_by)
  SELECT
    NULL, v_customer_ev,
    'customer_intake',
    'Create Business Partner as Customer',
    'BP-first AR onboarding flow: identity, customer role, identifiers, and tax reference.',
    'user-round-plus',
    'new', false,
    jsonb_build_object(
      'persistence_mode', 'business_partner_intake',
      'role',             'customer',
      'layout',           'wizard',
      'submit_label',     'Create Customer',
      'success_redirect', '/app/business_partner/{business_partner_id}'
    ),
    1, 'active', now(), v_su
  WHERE NOT EXISTS (
    SELECT 1 FROM control.entity_flow
     WHERE entity_version_id = v_customer_ev
       AND flow_code = 'customer_intake'
       AND tenant_id IS NULL);

  SELECT id INTO v_customer_flow
    FROM control.entity_flow
   WHERE entity_version_id = v_customer_ev
     AND flow_code = 'customer_intake'
     AND tenant_id IS NULL;

  UPDATE control.entity_flow
     SET label = 'Create Business Partner as Customer',
         description = 'BP-first AR onboarding flow: identity, customer role, identifiers, and tax reference.',
         config = COALESCE(config, '{}'::jsonb) || jsonb_build_object(
           'persistence_mode', 'business_partner_intake',
           'role',             'customer',
           'layout',           'wizard',
           'submit_label',     'Create Customer',
           'success_redirect', '/app/business_partner/{business_partner_id}'
         ),
         status = 'active'
   WHERE id = v_customer_flow;

  WITH parked AS (
    SELECT id,
           (-31000 + row_number() OVER (ORDER BY sort_order, step_key))::smallint AS parked_sort
      FROM control.entity_flow_step
     WHERE flow_id = v_customer_flow
  )
  UPDATE control.entity_flow_step s
     SET sort_order = parked.parked_sort
    FROM parked
   WHERE s.id = parked.id;

  INSERT INTO control.entity_flow_step
    (tenant_id, flow_id, step_key, label, icon_key, sort_order, advance_rule, layout_hint, created_by)
  VALUES
    (NULL, v_customer_flow, 'identity', 'Identity & Role', 'id-badge', 10,
     '{"required_fields":["name","customer_type"]}'::jsonb, 'two_column', v_su),
    (NULL, v_customer_flow, 'tax_identifier', 'Identifiers & Tax', 'fingerprint', 20,
     '{}'::jsonb, 'two_column', v_su),
    (NULL, v_customer_flow, 'review', 'Review & Submit', 'check-circle', 30,
     '{}'::jsonb, 'two_column', v_su)
  ON CONFLICT (flow_id, step_key) DO UPDATE SET
    label = EXCLUDED.label,
    icon_key = EXCLUDED.icon_key,
    sort_order = EXCLUDED.sort_order,
    advance_rule = EXCLUDED.advance_rule,
    layout_hint = EXCLUDED.layout_hint;

  SELECT id INTO v_customer_step_identity FROM control.entity_flow_step WHERE flow_id = v_customer_flow AND step_key = 'identity';
  SELECT id INTO v_customer_step_tax      FROM control.entity_flow_step WHERE flow_id = v_customer_flow AND step_key = 'tax_identifier';
  SELECT id INTO v_customer_step_review   FROM control.entity_flow_step WHERE flow_id = v_customer_flow AND step_key = 'review';

  DELETE FROM control.entity_flow_field
   WHERE flow_step_id IN (v_customer_step_identity, v_customer_step_tax, v_customer_step_review)
     AND tenant_id IS NULL;

  INSERT INTO control.entity_flow_field (
    tenant_id, flow_step_id, entity_field_id,
    section_key, mode, derivation_mode, ui_variant,
    visible_when, required_when, default_source,
    summary_role, span, help_text, sort_order, created_by)
  SELECT NULL, v.step_id, ef.id,
         NULL, v.mode, v.derivation_mode, v.ui_variant,
         v.visible_when, v.required_when, v.default_source,
         v.summary_role, v.span::smallint, v.help_text, v.sort_order::smallint, v_su
    FROM (VALUES
      (v_customer_step_identity, 'business_partner', 'name',                      'required', 'manual', NULL::text,      NULL::jsonb, NULL::jsonb, NULL::text,                                 'meta'::text, 1, 'Trading name as known to your organisation.',         10),
      (v_customer_step_identity, 'business_partner', 'legal_name',                'editable', 'manual', NULL::text,      NULL::jsonb, NULL::jsonb, NULL::text,                                 'meta'::text, 1, 'Registered legal name for contracts and AR.',         20),
      (v_customer_step_identity, 'business_partner', 'registration_country_code', 'editable', 'manual', 'country',       NULL::jsonb, NULL::jsonb, NULL::text,                                 'meta'::text, 1, 'Country of registration.',                            30),
      (v_customer_step_identity, 'business_partner', 'registration_no',           'editable', 'manual', NULL::text,      NULL::jsonb, NULL::jsonb, NULL::text,                                 NULL::text,   1, 'Company registration or business number.',            40),
      (v_customer_step_identity, 'business_partner', 'website_url',               'editable', 'manual', NULL::text,      NULL::jsonb, NULL::jsonb, NULL::text,                                 NULL::text,   1, NULL::text,                                             50),
      (v_customer_step_identity, 'customer',         'customer_type',             'required', 'manual', 'select',        NULL::jsonb, NULL::jsonb, 'lookup.master.customer_type.corporate',     'meta'::text, 1, NULL::text,                                             60),
      (v_customer_step_identity, 'customer',         'is_key_account',            'editable', 'manual', NULL::text,      NULL::jsonb, NULL::jsonb, 'const:false',                              NULL::text,   1, NULL::text,                                             70),
      (v_customer_step_identity, 'customer',         'risk_rating',               'editable', 'manual', 'select',        NULL::jsonb, NULL::jsonb, NULL::text,                                 NULL::text,   1, NULL::text,                                             80),
      (v_customer_step_tax,      'party_identifier', 'scheme',         'editable', 'manual', 'select',        NULL::jsonb, NULL::jsonb, NULL::text,                                 NULL::text,   1, 'Optional external identifier type.',                   10),
      (v_customer_step_tax,      'party_identifier', 'value',          'editable', 'manual', NULL::text,      NULL::jsonb, NULL::jsonb, NULL::text,                                 NULL::text,   1, 'Identifier value exactly as issued.',                  20),
      (v_customer_step_tax,      'party_tax_profile', 'tax_number',    'editable', 'manual', NULL::text,      NULL::jsonb, NULL::jsonb, NULL::text,                                 NULL::text,   1, 'Primary tax registration number.',                     30)
    ) AS v(step_id, entity_code, field_name, mode, derivation_mode, ui_variant,
           visible_when, required_when, default_source, summary_role, span, help_text, sort_order)
    JOIN control.entity e ON e.entity_code = v.entity_code AND e.tenant_id IS NULL
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    JOIN control.entity_field ef ON ef.entity_version_id = ev.id AND ef.name = v.field_name;

  -- Business partner extension flow
  INSERT INTO control.entity_flow (
    tenant_id, entity_version_id, flow_code, label, description, icon_key,
    trigger_context, is_default, config, version_no, status, effective_from, created_by)
  SELECT
    NULL, v_bp_ev,
    'business_partner_extension',
    'Business Partner Extension',
    'Add supplier/customer role or company-code scope to an existing business partner.',
    'receipt-text',
    'new', false,
    jsonb_build_object(
      'persistence_mode', 'business_partner_extension',
      'layout',           'wizard',
      'submit_label',     'Save Extension',
      'success_redirect', '/app/business_partner/{business_partner_id}'
    ),
    1, 'active', now(), v_su
  WHERE NOT EXISTS (
    SELECT 1 FROM control.entity_flow
     WHERE entity_version_id = v_bp_ev
       AND flow_code = 'business_partner_extension'
       AND tenant_id IS NULL);

  SELECT id INTO v_extension_flow
    FROM control.entity_flow
   WHERE entity_version_id = v_bp_ev
     AND flow_code = 'business_partner_extension'
     AND tenant_id IS NULL;

  UPDATE control.entity_flow
     SET label = 'Business Partner Extension',
         description = 'Add supplier/customer role or company-code scope to an existing business partner.',
         config = COALESCE(config, '{}'::jsonb) || jsonb_build_object(
           'persistence_mode', 'business_partner_extension',
           'layout',           'wizard',
           'submit_label',     'Save Extension',
           'success_redirect', '/app/business_partner/{business_partner_id}'
         ),
         status = 'active'
   WHERE id = v_extension_flow;

  WITH parked AS (
    SELECT id,
           (-32000 + row_number() OVER (ORDER BY sort_order, step_key))::smallint AS parked_sort
      FROM control.entity_flow_step
     WHERE flow_id = v_extension_flow
  )
  UPDATE control.entity_flow_step s
     SET sort_order = parked.parked_sort
    FROM parked
   WHERE s.id = parked.id;

  INSERT INTO control.entity_flow_step
    (tenant_id, flow_id, step_key, label, icon_key, sort_order, advance_rule, layout_hint, created_by)
  VALUES
    (NULL, v_extension_flow, 'select_extension', 'Select Extension', 'receipt-text', 10,
     '{"required_fields":["code","extension_type"]}'::jsonb, 'two_column', v_su),
    (NULL, v_extension_flow, 'company_scope', 'Company Code Scope', 'building-2', 20,
     '{}'::jsonb, 'two_column', v_su),
    (NULL, v_extension_flow, 'review', 'Review & Submit', 'check-circle', 30,
     '{}'::jsonb, 'two_column', v_su)
  ON CONFLICT (flow_id, step_key) DO UPDATE SET
    label = EXCLUDED.label,
    icon_key = EXCLUDED.icon_key,
    sort_order = EXCLUDED.sort_order,
    advance_rule = EXCLUDED.advance_rule,
    layout_hint = EXCLUDED.layout_hint;

  SELECT id INTO v_extension_step_select  FROM control.entity_flow_step WHERE flow_id = v_extension_flow AND step_key = 'select_extension';
  SELECT id INTO v_extension_step_company FROM control.entity_flow_step WHERE flow_id = v_extension_flow AND step_key = 'company_scope';
  SELECT id INTO v_extension_step_review  FROM control.entity_flow_step WHERE flow_id = v_extension_flow AND step_key = 'review';

  DELETE FROM control.entity_flow_field
   WHERE flow_step_id IN (v_extension_step_select, v_extension_step_company, v_extension_step_review)
     AND tenant_id IS NULL;

  INSERT INTO control.entity_flow_field (
    tenant_id, flow_step_id, entity_field_id,
    section_key, mode, derivation_mode, ui_variant,
    visible_when, required_when, default_source,
    summary_role, span, help_text, sort_order, created_by)
  SELECT NULL, v.step_id, ef.id,
         NULL, v.mode, v.derivation_mode, v.ui_variant,
         v.visible_when, v.required_when, v.default_source,
         v.summary_role, v.span::smallint, v.help_text, v.sort_order::smallint, v_su
    FROM (VALUES
      (v_extension_step_select,  'business_partner',              'code',           'required', 'manual', NULL::text,          NULL::jsonb, NULL::jsonb, NULL::text,                              'meta'::text, 1, 'Enter the BP code or UUID to extend.', 10),
      (v_extension_step_select,  'business_partner',              'extension_type', 'required', 'manual', 'select',            NULL::jsonb, NULL::jsonb, 'lookup.master.business_partner_extension_type.supplier_role', 'meta'::text, 1, NULL::text, 20),
      (v_extension_step_company, 'company_code_supplier_profile', 'company_code_id','required', 'manual', 'inline_search',     '{"in":[{"var":"extension_type"},["supplier_company_code","customer_company_code"]]}'::jsonb, NULL::jsonb, NULL::text, 'meta'::text, 1, NULL::text, 10),
      (v_extension_step_company, 'company_code_supplier_profile', 'currency_code',  'editable', 'manual', 'currency',          '{"in":[{"var":"extension_type"},["supplier_company_code","customer_company_code"]]}'::jsonb, NULL::jsonb, NULL::text, NULL::text,   1, NULL::text, 20)
    ) AS v(step_id, entity_code, field_name, mode, derivation_mode, ui_variant,
           visible_when, required_when, default_source, summary_role, span, help_text, sort_order)
    JOIN control.entity e ON e.entity_code = v.entity_code AND e.tenant_id IS NULL
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    JOIN control.entity_field ef ON ef.entity_version_id = ev.id AND ef.name = v.field_name;

  RAISE NOTICE 'BP customer and extension metadata flows seeded';
END $$;


-- ============================================================
-- SOURCE: server/db/seed/platform/005_domain_registrations/200_document/005_document_flows.sql
-- ============================================================

-- Entity flow inserts moved to 004_entity_engine/065_entity_flows.sql
-- This file is retained as a placeholder. All control.entity_flow,
-- entity_flow_step, entity_flow_section, and entity_flow_field INSERT
-- statements originally in this file have been consolidated into
-- 004_entity_engine/065_entity_flows.sql.


-- ============================================================
-- SOURCE: server/db/seed/platform/005_domain_registrations/200_document/006_document_patches.sql
-- ============================================================


-- === SOURCE: 029b_purchase_invoice_preflight.sql ===
-- =============================================================================
-- Purchase invoice create pre-flight chooser metadata.
-- Generic runtime reads this from control.entity_flow.config->preflight.
-- =============================================================================

DO $$
DECLARE
  v_su      constant uuid := '00000000-0000-0000-0000-000000000000';
  v_flow_id uuid;
BEGIN

  SELECT ef.id
    INTO v_flow_id
    FROM control.entity_flow ef
    JOIN control.entity_version ev ON ev.id = ef.entity_version_id
    JOIN control.entity e ON e.id = ev.entity_id
   WHERE e.table_schema = 'document'
     AND e.table_name = 'purchase_invoice'
     AND e.tenant_id IS NULL
     AND ev.version_no = 1
     AND ef.flow_code = 'create'
     AND ef.tenant_id IS NULL
   LIMIT 1;

  IF v_flow_id IS NULL THEN
    RAISE NOTICE '029b_purchase_invoice_preflight: purchase_invoice create flow not found - skipped';
    RETURN;
  END IF;

  UPDATE control.entity_flow
     SET config = jsonb_set(
       COALESCE(config, '{}'::jsonb),
       '{preflight}',
       jsonb_build_object(
         'enabled', true,
         'suppress_alternate_flow_launcher', true,
         'eyebrow', 'New Invoice',
         'title', 'What kind of invoice are you raising?',
         'dimensions', jsonb_build_array(
           jsonb_build_object(
             'field', 'invoice_type',
             'caption', 'Commercial purpose',
             'advanced_tiers', jsonb_build_array('advanced')
           ),
           jsonb_build_object(
             'field', 'invoice_source',
             'caption', 'Commitment basis'
           )
         ),
         'defaults', jsonb_build_object(
           'invoice_type', 'standard',
           'invoice_source', 'non_po'
         ),
         'selection_summary_label', 'You are creating',
         'profile_label', 'Routes to profile',
         'recent_label', 'Recent',
         'use_recent_label', 'Use most recent',
         'more_label', 'More types',
         'continue_label', 'Continue to Identify',
         'cancel_label', 'Exit',
         'upload', jsonb_build_object(
           'enabled', true,
           'parameter_code', 'document.intake.preflight.ocr_enabled',
           'parameter_namespace', 'document.intake.preflight',
           'label', 'Drop a PDF to auto-detect',
           'helper', 'Classifier pre-selects choices when enabled.',
           'accept', jsonb_build_array('application/pdf')
         ),
         'disable_rules', jsonb_build_array(
           jsonb_build_object(
             'when', jsonb_build_object(
               'invoice_type', 'advance',
               'invoice_source', 'one_time_supplier'
             ),
             'reason', 'Advances require an ongoing supplier relationship for future recovery.'
           ),
           jsonb_build_object(
             'when', jsonb_build_object(
               'invoice_type', 'retention_release',
               'invoice_source', 'one_time_supplier'
             ),
             'reason', 'Requires posted supplier invoices with releasable retention.'
           ),
           jsonb_build_object(
             'when', jsonb_build_object(
               'invoice_type', 'final',
               'invoice_source', 'non_po'
             ),
             'reason', 'Final invoices require a PO or contract commitment to close.'
           ),
           jsonb_build_object(
             'when', jsonb_build_object(
               'invoice_type', 'final',
               'invoice_source', 'one_time_supplier'
             ),
             'reason', 'Final invoices require a PO or contract commitment basis.'
           ),
           jsonb_build_object(
             'when', jsonb_build_object(
               'invoice_type', 'self_billed',
               'invoice_source', 'non_po'
             ),
             'reason', 'Self-billed invoices require a contractual basis.'
           ),
           jsonb_build_object(
             'when', jsonb_build_object(
               'invoice_type', 'self_billed',
               'invoice_source', 'one_time_supplier'
             ),
             'reason', 'Self-billed invoices require a contractual basis.'
           )
         ),
         'profile_rules', jsonb_build_array(
           jsonb_build_object(
             'when', jsonb_build_object('invoice_type', 'advance'),
             'profile', 'AP_ADVANCE_VENDOR'
           ),
           jsonb_build_object(
             'when', jsonb_build_object('invoice_type', 'retention_release'),
             'profile', 'AP_RETENTION_RELEASE'
           ),
           jsonb_build_object(
             'when', jsonb_build_object('invoice_source', 'non_po'),
             'profile', 'AP_NON_PO_STANDARD'
           ),
           jsonb_build_object(
             'when', jsonb_build_object('invoice_source', 'po_based'),
             'profile', 'AP_PO_STANDARD'
           ),
           jsonb_build_object(
             'when', jsonb_build_object('invoice_source', 'contract_based'),
             'profile', 'AP_CONTRACT_STANDARD'
           ),
           jsonb_build_object(
             'when', jsonb_build_object('invoice_source', 'one_time_supplier'),
             'profile', 'AP_NON_PO_STANDARD'
           )
         )
       ),
       true
     ),
     updated_at = now(),
     updated_by = v_su
   WHERE id = v_flow_id;

  RAISE NOTICE '029b_purchase_invoice_preflight: metadata-driven pre-flight chooser enabled';
END $$;


-- === SOURCE: 029c_purchase_invoice_phase1_non_po.sql ===
-- =============================================================================
-- Purchase invoice Phase 1 Non-PO type adaptations.
-- Adds metadata-driven fields and flow rules for Standard, Credit Note,
-- Debit Note, Advance, and Retention Release without UI annotation copy.
-- =============================================================================

DO $$
DECLARE
  v_su      constant uuid := '00000000-0000-0000-0000-000000000000';
  v_ev_id   uuid;
  v_flow_id uuid;
  v_step_1  uuid;
  v_step_2  uuid;
  v_step_3  uuid;
BEGIN
  SELECT ev.id INTO v_ev_id
    FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
   WHERE e.table_schema = 'document'
     AND e.table_name = 'purchase_invoice'
     AND e.tenant_id IS NULL
     AND ev.version_no = 1
   LIMIT 1;

  IF v_ev_id IS NULL THEN
    RAISE NOTICE '029c_purchase_invoice_phase1_non_po: purchase_invoice v1 not found - skipped';
    RETURN;
  END IF;

  SELECT ef.id INTO v_flow_id
    FROM control.entity_flow ef
   WHERE ef.entity_version_id = v_ev_id
     AND ef.flow_code = 'create'
     AND ef.tenant_id IS NULL
   LIMIT 1;

  IF v_flow_id IS NULL THEN
    RAISE NOTICE '029c_purchase_invoice_phase1_non_po: create flow not found - skipped';
    RETURN;
  END IF;

  SELECT id INTO v_step_1 FROM control.entity_flow_step WHERE flow_id = v_flow_id AND step_key = 'identify';
  SELECT id INTO v_step_2 FROM control.entity_flow_step WHERE flow_id = v_flow_id AND step_key = 'commercial';
  SELECT id INTO v_step_3 FROM control.entity_flow_step WHERE flow_id = v_flow_id AND step_key = 'review';

  -- Keep the explicit advance rule generic; visible required fields now gate dynamically.
  UPDATE control.entity_flow_step
     SET advance_rule = '{"required_fields":["company_code_id","supplier_id","invoice_type","invoice_source","posting_date"]}'::jsonb
   WHERE id = v_step_1;

  -- Lookup domains and values for type-specific controls are seeded in canonical files:
  --   000_lookups/LookupDomain/document/purchase_invoice_credit_reason.sql
  --   000_lookups/LookupDomain/document/purchase_invoice_debit_reason.sql
  --   000_lookups/LookupDomain/document/purchase_invoice_advance_type.sql
  --   000_lookups/LookupDomain/document/purchase_invoice_recovery_method.sql
  --   000_lookups/LookupDomain/document/purchase_invoice_release_type.sql
  --   000_lookups/LookupDomain/document/purchase_invoice_application_strategy.sql

  -- Metadata-backed and relabelled logical fields. Metadata paths are stored in json_config.
  INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, reference_config, lookup_config,
    validation, json_config, is_required, is_filterable, sort_order, created_by)
  SELECT v_ev_id, v.name, v.column_name, v.label, v.data_type,
         v.cardinality, 'standard', v.enum_domain_code, v.reference_config::jsonb, v.lookup_config::jsonb,
         v.validation::jsonb, v.json_config::jsonb, false, false, v.sort_order, v_su
  FROM (VALUES
    ('credited_invoice_id', 'reversal_of_id', 'Original Invoice Being Credited', 'reference', 'zero_or_one', NULL::text,
      '{"target_entity":"purchase_invoice","target_field":"id","display_field":"invoice_number","picker":{"label_field":"invoice_number","description_field":"description","code_field":"supplier_invoice_number","show_code":true}}',
      '{"filters":{"status":["posted","approved","partially_paid"]},"dependent_filter":{"source_field":"supplier_id","target_field":"supplier_id","empty_behavior":"none"}}',
      '{"ref_entity":"purchase_invoice"}', NULL::text, 300),
    ('debited_invoice_id', 'reversal_of_id', 'Original Invoice Being Debited', 'reference', 'zero_or_one', NULL::text,
      '{"target_entity":"purchase_invoice","target_field":"id","display_field":"invoice_number","picker":{"label_field":"invoice_number","description_field":"description","code_field":"supplier_invoice_number","show_code":true}}',
      '{"filters":{"status":["posted","approved","partially_paid"]},"dependent_filter":{"source_field":"supplier_id","target_field":"supplier_id","empty_behavior":"none"}}',
      '{"ref_entity":"purchase_invoice"}', NULL::text, 301),
    ('retention_invoice_id', 'reversal_of_id', 'Invoice With Retention', 'reference', 'zero_or_one', NULL::text,
      '{"target_entity":"purchase_invoice","target_field":"id","display_field":"invoice_number","picker":{"label_field":"invoice_number","description_field":"description","code_field":"supplier_invoice_number","show_code":true}}',
      '{"filters":{"status":["posted","approved","partially_paid"]},"dependent_filter":{"source_field":"supplier_id","target_field":"supplier_id","empty_behavior":"none"}}',
      '{"ref_entity":"purchase_invoice"}', NULL::text, 302),

    ('credit_reason', 'metadata', 'Reason for Credit', 'enum', 'zero_or_one', 'document.purchase_invoice_credit_reason',
      NULL::text, NULL::text, NULL::text, '{"path":"credit_reason"}', 310),
    ('debit_reason', 'metadata', 'Reason for Debit', 'enum', 'zero_or_one', 'document.purchase_invoice_debit_reason',
      NULL::text, NULL::text, NULL::text, '{"path":"debit_reason"}', 311),
    ('advance_type', 'metadata', 'Advance Type', 'enum', 'zero_or_one', 'document.purchase_invoice_advance_type',
      NULL::text, NULL::text, NULL::text, '{"path":"advance_type"}', 312),
    ('recovery_method', 'metadata', 'Recovery Method', 'enum', 'zero_or_one', 'document.purchase_invoice_recovery_method',
      NULL::text, NULL::text, NULL::text, '{"path":"recovery_method"}', 313),
    ('release_type', 'metadata', 'Release Type', 'enum', 'zero_or_one', 'document.purchase_invoice_release_type',
      NULL::text, NULL::text, NULL::text, '{"path":"release_type"}', 314),
    ('application_strategy', 'metadata', 'Application Strategy', 'enum', 'zero_or_one', 'document.purchase_invoice_application_strategy',
      NULL::text, NULL::text, NULL::text, '{"path":"application_strategy"}', 315),

    ('credit_reference', 'supplier_invoice_number', 'Credit Reference', 'text', 'zero_or_one', NULL::text,
      NULL::text, NULL::text, '{"max_length":100}', NULL::text, 320),
    ('credit_note_date', 'supplier_invoice_date', 'Credit Note Date', 'date', 'zero_or_one', NULL::text,
      NULL::text, NULL::text, NULL::text, NULL::text, 321),
    ('credit_note_name', 'description', 'Credit Note Name', 'text', 'zero_or_one', NULL::text,
      NULL::text, NULL::text, '{"max_length":200}', NULL::text, 322),

    ('debit_note_number', 'supplier_invoice_number', 'Debit Note No.', 'text', 'zero_or_one', NULL::text,
      NULL::text, NULL::text, '{"max_length":100}', NULL::text, 330),
    ('debit_note_date', 'supplier_invoice_date', 'Debit Note Date', 'date', 'zero_or_one', NULL::text,
      NULL::text, NULL::text, NULL::text, NULL::text, 331),
    ('debit_note_name', 'description', 'Debit Note Name', 'text', 'zero_or_one', NULL::text,
      NULL::text, NULL::text, '{"max_length":200}', NULL::text, 332),

    ('advance_request_reference', 'supplier_invoice_number', 'Supplier Request Ref.', 'text', 'zero_or_one', NULL::text,
      NULL::text, NULL::text, '{"max_length":100}', NULL::text, 340),
    ('advance_request_date', 'supplier_invoice_date', 'Request Date', 'date', 'zero_or_one', NULL::text,
      NULL::text, NULL::text, NULL::text, NULL::text, 341),
    ('advance_name', 'description', 'Advance Name', 'text', 'zero_or_one', NULL::text,
      NULL::text, NULL::text, '{"max_length":200}', NULL::text, 342),

    ('release_request_reference', 'supplier_invoice_number', 'Release Request Ref.', 'text', 'zero_or_one', NULL::text,
      NULL::text, NULL::text, '{"max_length":100}', NULL::text, 350),
    ('release_date', 'supplier_invoice_date', 'Release Date', 'date', 'zero_or_one', NULL::text,
      NULL::text, NULL::text, NULL::text, NULL::text, 351),
    ('release_name', 'description', 'Release Name', 'text', 'zero_or_one', NULL::text,
      NULL::text, NULL::text, '{"max_length":200}', NULL::text, 352)
  ) AS v(name, column_name, label, data_type, cardinality, enum_domain_code,
         reference_config, lookup_config, validation, json_config, sort_order)
  WHERE NOT EXISTS (
    SELECT 1 FROM control.entity_field ef
     WHERE ef.entity_version_id = v_ev_id
       AND ef.name = v.name
       AND ef.tenant_id IS NULL
  );

  -- Keep existing labels/config fresh on rerun.
  UPDATE control.entity_field ef
     SET label = v.label,
         column_name = v.column_name,
         data_type = v.data_type,
         enum_domain_code = v.enum_domain_code,
         reference_config = v.reference_config::jsonb,
         lookup_config = v.lookup_config::jsonb,
         validation = v.validation::jsonb,
         json_config = v.json_config::jsonb,
         updated_at = now(),
         updated_by = v_su
    FROM (VALUES
      ('credit_reason', 'metadata', 'Reason for Credit', 'enum', 'document.purchase_invoice_credit_reason', NULL::text, NULL::text, NULL::text, '{"path":"credit_reason"}'),
      ('debit_reason', 'metadata', 'Reason for Debit', 'enum', 'document.purchase_invoice_debit_reason', NULL::text, NULL::text, NULL::text, '{"path":"debit_reason"}'),
      ('advance_type', 'metadata', 'Advance Type', 'enum', 'document.purchase_invoice_advance_type', NULL::text, NULL::text, NULL::text, '{"path":"advance_type"}'),
      ('recovery_method', 'metadata', 'Recovery Method', 'enum', 'document.purchase_invoice_recovery_method', NULL::text, NULL::text, NULL::text, '{"path":"recovery_method"}'),
      ('release_type', 'metadata', 'Release Type', 'enum', 'document.purchase_invoice_release_type', NULL::text, NULL::text, NULL::text, '{"path":"release_type"}'),
      ('application_strategy', 'metadata', 'Application Strategy', 'enum', 'document.purchase_invoice_application_strategy', NULL::text, NULL::text, NULL::text, '{"path":"application_strategy"}')
    ) AS v(name, column_name, label, data_type, enum_domain_code, reference_config, lookup_config, validation, json_config)
   WHERE ef.entity_version_id = v_ev_id
     AND ef.name = v.name
     AND ef.tenant_id IS NULL;

  -- Stamp ui_hint.visible_when on invoice-type-specific fields so the overview and
  -- edit panels hide them when irrelevant (evaluated via evaluateRule in the UI).
  UPDATE control.entity_field ef
     SET ui_hint = COALESCE(ef.ui_hint, '{}'::jsonb) || v.ui_hint::jsonb,
         updated_at = now(),
         updated_by = v_su
    FROM (VALUES
      -- credit note fields
      ('credited_invoice_id',       '{"visible_when":{"==":[{"var":"invoice_type"},"credit_note"]}}'),
      ('credit_reason',             '{"visible_when":{"==":[{"var":"invoice_type"},"credit_note"]}}'),
      ('credit_reference',          '{"visible_when":{"==":[{"var":"invoice_type"},"credit_note"]}}'),
      ('credit_note_date',          '{"visible_when":{"==":[{"var":"invoice_type"},"credit_note"]}}'),
      ('credit_note_name',          '{"visible_when":{"==":[{"var":"invoice_type"},"credit_note"]}}'),
      ('application_strategy',      '{"visible_when":{"==":[{"var":"invoice_type"},"retention_release"]}}'),
      -- debit note fields
      ('debited_invoice_id',        '{"visible_when":{"==":[{"var":"invoice_type"},"debit_note"]}}'),
      ('debit_reason',              '{"visible_when":{"==":[{"var":"invoice_type"},"debit_note"]}}'),
      ('debit_note_number',         '{"visible_when":{"==":[{"var":"invoice_type"},"debit_note"]}}'),
      ('debit_note_date',           '{"visible_when":{"==":[{"var":"invoice_type"},"debit_note"]}}'),
      ('debit_note_name',           '{"visible_when":{"==":[{"var":"invoice_type"},"debit_note"]}}'),
      -- advance fields
      ('advance_type',              '{"visible_when":{"==":[{"var":"invoice_type"},"advance"]}}'),
      ('recovery_method',           '{"visible_when":{"==":[{"var":"invoice_type"},"advance"]}}'),
      ('advance_request_reference', '{"visible_when":{"==":[{"var":"invoice_type"},"advance"]}}'),
      ('advance_request_date',      '{"visible_when":{"==":[{"var":"invoice_type"},"advance"]}}'),
      ('advance_name',              '{"visible_when":{"==":[{"var":"invoice_type"},"advance"]}}'),
      -- retention release fields
      ('retention_invoice_id',      '{"visible_when":{"==":[{"var":"invoice_type"},"retention_release"]}}'),
      ('release_type',              '{"visible_when":{"==":[{"var":"invoice_type"},"retention_release"]}}'),
      ('release_request_reference', '{"visible_when":{"==":[{"var":"invoice_type"},"retention_release"]}}'),
      ('release_date',              '{"visible_when":{"==":[{"var":"invoice_type"},"retention_release"]}}'),
      ('release_name',              '{"visible_when":{"==":[{"var":"invoice_type"},"retention_release"]}}')
    ) AS v(name, ui_hint)
   WHERE ef.entity_version_id = v_ev_id
     AND ef.name = v.name
     AND ef.tenant_id IS NULL;

  -- Base Identify bindings only show for standard-like invoices; type variants provide their own labels.
  UPDATE control.entity_flow_field eff
     SET visible_when = '{"in":[{"var":"invoice_type"},["standard","final","self_billed"]]}'::jsonb
    FROM control.entity_field ef
   WHERE eff.flow_step_id = v_step_1
     AND eff.entity_field_id = ef.id
     AND ef.entity_version_id = v_ev_id
     AND ef.name IN ('supplier_invoice_number','supplier_invoice_date','description')
     AND eff.tenant_id IS NULL;

  UPDATE control.entity_flow_field eff
     SET visible_when = '{"!":{"in":[{"var":"invoice_type"},["advance","retention_release"]]}}'::jsonb
    FROM control.entity_field ef
   WHERE eff.flow_step_id = v_step_1
     AND eff.entity_field_id = ef.id
     AND ef.entity_version_id = v_ev_id
     AND ef.name = 'received_date'
     AND eff.tenant_id IS NULL;

  -- Preferred first row: Supplier left, Company Code right.
  UPDATE control.entity_flow_field eff
     SET sort_order = CASE ef.name WHEN 'supplier_id' THEN 10 WHEN 'company_code_id' THEN 20 ELSE eff.sort_order END,
         span = CASE ef.name WHEN 'supplier_id' THEN 1 WHEN 'company_code_id' THEN 1 ELSE eff.span END
    FROM control.entity_field ef
   WHERE eff.flow_step_id = v_step_1
     AND eff.entity_field_id = ef.id
     AND ef.entity_version_id = v_ev_id
     AND ef.name IN ('supplier_id','company_code_id')
     AND eff.tenant_id IS NULL;

  -- Step 1 type-specific bindings.
  INSERT INTO control.entity_flow_field (
    tenant_id, flow_step_id, entity_field_id,
    mode, derivation_mode, visible_when, required_when,
    default_source, derive_expression, override_permission,
    summary_role, ui_variant, span, help_text, sort_order, created_by)
  SELECT NULL, v_step_1, ef.id,
         v.mode, v.derivation_mode, v.visible_when::jsonb, v.required_when::jsonb,
         v.default_source, v.derive_expression, v.override_permission,
         v.summary_role, v.ui_variant, v.span, v.help_text, v.sort_order, v_su
    FROM control.entity_field ef
    JOIN (VALUES
      ('credited_invoice_id', 'required', 'manual', '{"==":[{"var":"invoice_type"},"credit_note"]}', NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 'inline_search', 2, 'Required for credit notes and scoped to the selected supplier.', 50),
      ('credit_reason', 'required', 'manual', '{"==":[{"var":"invoice_type"},"credit_note"]}', NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 'select', 1, NULL::text, 55),
      ('credit_reference', 'required', 'manual', '{"==":[{"var":"invoice_type"},"credit_note"]}', NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 1, NULL::text, 56),
      ('credit_note_date', 'required', 'manual', '{"==":[{"var":"invoice_type"},"credit_note"]}', NULL::text, 'today()', NULL::text, NULL::text, NULL::text, NULL::text, 1, NULL::text, 57),
      ('credit_note_name', 'editable', 'manual', '{"==":[{"var":"invoice_type"},"credit_note"]}', NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 2, NULL::text, 58),

      ('debited_invoice_id', 'editable', 'manual', '{"==":[{"var":"invoice_type"},"debit_note"]}', NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 'inline_search', 2, 'Optional for standalone debit notes.', 60),
      ('debit_reason', 'required', 'manual', '{"==":[{"var":"invoice_type"},"debit_note"]}', NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 'select', 1, NULL::text, 65),
      ('debit_note_number', 'required', 'manual', '{"==":[{"var":"invoice_type"},"debit_note"]}', NULL::text, 'sequence.prefix(DN)', NULL::text, NULL::text, NULL::text, NULL::text, 1, 'Auto-generated from the debit note sequence; editable until post.', 66),
      ('debit_note_date', 'required', 'manual', '{"==":[{"var":"invoice_type"},"debit_note"]}', NULL::text, 'today()', NULL::text, NULL::text, NULL::text, NULL::text, 1, NULL::text, 67),
      ('debit_note_name', 'editable', 'manual', '{"==":[{"var":"invoice_type"},"debit_note"]}', NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 2, NULL::text, 68),

      ('advance_type', 'required', 'manual', '{"==":[{"var":"invoice_type"},"advance"]}', NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 'select', 1, NULL::text, 70),
      ('recovery_method', 'required', 'manual', '{"==":[{"var":"invoice_type"},"advance"]}', NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 'select', 1, NULL::text, 71),
      ('advance_request_reference', 'required', 'manual', '{"==":[{"var":"invoice_type"},"advance"]}', NULL::text, 'sequence.prefix(ADV)', NULL::text, NULL::text, NULL::text, NULL::text, 1, NULL::text, 76),
      ('advance_request_date', 'required', 'manual', '{"==":[{"var":"invoice_type"},"advance"]}', NULL::text, 'today()', NULL::text, NULL::text, NULL::text, NULL::text, 1, NULL::text, 77),
      ('advance_name', 'editable', 'manual', '{"==":[{"var":"invoice_type"},"advance"]}', NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 2, NULL::text, 78),

      ('retention_invoice_id', 'required', 'manual', '{"==":[{"var":"invoice_type"},"retention_release"]}', NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 'inline_search', 2, 'Select a posted invoice with unreleased retention.', 80),
      ('release_type', 'required', 'manual', '{"==":[{"var":"invoice_type"},"retention_release"]}', NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 'select', 1, NULL::text, 85),
      ('release_request_reference', 'required', 'manual', '{"==":[{"var":"invoice_type"},"retention_release"]}', NULL::text, 'sequence.prefix(RR)', NULL::text, NULL::text, NULL::text, NULL::text, 1, NULL::text, 86),
      ('release_date', 'required', 'manual', '{"==":[{"var":"invoice_type"},"retention_release"]}', NULL::text, 'today()', NULL::text, NULL::text, NULL::text, NULL::text, 1, NULL::text, 87),
      ('release_name', 'editable', 'manual', '{"==":[{"var":"invoice_type"},"retention_release"]}', NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 2, NULL::text, 88)
    ) AS v(field_name, mode, derivation_mode, visible_when, required_when,
           default_source, derive_expression, override_permission,
           summary_role, ui_variant, span, help_text, sort_order)
      ON ef.name = v.field_name
     AND ef.entity_version_id = v_ev_id
  ON CONFLICT (flow_step_id, entity_field_id) DO UPDATE SET
    mode = EXCLUDED.mode,
    derivation_mode = EXCLUDED.derivation_mode,
    visible_when = EXCLUDED.visible_when,
    required_when = EXCLUDED.required_when,
    default_source = EXCLUDED.default_source,
    derive_expression = EXCLUDED.derive_expression,
    override_permission = EXCLUDED.override_permission,
    summary_role = EXCLUDED.summary_role,
    ui_variant = EXCLUDED.ui_variant,
    span = EXCLUDED.span,
    help_text = EXCLUDED.help_text,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = v_su;

  -- Commercial step: adjustment visibility and no-tax derivation for advance/retention.
  UPDATE control.entity_flow_field eff
     SET visible_when = '{"in":[{"var":"invoice_type"},["standard","final","self_billed"]]}'::jsonb
    FROM control.entity_field ef
   WHERE eff.flow_step_id = v_step_2
     AND eff.entity_field_id = ef.id
     AND ef.entity_version_id = v_ev_id
     AND ef.name IN ('discount_amount','freight_amount','misc_charges_amount','retention_amount')
     AND eff.tenant_id IS NULL;

  UPDATE control.entity_flow_field eff
     SET visible_when = '{"in":[{"var":"invoice_type"},["standard","credit_note","final","self_billed"]]}'::jsonb
    FROM control.entity_field ef
   WHERE eff.flow_step_id = v_step_2
     AND eff.entity_field_id = ef.id
     AND ef.entity_version_id = v_ev_id
     AND ef.name = 'withholding_tax_amount'
     AND eff.tenant_id IS NULL;

  UPDATE control.entity_flow_field eff
     SET derive_expression = 'tax.mode_for_invoice_type(invoice_type, supplier_id, tax_group_id, company_code_id)',
         default_source = NULL
    FROM control.entity_field ef
   WHERE eff.flow_step_id = v_step_2
     AND eff.entity_field_id = ef.id
     AND ef.entity_version_id = v_ev_id
     AND ef.name = 'tax_mode'
     AND eff.tenant_id IS NULL;

  UPDATE control.entity_flow_section
     SET visible_when = '{"!":{"in":[{"var":"invoice_type"},["advance","retention_release"]]}}'::jsonb
   WHERE flow_step_id = v_step_2
     AND section_key = 'lines'
     AND tenant_id IS NULL;

  INSERT INTO control.entity_flow_section (
    tenant_id, flow_step_id, section_key, label, description, sort_order,
    collapse_default, visible_when, reveal_behavior,
    section_type, entity_code, payload_key, field_codes, min_rows, default_row, created_by)
  VALUES
  (NULL, v_step_2, 'advance_lines', 'Advance Line', 'Single advance payment line.', 6,
   false, '{"==":[{"var":"invoice_type"},"advance"]}'::jsonb, 'auto_expand',
   'repeater', 'purchase_invoice_line', 'lines',
   '["item_description","procurement_type","uom_code","quantity","unit_price","gross_amount","commodity_category_id","business_intent_id","cost_center_id","profit_center_id","project_id","site_id"]'::jsonb,
   1, '{"item_description":"Advance Payment","procurement_type":"services","uom_code":"EA","quantity":1}'::jsonb, v_su),
  (NULL, v_step_2, 'retention_release_lines', 'Retention Release Line', 'Release amount line for selected retention.', 7,
   false, '{"==":[{"var":"invoice_type"},"retention_release"]}'::jsonb, 'auto_expand',
   'repeater', 'purchase_invoice_line', 'lines',
   '["item_description","procurement_type","uom_code","quantity","unit_price","gross_amount","commodity_category_id","business_intent_id","cost_center_id","profit_center_id","project_id","site_id"]'::jsonb,
   1, '{"item_description":"Retention Release","procurement_type":"services","uom_code":"EA","quantity":1}'::jsonb, v_su)
  ON CONFLICT (flow_step_id, section_key) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    collapse_default = EXCLUDED.collapse_default,
    visible_when = EXCLUDED.visible_when,
    reveal_behavior = EXCLUDED.reveal_behavior,
    section_type = EXCLUDED.section_type,
    entity_code = EXCLUDED.entity_code,
    payload_key = EXCLUDED.payload_key,
    field_codes = EXCLUDED.field_codes,
    min_rows = EXCLUDED.min_rows,
    default_row = EXCLUDED.default_row,
    updated_at = now(),
    updated_by = v_su;

  -- Review step: application strategy and type-specific hidden match status.
  INSERT INTO control.entity_flow_field (
    tenant_id, flow_step_id, entity_field_id,
    mode, derivation_mode, visible_when, required_when,
    default_source, derive_expression, override_permission,
    summary_role, ui_variant, span, help_text, sort_order, created_by)
  SELECT NULL, v_step_3, ef.id,
         'required', 'manual',
         '{"==":[{"var":"invoice_type"},"credit_note"]}'::jsonb,
         NULL::jsonb,
         NULL, NULL, NULL,
         NULL, 'select', 2,
         'When and how this credit is applied to open payable.',
         50, v_su
    FROM control.entity_field ef
   WHERE ef.entity_version_id = v_ev_id
     AND ef.name = 'application_strategy'
  ON CONFLICT (flow_step_id, entity_field_id) DO UPDATE SET
    mode = EXCLUDED.mode,
    derivation_mode = EXCLUDED.derivation_mode,
    visible_when = EXCLUDED.visible_when,
    required_when = EXCLUDED.required_when,
    ui_variant = EXCLUDED.ui_variant,
    span = EXCLUDED.span,
    help_text = EXCLUDED.help_text,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = v_su;

  UPDATE control.entity_flow_field eff
     SET visible_when = '{"!":{"in":[{"var":"invoice_type"},["advance","retention_release"]]}}'::jsonb
    FROM control.entity_field ef
   WHERE eff.flow_step_id = v_step_3
     AND eff.entity_field_id = ef.id
     AND ef.entity_version_id = v_ev_id
     AND ef.name = 'match_status'
     AND eff.tenant_id IS NULL;

  RAISE NOTICE '029c_purchase_invoice_phase1_non_po: type-specific intake fields and rules applied';
END $$;


-- === SOURCE: 031_journal_entry_flow_repair.sql ===
-- platform/005_domain_registrations/200_document/031_journal_entry_flow_repair.sql
-- Purpose: forward repair for databases where 030_journal_entry_flow.sql was
--          recorded as applied before the canonical journal_entry entity/version
--          existed. Fresh databases skip this after 030 has created the flow.

DO $$
DECLARE
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_ev_id   uuid;
    v_flow_id uuid;
    v_step_1  uuid;
    v_step_2  uuid;
BEGIN
    SELECT ev.id INTO v_ev_id
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id
    WHERE e.entity_code = 'journal_entry'
      AND e.tenant_id IS NULL
      AND ev.tenant_id IS NULL
      AND ev.version_no = 1;

    IF v_ev_id IS NULL THEN
        RAISE NOTICE '031_journal_entry_flow_repair skipped: entity version not found';
        RETURN;
    END IF;

    SELECT id INTO v_flow_id
    FROM control.entity_flow
    WHERE entity_version_id = v_ev_id
      AND flow_code = 'create'
      AND tenant_id IS NULL
      AND version_no = 1;

    IF v_flow_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM control.entity_flow_step WHERE flow_id = v_flow_id)
       AND EXISTS (
           SELECT 1
           FROM control.entity_flow_field eff
           JOIN control.entity_flow_step efs ON efs.id = eff.flow_step_id
           WHERE efs.flow_id = v_flow_id
       )
       AND EXISTS (
           SELECT 1
           FROM control.entity_flow_section efsn
           JOIN control.entity_flow_step efs ON efs.id = efsn.flow_step_id
           WHERE efs.flow_id = v_flow_id
       )
    THEN
        RAISE NOTICE '031_journal_entry_flow_repair skipped: create flow already complete';
        RETURN;
    END IF;

    INSERT INTO control.entity_flow (
        tenant_id, entity_version_id, flow_code, label, description, icon_key,
        trigger_context, is_default, config, version_no, status, effective_from, created_by)
    SELECT
        NULL, v_ev_id, 'create',
        'Create Journal Entry',
        'Manual journal entry create flow with posting header and balanced lines.',
        'book-plus',
        'new', true,
        jsonb_build_object(
            'layout', 'wizard_with_summary',
            'intake_variant', 'minimal_header_then_lines',
            'input_modes', jsonb_build_array('manual','source_adjustment','import'),
            'line_reference_strategy', 'none',
            'summary', jsonb_build_object(
                'fields', jsonb_build_array('company_code_id','posting_date','transaction_currency','exchange_rate','total_debit','total_credit','line_count'),
                'line_collection', 'journal_line',
                'balance_rule', 'debit_equals_credit'
            ),
            'controls', jsonb_build_object(
                'submit_requires_balance', true,
                'submit_requires_min_lines', 2,
                'post_requires_approval', true
            )
        ),
        1, 'active', now(), v_su
    WHERE NOT EXISTS (
        SELECT 1 FROM control.entity_flow
        WHERE entity_version_id = v_ev_id
          AND flow_code = 'create'
          AND tenant_id IS NULL
          AND version_no = 1
    );

    UPDATE control.entity_flow
       SET label = 'Create Journal Entry',
           description = 'Manual journal entry create flow with posting header and balanced lines.',
           icon_key = 'book-plus',
           trigger_context = 'new',
           is_default = true,
           status = 'active',
           config = jsonb_build_object(
               'layout', 'wizard_with_summary',
               'intake_variant', 'minimal_header_then_lines',
               'input_modes', jsonb_build_array('manual','source_adjustment','import'),
               'line_reference_strategy', 'none',
               'summary', jsonb_build_object(
                   'fields', jsonb_build_array('company_code_id','posting_date','transaction_currency','exchange_rate','total_debit','total_credit','line_count'),
                   'line_collection', 'journal_line',
                   'balance_rule', 'debit_equals_credit'
               ),
               'controls', jsonb_build_object(
                   'submit_requires_balance', true,
                   'submit_requires_min_lines', 2,
                   'post_requires_approval', true
               )
           ),
           updated_at = now(),
           updated_by = v_su
     WHERE entity_version_id = v_ev_id
       AND flow_code = 'create'
       AND tenant_id IS NULL
       AND version_no = 1;

    SELECT id INTO v_flow_id
    FROM control.entity_flow
    WHERE entity_version_id = v_ev_id
      AND flow_code = 'create'
      AND tenant_id IS NULL
      AND version_no = 1;

    INSERT INTO control.entity_flow_step
        (tenant_id, flow_id, step_key, label, icon_key, sort_order, advance_rule, layout_hint, created_by)
    VALUES
        (NULL, v_flow_id, 'posting_header', 'Posting Header', 'landmark', 10,
         '{"required_fields":["company_code_id","posting_date","document_date","transaction_currency","description"]}'::jsonb,
         'summary_side', v_su),
        (NULL, v_flow_id, 'journal_lines', 'Journal Lines', 'list-plus', 20,
         '{"required_sections":["lines"],"min_rows":{"lines":2},"balance_rule":"debit_equals_credit","pre_submit_checks":["line_count_min_2","debits_equal_credits","period_open","posting_controls"]}'::jsonb,
         'line_editor', v_su)
    ON CONFLICT (flow_id, step_key) DO UPDATE SET
        label = EXCLUDED.label,
        icon_key = EXCLUDED.icon_key,
        sort_order = EXCLUDED.sort_order,
        advance_rule = EXCLUDED.advance_rule,
        layout_hint = EXCLUDED.layout_hint;

    SELECT id INTO v_step_1 FROM control.entity_flow_step WHERE flow_id = v_flow_id AND step_key = 'posting_header';
    SELECT id INTO v_step_2 FROM control.entity_flow_step WHERE flow_id = v_flow_id AND step_key = 'journal_lines';

    DELETE FROM control.entity_flow_field
    WHERE flow_step_id IN (v_step_1, v_step_2)
      AND tenant_id IS NULL;

    INSERT INTO control.entity_flow_section (
        tenant_id, flow_step_id, section_key, label, description, sort_order,
        collapse_default, visible_when, reveal_behavior,
        section_type, entity_code, payload_key, field_codes, min_rows, default_row,
        created_by)
    VALUES
        (NULL, v_step_1, 'identity', 'Identity', NULL, 10,
         false, NULL, 'honor_default',
         'fields', NULL, NULL, NULL, NULL, NULL, v_su),
        (NULL, v_step_1, 'posting', 'Posting', NULL, 20,
         false, NULL, 'honor_default',
         'fields', NULL, NULL, NULL, NULL, NULL, v_su),
        (NULL, v_step_1, 'source', 'Source', NULL, 30,
         true, NULL, 'honor_default',
         'fields', NULL, NULL, NULL, NULL, NULL, v_su),
        (NULL, v_step_2, 'lines', 'Lines',
         'Debit and credit lines. The DB validates polarity, balance, dimensions, posting controls, and budget.',
         10, false, NULL, 'auto_expand',
         'repeater', 'journal_line', 'lines',
         '["line_no","gl_account_id","description","transaction_debit","transaction_credit","exchange_rate","cost_center_id","profit_center_id","project_id","party_type","party_id"]'::jsonb,
         2,
         '{"transaction_debit":0,"transaction_credit":0}'::jsonb,
         v_su),
        (NULL, v_step_2, 'summary', 'Summary', NULL, 20,
         false, NULL, 'honor_default',
         'summary', NULL, NULL, NULL, NULL, NULL, v_su)
    ON CONFLICT (flow_step_id, section_key) DO UPDATE SET
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        sort_order = EXCLUDED.sort_order,
        collapse_default = EXCLUDED.collapse_default,
        visible_when = EXCLUDED.visible_when,
        reveal_behavior = EXCLUDED.reveal_behavior,
        section_type = EXCLUDED.section_type,
        entity_code = EXCLUDED.entity_code,
        payload_key = EXCLUDED.payload_key,
        field_codes = EXCLUDED.field_codes,
        min_rows = EXCLUDED.min_rows,
        default_row = EXCLUDED.default_row;

    INSERT INTO control.entity_flow_field (
        tenant_id, flow_step_id, entity_field_id,
        section_key, mode, derivation_mode, visible_when, required_when,
        default_source, derive_expression, override_permission,
        summary_role, ui_variant, span, display_size,
        help_text, sort_order, created_by)
    SELECT NULL, v_step_1, ef.id,
           v.section_key, v.mode, v.derivation_mode,
           v.visible_when::jsonb, v.required_when::jsonb,
           v.default_source, v.derive_expression, v.override_permission,
           v.summary_role, v.ui_variant, v.span, v.display_size,
           v.help_text, COALESCE(v.sort_order, ef.sort_order), v_su
    FROM control.entity_field ef
    JOIN (VALUES
        ('status',               'identity', 'chip',     'derived_locked', NULL, NULL, NULL, 'const:draft', NULL, 'meta', 'chip', 1, 'compact', NULL, NULL::smallint),
        ('company_code_id',      'posting',  'required', 'derived_overrideable', NULL, NULL, NULL, 'ctx.user.default_company_code', 'je.override_company_code', NULL, 'inline_search', 1, 'standard', NULL, NULL::smallint),
        ('book_id',              'posting',  'required', 'derived_overrideable', NULL, NULL, NULL, 'company_code.default_manual_ledger_book(company_code_id)', 'je.override_book', NULL, 'inline_search', 1, 'standard', NULL, NULL::smallint),
        ('posting_date',         'posting',  'required', 'manual', NULL, NULL, 'today()', NULL, NULL, NULL, NULL, 1, 'standard', NULL, NULL::smallint),
        ('document_date',        'posting',  'required', 'derived_overrideable', NULL, NULL, 'field.posting_date', 'field.posting_date', 'je.override_document_date', NULL, NULL, 1, 'standard', NULL, NULL::smallint),
        ('transaction_currency', 'posting',  'required', 'derived_overrideable', NULL, NULL, NULL, 'company_code.base_currency(company_code_id)', 'je.override_currency', NULL, 'currency', 1, 'standard', NULL, NULL::smallint),
        ('base_currency',        'posting',  'readonly', 'derived_locked', NULL, NULL, NULL, 'company_code.base_currency(company_code_id)', NULL, 'meta', 'currency', 1, 'compact', NULL, NULL::smallint),
        ('source_type',          'source',   'chip',     'derived_locked', NULL, NULL, NULL, 'const:manual', NULL, 'meta', 'chip', 1, 'compact', NULL, NULL::smallint),
        ('description',          'source',   'required', 'manual', NULL, NULL, NULL, NULL, NULL, NULL, 'textarea', 3, 'standard', NULL, NULL::smallint)
    ) AS v(field_name, section_key, mode, derivation_mode, visible_when, required_when,
           default_source, derive_expression, override_permission,
           summary_role, ui_variant, span, display_size, help_text, sort_order)
      ON ef.name = v.field_name
    WHERE ef.entity_version_id = v_ev_id;

    INSERT INTO control.entity_flow_field (
        tenant_id, flow_step_id, entity_field_id,
        section_key, mode, derivation_mode, visible_when, required_when,
        default_source, derive_expression, override_permission,
        summary_role, ui_variant, span, display_size,
        help_text, sort_order, created_by)
    SELECT NULL, v_step_2, ef.id,
           v.section_key, v.mode, v.derivation_mode,
           v.visible_when::jsonb, v.required_when::jsonb,
           v.default_source, v.derive_expression, v.override_permission,
           v.summary_role, v.ui_variant, v.span, v.display_size,
           v.help_text, v.sort_order, v_su
    FROM control.entity_field ef
    JOIN (VALUES
        ('total_debit',            'summary',  'summary_only', 'derived_locked', NULL::text, NULL::text, NULL, 'lines.sum(base_debit)', NULL, 'total', 'money_big', 1, 'prominent', NULL, 10),
        ('total_credit',           'summary',  'summary_only', 'derived_locked', NULL, NULL, NULL, 'lines.sum(base_credit)', NULL, 'total', 'money_big', 1, 'prominent', NULL, 20),
        ('line_count',             'summary',  'summary_only', 'derived_locked', NULL, NULL, NULL, 'lines.count()', NULL, 'meta', 'chip', 1, 'compact', NULL, 30),
        ('fiscal_year',            'summary',  'summary_only', 'derived_locked', NULL, NULL, NULL, 'fiscal.year_from(posting_date, company_code_id)', NULL, 'meta', 'chip', 1, 'compact', NULL, 40),
        ('period_number',          'summary',  'summary_only', 'derived_locked', NULL, NULL, NULL, 'fiscal.period_from(posting_date, company_code_id)', NULL, 'meta', 'chip', 1, 'compact', NULL, 50)
    ) AS v(field_name, section_key, mode, derivation_mode, visible_when, required_when,
           default_source, derive_expression, override_permission,
           summary_role, ui_variant, span, display_size, help_text, sort_order)
      ON ef.name = v.field_name
    WHERE ef.entity_version_id = v_ev_id;

    RAISE NOTICE '031_journal_entry_flow_repair backfilled create flow: flow=%, steps=%',
        v_flow_id,
        (SELECT count(*) FROM control.entity_flow_step WHERE flow_id = v_flow_id);
END $$;


-- === SOURCE: 033_journal_entry_flow_two_step.sql ===
-- platform/005_domain_registrations/200_document/033_journal_entry_flow_two_step.sql
-- Purpose: collapse manual Journal Entry create flow to Header -> Journal Lines.

DO $$
DECLARE
    v_su             uuid := '00000000-0000-0000-0000-000000000000';
    v_ev_id          uuid;
    v_flow_id        uuid;
    v_lines_step_id  uuid;
    v_review_step_id uuid;
    v_deleted_steps  integer := 0;
BEGIN
    SELECT ev.id INTO v_ev_id
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id
    WHERE e.entity_code = 'journal_entry'
      AND e.tenant_id IS NULL
      AND ev.tenant_id IS NULL
      AND ev.version_no = 1;

    IF v_ev_id IS NULL THEN
        RAISE NOTICE '033_journal_entry_flow_two_step skipped: entity version not found';
        RETURN;
    END IF;

    SELECT id INTO v_flow_id
    FROM control.entity_flow
    WHERE entity_version_id = v_ev_id
      AND flow_code = 'create'
      AND tenant_id IS NULL
      AND version_no = 1;

    IF v_flow_id IS NULL THEN
        RAISE NOTICE '033_journal_entry_flow_two_step skipped: create flow not found';
        RETURN;
    END IF;

    SELECT id INTO v_lines_step_id
    FROM control.entity_flow_step
    WHERE flow_id = v_flow_id
      AND tenant_id IS NULL
      AND step_key = 'journal_lines';

    IF v_lines_step_id IS NULL THEN
        RAISE NOTICE '033_journal_entry_flow_two_step skipped: journal_lines step not found';
        RETURN;
    END IF;

    SELECT id INTO v_review_step_id
    FROM control.entity_flow_step
    WHERE flow_id = v_flow_id
      AND tenant_id IS NULL
      AND step_key = 'review';

    UPDATE control.entity_flow
       SET description = 'Manual journal entry create flow with posting header and balanced lines.',
           updated_at = now(),
           updated_by = v_su
     WHERE id = v_flow_id;

    UPDATE control.entity_flow_step
       SET label = 'Journal Lines',
           icon_key = 'list-plus',
           sort_order = 20,
           advance_rule = '{"required_sections":["lines"],"min_rows":{"lines":2},"balance_rule":"debit_equals_credit","pre_submit_checks":["line_count_min_2","debits_equal_credits","period_open","posting_controls"]}'::jsonb,
           layout_hint = 'line_editor',
           updated_at = now(),
           updated_by = v_su
     WHERE id = v_lines_step_id;

    INSERT INTO control.entity_flow_section (
        tenant_id, flow_step_id, section_key, label, description, sort_order,
        collapse_default, visible_when, reveal_behavior,
        section_type, entity_code, payload_key, field_codes, min_rows, default_row,
        created_by)
    VALUES (
        NULL, v_lines_step_id, 'summary', 'Summary', NULL, 20,
        false, NULL, 'honor_default',
        'summary', NULL, NULL, NULL, NULL, NULL, v_su
    )
    ON CONFLICT (flow_step_id, section_key) DO UPDATE SET
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        sort_order = EXCLUDED.sort_order,
        collapse_default = EXCLUDED.collapse_default,
        visible_when = EXCLUDED.visible_when,
        reveal_behavior = EXCLUDED.reveal_behavior,
        section_type = EXCLUDED.section_type,
        entity_code = EXCLUDED.entity_code,
        payload_key = EXCLUDED.payload_key,
        field_codes = EXCLUDED.field_codes,
        min_rows = EXCLUDED.min_rows,
        default_row = EXCLUDED.default_row,
        updated_at = now(),
        updated_by = v_su;

    INSERT INTO control.entity_flow_field (
        tenant_id, flow_step_id, entity_field_id,
        section_key, mode, derivation_mode, visible_when, required_when,
        default_source, derive_expression, override_permission,
        summary_role, ui_variant, span, display_size,
        help_text, sort_order, created_by)
    SELECT NULL, v_lines_step_id, ef.id,
           v.section_key, v.mode, v.derivation_mode,
           v.visible_when::jsonb, v.required_when::jsonb,
           v.default_source, v.derive_expression, v.override_permission,
           v.summary_role, v.ui_variant, v.span, v.display_size,
           v.help_text, v.sort_order, v_su
    FROM control.entity_field ef
    JOIN (VALUES
        ('total_debit',   'summary', 'summary_only', 'derived_locked', NULL::text, NULL::text, NULL::text, 'lines.sum(base_debit)', NULL::text, 'total', 'money_big', 1, 'prominent', NULL::text, 10),
        ('total_credit',  'summary', 'summary_only', 'derived_locked', NULL::text, NULL::text, NULL::text, 'lines.sum(base_credit)', NULL::text, 'total', 'money_big', 1, 'prominent', NULL::text, 20),
        ('line_count',    'summary', 'summary_only', 'derived_locked', NULL::text, NULL::text, NULL::text, 'lines.count()', NULL::text, 'meta', 'chip', 1, 'compact', NULL::text, 30),
        ('fiscal_year',   'summary', 'summary_only', 'derived_locked', NULL::text, NULL::text, NULL::text, 'fiscal.year_from(posting_date, company_code_id)', NULL::text, 'meta', 'chip', 1, 'compact', NULL::text, 40),
        ('period_number', 'summary', 'summary_only', 'derived_locked', NULL::text, NULL::text, NULL::text, 'fiscal.period_from(posting_date, company_code_id)', NULL::text, 'meta', 'chip', 1, 'compact', NULL::text, 50)
    ) AS v(field_name, section_key, mode, derivation_mode, visible_when, required_when,
           default_source, derive_expression, override_permission,
           summary_role, ui_variant, span, display_size, help_text, sort_order)
      ON ef.name = v.field_name
    WHERE ef.entity_version_id = v_ev_id
    ON CONFLICT (flow_step_id, entity_field_id) DO UPDATE SET
        section_key = EXCLUDED.section_key,
        mode = EXCLUDED.mode,
        derivation_mode = EXCLUDED.derivation_mode,
        visible_when = EXCLUDED.visible_when,
        required_when = EXCLUDED.required_when,
        default_source = EXCLUDED.default_source,
        derive_expression = EXCLUDED.derive_expression,
        override_permission = EXCLUDED.override_permission,
        summary_role = EXCLUDED.summary_role,
        ui_variant = EXCLUDED.ui_variant,
        span = EXCLUDED.span,
        display_size = EXCLUDED.display_size,
        help_text = EXCLUDED.help_text,
        sort_order = EXCLUDED.sort_order,
        updated_at = now(),
        updated_by = v_su;

    IF v_review_step_id IS NOT NULL THEN
        DELETE FROM control.entity_flow_field
        WHERE flow_step_id = v_review_step_id
          AND tenant_id IS NULL;

        DELETE FROM control.entity_flow_section
        WHERE flow_step_id = v_review_step_id
          AND tenant_id IS NULL;

        DELETE FROM control.entity_flow_step
        WHERE id = v_review_step_id
          AND tenant_id IS NULL;

        GET DIAGNOSTICS v_deleted_steps = ROW_COUNT;
    END IF;

    RAISE NOTICE '033_journal_entry_flow_two_step completed: removed % review step(s)', v_deleted_steps;
END $$;
