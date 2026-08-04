ALTER TABLE snapshot.entity_numbering_test_artifact
    ADD CONSTRAINT entity_numbering_test_artifact_entity_fk
        FOREIGN KEY (source_tenant_id, entity_id) REFERENCES metadata.entity (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_numbering_test_artifact_change_set_fk
        FOREIGN KEY (source_tenant_id, change_set_id) REFERENCES metadata.entity_change_set (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_numbering_test_artifact_binding_fk
        FOREIGN KEY (source_tenant_id, numbering_binding_id) REFERENCES metadata.entity_numbering_binding (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_numbering_test_artifact_actor_fk
        FOREIGN KEY (tenant_id, executed_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

