CREATE TABLE log.notification_delivery_attempt (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid        NOT NULL,
    delivery_id           uuid,
    subscription_id       uuid,
    request_url           text        NOT NULL,
    request_method        text        NOT NULL DEFAULT 'POST',
    request_headers       jsonb,
    request_body          text,
    request_content_type  text,
    response_status       integer,
    response_headers      jsonb,
    response_body         text,
    response_content_type text,
    duration_ms           integer     NOT NULL,
    is_success            boolean     NOT NULL,
    error                 text,
    is_redacted           boolean     NOT NULL DEFAULT false,
    redaction_version     text,
    body_truncated        boolean     NOT NULL DEFAULT false,
    purge_after           timestamptz,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,
    CONSTRAINT notification_delivery_attempt_pkey PRIMARY KEY (id),
    CONSTRAINT notification_delivery_attempt_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT notification_delivery_attempt_url_chk CHECK (btrim(request_url) <> ''),
    CONSTRAINT notification_delivery_attempt_method_chk CHECK (request_method IN ('GET','POST','PUT','PATCH','DELETE')),
    CONSTRAINT notification_delivery_attempt_status_chk CHECK (response_status IS NULL OR response_status BETWEEN 100 AND 599),
    CONSTRAINT notification_delivery_attempt_duration_chk CHECK (duration_ms >= 0),
    CONSTRAINT notification_delivery_attempt_json_chk CHECK ((request_headers IS NULL OR jsonb_typeof(request_headers) = 'object') AND (response_headers IS NULL OR jsonb_typeof(response_headers) = 'object'))
);

CREATE TABLE log.notification_dlq (
    id                uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id         uuid        NOT NULL,
    queue_name        text        NOT NULL,
    job_name          text        NOT NULL,
    payload           jsonb       NOT NULL,
    error_message     text        NOT NULL,
    retry_count       smallint    NOT NULL DEFAULT 0,
    last_attempted_at timestamptz NOT NULL,
    retried_at        timestamptz,
    retried_job_id    text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT notification_dlq_pkey PRIMARY KEY (id),
    CONSTRAINT notification_dlq_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT notification_dlq_payload_chk CHECK (jsonb_typeof(payload) = 'object'),
    CONSTRAINT notification_dlq_retry_chk CHECK (retry_count >= 0),
    CONSTRAINT notification_dlq_retried_pair_chk CHECK ((retried_at IS NULL) = (retried_job_id IS NULL))
);

COMMENT ON TABLE log.notification_delivery_attempt IS 'Append-mostly HTTP trace for notification/webhook delivery. Only redaction and purge metadata may be updated.';
COMMENT ON TABLE log.notification_dlq IS 'Notification worker dead-letter queue. Only one retry marker update is permitted.';
