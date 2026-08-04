DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'entity_surface', 'entity_surface_section', 'entity_surface_field_binding', 'entity_operation'
    ] LOOP
        EXECUTE format('ALTER TABLE metadata.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE metadata.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format('CREATE POLICY tenant_read ON metadata.%I FOR SELECT TO athyperapp USING (tenant_id IS NULL OR tenant_id = shared.current_tenant_id_soft())', v_table);
        EXECUTE format('CREATE POLICY tenant_insert ON metadata.%I FOR INSERT TO athyperapp WITH CHECK (tenant_id = shared.current_tenant_id() AND created_by = master.current_principal_id_soft())', v_table);
        EXECUTE format('CREATE POLICY tenant_update ON metadata.%I FOR UPDATE TO athyperapp USING (tenant_id = shared.current_tenant_id_soft()) WITH CHECK (tenant_id = shared.current_tenant_id())', v_table);
        EXECUTE format('CREATE POLICY tenant_delete ON metadata.%I FOR DELETE TO athyperapp USING (tenant_id = shared.current_tenant_id_soft())', v_table);
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
            EXECUTE format('CREATE POLICY admin_access ON metadata.%I FOR ALL TO athyperadmin USING (true) WITH CHECK (true)', v_table);
        END IF;
    END LOOP;
END;
$$;
