-- =============================================================================
-- 010_platform/005_domain_registrations/200_document/026_payment_entry_new_flow.sql
-- Create-Payment flow for payment_entry — single-step wizard.
--
-- Field ui_variant map:
--   payment_type      → radio_cards   (bank_transfer / cheque / cash / online_transfer)
--   supplier_id       → inline_search (EntityRefPicker backed by /records/vendor)
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
     '{"required_fields":["payment_type","supplier_id","document_date","posting_date","currency_code","payment_amount"]}'::jsonb,
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
    -- payment_type: radio_cards → bank_transfer / cheque / cash / online_transfer
    ('payment_type',      'required',  'manual', 'radio_cards',   2, NULL::text,     NULL::text, NULL, NULL, 'Type of payment — choose bank transfer, cheque, cash, or online.', 10),
    -- supplier_id: inline_search → EntityRefPicker backed by /records/vendor
    ('supplier_id',       'required',  'manual', 'inline_search', 1, NULL::text,     NULL::text, NULL, NULL, 'Vendor being paid.', 20),
    -- currency_code: derived from supplier profile; override allowed
    ('currency_code',     'chip',      'derived_overrideable', NULL, 1, NULL::text,  'vendor.default_currency(supplier_id)', NULL, NULL, 'Payment currency — derived from vendor profile.', 30),
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
