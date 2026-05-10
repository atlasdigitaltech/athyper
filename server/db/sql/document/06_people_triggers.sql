-- ============================================================================
-- document/06_people_triggers.sql
-- ============================================================================

DO $$
DECLARE
    r record;
    v_table text;
    v_tables text[] := ARRAY[
        'shift_assignment',
        'time_punch',
        'attendance_day',
        'attendance_adjustment_request',
        'leave_request',
        'leave_balance_entry',
        'compensation_assignment',
        'compensation_change',
        'payroll_period',
        'payroll_run',
        'payroll_run_employee',
        'payroll_result',
        'payroll_result_line',
        'employee_tax_declaration',
        'employee_tax_declaration_line',
        'hr_case',
        'onboarding_case',
        'offboarding_case',
        'policy_acknowledgment',
        'people_request'
    ];
BEGIN
    FOREACH v_table IN ARRAY v_tables LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_people_updated_at ON document.%I', v_table);
        EXECUTE format(
            'CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON document.%I FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',
            v_table
        );
    END LOOP;

    FOR r IN
        SELECT c.table_name
        FROM information_schema.columns c
        WHERE c.table_schema = 'document'
          AND c.column_name = 'status_changed_at'
          AND c.table_name = ANY (v_tables)
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_people_status_changed ON document.%I', r.table_name);
        EXECUTE format(
            'CREATE TRIGGER trg_people_status_changed BEFORE UPDATE ON document.%I FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed()',
            r.table_name
        );
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION document.trg_people_leave_balance_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'LEAVE_BALANCE_APPEND_ONLY: create an offsetting leave_balance_entry instead of modifying or deleting an existing entry';
END;
$$;

DROP TRIGGER IF EXISTS trg_people_leave_balance_append_only ON document.leave_balance_entry;
CREATE TRIGGER trg_people_leave_balance_append_only
    BEFORE UPDATE OR DELETE ON document.leave_balance_entry
    FOR EACH ROW EXECUTE FUNCTION document.trg_people_leave_balance_append_only();

CREATE OR REPLACE FUNCTION document.trg_people_payroll_result_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' AND OLD.status = 'posted' THEN
        RAISE EXCEPTION 'PAYROLL_RESULT_POSTED_IMMUTABLE: posted payroll_result rows cannot be deleted';
    END IF;

    IF TG_OP = 'UPDATE'
       AND OLD.status = 'posted'
       AND NEW.status IS DISTINCT FROM 'voided' THEN
        RAISE EXCEPTION 'PAYROLL_RESULT_POSTED_IMMUTABLE: posted payroll_result rows can only transition to voided';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_people_payroll_result_immutable ON document.payroll_result;
CREATE TRIGGER trg_people_payroll_result_immutable
    BEFORE UPDATE OR DELETE ON document.payroll_result
    FOR EACH ROW EXECUTE FUNCTION document.trg_people_payroll_result_immutable();

CREATE OR REPLACE FUNCTION document.trg_people_payroll_result_line_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = master, document, shared, pg_catalog
AS $$
DECLARE
    v_status text;
    v_tenant_id uuid;
    v_payroll_result_id uuid;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_tenant_id := OLD.tenant_id;
        v_payroll_result_id := OLD.payroll_result_id;
    ELSE
        v_tenant_id := NEW.tenant_id;
        v_payroll_result_id := NEW.payroll_result_id;
    END IF;

    SELECT pr.status
      INTO v_status
      FROM document.payroll_result pr
     WHERE pr.tenant_id = v_tenant_id
       AND pr.id = v_payroll_result_id;

    IF v_status = 'posted' THEN
        RAISE EXCEPTION 'PAYROLL_RESULT_LINE_POSTED_IMMUTABLE: lines for a posted payroll_result cannot be modified';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_people_payroll_result_line_immutable ON document.payroll_result_line;
CREATE TRIGGER trg_people_payroll_result_line_immutable
    BEFORE UPDATE OR DELETE ON document.payroll_result_line
    FOR EACH ROW EXECUTE FUNCTION document.trg_people_payroll_result_line_immutable();

CREATE OR REPLACE FUNCTION document.trg_people_payroll_period_one_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = master, document, shared, pg_catalog
AS $$
DECLARE
    v_pay_frequency text;
BEGIN
    SELECT pg.pay_frequency
      INTO v_pay_frequency
      FROM master.pay_group pg
     WHERE pg.tenant_id = NEW.tenant_id
       AND pg.id = NEW.pay_group_id;

    IF v_pay_frequency = 'monthly' AND NEW.period_number > 12 THEN
        RAISE EXCEPTION 'PAYROLL_PERIOD_INVALID_NUMBER: monthly pay groups allow periods 1-12';
    ELSIF v_pay_frequency = 'semi_monthly' AND NEW.period_number > 24 THEN
        RAISE EXCEPTION 'PAYROLL_PERIOD_INVALID_NUMBER: semi_monthly pay groups allow periods 1-24';
    ELSIF v_pay_frequency = 'bi_weekly' AND NEW.period_number > 27 THEN
        RAISE EXCEPTION 'PAYROLL_PERIOD_INVALID_NUMBER: bi_weekly pay groups allow periods 1-27';
    ELSIF v_pay_frequency = 'weekly' AND NEW.period_number > 53 THEN
        RAISE EXCEPTION 'PAYROLL_PERIOD_INVALID_NUMBER: weekly pay groups allow periods 1-53';
    ELSIF v_pay_frequency = 'quarterly' AND NEW.period_number > 4 THEN
        RAISE EXCEPTION 'PAYROLL_PERIOD_INVALID_NUMBER: quarterly pay groups allow periods 1-4';
    END IF;

    IF NEW.status IN ('open', 'processing')
       AND EXISTS (
           SELECT 1
             FROM document.payroll_period pp
            WHERE pp.tenant_id = NEW.tenant_id
              AND pp.pay_group_id = NEW.pay_group_id
              AND pp.status IN ('open', 'processing')
              AND pp.id IS DISTINCT FROM NEW.id
       ) THEN
        RAISE EXCEPTION 'PAYROLL_PERIOD_OPEN_EXISTS: pay_group % already has an open or processing payroll period', NEW.pay_group_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_people_payroll_period_one_open ON document.payroll_period;
CREATE TRIGGER trg_people_payroll_period_one_open
    BEFORE INSERT OR UPDATE OF pay_group_id, period_number, status ON document.payroll_period
    FOR EACH ROW EXECUTE FUNCTION document.trg_people_payroll_period_one_open();

CREATE OR REPLACE FUNCTION document.trg_people_leave_request_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = master, document, shared, pg_catalog
AS $$
BEGIN
    IF NEW.status IN ('submitted', 'approved')
       AND EXISTS (
           SELECT 1
             FROM document.leave_request lr
            WHERE lr.tenant_id = NEW.tenant_id
              AND lr.employee_id = NEW.employee_id
              AND lr.status IN ('submitted', 'approved')
              AND lr.id IS DISTINCT FROM NEW.id
              AND daterange(lr.start_date, lr.end_date, '[]') && daterange(NEW.start_date, NEW.end_date, '[]')
       ) THEN
        RAISE EXCEPTION 'LEAVE_REQUEST_OVERLAP: employee % already has an overlapping submitted or approved leave request', NEW.employee_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_people_leave_request_no_overlap ON document.leave_request;
CREATE TRIGGER trg_people_leave_request_no_overlap
    BEFORE INSERT OR UPDATE OF employee_id, start_date, end_date, status ON document.leave_request
    FOR EACH ROW EXECUTE FUNCTION document.trg_people_leave_request_no_overlap();

CREATE OR REPLACE FUNCTION document.trg_compensation_assignment_company_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = master, document, shared, pg_catalog
AS $$
DECLARE
    v_emp_company uuid;
    v_pg_company uuid;
BEGIN
    IF NEW.employment_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT e.company_code_id
      INTO v_emp_company
      FROM master.employment e
     WHERE e.tenant_id = NEW.tenant_id
       AND e.id = NEW.employment_id;

    SELECT pg.company_code_id
      INTO v_pg_company
      FROM master.pay_group pg
     WHERE pg.tenant_id = NEW.tenant_id
       AND pg.id = NEW.pay_group_id;

    IF v_emp_company IS NOT NULL
       AND v_pg_company IS NOT NULL
       AND v_emp_company IS DISTINCT FROM v_pg_company THEN
        RAISE EXCEPTION 'COMPENSATION_COMPANY_MISMATCH: employment company does not match pay_group company';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compensation_assignment_company_check ON document.compensation_assignment;
CREATE TRIGGER trg_compensation_assignment_company_check
    BEFORE INSERT OR UPDATE OF employment_id, pay_group_id ON document.compensation_assignment
    FOR EACH ROW EXECUTE FUNCTION document.trg_compensation_assignment_company_check();
