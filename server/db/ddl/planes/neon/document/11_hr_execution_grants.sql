DO $$ BEGIN
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
        GRANT USAGE ON SCHEMA document TO athyperapp;
        GRANT SELECT,INSERT,UPDATE ON
            document.shift_assignment,document.time_punch,document.attendance_day,document.attendance_adjustment_request,
            document.compensation_change,document.employee_tax_declaration,document.employee_tax_declaration_line,
            document.leave_request,document.people_request,document.hr_case,document.onboarding_case,document.offboarding_case,
            document.payroll_period,document.payroll_run,document.payroll_run_employee,document.payroll_result
        TO athyperapp;
        GRANT SELECT,INSERT ON document.leave_balance_entry,document.payroll_result_line TO athyperapp;
        GRANT SELECT,INSERT ON document.policy_acknowledgment TO athyperapp;
    END IF;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            document.shift_assignment,document.time_punch,document.attendance_day,document.attendance_adjustment_request,
            document.compensation_change,document.employee_tax_declaration,document.employee_tax_declaration_line,
            document.leave_request,document.leave_balance_entry,document.people_request,document.hr_case,
            document.onboarding_case,document.offboarding_case,document.payroll_period,document.payroll_run,
            document.payroll_run_employee,document.payroll_result,document.payroll_result_line,
            document.policy_acknowledgment
        TO athyperadmin;
    END IF;
END $$;
