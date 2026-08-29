ALTER TABLE document.attachment ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.attachment FORCE ROW LEVEL SECURITY;
ALTER TABLE document.attachment_quota_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.attachment_quota_usage FORCE ROW LEVEL SECURITY;
ALTER TABLE document.attachment_quota_reservation ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.attachment_quota_reservation FORCE ROW LEVEL SECURITY;
ALTER TABLE document.attachment_folder ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.attachment_folder FORCE ROW LEVEL SECURITY;
ALTER TABLE document.attachment_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.attachment_link FORCE ROW LEVEL SECURITY;
ALTER TABLE document.comment ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.comment FORCE ROW LEVEL SECURITY;
ALTER TABLE document.comment_draft ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.comment_draft FORCE ROW LEVEL SECURITY;
ALTER TABLE document.comment_feed_cursor ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.comment_feed_cursor FORCE ROW LEVEL SECURITY;
ALTER TABLE document.comment_mention ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.comment_mention FORCE ROW LEVEL SECURITY;
ALTER TABLE document.comment_reaction ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.comment_reaction FORCE ROW LEVEL SECURITY;
ALTER TABLE document.comment_revision ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.comment_revision FORCE ROW LEVEL SECURITY;
ALTER TABLE document.comment_moderation_flag ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.comment_moderation_flag FORCE ROW LEVEL SECURITY;
ALTER TABLE document.content_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.content_item FORCE ROW LEVEL SECURITY;
ALTER TABLE document.content_item_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.content_item_link FORCE ROW LEVEL SECURITY;
ALTER TABLE document.conversation ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.conversation FORCE ROW LEVEL SECURITY;
ALTER TABLE document.conversation_participant ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.conversation_participant FORCE ROW LEVEL SECURITY;
ALTER TABLE document.multipart_upload ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.multipart_upload FORCE ROW LEVEL SECURITY;
ALTER TABLE snapshot.content_item_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot.content_item_version FORCE ROW LEVEL SECURITY;
ALTER TABLE document.content_item_access_grant ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.content_item_access_grant FORCE ROW LEVEL SECURITY;
ALTER TABLE document.content_quota_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.content_quota_usage FORCE ROW LEVEL SECURITY;
ALTER TABLE document.content_quota_reservation ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.content_quota_reservation FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_access ON document.attachment
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON document.attachment
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY tenant_access ON document.attachment_quota_usage FOR ALL USING (tenant_id=shared.current_tenant_id_soft()) WITH CHECK (tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON document.attachment_quota_usage FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY tenant_access ON document.attachment_quota_reservation FOR ALL USING (tenant_id=shared.current_tenant_id_soft()) WITH CHECK (tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON document.attachment_quota_reservation FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_access ON document.attachment_folder
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON document.attachment_folder
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_access ON document.attachment_link
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON document.attachment_link
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY comment_read ON document.comment
    FOR SELECT
    USING (
        tenant_id = shared.current_tenant_id_soft()
        AND (
            visibility <> 'private'
            OR commenter_id = master.current_principal_id_soft()
        )
    );
CREATE POLICY comment_insert ON document.comment
    FOR INSERT
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND commenter_id = master.current_principal_id_soft()
        AND created_by = master.current_principal_id_soft()
    );
CREATE POLICY comment_update ON document.comment
    FOR UPDATE
    USING (
        tenant_id = shared.current_tenant_id_soft()
        AND commenter_id = master.current_principal_id_soft()
    )
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND commenter_id = master.current_principal_id_soft()
    );
CREATE POLICY seed_write ON document.comment
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY principal_access ON document.comment_draft
    FOR ALL
    USING (
        tenant_id = shared.current_tenant_id_soft()
        AND principal_id = master.current_principal_id_soft()
    )
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND principal_id = master.current_principal_id_soft()
        AND created_by = master.current_principal_id_soft()
    );
CREATE POLICY seed_write ON document.comment_draft
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY principal_access ON document.comment_feed_cursor
    FOR ALL
    USING (
        tenant_id = shared.current_tenant_id_soft()
        AND principal_id = master.current_principal_id_soft()
    )
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND principal_id = master.current_principal_id_soft()
    );
CREATE POLICY seed_write ON document.comment_feed_cursor
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_read ON document.comment_mention
    FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY author_write ON document.comment_mention
    FOR ALL
    USING (
        tenant_id = shared.current_tenant_id_soft()
        AND created_by = master.current_principal_id_soft()
    )
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND created_by = master.current_principal_id_soft()
    );
CREATE POLICY seed_write ON document.comment_mention
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_read ON document.comment_reaction
    FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY principal_write ON document.comment_reaction
    FOR ALL
    USING (
        tenant_id = shared.current_tenant_id_soft()
        AND principal_id = master.current_principal_id_soft()
    )
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND principal_id = master.current_principal_id_soft()
        AND created_by = master.current_principal_id_soft()
    );
CREATE POLICY seed_write ON document.comment_reaction
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY admin_access ON document.comment_revision
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
CREATE POLICY admin_access ON document.comment_moderation_flag
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

CREATE POLICY tenant_access ON document.content_item
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON document.content_item
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_access ON document.content_item_link
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON document.content_item_link
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY participant_read ON document.conversation
    FOR SELECT
    USING (
        tenant_id = shared.current_tenant_id_soft()
        AND (
            created_by = master.current_principal_id_soft()
            OR EXISTS (
                SELECT 1
                  FROM document.conversation_participant cp
                 WHERE cp.tenant_id = conversation.tenant_id
                   AND cp.conversation_id = conversation.id
                   AND cp.principal_id = master.current_principal_id_soft()
                   AND cp.left_at IS NULL
            )
        )
    );
CREATE POLICY creator_insert ON document.conversation
    FOR INSERT
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND created_by = master.current_principal_id_soft()
    );
CREATE POLICY owner_update ON document.conversation
    FOR UPDATE
    USING (
        tenant_id = shared.current_tenant_id_soft()
        AND (
            created_by = master.current_principal_id_soft()
            OR EXISTS (
                SELECT 1
                  FROM document.conversation_participant cp
                 WHERE cp.tenant_id = conversation.tenant_id
                   AND cp.conversation_id = conversation.id
                   AND cp.principal_id = master.current_principal_id_soft()
                   AND cp.role IN ('owner', 'admin')
                   AND cp.left_at IS NULL
            )
        )
    )
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON document.conversation
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY participant_read ON document.conversation_participant
    FOR SELECT
    USING (
        tenant_id = shared.current_tenant_id_soft()
        AND principal_id = master.current_principal_id_soft()
    );
CREATE POLICY participant_insert ON document.conversation_participant
    FOR INSERT
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND principal_id = master.current_principal_id_soft()
        AND created_by = master.current_principal_id_soft()
    );
CREATE POLICY participant_update ON document.conversation_participant
    FOR UPDATE
    USING (
        tenant_id = shared.current_tenant_id_soft()
        AND principal_id = master.current_principal_id_soft()
    )
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND principal_id = master.current_principal_id_soft()
    );
CREATE POLICY seed_write ON document.conversation_participant
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY principal_access ON document.multipart_upload
    FOR ALL
    USING (
        tenant_id = shared.current_tenant_id_soft()
        AND initiated_by = master.current_principal_id_soft()
    )
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND initiated_by = master.current_principal_id_soft()
        AND created_by = master.current_principal_id_soft()
    );
CREATE POLICY seed_write ON document.multipart_upload
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_read ON snapshot.content_item_version
    FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON snapshot.content_item_version
    FOR INSERT
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND created_by = master.current_principal_id_soft()
    );
CREATE POLICY seed_write ON snapshot.content_item_version
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

DO $$
DECLARE
    v_table text;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        FOREACH v_table IN ARRAY ARRAY[
            'attachment', 'attachment_folder', 'attachment_link',
            'comment', 'comment_draft', 'comment_feed_cursor',
            'comment_mention', 'comment_reaction',
            'content_item', 'content_item_link',
            'conversation', 'conversation_participant', 'multipart_upload'
        ]
        LOOP
            EXECUTE format(
                'CREATE POLICY admin_access ON document.%I FOR ALL TO athyperadmin USING (true) WITH CHECK (true)',
                v_table
            );
        END LOOP;

        CREATE POLICY admin_access ON snapshot.content_item_version
            FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
    END IF;
END;
$$;

ALTER TABLE document.attachment_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.attachment_series FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON document.attachment_series
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON document.attachment_series
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

-- Legal hold: no DELETE policy for application role
ALTER TABLE document.attachment_legal_hold ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.attachment_legal_hold FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON document.attachment_legal_hold
    FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.attachment_legal_hold
    FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON document.attachment_legal_hold
    FOR UPDATE
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON document.attachment_legal_hold
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

-- Legal hold event: append-only
ALTER TABLE document.attachment_legal_hold_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.attachment_legal_hold_event FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON document.attachment_legal_hold_event
    FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.attachment_legal_hold_event
    FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON document.attachment_legal_hold_event
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE document.attachment_derivative ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.attachment_derivative FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON document.attachment_derivative
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON document.attachment_derivative
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

-- Multipart upload part: append-only per tenant
ALTER TABLE document.multipart_upload_part ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.multipart_upload_part FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON document.multipart_upload_part
    FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.multipart_upload_part
    FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON document.multipart_upload_part
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

DO $$
DECLARE
    v_table text;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        FOREACH v_table IN ARRAY ARRAY[
            'attachment_series', 'attachment_legal_hold', 'attachment_legal_hold_event',
            'attachment_derivative', 'multipart_upload_part'
        ]
        LOOP
            EXECUTE format(
                'CREATE POLICY admin_access ON document.%I FOR ALL TO athyperadmin USING (true) WITH CHECK (true)',
                v_table
            );
        END LOOP;
    END IF;
END;
$$;
CREATE POLICY tenant_access ON document.content_item_access_grant FOR ALL USING (tenant_id=shared.current_tenant_id_soft()) WITH CHECK (tenant_id=shared.current_tenant_id());
CREATE POLICY tenant_access ON document.content_quota_usage FOR ALL USING (tenant_id=shared.current_tenant_id_soft()) WITH CHECK (tenant_id=shared.current_tenant_id());
CREATE POLICY tenant_access ON document.content_quota_reservation FOR ALL USING (tenant_id=shared.current_tenant_id_soft()) WITH CHECK (tenant_id=shared.current_tenant_id());
