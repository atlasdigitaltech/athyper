CREATE INDEX network_account_tenant_role_status_idx
    ON mesh.network_account (tenant_id, network_role, status, account_code);
CREATE INDEX network_account_identifier_account_idx
    ON mesh.network_account_identifier (tenant_id, network_account_id, status);
CREATE UNIQUE INDEX network_account_identifier_primary_uq
    ON mesh.network_account_identifier (tenant_id, network_account_id, scheme)
    WHERE is_primary AND status = 'active';
CREATE INDEX network_account_reference_account_idx
    ON mesh.network_account_reference (tenant_id, network_account_id, status);
CREATE INDEX network_relationship_buyer_idx
    ON mesh.network_relationship (buyer_tenant_id, buyer_account_id, status);
CREATE INDEX network_relationship_supplier_idx
    ON mesh.network_relationship (supplier_tenant_id, supplier_account_id, status);

CREATE INDEX catalog_owner_status_idx
    ON mesh.catalog (
        tenant_id,
        owner_account_id,
        status,
        valid_from,
        valid_until
    );
CREATE INDEX catalog_visibility_idx
    ON mesh.catalog (visibility, status, valid_from, valid_until);

CREATE INDEX catalog_item_catalog_status_idx
    ON mesh.catalog_item (tenant_id, owner_account_id, catalog_id, status, code);
CREATE INDEX catalog_item_uom_idx
    ON mesh.catalog_item (base_uom_code);
CREATE INDEX catalog_item_manufacturer_idx
    ON mesh.catalog_item (
        tenant_id,
        manufacturer_name,
        manufacturer_part_number
    )
    WHERE manufacturer_name IS NOT NULL
      AND manufacturer_part_number IS NOT NULL;

CREATE INDEX catalog_item_identifier_item_idx
    ON mesh.catalog_item_identifier (
        tenant_id,
        owner_account_id,
        catalog_item_id,
        status
    );
CREATE UNIQUE INDEX catalog_item_identifier_primary_uq
    ON mesh.catalog_item_identifier (
        tenant_id,
        owner_account_id,
        catalog_item_id,
        identifier_scheme
    )
    WHERE is_primary AND status = 'active';

CREATE INDEX catalog_item_classification_item_idx
    ON mesh.catalog_item_classification (
        tenant_id,
        owner_account_id,
        catalog_item_id,
        status
    );
CREATE INDEX catalog_item_classification_code_idx
    ON mesh.catalog_item_classification (commodity_code_id, status);
CREATE UNIQUE INDEX catalog_item_classification_primary_uq
    ON mesh.catalog_item_classification (tenant_id, catalog_item_id)
    WHERE is_primary AND status = 'active';

CREATE INDEX catalog_item_uom_item_idx
    ON mesh.catalog_item_uom (
        tenant_id,
        owner_account_id,
        catalog_item_id,
        status
    );
CREATE UNIQUE INDEX catalog_item_uom_default_uq
    ON mesh.catalog_item_uom (tenant_id, catalog_item_id)
    WHERE is_default_order_uom AND status = 'active';
CREATE INDEX catalog_item_uom_code_idx
    ON mesh.catalog_item_uom (order_uom_code);

CREATE INDEX catalog_audience_catalog_idx
    ON mesh.catalog_audience (
        supplier_tenant_id,
        supplier_account_id,
        catalog_id,
        status
    );
CREATE INDEX catalog_audience_buyer_idx
    ON mesh.catalog_audience (
        buyer_tenant_id,
        buyer_account_id,
        status,
        valid_from,
        valid_until
    );
CREATE INDEX catalog_audience_relationship_idx
    ON mesh.catalog_audience (
        buyer_tenant_id,
        buyer_account_id,
        supplier_tenant_id,
        supplier_account_id,
        network_relationship_id
    );

CREATE INDEX catalog_price_item_idx
    ON mesh.catalog_price (
        tenant_id,
        owner_account_id,
        catalog_item_id,
        status,
        effective_from,
        effective_until
    );
CREATE INDEX catalog_price_item_uom_idx
    ON mesh.catalog_price (
        tenant_id,
        owner_account_id,
        catalog_item_uom_id
    )
    WHERE catalog_item_uom_id IS NOT NULL;
CREATE INDEX catalog_price_relationship_idx
    ON mesh.catalog_price (
        tenant_id,
        owner_account_id,
        network_relationship_id,
        status
    )
    WHERE network_relationship_id IS NOT NULL;
CREATE INDEX catalog_price_currency_idx
    ON mesh.catalog_price (currency_code);

CREATE INDEX catalog_availability_item_idx
    ON mesh.catalog_availability (
        tenant_id,
        owner_account_id,
        catalog_item_id,
        status
    );
CREATE INDEX catalog_availability_region_idx
    ON mesh.catalog_availability (country_code, state_region_code);

CREATE INDEX document_envelope_relationship_idx
    ON mesh.document_envelope (network_relationship_id, received_at DESC);

CREATE INDEX document_envelope_receiver_queue_idx
    ON mesh.document_envelope (
        receiver_tenant_id, receiver_account_id, status, received_at
    );

CREATE INDEX document_envelope_business_key_idx
    ON mesh.document_envelope (document_type_id, business_key)
    WHERE business_key IS NOT NULL;

CREATE INDEX document_envelope_entity_version_idx
    ON mesh.document_envelope (entity_id, entity_version_id);

CREATE INDEX document_envelope_created_by_idx
    ON mesh.document_envelope (sender_tenant_id, created_by);

CREATE UNIQUE INDEX document_payload_primary_uq
    ON mesh.document_payload (envelope_id)
    WHERE payload_role = 'primary' AND status <> 'deleted';

CREATE INDEX document_payload_scan_queue_idx
    ON mesh.document_payload (scan_status, created_at)
    WHERE status = 'active';

CREATE INDEX document_payload_created_by_idx
    ON mesh.document_payload (created_by_tenant_id, created_by);

CREATE INDEX document_event_envelope_time_idx
    ON mesh.document_event (envelope_id, occurred_at, id);
CREATE INDEX document_business_status_projection_envelope_idx
    ON mesh.document_business_status_projection (source_envelope_id, lifecycle_version DESC);
CREATE INDEX document_business_status_projection_relationship_idx
    ON mesh.document_business_status_projection (network_relationship_id, resource_kind, business_status, updated_at DESC);

CREATE INDEX document_event_actor_account_idx
    ON mesh.document_event (actor_tenant_id, actor_account_id)
    WHERE actor_account_id IS NOT NULL;

CREATE INDEX document_event_actor_principal_idx
    ON mesh.document_event (actor_tenant_id, actor_principal_id)
    WHERE actor_principal_id IS NOT NULL;

CREATE INDEX document_event_created_by_idx
    ON mesh.document_event (created_by_tenant_id, created_by);

CREATE UNIQUE INDEX document_event_idempotency_uq
    ON mesh.document_event (envelope_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX document_acknowledgement_envelope_time_idx
    ON mesh.document_acknowledgement (envelope_id, acknowledged_at, id);

CREATE INDEX document_acknowledgement_responder_idx
    ON mesh.document_acknowledgement (
        responder_tenant_id, responder_account_id
    );

CREATE INDEX document_acknowledgement_responder_principal_idx
    ON mesh.document_acknowledgement (
        responder_tenant_id, responder_principal_id
    ) WHERE responder_principal_id IS NOT NULL;

CREATE INDEX document_acknowledgement_created_by_idx
    ON mesh.document_acknowledgement (responder_tenant_id, created_by);

CREATE INDEX network_account_profile_status_idx
    ON mesh.network_account_profile (tenant_id, status, network_account_id);

CREATE INDEX network_account_profile_publication_recipient_idx ON mesh.network_account_profile_publication(recipient_tenant_id,network_relationship_id,published_at DESC);
CREATE INDEX network_account_profile_publication_owner_idx ON mesh.network_account_profile_publication(owner_tenant_id,owner_account_id,published_at DESC);
CREATE INDEX network_account_profile_publication_event_latest_idx ON mesh.network_account_profile_publication_event(owner_tenant_id,publication_id,lifecycle_version DESC);

CREATE UNIQUE INDEX network_account_commodity_capability_current_uq
    ON mesh.network_account_commodity_capability
       (tenant_id, network_account_id, commodity_code_id, trade_role)
    WHERE effective_until IS NULL AND status = 'active';
CREATE INDEX network_account_commodity_capability_commodity_idx
    ON mesh.network_account_commodity_capability
       (commodity_code_id, trade_role, status);

CREATE UNIQUE INDEX network_account_industry_classification_current_uq
    ON mesh.network_account_industry_classification
       (tenant_id, network_account_id, industry_domain_code, industry_code_id)
    WHERE effective_until IS NULL AND status = 'active';
CREATE UNIQUE INDEX network_account_industry_classification_primary_uq
    ON mesh.network_account_industry_classification
       (tenant_id, network_account_id, industry_domain_code)
    WHERE is_primary AND effective_until IS NULL AND status = 'active';
CREATE INDEX network_account_industry_classification_code_idx
    ON mesh.network_account_industry_classification
       (industry_domain_code, industry_code_id, status);

CREATE UNIQUE INDEX network_account_tax_registration_current_uq
    ON mesh.network_account_tax_registration
       (tenant_id, network_account_id, country_code,
        registration_type_code, registration_number)
    WHERE status = 'active';
CREATE UNIQUE INDEX network_account_tax_registration_primary_uq
    ON mesh.network_account_tax_registration
       (tenant_id, network_account_id, country_code, registration_type_code)
    WHERE is_primary AND status = 'active';

CREATE INDEX mesh_bank_party_bic_idx
    ON mesh.bank_party (bic) WHERE bic IS NOT NULL;
CREATE UNIQUE INDEX mesh_bank_account_code_uq
    ON mesh.bank_account (tenant_id, network_account_id, code)
    WHERE code IS NOT NULL;
CREATE INDEX mesh_bank_account_owner_status_idx
    ON mesh.bank_account (tenant_id, network_account_id, status);
CREATE INDEX mesh_bank_account_fingerprint_idx
    ON mesh.bank_account (tenant_id, network_account_id, account_last4);
CREATE UNIQUE INDEX mesh_bank_account_link_current_uq
    ON mesh.bank_account_link
       (tenant_id, network_account_id, bank_account_id, purpose)
    WHERE effective_until IS NULL;
CREATE UNIQUE INDEX mesh_bank_account_link_primary_uq
    ON mesh.bank_account_link (tenant_id, network_account_id, purpose)
    WHERE is_primary AND effective_until IS NULL;
CREATE UNIQUE INDEX bank_account_disclosure_active_uq
    ON mesh.bank_account_disclosure
       (bank_account_id, network_relationship_id, recipient_account_id, purpose)
    WHERE status = 'active';
CREATE INDEX bank_account_disclosure_recipient_idx
    ON mesh.bank_account_disclosure
       (recipient_tenant_id, recipient_account_id, status, disclosed_at DESC);
CREATE UNIQUE INDEX bank_account_disclosure_idempotency_uq
    ON mesh.bank_account_disclosure(owner_tenant_id,idempotency_key);
CREATE INDEX bank_account_disclosure_event_recipient_idx
    ON mesh.bank_account_disclosure_event(recipient_tenant_id,recorded_at DESC);

CREATE UNIQUE INDEX mesh_certification_type_scope_code_uq
  ON mesh.certification_type
  (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), code);
CREATE INDEX mesh_certification_type_category_idx
  ON mesh.certification_type(category) WHERE category IS NOT NULL;
CREATE INDEX mesh_certification_type_tenant_idx
  ON mesh.certification_type(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX mesh_certification_owner_idx
  ON mesh.certification(tenant_id, owner_type, owner_id);
CREATE INDEX mesh_certification_type_idx
  ON mesh.certification(tenant_id, certification_type_id)
  WHERE certification_type_id IS NOT NULL;
CREATE INDEX mesh_certification_expiry_idx
  ON mesh.certification(tenant_id, effective_until)
  WHERE effective_until IS NOT NULL AND status = 'active';
CREATE UNIQUE INDEX network_account_live_canonical_purpose_uq ON mesh.network_account(canonical_party_id,account_purpose_code) WHERE canonical_party_id IS NOT NULL AND status<>'retired';


CREATE INDEX network_lifecycle_resource_idx ON mesh.network_lifecycle_event(resource_kind,resource_id,sequence_no DESC);
CREATE INDEX network_lifecycle_owner_idx ON mesh.network_lifecycle_event(owner_tenant_id,effective_at DESC);
CREATE INDEX network_lifecycle_counterparty_idx ON mesh.network_lifecycle_event(counterparty_tenant_id,effective_at DESC) WHERE counterparty_tenant_id IS NOT NULL;
