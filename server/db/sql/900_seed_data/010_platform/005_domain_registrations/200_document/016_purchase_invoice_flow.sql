-- =============================================================================
-- 900_seed_data/010_platform/005_domain_registrations/200_document/016_purchase_invoice_flow.sql
-- Standard 'create' flow for document.purchase_invoice (3-step wizard).
--   Step 1 Identify   — required identity capture; source-driven visibility
--   Step 2 Commercial — amounts, FX, tax/WHT, terms, retention/advance
--   Step 3 Review     — policy outcomes (readonly), hold controls, dimensions
-- Depends on: 001_invoice.sql, 015_ap_override_permissions.sql,
--             control.entity_flow tables (01_tables.sql §EF1-EF3)
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT DO NOTHING
-- =============================================================================

DO $$
DECLARE
    v_su       constant uuid := '00000000-0000-0000-0000-000000000000';
    v_ev_id    uuid;
    v_flow_id  uuid;
    v_step_1   uuid;
    v_step_2   uuid;
    v_step_3   uuid;
BEGIN
    SELECT ev.id INTO v_ev_id
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.table_schema = 'document'
       AND e.table_name   = 'purchase_invoice'
       AND e.tenant_id    IS NULL
       AND ev.version_no  = 1;

    IF v_ev_id IS NULL THEN
        RAISE NOTICE 'purchase_invoice v1 not found — flow seed skipped';
        RETURN;
    END IF;

    -- ── 1. Flow header ────────────────────────────────────────────────────────
    INSERT INTO control.entity_flow (
        tenant_id, entity_version_id, flow_code, label, description, icon_key,
        trigger_context, is_default, config,
        version_no, status, effective_from, created_by)
    SELECT
        NULL, v_ev_id, 'create',
        'Create invoice',
        'Standard 3-step AP invoice intake: identify, commercial, review.',
        'file-plus',
        'new', true,
        jsonb_build_object(
            'summary', jsonb_build_object(
                'fields', jsonb_build_array(
                    'total_amount','tax_amount','withholding_tax_amount',
                    'advance_deduction_amount','retention_amount','payable_amount'),
                'running_totals', jsonb_build_array('gross','tax','wht','deductions','payable')
            ),
            'input_modes', jsonb_build_array('form','scan','from_commitment','import'),
            'dedup', jsonb_build_object(
                'index','pi_supplier_invoice_dedup_idx',
                'trigger_fields', jsonb_build_array(
                    'supplier_id','supplier_invoice_number','supplier_invoice_date')
            ),
            'assist', jsonb_build_object(
                'budget_precheck', true, 'ocr_prefill', true,
                'vendor_enrichment', true, 'po_prefill', true
            ),
            'layout', 'wizard_with_summary'
        ),
        1, 'active', now(), v_su
    WHERE NOT EXISTS (
        SELECT 1 FROM control.entity_flow
         WHERE entity_version_id = v_ev_id
           AND flow_code = 'create' AND tenant_id IS NULL AND version_no = 1);

    SELECT id INTO v_flow_id FROM control.entity_flow
     WHERE entity_version_id = v_ev_id
       AND flow_code = 'create' AND tenant_id IS NULL AND version_no = 1;

    -- ── 2. Steps ──────────────────────────────────────────────────────────────
    INSERT INTO control.entity_flow_step
        (tenant_id, flow_id, step_key, label, icon_key, sort_order,
         advance_rule, layout_hint, created_by)
    VALUES
    (NULL, v_flow_id, 'identify',   'Identify',   'id-card',      10,
     '{"required_fields":["company_code_id","invoice_type","invoice_source","supplier_id","supplier_invoice_number","supplier_invoice_date","posting_date","received_date"]}',
     'summary_side', v_su),
    (NULL, v_flow_id, 'commercial', 'Commercial', 'receipt',      20,
     '{"required_fields":["currency_code","total_amount"]}',
     'summary_side', v_su),
    (NULL, v_flow_id, 'review',     'Review',     'check-circle', 30,
     '{"required_fields":[]}',
     'summary_side', v_su)
    ON CONFLICT (flow_id, step_key) DO NOTHING;

    SELECT id INTO v_step_1 FROM control.entity_flow_step WHERE flow_id = v_flow_id AND step_key = 'identify';
    SELECT id INTO v_step_2 FROM control.entity_flow_step WHERE flow_id = v_flow_id AND step_key = 'commercial';
    SELECT id INTO v_step_3 FROM control.entity_flow_step WHERE flow_id = v_flow_id AND step_key = 'review';

    -- ── Step 1: Identify ──────────────────────────────────────────────────────
    INSERT INTO control.entity_flow_field (
        tenant_id, flow_step_id, entity_field_id, mode, derivation_mode,
        visible_when, required_when, default_source, derive_expression,
        override_permission, summary_role, ui_variant, span, help_text, sort_order, created_by)
    SELECT NULL, v_step_1, ef.id, v.mode, v.derivation_mode,
           v.visible_when::jsonb, v.required_when::jsonb,
           v.default_source, v.derive_expression,
           v.override_permission, v.summary_role, v.ui_variant,
           v.span, v.help_text, v.sort_order, v_su
    FROM control.entity_field ef
    JOIN (VALUES
        ('company_code_id',         'required', 'derived_overrideable',
            NULL::text, NULL::text,
            NULL, 'ctx.user.default_company_code', 'ap.override_company_code',
            NULL, 'inline_search', 1, 'Company posting the invoice.', 10),
        ('invoice_type',            'required', 'manual',
            NULL, NULL,
            'lookup.document.purchase_invoice_type.standard', NULL, NULL,
            NULL, 'radio_cards', 2, 'Standard, Credit Note, Retention Release, or Final.', 20),
        ('invoice_source',          'required', 'manual',
            NULL, NULL,
            'lookup.document.invoice_source.po_based', NULL, NULL,
            NULL, 'segmented', 2, 'Drives PO/commitment visibility and match type.', 30),
        ('supplier_id',             'required', 'manual',
            NULL, NULL, NULL, NULL, NULL, NULL, 'inline_search', 2, NULL, 40),
        ('commitment_id',           'editable', 'manual',
            '{"in":[{"var":"invoice_source"},["po_based","contract_based"]]}',
            '{"in":[{"var":"invoice_source"},["po_based","contract_based"]]}',
            NULL, NULL, NULL, NULL, 'inline_search', 2,
            'Required for PO-based and contract-based invoices.', 50),
        ('supplier_invoice_number', 'required', 'manual',
            NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1,
            'Vendor-issued invoice number — triggers duplicate detection.', 60),
        ('supplier_invoice_date',   'required', 'manual',
            NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1,
            'Date on vendor''s invoice.', 70),
        ('posting_date',            'required', 'derived_overrideable',
            NULL, NULL,
            NULL, 'today()', 'ap.override_posting_date',
            NULL, NULL, 1, 'GL posting date. Drives fiscal year and period.', 80),
        ('received_date',           'required', 'manual',
            NULL, NULL, 'today()', NULL, NULL, NULL, NULL, 1, NULL, 90),
        ('description',             'editable', 'manual',
            NULL, NULL, NULL, NULL, NULL, NULL, NULL, 3, NULL, 100),
        ('currency_code',           'chip', 'derived_overrideable',
            NULL, NULL,
            NULL, 'vendor.default_currency(supplier_id)', 'ap.override_currency',
            'meta', 'chip', 1, 'Derived from vendor. Override needs permission.', 200),
        ('match_type',              'chip', 'derived_locked',
            NULL, NULL,
            NULL, 'matching.match_type_from_source(invoice_source)', NULL,
            'meta', 'chip', 1, 'Determined by invoice source.', 210),
        ('payment_term_id',         'chip', 'derived_overrideable',
            NULL, NULL,
            NULL, 'vendor.default_payment_term(supplier_id, company_code_id)', 'ap.override_payment_term',
            'meta', 'chip', 1, NULL, 220),
        ('fiscal_year',             'chip', 'derived_locked',
            NULL, NULL,
            NULL, 'fiscal.year_from(posting_date, company_code_id)', NULL,
            'meta', 'chip', 1, NULL, 230),
        ('period_number',           'chip', 'derived_locked',
            NULL, NULL,
            NULL, 'fiscal.period_from(posting_date, company_code_id)', NULL,
            'meta', 'chip', 1, NULL, 240)
    ) AS v(field_name, mode, derivation_mode, visible_when, required_when,
           default_source, derive_expression, override_permission,
           summary_role, ui_variant, span, help_text, sort_order)
       ON ef.name = v.field_name AND ef.entity_version_id = v_ev_id
    ON CONFLICT (flow_step_id, entity_field_id) DO NOTHING;

    -- ── Step 2: Commercial ────────────────────────────────────────────────────
    INSERT INTO control.entity_flow_field (
        tenant_id, flow_step_id, entity_field_id, mode, derivation_mode,
        visible_when, required_when, default_source, derive_expression,
        override_permission, summary_role, ui_variant, span, help_text, sort_order, created_by)
    SELECT NULL, v_step_2, ef.id, v.mode, v.derivation_mode,
           v.visible_when::jsonb, v.required_when::jsonb,
           v.default_source, v.derive_expression,
           v.override_permission, v.summary_role, v.ui_variant,
           v.span, v.help_text, v.sort_order, v_su
    FROM control.entity_field ef
    JOIN (VALUES
        ('currency_code',            'readonly', 'derived_overrideable',
            NULL::text, NULL::text,
            NULL, 'vendor.default_currency(supplier_id)', 'ap.override_currency',
            NULL, 'chip', 1, 'Locked in Step 1 unless permission allows change.', 10),
        ('base_currency_code',       'readonly', 'derived_locked',
            NULL, NULL, NULL, 'company_code.functional_currency(company_code_id)', NULL,
            NULL, 'chip', 1, NULL, 20),
        ('exchange_rate',            'editable', 'derived_overrideable',
            '{"!=":[{"var":"currency_code"},{"var":"base_currency_code"}]}',
            '{"!=":[{"var":"currency_code"},{"var":"base_currency_code"}]}',
            NULL, 'fx.resolve(currency_code, base_currency_code, document_date)', 'ap.override_fx_rate',
            NULL, NULL, 1, 'Shown only when invoice currency differs from base.', 30),
        ('subtotal_amount',          'editable', 'manual',
            NULL, NULL, 'const:0', NULL, NULL, 'subtotal', 'money_big', 1, NULL, 40),
        ('discount_amount',          'editable', 'manual',
            NULL, NULL, 'const:0', NULL, NULL, 'deduction', NULL, 1, NULL, 50),
        ('freight_amount',           'editable', 'manual',
            NULL, NULL, 'const:0', NULL, NULL, 'addition', NULL, 1, NULL, 60),
        ('misc_charges_amount',      'editable', 'manual',
            NULL, NULL, 'const:0', NULL, NULL, 'addition', NULL, 1, NULL, 70),
        ('tax_amount',               'editable', 'derived_overrideable',
            NULL, NULL, NULL, 'tax.compute(lines, tax_groups)', 'ap.override_tax_amount',
            'addition', 'money_big', 1, 'Computed by tax engine. Override requires permission.', 80),
        ('withholding_tax_amount',   'editable', 'derived_overrideable',
            NULL, NULL, NULL, 'wht.compute(lines, supplier_id)', 'ap.override_wht_amount',
            'deduction', NULL, 1, NULL, 90),
        ('total_amount',             'required', 'derived_overrideable',
            NULL, NULL, NULL, 'sum(subtotal + freight + misc + tax - discount)', 'ap.override_total',
            'total', 'money_big', 1, NULL, 100),
        ('payable_amount',           'summary_only', 'derived_locked',
            NULL, NULL, NULL, 'total_amount - withholding_tax_amount', NULL,
            'total', 'money_big', 1, 'Generated column — shown in summary, never editable.', 110),
        ('payment_term_id',          'editable', 'derived_overrideable',
            NULL, NULL, NULL, 'vendor.default_payment_term(supplier_id, company_code_id)', 'ap.override_payment_term',
            NULL, 'inline_search', 1, NULL, 120),
        ('baseline_date',            'editable', 'derived_overrideable',
            NULL, NULL, 'field.received_date',
            'payment_term.baseline_event(payment_term_id, received_date, posting_date)', 'ap.override_baseline_date',
            NULL, NULL, 1, NULL, 130),
        ('due_date',                 'editable', 'derived_overrideable',
            NULL, NULL, NULL, 'payment_term.compute_due_date(payment_term_id, baseline_date)', 'ap.override_due_date',
            NULL, NULL, 1, NULL, 140),
        ('payment_method_id',        'editable', 'derived_overrideable',
            NULL, NULL, NULL, 'vendor.default_payment_method(supplier_id)', 'ap.override_payment_method',
            NULL, 'inline_search', 1, NULL, 150),
        ('advance_deduction_amount', 'editable', 'derived_overrideable',
            '{"in":[{"var":"invoice_type"},["standard","final"]]}', NULL,
            'const:0', 'payment_term_clause.advance_recovery(commitment_id, total_amount)', 'ap.override_advance_deduction',
            'deduction', NULL, 1, 'Visible when prior advances may apply.', 160),
        ('retention_amount',         'editable', 'derived_overrideable',
            '{"!=":[{"var":"invoice_type"},"retention_release"]}', NULL,
            'const:0', 'payment_term_clause.retention(commitment_id, total_amount)', 'ap.override_retention',
            'deduction', NULL, 1, NULL, 170),
        ('retention_pct',            'editable', 'derived_overrideable',
            '{"!=":[{"var":"retention_amount"},0]}', NULL,
            NULL, 'payment_term_clause.retention_pct(commitment_id)', 'ap.override_retention',
            'meta', NULL, 1, NULL, 180)
    ) AS v(field_name, mode, derivation_mode, visible_when, required_when,
           default_source, derive_expression, override_permission,
           summary_role, ui_variant, span, help_text, sort_order)
       ON ef.name = v.field_name AND ef.entity_version_id = v_ev_id
    ON CONFLICT (flow_step_id, entity_field_id) DO NOTHING;

    -- ── Step 3: Review ────────────────────────────────────────────────────────
    INSERT INTO control.entity_flow_field (
        tenant_id, flow_step_id, entity_field_id, mode, derivation_mode,
        visible_when, required_when, default_source, derive_expression,
        override_permission, summary_role, ui_variant, span, help_text, sort_order, created_by)
    SELECT NULL, v_step_3, ef.id, v.mode, v.derivation_mode,
           v.visible_when::jsonb, v.required_when::jsonb,
           v.default_source, v.derive_expression,
           v.override_permission, v.summary_role, v.ui_variant,
           v.span, v.help_text, v.sort_order, v_su
    FROM control.entity_field ef
    JOIN (VALUES
        ('budget_check_result',   'readonly', 'derived_locked',
            NULL::text, NULL::text, NULL,
            'budget.precheck(commitment_id, total_amount, cost_center_id)', NULL,
            NULL, 'chip', 1, NULL, 10),
        ('match_status',          'readonly', 'derived_locked',
            NULL, NULL, NULL, 'matching.status(lines)', NULL, NULL, 'chip', 1, NULL, 20),
        ('fiscal_year',           'readonly', 'derived_locked',
            NULL, NULL, NULL, 'fiscal.year_from(posting_date, company_code_id)', NULL,
            NULL, 'chip', 1, NULL, 30),
        ('period_number',         'readonly', 'derived_locked',
            NULL, NULL, NULL, 'fiscal.period_from(posting_date, company_code_id)', NULL,
            NULL, 'chip', 1, NULL, 40),
        ('is_on_hold',            'editable', 'manual',
            NULL, NULL, 'const:false', NULL, NULL, NULL, NULL, 1, NULL, 100),
        ('hold_reason',           'editable', 'manual',
            '{"==":[{"var":"is_on_hold"},true]}',
            '{"==":[{"var":"is_on_hold"},true]}',
            NULL, NULL, NULL, NULL, NULL, 3,
            'Required when the invoice is placed on hold.', 110),
        ('notes',                 'editable', 'manual',
            NULL, NULL, NULL, NULL, NULL, NULL, NULL, 3, NULL, 120),
        ('tags',                  'editable', 'manual',
            NULL, NULL, NULL, NULL, NULL, NULL, NULL, 3, NULL, 130),
        ('cost_center_id',        'editable', 'derived_overrideable',
            NULL, NULL, NULL, 'ctx.user.default_cost_center', 'ap.override_cost_center',
            NULL, 'inline_search', 1,
            'Applied as default to all lines unless overridden per line.', 200),
        ('profit_center_id',      'editable', 'derived_overrideable',
            NULL, NULL, NULL, 'cost_center.default_profit_center(cost_center_id)', 'ap.override_profit_center',
            NULL, 'inline_search', 1, NULL, 210),
        ('project_id',            'editable', 'manual',
            NULL, NULL, NULL, NULL, NULL, NULL, 'inline_search', 1, NULL, 220),
        ('site_id',               'editable', 'manual',
            NULL, NULL, NULL, NULL, NULL, NULL, 'inline_search', 1, NULL, 230)
    ) AS v(field_name, mode, derivation_mode, visible_when, required_when,
           default_source, derive_expression, override_permission,
           summary_role, ui_variant, span, help_text, sort_order)
       ON ef.name = v.field_name AND ef.entity_version_id = v_ev_id
    ON CONFLICT (flow_step_id, entity_field_id) DO NOTHING;

    RAISE NOTICE 'purchase_invoice create flow seeded: % steps',
                 (SELECT count(*) FROM control.entity_flow_step WHERE flow_id = v_flow_id);
END $$;
