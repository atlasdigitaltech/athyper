ALTER TABLE metadata.entity
    ADD CONSTRAINT metadata_entity_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity
    ADD CONSTRAINT metadata_entity_module_fk
    FOREIGN KEY (module_id)
    REFERENCES master.module (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity
    ADD CONSTRAINT metadata_entity_status_changed_by_fk
    FOREIGN KEY (status_changed_by)
    REFERENCES master.principal (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity
    ADD CONSTRAINT metadata_entity_created_by_fk
    FOREIGN KEY (created_by)
    REFERENCES master.principal (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity
    ADD CONSTRAINT metadata_entity_updated_by_fk
    FOREIGN KEY (updated_by)
    REFERENCES master.principal (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity_change_set
    ADD CONSTRAINT entity_change_set_entity_fk
    FOREIGN KEY (entity_id)
    REFERENCES metadata.entity (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity_change_set
    ADD CONSTRAINT entity_change_set_parent_fk
    FOREIGN KEY (parent_change_set_id)
    REFERENCES metadata.entity_change_set (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity_change_set
    ADD CONSTRAINT entity_change_set_base_release_fk
    FOREIGN KEY (base_release_id)
    REFERENCES metadata.entity_release (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity_change_set
    ADD CONSTRAINT entity_change_set_submitted_by_fk
    FOREIGN KEY (submitted_by)
    REFERENCES master.principal (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity_change_set
    ADD CONSTRAINT entity_change_set_reviewed_by_fk
    FOREIGN KEY (reviewed_by)
    REFERENCES master.principal (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity_change_set
    ADD CONSTRAINT entity_change_set_approved_by_fk
    FOREIGN KEY (approved_by)
    REFERENCES master.principal (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity_change_set
    ADD CONSTRAINT entity_change_set_rejected_by_fk
    FOREIGN KEY (rejected_by)
    REFERENCES master.principal (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity_change_set
    ADD CONSTRAINT entity_change_set_published_by_fk
    FOREIGN KEY (published_by)
    REFERENCES master.principal (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity_change_set
    ADD CONSTRAINT entity_change_set_status_changed_by_fk
    FOREIGN KEY (status_changed_by)
    REFERENCES master.principal (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity_change_set
    ADD CONSTRAINT entity_change_set_created_by_fk
    FOREIGN KEY (created_by)
    REFERENCES master.principal (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity_change_set
    ADD CONSTRAINT entity_change_set_updated_by_fk
    FOREIGN KEY (updated_by)
    REFERENCES master.principal (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity_release
    ADD CONSTRAINT entity_release_entity_fk
    FOREIGN KEY (entity_id)
    REFERENCES metadata.entity (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity_release
    ADD CONSTRAINT entity_release_change_set_fk
    FOREIGN KEY (change_set_id)
    REFERENCES metadata.entity_change_set (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity_release
    ADD CONSTRAINT entity_release_revision_fk
    FOREIGN KEY (revision_id)
    REFERENCES snapshot.entity_contract_revision (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity_release
    ADD CONSTRAINT entity_release_supersedes_fk
    FOREIGN KEY (supersedes_release_id)
    REFERENCES metadata.entity_release (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity_release
    ADD CONSTRAINT entity_release_rollback_of_fk
    FOREIGN KEY (rollback_of_release_id)
    REFERENCES metadata.entity_release (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity_release
    ADD CONSTRAINT entity_release_published_by_fk
    FOREIGN KEY (published_by)
    REFERENCES master.principal (id)
    ON DELETE RESTRICT;
