CREATE TABLE ops.job_execution (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid,
    cron_schedule_id      uuid,
    parent_execution_id   uuid,
    execution_key         text        NOT NULL,
    job_code              text        NOT NULL,
    job_type              text,
    run_id                uuid,
    correlation_id        uuid,
    trace_id              text,
    span_id               text,
    worker_id             text,
    status                text        NOT NULL DEFAULT 'queued',
    attempt_no            smallint    NOT NULL DEFAULT 1,
    max_attempts          smallint    NOT NULL DEFAULT 1,
    input_payload         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    result_payload        jsonb,
    error_code            text,
    error_message         text,
    error_detail          jsonb,
    scheduled_at          timestamptz,
    started_at            timestamptz,
    completed_at          timestamptz,
    duration_ms           bigint,
    purge_after           timestamptz,
    metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT job_execution_pkey PRIMARY KEY (id),
    CONSTRAINT job_execution_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT job_execution_key_uq UNIQUE NULLS NOT DISTINCT (tenant_id, execution_key),
    CONSTRAINT job_execution_key_chk CHECK (btrim(execution_key) <> ''),
    CONSTRAINT job_execution_code_chk CHECK (job_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT job_execution_status_chk CHECK (
        status IN ('queued','running','retrying','succeeded','failed','cancelled','timed_out','dead_letter')
    ),
    CONSTRAINT job_execution_attempt_chk CHECK (
        attempt_no > 0 AND max_attempts > 0 AND attempt_no <= max_attempts
    ),
    CONSTRAINT job_execution_json_chk CHECK (
        jsonb_typeof(input_payload) = 'object'
        AND (result_payload IS NULL OR jsonb_typeof(result_payload) = 'object')
        AND (error_detail IS NULL OR jsonb_typeof(error_detail) = 'object')
        AND jsonb_typeof(metadata) = 'object'
    ),
    CONSTRAINT job_execution_time_chk CHECK (
        (started_at IS NULL OR started_at >= COALESCE(scheduled_at, created_at))
        AND (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at)
        AND (purge_after IS NULL OR purge_after > created_at)
    ),
    CONSTRAINT job_execution_terminal_chk CHECK (
        (status IN ('succeeded','failed','cancelled','timed_out','dead_letter') AND completed_at IS NOT NULL)
        OR (status NOT IN ('succeeded','failed','cancelled','timed_out','dead_letter') AND completed_at IS NULL)
    ),
    CONSTRAINT job_execution_error_chk CHECK (
        status NOT IN ('failed','timed_out','dead_letter') OR error_code IS NOT NULL
    ),
    CONSTRAINT job_execution_duration_chk CHECK (duration_ms IS NULL OR duration_ms >= 0),
    CONSTRAINT job_execution_parent_chk CHECK (parent_execution_id IS NULL OR parent_execution_id <> id),
    CONSTRAINT job_execution_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE ops.job_execution IS
  'Plane-local durable job execution and retry history replacing legacy log.job_log. Global executions use NULL tenant_id.';
