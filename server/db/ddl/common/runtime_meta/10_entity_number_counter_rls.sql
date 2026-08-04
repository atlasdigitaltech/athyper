ALTER TABLE runtime_meta.entity_number_counter ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_meta.entity_number_counter FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_number_counter_tenant_access ON runtime_meta.entity_number_counter
    FOR ALL USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY entity_number_counter_seed_write ON runtime_meta.entity_number_counter
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
