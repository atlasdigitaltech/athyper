-- ============================================================================
-- CIRRUSATLANTIC — FISCAL PERIODS (April FY start)
-- ============================================================================
-- File:     310_fiscal_periods.sql
-- Schema:   master.fiscal_period
-- Purpose:  Generate fiscal periods for company CATL.
--           April start: FY2026 = Apr 2025 – Mar 2026,  FY2027 = Apr 2026 – Mar 2027.
--           Period 0: opening balance (FY start day)
--           Periods 1-12: monthly
--           Period 13: year-end adjustment (FY end day)
-- Depends:  200_legal_entities.sql (company code with fiscal_year_start_month=4)
-- Idempotent: Yes — ON CONFLICT DO NOTHING
-- ============================================================================

DO $catl_fp$
DECLARE
    v_tid      uuid;
    v_su       uuid := '00000000-0000-0000-0000-000000000000';
    v_meta     jsonb := '{"_seed": {"pack": "310_catl_fp", "version": "1.0.0"}}'::jsonb;
    v_cc       record;
    v_fy       int;
    v_fy_start date;
    v_fy_end   date;
    v_pstart   date;
    v_pend     date;
    v_pnum     int;
    v_status   text;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'cirrusatlantic';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[310_fiscal_periods] CirrusAtlantic tenant not found'; END IF;

    FOR v_cc IN
        SELECT id, code, name, fiscal_year_start_month
        FROM master.company_code
        WHERE tenant_id = v_tid AND status = 'active'
        ORDER BY code
    LOOP
        FOR v_fy IN 2026..2027 LOOP
            -- FY boundaries: April start → anchor = v_fy - 1
            -- FY2026: Apr 1 2025 – Mar 31 2026
            -- FY2027: Apr 1 2026 – Mar 31 2027
            v_fy_start := make_date(v_fy - 1, v_cc.fiscal_year_start_month, 1);
            v_fy_end   := (v_fy_start + interval '12 months' - interval '1 day')::date;

            -- Both open for dev
            v_status := 'open';

            -- Period 0: opening balance
            INSERT INTO master.fiscal_period
                (tenant_id, company_code_id, code, name,
                 fiscal_year, period_number, period_type,
                 start_date, end_date, sort_order, status, created_by, metadata)
            VALUES
                (v_tid, v_cc.id,
                 v_cc.code || '-' || v_fy || '-P00',
                 'FY' || v_fy || ' Opening Balance',
                 v_fy, 0, 'opening',
                 v_fy_start, v_fy_start, 0,
                 v_status, v_su, v_meta)
            ON CONFLICT (tenant_id, company_code_id, fiscal_year, period_number) DO NOTHING;

            -- Periods 1-12: monthly
            FOR v_pnum IN 1..12 LOOP
                v_pstart := (v_fy_start + ((v_pnum - 1) * interval '1 month'))::date;
                v_pend   := (v_pstart + interval '1 month' - interval '1 day')::date;

                INSERT INTO master.fiscal_period
                    (tenant_id, company_code_id, code, name,
                     fiscal_year, period_number, period_type,
                     start_date, end_date, sort_order, status, created_by, metadata)
                VALUES
                    (v_tid, v_cc.id,
                     v_cc.code || '-' || v_fy || '-P' || lpad(v_pnum::text, 2, '0'),
                     'FY' || v_fy || ' Period ' || v_pnum,
                     v_fy, v_pnum, 'normal',
                     v_pstart, v_pend, v_pnum,
                     v_status, v_su, v_meta)
                ON CONFLICT (tenant_id, company_code_id, fiscal_year, period_number) DO NOTHING;
            END LOOP;

            -- Period 13: year-end adjustment
            INSERT INTO master.fiscal_period
                (tenant_id, company_code_id, code, name,
                 fiscal_year, period_number, period_type,
                 start_date, end_date, sort_order, status, created_by, metadata)
            VALUES
                (v_tid, v_cc.id,
                 v_cc.code || '-' || v_fy || '-P13',
                 'FY' || v_fy || ' Year-End Adj',
                 v_fy, 13, 'adjustment',
                 v_fy_end, v_fy_end, 13,
                 v_status, v_su, v_meta)
            ON CONFLICT (tenant_id, company_code_id, fiscal_year, period_number) DO NOTHING;

        END LOOP;
    END LOOP;

    RAISE NOTICE '[310_fiscal_periods] Fiscal periods (FY2026-FY2027) seeded for CATL';

END $catl_fp$;
