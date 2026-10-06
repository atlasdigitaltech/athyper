BEGIN;
SET LOCAL lock_timeout='5s';
-- Enforce the blueprint's one root per owner/purpose. Existing applied migrations remain immutable.
CREATE UNIQUE INDEX entity_predicate_root_view_id_uq ON metadata.entity_predicate(change_set_id,purpose,view_id) WHERE parent_predicate_id IS NULL AND view_id IS NOT NULL;
CREATE UNIQUE INDEX entity_predicate_root_authorization_profile_id_uq ON metadata.entity_predicate(change_set_id,purpose,authorization_profile_id) WHERE parent_predicate_id IS NULL AND authorization_profile_id IS NOT NULL;
CREATE UNIQUE INDEX entity_predicate_root_field_binding_id_uq ON metadata.entity_predicate(change_set_id,purpose,field_binding_id) WHERE parent_predicate_id IS NULL AND field_binding_id IS NOT NULL;
CREATE UNIQUE INDEX entity_predicate_root_surface_operation_id_uq ON metadata.entity_predicate(change_set_id,purpose,surface_operation_id) WHERE parent_predicate_id IS NULL AND surface_operation_id IS NOT NULL;
CREATE UNIQUE INDEX entity_predicate_root_surface_section_id_uq ON metadata.entity_predicate(change_set_id,purpose,surface_section_id) WHERE parent_predicate_id IS NULL AND surface_section_id IS NOT NULL;
CREATE UNIQUE INDEX entity_predicate_root_navigation_group_id_uq ON metadata.entity_predicate(change_set_id,purpose,navigation_group_id) WHERE parent_predicate_id IS NULL AND navigation_group_id IS NOT NULL;
COMMIT;
