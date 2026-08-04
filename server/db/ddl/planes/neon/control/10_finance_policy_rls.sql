ALTER TABLE control.rounding_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.rounding_rule FORCE ROW LEVEL SECURITY;

CREATE POLICY rounding_rule_tenant_access
    ON control.rounding_rule FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY rounding_rule_seed_write
    ON control.rounding_rule FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

ALTER TABLE control.procurement_match_tolerance_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.procurement_match_tolerance_policy FORCE ROW LEVEL SECURITY;

CREATE POLICY procurement_match_tolerance_tenant_access
    ON control.procurement_match_tolerance_policy FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY procurement_match_tolerance_seed_write
    ON control.procurement_match_tolerance_policy FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

ALTER TABLE control.fx_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.fx_policy FORCE ROW LEVEL SECURITY;

CREATE POLICY fx_policy_tenant_access
    ON control.fx_policy FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY fx_policy_seed_write
    ON control.fx_policy FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

ALTER TABLE control.dimension_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.dimension_policy FORCE ROW LEVEL SECURITY;

CREATE POLICY dimension_policy_tenant_access
    ON control.dimension_policy FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY dimension_policy_admin_access
    ON control.dimension_policy FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

ALTER TABLE control.dimension_policy_allowed_value ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.dimension_policy_allowed_value FORCE ROW LEVEL SECURITY;

CREATE POLICY dimension_policy_allowed_value_tenant_access
    ON control.dimension_policy_allowed_value FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY dimension_policy_allowed_value_admin_access
    ON control.dimension_policy_allowed_value FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);
