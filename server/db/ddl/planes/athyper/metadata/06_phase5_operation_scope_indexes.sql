CREATE INDEX ix_entity_operation_scope_binding_change_set
    ON metadata.entity_operation_scope_binding
       (tenant_id, change_set_id, target_plane, status);

CREATE INDEX ix_entity_operation_scope_binding_operation
    ON metadata.entity_operation_scope_binding
       (tenant_id, entity_operation_id, target_plane, scope_kind);
