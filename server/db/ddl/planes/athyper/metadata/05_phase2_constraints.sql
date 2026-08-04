ALTER TABLE metadata.entity_class_profile
    ADD CONSTRAINT entity_class_profile_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE metadata.entity_runtime_profile
    ADD CONSTRAINT entity_runtime_profile_entity_fk
    FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_runtime_profile_change_set_fk
    FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_runtime_profile_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_runtime_profile_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE metadata.entity_field
    ADD CONSTRAINT entity_field_entity_fk
    FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_field_change_set_fk
    FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_field_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_field_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE metadata.entity_key
    ADD CONSTRAINT entity_key_entity_fk
    FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_key_change_set_fk
    FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_key_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_key_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE metadata.entity_key_field
    ADD CONSTRAINT entity_key_field_entity_fk
    FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_key_field_change_set_fk
    FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_key_field_key_fk
    FOREIGN KEY (entity_key_id) REFERENCES metadata.entity_key (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_key_field_field_fk
    FOREIGN KEY (entity_field_id) REFERENCES metadata.entity_field (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_key_field_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_key_field_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE metadata.entity_search_profile
    ADD CONSTRAINT entity_search_profile_entity_fk
    FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_search_profile_change_set_fk
    FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_search_profile_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_search_profile_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE metadata.entity_search_field
    ADD CONSTRAINT entity_search_field_entity_fk
    FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_search_field_change_set_fk
    FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_search_field_profile_fk
    FOREIGN KEY (entity_search_profile_id) REFERENCES metadata.entity_search_profile (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_search_field_field_fk
    FOREIGN KEY (entity_field_id) REFERENCES metadata.entity_field (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_search_field_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_search_field_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE metadata.entity_relation
    ADD CONSTRAINT entity_relation_entity_fk
    FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_relation_change_set_fk
    FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_relation_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_relation_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE metadata.entity_relation_target
    ADD CONSTRAINT entity_relation_target_entity_fk
    FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_relation_target_change_set_fk
    FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_relation_target_relation_fk
    FOREIGN KEY (entity_relation_id) REFERENCES metadata.entity_relation (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_relation_target_target_entity_fk
    FOREIGN KEY (target_entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_relation_target_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_relation_target_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE metadata.entity_relation_field
    ADD CONSTRAINT entity_relation_field_entity_fk
    FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_relation_field_change_set_fk
    FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_relation_field_target_fk
    FOREIGN KEY (entity_relation_target_id) REFERENCES metadata.entity_relation_target (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_relation_field_source_field_fk
    FOREIGN KEY (source_field_id) REFERENCES metadata.entity_field (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_relation_field_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_relation_field_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
