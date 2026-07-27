-- ============================================================================
-- event/01g_authorization_change_capture.sql
-- Wave 0 commit-ordered authorization source change capture.
--
-- This is intentionally separate from event.outbox:
--   * capture rows are append-only migration evidence, not delivery jobs;
--   * they are never marked completed or purged by outbox housekeeping;
--   * tenant_id is nullable for shared/platform sources;
--   * one transactional clock provides a durable, replayable source watermark.
-- ============================================================================

CREATE TABLE IF NOT EXISTS event.authorization_capture_clock (
    singleton_id             smallint    NOT NULL DEFAULT 1,
    source_database_id       uuid        NOT NULL DEFAULT gen_random_uuid(),
    capture_contract_version text        NOT NULL,
    current_watermark        bigint      NOT NULL DEFAULT 0,
    installed_at             timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT authorization_capture_clock_pkey PRIMARY KEY (singleton_id),
    CONSTRAINT authorization_capture_clock_singleton_chk CHECK (singleton_id = 1),
    CONSTRAINT authorization_capture_clock_source_uq UNIQUE (source_database_id),
    CONSTRAINT authorization_capture_clock_version_chk
        CHECK (btrim(capture_contract_version) <> ''),
    CONSTRAINT authorization_capture_clock_watermark_chk
        CHECK (current_watermark >= 0)
);

COMMENT ON TABLE event.authorization_capture_clock IS
    'Singleton transactional source clock. Capture triggers UPDATE this row in '
    'the same transaction as each legacy write. The row lock serializes the '
    'low-volume authorization write stream, so allocated watermarks are commit '
    'ordered and roll back with the source transaction. Do not replace with '
    'nextval(): sequence allocation can be observed out of commit order.';

INSERT INTO event.authorization_capture_clock (
    singleton_id,
    capture_contract_version
)
VALUES (1, 'wave0.authz-capture.v1')
ON CONFLICT (singleton_id) DO UPDATE
SET
    capture_contract_version = EXCLUDED.capture_contract_version,
    updated_at = now();


CREATE TABLE IF NOT EXISTS event.authorization_change_transaction (
    source_database_id       uuid        NOT NULL,
    source_txid              bigint      NOT NULL,
    first_watermark          bigint      NOT NULL,
    last_watermark           bigint      NOT NULL,
    event_count              integer     NOT NULL,
    first_captured_at        timestamptz NOT NULL,
    last_captured_at         timestamptz NOT NULL,
    capture_contract_version text        NOT NULL,

    CONSTRAINT authorization_change_transaction_pkey
        PRIMARY KEY (source_database_id, source_txid),
    CONSTRAINT authorization_change_transaction_txid_chk
        CHECK (source_txid > 0),
    CONSTRAINT authorization_change_transaction_range_chk
        CHECK (
            first_watermark > 0
            AND last_watermark >= first_watermark
            AND event_count > 0
        ),
    CONSTRAINT authorization_change_transaction_time_chk
        CHECK (last_captured_at >= first_captured_at),
    CONSTRAINT authorization_change_transaction_version_chk
        CHECK (btrim(capture_contract_version) <> '')
);

COMMENT ON TABLE event.authorization_change_transaction IS
    'One visible row per committed source transaction. first/last watermark and '
    'event_count let projectors apply all related authority changes atomically '
    'and avoid advancing a checkpoint through a partial transaction.';


CREATE TABLE IF NOT EXISTS event.authorization_change_event (
    source_database_id       uuid        NOT NULL,
    source_watermark         bigint      NOT NULL,
    source_txid              bigint      NOT NULL,
    source_schema            text        NOT NULL,
    source_table             text        NOT NULL,
    source_kind              text        NOT NULL,
    operation                char(1)     NOT NULL,
    tenant_id                uuid,
    source_primary_key       jsonb,
    old_row                  jsonb,
    new_row                  jsonb,
    old_row_sha256           text,
    new_row_sha256           text,
    session_user_name        text        NOT NULL,
    current_user_name        text        NOT NULL,
    application_name         text,
    actor_principal_id       uuid,
    request_id               text,
    correlation_id           uuid,
    transaction_started_at   timestamptz NOT NULL,
    statement_started_at     timestamptz NOT NULL,
    captured_at              timestamptz NOT NULL,
    capture_contract_version text        NOT NULL,
    privacy_redacted         boolean     NOT NULL DEFAULT true,

    CONSTRAINT authorization_change_event_pkey
        PRIMARY KEY (source_database_id, source_watermark),
    CONSTRAINT authorization_change_event_watermark_chk
        CHECK (source_watermark > 0),
    CONSTRAINT authorization_change_event_txid_chk
        CHECK (source_txid > 0),
    CONSTRAINT authorization_change_event_source_chk
        CHECK (
            source_schema ~ '^[a-z][a-z0-9_]*$'
            AND source_table ~ '^[a-z][a-z0-9_]*$'
        ),
    CONSTRAINT authorization_change_event_kind_chk
        CHECK (source_kind IN (
            'catalog', 'identity', 'entitlement', 'authority', 'scope', 'metadata'
        )),
    CONSTRAINT authorization_change_event_operation_chk
        CHECK (operation IN ('I','U','D','T')),
    CONSTRAINT authorization_change_event_primary_key_chk
        CHECK (
            source_primary_key IS NULL
            OR jsonb_typeof(source_primary_key) = 'object'
        ),
    CONSTRAINT authorization_change_event_old_row_chk
        CHECK (old_row IS NULL OR jsonb_typeof(old_row) = 'object'),
    CONSTRAINT authorization_change_event_new_row_chk
        CHECK (new_row IS NULL OR jsonb_typeof(new_row) = 'object'),
    CONSTRAINT authorization_change_event_shape_chk
        CHECK (
            (operation = 'I' AND old_row IS NULL AND new_row IS NOT NULL)
            OR (operation = 'U' AND old_row IS NOT NULL AND new_row IS NOT NULL)
            OR (operation = 'D' AND old_row IS NOT NULL AND new_row IS NULL)
            OR (
                operation = 'T'
                AND old_row IS NULL
                AND new_row IS NULL
                AND source_primary_key IS NULL
            )
        ),
    CONSTRAINT authorization_change_event_old_hash_chk
        CHECK (old_row_sha256 IS NULL OR old_row_sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT authorization_change_event_new_hash_chk
        CHECK (new_row_sha256 IS NULL OR new_row_sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT authorization_change_event_hash_shape_chk
        CHECK (
            (old_row IS NULL) = (old_row_sha256 IS NULL)
            AND (new_row IS NULL) = (new_row_sha256 IS NULL)
        ),
    CONSTRAINT authorization_change_event_user_chk
        CHECK (
            btrim(session_user_name) <> ''
            AND btrim(current_user_name) <> ''
        ),
    CONSTRAINT authorization_change_event_application_len_chk
        CHECK (application_name IS NULL OR length(application_name) <= 256),
    CONSTRAINT authorization_change_event_request_len_chk
        CHECK (request_id IS NULL OR length(request_id) <= 256),
    CONSTRAINT authorization_change_event_time_chk
        CHECK (
            captured_at >= transaction_started_at
            AND captured_at >= statement_started_at
        ),
    CONSTRAINT authorization_change_event_version_chk
        CHECK (btrim(capture_contract_version) <> ''),
    CONSTRAINT authorization_change_event_privacy_chk
        CHECK (privacy_redacted)
);

COMMENT ON TABLE event.authorization_change_event IS
    'Append-only, privacy-redacted legacy authorization-input changes. Raw '
    'redacted values are never stored. Watermarks are allocated by the locked '
    'transactional clock and are safe for replay in committed order.';


CREATE TABLE IF NOT EXISTS event.authorization_projection_checkpoint (
    id                         uuid        NOT NULL DEFAULT shared.uuidv7(),
    migration_run_id           uuid        NOT NULL,
    consumer_name              text        NOT NULL,
    source_database_id         uuid        NOT NULL,
    last_applied_watermark     bigint      NOT NULL DEFAULT 0,
    last_applied_txid          bigint,
    last_applied_event_at      timestamptz,
    state                      text        NOT NULL DEFAULT 'idle',
    lease_owner                text,
    lease_acquired_at          timestamptz,
    lease_until                timestamptz,
    last_error                 text,
    last_error_at              timestamptz,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    updated_at                 timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT authorization_projection_checkpoint_pkey PRIMARY KEY (id),
    CONSTRAINT authorization_projection_checkpoint_uq
        UNIQUE (migration_run_id, consumer_name, source_database_id),
    CONSTRAINT authorization_projection_checkpoint_consumer_chk
        CHECK (consumer_name ~ '^[a-z][a-z0-9_.-]{2,127}$'),
    CONSTRAINT authorization_projection_checkpoint_watermark_chk
        CHECK (last_applied_watermark >= 0),
    CONSTRAINT authorization_projection_checkpoint_txid_chk
        CHECK (last_applied_txid IS NULL OR last_applied_txid > 0),
    CONSTRAINT authorization_projection_checkpoint_state_chk
        CHECK (state IN ('idle', 'running', 'paused', 'failed', 'cutover', 'retired')),
    CONSTRAINT authorization_projection_checkpoint_lease_chk
        CHECK (
            (
                lease_owner IS NULL
                AND lease_acquired_at IS NULL
                AND lease_until IS NULL
            )
            OR (
                lease_owner IS NOT NULL
                AND lease_acquired_at IS NOT NULL
                AND lease_until IS NOT NULL
                AND lease_until > lease_acquired_at
            )
        ),
    CONSTRAINT authorization_projection_checkpoint_error_chk
        CHECK ((last_error IS NULL) = (last_error_at IS NULL))
);

COMMENT ON TABLE event.authorization_projection_checkpoint IS
    'Durable projector checkpoint. A projector advances only after applying the '
    'entire source transaction identified by authorization_change_transaction.';


CREATE TABLE IF NOT EXISTS event.authorization_snapshot_marker (
    id                         uuid        NOT NULL DEFAULT shared.uuidv7(),
    migration_run_id           uuid        NOT NULL,
    snapshot_label             text        NOT NULL,
    source_database_id         uuid        NOT NULL,
    source_watermark           bigint      NOT NULL,
    capture_contract_version   text        NOT NULL,
    transaction_snapshot       text        NOT NULL,
    manifest_hint              text,
    recorded_at                timestamptz NOT NULL DEFAULT clock_timestamp(),
    recorded_by                text        NOT NULL DEFAULT session_user,

    CONSTRAINT authorization_snapshot_marker_pkey PRIMARY KEY (id),
    CONSTRAINT authorization_snapshot_marker_uq
        UNIQUE (migration_run_id, snapshot_label),
    CONSTRAINT authorization_snapshot_marker_label_chk
        CHECK (snapshot_label ~ '^[a-z0-9][a-z0-9_.-]{2,127}$'),
    CONSTRAINT authorization_snapshot_marker_watermark_chk
        CHECK (source_watermark >= 0),
    CONSTRAINT authorization_snapshot_marker_version_chk
        CHECK (btrim(capture_contract_version) <> ''),
    CONSTRAINT authorization_snapshot_marker_snapshot_chk
        CHECK (btrim(transaction_snapshot) <> '')
);

COMMENT ON TABLE event.authorization_snapshot_marker IS
    'Durable marker recorded inside the same REPEATABLE READ transaction used '
    'to export the initial snapshot. Replay begins strictly after '
    'source_watermark. The source DB and this marker remain retained through '
    'the rollback observation window.';

