ALTER TABLE metadata.entity_lifecycle_binding
    ADD CONSTRAINT entity_lifecycle_binding_entity_fk FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_lifecycle_binding_change_set_fk FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_lifecycle_binding_field_fk FOREIGN KEY (entity_field_id) REFERENCES metadata.entity_field (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_lifecycle_binding_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_lifecycle_binding_updated_by_fk FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE metadata.entity_lifecycle_operation_binding
    ADD CONSTRAINT entity_lifecycle_operation_binding_entity_fk FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_lifecycle_operation_binding_change_set_fk FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_lifecycle_operation_binding_binding_fk FOREIGN KEY (entity_lifecycle_binding_id) REFERENCES metadata.entity_lifecycle_binding (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_lifecycle_operation_binding_operation_fk FOREIGN KEY (entity_operation_id) REFERENCES metadata.entity_operation (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_lifecycle_operation_binding_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_lifecycle_operation_binding_updated_by_fk FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
