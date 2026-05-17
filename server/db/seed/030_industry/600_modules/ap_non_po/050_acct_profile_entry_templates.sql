-- ============================================================================
-- FILE: blueprint/050_acct_profile_entry_templates.sql
-- Purpose: Dr/Cr line templates per event — the heart of JE generation
-- Depends on: control.acct_profile_event (040), posting roles (010)
-- Idempotent: ON CONFLICT (profile_event_id, line_seq) DO NOTHING
-- ============================================================================
-- Each event produces N Dr/Cr lines. Engine 4.13 §F3 (generate_event_entries)
-- expands these at runtime and calls §F2b (resolve_entry_account) to map
-- account_source + account_lookup_key → actual GL account.
--
-- For the Non-PO pack we use two strategies:
--   account_source = POSTING_ROLE → uses posting role fallback account
--   account_source = FROM_INTENT  → resolves through commodity category buy policy / profile rules
--                                     (for the expense/CAPEX line, which varies
--                                      per invoice line's spend_category→intent)
--
-- amount_source values used (all from apet_amount_chk):
--   LINE_AMOUNT     → sum of invoice_line.net_amount for lines with this intent
--   TAX_AMOUNT      → invoice header tax_amount
--   NET_PAYABLE     → total - WHT  (liability to supplier)
--   REMAINDER       → balancing line (computed from sum Dr - sum Cr)
--   DOCUMENT_TOTAL  → full header total
--   ADVANCE_AMOUNT  → advance payment / recovery amount
--   RETENTION_AMOUNT → retention withheld
--   DISCOUNT_AMOUNT -> invoice/line discount that reduces recognized expense
-- ============================================================================

DO $seed_ap_templates$
DECLARE
    v_event   record;
    v_sys     uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

    -- ════════════════════════════════════════════════════════════════════════
    -- AP_NON_PO_STANDARD · INVOICE_RECEIVED
    -- creates_je=false — no templates needed
    -- ════════════════════════════════════════════════════════════════════════

    -- ════════════════════════════════════════════════════════════════════════
    -- AP_NON_PO_STANDARD · ORDER_APPROVAL (invoice post)
    -- Scenarios covered by these 5 lines:
    --   A1 (plain):           line 10 + line 40 (REMAINDER = Cr AP full amount)
    --   A2 (+VAT):            line 10 + 20 + 40
    --   A3 (+WHT):            line 10 + 30 (WHT) + 40 (AP reduced)
    --   A4 (+VAT+WHT):        line 10 + 20 + 30 + 40
    --   A5 (+discount):       line 10 + 32 (discount) + 40
    --   A8 (+retention):      line 10 + 35 (retention) + 40
    -- ════════════════════════════════════════════════════════════════════════
    FOR v_event IN
        SELECT ape.id AS event_id, ape.tenant_id
          FROM control.acct_profile_event ape
          JOIN control.acct_profile_config apc ON apc.id = ape.profile_config_id
          JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
         WHERE ap.code = 'AP_NON_PO_STANDARD'
           AND ape.event_code = 'ORDER_APPROVAL'
           AND ape.is_active = true
    LOOP
        INSERT INTO control.acct_profile_entry_template (
            tenant_id, profile_event_id, line_seq, description,
            posting_side, account_source, account_lookup_key, account_fallback,
            amount_source, is_balancing_line, sort_order,
            status, created_by
        ) VALUES
            -- Line 10: Dr Expense (account resolved from invoice line's intent)
            (v_event.tenant_id, v_event.event_id, 10,
             'Dr Expense (per line intent)',
             'DEBIT', 'FROM_INTENT', NULL, 'IFRS-E-OPEX-GENERAL',
             'LINE_AMOUNT', false, 10, 'active', v_sys),

            -- Line 20: Dr Input Tax (only fires if tax_amount > 0)
            (v_event.tenant_id, v_event.event_id, 20,
             'Dr Input Tax Recoverable',
             'DEBIT', 'POSTING_ROLE', 'input_tax_recoverable', 'IFRS-A-TAX-VAT-INPUT',
             'TAX_AMOUNT', false, 20, 'active', v_sys),

            -- Line 30: Cr WHT Payable (only fires if withholding_tax_amount > 0)
            (v_event.tenant_id, v_event.event_id, 30,
             'Cr WHT Payable',
             'CREDIT', 'POSTING_ROLE', 'wht_payable', 'IFRS-L-TAX-WHT-PAYABLE',
             'CALCULATED', false, 30, 'active', v_sys),

            -- Line 32: Cr Purchase Discount / Expense Offset (only fires if discount_amount > 0)
            (v_event.tenant_id, v_event.event_id, 32,
             'Cr Purchase Discount / Expense Offset',
             'CREDIT', 'FROM_INTENT', NULL, 'IFRS-E-OPEX-GENERAL',
             'DISCOUNT_AMOUNT', false, 32, 'active', v_sys),

            -- Line 35: Cr AP Retention Payable (only fires if retention_amount > 0)
            (v_event.tenant_id, v_event.event_id, 35,
             'Cr AP Retention Payable',
             'CREDIT', 'POSTING_ROLE', 'ap_retention_payable', 'IFRS-L-AP-RETENTION',
             'RETENTION_AMOUNT', false, 35, 'active', v_sys),

            -- Line 40: Cr AP Trade Payable (REMAINDER — balances all Dr minus Cr)
            (v_event.tenant_id, v_event.event_id, 40,
             'Cr AP Trade Payable (balancing)',
             'CREDIT', 'POSTING_ROLE', 'ap_trade_payable', 'IFRS-L-AP-TRADE',
             'REMAINDER', true, 40, 'active', v_sys)
        ON CONFLICT (profile_event_id, line_seq) DO NOTHING;
    END LOOP;

    -- ════════════════════════════════════════════════════════════════════════
    -- AP_NON_PO_STANDARD · SETTLEMENT (payment post)
    -- ════════════════════════════════════════════════════════════════════════
    FOR v_event IN
        SELECT ape.id AS event_id, ape.tenant_id
          FROM control.acct_profile_event ape
          JOIN control.acct_profile_config apc ON apc.id = ape.profile_config_id
          JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
         WHERE ap.code = 'AP_NON_PO_STANDARD'
           AND ape.event_code = 'SETTLEMENT'
           AND ape.is_active = true
    LOOP
        INSERT INTO control.acct_profile_entry_template (
            tenant_id, profile_event_id, line_seq, description,
            posting_side, account_source, account_lookup_key, account_fallback,
            amount_source, is_balancing_line, sort_order,
            status, created_by
        ) VALUES
            -- Line 10: Dr AP Trade Payable (reduces open AP)
            (v_event.tenant_id, v_event.event_id, 10,
             'Dr AP Trade Payable',
             'DEBIT', 'POSTING_ROLE', 'ap_trade_payable', 'IFRS-L-AP-TRADE',
             'NET_PAYABLE', false, 10, 'active', v_sys),

            -- Line 15: Cr Discount Earned (if early-payment discount captured)
            (v_event.tenant_id, v_event.event_id, 15,
             'Cr Discount Earned (if taken)',
             'CREDIT', 'POSTING_ROLE', 'discount_earned', 'IFRS-R-FIN-DISC',
             'DISCOUNT_EARNED', false, 15, 'active', v_sys),

            -- Line 20: FX gain — (balancing direction depends on rate move)
            (v_event.tenant_id, v_event.event_id, 20,
             'Cr FX Gain (favorable settlement FX)',
             'CREDIT', 'POSTING_ROLE', 'fx_gain', 'IFRS-R-FIN-FX',
             'CALCULATED', false, 20, 'active', v_sys),

            -- Line 25: FX loss
            (v_event.tenant_id, v_event.event_id, 25,
             'Dr FX Loss (adverse settlement FX)',
             'DEBIT', 'POSTING_ROLE', 'fx_loss', 'IFRS-E-FIN-FX',
             'CALCULATED', false, 25, 'active', v_sys),

            -- Line 30: Cr Bank Clearing (REMAINDER)
            (v_event.tenant_id, v_event.event_id, 30,
             'Cr Bank Clearing (balancing)',
             'CREDIT', 'POSTING_ROLE', 'ap_clearing', 'IFRS-A-BANK-CLEARING-USD',
             'REMAINDER', true, 30, 'active', v_sys)
        ON CONFLICT (profile_event_id, line_seq) DO NOTHING;
    END LOOP;

    -- ════════════════════════════════════════════════════════════════════════
    -- AP_NON_PO_CAPEX · ORDER_APPROVAL (capitalisation post)
    -- Mirrors AP_NON_PO_STANDARD but Dr line 10 points to Fixed Asset CoA branch
    -- ════════════════════════════════════════════════════════════════════════
    FOR v_event IN
        SELECT ape.id AS event_id, ape.tenant_id
          FROM control.acct_profile_event ape
          JOIN control.acct_profile_config apc ON apc.id = ape.profile_config_id
          JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
         WHERE ap.code = 'AP_NON_PO_CAPEX'
           AND ape.event_code = 'ORDER_APPROVAL'
           AND ape.is_active = true
    LOOP
        INSERT INTO control.acct_profile_entry_template (
            tenant_id, profile_event_id, line_seq, description,
            posting_side, account_source, account_lookup_key, account_fallback,
            amount_source, is_balancing_line, sort_order,
            status, created_by
        ) VALUES
            (v_event.tenant_id, v_event.event_id, 10,
             'Dr Fixed Asset (CWIP or direct, from intent)',
             'DEBIT', 'FROM_INTENT', NULL, 'IFRS-A-FA-CWIP',
             'LINE_AMOUNT', false, 10, 'active', v_sys),

            (v_event.tenant_id, v_event.event_id, 20,
             'Dr Input Tax Recoverable',
             'DEBIT', 'POSTING_ROLE', 'input_tax_recoverable', 'IFRS-A-TAX-VAT-INPUT',
             'TAX_AMOUNT', false, 20, 'active', v_sys),

            (v_event.tenant_id, v_event.event_id, 30,
             'Cr WHT Payable',
             'CREDIT', 'POSTING_ROLE', 'wht_payable', 'IFRS-L-TAX-WHT-PAYABLE',
             'CALCULATED', false, 30, 'active', v_sys),

            (v_event.tenant_id, v_event.event_id, 40,
             'Cr AP Trade Payable (balancing)',
             'CREDIT', 'POSTING_ROLE', 'ap_trade_payable', 'IFRS-L-AP-TRADE',
             'REMAINDER', true, 40, 'active', v_sys)
        ON CONFLICT (profile_event_id, line_seq) DO NOTHING;
    END LOOP;

    -- ════════════════════════════════════════════════════════════════════════
    -- AP_NON_PO_CAPEX · SETTLEMENT (same as AP_NON_PO_STANDARD SETTLEMENT)
    -- ════════════════════════════════════════════════════════════════════════
    FOR v_event IN
        SELECT ape.id AS event_id, ape.tenant_id
          FROM control.acct_profile_event ape
          JOIN control.acct_profile_config apc ON apc.id = ape.profile_config_id
          JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
         WHERE ap.code = 'AP_NON_PO_CAPEX'
           AND ape.event_code = 'SETTLEMENT'
           AND ape.is_active = true
    LOOP
        INSERT INTO control.acct_profile_entry_template (
            tenant_id, profile_event_id, line_seq, description,
            posting_side, account_source, account_lookup_key, account_fallback,
            amount_source, is_balancing_line, sort_order,
            status, created_by
        ) VALUES
            (v_event.tenant_id, v_event.event_id, 10,
             'Dr AP Trade Payable',
             'DEBIT', 'POSTING_ROLE', 'ap_trade_payable', 'IFRS-L-AP-TRADE',
             'NET_PAYABLE', false, 10, 'active', v_sys),

            (v_event.tenant_id, v_event.event_id, 30,
             'Cr Bank Clearing (balancing)',
             'CREDIT', 'POSTING_ROLE', 'ap_clearing', 'IFRS-A-BANK-CLEARING-USD',
             'REMAINDER', true, 30, 'active', v_sys)
        ON CONFLICT (profile_event_id, line_seq) DO NOTHING;
    END LOOP;

    -- ════════════════════════════════════════════════════════════════════════
    -- AP_ADVANCE_SUPPLIER · ADVANCE_PAID
    -- Dr AP Advance (asset) / Cr Bank Clearing
    -- ════════════════════════════════════════════════════════════════════════
    FOR v_event IN
        SELECT ape.id AS event_id, ape.tenant_id
          FROM control.acct_profile_event ape
          JOIN control.acct_profile_config apc ON apc.id = ape.profile_config_id
          JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
         WHERE ap.code = 'AP_ADVANCE_SUPPLIER'
           AND ape.event_code = 'ADVANCE_PAID'
           AND ape.is_active = true
    LOOP
        INSERT INTO control.acct_profile_entry_template (
            tenant_id, profile_event_id, line_seq, description,
            posting_side, account_source, account_lookup_key, account_fallback,
            amount_source, is_balancing_line, sort_order,
            status, created_by
        ) VALUES
            (v_event.tenant_id, v_event.event_id, 10,
             'Dr AP Advance (supplier prepayment asset)',
             'DEBIT', 'POSTING_ROLE', 'ap_advance_recovery', 'IFRS-A-AP-ADVANCE',
             'ADVANCE_AMOUNT', false, 10, 'active', v_sys),

            (v_event.tenant_id, v_event.event_id, 20,
             'Cr Bank Clearing',
             'CREDIT', 'POSTING_ROLE', 'ap_clearing', 'IFRS-A-BANK-CLEARING-USD',
             'REMAINDER', true, 20, 'active', v_sys)
        ON CONFLICT (profile_event_id, line_seq) DO NOTHING;
    END LOOP;

    -- ════════════════════════════════════════════════════════════════════════
    -- AP_ADVANCE_SUPPLIER · ADVANCE_RECOVERED
    -- Dr AP Trade Payable / Cr AP Advance (reduces both)
    -- Triggered by downstream invoice that has advance_deduction_amount > 0
    -- ════════════════════════════════════════════════════════════════════════
    FOR v_event IN
        SELECT ape.id AS event_id, ape.tenant_id
          FROM control.acct_profile_event ape
          JOIN control.acct_profile_config apc ON apc.id = ape.profile_config_id
          JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
         WHERE ap.code = 'AP_ADVANCE_SUPPLIER'
           AND ape.event_code = 'ADVANCE_RECOVERED'
           AND ape.is_active = true
    LOOP
        INSERT INTO control.acct_profile_entry_template (
            tenant_id, profile_event_id, line_seq, description,
            posting_side, account_source, account_lookup_key, account_fallback,
            amount_source, is_balancing_line, sort_order,
            status, created_by
        ) VALUES
            (v_event.tenant_id, v_event.event_id, 10,
             'Dr AP Trade Payable (reduces payable)',
             'DEBIT', 'POSTING_ROLE', 'ap_trade_payable', 'IFRS-L-AP-TRADE',
             'ADVANCE_RECOVERY', false, 10, 'active', v_sys),

            (v_event.tenant_id, v_event.event_id, 20,
             'Cr AP Advance (clears advance asset)',
             'CREDIT', 'POSTING_ROLE', 'ap_advance_recovery', 'IFRS-A-AP-ADVANCE',
             'REMAINDER', true, 20, 'active', v_sys)
        ON CONFLICT (profile_event_id, line_seq) DO NOTHING;
    END LOOP;

    -- ════════════════════════════════════════════════════════════════════════
    -- AP_RETENTION_RELEASE · RETENTION_RELEASED
    -- Dr AP Retention Payable / Cr Bank Clearing
    -- ════════════════════════════════════════════════════════════════════════
    FOR v_event IN
        SELECT ape.id AS event_id, ape.tenant_id
          FROM control.acct_profile_event ape
          JOIN control.acct_profile_config apc ON apc.id = ape.profile_config_id
          JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
         WHERE ap.code = 'AP_RETENTION_RELEASE'
           AND ape.event_code = 'RETENTION_RELEASED'
           AND ape.is_active = true
    LOOP
        INSERT INTO control.acct_profile_entry_template (
            tenant_id, profile_event_id, line_seq, description,
            posting_side, account_source, account_lookup_key, account_fallback,
            amount_source, is_balancing_line, sort_order,
            status, created_by
        ) VALUES
            (v_event.tenant_id, v_event.event_id, 10,
             'Dr AP Retention Payable (release)',
             'DEBIT', 'POSTING_ROLE', 'ap_retention_payable', 'IFRS-L-AP-RETENTION',
             'RETENTION_AMOUNT', false, 10, 'active', v_sys),

            (v_event.tenant_id, v_event.event_id, 20,
             'Cr Bank Clearing',
             'CREDIT', 'POSTING_ROLE', 'ap_clearing', 'IFRS-A-BANK-CLEARING-USD',
             'REMAINDER', true, 20, 'active', v_sys)
        ON CONFLICT (profile_event_id, line_seq) DO NOTHING;
    END LOOP;

    RAISE NOTICE 'blueprint/050_acct_profile_entry_templates: % templates seeded',
        (SELECT count(*) FROM control.acct_profile_entry_template apet
           JOIN control.acct_profile_event ape ON ape.id = apet.profile_event_id
           JOIN control.acct_profile_config apc ON apc.id = ape.profile_config_id
           JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
          WHERE ap.code IN ('AP_NON_PO_STANDARD','AP_NON_PO_CAPEX',
                            'AP_ADVANCE_SUPPLIER','AP_RETENTION_RELEASE'));
END $seed_ap_templates$;
