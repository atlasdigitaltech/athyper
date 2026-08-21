-- ============================================================================
-- FILE: demo/009_activity_log.sql
-- Activity log seed for AP Non-PO demo scenarios
-- Populates audit.audit_log for all demo purchase invoices so the Activity
-- tab renders real history instead of an empty state.
--
-- Invoice UUIDs (pinned, matching scenario files):
--   INV-A1-0001  00000001-0000-0000-0001-000000000001  (plain non-PO, approved)
--   INV-A3-0001  00000001-0000-0000-0001-000000000003  (WHT 10%, draft)
--   INV-A4-0001  00000001-0000-0000-0001-000000000004  (WHT + VAT, draft)
--   INV-A7-0001  00000001-0000-0000-0001-000000000007  (advance recovery, draft)
--   INV-A8-0001  00000001-0000-0000-0001-000000000008  (retention, draft)
--
-- Idempotent: guarded by checking audit.audit_log for existing rows per invoice.
-- ============================================================================

DO $activity_log_seed$
DECLARE
    v_tenant_id  uuid;
    v_cc_id      uuid;
    -- Pinned invoice UUIDs
    v_inv_a1     uuid := '00000001-0000-0000-0001-000000000001';
    v_inv_a3     uuid := '00000001-0000-0000-0001-000000000003';
    v_inv_a4     uuid := '00000001-0000-0000-0001-000000000004';
    v_inv_a7     uuid := '00000001-0000-0000-0001-000000000007';
    v_inv_a8     uuid := '00000001-0000-0000-0001-000000000008';
    -- Base timestamp anchors (relative to now so they look recent)
    v_t0         timestamptz := now() - interval '10 days';
BEGIN
    SELECT id INTO v_tenant_id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper';
    IF v_tenant_id IS NULL THEN
        RAISE NOTICE 'demo/009 activity_log: tenant "athyper" not found, skipping';
        RETURN;
    END IF;

    SELECT id INTO v_cc_id FROM master.company_code
      WHERE tenant_id = v_tenant_id AND code = 'AUIC';

    -- Set session context required by audit.append_event()
    PERFORM set_config('app.current_tenant_id', v_tenant_id::text, true);
    PERFORM set_config('app.database_plane', 'neon', true);

    -- =========================================================================
    -- A1 — INV-A1-0001 (Plain Non-PO, full lifecycle: draft → submitted →
    --      workflow approved → posted)
    -- =========================================================================
    IF NOT EXISTS (
        SELECT 1 FROM audit.audit_log
         WHERE tenant_id = v_tenant_id AND entity_id = v_inv_a1
           AND context->>'domain' IS NOT NULL
    ) THEN
        -- Day -10: created in draft
        PERFORM audit.append_event(
            'record.created', 'create'::audit.operation_d, 'purchase_invoice', v_inv_a1,
            DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT,
            NULL, NULL, NULL,
            jsonb_build_object(
                'domain', 'document', 'activity_type', 'document.created',
                'company_code_id', v_cc_id::text,
                'message', 'Invoice INV-A1-0001 created in draft', 'code', 'INV-A1-0001', 'amount', 2500.00
            ),
            NULL, NULL, v_t0
        );

        -- Day -9: lines updated
        PERFORM audit.append_event(
            'record.updated', 'update'::audit.operation_d, 'purchase_invoice', v_inv_a1,
            DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT,
            NULL, NULL, NULL,
            jsonb_build_object(
                'domain', 'document', 'activity_type', 'document.updated',
                'company_code_id', v_cc_id::text,
                'message', 'Invoice lines updated — 2 lines added', 'fields_changed', '["lines"]'::jsonb
            ),
            NULL, NULL, v_t0 + interval '1 day'
        );

        -- Day -8: submitted for approval
        PERFORM audit.append_event(
            'record.submitted', 'execute'::audit.operation_d, 'purchase_invoice', v_inv_a1,
            DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT,
            NULL, NULL, NULL,
            jsonb_build_object(
                'domain', 'document', 'activity_type', 'document.submitted',
                'company_code_id', v_cc_id::text,
                'message', 'Invoice submitted for approval', 'from_state', 'draft', 'to_state', 'pending_approval'
            ),
            NULL, NULL, v_t0 + interval '2 days'
        );

        -- Day -8: workflow routing initiated
        PERFORM audit.append_event(
            'record.submitted', 'execute'::audit.operation_d, 'purchase_invoice', v_inv_a1,
            DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT,
            NULL, NULL, NULL,
            jsonb_build_object(
                'domain', 'workflow', 'activity_type', 'workflow.initiated',
                'company_code_id', v_cc_id::text,
                'message', 'Approval workflow initiated — AP Controller review', 'approver_role', 'ap_controller'
            ),
            NULL, NULL, v_t0 + interval '2 days' + interval '1 minute'
        );

        -- Day -7: workflow approved by AP controller
        PERFORM audit.append_event(
            'record.approved', 'approve'::audit.operation_d, 'purchase_invoice', v_inv_a1,
            DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT,
            NULL, NULL, NULL,
            jsonb_build_object(
                'domain', 'workflow', 'activity_type', 'workflow.approved',
                'company_code_id', v_cc_id::text,
                'message', 'Approved by AP Controller', 'step', 'ap_controller_review',
                'from_state', 'pending_approval', 'to_state', 'approved'
            ),
            NULL, NULL, v_t0 + interval '3 days'
        );

        -- Day -7: document approved
        PERFORM audit.append_event(
            'record.approved', 'approve'::audit.operation_d, 'purchase_invoice', v_inv_a1,
            DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT,
            NULL, NULL, NULL,
            jsonb_build_object(
                'domain', 'document', 'activity_type', 'document.approved',
                'company_code_id', v_cc_id::text,
                'message', 'Invoice approved — all workflow steps complete',
                'from_state', 'pending_approval', 'to_state', 'approved'
            ),
            NULL, NULL, v_t0 + interval '3 days' + interval '2 minutes'
        );

        -- Day -6: journal posted
        PERFORM audit.append_event(
            'record.posted', 'execute'::audit.operation_d, 'purchase_invoice', v_inv_a1,
            DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT,
            NULL, NULL, NULL,
            jsonb_build_object(
                'domain', 'accounting', 'activity_type', 'accounting.posted',
                'company_code_id', v_cc_id::text,
                'message', 'Journal entry posted to AP Trade Payable and Expense ledger',
                'je_lines', 2, 'debit_total', 2500.00, 'credit_total', 2500.00
            ),
            NULL, NULL, v_t0 + interval '4 days'
        );

        RAISE NOTICE 'demo/009: seeded 7 audit_log rows for INV-A1-0001';
    ELSE
        RAISE NOTICE 'demo/009: INV-A1-0001 audit_log rows already exist, skipping';
    END IF;

    -- =========================================================================
    -- A3 — INV-A3-0001 (WHT 10%, currently in Draft)
    -- =========================================================================
    IF NOT EXISTS (
        SELECT 1 FROM audit.audit_log
         WHERE tenant_id = v_tenant_id AND entity_id = v_inv_a3
           AND context->>'domain' IS NOT NULL
    ) THEN
        -- Day -5: created in draft
        PERFORM audit.append_event(
            'record.created', 'create'::audit.operation_d, 'purchase_invoice', v_inv_a3,
            DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT,
            NULL, NULL, NULL,
            jsonb_build_object(
                'domain', 'document', 'activity_type', 'document.created',
                'company_code_id', v_cc_id::text,
                'message', 'Invoice INV-A3-0001 created in draft', 'code', 'INV-A3-0001',
                'amount', 1000.00, 'wht_amount', 100.00
            ),
            NULL, NULL, v_t0 + interval '5 days'
        );

        -- Day -4: line added with WHT group
        PERFORM audit.append_event(
            'record.updated', 'update'::audit.operation_d, 'purchase_invoice', v_inv_a3,
            DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT,
            NULL, NULL, NULL,
            jsonb_build_object(
                'domain', 'document', 'activity_type', 'document.updated',
                'company_code_id', v_cc_id::text,
                'message', 'Consulting line added with WHT group WHT_CONSULT_10PCT',
                'fields_changed', '["lines","withholding_tax_amount"]'::jsonb
            ),
            NULL, NULL, v_t0 + interval '6 days'
        );

        -- Day -3: WHT amount recalculated
        PERFORM audit.append_event(
            'record.updated', 'update'::audit.operation_d, 'purchase_invoice', v_inv_a3,
            DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT,
            NULL, NULL, NULL,
            jsonb_build_object(
                'domain', 'document', 'activity_type', 'document.updated',
                'company_code_id', v_cc_id::text,
                'message', 'WHT recalculated — 10% of USD 1,000 = USD 100; net payable USD 900',
                'fields_changed', '["withholding_tax_amount","total_amount"]'::jsonb
            ),
            NULL, NULL, v_t0 + interval '7 days'
        );

        RAISE NOTICE 'demo/009: seeded 3 audit_log rows for INV-A3-0001';
    ELSE
        RAISE NOTICE 'demo/009: INV-A3-0001 audit_log rows already exist, skipping';
    END IF;

    -- =========================================================================
    -- A4 — INV-A4-0001 (WHT + VAT, currently in Draft)
    -- =========================================================================
    IF NOT EXISTS (
        SELECT 1 FROM audit.audit_log
         WHERE tenant_id = v_tenant_id AND entity_id = v_inv_a4
           AND context->>'domain' IS NOT NULL
    ) THEN
        -- Created in draft
        PERFORM audit.append_event(
            'record.created', 'create'::audit.operation_d, 'purchase_invoice', v_inv_a4,
            DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT,
            NULL, NULL, NULL,
            jsonb_build_object(
                'domain', 'document', 'activity_type', 'document.created',
                'company_code_id', v_cc_id::text,
                'message', 'Invoice INV-A4-0001 created in draft', 'code', 'INV-A4-0001', 'tax_mode', 'tax_inclusive'
            ),
            NULL, NULL, v_t0 + interval '5 days'
        );

        -- Tax lines added (WHT + VAT)
        PERFORM audit.append_event(
            'record.updated', 'update'::audit.operation_d, 'purchase_invoice', v_inv_a4,
            DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT,
            NULL, NULL, NULL,
            jsonb_build_object(
                'domain', 'document', 'activity_type', 'document.updated',
                'company_code_id', v_cc_id::text,
                'message', 'VAT and WHT groups applied — VAT 15% + WHT 10% on consulting line',
                'fields_changed', '["tax_amount","withholding_tax_amount","lines"]'::jsonb
            ),
            NULL, NULL, v_t0 + interval '6 days'
        );

        RAISE NOTICE 'demo/009: seeded 2 audit_log rows for INV-A4-0001';
    ELSE
        RAISE NOTICE 'demo/009: INV-A4-0001 audit_log rows already exist, skipping';
    END IF;

    -- =========================================================================
    -- A7 — INV-A7-0001 (Advance recovery, currently in Draft)
    -- =========================================================================
    IF NOT EXISTS (
        SELECT 1 FROM audit.audit_log
         WHERE tenant_id = v_tenant_id AND entity_id = v_inv_a7
           AND context->>'domain' IS NOT NULL
    ) THEN
        -- Created in draft
        PERFORM audit.append_event(
            'record.created', 'create'::audit.operation_d, 'purchase_invoice', v_inv_a7,
            DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT,
            NULL, NULL, NULL,
            jsonb_build_object(
                'domain', 'document', 'activity_type', 'document.created',
                'company_code_id', v_cc_id::text,
                'message', 'Invoice INV-A7-0001 created in draft with advance recovery deduction', 'code', 'INV-A7-0001'
            ),
            NULL, NULL, v_t0 + interval '5 days'
        );

        -- Advance deduction linked
        PERFORM audit.append_event(
            'record.updated', 'update'::audit.operation_d, 'purchase_invoice', v_inv_a7,
            DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT,
            NULL, NULL, NULL,
            jsonb_build_object(
                'domain', 'document', 'activity_type', 'document.updated',
                'company_code_id', v_cc_id::text,
                'message', 'Advance deduction linked — ADV-A7-0001 recovery applied to net payable',
                'fields_changed', '["advance_deduction_amount"]'::jsonb
            ),
            NULL, NULL, v_t0 + interval '6 days'
        );

        RAISE NOTICE 'demo/009: seeded 2 audit_log rows for INV-A7-0001';
    ELSE
        RAISE NOTICE 'demo/009: INV-A7-0001 audit_log rows already exist, skipping';
    END IF;

    -- =========================================================================
    -- A8 — INV-A8-0001 (Retention, currently in Draft)
    -- =========================================================================
    IF NOT EXISTS (
        SELECT 1 FROM audit.audit_log
         WHERE tenant_id = v_tenant_id AND entity_id = v_inv_a8
           AND context->>'domain' IS NOT NULL
    ) THEN
        -- Created in draft
        PERFORM audit.append_event(
            'record.created', 'create'::audit.operation_d, 'purchase_invoice', v_inv_a8,
            DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT,
            NULL, NULL, NULL,
            jsonb_build_object(
                'domain', 'document', 'activity_type', 'document.created',
                'company_code_id', v_cc_id::text,
                'message', 'Invoice INV-A8-0001 created in draft with 10% retention hold', 'code', 'INV-A8-0001'
            ),
            NULL, NULL, v_t0 + interval '5 days'
        );

        -- Retention amount set
        PERFORM audit.append_event(
            'record.updated', 'update'::audit.operation_d, 'purchase_invoice', v_inv_a8,
            DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT,
            NULL, NULL, NULL,
            jsonb_build_object(
                'domain', 'document', 'activity_type', 'document.updated',
                'company_code_id', v_cc_id::text,
                'message', 'Retention amount set — 10% withheld pending project completion',
                'fields_changed', '["retention_amount"]'::jsonb
            ),
            NULL, NULL, v_t0 + interval '6 days'
        );

        RAISE NOTICE 'demo/009: seeded 2 audit_log rows for INV-A8-0001';
    ELSE
        RAISE NOTICE 'demo/009: INV-A8-0001 audit_log rows already exist, skipping';
    END IF;

END $activity_log_seed$;
