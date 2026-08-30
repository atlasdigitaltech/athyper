ALTER TABLE mesh.network_account
    ADD CONSTRAINT network_account_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE mesh.network_account
    ADD CONSTRAINT network_account_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE mesh.network_account
    ADD CONSTRAINT network_account_country_fk
    FOREIGN KEY (country_code) REFERENCES shared.country (code) ON DELETE RESTRICT;
ALTER TABLE mesh.network_account
    ADD CONSTRAINT network_account_currency_fk
    FOREIGN KEY (default_currency) REFERENCES shared.currency (code) ON DELETE RESTRICT;

ALTER TABLE mesh.network_account_identifier
    ADD CONSTRAINT network_account_identifier_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE mesh.network_account_identifier
    ADD CONSTRAINT network_account_identifier_account_fk
    FOREIGN KEY (tenant_id, network_account_id)
    REFERENCES mesh.network_account (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE mesh.network_account_identifier
    ADD CONSTRAINT network_account_identifier_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.network_account_reference
    ADD CONSTRAINT network_account_reference_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE mesh.network_account_reference
    ADD CONSTRAINT network_account_reference_account_fk
    FOREIGN KEY (tenant_id, network_account_id)
    REFERENCES mesh.network_account (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE mesh.network_account_reference
    ADD CONSTRAINT network_account_reference_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.network_relationship
    ADD CONSTRAINT network_relationship_buyer_account_fk
    FOREIGN KEY (buyer_tenant_id, buyer_account_id)
    REFERENCES mesh.network_account (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE mesh.network_relationship
    ADD CONSTRAINT network_relationship_supplier_account_fk
    FOREIGN KEY (supplier_tenant_id, supplier_account_id)
    REFERENCES mesh.network_account (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE mesh.network_relationship
    ADD CONSTRAINT network_relationship_creator_tenant_fk
    FOREIGN KEY (created_by_tenant_id)
    REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE mesh.network_relationship
    ADD CONSTRAINT network_relationship_creator_principal_fk
    FOREIGN KEY (created_by_tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE mesh.network_relationship
    ADD CONSTRAINT network_relationship_coordinate_uq
    UNIQUE (buyer_account_id, supplier_account_id, relationship_kind);
ALTER TABLE mesh.network_relationship
    ADD CONSTRAINT network_relationship_supplier_id_uq
    UNIQUE (supplier_tenant_id, supplier_account_id, id);
ALTER TABLE mesh.network_relationship
    ADD CONSTRAINT network_relationship_participant_id_uq
    UNIQUE (
        buyer_tenant_id,
        buyer_account_id,
        supplier_tenant_id,
        supplier_account_id,
        id
    );

ALTER TABLE mesh.catalog
    ADD CONSTRAINT catalog_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE mesh.catalog
    ADD CONSTRAINT catalog_owner_account_fk
    FOREIGN KEY (tenant_id, owner_account_id)
    REFERENCES mesh.network_account (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE mesh.catalog
    ADD CONSTRAINT catalog_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE mesh.catalog
    ADD CONSTRAINT catalog_published_by_fk
    FOREIGN KEY (tenant_id, published_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.catalog_item
    ADD CONSTRAINT catalog_item_catalog_fk
    FOREIGN KEY (tenant_id, owner_account_id, catalog_id)
    REFERENCES mesh.catalog (tenant_id, owner_account_id, id) ON DELETE CASCADE;
ALTER TABLE mesh.catalog_item
    ADD CONSTRAINT catalog_item_base_uom_fk
    FOREIGN KEY (base_uom_code)
    REFERENCES shared.uom (code) ON DELETE RESTRICT;
ALTER TABLE mesh.catalog_item
    ADD CONSTRAINT catalog_item_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.catalog_item_identifier
    ADD CONSTRAINT catalog_item_identifier_item_fk
    FOREIGN KEY (tenant_id, owner_account_id, catalog_item_id)
    REFERENCES mesh.catalog_item (tenant_id, owner_account_id, id)
    ON DELETE CASCADE;
ALTER TABLE mesh.catalog_item_identifier
    ADD CONSTRAINT catalog_item_identifier_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.catalog_item_classification
    ADD CONSTRAINT catalog_item_classification_item_fk
    FOREIGN KEY (tenant_id, owner_account_id, catalog_item_id)
    REFERENCES mesh.catalog_item (tenant_id, owner_account_id, id)
    ON DELETE CASCADE;
ALTER TABLE mesh.catalog_item_classification
    ADD CONSTRAINT catalog_item_classification_commodity_fk
    FOREIGN KEY (commodity_code_id)
    REFERENCES shared.commodity_code (id) ON DELETE RESTRICT;
ALTER TABLE mesh.catalog_item_classification
    ADD CONSTRAINT catalog_item_classification_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.catalog_item_uom
    ADD CONSTRAINT catalog_item_uom_item_fk
    FOREIGN KEY (tenant_id, owner_account_id, catalog_item_id)
    REFERENCES mesh.catalog_item (tenant_id, owner_account_id, id)
    ON DELETE CASCADE;
ALTER TABLE mesh.catalog_item_uom
    ADD CONSTRAINT catalog_item_uom_uom_fk
    FOREIGN KEY (order_uom_code)
    REFERENCES shared.uom (code) ON DELETE RESTRICT;
ALTER TABLE mesh.catalog_item_uom
    ADD CONSTRAINT catalog_item_uom_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.catalog_audience
    ADD CONSTRAINT catalog_audience_catalog_fk
    FOREIGN KEY (supplier_tenant_id, supplier_account_id, catalog_id)
    REFERENCES mesh.catalog (tenant_id, owner_account_id, id)
    ON DELETE CASCADE;
ALTER TABLE mesh.catalog_audience
    ADD CONSTRAINT catalog_audience_buyer_account_fk
    FOREIGN KEY (buyer_tenant_id, buyer_account_id)
    REFERENCES mesh.network_account (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE mesh.catalog_audience
    ADD CONSTRAINT catalog_audience_relationship_fk
    FOREIGN KEY (
        buyer_tenant_id,
        buyer_account_id,
        supplier_tenant_id,
        supplier_account_id,
        network_relationship_id
    )
    REFERENCES mesh.network_relationship (
        buyer_tenant_id,
        buyer_account_id,
        supplier_tenant_id,
        supplier_account_id,
        id
    )
    ON DELETE RESTRICT;
ALTER TABLE mesh.catalog_audience
    ADD CONSTRAINT catalog_audience_created_by_fk
    FOREIGN KEY (supplier_tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.catalog_price
    ADD CONSTRAINT catalog_price_item_fk
    FOREIGN KEY (tenant_id, owner_account_id, catalog_item_id)
    REFERENCES mesh.catalog_item (tenant_id, owner_account_id, id)
    ON DELETE CASCADE;
ALTER TABLE mesh.catalog_price
    ADD CONSTRAINT catalog_price_item_uom_fk
    FOREIGN KEY (tenant_id, owner_account_id, catalog_item_uom_id)
    REFERENCES mesh.catalog_item_uom (tenant_id, owner_account_id, id)
    ON DELETE RESTRICT;
ALTER TABLE mesh.catalog_price
    ADD CONSTRAINT catalog_price_relationship_fk
    FOREIGN KEY (tenant_id, owner_account_id, network_relationship_id)
    REFERENCES mesh.network_relationship (
        supplier_tenant_id,
        supplier_account_id,
        id
    )
    ON DELETE RESTRICT;
ALTER TABLE mesh.catalog_price
    ADD CONSTRAINT catalog_price_currency_fk
    FOREIGN KEY (currency_code)
    REFERENCES shared.currency (code) ON DELETE RESTRICT;
ALTER TABLE mesh.catalog_price
    ADD CONSTRAINT catalog_price_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.catalog_availability
    ADD CONSTRAINT catalog_availability_item_fk
    FOREIGN KEY (tenant_id, owner_account_id, catalog_item_id)
    REFERENCES mesh.catalog_item (tenant_id, owner_account_id, id)
    ON DELETE CASCADE;
ALTER TABLE mesh.catalog_availability
    ADD CONSTRAINT catalog_availability_country_fk
    FOREIGN KEY (country_code)
    REFERENCES shared.country (code) ON DELETE RESTRICT;
ALTER TABLE mesh.catalog_availability
    ADD CONSTRAINT catalog_availability_region_fk
    FOREIGN KEY (country_code, state_region_code)
    REFERENCES shared.state_region (country_code, code) ON DELETE RESTRICT;
ALTER TABLE mesh.catalog_availability
    ADD CONSTRAINT catalog_availability_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.document_envelope
    ADD CONSTRAINT document_envelope_relationship_fk
    FOREIGN KEY (network_relationship_id)
    REFERENCES mesh.network_relationship (id) ON DELETE RESTRICT;

ALTER TABLE mesh.document_envelope
    ADD CONSTRAINT document_envelope_sender_fk
    FOREIGN KEY (sender_tenant_id, sender_account_id)
    REFERENCES mesh.network_account (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.document_envelope
    ADD CONSTRAINT document_envelope_receiver_fk
    FOREIGN KEY (receiver_tenant_id, receiver_account_id)
    REFERENCES mesh.network_account (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.document_envelope
    ADD CONSTRAINT document_envelope_type_fk
    FOREIGN KEY (document_type_id)
    REFERENCES control.network_document_type (id) ON DELETE RESTRICT;

ALTER TABLE mesh.document_envelope
    ADD CONSTRAINT document_envelope_entity_contract_fk
    FOREIGN KEY (entity_id, entity_version_id, entity_contract_hash)
    REFERENCES runtime_meta.entity_contract (
        entity_id, id, entity_contract_hash
    ) ON DELETE RESTRICT;

ALTER TABLE mesh.document_envelope
    ADD CONSTRAINT document_envelope_created_by_fk
    FOREIGN KEY (sender_tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.document_payload
    ADD CONSTRAINT document_payload_envelope_fk
    FOREIGN KEY (envelope_id)
    REFERENCES mesh.document_envelope (id) ON DELETE RESTRICT;

ALTER TABLE mesh.document_payload
    ADD CONSTRAINT document_payload_created_by_fk
    FOREIGN KEY (created_by_tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.document_event
    ADD CONSTRAINT document_event_envelope_fk
    FOREIGN KEY (envelope_id)
    REFERENCES mesh.document_envelope (id) ON DELETE RESTRICT;

ALTER TABLE mesh.document_event
    ADD CONSTRAINT document_event_actor_account_fk
    FOREIGN KEY (actor_tenant_id, actor_account_id)
    REFERENCES mesh.network_account (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.document_event
    ADD CONSTRAINT document_event_actor_principal_fk
    FOREIGN KEY (actor_tenant_id, actor_principal_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.document_event
    ADD CONSTRAINT document_event_created_by_fk
    FOREIGN KEY (created_by_tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.document_acknowledgement
    ADD CONSTRAINT document_acknowledgement_envelope_fk
    FOREIGN KEY (envelope_id)
    REFERENCES mesh.document_envelope (id) ON DELETE RESTRICT;

ALTER TABLE mesh.document_acknowledgement
    ADD CONSTRAINT document_acknowledgement_responder_fk
    FOREIGN KEY (responder_tenant_id, responder_account_id)
    REFERENCES mesh.network_account (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.document_acknowledgement
    ADD CONSTRAINT document_acknowledgement_responder_principal_fk
    FOREIGN KEY (responder_tenant_id, responder_principal_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.document_business_status_projection
    ADD CONSTRAINT document_business_status_projection_envelope_fk
    FOREIGN KEY (source_envelope_id) REFERENCES mesh.document_envelope(id) ON DELETE RESTRICT,
    ADD CONSTRAINT document_business_status_projection_relationship_fk
    FOREIGN KEY (network_relationship_id) REFERENCES mesh.network_relationship(id) ON DELETE RESTRICT,
    ADD CONSTRAINT document_business_status_projection_event_fk
    FOREIGN KEY (last_event_id) REFERENCES mesh.document_event(id) ON DELETE RESTRICT;

ALTER TABLE mesh.document_acknowledgement
    ADD CONSTRAINT document_acknowledgement_created_by_fk
    FOREIGN KEY (responder_tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.network_account_profile
    ADD CONSTRAINT network_account_profile_account_fk
    FOREIGN KEY (tenant_id, network_account_id)
    REFERENCES mesh.network_account (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT network_account_profile_language_fk
    FOREIGN KEY (preferred_language_code)
    REFERENCES shared.locale (code) ON DELETE RESTRICT,
    ADD CONSTRAINT network_account_profile_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.network_account_commodity_capability
    ADD CONSTRAINT network_account_commodity_capability_account_fk
    FOREIGN KEY (tenant_id, network_account_id)
    REFERENCES mesh.network_account (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT network_account_commodity_capability_commodity_fk
    FOREIGN KEY (commodity_code_id)
    REFERENCES shared.commodity_code (id) ON DELETE RESTRICT,
    ADD CONSTRAINT network_account_commodity_capability_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.network_account_industry_classification
    ADD CONSTRAINT network_account_industry_classification_account_fk
    FOREIGN KEY (tenant_id, network_account_id)
    REFERENCES mesh.network_account (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT network_account_industry_classification_code_fk
    FOREIGN KEY (industry_domain_code, industry_code_id)
    REFERENCES shared.industry_code (domain_code, id) ON DELETE RESTRICT,
    ADD CONSTRAINT network_account_industry_classification_verified_by_fk
    FOREIGN KEY (tenant_id, verified_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT network_account_industry_classification_no_overlap
    EXCLUDE USING gist (
        tenant_id WITH =,
        network_account_id WITH =,
        industry_domain_code WITH =,
        industry_code_id WITH =,
        daterange(effective_from, COALESCE(effective_until, 'infinity'::date), '[)') WITH &&
    ) WHERE (status = 'active'),
    ADD CONSTRAINT network_account_industry_classification_primary_no_overlap
    EXCLUDE USING gist (
        tenant_id WITH =,
        network_account_id WITH =,
        industry_domain_code WITH =,
        daterange(effective_from, COALESCE(effective_until, 'infinity'::date), '[)') WITH &&
    ) WHERE (is_primary AND status = 'active');

ALTER TABLE mesh.network_account_tax_registration
    ADD CONSTRAINT network_account_tax_registration_account_fk
    FOREIGN KEY (tenant_id, network_account_id)
    REFERENCES mesh.network_account (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT network_account_tax_registration_country_fk
    FOREIGN KEY (country_code) REFERENCES shared.country (code) ON DELETE RESTRICT,
    ADD CONSTRAINT network_account_tax_registration_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT network_account_tax_registration_verified_by_fk
    FOREIGN KEY (tenant_id, verified_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.bank_party
    ADD CONSTRAINT mesh_bank_party_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT,
    ADD CONSTRAINT mesh_bank_party_country_fk
    FOREIGN KEY (country_code) REFERENCES shared.country (code) ON DELETE RESTRICT,
    ADD CONSTRAINT mesh_bank_party_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.bank_account
    ADD CONSTRAINT mesh_bank_account_owner_fk
    FOREIGN KEY (tenant_id, network_account_id)
    REFERENCES mesh.network_account (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT mesh_bank_account_bank_party_fk
    FOREIGN KEY (tenant_id, bank_party_id)
    REFERENCES mesh.bank_party (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT mesh_bank_account_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT mesh_bank_account_country_fk
    FOREIGN KEY (bank_country_override)
    REFERENCES shared.country (code) ON DELETE RESTRICT,
    ADD CONSTRAINT mesh_bank_account_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT mesh_bank_account_verified_by_fk
    FOREIGN KEY (tenant_id, verified_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.bank_account_link
    ADD CONSTRAINT mesh_bank_account_link_owner_fk
    FOREIGN KEY (tenant_id, network_account_id)
    REFERENCES mesh.network_account (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT mesh_bank_account_link_account_fk
    FOREIGN KEY (tenant_id, network_account_id, bank_account_id)
    REFERENCES mesh.bank_account (tenant_id, network_account_id, id)
    ON DELETE RESTRICT,
    ADD CONSTRAINT mesh_bank_account_link_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.bank_account_disclosure
    ADD CONSTRAINT bank_account_disclosure_owner_fk
    FOREIGN KEY (owner_tenant_id, owner_account_id)
    REFERENCES mesh.network_account (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_account_disclosure_recipient_fk
    FOREIGN KEY (recipient_tenant_id, recipient_account_id)
    REFERENCES mesh.network_account (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_account_disclosure_account_fk
    FOREIGN KEY (owner_tenant_id, owner_account_id, bank_account_id)
    REFERENCES mesh.bank_account (tenant_id, network_account_id, id)
    ON DELETE RESTRICT,
    ADD CONSTRAINT bank_account_disclosure_relationship_fk
    FOREIGN KEY (network_relationship_id)
    REFERENCES mesh.network_relationship (id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_account_disclosure_created_by_fk
    FOREIGN KEY (owner_tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_account_disclosure_disclosed_by_fk
    FOREIGN KEY (owner_tenant_id, disclosed_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_account_disclosure_revoked_by_fk
    FOREIGN KEY (owner_tenant_id, revoked_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.bank_account_disclosure
    ADD CONSTRAINT bank_account_disclosure_snapshot_fk
    FOREIGN KEY (owner_tenant_id, snapshot_id)
    REFERENCES snapshot.bank_account_disclosure(owner_tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_account_disclosure_approved_by_fk
    FOREIGN KEY (owner_tenant_id, approved_by)
    REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE mesh.bank_account_disclosure_event
    ADD CONSTRAINT bank_account_disclosure_event_owner_fk
    FOREIGN KEY(owner_tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_account_disclosure_event_recipient_fk
    FOREIGN KEY(recipient_tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_account_disclosure_event_disclosure_fk
    FOREIGN KEY(disclosure_id) REFERENCES mesh.bank_account_disclosure(id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_account_disclosure_event_actor_fk
    FOREIGN KEY(owner_tenant_id,recorded_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE mesh.certification_type
  ADD CONSTRAINT mesh_certification_type_pkey PRIMARY KEY (id),
  ADD CONSTRAINT mesh_certification_type_code_chk CHECK (code ~ '^[a-z][a-z0-9_-]*$'),
  ADD CONSTRAINT mesh_certification_type_name_chk CHECK (btrim(name) <> ''),
  ADD CONSTRAINT mesh_certification_type_status_chk CHECK (status IN ('active', 'deprecated')),
  ADD CONSTRAINT mesh_certification_type_custom_chk CHECK (NOT is_custom OR tenant_id IS NOT NULL),
  ADD CONSTRAINT mesh_certification_type_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object'),
  ADD CONSTRAINT mesh_certification_type_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE mesh.certification
  ADD CONSTRAINT mesh_certification_pkey PRIMARY KEY (id),
  ADD CONSTRAINT mesh_certification_tenant_id_uq UNIQUE (tenant_id, id),
  ADD CONSTRAINT mesh_certification_owner_nonempty_chk CHECK (btrim(owner_type) <> ''),
  ADD CONSTRAINT mesh_certification_type_xor_chk CHECK (
    (certification_type_id IS NOT NULL AND custom_name IS NULL)
    OR (certification_type_id IS NULL AND custom_name IS NOT NULL)
  ),
  ADD CONSTRAINT mesh_certification_validity_chk CHECK (
    effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from
  ),
  ADD CONSTRAINT mesh_certification_status_chk
    CHECK (status IN ('active', 'expired', 'revoked', 'superseded')),
  ADD CONSTRAINT mesh_certification_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object'),
  ADD CONSTRAINT mesh_certification_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE,
  ADD CONSTRAINT mesh_certification_type_fk
    FOREIGN KEY (certification_type_id) REFERENCES mesh.certification_type(id) ON DELETE RESTRICT;


ALTER TABLE mesh.network_lifecycle_event
  ADD CONSTRAINT network_lifecycle_owner_tenant_fk FOREIGN KEY(owner_tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
  ADD CONSTRAINT network_lifecycle_counterparty_tenant_fk FOREIGN KEY(counterparty_tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT;

ALTER TABLE mesh.network_account_profile_publication
  ADD CONSTRAINT network_account_profile_publication_owner_fk FOREIGN KEY(owner_tenant_id,owner_account_id) REFERENCES mesh.network_account(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT network_account_profile_publication_recipient_fk FOREIGN KEY(recipient_tenant_id,recipient_account_id) REFERENCES mesh.network_account(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT network_account_profile_publication_relationship_fk FOREIGN KEY(network_relationship_id) REFERENCES mesh.network_relationship(id) ON DELETE RESTRICT,
  ADD CONSTRAINT network_account_profile_publication_snapshot_fk FOREIGN KEY(owner_tenant_id,snapshot_id) REFERENCES snapshot.network_account_profile_publication(owner_tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT network_account_profile_publication_previous_fk FOREIGN KEY(owner_tenant_id,previous_publication_id) REFERENCES mesh.network_account_profile_publication(owner_tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT network_account_profile_publication_published_by_fk FOREIGN KEY(owner_tenant_id,published_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE mesh.network_account_profile_publication_event
  ADD CONSTRAINT network_account_profile_publication_event_publication_fk FOREIGN KEY(owner_tenant_id,publication_id) REFERENCES mesh.network_account_profile_publication(owner_tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT network_account_profile_publication_event_recorded_by_fk FOREIGN KEY(owner_tenant_id,recorded_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;
