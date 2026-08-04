DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON
            master.person,
            master.site,
            master.career_band,
            master.career_level,
            master.designation,
            master.job_family,
            master.job_function,
            master.pay_grade,
            master.job,
            master.holiday_calendar,
            master.holiday_calendar_day,
            master.shift_type,
            master.work_pattern,
            master.work_pattern_day,
            master.pay_component,
            master.pay_group,
            master.pay_structure,
            master.pay_structure_line,
            master.statutory_scheme,
            master.leave_type,
            master.leave_plan,
            master.leave_plan_rule,
            master.position,
            master.employee,
            master.employment,
            master.work_assignment,
            master.employee_leave_enrollment,
            master.employee_statutory_enrollment
        TO athyperapp;

        -- Sensitive attributes are read-only to the generic runtime role.
        -- A future dedicated HR writer role may receive narrowly scoped writes.
        GRANT SELECT ON master.person_sensitive_profile TO athyperapp;
        GRANT SELECT ON master.v_employee TO athyperapp;

        GRANT EXECUTE ON FUNCTION master.trg_set_site_hierarchy() TO athyperapp;
        GRANT EXECUTE ON FUNCTION master.trg_validate_work_assignment_contract() TO athyperapp;
    END IF;
END;
$$;
