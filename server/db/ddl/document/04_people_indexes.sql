-- ============================================================================
-- document/04_people_indexes.sql
-- ============================================================================

CREATE INDEX IF NOT EXISTS shift_assignment_employee_date_idx ON document.shift_assignment (tenant_id, employee_id, work_date DESC);
CREATE INDEX IF NOT EXISTS time_punch_employee_time_idx ON document.time_punch (tenant_id, employee_id, punch_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS time_punch_employee_timestamp_uq
    ON document.time_punch (tenant_id, employee_id, punch_at)
    WHERE status = 'accepted';
CREATE INDEX IF NOT EXISTS attendance_day_employee_date_idx ON document.attendance_day (tenant_id, employee_id, attendance_date DESC);
CREATE INDEX IF NOT EXISTS attendance_adjustment_workflow_idx ON document.attendance_adjustment_request (tenant_id, workflow_request_id) WHERE workflow_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS leave_request_employee_dates_idx ON document.leave_request (tenant_id, employee_id, start_date DESC, end_date DESC);
CREATE INDEX IF NOT EXISTS leave_request_type_status_idx ON document.leave_request (tenant_id, leave_type_id, status);
CREATE INDEX IF NOT EXISTS leave_request_workflow_idx ON document.leave_request (tenant_id, workflow_request_id) WHERE workflow_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS leave_balance_employee_type_idx ON document.leave_balance_entry (tenant_id, employee_id, leave_type_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS leave_balance_plan_employee_idx ON document.leave_balance_entry (tenant_id, leave_plan_id, employee_id) WHERE leave_plan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS compensation_assignment_employee_idx ON document.compensation_assignment (tenant_id, employee_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS compensation_assignment_employment_idx ON document.compensation_assignment (tenant_id, employment_id) WHERE employment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS compensation_assignment_one_open_active_uq
    ON document.compensation_assignment (tenant_id, employee_id, pay_group_id)
    WHERE effective_until IS NULL AND status = 'active';
CREATE INDEX IF NOT EXISTS compensation_change_workflow_idx ON document.compensation_change (tenant_id, workflow_request_id) WHERE workflow_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payroll_period_group_idx ON document.payroll_period (tenant_id, pay_group_id, period_year, period_number);
CREATE INDEX IF NOT EXISTS payroll_run_period_idx ON document.payroll_run (tenant_id, payroll_period_id, run_no);
CREATE INDEX IF NOT EXISTS payroll_result_run_idx ON document.payroll_result (tenant_id, payroll_run_id);
CREATE INDEX IF NOT EXISTS payroll_result_employee_idx ON document.payroll_result (tenant_id, employee_id);
CREATE INDEX IF NOT EXISTS payroll_result_line_result_idx ON document.payroll_result_line (tenant_id, payroll_result_id, line_no);
CREATE INDEX IF NOT EXISTS payroll_result_line_component_idx ON document.payroll_result_line (tenant_id, pay_component_id);
CREATE INDEX IF NOT EXISTS tax_declaration_employee_idx ON document.employee_tax_declaration (tenant_id, employee_id, tax_year DESC);
CREATE UNIQUE INDEX IF NOT EXISTS employee_tax_declaration_year_uq_nonnull
    ON document.employee_tax_declaration (tenant_id, employee_id, employment_id, country_code, tax_year)
    WHERE employment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS employee_tax_declaration_year_uq_null
    ON document.employee_tax_declaration (tenant_id, employee_id, country_code, tax_year)
    WHERE employment_id IS NULL;
CREATE INDEX IF NOT EXISTS hr_case_employee_status_idx ON document.hr_case (tenant_id, employee_id, status) WHERE employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS hr_case_assigned_status_idx ON document.hr_case (tenant_id, assigned_to, status) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS onboarding_case_target_start_idx ON document.onboarding_case (tenant_id, target_start_date) WHERE target_start_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS policy_acknowledgment_policy_idx ON document.policy_acknowledgment (tenant_id, policy_code, policy_version);
CREATE INDEX IF NOT EXISTS people_request_workflow_idx ON document.people_request (tenant_id, workflow_request_id) WHERE workflow_request_id IS NOT NULL;
