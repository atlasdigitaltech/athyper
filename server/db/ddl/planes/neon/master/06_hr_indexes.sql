CREATE INDEX person_name_idx
    ON master.person (tenant_id, lower(COALESCE(display_name, name)));
CREATE INDEX person_email_idx
    ON master.person (tenant_id, lower(primary_email))
    WHERE primary_email IS NOT NULL;
CREATE INDEX person_sensitive_profile_person_idx
    ON master.person_sensitive_profile (tenant_id, person_id);

CREATE INDEX site_company_idx
    ON master.site (tenant_id, company_code_id, status);
CREATE INDEX site_parent_idx
    ON master.site (tenant_id, parent_site_id)
    WHERE parent_site_id IS NOT NULL;

CREATE INDEX career_level_band_idx
    ON master.career_level (tenant_id, career_band_id, level_no);
CREATE INDEX job_function_family_idx
    ON master.job_function (tenant_id, job_family_id)
    WHERE job_family_id IS NOT NULL;
CREATE INDEX job_classification_idx
    ON master.job (tenant_id, job_family_id, job_function_id, status);
CREATE INDEX job_grade_idx
    ON master.job (tenant_id, pay_grade_id)
    WHERE pay_grade_id IS NOT NULL;

CREATE UNIQUE INDEX holiday_calendar_one_default_uq
    ON master.holiday_calendar
       (tenant_id, COALESCE(company_code_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(site_id, '00000000-0000-0000-0000-000000000000'::uuid))
    WHERE is_default AND status = 'active';
CREATE INDEX holiday_calendar_scope_idx
    ON master.holiday_calendar
       (tenant_id, country_code, company_code_id, legal_entity_id, site_id);
CREATE INDEX holiday_calendar_day_year_idx
    ON master.holiday_calendar_day
       (tenant_id, holiday_calendar_id, calendar_year, holiday_date);

CREATE INDEX pay_component_type_idx
    ON master.pay_component (tenant_id, component_type, status);
CREATE INDEX pay_component_formula_idx
    ON master.pay_component (tenant_id, formula_expression_id)
    WHERE formula_expression_id IS NOT NULL;
CREATE INDEX pay_group_company_idx
    ON master.pay_group (tenant_id, company_code_id, status);
CREATE UNIQUE INDEX pay_structure_one_active_per_group_uq
    ON master.pay_structure (tenant_id, pay_group_id, effective_from)
    WHERE status = 'active' AND pay_group_id IS NOT NULL;
CREATE INDEX pay_structure_line_component_idx
    ON master.pay_structure_line (tenant_id, pay_component_id);
CREATE INDEX statutory_scheme_country_idx
    ON master.statutory_scheme (tenant_id, country_code, scheme_type, status);

CREATE INDEX leave_plan_type_idx
    ON master.leave_plan (tenant_id, leave_type_id, status);
CREATE INDEX leave_plan_scope_idx
    ON master.leave_plan (tenant_id, company_code_id, legal_entity_id, country_code);
CREATE INDEX leave_plan_rule_priority_idx
    ON master.leave_plan_rule (tenant_id, leave_plan_id, priority)
    WHERE status = 'active';

CREATE INDEX position_job_idx
    ON master.position (tenant_id, job_id)
    WHERE job_id IS NOT NULL;
CREATE INDEX position_org_unit_idx
    ON master.position (tenant_id, org_unit_id)
    WHERE org_unit_id IS NOT NULL;
CREATE INDEX position_reports_to_idx
    ON master.position (tenant_id, reports_to_position_id)
    WHERE reports_to_position_id IS NOT NULL;

CREATE UNIQUE INDEX employee_principal_uq
    ON master.employee (tenant_id, principal_id)
    WHERE principal_id IS NOT NULL;
CREATE INDEX employee_manager_idx
    ON master.employee (tenant_id, manager_id)
    WHERE manager_id IS NOT NULL;
CREATE INDEX employee_company_idx
    ON master.employee (tenant_id, company_code_id, status);

CREATE INDEX employment_person_idx
    ON master.employment (tenant_id, person_id);
CREATE INDEX employment_employee_idx
    ON master.employment (tenant_id, employee_id)
    WHERE employee_id IS NOT NULL;
CREATE UNIQUE INDEX employment_one_active_fulltime_per_company_uq
    ON master.employment (tenant_id, person_id, company_code_id)
    WHERE employment_status = 'active' AND employment_type = 'full_time';

CREATE INDEX work_assignment_employee_idx
    ON master.work_assignment (tenant_id, employee_id, effective_from DESC);
CREATE INDEX work_assignment_position_idx
    ON master.work_assignment (tenant_id, position_id)
    WHERE position_id IS NOT NULL;
CREATE UNIQUE INDEX work_assignment_one_primary_active_uq
    ON master.work_assignment (tenant_id, employee_id)
    WHERE assignment_type = 'primary' AND status = 'active' AND effective_until IS NULL;

CREATE INDEX leave_enrollment_employee_idx
    ON master.employee_leave_enrollment (tenant_id, employee_id, effective_from DESC);
CREATE INDEX statutory_enrollment_employee_idx
    ON master.employee_statutory_enrollment (tenant_id, employee_id, effective_from DESC);

CREATE INDEX work_pattern_day_pattern_idx
    ON master.work_pattern_day (tenant_id, work_pattern_id, day_no);
