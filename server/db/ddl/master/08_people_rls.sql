-- ============================================================================
-- master/08_people_rls.sql
-- ============================================================================

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'person',
        'external_reference',
        'org_unit',
        'job_family',
        'job_function',
        'career_band',
        'career_level',
        'pay_grade',
        'designation',
        'job',
        'position',
        'employment',
        'work_assignment',
        'work_pattern',
        'work_pattern_day',
        'shift_type',
        'leave_type',
        'leave_plan',
        'leave_plan_rule',
        'employee_leave_enrollment',
        'pay_group',
        'pay_component',
        'pay_structure',
        'pay_structure_line',
        'statutory_scheme',
        'employee_statutory_enrollment'
    ]
    LOOP
        EXECUTE format('ALTER TABLE master.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE master.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format('DROP POLICY IF EXISTS tenant_read ON master.%I', v_table);
        EXECUTE format('DROP POLICY IF EXISTS tenant_insert ON master.%I', v_table);
        EXECUTE format('DROP POLICY IF EXISTS tenant_update ON master.%I', v_table);
        EXECUTE format('DROP POLICY IF EXISTS tenant_delete ON master.%I', v_table);
        EXECUTE format('DROP POLICY IF EXISTS admin_read ON master.%I', v_table);
        EXECUTE format('DROP POLICY IF EXISTS admin_write ON master.%I', v_table);
        EXECUTE format('CREATE POLICY tenant_read ON master.%I FOR SELECT USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft())', v_table);
        EXECUTE format('CREATE POLICY tenant_insert ON master.%I FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id())', v_table);
        EXECUTE format('CREATE POLICY tenant_update ON master.%I FOR UPDATE USING (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id())', v_table);
        EXECUTE format('CREATE POLICY tenant_delete ON master.%I FOR DELETE USING (tenant_id = shared.current_tenant_id())', v_table);
        EXECUTE format('CREATE POLICY admin_read ON master.%I FOR SELECT TO athyperadmin USING (true)', v_table);
        EXECUTE format('CREATE POLICY admin_write ON master.%I FOR ALL TO athyperadmin USING (true) WITH CHECK (true)', v_table);
    END LOOP;
END $$;

ALTER TABLE master.person_sensitive_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.person_sensitive_profile FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read ON master.person_sensitive_profile;
DROP POLICY IF EXISTS tenant_insert ON master.person_sensitive_profile;
DROP POLICY IF EXISTS tenant_update ON master.person_sensitive_profile;
DROP POLICY IF EXISTS tenant_delete ON master.person_sensitive_profile;
DROP POLICY IF EXISTS hr_pii_read ON master.person_sensitive_profile;
DROP POLICY IF EXISTS hr_pii_insert ON master.person_sensitive_profile;
DROP POLICY IF EXISTS hr_pii_update ON master.person_sensitive_profile;
DROP POLICY IF EXISTS hr_pii_delete ON master.person_sensitive_profile;
DROP POLICY IF EXISTS admin_read ON master.person_sensitive_profile;
DROP POLICY IF EXISTS admin_write ON master.person_sensitive_profile;

CREATE POLICY hr_pii_read ON master.person_sensitive_profile
    FOR SELECT USING (
        shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft()
        AND (
            'PPL.PII.VIEW' = ANY(string_to_array(coalesce(current_setting('app.permissions', true), ''), ','))
            OR 'PPL.PII.EDIT' = ANY(string_to_array(coalesce(current_setting('app.permissions', true), ''), ','))
        )
    );

CREATE POLICY hr_pii_insert ON master.person_sensitive_profile
    FOR INSERT WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND 'PPL.PII.EDIT' = ANY(string_to_array(coalesce(current_setting('app.permissions', true), ''), ','))
    );

CREATE POLICY hr_pii_update ON master.person_sensitive_profile
    FOR UPDATE USING (
        tenant_id = shared.current_tenant_id()
        AND 'PPL.PII.EDIT' = ANY(string_to_array(coalesce(current_setting('app.permissions', true), ''), ','))
    )
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND 'PPL.PII.EDIT' = ANY(string_to_array(coalesce(current_setting('app.permissions', true), ''), ','))
    );

CREATE POLICY hr_pii_delete ON master.person_sensitive_profile
    FOR DELETE USING (
        tenant_id = shared.current_tenant_id()
        AND 'PPL.PII.EDIT' = ANY(string_to_array(coalesce(current_setting('app.permissions', true), ''), ','))
    );

CREATE POLICY admin_read ON master.person_sensitive_profile FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write ON master.person_sensitive_profile FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
