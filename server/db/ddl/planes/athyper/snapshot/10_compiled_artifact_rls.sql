ALTER TABLE snapshot.compiled_artifact ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot.compiled_artifact FORCE ROW LEVEL SECURITY;

CREATE POLICY compiled_artifact_tenant_read
    ON snapshot.compiled_artifact
    FOR SELECT
    USING (tenant_id = shared.current_tenant_id_soft());

CREATE POLICY seed_write ON snapshot.compiled_artifact
    FOR ALL TO CURRENT_USER
    USING (true)
    WITH CHECK (true);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        CREATE POLICY admin_access ON snapshot.compiled_artifact
            FOR ALL TO athyperadmin
            USING (true)
            WITH CHECK (true);
    END IF;
END;
$$;
