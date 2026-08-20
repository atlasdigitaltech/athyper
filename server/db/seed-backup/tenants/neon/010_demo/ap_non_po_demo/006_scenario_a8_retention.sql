-- ============================================================================
-- FILE: demo/006_scenario_a8_retention.sql
-- Scenario A8: Non-PO invoice with 10% retention withheld
-- Expected JE at invoice post (3 lines):
--   Dr Expense              10,000
--      Cr AP Retention Payable      1,000  (10% of 10,000)
--      Cr AP Trade Payable          9,000  (remainder = 10,000 - 1,000)
--
-- Retention stays as a liability (IFRS-L-AP-RETENTION) until the
-- RETENTION_RELEASED event fires later (e.g., DLP expiry), producing:
--   Dr AP Retention Payable 1,000 / Cr Bank Clearing 1,000
-- (via the AP_RETENTION_RELEASE profile — see blueprint/050 entry templates)
-- ============================================================================

DO $scenario_a8$
DECLARE
    v_tenant_id    uuid;
    v_cc_id        uuid;
    v_supplier_id    uuid;
    v_sys          uuid := '00000000-0000-0000-0000-000000000000';
    v_invoice_id   uuid := '00000001-0000-0000-0001-000000000008';  -- INV-A8-0001 (pinned)
    v_sc_opex_id   uuid;
    v_bi_opex_id   uuid;
BEGIN
    SELECT id INTO v_tenant_id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper';
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

    IF EXISTS (
        SELECT 1 FROM document.purchase_invoice
         WHERE tenant_id = v_tenant_id AND code = 'INV-A8-0001'
    ) THEN
        RAISE NOTICE 'demo/006 scenario A8: INV-A8-0001 already exists, skipping';
        RETURN;
    END IF;

    -- ── Invoice header: 10,000 subtotal, 10% retention = 1,000 ──────────────
    INSERT INTO document.purchase_invoice (
        id,
        tenant_id, company_code_id,
        code, name,
        invoice_source, invoice_type,
        supplier_id, supplier_invoice_number, supplier_invoice_date,
        posting_date, received_date, baseline_date, due_date,
        currency_code, base_currency_code, exchange_rate,
        tax_amount, withholding_tax_amount,
        total_amount, retention_amount,
        advance_deduction_amount, paid_amount, match_type, match_status,
        status, tax_mode, requested_by, created_by,
        fiscal_year, period_number
    ) VALUES (
        v_invoice_id,
        v_tenant_id, v_cc_id,
        'INV-A8-0001', 'Non-PO Invoice with 10% Retention',
        'non_po', 'standard',
        v_supplier_id, 'ACME-2026-00108', CURRENT_DATE,
        CURRENT_DATE, CURRENT_DATE, CURRENT_DATE, CURRENT_DATE + 30,
        'USD', 'USD', 1.0,
        0.00, 0.00,
        10000.00, 1000.00,
        0.00, 0.00, 'three_way', 'match_exception',
        'draft', 'out_of_scope', v_sys, v_sys,
        extract(year FROM CURRENT_DATE)::smallint,
        extract(month FROM CURRENT_DATE)::smallint
    );

    -- ── Line 1: project services USD 10,000 ─────────────────────────────────
    INSERT INTO document.purchase_invoice_line (
        tenant_id, company_code_id, purchase_invoice_id, line_no,
        item_description, procurement_type,
        commodity_category_id, business_intent_id,
        uom_code, quantity, unit_price, currency_code,
        tax_amount, withholding_tax_amount,
        created_by
    ) VALUES (
        v_tenant_id, v_cc_id, v_invoice_id, 1,
        'Project Milestone 1 — Site Preparation',
        'services',
        v_sc_opex_id, v_bi_opex_id,
        'EA', 1, 10000.00, 'USD',
        0.00, 0.00,
        v_sys
    );

    RAISE NOTICE 'demo/006 scenario A8: INV-A8-0001 created (USD 10,000 with 10%% retention = 1,000; net payable 9,000)';
END $scenario_a8$;
