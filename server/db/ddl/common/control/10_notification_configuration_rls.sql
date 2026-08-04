ALTER TABLE control.notification_provider ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.notification_provider FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_provider_read ON control.notification_provider FOR SELECT USING (true);
CREATE POLICY notification_provider_runtime_write ON control.notification_provider FOR INSERT TO athyperapp WITH CHECK (true);
CREATE POLICY notification_provider_runtime_update ON control.notification_provider FOR UPDATE TO athyperapp USING (true) WITH CHECK (true);
CREATE POLICY notification_provider_seed_write ON control.notification_provider FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
DO $$ DECLARE v_table text; BEGIN FOREACH v_table IN ARRAY ARRAY['notification_template','notification_routing_rule'] LOOP
  EXECUTE format('ALTER TABLE control.%I ENABLE ROW LEVEL SECURITY', v_table); EXECUTE format('ALTER TABLE control.%I FORCE ROW LEVEL SECURITY', v_table);
  EXECUTE format('CREATE POLICY notification_read ON control.%I FOR SELECT USING (tenant_id IS NULL OR tenant_id = shared.current_tenant_id_soft())', v_table);
  EXECUTE format('CREATE POLICY notification_tenant_write ON control.%I FOR ALL USING (tenant_id = shared.current_tenant_id_soft()) WITH CHECK (tenant_id = shared.current_tenant_id())', v_table);
  EXECUTE format('CREATE POLICY notification_seed_write ON control.%I FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true)', v_table);
END LOOP; END $$;
