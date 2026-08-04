CREATE TABLE mesh.document_envelope (
    id                       uuid                            NOT NULL DEFAULT shared.uuidv7(),
    envelope_code            text                            NOT NULL,
    network_relationship_id  uuid                            NOT NULL,
    document_type_id         uuid                            NOT NULL,
    document_direction       mesh.document_direction_d       NOT NULL,
    sender_tenant_id         uuid                            NOT NULL,
    sender_account_id        uuid                            NOT NULL,
    receiver_tenant_id       uuid                            NOT NULL,
    receiver_account_id      uuid                            NOT NULL,
    entity_id                uuid                            NOT NULL,
    entity_version_id        uuid                            NOT NULL,
    entity_contract_hash     text                            NOT NULL,
    business_key             text,
    correlation_id           text,
    idempotency_key          text                            NOT NULL,
    status                   mesh.document_envelope_status_d NOT NULL DEFAULT 'received',
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    received_at              timestamptz                     NOT NULL DEFAULT now(),
    processed_at             timestamptz,
    metadata                 jsonb                           NOT NULL DEFAULT '{}'::jsonb,
    created_at               timestamptz                     NOT NULL DEFAULT now(),
    created_by               uuid                            NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT document_envelope_pkey PRIMARY KEY (id),
    CONSTRAINT document_envelope_code_uq UNIQUE (envelope_code),
    CONSTRAINT document_envelope_idempotency_uq
        UNIQUE (sender_tenant_id, sender_account_id, idempotency_key),
    CONSTRAINT document_envelope_participant_chk
        CHECK (sender_account_id <> receiver_account_id),
    CONSTRAINT document_envelope_code_chk
        CHECK (envelope_code ~ '^[A-Za-z0-9][A-Za-z0-9_.:/-]{2,126}$'),
    CONSTRAINT document_envelope_business_key_chk
        CHECK (business_key IS NULL OR btrim(business_key) <> ''),
    CONSTRAINT document_envelope_correlation_chk
        CHECK (correlation_id IS NULL OR btrim(correlation_id) <> ''),
    CONSTRAINT document_envelope_idempotency_chk
        CHECK (btrim(idempotency_key) <> ''),
    CONSTRAINT document_envelope_contract_hash_chk
        CHECK (entity_contract_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT document_envelope_processing_chk CHECK (
        (processed_at IS NULL)
        OR (processed_at >= received_at AND status IN (
            'accepted', 'rejected', 'routed', 'failed', 'archived'
        ))
    ),
    CONSTRAINT document_envelope_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT document_envelope_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT document_envelope_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE mesh.document_envelope IS
  'Cross-tenant exchange header. It freezes the resolved Entity version and contract hash so validation and replay never drift with later Entity Studio publications.';

CREATE TABLE mesh.document_payload (
    id                 uuid                                NOT NULL DEFAULT shared.uuidv7(),
    envelope_id        uuid                                NOT NULL,
    payload_role       mesh.document_payload_role_d        NOT NULL DEFAULT 'primary',
    sequence_no        integer                             NOT NULL DEFAULT 1,
    storage_uri        text                                NOT NULL,
    payload_hash       text                                NOT NULL,
    content_type       text                                NOT NULL,
    size_bytes         bigint                              NOT NULL,
    scan_status        mesh.document_payload_scan_status_d NOT NULL DEFAULT 'pending',
    scanned_at         timestamptz,
    retention_until    timestamptz,
    metadata           jsonb                               NOT NULL DEFAULT '{}'::jsonb,
    status             mesh.document_payload_status_d      NOT NULL DEFAULT 'active',
    created_at         timestamptz                         NOT NULL DEFAULT now(),
    created_by_tenant_id uuid                               NOT NULL,
    created_by         uuid                                NOT NULL,
    updated_at         timestamptz,
    updated_by         uuid,

    CONSTRAINT document_payload_pkey PRIMARY KEY (id),
    CONSTRAINT document_payload_coordinate_uq
        UNIQUE (envelope_id, payload_role, sequence_no),
    CONSTRAINT document_payload_sequence_chk CHECK (sequence_no > 0),
    CONSTRAINT document_payload_storage_uri_chk CHECK (btrim(storage_uri) <> ''),
    CONSTRAINT document_payload_hash_chk CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT document_payload_content_type_chk CHECK (btrim(content_type) <> ''),
    CONSTRAINT document_payload_size_chk CHECK (size_bytes >= 0),
    CONSTRAINT document_payload_scan_pair_chk CHECK (
        (scan_status = 'pending' AND scanned_at IS NULL)
        OR (scan_status <> 'pending' AND scanned_at IS NOT NULL)
    ),
    CONSTRAINT document_payload_retention_chk
        CHECK (retention_until IS NULL OR retention_until > created_at),
    CONSTRAINT document_payload_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT document_payload_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE mesh.document_event (
    id                 uuid        NOT NULL DEFAULT shared.uuidv7(),
    envelope_id        uuid        NOT NULL,
    event_code         text        NOT NULL,
    actor_tenant_id    uuid,
    actor_account_id   uuid,
    actor_principal_id uuid,
    idempotency_key    text,
    event_payload      jsonb       NOT NULL DEFAULT '{}'::jsonb,
    occurred_at        timestamptz NOT NULL DEFAULT now(),
    created_at         timestamptz NOT NULL DEFAULT now(),
    created_by_tenant_id uuid      NOT NULL,
    created_by         uuid        NOT NULL,

    CONSTRAINT document_event_pkey PRIMARY KEY (id),
    CONSTRAINT document_event_code_chk
        CHECK (event_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT document_event_actor_pair_chk CHECK (
        (actor_tenant_id IS NULL) = (actor_account_id IS NULL)
    ),
    CONSTRAINT document_event_actor_principal_chk CHECK (
        actor_principal_id IS NULL OR actor_tenant_id IS NOT NULL
    ),
    CONSTRAINT document_event_idempotency_chk
        CHECK (idempotency_key IS NULL OR btrim(idempotency_key) <> ''),
    CONSTRAINT document_event_payload_object_chk
        CHECK (jsonb_typeof(event_payload) = 'object'),
    CONSTRAINT document_event_time_chk CHECK (occurred_at <= created_at)
);

CREATE TABLE mesh.document_acknowledgement (
    id                   uuid                       NOT NULL DEFAULT shared.uuidv7(),
    envelope_id          uuid                       NOT NULL,
    acknowledgement_type mesh.document_ack_type_d   NOT NULL,
    status               mesh.document_ack_status_d NOT NULL,
    responder_tenant_id  uuid                       NOT NULL,
    responder_account_id uuid                       NOT NULL,
    responder_principal_id uuid,
    acknowledgement_code text,
    message              text,
    idempotency_key      text                       NOT NULL,
    acknowledged_at      timestamptz                NOT NULL DEFAULT now(),
    metadata             jsonb                      NOT NULL DEFAULT '{}'::jsonb,
    created_at           timestamptz                NOT NULL DEFAULT now(),
    created_by           uuid                       NOT NULL,

    CONSTRAINT document_acknowledgement_pkey PRIMARY KEY (id),
    CONSTRAINT document_acknowledgement_idempotency_uq
        UNIQUE (envelope_id, responder_account_id, idempotency_key),
    CONSTRAINT document_acknowledgement_code_chk CHECK (
        acknowledgement_code IS NULL
        OR acknowledgement_code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'
    ),
    CONSTRAINT document_acknowledgement_message_chk
        CHECK (message IS NULL OR btrim(message) <> ''),
    CONSTRAINT document_acknowledgement_idempotency_chk
        CHECK (btrim(idempotency_key) <> ''),
    CONSTRAINT document_acknowledgement_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT document_acknowledgement_time_chk
        CHECK (acknowledged_at <= created_at)
);
