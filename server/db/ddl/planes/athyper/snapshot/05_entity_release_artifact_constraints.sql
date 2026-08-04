ALTER TABLE snapshot.entity_release_artifact
    ADD CONSTRAINT entity_release_artifact_release_fk
        FOREIGN KEY (source_release_id) REFERENCES metadata.entity_release (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_release_artifact_revision_fk
        FOREIGN KEY (source_revision_id) REFERENCES snapshot.entity_contract_revision (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_release_artifact_entity_fk
        FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_release_artifact_created_by_fk
        FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
