CREATE INDEX commodity_category_parent_idx
    ON master.commodity_category (tenant_id, parent_id)
    WHERE parent_id IS NOT NULL;
CREATE INDEX commodity_category_active_idx
    ON master.commodity_category (tenant_id, status, sort_order, code);

CREATE INDEX product_category_idx
    ON master.product (tenant_id, commodity_category_id, status);
CREATE INDEX product_uom_idx ON master.product (base_uom_code);
CREATE INDEX product_type_idx
    ON master.product (tenant_id, product_type, status);

CREATE INDEX item_product_idx
    ON master.item (tenant_id, product_id, status);
CREATE INDEX item_company_capability_idx
    ON master.item (
        tenant_id,
        company_code_id,
        status,
        is_purchasable,
        is_sellable,
        is_inventory_managed,
        is_manufactured
    );
CREATE INDEX item_uom_idx ON master.item (base_uom_code);

CREATE INDEX commodity_code_assignment_category_idx
    ON master.commodity_code_assignment (tenant_id, commodity_category_id)
    WHERE commodity_category_id IS NOT NULL;
CREATE INDEX commodity_code_assignment_product_idx
    ON master.commodity_code_assignment (tenant_id, product_id)
    WHERE product_id IS NOT NULL;
CREATE INDEX commodity_code_assignment_item_idx
    ON master.commodity_code_assignment (tenant_id, item_id)
    WHERE item_id IS NOT NULL;
CREATE INDEX commodity_code_assignment_code_idx
    ON master.commodity_code_assignment (
        tenant_id, commodity_domain_code, commodity_code_id, status
    );
CREATE UNIQUE INDEX commodity_code_assignment_category_code_uq
    ON master.commodity_code_assignment (
        tenant_id, commodity_category_id, commodity_code_id
    )
    WHERE commodity_category_id IS NOT NULL AND status <> 'archived';
CREATE UNIQUE INDEX commodity_code_assignment_product_code_uq
    ON master.commodity_code_assignment (
        tenant_id, product_id, commodity_code_id
    )
    WHERE product_id IS NOT NULL AND status <> 'archived';
CREATE UNIQUE INDEX commodity_code_assignment_item_code_uq
    ON master.commodity_code_assignment (
        tenant_id, item_id, commodity_code_id
    )
    WHERE item_id IS NOT NULL AND status <> 'archived';
CREATE UNIQUE INDEX commodity_code_assignment_category_primary_uq
    ON master.commodity_code_assignment (
        tenant_id, commodity_category_id, commodity_domain_code
    )
    WHERE commodity_category_id IS NOT NULL
      AND is_owner_primary AND status = 'active';
CREATE UNIQUE INDEX commodity_code_assignment_product_primary_uq
    ON master.commodity_code_assignment (
        tenant_id, product_id, commodity_domain_code
    )
    WHERE product_id IS NOT NULL
      AND is_owner_primary AND status = 'active';
CREATE UNIQUE INDEX commodity_code_assignment_item_primary_uq
    ON master.commodity_code_assignment (
        tenant_id, item_id, commodity_domain_code
    )
    WHERE item_id IS NOT NULL
      AND is_owner_primary AND status = 'active';
CREATE UNIQUE INDEX commodity_code_assignment_routing_default_uq
    ON master.commodity_code_assignment (
        tenant_id, commodity_domain_code, commodity_code_id
    )
    WHERE commodity_category_id IS NOT NULL
      AND is_code_routing_default AND status = 'active';

CREATE INDEX catalog_company_direction_idx
    ON master.catalog (tenant_id, company_code_id, catalog_direction, status);
CREATE INDEX catalog_supplier_idx
    ON master.catalog (tenant_id, supplier_business_partner_id, status)
    WHERE supplier_business_partner_id IS NOT NULL;
CREATE INDEX catalog_source_publication_idx
    ON master.catalog (source_system, source_publication_id)
    WHERE source_publication_id IS NOT NULL;
CREATE UNIQUE INDEX catalog_source_coordinate_uq
    ON master.catalog (
        tenant_id, company_code_id, source_system, source_publication_id
    )
    WHERE source_system IS NOT NULL;

CREATE INDEX catalog_item_catalog_idx
    ON master.catalog_item (tenant_id, catalog_id, status);
CREATE INDEX catalog_item_item_idx
    ON master.catalog_item (tenant_id, item_id, status);
CREATE INDEX catalog_item_source_idx
    ON master.catalog_item (source_catalog_item_id)
    WHERE source_catalog_item_id IS NOT NULL;

CREATE INDEX catalog_price_item_effective_idx
    ON master.catalog_price (
        tenant_id, catalog_item_id, status, valid_from, valid_until
    );
CREATE INDEX catalog_price_currency_idx
    ON master.catalog_price (currency_code);
CREATE INDEX catalog_price_uom_idx
    ON master.catalog_price (price_uom_code);

CREATE INDEX bom_output_item_idx
    ON master.bom (tenant_id, company_code_id, output_item_id, status);
CREATE INDEX bom_effective_idx
    ON master.bom (
        tenant_id, company_code_id, status, effective_from, effective_until
    );
CREATE UNIQUE INDEX bom_released_output_uq
    ON master.bom (tenant_id, company_code_id, output_item_id, bom_type)
    WHERE status = 'released';

CREATE INDEX bom_component_bom_idx
    ON master.bom_component (tenant_id, company_code_id, bom_id, status);
CREATE INDEX bom_component_item_idx
    ON master.bom_component (
        tenant_id, company_code_id, component_item_id, status
    );

-- Audit-principal FKs are indexed because these tables can become high-volume
-- and principal retirement checks must not scan them.
CREATE INDEX commodity_category_created_by_idx
    ON master.commodity_category (tenant_id, created_by);
CREATE INDEX product_created_by_idx
    ON master.product (tenant_id, created_by);
CREATE INDEX item_created_by_idx
    ON master.item (tenant_id, created_by);
CREATE INDEX commodity_code_assignment_created_by_idx
    ON master.commodity_code_assignment (tenant_id, created_by);
CREATE INDEX catalog_created_by_idx
    ON master.catalog (tenant_id, created_by);
CREATE INDEX catalog_item_created_by_idx
    ON master.catalog_item (tenant_id, created_by);
CREATE INDEX catalog_price_created_by_idx
    ON master.catalog_price (tenant_id, created_by);
CREATE INDEX bom_created_by_idx
    ON master.bom (tenant_id, created_by);
CREATE INDEX bom_component_created_by_idx
    ON master.bom_component (tenant_id, created_by);
