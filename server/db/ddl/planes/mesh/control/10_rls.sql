ALTER TABLE control.subscription_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.subscription_plan FORCE ROW LEVEL SECURITY;

CREATE POLICY open_read ON control.subscription_plan FOR SELECT USING (true);
CREATE POLICY seed_write ON control.subscription_plan
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE control.owner_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.owner_type FORCE ROW LEVEL SECURITY;
ALTER TABLE control.owner_type_purpose ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.owner_type_purpose FORCE ROW LEVEL SECURITY;

CREATE POLICY accessible_read ON control.owner_type
    FOR SELECT
    USING (
        tenant_id IS NULL
        OR tenant_id = shared.current_tenant_id_soft()
    );

CREATE POLICY seed_write ON control.owner_type
    FOR ALL TO CURRENT_USER
    USING (true)
    WITH CHECK (true);

CREATE POLICY accessible_read ON control.owner_type_purpose
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
              FROM control.owner_type ot
             WHERE ot.id = owner_type_id
               AND (
                   ot.tenant_id IS NULL
                   OR ot.tenant_id = shared.current_tenant_id_soft()
               )
        )
    );

CREATE POLICY seed_write ON control.owner_type_purpose
    FOR ALL TO CURRENT_USER
    USING (true)
    WITH CHECK (true);

ALTER TABLE control.network_document_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.network_document_type FORCE ROW LEVEL SECURITY;

CREATE POLICY active_read ON control.network_document_type
    FOR SELECT USING (status = 'active');

CREATE POLICY seed_write ON control.network_document_type
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE control.delivery_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.delivery_policy FORCE ROW LEVEL SECURITY;
CREATE POLICY delivery_policy_account_read ON control.delivery_policy FOR SELECT TO athyperapp
    USING (tenant_id = shared.current_tenant_id_soft() AND (network_account_id IS NULL OR network_account_id = mesh.current_network_account_id_soft()));
CREATE POLICY delivery_policy_account_write ON control.delivery_policy FOR ALL TO athyperapp
    USING (tenant_id = shared.current_tenant_id_soft() AND network_account_id = mesh.current_network_account_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id() AND network_account_id = mesh.current_network_account_id_soft());
CREATE POLICY delivery_policy_seed_write ON control.delivery_policy FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE control.routing_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.routing_rule FORCE ROW LEVEL SECURITY;
ALTER TABLE control.retention_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.retention_policy FORCE ROW LEVEL SECURITY;
ALTER TABLE control.quota_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.quota_policy FORCE ROW LEVEL SECURITY;

CREATE POLICY routing_rule_admin_access ON control.routing_rule
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
CREATE POLICY routing_rule_account_access ON control.routing_rule
    FOR ALL TO athyperapp
    USING (tenant_id = shared.current_tenant_id_soft()
           AND network_account_id = mesh.current_network_account_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id()
                AND network_account_id = mesh.current_network_account_id_soft());
CREATE POLICY retention_policy_admin_access ON control.retention_policy
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
CREATE POLICY retention_policy_account_access ON control.retention_policy
    FOR ALL TO athyperapp
    USING (tenant_id = shared.current_tenant_id_soft()
           AND network_account_id = mesh.current_network_account_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id()
                AND network_account_id = mesh.current_network_account_id_soft());
CREATE POLICY quota_policy_admin_access ON control.quota_policy
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
CREATE POLICY quota_policy_account_access ON control.quota_policy
    FOR ALL TO athyperapp
    USING (tenant_id = shared.current_tenant_id_soft()
           AND network_account_id = mesh.current_network_account_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id()
                AND network_account_id = mesh.current_network_account_id_soft());
