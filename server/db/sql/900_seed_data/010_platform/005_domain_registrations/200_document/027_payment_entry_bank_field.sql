-- =============================================================================
-- 010_platform/005_domain_registrations/200_document/027_payment_entry_bank_field.sql
-- Add bank_account_id field to payment_entry entity and create_payment flow.
--
-- Fixes: GL posting "NO_BANK_ACCOUNT" error — the intake form was missing the
-- paying-from bank account picker. Users now explicitly select a company bank
-- account; the posting service uses it to resolve the correct cash GL account.
--
-- Changes:
--   1. Register bank_account_id in control.entity_field for payment_entry v1
--   2. Add bank_account_id field binding to the create_payment flow step
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
    validation, sort_order, created_by)
  VALUES (
    v_ev_id,
    'bank_account_id', 'bank_account_id', 'Paying From (Bank Account)',
    'reference', 'zero_or_one', 'standard', NULL,
    false, true,
    '{"ref_entity":"bank_account"}'::jsonb,
    55,   -- between payment_method_id area and document_date (sort_order 60)
    v_su)
  ON CONFLICT DO NOTHING;

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
    65,   -- between payment_amount (60) and payment_reference (70)
    v_su
  FROM control.entity_field ef
  WHERE ef.entity_version_id = v_ev_id
    AND ef.name = 'bank_account_id';

  RAISE NOTICE 'bank_account_id field + flow binding seeded for payment_entry';

END $$;
