-- ============================================================================
-- FILE: demo/007_scenario_vendor_advance.sql
-- Scenario VA: Standalone vendor-level advance (no invoice yet)
-- This is the pure "advance on vendor account" case: Finance cuts a prepayment
-- to the supplier ahead of any invoice. The advance sits as AP Advance (asset)
-- on the balance sheet until a future invoice consumes it.
--
-- Distinct from Scenario A7 (which pairs the advance with a specific invoice
-- via advance_deduction_amount) — here the advance is standalone, open-ended,
-- and may be recovered across multiple future invoices.
--
-- Expected JE at post:
--   Dr AP Advance (asset)    2,500.00
--      Cr Bank Clearing               2,500.00
-- ============================================================================
-- Produces: ADV-VA-0001 (payment_entry, type=ADVANCE, no allocations)
-- ============================================================================

DO $scenario_vendor_advance$
DECLARE
    v_tenant_id     uuid;
    v_cc_id         uuid;
    v_vendor_id     uuid;
    v_sys           uuid := '00000000-0000-0000-0000-000000000000';
    v_advance_id    uuid := '00000002-0000-0000-0002-000000000020';  -- ADV-VA-0001 (pinned)
    v_pm_wire_id    uuid;
    v_house_bank_id uuid;
BEGIN
    SELECT id INTO v_tenant_id FROM master.tenant WHERE code = 'athyper';
    SELECT id INTO v_cc_id FROM master.company_code
      WHERE tenant_id = v_tenant_id AND code = 'AUIC';
    SELECT id INTO v_vendor_id FROM master.supplier
      WHERE tenant_id = v_tenant_id AND code = 'ACME-CONSULT-US';
    SELECT id INTO v_pm_wire_id FROM master.payment_method
      WHERE tenant_id = v_tenant_id AND code = 'WIRE-USD';

    SELECT ba.id INTO v_house_bank_id
      FROM master.bank_account ba
     WHERE ba.tenant_id = v_tenant_id
       AND ba.currency_code = 'USD'
       AND ba.status = 'active'
     LIMIT 1;

    IF EXISTS (
        SELECT 1 FROM document.payment_entry
         WHERE tenant_id = v_tenant_id AND payment_number = 'ADV-VA-0001'
    ) THEN
        RAISE NOTICE 'demo/007 scenario VA: ADV-VA-0001 already exists, skipping';
        RETURN;
    END IF;

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
        fiscal_year, period_number,
        metadata
    ) VALUES (
        v_advance_id,
        v_tenant_id, v_cc_id,
        'ADV-VA-0001', 'Standalone Vendor Advance',
        'ADV-VA-0001', 'ADVANCE', 'OUTBOUND',
        v_vendor_id, 'Acme Consulting LLC',
        v_pm_wire_id, v_house_bank_id,
        CURRENT_DATE, CURRENT_DATE,
        'USD', 'USD', 1.0,
        2500.00,
        'Scenario VA: Standalone vendor-level advance (no invoice)',
        'draft', v_sys,
        extract(year FROM CURRENT_DATE)::smallint,
        extract(month FROM CURRENT_DATE)::smallint,
        jsonb_build_object(
            'scenario',           'vendor_advance_standalone',
            'no_invoice_link',    true,
            'recovery_strategy',  'open_ended_multi_invoice',
            'expected_profile',   'AP_ADVANCE_VENDOR',
            'expected_event',     'ADVANCE_PAID')
    );

    -- Note: no payment_entry_allocation rows — standalone advance has no
    -- invoice allocations yet. Allocations will be created ad-hoc as future
    -- invoices match against this open advance balance.

    RAISE NOTICE 'demo/007 scenario VA: ADV-VA-0001 created (USD 2,500 standalone advance, no invoice)';
END $scenario_vendor_advance$;
