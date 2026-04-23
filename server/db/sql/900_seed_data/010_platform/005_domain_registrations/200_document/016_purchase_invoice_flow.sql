-- =============================================================================
-- 010_platform/005_domain_registrations/200_document/016_purchase_invoice_flow.sql
-- Standard 'create' flow for document.purchase_invoice (3-step wizard).
-- VERSION 2 — redesigned Step 2 (source-aware, 4 sections, tax_mode, §stage2).
-- Changes from v1:
--   - Field names fixed: total_amount (was gross_amount), supplier_invoice_number (was vendor_invoice_ref)
--   - Step 2 restructured with entity_flow_section groupings
--   - tax_mode binding added (Step 2, amount_basis section)
--   - payment_method_id relocated from Step 2 → Step 3
--   - JSONLogic predicates: lowercase values throughout
-- Depends on: 001_invoice.sql, 001_invoice_v2.sql, 015_ap_override_permissions.sql,
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
        'collapse_zero_adjustments', true,
        'running_totals', jsonb_build_array('gross','tax','wht','deductions','payable')),
      'input_modes', jsonb_build_array('form','scan','from_commitment','import'),
      'dedup', jsonb_build_object(
        'index', 'pi_supplier_invoice_dedup_idx',
        'trigger_fields', jsonb_build_array('supplier_id','supplier_invoice_number','supplier_invoice_date')),
      'assist', jsonb_build_object(
        'budget_precheck', true, 'ocr_prefill', true,
        'vendor_enrichment', true, 'po_prefill', true),
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
         'collapse_zero_adjustments', true,
         'running_totals', jsonb_build_array('gross','tax','wht','deductions','payable')),
       'input_modes', jsonb_build_array('form','scan','from_commitment','import'),
       'dedup', jsonb_build_object(
         'index', 'pi_supplier_invoice_dedup_idx',
         'trigger_fields', jsonb_build_array('supplier_id','supplier_invoice_number','supplier_invoice_date')),
       'assist', jsonb_build_object(
         'budget_precheck', true, 'ocr_prefill', true,
         'vendor_enrichment', true, 'po_prefill', true),
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
   '{"required_fields":["company_code_id","invoice_type","invoice_source","supplier_id","vendor_invoice_ref","supplier_invoice_date","posting_date","received_date"]}'::jsonb,
   'summary_side', v_su),
  (NULL, v_flow_id, 'commercial', 'Commercial', 'receipt',      20,
   '{"required_fields":["total_amount","tax_mode"]}'::jsonb,
   'summary_side', v_su),
  (NULL, v_flow_id, 'review',     'Review',     'check-circle', 30,
   '{"required_fields":[]}'::jsonb,
   'summary_side', v_su)
  ON CONFLICT (flow_id, step_key) DO NOTHING;

  -- Always update advance_rules to current spec
  UPDATE control.entity_flow_step
     SET advance_rule = '{"required_fields":["company_code_id","invoice_type","invoice_source","supplier_id","vendor_invoice_ref","supplier_invoice_date","posting_date","received_date"]}'::jsonb
   WHERE flow_id = v_flow_id AND step_key = 'identify';
  UPDATE control.entity_flow_step
     SET advance_rule = '{"required_fields":["total_amount","tax_mode"]}'::jsonb
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
     collapse_default, visible_when, reveal_behavior, created_by)
  VALUES
  (NULL, v_step_2, 'amount_basis',    'Amount Basis',
   'Invoice Total, tax interpretation, and derived amounts.',
   10, false, NULL, 'honor_default', v_su),
  (NULL, v_step_2, 'settlement_terms','Settlement Terms',
   'Payment terms, baseline date, and computed due date.',
   20, false, NULL, 'honor_default', v_su),
  (NULL, v_step_2, 'adjustments',     'Adjustments',
   'Discounts, additional charges, withholding tax, advance recovery, and retention.',
   30, true, NULL, 'honor_default', v_su),
  (NULL, v_step_2, 'fx',              'Foreign Exchange',
   NULL,
   40, true,
   '{"!=":[{"var":"currency_code"},{"var":"base_currency_code"}]}'::jsonb,
   'auto_expand', v_su)
  ON CONFLICT (flow_step_id, section_key) DO UPDATE SET
    label          = EXCLUDED.label,
    description    = EXCLUDED.description,
    sort_order     = EXCLUDED.sort_order,
    collapse_default = EXCLUDED.collapse_default,
    visible_when   = EXCLUDED.visible_when,
    reveal_behavior = EXCLUDED.reveal_behavior;

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
      'Company posting the invoice.', 10),
    ('invoice_type',          'required',  'manual',
      NULL, NULL, 'lookup.document.purchase_invoice_type.standard', NULL, NULL,
      NULL, 'radio_cards', 2,
      'Invoice type. Five primary choices visible; use More… for Debit Note or Self-Billed.', 20),
    ('invoice_source',        'required',  'manual',
      NULL, NULL, 'lookup.document.purchase_invoice_source.po_based', NULL, NULL,
      NULL, 'segmented', 2,
      'Determines PO/commitment requirement and three-way/two-way match type.', 30),
    ('supplier_id',           'required',  'manual',
      NULL, NULL, NULL, NULL, NULL, NULL, 'inline_search', 2, NULL, 40),
    ('commitment_id',         'editable',  'manual',
      '{"in":[{"var":"invoice_source"},["po_based","contract_based"]]}',
      '{"in":[{"var":"invoice_source"},["po_based","contract_based"]]}',
      NULL, NULL, NULL, NULL, 'inline_search', 2,
      'Required for PO-based and contract-based invoices.', 50),
    ('vendor_invoice_ref',     'required', 'manual',
      NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1,
      'Number printed on the vendor''s invoice. Triggers duplicate detection.', 60),
    ('supplier_invoice_date', 'required',  'manual',
      NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1,
      'Date printed on the vendor''s invoice.', 70),
    ('posting_date',          'required',  'derived_overrideable',
      NULL, NULL, NULL, 'today()',
      'ap.override_posting_date', NULL, NULL, 1,
      'GL posting date. Drives fiscal year, period, and FX rate lookup.', 80),
    ('received_date',         'required',  'manual',
      NULL, NULL, 'today()', NULL, NULL, NULL, NULL, 1, NULL, 90),
    ('description',           'editable',  'manual',
      NULL, NULL, NULL, NULL, NULL, NULL, NULL, 3, NULL, 100),
    ('currency_code',         'chip',      'derived_overrideable',
      NULL, NULL, NULL,
      'vendor.default_currency(supplier_id)', 'ap.override_currency',
      'meta', 'chip', 1, 'Derived from vendor master. Override requires permission.', 200),
    ('match_type',            'chip',      'derived_locked',
      NULL, NULL, NULL,
      'matching.match_type_from_source(invoice_source)', NULL,
      'meta', 'chip', 1, 'Determined by invoice source.', 210),
    ('payment_term_id',       'chip',      'derived_overrideable',
      NULL, NULL, NULL,
      'vendor.default_payment_term(supplier_id, company_code_id)', 'ap.override_payment_term',
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
      NULL, 'vendor.default_currency(supplier_id)', 'ap.override_currency',
      NULL, 'chip', 1, 'standard', 'amount_basis', NULL, 5),

    ('total_amount',            'required',     'derived_overrideable',
      NULL, NULL,
      NULL, 'line_summary.total_from_commitment(commitment_id)', 'ap.override_total',
      'total', 'money_big', 2, 'prominent', 'amount_basis',
      'Invoice Total — what the vendor''s document shows. For PO/contract sources, derived from commitment lines (override with permission). For Non-PO/One-Time, enter directly.',
      10),

    ('tax_mode',                'required',     'derived_overrideable',
      NULL, NULL,
      NULL, 'tax.infer_mode(supplier_id, tax_group_id, company_code_id)', 'ap.override_tax_mode',
      'meta', 'radio_cards', 2, 'standard', 'amount_basis',
      'How tax_amount relates to Invoice Total. Inclusive = tax within total; Exclusive = tax added on top; No Tax = exempt or zero-rated.',
      20),

    ('tax_amount',              'editable',     'derived_overrideable',
      NULL, NULL,
      'const:0', 'tax.compute(total_amount, tax_mode, tax_group_id, lines)', 'ap.override_tax_amount',
      'addition', 'money_big', 1, 'standard', 'amount_basis',
      'Computed by the tax engine. Locked to 0 when Tax Mode is No Tax.',
      30),

    ('net_amount',              'summary_only', 'derived_locked',
      NULL, NULL,
      NULL, 'compute.net_from_total_and_tax(total_amount, tax_mode, tax_amount)', NULL,
      'subtotal', 'money_big', 1, 'compact', 'amount_basis',
      'Pre-tax net amount. Inclusive: Total ÷ (1+rate); Exclusive: Total.',
      35),

    -- ── settlement_terms ──────────────────────────────────────────────────────
    ('payment_term_id',         'editable',     'derived_overrideable',
      NULL, NULL,
      NULL, 'vendor.default_payment_term(supplier_id, company_code_id)', 'ap.override_payment_term',
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

  -- ── 7. Step 3: Review (13 field bindings) ─────────────────────────────────
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
      'vendor.default_payment_method(supplier_id)', 'ap.override_payment_method',
      NULL, 'inline_search', 1, NULL, 80),
    ('is_on_hold',           'editable',  'manual',
      NULL, NULL, 'const:false', NULL, NULL, NULL, NULL, 1, NULL, 100),
    ('hold_reason',          'editable',  'manual',
      '{"==":[{"var":"is_on_hold"},true]}',
      '{"==":[{"var":"is_on_hold"},true]}',
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
