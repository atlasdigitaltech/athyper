DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'purchase_requisition','purchase_requisition_line',
        'purchase_order_confirmation','purchase_order_confirmation_line',
        'delivery_note','delivery_note_line',
        'receipt','receipt_line','service_sheet','service_sheet_line'
    ] LOOP
        EXECUTE format('ALTER TABLE document.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE document.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format(
            'CREATE POLICY tenant_access ON document.%I FOR ALL USING (tenant_id = shared.current_tenant_id_soft()) WITH CHECK (tenant_id = shared.current_tenant_id())',
            v_table
        );
        EXECUTE format('CREATE POLICY seed_write ON document.%I FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true)', v_table);
    END LOOP;
END $$;
