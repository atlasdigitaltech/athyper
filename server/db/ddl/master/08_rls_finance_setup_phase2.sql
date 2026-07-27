-- bank_account_link is a temporal relationship. Tenant application roles may
-- create and update it, but only platform maintenance may physically delete.
DROP POLICY IF EXISTS tenant_delete ON master.bank_account_link;

-- FX rates are tenant-isolated and append-only. Tenant roles may add quotes
-- and perform the guarded active-to-superseded transition, but never delete.
ALTER TABLE master.fx_rate ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.fx_rate FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read ON master.fx_rate;
DROP POLICY IF EXISTS tenant_insert ON master.fx_rate;
DROP POLICY IF EXISTS tenant_update ON master.fx_rate;
DROP POLICY IF EXISTS tenant_delete ON master.fx_rate;
DROP POLICY IF EXISTS admin_read ON master.fx_rate;
DROP POLICY IF EXISTS admin_write ON master.fx_rate;

CREATE POLICY tenant_read ON master.fx_rate FOR SELECT
    USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.fx_rate FOR INSERT
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.fx_rate FOR UPDATE
    USING (tenant_id = shared.current_tenant_id())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read ON master.fx_rate FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write ON master.fx_rate FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
