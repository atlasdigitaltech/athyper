-- ============================================================================
-- FILE: 200_document/021_invoice_workflow_sla_bindings.sql
-- Purpose: Bind SLA policies to invoice workflow template stages
--
-- Updates (idempotent):
--   inv_std_approval  stage 1 → ap_std_review_24h
--   inv_hv_approval   stage 1 → ap_std_review_24h   (dept manager — 24 h)
--   inv_hv_approval   stage 2 → ap_hv_review_48h    (finance controller — 48 h)
--
-- Depends on: 003_invoice_workflow.sql, 020_ap_sla_policies.sql
-- ============================================================================

DO $sla_bind$
DECLARE
    v_std_sla_id  uuid;
    v_hv_sla_id   uuid;
    v_tpl_std_id  uuid;
    v_tpl_hv_id   uuid;
BEGIN

    SELECT id INTO v_std_sla_id FROM control.workflow_sla_policy
     WHERE code = 'ap_std_review_24h' AND tenant_id IS NULL;

    SELECT id INTO v_hv_sla_id  FROM control.workflow_sla_policy
     WHERE code = 'ap_hv_review_48h'  AND tenant_id IS NULL;

    SELECT id INTO v_tpl_std_id FROM control.workflow_template
     WHERE code = 'inv_std_approval'  AND tenant_id IS NULL;

    SELECT id INTO v_tpl_hv_id  FROM control.workflow_template
     WHERE code = 'inv_hv_approval'   AND tenant_id IS NULL;

    IF v_std_sla_id IS NULL OR v_hv_sla_id IS NULL THEN
        RAISE NOTICE '[021] SLA policies not found — run 020_ap_sla_policies.sql first';
        RETURN;
    END IF;

    -- ── Standard template: stage 1 → 24 h SLA ────────────────────────────────
    UPDATE control.workflow_template_stage
       SET sla_policy_id = v_std_sla_id,
           updated_at    = now()
     WHERE workflow_template_id = v_tpl_std_id
       AND stage_no             = 1
       AND (sla_policy_id IS NULL OR sla_policy_id <> v_std_sla_id);

    -- ── Template-level default for inv_std_approval ───────────────────────────
    UPDATE control.workflow_template
       SET sla_policy_id  = v_std_sla_id,
           compiled_hash  = NULL,          -- force recompile
           updated_at     = now()
     WHERE id             = v_tpl_std_id
       AND (sla_policy_id IS NULL OR sla_policy_id <> v_std_sla_id);

    -- ── High-value template: stage 1 → 24 h, stage 2 → 48 h ─────────────────
    UPDATE control.workflow_template_stage
       SET sla_policy_id = v_std_sla_id,
           updated_at    = now()
     WHERE workflow_template_id = v_tpl_hv_id
       AND stage_no             = 1
       AND (sla_policy_id IS NULL OR sla_policy_id <> v_std_sla_id);

    UPDATE control.workflow_template_stage
       SET sla_policy_id = v_hv_sla_id,
           updated_at    = now()
     WHERE workflow_template_id = v_tpl_hv_id
       AND stage_no             = 2
       AND (sla_policy_id IS NULL OR sla_policy_id <> v_hv_sla_id);

    -- ── Template-level default for inv_hv_approval ────────────────────────────
    UPDATE control.workflow_template
       SET sla_policy_id  = v_hv_sla_id,
           compiled_hash  = NULL,
           updated_at     = now()
     WHERE id             = v_tpl_hv_id
       AND (sla_policy_id IS NULL OR sla_policy_id <> v_hv_sla_id);

    -- ── Patch existing demo workflow_stage for INV-A1-0001 ────────────────────
    -- The stage was seeded before SLA policies existed; wire it now.
    UPDATE document.workflow_stage ws
       SET sla_policy_id = v_std_sla_id,
           updated_at    = now()
      FROM document.workflow_request wr
     WHERE ws.workflow_request_id = wr.id
       AND wr.entity_type         = 'purchase_invoice'
       AND wr.entity_id           = '00000001-0000-0000-0001-000000000001'
       AND ws.sla_policy_id       IS NULL;

    -- ── Populate event.work_item.due_at from SLA first timer ─────────────────
    -- First timer for ap_std_review_24h is 1440 minutes (24 h).
    -- Set due_at = assigned_at + 24 h for all linked work_items that lack it.
    UPDATE event.work_item wi
       SET due_at     = COALESCE(wi.assigned_at, wi.created_at) + interval '1440 minutes',
           updated_at = now()
      FROM document.workflow_stage ws
      JOIN document.workflow_request wr ON wr.id = ws.workflow_request_id
     WHERE wi.workflow_stage_id = ws.id
       AND ws.sla_policy_id     = v_std_sla_id
       AND wi.due_at            IS NULL
       AND wi.status NOT IN ('completed', 'skipped');

    RAISE NOTICE '[021] SLA bindings applied to inv_std_approval + inv_hv_approval templates and INV-A1-0001 demo stage';

END $sla_bind$;
