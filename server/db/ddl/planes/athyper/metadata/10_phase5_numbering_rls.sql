ALTER TABLE metadata.entity_numbering_binding ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_numbering_binding FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_numbering_binding_read ON metadata.entity_numbering_binding
    FOR SELECT USING (tenant_id IS NULL OR tenant_id = shared.current_tenant_id_soft());
CREATE POLICY entity_numbering_binding_write ON metadata.entity_numbering_binding
    FOR ALL USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY entity_numbering_binding_seed_write ON metadata.entity_numbering_binding
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
