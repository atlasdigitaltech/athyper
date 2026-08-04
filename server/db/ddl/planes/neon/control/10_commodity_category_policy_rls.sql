DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'commodity_category_buy_policy',
        'commodity_category_sell_policy',
        'commodity_category_inventory_policy'
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

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        FOREACH v_table IN ARRAY ARRAY[
            'commodity_category_buy_policy',
            'commodity_category_sell_policy',
            'commodity_category_inventory_policy'
        ]
        LOOP
            EXECUTE format(
                'CREATE POLICY admin_access ON control.%I FOR ALL TO athyperadmin '
                'USING (true) WITH CHECK (true)',
                v_table
            );
        END LOOP;
    END IF;
END;
$$;
