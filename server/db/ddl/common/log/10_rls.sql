DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY['notification_delivery_attempt','notification_dlq'] LOOP
        EXECUTE format('ALTER TABLE log.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE log.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format('CREATE POLICY notification_log_tenant_access ON log.%I FOR ALL USING (tenant_id = shared.current_tenant_id_soft()) WITH CHECK (tenant_id = shared.current_tenant_id())', v_table);
        EXECUTE format('CREATE POLICY notification_log_seed_write ON log.%I FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true)', v_table);
    END LOOP;
END;
$$;
