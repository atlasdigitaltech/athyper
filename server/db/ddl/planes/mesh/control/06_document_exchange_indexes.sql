CREATE INDEX network_document_type_entity_idx
    ON control.network_document_type (entity_id, status);

CREATE INDEX network_document_type_active_direction_idx
    ON control.network_document_type (direction_scope, code)
    WHERE status = 'active';
