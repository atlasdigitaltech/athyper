DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY['bom', 'bom_component']
    LOOP
        EXECUTE format('ALTER TABLE snapshot.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE snapshot.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format(
            'CREATE POLICY tenant_read ON snapshot.%I FOR SELECT '
            'USING (tenant_id = shared.current_tenant_id_soft())',
            v_table
        );
        EXECUTE format(
            'CREATE POLICY tenant_insert ON snapshot.%I FOR INSERT '
            'WITH CHECK (tenant_id = shared.current_tenant_id())',
            v_table
        );
        EXECUTE format(
            'CREATE POLICY seed_write ON snapshot.%I FOR ALL TO CURRENT_USER '
            'USING (true) WITH CHECK (true)',
            v_table
        );
    END LOOP;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        FOREACH v_table IN ARRAY ARRAY['bom', 'bom_component']
        LOOP
            EXECUTE format(
                'CREATE POLICY admin_access ON snapshot.%I FOR ALL TO athyperadmin '
                'USING (true) WITH CHECK (true)',
                v_table
            );
        END LOOP;
    END IF;
END;
$$;
