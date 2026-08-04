CREATE OR REPLACE FUNCTION document.trg_manage_hr_approval()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document,master AS $$
DECLARE v_actor uuid:=nullif(current_setting('app.current_principal_id',true),'')::uuid;
BEGIN
    IF TG_OP='INSERT' AND NEW.status<>'draft' THEN RAISE EXCEPTION 'HR approval document must be created draft' USING ERRCODE='check_violation'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        IF v_actor IS NULL THEN RAISE EXCEPTION 'Current principal context is required for HR approval transitions' USING ERRCODE='insufficient_privilege'; END IF;
        IF NOT(
            (OLD.status='draft' AND NEW.status IN('submitted','cancelled')) OR
            (OLD.status='submitted' AND NEW.status IN('approved','rejected','withdrawn','cancelled')) OR
            (TG_TABLE_NAME='employee_tax_declaration' AND OLD.status='approved' AND NEW.status='superseded')
        ) THEN RAISE EXCEPTION 'Invalid % transition: % -> %',TG_TABLE_NAME,OLD.status,NEW.status USING ERRCODE='check_violation'; END IF;
        IF NEW.status='submitted' THEN NEW.submitted_at:=statement_timestamp(); NEW.submitted_by:=v_actor; END IF;
        IF NEW.status='approved' THEN
            IF TG_TABLE_NAME='employee_tax_declaration' AND NOT EXISTS(SELECT 1 FROM document.employee_tax_declaration_line l WHERE l.tenant_id=NEW.tenant_id AND l.employee_tax_declaration_id=NEW.id) THEN RAISE EXCEPTION 'Approved tax declaration requires at least one line' USING ERRCODE='check_violation'; END IF;
            IF TG_TABLE_NAME='leave_request' AND (NEW.approved_quantity IS NULL OR NEW.approved_quantity>NEW.requested_quantity) THEN RAISE EXCEPTION 'Approved leave quantity is required and cannot exceed requested quantity' USING ERRCODE='check_violation'; END IF;
            IF TG_TABLE_NAME='attendance_adjustment_request' AND NEW.approved_values='{}'::jsonb THEN RAISE EXCEPTION 'Approved attendance adjustment requires approved values' USING ERRCODE='check_violation'; END IF;
            NEW.approved_at:=statement_timestamp(); NEW.approved_by:=v_actor;
        END IF;
        IF NEW.status IN('rejected','cancelled') AND nullif(btrim(NEW.decision_reason),'') IS NULL THEN RAISE EXCEPTION 'Rejected or cancelled HR request requires a decision reason' USING ERRCODE='check_violation'; END IF;
    END IF;
    IF TG_OP='UPDATE' AND OLD.status IN('rejected','cancelled','withdrawn','superseded') AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Final HR approval document is immutable' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_compensation_change()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document,master AS $$
DECLARE v_group master.pay_group%ROWTYPE; v_structure master.pay_structure%ROWTYPE; v_current master.compensation_assignment%ROWTYPE; v_approved master.compensation_assignment%ROWTYPE;
BEGIN
    SELECT * INTO v_group FROM master.pay_group WHERE tenant_id=NEW.tenant_id AND id=NEW.proposed_pay_group_id;
    IF v_group.currency_code<>NEW.proposed_currency_code THEN RAISE EXCEPTION 'Proposed compensation currency must match pay group' USING ERRCODE='check_violation'; END IF;
    IF NEW.proposed_pay_structure_id IS NOT NULL THEN
        SELECT * INTO v_structure FROM master.pay_structure WHERE tenant_id=NEW.tenant_id AND id=NEW.proposed_pay_structure_id;
        IF v_structure.currency_code<>NEW.proposed_currency_code OR (v_structure.pay_group_id IS NOT NULL AND v_structure.pay_group_id<>NEW.proposed_pay_group_id) THEN RAISE EXCEPTION 'Proposed pay structure must match pay group and currency' USING ERRCODE='check_violation'; END IF;
    END IF;
    IF NEW.current_assignment_id IS NOT NULL THEN
        SELECT * INTO v_current FROM master.compensation_assignment WHERE tenant_id=NEW.tenant_id AND id=NEW.current_assignment_id;
        IF v_current.employee_id<>NEW.employee_id OR (v_current.status<>'active' AND NOT(NEW.status='approved' AND v_current.status='superseded')) THEN RAISE EXCEPTION 'Current compensation assignment must be active (or just superseded by this approval) and belong to the employee' USING ERRCODE='check_violation'; END IF;
    END IF;
    IF NEW.approved_assignment_id IS NOT NULL THEN
        SELECT * INTO v_approved FROM master.compensation_assignment WHERE tenant_id=NEW.tenant_id AND id=NEW.approved_assignment_id;
        IF v_approved.source_compensation_change_id<>NEW.id OR v_approved.employee_id<>NEW.employee_id THEN RAISE EXCEPTION 'Approved compensation assignment must materialize this change' USING ERRCODE='check_violation'; END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_tax_declaration()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document,master AS $$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM master.employment e WHERE e.tenant_id=NEW.tenant_id AND e.id=NEW.employment_id AND e.employee_id=NEW.employee_id) THEN RAISE EXCEPTION 'Tax declaration employment must belong to employee' USING ERRCODE='foreign_key_violation'; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_tax_declaration_line()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
BEGIN
    IF TG_OP='DELETE' OR NOT EXISTS(SELECT 1 FROM document.employee_tax_declaration d WHERE d.tenant_id=coalesce(NEW.tenant_id,OLD.tenant_id) AND d.id=coalesce(NEW.employee_tax_declaration_id,OLD.employee_tax_declaration_id) AND d.status='draft') THEN
        RAISE EXCEPTION 'Tax declaration lines can only change while the declaration is draft' USING ERRCODE='object_not_in_prerequisite_state';
    END IF;
    IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.employee_tax_declaration_id IS DISTINCT FROM OLD.employee_tax_declaration_id OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by) THEN RAISE EXCEPTION 'Tax declaration line identity and creation evidence are immutable' USING ERRCODE='check_violation'; END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_leave_contract()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document,master AS $$
DECLARE v_plan master.leave_plan%ROWTYPE; v_type master.leave_type%ROWTYPE;
BEGIN
    SELECT * INTO v_plan FROM master.leave_plan WHERE tenant_id=NEW.tenant_id AND id=NEW.leave_plan_id;
    SELECT * INTO v_type FROM master.leave_type WHERE tenant_id=NEW.tenant_id AND id=NEW.leave_type_id;
    IF v_plan.leave_type_id<>NEW.leave_type_id OR v_type.unit<>NEW.quantity_unit THEN RAISE EXCEPTION 'Leave plan, type and quantity unit must agree' USING ERRCODE='check_violation'; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_shift_assignment()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document,master AS $$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM master.shift_type s WHERE s.tenant_id=NEW.tenant_id AND s.id=NEW.shift_type_id AND s.status='active') THEN RAISE EXCEPTION 'Shift assignment requires an active shift type' USING ERRCODE='foreign_key_violation'; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_attendance_reference()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
DECLARE v_shift document.shift_assignment%ROWTYPE;
BEGIN
    IF NEW.shift_assignment_id IS NOT NULL THEN
        SELECT * INTO v_shift FROM document.shift_assignment WHERE tenant_id=NEW.tenant_id AND id=NEW.shift_assignment_id;
        IF v_shift.employee_id<>NEW.employee_id OR (TG_TABLE_NAME='attendance_day' AND v_shift.work_date<>NEW.attendance_date) THEN RAISE EXCEPTION 'Attendance record must match shift employee and work date' USING ERRCODE='check_violation'; END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_manage_hr_operational_state()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
DECLARE v_ok boolean:=false;
BEGIN
    IF TG_OP='INSERT' THEN RETURN NEW; END IF;
    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
    v_ok:=CASE TG_TABLE_NAME
        WHEN 'shift_assignment' THEN (OLD.status='scheduled' AND NEW.status IN('worked','adjusted','cancelled')) OR (OLD.status='worked' AND NEW.status='adjusted')
        WHEN 'time_punch' THEN OLD.status='accepted' AND NEW.status='voided'
        WHEN 'attendance_day' THEN (OLD.status='open' AND NEW.status IN('approved','voided')) OR (OLD.status='approved' AND NEW.status IN('locked','voided'))
        WHEN 'payroll_period' THEN (OLD.status='open' AND NEW.status='processing') OR (OLD.status='processing' AND NEW.status IN('open','closed')) OR (OLD.status='closed' AND NEW.status='locked')
        WHEN 'payroll_run_employee' THEN (OLD.status='included' AND NEW.status IN('excluded','calculated','error')) OR (OLD.status='error' AND NEW.status IN('included','excluded','calculated'))
        WHEN 'payroll_result' THEN (OLD.status='calculating' AND NEW.status='calculated') OR (OLD.status='calculated' AND NEW.status IN('approved','voided')) OR (OLD.status='approved' AND NEW.status IN('posted','voided'))
        ELSE false END;
    IF NOT v_ok THEN RAISE EXCEPTION 'Invalid % transition: % -> %',TG_TABLE_NAME,OLD.status,NEW.status USING ERRCODE='check_violation'; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_time_punch()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
BEGIN
    IF TG_OP='UPDATE' AND (NEW.id,NEW.tenant_id,NEW.employee_id,NEW.shift_assignment_id,NEW.punch_at,NEW.punch_type,NEW.source_type,NEW.device_ref,NEW.idempotency_key,NEW.geo_payload,NEW.raw_payload,NEW.created_at,NEW.created_by)
        IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.employee_id,OLD.shift_assignment_id,OLD.punch_at,OLD.punch_type,OLD.source_type,OLD.device_ref,OLD.idempotency_key,OLD.geo_payload,OLD.raw_payload,OLD.created_at,OLD.created_by) THEN
        RAISE EXCEPTION 'Accepted punch evidence is immutable; void it and append a replacement' USING ERRCODE='check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_manage_people_case()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
BEGIN
    IF TG_OP='INSERT' AND NEW.status<>'draft' THEN RAISE EXCEPTION 'People case must be created draft' USING ERRCODE='check_violation'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        IF NOT((OLD.status='draft' AND NEW.status IN('active','cancelled')) OR (OLD.status='active' AND NEW.status IN('completed','cancelled'))) THEN RAISE EXCEPTION 'Invalid % transition: % -> %',TG_TABLE_NAME,OLD.status,NEW.status USING ERRCODE='check_violation'; END IF;
        IF NEW.status='active' THEN NEW.activated_at:=statement_timestamp(); END IF;
        IF NEW.status='completed' THEN NEW.completed_at:=statement_timestamp(); END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_manage_hr_case()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
BEGIN
    IF TG_OP='INSERT' AND NEW.status<>'open' THEN RAISE EXCEPTION 'HR case must be created open' USING ERRCODE='check_violation'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NOT(
        (OLD.status='open' AND NEW.status IN('in_progress','pending','resolved','cancelled')) OR
        (OLD.status IN('in_progress','pending') AND NEW.status IN('in_progress','pending','resolved','cancelled')) OR
        (OLD.status='resolved' AND NEW.status IN('closed','in_progress'))
    ) THEN RAISE EXCEPTION 'Invalid HR case transition: % -> %',OLD.status,NEW.status USING ERRCODE='check_violation'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status='resolved' THEN NEW.resolved_at:=statement_timestamp(); END IF;
    IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status='closed' THEN NEW.closed_at:=statement_timestamp(); END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_manage_payroll_run()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
DECLARE v_actor uuid:=nullif(current_setting('app.current_principal_id',true),'')::uuid;
BEGIN
    IF TG_OP='INSERT' AND NEW.status<>'draft' THEN RAISE EXCEPTION 'Payroll run must be created draft' USING ERRCODE='check_violation'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        IF v_actor IS NULL THEN RAISE EXCEPTION 'Current principal context is required for payroll transitions' USING ERRCODE='insufficient_privilege'; END IF;
        IF NOT((OLD.status='draft' AND NEW.status IN('calculating','cancelled')) OR (OLD.status='calculating' AND NEW.status IN('calculated','cancelled')) OR (OLD.status='calculated' AND NEW.status IN('draft','approved','cancelled')) OR (OLD.status='approved' AND NEW.status IN('posted','cancelled')) OR (OLD.status='posted' AND NEW.status='reversed')) THEN RAISE EXCEPTION 'Invalid payroll run transition: % -> %',OLD.status,NEW.status USING ERRCODE='check_violation'; END IF;
        IF NEW.status='calculating' THEN NEW.calculation_started_at:=statement_timestamp(); END IF;
        IF NEW.status='calculated' THEN NEW.calculation_completed_at:=statement_timestamp(); END IF;
        IF NEW.status='approved' THEN NEW.approved_at:=statement_timestamp(); NEW.approved_by:=v_actor; END IF;
        IF NEW.status='posted' THEN NEW.posted_at:=statement_timestamp(); NEW.posted_by:=v_actor; END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_payroll_run_employee()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document,master AS $$
DECLARE v_period document.payroll_period%ROWTYPE; v_assignment master.compensation_assignment%ROWTYPE;
BEGIN
    SELECT p.* INTO v_period FROM document.payroll_period p JOIN document.payroll_run r ON r.tenant_id=p.tenant_id AND r.payroll_period_id=p.id WHERE r.tenant_id=NEW.tenant_id AND r.id=NEW.payroll_run_id;
    SELECT * INTO v_assignment FROM master.compensation_assignment WHERE tenant_id=NEW.tenant_id AND id=NEW.compensation_assignment_id;
    IF v_assignment.employee_id<>NEW.employee_id OR v_assignment.status<>'active' OR v_assignment.effective_from>v_period.period_end OR (v_assignment.effective_until IS NOT NULL AND v_assignment.effective_until<v_period.period_start) THEN RAISE EXCEPTION 'Payroll employee requires an active compensation assignment effective in the period' USING ERRCODE='check_violation'; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_payroll_result()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document,master AS $$
DECLARE v_run_employee document.payroll_run_employee%ROWTYPE; v_assignment master.compensation_assignment%ROWTYPE;
BEGIN
    SELECT * INTO v_run_employee FROM document.payroll_run_employee WHERE tenant_id=NEW.tenant_id AND id=NEW.payroll_run_employee_id;
    SELECT * INTO v_assignment FROM master.compensation_assignment WHERE tenant_id=NEW.tenant_id AND id=v_run_employee.compensation_assignment_id;
    IF v_run_employee.payroll_run_id<>NEW.payroll_run_id OR v_run_employee.employee_id<>NEW.employee_id OR v_assignment.currency_code<>NEW.currency_code THEN RAISE EXCEPTION 'Payroll result must match run employee and compensation currency' USING ERRCODE='check_violation'; END IF;
    IF TG_OP='UPDATE' AND pg_trigger_depth()<2 AND (NEW.gross_amount,NEW.employee_deduction_amount,NEW.employer_contribution_amount,NEW.net_amount) IS DISTINCT FROM (OLD.gross_amount,OLD.employee_deduction_amount,OLD.employer_contribution_amount,OLD.net_amount) THEN RAISE EXCEPTION 'Payroll result totals are maintained from result lines' USING ERRCODE='check_violation'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status='calculated' AND NOT EXISTS(SELECT 1 FROM document.payroll_result_line l WHERE l.tenant_id=NEW.tenant_id AND l.payroll_result_id=NEW.id) THEN RAISE EXCEPTION 'Calculated payroll result requires result lines' USING ERRCODE='check_violation'; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_payroll_result_line()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document,master AS $$
DECLARE v_result document.payroll_result%ROWTYPE; v_component master.pay_component%ROWTYPE;
BEGIN
    SELECT * INTO v_result FROM document.payroll_result WHERE tenant_id=NEW.tenant_id AND id=NEW.payroll_result_id;
    SELECT * INTO v_component FROM master.pay_component WHERE tenant_id=NEW.tenant_id AND id=NEW.pay_component_id;
    IF v_result.status<>'calculating' OR NEW.currency_code<>v_result.currency_code OR NEW.component_code_snapshot<>v_component.code OR NEW.component_type_snapshot<>v_component.component_type OR NEW.is_employer_cost_snapshot<>v_component.is_employer_cost THEN RAISE EXCEPTION 'Payroll result line must freeze its active component and result currency while calculating' USING ERRCODE='check_violation'; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.refresh_payroll_result_totals(p_tenant_id uuid,p_result_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
DECLARE v_gross numeric(18,4); v_deduction numeric(18,4); v_employer numeric(18,4);
BEGIN
    SELECT coalesce(sum(amount) FILTER(WHERE component_type_snapshot='earning'),0),
           coalesce(sum(amount) FILTER(WHERE component_type_snapshot IN('deduction','statutory') AND NOT is_employer_cost_snapshot),0),
           coalesce(sum(amount) FILTER(WHERE component_type_snapshot='employer_contribution' OR is_employer_cost_snapshot),0)
      INTO v_gross,v_deduction,v_employer FROM document.payroll_result_line WHERE tenant_id=p_tenant_id AND payroll_result_id=p_result_id;
    UPDATE document.payroll_result SET gross_amount=v_gross,employee_deduction_amount=v_deduction,employer_contribution_amount=v_employer,net_amount=v_gross-v_deduction
     WHERE tenant_id=p_tenant_id AND id=p_result_id;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_refresh_payroll_result()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
BEGIN PERFORM document.refresh_payroll_result_totals(NEW.tenant_id,NEW.payroll_result_id); RETURN NULL; END;
$$;
CREATE OR REPLACE FUNCTION document.trg_validate_policy_acknowledgment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
    v_policy_tenant uuid;
    v_policy_code text;
    v_policy_name text;
    v_policy_version integer;
BEGIN
    SELECT tenant_id,entity_type,name,version_no
      INTO v_policy_tenant,v_policy_code,v_policy_name,v_policy_version
      FROM control.policy_definition
     WHERE id=NEW.policy_definition_id
       AND status='active';
    IF NOT FOUND OR (v_policy_tenant IS NOT NULL AND v_policy_tenant<>NEW.tenant_id) THEN
        RAISE EXCEPTION 'active acknowledgment policy does not belong to the tenant'
            USING ERRCODE='foreign_key_violation';
    END IF;
    IF NEW.policy_code_snapshot<>v_policy_code
       OR NEW.policy_name_snapshot<>v_policy_name
       OR NEW.policy_version_snapshot<>v_policy_version THEN
        RAISE EXCEPTION 'policy acknowledgment snapshot does not match the active policy definition'
            USING ERRCODE='check_violation';
    END IF;
    RETURN NEW;
END;
$$;
