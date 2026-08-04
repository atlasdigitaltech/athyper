ALTER TABLE snapshot.entity_release_artifact ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot.entity_release_artifact FORCE ROW LEVEL SECURITY;

CREATE POLICY entity_release_artifact_read
    ON snapshot.entity_release_artifact
    FOR SELECT
    USING (tenant_id IS NULL OR tenant_id = shared.current_tenant_id_soft());

CREATE POLICY entity_release_artifact_seed_write
    ON snapshot.entity_release_artifact
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        CREATE POLICY entity_release_artifact_admin
            ON snapshot.entity_release_artifact
            FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
    END IF;
END
$$;
