CREATE TABLE document.shift_assignment (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, code text NOT NULL,
    employee_id uuid NOT NULL, shift_type_id uuid NOT NULL, work_date date NOT NULL,
    planned_start_at timestamptz NOT NULL, planned_end_at timestamptz NOT NULL,
    source_type text NOT NULL DEFAULT 'schedule', metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    status document.shift_assignment_status_d NOT NULL DEFAULT 'scheduled', status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT shift_assignment_pkey PRIMARY KEY(id), CONSTRAINT shift_assignment_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT shift_assignment_code_uq UNIQUE(tenant_id,code), CONSTRAINT shift_assignment_employee_date_uq UNIQUE(tenant_id,employee_id,work_date),
    CONSTRAINT shift_assignment_code_chk CHECK(code~'^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT shift_assignment_time_chk CHECK(planned_end_at>planned_start_at),
    CONSTRAINT shift_assignment_date_chk CHECK((planned_start_at AT TIME ZONE 'UTC')::date BETWEEN work_date-1 AND work_date+1),
    CONSTRAINT shift_assignment_source_chk CHECK(source_type~'^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT shift_assignment_json_chk CHECK(jsonb_typeof(metadata)='object'),
    CONSTRAINT shift_assignment_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT shift_assignment_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.time_punch (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, employee_id uuid NOT NULL,
    shift_assignment_id uuid, punch_at timestamptz NOT NULL, punch_type document.attendance_punch_type_d NOT NULL,
    source_type document.attendance_punch_source_d NOT NULL DEFAULT 'manual', device_ref text,
    idempotency_key text NOT NULL, geo_payload jsonb NOT NULL DEFAULT '{}'::jsonb, raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    void_reason text, status document.attendance_punch_status_d NOT NULL DEFAULT 'accepted', status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT time_punch_pkey PRIMARY KEY(id), CONSTRAINT time_punch_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT time_punch_idempotency_uq UNIQUE(tenant_id,idempotency_key),
    CONSTRAINT time_punch_key_chk CHECK(btrim(idempotency_key)<>''),
    CONSTRAINT time_punch_json_chk CHECK(jsonb_typeof(geo_payload)='object' AND jsonb_typeof(raw_payload)='object'),
    CONSTRAINT time_punch_void_chk CHECK((status='voided')=(void_reason IS NOT NULL)),
    CONSTRAINT time_punch_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT time_punch_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.attendance_day (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, employee_id uuid NOT NULL,
    shift_assignment_id uuid, attendance_date date NOT NULL,
    scheduled_minutes integer NOT NULL DEFAULT 0, worked_minutes integer NOT NULL DEFAULT 0,
    paid_minutes integer NOT NULL DEFAULT 0, overtime_minutes integer NOT NULL DEFAULT 0,
    late_minutes integer NOT NULL DEFAULT 0, early_leave_minutes integer NOT NULL DEFAULT 0, absence_minutes integer NOT NULL DEFAULT 0,
    first_in_at timestamptz, last_out_at timestamptz, calculation_version bigint NOT NULL DEFAULT 1,
    source_cutoff_at timestamptz NOT NULL DEFAULT now(), calculation_trace jsonb NOT NULL DEFAULT '{}'::jsonb,
    status document.attendance_day_status_d NOT NULL DEFAULT 'open', status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT attendance_day_pkey PRIMARY KEY(id), CONSTRAINT attendance_day_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT attendance_day_employee_date_uq UNIQUE(tenant_id,employee_id,attendance_date),
    CONSTRAINT attendance_day_minutes_chk CHECK(scheduled_minutes>=0 AND worked_minutes>=0 AND paid_minutes>=0 AND overtime_minutes>=0 AND late_minutes>=0 AND early_leave_minutes>=0 AND absence_minutes>=0),
    CONSTRAINT attendance_day_punch_span_chk CHECK(last_out_at IS NULL OR first_in_at IS NULL OR last_out_at>=first_in_at),
    CONSTRAINT attendance_day_version_chk CHECK(calculation_version>=1),
    CONSTRAINT attendance_day_trace_chk CHECK(jsonb_typeof(calculation_trace)='object'),
    CONSTRAINT attendance_day_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT attendance_day_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.attendance_adjustment_request (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, code text NOT NULL,
    employee_id uuid NOT NULL, attendance_day_id uuid, workflow_request_id uuid,
    adjustment_kind text NOT NULL, reason_code text, reason_text text,
    requested_values jsonb NOT NULL DEFAULT '{}'::jsonb, approved_values jsonb NOT NULL DEFAULT '{}'::jsonb,
    submitted_at timestamptz, submitted_by uuid, approved_at timestamptz, approved_by uuid, decision_reason text,
    status document.hr_approval_status_d NOT NULL DEFAULT 'draft', status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT attendance_adjustment_request_pkey PRIMARY KEY(id), CONSTRAINT attendance_adjustment_request_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT attendance_adjustment_request_code_uq UNIQUE(tenant_id,code),
    CONSTRAINT attendance_adjustment_request_code_chk CHECK(code~'^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT attendance_adjustment_kind_chk CHECK(adjustment_kind~'^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT attendance_adjustment_json_chk CHECK(jsonb_typeof(requested_values)='object' AND jsonb_typeof(approved_values)='object'),
    CONSTRAINT attendance_adjustment_submit_pair_chk CHECK((submitted_at IS NULL)=(submitted_by IS NULL)),
    CONSTRAINT attendance_adjustment_approve_pair_chk CHECK((approved_at IS NULL)=(approved_by IS NULL)),
    CONSTRAINT attendance_adjustment_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT attendance_adjustment_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.compensation_change (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, code text NOT NULL,
    employee_id uuid NOT NULL, current_assignment_id uuid, workflow_request_id uuid,
    change_reason_code text NOT NULL, effective_date date NOT NULL,
    proposed_pay_group_id uuid NOT NULL, proposed_pay_structure_id uuid,
    proposed_currency_code character(3) NOT NULL, proposed_base_amount numeric(18,4) NOT NULL,
    proposed_annualized_amount numeric(18,4), approved_assignment_id uuid,
    submitted_at timestamptz, submitted_by uuid, approved_at timestamptz, approved_by uuid, decision_reason text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    status document.hr_approval_status_d NOT NULL DEFAULT 'draft', status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT compensation_change_pkey PRIMARY KEY(id), CONSTRAINT compensation_change_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT compensation_change_code_uq UNIQUE(tenant_id,code),
    CONSTRAINT compensation_change_code_chk CHECK(code~'^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT compensation_change_reason_chk CHECK(btrim(change_reason_code)<>''),
    CONSTRAINT compensation_change_amount_chk CHECK(proposed_base_amount>=0 AND (proposed_annualized_amount IS NULL OR proposed_annualized_amount>=0)),
    CONSTRAINT compensation_change_materialization_chk CHECK((status='approved')=(approved_assignment_id IS NOT NULL)),
    CONSTRAINT compensation_change_submit_pair_chk CHECK((submitted_at IS NULL)=(submitted_by IS NULL)),
    CONSTRAINT compensation_change_approve_pair_chk CHECK((approved_at IS NULL)=(approved_by IS NULL)),
    CONSTRAINT compensation_change_json_chk CHECK(jsonb_typeof(metadata)='object'),
    CONSTRAINT compensation_change_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT compensation_change_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.employee_tax_declaration (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, code text NOT NULL,
    employee_id uuid NOT NULL, employment_id uuid NOT NULL, tax_year smallint NOT NULL,
    country_code character(2) NOT NULL, version_no integer NOT NULL DEFAULT 1, workflow_request_id uuid,
    submitted_at timestamptz, submitted_by uuid, approved_at timestamptz, approved_by uuid, decision_reason text,
    status document.employee_tax_declaration_status_d NOT NULL DEFAULT 'draft', status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT employee_tax_declaration_pkey PRIMARY KEY(id), CONSTRAINT employee_tax_declaration_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT employee_tax_declaration_code_uq UNIQUE(tenant_id,code),
    CONSTRAINT employee_tax_declaration_version_uq UNIQUE(tenant_id,employee_id,employment_id,country_code,tax_year,version_no),
    CONSTRAINT employee_tax_declaration_code_chk CHECK(code~'^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT employee_tax_declaration_year_chk CHECK(tax_year BETWEEN 1900 AND 9999 AND version_no>=1),
    CONSTRAINT employee_tax_declaration_submit_pair_chk CHECK((submitted_at IS NULL)=(submitted_by IS NULL)),
    CONSTRAINT employee_tax_declaration_approve_pair_chk CHECK((approved_at IS NULL)=(approved_by IS NULL)),
    CONSTRAINT employee_tax_declaration_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT employee_tax_declaration_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.employee_tax_declaration_line (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, employee_tax_declaration_id uuid NOT NULL,
    line_no smallint NOT NULL, declaration_code text NOT NULL, amount numeric(18,4), quantity numeric(18,4),
    payload jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
    updated_at timestamptz, updated_by uuid,
    CONSTRAINT employee_tax_declaration_line_pkey PRIMARY KEY(id), CONSTRAINT employee_tax_declaration_line_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT employee_tax_declaration_line_no_uq UNIQUE(tenant_id,employee_tax_declaration_id,line_no),
    CONSTRAINT employee_tax_declaration_line_number_chk CHECK(line_no>0),
    CONSTRAINT employee_tax_declaration_line_code_chk CHECK(declaration_code~'^[A-Za-z][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT employee_tax_declaration_line_value_chk CHECK(amount IS NOT NULL OR quantity IS NOT NULL),
    CONSTRAINT employee_tax_declaration_line_payload_chk CHECK(jsonb_typeof(payload)='object'),
    CONSTRAINT employee_tax_declaration_line_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.leave_request (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, code text NOT NULL,
    employee_id uuid NOT NULL, leave_type_id uuid NOT NULL, leave_plan_id uuid NOT NULL, workflow_request_id uuid,
    start_date date NOT NULL, end_date date NOT NULL, start_half text, end_half text,
    quantity_unit document.leave_quantity_unit_d NOT NULL, requested_quantity numeric(12,4) NOT NULL,
    approved_quantity numeric(12,4), reason text, attachment_required boolean NOT NULL DEFAULT false,
    submitted_at timestamptz, submitted_by uuid, approved_at timestamptz, approved_by uuid, decision_reason text,
    status document.hr_approval_status_d NOT NULL DEFAULT 'draft', status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT leave_request_pkey PRIMARY KEY(id), CONSTRAINT leave_request_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT leave_request_code_uq UNIQUE(tenant_id,code), CONSTRAINT leave_request_code_chk CHECK(code~'^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT leave_request_dates_chk CHECK(end_date>=start_date),
    CONSTRAINT leave_request_half_chk CHECK((start_half IS NULL OR start_half IN('first','second')) AND (end_half IS NULL OR end_half IN('first','second'))),
    CONSTRAINT leave_request_quantity_chk CHECK(requested_quantity>0 AND (approved_quantity IS NULL OR approved_quantity>=0)),
    CONSTRAINT leave_request_submit_pair_chk CHECK((submitted_at IS NULL)=(submitted_by IS NULL)),
    CONSTRAINT leave_request_approve_pair_chk CHECK((approved_at IS NULL)=(approved_by IS NULL)),
    CONSTRAINT leave_request_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT leave_request_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.leave_balance_entry (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, employee_id uuid NOT NULL,
    leave_plan_id uuid NOT NULL, leave_type_id uuid NOT NULL, entry_date date NOT NULL,
    period_start date, period_end date, quantity_unit document.leave_quantity_unit_d NOT NULL,
    quantity_delta numeric(12,4) NOT NULL, source_entity_type text NOT NULL, source_entity_id uuid,
    idempotency_key text NOT NULL, description text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
    CONSTRAINT leave_balance_entry_pkey PRIMARY KEY(id), CONSTRAINT leave_balance_entry_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT leave_balance_entry_idempotency_uq UNIQUE(tenant_id,idempotency_key),
    CONSTRAINT leave_balance_entry_period_chk CHECK(period_end IS NULL OR period_start IS NULL OR period_end>=period_start),
    CONSTRAINT leave_balance_entry_source_chk CHECK(source_entity_type~'^[a-z][a-z0-9_.-]{1,126}$' AND btrim(idempotency_key)<>''),
    CONSTRAINT leave_balance_entry_delta_chk CHECK(quantity_delta<>0),
    CONSTRAINT leave_balance_entry_json_chk CHECK(jsonb_typeof(metadata)='object')
);

CREATE TABLE document.people_request (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, code text NOT NULL,
    employee_id uuid NOT NULL, request_type text NOT NULL, target_entity_type text, target_entity_id uuid, workflow_request_id uuid,
    requested_payload jsonb NOT NULL DEFAULT '{}'::jsonb, approved_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    submitted_at timestamptz, submitted_by uuid, approved_at timestamptz, approved_by uuid, decision_reason text,
    status document.hr_approval_status_d NOT NULL DEFAULT 'draft', status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT people_request_pkey PRIMARY KEY(id), CONSTRAINT people_request_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT people_request_code_uq UNIQUE(tenant_id,code), CONSTRAINT people_request_code_chk CHECK(code~'^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT people_request_type_chk CHECK(request_type~'^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT people_request_target_chk CHECK((target_entity_type IS NULL)=(target_entity_id IS NULL)),
    CONSTRAINT people_request_payload_chk CHECK(jsonb_typeof(requested_payload)='object' AND jsonb_typeof(approved_payload)='object'),
    CONSTRAINT people_request_submit_pair_chk CHECK((submitted_at IS NULL)=(submitted_by IS NULL)),
    CONSTRAINT people_request_approve_pair_chk CHECK((approved_at IS NULL)=(approved_by IS NULL)),
    CONSTRAINT people_request_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT people_request_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.hr_case (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, code text NOT NULL, name text NOT NULL,
    employee_id uuid, case_type text NOT NULL DEFAULT 'general', priority document.hr_case_priority_d NOT NULL DEFAULT 'normal',
    assigned_to uuid, opened_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz, closed_at timestamptz,
    resolution_summary text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    status document.hr_case_status_d NOT NULL DEFAULT 'open', status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT hr_case_pkey PRIMARY KEY(id), CONSTRAINT hr_case_tenant_id_uq UNIQUE(tenant_id,id), CONSTRAINT hr_case_code_uq UNIQUE(tenant_id,code),
    CONSTRAINT hr_case_code_chk CHECK(code~'^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'), CONSTRAINT hr_case_name_chk CHECK(btrim(name)<>''),
    CONSTRAINT hr_case_type_chk CHECK(case_type~'^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT hr_case_dates_chk CHECK((resolved_at IS NULL OR resolved_at>=opened_at) AND (closed_at IS NULL OR closed_at>=coalesce(resolved_at,opened_at))),
    CONSTRAINT hr_case_resolution_chk CHECK(status NOT IN('resolved','closed') OR resolution_summary IS NOT NULL),
    CONSTRAINT hr_case_json_chk CHECK(jsonb_typeof(metadata)='object'),
    CONSTRAINT hr_case_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT hr_case_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.onboarding_case (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, code text NOT NULL, name text NOT NULL,
    person_id uuid NOT NULL, employee_id uuid, target_start_date date, checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
    workflow_request_id uuid, activated_at timestamptz, completed_at timestamptz,
    status document.people_case_status_d NOT NULL DEFAULT 'draft', status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT onboarding_case_pkey PRIMARY KEY(id), CONSTRAINT onboarding_case_tenant_id_uq UNIQUE(tenant_id,id), CONSTRAINT onboarding_case_code_uq UNIQUE(tenant_id,code),
    CONSTRAINT onboarding_case_code_chk CHECK(code~'^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'), CONSTRAINT onboarding_case_name_chk CHECK(btrim(name)<>''),
    CONSTRAINT onboarding_case_json_chk CHECK(jsonb_typeof(checklist)='array'),
    CONSTRAINT onboarding_case_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT onboarding_case_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.offboarding_case (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, code text NOT NULL, name text NOT NULL,
    employee_id uuid NOT NULL, target_exit_date date NOT NULL, reason_code text, checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
    workflow_request_id uuid, activated_at timestamptz, completed_at timestamptz,
    status document.people_case_status_d NOT NULL DEFAULT 'draft', status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT offboarding_case_pkey PRIMARY KEY(id), CONSTRAINT offboarding_case_tenant_id_uq UNIQUE(tenant_id,id), CONSTRAINT offboarding_case_code_uq UNIQUE(tenant_id,code),
    CONSTRAINT offboarding_case_code_chk CHECK(code~'^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'), CONSTRAINT offboarding_case_name_chk CHECK(btrim(name)<>''),
    CONSTRAINT offboarding_case_json_chk CHECK(jsonb_typeof(checklist)='array'),
    CONSTRAINT offboarding_case_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT offboarding_case_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.payroll_period (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, code text NOT NULL, name text NOT NULL,
    pay_group_id uuid NOT NULL, period_year smallint NOT NULL, period_number smallint NOT NULL,
    period_start date NOT NULL, period_end date NOT NULL, pay_date date NOT NULL,
    status document.payroll_period_status_d NOT NULL DEFAULT 'open', status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT payroll_period_pkey PRIMARY KEY(id), CONSTRAINT payroll_period_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT payroll_period_code_uq UNIQUE(tenant_id,code), CONSTRAINT payroll_period_group_period_uq UNIQUE(tenant_id,pay_group_id,period_year,period_number),
    CONSTRAINT payroll_period_code_chk CHECK(code~'^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'), CONSTRAINT payroll_period_name_chk CHECK(btrim(name)<>''),
    CONSTRAINT payroll_period_number_chk CHECK(period_number BETWEEN 1 AND 53),
    CONSTRAINT payroll_period_dates_chk CHECK(period_end>=period_start AND pay_date>=period_start),
    CONSTRAINT payroll_period_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT payroll_period_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.payroll_run (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, code text NOT NULL, name text NOT NULL,
    payroll_period_id uuid NOT NULL, run_type document.payroll_run_type_d NOT NULL DEFAULT 'regular', run_no smallint NOT NULL DEFAULT 1,
    calculation_started_at timestamptz, calculation_completed_at timestamptz,
    approved_at timestamptz, approved_by uuid, posted_at timestamptz, posted_by uuid,
    posted_journal_entry_id uuid, reversal_of_run_id uuid, idempotency_key text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    status document.payroll_run_status_d NOT NULL DEFAULT 'draft', status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT payroll_run_pkey PRIMARY KEY(id), CONSTRAINT payroll_run_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT payroll_run_code_uq UNIQUE(tenant_id,code), CONSTRAINT payroll_run_period_no_uq UNIQUE(tenant_id,payroll_period_id,run_no),
    CONSTRAINT payroll_run_idempotency_uq UNIQUE(tenant_id,idempotency_key), CONSTRAINT payroll_run_journal_uq UNIQUE(tenant_id,posted_journal_entry_id),
    CONSTRAINT payroll_run_code_chk CHECK(code~'^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'), CONSTRAINT payroll_run_name_chk CHECK(btrim(name)<>''),
    CONSTRAINT payroll_run_no_chk CHECK(run_no>=1 AND btrim(idempotency_key)<>''),
    CONSTRAINT payroll_run_calculation_pair_chk CHECK((calculation_started_at IS NULL)=(calculation_completed_at IS NULL) OR calculation_started_at IS NOT NULL),
    CONSTRAINT payroll_run_approval_pair_chk CHECK((approved_at IS NULL)=(approved_by IS NULL)),
    CONSTRAINT payroll_run_posting_pair_chk CHECK((posted_at IS NULL)=(posted_by IS NULL)),
    CONSTRAINT payroll_run_posted_chk CHECK((status IN('posted','reversed'))=(posted_journal_entry_id IS NOT NULL)),
    CONSTRAINT payroll_run_reversal_chk CHECK((run_type='correction') OR reversal_of_run_id IS NULL),
    CONSTRAINT payroll_run_json_chk CHECK(jsonb_typeof(metadata)='object'),
    CONSTRAINT payroll_run_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT payroll_run_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.payroll_run_employee (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, payroll_run_id uuid NOT NULL, employee_id uuid NOT NULL,
    compensation_assignment_id uuid NOT NULL, inclusion_reason text, exclusion_reason text, error_detail jsonb NOT NULL DEFAULT '{}'::jsonb,
    status document.payroll_run_employee_status_d NOT NULL DEFAULT 'included', status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT payroll_run_employee_pkey PRIMARY KEY(id), CONSTRAINT payroll_run_employee_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT payroll_run_employee_uq UNIQUE(tenant_id,payroll_run_id,employee_id),
    CONSTRAINT payroll_run_employee_reason_chk CHECK((status='excluded')=(exclusion_reason IS NOT NULL)),
    CONSTRAINT payroll_run_employee_error_chk CHECK(jsonb_typeof(error_detail)='object' AND (status<>'error' OR error_detail<>'{}'::jsonb)),
    CONSTRAINT payroll_run_employee_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT payroll_run_employee_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.payroll_result (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, payroll_run_id uuid NOT NULL,
    payroll_run_employee_id uuid NOT NULL, employee_id uuid NOT NULL, currency_code character(3) NOT NULL,
    gross_amount numeric(18,4) NOT NULL DEFAULT 0, employee_deduction_amount numeric(18,4) NOT NULL DEFAULT 0,
    employer_contribution_amount numeric(18,4) NOT NULL DEFAULT 0, net_amount numeric(18,4) NOT NULL DEFAULT 0,
    calculation_trace jsonb NOT NULL DEFAULT '{}'::jsonb,
    status document.payroll_result_status_d NOT NULL DEFAULT 'calculating', status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT payroll_result_pkey PRIMARY KEY(id), CONSTRAINT payroll_result_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT payroll_result_employee_uq UNIQUE(tenant_id,payroll_run_id,employee_id),
    CONSTRAINT payroll_result_run_employee_uq UNIQUE(tenant_id,payroll_run_employee_id),
    CONSTRAINT payroll_result_amount_chk CHECK(gross_amount>=0 AND employee_deduction_amount>=0 AND employer_contribution_amount>=0 AND (status='calculating' OR net_amount>=0)),
    CONSTRAINT payroll_result_net_chk CHECK(abs(net_amount-(gross_amount-employee_deduction_amount))<0.005),
    CONSTRAINT payroll_result_json_chk CHECK(jsonb_typeof(calculation_trace)='object'),
    CONSTRAINT payroll_result_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT payroll_result_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.payroll_result_line (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, payroll_result_id uuid NOT NULL,
    line_no smallint NOT NULL, pay_component_id uuid NOT NULL, component_code_snapshot text NOT NULL,
    component_type_snapshot text NOT NULL, is_employer_cost_snapshot boolean NOT NULL DEFAULT false,
    quantity numeric(18,4), rate numeric(18,8), amount numeric(18,4) NOT NULL,
    currency_code character(3) NOT NULL, formula_expression_version_id uuid,
    evaluated_inputs jsonb NOT NULL DEFAULT '{}'::jsonb, evaluated_outputs jsonb NOT NULL DEFAULT '{}'::jsonb, evaluation_trace jsonb NOT NULL DEFAULT '{}'::jsonb,
    cost_center_id uuid, profit_center_id uuid, project_id uuid, site_id uuid, gl_role text,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
    CONSTRAINT payroll_result_line_pkey PRIMARY KEY(id), CONSTRAINT payroll_result_line_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT payroll_result_line_no_uq UNIQUE(tenant_id,payroll_result_id,line_no),
    CONSTRAINT payroll_result_line_no_chk CHECK(line_no>0), CONSTRAINT payroll_result_line_amount_chk CHECK(amount>=0),
    CONSTRAINT payroll_result_line_component_chk CHECK(component_code_snapshot~'^[A-Za-z][A-Za-z0-9_.-]{0,62}$' AND component_type_snapshot IN('earning','deduction','employer_contribution','statutory','memo')),
    CONSTRAINT payroll_result_line_json_chk CHECK(jsonb_typeof(evaluated_inputs)='object' AND jsonb_typeof(evaluated_outputs)='object' AND jsonb_typeof(evaluation_trace)='object')
);

CREATE TABLE document.policy_acknowledgment (
    id                       uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid        NOT NULL,
    employee_id              uuid        NOT NULL,
    policy_definition_id     uuid        NOT NULL,
    policy_code_snapshot     text        NOT NULL,
    policy_name_snapshot     text        NOT NULL,
    policy_version_snapshot  integer     NOT NULL,
    policy_content_hash      char(64)    NOT NULL,
    acknowledgment_channel   document.policy_acknowledgment_channel_d NOT NULL DEFAULT 'self_service',
    acknowledged_at          timestamptz NOT NULL DEFAULT now(),
    acknowledged_by          uuid        NOT NULL,
    evidence_payload         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    correlation_id           uuid,
    trace_id                 char(32),
    ip_address               inet,
    user_agent               text,
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid        NOT NULL,

    CONSTRAINT policy_acknowledgment_pkey PRIMARY KEY(id),
    CONSTRAINT policy_acknowledgment_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT policy_acknowledgment_version_uq
        UNIQUE(tenant_id,employee_id,policy_definition_id,policy_version_snapshot),
    CONSTRAINT policy_acknowledgment_code_chk CHECK(
        policy_code_snapshot~'^[a-zA-Z][a-zA-Z0-9_.-]{1,126}$'
        AND btrim(policy_name_snapshot)<>''
    ),
    CONSTRAINT policy_acknowledgment_version_chk CHECK(policy_version_snapshot>0),
    CONSTRAINT policy_acknowledgment_hash_chk CHECK(policy_content_hash~'^[0-9a-f]{64}$'),
    CONSTRAINT policy_acknowledgment_time_chk CHECK(acknowledged_at<=created_at),
    CONSTRAINT policy_acknowledgment_evidence_chk CHECK(jsonb_typeof(evidence_payload)='object'),
    CONSTRAINT policy_acknowledgment_trace_chk CHECK(trace_id IS NULL OR trace_id~'^[0-9a-f]{32}$'),
    CONSTRAINT policy_acknowledgment_user_agent_chk CHECK(user_agent IS NULL OR length(user_agent)<=2048)
);

COMMENT ON TABLE document.policy_acknowledgment IS
  'Immutable employee acknowledgment evidence for a specific policy version and content hash. The corresponding business event is also written to audit.audit_log.';
