-- =============================================================================
-- 010_platform/005_domain_registrations/200_document/017_purchase_invoice_proforma.sql
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

DO $$
DECLARE
  v_su          constant uuid := '00000000-0000-0000-0000-000000000000';
  v_lc_id       uuid;
  v_s           jsonb;    -- state id map { code: uuid }
BEGIN
  -- Resolve the purchase_invoice lifecycle
  SELECT lc.id INTO v_lc_id
    FROM control.lifecycle lc
    JOIN control.entity_lifecycle el ON el.lifecycle_id = lc.id
   WHERE el.entity_name = 'purchase_invoice'
     AND el.tenant_id IS NULL
   LIMIT 1;

  IF v_lc_id IS NULL THEN
    RAISE NOTICE '017_purchase_invoice_proforma: purchase_invoice lifecycle not found — skipped';
    RETURN;
  END IF;

  -- §P1 — proforma lifecycle state
  -- sort_order=5 places it before draft (sort_order=10).
  -- config flags suppress GL posting, aging, dedup, and make budget advisory-only.
  INSERT INTO control.lifecycle_state (
    lifecycle_id, tenant_id, code, name, description,
    is_initial, is_terminal, sort_order, config, created_by)
  VALUES (
    v_lc_id, NULL,
    'proforma',
    'Proforma',
    'Preview or indicative invoice. Posting, aging, and duplicate detection are '
    'suppressed. Budget precheck is advisory only. Transitions to draft on '
    'promotion (dedup probe runs at that point).',
    false, false, 5,
    jsonb_build_object(
      'is_posting_suppressed', true,
      'is_aging_excluded',     true,
      'is_dedup_excluded',     true,
      'is_budget_advisory',    true,
      'ui_color',              '#94A3B8',
      'icon_key',              'file-plus'),
    v_su)
  ON CONFLICT (lifecycle_id, code) DO NOTHING;

  -- Build / refresh state id map (includes the newly inserted proforma row)
  SELECT jsonb_object_agg(code, id) INTO v_s
    FROM control.lifecycle_state
   WHERE lifecycle_id = v_lc_id;

  -- §P2 — proforma → draft (promote_proforma operation)
  -- operation_code maps to shared.permission.code = 'ap.promote_proforma'
  -- Dedup probe + FX/fiscal lock happen in the server handler before the transition.
  INSERT INTO control.lifecycle_transition (
    lifecycle_id, tenant_id, from_state_id, to_state_id,
    operation_code, is_active, config, created_by)
  VALUES (
    v_lc_id, NULL,
    (v_s->>'proforma')::uuid,
    (v_s->>'draft')::uuid,
    'promote_proforma',
    true,
    jsonb_build_object(
      'handler',                 'MODAL',
      'handler_target',          'flow:promote_proforma',
      'require_comment',         false,
      'dedup_on_transition',     true,
      'lock_fx_on_transition',   true,
      'lock_fiscal_on_transition', true),
    v_su)
  ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

  -- §P3 — proforma → cancelled
  -- operation_code = 'cancel' (same as existing cancel transitions)
  INSERT INTO control.lifecycle_transition (
    lifecycle_id, tenant_id, from_state_id, to_state_id,
    operation_code, is_active, config, created_by)
  VALUES (
    v_lc_id, NULL,
    (v_s->>'proforma')::uuid,
    (v_s->>'cancelled')::uuid,
    'cancel',
    true,
    jsonb_build_object('require_comment', false),
    v_su)
  ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

  RAISE NOTICE '017_purchase_invoice_proforma: proforma state and transitions seeded for lifecycle %', v_lc_id;
END $$;
