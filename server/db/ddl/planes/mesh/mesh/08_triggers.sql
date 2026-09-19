DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'network_account',
        'network_account_identifier',
        'network_account_reference',
        'network_relationship',
        'catalog',
        'catalog_item',
        'catalog_item_identifier',
        'catalog_item_classification',
        'catalog_item_uom',
        'catalog_audience',
        'catalog_price',
        'catalog_availability'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE ON mesh.%I '
            'FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_creation_evidence()',
            'trg_' || v_table || '_creation_evidence',
            v_table
        );
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE ON mesh.%I '
            'FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_network_identity()',
            'trg_' || v_table || '_identity',
            v_table
        );
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE ON mesh.%I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',
            'trg_' || v_table || '_updated_at',
            v_table
        );
    END LOOP;
END;
$$;

CREATE TRIGGER trg_network_account_status_changed
BEFORE UPDATE OF status ON mesh.network_account
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_network_relationship_status_changed
BEFORE UPDATE OF status ON mesh.network_relationship
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_catalog_owner
BEFORE INSERT OR UPDATE OF tenant_id, owner_account_id ON mesh.catalog
FOR EACH ROW EXECUTE FUNCTION mesh.trg_validate_catalog_owner();

CREATE TRIGGER trg_catalog_publication_evidence
BEFORE INSERT OR UPDATE OF status, published_at, published_by ON mesh.catalog
FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_catalog_publication_evidence();

CREATE TRIGGER trg_catalog_audience_coordinates
BEFORE INSERT OR UPDATE OF
    supplier_tenant_id,
    supplier_account_id,
    buyer_tenant_id,
    buyer_account_id,
    network_relationship_id
ON mesh.catalog_audience
FOR EACH ROW EXECUTE FUNCTION mesh.trg_validate_catalog_audience();

CREATE CONSTRAINT TRIGGER trg_catalog_price_commercial_coordinates
AFTER INSERT OR UPDATE ON mesh.catalog_price
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION mesh.trg_validate_catalog_price();

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'catalog',
        'catalog_item',
        'catalog_item_identifier',
        'catalog_item_classification',
        'catalog_item_uom',
        'catalog_audience',
        'catalog_price',
        'catalog_availability'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE OF status ON mesh.%I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed()',
            'trg_' || v_table || '_status_changed',
            v_table
        );
    END LOOP;
END;
$$;

CREATE TRIGGER trg_document_envelope_10_validate
BEFORE INSERT ON mesh.document_envelope
FOR EACH ROW EXECUTE FUNCTION mesh.trg_validate_document_envelope();

CREATE TRIGGER trg_document_envelope_20_guard
BEFORE UPDATE OR DELETE ON mesh.document_envelope
FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_document_envelope();

CREATE TRIGGER trg_document_envelope_30_status_changed
BEFORE UPDATE OF status ON mesh.document_envelope
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_document_envelope_90_updated_at
BEFORE UPDATE ON mesh.document_envelope
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_document_payload_20_guard
BEFORE UPDATE OR DELETE ON mesh.document_payload
FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_document_payload();

CREATE TRIGGER trg_document_payload_10_participant
BEFORE INSERT ON mesh.document_payload
FOR EACH ROW EXECUTE FUNCTION mesh.trg_validate_document_child_participant();

CREATE TRIGGER trg_document_payload_90_updated_at
BEFORE UPDATE ON mesh.document_payload
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_document_event_10_participant
BEFORE INSERT ON mesh.document_event
FOR EACH ROW EXECUTE FUNCTION mesh.trg_validate_document_child_participant();

CREATE TRIGGER trg_document_event_90_append_only
BEFORE UPDATE OR DELETE ON mesh.document_event
FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_append_only_document_child();

CREATE TRIGGER trg_document_acknowledgement_10_participant
BEFORE INSERT ON mesh.document_acknowledgement
FOR EACH ROW EXECUTE FUNCTION mesh.trg_validate_document_child_participant();

CREATE TRIGGER trg_document_acknowledgement_90_append_only
BEFORE UPDATE OR DELETE ON mesh.document_acknowledgement
FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_append_only_document_child();

CREATE TRIGGER trg_document_business_status_projection_guard
BEFORE INSERT OR UPDATE OR DELETE ON mesh.document_business_status_projection
FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_document_business_status_projection();

CREATE TRIGGER trg_network_account_profile_guard
BEFORE UPDATE ON mesh.network_account_profile
FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_network_identity();
CREATE TRIGGER trg_network_account_profile_status
BEFORE UPDATE OF status ON mesh.network_account_profile
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_network_account_profile_updated
BEFORE UPDATE ON mesh.network_account_profile
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_network_account_commodity_capability_role
BEFORE INSERT OR UPDATE OF tenant_id, network_account_id, trade_role
ON mesh.network_account_commodity_capability
FOR EACH ROW EXECUTE FUNCTION mesh.trg_validate_profile_trade_role();
CREATE TRIGGER trg_network_account_commodity_capability_guard
BEFORE UPDATE ON mesh.network_account_commodity_capability
FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_network_identity();
CREATE TRIGGER trg_network_account_commodity_capability_status
BEFORE UPDATE OF status ON mesh.network_account_commodity_capability
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_network_account_commodity_capability_updated
BEFORE UPDATE ON mesh.network_account_commodity_capability
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_network_account_industry_classification_guard
BEFORE UPDATE ON mesh.network_account_industry_classification
FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_network_identity();
CREATE TRIGGER trg_network_account_industry_classification_creation_evidence
BEFORE UPDATE ON mesh.network_account_industry_classification
FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_creation_evidence();
CREATE TRIGGER trg_network_account_industry_classification_status
BEFORE UPDATE OF status ON mesh.network_account_industry_classification
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_network_account_industry_classification_updated
BEFORE UPDATE ON mesh.network_account_industry_classification
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_network_account_tax_registration_validate
BEFORE INSERT OR UPDATE OF registration_type_code, registration_number
ON mesh.network_account_tax_registration
FOR EACH ROW EXECUTE FUNCTION mesh.trg_validate_tax_registration_type();
CREATE TRIGGER trg_network_account_tax_registration_guard
BEFORE UPDATE ON mesh.network_account_tax_registration
FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_network_identity();
CREATE TRIGGER trg_network_account_tax_registration_status
BEFORE UPDATE OF status ON mesh.network_account_tax_registration
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_network_account_tax_registration_updated
BEFORE UPDATE ON mesh.network_account_tax_registration
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();


CREATE TRIGGER trg_mesh_bank_account_normalize
BEFORE INSERT OR UPDATE OF code, name, account_holder_name,
    protected_value_token, identifier_fingerprint, account_last4, bic_override
ON mesh.bank_account
FOR EACH ROW EXECUTE FUNCTION mesh.trg_normalize_bank_identity();
CREATE TRIGGER trg_mesh_bank_account_guard
BEFORE UPDATE ON mesh.bank_account
FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_bank_account_identity();
CREATE TRIGGER trg_mesh_bank_account_status
BEFORE UPDATE OF status ON mesh.bank_account
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_mesh_bank_account_updated
BEFORE UPDATE ON mesh.bank_account
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_mesh_bank_account_link_guard
BEFORE UPDATE ON mesh.bank_account_link
FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_network_identity();
CREATE TRIGGER trg_mesh_bank_account_link_updated
BEFORE UPDATE ON mesh.bank_account_link
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_bank_account_disclosure_validate
BEFORE INSERT OR UPDATE OF owner_tenant_id, owner_account_id,
    network_relationship_id, recipient_tenant_id, recipient_account_id, purpose
ON mesh.bank_account_disclosure
FOR EACH ROW EXECUTE FUNCTION mesh.trg_validate_bank_disclosure();
CREATE TRIGGER trg_bank_account_disclosure_guard
BEFORE UPDATE ON mesh.bank_account_disclosure
FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_bank_disclosure();
CREATE TRIGGER trg_bank_account_disclosure_updated
BEFORE UPDATE ON mesh.bank_account_disclosure
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER trg_bank_account_disclosure_event_immutable BEFORE UPDATE OR DELETE ON mesh.bank_account_disclosure_event FOR EACH ROW EXECUTE FUNCTION mesh.trg_reject_bank_disclosure_event_mutation();

CREATE TRIGGER mesh_certification_type_updated_at
  BEFORE UPDATE ON mesh.certification_type
  FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER mesh_certification_updated_at
  BEFORE UPDATE ON mesh.certification
  FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER mesh_certification_status_changed
  BEFORE UPDATE ON mesh.certification
  FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER mesh_certification_validate_type_scope
  BEFORE INSERT OR UPDATE OF tenant_id, certification_type_id
  ON mesh.certification
  FOR EACH ROW EXECUTE FUNCTION mesh.trg_validate_certification_type_scope();


CREATE TRIGGER wave6_network_account_lifecycle BEFORE UPDATE OF status ON mesh.network_account FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_network_lifecycle('account');
CREATE TRIGGER wave6_network_relationship_lifecycle BEFORE UPDATE OF status ON mesh.network_relationship FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_network_lifecycle('relationship');
CREATE TRIGGER wave6_network_account_event AFTER INSERT OR UPDATE OF status ON mesh.network_account FOR EACH ROW EXECUTE FUNCTION mesh.trg_record_network_lifecycle('network_account');
CREATE TRIGGER wave6_network_relationship_event AFTER INSERT OR UPDATE OF status ON mesh.network_relationship FOR EACH ROW EXECUTE FUNCTION mesh.trg_record_network_lifecycle('network_relationship');
CREATE TRIGGER wave6_network_account_scope AFTER INSERT OR UPDATE OF display_name,status ON mesh.network_account FOR EACH ROW EXECUTE FUNCTION mesh.trg_sync_network_account_scope();
CREATE TRIGGER wave6_network_relationship_scopes AFTER INSERT OR UPDATE OF status ON mesh.network_relationship FOR EACH ROW EXECUTE FUNCTION mesh.trg_sync_network_relationship_scopes();

CREATE TRIGGER trg_network_account_profile_publication_immutable BEFORE UPDATE OR DELETE ON mesh.network_account_profile_publication FOR EACH ROW EXECUTE FUNCTION mesh.trg_reject_profile_publication_mutation();
CREATE TRIGGER trg_network_account_profile_publication_event_immutable BEFORE UPDATE OR DELETE ON mesh.network_account_profile_publication_event FOR EACH ROW EXECUTE FUNCTION mesh.trg_reject_profile_publication_mutation();
CREATE TRIGGER wave6_network_lifecycle_event_immutable BEFORE UPDATE OR DELETE ON mesh.network_lifecycle_event FOR EACH ROW EXECUTE FUNCTION mesh.trg_reject_network_lifecycle_event_mutation();

CREATE TRIGGER delivery_acknowledgement_immutable BEFORE UPDATE OR DELETE
  ON mesh.business_partner_delivery_acknowledgement FOR EACH ROW
  EXECUTE FUNCTION mesh.trg_delivery_acknowledgement_immutable();

CREATE TRIGGER trg_register_provisional_bank BEFORE INSERT OR UPDATE OF bank_institution_id,provisional_bank_reference_id,bank_name_override,bank_country_override,bic_override ON mesh.bank_account FOR EACH ROW EXECUTE FUNCTION mesh.trg_register_provisional_bank();
