CREATE OR REPLACE FUNCTION ledger.trg_guard_book_period_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_company_id uuid;
    v_period_start date;
    v_period_end date;
BEGIN
    IF TG_OP = 'UPDATE' AND (
       NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.ledger_book_id IS DISTINCT FROM OLD.ledger_book_id
       OR NEW.fiscal_period_id IS DISTINCT FROM OLD.fiscal_period_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by) THEN
        RAISE EXCEPTION 'book-period coordinates and creation evidence are immutable'
            USING ERRCODE = '22000';
    END IF;
    SELECT company_code_id, start_date, end_date
      INTO v_company_id, v_period_start, v_period_end
      FROM master.fiscal_period
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.fiscal_period_id;

    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'fiscal period % is not available in tenant %',
            NEW.fiscal_period_id, NEW.tenant_id USING ERRCODE = '23503';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM master.company_code_book_assignment
         WHERE tenant_id = NEW.tenant_id
           AND company_code_id = v_company_id
           AND book_id = NEW.ledger_book_id
           AND status = 'active'
           AND effective_from <= v_period_end
           AND (effective_to IS NULL OR effective_to >= v_period_start)
    ) THEN
        RAISE EXCEPTION 'ledger book % is not actively assigned to fiscal-period company %',
            NEW.ledger_book_id, v_company_id USING ERRCODE = '23514';
    END IF;

    IF TG_OP = 'INSERT' AND NEW.status <> 'future' THEN
        RAISE EXCEPTION 'book period must be provisioned in future status'
            USING ERRCODE = '23514';
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NOT (
        (OLD.status = 'future' AND NEW.status = 'open')
        OR (OLD.status = 'open' AND NEW.status IN ('soft_close','hard_close'))
        OR (OLD.status = 'soft_close' AND NEW.status IN ('open','hard_close'))
    ) THEN
        RAISE EXCEPTION 'invalid book-period transition: % -> %', OLD.status, NEW.status
            USING ERRCODE = '23514';
    END IF;

    IF NEW.status IN ('open','soft_close','hard_close') AND NEW.opened_at IS NULL THEN
        RAISE EXCEPTION 'opened evidence is required for status %', NEW.status
            USING ERRCODE = '23514';
    END IF;
    IF NEW.status = 'soft_close' AND NEW.soft_closed_at IS NULL THEN
        RAISE EXCEPTION 'soft-close evidence is required' USING ERRCODE = '23514';
    END IF;
    IF NEW.status = 'hard_close' AND NEW.hard_closed_at IS NULL THEN
        RAISE EXCEPTION 'hard-close evidence is required' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
