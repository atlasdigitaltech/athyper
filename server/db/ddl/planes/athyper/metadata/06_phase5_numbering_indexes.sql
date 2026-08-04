CREATE INDEX entity_numbering_binding_resolve_ix
    ON metadata.entity_numbering_binding (change_set_id,target_plane,policy_code,policy_revision)
    WHERE status = 'active';
CREATE INDEX entity_numbering_binding_operation_ix
    ON metadata.entity_numbering_binding (change_set_id,entity_operation_id)
    WHERE entity_operation_id IS NOT NULL AND status = 'active';
