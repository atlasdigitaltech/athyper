DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'comment_moderation','channel_consent','cycle_run','cycle_task',
        'cycle_deviation','cycle_certification','legal_hold','legal_hold_manifest','report_pack'
    ]
    LOOP
        EXECUTE format('ALTER TABLE governance.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE governance.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format(
            'CREATE POLICY tenant_access ON governance.%I FOR ALL '
            'USING (tenant_id = shared.current_tenant_id_soft()) '
            'WITH CHECK (tenant_id = shared.current_tenant_id())', v_table
        );
        EXECUTE format(
            'CREATE POLICY seed_write ON governance.%I FOR ALL TO CURRENT_USER '
            'USING (true) WITH CHECK (true)', v_table
        );
    END LOOP;
END;
$$;
