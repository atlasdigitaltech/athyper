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
CREATE INDEX attachment_link_pinned_attachment_idx
    ON document.attachment_link (tenant_id, pinned_attachment_id)
    WHERE pinned_attachment_id IS NOT NULL;
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
CREATE INDEX comment_revision_comment_idx
    ON document.comment_revision (tenant_id, comment_id, revision_no DESC);
CREATE INDEX comment_moderation_flag_queue_idx
    ON document.comment_moderation_flag (tenant_id, status, created_at)
    WHERE status IN ('open', 'reviewing');
CREATE INDEX comment_moderation_flag_comment_idx
    ON document.comment_moderation_flag (tenant_id, comment_id, created_at DESC);

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
CREATE UNIQUE INDEX attachment_generated_idempotency_uq ON document.attachment (tenant_id, (metadata->>'idempotency_key')) WHERE kind='generated_document' AND metadata ? 'idempotency_key';

-- attachment_series indexes
CREATE INDEX attachment_series_status_idx
    ON document.attachment_series (tenant_id, status, updated_at DESC)
    WHERE status IN ('active', 'expired', 'purge_requested');
CREATE INDEX attachment_series_expiry_idx
    ON document.attachment_series (expires_at)
    WHERE is_auto_delete_on_expiry AND status NOT IN ('purged', 'deleted');
CREATE INDEX attachment_series_retention_idx
    ON document.attachment_series (retention_until)
    WHERE status IN ('expired', 'deleted', 'purge_requested') AND retention_until IS NOT NULL;

-- attachment: series_id lookup
CREATE INDEX attachment_series_id_idx
    ON document.attachment (tenant_id, series_id)
    WHERE series_id IS NOT NULL;

-- attachment_link: series lookup
CREATE INDEX attachment_link_series_idx
    ON document.attachment_link (tenant_id, attachment_series_id);

-- attachment_legal_hold indexes
CREATE INDEX attachment_legal_hold_series_active_idx
    ON document.attachment_legal_hold (tenant_id, attachment_series_id)
    WHERE released_at IS NULL;
CREATE INDEX attachment_legal_hold_code_idx
    ON document.attachment_legal_hold (tenant_id, hold_code)
    WHERE hold_code IS NOT NULL AND released_at IS NULL;

-- attachment_legal_hold_event indexes
CREATE INDEX attachment_legal_hold_event_hold_idx
    ON document.attachment_legal_hold_event (tenant_id, legal_hold_id, occurred_at DESC);
CREATE INDEX attachment_legal_hold_event_series_idx
    ON document.attachment_legal_hold_event (tenant_id, attachment_series_id, occurred_at DESC);

-- attachment_derivative indexes
CREATE INDEX attachment_derivative_attachment_status_idx
    ON document.attachment_derivative (tenant_id, attachment_id, status, rendition_code);
CREATE INDEX attachment_derivative_ready_idx
    ON document.attachment_derivative (tenant_id, attachment_id, derivative_type, rendition_code)
    WHERE status = 'ready';
CREATE INDEX attachment_derivative_pending_idx
    ON document.attachment_derivative (created_at)
    WHERE status IN ('pending', 'failed') AND attempt_count < 5;
CREATE INDEX attachment_derivative_scan_pending_idx
    ON document.attachment_derivative (tenant_id, id)
    WHERE status = 'ready' AND scanned_at IS NULL;

-- multipart_upload_part indexes
CREATE INDEX multipart_upload_part_upload_idx
    ON document.multipart_upload_part (tenant_id, multipart_upload_id, part_number);

-- multipart_upload: series lookup
CREATE INDEX multipart_upload_series_idx
    ON document.multipart_upload (tenant_id, attachment_series_id)
    WHERE attachment_series_id IS NOT NULL;
