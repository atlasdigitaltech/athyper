ALTER TABLE control.atlas_conversation_retention_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.atlas_conversation_retention_policy FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read ON control.atlas_conversation_retention_policy;
DROP POLICY IF EXISTS tenant_write ON control.atlas_conversation_retention_policy;
DROP POLICY IF EXISTS admin_write ON control.atlas_conversation_retention_policy;

CREATE POLICY tenant_read ON control.atlas_conversation_retention_policy
    FOR SELECT
    USING (
        shared.current_tenant_id_soft() IS NOT NULL
        AND tenant_id = shared.current_tenant_id_soft()
    );

CREATE POLICY tenant_write ON control.atlas_conversation_retention_policy
    FOR ALL
    USING (tenant_id = shared.current_tenant_id())
    WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY admin_write ON control.atlas_conversation_retention_policy
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
