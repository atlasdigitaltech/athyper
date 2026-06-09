-- ============================================================================
-- mesh/08_rls.sql
-- Mesh RLS policies.
--
-- Account-scoped requests must set app.account_code. Tenant-scoped read models
-- may also set app.tenant_code. Projection/admin workers set app.mesh_admin.
-- The athyperadmin DB role is allowed for provisioning and local seed scripts.
-- ============================================================================

ALTER TABLE mesh.network_provider ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_document_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.account_grant ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_relationship ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.document_envelope ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.document_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.idempotency_key ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_account_identifier ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.address ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.address_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.contact_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.contact_email ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.contact_phone ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.bank_party ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.bank_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.bank_account_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.bank_account_disclosure ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.certification_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.certification ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_account_reference ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.attachment ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.attachment_acl ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.attachment_folder ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.attachment_comment ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.comment ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.comment_draft ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.comment_mention ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.comment_reaction ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.comment_feed_cursor ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.conversation ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.conversation_participant ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.content_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.content_item_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.content_item_access_grant ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.multipart_upload ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.holiday_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.holiday_calendar_day ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.principal_notification_preference ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.saved_view ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.principal ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.principal_identity_binding ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_invitation ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.connection_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.connection_acceptance ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.outbox_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.sync_checkpoint ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.external_reference ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.document_payload ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.document_acknowledgement ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.audit_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.supplier_service_coverage ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.supplier_commodity_capability ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.supplier_profile_verification ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_item_classification ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_item_uom ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_price ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.carrier ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.logistics_zone ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.logistics_zone_member ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.logistics_rate ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.logistics_rate_break ENABLE ROW LEVEL SECURITY;

ALTER TABLE mesh.network_provider FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_document_type FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_account FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.account_grant FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_relationship FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.document_envelope FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.document_event FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.idempotency_key FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_account_identifier FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.address FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.address_link FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.contact_link FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.contact_email FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.contact_phone FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.bank_party FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.bank_account FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.bank_account_link FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.bank_account_disclosure FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.certification_type FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.certification FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_account_reference FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.attachment FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.attachment_acl FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.attachment_folder FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.attachment_comment FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.comment FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.comment_draft FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.comment_mention FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.comment_reaction FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.comment_feed_cursor FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.conversation FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.conversation_participant FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.content_item FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.content_item_link FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.content_item_access_grant FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.multipart_upload FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.holiday_calendar FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.holiday_calendar_day FORCE ROW LEVEL SECURITY;
-- principal_ui_profile and principal_ui_preference dropped — FORCE RLS lines removed.
ALTER TABLE mesh.principal_notification_preference FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.saved_view FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.principal FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.principal_identity_binding FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_invitation FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.connection_request FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.connection_acceptance FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.outbox_event FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_event FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.sync_checkpoint FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.external_reference FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.document_payload FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.document_acknowledgement FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.audit_event FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.activity_log FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.supplier_service_coverage FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.supplier_commodity_capability FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.supplier_profile_verification FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_item FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_item_classification FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_item_uom FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_price FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_availability FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.carrier FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.logistics_zone FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.logistics_zone_member FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.logistics_rate FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.logistics_rate_break FORCE ROW LEVEL SECURITY;

-- Open catalog reads.
DROP POLICY IF EXISTS mesh_catalog_read ON mesh.network_provider;
CREATE POLICY mesh_catalog_read ON mesh.network_provider FOR SELECT USING (true);
DROP POLICY IF EXISTS mesh_catalog_admin ON mesh.network_provider;
CREATE POLICY mesh_catalog_admin ON mesh.network_provider FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_catalog_read ON mesh.network_document_type;
CREATE POLICY mesh_catalog_read ON mesh.network_document_type FOR SELECT USING (true);
DROP POLICY IF EXISTS mesh_catalog_admin ON mesh.network_document_type;
CREATE POLICY mesh_catalog_admin ON mesh.network_document_type FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

-- Account ownership and membership.
DROP POLICY IF EXISTS mesh_network_account_read ON mesh.network_account;
CREATE POLICY mesh_network_account_read ON mesh.network_account
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code = mesh.current_account_code()
        OR EXISTS (
            SELECT 1
            FROM mesh.account_grant ag
            JOIN mesh.principal_identity_binding pib ON pib.principal_id = ag.principal_id
            WHERE ag.account_id = network_account.id
              AND ag.status = 'active'
              AND pib.subject_id = mesh.current_subject_id()
        )
    );
DROP POLICY IF EXISTS mesh_network_account_admin ON mesh.network_account;
CREATE POLICY mesh_network_account_admin ON mesh.network_account
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_account_grant_read ON mesh.account_grant;
CREATE POLICY mesh_account_grant_read ON mesh.account_grant
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR EXISTS (
            SELECT 1
            FROM mesh.network_account na
            WHERE na.id = account_grant.account_id
              AND na.account_code = mesh.current_account_code()
        )
        OR EXISTS (
            SELECT 1
            FROM mesh.principal_identity_binding pib
            WHERE pib.principal_id = account_grant.principal_id
              AND pib.subject_id = mesh.current_subject_id()
        )
    );
DROP POLICY IF EXISTS mesh_account_grant_admin ON mesh.account_grant;
CREATE POLICY mesh_account_grant_admin ON mesh.account_grant
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

-- Relationships are visible to either side. This OR is required: buyer-only
-- filtering would hide the same relationship from the supplier account.
DROP POLICY IF EXISTS mesh_network_connection_read ON mesh.network_relationship;
DROP POLICY IF EXISTS mesh_network_relationship_read ON mesh.network_relationship;
CREATE POLICY mesh_network_relationship_read ON mesh.network_relationship
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR buyer_account_code = mesh.current_account_code()
        OR supplier_account_code = mesh.current_account_code()
    );
DROP POLICY IF EXISTS mesh_network_connection_admin ON mesh.network_relationship;
DROP POLICY IF EXISTS mesh_network_relationship_admin ON mesh.network_relationship;
CREATE POLICY mesh_network_relationship_admin ON mesh.network_relationship
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_document_envelope_read ON mesh.document_envelope;
CREATE POLICY mesh_document_envelope_read ON mesh.document_envelope
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR sender_account_code = mesh.current_account_code()
        OR receiver_account_code = mesh.current_account_code()
    );
DROP POLICY IF EXISTS mesh_document_envelope_admin ON mesh.document_envelope;
CREATE POLICY mesh_document_envelope_admin ON mesh.document_envelope
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_document_event_read ON mesh.document_event;
CREATE POLICY mesh_document_event_read ON mesh.document_event
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR EXISTS (
            SELECT 1
            FROM mesh.document_envelope de
            WHERE de.id = document_event.envelope_id
              AND (
                  de.sender_account_code = mesh.current_account_code()
                  OR de.receiver_account_code = mesh.current_account_code()
              )
        )
    );
DROP POLICY IF EXISTS mesh_document_event_admin ON mesh.document_event;
CREATE POLICY mesh_document_event_admin ON mesh.document_event
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_idempotency_key_read ON mesh.idempotency_key;
CREATE POLICY mesh_idempotency_key_read ON mesh.idempotency_key
    FOR SELECT USING (mesh.is_mesh_admin() OR account_code = mesh.current_account_code());
DROP POLICY IF EXISTS mesh_idempotency_key_admin ON mesh.idempotency_key;
CREATE POLICY mesh_idempotency_key_admin ON mesh.idempotency_key
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

-- Network account identifiers (renamed from participant_identifier).
DROP POLICY IF EXISTS mesh_participant_identifier_read ON mesh.network_account_identifier;
DROP POLICY IF EXISTS mesh_network_account_identifier_read ON mesh.network_account_identifier;
CREATE POLICY mesh_network_account_identifier_read ON mesh.network_account_identifier
    FOR SELECT USING (mesh.is_mesh_admin() OR account_code = mesh.current_account_code());
DROP POLICY IF EXISTS mesh_participant_identifier_admin ON mesh.network_account_identifier;
DROP POLICY IF EXISTS mesh_network_account_identifier_admin ON mesh.network_account_identifier;
CREATE POLICY mesh_network_account_identifier_admin ON mesh.network_account_identifier
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

-- Participant profile detail tables.
DROP POLICY IF EXISTS mesh_address_read ON mesh.address;
CREATE POLICY mesh_address_read ON mesh.address
    FOR SELECT USING (mesh.is_mesh_admin() OR account_code = mesh.current_account_code());
DROP POLICY IF EXISTS mesh_address_admin ON mesh.address;
CREATE POLICY mesh_address_admin ON mesh.address
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_address_link_read ON mesh.address_link;
CREATE POLICY mesh_address_link_read ON mesh.address_link
    FOR SELECT USING (mesh.is_mesh_admin() OR account_code = mesh.current_account_code());
DROP POLICY IF EXISTS mesh_address_link_admin ON mesh.address_link;
CREATE POLICY mesh_address_link_admin ON mesh.address_link
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

-- party_contact_person and party_contact_role dropped — policies removed.

DROP POLICY IF EXISTS mesh_contact_link_read ON mesh.contact_link;
CREATE POLICY mesh_contact_link_read ON mesh.contact_link
    FOR SELECT USING (mesh.is_mesh_admin() OR account_code = mesh.current_account_code());
DROP POLICY IF EXISTS mesh_contact_link_admin ON mesh.contact_link;
CREATE POLICY mesh_contact_link_admin ON mesh.contact_link
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_contact_email_read ON mesh.contact_email;
CREATE POLICY mesh_contact_email_read ON mesh.contact_email
    FOR SELECT USING (mesh.is_mesh_admin() OR account_code = mesh.current_account_code());
DROP POLICY IF EXISTS mesh_contact_email_admin ON mesh.contact_email;
CREATE POLICY mesh_contact_email_admin ON mesh.contact_email
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_contact_phone_read ON mesh.contact_phone;
CREATE POLICY mesh_contact_phone_read ON mesh.contact_phone
    FOR SELECT USING (mesh.is_mesh_admin() OR account_code = mesh.current_account_code());
DROP POLICY IF EXISTS mesh_contact_phone_admin ON mesh.contact_phone;
CREATE POLICY mesh_contact_phone_admin ON mesh.contact_phone
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

-- party_tax_profile dropped — policies removed.

DROP POLICY IF EXISTS mesh_bank_party_read ON mesh.bank_party;
CREATE POLICY mesh_bank_party_read ON mesh.bank_party
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code IS NULL
        OR account_code = mesh.current_account_code()
    );
DROP POLICY IF EXISTS mesh_bank_party_admin ON mesh.bank_party;
CREATE POLICY mesh_bank_party_admin ON mesh.bank_party
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_bank_account_read ON mesh.bank_account;
CREATE POLICY mesh_bank_account_read ON mesh.bank_account
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code = mesh.current_account_code()
        OR EXISTS (
            SELECT 1
            FROM mesh.bank_account_disclosure bad
            JOIN mesh.network_relationship nc ON nc.id = bad.connection_id
            WHERE bad.account_code = bank_account.account_code
              AND bad.bank_account_id = bank_account.id
              AND bad.disclosed_to_account_code = mesh.current_account_code()
              AND bad.revoked_at IS NULL
              AND (bad.expires_at IS NULL OR bad.expires_at > now())
              AND nc.status = 'active'
              AND bad.account_code IN (nc.buyer_account_code, nc.supplier_account_code)
              AND bad.disclosed_to_account_code IN (nc.buyer_account_code, nc.supplier_account_code)
              AND (
                  nc.buyer_account_code = mesh.current_account_code()
                  OR nc.supplier_account_code = mesh.current_account_code()
              )
        )
    );
DROP POLICY IF EXISTS mesh_bank_account_admin ON mesh.bank_account;
CREATE POLICY mesh_bank_account_admin ON mesh.bank_account
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_bank_account_link_read ON mesh.bank_account_link;
CREATE POLICY mesh_bank_account_link_read ON mesh.bank_account_link
    FOR SELECT USING (mesh.is_mesh_admin() OR account_code = mesh.current_account_code());
DROP POLICY IF EXISTS mesh_bank_account_link_admin ON mesh.bank_account_link;
CREATE POLICY mesh_bank_account_link_admin ON mesh.bank_account_link
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_bank_account_disclosure_read ON mesh.bank_account_disclosure;
CREATE POLICY mesh_bank_account_disclosure_read ON mesh.bank_account_disclosure
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code = mesh.current_account_code()
        OR disclosed_to_account_code = mesh.current_account_code()
    );
DROP POLICY IF EXISTS mesh_bank_account_disclosure_admin ON mesh.bank_account_disclosure;
CREATE POLICY mesh_bank_account_disclosure_admin ON mesh.bank_account_disclosure
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_certification_type_read ON mesh.certification_type;
CREATE POLICY mesh_certification_type_read ON mesh.certification_type
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code IS NULL
        OR account_code = mesh.current_account_code()
    );
DROP POLICY IF EXISTS mesh_certification_type_admin ON mesh.certification_type;
CREATE POLICY mesh_certification_type_admin ON mesh.certification_type
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_certification_read ON mesh.certification;
CREATE POLICY mesh_certification_read ON mesh.certification
    FOR SELECT USING (mesh.is_mesh_admin() OR account_code = mesh.current_account_code());
DROP POLICY IF EXISTS mesh_certification_admin ON mesh.certification;
CREATE POLICY mesh_certification_admin ON mesh.certification
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

-- Network account references (renamed from participant_external_reference).
DROP POLICY IF EXISTS mesh_participant_external_reference_read ON mesh.network_account_reference;
DROP POLICY IF EXISTS mesh_network_account_reference_read ON mesh.network_account_reference;
CREATE POLICY mesh_network_account_reference_read ON mesh.network_account_reference
    FOR SELECT USING (mesh.is_mesh_admin() OR account_code = mesh.current_account_code());
DROP POLICY IF EXISTS mesh_participant_external_reference_admin ON mesh.network_account_reference;
DROP POLICY IF EXISTS mesh_network_account_reference_admin ON mesh.network_account_reference;
CREATE POLICY mesh_network_account_reference_admin ON mesh.network_account_reference
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

-- Evidence, content, and collaboration.
DROP POLICY IF EXISTS mesh_attachment_read ON mesh.attachment;
CREATE POLICY mesh_attachment_read ON mesh.attachment
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code = mesh.current_account_code()
        OR EXISTS (
            SELECT 1
            FROM mesh.attachment_acl acl
            WHERE acl.attachment_id = attachment.id
              AND acl.is_granted = true
              AND acl.permission IN ('read', 'download', 'share')
              AND (acl.expires_at IS NULL OR acl.expires_at > now())
              AND acl.grantee_account_code = mesh.current_account_code()
        )
    );
DROP POLICY IF EXISTS mesh_attachment_admin ON mesh.attachment;
CREATE POLICY mesh_attachment_admin ON mesh.attachment
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_attachment_acl_read ON mesh.attachment_acl;
CREATE POLICY mesh_attachment_acl_read ON mesh.attachment_acl
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code = mesh.current_account_code()
        OR grantee_account_code = mesh.current_account_code()
    );
DROP POLICY IF EXISTS mesh_attachment_acl_admin ON mesh.attachment_acl;
CREATE POLICY mesh_attachment_acl_admin ON mesh.attachment_acl
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_attachment_folder_read ON mesh.attachment_folder;
CREATE POLICY mesh_attachment_folder_read ON mesh.attachment_folder
    FOR SELECT USING (mesh.is_mesh_admin() OR account_code = mesh.current_account_code());
DROP POLICY IF EXISTS mesh_attachment_folder_admin ON mesh.attachment_folder;
CREATE POLICY mesh_attachment_folder_admin ON mesh.attachment_folder
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_attachment_comment_read ON mesh.attachment_comment;
CREATE POLICY mesh_attachment_comment_read ON mesh.attachment_comment
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code = mesh.current_account_code()
        OR EXISTS (
            SELECT 1
            FROM mesh.attachment_acl acl
            WHERE acl.attachment_id = attachment_comment.attachment_id
              AND acl.is_granted = true
              AND acl.permission IN ('read', 'download', 'share')
              AND (acl.expires_at IS NULL OR acl.expires_at > now())
              AND acl.grantee_account_code = mesh.current_account_code()
        )
    );
DROP POLICY IF EXISTS mesh_attachment_comment_admin ON mesh.attachment_comment;
CREATE POLICY mesh_attachment_comment_admin ON mesh.attachment_comment
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_comment_read ON mesh.comment;
CREATE POLICY mesh_comment_read ON mesh.comment
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code = mesh.current_account_code()
        OR (
            context_type = 'chat_message'
            AND entity_type = 'conversation'
            AND entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            AND EXISTS (
                SELECT 1
                FROM mesh.conversation_participant cp
                WHERE cp.conversation_id = entity_id::uuid
                  AND cp.participant_account_code = mesh.current_account_code()
                  AND cp.left_at IS NULL
            )
        )
    );
DROP POLICY IF EXISTS mesh_comment_admin ON mesh.comment;
CREATE POLICY mesh_comment_admin ON mesh.comment
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_comment_draft_read ON mesh.comment_draft;
CREATE POLICY mesh_comment_draft_read ON mesh.comment_draft
    FOR SELECT USING (mesh.is_mesh_admin() OR account_code = mesh.current_account_code());
DROP POLICY IF EXISTS mesh_comment_draft_admin ON mesh.comment_draft;
CREATE POLICY mesh_comment_draft_admin ON mesh.comment_draft
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_comment_mention_read ON mesh.comment_mention;
CREATE POLICY mesh_comment_mention_read ON mesh.comment_mention
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code = mesh.current_account_code()
        OR mentioned_account_code = mesh.current_account_code()
    );
DROP POLICY IF EXISTS mesh_comment_mention_admin ON mesh.comment_mention;
CREATE POLICY mesh_comment_mention_admin ON mesh.comment_mention
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_comment_reaction_read ON mesh.comment_reaction;
CREATE POLICY mesh_comment_reaction_read ON mesh.comment_reaction
    FOR SELECT USING (mesh.is_mesh_admin() OR account_code = mesh.current_account_code());
DROP POLICY IF EXISTS mesh_comment_reaction_admin ON mesh.comment_reaction;
CREATE POLICY mesh_comment_reaction_admin ON mesh.comment_reaction
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_comment_feed_cursor_read ON mesh.comment_feed_cursor;
CREATE POLICY mesh_comment_feed_cursor_read ON mesh.comment_feed_cursor
    FOR SELECT USING (mesh.is_mesh_admin() OR account_code = mesh.current_account_code());
DROP POLICY IF EXISTS mesh_comment_feed_cursor_admin ON mesh.comment_feed_cursor;
CREATE POLICY mesh_comment_feed_cursor_admin ON mesh.comment_feed_cursor
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_conversation_read ON mesh.conversation;
CREATE POLICY mesh_conversation_read ON mesh.conversation
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR owner_account_code = mesh.current_account_code()
        OR EXISTS (
            SELECT 1
            FROM mesh.conversation_participant cp
            WHERE cp.conversation_id = conversation.id
              AND cp.participant_account_code = mesh.current_account_code()
              AND cp.left_at IS NULL
        )
    );
DROP POLICY IF EXISTS mesh_conversation_admin ON mesh.conversation;
CREATE POLICY mesh_conversation_admin ON mesh.conversation
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_conversation_participant_read ON mesh.conversation_participant;
CREATE POLICY mesh_conversation_participant_read ON mesh.conversation_participant
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR participant_account_code = mesh.current_account_code()
    );
DROP POLICY IF EXISTS mesh_conversation_participant_admin ON mesh.conversation_participant;
CREATE POLICY mesh_conversation_participant_admin ON mesh.conversation_participant
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_content_item_read ON mesh.content_item;
CREATE POLICY mesh_content_item_read ON mesh.content_item
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code = mesh.current_account_code()
        OR EXISTS (
            SELECT 1
            FROM mesh.content_item_access_grant grant_row
            WHERE grant_row.content_item_id = content_item.id
              AND grant_row.access_level IN ('read', 'write', 'publish', 'admin')
              AND (grant_row.expires_at IS NULL OR grant_row.expires_at > now())
              AND (
                  grant_row.subject_type = 'public'
                  OR grant_row.subject_account_code = mesh.current_account_code()
              )
        )
    );
DROP POLICY IF EXISTS mesh_content_item_admin ON mesh.content_item;
CREATE POLICY mesh_content_item_admin ON mesh.content_item
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_content_item_link_read ON mesh.content_item_link;
CREATE POLICY mesh_content_item_link_read ON mesh.content_item_link
    FOR SELECT USING (mesh.is_mesh_admin() OR account_code = mesh.current_account_code());
DROP POLICY IF EXISTS mesh_content_item_link_admin ON mesh.content_item_link;
CREATE POLICY mesh_content_item_link_admin ON mesh.content_item_link
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_content_item_access_grant_read ON mesh.content_item_access_grant;
CREATE POLICY mesh_content_item_access_grant_read ON mesh.content_item_access_grant
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code = mesh.current_account_code()
        OR subject_type = 'public'
        OR subject_account_code = mesh.current_account_code()
    );
DROP POLICY IF EXISTS mesh_content_item_access_grant_admin ON mesh.content_item_access_grant;
CREATE POLICY mesh_content_item_access_grant_admin ON mesh.content_item_access_grant
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

-- Utility tables.
DROP POLICY IF EXISTS mesh_multipart_upload_read ON mesh.multipart_upload;
CREATE POLICY mesh_multipart_upload_read ON mesh.multipart_upload
    FOR SELECT USING (mesh.is_mesh_admin() OR account_code = mesh.current_account_code());
DROP POLICY IF EXISTS mesh_multipart_upload_admin ON mesh.multipart_upload;
CREATE POLICY mesh_multipart_upload_admin ON mesh.multipart_upload
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_holiday_calendar_read ON mesh.holiday_calendar;
CREATE POLICY mesh_holiday_calendar_read ON mesh.holiday_calendar
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code IS NULL
        OR account_code = mesh.current_account_code()
    );
DROP POLICY IF EXISTS mesh_holiday_calendar_admin ON mesh.holiday_calendar;
CREATE POLICY mesh_holiday_calendar_admin ON mesh.holiday_calendar
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_holiday_calendar_day_read ON mesh.holiday_calendar_day;
CREATE POLICY mesh_holiday_calendar_day_read ON mesh.holiday_calendar_day
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR EXISTS (
            SELECT 1
            FROM mesh.holiday_calendar hc
            WHERE hc.id = holiday_calendar_day.holiday_calendar_id
              AND (
                  hc.account_code IS NULL
                  OR hc.account_code = mesh.current_account_code()
              )
        )
    );
DROP POLICY IF EXISTS mesh_holiday_calendar_day_admin ON mesh.holiday_calendar_day;
CREATE POLICY mesh_holiday_calendar_day_admin ON mesh.holiday_calendar_day
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

-- principal_ui_profile and principal_ui_preference dropped — master.* owns UI prefs for all planes.

DROP POLICY IF EXISTS mesh_principal_notification_pref_read ON mesh.principal_notification_preference;
CREATE POLICY mesh_principal_notification_pref_read ON mesh.principal_notification_preference
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR (
            account_code = mesh.current_account_code()
            AND EXISTS (
                SELECT 1
                FROM mesh.account_grant ag
                JOIN mesh.network_account na ON na.id = ag.account_id
                JOIN mesh.principal_identity_binding pib ON pib.principal_id = ag.principal_id
                WHERE na.account_code = principal_notification_preference.account_code
                  AND ag.principal_id = principal_notification_preference.principal_id
                  AND pib.subject_id = mesh.current_subject_id()
                  AND ag.status = 'active'
            )
        )
    );
DROP POLICY IF EXISTS mesh_principal_notification_pref_admin ON mesh.principal_notification_preference;
CREATE POLICY mesh_principal_notification_pref_admin ON mesh.principal_notification_preference
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_saved_view_read ON mesh.saved_view;
CREATE POLICY mesh_saved_view_read ON mesh.saved_view
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR (
            account_code = mesh.current_account_code()
            AND (
                scope IN ('shared', 'system')
                OR EXISTS (
                    SELECT 1
                    FROM mesh.account_grant ag
                    JOIN mesh.network_account na ON na.id = ag.account_id
                    JOIN mesh.principal_identity_binding pib ON pib.principal_id = ag.principal_id
                    WHERE na.account_code = saved_view.account_code
                      AND ag.principal_id = saved_view.owner_principal_id
                      AND pib.subject_id = mesh.current_subject_id()
                      AND ag.status = 'active'
                )
            )
        )
    );
DROP POLICY IF EXISTS mesh_saved_view_admin ON mesh.saved_view;
CREATE POLICY mesh_saved_view_admin ON mesh.saved_view
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

-- Commerce/catalog/logistics tables.
DROP POLICY IF EXISTS mesh_supplier_service_coverage_read ON mesh.supplier_service_coverage;
CREATE POLICY mesh_supplier_service_coverage_read ON mesh.supplier_service_coverage
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code = mesh.current_account_code()
        OR EXISTS (
            SELECT 1
            FROM mesh.network_relationship nc
            WHERE nc.status = 'active'
              AND nc.supplier_account_code = supplier_service_coverage.account_code
              AND nc.buyer_account_code = mesh.current_account_code()
        )
    );
DROP POLICY IF EXISTS mesh_supplier_service_coverage_admin ON mesh.supplier_service_coverage;
CREATE POLICY mesh_supplier_service_coverage_admin ON mesh.supplier_service_coverage
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_supplier_commodity_capability_read ON mesh.supplier_commodity_capability;
CREATE POLICY mesh_supplier_commodity_capability_read ON mesh.supplier_commodity_capability
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code = mesh.current_account_code()
        OR EXISTS (
            SELECT 1
            FROM mesh.network_relationship nc
            WHERE nc.status = 'active'
              AND nc.supplier_account_code = supplier_commodity_capability.account_code
              AND nc.buyer_account_code = mesh.current_account_code()
        )
    );
DROP POLICY IF EXISTS mesh_supplier_commodity_capability_admin ON mesh.supplier_commodity_capability;
CREATE POLICY mesh_supplier_commodity_capability_admin ON mesh.supplier_commodity_capability
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_supplier_profile_verification_read ON mesh.supplier_profile_verification;
CREATE POLICY mesh_supplier_profile_verification_read ON mesh.supplier_profile_verification
    FOR SELECT USING (mesh.is_mesh_admin() OR account_code = mesh.current_account_code());
DROP POLICY IF EXISTS mesh_supplier_profile_verification_admin ON mesh.supplier_profile_verification;
CREATE POLICY mesh_supplier_profile_verification_admin ON mesh.supplier_profile_verification
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_catalog_read ON mesh.catalog;
CREATE POLICY mesh_catalog_read ON mesh.catalog
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code = mesh.current_account_code()
        OR (status = 'published' AND visibility = 'open')
        OR (
            status = 'published'
            AND visibility = 'connected'
            AND EXISTS (
                SELECT 1
                FROM mesh.network_relationship nc
                WHERE nc.status = 'active'
                  AND nc.supplier_account_code = catalog.account_code
                  AND nc.buyer_account_code = mesh.current_account_code()
            )
        )
    );
DROP POLICY IF EXISTS mesh_catalog_admin ON mesh.catalog;
CREATE POLICY mesh_catalog_admin ON mesh.catalog
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_catalog_item_read ON mesh.catalog_item;
CREATE POLICY mesh_catalog_item_read ON mesh.catalog_item
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code = mesh.current_account_code()
        OR EXISTS (
            SELECT 1
            FROM mesh.catalog c
            WHERE c.id = catalog_item.catalog_id
              AND c.status = 'published'
              AND (
                  c.visibility = 'open'
                  OR (
                      c.visibility = 'connected'
                      AND EXISTS (
                          SELECT 1
                          FROM mesh.network_relationship nc
                          WHERE nc.status = 'active'
                            AND nc.supplier_account_code = c.account_code
                            AND nc.buyer_account_code = mesh.current_account_code()
                      )
                  )
              )
        )
    );
DROP POLICY IF EXISTS mesh_catalog_item_admin ON mesh.catalog_item;
CREATE POLICY mesh_catalog_item_admin ON mesh.catalog_item
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_catalog_item_classification_read ON mesh.catalog_item_classification;
CREATE POLICY mesh_catalog_item_classification_read ON mesh.catalog_item_classification
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code = mesh.current_account_code()
        OR EXISTS (
            SELECT 1
            FROM mesh.catalog_item ci
            JOIN mesh.catalog c ON c.id = ci.catalog_id
            WHERE ci.id = catalog_item_classification.catalog_item_id
              AND c.status = 'published'
              AND (
                  c.visibility = 'open'
                  OR (
                      c.visibility = 'connected'
                      AND EXISTS (
                          SELECT 1
                          FROM mesh.network_relationship nc
                          WHERE nc.status = 'active'
                            AND nc.supplier_account_code = c.account_code
                            AND nc.buyer_account_code = mesh.current_account_code()
                      )
                  )
              )
        )
    );
DROP POLICY IF EXISTS mesh_catalog_item_classification_admin ON mesh.catalog_item_classification;
CREATE POLICY mesh_catalog_item_classification_admin ON mesh.catalog_item_classification
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_catalog_item_uom_read ON mesh.catalog_item_uom;
CREATE POLICY mesh_catalog_item_uom_read ON mesh.catalog_item_uom
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code = mesh.current_account_code()
        OR EXISTS (
            SELECT 1
            FROM mesh.catalog_item ci
            JOIN mesh.catalog c ON c.id = ci.catalog_id
            WHERE ci.id = catalog_item_uom.catalog_item_id
              AND c.status = 'published'
              AND (
                  c.visibility = 'open'
                  OR (
                      c.visibility = 'connected'
                      AND EXISTS (
                          SELECT 1
                          FROM mesh.network_relationship nc
                          WHERE nc.status = 'active'
                            AND nc.supplier_account_code = c.account_code
                            AND nc.buyer_account_code = mesh.current_account_code()
                      )
                  )
              )
        )
    );
DROP POLICY IF EXISTS mesh_catalog_item_uom_admin ON mesh.catalog_item_uom;
CREATE POLICY mesh_catalog_item_uom_admin ON mesh.catalog_item_uom
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_catalog_price_read ON mesh.catalog_price;
CREATE POLICY mesh_catalog_price_read ON mesh.catalog_price
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code = mesh.current_account_code()
        OR (
            connection_id IS NOT NULL
            AND EXISTS (
                SELECT 1
                FROM mesh.network_relationship nc
                WHERE nc.id = catalog_price.connection_id
                  AND nc.status = 'active'
                  AND nc.supplier_account_code = catalog_price.account_code
                  AND (
                      nc.buyer_account_code = mesh.current_account_code()
                      OR nc.supplier_account_code = mesh.current_account_code()
                  )
            )
        )
        OR (
            connection_id IS NULL
            AND EXISTS (
                SELECT 1
                FROM mesh.catalog_item ci
                JOIN mesh.catalog c ON c.id = ci.catalog_id
                WHERE ci.id = catalog_price.catalog_item_id
                  AND c.status = 'published'
                  AND (
                      c.visibility = 'open'
                      OR (
                          c.visibility = 'connected'
                          AND EXISTS (
                              SELECT 1
                              FROM mesh.network_relationship nc
                              WHERE nc.status = 'active'
                                AND nc.supplier_account_code = c.account_code
                                AND nc.buyer_account_code = mesh.current_account_code()
                          )
                      )
                  )
            )
        )
    );
DROP POLICY IF EXISTS mesh_catalog_price_admin ON mesh.catalog_price;
CREATE POLICY mesh_catalog_price_admin ON mesh.catalog_price
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_catalog_availability_read ON mesh.catalog_availability;
CREATE POLICY mesh_catalog_availability_read ON mesh.catalog_availability
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code = mesh.current_account_code()
        OR EXISTS (
            SELECT 1
            FROM mesh.catalog_item ci
            JOIN mesh.catalog c ON c.id = ci.catalog_id
            WHERE ci.id = catalog_availability.catalog_item_id
              AND c.status = 'published'
              AND (
                  c.visibility = 'open'
                  OR (
                      c.visibility = 'connected'
                      AND EXISTS (
                          SELECT 1
                          FROM mesh.network_relationship nc
                          WHERE nc.status = 'active'
                            AND nc.supplier_account_code = c.account_code
                            AND nc.buyer_account_code = mesh.current_account_code()
                      )
                  )
              )
        )
    );
DROP POLICY IF EXISTS mesh_catalog_availability_admin ON mesh.catalog_availability;
CREATE POLICY mesh_catalog_availability_admin ON mesh.catalog_availability
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_carrier_read ON mesh.carrier;
CREATE POLICY mesh_carrier_read ON mesh.carrier
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code IS NULL
        OR account_code = mesh.current_account_code()
        OR EXISTS (
            SELECT 1
            FROM mesh.network_relationship nc
            WHERE nc.status = 'active'
              AND nc.supplier_account_code = carrier.account_code
              AND nc.buyer_account_code = mesh.current_account_code()
        )
    );
DROP POLICY IF EXISTS mesh_carrier_admin ON mesh.carrier;
CREATE POLICY mesh_carrier_admin ON mesh.carrier
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_logistics_zone_read ON mesh.logistics_zone;
CREATE POLICY mesh_logistics_zone_read ON mesh.logistics_zone
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code = mesh.current_account_code()
        OR EXISTS (
            SELECT 1
            FROM mesh.network_relationship nc
            WHERE nc.status = 'active'
              AND nc.supplier_account_code = logistics_zone.account_code
              AND nc.buyer_account_code = mesh.current_account_code()
        )
    );
DROP POLICY IF EXISTS mesh_logistics_zone_admin ON mesh.logistics_zone;
CREATE POLICY mesh_logistics_zone_admin ON mesh.logistics_zone
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_logistics_zone_member_read ON mesh.logistics_zone_member;
CREATE POLICY mesh_logistics_zone_member_read ON mesh.logistics_zone_member
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code = mesh.current_account_code()
        OR EXISTS (
            SELECT 1
            FROM mesh.network_relationship nc
            WHERE nc.status = 'active'
              AND nc.supplier_account_code = logistics_zone_member.account_code
              AND nc.buyer_account_code = mesh.current_account_code()
        )
    );
DROP POLICY IF EXISTS mesh_logistics_zone_member_admin ON mesh.logistics_zone_member;
CREATE POLICY mesh_logistics_zone_member_admin ON mesh.logistics_zone_member
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_logistics_rate_read ON mesh.logistics_rate;
CREATE POLICY mesh_logistics_rate_read ON mesh.logistics_rate
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code = mesh.current_account_code()
        OR EXISTS (
            SELECT 1
            FROM mesh.network_relationship nc
            WHERE nc.status = 'active'
              AND nc.supplier_account_code = logistics_rate.account_code
              AND nc.buyer_account_code = mesh.current_account_code()
        )
    );
DROP POLICY IF EXISTS mesh_logistics_rate_admin ON mesh.logistics_rate;
CREATE POLICY mesh_logistics_rate_admin ON mesh.logistics_rate
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_logistics_rate_break_read ON mesh.logistics_rate_break;
CREATE POLICY mesh_logistics_rate_break_read ON mesh.logistics_rate_break
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code = mesh.current_account_code()
        OR EXISTS (
            SELECT 1
            FROM mesh.network_relationship nc
            WHERE nc.status = 'active'
              AND nc.supplier_account_code = logistics_rate_break.account_code
              AND nc.buyer_account_code = mesh.current_account_code()
        )
    );
DROP POLICY IF EXISTS mesh_logistics_rate_break_admin ON mesh.logistics_rate_break;
CREATE POLICY mesh_logistics_rate_break_admin ON mesh.logistics_rate_break
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

-- Mesh IAM is admin/subject scoped.
DROP POLICY IF EXISTS mesh_principal_read ON mesh.principal;
CREATE POLICY mesh_principal_read ON mesh.principal
    FOR SELECT USING (mesh.is_mesh_admin());
DROP POLICY IF EXISTS mesh_principal_admin ON mesh.principal;
CREATE POLICY mesh_principal_admin ON mesh.principal
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_pib_read ON mesh.principal_identity_binding;
CREATE POLICY mesh_pib_read ON mesh.principal_identity_binding
    FOR SELECT USING (mesh.is_mesh_admin() OR subject_id = mesh.current_subject_id());
DROP POLICY IF EXISTS mesh_pib_admin ON mesh.principal_identity_binding;
CREATE POLICY mesh_pib_admin ON mesh.principal_identity_binding
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());


-- Invitation/request/acceptance.
DROP POLICY IF EXISTS mesh_network_invitation_read ON mesh.network_invitation;
CREATE POLICY mesh_network_invitation_read ON mesh.network_invitation
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR inviter_account_code = mesh.current_account_code()
        OR invitee_account_code = mesh.current_account_code()
    );
DROP POLICY IF EXISTS mesh_network_invitation_admin ON mesh.network_invitation;
CREATE POLICY mesh_network_invitation_admin ON mesh.network_invitation
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_connection_request_read ON mesh.connection_request;
CREATE POLICY mesh_connection_request_read ON mesh.connection_request
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR buyer_account_code = mesh.current_account_code()
        OR supplier_account_code = mesh.current_account_code()
    );
DROP POLICY IF EXISTS mesh_connection_request_admin ON mesh.connection_request;
CREATE POLICY mesh_connection_request_admin ON mesh.connection_request
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_connection_acceptance_read ON mesh.connection_acceptance;
CREATE POLICY mesh_connection_acceptance_read ON mesh.connection_acceptance
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR accepted_by_account_code = mesh.current_account_code()
        OR EXISTS (
            SELECT 1 FROM mesh.network_relationship nc
            WHERE nc.id = connection_acceptance.connection_id
              AND (
                  nc.buyer_account_code = mesh.current_account_code()
                  OR nc.supplier_account_code = mesh.current_account_code()
              )
        )
    );
DROP POLICY IF EXISTS mesh_connection_acceptance_admin ON mesh.connection_acceptance;
CREATE POLICY mesh_connection_acceptance_admin ON mesh.connection_acceptance
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

-- Worker/internal tables.
DROP POLICY IF EXISTS mesh_outbox_event_admin ON mesh.outbox_event;
CREATE POLICY mesh_outbox_event_admin ON mesh.outbox_event
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_network_event_admin ON mesh.network_event;
CREATE POLICY mesh_network_event_admin ON mesh.network_event
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_sync_checkpoint_admin ON mesh.sync_checkpoint;
CREATE POLICY mesh_sync_checkpoint_admin ON mesh.sync_checkpoint
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_external_reference_admin ON mesh.external_reference;
CREATE POLICY mesh_external_reference_admin ON mesh.external_reference
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_audit_event_admin ON mesh.audit_event;
CREATE POLICY mesh_audit_event_admin ON mesh.audit_event
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_activity_log_admin ON mesh.activity_log;
CREATE POLICY mesh_activity_log_admin ON mesh.activity_log
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

-- Payload/acknowledgement reads follow envelope visibility.
DROP POLICY IF EXISTS mesh_document_payload_read ON mesh.document_payload;
CREATE POLICY mesh_document_payload_read ON mesh.document_payload
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR EXISTS (
            SELECT 1
            FROM mesh.document_envelope de
            WHERE de.id = document_payload.envelope_id
              AND (
                  de.sender_account_code = mesh.current_account_code()
                  OR de.receiver_account_code = mesh.current_account_code()
              )
        )
    );
DROP POLICY IF EXISTS mesh_document_payload_admin ON mesh.document_payload;
CREATE POLICY mesh_document_payload_admin ON mesh.document_payload
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_document_ack_read ON mesh.document_acknowledgement;
CREATE POLICY mesh_document_ack_read ON mesh.document_acknowledgement
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR EXISTS (
            SELECT 1
            FROM mesh.document_envelope de
            WHERE de.id = document_acknowledgement.envelope_id
              AND (
                  de.sender_account_code = mesh.current_account_code()
                  OR de.receiver_account_code = mesh.current_account_code()
              )
        )
    );
DROP POLICY IF EXISTS mesh_document_ack_admin ON mesh.document_acknowledgement;
CREATE POLICY mesh_document_ack_admin ON mesh.document_acknowledgement
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());
