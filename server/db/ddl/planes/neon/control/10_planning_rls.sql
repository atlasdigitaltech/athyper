DO $$
DECLARE v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'planning_model', 'planning_driver', 'planning_driver_dependency'
    ]
    LOOP
        EXECUTE format('ALTER TABLE control.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE control.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format(
            'CREATE POLICY tenant_access ON control.%I FOR ALL '
            'USING (tenant_id = shared.current_tenant_id_soft()) '
            'WITH CHECK (tenant_id = shared.current_tenant_id())', v_table);
        EXECUTE format(
            'CREATE POLICY seed_write ON control.%I FOR ALL TO CURRENT_USER '
            'USING (true) WITH CHECK (true)', v_table);
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
            EXECUTE format(
                'CREATE POLICY admin_access ON control.%I FOR ALL TO athyperadmin '
                'USING (true) WITH CHECK (true)', v_table);
        END IF;
    END LOOP;
END;
$$;
