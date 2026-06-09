-- ============================================================================
-- 313_reopen_fiscal_periods_2024_2026.sql
-- ============================================================================
-- Opens all fiscal periods and governance.book_period_status gates from
-- Jan 2024 through May 2026 for every company code in the athyper tenant.
--
-- Part A: CREATE FY2023+FY2024 fiscal periods for all companies (idempotent)
-- Part B: UPDATE master.fiscal_period → 'open' for start_date 2024-01-01..2026-05-31
-- Part C: UPSERT governance.book_period_status for FY2024 periods 0-12
--          (312 only covers FY2025-2026; the je_period_gate trigger blocks
--           FY2024 journal_entry INSERTs without this)
-- Part D: Assertions
--
-- Depends: 310 (FY2025-2026 created as open), 312 (FY2025-2026 BPS seeded)
--
-- FY boundary notes:
--   Jan-start (11 cos): FY2024 = Jan 2024–Dec 2024  (all in range)
--   Mar-start ASGF:     FY2024 P11-P12 = Jan-Feb 2024 (in range)
--   Apr-start (5 cos):  FY2024 P10-P12 = Jan-Mar 2024 (in range)
--   Apr/May 2026 already 'open' as FY2026 P4/P5 for Jan-start companies (310).
-- ============================================================================

DO $seed$
DECLARE
    v_tid       uuid;
    v_su        uuid := '00000000-0000-0000-0000-000000000000';
    v_meta      jsonb := '{"_seed": {"pack": "313_org", "version": "1.0.0"}}'::jsonb;
    v_cc        record;
    v_ba        record;
    v_fy        int;
    v_fy_start  date;
    v_fy_end    date;
    v_pstart    date;
    v_pend      date;
    v_pnum      int;
    v_fp_updated int;
    v_bps_rows   int := 0;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'Tenant ATHYPER not found'; END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- PART A: Create FY2023 and FY2024 fiscal periods for all companies
    -- ══════════════════════════════════════════════════════════════════════
    -- Inserted as 'hard_close'; Part B will re-open those whose start_date
    -- falls in the Jan 2024–May 2026 window.
    -- ON CONFLICT DO NOTHING: leaves existing rows (e.g. from 500 Section C)
    -- unchanged — Part B handles the status flip regardless.
    -- ══════════════════════════════════════════════════════════════════════

    FOR v_cc IN
        SELECT id, code, fiscal_year_start_month
        FROM   master.company_code
        WHERE  tenant_id = v_tid AND status = 'active'
        ORDER BY code
    LOOP
        FOR v_fy IN 2023..2024 LOOP
            v_fy_start := make_date(
                CASE WHEN v_cc.fiscal_year_start_month = 1 THEN v_fy
                     ELSE v_fy - 1 END,
                v_cc.fiscal_year_start_month, 1
            );
            v_fy_end := (v_fy_start + interval '12 months' - interval '1 day')::date;

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
                 'hard_close', v_su, v_meta)
            ON CONFLICT (tenant_id, company_code_id, fiscal_year, period_number)
            DO NOTHING;

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
                     'hard_close', v_su, v_meta)
                ON CONFLICT (tenant_id, company_code_id, fiscal_year, period_number)
                DO NOTHING;
            END LOOP;

            -- Period 13: year-end adjustment
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
                 'hard_close', v_su, v_meta)
            ON CONFLICT (tenant_id, company_code_id, fiscal_year, period_number)
            DO NOTHING;
        END LOOP;
    END LOOP;

    RAISE NOTICE '313 Part A: FY2023-2024 fiscal periods created/verified for all companies';

    -- ══════════════════════════════════════════════════════════════════════
    -- PART B: Open all periods whose start_date falls 2024-01-01..2026-05-31
    -- ══════════════════════════════════════════════════════════════════════
    -- What this covers per fiscal year start type:
    --   Jan-start: FY2024 P0-P12 (Jan-Dec 2024) + FY2025 (all) + FY2026 P0-P5
    --   Apr-start: FY2024 P10-P12 (Jan-Mar 2024) + FY2025 (all) + FY2026 (all)
    --   Mar-start: FY2024 P11-P12 (Jan-Feb 2024) + FY2025 (all) + FY2026 (all)
    -- FY2025/FY2026 are already 'open' from 310 — idempotent for those rows.
    -- Period 13 (adjustment) intentionally excluded; stays hard_close.
    -- ══════════════════════════════════════════════════════════════════════

    UPDATE master.fiscal_period
    SET    status     = 'open',
           updated_at = now(),
           updated_by = v_su
    WHERE  tenant_id  = v_tid
      AND  period_type IN ('opening', 'normal')
      AND  start_date BETWEEN '2024-01-01' AND '2026-05-31'
      AND  status != 'open';

    GET DIAGNOSTICS v_fp_updated = ROW_COUNT;
    RAISE NOTICE '313 Part B: % fiscal_period rows updated to open', v_fp_updated;

    -- ══════════════════════════════════════════════════════════════════════
    -- PART C: Seed governance.book_period_status for FY2024 (periods 0-12)
    -- ══════════════════════════════════════════════════════════════════════
    -- 312_book_period_status.sql only covers FY2025-2026. The trigger
    -- trg_je_period_gate_fn treats any missing book_period_status row as
    -- 'future' and blocks the journal_entry INSERT. This section covers
    -- all (company × statutory book) pairs for FY2024.
    -- ══════════════════════════════════════════════════════════════════════

    FOR v_ba IN
        SELECT ba.company_code_id, ba.book_id
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
                 status, opened_at, opened_by,
                 created_by, metadata)
            VALUES
                (v_tid, v_ba.company_code_id, v_ba.book_id,
                 2024, v_pnum,
                 'open', now(), v_su,
                 v_su, v_meta)
            ON CONFLICT (tenant_id, company_code_id, book_id, fiscal_year, period_number)
            DO UPDATE SET
                status     = 'open',
                opened_at  = COALESCE(governance.book_period_status.opened_at, now()),
                updated_at = now(),
                updated_by = v_su;

            v_bps_rows := v_bps_rows + 1;
        END LOOP;
    END LOOP;

    RAISE NOTICE '313 Part C: % book_period_status rows processed for FY2024', v_bps_rows;

    -- ══════════════════════════════════════════════════════════════════════
    -- PART D: Assertions
    -- ══════════════════════════════════════════════════════════════════════

    -- D1: No blocked normal/opening periods remain in the target window
    IF EXISTS (
        SELECT 1
        FROM   master.fiscal_period
        WHERE  tenant_id    = v_tid
          AND  period_type  IN ('opening', 'normal')
          AND  start_date   BETWEEN '2024-01-01' AND '2026-05-31'
          AND  status       NOT IN ('open', 'soft_close')
    ) THEN
        RAISE EXCEPTION '313 FAIL: Some periods in Jan 2024–May 2026 are not open — check fiscal_period.status';
    END IF;

    -- D2: Apr 2026 (P4) and May 2026 (P5) explicitly open for Jan-start companies
    IF EXISTS (
        SELECT 1
        FROM   master.fiscal_period fp
        JOIN   master.company_code cc ON cc.id = fp.company_code_id
        WHERE  fp.tenant_id              = v_tid
          AND  cc.fiscal_year_start_month = 1
          AND  fp.fiscal_year            = 2026
          AND  fp.period_number          IN (4, 5)
          AND  fp.status                 != 'open'
    ) THEN
        RAISE EXCEPTION '313 FAIL: April/May 2026 (P4/P5) not open for Jan-start companies';
    END IF;

    -- D3: Every statutory book has FY2024 P0 in book_period_status as open
    IF EXISTS (
        SELECT ba.company_code_id, ba.book_id
        FROM   master.company_code_book_assignment ba
        JOIN   master.ledger_book lb
               ON lb.id = ba.book_id AND lb.tenant_id = ba.tenant_id
        WHERE  ba.tenant_id = v_tid AND ba.status = 'active' AND lb.category = 'statutory'
        EXCEPT
        SELECT company_code_id, book_id
        FROM   governance.book_period_status
        WHERE  tenant_id     = v_tid
          AND  fiscal_year   = 2024
          AND  period_number = 0
          AND  status        = 'open'
    ) THEN
        RAISE EXCEPTION '313 FAIL: Some statutory books missing FY2024 book_period_status (open)';
    END IF;

    RAISE NOTICE '313: All assertions passed — Jan 2024 through May 2026 are fully open';
END;
$seed$;
