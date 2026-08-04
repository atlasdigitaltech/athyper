ALTER TABLE control.connector_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.connector_type FORCE ROW LEVEL SECURITY;
CREATE POLICY connector_type_read ON control.connector_type FOR SELECT USING (true);
CREATE POLICY connector_type_seed_write ON control.connector_type
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'connector_instance', 'integration_endpoint', 'webhook_subscription',
        'cycle_type', 'cycle_phase', 'cycle_task_category', 'cycle_task_template',
        'cycle_task_dependency', 'cycle_cross_dependency', 'cycle_carryforward_rule'
    ]
    LOOP
        EXECUTE format('ALTER TABLE control.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE control.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format(
            'CREATE POLICY tenant_access ON control.%I FOR ALL '
            'USING (tenant_id = shared.current_tenant_id_soft()) '
            'WITH CHECK (tenant_id = shared.current_tenant_id())',
            v_table
        );
        EXECUTE format(
            'CREATE POLICY seed_write ON control.%I FOR ALL TO CURRENT_USER '
            'USING (true) WITH CHECK (true)',
            v_table
        );
    END LOOP;
END;
$$;
