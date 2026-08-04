CREATE INDEX attachment_sha256_idx
    ON document.attachment (tenant_id, sha256)
    WHERE sha256 IS NOT NULL AND status <> 'deleted';
CREATE INDEX attachment_storage_idx
    ON document.attachment (tenant_id, storage_bucket, storage_key);
CREATE INDEX attachment_parent_idx
    ON document.attachment (tenant_id, parent_attachment_id)
    WHERE parent_attachment_id IS NOT NULL;
CREATE INDEX attachment_expiry_idx
    ON document.attachment (expires_at)
    WHERE is_auto_delete_on_expiry AND status <> 'deleted';
CREATE INDEX attachment_processing_idx
    ON document.attachment (tenant_id, text_extraction_status, created_at)
    WHERE text_extraction_status IN ('pending', 'failed');

CREATE INDEX attachment_folder_owner_idx
    ON document.attachment_folder
    (tenant_id, entity_type, entity_id, parent_id, display_order);
CREATE INDEX attachment_link_owner_idx
    ON document.attachment_link
    (tenant_id, entity_type, entity_id, display_order);
CREATE INDEX attachment_link_attachment_idx
    ON document.attachment_link (tenant_id, attachment_id);
CREATE INDEX attachment_link_folder_idx
    ON document.attachment_link (tenant_id, folder_id)
    WHERE folder_id IS NOT NULL;

CREATE INDEX comment_owner_created_idx
    ON document.comment
    (tenant_id, entity_type, entity_id, created_at DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX comment_parent_idx
    ON document.comment (tenant_id, parent_comment_id, created_at)
    WHERE parent_comment_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX comment_commenter_idx
    ON document.comment (tenant_id, commenter_id, created_at DESC);
CREATE INDEX comment_draft_principal_idx
    ON document.comment_draft (tenant_id, principal_id, updated_at DESC);
CREATE INDEX comment_cursor_owner_idx
    ON document.comment_feed_cursor
    (tenant_id, entity_type, entity_id, principal_id);
CREATE INDEX comment_mention_principal_idx
    ON document.comment_mention (tenant_id, mentioned_id, created_at DESC);
CREATE INDEX comment_mention_comment_idx
    ON document.comment_mention (tenant_id, comment_id);
CREATE INDEX comment_reaction_comment_idx
    ON document.comment_reaction (tenant_id, comment_id, created_at);

CREATE INDEX content_item_parent_idx
    ON document.content_item (tenant_id, parent_id, locale_code);
CREATE INDEX content_item_status_idx
    ON document.content_item (tenant_id, status, kind, updated_at DESC);
CREATE INDEX content_item_link_target_idx
    ON document.content_item_link (tenant_id, target_content_item_id);
CREATE INDEX content_item_version_item_idx
    ON snapshot.content_item_version
    (tenant_id, content_item_id, version DESC);

CREATE INDEX conversation_owner_idx
    ON document.conversation (tenant_id, entity_type, entity_id)
    WHERE entity_type IS NOT NULL;
CREATE INDEX conversation_status_idx
    ON document.conversation (tenant_id, status, updated_at DESC);
CREATE INDEX conversation_participant_principal_idx
    ON document.conversation_participant
    (tenant_id, principal_id, left_at, conversation_id);
CREATE INDEX conversation_participant_conversation_idx
    ON document.conversation_participant
    (tenant_id, conversation_id, left_at);

CREATE INDEX multipart_upload_expiry_idx
    ON document.multipart_upload (expires_at)
    WHERE status IN ('initiated', 'uploading');
CREATE INDEX multipart_upload_attachment_idx
    ON document.multipart_upload (tenant_id, attachment_id)
    WHERE attachment_id IS NOT NULL;
