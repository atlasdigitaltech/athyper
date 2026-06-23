-- ============================================================================
-- 315_open_2024_2027.sql -- Fiscal period + book-period windowing
-- ============================================================================
-- Sets period availability for tenants: athyper, technostat, cirrusatlantic
-- FY2024: hard_close
-- FY2025: soft_close
-- FY2026: open for P0..P12
-- FY2027+: future
-- ============================================================================

DO $open2024_2027$
DECLARE
    v_su        uuid  := '00000000-0000-0000-0000-000000000000';
    v_meta      jsonb := '{"_seed": {"pack": "315_org", "version": "1.2.0"}}'::jsonb;
    v_tenant    record;
    v_cc        record;
    v_ba        record;
    v_fy        int;
    v_fy_start  date;
    v_fy_end    date;
    v_pstart    date;
    v_pend      date;
    v_pnum      int;
    v_bps_status text;
    v_fp_upd    int;
    v_fp_total  int := 0;
    v_bps_rows  int;
    v_bps_total int := 0;
BEGIN
    FOR v_tenant IN
        SELECT id, code
        FROM   master.tenant
        WHERE  code IN ('athyper', 'technostat', 'cirrusatlantic')
        ORDER  BY code
    LOOP
        RAISE NOTICE '[%] Processing FY2024-2027 (tenant_id=%)', v_tenant.code, v_tenant.id;

        -- PART A: Ensure fiscal periods exist for FY2024-2027.
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

                -- Period 13: year-end adjustment stays future by default.
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

        RAISE NOTICE '[%] Part A: FY2024-2027 periods created/verified', v_tenant.code;

        -- PART B: Enforce fiscal_period status window for opening/normal periods.
        UPDATE master.fiscal_period
        SET    status     = CASE
                             WHEN fiscal_year = 2024 THEN 'hard_close'
                             WHEN fiscal_year = 2025 THEN 'soft_close'
                             WHEN fiscal_year = 2026 THEN 'open'
                             WHEN fiscal_year >= 2027 THEN 'future'
                             ELSE status
                           END,
               updated_at = now(),
               updated_by = v_su
        WHERE  tenant_id  = v_tenant.id
          AND  fiscal_year BETWEEN 2024 AND 2027
          AND  period_type IN ('opening', 'normal');

        GET DIAGNOSTICS v_fp_upd = ROW_COUNT;
        v_fp_total := v_fp_total + v_fp_upd;
        RAISE NOTICE '[%] Part B: % fiscal_period rows aligned', v_tenant.code, v_fp_upd;

        -- PART C: Book-period statuses mirror same window for P0-P12.
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
                    v_bps_status :=
                        CASE
                            WHEN v_fy = 2024 THEN 'hard_close'
                            WHEN v_fy = 2025 THEN 'soft_close'
                            WHEN v_fy = 2026 THEN 'open'
                            ELSE 'future'
                        END;

                    INSERT INTO governance.book_period_status
                        (tenant_id, company_code_id, book_id,
                         fiscal_year, period_number,
                         status, opened_at, opened_by,
                         created_by, metadata)
                    VALUES
                        (v_tenant.id, v_ba.company_code_id, v_ba.book_id,
                         v_fy, v_pnum,
                         v_bps_status, now(), v_su,
                         v_su, v_meta)
                    ON CONFLICT (tenant_id, company_code_id, book_id, fiscal_year, period_number)
                    DO UPDATE SET
                        status     = EXCLUDED.status,
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

    -- PART D: Assert final window is correct.
    IF EXISTS (
        SELECT 1
        FROM   master.fiscal_period fp
        JOIN   master.tenant t ON t.id = fp.tenant_id
        WHERE  t.code IN ('athyper', 'technostat', 'cirrusatlantic')
          AND  fp.fiscal_year BETWEEN 2024 AND 2027
          AND  fp.period_type IN ('opening', 'normal')
          AND  (
                   (fp.fiscal_year = 2024 AND fp.status <> 'hard_close')
                OR (fp.fiscal_year = 2025 AND fp.status <> 'soft_close')
                OR (fp.fiscal_year = 2026 AND fp.status <> 'open')
                OR (fp.fiscal_year >= 2027 AND fp.status <> 'future')
               )
    ) THEN
        RAISE EXCEPTION '315 FAIL D1: FY2024-FY2027 opening/normal period status mismatch in master.fiscal_period';
    END IF;

    IF EXISTS (
        WITH expected AS (
            SELECT t.id AS tenant_id,
                   ba.company_code_id,
                   ba.book_id,
                   v.fy,
                   v.pn,
                   CASE
                     WHEN v.fy = 2024 THEN 'hard_close'
                     WHEN v.fy = 2025 THEN 'soft_close'
                     WHEN v.fy = 2026 THEN 'open'
                     ELSE 'future'
                   END AS expected_status
            FROM   master.tenant t
            JOIN   master.company_code_book_assignment ba
                   ON ba.tenant_id = t.id
            JOIN   master.ledger_book lb
                   ON lb.id = ba.book_id AND lb.tenant_id = ba.tenant_id
            CROSS JOIN (VALUES (2024),(2025),(2026),(2027)) AS v(fy)
            CROSS JOIN generate_series(0,12) AS v(pn)
            WHERE  t.code = ANY (ARRAY['athyper','technostat','cirrusatlantic'])
              AND  ba.status  = 'active'
              AND  lb.category = 'statutory'
        )
        SELECT 1
        FROM   expected e
        WHERE  NOT EXISTS (
            SELECT 1 FROM governance.book_period_status bps
            WHERE bps.tenant_id      = e.tenant_id
              AND bps.company_code_id = e.company_code_id
              AND bps.book_id         = e.book_id
              AND bps.fiscal_year     = e.fy
              AND bps.period_number   = e.pn
              AND bps.status          = e.expected_status
        )
    ) THEN
        RAISE EXCEPTION '315 FAIL D2: Some statutory books have unexpected book_period_status in FY2024-2027';
    END IF;

    RAISE NOTICE '315 DONE: % fiscal_period rows aligned + % BPS rows processed.', v_fp_total, v_bps_total;
END $open2024_2027$;