-- =============================================================================
-- 010_platform/005_domain_registrations/200_document/018_create_proforma_flow.sql
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
