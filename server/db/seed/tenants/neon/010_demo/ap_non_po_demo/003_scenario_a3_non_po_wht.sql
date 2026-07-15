-- ============================================================================
-- FILE: demo/003_scenario_a3_non_po_wht.sql
-- Scenario A3: Non-PO invoice with WHT (no VAT)
-- Expected JE (3 lines):
--   Dr Expense              1,000
--      Cr WHT Payable               100  (10% of 1,000)
--      Cr AP Trade Payable          900  (net_payable = total - WHT)
-- ============================================================================
-- Invoice: INV-A3-0001, USD 1,000 gross, 10% WHT on consulting
-- Supplier payable becomes 900; 100 remitted to tax authority at WHT due date.
--
-- WS-COMPAT NOTE — this scenario captures WHT via the legacy flat-field
-- columns (withholding_tax_amount on header + line, withholding_tax_group_id
-- on line). It validates the read fallback when ATHYPER_AP_WHT_LEGACY_FALLBACK=1
-- is set. PC-driven scenarios live in 011_scenario_a5_wht_pc_line_scope.sql
-- and beyond; once backfill is run via
-- `server/scripts/backfill-wht-pricing-components.ts`, this scenario also
-- gets a synthesized pricing_component row tagged origin='system_resolved'.
-- ============================================================================

DO $scenario_a3$
DECLARE
    v_tenant_id    uuid;
    v_cc_id        uuid;
    v_supplier_id    uuid;
    v_sys          uuid := '00000000-0000-0000-0000-000000000000';
    v_invoice_id   uuid := '00000001-0000-0000-0001-000000000003';  -- INV-A3-0001 (pinned)
    v_sc_opex_id   uuid;
    v_bi_opex_id   uuid;
    v_tg_wht_id    uuid;
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

    SELECT id INTO v_tg_wht_id FROM control.tax_group
      WHERE tenant_id = v_tenant_id AND code = 'WHT_CONSULT_10PCT';

    IF EXISTS (
        SELECT 1 FROM document.purchase_invoice
         WHERE tenant_id = v_tenant_id AND code = 'INV-A3-0001'
    ) THEN
        RAISE NOTICE 'demo/003 scenario A3: INV-A3-0001 already exists, skipping';
        RETURN;
    END IF;

    -- ── Invoice header (WHT 10% = 100; net payable = 900) ──────────────────
    INSERT INTO document.purchase_invoice (
        id,
        tenant_id, company_code_id,
        code, name,
        invoice_source, invoice_type,
        supplier_id, supplier_invoice_number, supplier_invoice_date,
        posting_date, received_date, baseline_date, due_date,
        currency_code, base_currency_code, exchange_rate,
        tax_amount, withholding_tax_amount,
        total_amount, retention_amount, advance_deduction_amount,
        paid_amount, match_type, match_status,
        status, tax_mode, requested_by, created_by,
        fiscal_year, period_number
    ) VALUES (
        v_invoice_id,
        v_tenant_id, v_cc_id,
        'INV-A3-0001', 'Non-PO Invoice with WHT (10%)',
        'non_po', 'standard',
        v_supplier_id, 'ACME-2026-00103', CURRENT_DATE,
        CURRENT_DATE, CURRENT_DATE, CURRENT_DATE, CURRENT_DATE + 30,
        'USD', 'USD', 1.0,
        0.00, 100.00,
        1000.00, 0.00, 0.00,
        0.00, 'no_match', 'unmatched',
        'draft', 'out_of_scope', v_sys, v_sys,
        extract(year FROM CURRENT_DATE)::smallint,
        extract(month FROM CURRENT_DATE)::smallint
    );

    -- ── Line 1: consulting USD 1,000 with WHT group ─────────────────────────
    INSERT INTO document.purchase_invoice_line (
        tenant_id, company_code_id, purchase_invoice_id, line_no,
        item_description, procurement_type,
        commodity_category_id, business_intent_id,
        uom_code, quantity, unit_price, currency_code,
        tax_amount,
        withholding_tax_group_id, withholding_tax_amount,
        created_by
    ) VALUES (
        v_tenant_id, v_cc_id, v_invoice_id, 1,
        'Q2 2026 Consulting Services', 'services',
        v_sc_opex_id, v_bi_opex_id,
        'EA', 1, 1000.00, 'USD',
        0.00,
        v_tg_wht_id, 100.00,
        v_sys
    );

    RAISE NOTICE 'demo/003 scenario A3: INV-A3-0001 created (draft, USD 1,000 gross, 100 WHT, 900 net payable)';
END $scenario_a3$;
