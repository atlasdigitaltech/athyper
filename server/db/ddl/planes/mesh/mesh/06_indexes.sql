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
