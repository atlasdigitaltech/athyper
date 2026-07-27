-- ============================================================================
-- Meta Entity Contract M3: fail-closed transition and plane artifact access.
-- ============================================================================

DO $$
DECLARE
    v_table regclass;
    v_name text;
BEGIN
    FOREACH v_name IN ARRAY ARRAY[
        'control.entity_contract_transition',
        'snapshot.entity_plane_compiled'
    ]
    LOOP
        v_table := to_regclass(v_name);
        IF v_table IS NULL THEN
            RAISE EXCEPTION 'M3 RLS target % does not exist', v_name;
        END IF;

        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format('DROP POLICY IF EXISTS m3_scoped_read ON %s', v_table);
        EXECUTE format('DROP POLICY IF EXISTS m3_tenant_write ON %s', v_table);
        EXECUTE format('DROP POLICY IF EXISTS m3_admin_all ON %s', v_table);
        EXECUTE format(
            'CREATE POLICY m3_scoped_read ON %s FOR SELECT USING (' ||
            'tenant_id IS NULL OR (shared.current_tenant_id_soft() IS NOT NULL ' ||
            'AND tenant_id = shared.current_tenant_id_soft()))',
            v_table
        );
        EXECUTE format(
            'CREATE POLICY m3_tenant_write ON %s FOR ALL USING (' ||
            'tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id()) ' ||
            'WITH CHECK (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id())',
            v_table
        );
        EXECUTE format(
            'CREATE POLICY m3_admin_all ON %s FOR ALL TO athyperadmin ' ||
            'USING (true) WITH CHECK (true)',
            v_table
        );
    END LOOP;
END $$;

