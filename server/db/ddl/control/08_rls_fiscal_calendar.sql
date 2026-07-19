-- Tenant isolation remains mandatory even while fine-grained finance setup
-- permissions are introduced later.
ALTER TABLE control.fiscal_calendar_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.fiscal_calendar_config FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read ON control.fiscal_calendar_config;
DROP POLICY IF EXISTS tenant_insert ON control.fiscal_calendar_config;
DROP POLICY IF EXISTS tenant_update ON control.fiscal_calendar_config;
DROP POLICY IF EXISTS tenant_delete ON control.fiscal_calendar_config;
DROP POLICY IF EXISTS admin_read ON control.fiscal_calendar_config;
DROP POLICY IF EXISTS admin_write ON control.fiscal_calendar_config;
CREATE POLICY tenant_read ON control.fiscal_calendar_config FOR SELECT
    USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON control.fiscal_calendar_config FOR INSERT
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON control.fiscal_calendar_config FOR UPDATE
    USING (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON control.fiscal_calendar_config FOR DELETE
    USING (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read ON control.fiscal_calendar_config FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write ON control.fiscal_calendar_config FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

ALTER TABLE control.fiscal_calendar_period_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.fiscal_calendar_period_rule FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read ON control.fiscal_calendar_period_rule;
DROP POLICY IF EXISTS tenant_insert ON control.fiscal_calendar_period_rule;
DROP POLICY IF EXISTS tenant_update ON control.fiscal_calendar_period_rule;
DROP POLICY IF EXISTS tenant_delete ON control.fiscal_calendar_period_rule;
DROP POLICY IF EXISTS admin_read ON control.fiscal_calendar_period_rule;
DROP POLICY IF EXISTS admin_write ON control.fiscal_calendar_period_rule;
CREATE POLICY tenant_read ON control.fiscal_calendar_period_rule FOR SELECT
    USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON control.fiscal_calendar_period_rule FOR INSERT
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON control.fiscal_calendar_period_rule FOR UPDATE
    USING (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON control.fiscal_calendar_period_rule FOR DELETE
    USING (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read ON control.fiscal_calendar_period_rule FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write ON control.fiscal_calendar_period_rule FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

ALTER TABLE control.company_fiscal_calendar_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.company_fiscal_calendar_assignment FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read ON control.company_fiscal_calendar_assignment;
DROP POLICY IF EXISTS tenant_insert ON control.company_fiscal_calendar_assignment;
DROP POLICY IF EXISTS tenant_update ON control.company_fiscal_calendar_assignment;
DROP POLICY IF EXISTS tenant_delete ON control.company_fiscal_calendar_assignment;
DROP POLICY IF EXISTS admin_read ON control.company_fiscal_calendar_assignment;
DROP POLICY IF EXISTS admin_write ON control.company_fiscal_calendar_assignment;
CREATE POLICY tenant_read ON control.company_fiscal_calendar_assignment FOR SELECT
    USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON control.company_fiscal_calendar_assignment FOR INSERT
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON control.company_fiscal_calendar_assignment FOR UPDATE
    USING (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON control.company_fiscal_calendar_assignment FOR DELETE
    USING (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read ON control.company_fiscal_calendar_assignment FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write ON control.company_fiscal_calendar_assignment FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
