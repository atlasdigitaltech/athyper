/* ============================================================================
   Athyper v2.4 — DEMO SEED: Approval Instances for demo_ca tenant
   Tables: wf.approval_instance, wf.approval_stage, wf.approval_task,
           wf.approval_comment, wf.approval_event
   Dependencies: core.tenant, core.principal, fin.purchase_invoice,
                 wf.approval_definition, 330_seed_demo_invoices_robust.sql

   Seeds approval instances across demo_ca invoices with varied statuses:
     - Completed (approved) multi-stage approvals
     - Rejected approvals
     - Pending / in-progress approvals
     - Escalated approvals

   Links approval_instance_id back to fin.purchase_invoice.
   DEMO DATA ONLY — not required for production deployments.
   ============================================================================ */

DO $$
DECLARE
    v_tenant         uuid;
    v_def_standard   uuid;
    v_def_enhanced   uuid;
    v_def_executive  uuid;

    -- principals
    v_requester      uuid;   -- democa_requester
    v_agent          uuid;   -- democa_agent
    v_manager        uuid;   -- democa_manager
    v_module_admin   uuid;   -- democa_module_admin
    v_tenant_admin   uuid;   -- democa_tenant_admin
    v_viewer         uuid;   -- democa_viewer
    v_reporter       uuid;   -- democa_reporter

    -- invoice cursors
    v_inv            record;
    v_inst_id        uuid;
    v_stage_id       uuid;
    v_task_id        uuid;
    v_counter        int := 0;
BEGIN
    -- ========================================================================
    -- Resolve tenant + principals
    -- ========================================================================
    SELECT id INTO v_tenant FROM core.tenant WHERE code = 'demo_ca';
    IF v_tenant IS NULL THEN
        RAISE NOTICE 'demo_ca tenant not found — skipping approval instance seeds';
        RETURN;
    END IF;

    SELECT id INTO v_requester    FROM core.principal WHERE principal_code = 'democa_requester';
    SELECT id INTO v_agent        FROM core.principal WHERE principal_code = 'democa_agent';
    SELECT id INTO v_manager      FROM core.principal WHERE principal_code = 'democa_manager';
    SELECT id INTO v_module_admin FROM core.principal WHERE principal_code = 'democa_module_admin';
    SELECT id INTO v_tenant_admin FROM core.principal WHERE principal_code = 'democa_tenant_admin';
    SELECT id INTO v_viewer       FROM core.principal WHERE principal_code = 'democa_viewer';
    SELECT id INTO v_reporter     FROM core.principal WHERE principal_code = 'democa_reporter';

    -- ========================================================================
    -- Resolve approval definitions
    -- ========================================================================
    SELECT id INTO v_def_standard  FROM wf.approval_definition WHERE tenant_id = v_tenant AND code = 'PI_STANDARD';
    SELECT id INTO v_def_enhanced  FROM wf.approval_definition WHERE tenant_id = v_tenant AND code = 'PI_ENHANCED';
    SELECT id INTO v_def_executive FROM wf.approval_definition WHERE tenant_id = v_tenant AND code = 'PI_EXECUTIVE';

    IF v_def_standard IS NULL THEN
        RAISE NOTICE 'PI_STANDARD definition not found for demo_ca — skipping';
        RETURN;
    END IF;

    -- ========================================================================
    -- Iterate demo_ca invoices and create approval instances
    -- ========================================================================
    FOR v_inv IN
        SELECT id, invoice_number, total_amount, status, approval_route, invoice_date
        FROM fin.purchase_invoice
        WHERE tenant_id = v_tenant
          AND approval_instance_id IS NULL
        ORDER BY invoice_number
        LIMIT 25
    LOOP
        v_counter := v_counter + 1;

        -- ====================================================================
        -- Pattern 1: COMPLETED approvals (approved, multi-stage) — invoices 1-8
        -- ====================================================================
        IF v_counter <= 8 THEN
            v_inst_id := gen_random_uuid();

            INSERT INTO wf.approval_instance (
                id, tenant_id, approval_definition_id, entity_type, entity_id,
                status, decision, requested_by, requested_at, decided_by, decided_at,
                reason, metadata, created_at, created_by, updated_at, updated_by
            ) VALUES (
                v_inst_id, v_tenant,
                CASE WHEN v_counter <= 4 THEN v_def_standard
                     WHEN v_counter <= 6 THEN v_def_enhanced
                     ELSE v_def_executive END,
                'purchase_invoice', v_inv.id,
                'approved', 'approve',
                v_requester, v_inv.invoice_date + interval '1 day',
                CASE WHEN v_counter <= 4 THEN v_manager ELSE v_tenant_admin END,
                v_inv.invoice_date + interval '2 days' + (v_counter * interval '3 hours'),
                CASE WHEN v_counter % 3 = 0 THEN 'Approved per policy — within budget' ELSE NULL END,
                jsonb_build_object('invoiceNumber', v_inv.invoice_number, 'amount', v_inv.total_amount),
                v_inv.invoice_date + interval '1 day', 'seed',
                v_inv.invoice_date + interval '2 days', 'seed'
            );

            -- Stage 1: L1 Manager — completed
            v_stage_id := gen_random_uuid();
            INSERT INTO wf.approval_stage (
                id, tenant_id, approval_instance_id, stage_no, name, mode,
                status, started_at, completed_at, created_at, created_by
            ) VALUES (
                v_stage_id, v_tenant, v_inst_id, 1, 'L1 Manager Approval', 'serial',
                'completed',
                v_inv.invoice_date + interval '1 day',
                v_inv.invoice_date + interval '1 day' + interval '6 hours',
                v_inv.invoice_date + interval '1 day', 'seed'
            );

            v_task_id := gen_random_uuid();
            INSERT INTO wf.approval_task (
                id, tenant_id, approval_instance_id, approval_stage_id,
                approver_id, order_index, status, decision, reason,
                assigned_at, started_at, completed_at,
                due_at, created_at, created_by, updated_at, updated_by
            ) VALUES (
                v_task_id, v_tenant, v_inst_id, v_stage_id,
                v_manager, 1, 'approved', 'approve',
                CASE WHEN v_counter % 2 = 0 THEN 'Reviewed and approved — amounts verified' ELSE 'Looks good' END,
                v_inv.invoice_date + interval '1 day',
                v_inv.invoice_date + interval '1 day' + interval '2 hours',
                v_inv.invoice_date + interval '1 day' + interval '6 hours',
                v_inv.invoice_date + interval '3 days',
                v_inv.invoice_date + interval '1 day', 'seed',
                v_inv.invoice_date + interval '1 day' + interval '6 hours', 'seed'
            );

            -- Stage 2 for ENHANCED/EXECUTIVE (counter 5-8): L2 Director — completed
            IF v_counter > 4 THEN
                v_stage_id := gen_random_uuid();
                INSERT INTO wf.approval_stage (
                    id, tenant_id, approval_instance_id, stage_no, name, mode,
                    status, started_at, completed_at, created_at, created_by
                ) VALUES (
                    v_stage_id, v_tenant, v_inst_id, 2, 'L2 Director Approval', 'serial',
                    'completed',
                    v_inv.invoice_date + interval '1 day' + interval '6 hours',
                    v_inv.invoice_date + interval '2 days',
                    v_inv.invoice_date + interval '1 day' + interval '6 hours', 'seed'
                );

                INSERT INTO wf.approval_task (
                    id, tenant_id, approval_instance_id, approval_stage_id,
                    approver_id, order_index, status, decision, reason,
                    assigned_at, started_at, completed_at,
                    due_at, created_at, created_by, updated_at, updated_by
                ) VALUES (
                    gen_random_uuid(), v_tenant, v_inst_id, v_stage_id,
                    v_module_admin, 1, 'approved', 'approve',
                    'Within department budget — approved',
                    v_inv.invoice_date + interval '1 day' + interval '6 hours',
                    v_inv.invoice_date + interval '1 day' + interval '8 hours',
                    v_inv.invoice_date + interval '2 days',
                    v_inv.invoice_date + interval '4 days',
                    v_inv.invoice_date + interval '1 day' + interval '6 hours', 'seed',
                    v_inv.invoice_date + interval '2 days', 'seed'
                );
            END IF;

            -- Stage 3 for EXECUTIVE (counter 7-8): CFO — completed
            IF v_counter > 6 THEN
                v_stage_id := gen_random_uuid();
                INSERT INTO wf.approval_stage (
                    id, tenant_id, approval_instance_id, stage_no, name, mode,
                    status, started_at, completed_at, created_at, created_by
                ) VALUES (
                    v_stage_id, v_tenant, v_inst_id, 3, 'CFO Approval', 'serial',
                    'completed',
                    v_inv.invoice_date + interval '2 days',
                    v_inv.invoice_date + interval '2 days' + interval '4 hours',
                    v_inv.invoice_date + interval '2 days', 'seed'
                );

                INSERT INTO wf.approval_task (
                    id, tenant_id, approval_instance_id, approval_stage_id,
                    approver_id, order_index, status, decision, reason,
                    assigned_at, started_at, completed_at,
                    due_at, created_at, created_by, updated_at, updated_by
                ) VALUES (
                    gen_random_uuid(), v_tenant, v_inst_id, v_stage_id,
                    v_tenant_admin, 1, 'approved', 'approve',
                    'Executive approval granted — strategic vendor',
                    v_inv.invoice_date + interval '2 days',
                    v_inv.invoice_date + interval '2 days' + interval '1 hour',
                    v_inv.invoice_date + interval '2 days' + interval '4 hours',
                    v_inv.invoice_date + interval '5 days',
                    v_inv.invoice_date + interval '2 days', 'seed',
                    v_inv.invoice_date + interval '2 days' + interval '4 hours', 'seed'
                );
            END IF;

            -- Approval comments on some instances
            IF v_counter IN (1, 3, 5, 7) THEN
                INSERT INTO wf.approval_comment (
                    id, tenant_id, approval_instance_id, commenter_id,
                    comment_text, visibility, created_at, created_by
                ) VALUES
                (gen_random_uuid(), v_tenant, v_inst_id, v_requester,
                 'Please prioritize — vendor payment terms are NET-15.',
                 'public', v_inv.invoice_date + interval '1 day' + interval '30 minutes', 'seed'),
                (gen_random_uuid(), v_tenant, v_inst_id, v_manager,
                 'Verified against PO and delivery receipt. Approving.',
                 'public', v_inv.invoice_date + interval '1 day' + interval '5 hours', 'seed');
            END IF;

            -- Audit events
            INSERT INTO wf.approval_event (
                id, tenant_id, approval_instance_id, event_type, actor_id, payload, created_at
            ) VALUES
            (gen_random_uuid(), v_tenant, v_inst_id, 'submitted', v_requester::text,
             '{"action": "submit_for_approval"}'::jsonb, v_inv.invoice_date + interval '1 day'),
            (gen_random_uuid(), v_tenant, v_inst_id, 'approved', v_manager::text,
             '{"stage": 1, "decision": "approve"}'::jsonb,
             v_inv.invoice_date + interval '1 day' + interval '6 hours');

            -- Link approval instance back to invoice
            UPDATE fin.purchase_invoice
            SET approval_instance_id = v_inst_id
            WHERE id = v_inv.id;

        -- ====================================================================
        -- Pattern 2: REJECTED approvals — invoices 9-11
        -- ====================================================================
        ELSIF v_counter <= 11 THEN
            v_inst_id := gen_random_uuid();

            INSERT INTO wf.approval_instance (
                id, tenant_id, approval_definition_id, entity_type, entity_id,
                status, decision, requested_by, requested_at, decided_by, decided_at,
                reason, metadata, created_at, created_by, updated_at, updated_by
            ) VALUES (
                v_inst_id, v_tenant, v_def_standard, 'purchase_invoice', v_inv.id,
                'rejected', 'reject',
                v_requester, v_inv.invoice_date + interval '1 day',
                v_manager, v_inv.invoice_date + interval '2 days',
                CASE v_counter
                    WHEN 9  THEN 'Duplicate invoice — already processed under PI-2026-00003'
                    WHEN 10 THEN 'Amount exceeds budget allocation for this period'
                    WHEN 11 THEN 'Missing supporting documentation — delivery receipt required'
                END,
                jsonb_build_object('invoiceNumber', v_inv.invoice_number, 'amount', v_inv.total_amount),
                v_inv.invoice_date + interval '1 day', 'seed',
                v_inv.invoice_date + interval '2 days', 'seed'
            );

            -- Single stage — rejected
            v_stage_id := gen_random_uuid();
            INSERT INTO wf.approval_stage (
                id, tenant_id, approval_instance_id, stage_no, name, mode,
                status, started_at, completed_at, created_at, created_by
            ) VALUES (
                v_stage_id, v_tenant, v_inst_id, 1, 'L1 Manager Approval', 'serial',
                'completed',
                v_inv.invoice_date + interval '1 day',
                v_inv.invoice_date + interval '2 days',
                v_inv.invoice_date + interval '1 day', 'seed'
            );

            INSERT INTO wf.approval_task (
                id, tenant_id, approval_instance_id, approval_stage_id,
                approver_id, order_index, status, decision, reason,
                assigned_at, started_at, completed_at,
                due_at, created_at, created_by, updated_at, updated_by
            ) VALUES (
                gen_random_uuid(), v_tenant, v_inst_id, v_stage_id,
                v_manager, 1, 'rejected', 'reject',
                CASE v_counter
                    WHEN 9  THEN 'Duplicate — see PI-2026-00003'
                    WHEN 10 THEN 'Over budget — resubmit next period or request budget increase'
                    WHEN 11 THEN 'Need delivery receipt before I can approve'
                END,
                v_inv.invoice_date + interval '1 day',
                v_inv.invoice_date + interval '1 day' + interval '4 hours',
                v_inv.invoice_date + interval '2 days',
                v_inv.invoice_date + interval '3 days',
                v_inv.invoice_date + interval '1 day', 'seed',
                v_inv.invoice_date + interval '2 days', 'seed'
            );

            -- Rejection comments
            INSERT INTO wf.approval_comment (
                id, tenant_id, approval_instance_id, commenter_id,
                comment_text, visibility, created_at, created_by
            ) VALUES
            (gen_random_uuid(), v_tenant, v_inst_id, v_manager,
             CASE v_counter
                 WHEN 9  THEN 'This appears to be a duplicate. Please check PI-2026-00003.'
                 WHEN 10 THEN 'Q1 budget for this cost center is exhausted. Please coordinate with Finance.'
                 WHEN 11 THEN 'Cannot approve without delivery receipt. Please upload and resubmit.'
             END,
             'public', v_inv.invoice_date + interval '2 days', 'seed');

            -- Audit events
            INSERT INTO wf.approval_event (
                id, tenant_id, approval_instance_id, event_type, actor_id, payload, created_at
            ) VALUES
            (gen_random_uuid(), v_tenant, v_inst_id, 'submitted', v_requester::text,
             '{"action": "submit_for_approval"}'::jsonb, v_inv.invoice_date + interval '1 day'),
            (gen_random_uuid(), v_tenant, v_inst_id, 'rejected', v_manager::text,
             '{"stage": 1, "decision": "reject"}'::jsonb, v_inv.invoice_date + interval '2 days');

            UPDATE fin.purchase_invoice
            SET approval_instance_id = v_inst_id
            WHERE id = v_inv.id;

        -- ====================================================================
        -- Pattern 3: PENDING (in-progress) approvals — invoices 12-18
        -- ====================================================================
        ELSIF v_counter <= 18 THEN
            v_inst_id := gen_random_uuid();

            INSERT INTO wf.approval_instance (
                id, tenant_id, approval_definition_id, entity_type, entity_id,
                status, requested_by, requested_at,
                metadata, created_at, created_by, updated_at, updated_by
            ) VALUES (
                v_inst_id, v_tenant,
                CASE WHEN v_counter <= 14 THEN v_def_standard
                     WHEN v_counter <= 16 THEN v_def_enhanced
                     ELSE v_def_executive END,
                'purchase_invoice', v_inv.id,
                'pending',
                v_requester, v_inv.invoice_date + interval '1 day',
                jsonb_build_object('invoiceNumber', v_inv.invoice_number, 'amount', v_inv.total_amount),
                v_inv.invoice_date + interval '1 day', 'seed',
                v_inv.invoice_date + interval '1 day', 'seed'
            );

            -- Stage 1: Active for STANDARD, completed for ENHANCED/EXECUTIVE
            v_stage_id := gen_random_uuid();
            IF v_counter <= 14 THEN
                -- STANDARD: Stage 1 is active, task is pending
                INSERT INTO wf.approval_stage (
                    id, tenant_id, approval_instance_id, stage_no, name, mode,
                    status, started_at, created_at, created_by
                ) VALUES (
                    v_stage_id, v_tenant, v_inst_id, 1, 'L1 Manager Approval', 'serial',
                    'active',
                    v_inv.invoice_date + interval '1 day',
                    v_inv.invoice_date + interval '1 day', 'seed'
                );

                INSERT INTO wf.approval_task (
                    id, tenant_id, approval_instance_id, approval_stage_id,
                    approver_id, order_index, status,
                    assigned_at, started_at,
                    due_at, created_at, created_by, updated_at, updated_by
                ) VALUES (
                    gen_random_uuid(), v_tenant, v_inst_id, v_stage_id,
                    v_manager, 1,
                    CASE WHEN v_counter = 12 THEN 'pending'
                         WHEN v_counter = 13 THEN 'assigned'
                         ELSE 'in_progress' END,
                    v_inv.invoice_date + interval '1 day',
                    CASE WHEN v_counter >= 14 THEN v_inv.invoice_date + interval '1 day' + interval '2 hours' END,
                    v_inv.invoice_date + interval '3 days',
                    v_inv.invoice_date + interval '1 day', 'seed',
                    v_inv.invoice_date + interval '1 day', 'seed'
                );
            ELSE
                -- ENHANCED/EXECUTIVE: Stage 1 completed, Stage 2 active
                INSERT INTO wf.approval_stage (
                    id, tenant_id, approval_instance_id, stage_no, name, mode,
                    status, started_at, completed_at, created_at, created_by
                ) VALUES (
                    v_stage_id, v_tenant, v_inst_id, 1, 'L1 Manager Approval', 'serial',
                    'completed',
                    v_inv.invoice_date + interval '1 day',
                    v_inv.invoice_date + interval '1 day' + interval '8 hours',
                    v_inv.invoice_date + interval '1 day', 'seed'
                );

                INSERT INTO wf.approval_task (
                    id, tenant_id, approval_instance_id, approval_stage_id,
                    approver_id, order_index, status, decision, reason,
                    assigned_at, started_at, completed_at,
                    due_at, created_at, created_by, updated_at, updated_by
                ) VALUES (
                    gen_random_uuid(), v_tenant, v_inst_id, v_stage_id,
                    v_manager, 1, 'approved', 'approve', 'Approved — forwarding to next level',
                    v_inv.invoice_date + interval '1 day',
                    v_inv.invoice_date + interval '1 day' + interval '1 hour',
                    v_inv.invoice_date + interval '1 day' + interval '8 hours',
                    v_inv.invoice_date + interval '3 days',
                    v_inv.invoice_date + interval '1 day', 'seed',
                    v_inv.invoice_date + interval '1 day' + interval '8 hours', 'seed'
                );

                -- Stage 2: Active
                v_stage_id := gen_random_uuid();
                INSERT INTO wf.approval_stage (
                    id, tenant_id, approval_instance_id, stage_no, name, mode,
                    status, started_at, created_at, created_by
                ) VALUES (
                    v_stage_id, v_tenant, v_inst_id, 2, 'L2 Director Approval', 'serial',
                    'active',
                    v_inv.invoice_date + interval '1 day' + interval '8 hours',
                    v_inv.invoice_date + interval '1 day' + interval '8 hours', 'seed'
                );

                INSERT INTO wf.approval_task (
                    id, tenant_id, approval_instance_id, approval_stage_id,
                    approver_id, order_index, status,
                    assigned_at,
                    due_at, created_at, created_by, updated_at, updated_by
                ) VALUES (
                    gen_random_uuid(), v_tenant, v_inst_id, v_stage_id,
                    v_module_admin, 1,
                    CASE WHEN v_counter <= 16 THEN 'assigned' ELSE 'in_progress' END,
                    v_inv.invoice_date + interval '1 day' + interval '8 hours',
                    v_inv.invoice_date + interval '4 days',
                    v_inv.invoice_date + interval '1 day' + interval '8 hours', 'seed',
                    v_inv.invoice_date + interval '1 day' + interval '8 hours', 'seed'
                );

                -- Stage 3 for EXECUTIVE: Pending (not yet reached)
                IF v_counter > 16 THEN
                    INSERT INTO wf.approval_stage (
                        id, tenant_id, approval_instance_id, stage_no, name, mode,
                        status, created_at, created_by
                    ) VALUES (
                        gen_random_uuid(), v_tenant, v_inst_id, 3, 'CFO Approval', 'serial',
                        'pending',
                        v_inv.invoice_date + interval '1 day', 'seed'
                    );
                END IF;
            END IF;

            -- Comments on some pending instances
            IF v_counter IN (12, 15, 17) THEN
                INSERT INTO wf.approval_comment (
                    id, tenant_id, approval_instance_id, commenter_id,
                    comment_text, visibility, created_at, created_by
                ) VALUES
                (gen_random_uuid(), v_tenant, v_inst_id, v_requester,
                 CASE v_counter
                     WHEN 12 THEN 'Urgent — vendor is threatening late payment penalties.'
                     WHEN 15 THEN 'This is for the new office equipment. Budget was pre-approved by CFO.'
                     WHEN 17 THEN 'Related to Project Alpha — board pre-approved the spend envelope.'
                 END,
                 'public', v_inv.invoice_date + interval '1 day' + interval '15 minutes', 'seed');
            END IF;

            INSERT INTO wf.approval_event (
                id, tenant_id, approval_instance_id, event_type, actor_id, payload, created_at
            ) VALUES
            (gen_random_uuid(), v_tenant, v_inst_id, 'submitted', v_requester::text,
             '{"action": "submit_for_approval"}'::jsonb, v_inv.invoice_date + interval '1 day');

            UPDATE fin.purchase_invoice
            SET approval_instance_id = v_inst_id
            WHERE id = v_inv.id;

        -- ====================================================================
        -- Pattern 4: ESCALATED approvals — invoices 19-21
        -- ====================================================================
        ELSIF v_counter <= 21 THEN
            v_inst_id := gen_random_uuid();

            INSERT INTO wf.approval_instance (
                id, tenant_id, approval_definition_id, entity_type, entity_id,
                status, requested_by, requested_at,
                metadata, created_at, created_by, updated_at, updated_by
            ) VALUES (
                v_inst_id, v_tenant, v_def_enhanced, 'purchase_invoice', v_inv.id,
                'escalated',
                v_requester, v_inv.invoice_date - interval '3 days',
                jsonb_build_object('invoiceNumber', v_inv.invoice_number, 'amount', v_inv.total_amount,
                                   'escalation_reason', 'SLA breach — exceeded 48h SLA'),
                v_inv.invoice_date - interval '3 days', 'seed',
                now(), 'seed'
            );

            -- Stage 1: Completed (was approved before escalation)
            v_stage_id := gen_random_uuid();
            INSERT INTO wf.approval_stage (
                id, tenant_id, approval_instance_id, stage_no, name, mode,
                status, started_at, completed_at, created_at, created_by
            ) VALUES (
                v_stage_id, v_tenant, v_inst_id, 1, 'L1 Manager Approval', 'serial',
                'completed',
                v_inv.invoice_date - interval '3 days',
                v_inv.invoice_date - interval '2 days',
                v_inv.invoice_date - interval '3 days', 'seed'
            );

            INSERT INTO wf.approval_task (
                id, tenant_id, approval_instance_id, approval_stage_id,
                approver_id, order_index, status, decision, reason,
                assigned_at, started_at, completed_at,
                due_at, created_at, created_by, updated_at, updated_by
            ) VALUES (
                gen_random_uuid(), v_tenant, v_inst_id, v_stage_id,
                v_manager, 1, 'approved', 'approve', 'Approved with delay — was on leave',
                v_inv.invoice_date - interval '3 days',
                v_inv.invoice_date - interval '2 days' - interval '2 hours',
                v_inv.invoice_date - interval '2 days',
                v_inv.invoice_date - interval '1 day',
                v_inv.invoice_date - interval '3 days', 'seed',
                v_inv.invoice_date - interval '2 days', 'seed'
            );

            -- Stage 2: Active but escalated due to SLA breach
            v_stage_id := gen_random_uuid();
            INSERT INTO wf.approval_stage (
                id, tenant_id, approval_instance_id, stage_no, name, mode,
                status, started_at, created_at, created_by
            ) VALUES (
                v_stage_id, v_tenant, v_inst_id, 2, 'L2 Director Approval', 'serial',
                'active',
                v_inv.invoice_date - interval '2 days',
                v_inv.invoice_date - interval '2 days', 'seed'
            );

            INSERT INTO wf.approval_task (
                id, tenant_id, approval_instance_id, approval_stage_id,
                approver_id, order_index, status,
                assigned_at, started_at,
                due_at, created_at, created_by, updated_at, updated_by
            ) VALUES (
                gen_random_uuid(), v_tenant, v_inst_id, v_stage_id,
                v_module_admin, 1, 'escalated',
                v_inv.invoice_date - interval '2 days',
                v_inv.invoice_date - interval '2 days' + interval '1 hour',
                v_inv.invoice_date,
                v_inv.invoice_date - interval '2 days', 'seed',
                v_inv.invoice_date - interval '1 day', 'seed'
            );

            -- Escalation record
            INSERT INTO wf.approval_escalation (
                id, tenant_id, approval_instance_id, kind, payload, occurred_at, created_at
            ) VALUES (
                gen_random_uuid(), v_tenant, v_inst_id, 'sla_breach',
                jsonb_build_object('stage', 2, 'sla_hours', 48, 'elapsed_hours', 72,
                                   'escalated_to', 'finance_director'),
                v_inv.invoice_date - interval '1 day', v_inv.invoice_date - interval '1 day'
            );

            -- Comments
            INSERT INTO wf.approval_comment (
                id, tenant_id, approval_instance_id, commenter_id,
                comment_text, visibility, created_at, created_by
            ) VALUES
            (gen_random_uuid(), v_tenant, v_inst_id, v_requester,
             'This has been pending for 3 days. Can someone please expedite?',
             'public', v_inv.invoice_date - interval '1 day', 'seed'),
            (gen_random_uuid(), v_tenant, v_inst_id, v_agent,
             'SLA breach flagged. Escalating to Finance Director.',
             'public', v_inv.invoice_date - interval '1 day' + interval '30 minutes', 'seed');

            INSERT INTO wf.approval_event (
                id, tenant_id, approval_instance_id, event_type, actor_id, payload, created_at
            ) VALUES
            (gen_random_uuid(), v_tenant, v_inst_id, 'submitted', v_requester::text,
             '{"action": "submit_for_approval"}'::jsonb, v_inv.invoice_date - interval '3 days'),
            (gen_random_uuid(), v_tenant, v_inst_id, 'escalated', 'system',
             '{"stage": 2, "reason": "sla_breach", "sla_hours": 48}'::jsonb,
             v_inv.invoice_date - interval '1 day');

            UPDATE fin.purchase_invoice
            SET approval_instance_id = v_inst_id
            WHERE id = v_inv.id;

        -- ====================================================================
        -- Pattern 5: CANCELED approvals — invoices 22-23
        -- ====================================================================
        ELSIF v_counter <= 23 THEN
            v_inst_id := gen_random_uuid();

            INSERT INTO wf.approval_instance (
                id, tenant_id, approval_definition_id, entity_type, entity_id,
                status, decision, requested_by, requested_at, decided_by, decided_at,
                reason, metadata, created_at, created_by, updated_at, updated_by
            ) VALUES (
                v_inst_id, v_tenant, v_def_standard, 'purchase_invoice', v_inv.id,
                'canceled', NULL,
                v_requester, v_inv.invoice_date + interval '1 day',
                v_requester, v_inv.invoice_date + interval '1 day' + interval '3 hours',
                CASE v_counter
                    WHEN 22 THEN 'Recalled by submitter — incorrect amounts'
                    ELSE 'Vendor contract renegotiated — new invoice will follow'
                END,
                jsonb_build_object('invoiceNumber', v_inv.invoice_number, 'amount', v_inv.total_amount),
                v_inv.invoice_date + interval '1 day', 'seed',
                v_inv.invoice_date + interval '1 day' + interval '3 hours', 'seed'
            );

            v_stage_id := gen_random_uuid();
            INSERT INTO wf.approval_stage (
                id, tenant_id, approval_instance_id, stage_no, name, mode,
                status, started_at, completed_at, created_at, created_by
            ) VALUES (
                v_stage_id, v_tenant, v_inst_id, 1, 'L1 Manager Approval', 'serial',
                'canceled',
                v_inv.invoice_date + interval '1 day',
                v_inv.invoice_date + interval '1 day' + interval '3 hours',
                v_inv.invoice_date + interval '1 day', 'seed'
            );

            INSERT INTO wf.approval_task (
                id, tenant_id, approval_instance_id, approval_stage_id,
                approver_id, order_index, status,
                assigned_at,
                due_at, created_at, created_by, updated_at, updated_by
            ) VALUES (
                gen_random_uuid(), v_tenant, v_inst_id, v_stage_id,
                v_manager, 1, 'skipped',
                v_inv.invoice_date + interval '1 day',
                v_inv.invoice_date + interval '3 days',
                v_inv.invoice_date + interval '1 day', 'seed',
                v_inv.invoice_date + interval '1 day' + interval '3 hours', 'seed'
            );

            INSERT INTO wf.approval_event (
                id, tenant_id, approval_instance_id, event_type, actor_id, payload, created_at
            ) VALUES
            (gen_random_uuid(), v_tenant, v_inst_id, 'submitted', v_requester::text,
             '{"action": "submit_for_approval"}'::jsonb, v_inv.invoice_date + interval '1 day'),
            (gen_random_uuid(), v_tenant, v_inst_id, 'canceled', v_requester::text,
             '{"action": "recall", "reason": "submitter_recall"}'::jsonb,
             v_inv.invoice_date + interval '1 day' + interval '3 hours');

            UPDATE fin.purchase_invoice
            SET approval_instance_id = v_inst_id
            WHERE id = v_inv.id;

        -- ====================================================================
        -- Pattern 6: Remaining — COMPLETED with comments — invoices 24-25
        -- ====================================================================
        ELSE
            v_inst_id := gen_random_uuid();

            INSERT INTO wf.approval_instance (
                id, tenant_id, approval_definition_id, entity_type, entity_id,
                status, decision, requested_by, requested_at, decided_by, decided_at,
                reason, metadata, created_at, created_by, updated_at, updated_by
            ) VALUES (
                v_inst_id, v_tenant, v_def_enhanced, 'purchase_invoice', v_inv.id,
                'approved', 'approve',
                v_agent, v_inv.invoice_date + interval '1 day',
                v_module_admin, v_inv.invoice_date + interval '3 days',
                'Approved after clarification from vendor',
                jsonb_build_object('invoiceNumber', v_inv.invoice_number, 'amount', v_inv.total_amount),
                v_inv.invoice_date + interval '1 day', 'seed',
                v_inv.invoice_date + interval '3 days', 'seed'
            );

            -- Stage 1: Completed
            v_stage_id := gen_random_uuid();
            INSERT INTO wf.approval_stage (
                id, tenant_id, approval_instance_id, stage_no, name, mode,
                status, started_at, completed_at, created_at, created_by
            ) VALUES (
                v_stage_id, v_tenant, v_inst_id, 1, 'L1 Manager Approval', 'serial',
                'completed',
                v_inv.invoice_date + interval '1 day',
                v_inv.invoice_date + interval '2 days',
                v_inv.invoice_date + interval '1 day', 'seed'
            );

            INSERT INTO wf.approval_task (
                id, tenant_id, approval_instance_id, approval_stage_id,
                approver_id, order_index, status, decision, reason,
                assigned_at, started_at, completed_at,
                due_at, created_at, created_by, updated_at, updated_by
            ) VALUES (
                gen_random_uuid(), v_tenant, v_inst_id, v_stage_id,
                v_manager, 1, 'approved', 'approve',
                'Approved — requested vendor clarification on line items, received confirmation',
                v_inv.invoice_date + interval '1 day',
                v_inv.invoice_date + interval '1 day' + interval '4 hours',
                v_inv.invoice_date + interval '2 days',
                v_inv.invoice_date + interval '3 days',
                v_inv.invoice_date + interval '1 day', 'seed',
                v_inv.invoice_date + interval '2 days', 'seed'
            );

            -- Stage 2: Completed
            v_stage_id := gen_random_uuid();
            INSERT INTO wf.approval_stage (
                id, tenant_id, approval_instance_id, stage_no, name, mode,
                status, started_at, completed_at, created_at, created_by
            ) VALUES (
                v_stage_id, v_tenant, v_inst_id, 2, 'L2 Director Approval', 'serial',
                'completed',
                v_inv.invoice_date + interval '2 days',
                v_inv.invoice_date + interval '3 days',
                v_inv.invoice_date + interval '2 days', 'seed'
            );

            INSERT INTO wf.approval_task (
                id, tenant_id, approval_instance_id, approval_stage_id,
                approver_id, order_index, status, decision, reason,
                assigned_at, started_at, completed_at,
                due_at, created_at, created_by, updated_at, updated_by
            ) VALUES (
                gen_random_uuid(), v_tenant, v_inst_id, v_stage_id,
                v_module_admin, 1, 'approved', 'approve',
                'Final approval — vendor terms confirmed',
                v_inv.invoice_date + interval '2 days',
                v_inv.invoice_date + interval '2 days' + interval '3 hours',
                v_inv.invoice_date + interval '3 days',
                v_inv.invoice_date + interval '5 days',
                v_inv.invoice_date + interval '2 days', 'seed',
                v_inv.invoice_date + interval '3 days', 'seed'
            );

            -- Rich comment thread
            INSERT INTO wf.approval_comment (
                id, tenant_id, approval_instance_id, commenter_id,
                comment_text, visibility, created_at, created_by
            ) VALUES
            (gen_random_uuid(), v_tenant, v_inst_id, v_agent,
             'Invoice submitted for approval. Vendor: standard terms NET-30.',
             'public', v_inv.invoice_date + interval '1 day', 'seed'),
            (gen_random_uuid(), v_tenant, v_inst_id, v_manager,
             'Line item 2 amount doesn''t match the PO. Can you verify with the vendor?',
             'public', v_inv.invoice_date + interval '1 day' + interval '6 hours', 'seed'),
            (gen_random_uuid(), v_tenant, v_inst_id, v_agent,
             'Checked with vendor — confirmed the amount is correct. Quantity was adjusted in the delivery.',
             'public', v_inv.invoice_date + interval '1 day' + interval '20 hours', 'seed'),
            (gen_random_uuid(), v_tenant, v_inst_id, v_manager,
             'Thanks for clarifying. Approved.',
             'public', v_inv.invoice_date + interval '2 days', 'seed'),
            (gen_random_uuid(), v_tenant, v_inst_id, v_module_admin,
             'Final sign-off complete. Processing for payment.',
             'public', v_inv.invoice_date + interval '3 days', 'seed');

            INSERT INTO wf.approval_event (
                id, tenant_id, approval_instance_id, event_type, actor_id, payload, created_at
            ) VALUES
            (gen_random_uuid(), v_tenant, v_inst_id, 'submitted', v_agent::text,
             '{"action": "submit_for_approval"}'::jsonb, v_inv.invoice_date + interval '1 day'),
            (gen_random_uuid(), v_tenant, v_inst_id, 'stage_completed', v_manager::text,
             '{"stage": 1, "decision": "approve"}'::jsonb, v_inv.invoice_date + interval '2 days'),
            (gen_random_uuid(), v_tenant, v_inst_id, 'approved', v_module_admin::text,
             '{"stage": 2, "decision": "approve"}'::jsonb, v_inv.invoice_date + interval '3 days');

            UPDATE fin.purchase_invoice
            SET approval_instance_id = v_inst_id
            WHERE id = v_inv.id;
        END IF;
    END LOOP;

    RAISE NOTICE 'Approval instances seeded for demo_ca: % invoices processed', v_counter;
END $$;
