-- ============================================================================
-- FILE: demo/099_demo_apply.sql
-- Purpose: Orchestrator — runs all 7 demo scenarios in order and prints summary
-- Depends on: blueprint/* fully applied; scenario files 001..007 executed
-- Idempotent: each scenario file has its own skip-if-exists guard
-- ============================================================================
-- Invocation model:
--   This file is meant to be run AFTER executing files 001..007 sequentially.
--   It does NOT include the scenario files — your migration runner should
--   include them in numerical order, then run this file last.
--
--   In a psql session the full sequence is:
--     \i demo/001_supplier_profile.sql
--     \i demo/002_scenario_a1_plain_non_po.sql
--     \i demo/003_scenario_a3_non_po_wht.sql
--     \i demo/004_scenario_a4_non_po_wht_vat.sql
--     \i demo/005_scenario_a7_advance_recovery.sql
--     \i demo/006_scenario_a8_retention.sql
--     \i demo/007_scenario_supplier_advance.sql
--     \i demo/008_scenario_a1_workflow_approvers.sql
--     \i demo/009_activity_log.sql
--     \i demo/099_demo_apply.sql
-- ============================================================================

DO $demo_summary$
DECLARE
    v_tenant_id    uuid;
    v_cc_id        uuid;
    v_supplier_cnt   integer;
    v_scp_cnt      integer;
    v_pm_cnt       integer;
    v_link_cnt     integer;
    v_tg_cnt       integer;
    v_inv_cnt      integer;
    v_adv_cnt      integer;
    v_act_cnt      integer;
    v_rec          record;
BEGIN
    SELECT id INTO v_tenant_id FROM master.tenant WHERE code = 'athyper';
    SELECT id INTO v_cc_id     FROM master.company_code
     WHERE tenant_id = v_tenant_id AND code = 'AUIC';

    IF v_tenant_id IS NULL OR v_cc_id IS NULL THEN
        RAISE EXCEPTION 'demo/099: tenant athyper / company AUIC not found';
    END IF;

    -- ── Verify demo prerequisites ──────────────────────────────────────────
    SELECT count(*) INTO v_supplier_cnt FROM master.supplier
     WHERE tenant_id = v_tenant_id AND supplier_code = 'ACME-CONSULT-US';

    SELECT count(*) INTO v_scp_cnt FROM master.company_code_supplier_profile scp
      JOIN master.supplier s ON s.id = scp.supplier_id
     WHERE scp.tenant_id = v_tenant_id
       AND scp.company_code_id = v_cc_id
       AND s.supplier_code = 'ACME-CONSULT-US';

    SELECT count(*) INTO v_pm_cnt FROM master.payment_method
     WHERE tenant_id = v_tenant_id AND code = 'WIRE-USD';

    SELECT count(*) INTO v_link_cnt FROM master.bank_account_link
     WHERE tenant_id = v_tenant_id
       AND owner_type = 'company_code'
       AND owner_id = v_cc_id
       AND purpose = 'disbursement';

    SELECT count(*) INTO v_tg_cnt FROM control.tax_group
     WHERE tenant_id = v_tenant_id
       AND code IN ('VAT_STD_US_7PCT','WHT_CONSULT_10PCT');

    -- ── Count scenario documents ────────────────────────────────────────────
    SELECT count(*) INTO v_inv_cnt FROM document.purchase_invoice
     WHERE tenant_id = v_tenant_id
       AND invoice_number IN ('INV-A1-0001','INV-A3-0001','INV-A4-0001',
                              'INV-A7-0001','INV-A8-0001');

    SELECT count(*) INTO v_adv_cnt FROM document.payment_entry
     WHERE tenant_id = v_tenant_id
       AND payment_number IN ('ADV-A7-0001','ADV-VA-0001');

    SELECT count(*) INTO v_act_cnt FROM log.activity_log
     WHERE tenant_id = v_tenant_id
       AND entity_type = 'purchase_invoice'
       AND entity_id IN (
           '00000001-0000-0000-0001-000000000001',
           '00000001-0000-0000-0001-000000000003',
           '00000001-0000-0000-0001-000000000004',
           '00000001-0000-0000-0001-000000000007',
           '00000001-0000-0000-0001-000000000008'
       );

    -- ── Print summary ───────────────────────────────────────────────────────
    RAISE NOTICE '';
    RAISE NOTICE '════════════════════════════════════════════════════════════════';
    RAISE NOTICE ' DEMO APPLY SUMMARY — pack_ap_non_po / tenant athyper / AUIC';
    RAISE NOTICE '════════════════════════════════════════════════════════════════';
    RAISE NOTICE '';
    RAISE NOTICE '  Master data:';
    RAISE NOTICE '    supplier (ACME-CONSULT-US)          : %', v_supplier_cnt;
    RAISE NOTICE '    supplier_profile (ACME × AUIC)     : %', v_scp_cnt;
    RAISE NOTICE '    payment_method (WIRE-USD)          : %', v_pm_cnt;
    RAISE NOTICE '    bank_account_link (disbursement)   : %', v_link_cnt;
    RAISE NOTICE '    tax_group (VAT + WHT)              : % (of 2)', v_tg_cnt;
    RAISE NOTICE '';
    RAISE NOTICE '  Scenario documents:';
    RAISE NOTICE '    purchase_invoice (A1,A3,A4,A7,A8)  : % (of 5)', v_inv_cnt;
    RAISE NOTICE '    payment_entry (A7 advance, VA)     : % (of 2)', v_adv_cnt;
    RAISE NOTICE '    activity_log (all invoices)        : % rows', v_act_cnt;
    RAISE NOTICE '';

    -- ── Per-scenario detail ─────────────────────────────────────────────────
    RAISE NOTICE '  Invoice detail:';
    FOR v_rec IN
        SELECT invoice_number, status,
               subtotal_amount, tax_amount, withholding_tax_amount,
               retention_amount, advance_deduction_amount,
               total_amount, payable_amount
          FROM document.purchase_invoice
         WHERE tenant_id = v_tenant_id
           AND invoice_number LIKE 'INV-A%'
         ORDER BY invoice_number
    LOOP
        RAISE NOTICE '    % | status=% | subtotal=% tax=% wht=% retention=% adv_ded=% total=% payable=%',
            rpad(v_rec.invoice_number, 12), rpad(v_rec.status, 8),
            v_rec.subtotal_amount, v_rec.tax_amount, v_rec.withholding_tax_amount,
            v_rec.retention_amount, v_rec.advance_deduction_amount,
            v_rec.total_amount, v_rec.payable_amount;
    END LOOP;

    RAISE NOTICE '';
    RAISE NOTICE '  Payment detail:';
    FOR v_rec IN
        SELECT payment_number, payment_type, status,
               payment_amount, currency_code
          FROM document.payment_entry
         WHERE tenant_id = v_tenant_id
           AND payment_number LIKE 'ADV-%'
         ORDER BY payment_number
    LOOP
        RAISE NOTICE '    % | type=% | status=% | amount=% %',
            rpad(v_rec.payment_number, 12), rpad(v_rec.payment_type, 10),
            rpad(v_rec.status, 8), v_rec.payment_amount, v_rec.currency_code;
    END LOOP;

    RAISE NOTICE '';
    RAISE NOTICE '════════════════════════════════════════════════════════════════';
    RAISE NOTICE ' NEXT STEPS';
    RAISE NOTICE '════════════════════════════════════════════════════════════════';
    RAISE NOTICE '  1. Submit each draft invoice for approval:';
    RAISE NOTICE '       UPDATE document.purchase_invoice SET status=''pending_approval''';
    RAISE NOTICE '        WHERE invoice_number IN (''INV-A1-0001'',...);';
    RAISE NOTICE '  2. Approve (or use entity_operation handler_target=''approve'').';
    RAISE NOTICE '  3. Post — invokes control.generate_event_entries()';
    RAISE NOTICE '       for event_code=''ORDER_APPROVAL'' → produces JE lines per §6.';
    RAISE NOTICE '  4. Run the verification query in README.md to confirm';
    RAISE NOTICE '       every posted invoice has a balanced JE (sum = 0).';
    RAISE NOTICE '';

    IF v_inv_cnt < 5 OR v_adv_cnt < 2 THEN
        RAISE WARNING 'Demo apply: expected 5 invoices + 2 payments; got % + %. Re-run any missing scenario files.',
            v_inv_cnt, v_adv_cnt;
    END IF;
END $demo_summary$;
