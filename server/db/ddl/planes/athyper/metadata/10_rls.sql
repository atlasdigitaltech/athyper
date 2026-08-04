ALTER TABLE metadata.entity ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity FORCE ROW LEVEL SECURITY;

CREATE POLICY entity_tenant_read ON metadata.entity
    FOR SELECT TO athyperapp
    USING (
        tenant_id IS NULL
        OR tenant_id = shared.current_tenant_id_soft()
    );

CREATE POLICY entity_tenant_insert ON metadata.entity
    FOR INSERT TO athyperapp
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND created_by = master.current_principal_id_soft()
    );

CREATE POLICY entity_tenant_update ON metadata.entity
    FOR UPDATE TO athyperapp
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

ALTER TABLE metadata.entity_change_set ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_change_set FORCE ROW LEVEL SECURITY;

CREATE POLICY entity_change_set_tenant_read ON metadata.entity_change_set
    FOR SELECT TO athyperapp
    USING (
        tenant_id IS NULL
        OR tenant_id = shared.current_tenant_id_soft()
    );

CREATE POLICY entity_change_set_tenant_insert ON metadata.entity_change_set
    FOR INSERT TO athyperapp
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND created_by = master.current_principal_id_soft()
    );

CREATE POLICY entity_change_set_tenant_update ON metadata.entity_change_set
    FOR UPDATE TO athyperapp
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

ALTER TABLE metadata.entity_release ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_release FORCE ROW LEVEL SECURITY;

CREATE POLICY entity_release_tenant_read ON metadata.entity_release
    FOR SELECT TO athyperapp
    USING (
        tenant_id IS NULL
        OR tenant_id = shared.current_tenant_id_soft()
    );

CREATE POLICY entity_release_tenant_insert ON metadata.entity_release
    FOR INSERT TO athyperapp
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND published_by = master.current_principal_id_soft()
    );

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        CREATE POLICY admin_access ON metadata.entity
            FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
        CREATE POLICY admin_access ON metadata.entity_change_set
            FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
        CREATE POLICY admin_access ON metadata.entity_release
            FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
    END IF;
END;
$$;
