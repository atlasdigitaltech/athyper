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

CREATE TABLE log.integration_delivery_attempt (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, delivery_id uuid NOT NULL,
    attempt smallint NOT NULL, started_at timestamptz NOT NULL, completed_at timestamptz NOT NULL,
    request_url text NOT NULL, request_method text NOT NULL, request_headers jsonb NOT NULL DEFAULT '{}'::jsonb,
    request_body_hash char(64) NOT NULL, response_status integer, response_headers jsonb NOT NULL DEFAULT '{}'::jsonb,
    response_body_hash char(64), response_body_preview text,
    response_error jsonb, response_error_classification text, response_error_purge_after timestamptz,
    duration_ms integer NOT NULL,
    disposition text NOT NULL, error_code text, created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
    CONSTRAINT integration_delivery_attempt_pkey PRIMARY KEY(id),
    CONSTRAINT integration_delivery_attempt_coordinate_uq UNIQUE(tenant_id,delivery_id,attempt),
    CONSTRAINT integration_delivery_attempt_delivery_fk FOREIGN KEY(tenant_id,delivery_id) REFERENCES event.integration_delivery(tenant_id,id),
    CONSTRAINT integration_delivery_attempt_method_chk CHECK(request_method IN ('GET','POST','PUT','PATCH','DELETE')),
    CONSTRAINT integration_delivery_attempt_status_chk CHECK(response_status IS NULL OR response_status BETWEEN 100 AND 599),
    CONSTRAINT integration_delivery_attempt_evidence_chk CHECK(duration_ms>=0 AND completed_at>=started_at AND disposition IN ('transient','permanent')),
    CONSTRAINT integration_delivery_attempt_error_chk CHECK(
        (response_error IS NULL AND response_error_classification IS NULL AND response_error_purge_after IS NULL)
        OR (jsonb_typeof(response_error)='object' AND response_error_classification IN ('provider','transport','validation','security') AND response_error_purge_after>completed_at)
    )
);

CREATE TABLE log.integration_dlq (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, delivery_id uuid NOT NULL,
    failure_code text NOT NULL, failure_message text NOT NULL, attempt_count smallint NOT NULL,
    moved_at timestamptz NOT NULL DEFAULT now(), replayed_at timestamptz, replayed_by uuid,
    CONSTRAINT integration_dlq_pkey PRIMARY KEY(id),
    CONSTRAINT integration_dlq_delivery_uq UNIQUE(tenant_id,delivery_id),
    CONSTRAINT integration_dlq_delivery_fk FOREIGN KEY(tenant_id,delivery_id) REFERENCES event.integration_delivery(tenant_id,id),
    CONSTRAINT integration_dlq_attempt_chk CHECK(attempt_count>0),
    CONSTRAINT integration_dlq_replay_pair_chk CHECK((replayed_at IS NULL)=(replayed_by IS NULL))
);

COMMENT ON TABLE log.integration_delivery_attempt IS 'Immutable redacted evidence for each general connector invocation attempt.';
COMMENT ON TABLE log.integration_dlq IS 'Administrative dead-letter evidence for Integration; notification DLQ remains separately owned.';
