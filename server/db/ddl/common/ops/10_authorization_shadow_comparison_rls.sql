ALTER TABLE ops.authorization_shadow_comparison ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.authorization_shadow_comparison FORCE ROW LEVEL SECURITY;

CREATE POLICY authorization_shadow_insert ON ops.authorization_shadow_comparison
FOR INSERT WITH CHECK (
    tenant_id=shared.current_tenant_id()
    AND principal_id=master.current_principal_id_soft()
    AND created_by=principal_id
    AND plane_code=current_setting('app.database_plane',true));

CREATE POLICY authorization_shadow_seed_access ON ops.authorization_shadow_comparison
FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
        CREATE POLICY authorization_shadow_admin_access ON ops.authorization_shadow_comparison
        FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
    END IF;
END $$;

