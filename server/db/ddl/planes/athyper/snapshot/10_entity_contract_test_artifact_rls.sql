ALTER TABLE snapshot.entity_contract_test_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot.entity_contract_test_run FORCE ROW LEVEL SECURITY;
ALTER TABLE snapshot.entity_contract_test_result ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot.entity_contract_test_result FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_contract_test_run_tenant_read ON snapshot.entity_contract_test_run FOR SELECT
USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY entity_contract_test_run_tenant_insert ON snapshot.entity_contract_test_run FOR INSERT
WITH CHECK (tenant_id = shared.current_tenant_id_soft() AND executed_by = master.current_principal_id_soft());
CREATE POLICY entity_contract_test_result_tenant_read ON snapshot.entity_contract_test_result FOR SELECT
USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY entity_contract_test_result_tenant_insert ON snapshot.entity_contract_test_result FOR INSERT
WITH CHECK (tenant_id = shared.current_tenant_id_soft());
