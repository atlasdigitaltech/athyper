DO $$
DECLARE v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'shift_assignment','time_punch','attendance_day','attendance_adjustment_request','compensation_change',
        'employee_tax_declaration','employee_tax_declaration_line','leave_request','leave_balance_entry','people_request',
        'hr_case','onboarding_case','offboarding_case','payroll_period','payroll_run','payroll_run_employee',
        'payroll_result','payroll_result_line'
    ] LOOP
        EXECUTE format('ALTER TABLE document.%1$I ADD CONSTRAINT %1$s_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT',v_table);
        EXECUTE format('ALTER TABLE document.%1$I ADD CONSTRAINT %1$s_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT',v_table);
        IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='document' AND table_name=v_table AND column_name='updated_by') THEN
            EXECUTE format('ALTER TABLE document.%1$I ADD CONSTRAINT %1$s_updated_by_fk FOREIGN KEY(tenant_id,updated_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT',v_table);
        END IF;
        IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='document' AND table_name=v_table AND column_name='status_changed_by') THEN
            EXECUTE format('ALTER TABLE document.%1$I ADD CONSTRAINT %1$s_status_by_fk FOREIGN KEY(tenant_id,status_changed_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT',v_table);
        END IF;
    END LOOP;
END;
$$;

ALTER TABLE document.shift_assignment
    ADD CONSTRAINT shift_assignment_employee_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES master.employee(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT shift_assignment_shift_type_fk FOREIGN KEY(tenant_id,shift_type_id) REFERENCES master.shift_type(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.time_punch
    ADD CONSTRAINT time_punch_employee_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES master.employee(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT time_punch_shift_fk FOREIGN KEY(tenant_id,shift_assignment_id) REFERENCES document.shift_assignment(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.attendance_day
    ADD CONSTRAINT attendance_day_employee_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES master.employee(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT attendance_day_shift_fk FOREIGN KEY(tenant_id,shift_assignment_id) REFERENCES document.shift_assignment(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.attendance_adjustment_request
    ADD CONSTRAINT attendance_adjustment_employee_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES master.employee(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT attendance_adjustment_day_fk FOREIGN KEY(tenant_id,attendance_day_id) REFERENCES document.attendance_day(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT attendance_adjustment_workflow_fk FOREIGN KEY(tenant_id,workflow_request_id) REFERENCES document.workflow_request(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT attendance_adjustment_submitted_by_fk FOREIGN KEY(tenant_id,submitted_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT attendance_adjustment_approved_by_fk FOREIGN KEY(tenant_id,approved_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.compensation_change
    ADD CONSTRAINT compensation_change_employee_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES master.employee(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT compensation_change_current_assignment_fk FOREIGN KEY(tenant_id,current_assignment_id) REFERENCES master.compensation_assignment(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT compensation_change_approved_assignment_fk FOREIGN KEY(tenant_id,approved_assignment_id) REFERENCES master.compensation_assignment(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT compensation_change_workflow_fk FOREIGN KEY(tenant_id,workflow_request_id) REFERENCES document.workflow_request(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT compensation_change_pay_group_fk FOREIGN KEY(tenant_id,proposed_pay_group_id) REFERENCES master.pay_group(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT compensation_change_pay_structure_fk FOREIGN KEY(tenant_id,proposed_pay_structure_id) REFERENCES master.pay_structure(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT compensation_change_currency_fk FOREIGN KEY(proposed_currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT compensation_change_submitted_by_fk FOREIGN KEY(tenant_id,submitted_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT compensation_change_approved_by_fk FOREIGN KEY(tenant_id,approved_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.employee_tax_declaration
    ADD CONSTRAINT employee_tax_declaration_employee_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES master.employee(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT employee_tax_declaration_employment_fk FOREIGN KEY(tenant_id,employment_id) REFERENCES master.employment(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT employee_tax_declaration_country_fk FOREIGN KEY(country_code) REFERENCES shared.country(code) ON DELETE RESTRICT,
    ADD CONSTRAINT employee_tax_declaration_workflow_fk FOREIGN KEY(tenant_id,workflow_request_id) REFERENCES document.workflow_request(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT employee_tax_declaration_submitted_by_fk FOREIGN KEY(tenant_id,submitted_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT employee_tax_declaration_approved_by_fk FOREIGN KEY(tenant_id,approved_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.employee_tax_declaration_line
    ADD CONSTRAINT employee_tax_declaration_line_parent_fk FOREIGN KEY(tenant_id,employee_tax_declaration_id) REFERENCES document.employee_tax_declaration(tenant_id,id) ON DELETE CASCADE;
ALTER TABLE document.leave_request
    ADD CONSTRAINT leave_request_employee_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES master.employee(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT leave_request_type_fk FOREIGN KEY(tenant_id,leave_type_id) REFERENCES master.leave_type(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT leave_request_plan_fk FOREIGN KEY(tenant_id,leave_plan_id) REFERENCES master.leave_plan(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT leave_request_workflow_fk FOREIGN KEY(tenant_id,workflow_request_id) REFERENCES document.workflow_request(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT leave_request_submitted_by_fk FOREIGN KEY(tenant_id,submitted_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT leave_request_approved_by_fk FOREIGN KEY(tenant_id,approved_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.leave_balance_entry
    ADD CONSTRAINT leave_balance_entry_employee_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES master.employee(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT leave_balance_entry_type_fk FOREIGN KEY(tenant_id,leave_type_id) REFERENCES master.leave_type(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT leave_balance_entry_plan_fk FOREIGN KEY(tenant_id,leave_plan_id) REFERENCES master.leave_plan(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.people_request
    ADD CONSTRAINT people_request_employee_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES master.employee(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT people_request_workflow_fk FOREIGN KEY(tenant_id,workflow_request_id) REFERENCES document.workflow_request(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT people_request_submitted_by_fk FOREIGN KEY(tenant_id,submitted_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT people_request_approved_by_fk FOREIGN KEY(tenant_id,approved_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.hr_case
    ADD CONSTRAINT hr_case_employee_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES master.employee(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT hr_case_assigned_to_fk FOREIGN KEY(tenant_id,assigned_to) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.onboarding_case
    ADD CONSTRAINT onboarding_case_person_fk FOREIGN KEY(tenant_id,person_id) REFERENCES master.person(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT onboarding_case_employee_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES master.employee(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT onboarding_case_workflow_fk FOREIGN KEY(tenant_id,workflow_request_id) REFERENCES document.workflow_request(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.offboarding_case
    ADD CONSTRAINT offboarding_case_employee_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES master.employee(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT offboarding_case_workflow_fk FOREIGN KEY(tenant_id,workflow_request_id) REFERENCES document.workflow_request(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.payroll_period
    ADD CONSTRAINT payroll_period_pay_group_fk FOREIGN KEY(tenant_id,pay_group_id) REFERENCES master.pay_group(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.payroll_run
    ADD CONSTRAINT payroll_run_period_fk FOREIGN KEY(tenant_id,payroll_period_id) REFERENCES document.payroll_period(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payroll_run_journal_fk FOREIGN KEY(tenant_id,posted_journal_entry_id) REFERENCES document.journal_entry(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payroll_run_reversal_of_fk FOREIGN KEY(tenant_id,reversal_of_run_id) REFERENCES document.payroll_run(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payroll_run_approved_by_fk FOREIGN KEY(tenant_id,approved_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payroll_run_posted_by_fk FOREIGN KEY(tenant_id,posted_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.payroll_run_employee
    ADD CONSTRAINT payroll_run_employee_run_fk FOREIGN KEY(tenant_id,payroll_run_id) REFERENCES document.payroll_run(tenant_id,id) ON DELETE CASCADE,
    ADD CONSTRAINT payroll_run_employee_employee_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES master.employee(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payroll_run_employee_compensation_fk FOREIGN KEY(tenant_id,compensation_assignment_id) REFERENCES master.compensation_assignment(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE document.policy_acknowledgment
    ADD CONSTRAINT policy_acknowledgment_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT policy_acknowledgment_employee_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES master.employee(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT policy_acknowledgment_policy_fk FOREIGN KEY(policy_definition_id) REFERENCES control.policy_definition(id) ON DELETE RESTRICT,
    ADD CONSTRAINT policy_acknowledgment_actor_fk FOREIGN KEY(tenant_id,acknowledged_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT policy_acknowledgment_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.payroll_result
    ADD CONSTRAINT payroll_result_run_fk FOREIGN KEY(tenant_id,payroll_run_id) REFERENCES document.payroll_run(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payroll_result_run_employee_fk FOREIGN KEY(tenant_id,payroll_run_employee_id) REFERENCES document.payroll_run_employee(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payroll_result_employee_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES master.employee(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payroll_result_currency_fk FOREIGN KEY(currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT;
ALTER TABLE document.payroll_result_line
    ADD CONSTRAINT payroll_result_line_result_fk FOREIGN KEY(tenant_id,payroll_result_id) REFERENCES document.payroll_result(tenant_id,id) ON DELETE CASCADE,
    ADD CONSTRAINT payroll_result_line_component_fk FOREIGN KEY(tenant_id,pay_component_id) REFERENCES master.pay_component(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payroll_result_line_currency_fk FOREIGN KEY(currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT payroll_result_line_formula_fk FOREIGN KEY(tenant_id,formula_expression_version_id) REFERENCES control.formula_expression_version(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payroll_result_line_cost_center_fk FOREIGN KEY(tenant_id,cost_center_id) REFERENCES master.cost_center(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payroll_result_line_profit_center_fk FOREIGN KEY(tenant_id,profit_center_id) REFERENCES master.profit_center(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payroll_result_line_project_fk FOREIGN KEY(tenant_id,project_id) REFERENCES master.project(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT payroll_result_line_site_fk FOREIGN KEY(tenant_id,site_id) REFERENCES master.site(tenant_id,id) ON DELETE RESTRICT;
