ALTER TABLE master.commodity_category
    ADD CONSTRAINT commodity_category_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.commodity_category
    ADD CONSTRAINT commodity_category_parent_fk
    FOREIGN KEY (tenant_id, parent_id)
    REFERENCES master.commodity_category (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.commodity_category
    ADD CONSTRAINT commodity_category_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.product
    ADD CONSTRAINT product_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;
ALTER TABLE master.product
    ADD CONSTRAINT product_category_fk
    FOREIGN KEY (tenant_id, commodity_category_id)
    REFERENCES master.commodity_category (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.product
    ADD CONSTRAINT product_base_uom_fk
    FOREIGN KEY (base_uom_code) REFERENCES shared.uom (code) ON DELETE RESTRICT;
ALTER TABLE master.product
    ADD CONSTRAINT product_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.item
    ADD CONSTRAINT item_company_code_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.item
    ADD CONSTRAINT item_product_fk
    FOREIGN KEY (tenant_id, product_id)
    REFERENCES master.product (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.item
    ADD CONSTRAINT item_base_uom_fk
    FOREIGN KEY (base_uom_code) REFERENCES shared.uom (code) ON DELETE RESTRICT;
ALTER TABLE master.item
    ADD CONSTRAINT item_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.commodity_code_assignment
    ADD CONSTRAINT commodity_code_assignment_category_fk
    FOREIGN KEY (tenant_id, commodity_category_id)
    REFERENCES master.commodity_category (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE master.commodity_code_assignment
    ADD CONSTRAINT commodity_code_assignment_product_fk
    FOREIGN KEY (tenant_id, product_id)
    REFERENCES master.product (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE master.commodity_code_assignment
    ADD CONSTRAINT commodity_code_assignment_item_fk
    FOREIGN KEY (tenant_id, item_id)
    REFERENCES master.item (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE master.commodity_code_assignment
    ADD CONSTRAINT commodity_code_assignment_code_fk
    FOREIGN KEY (commodity_domain_code, commodity_code_id)
    REFERENCES shared.commodity_code (domain_code, id) ON DELETE RESTRICT;
ALTER TABLE master.commodity_code_assignment
    ADD CONSTRAINT commodity_code_assignment_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.catalog
    ADD CONSTRAINT catalog_company_code_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.catalog
    ADD CONSTRAINT catalog_supplier_partner_fk
    FOREIGN KEY (tenant_id, supplier_business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.catalog
    ADD CONSTRAINT catalog_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.catalog_item
    ADD CONSTRAINT catalog_item_catalog_fk
    FOREIGN KEY (tenant_id, catalog_id)
    REFERENCES master.catalog (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE master.catalog_item
    ADD CONSTRAINT catalog_item_item_fk
    FOREIGN KEY (tenant_id, item_id)
    REFERENCES master.item (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.catalog_item
    ADD CONSTRAINT catalog_item_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.catalog_price
    ADD CONSTRAINT catalog_price_catalog_item_fk
    FOREIGN KEY (tenant_id, catalog_item_id)
    REFERENCES master.catalog_item (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE master.catalog_price
    ADD CONSTRAINT catalog_price_currency_fk
    FOREIGN KEY (currency_code)
    REFERENCES shared.currency (code) ON DELETE RESTRICT;
ALTER TABLE master.catalog_price
    ADD CONSTRAINT catalog_price_uom_fk
    FOREIGN KEY (price_uom_code)
    REFERENCES shared.uom (code) ON DELETE RESTRICT;
ALTER TABLE master.catalog_price
    ADD CONSTRAINT catalog_price_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.bom
    ADD CONSTRAINT bom_company_code_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE master.bom
    ADD CONSTRAINT bom_output_item_fk
    FOREIGN KEY (tenant_id, company_code_id, output_item_id)
    REFERENCES master.item (tenant_id, company_code_id, id) ON DELETE RESTRICT;
ALTER TABLE master.bom
    ADD CONSTRAINT bom_uom_fk
    FOREIGN KEY (uom_code) REFERENCES shared.uom (code) ON DELETE RESTRICT;
ALTER TABLE master.bom
    ADD CONSTRAINT bom_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.bom_component
    ADD CONSTRAINT bom_component_bom_fk
    FOREIGN KEY (tenant_id, company_code_id, bom_id)
    REFERENCES master.bom (tenant_id, company_code_id, id) ON DELETE CASCADE;
ALTER TABLE master.bom_component
    ADD CONSTRAINT bom_component_item_fk
    FOREIGN KEY (tenant_id, company_code_id, component_item_id)
    REFERENCES master.item (tenant_id, company_code_id, id) ON DELETE RESTRICT;
ALTER TABLE master.bom_component
    ADD CONSTRAINT bom_component_uom_fk
    FOREIGN KEY (uom_code) REFERENCES shared.uom (code) ON DELETE RESTRICT;
ALTER TABLE master.bom_component
    ADD CONSTRAINT bom_component_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
