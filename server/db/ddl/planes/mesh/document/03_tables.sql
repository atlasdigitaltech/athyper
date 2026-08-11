-- Unified attachment, collaboration, content, and conversation foundation.
-- entity_type/entity_id remain API coordinates until the metadata entity
-- registry and control.owner_type catalog have complete one-to-one coverage.

CREATE TABLE document.attachment (
    id                            uuid                         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                     uuid                         NOT NULL,
    file_name                     text                         NOT NULL,
    original_filename             text,
    content_type                  text,
    size_bytes                    bigint,
    sha256                        text,
    kind                          text                         NOT NULL DEFAULT 'attachment',
    storage_bucket                text                         NOT NULL,
    storage_key                   text                         NOT NULL,
    thumbnail_key                 text,
    preview_key                   text,
    preview_generated_at          timestamptz,
    is_preview_generation_failed  boolean                      NOT NULL DEFAULT false,
    is_virus_scanned              boolean                      NOT NULL DEFAULT false,
    version_no                    integer                      NOT NULL DEFAULT 1,
    parent_attachment_id          uuid,
    reference_count               integer                      NOT NULL DEFAULT 0,
    is_current                    boolean                      NOT NULL DEFAULT true,
    is_active                     boolean                      NOT NULL DEFAULT true,
    is_auto_delete_on_expiry      boolean                      NOT NULL DEFAULT false,
    expires_at                    timestamptz,
    retention_until               timestamptz,
    uploaded_by                   uuid,
    metadata                      jsonb                        NOT NULL DEFAULT '{}'::jsonb,
    status                        document.attachment_status_d NOT NULL DEFAULT 'active',
    status_changed_at             timestamptz,
    status_changed_by             uuid,
    created_at                    timestamptz                  NOT NULL DEFAULT now(),
    created_by                    uuid                         NOT NULL,
    updated_at                    timestamptz,
    updated_by                    uuid,
    extracted_text                text,
    extracted_text_chars          integer,
    text_extracted_at             timestamptz,
    text_extraction_status        text,
    text_extraction_error         text,
    pii_detected                  boolean                      NOT NULL DEFAULT false,
    pii_types                     jsonb                        NOT NULL DEFAULT '[]'::jsonb,
    pii_scanned_at                timestamptz,
    series_id                     uuid,

    CONSTRAINT attachment_pkey PRIMARY KEY (id),
    CONSTRAINT attachment_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT attachment_file_name_chk
        CHECK (btrim(file_name) <> '' AND length(file_name) <= 1024),
    CONSTRAINT attachment_original_filename_chk
        CHECK (original_filename IS NULL OR (btrim(original_filename) <> '' AND length(original_filename) <= 1024)),
    CONSTRAINT attachment_size_chk CHECK (size_bytes IS NULL OR size_bytes >= 0),
    CONSTRAINT attachment_sha256_chk CHECK (sha256 IS NULL OR sha256 ~ '^[a-f0-9]{64}$'),
    CONSTRAINT attachment_kind_chk CHECK (kind ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT attachment_storage_chk
        CHECK (btrim(storage_bucket) <> '' AND btrim(storage_key) <> ''),
    CONSTRAINT attachment_version_chk CHECK (version_no >= 1),
    CONSTRAINT attachment_reference_count_chk CHECK (reference_count >= 0),
    CONSTRAINT attachment_parent_version_chk
        CHECK (
            (parent_attachment_id IS NULL AND version_no = 1)
            OR (parent_attachment_id IS NOT NULL AND version_no > 1)
        ),
    CONSTRAINT attachment_expiry_chk
        CHECK (retention_until IS NULL OR expires_at IS NULL OR retention_until >= expires_at),
    CONSTRAINT attachment_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT attachment_pii_types_chk CHECK (jsonb_typeof(pii_types) = 'array'),
    CONSTRAINT attachment_extract_chars_chk
        CHECK (extracted_text_chars IS NULL OR extracted_text_chars >= 0),
    CONSTRAINT attachment_extract_status_chk
        CHECK (
            text_extraction_status IS NULL
            OR text_extraction_status IN ('pending', 'extracted', 'skipped', 'failed')
        ),
    CONSTRAINT attachment_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT attachment_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE document.attachment IS
  'Tenant-scoped object-storage attachment metadata shared by all planes. Processing fields remain operational compatibility fields until a protected processing satellite is introduced.';

CREATE TABLE document.attachment_quota_usage (
    tenant_id uuid NOT NULL, quota_kind text NOT NULL, used_bytes bigint NOT NULL DEFAULT 0,
    reserved_bytes bigint NOT NULL DEFAULT 0, used_items bigint NOT NULL DEFAULT 0, reserved_items bigint NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    PRIMARY KEY (tenant_id, quota_kind), CHECK (quota_kind ~ '^[a-z][a-z0-9_.]{1,126}$'),
    CHECK (used_bytes >= 0 AND reserved_bytes >= 0 AND used_items >= 0 AND reserved_items >= 0)
);
CREATE TABLE document.attachment_quota_reservation (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, quota_kind text NOT NULL, resource_type text NOT NULL,
    resource_id uuid NOT NULL, reserved_bytes bigint NOT NULL, reserved_items bigint NOT NULL DEFAULT 1, actual_bytes bigint,
    status text NOT NULL DEFAULT 'reserved', expires_at timestamptz NOT NULL, committed_at timestamptz, released_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    PRIMARY KEY (id), UNIQUE (tenant_id, quota_kind, resource_type, resource_id),
    CHECK (reserved_bytes >= 0 AND reserved_items > 0 AND (actual_bytes IS NULL OR actual_bytes >= 0)), CHECK (status IN ('reserved','committed','released','expired'))
);

CREATE TABLE document.attachment_folder (
    id            uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id     uuid        NOT NULL,
    entity_type   text        NOT NULL,
    entity_id     text        NOT NULL,
    name          text        NOT NULL,
    parent_id     uuid,
    display_order integer     NOT NULL DEFAULT 0,
    created_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid        NOT NULL,
    updated_at    timestamptz,
    updated_by    uuid,

    CONSTRAINT attachment_folder_pkey PRIMARY KEY (id),
    CONSTRAINT attachment_folder_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT attachment_folder_owner_chk
        CHECK (
            entity_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)?$'
            AND btrim(entity_id) <> ''
            AND length(entity_id) <= 512
        ),
    CONSTRAINT attachment_folder_name_chk
        CHECK (btrim(name) <> '' AND length(name) <= 256),
    CONSTRAINT attachment_folder_display_order_chk CHECK (display_order >= 0),
    CONSTRAINT attachment_folder_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.attachment_link (
    id            uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id     uuid        NOT NULL,
    entity_type   text        NOT NULL,
    entity_id     text        NOT NULL,
    attachment_id        uuid        NOT NULL,
    attachment_series_id uuid,
    link_kind            text        NOT NULL DEFAULT 'related',
    display_order integer     NOT NULL DEFAULT 0,
    metadata      jsonb       NOT NULL DEFAULT '{}'::jsonb,
    folder_id     uuid,
    created_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid        NOT NULL,

    CONSTRAINT attachment_link_pkey PRIMARY KEY (id),
    CONSTRAINT attachment_link_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT attachment_link_owner_chk
        CHECK (
            entity_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)?$'
            AND btrim(entity_id) <> ''
            AND length(entity_id) <= 512
        ),
    CONSTRAINT attachment_link_kind_chk CHECK (link_kind ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT attachment_link_order_chk CHECK (display_order >= 0),
    CONSTRAINT attachment_link_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT attachment_link_owner_attachment_uq
        UNIQUE (tenant_id, entity_type, entity_id, attachment_id, link_kind)
);

COMMENT ON TABLE document.attachment_link IS
  'Canonical polymorphic entity-to-attachment relation. Replaces the misleading master.entity_document_link name.';

CREATE TABLE document.comment (
    id                    uuid                              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                              NOT NULL,
    context_type          text                              NOT NULL DEFAULT 'entity',
    entity_type           text                              NOT NULL,
    entity_id             text                              NOT NULL,
    comment_intent        text                              NOT NULL DEFAULT 'general',
    commenter_id          uuid                              NOT NULL,
    comment_text          text                              NOT NULL,
    content_format        document.comment_content_format_d NOT NULL DEFAULT 'plain',
    content_json          jsonb,
    content_html          text,
    content_schema        text,
    parent_comment_id     uuid,
    thread_depth          smallint                          NOT NULL DEFAULT 0,
    visibility            document.comment_visibility_d     NOT NULL DEFAULT 'public',
    deleted_at            timestamptz,
    deleted_by            uuid,
    archived_at           timestamptz,
    archived_by           uuid,
    retention_until       timestamptz,
    retention_policy_id   uuid,
    status                text                              NOT NULL DEFAULT 'open',
    created_at            timestamptz                       NOT NULL DEFAULT now(),
    created_by            uuid                              NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT comment_pkey PRIMARY KEY (id),
    CONSTRAINT comment_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT comment_owner_chk
        CHECK (
            entity_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)?$'
            AND btrim(entity_id) <> ''
            AND length(entity_id) <= 512
        ),
    CONSTRAINT comment_context_type_chk CHECK (context_type ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT comment_intent_chk CHECK (comment_intent ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT comment_text_chk CHECK (btrim(comment_text) <> '' AND length(comment_text) <= 50000),
    CONSTRAINT comment_content_json_chk
        CHECK (content_json IS NULL OR jsonb_typeof(content_json) = 'object'),
    CONSTRAINT comment_content_schema_chk
        CHECK (content_schema IS NULL OR content_schema ~ '^athyper\.rich-text/[0-9]+\.[0-9]+$'),
    CONSTRAINT comment_content_consistency_chk
        CHECK (
            (content_format = 'plain' AND content_json IS NULL)
            OR content_format <> 'plain'
        ),
    CONSTRAINT comment_thread_depth_chk CHECK (thread_depth BETWEEN 0 AND 5),
    CONSTRAINT comment_parent_depth_chk
        CHECK (
            (parent_comment_id IS NULL AND thread_depth = 0)
            OR (parent_comment_id IS NOT NULL AND thread_depth > 0)
        ),
    CONSTRAINT comment_delete_pair_chk CHECK ((deleted_at IS NULL) = (deleted_by IS NULL)),
    CONSTRAINT comment_archive_pair_chk CHECK ((archived_at IS NULL) = (archived_by IS NULL)),
    CONSTRAINT comment_status_chk CHECK (status IN ('open', 'resolved', 'archived', 'deleted')),
    CONSTRAINT comment_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.comment_draft (
    id                uuid                              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id         uuid                              NOT NULL,
    principal_id      uuid                              NOT NULL,
    context_type      text                              NOT NULL DEFAULT 'entity',
    entity_type       text                              NOT NULL,
    entity_id         text                              NOT NULL,
    parent_comment_id uuid,
    draft_text        text                              NOT NULL,
    content_format    document.comment_content_format_d NOT NULL DEFAULT 'plain',
    content_json      jsonb,
    content_html      text,
    content_schema    text,
    visibility        document.comment_visibility_d     NOT NULL DEFAULT 'public',
    created_at        timestamptz                       NOT NULL DEFAULT now(),
    created_by        uuid                              NOT NULL,
    updated_at        timestamptz,
    updated_by        uuid,

    CONSTRAINT comment_draft_pkey PRIMARY KEY (id),
    CONSTRAINT comment_draft_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT comment_draft_owner_chk
        CHECK (
            entity_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)?$'
            AND btrim(entity_id) <> ''
            AND length(entity_id) <= 512
        ),
    CONSTRAINT comment_draft_text_chk
        CHECK (btrim(draft_text) <> '' AND length(draft_text) <= 50000),
    CONSTRAINT comment_draft_content_json_chk
        CHECK (content_json IS NULL OR jsonb_typeof(content_json) = 'object'),
    CONSTRAINT comment_draft_content_schema_chk
        CHECK (content_schema IS NULL OR content_schema ~ '^athyper\.rich-text/[0-9]+\.[0-9]+$'),
    CONSTRAINT comment_draft_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL)),
    CONSTRAINT comment_draft_target_uq
        UNIQUE NULLS NOT DISTINCT (
            tenant_id, principal_id, context_type,
            entity_type, entity_id, parent_comment_id
        )
);

CREATE TABLE document.comment_feed_cursor (
    id           uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id    uuid        NOT NULL,
    principal_id uuid        NOT NULL,
    entity_type  text        NOT NULL,
    entity_id    text        NOT NULL,
    last_read_at timestamptz NOT NULL DEFAULT now(),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz,
    updated_by   uuid,

    CONSTRAINT comment_feed_cursor_pkey PRIMARY KEY (id),
    CONSTRAINT comment_feed_cursor_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT comment_feed_cursor_owner_chk
        CHECK (
            entity_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)?$'
            AND btrim(entity_id) <> ''
            AND length(entity_id) <= 512
        ),
    CONSTRAINT comment_feed_cursor_target_uq
        UNIQUE (tenant_id, principal_id, entity_type, entity_id),
    CONSTRAINT comment_feed_cursor_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.comment_mention (
    id           uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id    uuid        NOT NULL,
    comment_id   uuid        NOT NULL,
    mentioned_id uuid        NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid        NOT NULL,

    CONSTRAINT comment_mention_pkey PRIMARY KEY (id),
    CONSTRAINT comment_mention_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT comment_mention_target_uq UNIQUE (tenant_id, comment_id, mentioned_id)
);

CREATE TABLE document.comment_reaction (
    id            uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id     uuid        NOT NULL,
    comment_id    uuid        NOT NULL,
    principal_id  uuid        NOT NULL,
    reaction_type text        NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid        NOT NULL,

    CONSTRAINT comment_reaction_pkey PRIMARY KEY (id),
    CONSTRAINT comment_reaction_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT comment_reaction_type_chk
        CHECK (reaction_type ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT comment_reaction_target_uq
        UNIQUE (tenant_id, comment_id, principal_id, reaction_type)
);

CREATE TABLE document.content_item (
    id                   uuid                      NOT NULL DEFAULT shared.uuidv7(),
    tenant_id            uuid                      NOT NULL,
    code                 text                      NOT NULL,
    title                text                      NOT NULL,
    kind                 text                      NOT NULL DEFAULT 'page',
    parent_id            uuid,
    locale_code          text                      NOT NULL DEFAULT 'en',
    slug                 text                      NOT NULL,
    summary              text,
    current_version_id   uuid,
    metadata             jsonb                     NOT NULL DEFAULT '{}'::jsonb,
    status               document.content_status_d NOT NULL DEFAULT 'DRAFT',
    status_changed_at    timestamptz,
    status_changed_by    uuid,
    preview_text         text,
    preview_html         text,
    preview_generated_at timestamptz,
    created_at           timestamptz               NOT NULL DEFAULT now(),
    created_by           uuid                      NOT NULL,
    updated_at           timestamptz,
    updated_by           uuid,
    row_version          bigint                    NOT NULL DEFAULT 1,

    CONSTRAINT content_item_pkey PRIMARY KEY (id),
    CONSTRAINT content_item_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT content_item_code_uq UNIQUE (tenant_id, code, locale_code),
    CONSTRAINT content_item_code_chk CHECK (code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT content_item_title_chk CHECK (btrim(title) <> '' AND length(title) <= 512),
    CONSTRAINT content_item_kind_chk CHECK (kind ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT content_item_locale_chk CHECK (locale_code ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
    CONSTRAINT content_item_slug_chk CHECK (slug ~ '^[a-z0-9]+([_-][a-z0-9]+)*$'),
    CONSTRAINT content_item_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT content_item_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT content_item_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.content_item_access_grant (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
    content_item_id uuid NOT NULL, subject_type text NOT NULL, subject_id uuid,
    access_level text NOT NULL, effect text NOT NULL DEFAULT 'allow', expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
    PRIMARY KEY (id), UNIQUE (tenant_id,id),
    UNIQUE NULLS NOT DISTINCT (tenant_id,content_item_id,subject_type,subject_id,access_level,effect),
    CHECK (subject_type IN ('principal','role','group','public')),
    CHECK (access_level IN ('read','write','publish','admin')),
    CHECK (effect IN ('allow','deny')),
    CHECK ((subject_type='public' AND subject_id IS NULL) OR (subject_type<>'public' AND subject_id IS NOT NULL)),
    CHECK (expires_at IS NULL OR expires_at>created_at)
);
CREATE TABLE document.content_quota_usage (tenant_id uuid NOT NULL,quota_kind text NOT NULL,used_items bigint NOT NULL DEFAULT 0,reserved_items bigint NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL,updated_at timestamptz,updated_by uuid,PRIMARY KEY(tenant_id,quota_kind),CHECK(used_items>=0 AND reserved_items>=0));
CREATE TABLE document.content_quota_reservation (id uuid NOT NULL DEFAULT shared.uuidv7(),tenant_id uuid NOT NULL,quota_kind text NOT NULL,content_item_id uuid NOT NULL,reserved_items bigint NOT NULL DEFAULT 1,status text NOT NULL DEFAULT 'reserved',expires_at timestamptz NOT NULL,committed_at timestamptz,released_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL,updated_at timestamptz,updated_by uuid,PRIMARY KEY(id),UNIQUE(tenant_id,quota_kind,content_item_id),CHECK(reserved_items>0),CHECK(status IN ('reserved','committed','released','expired')));

CREATE UNIQUE INDEX content_item_root_slug_uq
    ON document.content_item (tenant_id, locale_code, slug)
    WHERE parent_id IS NULL;
CREATE UNIQUE INDEX content_item_child_slug_uq
    ON document.content_item (tenant_id, parent_id, locale_code, slug)
    WHERE parent_id IS NOT NULL;

CREATE TABLE document.content_item_link (
    id                     uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id              uuid        NOT NULL,
    source_content_item_id uuid        NOT NULL,
    target_content_item_id uuid        NOT NULL,
    relation_type          text        NOT NULL DEFAULT 'related',
    display_order          integer     NOT NULL DEFAULT 0,
    metadata               jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at             timestamptz NOT NULL DEFAULT now(),
    created_by             uuid        NOT NULL,

    CONSTRAINT content_item_link_pkey PRIMARY KEY (id),
    CONSTRAINT content_item_link_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT content_item_link_no_self_chk
        CHECK (source_content_item_id <> target_content_item_id),
    CONSTRAINT content_item_link_relation_chk
        CHECK (relation_type ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT content_item_link_order_chk CHECK (display_order >= 0),
    CONSTRAINT content_item_link_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT content_item_link_target_uq
        UNIQUE (
            tenant_id, source_content_item_id,
            target_content_item_id, relation_type
        )
);

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

CREATE TABLE document.attachment_series (
    id                       uuid                                NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid                                NOT NULL,
    current_attachment_id    uuid,
    status                   document.attachment_series_status_d NOT NULL DEFAULT 'active',
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    retention_until          timestamptz,
    expires_at               timestamptz,
    is_auto_delete_on_expiry boolean                             NOT NULL DEFAULT false,
    created_at               timestamptz                         NOT NULL DEFAULT now(),
    created_by               uuid                                NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT attachment_series_pkey PRIMARY KEY (id),
    CONSTRAINT attachment_series_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT attachment_series_expiry_chk
        CHECK (retention_until IS NULL OR expires_at IS NULL OR retention_until >= expires_at),
    CONSTRAINT attachment_series_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT attachment_series_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE document.attachment_series IS
  'Logical identity for a versioned attachment. current_attachment_id tracks the latest active version; all entity links target the series, not individual versions.';

CREATE TABLE document.attachment_legal_hold (
    id                   uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id            uuid        NOT NULL,
    attachment_series_id uuid        NOT NULL,
    hold_code            text,
    reason               text        NOT NULL,
    external_reference   text,
    placed_at            timestamptz NOT NULL DEFAULT now(),
    placed_by            uuid        NOT NULL,
    released_at          timestamptz,
    released_by          uuid,
    release_reason       text,
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid        NOT NULL,

    CONSTRAINT attachment_legal_hold_pkey PRIMARY KEY (id),
    CONSTRAINT attachment_legal_hold_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT attachment_legal_hold_reason_chk CHECK (btrim(reason) <> ''),
    CONSTRAINT attachment_legal_hold_hold_code_chk
        CHECK (hold_code IS NULL OR hold_code ~ '^[a-z][a-z0-9_.-]{0,62}$'),
    CONSTRAINT attachment_legal_hold_release_evidence_chk
        CHECK (
            (released_at IS NULL AND released_by IS NULL AND release_reason IS NULL)
            OR (released_at IS NOT NULL AND released_by IS NOT NULL
                AND release_reason IS NOT NULL AND btrim(release_reason) <> '')
        ),
    CONSTRAINT attachment_legal_hold_release_order_chk
        CHECK (released_at IS NULL OR released_at >= placed_at)
);

COMMENT ON TABLE document.attachment_legal_hold IS
  'Evidentiary hold on an attachment series. Active when released_at IS NULL. Placement evidence is immutable. Release requires all three fields. Rows cannot be deleted through the application role.';

CREATE TABLE document.attachment_legal_hold_event (
    id                   uuid                                  NOT NULL DEFAULT shared.uuidv7(),
    tenant_id            uuid                                  NOT NULL,
    legal_hold_id        uuid                                  NOT NULL,
    attachment_series_id uuid                                  NOT NULL,
    event_type           document.attachment_hold_event_type_d NOT NULL,
    reason               text                                  NOT NULL,
    actor_id             uuid                                  NOT NULL,
    occurred_at          timestamptz                           NOT NULL DEFAULT now(),
    correlation_id       uuid,
    metadata             jsonb                                 NOT NULL DEFAULT '{}'::jsonb,

    CONSTRAINT attachment_legal_hold_event_pkey PRIMARY KEY (id),
    CONSTRAINT attachment_legal_hold_event_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT attachment_legal_hold_event_reason_chk CHECK (btrim(reason) <> ''),
    CONSTRAINT attachment_legal_hold_event_metadata_chk CHECK (jsonb_typeof(metadata) = 'object')
);

COMMENT ON TABLE document.attachment_legal_hold_event IS
  'Append-only evidentiary log for hold placement and release. Answers who did what, when, and why. Rows are immutable once written.';

CREATE TABLE document.attachment_derivative (
    id                   uuid                                    NOT NULL DEFAULT shared.uuidv7(),
    tenant_id            uuid                                    NOT NULL,
    attachment_id        uuid                                    NOT NULL,
    derivative_type      text                                    NOT NULL,
    rendition_code       text                                    NOT NULL,
    source_sha256        text                                    NOT NULL,
    specification_hash   text                                    NOT NULL,
    content_type         text                                    NOT NULL,
    storage_bucket       text,
    storage_key          text,
    size_bytes           bigint,
    sha256               text,
    width                integer,
    height               integer,
    page_number          integer,
    status               document.attachment_derivative_status_d NOT NULL DEFAULT 'pending',
    provider             text,
    provider_version     text,
    attempt_count        integer                                 NOT NULL DEFAULT 0,
    last_error_code      text,
    last_error_message   text,
    generated_at         timestamptz,
    created_at           timestamptz                             NOT NULL DEFAULT now(),
    created_by           uuid                                    NOT NULL,
    updated_at           timestamptz,
    updated_by           uuid,

    CONSTRAINT attachment_derivative_pkey PRIMARY KEY (id),
    CONSTRAINT attachment_derivative_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT attachment_derivative_type_chk CHECK (derivative_type ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT attachment_derivative_rendition_chk CHECK (rendition_code ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT attachment_derivative_source_sha256_chk CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
    CONSTRAINT attachment_derivative_spec_hash_chk CHECK (specification_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT attachment_derivative_size_chk CHECK (size_bytes IS NULL OR size_bytes >= 0),
    CONSTRAINT attachment_derivative_sha256_chk CHECK (sha256 IS NULL OR sha256 ~ '^[a-f0-9]{64}$'),
    CONSTRAINT attachment_derivative_dimensions_chk CHECK ((width IS NULL) = (height IS NULL)),
    CONSTRAINT attachment_derivative_attempt_chk CHECK (attempt_count >= 0),
    CONSTRAINT attachment_derivative_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL)),
    CONSTRAINT attachment_derivative_idempotency_uq
        UNIQUE (tenant_id, attachment_id, derivative_type, rendition_code, source_sha256, specification_hash)
);

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
