ALTER TABLE snapshot.template_version
    ADD CONSTRAINT template_version_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE snapshot.template_version
    ADD CONSTRAINT template_version_template_fk
    FOREIGN KEY (tenant_id, template_id)
    REFERENCES master.template (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE snapshot.template_version
    ADD CONSTRAINT template_version_locale_fk
    FOREIGN KEY (locale_code)
    REFERENCES shared.locale (code)
    ON DELETE RESTRICT;

ALTER TABLE snapshot.template_version
    ADD CONSTRAINT template_version_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE snapshot.compiled_artifact
    ADD CONSTRAINT compiled_artifact_source_fk
    FOREIGN KEY (tenant_id, source_snapshot_id)
    REFERENCES snapshot.entity_snapshot_identity (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE snapshot.compiled_artifact
    ADD CONSTRAINT compiled_artifact_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE snapshot.entity_contract_revision
    ADD CONSTRAINT entity_contract_revision_entity_fk
    FOREIGN KEY (entity_id)
    REFERENCES metadata.entity (id)
    ON DELETE RESTRICT;

ALTER TABLE snapshot.entity_contract_revision
    ADD CONSTRAINT entity_contract_revision_change_set_fk
    FOREIGN KEY (change_set_id)
    REFERENCES metadata.entity_change_set (id)
    ON DELETE RESTRICT;

ALTER TABLE snapshot.entity_contract_revision
    ADD CONSTRAINT entity_contract_revision_parent_fk
    FOREIGN KEY (parent_revision_id)
    REFERENCES snapshot.entity_contract_revision (id)
    ON DELETE RESTRICT;

ALTER TABLE snapshot.entity_contract_revision
    ADD CONSTRAINT entity_contract_revision_base_release_fk
    FOREIGN KEY (base_release_id)
    REFERENCES metadata.entity_release (id)
    ON DELETE RESTRICT;

ALTER TABLE snapshot.entity_contract_revision
    ADD CONSTRAINT entity_contract_revision_captured_by_fk
    FOREIGN KEY (captured_by)
    REFERENCES master.principal (id)
    ON DELETE RESTRICT;

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

ALTER TABLE snapshot.entity_numbering_test_artifact
    ADD CONSTRAINT entity_numbering_test_artifact_entity_fk
        FOREIGN KEY (source_tenant_id, entity_id) REFERENCES metadata.entity (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_numbering_test_artifact_change_set_fk
        FOREIGN KEY (source_tenant_id, change_set_id) REFERENCES metadata.entity_change_set (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_numbering_test_artifact_binding_fk
        FOREIGN KEY (source_tenant_id, numbering_binding_id) REFERENCES metadata.entity_numbering_binding (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_numbering_test_artifact_actor_fk
        FOREIGN KEY (tenant_id, executed_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE snapshot.entity_release_artifact
    ADD CONSTRAINT entity_release_artifact_release_fk
        FOREIGN KEY (source_release_id) REFERENCES metadata.entity_release (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_release_artifact_revision_fk
        FOREIGN KEY (source_revision_id) REFERENCES snapshot.entity_contract_revision (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_release_artifact_entity_fk
        FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_release_artifact_created_by_fk
        FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
