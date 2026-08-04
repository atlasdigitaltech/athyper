CREATE TABLE event.descriptor_invalidation_outbox (
    id               uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid,
    entity_code      text,
    plane_key        text,
    reason           text        NOT NULL,
    source_table     text,
    source_id        uuid,
    event_key        text,
    payload          jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status           event.outbox_status_d NOT NULL DEFAULT 'pending',
    attempts         integer     NOT NULL DEFAULT 0,
    max_attempts     integer     NOT NULL DEFAULT 5,
    available_at     timestamptz NOT NULL DEFAULT now(),
    locked_at        timestamptz,
    locked_by        text,
    locked_until     timestamptz,
    last_error       text,
    processed_at     timestamptz,
    processed_by     text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid        NOT NULL,

    CONSTRAINT descriptor_invalidation_outbox_pkey PRIMARY KEY (id),
    CONSTRAINT descriptor_invalidation_outbox_event_key_uq UNIQUE (event_key),
    CONSTRAINT descriptor_invalidation_outbox_scope_chk CHECK (
        tenant_id IS NOT NULL OR entity_code IS NOT NULL OR plane_key IS NOT NULL
    ),
    CONSTRAINT descriptor_invalidation_outbox_entity_chk CHECK (
        entity_code IS NULL OR entity_code ~ '^[a-z][a-z0-9_.-]{1,126}$'
    ),
    CONSTRAINT descriptor_invalidation_outbox_plane_chk CHECK (
        plane_key IS NULL OR plane_key IN ('athyper','neon','mesh')
    ),
    CONSTRAINT descriptor_invalidation_outbox_reason_chk CHECK (
        reason ~ '^[a-z][a-z0-9_.-]{1,126}$'
    ),
    CONSTRAINT descriptor_invalidation_outbox_source_chk CHECK (
        source_table IS NULL OR source_table ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'
    ),
    CONSTRAINT descriptor_invalidation_outbox_event_key_chk CHECK (
        event_key IS NULL OR (btrim(event_key) <> '' AND length(event_key) <= 256)
    ),
    CONSTRAINT descriptor_invalidation_outbox_payload_chk CHECK (
        jsonb_typeof(payload) = 'object'
    ),
    CONSTRAINT descriptor_invalidation_outbox_attempt_chk CHECK (
        attempts >= 0 AND max_attempts > 0 AND attempts <= max_attempts
    ),
    CONSTRAINT descriptor_invalidation_outbox_lock_chk CHECK (
        (locked_at IS NULL AND locked_by IS NULL AND locked_until IS NULL)
        OR (locked_at IS NOT NULL AND locked_by IS NOT NULL AND locked_until > locked_at)
    ),
    CONSTRAINT descriptor_invalidation_outbox_processed_chk CHECK (
        (status = 'completed' AND processed_at IS NOT NULL AND processed_by IS NOT NULL)
        OR (status <> 'completed' AND processed_at IS NULL AND processed_by IS NULL)
    ),
    CONSTRAINT descriptor_invalidation_outbox_time_chk CHECK (
        available_at >= created_at
    )
);

COMMENT ON TABLE event.descriptor_invalidation_outbox IS
  'Durable local descriptor-cache invalidation delivery state. Nullable tenant_id supports reviewed platform-global metadata publications without weakening event.outbox tenancy.';
