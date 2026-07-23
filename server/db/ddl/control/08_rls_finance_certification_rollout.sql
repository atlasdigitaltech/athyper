ALTER TABLE control.finance_posting_rollout_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.finance_posting_rollout_policy FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read ON control.finance_posting_rollout_policy;
DROP POLICY IF EXISTS tenant_insert ON control.finance_posting_rollout_policy;
DROP POLICY IF EXISTS tenant_update ON control.finance_posting_rollout_policy;
DROP POLICY IF EXISTS tenant_delete ON control.finance_posting_rollout_policy;
DROP POLICY IF EXISTS admin_read ON control.finance_posting_rollout_policy;
DROP POLICY IF EXISTS admin_write ON control.finance_posting_rollout_policy;
CREATE POLICY tenant_read ON control.finance_posting_rollout_policy FOR SELECT USING (tenant_id=shared.current_tenant_id());
CREATE POLICY tenant_insert ON control.finance_posting_rollout_policy FOR INSERT WITH CHECK (tenant_id=shared.current_tenant_id());
CREATE POLICY tenant_update ON control.finance_posting_rollout_policy FOR UPDATE USING (tenant_id=shared.current_tenant_id()) WITH CHECK (tenant_id=shared.current_tenant_id());
CREATE POLICY tenant_delete ON control.finance_posting_rollout_policy FOR DELETE USING (tenant_id=shared.current_tenant_id());
CREATE POLICY admin_read ON control.finance_posting_rollout_policy FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write ON control.finance_posting_rollout_policy FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

