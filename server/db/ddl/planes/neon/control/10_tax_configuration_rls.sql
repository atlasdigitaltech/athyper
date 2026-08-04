DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'tax_rate_schedule',
        'tax_group',
        'tax_group_component',
        'tax_resolution_rule',
        'wht_threshold_config'
    ] LOOP
        EXECUTE format('ALTER TABLE control.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE control.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format(
            'CREATE POLICY %I ON control.%I FOR ALL USING '
            || '(tenant_id = shared.current_tenant_id_soft()) WITH CHECK '
            || '(tenant_id = shared.current_tenant_id())',
            v_table || '_tenant_access', v_table
        );
        EXECUTE format(
            'CREATE POLICY %I ON control.%I FOR ALL TO CURRENT_USER '
            || 'USING (true) WITH CHECK (true)',
            v_table || '_foundation_owner_access', v_table
        );
    END LOOP;
END;
$$;
