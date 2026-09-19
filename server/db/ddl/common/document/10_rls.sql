ALTER TABLE document.work_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.work_item FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON document.work_item
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON document.work_item
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

DO $$ DECLARE v_table text; BEGIN
  FOREACH v_table IN ARRAY ARRAY['entity_case','entity_case_command_evidence','entity_case_validation','entity_case_materialization'] LOOP
    EXECUTE format('ALTER TABLE document.%I ENABLE ROW LEVEL SECURITY',v_table);
    EXECUTE format('ALTER TABLE document.%I FORCE ROW LEVEL SECURITY',v_table);
    EXECUTE format('CREATE POLICY tenant_access ON document.%I FOR ALL USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id())',v_table);
    EXECUTE format('CREATE POLICY seed_write ON document.%I FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true)',v_table);
  END LOOP;
END $$;
