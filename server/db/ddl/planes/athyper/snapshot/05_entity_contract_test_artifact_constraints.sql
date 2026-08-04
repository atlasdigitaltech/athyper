ALTER TABLE snapshot.entity_contract_test_run ADD CONSTRAINT entity_contract_test_run_entity_fk
    FOREIGN KEY (source_tenant_id, entity_id) REFERENCES metadata.entity (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE snapshot.entity_contract_test_run ADD CONSTRAINT entity_contract_test_run_change_set_fk
    FOREIGN KEY (source_tenant_id, change_set_id) REFERENCES metadata.entity_change_set (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE snapshot.entity_contract_test_run ADD CONSTRAINT entity_contract_test_run_revision_fk
    FOREIGN KEY (source_tenant_id, revision_id) REFERENCES snapshot.entity_contract_revision (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE snapshot.entity_contract_test_run ADD CONSTRAINT entity_contract_test_run_actor_fk
    FOREIGN KEY (tenant_id, executed_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE snapshot.entity_contract_test_result ADD CONSTRAINT entity_contract_test_result_run_fk
    FOREIGN KEY (tenant_id, test_run_id) REFERENCES snapshot.entity_contract_test_run (tenant_id, id) ON DELETE RESTRICT;
