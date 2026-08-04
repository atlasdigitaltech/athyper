ALTER TABLE master.person
    ADD CONSTRAINT person_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT person_country_fk
    FOREIGN KEY (country_code) REFERENCES shared.country (code) ON DELETE RESTRICT;

ALTER TABLE master.person_sensitive_profile
    ADD CONSTRAINT person_sensitive_profile_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT person_sensitive_profile_person_fk
    FOREIGN KEY (tenant_id, person_id)
    REFERENCES master.person (tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT person_sensitive_profile_nationality_fk
    FOREIGN KEY (nationality_country_code)
    REFERENCES shared.country (code) ON DELETE RESTRICT;

ALTER TABLE master.site
    ADD CONSTRAINT site_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT site_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT site_country_fk
    FOREIGN KEY (country_code) REFERENCES shared.country (code) ON DELETE RESTRICT,
    ADD CONSTRAINT site_timezone_fk
    FOREIGN KEY (timezone_code) REFERENCES shared.timezone (code) ON DELETE RESTRICT,
    ADD CONSTRAINT site_manager_fk
    FOREIGN KEY (manager_id) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT site_capacity_uom_fk
    FOREIGN KEY (capacity_uom) REFERENCES shared.uom (code) ON DELETE RESTRICT,
    ADD CONSTRAINT site_parent_fk
    FOREIGN KEY (tenant_id, parent_site_id)
    REFERENCES master.site (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.career_band
    ADD CONSTRAINT career_band_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;

ALTER TABLE master.career_level
    ADD CONSTRAINT career_level_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT career_level_band_fk
    FOREIGN KEY (tenant_id, career_band_id)
    REFERENCES master.career_band (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.designation
    ADD CONSTRAINT designation_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;

ALTER TABLE master.job_family
    ADD CONSTRAINT job_family_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;

ALTER TABLE master.job_function
    ADD CONSTRAINT job_function_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT job_function_family_fk
    FOREIGN KEY (tenant_id, job_family_id)
    REFERENCES master.job_family (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.pay_grade
    ADD CONSTRAINT pay_grade_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT pay_grade_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT;

ALTER TABLE master.job
    ADD CONSTRAINT job_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT job_family_fk
    FOREIGN KEY (tenant_id, job_family_id)
    REFERENCES master.job_family (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT job_function_fk
    FOREIGN KEY (tenant_id, job_function_id)
    REFERENCES master.job_function (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT job_band_fk
    FOREIGN KEY (tenant_id, career_band_id)
    REFERENCES master.career_band (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT job_level_fk
    FOREIGN KEY (tenant_id, career_level_id)
    REFERENCES master.career_level (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT job_grade_fk
    FOREIGN KEY (tenant_id, pay_grade_id)
    REFERENCES master.pay_grade (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT job_designation_fk
    FOREIGN KEY (tenant_id, designation_id)
    REFERENCES master.designation (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.holiday_calendar
    ADD CONSTRAINT holiday_calendar_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT holiday_calendar_country_fk
    FOREIGN KEY (country_code) REFERENCES shared.country (code) ON DELETE RESTRICT,
    ADD CONSTRAINT holiday_calendar_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT holiday_calendar_legal_entity_fk
    FOREIGN KEY (tenant_id, legal_entity_id)
    REFERENCES master.legal_entity (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT holiday_calendar_site_fk
    FOREIGN KEY (tenant_id, site_id)
    REFERENCES master.site (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.holiday_calendar_day
    ADD CONSTRAINT holiday_calendar_day_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT holiday_calendar_day_calendar_fk
    FOREIGN KEY (tenant_id, holiday_calendar_id)
    REFERENCES master.holiday_calendar (tenant_id, id) ON DELETE CASCADE;

ALTER TABLE master.shift_type
    ADD CONSTRAINT shift_type_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;

ALTER TABLE master.work_pattern
    ADD CONSTRAINT work_pattern_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;

ALTER TABLE master.work_pattern_day
    ADD CONSTRAINT work_pattern_day_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT work_pattern_day_pattern_fk
    FOREIGN KEY (tenant_id, work_pattern_id)
    REFERENCES master.work_pattern (tenant_id, id) ON DELETE CASCADE;

ALTER TABLE master.pay_component
    ADD CONSTRAINT pay_component_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT pay_component_formula_fk
    FOREIGN KEY (tenant_id, formula_expression_id)
    REFERENCES control.formula_expression (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.pay_group
    ADD CONSTRAINT pay_group_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT pay_group_legal_entity_fk
    FOREIGN KEY (tenant_id, legal_entity_id)
    REFERENCES master.legal_entity (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT pay_group_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT pay_group_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT pay_group_country_fk
    FOREIGN KEY (country_code) REFERENCES shared.country (code) ON DELETE RESTRICT,
    ADD CONSTRAINT pay_group_calendar_fk
    FOREIGN KEY (tenant_id, calendar_id)
    REFERENCES master.holiday_calendar (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.pay_structure
    ADD CONSTRAINT pay_structure_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT pay_structure_group_fk
    FOREIGN KEY (tenant_id, pay_group_id)
    REFERENCES master.pay_group (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT pay_structure_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT;

ALTER TABLE master.pay_structure_line
    ADD CONSTRAINT pay_structure_line_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT pay_structure_line_structure_fk
    FOREIGN KEY (tenant_id, pay_structure_id)
    REFERENCES master.pay_structure (tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT pay_structure_line_component_fk
    FOREIGN KEY (tenant_id, pay_component_id)
    REFERENCES master.pay_component (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT pay_structure_line_formula_fk
    FOREIGN KEY (tenant_id, formula_expression_id)
    REFERENCES control.formula_expression (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.statutory_scheme
    ADD CONSTRAINT statutory_scheme_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT statutory_scheme_country_fk
    FOREIGN KEY (country_code) REFERENCES shared.country (code) ON DELETE RESTRICT,
    ADD CONSTRAINT statutory_scheme_employee_component_fk
    FOREIGN KEY (tenant_id, employee_component_id)
    REFERENCES master.pay_component (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT statutory_scheme_employer_component_fk
    FOREIGN KEY (tenant_id, employer_component_id)
    REFERENCES master.pay_component (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT statutory_scheme_rate_table_fk
    FOREIGN KEY (tenant_id, rate_table_id)
    REFERENCES control.rate_table (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT statutory_scheme_formula_fk
    FOREIGN KEY (tenant_id, formula_expression_id)
    REFERENCES control.formula_expression (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.leave_type
    ADD CONSTRAINT leave_type_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;

ALTER TABLE master.leave_plan
    ADD CONSTRAINT leave_plan_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT leave_plan_type_fk
    FOREIGN KEY (tenant_id, leave_type_id)
    REFERENCES master.leave_type (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT leave_plan_country_fk
    FOREIGN KEY (country_code) REFERENCES shared.country (code) ON DELETE RESTRICT,
    ADD CONSTRAINT leave_plan_legal_entity_fk
    FOREIGN KEY (tenant_id, legal_entity_id)
    REFERENCES master.legal_entity (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT leave_plan_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.leave_plan_rule
    ADD CONSTRAINT leave_plan_rule_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT leave_plan_rule_plan_fk
    FOREIGN KEY (tenant_id, leave_plan_id)
    REFERENCES master.leave_plan (tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT leave_plan_rule_formula_fk
    FOREIGN KEY (tenant_id, accrual_formula_version_id)
    REFERENCES control.formula_expression_version (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.position
    ADD CONSTRAINT position_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT position_legal_entity_fk
    FOREIGN KEY (tenant_id, legal_entity_id)
    REFERENCES master.legal_entity (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT position_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT position_org_unit_fk
    FOREIGN KEY (tenant_id, org_unit_id)
    REFERENCES master.org_unit (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT position_job_fk
    FOREIGN KEY (tenant_id, job_id)
    REFERENCES master.job (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT position_reports_to_fk
    FOREIGN KEY (tenant_id, reports_to_position_id)
    REFERENCES master.position (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT position_cost_center_fk
    FOREIGN KEY (tenant_id, company_code_id, cost_center_id)
    REFERENCES master.cost_center (tenant_id, company_code_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT position_profit_center_fk
    FOREIGN KEY (tenant_id, company_code_id, profit_center_id)
    REFERENCES master.profit_center (tenant_id, company_code_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT position_site_fk
    FOREIGN KEY (tenant_id, company_code_id, site_id)
    REFERENCES master.site (tenant_id, company_code_id, id) ON DELETE RESTRICT;

ALTER TABLE master.employee
    ADD CONSTRAINT employee_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT employee_principal_fk
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT employee_person_fk
    FOREIGN KEY (tenant_id, person_id)
    REFERENCES master.person (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT employee_manager_fk
    FOREIGN KEY (tenant_id, manager_id)
    REFERENCES master.employee (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT employee_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.employment
    ADD CONSTRAINT employment_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT employment_person_fk
    FOREIGN KEY (tenant_id, person_id)
    REFERENCES master.person (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT employment_employee_fk
    FOREIGN KEY (tenant_id, employee_id)
    REFERENCES master.employee (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT employment_legal_entity_fk
    FOREIGN KEY (tenant_id, legal_entity_id)
    REFERENCES master.legal_entity (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT employment_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.work_assignment
    ADD CONSTRAINT work_assignment_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT work_assignment_employee_fk
    FOREIGN KEY (tenant_id, employee_id)
    REFERENCES master.employee (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT work_assignment_employment_fk
    FOREIGN KEY (tenant_id, employment_id)
    REFERENCES master.employment (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT work_assignment_position_fk
    FOREIGN KEY (tenant_id, position_id)
    REFERENCES master.position (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT work_assignment_org_unit_fk
    FOREIGN KEY (tenant_id, org_unit_id)
    REFERENCES master.org_unit (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT work_assignment_job_fk
    FOREIGN KEY (tenant_id, job_id)
    REFERENCES master.job (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT work_assignment_manager_fk
    FOREIGN KEY (tenant_id, manager_employee_id)
    REFERENCES master.employee (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT work_assignment_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT work_assignment_cost_center_fk
    FOREIGN KEY (tenant_id, company_code_id, cost_center_id)
    REFERENCES master.cost_center (tenant_id, company_code_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT work_assignment_profit_center_fk
    FOREIGN KEY (tenant_id, company_code_id, profit_center_id)
    REFERENCES master.profit_center (tenant_id, company_code_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT work_assignment_site_fk
    FOREIGN KEY (tenant_id, company_code_id, site_id)
    REFERENCES master.site (tenant_id, company_code_id, id) ON DELETE RESTRICT;

ALTER TABLE master.employee_leave_enrollment
    ADD CONSTRAINT employee_leave_enrollment_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT employee_leave_enrollment_employee_fk
    FOREIGN KEY (tenant_id, employee_id)
    REFERENCES master.employee (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT employee_leave_enrollment_plan_fk
    FOREIGN KEY (tenant_id, leave_plan_id)
    REFERENCES master.leave_plan (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.employee_statutory_enrollment
    ADD CONSTRAINT employee_statutory_enrollment_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE,
    ADD CONSTRAINT employee_statutory_enrollment_employee_fk
    FOREIGN KEY (tenant_id, employee_id)
    REFERENCES master.employee (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT employee_statutory_enrollment_scheme_fk
    FOREIGN KEY (tenant_id, statutory_scheme_id)
    REFERENCES master.statutory_scheme (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.payment_term
    ADD CONSTRAINT payment_term_holiday_calendar_fk
    FOREIGN KEY (tenant_id, holiday_calendar_id)
    REFERENCES master.holiday_calendar (tenant_id, id) ON DELETE RESTRICT;

-- Every HR row is tied to a local Neon audit actor.
ALTER TABLE master.person
    ADD CONSTRAINT person_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.person_sensitive_profile
    ADD CONSTRAINT person_sensitive_profile_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.site
    ADD CONSTRAINT site_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.career_band
    ADD CONSTRAINT career_band_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.career_level
    ADD CONSTRAINT career_level_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.designation
    ADD CONSTRAINT designation_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.job_family
    ADD CONSTRAINT job_family_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.job_function
    ADD CONSTRAINT job_function_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.pay_grade
    ADD CONSTRAINT pay_grade_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.job
    ADD CONSTRAINT job_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.holiday_calendar
    ADD CONSTRAINT holiday_calendar_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.holiday_calendar_day
    ADD CONSTRAINT holiday_calendar_day_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.shift_type
    ADD CONSTRAINT shift_type_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.work_pattern
    ADD CONSTRAINT work_pattern_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.work_pattern_day
    ADD CONSTRAINT work_pattern_day_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.pay_component
    ADD CONSTRAINT pay_component_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.pay_group
    ADD CONSTRAINT pay_group_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.pay_structure
    ADD CONSTRAINT pay_structure_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.pay_structure_line
    ADD CONSTRAINT pay_structure_line_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.statutory_scheme
    ADD CONSTRAINT statutory_scheme_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.leave_type
    ADD CONSTRAINT leave_type_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.leave_plan
    ADD CONSTRAINT leave_plan_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.leave_plan_rule
    ADD CONSTRAINT leave_plan_rule_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.position
    ADD CONSTRAINT position_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.employee
    ADD CONSTRAINT employee_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.employment
    ADD CONSTRAINT employment_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.work_assignment
    ADD CONSTRAINT work_assignment_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.employee_leave_enrollment
    ADD CONSTRAINT employee_leave_enrollment_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
ALTER TABLE master.employee_statutory_enrollment
    ADD CONSTRAINT employee_statutory_enrollment_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
