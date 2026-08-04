ALTER TABLE runtime_meta.authorization_epoch ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_meta.authorization_epoch FORCE ROW LEVEL SECURITY;
CREATE POLICY authorization_epoch_read ON runtime_meta.authorization_epoch FOR SELECT
    USING (scope_kind = 'global' OR tenant_id = shared.current_tenant_id_soft());
CREATE POLICY authorization_epoch_seed_write ON runtime_meta.authorization_epoch
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
