-- Unified attachment, collaboration, content, and conversation foundation.
-- entity_type/entity_id remain API coordinates until the metadata entity
-- registry and control.owner_type catalog have complete one-to-one coverage.


COMMENT ON TABLE document.attachment IS
  'Tenant-scoped object-storage attachment metadata shared by all planes. Processing fields remain operational compatibility fields until a protected processing satellite is introduced.';


COMMENT ON TABLE document.attachment_link IS
  'Canonical polymorphic entity-to-attachment relation. Replaces the misleading master.entity_document_link name.';


CREATE UNIQUE INDEX content_item_root_slug_uq
    ON document.content_item (tenant_id, locale_code, slug)
    WHERE parent_id IS NULL;
CREATE UNIQUE INDEX content_item_child_slug_uq
    ON document.content_item (tenant_id, parent_id, locale_code, slug)
    WHERE parent_id IS NOT NULL;


CREATE TABLE document.conversation (
    id                uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id         uuid                           NOT NULL,
    type              text                           NOT NULL DEFAULT 'dm',
    title             text,
    entity_type       text,
    entity_id         uuid,
    metadata          jsonb                          NOT NULL DEFAULT '{}'::jsonb,
    status            document.conversation_status_d NOT NULL DEFAULT 'active',
    status_changed_at timestamptz,
    status_changed_by uuid,
    deleted_at        timestamptz,
    deleted_by        uuid,
    created_at        timestamptz                    NOT NULL DEFAULT now(),
    created_by        uuid                           NOT NULL,
    updated_at        timestamptz,
    updated_by        uuid,

    CONSTRAINT conversation_pkey PRIMARY KEY (id),
    CONSTRAINT conversation_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT conversation_type_chk CHECK (type ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT conversation_title_chk
        CHECK (title IS NULL OR (btrim(title) <> '' AND length(title) <= 512)),
    CONSTRAINT conversation_owner_pair_chk
        CHECK ((entity_type IS NULL) = (entity_id IS NULL)),
    CONSTRAINT conversation_entity_type_chk
        CHECK (
            entity_type IS NULL
            OR entity_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)?$'
        ),
    CONSTRAINT conversation_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT conversation_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT conversation_delete_pair_chk
        CHECK ((deleted_at IS NULL) = (deleted_by IS NULL)),
    CONSTRAINT conversation_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.conversation_participant (
    id                   uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id            uuid        NOT NULL,
    conversation_id      uuid        NOT NULL,
    principal_id         uuid        NOT NULL,
    role                 text        NOT NULL DEFAULT 'member',
    last_read_message_id uuid,
    last_read_at         timestamptz,
    joined_at            timestamptz NOT NULL DEFAULT now(),
    left_at              timestamptz,
    left_by              uuid,
    leave_reason         text,
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid        NOT NULL,
    updated_at           timestamptz,
    updated_by           uuid,

    CONSTRAINT conversation_participant_pkey PRIMARY KEY (id),
    CONSTRAINT conversation_participant_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT conversation_participant_member_uq
        UNIQUE (tenant_id, conversation_id, principal_id),
    CONSTRAINT conversation_participant_role_chk
        CHECK (role IN ('owner', 'admin', 'member', 'observer')),
    CONSTRAINT conversation_participant_leave_pair_chk
        CHECK ((left_at IS NULL) = (left_by IS NULL)),
    CONSTRAINT conversation_participant_leave_reason_chk
        CHECK (leave_reason IS NULL OR (left_at IS NOT NULL AND btrim(leave_reason) <> '')),
    CONSTRAINT conversation_participant_dates_chk
        CHECK (left_at IS NULL OR left_at >= joined_at),
    CONSTRAINT conversation_participant_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.multipart_upload (
    id             uuid                               NOT NULL DEFAULT shared.uuidv7(),
    tenant_id      uuid                               NOT NULL,
    upload_id      text                               NOT NULL,
    storage_bucket text                               NOT NULL,
    storage_key    text                               NOT NULL,
    file_name      text                               NOT NULL,
    content_type   text,
    size_bytes     bigint,
    part_etags     jsonb                              NOT NULL DEFAULT '[]'::jsonb,
    status         document.multipart_upload_status_d NOT NULL DEFAULT 'initiated',
    expires_at     timestamptz                        NOT NULL,
    completed_at   timestamptz,
    aborted_at     timestamptz,
    attachment_id  uuid,
    initiated_by            uuid                               NOT NULL,
    attachment_series_id    uuid,
    parent_attachment_id    uuid,
    quarantine_key          text,
    expected_file_name      text,
    expected_content_type   text,
    expected_size_bytes     bigint,
    expected_sha256         text,
    version                 integer,
    created_at              timestamptz                        NOT NULL DEFAULT now(),
    created_by              uuid                               NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT multipart_upload_pkey PRIMARY KEY (id),
    CONSTRAINT multipart_upload_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT multipart_upload_upload_id_uq UNIQUE (tenant_id, upload_id),
    CONSTRAINT multipart_upload_id_chk CHECK (btrim(upload_id) <> ''),
    CONSTRAINT multipart_upload_storage_chk
        CHECK (btrim(storage_bucket) <> '' AND btrim(storage_key) <> ''),
    CONSTRAINT multipart_upload_file_name_chk
        CHECK (btrim(file_name) <> '' AND length(file_name) <= 1024),
    CONSTRAINT multipart_upload_size_chk CHECK (size_bytes IS NULL OR size_bytes >= 0),
    CONSTRAINT multipart_upload_parts_chk CHECK (jsonb_typeof(part_etags) = 'array'),
    CONSTRAINT multipart_upload_completion_chk
        CHECK (
            (status = 'completed' AND completed_at IS NOT NULL AND attachment_id IS NOT NULL)
            OR (status <> 'completed' AND completed_at IS NULL)
        ),
    CONSTRAINT multipart_upload_abort_chk
        CHECK (
            (status IN ('aborted', 'expired') AND aborted_at IS NOT NULL)
            OR (status NOT IN ('aborted', 'expired') AND aborted_at IS NULL)
        ),
    CONSTRAINT multipart_upload_expected_size_chk
        CHECK (expected_size_bytes IS NULL OR expected_size_bytes >= 0),
    CONSTRAINT multipart_upload_expected_sha256_chk
        CHECK (expected_sha256 IS NULL OR expected_sha256 ~ '^[a-f0-9]{64}$'),
    CONSTRAINT multipart_upload_version_chk CHECK (version IS NULL OR version >= 1),
    CONSTRAINT multipart_upload_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);


COMMENT ON TABLE document.attachment_series IS
  'Logical identity for a versioned attachment. current_attachment_id tracks the latest active version; all entity links target the series, not individual versions.';


COMMENT ON TABLE document.attachment_legal_hold IS
  'Evidentiary hold on an attachment series. Active when released_at IS NULL. Placement evidence is immutable. Release requires all three fields. Rows cannot be deleted through the application role.';


COMMENT ON TABLE document.attachment_legal_hold_event IS
  'Append-only evidentiary log for hold placement and release. Answers who did what, when, and why. Rows are immutable once written.';


COMMENT ON TABLE document.attachment_derivative IS
  'Idempotent renditions derived from an attachment version (thumbnail, preview PDF, page image). Deduplication key: (attachment_id, derivative_type, rendition_code, source_sha256, specification_hash). Only status=ready renditions are exposed by download APIs.';

CREATE TABLE document.multipart_upload_part (
    tenant_id           uuid        NOT NULL,
    multipart_upload_id uuid        NOT NULL,
    part_number         integer     NOT NULL,
    etag                text        NOT NULL,
    size_bytes          bigint,
    checksum            text,
    recorded_at         timestamptz NOT NULL DEFAULT now(),
    recorded_by         uuid        NOT NULL,

    CONSTRAINT multipart_upload_part_pkey PRIMARY KEY (tenant_id, multipart_upload_id, part_number),
    CONSTRAINT multipart_upload_part_part_number_chk CHECK (part_number BETWEEN 1 AND 10000),
    CONSTRAINT multipart_upload_part_etag_chk CHECK (btrim(etag) <> ''),
    CONSTRAINT multipart_upload_part_size_chk CHECK (size_bytes IS NULL OR size_bytes >= 0),
    CONSTRAINT multipart_upload_part_checksum_chk
        CHECK (checksum IS NULL OR checksum ~ '^[a-f0-9]{64}$')
);

COMMENT ON TABLE document.multipart_upload_part IS
  'Per-part evidence for multipart upload integrity. Append-only. Rows are immutable once written.';
