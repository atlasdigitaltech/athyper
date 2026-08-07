-- One payment_settlement_rule per (company_code x OUTBOUND payment_method x
-- effective statutory book). book_code stores the actual ledger_book.code;
-- "STAT" is a category concept, not a portable book identifier.
-- Wires 6 posting roles (clearing/settlement/bank_fee/discount/fx_gain/fx_loss).
-- Rule holds role codes — NOT GL accounts. Engine 4.13 resolves accounts at posting
-- time via resolve_posting_role_account() against the company's book-specific
-- role→account map (falls back to the role's default GL).

DO $seed_payment_settlement_rules$
DECLARE
    v_tid       uuid;
    v_cc        record;
    v_pm        record;
    v_sys       uuid := '00000000-0000-0000-0000-000000000000';
    v_rows      integer := 0;
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set';
    END IF;

    -- Retire legacy seed rows whose hard-coded or superseded book is not valid
    -- for the company at the rule start date. User-maintained rules are untouched.
    UPDATE control.payment_settlement_rule rule
       SET status = 'inactive',
           status_changed_at = now(),
           status_changed_by = v_sys,
           updated_at = now(),
           updated_by = v_sys
     WHERE rule.tenant_id = v_tid
       AND rule.status = 'active'
       AND rule.metadata->>'auto_created_by' = 'pack_ap_non_po'
       AND NOT EXISTS (
            SELECT 1
              FROM master.company_code_book_assignment assignment
              JOIN master.ledger_book book
                ON book.tenant_id = assignment.tenant_id
               AND book.id = assignment.book_id
             WHERE assignment.tenant_id = rule.tenant_id
               AND assignment.company_code_id = rule.company_code_id
               AND assignment.status = 'active'
               AND book.status = 'active'
               AND book.code = rule.book_code
               AND assignment.effective_from <= rule.effective_from
               AND (assignment.effective_to IS NULL OR assignment.effective_to >= rule.effective_from)
       );

    FOR v_cc IN
        SELECT company.id AS cc_id,
               company.tenant_id,
               company.code AS cc_code,
               settlement_book.code AS book_code
          FROM master.company_code company
          JOIN LATERAL (
                SELECT book.code
                  FROM master.company_code_book_assignment assignment
                  JOIN master.ledger_book book
                    ON book.tenant_id = assignment.tenant_id
                   AND book.id = assignment.book_id
                 WHERE assignment.tenant_id = company.tenant_id
                   AND assignment.company_code_id = company.id
                   AND assignment.status = 'active'
                   AND book.status = 'active'
                   AND book.category = 'statutory'
                   AND assignment.effective_from <= CURRENT_DATE
                   AND (assignment.effective_to IS NULL OR assignment.effective_to >= CURRENT_DATE)
                 ORDER BY (book.id = company.default_ledger_book_id) DESC,
                          book.is_primary DESC,
                          assignment.priority ASC,
                          assignment.effective_from DESC,
                          book.code
                 LIMIT 1
          ) settlement_book ON true
         WHERE company.tenant_id = v_tid
           AND company.status = 'active'
    LOOP
        FOR v_pm IN
            SELECT id AS pm_id, code AS pm_code
              FROM master.payment_method
             WHERE tenant_id = v_cc.tenant_id
               AND upper(direction) IN ('OUTBOUND','BOTH')
               AND status = 'active'
        LOOP
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
                   v_cc.cc_id, v_pm.pm_id, 'outbound', v_cc.book_code,
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
                   AND book_code = v_cc.book_code
                   AND status = 'active'
                   AND effective_until IS NULL
            );

            GET DIAGNOSTICS v_rows = ROW_COUNT;
        END LOOP;
    END LOOP;

    RAISE NOTICE 'blueprint/080_payment_settlement_rules: % rules seeded',
        (SELECT count(*) FROM control.payment_settlement_rule
          WHERE tenant_id = v_tid
            AND metadata->>'auto_created_by' = 'pack_ap_non_po');
END $seed_payment_settlement_rules$;
