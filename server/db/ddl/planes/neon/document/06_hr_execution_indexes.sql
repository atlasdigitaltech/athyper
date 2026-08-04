CREATE INDEX shift_assignment_employee_date_idx ON document.shift_assignment(tenant_id,employee_id,work_date DESC);
CREATE INDEX shift_assignment_type_idx ON document.shift_assignment(tenant_id,shift_type_id,work_date DESC);
CREATE INDEX time_punch_employee_time_idx ON document.time_punch(tenant_id,employee_id,punch_at DESC);
CREATE INDEX time_punch_shift_idx ON document.time_punch(tenant_id,shift_assignment_id,punch_at) WHERE shift_assignment_id IS NOT NULL;
CREATE INDEX attendance_day_shift_idx ON document.attendance_day(tenant_id,shift_assignment_id) WHERE shift_assignment_id IS NOT NULL;
CREATE INDEX attendance_adjustment_employee_idx ON document.attendance_adjustment_request(tenant_id,employee_id,status);
CREATE INDEX attendance_adjustment_day_idx ON document.attendance_adjustment_request(tenant_id,attendance_day_id) WHERE attendance_day_id IS NOT NULL;
CREATE INDEX attendance_adjustment_workflow_idx ON document.attendance_adjustment_request(tenant_id,workflow_request_id) WHERE workflow_request_id IS NOT NULL;
CREATE INDEX compensation_change_employee_idx ON document.compensation_change(tenant_id,employee_id,effective_date DESC);
CREATE INDEX compensation_change_current_idx ON document.compensation_change(tenant_id,current_assignment_id) WHERE current_assignment_id IS NOT NULL;
CREATE INDEX compensation_change_workflow_idx ON document.compensation_change(tenant_id,workflow_request_id) WHERE workflow_request_id IS NOT NULL;
CREATE INDEX employee_tax_declaration_employee_idx ON document.employee_tax_declaration(tenant_id,employee_id,tax_year DESC);
CREATE INDEX employee_tax_declaration_workflow_idx ON document.employee_tax_declaration(tenant_id,workflow_request_id) WHERE workflow_request_id IS NOT NULL;
CREATE UNIQUE INDEX employee_tax_declaration_one_approved_idx ON document.employee_tax_declaration(tenant_id,employee_id,employment_id,country_code,tax_year) WHERE status='approved';
CREATE INDEX leave_request_employee_idx ON document.leave_request(tenant_id,employee_id,start_date DESC,status);
CREATE INDEX leave_request_workflow_idx ON document.leave_request(tenant_id,workflow_request_id) WHERE workflow_request_id IS NOT NULL;
CREATE INDEX leave_balance_employee_idx ON document.leave_balance_entry(tenant_id,employee_id,leave_type_id,entry_date DESC);
CREATE INDEX leave_balance_source_idx ON document.leave_balance_entry(tenant_id,source_entity_type,source_entity_id) WHERE source_entity_id IS NOT NULL;
CREATE INDEX people_request_employee_idx ON document.people_request(tenant_id,employee_id,status);
CREATE INDEX people_request_workflow_idx ON document.people_request(tenant_id,workflow_request_id) WHERE workflow_request_id IS NOT NULL;
CREATE INDEX hr_case_employee_idx ON document.hr_case(tenant_id,employee_id,status) WHERE employee_id IS NOT NULL;
CREATE INDEX hr_case_assignee_idx ON document.hr_case(tenant_id,assigned_to,status) WHERE assigned_to IS NOT NULL;
CREATE INDEX onboarding_case_person_idx ON document.onboarding_case(tenant_id,person_id,status);
CREATE INDEX onboarding_case_employee_idx ON document.onboarding_case(tenant_id,employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX offboarding_case_employee_idx ON document.offboarding_case(tenant_id,employee_id,status);
CREATE INDEX payroll_period_group_date_idx ON document.payroll_period(tenant_id,pay_group_id,period_start DESC);
CREATE INDEX payroll_run_period_status_idx ON document.payroll_run(tenant_id,payroll_period_id,status);
CREATE INDEX payroll_run_reversal_idx ON document.payroll_run(tenant_id,reversal_of_run_id) WHERE reversal_of_run_id IS NOT NULL;
CREATE INDEX payroll_run_employee_employee_idx ON document.payroll_run_employee(tenant_id,employee_id,payroll_run_id);
CREATE INDEX payroll_run_employee_compensation_idx ON document.payroll_run_employee(tenant_id,compensation_assignment_id);
CREATE INDEX payroll_result_run_idx ON document.payroll_result(tenant_id,payroll_run_id,status);
CREATE INDEX payroll_result_line_component_idx ON document.payroll_result_line(tenant_id,pay_component_id);
CREATE INDEX payroll_result_line_cost_center_idx ON document.payroll_result_line(tenant_id,cost_center_id) WHERE cost_center_id IS NOT NULL;
CREATE INDEX payroll_result_line_project_idx ON document.payroll_result_line(tenant_id,project_id) WHERE project_id IS NOT NULL;
CREATE INDEX policy_acknowledgment_employee_idx
    ON document.policy_acknowledgment(tenant_id,employee_id,acknowledged_at DESC);
CREATE INDEX policy_acknowledgment_policy_idx
    ON document.policy_acknowledgment(tenant_id,policy_definition_id,policy_version_snapshot);
CREATE INDEX policy_acknowledgment_actor_idx
    ON document.policy_acknowledgment(tenant_id,acknowledged_by,acknowledged_at DESC);
CREATE INDEX policy_acknowledgment_correlation_idx
    ON document.policy_acknowledgment(correlation_id) WHERE correlation_id IS NOT NULL;
