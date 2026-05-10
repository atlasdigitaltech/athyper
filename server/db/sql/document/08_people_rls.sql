-- ============================================================================
-- document/08_people_rls.sql
-- ============================================================================

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'shift_assignment',
        'time_punch',
        'attendance_day',
        'attendance_adjustment_request',
        'leave_request',
        'leave_balance_entry',
        'compensation_assignment',
        'compensation_change',
        'payroll_period',
        'payroll_run',
        'payroll_run_employee',
        'payroll_result',
        'payroll_result_line',
        'employee_tax_declaration',
        'employee_tax_declaration_line',
        'hr_case',
        'onboarding_case',
        'offboarding_case',
        'policy_acknowledgment',
        'people_request'
    ]
    LOOP
        EXECUTE format('ALTER TABLE document.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE document.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format('DROP POLICY IF EXISTS tenant_read ON document.%I', v_table);
        EXECUTE format('DROP POLICY IF EXISTS tenant_insert ON document.%I', v_table);
        EXECUTE format('DROP POLICY IF EXISTS tenant_update ON document.%I', v_table);
        EXECUTE format('DROP POLICY IF EXISTS tenant_delete ON document.%I', v_table);
        EXECUTE format('DROP POLICY IF EXISTS admin_read ON document.%I', v_table);
        EXECUTE format('DROP POLICY IF EXISTS admin_write ON document.%I', v_table);
        EXECUTE format('CREATE POLICY tenant_read ON document.%I FOR SELECT USING (tenant_id = shared.current_tenant_id_soft())', v_table);
        EXECUTE format('CREATE POLICY tenant_insert ON document.%I FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id())', v_table);
        EXECUTE format('CREATE POLICY tenant_update ON document.%I FOR UPDATE USING (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id())', v_table);
        EXECUTE format('CREATE POLICY tenant_delete ON document.%I FOR DELETE USING (tenant_id = shared.current_tenant_id())', v_table);
        EXECUTE format('CREATE POLICY admin_read ON document.%I FOR SELECT TO athyperadmin USING (true)', v_table);
        EXECUTE format('CREATE POLICY admin_write ON document.%I FOR ALL TO athyperadmin USING (true) WITH CHECK (true)', v_table);
    END LOOP;
END $$;
