ALTER TABLE document.catalog_import
    ADD CONSTRAINT catalog_import_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.catalog_import
    ADD CONSTRAINT catalog_import_supplier_fk
    FOREIGN KEY (tenant_id, supplier_business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.catalog_import
    ADD CONSTRAINT catalog_import_reviewed_by_fk
    FOREIGN KEY (tenant_id, reviewed_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.catalog_import
    ADD CONSTRAINT catalog_import_published_by_fk
    FOREIGN KEY (tenant_id, published_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.catalog_import
    ADD CONSTRAINT catalog_import_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.catalog_import_line
    ADD CONSTRAINT catalog_import_line_import_fk
    FOREIGN KEY (tenant_id, catalog_import_id)
    REFERENCES document.catalog_import (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE document.catalog_import_line
    ADD CONSTRAINT catalog_import_line_commodity_fk
    FOREIGN KEY (commodity_code_id)
    REFERENCES shared.commodity_code (id) ON DELETE RESTRICT;
ALTER TABLE document.catalog_import_line
    ADD CONSTRAINT catalog_import_line_normalized_uom_fk
    FOREIGN KEY (normalized_uom_code)
    REFERENCES shared.uom (code) ON DELETE RESTRICT;
ALTER TABLE document.catalog_import_line
    ADD CONSTRAINT catalog_import_line_currency_fk
    FOREIGN KEY (currency_code)
    REFERENCES shared.currency (code) ON DELETE RESTRICT;
ALTER TABLE document.catalog_import_line
    ADD CONSTRAINT catalog_import_line_proposed_item_fk
    FOREIGN KEY (tenant_id, proposed_item_id)
    REFERENCES master.item (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.catalog_import_line
    ADD CONSTRAINT catalog_import_line_published_item_fk
    FOREIGN KEY (tenant_id, published_catalog_item_id)
    REFERENCES master.catalog_item (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.catalog_import_line
    ADD CONSTRAINT catalog_import_line_reviewed_by_fk
    FOREIGN KEY (tenant_id, reviewed_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.catalog_import_line
    ADD CONSTRAINT catalog_import_line_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.punchout_cart
    ADD CONSTRAINT punchout_cart_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.punchout_cart
    ADD CONSTRAINT punchout_cart_supplier_fk
    FOREIGN KEY (tenant_id, supplier_business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.punchout_cart
    ADD CONSTRAINT punchout_cart_currency_fk
    FOREIGN KEY (currency_code)
    REFERENCES shared.currency (code) ON DELETE RESTRICT;
ALTER TABLE document.punchout_cart
    ADD CONSTRAINT punchout_cart_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.punchout_cart_line
    ADD CONSTRAINT punchout_cart_line_cart_fk
    FOREIGN KEY (tenant_id, punchout_cart_id)
    REFERENCES document.punchout_cart (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE document.punchout_cart_line
    ADD CONSTRAINT punchout_cart_line_commodity_fk
    FOREIGN KEY (commodity_code_id)
    REFERENCES shared.commodity_code (id) ON DELETE RESTRICT;
ALTER TABLE document.punchout_cart_line
    ADD CONSTRAINT punchout_cart_line_item_fk
    FOREIGN KEY (tenant_id, item_id)
    REFERENCES master.item (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.punchout_cart_line
    ADD CONSTRAINT punchout_cart_line_uom_fk
    FOREIGN KEY (uom_code)
    REFERENCES shared.uom (code) ON DELETE RESTRICT;
ALTER TABLE document.punchout_cart_line
    ADD CONSTRAINT punchout_cart_line_currency_fk
    FOREIGN KEY (currency_code)
    REFERENCES shared.currency (code) ON DELETE RESTRICT;
ALTER TABLE document.punchout_cart_line
    ADD CONSTRAINT punchout_cart_line_matched_by_fk
    FOREIGN KEY (tenant_id, matched_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.punchout_cart_line
    ADD CONSTRAINT punchout_cart_line_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.production_order
    ADD CONSTRAINT production_order_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.production_order
    ADD CONSTRAINT production_order_output_item_fk
    FOREIGN KEY (tenant_id, company_code_id, output_item_id)
    REFERENCES master.item (tenant_id, company_code_id, id) ON DELETE RESTRICT;
ALTER TABLE document.production_order
    ADD CONSTRAINT production_order_bom_snapshot_fk
    FOREIGN KEY (tenant_id, bom_snapshot_id)
    REFERENCES snapshot.bom (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.production_order
    ADD CONSTRAINT production_order_uom_fk
    FOREIGN KEY (uom_code)
    REFERENCES shared.uom (code) ON DELETE RESTRICT;
ALTER TABLE document.production_order
    ADD CONSTRAINT production_order_site_fk
    FOREIGN KEY (tenant_id, assembly_site_id)
    REFERENCES master.site (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.production_order
    ADD CONSTRAINT production_order_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.production_order_component
    ADD CONSTRAINT production_order_component_order_fk
    FOREIGN KEY (tenant_id, production_order_id)
    REFERENCES document.production_order (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE document.production_order_component
    ADD CONSTRAINT production_order_component_snapshot_fk
    FOREIGN KEY (tenant_id, bom_component_snapshot_id)
    REFERENCES snapshot.bom_component (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.production_order_component
    ADD CONSTRAINT production_order_component_item_fk
    FOREIGN KEY (tenant_id, component_item_id)
    REFERENCES master.item (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.production_order_component
    ADD CONSTRAINT production_order_component_uom_fk
    FOREIGN KEY (uom_code)
    REFERENCES shared.uom (code) ON DELETE RESTRICT;
ALTER TABLE document.production_order_component
    ADD CONSTRAINT production_order_component_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.sales_order
    ADD CONSTRAINT sales_order_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.sales_order
    ADD CONSTRAINT sales_order_customer_fk
    FOREIGN KEY (tenant_id, customer_id)
    REFERENCES master.customer (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.sales_order
    ADD CONSTRAINT sales_order_currency_fk
    FOREIGN KEY (currency_code)
    REFERENCES shared.currency (code) ON DELETE RESTRICT;
ALTER TABLE document.sales_order
    ADD CONSTRAINT sales_order_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.sales_order_line
    ADD CONSTRAINT sales_order_line_order_fk
    FOREIGN KEY (tenant_id, sales_order_id)
    REFERENCES document.sales_order (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE document.sales_order_line
    ADD CONSTRAINT sales_order_line_item_fk
    FOREIGN KEY (tenant_id, item_id)
    REFERENCES master.item (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE document.sales_order_line
    ADD CONSTRAINT sales_order_line_uom_fk
    FOREIGN KEY (uom_code)
    REFERENCES shared.uom (code) ON DELETE RESTRICT;
ALTER TABLE document.sales_order_line
    ADD CONSTRAINT sales_order_line_currency_fk
    FOREIGN KEY (currency_code)
    REFERENCES shared.currency (code) ON DELETE RESTRICT;
ALTER TABLE document.sales_order_line
    ADD CONSTRAINT sales_order_line_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
