-- ============================================================================
-- 314_open_period_may2026.sql
-- ============================================================================
-- Opens master.fiscal_period AND ledger.book_period_status for the May
-- 2026 period across ALL companies in the athyper (demo) and technostat
-- tenants.
--
-- Root cause of BOOK_PERIOD_NOT_OPEN error:
--   athyper  : 313 opened fiscal_period âœ“ but some book_period_status rows
--              may be missing if new companyÃ—book pairs were added later.
--   technostat: P11 seed created FY2026 as 'future' throughout; P12A opened
--               book_period_status only for (FY2026, P5) â€” hardcoded, so
--               TEGY (Jul-Jun) May 2026 = FY2026 P11 was never opened.
--               fiscal_period itself was never flipped.
--
-- Strategy (by start_date range, not hardcoded period_number):
--   Part A: UPDATE master.fiscal_period â†’ 'open' where start_date
--           falls in May 2026 (correctly resolves TEGY FY2026 P11).
--   Part B: UPSERT ledger.book_period_status for each
--           (company Ã— statutory-book) pair, deriving fiscal_year and
--           period_number from the fiscal_period rows found in Part A.
--
-- Idempotent: safe to re-run. Already-open rows are not touched.
-- Soft-closed/hard-closed rows are preserved as-is.
-- ============================================================================

DO $fix$
DECLARE
    v_su       uuid  := '00000000-0000-0000-0000-000000000000';
    v_meta     jsonb := '{"_seed": {"pack": "314_open_may2026", "version": "1.0.0"}}'::jsonb;
    v_tenant   record;
    v_fp       record;
    v_ba       record;
    v_fp_upd   int;
    v_bps_upd  int;
BEGIN
    FOR v_tenant IN
        SELECT id, code
        FROM   master.tenant
        WHERE  code IN ('athyper', 'technostat')
        ORDER  BY code
    LOOP
        RAISE NOTICE '[%] Opening May 2026 periods (tenant_id=%)', v_tenant.code, v_tenant.id;

        -- â”€â”€ Part A: Open fiscal_period rows for May 2026 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        -- Only transitions 'future' â†’ 'open'; preserves soft_close/hard_close.
        UPDATE master.fiscal_period
        SET    status     = 'open',
               updated_at = now(),
               updated_by = v_su
        WHERE  tenant_id   = v_tenant.id
          AND  period_type IN ('opening', 'normal')
          AND  start_date  BETWEEN '2026-05-01' AND '2026-05-31'
          AND  status      = 'future';

        GET DIAGNOSTICS v_fp_upd = ROW_COUNT;
        RAISE NOTICE '[%] Part A: % fiscal_period row(s) opened', v_tenant.code, v_fp_upd;

        -- â”€â”€ Part B: Upsert book_period_status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        -- Derive correct (fiscal_year, period_number) per company from
        -- fiscal_period (handles Jan-Dec and Jul-Jun FY variants).
        v_bps_upd := 0;

        FOR v_fp IN
            SELECT fp.company_code_id, fp.fiscal_year, fp.period_number
            FROM   master.fiscal_period fp
            WHERE  fp.tenant_id   = v_tenant.id
              AND  fp.period_type IN ('opening', 'normal')
              AND  fp.start_date  BETWEEN '2026-05-01' AND '2026-05-31'
        LOOP
            FOR v_ba IN
                SELECT ba.book_id
                FROM   master.company_code_book_assignment ba
                JOIN   master.ledger_book lb
                       ON lb.id       = ba.book_id
                      AND lb.tenant_id = ba.tenant_id
                WHERE  ba.tenant_id       = v_tenant.id
                  AND  ba.company_code_id = v_fp.company_code_id
                  AND  ba.status          = 'active'
                  AND  lb.category        = 'statutory'
            LOOP
                INSERT INTO ledger.book_period_status
                    (tenant_id, company_code_id, book_id,
                     fiscal_year, period_number,
                     status, opened_at, opened_by,
                     created_by, metadata)
                VALUES
                    (v_tenant.id, v_fp.company_code_id, v_ba.book_id,
                     v_fp.fiscal_year, v_fp.period_number,
                     'open', now(), v_su,
                     v_su, v_meta)
                ON CONFLICT (tenant_id, company_code_id, book_id, fiscal_year, period_number)
                DO UPDATE SET
                    status     = CASE WHEN ledger.book_period_status.status = 'future'
                                      THEN 'open'
                                      ELSE ledger.book_period_status.status END,
                    opened_at  = COALESCE(ledger.book_period_status.opened_at, now()),
                    updated_at = now(),
                    updated_by = v_su
                WHERE  ledger.book_period_status.status = 'future';

                v_bps_upd := v_bps_upd + 1;
            END LOOP;
        END LOOP;

        RAISE NOTICE '[%] Part B: % book_period_status row(s) processed', v_tenant.code, v_bps_upd;
    END LOOP;

    -- â”€â”€ Assertions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    -- All May 2026 fiscal_period rows must now be open (or soft_close).
    IF EXISTS (
        SELECT 1
        FROM   master.fiscal_period fp
        JOIN   master.tenant t ON t.id = fp.tenant_id
        WHERE  t.code        IN ('athyper', 'technostat')
          AND  fp.period_type IN ('opening', 'normal')
          AND  fp.start_date  BETWEEN '2026-05-01' AND '2026-05-31'
          AND  fp.status NOT IN ('open', 'soft_close')
    ) THEN
        RAISE EXCEPTION '314 FAIL: Some May 2026 fiscal_period rows are still not open';
    END IF;

    -- Every statutory (company Ã— book) pair must have a book_period_status
    -- row for the May 2026 period in open/soft_close.
    IF EXISTS (
        SELECT fp.company_code_id, ba.book_id,
               fp.fiscal_year,     fp.period_number
        FROM   master.fiscal_period fp
        JOIN   master.tenant t ON t.id = fp.tenant_id
        JOIN   master.company_code_book_assignment ba
               ON ba.tenant_id       = fp.tenant_id
              AND ba.company_code_id  = fp.company_code_id
              AND ba.status           = 'active'
        JOIN   master.ledger_book lb
               ON lb.id              = ba.book_id
              AND lb.tenant_id        = ba.tenant_id
              AND lb.category         = 'statutory'
        WHERE  t.code        IN ('athyper', 'technostat')
          AND  fp.period_type IN ('opening', 'normal')
          AND  fp.start_date  BETWEEN '2026-05-01' AND '2026-05-31'
        EXCEPT
        SELECT bps.company_code_id, bps.book_id,
               bps.fiscal_year,     bps.period_number
        FROM   ledger.book_period_status bps
        JOIN   master.tenant t ON t.id = bps.tenant_id
        WHERE  t.code IN ('athyper', 'technostat')
          AND  bps.status IN ('open', 'soft_close')
          AND  bps.fiscal_year = 2026
    ) THEN
        RAISE EXCEPTION '314 FAIL: Some companyÃ—book pairs missing open book_period_status for May 2026';
    END IF;

    RAISE NOTICE '314: May 2026 is now fully open for athyper + technostat. All assertions passed.';
END;
$fix$;

