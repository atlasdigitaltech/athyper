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
