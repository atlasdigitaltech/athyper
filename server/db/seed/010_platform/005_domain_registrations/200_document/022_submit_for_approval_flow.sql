-- =============================================================================
-- 010_platform/005_domain_registrations/200_document/022_submit_for_approval_flow.sql
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
-- Depends on: 001_invoice_v2.sql (entity_version), 016_purchase_invoice_flow.sql
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
