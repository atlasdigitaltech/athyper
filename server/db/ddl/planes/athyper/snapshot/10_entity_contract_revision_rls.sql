ALTER TABLE snapshot.entity_contract_revision ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot.entity_contract_revision FORCE ROW LEVEL SECURITY;

CREATE POLICY entity_contract_revision_tenant_read
    ON snapshot.entity_contract_revision
    FOR SELECT TO athyperapp
    USING (
        tenant_id IS NULL
        OR tenant_id = shared.current_tenant_id_soft()
    );

CREATE POLICY entity_contract_revision_tenant_insert
    ON snapshot.entity_contract_revision
    FOR INSERT TO athyperapp
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND captured_by = master.current_principal_id_soft()
    );

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        CREATE POLICY admin_access ON snapshot.entity_contract_revision
            FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
    END IF;
END;
$$;
