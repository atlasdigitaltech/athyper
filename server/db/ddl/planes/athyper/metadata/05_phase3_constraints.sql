ALTER TABLE metadata.entity_surface
    ADD CONSTRAINT entity_surface_entity_fk FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_surface_change_set_fk FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_surface_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_surface_updated_by_fk FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE metadata.entity_surface_section
    ADD CONSTRAINT entity_surface_section_entity_fk FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_surface_section_change_set_fk FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_surface_section_surface_fk FOREIGN KEY (entity_surface_id) REFERENCES metadata.entity_surface (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_surface_section_parent_fk FOREIGN KEY (parent_section_id) REFERENCES metadata.entity_surface_section (id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    ADD CONSTRAINT entity_surface_section_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_surface_section_updated_by_fk FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE metadata.entity_surface_field_binding
    ADD CONSTRAINT entity_surface_field_binding_entity_fk FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_surface_field_binding_change_set_fk FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_surface_field_binding_surface_fk FOREIGN KEY (entity_surface_id) REFERENCES metadata.entity_surface (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_surface_field_binding_section_fk FOREIGN KEY (entity_surface_section_id) REFERENCES metadata.entity_surface_section (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_surface_field_binding_field_fk FOREIGN KEY (entity_field_id) REFERENCES metadata.entity_field (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_surface_field_binding_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_surface_field_binding_updated_by_fk FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE metadata.entity_operation
    ADD CONSTRAINT entity_operation_entity_fk FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_operation_change_set_fk FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_operation_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_operation_updated_by_fk FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
