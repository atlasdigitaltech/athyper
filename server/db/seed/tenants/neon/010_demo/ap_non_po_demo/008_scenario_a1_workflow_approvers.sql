-- ============================================================================
-- FILE: demo/008_scenario_a1_workflow_approvers.sql
-- Purpose: Seed a workflow_request + stage + 3 approver work_items
--          for INV-A1-0001 (Scenario A1 — submitted, pending_approval)
--
-- Approvers:
--   Step 1: ATHQ Manager   (aa001000-0000-0000-0000-000000000005)
--   Step 2: ATHQ Owner     (aa001000-0000-0000-0000-000000000006)
--   Step 3: ATHQ CFO       (aa001000-0000-0000-0000-00000000000c)
--
-- Depends on: 002_scenario_a1_plain_non_po.sql
-- Idempotent: skips if workflow_request already exists for this invoice
-- ============================================================================

DO $wf_a1$
DECLARE
    v_tenant_id   uuid;
    v_invoice_id  uuid := '00000001-0000-0000-0001-000000000001';
    v_sys         uuid := '00000000-0000-0000-0000-000000000000';
    v_requester   uuid := 'aa001000-0000-0000-0000-000000000003'; -- athq.requester
    v_manager     uuid := 'aa001000-0000-0000-0000-000000000005'; -- athq.manager
    v_owner       uuid := 'aa001000-0000-0000-0000-000000000006'; -- athq.owner
    v_cfo         uuid := 'aa001000-0000-0000-0000-00000000000c'; -- athq.cfo
    v_wf_def_id   uuid;
    v_wf_tpl_id   uuid;
    v_wr_id       uuid;
    v_wstg_id     uuid;
BEGIN
    SELECT id INTO v_tenant_id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper';

    -- Skip if workflow request already seeded for this invoice
    IF EXISTS (
        SELECT 1 FROM document.workflow_request
         WHERE tenant_id  = v_tenant_id
           AND entity_type = 'purchase_invoice'
           AND entity_id   = v_invoice_id::text
    ) THEN
        RAISE NOTICE 'demo/008: workflow_request for INV-A1-0001 already exists, skipping';
        RETURN;
    END IF;

    -- Resolve workflow definition + template IDs (seeded in 003_invoice_workflow.sql)
    SELECT id INTO v_wf_def_id FROM control.workflow_definition
     WHERE code = 'purchase_invoice_approval' AND tenant_id = v_tenant_id;

    SELECT id INTO v_wf_tpl_id FROM control.workflow_template
     WHERE code = 'inv_std_approval' AND tenant_id IS NULL;

    -- ── workflow_request — the approval envelope ──────────────────────────────
    INSERT INTO document.workflow_request (
        tenant_id, workflow_type,
        workflow_definition_id, workflow_template_id,
        entity_type, entity_id,
        requested_by, requested_at,
        status,
        metadata, created_by
    ) VALUES (
        v_tenant_id, 'approval',
        v_wf_def_id, v_wf_tpl_id,
        'purchase_invoice', v_invoice_id::text,
        v_requester, now() - interval '2 hours',
        'pending',
        '{"source":"demo_seed","scenario":"A1"}'::jsonb,
        v_sys
    )
    RETURNING id INTO v_wr_id;

    -- ── workflow_stage — single parallel stage with 3 approvers ──────────────
    INSERT INTO document.workflow_stage (
        tenant_id, workflow_request_id,
        stage_no, name, mode,
        quorum, status, started_at,
        created_by
    ) VALUES (
        v_tenant_id, v_wr_id,
        1, 'Multi-Level AP Approval', 'serial',
        '{"strategy":"unanimous"}'::jsonb,
        'active', now() - interval '2 hours',
        v_sys
    )
    RETURNING id INTO v_wstg_id;

    -- ── work_items — one per approver, serial order ───────────────────────────
    INSERT INTO event.work_item (
        tenant_id,
        task_type, workflow_request_id, workflow_stage_id,
        designated_id, assignee_id,
        order_index, status, assigned_at,
        metadata, created_by
    ) VALUES
    (   -- Step 1: ATHQ Manager
        v_tenant_id,
        'approval', v_wr_id, v_wstg_id,
        v_manager, v_manager,
        1, 'assigned', now() - interval '2 hours',
        '{}'::jsonb, v_sys
    ),
    (   -- Step 2: ATHQ Owner
        v_tenant_id,
        'approval', v_wr_id, v_wstg_id,
        v_owner, v_owner,
        2, 'pending', null,
        '{}'::jsonb, v_sys
    ),
    (   -- Step 3: ATHQ CFO
        v_tenant_id,
        'approval', v_wr_id, v_wstg_id,
        v_cfo, v_cfo,
        3, 'pending', null,
        '{}'::jsonb, v_sys
    );

    RAISE NOTICE 'demo/008: seeded workflow_request % with 3 approvers for INV-A1-0001', v_wr_id;
END $wf_a1$;
