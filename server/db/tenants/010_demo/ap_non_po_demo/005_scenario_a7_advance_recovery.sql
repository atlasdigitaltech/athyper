-- ============================================================================
-- FILE: demo/005_scenario_a7_advance_recovery.sql
-- Scenario A7: Advance paid, later invoice recovers it
-- Two-step flow:
--   Step 1 (ADVANCE PAID):
--     Dr AP Advance (asset)    500.00
--        Cr Bank Clearing              500.00
--   Step 2 (INVOICE with advance_deduction_amount = 500):
--     Invoice post (standard A1-style) Dr Expense 1,000 / Cr AP 1,000
--     Advance recovery JE:
--        Dr AP Trade Payable   500.00
--           Cr AP Advance             500.00
--     Net result: Expense 1,000, Bank -500, AP 500, Advance cleared
-- ============================================================================
-- Produces:
--   ADV-A7-0001   (payment_entry, type=ADVANCE, posted)
--   INV-A7-0001   (purchase_invoice, advance_deduction_amount=500)
-- ============================================================================

DO $scenario_a7$
DECLARE
    v_tenant_id    uuid;
    v_cc_id        uuid;
    v_supplier_id    uuid;
    v_sys          uuid := '00000000-0000-0000-0000-000000000000';
    v_invoice_id   uuid := '00000001-0000-0000-0001-000000000007';  -- INV-A7-0001 (pinned)
    v_advance_id   uuid := '00000002-0000-0000-0002-000000000007';  -- ADV-A7-0001 (pinned)
    v_sc_opex_id   uuid;
    v_bi_opex_id   uuid;
    v_pm_wire_id   uuid;
    v_house_bank_id uuid;
BEGIN
    SELECT id INTO v_tenant_id FROM master.tenant WHERE code = 'athyper';
    SELECT id INTO v_cc_id FROM master.company_code
      WHERE tenant_id = v_tenant_id AND code = 'AUIC';
    SELECT id INTO v_supplier_id FROM master.supplier
      WHERE tenant_id = v_tenant_id AND supplier_code = 'ACME-CONSULT-US';

    SELECT id INTO v_sc_opex_id FROM master.commodity_category
      WHERE tenant_id = v_tenant_id
        AND code IN ('SC-OPEX-CONSULT','CONSULTING','OPEX')
      ORDER BY sort_order LIMIT 1;
    SELECT id INTO v_bi_opex_id FROM master.business_intent
      WHERE tenant_id = v_tenant_id AND code = 'BI-OPEX';
    SELECT id INTO v_pm_wire_id FROM master.payment_method
      WHERE tenant_id = v_tenant_id AND code = 'WIRE-USD';

    SELECT ba.id INTO v_house_bank_id
      FROM master.bank_account ba
     WHERE ba.tenant_id = v_tenant_id AND ba.currency_code = 'USD' AND ba.status = 'active'
     LIMIT 1;

    -- ── Step 1: Advance payment ADV-A7-0001 ─────────────────────────────────
    IF NOT EXISTS (
        SELECT 1 FROM document.payment_entry
         WHERE tenant_id = v_tenant_id AND payment_number = 'ADV-A7-0001'
    ) THEN
        INSERT INTO document.payment_entry (
            id,
            tenant_id, company_code_id,
            code, name,
            payment_number, payment_type, payment_direction,
            supplier_id, supplier_name,
            payment_method_id, bank_account_id,
            document_date, posting_date,
            currency_code, base_currency_code, exchange_rate,
            payment_amount,
            notes, status, created_by,
            fiscal_year, period_number
        ) VALUES (
            v_advance_id,
            v_tenant_id, v_cc_id,
            'ADV-A7-0001', 'Supplier Advance — A7 Step 1',
            'ADV-A7-0001', 'advance', 'OUTBOUND',
            v_supplier_id, 'Acme Consulting LLC',
            v_pm_wire_id, v_house_bank_id,
            CURRENT_DATE - 14, CURRENT_DATE - 14,
            'USD', 'USD', 1.0,
            500.00,
            'Scenario A7 — Step 1: Advance payment to supplier',
            'draft', v_sys,
            extract(year FROM CURRENT_DATE)::smallint,
            extract(month FROM CURRENT_DATE)::smallint
        );

        RAISE NOTICE 'demo/005 scenario A7 step 1: ADV-A7-0001 created (draft, USD 500 advance)';
    END IF;

    -- ── Step 2: Invoice INV-A7-0001 that recovers the advance ───────────────
    IF NOT EXISTS (
        SELECT 1 FROM document.purchase_invoice
         WHERE tenant_id = v_tenant_id AND invoice_number = 'INV-A7-0001'
    ) THEN
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
            'INV-A7-0001', 'Invoice with Advance Recovery (A7 Step 2)',
            'INV-A7-0001', 'non_po', 'standard',
            v_supplier_id, 'ACME-2026-00107', CURRENT_DATE,
            CURRENT_DATE, CURRENT_DATE, CURRENT_DATE,
            'USD', 'USD', 1.0,
            1000.00, 0.00, 0.00,
            1000.00, 0.00, 500.00,  -- advance_deduction_amount = 500
            'Scenario A7 — Step 2: Invoice recovering USD 500 advance',
            'draft', 'no_tax', 'user_override', v_sys,
            extract(year FROM CURRENT_DATE)::smallint,
            extract(month FROM CURRENT_DATE)::smallint
        );

        INSERT INTO document.purchase_invoice_line (
            tenant_id, purchase_invoice_id, line_no,
            item_description, procurement_type,
            commodity_category_id, business_intent_id,
            uom_code, quantity, unit_price,
            tax_amount, withholding_tax_amount, gross_amount,
            created_by
        ) VALUES (
            v_tenant_id, v_invoice_id, 1,
            'Q2 2026 Consulting Services (recovers advance)',
            'services',
            v_sc_opex_id, v_bi_opex_id,
            'EA', 1, 1000.00,
            0.00, 0.00, 1000.00,
            v_sys
        );

        RAISE NOTICE 'demo/005 scenario A7 step 2: INV-A7-0001 created (USD 1,000 with 500 advance deduction; net payable 500)';
    END IF;
END $scenario_a7$;
