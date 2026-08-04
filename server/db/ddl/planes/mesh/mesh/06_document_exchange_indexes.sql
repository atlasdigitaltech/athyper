CREATE INDEX document_envelope_relationship_idx
    ON mesh.document_envelope (network_relationship_id, received_at DESC);

CREATE INDEX document_envelope_receiver_queue_idx
    ON mesh.document_envelope (
        receiver_tenant_id, receiver_account_id, status, received_at
    );

CREATE INDEX document_envelope_business_key_idx
    ON mesh.document_envelope (document_type_id, business_key)
    WHERE business_key IS NOT NULL;

CREATE INDEX document_envelope_entity_version_idx
    ON mesh.document_envelope (entity_id, entity_version_id);

CREATE INDEX document_envelope_created_by_idx
    ON mesh.document_envelope (sender_tenant_id, created_by);

CREATE UNIQUE INDEX document_payload_primary_uq
    ON mesh.document_payload (envelope_id)
    WHERE payload_role = 'primary' AND status <> 'deleted';

CREATE INDEX document_payload_scan_queue_idx
    ON mesh.document_payload (scan_status, created_at)
    WHERE status = 'active';

CREATE INDEX document_payload_created_by_idx
    ON mesh.document_payload (created_by_tenant_id, created_by);

CREATE INDEX document_event_envelope_time_idx
    ON mesh.document_event (envelope_id, occurred_at, id);

CREATE INDEX document_event_actor_account_idx
    ON mesh.document_event (actor_tenant_id, actor_account_id)
    WHERE actor_account_id IS NOT NULL;

CREATE INDEX document_event_actor_principal_idx
    ON mesh.document_event (actor_tenant_id, actor_principal_id)
    WHERE actor_principal_id IS NOT NULL;

CREATE INDEX document_event_created_by_idx
    ON mesh.document_event (created_by_tenant_id, created_by);

CREATE UNIQUE INDEX document_event_idempotency_uq
    ON mesh.document_event (envelope_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX document_acknowledgement_envelope_time_idx
    ON mesh.document_acknowledgement (envelope_id, acknowledged_at, id);

CREATE INDEX document_acknowledgement_responder_idx
    ON mesh.document_acknowledgement (
        responder_tenant_id, responder_account_id
    );

CREATE INDEX document_acknowledgement_responder_principal_idx
    ON mesh.document_acknowledgement (
        responder_tenant_id, responder_principal_id
    ) WHERE responder_principal_id IS NOT NULL;

CREATE INDEX document_acknowledgement_created_by_idx
    ON mesh.document_acknowledgement (responder_tenant_id, created_by);
