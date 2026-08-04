ALTER TABLE control.policy_definition ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.policy_definition FORCE ROW LEVEL SECURITY;

CREATE POLICY policy_definition_admin_access
    ON control.policy_definition
    FOR ALL
    TO athyperadmin
    USING (true)
    WITH CHECK (true);

CREATE POLICY policy_definition_tenant_read
    ON control.policy_definition
    FOR SELECT
    TO athyperapp
    USING (
        tenant_id IS NULL
        OR (
            shared.current_tenant_id_soft() IS NOT NULL
            AND tenant_id = shared.current_tenant_id_soft()
        )
    );
