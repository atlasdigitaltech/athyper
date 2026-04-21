-- ============================================================================
-- FILE: demo/003_scenario_a3_non_po_wht.sql
-- Scenario A3: Non-PO invoice with WHT (no VAT)
-- Expected JE (3 lines):
--   Dr Expense              1,000
--      Cr WHT Payable               100  (10% of 1,000)
--      Cr AP Trade Payable          900  (net_payable = total - WHT)
-- ============================================================================
-- Invoice: INV-A3-0001, USD 1,000 gross, 10% WHT on consulting
-- Vendor payable becomes 900; 100 remitted to tax authority at WHT due date.
-- ============================================================================

DO $scenario_a3$
DECLARE
    v_tenant_id    uuid;
    v_cc_id        uuid;
    v_vendor_id    uuid;
    v_sys          uuid := '00000000-0000-0000-0000-000000000000';
    v_invoice_id   uuid := '00000001-0000-0000-0001-000000000003';  -- INV-A3-0001 (pinned)
    v_sc_opex_id   uuid;
    v_bi_opex_id   uuid;
    v_tg_wht_id    uuid;
BEGIN
    SELECT id INTO v_tenant_id FROM master.tenant WHERE code = 'athyper';
    SELECT id INTO v_cc_id FROM master.company_code
      WHERE tenant_id = v_tenant_id AND code = 'AUIC';
    SELECT id INTO v_vendor_id FROM master.supplier
      WHERE tenant_id = v_tenant_id AND code = 'ACME-CONSULT-US';

    SELECT id INTO v_sc_opex_id FROM master.spend_category
      WHERE tenant_id = v_tenant_id
        AND code IN ('SC-OPEX-CONSULT','CONSULTING','OPEX')
      ORDER BY sort_order LIMIT 1;

    SELECT id INTO v_bi_opex_id FROM master.business_intent
      WHERE tenant_id = v_tenant_id AND code = 'OPEX_GENERAL';

    SELECT id INTO v_tg_wht_id FROM control.tax_group
      WHERE tenant_id = v_tenant_id AND code = 'WHT_CONSULT_10PCT';

    IF EXISTS (
        SELECT 1 FROM document.purchase_invoice
         WHERE tenant_id = v_tenant_id AND invoice_number = 'INV-A3-0001'
    ) THEN
        RAISE NOTICE 'demo/003 scenario A3: INV-A3-0001 already exists, skipping';
        RETURN;
    END IF;

    -- ── Invoice header (WHT 10% = 100; net payable = 900) ──────────────────
    INSERT INTO document.purchase_invoice (
        id,
        tenant_id, company_code_id,
        code, name,
        invoice_number, invoice_source, invoice_type,
        supplier_id, supplier_invoice_number, supplier_invoice_date,
        document_date, posting_date, received_date,
        currency_code, base_currency_code, exchange_rate,
        subtotal_amount, tax_amount, withholding_tax_amount,
        total_amount, retention_amount, advance_deduction_amount,
        description, status, created_by,
        fiscal_year, period_number
    ) VALUES (
        v_invoice_id,
        v_tenant_id, v_cc_id,
        'INV-A3-0001', 'Non-PO Invoice with WHT (10%)',
        'INV-A3-0001', 'non_po', 'standard',
        v_vendor_id, 'ACME-2026-00103', CURRENT_DATE,
        CURRENT_DATE, CURRENT_DATE, CURRENT_DATE,
        'USD', 'USD', 1.0,
        1000.00, 0.00, 100.00,
        1000.00, 0.00, 0.00,
        'Scenario A3: Non-PO with 10% WHT on consulting',
        'draft', v_sys,
        extract(year FROM CURRENT_DATE)::smallint,
        extract(month FROM CURRENT_DATE)::smallint
    );

    -- ── Line 1: consulting USD 1,000 with WHT group ─────────────────────────
    INSERT INTO document.purchase_invoice_line (
        tenant_id, purchase_invoice_id, line_no,
        item_description, procurement_type,
        spend_category_id, business_intent_id,
        uom_code, quantity, unit_price,
        tax_amount,
        withholding_tax_group_id, withholding_tax_amount,
        gross_amount, created_by
    ) VALUES (
        v_tenant_id, v_invoice_id, 1,
        'Q2 2026 Consulting Services', 'services',
        v_sc_opex_id, v_bi_opex_id,
        'EA', 1, 1000.00,
        0.00,
        v_tg_wht_id, 100.00,
        1000.00, v_sys
    );

    RAISE NOTICE 'demo/003 scenario A3: INV-A3-0001 created (draft, USD 1,000 gross, 100 WHT, 900 net payable)';
END $scenario_a3$;
