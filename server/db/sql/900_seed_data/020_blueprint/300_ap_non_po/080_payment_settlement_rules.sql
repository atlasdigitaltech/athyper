-- ============================================================================
-- FILE: blueprint/080_payment_settlement_rules.sql
-- Purpose: payment_settlement_rule rows per (company × method × book)
-- Depends on: master.company_code, master.payment_method,
--             posting role lookup values (010)
-- Idempotent: WHERE NOT EXISTS guard
-- ============================================================================
-- One rule per combination of:
--   company_code × OUTBOUND-capable payment_method × STAT book
--
-- Each rule wires 6 posting roles:
--   clearing_posting_role_code   = ap_clearing           (Dr on settlement post)
--   settlement_posting_role_code = ap_trade_payable      (Cr on settlement post)
--   bank_fee_posting_role_code   = bank_fee              (Dr on bank fee)
--   discount_posting_role_code   = discount_earned       (Cr on discount taken)
--   fx_gain_posting_role_code    = fx_gain               (Cr on fav FX)
--   fx_loss_posting_role_code    = fx_loss               (Dr on adv FX)
--
-- The rule does NOT hold GL accounts directly — Engine 4.13 resolves roles
-- at posting time via resolve_posting_role_account() against the company's
-- book-specific role→account map, falling back to the role's fallback GL.
-- ============================================================================

DO $seed_payment_settlement_rules$
DECLARE
    v_cc        record;
    v_pm        record;
    v_sys       uuid := '00000000-0000-0000-0000-000000000000';
    v_rows      integer := 0;
BEGIN
    FOR v_cc IN
        SELECT id AS cc_id, tenant_id, code AS cc_code
          FROM master.company_code
         WHERE status = 'active'
    LOOP
        FOR v_pm IN
            SELECT id AS pm_id, code AS pm_code
              FROM master.payment_method
             WHERE tenant_id = v_cc.tenant_id
               AND upper(direction) IN ('OUTBOUND','BOTH')
               AND status = 'active'
        LOOP
            -- STAT (statutory) book — default
            INSERT INTO control.payment_settlement_rule (
                tenant_id,
                company_code_id, payment_method_id, direction, book_code,
                clearing_posting_role_code, settlement_posting_role_code,
                bank_fee_posting_role_code, discount_posting_role_code,
                fx_gain_posting_role_code, fx_loss_posting_role_code,
                chargeback_posting_role_code, suspense_posting_role_code,
                effective_from, status, created_by,
                metadata
            )
            SELECT v_cc.tenant_id,
                   v_cc.cc_id, v_pm.pm_id, 'outbound', 'STAT',
                   'ap_clearing', 'ap_trade_payable',
                   'bank_fee', 'discount_earned',
                   'fx_gain', 'fx_loss',
                   'chargeback', 'payment_suspense',
                   CURRENT_DATE, 'active', v_sys,
                   jsonb_build_object(
                        'auto_created_by',  'pack_ap_non_po',
                        'company_code',     v_cc.cc_code,
                        'payment_method',   v_pm.pm_code)
            WHERE NOT EXISTS (
                SELECT 1 FROM control.payment_settlement_rule
                 WHERE tenant_id = v_cc.tenant_id
                   AND company_code_id = v_cc.cc_id
                   AND payment_method_id = v_pm.pm_id
                   AND direction = 'outbound'
                   AND book_code = 'STAT'
                   AND effective_until IS NULL
            );

            GET DIAGNOSTICS v_rows = ROW_COUNT;
        END LOOP;
    END LOOP;

    RAISE NOTICE 'blueprint/080_payment_settlement_rules: % rules seeded',
        (SELECT count(*) FROM control.payment_settlement_rule
          WHERE metadata->>'auto_created_by' = 'pack_ap_non_po');
END $seed_payment_settlement_rules$;
