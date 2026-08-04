CREATE TRIGGER trg_person_status_changed
BEFORE UPDATE OF status ON master.person
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_site_hierarchy
BEFORE INSERT OR UPDATE OF tenant_id, company_code_id, parent_site_id
ON master.site
FOR EACH ROW EXECUTE FUNCTION master.trg_set_site_hierarchy();

CREATE TRIGGER trg_site_status_changed
BEFORE UPDATE OF status ON master.site
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_holiday_calendar_status_changed
BEFORE UPDATE OF status ON master.holiday_calendar
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_employee_status_changed
BEFORE UPDATE OF status ON master.employee
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_work_assignment_contract
BEFORE INSERT OR UPDATE OF tenant_id, employee_id, employment_id, company_code_id
ON master.work_assignment
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_work_assignment_contract();

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
            'CREATE TRIGGER %I BEFORE UPDATE ON master.%I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',
            'trg_' || v_table || '_updated_at',
            v_table
        );
    END LOOP;
END;
$$;
