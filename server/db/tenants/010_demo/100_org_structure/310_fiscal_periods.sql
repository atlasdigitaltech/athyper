-- ============================================================================
-- 310_fiscal_periods.sql — Fiscal periods for all companies
-- ============================================================================
-- Generates per (company, fiscal_year):
--   Period 0:  opening balance (single day = FY start)
--   Period 1-12: normal monthly
--   Period 13: year-end adjustment (single day = FY end)
-- FY start months: Jan(11 cos), Mar(1 co — ZA), Apr(3 cos — QA×2,IN,GB,JP)
-- Status: FY2025-FY2026 = 'open', FY2027+ = 'future'
-- Depends: 199 (company_codes with fiscal_year_start_month)
-- ============================================================================

DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_meta    jsonb := '{"_seed": {"pack": "310_org", "version": "2.0.0"}}'::jsonb;
    v_cc      record;
    v_fy      int;
    v_fy_start date;   -- first day of fiscal year
    v_fy_end   date;   -- last day of fiscal year
    v_pstart   date;
    v_pend     date;
    v_pnum     int;
    v_status   text;
    v_active_cos int;
    v_expected   int;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'Tenant ATHYPER not found'; END IF;

    SELECT count(*) INTO v_active_cos FROM master.company_code
    WHERE tenant_id = v_tid AND status = 'active';

    FOR v_cc IN
        SELECT id, code, name, fiscal_year_start_month
        FROM master.company_code
        WHERE tenant_id = v_tid AND status = 'active'
        ORDER BY code
    LOOP
        FOR v_fy IN 2025..2026 LOOP
            -- ──────────────────────────────────────────────────────────
            -- Compute FY boundaries
            -- FY start = 1st of start_month in the anchor year
            -- For Jan start: anchor = v_fy (Jan 2025 → Dec 2025)
            -- For non-Jan: anchor = v_fy - 1 (Apr 2024 → Mar 2025 = FY2025)
            -- ──────────────────────────────────────────────────────────
            v_fy_start := make_date(
                CASE WHEN v_cc.fiscal_year_start_month = 1 THEN v_fy
                     ELSE v_fy - 1 END,
                v_cc.fiscal_year_start_month, 1
            );
            v_fy_end := (v_fy_start + interval '12 months' - interval '1 day')::date;

            -- FY2025-FY2026 = open (demo), FY2027+ = future
            v_status := CASE WHEN v_fy <= 2026 THEN 'open' ELSE 'future' END;

            -- Period 0: opening balance (single day = FY start)
            INSERT INTO master.fiscal_period
                (tenant_id, company_code_id, code, name,
                 fiscal_year, period_number, period_type,
                 start_date, end_date, sort_order,
                 status, created_by, metadata)
            VALUES
                (v_tid, v_cc.id,
                 v_cc.code || '-' || v_fy || '-P00',
                 'FY' || v_fy || ' Opening Balance',
                 v_fy, 0, 'opening',
                 v_fy_start, v_fy_start, 0,
                 v_status, v_su, v_meta)
            ON CONFLICT (tenant_id, company_code_id, fiscal_year, period_number) DO NOTHING;

            -- Periods 1-12: normal monthly
            FOR v_pnum IN 1..12 LOOP
                v_pstart := (v_fy_start + (v_pnum - 1) * interval '1 month')::date;
                v_pend   := (v_pstart + interval '1 month' - interval '1 day')::date;

                INSERT INTO master.fiscal_period
                    (tenant_id, company_code_id, code, name,
                     fiscal_year, period_number, period_type,
                     start_date, end_date, sort_order,
                     status, created_by, metadata)
                VALUES
                    (v_tid, v_cc.id,
                     v_cc.code || '-' || v_fy || '-P' || lpad(v_pnum::text, 2, '0'),
                     'FY' || v_fy || ' Period ' || v_pnum
                         || ' (' || to_char(v_pstart, 'Mon YYYY') || ')',
                     v_fy, v_pnum, 'normal',
                     v_pstart, v_pend, v_pnum,
                     v_status, v_su, v_meta)
                ON CONFLICT (tenant_id, company_code_id, fiscal_year, period_number) DO NOTHING;
            END LOOP;

            -- Period 13: year-end adjustment (single day = FY end)
            INSERT INTO master.fiscal_period
                (tenant_id, company_code_id, code, name,
                 fiscal_year, period_number, period_type,
                 start_date, end_date, sort_order,
                 status, created_by, metadata)
            VALUES
                (v_tid, v_cc.id,
                 v_cc.code || '-' || v_fy || '-P13',
                 'FY' || v_fy || ' Year-End Adjustment',
                 v_fy, 13, 'adjustment',
                 v_fy_end, v_fy_end, 13,
                 'future', v_su, v_meta)  -- adjustment always starts as future
            ON CONFLICT (tenant_id, company_code_id, fiscal_year, period_number) DO NOTHING;
        END LOOP;
    END LOOP;

    -- ══════════════════════════════════════════════════════════════════════
    -- ASSERTIONS
    -- ══════════════════════════════════════════════════════════════════════
    v_expected := v_active_cos * 2 * 14;  -- companies × FYs × (0+12+13)

    -- A1: Count only the FYs this script seeds (orphaned rows from prior runs are tolerated)
    IF (SELECT count(*) FROM master.fiscal_period
        WHERE tenant_id = v_tid AND fiscal_year BETWEEN 2025 AND 2026) != v_expected
    THEN RAISE EXCEPTION '310 FAIL: expected % periods, got %', v_expected,
        (SELECT count(*) FROM master.fiscal_period
         WHERE tenant_id = v_tid AND fiscal_year BETWEEN 2025 AND 2026);
    END IF;

    -- A2: Exactly 1 period 0 and 1 period 13 per (company, FY) — seeded FYs only
    IF EXISTS (
        SELECT company_code_id, fiscal_year, count(*)
        FROM master.fiscal_period
        WHERE tenant_id = v_tid AND period_number = 0
          AND fiscal_year BETWEEN 2025 AND 2026
        GROUP BY company_code_id, fiscal_year HAVING count(*) != 1
    ) THEN RAISE EXCEPTION '310 FAIL: company/FY with != 1 opening period'; END IF;

    IF EXISTS (
        SELECT company_code_id, fiscal_year, count(*)
        FROM master.fiscal_period
        WHERE tenant_id = v_tid AND period_number = 13
          AND fiscal_year BETWEEN 2025 AND 2026
        GROUP BY company_code_id, fiscal_year HAVING count(*) != 1
    ) THEN RAISE EXCEPTION '310 FAIL: company/FY with != 1 adjustment period'; END IF;

    -- A3: No date gaps or overlaps within normal periods (1-12) — seeded FYs only
    IF EXISTS (
        WITH ordered AS (
            SELECT company_code_id, fiscal_year,
                   end_date,
                   LEAD(start_date) OVER (
                       PARTITION BY company_code_id, fiscal_year
                       ORDER BY period_number
                   ) AS next_start
            FROM master.fiscal_period
            WHERE tenant_id = v_tid AND period_number BETWEEN 1 AND 12
              AND fiscal_year BETWEEN 2025 AND 2026
        )
        SELECT 1 FROM ordered
        WHERE next_start IS NOT NULL AND next_start != end_date + 1
    ) THEN RAISE EXCEPTION '310 FAIL: date gap or overlap in normal periods'; END IF;

    -- A4: Period 13 end_date = FY end (matches Period 12 end_date) — seeded FYs only
    IF EXISTS (
        SELECT p13.company_code_id, p13.fiscal_year
        FROM master.fiscal_period p13
        JOIN master.fiscal_period p12
            ON p12.tenant_id = p13.tenant_id
            AND p12.company_code_id = p13.company_code_id
            AND p12.fiscal_year = p13.fiscal_year
            AND p12.period_number = 12
        WHERE p13.tenant_id = v_tid AND p13.period_number = 13
          AND p13.fiscal_year BETWEEN 2025 AND 2026
          AND p13.end_date != p12.end_date
    ) THEN RAISE EXCEPTION '310 FAIL: Period 13 end_date != Period 12 end_date'; END IF;

    RAISE NOTICE '310: % fiscal periods for FY2025-2026 (% companies × 2 FYs × 14 periods)',
        (SELECT count(*) FROM master.fiscal_period
         WHERE tenant_id = v_tid AND fiscal_year BETWEEN 2025 AND 2026),
        v_active_cos;
END $seed$;
