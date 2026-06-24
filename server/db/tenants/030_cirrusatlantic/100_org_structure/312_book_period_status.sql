-- ============================================================================
-- CIRRUSATLANTIC — BOOK PERIOD STATUS
-- ============================================================================
-- File:     312_book_period_status.sql
-- Schema:   governance.book_period_status
-- Purpose:  Open all book-periods FY2026 + FY2027, periods 0-13, for CATL.
--           Without these rows the period-gate trigger blocks all JE inserts.
-- Depends:  311_ledger_books.sql, 310_fiscal_periods.sql
-- Idempotent: Yes — ON CONFLICT DO UPDATE (future → open only)
-- ============================================================================

DO $catl_bps$
DECLARE
    v_tid  uuid;
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := '{"_seed": {"pack": "312_catl_bps", "version": "1.0.0"}}'::jsonb;
    v_row  record;
    v_fy   int;
    v_pnum int;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'cirrusatlantic';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[312_book_period_status] CirrusAtlantic tenant not found'; END IF;

    FOR v_row IN
        SELECT ba.company_code_id, ba.book_id
        FROM   master.company_code_book_assignment ba
        JOIN   master.ledger_book lb ON lb.id = ba.book_id AND lb.tenant_id = ba.tenant_id
        WHERE  ba.tenant_id = v_tid
          AND  ba.status    = 'active'
          AND  lb.category  = 'statutory'
    LOOP
        FOR v_fy IN 2026..2027 LOOP
            FOR v_pnum IN 0..13 LOOP
                INSERT INTO governance.book_period_status
                    (tenant_id, company_code_id, book_id,
                     fiscal_year, period_number,
                     status, opened_at, opened_by,
                     created_by, metadata)
                VALUES
                    (v_tid, v_row.company_code_id, v_row.book_id,
                    v_fy, v_pnum,
                     CASE WHEN v_fy = 2026 THEN 'open' ELSE 'future' END,
                     now(), v_su,
                     v_su, v_meta)
                ON CONFLICT (tenant_id, company_code_id, book_id, fiscal_year, period_number)
                DO UPDATE SET
                    status    = EXCLUDED.status,
                    opened_at = COALESCE(governance.book_period_status.opened_at, now()),
                    opened_by = COALESCE(governance.book_period_status.opened_by, v_su),
                    updated_at = now(),
                    updated_by = v_su;
            END LOOP;
        END LOOP;
    END LOOP;

    RAISE NOTICE '[312_book_period_status] Book-period status opened (FY2026-FY2027, P0-P13) for CATL';

END $catl_bps$;
