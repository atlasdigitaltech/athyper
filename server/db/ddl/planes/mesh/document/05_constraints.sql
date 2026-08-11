ALTER TABLE document.attachment
    ADD CONSTRAINT attachment_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE document.attachment
    ADD CONSTRAINT attachment_parent_fk
    FOREIGN KEY (tenant_id, parent_attachment_id)
    REFERENCES document.attachment (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.attachment
    ADD CONSTRAINT attachment_uploaded_by_fk
    FOREIGN KEY (tenant_id, uploaded_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.attachment
    ADD CONSTRAINT attachment_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.attachment
    ADD CONSTRAINT attachment_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.attachment
    ADD CONSTRAINT attachment_status_changed_by_fk
    FOREIGN KEY (tenant_id, status_changed_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.attachment_quota_usage ADD CONSTRAINT attachment_quota_usage_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_quota_usage ADD CONSTRAINT attachment_quota_usage_created_by_fk FOREIGN KEY (tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_quota_reservation ADD CONSTRAINT attachment_quota_reservation_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_quota_reservation ADD CONSTRAINT attachment_quota_reservation_attachment_fk FOREIGN KEY (tenant_id,resource_id) REFERENCES document.attachment(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_quota_reservation ADD CONSTRAINT attachment_quota_reservation_created_by_fk FOREIGN KEY (tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE document.attachment_folder
    ADD CONSTRAINT attachment_folder_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_folder
    ADD CONSTRAINT attachment_folder_parent_fk
    FOREIGN KEY (tenant_id, parent_id)
    REFERENCES document.attachment_folder (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_folder
    ADD CONSTRAINT attachment_folder_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_folder
    ADD CONSTRAINT attachment_folder_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.attachment_link
    ADD CONSTRAINT attachment_link_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_link
    ADD CONSTRAINT attachment_link_attachment_fk
    FOREIGN KEY (tenant_id, attachment_id)
    REFERENCES document.attachment (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_link
    ADD CONSTRAINT attachment_link_folder_fk
    FOREIGN KEY (tenant_id, folder_id)
    REFERENCES document.attachment_folder (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_link
    ADD CONSTRAINT attachment_link_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.comment
    ADD CONSTRAINT comment_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE document.comment
    ADD CONSTRAINT comment_parent_fk
    FOREIGN KEY (tenant_id, parent_comment_id)
    REFERENCES document.comment (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.comment
    ADD CONSTRAINT comment_commenter_fk
    FOREIGN KEY (tenant_id, commenter_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.comment
    ADD CONSTRAINT comment_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.comment
    ADD CONSTRAINT comment_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.comment
    ADD CONSTRAINT comment_deleted_by_fk
    FOREIGN KEY (tenant_id, deleted_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.comment
    ADD CONSTRAINT comment_archived_by_fk
    FOREIGN KEY (tenant_id, archived_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.comment_draft
    ADD CONSTRAINT comment_draft_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
ALTER TABLE document.comment_draft
    ADD CONSTRAINT comment_draft_principal_fk
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE document.comment_draft
    ADD CONSTRAINT comment_draft_parent_fk
    FOREIGN KEY (tenant_id, parent_comment_id)
    REFERENCES document.comment (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE document.comment_draft
    ADD CONSTRAINT comment_draft_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.comment_draft
    ADD CONSTRAINT comment_draft_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.comment_feed_cursor
    ADD CONSTRAINT comment_feed_cursor_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
ALTER TABLE document.comment_feed_cursor
    ADD CONSTRAINT comment_feed_cursor_principal_fk
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE document.comment_feed_cursor
    ADD CONSTRAINT comment_feed_cursor_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.comment_mention
    ADD CONSTRAINT comment_mention_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
ALTER TABLE document.comment_mention
    ADD CONSTRAINT comment_mention_comment_fk
    FOREIGN KEY (tenant_id, comment_id)
    REFERENCES document.comment (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE document.comment_mention
    ADD CONSTRAINT comment_mention_principal_fk
    FOREIGN KEY (tenant_id, mentioned_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE document.comment_mention
    ADD CONSTRAINT comment_mention_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.comment_reaction
    ADD CONSTRAINT comment_reaction_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
ALTER TABLE document.comment_reaction
    ADD CONSTRAINT comment_reaction_comment_fk
    FOREIGN KEY (tenant_id, comment_id)
    REFERENCES document.comment (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE document.comment_reaction
    ADD CONSTRAINT comment_reaction_principal_fk
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE document.comment_reaction
    ADD CONSTRAINT comment_reaction_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.content_item
    ADD CONSTRAINT content_item_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE document.content_item
    ADD CONSTRAINT content_item_parent_fk
    FOREIGN KEY (tenant_id, parent_id)
    REFERENCES document.content_item (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.content_item
    ADD CONSTRAINT content_item_locale_fk
    FOREIGN KEY (locale_code) REFERENCES shared.locale (code) ON DELETE RESTRICT;
ALTER TABLE document.content_item
    ADD CONSTRAINT content_item_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.content_item
    ADD CONSTRAINT content_item_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.content_item
    ADD CONSTRAINT content_item_status_changed_by_fk
    FOREIGN KEY (tenant_id, status_changed_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.content_item_link
    ADD CONSTRAINT content_item_link_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
ALTER TABLE document.content_item_link
    ADD CONSTRAINT content_item_link_source_fk
    FOREIGN KEY (tenant_id, source_content_item_id)
    REFERENCES document.content_item (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE document.content_item_link
    ADD CONSTRAINT content_item_link_target_fk
    FOREIGN KEY (tenant_id, target_content_item_id)
    REFERENCES document.content_item (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE document.content_item_link
    ADD CONSTRAINT content_item_link_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.conversation
    ADD CONSTRAINT conversation_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE document.conversation
    ADD CONSTRAINT conversation_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.conversation
    ADD CONSTRAINT conversation_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.conversation
    ADD CONSTRAINT conversation_status_changed_by_fk
    FOREIGN KEY (tenant_id, status_changed_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.conversation
    ADD CONSTRAINT conversation_deleted_by_fk
    FOREIGN KEY (tenant_id, deleted_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.conversation_participant
    ADD CONSTRAINT conversation_participant_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
ALTER TABLE document.conversation_participant
    ADD CONSTRAINT conversation_participant_conversation_fk
    FOREIGN KEY (tenant_id, conversation_id)
    REFERENCES document.conversation (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE document.conversation_participant
    ADD CONSTRAINT conversation_participant_principal_fk
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE document.conversation_participant
    ADD CONSTRAINT conversation_participant_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.conversation_participant
    ADD CONSTRAINT conversation_participant_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.conversation_participant
    ADD CONSTRAINT conversation_participant_left_by_fk
    FOREIGN KEY (tenant_id, left_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.multipart_upload
    ADD CONSTRAINT multipart_upload_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
ALTER TABLE document.multipart_upload
    ADD CONSTRAINT multipart_upload_attachment_fk
    FOREIGN KEY (tenant_id, attachment_id)
    REFERENCES document.attachment (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.multipart_upload
    ADD CONSTRAINT multipart_upload_initiated_by_fk
    FOREIGN KEY (tenant_id, initiated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.multipart_upload
    ADD CONSTRAINT multipart_upload_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.multipart_upload
    ADD CONSTRAINT multipart_upload_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE snapshot.content_item_version
    ADD CONSTRAINT content_item_version_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE snapshot.content_item_version
    ADD CONSTRAINT content_item_version_item_fk
    FOREIGN KEY (tenant_id, content_item_id)
    REFERENCES document.content_item (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE snapshot.content_item_version
    ADD CONSTRAINT content_item_version_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.content_item
    ADD CONSTRAINT content_item_current_version_fk
    FOREIGN KEY (tenant_id, current_version_id)
    REFERENCES snapshot.content_item_version (tenant_id, id)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE document.content_item_access_grant ADD CONSTRAINT content_item_access_grant_item_fk FOREIGN KEY(tenant_id,content_item_id) REFERENCES document.content_item(tenant_id,id) ON DELETE CASCADE;
ALTER TABLE document.content_item_access_grant ADD CONSTRAINT content_item_access_grant_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;
ALTER TABLE document.content_item_access_grant ADD CONSTRAINT content_item_access_grant_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.content_quota_usage ADD CONSTRAINT content_quota_usage_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;
ALTER TABLE document.content_quota_reservation ADD CONSTRAINT content_quota_reservation_item_fk FOREIGN KEY(tenant_id,content_item_id) REFERENCES document.content_item(tenant_id,id) ON DELETE CASCADE;

-- attachment_series constraints
ALTER TABLE document.attachment_series
    ADD CONSTRAINT attachment_series_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_series
    ADD CONSTRAINT attachment_series_current_attachment_fk
    FOREIGN KEY (tenant_id, current_attachment_id)
    REFERENCES document.attachment (tenant_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE document.attachment_series
    ADD CONSTRAINT attachment_series_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_series
    ADD CONSTRAINT attachment_series_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_series
    ADD CONSTRAINT attachment_series_status_changed_by_fk
    FOREIGN KEY (tenant_id, status_changed_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

-- attachment.series_id FK (deferrable: series and first version are co-created)
ALTER TABLE document.attachment
    ADD CONSTRAINT attachment_series_id_fk
    FOREIGN KEY (tenant_id, series_id)
    REFERENCES document.attachment_series (tenant_id, id) ON DELETE RESTRICT;

-- attachment_link: series FK
ALTER TABLE document.attachment_link
    ADD CONSTRAINT attachment_link_attachment_series_fk
    FOREIGN KEY (tenant_id, attachment_series_id)
    REFERENCES document.attachment_series (tenant_id, id) ON DELETE RESTRICT;

-- multipart_upload: series + parent FKs
ALTER TABLE document.multipart_upload
    ADD CONSTRAINT multipart_upload_attachment_series_fk
    FOREIGN KEY (tenant_id, attachment_series_id)
    REFERENCES document.attachment_series (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.multipart_upload
    ADD CONSTRAINT multipart_upload_parent_attachment_fk
    FOREIGN KEY (tenant_id, parent_attachment_id)
    REFERENCES document.attachment (tenant_id, id) ON DELETE RESTRICT;

-- attachment_legal_hold constraints
ALTER TABLE document.attachment_legal_hold
    ADD CONSTRAINT attachment_legal_hold_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_legal_hold
    ADD CONSTRAINT attachment_legal_hold_series_fk
    FOREIGN KEY (tenant_id, attachment_series_id)
    REFERENCES document.attachment_series (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_legal_hold
    ADD CONSTRAINT attachment_legal_hold_placed_by_fk
    FOREIGN KEY (tenant_id, placed_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_legal_hold
    ADD CONSTRAINT attachment_legal_hold_released_by_fk
    FOREIGN KEY (tenant_id, released_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_legal_hold
    ADD CONSTRAINT attachment_legal_hold_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

-- attachment_legal_hold_event constraints
ALTER TABLE document.attachment_legal_hold_event
    ADD CONSTRAINT attachment_legal_hold_event_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_legal_hold_event
    ADD CONSTRAINT attachment_legal_hold_event_hold_fk
    FOREIGN KEY (tenant_id, legal_hold_id)
    REFERENCES document.attachment_legal_hold (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_legal_hold_event
    ADD CONSTRAINT attachment_legal_hold_event_series_fk
    FOREIGN KEY (tenant_id, attachment_series_id)
    REFERENCES document.attachment_series (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_legal_hold_event
    ADD CONSTRAINT attachment_legal_hold_event_actor_fk
    FOREIGN KEY (tenant_id, actor_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

-- attachment_derivative constraints
ALTER TABLE document.attachment_derivative
    ADD CONSTRAINT attachment_derivative_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_derivative
    ADD CONSTRAINT attachment_derivative_attachment_fk
    FOREIGN KEY (tenant_id, attachment_id)
    REFERENCES document.attachment (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_derivative
    ADD CONSTRAINT attachment_derivative_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.attachment_derivative
    ADD CONSTRAINT attachment_derivative_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

-- multipart_upload_part constraints
ALTER TABLE document.multipart_upload_part
    ADD CONSTRAINT multipart_upload_part_upload_fk
    FOREIGN KEY (tenant_id, multipart_upload_id)
    REFERENCES document.multipart_upload (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE document.multipart_upload_part
    ADD CONSTRAINT multipart_upload_part_recorded_by_fk
    FOREIGN KEY (tenant_id, recorded_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
