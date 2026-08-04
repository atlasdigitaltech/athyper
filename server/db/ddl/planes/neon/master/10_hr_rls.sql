ALTER TABLE master.person ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.person FORCE ROW LEVEL SECURITY;
ALTER TABLE master.person_sensitive_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.person_sensitive_profile FORCE ROW LEVEL SECURITY;
ALTER TABLE master.site ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.site FORCE ROW LEVEL SECURITY;
ALTER TABLE master.career_band ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.career_band FORCE ROW LEVEL SECURITY;
ALTER TABLE master.career_level ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.career_level FORCE ROW LEVEL SECURITY;
ALTER TABLE master.designation ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.designation FORCE ROW LEVEL SECURITY;
ALTER TABLE master.job_family ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.job_family FORCE ROW LEVEL SECURITY;
ALTER TABLE master.job_function ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.job_function FORCE ROW LEVEL SECURITY;
ALTER TABLE master.pay_grade ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.pay_grade FORCE ROW LEVEL SECURITY;
ALTER TABLE master.job ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.job FORCE ROW LEVEL SECURITY;
ALTER TABLE master.holiday_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.holiday_calendar FORCE ROW LEVEL SECURITY;
ALTER TABLE master.holiday_calendar_day ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.holiday_calendar_day FORCE ROW LEVEL SECURITY;
ALTER TABLE master.shift_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.shift_type FORCE ROW LEVEL SECURITY;
ALTER TABLE master.work_pattern ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.work_pattern FORCE ROW LEVEL SECURITY;
ALTER TABLE master.work_pattern_day ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.work_pattern_day FORCE ROW LEVEL SECURITY;
ALTER TABLE master.pay_component ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.pay_component FORCE ROW LEVEL SECURITY;
ALTER TABLE master.pay_group ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.pay_group FORCE ROW LEVEL SECURITY;
ALTER TABLE master.pay_structure ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.pay_structure FORCE ROW LEVEL SECURITY;
ALTER TABLE master.pay_structure_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.pay_structure_line FORCE ROW LEVEL SECURITY;
ALTER TABLE master.statutory_scheme ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.statutory_scheme FORCE ROW LEVEL SECURITY;
ALTER TABLE master.leave_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.leave_type FORCE ROW LEVEL SECURITY;
ALTER TABLE master.leave_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.leave_plan FORCE ROW LEVEL SECURITY;
ALTER TABLE master.leave_plan_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.leave_plan_rule FORCE ROW LEVEL SECURITY;
ALTER TABLE master.position ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.position FORCE ROW LEVEL SECURITY;
ALTER TABLE master.employee ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.employee FORCE ROW LEVEL SECURITY;
ALTER TABLE master.employment ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.employment FORCE ROW LEVEL SECURITY;
ALTER TABLE master.work_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.work_assignment FORCE ROW LEVEL SECURITY;
ALTER TABLE master.employee_leave_enrollment ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.employee_leave_enrollment FORCE ROW LEVEL SECURITY;
ALTER TABLE master.employee_statutory_enrollment ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.employee_statutory_enrollment FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'person', 'person_sensitive_profile', 'site',
        'career_band', 'career_level', 'designation', 'job_family',
        'job_function', 'pay_grade', 'job', 'holiday_calendar',
        'holiday_calendar_day', 'shift_type', 'work_pattern',
        'work_pattern_day', 'pay_component', 'pay_group', 'pay_structure',
        'pay_structure_line', 'statutory_scheme', 'leave_type', 'leave_plan',
        'leave_plan_rule', 'position', 'employee', 'employment',
        'work_assignment', 'employee_leave_enrollment',
        'employee_statutory_enrollment'
    ]
    LOOP
        EXECUTE format(
            'CREATE POLICY tenant_access ON master.%I '
            'FOR ALL USING (tenant_id = shared.current_tenant_id_soft()) '
            'WITH CHECK (tenant_id = shared.current_tenant_id())',
            v_table
        );
        EXECUTE format(
            'CREATE POLICY seed_write ON master.%I '
            'FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true)',
            v_table
        );
    END LOOP;
END;
$$;
