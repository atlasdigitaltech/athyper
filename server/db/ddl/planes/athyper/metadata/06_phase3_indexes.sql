CREATE INDEX ix_entity_surface_change_set ON metadata.entity_surface (tenant_id, change_set_id, status, surface_kind, surface_key);
CREATE UNIQUE INDEX ux_entity_surface_default_kind ON metadata.entity_surface (tenant_id, change_set_id, surface_kind) NULLS NOT DISTINCT WHERE is_default AND status = 'active';
CREATE INDEX ix_entity_surface_replacement ON metadata.entity_surface (tenant_id, change_set_id, replacement_surface_key) WHERE replacement_surface_key IS NOT NULL;
CREATE INDEX ix_entity_surface_section_tree ON metadata.entity_surface_section (tenant_id, entity_surface_id, parent_section_id, position);
CREATE INDEX ix_entity_surface_field_binding_field ON metadata.entity_surface_field_binding (tenant_id, entity_field_id, entity_surface_id);
CREATE INDEX ix_entity_operation_change_set ON metadata.entity_operation (tenant_id, change_set_id, status, operation_kind, operation_key);
CREATE INDEX ix_entity_operation_permission ON metadata.entity_operation (tenant_id, permission_code, status);
CREATE INDEX ix_entity_operation_surfaces ON metadata.entity_operation (tenant_id, change_set_id, input_surface_key, result_surface_key);
