ALTER TABLE snapshot.entity_numbering_test_artifact ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot.entity_numbering_test_artifact FORCE ROW LEVEL SECURITY;

CREATE POLICY entity_numbering_test_artifact_tenant_read ON snapshot.entity_numbering_test_artifact FOR SELECT
USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY entity_numbering_test_artifact_tenant_insert ON snapshot.entity_numbering_test_artifact FOR INSERT
WITH CHECK (tenant_id = shared.current_tenant_id_soft() AND executed_by = master.current_principal_id_soft());

