CREATE TRIGGER trg_attachment_10_creation_guard
BEFORE UPDATE ON document.attachment
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER trg_attachment_20_version_guard
BEFORE INSERT OR UPDATE OF tenant_id, parent_attachment_id, version_no
ON document.attachment
FOR EACH ROW EXECUTE FUNCTION document.trg_attachment_version_guard();
CREATE TRIGGER trg_attachment_30_status
BEFORE UPDATE OF status, status_changed_at, status_changed_by
ON document.attachment
FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence();
CREATE TRIGGER trg_attachment_90_updated_at
BEFORE UPDATE ON document.attachment
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_attachment_folder_10_creation_guard
BEFORE UPDATE ON document.attachment_folder
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER trg_attachment_folder_20_hierarchy
BEFORE INSERT OR UPDATE OF tenant_id, entity_type, entity_id, parent_id
ON document.attachment_folder
FOR EACH ROW EXECUTE FUNCTION document.trg_attachment_folder_guard();
CREATE TRIGGER trg_attachment_folder_90_updated_at
BEFORE UPDATE ON document.attachment_folder
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_attachment_link_folder
BEFORE INSERT OR UPDATE OF tenant_id, entity_type, entity_id, folder_id
ON document.attachment_link
FOR EACH ROW EXECUTE FUNCTION document.trg_attachment_link_folder_guard();
CREATE TRIGGER trg_attachment_link_guard
BEFORE UPDATE ON document.attachment_link
FOR EACH ROW EXECUTE FUNCTION document.trg_attachment_link_guard();

CREATE TRIGGER trg_comment_10_creation_guard
BEFORE UPDATE ON document.comment
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER trg_comment_20_hierarchy
BEFORE INSERT OR UPDATE OF tenant_id, context_type, entity_type, entity_id,
    comment_intent, parent_comment_id, thread_depth
ON document.comment
FOR EACH ROW EXECUTE FUNCTION document.trg_comment_guard();
CREATE TRIGGER trg_comment_90_updated_at
BEFORE UPDATE ON document.comment
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_comment_draft_10_creation_guard
BEFORE UPDATE ON document.comment_draft
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER trg_comment_draft_20_context
BEFORE INSERT OR UPDATE OF tenant_id, context_type, entity_type, entity_id,
    parent_comment_id
ON document.comment_draft
FOR EACH ROW EXECUTE FUNCTION document.trg_comment_draft_guard();
CREATE TRIGGER trg_comment_draft_90_updated_at
BEFORE UPDATE ON document.comment_draft
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_comment_reaction_type
BEFORE INSERT OR UPDATE OF tenant_id, reaction_type
ON document.comment_reaction
FOR EACH ROW EXECUTE FUNCTION document.trg_comment_reaction_guard();
CREATE TRIGGER trg_comment_mention_immutable
BEFORE UPDATE ON document.comment_mention
FOR EACH ROW EXECUTE FUNCTION document.trg_reject_update();
CREATE TRIGGER trg_comment_reaction_immutable
BEFORE UPDATE ON document.comment_reaction
FOR EACH ROW EXECUTE FUNCTION document.trg_reject_update();

CREATE TRIGGER trg_content_item_10_creation_guard
BEFORE UPDATE ON document.content_item
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER trg_content_item_20_parent
BEFORE INSERT OR UPDATE OF tenant_id, parent_id
ON document.content_item
FOR EACH ROW EXECUTE FUNCTION document.trg_content_parent_guard();
CREATE TRIGGER trg_content_item_30_current_version
BEFORE INSERT OR UPDATE OF tenant_id, current_version_id
ON document.content_item
FOR EACH ROW EXECUTE FUNCTION document.trg_content_current_version_guard();
CREATE TRIGGER trg_content_item_40_status
BEFORE UPDATE OF status, status_changed_at, status_changed_by
ON document.content_item
FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence();
CREATE TRIGGER trg_content_item_90_updated_at
BEFORE UPDATE ON document.content_item
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER trg_content_item_link_immutable
BEFORE UPDATE ON document.content_item_link
FOR EACH ROW EXECUTE FUNCTION document.trg_reject_update();

CREATE TRIGGER trg_conversation_10_creation_guard
BEFORE UPDATE ON document.conversation
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER trg_conversation_20_status
BEFORE UPDATE OF status, status_changed_at, status_changed_by
ON document.conversation
FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence();
CREATE TRIGGER trg_conversation_90_updated_at
BEFORE UPDATE ON document.conversation
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_conversation_participant_10_creation_guard
BEFORE UPDATE ON document.conversation_participant
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER trg_conversation_participant_20_membership_guard
BEFORE UPDATE ON document.conversation_participant
FOR EACH ROW EXECUTE FUNCTION document.trg_conversation_participant_guard();
CREATE TRIGGER trg_conversation_participant_90_updated_at
BEFORE UPDATE ON document.conversation_participant
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_multipart_upload_10_creation_guard
BEFORE UPDATE ON document.multipart_upload
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER trg_multipart_upload_20_parts
BEFORE INSERT OR UPDATE OF part_etags
ON document.multipart_upload
FOR EACH ROW EXECUTE FUNCTION document.trg_multipart_parts_guard();
CREATE TRIGGER trg_multipart_upload_90_updated_at
BEFORE UPDATE ON document.multipart_upload
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_content_item_version_immutable
BEFORE UPDATE OR DELETE ON snapshot.content_item_version
FOR EACH ROW EXECUTE FUNCTION snapshot.trg_content_item_version_immutable();
CREATE TRIGGER comment_feed_cursor_90_updated
BEFORE UPDATE ON document.comment_feed_cursor
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

SELECT audit.install_schema_row_triggers('document');

-- attachment_series
CREATE TRIGGER trg_attachment_series_10_guard
BEFORE INSERT OR UPDATE ON document.attachment_series
FOR EACH ROW EXECUTE FUNCTION document.trg_attachment_series_guard();
CREATE TRIGGER trg_attachment_series_20_status
BEFORE UPDATE OF status, status_changed_at, status_changed_by ON document.attachment_series
FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence();
CREATE TRIGGER trg_attachment_series_90_updated_at
BEFORE UPDATE ON document.attachment_series
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- attachment_legal_hold
CREATE TRIGGER trg_legal_hold_10_placement_guard
BEFORE UPDATE ON document.attachment_legal_hold
FOR EACH ROW EXECUTE FUNCTION document.trg_legal_hold_placement_guard();
CREATE TRIGGER trg_legal_hold_20_release_guard
BEFORE UPDATE OF released_at, released_by, release_reason ON document.attachment_legal_hold
FOR EACH ROW EXECUTE FUNCTION document.trg_legal_hold_release_guard();
CREATE TRIGGER trg_legal_hold_30_no_delete
BEFORE DELETE ON document.attachment_legal_hold
FOR EACH ROW EXECUTE FUNCTION document.trg_legal_hold_no_delete();

-- attachment_legal_hold_event (append-only)
CREATE TRIGGER trg_legal_hold_event_10_immutable
BEFORE UPDATE OR DELETE ON document.attachment_legal_hold_event
FOR EACH ROW EXECUTE FUNCTION document.trg_legal_hold_event_immutable();

-- attachment_derivative
CREATE TRIGGER trg_attachment_derivative_10_guard
BEFORE UPDATE ON document.attachment_derivative
FOR EACH ROW EXECUTE FUNCTION document.trg_attachment_derivative_guard();
CREATE TRIGGER trg_attachment_derivative_90_updated_at
BEFORE UPDATE ON document.attachment_derivative
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- multipart_upload_part (append-only)
CREATE TRIGGER trg_multipart_upload_part_10_immutable
BEFORE UPDATE OR DELETE ON document.multipart_upload_part
FOR EACH ROW EXECUTE FUNCTION document.trg_multipart_upload_part_immutable();
