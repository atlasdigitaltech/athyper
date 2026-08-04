DO $$
DECLARE v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'asset_transaction','fx_revaluation_run','ic_elimination','match_exception',
        'netting_batch','obligation_horizon','payment_remittance_output',
        'payment_term_discount_result','wht_certificate','import_request',
        'import_request_chunk','intercompany_agreement','intercompany_transaction','render_output',
        'user_profile_update_request'
    ] LOOP
        EXECUTE format('ALTER TABLE document.%I ENABLE ROW LEVEL SECURITY',v_table);
        EXECUTE format('ALTER TABLE document.%I FORCE ROW LEVEL SECURITY',v_table);
        EXECUTE format(
            'CREATE POLICY tenant_access ON document.%I FOR ALL USING (tenant_id=shared.current_tenant_id_soft()) WITH CHECK (tenant_id=shared.current_tenant_id())',
            v_table
        );
        EXECUTE format(
            'CREATE POLICY seed_write ON document.%I FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true)',
            v_table
        );
    END LOOP;
END $$;
