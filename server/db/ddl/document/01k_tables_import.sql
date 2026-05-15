-- ============================================================================
-- document/01k_tables_import.sql
-- Concept: Data Import — XLSX/CSV import request and chunk processing lifecycle
-- Depends on: 04_tables/004_document.sql
-- Scope: Bulk import execution tables — request header + chunk work units.
-- ============================================================================

-- ══════════════════════════════════════════════════════════════════════════════
-- §1  document.import_request — bulk import submission header
-- ══════════════════════════════════════════════════════════════════════════════
-- One row per import submission. id is returned to the frontend as uploadToken
-- and jobId. File is stored in object storage at file_ref.
-- Dry-runs do not create a row; only actual imports are persisted.
CREATE TABLE IF NOT EXISTS document.import_request (
    -- Identity
    id              uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid            NOT NULL,

    -- Target
    entity_name     text            NOT NULL,       -- e.g. 'supplier', 'journal_entry'

    -- File
    file_ref        text            NOT NULL,       -- S3 object key
    file_name       text            NOT NULL,       -- original filename for display
    file_size_bytes bigint,
    file_format     text            NOT NULL DEFAULT 'csv',   -- csv | xlsx | tsv

    -- Mapping (snapshot at submission time)
    mapping_config  jsonb           NOT NULL DEFAULT '[]',    -- ColumnMapping[]
    import_mode     text            NOT NULL DEFAULT 'create', -- create | update | upsert

    -- Processing options
    options         jsonb           NOT NULL DEFAULT '{}',    -- { chunk_size, error_threshold_pct }

    -- Progress (updated by worker)
    total_rows      integer,
    processed_rows  integer         NOT NULL DEFAULT 0,
    success_count   integer         NOT NULL DEFAULT 0,
    error_count     integer         NOT NULL DEFAULT 0,

    -- Lifecycle
    status          text            NOT NULL DEFAULT 'uploaded',
    -- uploaded → processing → completed | failed | cancelled
    error_summary   jsonb,
    started_at      timestamptz,
    completed_at    timestamptz,

    -- Audit
    submitted_by    uuid            NOT NULL,
    created_at      timestamptz     NOT NULL DEFAULT now(),
    created_by      uuid            NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT import_request_pkey              PRIMARY KEY (id),
    CONSTRAINT import_request_tenant_uq         UNIQUE (tenant_id, id),
    CONSTRAINT import_request_entity_fmt        CHECK (btrim(entity_name) <> ''),
    CONSTRAINT import_request_file_fmt          CHECK (btrim(file_ref) <> ''),
    CONSTRAINT import_request_format_chk        CHECK (file_format IN ('csv', 'xlsx', 'tsv')),
    CONSTRAINT import_request_mode_chk          CHECK (import_mode IN ('create', 'update', 'upsert')),
    CONSTRAINT import_request_status_chk        CHECK (status IN (
        'uploaded', 'processing', 'completed', 'failed', 'cancelled'
    )),
    CONSTRAINT import_request_rows_chk          CHECK (
        processed_rows >= 0 AND success_count >= 0 AND error_count >= 0
    ),
    CONSTRAINT import_request_mapping_chk       CHECK (jsonb_typeof(mapping_config) = 'array'),
    CONSTRAINT import_request_options_chk       CHECK (jsonb_typeof(options) = 'object')
);

CREATE INDEX IF NOT EXISTS import_request_tenant_status_idx
    ON document.import_request (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS import_request_tenant_entity_idx
    ON document.import_request (tenant_id, entity_name, created_at DESC);

COMMENT ON TABLE  document.import_request IS
    'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Bulk import submission. id = uploadToken returned to client. '
    'File stored in object storage at file_ref. '
    'Status: uploaded → processing → completed | failed | cancelled.';


-- ══════════════════════════════════════════════════════════════════════════════
-- §2  document.import_request_chunk — independently retryable row batches
-- ══════════════════════════════════════════════════════════════════════════════
-- Each chunk is a BullMQ job unit. Default chunk_size = 500 rows.
-- Errors stored as JSON array for per-row error reporting.
CREATE TABLE IF NOT EXISTS document.import_request_chunk (
    -- Identity
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    import_request_id   uuid        NOT NULL,   -- FK: document.import_request.id

    -- Position
    chunk_index         smallint    NOT NULL,   -- 0-based ordering
    row_start           integer     NOT NULL,   -- 1-based spreadsheet row number (inclusive)
    row_end             integer     NOT NULL,   -- inclusive

    -- Lifecycle
    status              text        NOT NULL DEFAULT 'pending',
    -- pending → processing → completed | failed | cancelled

    -- Counts
    success_count       integer     NOT NULL DEFAULT 0,
    error_count         integer     NOT NULL DEFAULT 0,

    -- Per-row errors: [{row_number, field, error_code, message}]
    errors_json         jsonb       NOT NULL DEFAULT '[]',

    -- BullMQ correlation
    job_id              text,
    attempt_no          smallint    NOT NULL DEFAULT 1,

    -- Timing
    started_at          timestamptz,
    completed_at        timestamptz,
    duration_ms         integer,

    CONSTRAINT import_chunk_pkey            PRIMARY KEY (id),
    CONSTRAINT import_chunk_request_fk      FOREIGN KEY (import_request_id)
                                                REFERENCES document.import_request (id)
                                                ON DELETE CASCADE,
    CONSTRAINT import_chunk_status_chk      CHECK (status IN (
        'pending', 'processing', 'completed', 'failed', 'cancelled'
    )),
    CONSTRAINT import_chunk_rows_chk        CHECK (
        row_start > 0 AND row_end >= row_start AND chunk_index >= 0
    ),
    CONSTRAINT import_chunk_counts_chk     CHECK (
        success_count >= 0 AND error_count >= 0
    ),
    CONSTRAINT import_chunk_errors_chk     CHECK (jsonb_typeof(errors_json) = 'array')
);

CREATE INDEX IF NOT EXISTS import_chunk_request_idx
    ON document.import_request_chunk (import_request_id, chunk_index);

CREATE INDEX IF NOT EXISTS import_chunk_status_idx
    ON document.import_request_chunk (import_request_id, status)
    WHERE status IN ('pending', 'processing');

COMMENT ON TABLE  document.import_request_chunk IS
    'ARCHETYPE=E;SCOPE=T. Independently retryable batch of rows within an import request. '
    'Each chunk becomes one BullMQ job on the jobs-import queue. '
    'errors_json: [{row_number, field, error_code, message}] per failed row.';
