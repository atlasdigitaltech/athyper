-- ============================================================================
-- control/08_people_formula_rls.sql
-- ============================================================================

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'formula_expression',
        'formula_expression_version',
        'rate_table',
        'rate_table_row'
    ]
    LOOP
        EXECUTE format('ALTER TABLE control.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE control.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format('DROP POLICY IF EXISTS tenant_read ON control.%I', v_table);
        EXECUTE format('DROP POLICY IF EXISTS tenant_insert ON control.%I', v_table);
        EXECUTE format('DROP POLICY IF EXISTS tenant_update ON control.%I', v_table);
        EXECUTE format('DROP POLICY IF EXISTS tenant_delete ON control.%I', v_table);
        EXECUTE format('DROP POLICY IF EXISTS admin_read ON control.%I', v_table);
        EXECUTE format('DROP POLICY IF EXISTS admin_write ON control.%I', v_table);
        EXECUTE format('CREATE POLICY tenant_read ON control.%I FOR SELECT USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft())', v_table);
        EXECUTE format('CREATE POLICY tenant_insert ON control.%I FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id())', v_table);
        EXECUTE format('CREATE POLICY tenant_update ON control.%I FOR UPDATE USING (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id())', v_table);
        EXECUTE format('CREATE POLICY tenant_delete ON control.%I FOR DELETE USING (tenant_id = shared.current_tenant_id())', v_table);
        EXECUTE format('CREATE POLICY admin_read ON control.%I FOR SELECT TO athyperadmin USING (true)', v_table);
        EXECUTE format('CREATE POLICY admin_write ON control.%I FOR ALL TO athyperadmin USING (true) WITH CHECK (true)', v_table);
    END LOOP;
END $$;
