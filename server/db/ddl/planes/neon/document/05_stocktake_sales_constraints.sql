ALTER TABLE document.stocktake
    ADD CONSTRAINT stocktake_tenant_fk FOREIGN KEY (tenant_id)
        REFERENCES master.tenant (id) ON DELETE RESTRICT,
    ADD CONSTRAINT stocktake_company_site_fk FOREIGN KEY (tenant_id, company_code_id, site_id)
        REFERENCES master.site (tenant_id, company_code_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT stocktake_site_warehouse_fk FOREIGN KEY (tenant_id, site_id, warehouse_id)
        REFERENCES master.warehouse (tenant_id, site_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT stocktake_variance_journal_fk FOREIGN KEY (tenant_id, variance_journal_entry_id)
        REFERENCES document.journal_entry (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT stocktake_completed_by_fk FOREIGN KEY (tenant_id, completed_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT stocktake_status_by_fk FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT stocktake_created_by_fk FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT stocktake_updated_by_fk FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.stocktake_line
    ADD CONSTRAINT stocktake_line_header_fk FOREIGN KEY (tenant_id, stocktake_id)
        REFERENCES document.stocktake (tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT stocktake_line_item_fk FOREIGN KEY (tenant_id, item_id)
        REFERENCES master.item (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT stocktake_line_uom_fk FOREIGN KEY (uom_code)
        REFERENCES shared.uom (code) ON DELETE RESTRICT,
    ADD CONSTRAINT stocktake_line_currency_fk FOREIGN KEY (currency_code)
        REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT stocktake_line_counted_by_fk FOREIGN KEY (tenant_id, counted_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT stocktake_line_movement_fk FOREIGN KEY (tenant_id, posted_inventory_movement_id)
        REFERENCES ledger.inventory_movement (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT stocktake_line_created_by_fk FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT stocktake_line_updated_by_fk FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.sales_opportunity
    ADD CONSTRAINT sales_opportunity_tenant_fk FOREIGN KEY (tenant_id)
        REFERENCES master.tenant (id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_opportunity_customer_fk FOREIGN KEY (tenant_id, customer_id)
        REFERENCES master.customer (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_opportunity_org_fk FOREIGN KEY (tenant_id, operating_organization_id)
        REFERENCES master.operating_organization (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_opportunity_principal_company_fk FOREIGN KEY (tenant_id, principal_seller_company_id)
        REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_opportunity_currency_fk FOREIGN KEY (currency_code)
        REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_opportunity_requested_by_fk FOREIGN KEY (tenant_id, requested_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_opportunity_status_by_fk FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_opportunity_created_by_fk FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_opportunity_updated_by_fk FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.sales_opportunity_company
    ADD CONSTRAINT sales_opportunity_company_parent_fk FOREIGN KEY (tenant_id, opportunity_id)
        REFERENCES document.sales_opportunity (tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT sales_opportunity_company_company_fk FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_opportunity_company_status_by_fk FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_opportunity_company_created_by_fk FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_opportunity_company_updated_by_fk FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.sales_quotation
    ADD CONSTRAINT sales_quotation_tenant_fk FOREIGN KEY (tenant_id)
        REFERENCES master.tenant (id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_quotation_opportunity_fk FOREIGN KEY (tenant_id, opportunity_id)
        REFERENCES document.sales_opportunity (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_quotation_customer_fk FOREIGN KEY (tenant_id, customer_id)
        REFERENCES master.customer (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_quotation_org_fk FOREIGN KEY (tenant_id, operating_organization_id)
        REFERENCES master.operating_organization (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_quotation_principal_company_fk FOREIGN KEY (tenant_id, principal_seller_company_id)
        REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_quotation_currency_fk FOREIGN KEY (currency_code)
        REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_quotation_requested_by_fk FOREIGN KEY (tenant_id, requested_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_quotation_status_by_fk FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_quotation_created_by_fk FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_quotation_updated_by_fk FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.sales_quotation_company
    ADD CONSTRAINT sales_quotation_company_parent_fk FOREIGN KEY (tenant_id, quotation_id)
        REFERENCES document.sales_quotation (tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT sales_quotation_company_company_fk FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_quotation_company_status_by_fk FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_quotation_company_created_by_fk FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_quotation_company_updated_by_fk FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.sales_quotation_allocation
    ADD CONSTRAINT sales_quotation_allocation_parent_fk FOREIGN KEY (tenant_id, quotation_id)
        REFERENCES document.sales_quotation (tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT sales_quotation_allocation_member_fk FOREIGN KEY (tenant_id, quotation_id, company_code_id)
        REFERENCES document.sales_quotation_company (tenant_id, quotation_id, company_code_id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_quotation_allocation_order_fk FOREIGN KEY (tenant_id, output_sales_order_id)
        REFERENCES document.sales_order (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_quotation_allocation_status_by_fk FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_quotation_allocation_created_by_fk FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_quotation_allocation_updated_by_fk FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.sales_order
    ADD CONSTRAINT sales_order_quotation_fk FOREIGN KEY (tenant_id, quotation_id)
        REFERENCES document.sales_quotation (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.sales_order_intercompany_fulfillment
    ADD CONSTRAINT sales_order_ic_fulfillment_order_fk FOREIGN KEY (tenant_id, sales_order_id)
        REFERENCES document.sales_order (tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT sales_order_ic_fulfillment_selling_company_fk FOREIGN KEY (tenant_id, selling_company_code_id)
        REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_order_ic_fulfillment_company_fk FOREIGN KEY (tenant_id, fulfillment_company_code_id)
        REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_order_ic_fulfillment_currency_fk FOREIGN KEY (currency_code)
        REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_order_ic_fulfillment_status_by_fk FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_order_ic_fulfillment_created_by_fk FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT sales_order_ic_fulfillment_updated_by_fk FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
