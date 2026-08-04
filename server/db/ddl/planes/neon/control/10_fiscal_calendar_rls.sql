ALTER TABLE control.fiscal_calendar_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.fiscal_calendar_config FORCE ROW LEVEL SECURITY;
CREATE POLICY fiscal_calendar_config_tenant_access
    ON control.fiscal_calendar_config FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY fiscal_calendar_config_admin_access
    ON control.fiscal_calendar_config FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

ALTER TABLE control.fiscal_calendar_period_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.fiscal_calendar_period_rule FORCE ROW LEVEL SECURITY;
CREATE POLICY fiscal_calendar_period_rule_tenant_access
    ON control.fiscal_calendar_period_rule FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY fiscal_calendar_period_rule_admin_access
    ON control.fiscal_calendar_period_rule FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

ALTER TABLE control.company_fiscal_calendar_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.company_fiscal_calendar_assignment FORCE ROW LEVEL SECURITY;
CREATE POLICY company_fiscal_calendar_assignment_tenant_access
    ON control.company_fiscal_calendar_assignment FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY company_fiscal_calendar_assignment_admin_access
    ON control.company_fiscal_calendar_assignment FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);
