CREATE INDEX entity_operation_scope_binding_runtime_ix
    ON authz.entity_operation_scope_binding
       (tenant_id,source_entity_operation_id,decision_mode,scope_kind)
    WHERE status = 'published';
CREATE INDEX entity_operation_scope_binding_permission_ix
    ON authz.entity_operation_scope_binding (permission_id,scope_kind)
    WHERE status = 'published';
CREATE INDEX entity_operation_scope_binding_release_ix
    ON authz.entity_operation_scope_binding (source_release_id,source_compiled_artifact_id);

