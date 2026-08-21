CREATE TABLE ops.reference_sync_checkpoint (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    source_plane_code     text        NOT NULL,
    source_schema_name    text        NOT NULL,
    source_table_name     text        NOT NULL,
    target_schema_name    text        NOT NULL,
    target_table_name     text        NOT NULL,
    source_version        text,
    source_checksum       text,
    record_count          integer,
    changed_row_count     integer,
    retired_row_count     integer,
    status                text        NOT NULL DEFAULT 'stale',
    last_attempted_at     timestamptz,
    last_succeeded_at     timestamptz,
    error_code            text,
    error_message         text,
    metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT reference_sync_checkpoint_pkey PRIMARY KEY (id),
    CONSTRAINT reference_sync_checkpoint_coordinate_uq UNIQUE (
        source_plane_code, source_schema_name, source_table_name,
        target_schema_name, target_table_name
    ),
    CONSTRAINT reference_sync_checkpoint_plane_chk
        CHECK (source_plane_code IN ('admin','neon')),
    CONSTRAINT reference_sync_checkpoint_identifier_chk CHECK (
        source_schema_name ~ '^[a-z][a-z0-9_]*$'
        AND source_table_name ~ '^[a-z][a-z0-9_]*$'
        AND target_schema_name ~ '^[a-z][a-z0-9_]*$'
        AND target_table_name ~ '^[a-z][a-z0-9_]*$'
    ),
    CONSTRAINT reference_sync_checkpoint_checksum_chk
        CHECK (source_checksum IS NULL OR source_checksum ~ '^[a-f0-9]{64}$'),
    CONSTRAINT reference_sync_checkpoint_count_chk CHECK (
        (record_count IS NULL OR record_count >= 0)
        AND (changed_row_count IS NULL OR changed_row_count >= 0)
        AND (retired_row_count IS NULL OR retired_row_count >= 0)
    ),
    CONSTRAINT reference_sync_checkpoint_status_chk
        CHECK (status IN ('current','stale','syncing','error')),
    CONSTRAINT reference_sync_checkpoint_time_chk CHECK (
        last_succeeded_at IS NULL OR last_attempted_at IS NULL
        OR last_succeeded_at <= last_attempted_at
    ),
    CONSTRAINT reference_sync_checkpoint_error_chk CHECK (
        status = 'error' OR (error_code IS NULL AND error_message IS NULL)
    ),
    CONSTRAINT reference_sync_checkpoint_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT reference_sync_checkpoint_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE ops.reference_sync_checkpoint IS
  'Mesh-target checkpoint for Admin/Neon reference snapshots applied to Mesh-local tables. Source planes do not store this target state.';
