-- ============================================================================
-- master/01y_tables_atlas_conversation.sql
-- Atlas-owned durable conversation state.
--
-- The generic master.conversation row remains the envelope. Atlas transcript
-- content is deliberately kept out of generic comments and out of the
-- operational metering ledger.
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.atlas_thread (
    conversation_id        uuid        NOT NULL,
    tenant_id              uuid        NOT NULL,
    plane                  text        NOT NULL,
    owner_principal_id     uuid        NOT NULL,

    -- Retention is resolved by the server from tenant/platform policy. The
    -- stable text identifier is versioned (for example atlas-default-30d-v1).
    retention_policy_id    text,
    expires_at             timestamptz,
    purge_after            timestamptz,
    legal_hold             boolean     NOT NULL DEFAULT false,
    legal_hold_reference   text,

    -- A summary is optional and versioned. Deployments that cannot retain
    -- clear structured blocks can store only an opaque protected reference.
    summary_blocks         jsonb,
    protected_summary_ref  text,
    summary_version        integer     NOT NULL DEFAULT 0,

    -- Monotonic transcript cursor and optimistic concurrency token.
    last_message_sequence  bigint      NOT NULL DEFAULT 0,
    row_version            bigint      NOT NULL DEFAULT 1,

    created_at             timestamptz NOT NULL DEFAULT now(),
    created_by             uuid        NOT NULL,
    updated_at             timestamptz,
    updated_by             uuid,

    CONSTRAINT atlas_thread_pkey PRIMARY KEY (conversation_id),
    CONSTRAINT atlas_thread_tenant_conversation_uq
        UNIQUE (tenant_id, conversation_id),
    CONSTRAINT atlas_thread_scope_uq
        UNIQUE (tenant_id, conversation_id, plane),
    CONSTRAINT atlas_thread_plane_chk
        CHECK (plane IN ('neon', 'mesh', 'admin')),
    CONSTRAINT atlas_thread_retention_policy_chk
        CHECK (
            retention_policy_id IS NULL
            OR btrim(retention_policy_id) <> ''
        ),
    CONSTRAINT atlas_thread_expiry_chk
        CHECK (expires_at IS NULL OR expires_at > created_at),
    CONSTRAINT atlas_thread_purge_chk
        CHECK (purge_after IS NULL OR purge_after > created_at),
    CONSTRAINT atlas_thread_legal_hold_chk
        CHECK (
            (legal_hold = false AND legal_hold_reference IS NULL)
            OR (
                legal_hold = true
                AND legal_hold_reference IS NOT NULL
                AND btrim(legal_hold_reference) <> ''
            )
        ),
    CONSTRAINT atlas_thread_summary_blocks_chk
        CHECK (
            summary_blocks IS NULL
            OR jsonb_typeof(summary_blocks) = 'array'
        ),
    CONSTRAINT atlas_thread_summary_ref_chk
        CHECK (
            protected_summary_ref IS NULL
            OR btrim(protected_summary_ref) <> ''
        ),
    CONSTRAINT atlas_thread_summary_storage_chk
        CHECK (
            summary_blocks IS NULL
            OR protected_summary_ref IS NULL
        ),
    CONSTRAINT atlas_thread_summary_version_chk
        CHECK (summary_version >= 0),
    CONSTRAINT atlas_thread_sequence_chk
        CHECK (last_message_sequence >= 0),
    CONSTRAINT atlas_thread_row_version_chk
        CHECK (row_version >= 1)
);

COMMENT ON TABLE master.atlas_thread IS
    'ARCHETYPE=C;SCOPE=T. One-to-one Atlas state for a master.conversation. '
    'Principal-private by default. The plane and owner are immutable. '
    'Transcript ordering is controlled by last_message_sequence.';
COMMENT ON COLUMN master.atlas_thread.retention_policy_id IS
    'Stable, versioned server-resolved retention policy identifier. Never accepted as client authority.';
COMMENT ON COLUMN master.atlas_thread.protected_summary_ref IS
    'Opaque reference to protected summary content. Never a provider conversation identifier.';
COMMENT ON COLUMN master.atlas_thread.row_version IS
    'Optimistic concurrency token incremented by a database trigger on every update.';


CREATE TABLE IF NOT EXISTS master.atlas_message (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    conversation_id         uuid        NOT NULL,
    plane                   text        NOT NULL,

    -- A value of zero asks the BEFORE INSERT trigger to allocate the next
    -- sequence. Any explicit positive value must be exactly the next value.
    sequence                bigint      NOT NULL DEFAULT 0,
    role                    text        NOT NULL,

    -- content_blocks is the canonical portable representation. A deployment
    -- may instead retain only a reference to content protected elsewhere.
    content_blocks          jsonb       NOT NULL DEFAULT '[]'::jsonb,
    protected_content_ref   text,

    status                  text        NOT NULL DEFAULT 'pending',
    run_id                  uuid,
    parent_message_id       uuid,

    result_cards            jsonb       NOT NULL DEFAULT '[]'::jsonb,
    citation_refs           jsonb       NOT NULL DEFAULT '[]'::jsonb,
    tool_refs               jsonb       NOT NULL DEFAULT '[]'::jsonb,

    terminal_error_class    text,
    terminal_at             timestamptz,

    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT atlas_message_pkey PRIMARY KEY (id),
    CONSTRAINT atlas_message_scope_id_uq
        UNIQUE (tenant_id, conversation_id, plane, id),
    CONSTRAINT atlas_message_sequence_uq
        UNIQUE (tenant_id, conversation_id, sequence),
    CONSTRAINT atlas_message_plane_chk
        CHECK (plane IN ('neon', 'mesh', 'admin')),
    CONSTRAINT atlas_message_sequence_chk
        CHECK (sequence > 0),
    CONSTRAINT atlas_message_role_chk
        CHECK (role IN ('user', 'assistant', 'tool', 'system')),
    CONSTRAINT atlas_message_status_chk
        CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    CONSTRAINT atlas_message_content_blocks_chk
        CHECK (jsonb_typeof(content_blocks) = 'array'),
    CONSTRAINT atlas_message_content_ref_chk
        CHECK (
            protected_content_ref IS NULL
            OR btrim(protected_content_ref) <> ''
        ),
    CONSTRAINT atlas_message_content_storage_chk
        CHECK (
            protected_content_ref IS NULL
            OR content_blocks = '[]'::jsonb
        ),
    CONSTRAINT atlas_message_result_cards_chk
        CHECK (jsonb_typeof(result_cards) = 'array'),
    CONSTRAINT atlas_message_citation_refs_chk
        CHECK (jsonb_typeof(citation_refs) = 'array'),
    CONSTRAINT atlas_message_tool_refs_chk
        CHECK (jsonb_typeof(tool_refs) = 'array'),
    CONSTRAINT atlas_message_parent_chk
        CHECK (parent_message_id IS NULL OR parent_message_id <> id),
    CONSTRAINT atlas_message_terminal_chk
        CHECK (
            (status = 'pending' AND terminal_at IS NULL)
            OR (status IN ('completed', 'failed', 'cancelled') AND terminal_at IS NOT NULL)
        ),
    CONSTRAINT atlas_message_error_chk
        CHECK (
            (
                status IN ('pending', 'completed')
                AND terminal_error_class IS NULL
            )
            OR (
                status IN ('failed', 'cancelled')
                AND terminal_error_class IS NOT NULL
                AND btrim(terminal_error_class) <> ''
            )
        )
);

COMMENT ON TABLE master.atlas_message IS
    'ARCHETYPE=C;SCOPE=T;SUBTYPE=TERMINAL_IMMUTABLE. Ordered Atlas transcript message. '
    'Pending assistant content may be finalized once; terminal rows are immutable. '
    'Operational logs and metering rows must not duplicate content from this table.';
COMMENT ON COLUMN master.atlas_message.sequence IS
    'Strictly monotonic per conversation. Allocated under an atlas_thread row lock.';
COMMENT ON COLUMN master.atlas_message.content_blocks IS
    'Portable Atlas content blocks. Must be empty when protected_content_ref is used.';
COMMENT ON COLUMN master.atlas_message.terminal_error_class IS
    'Safe bounded error classification only; never a raw provider error or prompt fragment.';
