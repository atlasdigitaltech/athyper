BEGIN;
SET LOCAL lock_timeout='5s';
-- Support atomic sibling reorders without replacing member identities or changing
-- position bases/bounds. Only these named unique constraints may be deferred by
-- the writer; final uniqueness is checked before the saved snapshot. No grants,
-- ownership, protected controls or historical migration bytes change.

ALTER TABLE metadata.entity_key_field
  DROP CONSTRAINT entity_key_field_position_uq,
  ADD CONSTRAINT entity_key_field_position_uq UNIQUE NULLS NOT DISTINCT (tenant_id, entity_key_id, position) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE metadata.entity_search_field
  DROP CONSTRAINT entity_search_field_position_uq,
  ADD CONSTRAINT entity_search_field_position_uq UNIQUE NULLS NOT DISTINCT (tenant_id, entity_search_profile_id, position) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE metadata.entity_relation_field
  DROP CONSTRAINT entity_relation_field_position_uq,
  ADD CONSTRAINT entity_relation_field_position_uq UNIQUE NULLS NOT DISTINCT (tenant_id, entity_relation_target_id, position) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE metadata.entity_surface_section
  DROP CONSTRAINT entity_surface_section_position_uq,
  ADD CONSTRAINT entity_surface_section_position_uq UNIQUE NULLS NOT DISTINCT (tenant_id, entity_surface_id, parent_section_id, position) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE metadata.entity_surface_field_binding
  DROP CONSTRAINT entity_surface_field_binding_position_uq,
  ADD CONSTRAINT entity_surface_field_binding_position_uq UNIQUE NULLS NOT DISTINCT (tenant_id, entity_surface_id, entity_surface_section_id, position) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE metadata.entity_surface_operation
  DROP CONSTRAINT entity_surface_operation_position_uq,
  ADD CONSTRAINT entity_surface_operation_position_uq UNIQUE NULLS NOT DISTINCT (tenant_id, entity_surface_id, entity_surface_section_id, interaction_target, position) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE metadata.entity_flow_step
  DROP CONSTRAINT entity_flow_step_position_uq,
  ADD CONSTRAINT entity_flow_step_position_uq UNIQUE NULLS NOT DISTINCT (tenant_id, entity_flow_id, position) DEFERRABLE INITIALLY IMMEDIATE;

COMMIT;
