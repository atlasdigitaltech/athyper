DO $$
DECLARE v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'stocktake', 'stocktake_line',
        'sales_opportunity', 'sales_opportunity_company',
        'sales_quotation', 'sales_quotation_company',
        'sales_quotation_allocation', 'sales_order_intercompany_fulfillment'
    ] LOOP
        EXECUTE format('ALTER TABLE document.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE document.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format(
            'CREATE POLICY tenant_access ON document.%I FOR ALL '
            'USING (tenant_id = shared.current_tenant_id_soft()) '
            'WITH CHECK (tenant_id = shared.current_tenant_id())', v_table
        );
        EXECUTE format(
            'CREATE POLICY seed_write ON document.%I FOR ALL TO CURRENT_USER '
            'USING (true) WITH CHECK (true)', v_table
        );
    END LOOP;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        FOREACH v_table IN ARRAY ARRAY[
            'stocktake', 'stocktake_line',
            'sales_opportunity', 'sales_opportunity_company',
            'sales_quotation', 'sales_quotation_company',
            'sales_quotation_allocation', 'sales_order_intercompany_fulfillment'
        ] LOOP
            EXECUTE format(
                'CREATE POLICY admin_access ON document.%I FOR ALL TO athyperadmin '
                'USING (true) WITH CHECK (true)', v_table
            );
        END LOOP;
    END IF;
END;
$$;
