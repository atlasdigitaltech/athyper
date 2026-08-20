-- ============================================================================
-- 500_journal_entries_comprehensive.sql
-- Comprehensive journal entry seed — Jan 2024 through May 2026
-- ============================================================================
-- Scope   : All 17 active company codes (demo tenant)
-- Coverage: Jan 2024 – May 2026, 10–11 journals per company per month
-- Scenarios per month:
--   JE-01  Sales Revenue — Goods (AR / Revenue)
--   JE-02  AP — Local Supplier (G&A Expense / AP)
--   JE-03  AP — International Supplier (COGS + Freight / AP)
--   JE-04  Retention Invoice (6-month cycle) → Month 7: Retention Release
--   JE-05  Supplier Advance (odd months) / Advance Recovery (even months)
--   JE-06  Invoice with VAT — Input Tax Recoverable
--   JE-07  Invoice with WHT — Net Payment + WHT Payable
--   JE-08  Monthly Salary Payment
--   JE-09  December = Annual Bonus Accrual
--          January  = Annual Bonus Payment (cash net of WHT)
--          Other    = Monthly Depreciation
--   JE-10  Accrued Expense Invoice (posted)
--   JE-10R Reversal of JE-10 (is_reversal = true)
-- Opening : FY2024 Period 0 — 2023 year-end carry-forward balances
-- Lifecycle: All JEs inserted as 'draft'; Section E bulk-advances to 'posted';
--            Section F links reversals (je10 → status='reversed').
-- Idempotent: Yes — ON CONFLICT DO NOTHING on all inserts
-- Depends : 199_gl_preseed, 201_company_chart_assignments,
--           211_framework_ifrs_accounts, 212_framework_gaap_accounts, 311_ledger_books,
--           310_fiscal_periods (FY2025-2026 already exist; FY2023-2024 created here)
--           313_reopen_fiscal_periods_2024_2026 (opens FY2024 book_period_status)
-- ============================================================================

DO $seed$
DECLARE
    v_tid  uuid;
    v_su   uuid := '00000000-0000-0000-0000-000000000000';

    -- Company loop record
    v_cc   record;

    -- GL Account IDs - resolved per company from the active operating COA
    v_cash_local    uuid;  v_cash_payroll  uuid;
    v_ar_trade      uuid;
    v_oar_advance   uuid;  v_oar_input_tax uuid;
    v_inv_fg        uuid;
    v_dep_bldg      uuid;  v_dep_it        uuid;
    v_ap_trade      uuid;  v_ap_retention  uuid;  v_ap_accrued    uuid;
    v_tax_wht       uuid;
    v_emp_sal_pay   uuid;  v_emp_bonus_pay uuid;  v_emp_eos_pay   uuid;
    v_r_goods       uuid;
    v_e_cogs_mat    uuid;  v_e_cogs_frgt   uuid;
    v_e_hr_sal      uuid;  v_e_hr_eos      uuid;  v_e_hr_bonus    uuid;
    v_e_ga_office   uuid;  v_e_ga_consult  uuid;  v_e_ga_audit    uuid;
    v_e_da_bldg     uuid;  v_e_da_it       uuid;
    v_q_re_open     uuid;  v_q_cap_issued  uuid;
    v_l_accr_gen    uuid;

    -- Fiscal period creation vars
    v_fy       int;
    v_fy_start date;  v_fy_end date;
    v_pnum     int;
    v_pstart   date;  v_pend   date;

    -- Month loop
    v_month_start  date;
    v_posting_date date;
    v_cal_year     int;
    v_cal_month    int;
    v_month_idx    int;

    -- Fiscal period resolved per month
    v_fp_id        uuid;
    v_fp_fy        smallint;
    v_fp_pnum      smallint;

    -- Scaling & cycles
    v_scale      numeric;
    v_ret_cycle  int;

    -- JE identifiers
    v_je_num     text;
    v_je_id      uuid;
    v_je10_id    uuid;
    v_je10_num   text;
    v_je_rev_id  uuid;
    v_je_id_ob   uuid;

    -- Computed amounts
    v_base    numeric(18,4);
    v_exp1    numeric(18,4);  v_exp2    numeric(18,4);
    v_ap1     numeric(18,4);
    v_vat1    numeric(18,4);
    v_wht1    numeric(18,4);  v_cash1   numeric(18,4);
    v_ret1    numeric(18,4);
    v_adv1    numeric(18,4);
    v_sal_g   numeric(18,4);  v_sal_e   numeric(18,4);
    v_sal_t   numeric(18,4);  v_sal_w   numeric(18,4);  v_sal_c  numeric(18,4);
    v_bon     numeric(18,4);
    v_bon_p   numeric(18,4);  v_bon_w   numeric(18,4);  v_bon_c  numeric(18,4);
    v_dep_b   numeric(18,4);  v_dep_i   numeric(18,4);  v_dep_t  numeric(18,4);
    v_acc_exp numeric(18,4);
    v_ob_base numeric(18,4);
    v_missing_accounts text;

BEGIN
    -- ── A: Resolve tenant ────────────────────────────────────────────────────
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper';
    END IF;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[500_je] Tenant athyper not found';
    END IF;

    -- ── B: Build role-to-account map for each company's operating COA ───────
    CREATE TEMP TABLE _acct_role (
        role text PRIMARY KEY,
        ifrs_code text NOT NULL,
        preferred_usgaap_code text,
        group_map text
    ) ON COMMIT DROP;

    INSERT INTO _acct_role (role, ifrs_code, preferred_usgaap_code) VALUES
        ('cash_local',    'IFRS-A-CASH-LOCAL',    'USGAAP-A-CASH-CHECKING'),
        ('cash_payroll',  'IFRS-A-CASH-PAYROLL',  'USGAAP-A-CASH-PAYROLL'),
        ('ar_trade',      'IFRS-A-AR-TRADE',      'USGAAP-A-AR-TRADE'),
        ('oar_advance',   'IFRS-A-OAR-ADVANCE',   'USGAAP-A-OAR-SUPADV'),
        ('oar_input_tax', 'IFRS-A-OAR-INPUT-TAX', 'USGAAP-A-OAR-TAXREC'),
        ('inv_fg',        'IFRS-A-INV-FG',        'USGAAP-A-INV-FG'),
        ('dep_bldg',      'IFRS-A-DEP-BLDG',      'USGAAP-A-DEP-BLDG'),
        ('dep_it',        'IFRS-A-DEP-IT',        'USGAAP-A-DEP-IT'),
        ('ap_trade',      'IFRS-L-AP-TRADE',      'USGAAP-L-AP-TRADE'),
        ('ap_retention',  'IFRS-L-AP-RETENTION',  'USGAAP-L-AP-RETENTION'),
        ('ap_accrued',    'IFRS-L-AP-ACCRUED',    'USGAAP-L-ACCR-AUDIT'),
        ('tax_wht',       'IFRS-L-TAX-WHT',       'USGAAP-L-TAX-WHT'),
        ('emp_sal_pay',   'IFRS-L-EMP-SAL',       'USGAAP-L-PAYROLL-WAGES'),
        ('emp_bonus_pay', 'IFRS-L-EMP-BONUS',     'USGAAP-L-ACCR-BONUS'),
        ('emp_eos_pay',   'IFRS-L-EMP-EOS',       'USGAAP-L-PAYROLL-BEN'),
        ('r_goods',       'IFRS-R-SALES-GOODS',   'USGAAP-R-SALES-DOMESTIC'),
        ('e_cogs_mat',    'IFRS-E-COGS-MAT',      'USGAAP-E-COGS-MAT'),
        ('e_cogs_frgt',   'IFRS-E-COGS-FREIGHT',  'USGAAP-E-COGS-FREIGHT'),
        ('e_hr_sal',      'IFRS-E-HR-SAL',        'USGAAP-E-PAYROLL-WAGE'),
        ('e_hr_eos',      'IFRS-E-HR-EOS',        'USGAAP-E-PAYROLL-BEN'),
        ('e_hr_bonus',    'IFRS-E-HR-BONUS',      'USGAAP-E-PAYROLL-BONUS'),
        ('e_ga_office',   'IFRS-E-GA-OFFICE',     'USGAAP-E-GA-OFFICE'),
        ('e_ga_consult',  'IFRS-E-GA-CONSULT',    'USGAAP-E-GA-CONSULT'),
        ('e_ga_audit',    'IFRS-E-GA-AUDIT',      'USGAAP-E-GA-AUDIT'),
        ('e_da_bldg',     'IFRS-E-DA-BLDG',       'USGAAP-E-DA-BLDG'),
        ('e_da_it',       'IFRS-E-DA-IT',         'USGAAP-E-DA-IT'),
        ('q_re_open',     'IFRS-Q-RE-OPENING',    'USGAAP-Q-RE-OPENING'),
        ('q_cap_issued',  'IFRS-Q-CAP-ISSUED',    'USGAAP-Q-STOCK-COMMON'),
        ('l_accr_gen',    'IFRS-L-ACCR-GEN',      'USGAAP-L-ACCR-GEN');

    UPDATE _acct_role r
    SET group_map = ga.metadata->>'_group_map'
    FROM master.gl_account ga
    JOIN master.chart_of_account coa ON coa.id = ga.chart_of_account_id
    WHERE coa.tenant_id = v_tid
      AND coa.code = 'COA-IFRS'
      AND ga.code = r.ifrs_code;

    SELECT string_agg(role || ':' || ifrs_code, ', ' ORDER BY role)
    INTO v_missing_accounts
    FROM _acct_role
    WHERE group_map IS NULL;

    IF v_missing_accounts IS NOT NULL THEN
        RAISE EXCEPTION '[500_je] IFRS role bridge accounts not resolved - run 211_framework_ifrs_accounts.sql first: %',
            v_missing_accounts;
    END IF;

    CREATE TEMP TABLE _acct (
        company_code_id uuid NOT NULL,
        role text NOT NULL,
        id uuid NOT NULL,
        account_code text NOT NULL,
        PRIMARY KEY (company_code_id, role)
    ) ON COMMIT DROP;

    INSERT INTO _acct (company_code_id, role, id, account_code)
    SELECT DISTINCT ON (cc.id, r.role)
        cc.id,
        r.role,
        ga.id,
        ga.code
    FROM master.company_code cc
    JOIN master.company_code_chart_assignment cca
      ON cca.tenant_id = v_tid
     AND cca.company_code_id = cc.id
     AND cca.assignment_type = 'operating'
     AND cca.status = 'active'
    JOIN master.chart_of_account coa
      ON coa.tenant_id = v_tid
     AND coa.id = cca.chart_of_account_id
    JOIN _acct_role r ON true
    JOIN master.gl_account ga
      ON ga.tenant_id = v_tid
     AND ga.chart_of_account_id = coa.id
     AND ga.is_active = true
     AND ga.node_type = 'posting'
     AND COALESCE((ga.metadata->>'_journal_postable')::boolean, true) = true
     AND (
          ga.code = r.ifrs_code
          OR ga.code = r.preferred_usgaap_code
          OR ga.metadata->>'_group_map' = r.group_map
     )
    WHERE cc.tenant_id = v_tid
      AND cc.status = 'active'
    ORDER BY
        cc.id,
        r.role,
        CASE
            WHEN ga.code = r.ifrs_code THEN 0
            WHEN ga.code = r.preferred_usgaap_code THEN 1
            ELSE 2
        END,
        ga.sort_order,
        ga.code;

    -- ── C: Create FY2023 and FY2024 fiscal periods (hard_close, idempotent) ──
    FOR v_cc IN
        SELECT id, code, fiscal_year_start_month
        FROM master.company_code
        WHERE tenant_id = v_tid AND status = 'active'
        ORDER BY code
    LOOP
        FOR v_fy IN 2023..2024 LOOP
            v_fy_start := make_date(
                CASE WHEN v_cc.fiscal_year_start_month = 1 THEN v_fy ELSE v_fy - 1 END,
                v_cc.fiscal_year_start_month, 1
            );
            v_fy_end := (v_fy_start + interval '12 months' - interval '1 day')::date;

            -- Period 0: opening
            INSERT INTO master.fiscal_period
                (tenant_id, company_code_id, code, name, fiscal_year, period_number,
                 period_type, start_date, end_date, sort_order, status, created_by)
            VALUES (v_tid, v_cc.id,
                    v_cc.code||'-'||v_fy||'-P00', 'FY'||v_fy||' Opening',
                    v_fy, 0, 'opening', v_fy_start, v_fy_start, 0, 'hard_close', v_su)
            ON CONFLICT (tenant_id, company_code_id, fiscal_year, period_number) DO NOTHING;

            -- Periods 1-12
            FOR v_pnum IN 1..12 LOOP
                v_pstart := (v_fy_start + (v_pnum - 1) * interval '1 month')::date;
                v_pend   := (v_pstart + interval '1 month' - interval '1 day')::date;
                INSERT INTO master.fiscal_period
                    (tenant_id, company_code_id, code, name, fiscal_year, period_number,
                     period_type, start_date, end_date, sort_order, status, created_by)
                VALUES (v_tid, v_cc.id,
                        v_cc.code||'-'||v_fy||'-P'||lpad(v_pnum::text, 2, '0'),
                        'FY'||v_fy||' P'||v_pnum,
                        v_fy, v_pnum, 'normal', v_pstart, v_pend, v_pnum, 'hard_close', v_su)
                ON CONFLICT (tenant_id, company_code_id, fiscal_year, period_number) DO NOTHING;
            END LOOP;

            -- Period 13: year-end adjustment
            INSERT INTO master.fiscal_period
                (tenant_id, company_code_id, code, name, fiscal_year, period_number,
                 period_type, start_date, end_date, sort_order, status, created_by)
            VALUES (v_tid, v_cc.id,
                    v_cc.code||'-'||v_fy||'-P13', 'FY'||v_fy||' Adjustment',
                    v_fy, 13, 'adjustment', v_fy_end, v_fy_end, 13, 'hard_close', v_su)
            ON CONFLICT (tenant_id, company_code_id, fiscal_year, period_number) DO NOTHING;
        END LOOP;
    END LOOP;

    -- ── C2: Open FY2024 fiscal periods + seed BPS (idempotent; safe if 313 ran first) ──
    -- Without this the trg_je_period_gate_fn treats hard_close/missing rows as blocked.
    UPDATE master.fiscal_period
    SET    status     = 'open',
           updated_at = now(),
           updated_by = v_su
    WHERE  tenant_id     = v_tid
      AND  fiscal_year   = 2024
      AND  period_number BETWEEN 0 AND 12
      AND  status != 'open';

    FOR v_cc IN
        SELECT ba.company_code_id AS id, ba.book_id
        FROM   master.company_code_book_assignment ba
        JOIN   master.ledger_book lb
               ON lb.id = ba.book_id AND lb.tenant_id = ba.tenant_id
        WHERE  ba.tenant_id = v_tid
          AND  ba.status    = 'active'
          AND  lb.category  = 'statutory'
    LOOP
        FOR v_pnum IN 0..12 LOOP
            INSERT INTO governance.book_period_status
                (tenant_id, company_code_id, book_id,
                 fiscal_year, period_number,
                 status, opened_at, opened_by, created_by, metadata)
            VALUES
                (v_tid, v_cc.id, v_cc.book_id,
                 2024, v_pnum,
                 'open', now(), v_su, v_su, '{}'::jsonb)
            ON CONFLICT (tenant_id, company_code_id, book_id, fiscal_year, period_number)
            DO UPDATE SET
                status     = 'open',
                opened_at  = COALESCE(governance.book_period_status.opened_at, now()),
                updated_at = now(),
                updated_by = v_su;
        END LOOP;
    END LOOP;

    RAISE NOTICE '[500_je] C2: FY2024 fiscal periods opened and book_period_status seeded';

    -- ── D: Main loop — per company ───────────────────────────────────────────
    FOR v_cc IN
        SELECT cc.id, cc.code, cc.functional_currency, cc.fiscal_year_start_month,
               lb.id AS book_id
        FROM master.company_code cc
        JOIN master.ledger_book lb
          ON lb.tenant_id = cc.tenant_id AND lb.code = cc.code || '-BOOK-STAT'
        WHERE cc.tenant_id = v_tid AND cc.status = 'active'
        ORDER BY cc.code
    LOOP

        SELECT id INTO v_cash_local    FROM _acct WHERE company_code_id = v_cc.id AND role = 'cash_local';
        SELECT id INTO v_cash_payroll  FROM _acct WHERE company_code_id = v_cc.id AND role = 'cash_payroll';
        SELECT id INTO v_ar_trade      FROM _acct WHERE company_code_id = v_cc.id AND role = 'ar_trade';
        SELECT id INTO v_oar_advance   FROM _acct WHERE company_code_id = v_cc.id AND role = 'oar_advance';
        SELECT id INTO v_oar_input_tax FROM _acct WHERE company_code_id = v_cc.id AND role = 'oar_input_tax';
        SELECT id INTO v_inv_fg        FROM _acct WHERE company_code_id = v_cc.id AND role = 'inv_fg';
        SELECT id INTO v_dep_bldg      FROM _acct WHERE company_code_id = v_cc.id AND role = 'dep_bldg';
        SELECT id INTO v_dep_it        FROM _acct WHERE company_code_id = v_cc.id AND role = 'dep_it';
        SELECT id INTO v_ap_trade      FROM _acct WHERE company_code_id = v_cc.id AND role = 'ap_trade';
        SELECT id INTO v_ap_retention  FROM _acct WHERE company_code_id = v_cc.id AND role = 'ap_retention';
        SELECT id INTO v_ap_accrued    FROM _acct WHERE company_code_id = v_cc.id AND role = 'ap_accrued';
        SELECT id INTO v_tax_wht       FROM _acct WHERE company_code_id = v_cc.id AND role = 'tax_wht';
        SELECT id INTO v_emp_sal_pay   FROM _acct WHERE company_code_id = v_cc.id AND role = 'emp_sal_pay';
        SELECT id INTO v_emp_bonus_pay FROM _acct WHERE company_code_id = v_cc.id AND role = 'emp_bonus_pay';
        SELECT id INTO v_emp_eos_pay   FROM _acct WHERE company_code_id = v_cc.id AND role = 'emp_eos_pay';
        SELECT id INTO v_r_goods       FROM _acct WHERE company_code_id = v_cc.id AND role = 'r_goods';
        SELECT id INTO v_e_cogs_mat    FROM _acct WHERE company_code_id = v_cc.id AND role = 'e_cogs_mat';
        SELECT id INTO v_e_cogs_frgt   FROM _acct WHERE company_code_id = v_cc.id AND role = 'e_cogs_frgt';
        SELECT id INTO v_e_hr_sal      FROM _acct WHERE company_code_id = v_cc.id AND role = 'e_hr_sal';
        SELECT id INTO v_e_hr_eos      FROM _acct WHERE company_code_id = v_cc.id AND role = 'e_hr_eos';
        SELECT id INTO v_e_hr_bonus    FROM _acct WHERE company_code_id = v_cc.id AND role = 'e_hr_bonus';
        SELECT id INTO v_e_ga_office   FROM _acct WHERE company_code_id = v_cc.id AND role = 'e_ga_office';
        SELECT id INTO v_e_ga_consult  FROM _acct WHERE company_code_id = v_cc.id AND role = 'e_ga_consult';
        SELECT id INTO v_e_ga_audit    FROM _acct WHERE company_code_id = v_cc.id AND role = 'e_ga_audit';
        SELECT id INTO v_e_da_bldg     FROM _acct WHERE company_code_id = v_cc.id AND role = 'e_da_bldg';
        SELECT id INTO v_e_da_it       FROM _acct WHERE company_code_id = v_cc.id AND role = 'e_da_it';
        SELECT id INTO v_q_re_open     FROM _acct WHERE company_code_id = v_cc.id AND role = 'q_re_open';
        SELECT id INTO v_q_cap_issued  FROM _acct WHERE company_code_id = v_cc.id AND role = 'q_cap_issued';
        SELECT id INTO v_l_accr_gen    FROM _acct WHERE company_code_id = v_cc.id AND role = 'l_accr_gen';

        SELECT string_agg(r.role, ', ' ORDER BY r.role)
        INTO v_missing_accounts
        FROM _acct_role r
        LEFT JOIN _acct a
          ON a.company_code_id = v_cc.id
         AND a.role = r.role
        WHERE a.id IS NULL;

        IF v_missing_accounts IS NOT NULL THEN
            RAISE EXCEPTION '[500_je] Missing postable operating GL accounts for company %: %',
                v_cc.code, v_missing_accounts;
        END IF;

        -- Amount scale: reflects relative company size / currency magnitude
        v_scale := CASE v_cc.code
            WHEN 'ATHQ' THEN 5.0
            WHEN 'AUIC' THEN 3.0
            WHEN 'ASGF' THEN 2.5
            WHEN 'ADPM' THEN 2.0
            WHEN 'ACFB' THEN 1.8
            WHEN 'ATEM' THEN 1.5
            WHEN 'AJED' THEN 400.0  -- JPY nominal scale
            ELSE 1.0
        END::numeric;

        v_ret_cycle := 1;

        -- ════════════════════════════════════════════════════════════════════
        -- D1: Opening Balance — FY2024 Period 0 (2023 year-end carry-forward)
        -- ════════════════════════════════════════════════════════════════════
        SELECT id, fiscal_year::smallint, period_number::smallint
        INTO v_fp_id, v_fp_fy, v_fp_pnum
        FROM master.fiscal_period
        WHERE tenant_id = v_tid AND company_code_id = v_cc.id
          AND fiscal_year = 2024 AND period_number = 0;

        IF v_fp_id IS NOT NULL THEN
            v_ob_base := round(1000000.0 * v_scale, 4);
            v_je10_num := 'JE-'||v_cc.code||'-2024-00-OB';

            -- Asset debits:   cash 0.50 + AR 0.30 + INV 0.20 + advance 0.05 + input_tax 0.08 = 1.13
            -- Credit side:    dep_bldg 0.13 + AP 0.25 + accruals 0.10 + capital 0.50 + RE 0.15 = 1.13
            INSERT INTO document.journal_entry (
                id, tenant_id, company_code_id, book_id, fiscal_period_id,
                fiscal_year, period_number, code, name, je_number,
                document_date, posting_date, source_doc_type,
                transaction_currency, base_currency,
                total_debit, total_credit, line_count,
                description, status, created_by, updated_by
            ) VALUES (
                shared.uuidv7(), v_tid, v_cc.id, v_cc.book_id, v_fp_id,
                2024, 0, v_je10_num, '2023 Year-End Opening Balance', v_je10_num,
                '2024-01-01', '2024-01-01', 'opening_balance',
                v_cc.functional_currency, v_cc.functional_currency,
                round(v_ob_base * 1.13, 4), round(v_ob_base * 1.13, 4), 10,
                'Opening balance carry-forward — 2023 year-end close',
                'draft', v_su, v_su
            ) ON CONFLICT (tenant_id, company_code_id, je_number) DO NOTHING;

            SELECT id INTO v_je_id_ob
            FROM document.journal_entry
            WHERE tenant_id = v_tid AND company_code_id = v_cc.id AND je_number = v_je10_num
              AND status = 'draft';

            IF v_je_id_ob IS NOT NULL THEN
                INSERT INTO document.journal_line (
                    id, tenant_id, journal_entry_id, company_code_id, book_id,
                    fiscal_period_id, fiscal_year, period_number, posting_date, line_no,
                    gl_account_id, transaction_currency,
                    transaction_debit, transaction_credit,
                    base_currency, base_debit, base_credit, exchange_rate,
                    description, created_by
                ) VALUES
                -- DEBIT: assets
                (shared.uuidv7(), v_tid, v_je_id_ob, v_cc.id, v_cc.book_id,
                 v_fp_id, 2024, 0, '2024-01-01', 1,
                 v_cash_local, v_cc.functional_currency,
                 round(v_ob_base*0.50,4), 0, v_cc.functional_currency,
                 round(v_ob_base*0.50,4), 0, 1.0,
                 'OB: Cash & bank accounts', v_su),
                (shared.uuidv7(), v_tid, v_je_id_ob, v_cc.id, v_cc.book_id,
                 v_fp_id, 2024, 0, '2024-01-01', 2,
                 v_ar_trade, v_cc.functional_currency,
                 round(v_ob_base*0.30,4), 0, v_cc.functional_currency,
                 round(v_ob_base*0.30,4), 0, 1.0,
                 'OB: Trade receivables', v_su),
                (shared.uuidv7(), v_tid, v_je_id_ob, v_cc.id, v_cc.book_id,
                 v_fp_id, 2024, 0, '2024-01-01', 3,
                 v_inv_fg, v_cc.functional_currency,
                 round(v_ob_base*0.20,4), 0, v_cc.functional_currency,
                 round(v_ob_base*0.20,4), 0, 1.0,
                 'OB: Finished goods inventory', v_su),
                (shared.uuidv7(), v_tid, v_je_id_ob, v_cc.id, v_cc.book_id,
                 v_fp_id, 2024, 0, '2024-01-01', 4,
                 v_oar_advance, v_cc.functional_currency,
                 round(v_ob_base*0.05,4), 0, v_cc.functional_currency,
                 round(v_ob_base*0.05,4), 0, 1.0,
                 'OB: Prepaid & advances to suppliers', v_su),
                (shared.uuidv7(), v_tid, v_je_id_ob, v_cc.id, v_cc.book_id,
                 v_fp_id, 2024, 0, '2024-01-01', 5,
                 v_oar_input_tax, v_cc.functional_currency,
                 round(v_ob_base*0.08,4), 0, v_cc.functional_currency,
                 round(v_ob_base*0.08,4), 0, 1.0,
                 'OB: Input tax recoverable', v_su),
                -- CREDIT: contra-asset, liabilities, equity
                (shared.uuidv7(), v_tid, v_je_id_ob, v_cc.id, v_cc.book_id,
                 v_fp_id, 2024, 0, '2024-01-01', 6,
                 v_dep_bldg, v_cc.functional_currency,
                 0, round(v_ob_base*0.13,4), v_cc.functional_currency,
                 0, round(v_ob_base*0.13,4), 1.0,
                 'OB: Accumulated depreciation — buildings', v_su),
                (shared.uuidv7(), v_tid, v_je_id_ob, v_cc.id, v_cc.book_id,
                 v_fp_id, 2024, 0, '2024-01-01', 7,
                 v_ap_trade, v_cc.functional_currency,
                 0, round(v_ob_base*0.25,4), v_cc.functional_currency,
                 0, round(v_ob_base*0.25,4), 1.0,
                 'OB: Trade payables', v_su),
                (shared.uuidv7(), v_tid, v_je_id_ob, v_cc.id, v_cc.book_id,
                 v_fp_id, 2024, 0, '2024-01-01', 8,
                 v_l_accr_gen, v_cc.functional_currency,
                 0, round(v_ob_base*0.10,4), v_cc.functional_currency,
                 0, round(v_ob_base*0.10,4), 1.0,
                 'OB: General accruals & provisions', v_su),
                (shared.uuidv7(), v_tid, v_je_id_ob, v_cc.id, v_cc.book_id,
                 v_fp_id, 2024, 0, '2024-01-01', 9,
                 v_q_cap_issued, v_cc.functional_currency,
                 0, round(v_ob_base*0.50,4), v_cc.functional_currency,
                 0, round(v_ob_base*0.50,4), 1.0,
                 'OB: Issued share capital', v_su),
                (shared.uuidv7(), v_tid, v_je_id_ob, v_cc.id, v_cc.book_id,
                 v_fp_id, 2024, 0, '2024-01-01', 10,
                 v_q_re_open, v_cc.functional_currency,
                 0, round(v_ob_base*0.15,4), v_cc.functional_currency,
                 0, round(v_ob_base*0.15,4), 1.0,
                 'OB: Retained earnings — opening', v_su)
                ON CONFLICT DO NOTHING;
            END IF;
        END IF;

        -- ════════════════════════════════════════════════════════════════════
        -- D2: Monthly journals — Jan 2024 through May 2026
        -- ════════════════════════════════════════════════════════════════════
        v_month_idx := 0;

        FOR v_month_start IN
            SELECT d::date
            FROM generate_series(
                '2024-01-01'::date,
                '2026-05-01'::date,
                '1 month'::interval
            ) AS d
        LOOP
            v_month_idx    := v_month_idx + 1;
            v_cal_year     := EXTRACT(year  FROM v_month_start)::int;
            v_cal_month    := EXTRACT(month FROM v_month_start)::int;
            v_posting_date := v_month_start + 14;  -- post on the 15th

            -- Resolve the fiscal period that contains this posting date
            SELECT id, fiscal_year::smallint, period_number::smallint
            INTO v_fp_id, v_fp_fy, v_fp_pnum
            FROM master.fiscal_period
            WHERE tenant_id = v_tid AND company_code_id = v_cc.id
              AND v_posting_date BETWEEN start_date AND end_date
              AND period_type = 'normal'
            LIMIT 1;

            CONTINUE WHEN v_fp_id IS NULL;

            -- Skip month if JEs are already posted — makes re-runs safe (idempotent guard)
            CONTINUE WHEN EXISTS (
                SELECT 1 FROM document.journal_entry
                WHERE tenant_id       = v_tid
                  AND company_code_id = v_cc.id
                  AND je_number LIKE 'JE-'||v_cc.code||'-'||v_cal_year||'-'||lpad(v_cal_month::text,2,'0')||'-%'
                  AND status IN ('posted', 'reversed')
            );

            -- Base amount grows modestly month-over-month
            v_base      := round((50000.0 + v_month_idx * 500.0) * v_scale, 4);
            v_ret_cycle := ((v_month_idx - 1) % 7) + 1;

            -- ── JE-01: Sales Revenue — Goods ─────────────────────────────────
            -- AR Dr v_base / Revenue Cr v_base
            v_je_num := 'JE-'||v_cc.code||'-'||v_cal_year||'-'||lpad(v_cal_month::text,2,'0')||'-01';

            INSERT INTO document.journal_entry (
                id, tenant_id, company_code_id, book_id, fiscal_period_id,
                fiscal_year, period_number, code, name, je_number,
                document_date, posting_date, source_doc_type,
                transaction_currency, base_currency,
                total_debit, total_credit, line_count,
                description, status, created_by, updated_by
            ) VALUES (
                shared.uuidv7(), v_tid, v_cc.id, v_cc.book_id, v_fp_id,
                v_fp_fy, v_fp_pnum, v_je_num,
                'Sales Revenue — Goods '||to_char(v_month_start, 'Mon YYYY'), v_je_num,
                v_posting_date, v_posting_date, 'sales_invoice',
                v_cc.functional_currency, v_cc.functional_currency,
                v_base, v_base, 2,
                'Monthly goods sales — trade receivable recognised ('||to_char(v_month_start,'Mon YYYY')||')',
                'draft', v_su, v_su
            ) ON CONFLICT (tenant_id, company_code_id, je_number) DO NOTHING;

            SELECT id INTO v_je_id FROM document.journal_entry
            WHERE tenant_id = v_tid AND company_code_id = v_cc.id AND je_number = v_je_num;

            INSERT INTO document.journal_line (
                id, tenant_id, journal_entry_id, company_code_id, book_id,
                fiscal_period_id, fiscal_year, period_number, posting_date, line_no,
                gl_account_id, transaction_currency,
                transaction_debit, transaction_credit,
                base_currency, base_debit, base_credit, exchange_rate,
                subledger_type, description, created_by
            ) VALUES
            (shared.uuidv7(), v_tid, v_je_id, v_cc.id, v_cc.book_id,
             v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 1,
             v_ar_trade, v_cc.functional_currency, v_base, 0,
             v_cc.functional_currency, v_base, 0, 1.0,
             'ar', 'Trade receivable — goods sale', v_su),
            (shared.uuidv7(), v_tid, v_je_id, v_cc.id, v_cc.book_id,
             v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 2,
             v_r_goods, v_cc.functional_currency, 0, v_base,
             v_cc.functional_currency, 0, v_base, 1.0,
             NULL, 'Revenue — sale of goods', v_su)
            ON CONFLICT DO NOTHING;

            -- ── JE-02: Payable — Local Supplier ──────────────────────────────
            -- Office expense Dr v_exp1 / AP (local) Cr v_exp1
            v_exp1   := round(v_base * 0.40, 4);
            v_je_num := 'JE-'||v_cc.code||'-'||v_cal_year||'-'||lpad(v_cal_month::text,2,'0')||'-02';

            INSERT INTO document.journal_entry (
                id, tenant_id, company_code_id, book_id, fiscal_period_id,
                fiscal_year, period_number, code, name, je_number,
                document_date, posting_date, source_doc_type,
                transaction_currency, base_currency,
                total_debit, total_credit, line_count,
                description, status, created_by, updated_by
            ) VALUES (
                shared.uuidv7(), v_tid, v_cc.id, v_cc.book_id, v_fp_id,
                v_fp_fy, v_fp_pnum, v_je_num,
                'AP — Local Supplier '||to_char(v_month_start,'Mon YYYY'), v_je_num,
                v_posting_date, v_posting_date, 'purchase_invoice',
                v_cc.functional_currency, v_cc.functional_currency,
                v_exp1, v_exp1, 2,
                'Local supplier invoice — office & admin expenses',
                'draft', v_su, v_su
            ) ON CONFLICT (tenant_id, company_code_id, je_number) DO NOTHING;

            SELECT id INTO v_je_id FROM document.journal_entry
            WHERE tenant_id = v_tid AND company_code_id = v_cc.id AND je_number = v_je_num;

            INSERT INTO document.journal_line (
                id, tenant_id, journal_entry_id, company_code_id, book_id,
                fiscal_period_id, fiscal_year, period_number, posting_date, line_no,
                gl_account_id, transaction_currency,
                transaction_debit, transaction_credit,
                base_currency, base_debit, base_credit, exchange_rate,
                subledger_type, description, created_by
            ) VALUES
            (shared.uuidv7(), v_tid, v_je_id, v_cc.id, v_cc.book_id,
             v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 1,
             v_e_ga_office, v_cc.functional_currency, v_exp1, 0,
             v_cc.functional_currency, v_exp1, 0, 1.0,
             NULL, 'Office & admin supplies — local supplier', v_su),
            (shared.uuidv7(), v_tid, v_je_id, v_cc.id, v_cc.book_id,
             v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 2,
             v_ap_trade, v_cc.functional_currency, 0, v_exp1,
             v_cc.functional_currency, 0, v_exp1, 1.0,
             'ap', 'AP — local supplier payable', v_su)
            ON CONFLICT DO NOTHING;

            -- ── JE-03: Payable — International Supplier ───────────────────────
            -- Materials 80% + Freight 20% = v_exp2 / AP Cr v_exp2
            v_exp2   := round(v_base * 0.65, 4);
            v_je_num := 'JE-'||v_cc.code||'-'||v_cal_year||'-'||lpad(v_cal_month::text,2,'0')||'-03';

            INSERT INTO document.journal_entry (
                id, tenant_id, company_code_id, book_id, fiscal_period_id,
                fiscal_year, period_number, code, name, je_number,
                document_date, posting_date, source_doc_type,
                transaction_currency, base_currency,
                total_debit, total_credit, line_count,
                description, status, created_by, updated_by
            ) VALUES (
                shared.uuidv7(), v_tid, v_cc.id, v_cc.book_id, v_fp_id,
                v_fp_fy, v_fp_pnum, v_je_num,
                'AP — International Supplier '||to_char(v_month_start,'Mon YYYY'), v_je_num,
                v_posting_date, v_posting_date, 'purchase_invoice',
                v_cc.functional_currency, v_cc.functional_currency,
                v_exp2, v_exp2, 3,
                'International supplier invoice — imported materials & freight',
                'draft', v_su, v_su
            ) ON CONFLICT (tenant_id, company_code_id, je_number) DO NOTHING;

            SELECT id INTO v_je_id FROM document.journal_entry
            WHERE tenant_id = v_tid AND company_code_id = v_cc.id AND je_number = v_je_num;

            INSERT INTO document.journal_line (
                id, tenant_id, journal_entry_id, company_code_id, book_id,
                fiscal_period_id, fiscal_year, period_number, posting_date, line_no,
                gl_account_id, transaction_currency,
                transaction_debit, transaction_credit,
                base_currency, base_debit, base_credit, exchange_rate,
                subledger_type, description, created_by
            ) VALUES
            (shared.uuidv7(), v_tid, v_je_id, v_cc.id, v_cc.book_id,
             v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 1,
             v_e_cogs_mat, v_cc.functional_currency,
             v_exp2 - round(v_exp2*0.20,4), 0,
             v_cc.functional_currency, v_exp2 - round(v_exp2*0.20,4), 0, 1.0,
             NULL, 'Materials consumed — international purchase', v_su),
            (shared.uuidv7(), v_tid, v_je_id, v_cc.id, v_cc.book_id,
             v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 2,
             v_e_cogs_frgt, v_cc.functional_currency,
             round(v_exp2*0.20,4), 0,
             v_cc.functional_currency, round(v_exp2*0.20,4), 0, 1.0,
             NULL, 'Freight & import duties — international supplier', v_su),
            (shared.uuidv7(), v_tid, v_je_id, v_cc.id, v_cc.book_id,
             v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 3,
             v_ap_trade, v_cc.functional_currency, 0, v_exp2,
             v_cc.functional_currency, 0, v_exp2, 1.0,
             'ap', 'AP — international supplier payable', v_su)
            ON CONFLICT DO NOTHING;

            -- ── JE-04: Retention Invoice (6-month cycle) / Release (month 7) ──
            -- Cycle 1-6: COGS Dr v_base / AP Cr (v_base - v_ret1) / AP-Retention Cr v_ret1
            -- Cycle 7  : AP-Retention Dr 60% / AP Cr 60%  (release 6 months accumulated)
            v_ret1   := round(v_base * 0.10, 4);
            v_je_num := 'JE-'||v_cc.code||'-'||v_cal_year||'-'||lpad(v_cal_month::text,2,'0')||'-04';

            IF v_ret_cycle <= 6 THEN
                INSERT INTO document.journal_entry (
                    id, tenant_id, company_code_id, book_id, fiscal_period_id,
                    fiscal_year, period_number, code, name, je_number,
                    document_date, posting_date, source_doc_type,
                    transaction_currency, base_currency,
                    total_debit, total_credit, line_count,
                    description, status, created_by, updated_by
                ) VALUES (
                    shared.uuidv7(), v_tid, v_cc.id, v_cc.book_id, v_fp_id,
                    v_fp_fy, v_fp_pnum, v_je_num,
                    'Retention Invoice '||v_ret_cycle||'/6 — '||to_char(v_month_start,'Mon YYYY'), v_je_num,
                    v_posting_date, v_posting_date, 'purchase_invoice',
                    v_cc.functional_currency, v_cc.functional_currency,
                    v_base, v_base, 3,
                    'Subcontractor progress claim '||v_ret_cycle||' of 6 — 10% retention withheld',
                    'draft', v_su, v_su
                ) ON CONFLICT (tenant_id, company_code_id, je_number) DO NOTHING;

                SELECT id INTO v_je_id FROM document.journal_entry
                WHERE tenant_id = v_tid AND company_code_id = v_cc.id AND je_number = v_je_num;

                INSERT INTO document.journal_line (
                    id, tenant_id, journal_entry_id, company_code_id, book_id,
                    fiscal_period_id, fiscal_year, period_number, posting_date, line_no,
                    gl_account_id, transaction_currency,
                    transaction_debit, transaction_credit,
                    base_currency, base_debit, base_credit, exchange_rate,
                    subledger_type, description, created_by
                ) VALUES
                (shared.uuidv7(), v_tid, v_je_id, v_cc.id, v_cc.book_id,
                 v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 1,
                 v_e_cogs_mat, v_cc.functional_currency, v_base, 0,
                 v_cc.functional_currency, v_base, 0, 1.0,
                 NULL, 'Subcontract cost — progress claim '||v_ret_cycle, v_su),
                (shared.uuidv7(), v_tid, v_je_id, v_cc.id, v_cc.book_id,
                 v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 2,
                 v_ap_trade, v_cc.functional_currency, 0, v_base - v_ret1,
                 v_cc.functional_currency, 0, v_base - v_ret1, 1.0,
                 'ap', 'AP — net payable (gross less 10% retention)', v_su),
                (shared.uuidv7(), v_tid, v_je_id, v_cc.id, v_cc.book_id,
                 v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 3,
                 v_ap_retention, v_cc.functional_currency, 0, v_ret1,
                 v_cc.functional_currency, 0, v_ret1, 1.0,
                 NULL, 'Retention payable withheld — 10%', v_su)
                ON CONFLICT DO NOTHING;

            ELSE
                -- Cycle 7: Release accumulated 6-month retention to AP
                INSERT INTO document.journal_entry (
                    id, tenant_id, company_code_id, book_id, fiscal_period_id,
                    fiscal_year, period_number, code, name, je_number,
                    document_date, posting_date, source_doc_type,
                    transaction_currency, base_currency,
                    total_debit, total_credit, line_count,
                    description, status, created_by, updated_by
                ) VALUES (
                    shared.uuidv7(), v_tid, v_cc.id, v_cc.book_id, v_fp_id,
                    v_fp_fy, v_fp_pnum, v_je_num,
                    'Retention Release — '||to_char(v_month_start,'Mon YYYY'), v_je_num,
                    v_posting_date, v_posting_date, 'purchase_invoice',
                    v_cc.functional_currency, v_cc.functional_currency,
                    round(v_base*0.60,4), round(v_base*0.60,4), 2,
                    'Retention release — accumulated 6-month retention payable to subcontractor',
                    'draft', v_su, v_su
                ) ON CONFLICT (tenant_id, company_code_id, je_number) DO NOTHING;

                SELECT id INTO v_je_id FROM document.journal_entry
                WHERE tenant_id = v_tid AND company_code_id = v_cc.id AND je_number = v_je_num;

                INSERT INTO document.journal_line (
                    id, tenant_id, journal_entry_id, company_code_id, book_id,
                    fiscal_period_id, fiscal_year, period_number, posting_date, line_no,
                    gl_account_id, transaction_currency,
                    transaction_debit, transaction_credit,
                    base_currency, base_debit, base_credit, exchange_rate,
                    subledger_type, description, created_by
                ) VALUES
                (shared.uuidv7(), v_tid, v_je_id, v_cc.id, v_cc.book_id,
                 v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 1,
                 v_ap_retention, v_cc.functional_currency, round(v_base*0.60,4), 0,
                 v_cc.functional_currency, round(v_base*0.60,4), 0, 1.0,
                 NULL, 'Release: 6-month accumulated retention', v_su),
                (shared.uuidv7(), v_tid, v_je_id, v_cc.id, v_cc.book_id,
                 v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 2,
                 v_ap_trade, v_cc.functional_currency, 0, round(v_base*0.60,4),
                 v_cc.functional_currency, 0, round(v_base*0.60,4), 1.0,
                 'ap', 'AP — retention released, now payable to subcontractor', v_su)
                ON CONFLICT DO NOTHING;
            END IF;

            -- ── JE-05: Supplier Advance (odd) / Advance Recovery (even) ────────
            v_adv1   := round(v_base * 0.50, 4);
            v_je_num := 'JE-'||v_cc.code||'-'||v_cal_year||'-'||lpad(v_cal_month::text,2,'0')||'-05';

            IF v_month_idx % 2 = 1 THEN
                -- Odd months: pay advance to supplier
                INSERT INTO document.journal_entry (
                    id, tenant_id, company_code_id, book_id, fiscal_period_id,
                    fiscal_year, period_number, code, name, je_number,
                    document_date, posting_date, source_doc_type,
                    transaction_currency, base_currency,
                    total_debit, total_credit, line_count,
                    description, status, created_by, updated_by
                ) VALUES (
                    shared.uuidv7(), v_tid, v_cc.id, v_cc.book_id, v_fp_id,
                    v_fp_fy, v_fp_pnum, v_je_num,
                    'Advance to Supplier '||to_char(v_month_start,'Mon YYYY'), v_je_num,
                    v_posting_date, v_posting_date, 'advance',
                    v_cc.functional_currency, v_cc.functional_currency,
                    v_adv1, v_adv1, 2,
                    'Advance payment to supplier — recoverable against future invoice',
                    'draft', v_su, v_su
                ) ON CONFLICT (tenant_id, company_code_id, je_number) DO NOTHING;

                SELECT id INTO v_je_id FROM document.journal_entry
                WHERE tenant_id = v_tid AND company_code_id = v_cc.id AND je_number = v_je_num;

                INSERT INTO document.journal_line (
                    id, tenant_id, journal_entry_id, company_code_id, book_id,
                    fiscal_period_id, fiscal_year, period_number, posting_date, line_no,
                    gl_account_id, transaction_currency,
                    transaction_debit, transaction_credit,
                    base_currency, base_debit, base_credit, exchange_rate,
                    subledger_type, description, created_by
                ) VALUES
                (shared.uuidv7(), v_tid, v_je_id, v_cc.id, v_cc.book_id,
                 v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 1,
                 v_oar_advance, v_cc.functional_currency, v_adv1, 0,
                 v_cc.functional_currency, v_adv1, 0, 1.0,
                 NULL, 'Advance to supplier — asset recognised', v_su),
                (shared.uuidv7(), v_tid, v_je_id, v_cc.id, v_cc.book_id,
                 v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 2,
                 v_cash_local, v_cc.functional_currency, 0, v_adv1,
                 v_cc.functional_currency, 0, v_adv1, 1.0,
                 NULL, 'Bank — advance payment disbursed', v_su)
                ON CONFLICT DO NOTHING;

            ELSE
                -- Even months: invoice received, advance recovered
                -- Invoice = adv1 × 1.20; AP net = 20%; advance settled = 100%
                v_exp1 := round(v_adv1 * 1.20, 4);
                v_ap1  := v_exp1 - v_adv1;

                INSERT INTO document.journal_entry (
                    id, tenant_id, company_code_id, book_id, fiscal_period_id,
                    fiscal_year, period_number, code, name, je_number,
                    document_date, posting_date, source_doc_type,
                    transaction_currency, base_currency,
                    total_debit, total_credit, line_count,
                    description, status, created_by, updated_by
                ) VALUES (
                    shared.uuidv7(), v_tid, v_cc.id, v_cc.book_id, v_fp_id,
                    v_fp_fy, v_fp_pnum, v_je_num,
                    'Supplier Invoice + Advance Recovery '||to_char(v_month_start,'Mon YYYY'), v_je_num,
                    v_posting_date, v_posting_date, 'purchase_invoice',
                    v_cc.functional_currency, v_cc.functional_currency,
                    v_exp1, v_exp1, 3,
                    'Invoice received from supplier — prior advance recovered against balance',
                    'draft', v_su, v_su
                ) ON CONFLICT (tenant_id, company_code_id, je_number) DO NOTHING;

                SELECT id INTO v_je_id FROM document.journal_entry
                WHERE tenant_id = v_tid AND company_code_id = v_cc.id AND je_number = v_je_num;

                INSERT INTO document.journal_line (
                    id, tenant_id, journal_entry_id, company_code_id, book_id,
                    fiscal_period_id, fiscal_year, period_number, posting_date, line_no,
                    gl_account_id, transaction_currency,
                    transaction_debit, transaction_credit,
                    base_currency, base_debit, base_credit, exchange_rate,
                    subledger_type, description, created_by
                ) VALUES
                (shared.uuidv7(), v_tid, v_je_id, v_cc.id, v_cc.book_id,
                 v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 1,
                 v_e_cogs_mat, v_cc.functional_currency, v_exp1, 0,
                 v_cc.functional_currency, v_exp1, 0, 1.0,
                 NULL, 'Materials cost — supplier invoice (inclusive of advance)', v_su),
                (shared.uuidv7(), v_tid, v_je_id, v_cc.id, v_cc.book_id,
                 v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 2,
                 v_ap_trade, v_cc.functional_currency, 0, v_ap1,
                 v_cc.functional_currency, 0, v_ap1, 1.0,
                 'ap', 'AP — net balance payable after advance recovery', v_su),
                (shared.uuidv7(), v_tid, v_je_id, v_cc.id, v_cc.book_id,
                 v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 3,
                 v_oar_advance, v_cc.functional_currency, 0, v_adv1,
                 v_cc.functional_currency, 0, v_adv1, 1.0,
                 NULL, 'Advance recovered — asset derecognised', v_su)
                ON CONFLICT DO NOTHING;
            END IF;

            -- ── JE-06: Invoice with VAT (Input Tax Recoverable) ───────────────
            -- Expense Dr + Input Tax Dr / AP Cr (gross incl. VAT)
            v_exp1   := round(v_base * 0.55, 4);
            v_vat1   := round(v_exp1 * 0.10, 4);
            v_ap1    := v_exp1 + v_vat1;
            v_je_num := 'JE-'||v_cc.code||'-'||v_cal_year||'-'||lpad(v_cal_month::text,2,'0')||'-06';

            INSERT INTO document.journal_entry (
                id, tenant_id, company_code_id, book_id, fiscal_period_id,
                fiscal_year, period_number, code, name, je_number,
                document_date, posting_date, source_doc_type,
                transaction_currency, base_currency,
                total_debit, total_credit, line_count,
                description, status, created_by, updated_by
            ) VALUES (
                shared.uuidv7(), v_tid, v_cc.id, v_cc.book_id, v_fp_id,
                v_fp_fy, v_fp_pnum, v_je_num,
                'Invoice with VAT — '||to_char(v_month_start,'Mon YYYY'), v_je_num,
                v_posting_date, v_posting_date, 'purchase_invoice',
                v_cc.functional_currency, v_cc.functional_currency,
                v_ap1, v_ap1, 3,
                'Supplier invoice with 10% VAT — input tax recoverable',
                'draft', v_su, v_su
            ) ON CONFLICT (tenant_id, company_code_id, je_number) DO NOTHING;

            SELECT id INTO v_je_id FROM document.journal_entry
            WHERE tenant_id = v_tid AND company_code_id = v_cc.id AND je_number = v_je_num;

            INSERT INTO document.journal_line (
                id, tenant_id, journal_entry_id, company_code_id, book_id,
                fiscal_period_id, fiscal_year, period_number, posting_date, line_no,
                gl_account_id, transaction_currency,
                transaction_debit, transaction_credit,
                base_currency, base_debit, base_credit, exchange_rate,
                subledger_type, description, created_by
            ) VALUES
            (shared.uuidv7(), v_tid, v_je_id, v_cc.id, v_cc.book_id,
             v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 1,
             v_e_ga_consult, v_cc.functional_currency, v_exp1, 0,
             v_cc.functional_currency, v_exp1, 0, 1.0,
             NULL, 'Consulting fees — net of VAT', v_su),
            (shared.uuidv7(), v_tid, v_je_id, v_cc.id, v_cc.book_id,
             v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 2,
             v_oar_input_tax, v_cc.functional_currency, v_vat1, 0,
             v_cc.functional_currency, v_vat1, 0, 1.0,
             NULL, 'Input VAT recoverable — 10%', v_su),
            (shared.uuidv7(), v_tid, v_je_id, v_cc.id, v_cc.book_id,
             v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 3,
             v_ap_trade, v_cc.functional_currency, 0, v_ap1,
             v_cc.functional_currency, 0, v_ap1, 1.0,
             'ap', 'AP — gross amount including VAT', v_su)
            ON CONFLICT DO NOTHING;

            -- ── JE-07: Invoice with WHT (Net Payment + WHT Payable) ───────────
            -- Expense Dr / Bank Cr (net) + WHT Payable Cr
            v_exp1   := round(v_base * 0.55, 4);
            v_wht1   := round(v_exp1 * 0.10, 4);
            v_cash1  := v_exp1 - v_wht1;
            v_je_num := 'JE-'||v_cc.code||'-'||v_cal_year||'-'||lpad(v_cal_month::text,2,'0')||'-07';

            INSERT INTO document.journal_entry (
                id, tenant_id, company_code_id, book_id, fiscal_period_id,
                fiscal_year, period_number, code, name, je_number,
                document_date, posting_date, source_doc_type,
                transaction_currency, base_currency,
                total_debit, total_credit, line_count,
                description, status, created_by, updated_by
            ) VALUES (
                shared.uuidv7(), v_tid, v_cc.id, v_cc.book_id, v_fp_id,
                v_fp_fy, v_fp_pnum, v_je_num,
                'Invoice with WHT — '||to_char(v_month_start,'Mon YYYY'), v_je_num,
                v_posting_date, v_posting_date, 'purchase_invoice',
                v_cc.functional_currency, v_cc.functional_currency,
                v_exp1, v_exp1, 3,
                'Contractor payment — 10% withholding tax deducted at source',
                'draft', v_su, v_su
            ) ON CONFLICT (tenant_id, company_code_id, je_number) DO NOTHING;

            SELECT id INTO v_je_id FROM document.journal_entry
            WHERE tenant_id = v_tid AND company_code_id = v_cc.id AND je_number = v_je_num;

            INSERT INTO document.journal_line (
                id, tenant_id, journal_entry_id, company_code_id, book_id,
                fiscal_period_id, fiscal_year, period_number, posting_date, line_no,
                gl_account_id, transaction_currency,
                transaction_debit, transaction_credit,
                base_currency, base_debit, base_credit, exchange_rate,
                subledger_type, description, created_by
            ) VALUES
            (shared.uuidv7(), v_tid, v_je_id, v_cc.id, v_cc.book_id,
             v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 1,
             v_e_ga_consult, v_cc.functional_currency, v_exp1, 0,
             v_cc.functional_currency, v_exp1, 0, 1.0,
             NULL, 'Contractor/professional fees — gross', v_su),
            (shared.uuidv7(), v_tid, v_je_id, v_cc.id, v_cc.book_id,
             v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 2,
             v_cash_local, v_cc.functional_currency, 0, v_cash1,
             v_cc.functional_currency, 0, v_cash1, 1.0,
             NULL, 'Bank — net payment after WHT deduction', v_su),
            (shared.uuidv7(), v_tid, v_je_id, v_cc.id, v_cc.book_id,
             v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 3,
             v_tax_wht, v_cc.functional_currency, 0, v_wht1,
             v_cc.functional_currency, 0, v_wht1, 1.0,
             NULL, 'WHT payable — 10% withheld from contractor', v_su)
            ON CONFLICT DO NOTHING;

            -- ── JE-08: Monthly Salary Payment ─────────────────────────────────
            -- Salary Exp Dr + EOS Dr / Bank Cr (net) + WHT Cr
            v_sal_g  := round(v_base * 0.80, 4);
            v_sal_e  := round(v_sal_g * 0.08, 4);
            v_sal_t  := v_sal_g + v_sal_e;
            v_sal_w  := round(v_sal_t * 0.10, 4);
            v_sal_c  := v_sal_t - v_sal_w;
            v_je_num := 'JE-'||v_cc.code||'-'||v_cal_year||'-'||lpad(v_cal_month::text,2,'0')||'-08';

            INSERT INTO document.journal_entry (
                id, tenant_id, company_code_id, book_id, fiscal_period_id,
                fiscal_year, period_number, code, name, je_number,
                document_date, posting_date, source_doc_type,
                transaction_currency, base_currency,
                total_debit, total_credit, line_count,
                description, status, created_by, updated_by
            ) VALUES (
                shared.uuidv7(), v_tid, v_cc.id, v_cc.book_id, v_fp_id,
                v_fp_fy, v_fp_pnum, v_je_num,
                'Monthly Salary — '||to_char(v_month_start,'Mon YYYY'), v_je_num,
                v_posting_date, v_posting_date, 'payroll',
                v_cc.functional_currency, v_cc.functional_currency,
                v_sal_t, v_sal_t, 4,
                'Monthly payroll — gross salary + EOS accrual, net of income tax WHT',
                'draft', v_su, v_su
            ) ON CONFLICT (tenant_id, company_code_id, je_number) DO NOTHING;

            SELECT id INTO v_je_id FROM document.journal_entry
            WHERE tenant_id = v_tid AND company_code_id = v_cc.id AND je_number = v_je_num;

            INSERT INTO document.journal_line (
                id, tenant_id, journal_entry_id, company_code_id, book_id,
                fiscal_period_id, fiscal_year, period_number, posting_date, line_no,
                gl_account_id, transaction_currency,
                transaction_debit, transaction_credit,
                base_currency, base_debit, base_credit, exchange_rate,
                subledger_type, description, created_by
            ) VALUES
            (shared.uuidv7(), v_tid, v_je_id, v_cc.id, v_cc.book_id,
             v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 1,
             v_e_hr_sal, v_cc.functional_currency, v_sal_g, 0,
             v_cc.functional_currency, v_sal_g, 0, 1.0,
             NULL, 'Salaries & wages — gross', v_su),
            (shared.uuidv7(), v_tid, v_je_id, v_cc.id, v_cc.book_id,
             v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 2,
             v_e_hr_eos, v_cc.functional_currency, v_sal_e, 0,
             v_cc.functional_currency, v_sal_e, 0, 1.0,
             NULL, 'End of service / gratuity accrual — 8%', v_su),
            (shared.uuidv7(), v_tid, v_je_id, v_cc.id, v_cc.book_id,
             v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 3,
             v_cash_payroll, v_cc.functional_currency, 0, v_sal_c,
             v_cc.functional_currency, 0, v_sal_c, 1.0,
             NULL, 'Payroll bank — net salary disbursed', v_su),
            (shared.uuidv7(), v_tid, v_je_id, v_cc.id, v_cc.book_id,
             v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 4,
             v_tax_wht, v_cc.functional_currency, 0, v_sal_w,
             v_cc.functional_currency, 0, v_sal_w, 1.0,
             NULL, 'Income tax WHT — 10% on gross package', v_su)
            ON CONFLICT DO NOTHING;

            -- ── JE-09: Dec=Bonus Accrual | Jan=Bonus Payment | Other=Depr ─────
            v_je_num := 'JE-'||v_cc.code||'-'||v_cal_year||'-'||lpad(v_cal_month::text,2,'0')||'-09';

            IF v_cal_month = 12 THEN
                -- December: Annual Bonus Accrual (250% of month base)
                v_bon := round(v_base * 2.50, 4);

                INSERT INTO document.journal_entry (
                    id, tenant_id, company_code_id, book_id, fiscal_period_id,
                    fiscal_year, period_number, code, name, je_number,
                    document_date, posting_date, source_doc_type,
                    transaction_currency, base_currency,
                    total_debit, total_credit, line_count,
                    description, status, created_by, updated_by
                ) VALUES (
                    shared.uuidv7(), v_tid, v_cc.id, v_cc.book_id, v_fp_id,
                    v_fp_fy, v_fp_pnum, v_je_num,
                    'Annual Bonus Accrual '||v_cal_year, v_je_num,
                    v_posting_date, v_posting_date, 'accrual',
                    v_cc.functional_currency, v_cc.functional_currency,
                    v_bon, v_bon, 2,
                    'Year-end bonus accrual — '||v_cal_year||' performance incentive',
                    'draft', v_su, v_su
                ) ON CONFLICT (tenant_id, company_code_id, je_number) DO NOTHING;

                SELECT id INTO v_je_id FROM document.journal_entry
                WHERE tenant_id = v_tid AND company_code_id = v_cc.id AND je_number = v_je_num;

                INSERT INTO document.journal_line (
                    id, tenant_id, journal_entry_id, company_code_id, book_id,
                    fiscal_period_id, fiscal_year, period_number, posting_date, line_no,
                    gl_account_id, transaction_currency,
                    transaction_debit, transaction_credit,
                    base_currency, base_debit, base_credit, exchange_rate,
                    subledger_type, description, created_by
                ) VALUES
                (shared.uuidv7(), v_tid, v_je_id, v_cc.id, v_cc.book_id,
                 v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 1,
                 v_e_hr_bonus, v_cc.functional_currency, v_bon, 0,
                 v_cc.functional_currency, v_bon, 0, 1.0,
                 NULL, 'Bonuses & incentives expense — annual', v_su),
                (shared.uuidv7(), v_tid, v_je_id, v_cc.id, v_cc.book_id,
                 v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 2,
                 v_emp_bonus_pay, v_cc.functional_currency, 0, v_bon,
                 v_cc.functional_currency, 0, v_bon, 1.0,
                 NULL, 'Bonus liability accrued — payable January', v_su)
                ON CONFLICT DO NOTHING;

            ELSIF v_cal_month = 1 THEN
                -- January: Pay the previous December bonus accrual
                v_bon_p := round((50000.0 + (v_month_idx - 1) * 500.0) * v_scale * 2.50, 4);
                v_bon_w := round(v_bon_p * 0.10, 4);
                v_bon_c := v_bon_p - v_bon_w;

                INSERT INTO document.journal_entry (
                    id, tenant_id, company_code_id, book_id, fiscal_period_id,
                    fiscal_year, period_number, code, name, je_number,
                    document_date, posting_date, source_doc_type,
                    transaction_currency, base_currency,
                    total_debit, total_credit, line_count,
                    description, status, created_by, updated_by
                ) VALUES (
                    shared.uuidv7(), v_tid, v_cc.id, v_cc.book_id, v_fp_id,
                    v_fp_fy, v_fp_pnum, v_je_num,
                    'Annual Bonus Payment '||v_cal_year, v_je_num,
                    v_posting_date, v_posting_date, 'payment_entry',
                    v_cc.functional_currency, v_cc.functional_currency,
                    v_bon_p, v_bon_p, 3,
                    'Annual bonus cash payment — '||(v_cal_year-1)||' accrual settled net of 10% WHT',
                    'draft', v_su, v_su
                ) ON CONFLICT (tenant_id, company_code_id, je_number) DO NOTHING;

                SELECT id INTO v_je_id FROM document.journal_entry
                WHERE tenant_id = v_tid AND company_code_id = v_cc.id AND je_number = v_je_num;

                INSERT INTO document.journal_line (
                    id, tenant_id, journal_entry_id, company_code_id, book_id,
                    fiscal_period_id, fiscal_year, period_number, posting_date, line_no,
                    gl_account_id, transaction_currency,
                    transaction_debit, transaction_credit,
                    base_currency, base_debit, base_credit, exchange_rate,
                    subledger_type, description, created_by
                ) VALUES
                (shared.uuidv7(), v_tid, v_je_id, v_cc.id, v_cc.book_id,
                 v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 1,
                 v_emp_bonus_pay, v_cc.functional_currency, v_bon_p, 0,
                 v_cc.functional_currency, v_bon_p, 0, 1.0,
                 NULL, 'Bonus liability settled — prior year accrual', v_su),
                (shared.uuidv7(), v_tid, v_je_id, v_cc.id, v_cc.book_id,
                 v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 2,
                 v_cash_payroll, v_cc.functional_currency, 0, v_bon_c,
                 v_cc.functional_currency, 0, v_bon_c, 1.0,
                 NULL, 'Payroll bank — net bonus disbursed after WHT', v_su),
                (shared.uuidv7(), v_tid, v_je_id, v_cc.id, v_cc.book_id,
                 v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 3,
                 v_tax_wht, v_cc.functional_currency, 0, v_bon_w,
                 v_cc.functional_currency, 0, v_bon_w, 1.0,
                 NULL, 'WHT on bonus — 10%', v_su)
                ON CONFLICT DO NOTHING;

            ELSE
                -- All other months: Monthly Depreciation
                v_dep_b := round(v_base * 0.05, 4);
                v_dep_i := round(v_base * 0.03, 4);
                v_dep_t := v_dep_b + v_dep_i;

                INSERT INTO document.journal_entry (
                    id, tenant_id, company_code_id, book_id, fiscal_period_id,
                    fiscal_year, period_number, code, name, je_number,
                    document_date, posting_date, source_doc_type,
                    transaction_currency, base_currency,
                    total_debit, total_credit, line_count,
                    description, status, created_by, updated_by
                ) VALUES (
                    shared.uuidv7(), v_tid, v_cc.id, v_cc.book_id, v_fp_id,
                    v_fp_fy, v_fp_pnum, v_je_num,
                    'Monthly Depreciation '||to_char(v_month_start,'Mon YYYY'), v_je_num,
                    v_posting_date, v_posting_date, 'depreciation',
                    v_cc.functional_currency, v_cc.functional_currency,
                    v_dep_t, v_dep_t, 4,
                    'Monthly depreciation charge — buildings and IT equipment',
                    'draft', v_su, v_su
                ) ON CONFLICT (tenant_id, company_code_id, je_number) DO NOTHING;

                SELECT id INTO v_je_id FROM document.journal_entry
                WHERE tenant_id = v_tid AND company_code_id = v_cc.id AND je_number = v_je_num;

                INSERT INTO document.journal_line (
                    id, tenant_id, journal_entry_id, company_code_id, book_id,
                    fiscal_period_id, fiscal_year, period_number, posting_date, line_no,
                    gl_account_id, transaction_currency,
                    transaction_debit, transaction_credit,
                    base_currency, base_debit, base_credit, exchange_rate,
                    subledger_type, description, created_by
                ) VALUES
                (shared.uuidv7(), v_tid, v_je_id, v_cc.id, v_cc.book_id,
                 v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 1,
                 v_e_da_bldg, v_cc.functional_currency, v_dep_b, 0,
                 v_cc.functional_currency, v_dep_b, 0, 1.0,
                 NULL, 'Depreciation charge — buildings', v_su),
                (shared.uuidv7(), v_tid, v_je_id, v_cc.id, v_cc.book_id,
                 v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 2,
                 v_e_da_it, v_cc.functional_currency, v_dep_i, 0,
                 v_cc.functional_currency, v_dep_i, 0, 1.0,
                 NULL, 'Depreciation charge — IT equipment', v_su),
                (shared.uuidv7(), v_tid, v_je_id, v_cc.id, v_cc.book_id,
                 v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 3,
                 v_dep_bldg, v_cc.functional_currency, 0, v_dep_b,
                 v_cc.functional_currency, 0, v_dep_b, 1.0,
                 NULL, 'Accumulated depreciation — buildings', v_su),
                (shared.uuidv7(), v_tid, v_je_id, v_cc.id, v_cc.book_id,
                 v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 4,
                 v_dep_it, v_cc.functional_currency, 0, v_dep_i,
                 v_cc.functional_currency, 0, v_dep_i, 1.0,
                 NULL, 'Accumulated depreciation — IT equipment', v_su)
                ON CONFLICT DO NOTHING;
            END IF;

            -- ── JE-10: Accrued Invoice (will be reversed by JE-10R) ───────────
            -- Audit Fees Dr v_acc_exp / AP-Accrued Cr v_acc_exp
            v_acc_exp  := round(v_base * 0.15, 4);
            v_je10_num := 'JE-'||v_cc.code||'-'||v_cal_year||'-'||lpad(v_cal_month::text,2,'0')||'-10';

            INSERT INTO document.journal_entry (
                id, tenant_id, company_code_id, book_id, fiscal_period_id,
                fiscal_year, period_number, code, name, je_number,
                document_date, posting_date, source_doc_type,
                transaction_currency, base_currency,
                total_debit, total_credit, line_count,
                description, status, created_by, updated_by
            ) VALUES (
                shared.uuidv7(), v_tid, v_cc.id, v_cc.book_id, v_fp_id,
                v_fp_fy, v_fp_pnum, v_je10_num,
                'Accrued Audit Fees '||to_char(v_month_start,'Mon YYYY'), v_je10_num,
                v_posting_date, v_posting_date, 'accrual',
                v_cc.functional_currency, v_cc.functional_currency,
                v_acc_exp, v_acc_exp, 2,
                'Accrued audit & professional fees — to be reversed on invoice receipt',
                'draft', v_su, v_su
            ) ON CONFLICT (tenant_id, company_code_id, je_number) DO NOTHING;

            SELECT id INTO v_je10_id FROM document.journal_entry
            WHERE tenant_id = v_tid AND company_code_id = v_cc.id AND je_number = v_je10_num;

            INSERT INTO document.journal_line (
                id, tenant_id, journal_entry_id, company_code_id, book_id,
                fiscal_period_id, fiscal_year, period_number, posting_date, line_no,
                gl_account_id, transaction_currency,
                transaction_debit, transaction_credit,
                base_currency, base_debit, base_credit, exchange_rate,
                subledger_type, description, created_by
            ) VALUES
            (shared.uuidv7(), v_tid, v_je10_id, v_cc.id, v_cc.book_id,
             v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 1,
             v_e_ga_audit, v_cc.functional_currency, v_acc_exp, 0,
             v_cc.functional_currency, v_acc_exp, 0, 1.0,
             NULL, 'Audit & professional fees — accrual', v_su),
            (shared.uuidv7(), v_tid, v_je10_id, v_cc.id, v_cc.book_id,
             v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date, 2,
             v_ap_accrued, v_cc.functional_currency, 0, v_acc_exp,
             v_cc.functional_currency, 0, v_acc_exp, 1.0,
             NULL, 'Accrued payables — audit fees provision', v_su)
            ON CONFLICT DO NOTHING;

            -- ── JE-10R: Reversal of JE-10 ─────────────────────────────────────
            -- AP-Accrued Dr / Audit Fees Cr (is_reversal = true)
            v_je_num := 'JE-'||v_cc.code||'-'||v_cal_year||'-'||lpad(v_cal_month::text,2,'0')||'-10R';

            INSERT INTO document.journal_entry (
                id, tenant_id, company_code_id, book_id, fiscal_period_id,
                fiscal_year, period_number, code, name, je_number,
                document_date, posting_date, source_doc_type,
                transaction_currency, base_currency,
                total_debit, total_credit, line_count,
                is_reversal, reversal_of_id,
                description, status, created_by, updated_by
            ) VALUES (
                shared.uuidv7(), v_tid, v_cc.id, v_cc.book_id, v_fp_id,
                v_fp_fy, v_fp_pnum, v_je_num,
                'Reversal: Accrued Audit Fees '||to_char(v_month_start,'Mon YYYY'), v_je_num,
                v_posting_date + 1, v_posting_date + 1, 'reversal',
                v_cc.functional_currency, v_cc.functional_currency,
                v_acc_exp, v_acc_exp, 2,
                true, v_je10_id,
                'Reversal of accrued audit fees — actual invoice received',
                'draft', v_su, v_su
            ) ON CONFLICT (tenant_id, company_code_id, je_number) DO NOTHING;

            SELECT id INTO v_je_rev_id FROM document.journal_entry
            WHERE tenant_id = v_tid AND company_code_id = v_cc.id AND je_number = v_je_num;

            INSERT INTO document.journal_line (
                id, tenant_id, journal_entry_id, company_code_id, book_id,
                fiscal_period_id, fiscal_year, period_number, posting_date, line_no,
                gl_account_id, transaction_currency,
                transaction_debit, transaction_credit,
                base_currency, base_debit, base_credit, exchange_rate,
                subledger_type, description, created_by
            ) VALUES
            (shared.uuidv7(), v_tid, v_je_rev_id, v_cc.id, v_cc.book_id,
             v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date + 1, 1,
             v_ap_accrued, v_cc.functional_currency, v_acc_exp, 0,
             v_cc.functional_currency, v_acc_exp, 0, 1.0,
             NULL, 'Reversal: accrued payable cleared', v_su),
            (shared.uuidv7(), v_tid, v_je_rev_id, v_cc.id, v_cc.book_id,
             v_fp_id, v_fp_fy, v_fp_pnum, v_posting_date + 1, 2,
             v_e_ga_audit, v_cc.functional_currency, 0, v_acc_exp,
             v_cc.functional_currency, 0, v_acc_exp, 1.0,
             NULL, 'Reversal: audit fees expense reversed', v_su)
            ON CONFLICT DO NOTHING;

        END LOOP; -- month loop
    END LOOP;    -- company loop

    -- ── E: Bulk-advance all seed JEs: draft → created → posted ───────────────
    -- trg_je_status_transition_guard fires per-row on draft→created to validate
    -- balance (debit = credit from actual lines) and cache totals.
    -- created→posted stamps posted_at / posted_by.
    -- WHERE clause limits to seed JEs only (je_number pattern JE-{CC}-YYYY-...).
    -- ─────────────────────────────────────────────────────────────────────────

    UPDATE document.journal_entry
    SET    status = 'created'
    WHERE  tenant_id  = v_tid
      AND  status     = 'draft'
      AND  je_number  LIKE 'JE-%';

    UPDATE document.journal_entry
    SET    status     = 'posted',
           posted_at  = now(),
           posted_by  = v_su
    WHERE  tenant_id  = v_tid
      AND  status     = 'created'
      AND  je_number  LIKE 'JE-%';

    -- ── F: Link reversals — JE-10 → status='reversed', reversed_by_id=JE-10R ─
    -- The immutability guard allows posted→reversed + reversed_by_id in one UPDATE.
    -- ON the re-run: WHERE status='posted' skips already-reversed JEs.
    -- ─────────────────────────────────────────────────────────────────────────

    UPDATE document.journal_entry orig
    SET    status         = 'reversed',
           reversed_by_id = rev.id
    FROM   document.journal_entry rev
    WHERE  orig.tenant_id     = v_tid
      AND  rev.tenant_id      = v_tid
      AND  rev.reversal_of_id = orig.id
      AND  orig.status        = 'posted'
      AND  rev.status         = 'posted';

    RAISE NOTICE '[500_je] Journal entry seed complete — % companies processed',
        (SELECT count(*) FROM master.company_code WHERE tenant_id = v_tid AND status = 'active');
END;
$seed$;
