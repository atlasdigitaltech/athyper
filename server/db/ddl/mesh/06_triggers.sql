-- ============================================================================
-- mesh/06_triggers.sql
-- Mesh audit timestamp triggers.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_network_provider_updated_at ON mesh.network_provider;
CREATE TRIGGER trg_network_provider_updated_at
    BEFORE UPDATE ON mesh.network_provider
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_network_document_type_updated_at ON mesh.network_document_type;
CREATE TRIGGER trg_network_document_type_updated_at
    BEFORE UPDATE ON mesh.network_document_type
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_network_account_updated_at ON mesh.network_account;
CREATE TRIGGER trg_network_account_updated_at
    BEFORE UPDATE ON mesh.network_account
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

-- trg_participant_updated_at and trg_participant_profile_updated_at removed — tables dropped.

DROP TRIGGER IF EXISTS trg_address_updated_at ON mesh.address;
CREATE TRIGGER trg_address_updated_at
    BEFORE UPDATE ON mesh.address
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_address_link_updated_at ON mesh.address_link;
CREATE TRIGGER trg_address_link_updated_at
    BEFORE UPDATE ON mesh.address_link
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

-- trg_party_contact_person_updated_at removed — party_contact_person dropped.

DROP TRIGGER IF EXISTS trg_contact_link_updated_at ON mesh.contact_link;
CREATE TRIGGER trg_contact_link_updated_at
    BEFORE UPDATE ON mesh.contact_link
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_contact_email_updated_at ON mesh.contact_email;
CREATE TRIGGER trg_contact_email_updated_at
    BEFORE UPDATE ON mesh.contact_email
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_contact_phone_updated_at ON mesh.contact_phone;
CREATE TRIGGER trg_contact_phone_updated_at
    BEFORE UPDATE ON mesh.contact_phone
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

-- trg_party_tax_profile_updated_at removed — party_tax_profile dropped.

DROP TRIGGER IF EXISTS trg_bank_party_updated_at ON mesh.bank_party;
CREATE TRIGGER trg_bank_party_updated_at
    BEFORE UPDATE ON mesh.bank_party
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_bank_account_updated_at ON mesh.bank_account;
CREATE TRIGGER trg_bank_account_updated_at
    BEFORE UPDATE ON mesh.bank_account
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_bank_account_link_updated_at ON mesh.bank_account_link;
CREATE TRIGGER trg_bank_account_link_updated_at
    BEFORE UPDATE ON mesh.bank_account_link
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_bank_account_disclosure_updated_at ON mesh.bank_account_disclosure;
CREATE TRIGGER trg_bank_account_disclosure_updated_at
    BEFORE UPDATE ON mesh.bank_account_disclosure
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_certification_type_updated_at ON mesh.certification_type;
CREATE TRIGGER trg_certification_type_updated_at
    BEFORE UPDATE ON mesh.certification_type
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_certification_updated_at ON mesh.certification;
CREATE TRIGGER trg_certification_updated_at
    BEFORE UPDATE ON mesh.certification
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

-- Renamed from participant_external_reference → network_account_reference
DROP TRIGGER IF EXISTS trg_participant_external_reference_updated_at ON mesh.network_account_reference;
DROP TRIGGER IF EXISTS trg_network_account_reference_updated_at ON mesh.network_account_reference;
CREATE TRIGGER trg_network_account_reference_updated_at
    BEFORE UPDATE ON mesh.network_account_reference
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_attachment_updated_at ON mesh.attachment;
CREATE TRIGGER trg_attachment_updated_at
    BEFORE UPDATE ON mesh.attachment
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_attachment_folder_updated_at ON mesh.attachment_folder;
CREATE TRIGGER trg_attachment_folder_updated_at
    BEFORE UPDATE ON mesh.attachment_folder
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_comment_updated_at ON mesh.comment;
CREATE TRIGGER trg_comment_updated_at
    BEFORE UPDATE ON mesh.comment
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_comment_draft_updated_at ON mesh.comment_draft;
CREATE TRIGGER trg_comment_draft_updated_at
    BEFORE UPDATE ON mesh.comment_draft
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_comment_feed_cursor_updated_at ON mesh.comment_feed_cursor;
CREATE TRIGGER trg_comment_feed_cursor_updated_at
    BEFORE UPDATE ON mesh.comment_feed_cursor
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_attachment_comment_updated_at ON mesh.attachment_comment;
CREATE TRIGGER trg_attachment_comment_updated_at
    BEFORE UPDATE ON mesh.attachment_comment
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_conversation_updated_at ON mesh.conversation;
CREATE TRIGGER trg_conversation_updated_at
    BEFORE UPDATE ON mesh.conversation
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_conversation_participant_updated_at ON mesh.conversation_participant;
CREATE TRIGGER trg_conversation_participant_updated_at
    BEFORE UPDATE ON mesh.conversation_participant
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_content_item_updated_at ON mesh.content_item;
CREATE TRIGGER trg_content_item_updated_at
    BEFORE UPDATE ON mesh.content_item
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_multipart_upload_updated_at ON mesh.multipart_upload;
CREATE TRIGGER trg_multipart_upload_updated_at
    BEFORE UPDATE ON mesh.multipart_upload
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_holiday_calendar_updated_at ON mesh.holiday_calendar;
CREATE TRIGGER trg_holiday_calendar_updated_at
    BEFORE UPDATE ON mesh.holiday_calendar
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_holiday_calendar_day_updated_at ON mesh.holiday_calendar_day;
CREATE TRIGGER trg_holiday_calendar_day_updated_at
    BEFORE UPDATE ON mesh.holiday_calendar_day
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

-- trg_principal_ui_profile_updated_at and trg_principal_ui_preference_updated_at removed — tables dropped.

DROP TRIGGER IF EXISTS trg_principal_notification_pref_updated_at ON mesh.principal_notification_preference;
CREATE TRIGGER trg_principal_notification_pref_updated_at
    BEFORE UPDATE ON mesh.principal_notification_preference
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_saved_view_updated_at ON mesh.saved_view;
CREATE TRIGGER trg_saved_view_updated_at
    BEFORE UPDATE ON mesh.saved_view
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_principal_updated_at ON mesh.principal;
CREATE TRIGGER trg_principal_updated_at
    BEFORE UPDATE ON mesh.principal
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_principal_identity_binding_updated_at ON mesh.principal_identity_binding;
CREATE TRIGGER trg_principal_identity_binding_updated_at
    BEFORE UPDATE ON mesh.principal_identity_binding
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_network_invitation_updated_at ON mesh.network_invitation;
CREATE TRIGGER trg_network_invitation_updated_at
    BEFORE UPDATE ON mesh.network_invitation
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_connection_request_updated_at ON mesh.connection_request;
CREATE TRIGGER trg_connection_request_updated_at
    BEFORE UPDATE ON mesh.connection_request
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

-- Renamed from network_connection → network_relationship
DROP TRIGGER IF EXISTS trg_network_connection_updated_at ON mesh.network_relationship;
DROP TRIGGER IF EXISTS trg_network_relationship_updated_at ON mesh.network_relationship;
CREATE TRIGGER trg_network_relationship_updated_at
    BEFORE UPDATE ON mesh.network_relationship
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_outbox_event_updated_at ON mesh.outbox_event;
CREATE TRIGGER trg_outbox_event_updated_at
    BEFORE UPDATE ON mesh.outbox_event
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_sync_checkpoint_updated_at ON mesh.sync_checkpoint;
CREATE TRIGGER trg_sync_checkpoint_updated_at
    BEFORE UPDATE ON mesh.sync_checkpoint
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_document_payload_updated_at ON mesh.document_payload;
CREATE TRIGGER trg_document_payload_updated_at
    BEFORE UPDATE ON mesh.document_payload
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_supplier_service_coverage_updated_at ON mesh.supplier_service_coverage;
CREATE TRIGGER trg_supplier_service_coverage_updated_at
    BEFORE UPDATE ON mesh.supplier_service_coverage
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_supplier_commodity_capability_updated_at ON mesh.supplier_commodity_capability;
CREATE TRIGGER trg_supplier_commodity_capability_updated_at
    BEFORE UPDATE ON mesh.supplier_commodity_capability
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_supplier_profile_verification_updated_at ON mesh.supplier_profile_verification;
CREATE TRIGGER trg_supplier_profile_verification_updated_at
    BEFORE UPDATE ON mesh.supplier_profile_verification
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_catalog_updated_at ON mesh.catalog;
CREATE TRIGGER trg_catalog_updated_at
    BEFORE UPDATE ON mesh.catalog
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_catalog_item_updated_at ON mesh.catalog_item;
CREATE TRIGGER trg_catalog_item_updated_at
    BEFORE UPDATE ON mesh.catalog_item
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_catalog_item_classification_updated_at ON mesh.catalog_item_classification;
CREATE TRIGGER trg_catalog_item_classification_updated_at
    BEFORE UPDATE ON mesh.catalog_item_classification
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_catalog_item_uom_updated_at ON mesh.catalog_item_uom;
CREATE TRIGGER trg_catalog_item_uom_updated_at
    BEFORE UPDATE ON mesh.catalog_item_uom
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_catalog_price_updated_at ON mesh.catalog_price;
CREATE TRIGGER trg_catalog_price_updated_at
    BEFORE UPDATE ON mesh.catalog_price
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_catalog_availability_updated_at ON mesh.catalog_availability;
CREATE TRIGGER trg_catalog_availability_updated_at
    BEFORE UPDATE ON mesh.catalog_availability
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_carrier_updated_at ON mesh.carrier;
CREATE TRIGGER trg_carrier_updated_at
    BEFORE UPDATE ON mesh.carrier
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_logistics_zone_updated_at ON mesh.logistics_zone;
CREATE TRIGGER trg_logistics_zone_updated_at
    BEFORE UPDATE ON mesh.logistics_zone
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_logistics_zone_member_updated_at ON mesh.logistics_zone_member;
CREATE TRIGGER trg_logistics_zone_member_updated_at
    BEFORE UPDATE ON mesh.logistics_zone_member
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_logistics_rate_updated_at ON mesh.logistics_rate;
CREATE TRIGGER trg_logistics_rate_updated_at
    BEFORE UPDATE ON mesh.logistics_rate
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_logistics_rate_break_updated_at ON mesh.logistics_rate_break;
CREATE TRIGGER trg_logistics_rate_break_updated_at
    BEFORE UPDATE ON mesh.logistics_rate_break
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();
