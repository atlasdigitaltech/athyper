-- ============================================================================
-- FILE: demo/009_activity_log.sql
-- Activity log seed for AP Non-PO demo scenarios
-- Populates log.activity_log for all demo purchase invoices so the Activity
-- tab renders real history instead of an empty state.
--
-- Invoice UUIDs (pinned, matching scenario files):
--   INV-A1-0001  00000001-0000-0000-0001-000000000001  (plain non-PO, approved)
--   INV-A3-0001  00000001-0000-0000-0001-000000000003  (WHT 10%, draft)
--   INV-A4-0001  00000001-0000-0000-0001-000000000004  (WHT + VAT, draft)
--   INV-A7-0001  00000001-0000-0000-0001-000000000007  (advance recovery, draft)
--   INV-A8-0001  00000001-0000-0000-0001-000000000008  (retention, draft)
--
-- Idempotent: rows keyed on entity_id + activity_type + created_at bucket
-- (a WHERE NOT EXISTS guard on a stable created_at offset prevents duplicates).
-- ============================================================================

DO $activity_log_seed$
DECLARE
    v_tenant_id  uuid;
    v_sys        uuid := '00000000-0000-0000-0000-000000000000';
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

    -- ── Helpers: skip if any activity_log row already exists for this invoice ──
    -- Each invoice block is individually guarded.

    -- =========================================================================
    -- A1 — INV-A1-0001 (Plain Non-PO, full lifecycle: draft → submitted →
    --      workflow approved → posted)
    -- =========================================================================
    IF NOT EXISTS (
        SELECT 1 FROM log.activity_log
         WHERE tenant_id = v_tenant_id AND entity_id = v_inv_a1
    ) THEN
        INSERT INTO log.activity_log
            (tenant_id, domain, activity_type, entity_type, entity_id,
             actor_id, company_code_id, detail, created_by, created_at)
        VALUES
        -- Day -10: created in draft
        (v_tenant_id, 'document', 'document.created', 'purchase_invoice', v_inv_a1,
         NULL, v_cc_id,
         '{"message": "Invoice INV-A1-0001 created in draft", "invoice_number": "INV-A1-0001", "amount": 2500.00}',
         v_sys, v_t0),

        -- Day -9: lines updated
        (v_tenant_id, 'document', 'document.updated', 'purchase_invoice', v_inv_a1,
         NULL, v_cc_id,
         '{"message": "Invoice lines updated — 2 lines added", "fields_changed": ["lines"]}',
         v_sys, v_t0 + interval '1 day'),

        -- Day -8: submitted for approval
        (v_tenant_id, 'document', 'document.submitted', 'purchase_invoice', v_inv_a1,
         NULL, v_cc_id,
         '{"message": "Invoice submitted for approval", "from_state": "draft", "to_state": "pending_approval"}',
         v_sys, v_t0 + interval '2 days'),

        -- Day -8: workflow routing initiated
        (v_tenant_id, 'workflow', 'workflow.initiated', 'purchase_invoice', v_inv_a1,
         NULL, v_cc_id,
         '{"message": "Approval workflow initiated — AP Controller review", "approver_role": "ap_controller"}',
         v_sys, v_t0 + interval '2 days' + interval '1 minute'),

        -- Day -7: workflow approved by AP controller
        (v_tenant_id, 'workflow', 'workflow.approved', 'purchase_invoice', v_inv_a1,
         NULL, v_cc_id,
         '{"message": "Approved by AP Controller", "step": "ap_controller_review", "from_state": "pending_approval", "to_state": "approved"}',
         v_sys, v_t0 + interval '3 days'),

        -- Day -7: document approved
        (v_tenant_id, 'document', 'document.approved', 'purchase_invoice', v_inv_a1,
         NULL, v_cc_id,
         '{"message": "Invoice approved — all workflow steps complete", "from_state": "pending_approval", "to_state": "approved"}',
         v_sys, v_t0 + interval '3 days' + interval '2 minutes'),

        -- Day -6: journal posted
        (v_tenant_id, 'accounting', 'accounting.posted', 'purchase_invoice', v_inv_a1,
         NULL, v_cc_id,
         '{"message": "Journal entry posted to AP Trade Payable and Expense ledger", "je_lines": 2, "debit_total": 2500.00, "credit_total": 2500.00}',
         v_sys, v_t0 + interval '4 days');

        RAISE NOTICE 'demo/009: seeded 6 activity_log rows for INV-A1-0001';
    ELSE
        RAISE NOTICE 'demo/009: INV-A1-0001 activity_log rows already exist, skipping';
    END IF;

    -- =========================================================================
    -- A3 — INV-A3-0001 (WHT 10%, currently in Draft)
    -- =========================================================================
    IF NOT EXISTS (
        SELECT 1 FROM log.activity_log
         WHERE tenant_id = v_tenant_id AND entity_id = v_inv_a3
    ) THEN
        INSERT INTO log.activity_log
            (tenant_id, domain, activity_type, entity_type, entity_id,
             actor_id, company_code_id, detail, created_by, created_at)
        VALUES
        -- Day -5: created in draft
        (v_tenant_id, 'document', 'document.created', 'purchase_invoice', v_inv_a3,
         NULL, v_cc_id,
         '{"message": "Invoice INV-A3-0001 created in draft", "invoice_number": "INV-A3-0001", "amount": 1000.00, "wht_amount": 100.00}',
         v_sys, v_t0 + interval '5 days'),

        -- Day -4: line added with WHT group
        (v_tenant_id, 'document', 'document.updated', 'purchase_invoice', v_inv_a3,
         NULL, v_cc_id,
         '{"message": "Consulting line added with WHT group WHT_CONSULT_10PCT", "fields_changed": ["lines", "withholding_tax_amount"]}',
         v_sys, v_t0 + interval '6 days'),

        -- Day -3: WHT amount recalculated
        (v_tenant_id, 'document', 'document.updated', 'purchase_invoice', v_inv_a3,
         NULL, v_cc_id,
         '{"message": "WHT recalculated — 10% of USD 1,000 = USD 100; net payable USD 900", "fields_changed": ["withholding_tax_amount", "total_amount"]}',
         v_sys, v_t0 + interval '7 days');

        RAISE NOTICE 'demo/009: seeded 3 activity_log rows for INV-A3-0001';
    ELSE
        RAISE NOTICE 'demo/009: INV-A3-0001 activity_log rows already exist, skipping';
    END IF;

    -- =========================================================================
    -- A4 — INV-A4-0001 (WHT + VAT, currently in Draft)
    -- =========================================================================
    IF NOT EXISTS (
        SELECT 1 FROM log.activity_log
         WHERE tenant_id = v_tenant_id AND entity_id = v_inv_a4
    ) THEN
        INSERT INTO log.activity_log
            (tenant_id, domain, activity_type, entity_type, entity_id,
             actor_id, company_code_id, detail, created_by, created_at)
        VALUES
        -- Created in draft
        (v_tenant_id, 'document', 'document.created', 'purchase_invoice', v_inv_a4,
         NULL, v_cc_id,
         '{"message": "Invoice INV-A4-0001 created in draft", "invoice_number": "INV-A4-0001", "tax_mode": "tax_inclusive"}',
         v_sys, v_t0 + interval '5 days'),

        -- Tax lines added (WHT + VAT)
        (v_tenant_id, 'document', 'document.updated', 'purchase_invoice', v_inv_a4,
         NULL, v_cc_id,
         '{"message": "VAT and WHT groups applied — VAT 15% + WHT 10% on consulting line", "fields_changed": ["tax_amount", "withholding_tax_amount", "lines"]}',
         v_sys, v_t0 + interval '6 days');

        RAISE NOTICE 'demo/009: seeded 2 activity_log rows for INV-A4-0001';
    ELSE
        RAISE NOTICE 'demo/009: INV-A4-0001 activity_log rows already exist, skipping';
    END IF;

    -- =========================================================================
    -- A7 — INV-A7-0001 (Advance recovery, currently in Draft)
    -- =========================================================================
    IF NOT EXISTS (
        SELECT 1 FROM log.activity_log
         WHERE tenant_id = v_tenant_id AND entity_id = v_inv_a7
    ) THEN
        INSERT INTO log.activity_log
            (tenant_id, domain, activity_type, entity_type, entity_id,
             actor_id, company_code_id, detail, created_by, created_at)
        VALUES
        -- Created in draft
        (v_tenant_id, 'document', 'document.created', 'purchase_invoice', v_inv_a7,
         NULL, v_cc_id,
         '{"message": "Invoice INV-A7-0001 created in draft with advance recovery deduction", "invoice_number": "INV-A7-0001"}',
         v_sys, v_t0 + interval '5 days'),

        -- Advance deduction linked
        (v_tenant_id, 'document', 'document.updated', 'purchase_invoice', v_inv_a7,
         NULL, v_cc_id,
         '{"message": "Advance deduction linked — ADV-A7-0001 recovery applied to net payable", "fields_changed": ["advance_deduction_amount"]}',
         v_sys, v_t0 + interval '6 days');

        RAISE NOTICE 'demo/009: seeded 2 activity_log rows for INV-A7-0001';
    ELSE
        RAISE NOTICE 'demo/009: INV-A7-0001 activity_log rows already exist, skipping';
    END IF;

    -- =========================================================================
    -- A8 — INV-A8-0001 (Retention, currently in Draft)
    -- =========================================================================
    IF NOT EXISTS (
        SELECT 1 FROM log.activity_log
         WHERE tenant_id = v_tenant_id AND entity_id = v_inv_a8
    ) THEN
        INSERT INTO log.activity_log
            (tenant_id, domain, activity_type, entity_type, entity_id,
             actor_id, company_code_id, detail, created_by, created_at)
        VALUES
        -- Created in draft
        (v_tenant_id, 'document', 'document.created', 'purchase_invoice', v_inv_a8,
         NULL, v_cc_id,
         '{"message": "Invoice INV-A8-0001 created in draft with 10% retention hold", "invoice_number": "INV-A8-0001"}',
         v_sys, v_t0 + interval '5 days'),

        -- Retention amount set
        (v_tenant_id, 'document', 'document.updated', 'purchase_invoice', v_inv_a8,
         NULL, v_cc_id,
         '{"message": "Retention amount set — 10% withheld pending project completion", "fields_changed": ["retention_amount"]}',
         v_sys, v_t0 + interval '6 days');

        RAISE NOTICE 'demo/009: seeded 2 activity_log rows for INV-A8-0001';
    ELSE
        RAISE NOTICE 'demo/009: INV-A8-0001 activity_log rows already exist, skipping';
    END IF;

END $activity_log_seed$;
