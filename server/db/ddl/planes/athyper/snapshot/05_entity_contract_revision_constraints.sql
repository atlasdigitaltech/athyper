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
