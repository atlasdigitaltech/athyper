CREATE INDEX entity_contract_test_run_change_set_idx ON snapshot.entity_contract_test_run (tenant_id, change_set_id, executed_at DESC);
CREATE INDEX entity_contract_test_run_revision_idx ON snapshot.entity_contract_test_run (tenant_id, revision_id) WHERE revision_id IS NOT NULL;
CREATE INDEX entity_contract_test_result_run_idx ON snapshot.entity_contract_test_result (tenant_id, test_run_id, ordinal);
