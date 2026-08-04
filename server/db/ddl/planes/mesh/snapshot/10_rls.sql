ALTER TABLE snapshot.template_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot.template_version FORCE ROW LEVEL SECURITY;

CREATE POLICY template_version_tenant_read
    ON snapshot.template_version
    FOR SELECT
    USING (tenant_id = shared.current_tenant_id_soft());

CREATE POLICY template_version_tenant_insert
    ON snapshot.template_version
    FOR INSERT
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND created_by = master.current_principal_id_soft()
    );

CREATE POLICY seed_write ON snapshot.template_version
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        CREATE POLICY admin_access ON snapshot.template_version
            FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
    END IF;
END;
$$;
