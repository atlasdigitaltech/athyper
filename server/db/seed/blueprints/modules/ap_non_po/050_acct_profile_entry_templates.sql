-- Dr/Cr line templates per event — JE generation source of truth.
-- Engine 4.13 §F3 generate_event_entries expands these and §F2b resolve_entry_account
-- maps account_source + account_lookup_key → GL account.
--
-- account_source contract:
--   POSTING_ROLE → posting role fallback account
--   FROM_INTENT  → resolves via commodity_category buy policy / profile rules
--                  (used for expense/CAPEX lines that vary per invoice-line intent)
--
-- amount_source contract (must match apet_amount_chk):
--   LINE_AMOUNT, TAX_AMOUNT, NET_PAYABLE (total - WHT), REMAINDER (balancing),
--   DOCUMENT_TOTAL, ADVANCE_AMOUNT, RETENTION_AMOUNT, DISCOUNT_AMOUNT.
-- REMAINDER lines MUST be the last line of the event — computed from sum Dr − sum Cr.

DO $seed_ap_templates$
DECLARE
    v_event   record;
    v_sys     uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

    -- AP_NON_PO_STANDARD · INVOICE_RECEIVED has creates_je=false → no templates.

    -- AP_NON_PO_STANDARD · ORDER_APPROVAL — 6 lines cover scenarios A1..A8:
    --   A1 plain:     10 + 40         A2 +VAT:        10 + 20 + 40
    --   A3 +WHT:      10 + 30 + 40    A4 +VAT+WHT:    10 + 20 + 30 + 40
    --   A5 +discount: 10 + 32 + 40    A8 +retention:  10 + 35 + 40
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
            (v_event.tenant_id, v_event.event_id, 10,
             'Dr Expense (per line intent)',
             'DEBIT', 'FROM_INTENT', NULL, 'IFRS-E-OPEX-GENERAL',
             'LINE_AMOUNT', false, 10, 'active', v_sys),

            (v_event.tenant_id, v_event.event_id, 20,
             'Dr Input Tax Recoverable',
             'DEBIT', 'POSTING_ROLE', 'input_tax_recoverable', 'IFRS-A-TAX-VAT-INPUT',
             'TAX_AMOUNT', false, 20, 'active', v_sys),

            (v_event.tenant_id, v_event.event_id, 30,
             'Cr WHT Payable',
             'CREDIT', 'POSTING_ROLE', 'wht_payable', 'IFRS-L-TAX-WHT-PAYABLE',
             'CALCULATED', false, 30, 'active', v_sys),

            (v_event.tenant_id, v_event.event_id, 32,
             'Cr Purchase Discount / Expense Offset',
             'CREDIT', 'FROM_INTENT', NULL, 'IFRS-E-OPEX-GENERAL',
             'DISCOUNT_AMOUNT', false, 32, 'active', v_sys),

            (v_event.tenant_id, v_event.event_id, 35,
             'Cr AP Retention Payable',
             'CREDIT', 'POSTING_ROLE', 'ap_retention_payable', 'IFRS-L-AP-RETENTION',
             'RETENTION_AMOUNT', false, 35, 'active', v_sys),

            (v_event.tenant_id, v_event.event_id, 40,
             'Cr AP Trade Payable (balancing)',
             'CREDIT', 'POSTING_ROLE', 'ap_trade_payable', 'IFRS-L-AP-TRADE',
             'REMAINDER', true, 40, 'active', v_sys)
        ON CONFLICT (profile_event_id, line_seq) DO UPDATE SET
            description       = EXCLUDED.description,
            posting_side      = EXCLUDED.posting_side,
            account_source    = EXCLUDED.account_source,
            account_lookup_key= EXCLUDED.account_lookup_key,
            account_fallback  = EXCLUDED.account_fallback,
            amount_source     = EXCLUDED.amount_source,
            is_balancing_line = EXCLUDED.is_balancing_line,
            sort_order        = EXCLUDED.sort_order,
            status            = EXCLUDED.status,
            updated_at        = now(),
            updated_by        = v_sys;
    END LOOP;

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
            (v_event.tenant_id, v_event.event_id, 10,
             'Dr AP Trade Payable',
             'DEBIT', 'POSTING_ROLE', 'ap_trade_payable', 'IFRS-L-AP-TRADE',
             'NET_PAYABLE', false, 10, 'active', v_sys),

            (v_event.tenant_id, v_event.event_id, 15,
             'Cr Discount Earned (if taken)',
             'CREDIT', 'POSTING_ROLE', 'discount_earned', 'IFRS-R-FIN-DISC',
             'DISCOUNT_EARNED', false, 15, 'active', v_sys),

            (v_event.tenant_id, v_event.event_id, 20,
             'Cr FX Gain (favorable settlement FX)',
             'CREDIT', 'POSTING_ROLE', 'fx_gain', 'IFRS-R-FIN-FX',
             'CALCULATED', false, 20, 'active', v_sys),

            (v_event.tenant_id, v_event.event_id, 25,
             'Dr FX Loss (adverse settlement FX)',
             'DEBIT', 'POSTING_ROLE', 'fx_loss', 'IFRS-E-FIN-FX',
             'CALCULATED', false, 25, 'active', v_sys),

            (v_event.tenant_id, v_event.event_id, 30,
             'Cr Bank Clearing (balancing)',
             'CREDIT', 'POSTING_ROLE', 'ap_clearing', 'IFRS-A-BANK-CLEARING-USD',
             'REMAINDER', true, 30, 'active', v_sys)
        ON CONFLICT (profile_event_id, line_seq) DO UPDATE SET
            description       = EXCLUDED.description,
            posting_side      = EXCLUDED.posting_side,
            account_source    = EXCLUDED.account_source,
            account_lookup_key= EXCLUDED.account_lookup_key,
            account_fallback  = EXCLUDED.account_fallback,
            amount_source     = EXCLUDED.amount_source,
            is_balancing_line = EXCLUDED.is_balancing_line,
            sort_order        = EXCLUDED.sort_order,
            status            = EXCLUDED.status,
            updated_at        = now(),
            updated_by        = v_sys;
    END LOOP;

    -- AP_NON_PO_CAPEX · ORDER_APPROVAL — mirrors STANDARD but line 10 points
    -- to a Fixed Asset CoA branch (CWIP fallback) via FROM_INTENT resolution.
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
        ON CONFLICT (profile_event_id, line_seq) DO UPDATE SET
            description       = EXCLUDED.description,
            posting_side      = EXCLUDED.posting_side,
            account_source    = EXCLUDED.account_source,
            account_lookup_key= EXCLUDED.account_lookup_key,
            account_fallback  = EXCLUDED.account_fallback,
            amount_source     = EXCLUDED.amount_source,
            is_balancing_line = EXCLUDED.is_balancing_line,
            sort_order        = EXCLUDED.sort_order,
            status            = EXCLUDED.status,
            updated_at        = now(),
            updated_by        = v_sys;
    END LOOP;

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
        ON CONFLICT (profile_event_id, line_seq) DO UPDATE SET
            description       = EXCLUDED.description,
            posting_side      = EXCLUDED.posting_side,
            account_source    = EXCLUDED.account_source,
            account_lookup_key= EXCLUDED.account_lookup_key,
            account_fallback  = EXCLUDED.account_fallback,
            amount_source     = EXCLUDED.amount_source,
            is_balancing_line = EXCLUDED.is_balancing_line,
            sort_order        = EXCLUDED.sort_order,
            status            = EXCLUDED.status,
            updated_at        = now(),
            updated_by        = v_sys;
    END LOOP;

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
        ON CONFLICT (profile_event_id, line_seq) DO UPDATE SET
            description       = EXCLUDED.description,
            posting_side      = EXCLUDED.posting_side,
            account_source    = EXCLUDED.account_source,
            account_lookup_key= EXCLUDED.account_lookup_key,
            account_fallback  = EXCLUDED.account_fallback,
            amount_source     = EXCLUDED.amount_source,
            is_balancing_line = EXCLUDED.is_balancing_line,
            sort_order        = EXCLUDED.sort_order,
            status            = EXCLUDED.status,
            updated_at        = now(),
            updated_by        = v_sys;
    END LOOP;

    -- ADVANCE_RECOVERED is triggered by the downstream invoice when
    -- advance_deduction_amount > 0 — not by the advance profile itself.
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
        ON CONFLICT (profile_event_id, line_seq) DO UPDATE SET
            description       = EXCLUDED.description,
            posting_side      = EXCLUDED.posting_side,
            account_source    = EXCLUDED.account_source,
            account_lookup_key= EXCLUDED.account_lookup_key,
            account_fallback  = EXCLUDED.account_fallback,
            amount_source     = EXCLUDED.amount_source,
            is_balancing_line = EXCLUDED.is_balancing_line,
            sort_order        = EXCLUDED.sort_order,
            status            = EXCLUDED.status,
            updated_at        = now(),
            updated_by        = v_sys;
    END LOOP;

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
        ON CONFLICT (profile_event_id, line_seq) DO UPDATE SET
            description       = EXCLUDED.description,
            posting_side      = EXCLUDED.posting_side,
            account_source    = EXCLUDED.account_source,
            account_lookup_key= EXCLUDED.account_lookup_key,
            account_fallback  = EXCLUDED.account_fallback,
            amount_source     = EXCLUDED.amount_source,
            is_balancing_line = EXCLUDED.is_balancing_line,
            sort_order        = EXCLUDED.sort_order,
            status            = EXCLUDED.status,
            updated_at        = now(),
            updated_by        = v_sys;
    END LOOP;

    RAISE NOTICE 'blueprint/050_acct_profile_entry_templates: % templates seeded',
        (SELECT count(*) FROM control.acct_profile_entry_template apet
           JOIN control.acct_profile_event ape ON ape.id = apet.profile_event_id
           JOIN control.acct_profile_config apc ON apc.id = ape.profile_config_id
           JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
          WHERE ap.code IN ('AP_NON_PO_STANDARD','AP_NON_PO_CAPEX',
                            'AP_ADVANCE_SUPPLIER','AP_RETENTION_RELEASE'));
END $seed_ap_templates$;
