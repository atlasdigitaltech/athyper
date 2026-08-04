-- ============================================================================
-- mesh/04_indexes.sql
-- Mesh foundation indexes.
-- ============================================================================

CREATE INDEX IF NOT EXISTS mesh_network_account_provider_idx
    ON mesh.network_account (provider_code, account_code);
-- Profile indexes on network_account (participant/participant_profile merged in)
CREATE INDEX IF NOT EXISTS mesh_network_account_source_idx
    ON mesh.network_account (source_plane, source_ref)
    WHERE source_plane IS NOT NULL AND source_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS mesh_network_account_legal_name_idx
    ON mesh.network_account (legal_name)
    WHERE legal_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS mesh_network_account_profile_hash_idx
    ON mesh.network_account (account_code, profile_hash)
    WHERE profile_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS mesh_network_account_verification_idx
    ON mesh.network_account (verification_status, verified_at)
    WHERE verification_status IN ('pending', 'verified');
CREATE INDEX IF NOT EXISTS mesh_network_account_participant_type_idx
    ON mesh.network_account (participant_type, status);

CREATE INDEX IF NOT EXISTS mesh_network_document_type_active_idx
    ON mesh.network_document_type (code)
    WHERE status = 'active';

-- mesh_participant_source_idx, mesh_participant_profile_* removed — tables dropped.

CREATE INDEX IF NOT EXISTS mesh_network_account_identifier_account_idx
    ON mesh.network_account_identifier (account_code, scheme);

CREATE INDEX IF NOT EXISTS mesh_principal_identity_subject_idx
    ON mesh.principal_identity_binding (realm_key, provider_code, subject_id);

CREATE INDEX IF NOT EXISTS mesh_network_account_network_role_idx
    ON mesh.network_account (network_role, status);

CREATE INDEX IF NOT EXISTS mesh_network_invitation_inviter_idx
    ON mesh.network_invitation (inviter_account_code, status, created_at DESC);

CREATE INDEX IF NOT EXISTS mesh_network_invitation_invitee_idx
    ON mesh.network_invitation (invitee_account_code, status, created_at DESC)
    WHERE invitee_account_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS mesh_network_invitation_email_idx
    ON mesh.network_invitation (invitee_email, status, created_at DESC)
    WHERE invitee_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS mesh_network_invitation_expiry_idx
    ON mesh.network_invitation (token_expires_at)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS mesh_connection_request_buyer_idx
    ON mesh.connection_request (buyer_account_code, status, created_at DESC);

CREATE INDEX IF NOT EXISTS mesh_connection_request_supplier_idx
    ON mesh.connection_request (supplier_account_code, status, created_at DESC);

CREATE INDEX IF NOT EXISTS mesh_connection_acceptance_connection_idx
    ON mesh.connection_acceptance (connection_id)
    WHERE connection_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS mesh_outbox_event_pending_idx
    ON mesh.outbox_event (available_at, created_at)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS mesh_outbox_event_aggregate_idx
    ON mesh.outbox_event (aggregate_type, aggregate_id, created_at);

CREATE INDEX IF NOT EXISTS mesh_network_event_sequence_idx
    ON mesh.network_event (sequence_no);

CREATE INDEX IF NOT EXISTS mesh_network_event_aggregate_idx
    ON mesh.network_event (aggregate_type, aggregate_id, sequence_no);

CREATE INDEX IF NOT EXISTS mesh_network_event_account_idx
    ON mesh.network_event (account_code, sequence_no)
    WHERE account_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS mesh_network_event_tenant_idx
    ON mesh.network_event (tenant_code, sequence_no)
    WHERE tenant_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS mesh_sync_checkpoint_stream_idx
    ON mesh.sync_checkpoint (stream_name, updated_at DESC);

CREATE INDEX IF NOT EXISTS mesh_external_reference_source_idx
    ON mesh.external_reference (source_plane, source_schema, source_table, source_id);

CREATE INDEX IF NOT EXISTS mesh_external_reference_batch_idx
    ON mesh.external_reference (migration_batch_id, mesh_table);

CREATE INDEX IF NOT EXISTS mesh_document_payload_scan_idx
    ON mesh.document_payload (scan_status, created_at)
    WHERE scan_status IN ('pending', 'error');

CREATE INDEX IF NOT EXISTS mesh_document_ack_envelope_idx
    ON mesh.document_acknowledgement (envelope_id, acknowledged_at DESC);

CREATE INDEX IF NOT EXISTS mesh_audit_event_actor_idx
    ON mesh.audit_event (actor_account_code, occurred_at DESC)
    WHERE actor_account_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS mesh_activity_log_account_idx
    ON mesh.activity_log (account_code, occurred_at DESC)
    WHERE account_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mesh_bank_account_disclosure_active_uq
    ON mesh.bank_account_disclosure (bank_account_id, connection_id, disclosed_to_account_code, purpose)
    WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS mesh_bank_account_disclosure_to_idx
    ON mesh.bank_account_disclosure (disclosed_to_account_code, connection_id)
    WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS mesh_supplier_service_coverage_lookup_idx
    ON mesh.supplier_service_coverage (country_code, state_region_code, coverage_type, status);
CREATE INDEX IF NOT EXISTS mesh_supplier_service_coverage_account_idx
    ON mesh.supplier_service_coverage (account_code, status);

CREATE INDEX IF NOT EXISTS mesh_supplier_commodity_capability_lookup_idx
    ON mesh.supplier_commodity_capability (domain_code, commodity_code, capability_level, status);
CREATE INDEX IF NOT EXISTS mesh_supplier_commodity_capability_account_idx
    ON mesh.supplier_commodity_capability (account_code, status);

CREATE INDEX IF NOT EXISTS mesh_supplier_profile_verification_account_idx
    ON mesh.supplier_profile_verification (account_code, verification_type, created_at DESC);
CREATE INDEX IF NOT EXISTS mesh_supplier_profile_verification_validity_idx
    ON mesh.supplier_profile_verification (valid_until)
    WHERE outcome = 'verified' AND valid_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS mesh_catalog_account_status_idx
    ON mesh.catalog (account_code, status, visibility);
CREATE INDEX IF NOT EXISTS mesh_catalog_visibility_idx
    ON mesh.catalog (visibility, status, published_at DESC)
    WHERE status = 'published';

CREATE INDEX IF NOT EXISTS mesh_catalog_item_catalog_idx
    ON mesh.catalog_item (account_code, catalog_id, status);
CREATE INDEX IF NOT EXISTS mesh_catalog_item_base_uom_idx
    ON mesh.catalog_item (base_uom_code);

CREATE UNIQUE INDEX IF NOT EXISTS mesh_catalog_item_classification_primary_uq
    ON mesh.catalog_item_classification (account_code, catalog_item_id, domain_code)
    WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS mesh_catalog_item_classification_commodity_idx
    ON mesh.catalog_item_classification (domain_code, commodity_code);

CREATE INDEX IF NOT EXISTS mesh_catalog_item_uom_item_idx
    ON mesh.catalog_item_uom (account_code, catalog_item_id);

CREATE INDEX IF NOT EXISTS mesh_catalog_price_item_idx
    ON mesh.catalog_price (account_code, catalog_item_id, status, effective_from DESC);
CREATE INDEX IF NOT EXISTS mesh_catalog_price_connection_idx
    ON mesh.catalog_price (connection_id, status, effective_from DESC)
    WHERE connection_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mesh_catalog_price_currency_idx
    ON mesh.catalog_price (currency_code);

CREATE INDEX IF NOT EXISTS mesh_catalog_availability_country_idx
    ON mesh.catalog_availability (country_code, state_region_code, is_available);
CREATE INDEX IF NOT EXISTS mesh_catalog_availability_item_idx
    ON mesh.catalog_availability (account_code, catalog_item_id);

CREATE INDEX IF NOT EXISTS mesh_carrier_scope_idx
    ON mesh.carrier (account_code, carrier_type, status);
CREATE INDEX IF NOT EXISTS mesh_carrier_provider_idx
    ON mesh.carrier (provider_code)
    WHERE provider_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS mesh_logistics_zone_account_idx
    ON mesh.logistics_zone (account_code, zone_type, status);
CREATE INDEX IF NOT EXISTS mesh_logistics_zone_member_country_idx
    ON mesh.logistics_zone_member (country_code, state_region_code);

CREATE INDEX IF NOT EXISTS mesh_logistics_rate_lookup_idx
    ON mesh.logistics_rate (
        account_code, origin_zone_id, destination_zone_id, incoterm_code, status, effective_from DESC
    );
CREATE INDEX IF NOT EXISTS mesh_logistics_rate_carrier_idx
    ON mesh.logistics_rate (carrier_id, status)
    WHERE carrier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mesh_logistics_rate_currency_idx
    ON mesh.logistics_rate (currency_code);

CREATE INDEX IF NOT EXISTS mesh_logistics_rate_break_rate_idx
    ON mesh.logistics_rate_break (account_code, logistics_rate_id, break_from_qty);
