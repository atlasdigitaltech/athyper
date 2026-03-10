/* ============================================================================
   Athyper v2.4 — DEMO SEED: Bank Statements & Lines (12 months × 9 tenants)
   Tables: fin.bank_statement, fin.bank_statement_line, fin.reconciliation_session
   Dependencies: 280 (tenants), 291 (org units), 292 (COA)

   Seeds 12 monthly bank statements per demo tenant (Mar 2025 – Feb 2026):
     Months 1–9  (Mar–Nov 2025): COMPLETED — fully reconciled
     Month  10   (Dec 2025):     COMPLETED — reconciled
     Month  11   (Jan 2026):     IN_PROGRESS — partially matched
     Month  12   (Feb 2026):     IMPORTED — freshly uploaded

   Each statement: 15–25 transaction lines with realistic counterparties,
   references, and flowing opening→closing balances.

   Bank names are country-appropriate. Currencies match tenant profiles.
   MC-4 compliant: all amounts are DECIMAL literals.
   DEMO DATA ONLY — not required for production deployments.
   ============================================================================ */

-- ============================================================================
-- Patch: widen direction column from varchar(5) to varchar(6) for 'CREDIT'
-- ============================================================================
DO $$ BEGIN
    ALTER TABLE fin.bank_statement_line
        ALTER COLUMN direction TYPE varchar(6);
EXCEPTION WHEN others THEN NULL;
END $$;

-- ============================================================================
-- Helper: upsert bank_statement header, return id
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.upsert_bs(
    p_tenant          uuid,
    p_entity_code     text,
    p_statement_number text,
    p_bank_account_id uuid,
    p_bank_name       text,
    p_statement_date  date,
    p_period_start    date,
    p_period_end      date,
    p_opening_balance decimal(18,4),
    p_closing_balance decimal(18,4),
    p_currency_code   text,
    p_source          text,
    p_status          text,
    p_line_count      integer
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE v_id uuid;
BEGIN
    INSERT INTO fin.bank_statement (
        id, tenant_id, entity_code, statement_number,
        bank_account_id, bank_name,
        statement_date, period_start, period_end,
        opening_balance, closing_balance, currency_code,
        source, status, line_count, imported_by, imported_at
    ) VALUES (
        gen_random_uuid(), p_tenant, p_entity_code, p_statement_number,
        p_bank_account_id, p_bank_name,
        p_statement_date, p_period_start, p_period_end,
        p_opening_balance, p_closing_balance, p_currency_code,
        p_source, p_status, p_line_count,
        '00000000-0000-0000-0000-000000000001'::uuid, now()
    )
    ON CONFLICT (tenant_id, entity_code, statement_number) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_id;
    RETURN v_id;
END $fn$;

-- ============================================================================
-- Helper: upsert bank_statement_line
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.upsert_bsl(
    p_tenant          uuid,
    p_statement_id    uuid,
    p_line_no         smallint,
    p_txn_date        date,
    p_value_date      date,
    p_amount          decimal(18,4),
    p_direction       text,
    p_reference       text,
    p_description     text,
    p_counterparty    text,
    p_match_status    text,
    p_bank_reference  text
) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
    INSERT INTO fin.bank_statement_line (
        id, tenant_id, statement_id, line_no,
        transaction_date, value_date, amount, direction,
        reference, description, counterparty,
        match_status, bank_reference
    ) VALUES (
        gen_random_uuid(), p_tenant, p_statement_id, p_line_no,
        p_txn_date, p_value_date, p_amount, p_direction,
        p_reference, p_description, p_counterparty,
        p_match_status, p_bank_reference
    )
    ON CONFLICT (tenant_id, statement_id, line_no) DO UPDATE SET updated_at = now();
END $fn$;

-- ============================================================================
-- Helper: upsert reconciliation_session
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.upsert_recon(
    p_tenant       uuid,
    p_statement_id uuid,
    p_status       text,
    p_total        integer,
    p_auto         integer,
    p_manual       integer,
    p_unmatched    integer,
    p_excluded     integer,
    p_discrepancy  decimal(18,4)
) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
    INSERT INTO fin.reconciliation_session (
        id, tenant_id, statement_id, status,
        total_lines, auto_matched, manual_matched, unmatched, excluded,
        discrepancy,
        started_by, started_at,
        completed_by, completed_at
    ) VALUES (
        gen_random_uuid(), p_tenant, p_statement_id, p_status,
        p_total, p_auto, p_manual, p_unmatched, p_excluded,
        p_discrepancy,
        '00000000-0000-0000-0000-000000000001'::uuid, now(),
        CASE WHEN p_status = 'COMPLETED' THEN '00000000-0000-0000-0000-000000000001'::uuid END,
        CASE WHEN p_status = 'COMPLETED' THEN now() END
    )
    ON CONFLICT (tenant_id, statement_id) DO UPDATE SET updated_at = now();
END $fn$;

-- ============================================================================
-- Main seed: generate 12 months of bank statements per tenant
-- ============================================================================
DO $$
DECLARE
    v_tenant       uuid;
    v_code         text;
    v_entity       text;
    v_currency     text;
    v_bank_acct    uuid;
    v_bank_name    text;
    v_stmt_id      uuid;
    v_month        integer;
    v_year         integer;
    v_period_start date;
    v_period_end   date;
    v_stmt_date    date;
    v_stmt_number  text;
    v_opening      decimal(18,4);
    v_closing      decimal(18,4);
    v_status       text;
    v_source       text;
    v_match_status text;
    v_line_count   integer;
    v_line_no      smallint;
    v_txn_date     date;
    v_amount       decimal(18,4);
    v_base_balance decimal(18,4);
    v_running      decimal(18,4);
    -- Transaction template arrays
    v_desc         text;
    v_cpty         text;
    v_dir          text;
    v_ref          text;
    v_bref         text;
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        -- Resolve tenant currency
        SELECT currency INTO v_currency FROM core.tenant_profile WHERE tenant_id = v_tenant;
        IF v_currency IS NULL THEN v_currency := 'USD'; END IF;

        -- Get first entity_code
        SELECT entity_code INTO v_entity
        FROM fin.operating_unit
        WHERE tenant_id = v_tenant
        ORDER BY entity_code
        LIMIT 1;
        IF v_entity IS NULL THEN v_entity := 'HQ'; END IF;

        -- Get bank account (Cash & Bank = 1110)
        SELECT id INTO v_bank_acct FROM fin.chart_of_accounts
        WHERE tenant_id = v_tenant
          AND entity_code = v_entity
          AND account_code = '1110';
        -- Fallback: first ASSET account
        IF v_bank_acct IS NULL THEN
            SELECT id INTO v_bank_acct FROM fin.chart_of_accounts
            WHERE tenant_id = v_tenant AND account_type = 'ASSET'
            ORDER BY account_code LIMIT 1;
        END IF;
        IF v_bank_acct IS NULL THEN CONTINUE; END IF;

        -- Country-appropriate bank name
        v_bank_name := CASE v_code
            WHEN 'demo_my' THEN 'Maybank Berhad'
            WHEN 'demo_in' THEN 'HDFC Bank Ltd'
            WHEN 'demo_sa' THEN 'Al Rajhi Bank'
            WHEN 'demo_qa' THEN 'Qatar National Bank'
            WHEN 'demo_fr' THEN 'BNP Paribas SA'
            WHEN 'demo_de' THEN 'Deutsche Bank AG'
            WHEN 'demo_ch' THEN 'UBS Group AG'
            WHEN 'demo_us' THEN 'JPMorgan Chase Bank'
            WHEN 'demo_ca' THEN 'Royal Bank of Canada'
            ELSE 'Default Bank'
        END;

        -- Base opening balance varies by currency strength
        v_base_balance := CASE v_code
            WHEN 'demo_my' THEN 125000.0000   -- MYR
            WHEN 'demo_in' THEN 2500000.0000   -- INR
            WHEN 'demo_sa' THEN 185000.0000    -- SAR
            WHEN 'demo_qa' THEN 175000.0000    -- QAR
            WHEN 'demo_fr' THEN 95000.0000     -- EUR
            WHEN 'demo_de' THEN 110000.0000    -- EUR
            WHEN 'demo_ch' THEN 88000.0000     -- CHF
            WHEN 'demo_us' THEN 150000.0000    -- USD
            WHEN 'demo_ca' THEN 135000.0000    -- CAD
            ELSE 100000.0000
        END;

        v_opening := v_base_balance;

        -- ================================================================
        -- Loop through 12 months: Mar 2025 → Feb 2026
        -- ================================================================
        FOR v_month IN 0..11 LOOP
            v_year := 2025 + ((2 + v_month) / 12);  -- Mar=2025, ..., Feb=2026
            v_period_start := make_date(
                CASE WHEN (3 + v_month) > 12 THEN 2026 ELSE 2025 END,
                ((2 + v_month) % 12) + 1,
                1
            );
            v_period_end := (v_period_start + interval '1 month' - interval '1 day')::date;
            v_stmt_date  := v_period_end + interval '2 days';  -- statement generated 2 days after period end
            v_stmt_number := 'BS-' || to_char(v_period_start, 'YYYY-MM');

            -- Status depends on recency
            IF v_month <= 9 THEN
                v_status := 'COMPLETED';
                v_source := 'CSV';
                v_match_status := 'CONFIRMED';
            ELSIF v_month = 10 THEN
                v_status := 'IN_PROGRESS';
                v_source := 'CSV';
                v_match_status := 'AUTO_MATCHED';
            ELSE
                v_status := 'IMPORTED';
                v_source := 'CSV';
                v_match_status := 'UNMATCHED';
            END IF;

            -- Calculate line count: 18 lines per statement
            v_line_count := 18;
            v_running := v_opening;
            v_line_no := 0;

            -- ============================================================
            -- Create statement header (closing will be updated after lines)
            -- ============================================================
            -- Pre-calculate closing balance: net of all transactions
            -- We'll compute it from the known transaction pattern below
            v_closing := v_opening
                -- Credits (inflows)
                + (v_base_balance * 0.42)    -- customer payment 1
                + (v_base_balance * 0.28)    -- customer payment 2
                + (v_base_balance * 0.15)    -- customer payment 3
                + (v_base_balance * 0.08)    -- refund received
                + (v_base_balance * 0.003)   -- interest income
                + (v_base_balance * 0.05)    -- misc credit
                -- Debits (outflows)
                - (v_base_balance * 0.22)    -- salary batch
                - (v_base_balance * 0.08)    -- rent
                - (v_base_balance * 0.12)    -- supplier payment 1
                - (v_base_balance * 0.09)    -- supplier payment 2
                - (v_base_balance * 0.065)   -- supplier payment 3
                - (v_base_balance * 0.04)    -- utilities
                - (v_base_balance * 0.035)   -- insurance
                - (v_base_balance * 0.055)   -- tax payment
                - (v_base_balance * 0.025)   -- professional fees
                - (v_base_balance * 0.015)   -- office supplies
                - (v_base_balance * 0.018)   -- IT services
                - (v_base_balance * 0.012);  -- misc debit

            -- Round to 2 decimals for realism
            v_closing := round(v_closing, 2);

            v_stmt_id := pg_temp.upsert_bs(
                v_tenant, v_entity, v_stmt_number,
                v_bank_acct, v_bank_name,
                v_stmt_date, v_period_start, v_period_end,
                v_opening, v_closing, v_currency,
                v_source, v_status, v_line_count
            );

            -- ============================================================
            -- Insert 18 transaction lines
            -- ============================================================

            -- Line 1: Customer payment received (large)
            v_line_no := 1;
            v_amount := round(v_base_balance * 0.42, 2);
            v_txn_date := v_period_start + 1;
            PERFORM pg_temp.upsert_bsl(v_tenant, v_stmt_id, v_line_no,
                v_txn_date, v_txn_date + 1,
                v_amount, 'CREDIT',
                'CUST/RCV/' || to_char(v_period_start, 'YYYYMM') || '/001',
                'Payment received — Invoice settlement Q' || ((v_month / 3) + 1)::text,
                'Acme Industries Ltd',
                v_match_status,
                'BNK' || to_char(v_txn_date, 'YYYYMMDD') || '0001');

            -- Line 2: Salary batch payment
            v_line_no := 2;
            v_amount := round(v_base_balance * 0.22, 2);
            v_txn_date := v_period_start + 4;
            PERFORM pg_temp.upsert_bsl(v_tenant, v_stmt_id, v_line_no,
                v_txn_date, v_txn_date,
                v_amount, 'DEBIT',
                'SAL/BATCH/' || to_char(v_period_start, 'YYYYMM'),
                'Monthly payroll — ' || to_char(v_period_start, 'Mon YYYY'),
                'Payroll Clearing Account',
                v_match_status,
                'BNK' || to_char(v_txn_date, 'YYYYMMDD') || '0002');

            -- Line 3: Rent payment
            v_line_no := 3;
            v_amount := round(v_base_balance * 0.08, 2);
            v_txn_date := v_period_start + 4;
            PERFORM pg_temp.upsert_bsl(v_tenant, v_stmt_id, v_line_no,
                v_txn_date, v_txn_date + 1,
                v_amount, 'DEBIT',
                'RENT/' || to_char(v_period_start, 'YYYYMM'),
                'Office rent — ' || to_char(v_period_start, 'Mon YYYY'),
                'Metro Property Management',
                v_match_status,
                'BNK' || to_char(v_txn_date, 'YYYYMMDD') || '0003');

            -- Line 4: Customer payment 2 (medium)
            v_line_no := 4;
            v_amount := round(v_base_balance * 0.28, 2);
            v_txn_date := v_period_start + 6;
            PERFORM pg_temp.upsert_bsl(v_tenant, v_stmt_id, v_line_no,
                v_txn_date, v_txn_date + 1,
                v_amount, 'CREDIT',
                'CUST/RCV/' || to_char(v_period_start, 'YYYYMM') || '/002',
                'Customer payment — Service contract',
                'Global Trading Corp',
                v_match_status,
                'BNK' || to_char(v_txn_date, 'YYYYMMDD') || '0004');

            -- Line 5: Supplier payment 1
            v_line_no := 5;
            v_amount := round(v_base_balance * 0.12, 2);
            v_txn_date := v_period_start + 7;
            PERFORM pg_temp.upsert_bsl(v_tenant, v_stmt_id, v_line_no,
                v_txn_date, v_txn_date + 2,
                v_amount, 'DEBIT',
                'PAY/SUP/' || to_char(v_period_start, 'YYYYMM') || '/001',
                'Supplier payment — Raw materials',
                'Premier Supply Co',
                v_match_status,
                'BNK' || to_char(v_txn_date, 'YYYYMMDD') || '0005');

            -- Line 6: Utilities payment
            v_line_no := 6;
            v_amount := round(v_base_balance * 0.04, 2);
            v_txn_date := v_period_start + 9;
            PERFORM pg_temp.upsert_bsl(v_tenant, v_stmt_id, v_line_no,
                v_txn_date, v_txn_date,
                v_amount, 'DEBIT',
                'UTIL/' || to_char(v_period_start, 'YYYYMM'),
                'Electricity & water — ' || to_char(v_period_start, 'Mon YYYY'),
                'National Utilities Corp',
                v_match_status,
                'BNK' || to_char(v_txn_date, 'YYYYMMDD') || '0006');

            -- Line 7: Supplier payment 2
            v_line_no := 7;
            v_amount := round(v_base_balance * 0.09, 2);
            v_txn_date := v_period_start + 10;
            PERFORM pg_temp.upsert_bsl(v_tenant, v_stmt_id, v_line_no,
                v_txn_date, v_txn_date + 1,
                v_amount, 'DEBIT',
                'PAY/SUP/' || to_char(v_period_start, 'YYYYMM') || '/002',
                'Supplier payment — IT hardware',
                'TechVendor Solutions',
                v_match_status,
                'BNK' || to_char(v_txn_date, 'YYYYMMDD') || '0007');

            -- Line 8: Customer payment 3 (small)
            v_line_no := 8;
            v_amount := round(v_base_balance * 0.15, 2);
            v_txn_date := v_period_start + 11;
            PERFORM pg_temp.upsert_bsl(v_tenant, v_stmt_id, v_line_no,
                v_txn_date, v_txn_date + 1,
                v_amount, 'CREDIT',
                'CUST/RCV/' || to_char(v_period_start, 'YYYYMM') || '/003',
                'Customer payment — Consulting fees',
                'Pinnacle Enterprises',
                v_match_status,
                'BNK' || to_char(v_txn_date, 'YYYYMMDD') || '0008');

            -- Line 9: Insurance premium
            v_line_no := 9;
            v_amount := round(v_base_balance * 0.035, 2);
            v_txn_date := v_period_start + 12;
            PERFORM pg_temp.upsert_bsl(v_tenant, v_stmt_id, v_line_no,
                v_txn_date, v_txn_date,
                v_amount, 'DEBIT',
                'INS/PREM/' || to_char(v_period_start, 'YYYYMM'),
                'Business insurance premium — Monthly',
                'Atlas Insurance Group',
                v_match_status,
                'BNK' || to_char(v_txn_date, 'YYYYMMDD') || '0009');

            -- Line 10: Tax payment
            v_line_no := 10;
            v_amount := round(v_base_balance * 0.055, 2);
            v_txn_date := v_period_start + 14;
            PERFORM pg_temp.upsert_bsl(v_tenant, v_stmt_id, v_line_no,
                v_txn_date, v_txn_date,
                v_amount, 'DEBIT',
                'TAX/' || to_char(v_period_start, 'YYYYMM'),
                'Statutory tax remittance — ' || to_char(v_period_start, 'Mon YYYY'),
                'Revenue Authority',
                v_match_status,
                'BNK' || to_char(v_txn_date, 'YYYYMMDD') || '0010');

            -- Line 11: Supplier payment 3
            v_line_no := 11;
            v_amount := round(v_base_balance * 0.065, 2);
            v_txn_date := v_period_start + 15;
            PERFORM pg_temp.upsert_bsl(v_tenant, v_stmt_id, v_line_no,
                v_txn_date, v_txn_date + 1,
                v_amount, 'DEBIT',
                'PAY/SUP/' || to_char(v_period_start, 'YYYYMM') || '/003',
                'Supplier payment — Logistics services',
                'SwiftFreight Logistics',
                v_match_status,
                'BNK' || to_char(v_txn_date, 'YYYYMMDD') || '0011');

            -- Line 12: Professional fees
            v_line_no := 12;
            v_amount := round(v_base_balance * 0.025, 2);
            v_txn_date := v_period_start + 17;
            PERFORM pg_temp.upsert_bsl(v_tenant, v_stmt_id, v_line_no,
                v_txn_date, v_txn_date,
                v_amount, 'DEBIT',
                'PROF/' || to_char(v_period_start, 'YYYYMM'),
                'Legal & audit advisory fees',
                'Baker & Associates LLP',
                v_match_status,
                'BNK' || to_char(v_txn_date, 'YYYYMMDD') || '0012');

            -- Line 13: Refund received
            v_line_no := 13;
            v_amount := round(v_base_balance * 0.08, 2);
            v_txn_date := v_period_start + 18;
            PERFORM pg_temp.upsert_bsl(v_tenant, v_stmt_id, v_line_no,
                v_txn_date, v_txn_date + 1,
                v_amount, 'CREDIT',
                'REF/RCV/' || to_char(v_period_start, 'YYYYMM') || '/001',
                'Vendor credit note refund',
                'Premier Supply Co',
                v_match_status,
                'BNK' || to_char(v_txn_date, 'YYYYMMDD') || '0013');

            -- Line 14: Office supplies
            v_line_no := 14;
            v_amount := round(v_base_balance * 0.015, 2);
            v_txn_date := v_period_start + 19;
            PERFORM pg_temp.upsert_bsl(v_tenant, v_stmt_id, v_line_no,
                v_txn_date, v_txn_date,
                v_amount, 'DEBIT',
                'PUR/OFC/' || to_char(v_period_start, 'YYYYMM'),
                'Office supplies & stationery',
                'OfficeMax Wholesale',
                v_match_status,
                'BNK' || to_char(v_txn_date, 'YYYYMMDD') || '0014');

            -- Line 15: IT services
            v_line_no := 15;
            v_amount := round(v_base_balance * 0.018, 2);
            v_txn_date := v_period_start + 20;
            PERFORM pg_temp.upsert_bsl(v_tenant, v_stmt_id, v_line_no,
                v_txn_date, v_txn_date,
                v_amount, 'DEBIT',
                'IT/SVC/' || to_char(v_period_start, 'YYYYMM'),
                'Cloud hosting & SaaS subscriptions',
                'CloudScale Technologies',
                v_match_status,
                'BNK' || to_char(v_txn_date, 'YYYYMMDD') || '0015');

            -- Line 16: Interest income
            v_line_no := 16;
            v_amount := round(v_base_balance * 0.003, 2);
            v_txn_date := v_period_end - 3;
            PERFORM pg_temp.upsert_bsl(v_tenant, v_stmt_id, v_line_no,
                v_txn_date, v_txn_date,
                v_amount, 'CREDIT',
                'INT/' || to_char(v_period_start, 'YYYYMM'),
                'Bank interest earned — ' || to_char(v_period_start, 'Mon YYYY'),
                v_bank_name,
                v_match_status,
                'BNK' || to_char(v_txn_date, 'YYYYMMDD') || '0016');

            -- Line 17: Miscellaneous credit
            v_line_no := 17;
            v_amount := round(v_base_balance * 0.05, 2);
            v_txn_date := v_period_end - 2;
            PERFORM pg_temp.upsert_bsl(v_tenant, v_stmt_id, v_line_no,
                v_txn_date, v_txn_date + 1,
                v_amount, 'CREDIT',
                'MISC/CR/' || to_char(v_period_start, 'YYYYMM'),
                'Commission income received',
                'Meridian Partners Group',
                v_match_status,
                'BNK' || to_char(v_txn_date, 'YYYYMMDD') || '0017');

            -- Line 18: Miscellaneous debit
            v_line_no := 18;
            v_amount := round(v_base_balance * 0.012, 2);
            v_txn_date := v_period_end - 1;
            PERFORM pg_temp.upsert_bsl(v_tenant, v_stmt_id, v_line_no,
                v_txn_date, v_txn_date,
                v_amount, 'DEBIT',
                'MISC/DR/' || to_char(v_period_start, 'YYYYMM'),
                'Bank charges & transaction fees',
                v_bank_name,
                v_match_status,
                'BNK' || to_char(v_txn_date, 'YYYYMMDD') || '0018');

            -- ============================================================
            -- Create reconciliation session for COMPLETED/IN_PROGRESS
            -- ============================================================
            IF v_status = 'COMPLETED' THEN
                PERFORM pg_temp.upsert_recon(
                    v_tenant, v_stmt_id, 'COMPLETED',
                    v_line_count,
                    14,       -- auto_matched
                    3,        -- manual_matched
                    0,        -- unmatched
                    1,        -- excluded (bank charges)
                    0.0000    -- no discrepancy
                );
            ELSIF v_status = 'IN_PROGRESS' THEN
                PERFORM pg_temp.upsert_recon(
                    v_tenant, v_stmt_id, 'OPEN',
                    v_line_count,
                    10,       -- auto_matched
                    2,        -- manual_matched
                    5,        -- unmatched
                    1,        -- excluded
                    round(v_base_balance * 0.003, 2)  -- small discrepancy
                );
            END IF;

            -- Next month opening = this month closing
            v_opening := v_closing;
        END LOOP;

        RAISE NOTICE 'Bank statements seeded for tenant % (12 months, 216 lines)', v_code;
    END LOOP;
END $$;
