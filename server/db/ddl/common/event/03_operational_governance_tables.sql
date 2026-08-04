CREATE TABLE event.comment_flag (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    comment_id uuid NOT NULL,
    reporter_principal_id uuid NOT NULL,
    reason_code text NOT NULL,
    detail text,
    status text NOT NULL DEFAULT 'open',
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    resolved_at timestamptz,
    resolved_by uuid,
    CONSTRAINT comment_flag_pkey PRIMARY KEY (id),
    CONSTRAINT comment_flag_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT comment_flag_open_uq UNIQUE NULLS NOT DISTINCT
        (tenant_id, comment_id, reporter_principal_id, resolved_at),
    CONSTRAINT comment_flag_reason_chk CHECK (reason_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT comment_flag_status_chk CHECK (status IN ('open','reviewing','resolved','dismissed')),
    CONSTRAINT comment_flag_resolution_chk CHECK (
        (resolved_at IS NULL AND resolved_by IS NULL)
        OR (resolved_at IS NOT NULL AND resolved_by IS NOT NULL AND status IN ('resolved','dismissed'))
    )
);

CREATE TABLE event.notification_message (
    id               uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid        NOT NULL,
    plane_key        text        NOT NULL,
    event_id         text        NOT NULL,
    event_code       text        NOT NULL,
    rule_id          uuid,
    entity_type      text,
    entity_id        uuid,
    template_key     text        NOT NULL,
    template_version smallint    NOT NULL DEFAULT 1,
    subject          text,
    payload          jsonb       NOT NULL DEFAULT '{}'::jsonb,
    priority         text        NOT NULL DEFAULT 'normal',
    channels         text[]      NOT NULL DEFAULT ARRAY['in_app']::text[],
    recipient_count  integer     NOT NULL DEFAULT 0,
    delivered_count  integer     NOT NULL DEFAULT 0,
    failed_count     integer     NOT NULL DEFAULT 0,
    status           event.notification_status_d NOT NULL DEFAULT 'pending',
    expires_at       timestamptz,
    completed_at     timestamptz,
    correlation_id   uuid,
    metadata         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid        NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,
    CONSTRAINT notification_message_pkey PRIMARY KEY (id),
    CONSTRAINT notification_message_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT notification_message_event_origin_uq UNIQUE (tenant_id, plane_key, event_id),
    CONSTRAINT notification_message_plane_chk CHECK (plane_key IN ('admin','neon','mesh')),
    CONSTRAINT notification_message_code_chk CHECK (event_code ~ '^[a-z][a-z0-9_.:-]{1,126}$' AND template_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT notification_message_version_chk CHECK (template_version > 0),
    CONSTRAINT notification_message_payload_chk CHECK (jsonb_typeof(payload) = 'object' AND jsonb_typeof(metadata) = 'object'),
    CONSTRAINT notification_message_priority_chk CHECK (priority IN ('low','normal','high','urgent')),
    CONSTRAINT notification_message_channels_chk CHECK (cardinality(channels) > 0 AND channels <@ ARRAY['in_app','email','sms','whatsapp','push','webhook']::text[] AND array_position(channels, NULL) IS NULL),
    CONSTRAINT notification_message_counts_chk CHECK (recipient_count >= 0 AND delivered_count >= 0 AND failed_count >= 0 AND delivered_count + failed_count <= recipient_count),
    CONSTRAINT notification_message_expiry_chk CHECK (expires_at IS NULL OR expires_at > created_at),
    CONSTRAINT notification_message_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE event.notification_delivery (
    id               uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid        NOT NULL,
    message_id       uuid,
    notification_id  uuid,
    outbox_id         uuid,
    recipient_id     uuid,
    recipient_addr   text        NOT NULL,
    channel          text        NOT NULL,
    provider_id      uuid,
    provider_code    text,
    status           event.delivery_status_d NOT NULL DEFAULT 'pending',
    attempt_count    smallint    NOT NULL DEFAULT 0,
    max_attempts     smallint    NOT NULL DEFAULT 3,
    last_error       text,
    error_category   text,
    external_id      text,
    idempotency_key  text,
    subscription_id  uuid,
    sent_at          timestamptz,
    delivered_at     timestamptz,
    read_at          timestamptz,
    opened_at        timestamptz,
    clicked_at       timestamptz,
    bounced_at       timestamptz,
    next_retry_at    timestamptz,
    locked_until     timestamptz,
    channel_detail   jsonb       NOT NULL DEFAULT '{}'::jsonb,
    metadata         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid        NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,
    CONSTRAINT notification_delivery_pkey PRIMARY KEY (id),
    CONSTRAINT notification_delivery_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT notification_delivery_coordinate_uq UNIQUE (tenant_id, message_id, recipient_id, channel),
    CONSTRAINT notification_delivery_channel_chk CHECK (channel IN ('in_app','email','sms','whatsapp','push','webhook')),
    CONSTRAINT notification_delivery_destination_chk CHECK (btrim(recipient_addr) <> ''),
    CONSTRAINT notification_delivery_attempt_chk CHECK (attempt_count >= 0 AND max_attempts > 0 AND attempt_count <= max_attempts),
    CONSTRAINT notification_delivery_error_category_chk CHECK (error_category IS NULL OR error_category IN ('transient','permanent','rate_limit','auth')),
    CONSTRAINT notification_delivery_json_chk CHECK (jsonb_typeof(channel_detail) = 'object' AND jsonb_typeof(metadata) = 'object'),
    CONSTRAINT notification_delivery_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE event.notification_inbox_state (
    id                       uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid        NOT NULL,
    message_id               uuid        NOT NULL,
    delivery_id              uuid,
    principal_id             uuid        NOT NULL,
    channel_code             text        NOT NULL,
    read_at                  timestamptz,
    read_by                  uuid,
    dismissed_at             timestamptz,
    dismissed_by             uuid,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT notification_inbox_state_pkey PRIMARY KEY (id),
    CONSTRAINT notification_inbox_state_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT notification_inbox_state_coordinate_uq
        UNIQUE (tenant_id, message_id, principal_id, channel_code),
    CONSTRAINT notification_inbox_state_delivery_uq
        UNIQUE (tenant_id, delivery_id),
    CONSTRAINT notification_inbox_state_channel_chk
        CHECK (channel_code IN ('in_app','email','sms','whatsapp','push','webhook')),
    CONSTRAINT notification_inbox_state_read_pair_chk
        CHECK ((read_at IS NULL) = (read_by IS NULL)),
    CONSTRAINT notification_inbox_state_dismissed_pair_chk
        CHECK ((dismissed_at IS NULL) = (dismissed_by IS NULL)),
    CONSTRAINT notification_inbox_state_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE event.notification_inbox_state IS
  'Mutable per-principal inbox projection for one notification channel. Provider delivery lifecycle remains in event.notification_delivery.';

CREATE TABLE event.outbox (
    id             uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id      uuid        NOT NULL,
    topic          text        NOT NULL,
    event_type     text,
    event_key      text,
    entity_type    text,
    entity_id      uuid,
    aggregate_type text,
    aggregate_id   uuid,
    event_version  integer     NOT NULL DEFAULT 1,
    actor_id       uuid,
    source         text,
    correlation_id uuid,
    causation_id   uuid,
    partition_key  text,
    payload        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    headers        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status         event.outbox_status_d NOT NULL DEFAULT 'pending',
    attempts       integer     NOT NULL DEFAULT 0,
    max_attempts   integer     NOT NULL DEFAULT 5,
    available_at   timestamptz NOT NULL DEFAULT now(),
    locked_at      timestamptz,
    locked_by      text,
    locked_until   timestamptz,
    last_error     text,
    processed_at   timestamptz,
    published_at   timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid        NOT NULL,
    CONSTRAINT outbox_pkey PRIMARY KEY (id),
    CONSTRAINT outbox_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT outbox_event_chk CHECK (
        topic ~ '^[a-z][a-z0-9_.:-]{0,126}$'
        AND (event_type IS NULL OR event_type ~ '^[a-z][a-z0-9_.:-]{1,126}$')
        AND (aggregate_type IS NULL OR aggregate_type ~ '^[a-z][a-z0-9_.:-]{1,126}$')
        AND event_version > 0
    ),
    CONSTRAINT outbox_json_chk CHECK (jsonb_typeof(payload) = 'object' AND jsonb_typeof(headers) = 'object'),
    CONSTRAINT outbox_lock_chk CHECK (
        (locked_at IS NULL AND locked_by IS NULL AND locked_until IS NULL)
        OR (locked_at IS NOT NULL AND locked_by IS NOT NULL AND locked_until > locked_at)
    ),
    CONSTRAINT outbox_attempt_chk CHECK (attempts >= 0 AND max_attempts > 0 AND attempts <= max_attempts)
);

CREATE TABLE event.channel_consent_event (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    subject_type text NOT NULL,
    subject_id uuid NOT NULL,
    channel_code text NOT NULL,
    destination_hash text,
    action event.consent_action_d NOT NULL,
    source_code text NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    correlation_id uuid,
    actor_principal_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT channel_consent_event_pkey PRIMARY KEY (id),
    CONSTRAINT channel_consent_event_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT channel_consent_event_subject_chk
        CHECK (subject_type IN ('principal','person','contact_person','business_partner')),
    CONSTRAINT channel_consent_event_channel_chk
        CHECK (channel_code IN ('email','sms','whatsapp','push')),
    CONSTRAINT channel_consent_event_source_chk
        CHECK (source_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT channel_consent_event_evidence_chk CHECK (jsonb_typeof(evidence) = 'object')
);

-- Plane-local command idempotency and execution state. This is deliberately
-- not named "receipt": document.receipt is the Neon goods-receipt document.
-- Immutable business evidence for each transition belongs in audit.audit_log.
CREATE TABLE event.command_execution (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid        NOT NULL,
    command_code          text        NOT NULL,
    idempotency_key       text        NOT NULL,
    request_fingerprint   char(64)    NOT NULL,
    status                event.command_execution_status_d NOT NULL DEFAULT 'received',
    actor_principal_id    uuid,
    source_service        text        NOT NULL,
    result_payload        jsonb,
    error_code            text,
    error_detail          jsonb,
    correlation_id        uuid,
    trace_id              char(32),
    received_at           timestamptz NOT NULL DEFAULT now(),
    started_at            timestamptz,
    completed_at          timestamptz,
    expires_at            timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT command_execution_pkey PRIMARY KEY (id),
    CONSTRAINT command_execution_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT command_execution_idempotency_uq
        UNIQUE (tenant_id, command_code, idempotency_key),
    CONSTRAINT command_execution_code_chk CHECK (
        command_code ~ '^[a-z][a-z0-9_.:-]{1,126}$'
        AND btrim(idempotency_key) <> ''
    ),
    CONSTRAINT command_execution_fingerprint_chk CHECK (
        request_fingerprint ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT command_execution_source_chk CHECK (
        btrim(source_service) <> '' AND length(source_service) <= 128
    ),
    CONSTRAINT command_execution_json_chk CHECK (
        (result_payload IS NULL OR jsonb_typeof(result_payload) = 'object')
        AND (error_detail IS NULL OR jsonb_typeof(error_detail) = 'object')
    ),
    CONSTRAINT command_execution_error_chk CHECK (
        (status = 'failed' AND error_code IS NOT NULL)
        OR (status <> 'failed' AND error_code IS NULL AND error_detail IS NULL)
    ),
    CONSTRAINT command_execution_result_chk CHECK (
        status <> 'succeeded' OR result_payload IS NOT NULL
    ),
    CONSTRAINT command_execution_timeline_chk CHECK (
        (started_at IS NULL OR started_at >= received_at)
        AND (completed_at IS NULL OR (started_at IS NOT NULL AND completed_at >= started_at))
        AND expires_at > received_at
    ),
    CONSTRAINT command_execution_terminal_chk CHECK (
        (status IN ('succeeded','failed','cancelled','expired')) = (completed_at IS NOT NULL)
    ),
    CONSTRAINT command_execution_trace_chk CHECK (
        trace_id IS NULL OR trace_id ~ '^[0-9a-f]{32}$'
    ),
    CONSTRAINT command_execution_status_pair_chk CHECK (
        (status_changed_at IS NULL) = (status_changed_by IS NULL)
    ),
    CONSTRAINT command_execution_audit_pair_chk CHECK (
        (updated_at IS NULL) = (updated_by IS NULL)
    )
);

COMMENT ON TABLE event.command_execution IS
  'Mutable, tenant-scoped command idempotency and execution state shared by every plane. audit.audit_log remains the immutable lifecycle evidence.';
