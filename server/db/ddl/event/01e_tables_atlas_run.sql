-- ============================================================================
-- event/01e_tables_atlas_run.sql
-- Durable in-flight/terminal Atlas run coordination.
--
-- This is not the Phase 1 usage ledger. Prompt/response content is never
-- stored here; terminal usage/cost remains in log.ai_agent_run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS event.atlas_run (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,
    conversation_id             uuid        NOT NULL,
    plane                       text        NOT NULL,
    principal_id                uuid        NOT NULL,
    client_request_id           uuid        NOT NULL,

    input_message_id            uuid        NOT NULL,
    output_message_id           uuid        NOT NULL,

    status                      text        NOT NULL DEFAULT 'started',
    cancellation_requested_at   timestamptz,
    cancellation_requested_by   uuid,
    terminal_at                 timestamptz,
    terminal_error_class        text,

    -- Set once after the terminal Phase 1 metering row is written.
    metering_run_id             uuid,

    started_at                  timestamptz NOT NULL DEFAULT now(),
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT atlas_run_pkey PRIMARY KEY (id),
    CONSTRAINT atlas_run_tenant_id_uq
        UNIQUE (tenant_id, id),
    CONSTRAINT atlas_run_scope_id_uq
        UNIQUE (tenant_id, conversation_id, plane, id),
    CONSTRAINT atlas_run_client_request_uq
        UNIQUE (tenant_id, client_request_id),
    CONSTRAINT atlas_run_input_uq
        UNIQUE (tenant_id, conversation_id, plane, input_message_id),
    CONSTRAINT atlas_run_output_uq
        UNIQUE (tenant_id, conversation_id, plane, output_message_id),
    CONSTRAINT atlas_run_messages_distinct_chk
        CHECK (input_message_id <> output_message_id),
    CONSTRAINT atlas_run_plane_chk
        CHECK (plane IN ('neon', 'mesh', 'admin')),
    CONSTRAINT atlas_run_status_chk
        CHECK (status IN ('started', 'completed', 'failed', 'cancelled')),
    CONSTRAINT atlas_run_cancel_request_chk
        CHECK (
            (
                cancellation_requested_at IS NULL
                AND cancellation_requested_by IS NULL
            )
            OR (
                cancellation_requested_at IS NOT NULL
                AND cancellation_requested_by = principal_id
            )
        ),
    CONSTRAINT atlas_run_terminal_chk
        CHECK (
            (status = 'started' AND terminal_at IS NULL)
            OR (status IN ('completed', 'failed', 'cancelled') AND terminal_at IS NOT NULL)
        ),
    CONSTRAINT atlas_run_error_chk
        CHECK (
            (
                status IN ('started', 'completed')
                AND terminal_error_class IS NULL
            )
            OR (
                status IN ('failed', 'cancelled')
                AND terminal_error_class IS NOT NULL
                AND btrim(terminal_error_class) <> ''
            )
        ),
    CONSTRAINT atlas_run_time_chk
        CHECK (
            created_at >= started_at
            AND (terminal_at IS NULL OR terminal_at >= started_at)
            AND (
                cancellation_requested_at IS NULL
                OR cancellation_requested_at >= started_at
            )
        )
);

COMMENT ON TABLE event.atlas_run IS
    'ARCHETYPE=B_LITE;SCOPE=T;SUBTYPE=TERMINAL_IMMUTABLE. Durable Atlas run and '
    'idempotency coordinator. Contains identifiers and lifecycle metadata only; '
    'prompt/response content belongs exclusively to master.atlas_message.';
COMMENT ON COLUMN event.atlas_run.client_request_id IS
    'Tenant-unique client idempotency key. Retries return the existing run and messages.';
COMMENT ON COLUMN event.atlas_run.metering_run_id IS
    'Optional one-time reconciliation link to append-only log.ai_agent_run.';
