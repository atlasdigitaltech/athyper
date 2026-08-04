CREATE TABLE snapshot.content_item_version (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    content_item_id uuid        NOT NULL,
    version         integer     NOT NULL,
    body_json       jsonb       NOT NULL,
    body_format     text        NOT NULL DEFAULT 'slate',
    change_summary  text,
    checksum        text        NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,

    CONSTRAINT content_item_version_pkey PRIMARY KEY (id),
    CONSTRAINT content_item_version_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT content_item_version_item_id_uq
        UNIQUE (tenant_id, content_item_id, id),
    CONSTRAINT content_item_version_number_uq
        UNIQUE (tenant_id, content_item_id, version),
    CONSTRAINT content_item_version_checksum_uq
        UNIQUE (tenant_id, content_item_id, checksum),
    CONSTRAINT content_item_version_number_chk CHECK (version >= 1),
    CONSTRAINT content_item_version_body_chk
        CHECK (jsonb_typeof(body_json) IN ('object', 'array')),
    CONSTRAINT content_item_version_format_chk
        CHECK (body_format IN ('slate', 'prosemirror', 'html', 'markdown')),
    CONSTRAINT content_item_version_summary_chk
        CHECK (change_summary IS NULL OR length(change_summary) <= 2048),
    CONSTRAINT content_item_version_checksum_chk
        CHECK (checksum ~ '^[a-f0-9]{64}$')
);

COMMENT ON TABLE snapshot.content_item_version IS
  'Immutable content body snapshot. UPDATE and DELETE are rejected by trigger.';
