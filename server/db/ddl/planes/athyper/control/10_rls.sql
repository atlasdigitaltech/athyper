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

ALTER TABLE control.workflow_sla_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.workflow_sla_policy FORCE ROW LEVEL SECURITY;
ALTER TABLE control.bank_format_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.bank_format_rule FORCE ROW LEVEL SECURITY;

CREATE POLICY workflow_sla_policy_admin_access ON control.workflow_sla_policy
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
CREATE POLICY workflow_sla_policy_tenant_read ON control.workflow_sla_policy
    FOR SELECT TO athyperapp
    USING (tenant_id IS NULL OR tenant_id = shared.current_tenant_id_soft());
CREATE POLICY bank_format_rule_admin_access ON control.bank_format_rule
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
CREATE POLICY bank_format_rule_tenant_read ON control.bank_format_rule
    FOR SELECT TO athyperapp
    USING (tenant_id IS NULL OR tenant_id = shared.current_tenant_id_soft());
