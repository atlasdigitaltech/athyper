ALTER TABLE event.descriptor_invalidation_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE event.descriptor_invalidation_outbox FORCE ROW LEVEL SECURITY;

CREATE POLICY descriptor_invalidation_local_access
    ON event.descriptor_invalidation_outbox
    FOR ALL TO athyperapp
    USING (
        tenant_id IS NULL
        OR tenant_id = shared.current_tenant_id_soft()
    )
    WITH CHECK (
        tenant_id IS NULL
        OR tenant_id = shared.current_tenant_id()
    );

CREATE POLICY descriptor_invalidation_admin_access
    ON event.descriptor_invalidation_outbox
    FOR ALL TO athyperadmin
    USING (true)
    WITH CHECK (true);
