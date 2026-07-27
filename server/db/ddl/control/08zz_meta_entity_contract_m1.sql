-- ============================================================================
-- Meta Entity Contract M1: fail-closed tenant isolation for governed
-- projections and runtime-only numbering state.
-- ============================================================================

DO $$
DECLARE
    v_table regclass;
    v_name text;
BEGIN
    FOREACH v_name IN ARRAY ARRAY[
        'control.entity_flow',
        'control.entity_flow_step',
        'control.entity_flow_section',
        'control.entity_flow_field',
        'control.entity_lifecycle_state_mask',
        'control.entity_numbering_config',
        'control.entity_numbering_counter',
        'control.entity_action_rule'
    ]
    LOOP
        v_table := to_regclass(v_name);
        IF v_table IS NULL THEN
            RAISE EXCEPTION 'M1 RLS target % does not exist', v_name;
        END IF;

        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', v_table);

        EXECUTE format('DROP POLICY IF EXISTS m1_scoped_read ON %s', v_table);
        EXECUTE format('DROP POLICY IF EXISTS m1_tenant_insert ON %s', v_table);
        EXECUTE format('DROP POLICY IF EXISTS m1_tenant_update ON %s', v_table);
        EXECUTE format('DROP POLICY IF EXISTS m1_tenant_delete ON %s', v_table);
        EXECUTE format('DROP POLICY IF EXISTS m1_admin_all ON %s', v_table);

        EXECUTE format(
            'CREATE POLICY m1_scoped_read ON %s FOR SELECT USING (' ||
            'tenant_id IS NULL OR (' ||
            'shared.current_tenant_id_soft() IS NOT NULL ' ||
            'AND tenant_id = shared.current_tenant_id_soft()))',
            v_table
        );
        EXECUTE format(
            'CREATE POLICY m1_tenant_insert ON %s FOR INSERT WITH CHECK (' ||
            'tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id())',
            v_table
        );
        EXECUTE format(
            'CREATE POLICY m1_tenant_update ON %s FOR UPDATE USING (' ||
            'tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id()) ' ||
            'WITH CHECK (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id())',
            v_table
        );
        EXECUTE format(
            'CREATE POLICY m1_tenant_delete ON %s FOR DELETE USING (' ||
            'tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id())',
            v_table
        );
        EXECUTE format(
            'CREATE POLICY m1_admin_all ON %s FOR ALL TO athyperadmin ' ||
            'USING (true) WITH CHECK (true)',
            v_table
        );
    END LOOP;
END $$;

COMMENT ON TABLE control.entity_numbering_counter IS
    'Runtime-only numbering state protected by forced RLS. Metadata publish, clone, import, and rollback must not mutate it.';
