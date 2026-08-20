-- ============================================================================
-- 312_book_period_status.sql â€” Open book-periods for demo tenant
-- ============================================================================
-- Seeds ledger.book_period_status with 'open' for FY2025 and FY2026,
-- periods 0-12, for every (company, statutory-book) assignment.
-- Without these rows the trg_je_period_gate_fn treats all periods as 'future'
-- and blocks journal_entry INSERT.
-- Depends: 311 (ledger_books + company_code_book_assignment)
-- ============================================================================

DO $seed$
DECLARE
    v_tid  uuid;
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := '{"_seed": {"pack": "312_org", "version": "1.0.0"}}'::jsonb;
    v_row  record;
    v_fy   int;
    v_pnum int;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'Tenant ATHYPER not found'; END IF;

    -- One row per (company Ã— statutory-book Ã— fiscal-year Ã— period 0-12)
    FOR v_row IN
        SELECT ba.company_code_id, ba.book_id
        FROM   master.company_code_book_assignment ba
        JOIN   master.ledger_book lb
               ON lb.id = ba.book_id AND lb.tenant_id = ba.tenant_id
        WHERE  ba.tenant_id = v_tid
          AND  ba.status    = 'active'
          AND  lb.category  = 'statutory'
    LOOP
        FOR v_fy IN 2025..2026 LOOP
            FOR v_pnum IN 0..12 LOOP
                INSERT INTO ledger.book_period_status
                    (tenant_id, company_code_id, book_id,
                     fiscal_year, period_number,
                     status, opened_at, opened_by,
                     created_by, metadata)
                VALUES
                    (v_tid, v_row.company_code_id, v_row.book_id,
                     v_fy, v_pnum,
                     'open', now(), v_su,
                     v_su, v_meta)
                ON CONFLICT (tenant_id, company_code_id, book_id, fiscal_year, period_number)
                DO UPDATE SET
                    status     = CASE WHEN ledger.book_period_status.status = 'future'
                                      THEN 'open'
                                      ELSE ledger.book_period_status.status END,
                    opened_at  = COALESCE(ledger.book_period_status.opened_at, now()),
                    updated_at = now(), updated_by = v_su
                WHERE ledger.book_period_status.status = 'future';
            END LOOP;
        END LOOP;
    END LOOP;

    RAISE NOTICE '312: book_period_status seeded for FY2025-FY2026';
END;
$seed$;

