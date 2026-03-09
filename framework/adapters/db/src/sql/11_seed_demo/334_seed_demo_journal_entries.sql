/* ============================================================================
   Athyper v2.4 — DEMO SEED: Manual Journal Entries (9 per tenant)
   Tables: fin.journal_entry, fin.journal_line
   Dependencies: 320_seed_demo_fiscal_open.sql, fin.chart_of_accounts

   Seeds 9 manual journal entries per tenant (9 tenants = 81 JEs):
     Month 1 (P1): MJE-001 accrual POSTED, MJE-002 depreciation POSTED,
                    MJE-003 FX correction REVERSED
     Month 2 (P2): MJE-004 accrual POSTED, MJE-005 reclass POSTED,
                    MJE-006 accrual reversal POSTED
     Month 3 (P3): MJE-007 accrual POSTED, MJE-008 bad debt CREATED,
                    MJE-009 adjustment CREATED

   All JEs balanced: total_debit = total_credit (enforced by CHECK constraint).
   MC-4 compliant. DEMO DATA ONLY.
   ============================================================================ */

CREATE OR REPLACE FUNCTION pg_temp.upsert_je(
    p_tenant uuid, p_entity_code text, p_je_number text,
    p_fiscal_year int, p_period_number int, p_posting_date date,
    p_description text, p_status text,
    p_total_debit decimal(18,4), p_total_credit decimal(18,4),
    p_currency_code text, p_doc_type text,
    p_is_reversal boolean DEFAULT false,
    p_reversal_of_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE v_id uuid; v_txn uuid := gen_random_uuid();
BEGIN
    v_id := gen_random_uuid();
    INSERT INTO fin.journal_entry (
        id, tenant_id, entity_code, je_number,
        txn_id, doc_id, doc_type,
        fiscal_year, period_number, posting_date,
        description, status,
        total_debit, total_credit, currency_code,
        is_reversal, reversal_of_id,
        posted_by, posted_at, created_at
    ) VALUES (
        v_id, p_tenant, p_entity_code, p_je_number,
        v_txn, v_id, p_doc_type,
        p_fiscal_year, p_period_number, p_posting_date,
        p_description, p_status,
        p_total_debit, p_total_credit, p_currency_code,
        p_is_reversal, p_reversal_of_id,
        CASE WHEN p_status = 'POSTED' THEN '00000000-0000-0000-0000-000000000002'::uuid END,
        CASE WHEN p_status = 'POSTED' THEN p_posting_date::timestamptz END,
        now()
    )
    ON CONFLICT (tenant_id, entity_code, je_number) DO UPDATE SET status = EXCLUDED.status
    RETURNING id INTO v_id;
    RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION pg_temp.upsert_jl(
    p_tenant uuid, p_je_id uuid, p_line_no int,
    p_account_id uuid, p_debit decimal(18,4), p_credit decimal(18,4),
    p_currency_code text, p_description text,
    p_cost_center_id uuid DEFAULT NULL,
    p_profit_center_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
    INSERT INTO fin.journal_line (
        id, tenant_id, je_id, line_no,
        account_id, debit_amount, credit_amount,
        currency_code, description,
        cost_center_id, profit_center_id
    ) VALUES (
        gen_random_uuid(), p_tenant, p_je_id, p_line_no,
        p_account_id, p_debit, p_credit,
        p_currency_code, p_description,
        p_cost_center_id, p_profit_center_id
    )
    ON CONFLICT (tenant_id, je_id, line_no) DO NOTHING;
END $fn$;

-- ============================================================================
-- Main seed loop
-- ============================================================================
DO $$
DECLARE
    v_tenant     uuid;
    v_code       text;
    v_entity     text;
    v_currency   text;
    v_fy_start   int;
    v_p1_start   date;
    v_p2_start   date;
    v_p3_start   date;
    v_je_id      uuid;
    v_rev_je_id  uuid;
    -- Accounts
    v_acct_salary    uuid;  -- 6100 Salaries & Wages (expense)
    v_acct_accrued   uuid;  -- 2120 Accrued Expenses (liability)
    v_acct_depr_exp  uuid;  -- 6800 Depreciation (expense) or fallback
    v_acct_accum_dep uuid;  -- 1220 Accumulated Depreciation (asset, contra)
    v_acct_fx_loss   uuid;  -- 8200 FX Loss (expense) or fallback
    v_acct_fx_gain   uuid;  -- 7200 FX Gain (revenue) or fallback
    v_acct_prepaid   uuid;  -- 1140 Prepaid Expenses (asset)
    v_acct_rent      uuid;  -- 6200 Rent & Utilities (expense)
    v_acct_bad_debt  uuid;  -- 8100 Interest/other expense or fallback
    v_acct_ar        uuid;  -- 1120 Accounts Receivable
    v_acct_expense   uuid;  -- fallback expense
    v_cc_id          uuid;
    v_pc_id          uuid;
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        SELECT currency INTO v_currency FROM core.tenant_profile WHERE tenant_id = v_tenant;
        IF v_currency IS NULL THEN v_currency := 'USD'; END IF;

        SELECT COALESCE(tp.fiscal_year_start_month, 1) INTO v_fy_start
        FROM core.tenant_profile tp WHERE tp.tenant_id = v_tenant;
        IF v_fy_start IS NULL THEN v_fy_start := 1; END IF;

        IF v_fy_start <= 10 THEN
            v_p1_start := make_date(2026, v_fy_start, 1);
            v_p2_start := make_date(2026, v_fy_start + 1, 1);
            v_p3_start := make_date(2026, v_fy_start + 2, 1);
        ELSIF v_fy_start = 11 THEN
            v_p1_start := make_date(2026, 11, 1);
            v_p2_start := make_date(2026, 12, 1);
            v_p3_start := make_date(2027, 1, 1);
        ELSE
            v_p1_start := make_date(2026, 12, 1);
            v_p2_start := make_date(2027, 1, 1);
            v_p3_start := make_date(2027, 2, 1);
        END IF;

        SELECT entity_code INTO v_entity
        FROM fin.operating_unit WHERE tenant_id = v_tenant ORDER BY entity_code, level LIMIT 1;
        IF v_entity IS NULL THEN CONTINUE; END IF;

        -- Resolve accounts by code (with fallbacks)
        SELECT id INTO v_acct_salary  FROM fin.chart_of_accounts WHERE tenant_id = v_tenant AND entity_code = v_entity AND account_code = '6100' LIMIT 1;
        SELECT id INTO v_acct_accrued FROM fin.chart_of_accounts WHERE tenant_id = v_tenant AND entity_code = v_entity AND account_code = '2120' LIMIT 1;
        SELECT id INTO v_acct_prepaid FROM fin.chart_of_accounts WHERE tenant_id = v_tenant AND entity_code = v_entity AND account_code = '1140' LIMIT 1;
        SELECT id INTO v_acct_rent    FROM fin.chart_of_accounts WHERE tenant_id = v_tenant AND entity_code = v_entity AND account_code = '6200' LIMIT 1;
        SELECT id INTO v_acct_ar      FROM fin.chart_of_accounts WHERE tenant_id = v_tenant AND entity_code = v_entity AND account_code = '1120' LIMIT 1;

        -- These may not exist in simpler blueprints
        SELECT id INTO v_acct_depr_exp  FROM fin.chart_of_accounts WHERE tenant_id = v_tenant AND entity_code = v_entity AND account_code = '6800' LIMIT 1;
        SELECT id INTO v_acct_accum_dep FROM fin.chart_of_accounts WHERE tenant_id = v_tenant AND entity_code = v_entity AND account_code = '1220' LIMIT 1;
        SELECT id INTO v_acct_fx_loss   FROM fin.chart_of_accounts WHERE tenant_id = v_tenant AND entity_code = v_entity AND account_code = '8200' LIMIT 1;
        SELECT id INTO v_acct_fx_gain   FROM fin.chart_of_accounts WHERE tenant_id = v_tenant AND entity_code = v_entity AND account_code = '7200' LIMIT 1;
        SELECT id INTO v_acct_bad_debt  FROM fin.chart_of_accounts WHERE tenant_id = v_tenant AND entity_code = v_entity AND account_code = '8100' LIMIT 1;

        -- Fallback expense account
        SELECT id INTO v_acct_expense FROM fin.chart_of_accounts
        WHERE tenant_id = v_tenant AND entity_code = v_entity AND account_type = 'EXPENSE' AND NOT is_group AND is_active
        ORDER BY account_code LIMIT 1;

        -- Use fallbacks for missing accounts (simpler blueprints)
        IF v_acct_salary  IS NULL THEN v_acct_salary  := v_acct_expense; END IF;
        IF v_acct_accrued IS NULL THEN
            SELECT id INTO v_acct_accrued FROM fin.chart_of_accounts
            WHERE tenant_id = v_tenant AND entity_code = v_entity AND account_type = 'LIABILITY' AND NOT is_group LIMIT 1;
        END IF;
        IF v_acct_depr_exp  IS NULL THEN v_acct_depr_exp  := v_acct_expense; END IF;
        IF v_acct_accum_dep IS NULL THEN
            SELECT id INTO v_acct_accum_dep FROM fin.chart_of_accounts
            WHERE tenant_id = v_tenant AND entity_code = v_entity AND account_type = 'ASSET' AND NOT is_group LIMIT 1;
        END IF;
        IF v_acct_fx_loss IS NULL THEN v_acct_fx_loss := v_acct_expense; END IF;
        IF v_acct_fx_gain IS NULL THEN
            SELECT id INTO v_acct_fx_gain FROM fin.chart_of_accounts
            WHERE tenant_id = v_tenant AND entity_code = v_entity AND account_type = 'REVENUE' AND NOT is_group LIMIT 1;
            IF v_acct_fx_gain IS NULL THEN v_acct_fx_gain := v_acct_accrued; END IF;
        END IF;
        IF v_acct_prepaid IS NULL THEN v_acct_prepaid := v_acct_accum_dep; END IF;
        IF v_acct_rent    IS NULL THEN v_acct_rent    := v_acct_expense; END IF;
        IF v_acct_bad_debt IS NULL THEN v_acct_bad_debt := v_acct_expense; END IF;

        SELECT id INTO v_cc_id FROM fin.cost_center WHERE tenant_id = v_tenant AND entity_code = v_entity AND is_active ORDER BY code LIMIT 1;
        SELECT id INTO v_pc_id FROM fin.profit_center WHERE tenant_id = v_tenant AND entity_code = v_entity AND is_active ORDER BY code LIMIT 1;

        -- ====================================================================
        -- MONTH 1 (P1)
        -- ====================================================================

        -- MJE-001: Salary accrual — POSTED
        v_je_id := pg_temp.upsert_je(v_tenant, v_entity, 'MJE-2026-00001', 2026, 1, v_p1_start + 27,
            'Salary accrual — Month 1', 'POSTED',
            50000.0000, 50000.0000, v_currency, 'MANUAL_ACCRUAL');
        PERFORM pg_temp.upsert_jl(v_tenant, v_je_id, 1, v_acct_salary, 50000.0000, 0.0000, v_currency, 'Salary expense accrual', v_cc_id, v_pc_id);
        PERFORM pg_temp.upsert_jl(v_tenant, v_je_id, 2, v_acct_accrued, 0.0000, 50000.0000, v_currency, 'Accrued salaries payable', v_cc_id, v_pc_id);

        -- MJE-002: Depreciation — POSTED
        v_je_id := pg_temp.upsert_je(v_tenant, v_entity, 'MJE-2026-00002', 2026, 1, v_p1_start + 28,
            'Monthly depreciation — Month 1', 'POSTED',
            3500.0000, 3500.0000, v_currency, 'MANUAL_ADJUSTMENT');
        PERFORM pg_temp.upsert_jl(v_tenant, v_je_id, 1, v_acct_depr_exp, 3500.0000, 0.0000, v_currency, 'Depreciation expense', v_cc_id, v_pc_id);
        PERFORM pg_temp.upsert_jl(v_tenant, v_je_id, 2, v_acct_accum_dep, 0.0000, 3500.0000, v_currency, 'Accumulated depreciation', v_cc_id, v_pc_id);

        -- MJE-003: FX rounding correction — POSTED then REVERSED
        v_je_id := pg_temp.upsert_je(v_tenant, v_entity, 'MJE-2026-00003', 2026, 1, v_p1_start + 25,
            'FX rounding correction — Month 1', 'REVERSED',
            250.0000, 250.0000, v_currency, 'MANUAL_ADJUSTMENT');
        PERFORM pg_temp.upsert_jl(v_tenant, v_je_id, 1, v_acct_fx_loss, 250.0000, 0.0000, v_currency, 'FX rounding loss', v_cc_id, v_pc_id);
        PERFORM pg_temp.upsert_jl(v_tenant, v_je_id, 2, v_acct_fx_gain, 0.0000, 250.0000, v_currency, 'FX rounding gain', v_cc_id, v_pc_id);

        -- MJE-003R: Reversal of MJE-003
        v_rev_je_id := pg_temp.upsert_je(v_tenant, v_entity, 'MJE-2026-00003R', 2026, 1, v_p1_start + 28,
            'Reversal of MJE-2026-00003 — FX correction was erroneous', 'POSTED',
            250.0000, 250.0000, v_currency, 'MANUAL_REVERSAL', true, v_je_id);
        PERFORM pg_temp.upsert_jl(v_tenant, v_rev_je_id, 1, v_acct_fx_gain, 250.0000, 0.0000, v_currency, 'Reverse FX gain', v_cc_id, v_pc_id);
        PERFORM pg_temp.upsert_jl(v_tenant, v_rev_je_id, 2, v_acct_fx_loss, 0.0000, 250.0000, v_currency, 'Reverse FX loss', v_cc_id, v_pc_id);

        -- Update the reversed_by_id on MJE-003
        UPDATE fin.journal_entry SET reversed_by_id = v_rev_je_id
        WHERE id = v_je_id AND tenant_id = v_tenant;

        -- ====================================================================
        -- MONTH 2 (P2)
        -- ====================================================================

        -- MJE-004: Salary accrual — POSTED
        v_je_id := pg_temp.upsert_je(v_tenant, v_entity, 'MJE-2026-00004', 2026, 2, v_p2_start + 25,
            'Salary accrual — Month 2', 'POSTED',
            52000.0000, 52000.0000, v_currency, 'MANUAL_ACCRUAL');
        PERFORM pg_temp.upsert_jl(v_tenant, v_je_id, 1, v_acct_salary, 52000.0000, 0.0000, v_currency, 'Salary expense accrual', v_cc_id, v_pc_id);
        PERFORM pg_temp.upsert_jl(v_tenant, v_je_id, 2, v_acct_accrued, 0.0000, 52000.0000, v_currency, 'Accrued salaries payable', v_cc_id, v_pc_id);

        -- MJE-005: Reclassification prepaid → expense — POSTED
        v_je_id := pg_temp.upsert_je(v_tenant, v_entity, 'MJE-2026-00005', 2026, 2, v_p2_start + 20,
            'Reclass prepaid rent → rent expense (1 month portion)', 'POSTED',
            8000.0000, 8000.0000, v_currency, 'MANUAL_RECLASS');
        PERFORM pg_temp.upsert_jl(v_tenant, v_je_id, 1, v_acct_rent, 8000.0000, 0.0000, v_currency, 'Rent expense (1 month)', v_cc_id, v_pc_id);
        PERFORM pg_temp.upsert_jl(v_tenant, v_je_id, 2, v_acct_prepaid, 0.0000, 8000.0000, v_currency, 'Reduce prepaid rent', v_cc_id, v_pc_id);

        -- MJE-006: Reverse Month 1 accrual — POSTED
        v_je_id := pg_temp.upsert_je(v_tenant, v_entity, 'MJE-2026-00006', 2026, 2, v_p2_start + 1,
            'Reverse Month 1 salary accrual (auto-reverse)', 'POSTED',
            50000.0000, 50000.0000, v_currency, 'MANUAL_REVERSAL', true);
        PERFORM pg_temp.upsert_jl(v_tenant, v_je_id, 1, v_acct_accrued, 50000.0000, 0.0000, v_currency, 'Reverse accrued salaries', v_cc_id, v_pc_id);
        PERFORM pg_temp.upsert_jl(v_tenant, v_je_id, 2, v_acct_salary, 0.0000, 50000.0000, v_currency, 'Reverse salary expense', v_cc_id, v_pc_id);

        -- ====================================================================
        -- MONTH 3 (P3)
        -- ====================================================================

        -- MJE-007: Salary accrual — POSTED
        v_je_id := pg_temp.upsert_je(v_tenant, v_entity, 'MJE-2026-00007', 2026, 3, v_p3_start + 25,
            'Salary accrual — Month 3', 'POSTED',
            54000.0000, 54000.0000, v_currency, 'MANUAL_ACCRUAL');
        PERFORM pg_temp.upsert_jl(v_tenant, v_je_id, 1, v_acct_salary, 54000.0000, 0.0000, v_currency, 'Salary expense accrual', v_cc_id, v_pc_id);
        PERFORM pg_temp.upsert_jl(v_tenant, v_je_id, 2, v_acct_accrued, 0.0000, 54000.0000, v_currency, 'Accrued salaries payable', v_cc_id, v_pc_id);

        -- MJE-008: Bad debt provision — CREATED (pending posting)
        v_je_id := pg_temp.upsert_je(v_tenant, v_entity, 'MJE-2026-00008', 2026, 3, v_p3_start + 20,
            'Bad debt provision — overdue receivables', 'CREATED',
            5000.0000, 5000.0000, v_currency, 'MANUAL_ADJUSTMENT');
        PERFORM pg_temp.upsert_jl(v_tenant, v_je_id, 1, v_acct_bad_debt, 5000.0000, 0.0000, v_currency, 'Bad debt expense', v_cc_id, v_pc_id);
        PERFORM pg_temp.upsert_jl(v_tenant, v_je_id, 2, v_acct_ar, 0.0000, 5000.0000, v_currency, 'Allowance for doubtful accounts', v_cc_id, v_pc_id);

        -- MJE-009: Year-end adjustment — CREATED (pending posting)
        v_je_id := pg_temp.upsert_je(v_tenant, v_entity, 'MJE-2026-00009', 2026, 3, v_p3_start + 22,
            'Prepaid insurance amortization — 1 month portion', 'CREATED',
            2500.0000, 2500.0000, v_currency, 'MANUAL_ADJUSTMENT');
        PERFORM pg_temp.upsert_jl(v_tenant, v_je_id, 1, v_acct_expense, 2500.0000, 0.0000, v_currency, 'Insurance expense (1 month)', v_cc_id, v_pc_id);
        PERFORM pg_temp.upsert_jl(v_tenant, v_je_id, 2, v_acct_prepaid, 0.0000, 2500.0000, v_currency, 'Reduce prepaid insurance', v_cc_id, v_pc_id);

        RAISE NOTICE 'Manual journal entries (9+1 reversal) seeded for tenant %', v_code;
    END LOOP;
END $$;
