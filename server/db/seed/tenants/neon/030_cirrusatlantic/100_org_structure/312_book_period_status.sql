-- seed-pack-version: 2.1.0
-- CirrusAtlantic statutory ledger-book posting gates for FY2026-FY2027.
-- Target: ledger.book_period_status (current Neon accounting model).

DO $seed$
DECLARE
    v_tid      uuid;
    v_actor    uuid := nullif(current_setting('app.current_principal_id', true), '')::uuid;
    v_expected integer;
    v_actual   integer;
BEGIN
    SELECT t.id
      INTO v_tid
      FROM master.tenant AS t
     WHERE t.realm_key = 'athyper'
       AND t.code = 'cirrusatlantic'
       AND t.status = 'active';

    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[312_book_period_status] active CirrusAtlantic tenant not found';
    END IF;

    IF v_actor IS NULL OR NOT EXISTS (
        SELECT 1
          FROM master.principal AS p
         WHERE p.id = v_actor
           AND p.tenant_id = v_tid
           AND p.status = 'active'
    ) THEN
        RAISE EXCEPTION '[312_book_period_status] app.current_principal_id must identify an active tenant-local principal';
    END IF;

    WITH desired AS (
        SELECT DISTINCT
               assignment.book_id AS ledger_book_id,
               period.id AS fiscal_period_id
          FROM master.company_code_book_assignment AS assignment
          JOIN master.ledger_book AS book
            ON book.tenant_id = assignment.tenant_id
           AND book.id = assignment.book_id
          JOIN master.fiscal_period AS period
            ON period.tenant_id = assignment.tenant_id
           AND period.company_code_id = assignment.company_code_id
           AND period.fiscal_year BETWEEN 2026 AND 2027
           AND period.period_number BETWEEN 0 AND 13
         WHERE assignment.tenant_id = v_tid
           AND assignment.status = 'active'
           AND book.status = 'active'
           AND book.category = 'statutory'
    )
    INSERT INTO ledger.book_period_status (
        id,
        tenant_id,
        ledger_book_id,
        fiscal_period_id,
        created_by
    )
    SELECT md5(format(
               'neon:cirrusatlantic:book-period-status:%s:%s:%s',
               v_tid,
               desired.ledger_book_id,
               desired.fiscal_period_id
           ))::uuid,
           v_tid,
           desired.ledger_book_id,
           desired.fiscal_period_id,
           v_actor
      FROM desired
    ON CONFLICT ON CONSTRAINT book_period_status_coordinate_uq DO NOTHING;

    UPDATE ledger.book_period_status AS gate
       SET status     = 'open'::ledger.book_period_status_d,
           opened_at  = now(),
           opened_by  = v_actor,
           updated_at = now(),
           updated_by = v_actor
      FROM master.ledger_book AS book,
           master.fiscal_period AS period
     WHERE gate.tenant_id = v_tid
       AND gate.status = 'future'
       AND book.tenant_id = gate.tenant_id
       AND book.id = gate.ledger_book_id
       AND book.status = 'active'
       AND book.category = 'statutory'
       AND period.tenant_id = gate.tenant_id
       AND period.id = gate.fiscal_period_id
       AND period.fiscal_year BETWEEN 2026 AND 2027
       AND period.period_number BETWEEN 0 AND 13;

    SELECT count(*)
      INTO v_expected
      FROM (
          SELECT DISTINCT assignment.book_id, period.id
            FROM master.company_code_book_assignment AS assignment
            JOIN master.ledger_book AS book
              ON book.tenant_id = assignment.tenant_id
             AND book.id = assignment.book_id
            JOIN master.fiscal_period AS period
              ON period.tenant_id = assignment.tenant_id
             AND period.company_code_id = assignment.company_code_id
             AND period.fiscal_year BETWEEN 2026 AND 2027
             AND period.period_number BETWEEN 0 AND 13
           WHERE assignment.tenant_id = v_tid
             AND assignment.status = 'active'
             AND book.status = 'active'
             AND book.category = 'statutory'
      ) AS desired;

    IF v_expected = 0 THEN
        RAISE EXCEPTION '[312_book_period_status] no statutory book/fiscal-period coordinates found';
    END IF;

    SELECT count(*)
      INTO v_actual
      FROM ledger.book_period_status AS gate
      JOIN master.ledger_book AS book
        ON book.tenant_id = gate.tenant_id
       AND book.id = gate.ledger_book_id
      JOIN master.fiscal_period AS period
        ON period.tenant_id = gate.tenant_id
       AND period.id = gate.fiscal_period_id
     WHERE gate.tenant_id = v_tid
       AND book.category = 'statutory'
       AND period.fiscal_year BETWEEN 2026 AND 2027
       AND period.period_number BETWEEN 0 AND 13
       AND gate.status = 'open';

    IF v_actual <> v_expected THEN
        RAISE EXCEPTION
            '[312_book_period_status] open gate count mismatch: expected %, found %',
            v_expected,
            v_actual;
    END IF;

    RAISE NOTICE
        '[312_book_period_status] % statutory book-period gates are open',
        v_actual;
END $seed$;
