DO $$
DECLARE v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'shift_assignment','time_punch','attendance_day','attendance_adjustment_request','compensation_change',
        'employee_tax_declaration','employee_tax_declaration_line','leave_request','leave_balance_entry','people_request',
        'hr_case','onboarding_case','offboarding_case','payroll_period','payroll_run','payroll_run_employee',
        'payroll_result','payroll_result_line'
    ] LOOP
        EXECUTE format('ALTER TABLE document.%I ENABLE ROW LEVEL SECURITY',v_table);
        EXECUTE format('ALTER TABLE document.%I FORCE ROW LEVEL SECURITY',v_table);
        EXECUTE format('CREATE POLICY tenant_access ON document.%I FOR ALL USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id())',v_table);
        EXECUTE format('CREATE POLICY seed_write ON document.%I FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true)',v_table);
    END LOOP;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
        FOREACH v_table IN ARRAY ARRAY[
            'shift_assignment','time_punch','attendance_day','attendance_adjustment_request','compensation_change',
            'employee_tax_declaration','employee_tax_declaration_line','leave_request','leave_balance_entry','people_request',
            'hr_case','onboarding_case','offboarding_case','payroll_period','payroll_run','payroll_run_employee',
            'payroll_result','payroll_result_line'
        ] LOOP EXECUTE format('CREATE POLICY admin_access ON document.%I FOR ALL TO athyperadmin USING(true) WITH CHECK(true)',v_table); END LOOP;
    END IF;
END;
$$;

ALTER TABLE document.policy_acknowledgment ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.policy_acknowledgment FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_read ON document.policy_acknowledgment FOR SELECT
    USING(tenant_id=shared.current_tenant_id_soft());
CREATE POLICY principal_insert ON document.policy_acknowledgment FOR INSERT
    WITH CHECK(
        tenant_id=shared.current_tenant_id()
        AND acknowledged_by=master.current_principal_id_soft()
        AND created_by=master.current_principal_id_soft()
    );
CREATE POLICY seed_write ON document.policy_acknowledgment FOR ALL TO CURRENT_USER
    USING(true) WITH CHECK(true);

DO $$
BEGIN
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
        EXECUTE 'CREATE POLICY admin_access ON document.policy_acknowledgment FOR ALL TO athyperadmin USING(true) WITH CHECK(true)';
    END IF;
END;
$$;
