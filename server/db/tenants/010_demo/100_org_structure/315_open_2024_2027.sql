-- ============================================================================
-- 315_open_2024_2027.sql — Ensure FY2024–FY2027 fiscal periods exist and open
-- ============================================================================
-- Covers target demo tenants: technostat, cirrusatlantic
--
-- Part A: INSERT fiscal periods FY2024–FY2027 for all active companies
--         ON CONFLICT DO NOTHING — existing rows are kept as-is; Part B
--         will force the status to expected lifecycle states by fiscal year.
-- Part B: UPDATE master.fiscal_period → lifecycle state by FY for FY2024–2027
--         opening/normal periods (idempotent; handles partial prior seeds
--         such as technostat P11 which left FY2026 as 'future', and demo
--         313 which only opened Jan 2024–May 2026 by date window).
-- Part C: UPSERT governance.book_period_status → 'open' for FY2024–2027
--         periods 0–12 across every (company × statutory-book) pair.
--         Unconditional upsert: forces 'open' even on previously
--         soft-closed or hard-closed BPS rows for dev environments.
-- Part D: Assertions — fail fast if any gap remains.
--
-- FY boundary formula (standard across all start months):
--   v_fy_start = make_date(fy [or fy-1 for non-Jan], start_month, 1)
--   e.g.  Jan-start FY2024 → Jan 1 2024 – Dec 31 2024
--         Jul-start FY2024 → Jul 1 2023 – Jun 30 2024
--         Apr-start FY2024 → Apr 1 2023 – Mar 31 2024
--
-- Idempotent: safe to re-run at any time.
-- Depends on: all prior org-structure seeds (company codes, ledger books,
--             book assignments) for each tenant being already applied.
-- ============================================================================

DO $open2024_2027$
DECLARE
    v_su        uuid  := '00000000-0000-0000-0000-000000000000';
    v_meta      jsonb := '{"_seed": {"pack": "315_org", "version": "1.3.0"}}'::jsonb;
    v_tenant    record;
    v_cc        record;
    v_ba        record;
    v_fy        int;
    v_fy_start  date;
    v_fy_end    date;
    v_pstart    date;
    v_pend      date;
    v_pnum      int;
    v_fp_upd    int;
    v_fp_total  int := 0;
    v_bps_rows  int;
    v_bps_total int := 0;
BEGIN
    FOR v_tenant IN
        SELECT id, code
        FROM   master.tenant
        WHERE  code IN ('technostat', 'cirrusatlantic')
        ORDER  BY code
    LOOP
        RAISE NOTICE '[%] Processing FY2024-2027 (tenant_id=%)', v_tenant.code, v_tenant.id;

        -- ══════════════════════════════════════════════════════════════════
        -- PART A: Create missing FY2024–FY2027 fiscal periods
        -- ══════════════════════════════════════════════════════════════════
        FOR v_cc IN
            SELECT id, code, fiscal_year_start_month
            FROM   master.company_code
            WHERE  tenant_id = v_tenant.id AND status = 'active'
            ORDER  BY code
        LOOP
            FOR v_fy IN 2024..2027 LOOP
                v_fy_start := make_date(
                    CASE WHEN v_cc.fiscal_year_start_month = 1 THEN v_fy
                         ELSE v_fy - 1 END,
                    v_cc.fiscal_year_start_month, 1);
                v_fy_end := (v_fy_start + interval '12 months' - interval '1 day')::date;

                -- Period 0: opening balance
                INSERT INTO master.fiscal_period
                    (tenant_id, company_code_id, code, name,
                     fiscal_year, period_number, period_type,
                     start_date, end_date, sort_order, status, created_by, metadata)
                VALUES
                    (v_tenant.id, v_cc.id,
                     v_cc.code || '-' || v_fy || '-P00',
                     'FY' || v_fy || ' Opening Balance',
                     v_fy, 0, 'opening',
                     v_fy_start, v_fy_start, 0,
                     'open', v_su, v_meta)
                ON CONFLICT (tenant_id, company_code_id, fiscal_year, period_number) DO NOTHING;

                -- Periods 1-12: normal monthly
                FOR v_pnum IN 1..12 LOOP
                    v_pstart := (v_fy_start + (v_pnum - 1) * interval '1 month')::date;
                    v_pend   := (v_pstart  + interval '1 month' - interval '1 day')::date;

                    INSERT INTO master.fiscal_period
                        (tenant_id, company_code_id, code, name,
                         fiscal_year, period_number, period_type,
                         start_date, end_date, sort_order, status, created_by, metadata)
                    VALUES
                        (v_tenant.id, v_cc.id,
                         v_cc.code || '-' || v_fy || '-P' || lpad(v_pnum::text, 2, '0'),
                         'FY' || v_fy || ' Period ' || v_pnum
                             || ' (' || to_char(v_pstart, 'Mon YYYY') || ')',
                         v_fy, v_pnum, 'normal',
                         v_pstart, v_pend, v_pnum,
                         'open', v_su, v_meta)
                    ON CONFLICT (tenant_id, company_code_id, fiscal_year, period_number) DO NOTHING;
                END LOOP;

                -- Period 13: year-end adjustment — stays 'future'
                INSERT INTO master.fiscal_period
                    (tenant_id, company_code_id, code, name,
                     fiscal_year, period_number, period_type,
                     start_date, end_date, sort_order, status, created_by, metadata)
                VALUES
                    (v_tenant.id, v_cc.id,
                     v_cc.code || '-' || v_fy || '-P13',
                     'FY' || v_fy || ' Year-End Adjustment',
                     v_fy, 13, 'adjustment',
                     v_fy_end, v_fy_end, 13,
                     'future', v_su, v_meta)
                ON CONFLICT (tenant_id, company_code_id, fiscal_year, period_number) DO NOTHING;

            END LOOP; -- v_fy
        END LOOP; -- v_cc

        RAISE NOTICE '[%] Part A: FY2024-2027 periods created/verified for all companies', v_tenant.code;

        -- ══════════════════════════════════════════════════════════════════
        -- PART B: Apply expected lifecycle status by fiscal year
        -- ══════════════════════════════════════════════════════════════════
        -- Covers rows left as legacy values by prior partial seeds:
        --   • technostat P11: FY2026 normal periods seeded as 'future' (except P5)
        --   • demo 313: FY2024 opening/normal opened by date window (Apr/Mar-start
        --     companies had pre-2024 calendar months left as 'hard_close')
        UPDATE master.fiscal_period fp
        SET    status     = CASE
                         WHEN fp.fiscal_year = 2024 THEN 'hard_close'
                         WHEN fp.fiscal_year = 2025 THEN 'soft_close'
                         WHEN fp.fiscal_year = 2026 THEN 'open'
                         ELSE 'future'
                     END,
               updated_at = now(),
               updated_by = v_su
        WHERE  tenant_id  = v_tenant.id
          AND  fiscal_year BETWEEN 2024 AND 2027
          AND  period_type IN ('opening', 'normal')
          AND (
                (fp.fiscal_year = 2024 AND fp.status <> 'hard_close')
             OR (fp.fiscal_year = 2025 AND fp.status <> 'soft_close')
             OR (fp.fiscal_year = 2026 AND fp.status <> 'open')
             OR (fp.fiscal_year >= 2027 AND fp.status <> 'future')
          );

        GET DIAGNOSTICS v_fp_upd = ROW_COUNT;
        v_fp_total := v_fp_total + v_fp_upd;
        RAISE NOTICE '[%] Part B: % fiscal_period rows updated to open', v_tenant.code, v_fp_upd;

        -- ══════════════════════════════════════════════════════════════════
        -- PART C: UPSERT book_period_status FY2024–2027 P0–P12 → 'open'
        -- ══════════════════════════════════════════════════════════════════
        -- Forces 'open' unconditionally so that trg_je_period_gate_fn never
        -- blocks journal_entry inserts for any period in the target range.
        v_bps_rows := 0;

        FOR v_ba IN
            SELECT ba.company_code_id, ba.book_id
            FROM   master.company_code_book_assignment ba
            JOIN   master.ledger_book lb
                   ON lb.id = ba.book_id AND lb.tenant_id = ba.tenant_id
            WHERE  ba.tenant_id = v_tenant.id
              AND  ba.status    = 'active'
              AND  lb.category  = 'statutory'
        LOOP
            FOR v_fy IN 2024..2027 LOOP
                FOR v_pnum IN 0..12 LOOP
                    INSERT INTO governance.book_period_status
                        (tenant_id, company_code_id, book_id,
                         fiscal_year, period_number,
                         status, opened_at, opened_by,
                         created_by, metadata)
                    VALUES
                        (v_tenant.id, v_ba.company_code_id, v_ba.book_id,
                         v_fy, v_pnum,
                         'open', now(), v_su,
                         v_su, v_meta)
                    ON CONFLICT (tenant_id, company_code_id, book_id, fiscal_year, period_number)
                    DO UPDATE SET
                        status     = 'open',
                        opened_at  = COALESCE(governance.book_period_status.opened_at, now()),
                        updated_at = now(),
                        updated_by = v_su;

                    v_bps_rows := v_bps_rows + 1;
                END LOOP; -- v_pnum
            END LOOP; -- v_fy
        END LOOP; -- v_ba

        v_bps_total := v_bps_total + v_bps_rows;
        RAISE NOTICE '[%] Part C: % book_period_status rows processed', v_tenant.code, v_bps_rows;

    END LOOP; -- v_tenant

    -- ══════════════════════════════════════════════════════════════════════
    -- PART D: Assertions — fail fast if any gap remains
    -- ══════════════════════════════════════════════════════════════════════

    -- D1: No opening/normal period in FY2024–2027 has unexpected lifecycle status
    IF EXISTS (
        SELECT 1
        FROM   master.fiscal_period fp
        JOIN   master.tenant t ON t.id = fp.tenant_id
        WHERE  t.code         IN ('technostat', 'cirrusatlantic')
          AND  fp.fiscal_year   BETWEEN 2024 AND 2027
          AND  fp.period_type   IN ('opening', 'normal')
          AND (
                (fp.fiscal_year = 2024 AND fp.status <> 'hard_close')
             OR (fp.fiscal_year = 2025 AND fp.status <> 'soft_close')
             OR (fp.fiscal_year = 2026 AND fp.status <> 'open')
             OR (fp.fiscal_year >= 2027 AND fp.status <> 'future')
          )
    ) THEN
        RAISE EXCEPTION '315 FAIL D1: Some FY2024-2027 opening/normal periods are not in expected lifecycle state — check master.fiscal_period';
    END IF;

    -- D2: Every (company × statutory-book) pair has BPS P0 open for each of FY2024–2027
    IF EXISTS (
        WITH expected AS (
            SELECT t.id AS tenant_id,
                   ba.company_code_id,
                   ba.book_id,
                   v.fy AS fiscal_year
            FROM   master.tenant t
            JOIN   master.company_code_book_assignment ba ON ba.tenant_id = t.id
            JOIN   master.ledger_book lb
                   ON lb.id = ba.book_id AND lb.tenant_id = ba.tenant_id
            CROSS  JOIN (VALUES (2024),(2025),(2026),(2027)) AS v(fy)
              WHERE  t.code    IN ('technostat', 'cirrusatlantic')
              AND  ba.status  = 'active'
              AND  lb.category = 'statutory'
        )
        SELECT 1 FROM expected e
        WHERE NOT EXISTS (
            SELECT 1 FROM governance.book_period_status bps
            WHERE  bps.tenant_id        = e.tenant_id
              AND  bps.company_code_id  = e.company_code_id
              AND  bps.book_id          = e.book_id
              AND  bps.fiscal_year      = e.fiscal_year
              AND  bps.period_number    = 0
              AND  bps.status           = 'open'
        )
    ) THEN
        RAISE EXCEPTION '315 FAIL D2: Some statutory books missing open book_period_status P0 for FY2024-2027';
    END IF;

    RAISE NOTICE '315 DONE: % fiscal_period rows updated + % BPS rows processed. FY2024-2027 lifecycle statuses updated for technostat and cirrusatlantic.',
        v_fp_total, v_bps_total;
END $open2024_2027$;
