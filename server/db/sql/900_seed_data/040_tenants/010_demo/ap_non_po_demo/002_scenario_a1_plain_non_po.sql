-- ============================================================================
-- FILE: demo/002_scenario_a1_plain_non_po.sql
-- Scenario A1: Plain Non-PO invoice, domestic, tax-exempt
-- Expected JE (2 lines): Dr Expense 1,000 / Cr AP Trade Payable 1,000
-- ============================================================================
-- Invoice: INV-A1-0001, USD 1,000, no tax, no WHT, no retention, no advance
-- ============================================================================

DO $scenario_a1$
DECLARE
    v_tenant_id    uuid;
    v_cc_id        uuid;
    v_vendor_id    uuid;
    v_sys          uuid := '00000000-0000-0000-0000-000000000000';
    v_invoice_id   uuid := '00000001-0000-0000-0001-000000000001';  -- INV-A1-0001 (pinned)
    v_sc_opex_id   uuid;
    v_bi_opex_id   uuid;
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

    -- Skip if demo invoice already seeded
    IF EXISTS (
        SELECT 1 FROM document.purchase_invoice
         WHERE tenant_id = v_tenant_id AND invoice_number = 'INV-A1-0001'
    ) THEN
        RAISE NOTICE 'demo/002 scenario A1: INV-A1-0001 already exists, skipping';
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
        description, status, tax_mode, tax_mode_source, created_by,
        fiscal_year, period_number
    ) VALUES (
        v_invoice_id,
        v_tenant_id, v_cc_id,
        'INV-A1-0001', 'Plain Non-PO Invoice — Tax Exempt',
        'INV-A1-0001', 'non_po', 'standard',
        v_vendor_id, 'ACME-2026-00101', CURRENT_DATE,
        CURRENT_DATE, CURRENT_DATE, CURRENT_DATE,
        'USD', 'USD', 1.0,
        1000.00, 0.00, 0.00,
        1000.00, 0.00, 0.00,
        'Scenario A1: Plain Non-PO, tax-exempt consulting fee',
        'draft', 'no_tax', 'user_override', v_sys,
        extract(year FROM CURRENT_DATE)::smallint,
        extract(month FROM CURRENT_DATE)::smallint
    );

    -- ── Lines (4 lines, sum = USD 1,000) ────────────────────────────────────
    INSERT INTO document.purchase_invoice_line (
        tenant_id, purchase_invoice_id, line_no,
        item_description, procurement_type,
        spend_category_id, business_intent_id,
        uom_code, quantity, unit_price,
        tax_amount, withholding_tax_amount, gross_amount,
        created_by
    ) VALUES
        -- Line 1: consulting retainer, 5 hrs × USD 120
        (v_tenant_id, v_invoice_id, 1,
         'Q2 2026 Consulting Services', 'services',
         v_sc_opex_id, v_bi_opex_id,
         'HUR', 5, 120.00, 0.00, 0.00, 600.00, v_sys),
        -- Line 2: technical documentation, 2 days × USD 150
        (v_tenant_id, v_invoice_id, 2,
         'Technical Documentation & Deliverables', 'services',
         v_sc_opex_id, v_bi_opex_id,
         'DAY', 2, 150.00, 0.00, 0.00, 300.00, v_sys),
        -- Line 3: travel & accommodation, 1 trip × USD 75
        (v_tenant_id, v_invoice_id, 3,
         'Travel and Accommodation — Site Visit', 'services',
         v_sc_opex_id, v_bi_opex_id,
         'EA', 1, 75.00, 0.00, 0.00, 75.00, v_sys),
        -- Line 4: software license (annual), 1 × USD 25
        (v_tenant_id, v_invoice_id, 4,
         'Annual Software License — Project Tools', 'goods',
         v_sc_opex_id, v_bi_opex_id,
         'EA', 1, 25.00, 0.00, 0.00, 25.00, v_sys);

    RAISE NOTICE 'demo/002 scenario A1: INV-A1-0001 created (draft, USD 1,000, 4 lines, no tax)';
END $scenario_a1$;
