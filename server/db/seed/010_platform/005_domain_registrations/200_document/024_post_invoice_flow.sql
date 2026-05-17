-- =============================================================================
-- 010_platform/005_domain_registrations/200_document/024_post_invoice_flow.sql
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
