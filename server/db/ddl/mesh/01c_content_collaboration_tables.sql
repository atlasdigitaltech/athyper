-- ============================================================================
-- mesh/01c_content_collaboration_tables.sql
-- Concept: Mesh-owned evidence, content, and collaboration tables.
-- Depends on: mesh/01_tables.sql, mesh/01a_foundation_tables.sql,
--             mesh/01b_participant_profile_tables.sql, shared/01_tables.sql
-- ============================================================================
-- Scope rule:
--   These tables mirror the useful Attachment/Comment/Content shapes from
--   master.* while replacing tenant/principal/snapshot/control dependencies
--   with Mesh account/principal ownership.

CREATE TABLE IF NOT EXISTS mesh.attachment (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code                text        NOT NULL,
    file_name                   text        NOT NULL,
    original_filename           text,
    content_type                text,
    size_bytes                  bigint,
    sha256                      text,
    kind                        text        NOT NULL DEFAULT 'attachment',
    storage_bucket              text        NOT NULL,
    storage_key                 text        NOT NULL,
    shard                       smallint,
    thumbnail_key               text,
    preview_key                 text,
    preview_generated_at        timestamptz,
    is_preview_generation_failed boolean    NOT NULL DEFAULT false,
    is_virus_scanned            boolean     NOT NULL DEFAULT false,
    scan_status                 text        NOT NULL DEFAULT 'pending',
    scanned_at                  timestamptz,
    version_no                  smallint    NOT NULL DEFAULT 1,
    parent_attachment_id        uuid,
    reference_count             integer     NOT NULL DEFAULT 1,
    is_current                  boolean     NOT NULL DEFAULT true,
    is_auto_delete_on_expiry    boolean     NOT NULL DEFAULT false,
    expires_at                  timestamptz,
    retention_until             timestamptz,
    uploaded_by_principal_id    uuid,
    extracted_text              text,
    extracted_text_chars        integer,
    text_extracted_at           timestamptz,
    text_extraction_status      text,
    text_extraction_error       text,
    pii_detected                boolean     NOT NULL DEFAULT false,
    pii_types                   jsonb       NOT NULL DEFAULT '[]'::jsonb,
    pii_scanned_at              timestamptz,
    metadata                    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                      text        NOT NULL DEFAULT 'active',
    is_active                   boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at           timestamptz,
    status_changed_by           text,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  text        NOT NULL DEFAULT 'system',
    updated_at                  timestamptz,
    updated_by                  text,

    CONSTRAINT mesh_attachment_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_attachment_account_id_uq UNIQUE (account_code, id),
    CONSTRAINT mesh_attachment_size_chk CHECK (size_bytes IS NULL OR size_bytes >= 0),
    CONSTRAINT mesh_attachment_version_chk CHECK (version_no >= 1),
    CONSTRAINT mesh_attachment_ref_count_chk CHECK (reference_count >= 0),
    CONSTRAINT mesh_attachment_shard_chk CHECK (shard IS NULL OR shard >= 0),
    CONSTRAINT mesh_attachment_file_name_chk CHECK (btrim(file_name) <> ''),
    CONSTRAINT mesh_attachment_bucket_chk CHECK (btrim(storage_bucket) <> ''),
    CONSTRAINT mesh_attachment_key_chk CHECK (btrim(storage_key) <> ''),
    CONSTRAINT mesh_attachment_expiry_chk CHECK (
        expires_at IS NULL OR retention_until IS NULL OR expires_at <= retention_until
    ),
    CONSTRAINT mesh_attachment_scan_status_chk CHECK (scan_status IN ('pending', 'clean', 'quarantined', 'error')),
    CONSTRAINT mesh_attachment_text_status_chk CHECK (
        text_extraction_status IS NULL OR text_extraction_status IN ('pending', 'extracted', 'skipped', 'failed')
    ),
    CONSTRAINT mesh_attachment_pii_types_chk CHECK (jsonb_typeof(pii_types) = 'array'),
    CONSTRAINT mesh_attachment_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_attachment_status_chk CHECK (status IN ('active', 'archived', 'quarantined', 'deleted')),
    CONSTRAINT mesh_attachment_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE,
    CONSTRAINT mesh_attachment_parent_fk FOREIGN KEY (account_code, parent_attachment_id)
        REFERENCES mesh.attachment (account_code, id) ON DELETE RESTRICT,
    CONSTRAINT mesh_attachment_uploaded_by_fk FOREIGN KEY (uploaded_by_principal_id)
        REFERENCES mesh.principal (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS mesh_attachment_account_idx
    ON mesh.attachment (account_code, created_at DESC);
CREATE INDEX IF NOT EXISTS mesh_attachment_hash_idx
    ON mesh.attachment (sha256)
    WHERE sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS mesh_attachment_status_idx
    ON mesh.attachment (account_code, status);

COMMENT ON TABLE mesh.attachment IS
    'Mesh-owned file/blob metadata for participant evidence, profile content, and network collaboration.';

CREATE TABLE IF NOT EXISTS mesh.attachment_acl (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text        NOT NULL,
    attachment_id       uuid        NOT NULL,
    grantee_account_code text,
    grantee_principal_id uuid,
    role_code           text,
    permission          text        NOT NULL,
    is_granted          boolean     NOT NULL DEFAULT true,
    granted_by_principal_id uuid,
    granted_at          timestamptz NOT NULL DEFAULT now(),
    expires_at          timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',

    CONSTRAINT mesh_attachment_acl_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_attachment_acl_subject_chk CHECK (
        num_nonnulls(grantee_account_code, grantee_principal_id, role_code) = 1
    ),
    CONSTRAINT mesh_attachment_acl_permission_chk CHECK (permission IN ('read', 'download', 'delete', 'share')),
    CONSTRAINT mesh_attachment_acl_expiry_chk CHECK (expires_at IS NULL OR expires_at > granted_at),
    CONSTRAINT mesh_attachment_acl_attachment_fk FOREIGN KEY (account_code, attachment_id)
        REFERENCES mesh.attachment (account_code, id) ON DELETE CASCADE,
    CONSTRAINT mesh_attachment_acl_grantee_account_fk FOREIGN KEY (grantee_account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE,
    CONSTRAINT mesh_attachment_acl_grantee_principal_fk FOREIGN KEY (grantee_principal_id)
        REFERENCES mesh.principal (id) ON DELETE CASCADE,
    CONSTRAINT mesh_attachment_acl_granted_by_fk FOREIGN KEY (granted_by_principal_id)
        REFERENCES mesh.principal (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS mesh_attachment_acl_uq
    ON mesh.attachment_acl (
        account_code,
        attachment_id,
        permission,
        COALESCE(grantee_account_code, ''),
        COALESCE(grantee_principal_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(role_code, '')
    )
    WHERE is_granted = true;
CREATE INDEX IF NOT EXISTS mesh_attachment_acl_grantee_account_idx
    ON mesh.attachment_acl (grantee_account_code)
    WHERE grantee_account_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS mesh.attachment_folder (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code    text        NOT NULL,
    entity_type     text        NOT NULL,
    entity_id       text        NOT NULL,
    name            text        NOT NULL,
    parent_id       uuid,
    display_order   integer     NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      text        NOT NULL DEFAULT 'system',
    updated_at      timestamptz,
    updated_by      text,

    CONSTRAINT mesh_attachment_folder_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_attachment_folder_account_id_uq UNIQUE (account_code, id),
    CONSTRAINT mesh_attachment_folder_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT mesh_attachment_folder_entity_type_chk CHECK (btrim(entity_type) <> ''),
    CONSTRAINT mesh_attachment_folder_entity_id_chk CHECK (btrim(entity_id) <> ''),
    CONSTRAINT mesh_attachment_folder_order_chk CHECK (display_order >= 0),
    CONSTRAINT mesh_attachment_folder_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE,
    CONSTRAINT mesh_attachment_folder_parent_fk FOREIGN KEY (account_code, parent_id)
        REFERENCES mesh.attachment_folder (account_code, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS mesh_attachment_folder_entity_idx
    ON mesh.attachment_folder (account_code, entity_type, entity_id);

CREATE TABLE IF NOT EXISTS mesh.comment (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text        NOT NULL,
    context_type        text        NOT NULL DEFAULT 'entity',
    entity_type         text        NOT NULL,
    entity_id           text        NOT NULL,
    commenter_principal_id uuid,
    commenter_account_code text,
    comment_text        text        NOT NULL,
    mentions            jsonb,
    content_format      text        NOT NULL DEFAULT 'plain',
    content_json        jsonb,
    content_html        text,
    attachment_refs     jsonb       NOT NULL DEFAULT '[]'::jsonb,
    parent_comment_id   uuid,
    thread_depth        smallint    NOT NULL DEFAULT 0,
    visibility          text        NOT NULL DEFAULT 'public',
    deleted_at          timestamptz,
    deleted_by_principal_id uuid,
    archived_at         timestamptz,
    archived_by_principal_id uuid,
    retention_until     timestamptz,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',
    updated_at          timestamptz,
    updated_by          text,

    CONSTRAINT mesh_comment_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_comment_account_id_uq UNIQUE (account_code, id),
    CONSTRAINT mesh_comment_context_chk CHECK (
        context_type IN ('entity', 'attachment', 'approval', 'chat_message', 'document', 'profile', 'connection', 'content_item')
    ),
    CONSTRAINT mesh_comment_depth_chk CHECK (thread_depth BETWEEN 0 AND 5),
    CONSTRAINT mesh_comment_text_len_chk CHECK (char_length(comment_text) <= 50000),
    CONSTRAINT mesh_comment_text_chk CHECK (btrim(comment_text) <> ''),
    CONSTRAINT mesh_comment_entity_type_chk CHECK (btrim(entity_type) <> ''),
    CONSTRAINT mesh_comment_entity_id_chk CHECK (btrim(entity_id) <> ''),
    CONSTRAINT mesh_comment_visibility_chk CHECK (visibility IN ('public', 'internal', 'private')),
    CONSTRAINT mesh_comment_delete_chk CHECK (
        (deleted_at IS NULL AND deleted_by_principal_id IS NULL)
        OR (deleted_at IS NOT NULL AND deleted_by_principal_id IS NOT NULL)
    ),
    CONSTRAINT mesh_comment_mentions_chk CHECK (mentions IS NULL OR jsonb_typeof(mentions) = 'array'),
    CONSTRAINT mesh_comment_attachment_refs_chk CHECK (jsonb_typeof(attachment_refs) = 'array'),
    CONSTRAINT mesh_comment_content_json_chk CHECK (content_json IS NULL OR jsonb_typeof(content_json) = 'object'),
    CONSTRAINT mesh_comment_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_comment_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE,
    CONSTRAINT mesh_comment_commenter_account_fk FOREIGN KEY (commenter_account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE SET NULL,
    CONSTRAINT mesh_comment_commenter_fk FOREIGN KEY (commenter_principal_id)
        REFERENCES mesh.principal (id) ON DELETE SET NULL,
    CONSTRAINT mesh_comment_parent_fk FOREIGN KEY (account_code, parent_comment_id)
        REFERENCES mesh.comment (account_code, id) ON DELETE CASCADE,
    CONSTRAINT mesh_comment_deleted_by_fk FOREIGN KEY (deleted_by_principal_id)
        REFERENCES mesh.principal (id) ON DELETE SET NULL,
    CONSTRAINT mesh_comment_archived_by_fk FOREIGN KEY (archived_by_principal_id)
        REFERENCES mesh.principal (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS mesh_comment_thread_idx
    ON mesh.comment (account_code, context_type, entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS mesh_comment_parent_idx
    ON mesh.comment (account_code, parent_comment_id)
    WHERE parent_comment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS mesh.comment_draft (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text        NOT NULL,
    principal_id        uuid        NOT NULL,
    context_type        text        NOT NULL DEFAULT 'entity',
    entity_type         text        NOT NULL,
    entity_id           text        NOT NULL,
    parent_comment_id   uuid,
    draft_text          text        NOT NULL,
    content_json        jsonb,
    content_html        text,
    attachment_refs     jsonb       NOT NULL DEFAULT '[]'::jsonb,
    visibility          text        NOT NULL DEFAULT 'public',
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',
    updated_at          timestamptz,
    updated_by          text,

    CONSTRAINT mesh_comment_draft_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_comment_draft_one_per_target_uq UNIQUE NULLS NOT DISTINCT (
        account_code, principal_id, context_type, entity_type, entity_id, parent_comment_id
    ),
    CONSTRAINT mesh_comment_draft_context_chk CHECK (
        context_type IN ('entity', 'attachment', 'approval', 'chat_message', 'document', 'profile', 'connection', 'content_item')
    ),
    CONSTRAINT mesh_comment_draft_text_chk CHECK (btrim(draft_text) <> ''),
    CONSTRAINT mesh_comment_draft_text_len_chk CHECK (char_length(draft_text) <= 50000),
    CONSTRAINT mesh_comment_draft_entity_type_chk CHECK (btrim(entity_type) <> ''),
    CONSTRAINT mesh_comment_draft_entity_id_chk CHECK (btrim(entity_id) <> ''),
    CONSTRAINT mesh_comment_draft_visibility_chk CHECK (visibility IN ('public', 'internal', 'private')),
    CONSTRAINT mesh_comment_draft_attachment_refs_chk CHECK (jsonb_typeof(attachment_refs) = 'array'),
    CONSTRAINT mesh_comment_draft_content_json_chk CHECK (content_json IS NULL OR jsonb_typeof(content_json) = 'object'),
    CONSTRAINT mesh_comment_draft_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE,
    CONSTRAINT mesh_comment_draft_principal_fk FOREIGN KEY (principal_id)
        REFERENCES mesh.principal (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mesh.comment_mention (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code            text        NOT NULL,
    context_type            text        NOT NULL,
    comment_id              uuid        NOT NULL,
    mentioned_account_code  text,
    mentioned_principal_id  uuid,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              text        NOT NULL DEFAULT 'system',

    CONSTRAINT mesh_comment_mention_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_comment_mention_context_chk CHECK (
        context_type IN ('entity', 'attachment', 'approval', 'chat_message', 'document', 'profile', 'connection', 'content_item')
    ),
    CONSTRAINT mesh_comment_mention_target_chk CHECK (
        num_nonnulls(mentioned_account_code, mentioned_principal_id) = 1
    ),
    CONSTRAINT mesh_comment_mention_comment_fk FOREIGN KEY (account_code, comment_id)
        REFERENCES mesh.comment (account_code, id) ON DELETE CASCADE,
    CONSTRAINT mesh_comment_mention_account_fk FOREIGN KEY (mentioned_account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE,
    CONSTRAINT mesh_comment_mention_principal_fk FOREIGN KEY (mentioned_principal_id)
        REFERENCES mesh.principal (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS mesh_comment_mention_uq
    ON mesh.comment_mention (
        account_code,
        context_type,
        comment_id,
        COALESCE(mentioned_account_code, ''),
        COALESCE(mentioned_principal_id, '00000000-0000-0000-0000-000000000000'::uuid)
    );

CREATE TABLE IF NOT EXISTS mesh.comment_reaction (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text        NOT NULL,
    context_type        text        NOT NULL,
    comment_id          uuid        NOT NULL,
    principal_id        uuid        NOT NULL,
    reaction_type       text        NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',

    CONSTRAINT mesh_comment_reaction_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_comment_reaction_uq UNIQUE (account_code, context_type, comment_id, principal_id, reaction_type),
    CONSTRAINT mesh_comment_reaction_context_chk CHECK (
        context_type IN ('entity', 'attachment', 'approval', 'chat_message', 'document', 'profile', 'connection', 'content_item')
    ),
    CONSTRAINT mesh_comment_reaction_type_chk CHECK (btrim(reaction_type) <> ''),
    CONSTRAINT mesh_comment_reaction_comment_fk FOREIGN KEY (account_code, comment_id)
        REFERENCES mesh.comment (account_code, id) ON DELETE CASCADE,
    CONSTRAINT mesh_comment_reaction_principal_fk FOREIGN KEY (principal_id)
        REFERENCES mesh.principal (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mesh.comment_feed_cursor (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text        NOT NULL,
    principal_id        uuid        NOT NULL,
    entity_type         text        NOT NULL,
    entity_id           text        NOT NULL,
    last_read_at        timestamptz NOT NULL DEFAULT now(),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz,

    CONSTRAINT mesh_comment_feed_cursor_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_comment_feed_cursor_uq UNIQUE (account_code, principal_id, entity_type, entity_id),
    CONSTRAINT mesh_comment_feed_cursor_entity_type_chk CHECK (char_length(entity_type) BETWEEN 1 AND 120),
    CONSTRAINT mesh_comment_feed_cursor_entity_id_chk CHECK (char_length(entity_id) BETWEEN 1 AND 120),
    CONSTRAINT mesh_comment_feed_cursor_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE,
    CONSTRAINT mesh_comment_feed_cursor_principal_fk FOREIGN KEY (principal_id)
        REFERENCES mesh.principal (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS mesh_comment_feed_cursor_entity_idx
    ON mesh.comment_feed_cursor (account_code, entity_type, entity_id, principal_id);

CREATE TABLE IF NOT EXISTS mesh.attachment_comment (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text        NOT NULL,
    attachment_id       uuid        NOT NULL,
    parent_id           uuid,
    author_principal_id uuid,
    content             text        NOT NULL,
    mentions            jsonb,
    edited_at           timestamptz,
    edited_by_principal_id uuid,
    deleted_at          timestamptz,
    deleted_by_principal_id uuid,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',
    updated_at          timestamptz,
    updated_by          text,

    CONSTRAINT mesh_attachment_comment_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_attachment_comment_account_attachment_id_uq UNIQUE (account_code, attachment_id, id),
    CONSTRAINT mesh_attachment_comment_content_chk CHECK (btrim(content) <> ''),
    CONSTRAINT mesh_attachment_comment_mentions_chk CHECK (mentions IS NULL OR jsonb_typeof(mentions) = 'array'),
    CONSTRAINT mesh_attachment_comment_delete_chk CHECK (
        (deleted_at IS NULL AND deleted_by_principal_id IS NULL)
        OR (deleted_at IS NOT NULL AND deleted_by_principal_id IS NOT NULL)
    ),
    CONSTRAINT mesh_attachment_comment_attachment_fk FOREIGN KEY (account_code, attachment_id)
        REFERENCES mesh.attachment (account_code, id) ON DELETE CASCADE,
    CONSTRAINT mesh_attachment_comment_parent_fk FOREIGN KEY (account_code, attachment_id, parent_id)
        REFERENCES mesh.attachment_comment (account_code, attachment_id, id) ON DELETE CASCADE,
    CONSTRAINT mesh_attachment_comment_author_fk FOREIGN KEY (author_principal_id)
        REFERENCES mesh.principal (id) ON DELETE SET NULL,
    CONSTRAINT mesh_attachment_comment_edited_by_fk FOREIGN KEY (edited_by_principal_id)
        REFERENCES mesh.principal (id) ON DELETE SET NULL,
    CONSTRAINT mesh_attachment_comment_deleted_by_fk FOREIGN KEY (deleted_by_principal_id)
        REFERENCES mesh.principal (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS mesh_attachment_comment_attachment_idx
    ON mesh.attachment_comment (account_code, attachment_id, created_at);

CREATE TABLE IF NOT EXISTS mesh.conversation (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    owner_account_code  text        NOT NULL,
    conversation_type   text        NOT NULL DEFAULT 'dm',
    title               text,
    entity_type         text,
    entity_id           text,
    connection_id       uuid,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              text        NOT NULL DEFAULT 'active',
    status_changed_at   timestamptz,
    status_changed_by   text,
    deleted_at          timestamptz,
    deleted_by_principal_id uuid,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',
    updated_at          timestamptz,
    updated_by          text,

    CONSTRAINT mesh_conversation_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_conversation_type_chk CHECK (conversation_type IN ('dm', 'group', 'record', 'connection', 'support')),
    CONSTRAINT mesh_conversation_status_chk CHECK (status IN ('active', 'archived', 'deleted')),
    CONSTRAINT mesh_conversation_delete_chk CHECK (
        (deleted_at IS NULL AND deleted_by_principal_id IS NULL)
        OR (deleted_at IS NOT NULL AND deleted_by_principal_id IS NOT NULL)
    ),
    CONSTRAINT mesh_conversation_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_conversation_owner_fk FOREIGN KEY (owner_account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE,
    CONSTRAINT mesh_conversation_connection_fk FOREIGN KEY (connection_id)
        REFERENCES mesh.network_relationship (id) ON DELETE SET NULL,
    CONSTRAINT mesh_conversation_deleted_by_fk FOREIGN KEY (deleted_by_principal_id)
        REFERENCES mesh.principal (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS mesh_conversation_owner_idx
    ON mesh.conversation (owner_account_code, status);
CREATE INDEX IF NOT EXISTS mesh_conversation_connection_idx
    ON mesh.conversation (connection_id)
    WHERE connection_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS mesh.conversation_participant (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    conversation_id         uuid        NOT NULL,
    participant_account_code text       NOT NULL,
    principal_id            uuid,
    role                    text        NOT NULL DEFAULT 'member',
    last_read_message_id    uuid,
    last_read_at            timestamptz,
    joined_at               timestamptz NOT NULL DEFAULT now(),
    left_at                 timestamptz,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              text        NOT NULL DEFAULT 'system',
    updated_at              timestamptz,
    updated_by              text,

    CONSTRAINT mesh_conversation_participant_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_conversation_participant_role_chk CHECK (role IN ('owner', 'admin', 'member', 'observer')),
    CONSTRAINT mesh_conversation_participant_read_chk CHECK (
        (last_read_message_id IS NULL AND last_read_at IS NULL)
        OR (last_read_message_id IS NOT NULL AND last_read_at IS NOT NULL)
    ),
    CONSTRAINT mesh_conversation_participant_leave_chk CHECK (left_at IS NULL OR left_at >= joined_at),
    CONSTRAINT mesh_conversation_participant_conversation_fk FOREIGN KEY (conversation_id)
        REFERENCES mesh.conversation (id) ON DELETE CASCADE,
    CONSTRAINT mesh_conversation_participant_account_fk FOREIGN KEY (participant_account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE,
    CONSTRAINT mesh_conversation_participant_principal_fk FOREIGN KEY (principal_id)
        REFERENCES mesh.principal (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS mesh_conversation_participant_uq
    ON mesh.conversation_participant (
        conversation_id,
        participant_account_code,
        COALESCE(principal_id, '00000000-0000-0000-0000-000000000000'::uuid)
    );

CREATE INDEX IF NOT EXISTS mesh_conversation_participant_account_idx
    ON mesh.conversation_participant (participant_account_code, conversation_id)
    WHERE left_at IS NULL;

CREATE TABLE IF NOT EXISTS mesh.content_item (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text        NOT NULL,
    code                text        NOT NULL,
    title               text        NOT NULL,
    kind                text        NOT NULL DEFAULT 'page',
    parent_id           uuid,
    locale_code         text        NOT NULL DEFAULT 'en',
    slug                text        NOT NULL,
    summary             text,
    body_uri            text,
    body_hash           text,
    body_content_type   text,
    current_version_no  integer     NOT NULL DEFAULT 1,
    preview_text        text,
    preview_html        text,
    preview_generated_at timestamptz,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              text        NOT NULL DEFAULT 'DRAFT',
    status_changed_at   timestamptz,
    status_changed_by   text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',
    updated_at          timestamptz,
    updated_by          text,

    CONSTRAINT mesh_content_item_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_content_item_account_id_uq UNIQUE (account_code, id),
    CONSTRAINT mesh_content_item_account_code_uq UNIQUE (account_code, code),
    CONSTRAINT mesh_content_item_slug_uq UNIQUE NULLS NOT DISTINCT (account_code, parent_id, locale_code, slug),
    CONSTRAINT mesh_content_item_no_self_ref CHECK (parent_id IS DISTINCT FROM id),
    CONSTRAINT mesh_content_item_code_chk CHECK (btrim(code) <> ''),
    CONSTRAINT mesh_content_item_title_chk CHECK (btrim(title) <> ''),
    CONSTRAINT mesh_content_item_kind_chk CHECK (btrim(kind) <> ''),
    CONSTRAINT mesh_content_item_slug_chk CHECK (slug ~ '^[a-z][a-z0-9_-]*$'),
    CONSTRAINT mesh_content_item_locale_chk CHECK (btrim(locale_code) <> ''),
    CONSTRAINT mesh_content_item_version_chk CHECK (current_version_no >= 1),
    CONSTRAINT mesh_content_item_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_content_item_status_chk CHECK (status IN ('DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED')),
    CONSTRAINT mesh_content_item_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE,
    CONSTRAINT mesh_content_item_parent_fk FOREIGN KEY (account_code, parent_id)
        REFERENCES mesh.content_item (account_code, id) ON DELETE RESTRICT,
    CONSTRAINT mesh_content_item_locale_fk FOREIGN KEY (locale_code)
        REFERENCES shared.locale (code) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS mesh_content_item_account_status_idx
    ON mesh.content_item (account_code, status);
CREATE INDEX IF NOT EXISTS mesh_content_item_parent_idx
    ON mesh.content_item (account_code, parent_id)
    WHERE parent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS mesh.content_item_link (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code            text        NOT NULL,
    source_content_item_id  uuid        NOT NULL,
    target_content_item_id  uuid        NOT NULL,
    relation_type           text        NOT NULL DEFAULT 'related',
    display_order           integer     NOT NULL DEFAULT 0,
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              text        NOT NULL DEFAULT 'system',

    CONSTRAINT mesh_content_item_link_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_content_item_link_uq UNIQUE (
        account_code, source_content_item_id, target_content_item_id, relation_type
    ),
    CONSTRAINT mesh_content_item_link_no_self_ref CHECK (source_content_item_id IS DISTINCT FROM target_content_item_id),
    CONSTRAINT mesh_content_item_link_relation_chk CHECK (btrim(relation_type) <> ''),
    CONSTRAINT mesh_content_item_link_order_chk CHECK (display_order >= 0),
    CONSTRAINT mesh_content_item_link_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_content_item_link_source_fk FOREIGN KEY (account_code, source_content_item_id)
        REFERENCES mesh.content_item (account_code, id) ON DELETE CASCADE,
    CONSTRAINT mesh_content_item_link_target_fk FOREIGN KEY (account_code, target_content_item_id)
        REFERENCES mesh.content_item (account_code, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mesh.content_item_access_grant (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text        NOT NULL,
    content_item_id     uuid        NOT NULL,
    subject_type        text        NOT NULL,
    subject_account_code text,
    subject_principal_id uuid,
    role_code           text,
    access_level        text        NOT NULL,
    expires_at          timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',

    CONSTRAINT mesh_content_item_access_grant_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_content_item_access_grant_subject_type_chk CHECK (subject_type IN ('account', 'principal', 'role', 'public')),
    CONSTRAINT mesh_content_item_access_grant_level_chk CHECK (access_level IN ('read', 'write', 'publish', 'admin')),
    CONSTRAINT mesh_content_item_access_grant_subject_chk CHECK (
        (subject_type = 'public' AND subject_account_code IS NULL AND subject_principal_id IS NULL AND role_code IS NULL)
        OR (subject_type = 'account' AND subject_account_code IS NOT NULL AND subject_principal_id IS NULL AND role_code IS NULL)
        OR (subject_type = 'principal' AND subject_account_code IS NULL AND subject_principal_id IS NOT NULL AND role_code IS NULL)
        OR (subject_type = 'role' AND subject_account_code IS NULL AND subject_principal_id IS NULL AND role_code IS NOT NULL)
    ),
    CONSTRAINT mesh_content_item_access_grant_expiry_chk CHECK (expires_at IS NULL OR expires_at > created_at),
    CONSTRAINT mesh_content_item_access_grant_item_fk FOREIGN KEY (account_code, content_item_id)
        REFERENCES mesh.content_item (account_code, id) ON DELETE CASCADE,
    CONSTRAINT mesh_content_item_access_grant_subject_account_fk FOREIGN KEY (subject_account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE,
    CONSTRAINT mesh_content_item_access_grant_subject_principal_fk FOREIGN KEY (subject_principal_id)
        REFERENCES mesh.principal (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS mesh_content_item_access_grant_uq
    ON mesh.content_item_access_grant (
        account_code,
        content_item_id,
        subject_type,
        COALESCE(subject_account_code, ''),
        COALESCE(subject_principal_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(role_code, ''),
        access_level
    );
