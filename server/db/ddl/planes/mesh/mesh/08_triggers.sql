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
