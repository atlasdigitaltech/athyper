-- =============================================================================
-- 010_platform/005_domain_registrations/200_document/025_reverse_invoice_flow.sql
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
