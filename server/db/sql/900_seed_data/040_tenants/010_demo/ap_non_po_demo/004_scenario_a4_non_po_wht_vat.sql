-- ============================================================================
-- FILE: demo/004_scenario_a4_non_po_wht_vat.sql
-- Scenario A4: Non-PO invoice with both VAT and WHT
-- Expected JE (4 lines):
--   Dr Expense (OPEX)       1,000.00
--   Dr Input Tax Recoverable   70.00   (7% VAT on 1,000)
--      Cr WHT Payable               100.00   (10% WHT on 1,000 net)
--      Cr AP Trade Payable          970.00   (1,070 total - 100 WHT)
-- ============================================================================
-- Invoice: INV-A4-0001
--   subtotal   1,000.00
--   + VAT 7%     70.00
--   = total    1,070.00
--   - WHT 10%  (100.00)     ← WHT computed on net (subtotal), not on total
--   = payable    970.00
-- ============================================================================

DO $scenario_a4$
DECLARE
    v_tenant_id    uuid;
    v_cc_id        uuid;
    v_vendor_id    uuid;
    v_sys          uuid := '00000000-0000-0000-0000-000000000000';
    v_invoice_id   uuid := '00000001-0000-0000-0001-000000000004';  -- INV-A4-0001 (pinned)
    v_sc_opex_id   uuid;
    v_bi_opex_id   uuid;
    v_tg_vat_id    uuid;
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

    SELECT id INTO v_tg_vat_id FROM control.tax_group
      WHERE tenant_id = v_tenant_id AND code = 'VAT_STD_US_7PCT';
    SELECT id INTO v_tg_wht_id FROM control.tax_group
      WHERE tenant_id = v_tenant_id AND code = 'WHT_CONSULT_10PCT';

    IF EXISTS (
        SELECT 1 FROM document.purchase_invoice
         WHERE tenant_id = v_tenant_id AND invoice_number = 'INV-A4-0001'
    ) THEN
        RAISE NOTICE 'demo/004 scenario A4: INV-A4-0001 already exists, skipping';
        RETURN;
    END IF;

    -- ── Invoice header ──────────────────────────────────────────────────────
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
        'INV-A4-0001', 'Non-PO Invoice with VAT + WHT',
        'INV-A4-0001', 'non_po', 'standard',
        v_vendor_id, 'ACME-2026-00104', CURRENT_DATE,
        CURRENT_DATE, CURRENT_DATE, CURRENT_DATE,
        'USD', 'USD', 1.0,
        1000.00, 70.00, 100.00,
        1070.00, 0.00, 0.00,
        'Scenario A4: Non-PO with 7% VAT + 10% WHT',
        'draft', v_sys,
        extract(year FROM CURRENT_DATE)::smallint,
        extract(month FROM CURRENT_DATE)::smallint
    );

    -- ── Line 1 ──────────────────────────────────────────────────────────────
    INSERT INTO document.purchase_invoice_line (
        tenant_id, purchase_invoice_id, line_no,
        item_description, procurement_type,
        spend_category_id, business_intent_id,
        uom_code, quantity, unit_price,
        tax_group_id, tax_amount,
        withholding_tax_group_id, withholding_tax_amount,
        gross_amount, created_by
    ) VALUES (
        v_tenant_id, v_invoice_id, 1,
        'Q2 2026 Consulting Services', 'services',
        v_sc_opex_id, v_bi_opex_id,
        'EA', 1, 1000.00,
        v_tg_vat_id, 70.00,
        v_tg_wht_id, 100.00,
        1070.00, v_sys
    );

    RAISE NOTICE 'demo/004 scenario A4: INV-A4-0001 created (subtotal 1,000 + VAT 70 = total 1,070; WHT 100; payable 970)';
END $scenario_a4$;
