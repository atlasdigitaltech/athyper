REVOKE ALL ON SCHEMA mesh FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA mesh FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA mesh FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA mesh TO athyperapp;
        GRANT SELECT, INSERT, UPDATE ON
            mesh.network_account,
            mesh.network_account_identifier,
            mesh.network_account_reference,
            mesh.network_relationship,
            mesh.catalog,
            mesh.catalog_item,
            mesh.catalog_item_identifier,
            mesh.catalog_item_classification,
            mesh.catalog_item_uom,
            mesh.catalog_audience,
            mesh.catalog_price,
            mesh.catalog_availability
        TO athyperapp;
        GRANT SELECT ON
            mesh.current_tenant_network_account,
            mesh.current_tenant_network_relationship,
            mesh.visible_catalog,
            mesh.visible_catalog_item,
            mesh.visible_catalog_price
        TO athyperapp;
        GRANT EXECUTE ON FUNCTION
            mesh.current_network_account_id_soft(),
            mesh.catalog_is_visible(uuid),
            mesh.catalog_item_is_visible(uuid),
            mesh.catalog_price_is_visible(uuid)
        TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA mesh TO athyperadmin;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA mesh TO athyperadmin;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA mesh TO athyperadmin;
    END IF;
END;
$$;

REVOKE ALL ON
    mesh.document_envelope,
    mesh.document_payload,
    mesh.document_event,
    mesh.document_acknowledgement
FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION
    mesh.trg_validate_document_envelope(),
    mesh.trg_guard_document_envelope(),
    mesh.trg_guard_document_payload(),
    mesh.trg_guard_append_only_document_child(),
    mesh.trg_validate_document_child_participant()
FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE ON mesh.document_envelope TO athyperapp;
        GRANT SELECT, INSERT, UPDATE ON mesh.document_payload TO athyperapp;
        GRANT SELECT, INSERT ON
            mesh.document_event,
            mesh.document_acknowledgement
        TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            mesh.document_envelope,
            mesh.document_payload,
            mesh.document_event,
            mesh.document_acknowledgement
        TO athyperadmin;
        GRANT EXECUTE ON FUNCTION
            mesh.trg_validate_document_envelope(),
            mesh.trg_guard_document_envelope(),
            mesh.trg_guard_document_payload(),
            mesh.trg_guard_append_only_document_child(),
            mesh.trg_validate_document_child_participant()
        TO athyperadmin;
    END IF;
END;
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE ON
            mesh.network_account_profile,
            mesh.network_account_commodity_capability,
            mesh.network_account_tax_registration,
            mesh.bank_party,
            mesh.bank_account_link,
            mesh.bank_account_disclosure
        TO athyperapp;
        GRANT INSERT, UPDATE ON mesh.bank_account TO athyperapp;
        GRANT SELECT (
            id, tenant_id, network_account_id, code, name, bank_party_id,
            account_holder_name, account_id_type, account_last4,
            currency_code, bic_override, bank_name_override,
            bank_country_override, provider_account_ref,
            is_verified, verified_at, verified_by, verification_method,
            metadata, status, is_active, status_changed_at,
            status_changed_by, created_at, created_by, updated_at, updated_by
        ) ON mesh.bank_account TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            mesh.network_account_profile,
            mesh.network_account_commodity_capability,
            mesh.network_account_tax_registration,
            mesh.bank_party,
            mesh.bank_account,
            mesh.bank_account_link,
            mesh.bank_account_disclosure
        TO athyperadmin;
    END IF;
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON mesh.certification_type, mesh.certification TO athyperapp;
GRANT ALL PRIVILEGES
  ON mesh.certification_type, mesh.certification TO athyperadmin;
GRANT EXECUTE
  ON FUNCTION mesh.trg_validate_certification_type_scope()
  TO athyperapp, athyperadmin;


REVOKE ALL ON mesh.network_lifecycle_event FROM PUBLIC;
REVOKE ALL ON FUNCTION mesh.trg_guard_network_lifecycle(),mesh.trg_record_network_lifecycle(),mesh.fn_upsert_network_scope(uuid,authz.scope_kind_d,uuid,uuid,text,text,authz.scope_status_d,uuid,text),mesh.trg_sync_network_account_scope(),mesh.trg_sync_network_relationship_scopes(),mesh.trg_reject_network_lifecycle_event_mutation() FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT SELECT ON mesh.network_lifecycle_event TO athyperapp; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT ALL PRIVILEGES ON mesh.network_lifecycle_event TO athyperadmin; END IF;
END $$;
