ALTER TABLE event.authorization_invalidation_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE event.authorization_invalidation_outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY authorization_invalidation_tenant_access ON event.authorization_invalidation_outbox
    FOR ALL USING (tenant_id = shared.current_tenant_id_soft()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY authorization_invalidation_seed_write ON event.authorization_invalidation_outbox
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
