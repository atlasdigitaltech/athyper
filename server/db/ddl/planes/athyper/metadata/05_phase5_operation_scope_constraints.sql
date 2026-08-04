ALTER TABLE metadata.entity_operation_scope_binding
    ADD CONSTRAINT entity_operation_scope_binding_entity_fk
        FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_operation_scope_binding_change_set_fk
        FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_operation_scope_binding_operation_fk
        FOREIGN KEY (entity_operation_id) REFERENCES metadata.entity_operation (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_operation_scope_binding_created_by_fk
        FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_operation_scope_binding_updated_by_fk
        FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
