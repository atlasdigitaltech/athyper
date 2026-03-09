/* ============================================================================
   Athyper v2.4 — DEMO SEED: GL Balances (Aggregated from JE activity)
   Table: fin.gl_balance
   Dependencies: 334_seed_demo_journal_entries.sql

   Computes GL balance rows per account/period/cost-center from the actual
   journal_line rows inserted by earlier seeds (invoices, payments, manual JEs).

   For each (tenant, entity, account, fiscal_year, period, cost_center, currency):
     - period_debit  = SUM(debit_amount) from posted JE lines in that period
     - period_credit = SUM(credit_amount) from posted JE lines in that period
     - opening_* = prior period's closing_* (P1 = 0)
     - closing_* = opening_* + period_*

   Since actual JE lines may not exist (auto-JE from postings is a runtime
   concern), this seed creates realistic synthetic GL balances using the
   chart_of_accounts for each tenant.

   Accounts seeded per period (representative mix):
     ASSET accounts:    net debit balances (cash, receivables, prepaid)
     LIABILITY accounts: net credit balances (payables, accruals)
     EQUITY accounts:   net credit balance (retained earnings)
     REVENUE accounts:  net credit balances (growing across periods)
     EXPENSE accounts:  net debit balances (growing across periods)

   MC-4 compliant. DEMO DATA ONLY.
   ============================================================================ */

-- ============================================================================
-- Helper: upsert a GL balance row
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.upsert_gl_balance(
    p_tenant uuid, p_entity text, p_account_id uuid,
    p_fiscal_year smallint, p_period smallint,
    p_cost_center_id uuid, p_currency text,
    p_opening_debit decimal(18,4), p_opening_credit decimal(18,4),
    p_period_debit decimal(18,4), p_period_credit decimal(18,4)
) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
    INSERT INTO fin.gl_balance (
        id, tenant_id, entity_code, account_id,
        fiscal_year, period_number,
        cost_center_id, currency_code,
        opening_debit, opening_credit,
        period_debit, period_credit,
        closing_debit, closing_credit,
        updated_at
    ) VALUES (
        gen_random_uuid(), p_tenant, p_entity, p_account_id,
        p_fiscal_year, p_period,
        p_cost_center_id, p_currency,
        p_opening_debit, p_opening_credit,
        p_period_debit, p_period_credit,
        p_opening_debit + p_period_debit,
        p_opening_credit + p_period_credit,
        now()
    )
    ON CONFLICT (tenant_id, entity_code, account_id, fiscal_year, period_number, cost_center_id, currency_code)
    DO UPDATE SET
        opening_debit  = EXCLUDED.opening_debit,
        opening_credit = EXCLUDED.opening_credit,
        period_debit   = EXCLUDED.period_debit,
        period_credit  = EXCLUDED.period_credit,
        closing_debit  = EXCLUDED.closing_debit,
        closing_credit = EXCLUDED.closing_credit,
        updated_at     = now();
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

    -- Account IDs by type (up to 3 per type for variety)
    v_acct_cash      uuid;
    v_acct_recv      uuid;
    v_acct_prepaid   uuid;
    v_acct_payable   uuid;
    v_acct_accrued   uuid;
    v_acct_equity    uuid;
    v_acct_rev1      uuid;
    v_acct_rev2      uuid;
    v_acct_exp1      uuid;
    v_acct_exp2      uuid;
    v_acct_exp3      uuid;
    v_acct_depr      uuid;  -- depreciation expense
    v_acct_accum     uuid;  -- accumulated depreciation (contra-asset)

    v_cc_id          uuid;

    -- Period amounts (varied per month to show progression)
    v_p1_rev         decimal(18,4);
    v_p1_exp         decimal(18,4);
    v_p2_rev         decimal(18,4);
    v_p2_exp         decimal(18,4);
    v_p3_rev         decimal(18,4);
    v_p3_exp         decimal(18,4);
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        SELECT currency INTO v_currency FROM core.tenant_profile WHERE tenant_id = v_tenant;
        IF v_currency IS NULL THEN v_currency := 'USD'; END IF;

        FOR v_entity IN
            SELECT DISTINCT entity_code FROM fin.operating_unit
            WHERE tenant_id = v_tenant ORDER BY entity_code
        LOOP
            -- ============================================================
            -- Resolve accounts by type (first leaf account of each type)
            -- ============================================================

            -- ASSET accounts
            SELECT id INTO v_acct_cash FROM fin.chart_of_accounts
            WHERE tenant_id = v_tenant AND entity_code = v_entity
              AND account_type = 'ASSET' AND NOT is_group AND is_active
              AND account_code LIKE '1110%'
            ORDER BY account_code LIMIT 1;

            IF v_acct_cash IS NULL THEN
                SELECT id INTO v_acct_cash FROM fin.chart_of_accounts
                WHERE tenant_id = v_tenant AND entity_code = v_entity
                  AND account_type = 'ASSET' AND NOT is_group AND is_active
                ORDER BY account_code LIMIT 1;
            END IF;

            SELECT id INTO v_acct_recv FROM fin.chart_of_accounts
            WHERE tenant_id = v_tenant AND entity_code = v_entity
              AND account_type = 'ASSET' AND NOT is_group AND is_active
              AND id != COALESCE(v_acct_cash, '00000000-0000-0000-0000-000000000000'::uuid)
            ORDER BY account_code LIMIT 1;
            IF v_acct_recv IS NULL THEN v_acct_recv := v_acct_cash; END IF;

            SELECT id INTO v_acct_prepaid FROM fin.chart_of_accounts
            WHERE tenant_id = v_tenant AND entity_code = v_entity
              AND account_type = 'ASSET' AND NOT is_group AND is_active
              AND id NOT IN (COALESCE(v_acct_cash, '00000000-0000-0000-0000-000000000000'::uuid),
                             COALESCE(v_acct_recv, '00000000-0000-0000-0000-000000000000'::uuid))
            ORDER BY account_code LIMIT 1;
            IF v_acct_prepaid IS NULL THEN v_acct_prepaid := v_acct_recv; END IF;

            -- LIABILITY accounts
            SELECT id INTO v_acct_payable FROM fin.chart_of_accounts
            WHERE tenant_id = v_tenant AND entity_code = v_entity
              AND account_type = 'LIABILITY' AND NOT is_group AND is_active
            ORDER BY account_code LIMIT 1;

            SELECT id INTO v_acct_accrued FROM fin.chart_of_accounts
            WHERE tenant_id = v_tenant AND entity_code = v_entity
              AND account_type = 'LIABILITY' AND NOT is_group AND is_active
              AND id != COALESCE(v_acct_payable, '00000000-0000-0000-0000-000000000000'::uuid)
            ORDER BY account_code LIMIT 1;
            IF v_acct_accrued IS NULL THEN v_acct_accrued := v_acct_payable; END IF;

            -- EQUITY account
            SELECT id INTO v_acct_equity FROM fin.chart_of_accounts
            WHERE tenant_id = v_tenant AND entity_code = v_entity
              AND account_type = 'EQUITY' AND NOT is_group AND is_active
            ORDER BY account_code LIMIT 1;

            -- REVENUE accounts
            SELECT id INTO v_acct_rev1 FROM fin.chart_of_accounts
            WHERE tenant_id = v_tenant AND entity_code = v_entity
              AND account_type = 'REVENUE' AND NOT is_group AND is_active
            ORDER BY account_code LIMIT 1;

            SELECT id INTO v_acct_rev2 FROM fin.chart_of_accounts
            WHERE tenant_id = v_tenant AND entity_code = v_entity
              AND account_type = 'REVENUE' AND NOT is_group AND is_active
              AND id != COALESCE(v_acct_rev1, '00000000-0000-0000-0000-000000000000'::uuid)
            ORDER BY account_code LIMIT 1;
            IF v_acct_rev2 IS NULL THEN v_acct_rev2 := v_acct_rev1; END IF;

            -- EXPENSE accounts
            SELECT id INTO v_acct_exp1 FROM fin.chart_of_accounts
            WHERE tenant_id = v_tenant AND entity_code = v_entity
              AND account_type = 'EXPENSE' AND NOT is_group AND is_active
            ORDER BY account_code LIMIT 1;

            SELECT id INTO v_acct_exp2 FROM fin.chart_of_accounts
            WHERE tenant_id = v_tenant AND entity_code = v_entity
              AND account_type = 'EXPENSE' AND NOT is_group AND is_active
              AND id != COALESCE(v_acct_exp1, '00000000-0000-0000-0000-000000000000'::uuid)
            ORDER BY account_code LIMIT 1;
            IF v_acct_exp2 IS NULL THEN v_acct_exp2 := v_acct_exp1; END IF;

            SELECT id INTO v_acct_exp3 FROM fin.chart_of_accounts
            WHERE tenant_id = v_tenant AND entity_code = v_entity
              AND account_type = 'EXPENSE' AND NOT is_group AND is_active
              AND id NOT IN (COALESCE(v_acct_exp1, '00000000-0000-0000-0000-000000000000'::uuid),
                             COALESCE(v_acct_exp2, '00000000-0000-0000-0000-000000000000'::uuid))
            ORDER BY account_code LIMIT 1;
            IF v_acct_exp3 IS NULL THEN v_acct_exp3 := v_acct_exp2; END IF;

            -- Contra-asset: accumulated depreciation
            SELECT id INTO v_acct_accum FROM fin.chart_of_accounts
            WHERE tenant_id = v_tenant AND entity_code = v_entity
              AND account_type = 'ASSET' AND NOT is_group AND is_active
              AND (account_code LIKE '122%' OR account_code LIKE '159%' OR account_name ILIKE '%accum%deprec%')
            ORDER BY account_code LIMIT 1;
            IF v_acct_accum IS NULL THEN v_acct_accum := v_acct_prepaid; END IF;

            -- Depreciation expense
            SELECT id INTO v_acct_depr FROM fin.chart_of_accounts
            WHERE tenant_id = v_tenant AND entity_code = v_entity
              AND account_type = 'EXPENSE' AND NOT is_group AND is_active
              AND (account_code LIKE '680%' OR account_name ILIKE '%deprec%')
            ORDER BY account_code LIMIT 1;
            IF v_acct_depr IS NULL THEN v_acct_depr := v_acct_exp3; END IF;

            -- Cost center
            SELECT id INTO v_cc_id FROM fin.cost_center
            WHERE tenant_id = v_tenant AND entity_code = v_entity AND is_active
            ORDER BY code LIMIT 1;

            -- Skip if no accounts found
            IF v_acct_cash IS NULL OR v_acct_payable IS NULL THEN CONTINUE; END IF;

            -- ============================================================
            -- Revenue/expense amounts with realistic month-over-month growth
            -- Vary amounts by first char of tenant code for diversity
            -- ============================================================
            v_p1_rev := 125000.0000 + (ascii(substring(v_code from 6 for 1)) * 100)::decimal(18,4);
            v_p1_exp := 98000.0000 + (ascii(substring(v_code from 6 for 1)) * 80)::decimal(18,4);
            v_p2_rev := v_p1_rev * 1.0500;  -- 5% growth
            v_p2_exp := v_p1_exp * 1.0300;  -- 3% growth
            v_p3_rev := v_p2_rev * 1.0800;  -- 8% growth (seasonal)
            v_p3_exp := v_p2_exp * 1.0400;  -- 4% growth

            -- ============================================================
            -- PERIOD 1 (HARD_CLOSE) — All balances final
            -- ============================================================

            -- Cash (ASSET): large debit balance, net of payments
            PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_cash,
                2026::smallint, 1::smallint, v_cc_id, v_currency,
                0.0000, 0.0000,  -- opening (start of year)
                v_p1_rev * 0.8000, v_p1_exp * 0.7000);  -- collections vs disbursements

            -- Receivables (ASSET): invoiced revenue less collections
            PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_recv,
                2026::smallint, 1::smallint, v_cc_id, v_currency,
                0.0000, 0.0000,
                v_p1_rev, v_p1_rev * 0.8000);  -- revenue booked vs collected

            -- Prepaid (ASSET): insurance/licenses prepaid
            PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_prepaid,
                2026::smallint, 1::smallint, v_cc_id, v_currency,
                0.0000, 0.0000,
                12000.0000, 1000.0000);  -- prepaid, amortize 1k/month

            -- Payable (LIABILITY): invoices received less payments
            PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_payable,
                2026::smallint, 1::smallint, v_cc_id, v_currency,
                0.0000, 0.0000,
                v_p1_exp * 0.7000, v_p1_exp);  -- payments vs invoices received

            -- Accrued liabilities
            PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_accrued,
                2026::smallint, 1::smallint, v_cc_id, v_currency,
                0.0000, 0.0000,
                0.0000, 8500.0000);  -- salary accrual

            -- Equity: retained earnings
            IF v_acct_equity IS NOT NULL THEN
                PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_equity,
                    2026::smallint, 1::smallint, v_cc_id, v_currency,
                    0.0000, 0.0000,
                    0.0000, 50000.0000);  -- opening retained earnings
            END IF;

            -- Revenue 1 (primary): service/product revenue
            IF v_acct_rev1 IS NOT NULL THEN
                PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_rev1,
                    2026::smallint, 1::smallint, v_cc_id, v_currency,
                    0.0000, 0.0000,
                    0.0000, v_p1_rev * 0.7000);
            END IF;

            -- Revenue 2 (secondary)
            IF v_acct_rev2 IS NOT NULL AND v_acct_rev2 != v_acct_rev1 THEN
                PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_rev2,
                    2026::smallint, 1::smallint, v_cc_id, v_currency,
                    0.0000, 0.0000,
                    0.0000, v_p1_rev * 0.3000);
            END IF;

            -- Expense 1: salary/wages
            PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_exp1,
                2026::smallint, 1::smallint, v_cc_id, v_currency,
                0.0000, 0.0000,
                v_p1_exp * 0.5000, 0.0000);

            -- Expense 2: rent/utilities
            PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_exp2,
                2026::smallint, 1::smallint, v_cc_id, v_currency,
                0.0000, 0.0000,
                v_p1_exp * 0.3000, 0.0000);

            -- Expense 3: supplies/other
            PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_exp3,
                2026::smallint, 1::smallint, v_cc_id, v_currency,
                0.0000, 0.0000,
                v_p1_exp * 0.2000, 0.0000);

            -- Depreciation expense
            PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_depr,
                2026::smallint, 1::smallint, v_cc_id, v_currency,
                0.0000, 0.0000,
                3500.0000, 0.0000);

            -- Accumulated depreciation (contra-asset: credit balance)
            PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_accum,
                2026::smallint, 1::smallint, v_cc_id, v_currency,
                0.0000, 0.0000,
                0.0000, 3500.0000);

            -- ============================================================
            -- PERIOD 2 (SOFT_CLOSE) — Opening = P1 closing
            -- ============================================================

            -- Cash
            PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_cash,
                2026::smallint, 2::smallint, v_cc_id, v_currency,
                v_p1_rev * 0.8000, v_p1_exp * 0.7000,  -- P1 closing
                v_p2_rev * 0.7500, v_p2_exp * 0.6500);

            -- Receivables
            PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_recv,
                2026::smallint, 2::smallint, v_cc_id, v_currency,
                v_p1_rev, v_p1_rev * 0.8000,
                v_p2_rev, v_p2_rev * 0.7500);

            -- Prepaid
            PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_prepaid,
                2026::smallint, 2::smallint, v_cc_id, v_currency,
                12000.0000, 1000.0000,
                0.0000, 1000.0000);

            -- Payable
            PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_payable,
                2026::smallint, 2::smallint, v_cc_id, v_currency,
                v_p1_exp * 0.7000, v_p1_exp,
                v_p2_exp * 0.6500, v_p2_exp);

            -- Accrued liabilities
            PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_accrued,
                2026::smallint, 2::smallint, v_cc_id, v_currency,
                0.0000, 8500.0000,
                8500.0000, 9200.0000);  -- reverse P1 accrual, post P2

            -- Equity
            IF v_acct_equity IS NOT NULL THEN
                PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_equity,
                    2026::smallint, 2::smallint, v_cc_id, v_currency,
                    0.0000, 50000.0000,
                    0.0000, 0.0000);  -- no movement in equity mid-year
            END IF;

            -- Revenue 1
            IF v_acct_rev1 IS NOT NULL THEN
                PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_rev1,
                    2026::smallint, 2::smallint, v_cc_id, v_currency,
                    0.0000, v_p1_rev * 0.7000,
                    0.0000, v_p2_rev * 0.7000);
            END IF;

            -- Revenue 2
            IF v_acct_rev2 IS NOT NULL AND v_acct_rev2 != v_acct_rev1 THEN
                PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_rev2,
                    2026::smallint, 2::smallint, v_cc_id, v_currency,
                    0.0000, v_p1_rev * 0.3000,
                    0.0000, v_p2_rev * 0.3000);
            END IF;

            -- Expense 1: salary
            PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_exp1,
                2026::smallint, 2::smallint, v_cc_id, v_currency,
                v_p1_exp * 0.5000, 0.0000,
                v_p2_exp * 0.5000, 0.0000);

            -- Expense 2: rent
            PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_exp2,
                2026::smallint, 2::smallint, v_cc_id, v_currency,
                v_p1_exp * 0.3000, 0.0000,
                v_p2_exp * 0.3000, 0.0000);

            -- Expense 3: other
            PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_exp3,
                2026::smallint, 2::smallint, v_cc_id, v_currency,
                v_p1_exp * 0.2000, 0.0000,
                v_p2_exp * 0.2000, 0.0000);

            -- Depreciation
            PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_depr,
                2026::smallint, 2::smallint, v_cc_id, v_currency,
                3500.0000, 0.0000,
                3500.0000, 0.0000);

            -- Accumulated depreciation
            PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_accum,
                2026::smallint, 2::smallint, v_cc_id, v_currency,
                0.0000, 3500.0000,
                0.0000, 3500.0000);

            -- ============================================================
            -- PERIOD 3 (OPEN) — Opening = P2 closing, current activity
            -- ============================================================

            -- Cash
            PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_cash,
                2026::smallint, 3::smallint, v_cc_id, v_currency,
                v_p1_rev * 0.8000 + v_p2_rev * 0.7500,
                v_p1_exp * 0.7000 + v_p2_exp * 0.6500,
                v_p3_rev * 0.6000, v_p3_exp * 0.5000);  -- less collected (open period)

            -- Receivables
            PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_recv,
                2026::smallint, 3::smallint, v_cc_id, v_currency,
                v_p1_rev + v_p2_rev,
                v_p1_rev * 0.8000 + v_p2_rev * 0.7500,
                v_p3_rev, v_p3_rev * 0.6000);

            -- Prepaid
            PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_prepaid,
                2026::smallint, 3::smallint, v_cc_id, v_currency,
                12000.0000, 2000.0000,
                0.0000, 1000.0000);

            -- Payable
            PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_payable,
                2026::smallint, 3::smallint, v_cc_id, v_currency,
                v_p1_exp * 0.7000 + v_p2_exp * 0.6500,
                v_p1_exp + v_p2_exp,
                v_p3_exp * 0.5000, v_p3_exp);

            -- Accrued liabilities
            PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_accrued,
                2026::smallint, 3::smallint, v_cc_id, v_currency,
                8500.0000, 8500.0000 + 9200.0000,
                9200.0000, 9800.0000);

            -- Equity
            IF v_acct_equity IS NOT NULL THEN
                PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_equity,
                    2026::smallint, 3::smallint, v_cc_id, v_currency,
                    0.0000, 50000.0000,
                    0.0000, 0.0000);
            END IF;

            -- Revenue 1
            IF v_acct_rev1 IS NOT NULL THEN
                PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_rev1,
                    2026::smallint, 3::smallint, v_cc_id, v_currency,
                    0.0000, v_p1_rev * 0.7000 + v_p2_rev * 0.7000,
                    0.0000, v_p3_rev * 0.7000);
            END IF;

            -- Revenue 2
            IF v_acct_rev2 IS NOT NULL AND v_acct_rev2 != v_acct_rev1 THEN
                PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_rev2,
                    2026::smallint, 3::smallint, v_cc_id, v_currency,
                    0.0000, v_p1_rev * 0.3000 + v_p2_rev * 0.3000,
                    0.0000, v_p3_rev * 0.3000);
            END IF;

            -- Expense 1: salary
            PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_exp1,
                2026::smallint, 3::smallint, v_cc_id, v_currency,
                v_p1_exp * 0.5000 + v_p2_exp * 0.5000, 0.0000,
                v_p3_exp * 0.5000, 0.0000);

            -- Expense 2: rent
            PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_exp2,
                2026::smallint, 3::smallint, v_cc_id, v_currency,
                v_p1_exp * 0.3000 + v_p2_exp * 0.3000, 0.0000,
                v_p3_exp * 0.3000, 0.0000);

            -- Expense 3: other
            PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_exp3,
                2026::smallint, 3::smallint, v_cc_id, v_currency,
                v_p1_exp * 0.2000 + v_p2_exp * 0.2000, 0.0000,
                v_p3_exp * 0.2000, 0.0000);

            -- Depreciation
            PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_depr,
                2026::smallint, 3::smallint, v_cc_id, v_currency,
                7000.0000, 0.0000,
                3500.0000, 0.0000);

            -- Accumulated depreciation
            PERFORM pg_temp.upsert_gl_balance(v_tenant, v_entity, v_acct_accum,
                2026::smallint, 3::smallint, v_cc_id, v_currency,
                0.0000, 7000.0000,
                0.0000, 3500.0000);

        END LOOP; -- entity_code

        RAISE NOTICE 'GL balances (13 accounts x 3 periods) seeded for tenant %', v_code;
    END LOOP; -- tenant
END $$;
